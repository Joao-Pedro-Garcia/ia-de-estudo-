// Academia de redação: propostas de tema, transcrição de redação manuscrita (foto), correção pelas
// 5 competências do ENEM (0–200 cada, em níveis de 40 pontos), faixa de incerteza e evolução.
// As notas são ESTIMATIVAS PEDAGÓGICAS: a nota oficial depende da banca (dois corretores, Inep).
import { getDb, J } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { generateJSON, obj, str, int, arr, en } from '../ai/provider.js';
import { getFact } from './universities.js';
import { addNote } from './memory.js';
import { createCards } from './flashcards.js';

export const COMPETENCIES = [
  { id: 'c1', name: 'Competência 1', desc: 'Domínio da modalidade escrita formal da língua portuguesa.' },
  { id: 'c2', name: 'Competência 2', desc: 'Compreender a proposta e aplicar conceitos de várias áreas do conhecimento para desenvolver o tema, nos limites estruturais do texto dissertativo-argumentativo em prosa.' },
  { id: 'c3', name: 'Competência 3', desc: 'Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista.' },
  { id: 'c4', name: 'Competência 4', desc: 'Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação.' },
  { id: 'c5', name: 'Competência 5', desc: 'Elaborar proposta de intervenção para o problema abordado, respeitando os direitos humanos.' },
];

export function competencies() {
  const f = getFact('enem-2026-competencias');
  return { list: COMPETENCIES, official: f ? { value: f.value, source_url: f.source_url, period: f.reference_period, collected_at: f.collected_at } : null };
}

const LEVEL = en(['0', '40', '80', '120', '160', '200']);
const COMP = obj({
  score: LEVEL, low: LEVEL, high: LEVEL,
  justification: str('por que este nível, citando evidências do texto'),
  problems: arr(obj({ excerpt: str('trecho exato do texto'), issue: str(), suggestion: str('como reescrever') })),
  how_to_improve: str(),
});
const EVAL_SCHEMA = obj({
  on_topic: en(['sim', 'parcial', 'nao']),
  zero_risk: str('riscos de nota zero (fuga ao tema, cópia, texto insuficiente, etc.) ou "nenhum"'),
  thesis: str('tese identificada (ou "não identificada")'),
  structure: str('análise da estrutura: introdução, desenvolvimento, conclusão'),
  repertoire: str('repertório sociocultural usado: legitimado? pertinente? produtivo?'),
  c1: COMP, c2: COMP, c3: COMP, c4: COMP, c5: COMP,
  strengths: arr(str()),
  priorities: arr(str('prioridades para a próxima redação')),
  rewritten_paragraph: str('exemplo de reescrita de UM parágrafo fraco do próprio texto'),
  evolution_comment: str('comparação com redações anteriores (ou "primeira redação")'),
  repertoire_cards: arr(obj({ front: str(), back: str() }), '3 repertórios úteis para o tema'),
});

export async function evaluateEssay(userId, { theme, text, fromImage = false }) {
  if (!theme?.trim()) throw bad('Informe o tema da redação');
  const clean = (text || '').trim();
  if (clean.length < 100) throw bad('Texto muito curto para avaliar (a redação do ENEM exige mais de 7 linhas).');
  if (clean.length > 8000) throw bad('Texto muito longo');
  const db = getDb();
  const id = Number(db.prepare('INSERT INTO essays (user_id, theme, text, from_image) VALUES (?,?,?,?)').run(userId, theme.trim(), clean, fromImage ? 1 : 0).lastInsertRowid);
  const prev = db.prepare("SELECT theme, evaluation, total_estimate, created_at FROM essays WHERE user_id=? AND status='corrigida' ORDER BY id DESC LIMIT 3").all(userId)
    .map((p) => { const ev = J.parse(p.evaluation, {}); return { tema: p.theme, total: p.total_estimate, c: ['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => ev[k]?.score), prioridades: ev.priorities }; });
  const lines = clean.split(/\n/).length;
  try {
    const ev = await generateJSON({
      system: `Você é corretora experiente de redações do ENEM e professora de pré-Medicina. Avalie pela matriz oficial das 5 competências (cada uma 0–200 em níveis 0/40/80/120/160/200). Seja rigorosa e justa, como a banca: não infle notas. Para cada competência, dê o nível mais provável (score) e uma faixa (low–high) que expresse a incerteza da correção. Cite trechos EXATOS do texto ao apontar problemas. Competências:\n${COMPETENCIES.map((c) => `${c.name}: ${c.desc}`).join('\n')}`,
      content: `Tema: "${theme}"\nRedação da estudante (${lines} parágrafos/linhas aproximados${fromImage ? ', transcrita de foto' : ''}):\n"""\n${clean}\n"""\n\nRedações anteriores (para comentar a evolução): ${prev.length ? JSON.stringify(prev) : 'nenhuma'}`,
      schema: EVAL_SCHEMA, feature: 'redacao', userId, effort: 'high', maxTokens: 24000,
    });
    const total = ['c1', 'c2', 'c3', 'c4', 'c5'].reduce((s, k) => s + Number(ev[k].score), 0);
    ev.total_low = ['c1', 'c2', 'c3', 'c4', 'c5'].reduce((s, k) => s + Number(ev[k].low), 0);
    ev.total_high = ['c1', 'c2', 'c3', 'c4', 'c5'].reduce((s, k) => s + Number(ev[k].high), 0);
    ev.disclaimer = 'Estimativa pedagógica. A nota oficial é atribuída pela banca do Inep (dois corretores independentes) e pode diferir.';
    db.prepare("UPDATE essays SET status='corrigida', evaluation=?, total_estimate=?, evaluated_at=datetime('now') WHERE id=?").run(J.str(ev), total, id);
    const weakest = ['c1', 'c2', 'c3', 'c4', 'c5'].sort((a, b) => ev[a].score - ev[b].score)[0];
    addNote(userId, { kind: 'dificuldade', discipline: 'redacao', text: `Redação: competência mais fraca recente = ${weakest.toUpperCase()} (${ev[weakest].score}).`, source: 'redacao' });
    if (ev.repertoire_cards?.length) createCards(userId, { discipline: 'redacao', topic: 'argumentacao', cards: ev.repertoire_cards, source: 'redacao' });
  } catch (e) {
    db.prepare("UPDATE essays SET status='erro' WHERE id=?").run(id);
    throw e;
  }
  return getEssay(userId, id);
}

export function getEssay(userId, id) {
  const r = getDb().prepare('SELECT * FROM essays WHERE id=? AND user_id=?').get(id, userId);
  if (!r) throw notFound('Redação não encontrada');
  return { ...r, evaluation: J.parse(r.evaluation) };
}

export function listEssays(userId) {
  return getDb().prepare('SELECT id, theme, status, total_estimate, created_at, evaluation FROM essays WHERE user_id=? ORDER BY id DESC').all(userId)
    .map((r) => { const ev = J.parse(r.evaluation, {}); return { ...r, evaluation: undefined, comps: ['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => (ev[k] ? Number(ev[k].score) : null)), low: ev.total_low, high: ev.total_high }; });
}

const OCR_SCHEMA = obj({ text: str('transcrição fiel, preservando parágrafos e erros originais'), illegible: arr(str('trechos ilegíveis')), confidence: en(['alta', 'media', 'baixa']) });

/** Transcreve a foto da redação. A estudante revisa/corrige o texto antes de enviar para correção. */
export async function transcribeEssay(userId, { imageBase64, mediaType }) {
  if (!imageBase64) throw bad('Envie a imagem');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) throw bad('Formato de imagem não suportado');
  return generateJSON({
    system: 'Transcreva fielmente redações manuscritas em português. NÃO corrija erros: transcreva exatamente como está escrito. Marque [ilegível] onde não for possível ler.',
    content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }, { type: 'text', text: 'Transcreva a redação desta foto.' }],
    schema: OCR_SCHEMA, feature: 'redacao_ocr', userId, effort: 'low', maxTokens: 8000,
  });
}

const THEME_SCHEMA = obj({
  theme: str('frase-tema no estilo ENEM'),
  motivating_texts: arr(obj({ title: str(), text: str('texto motivador ORIGINAL (não atribua citações falsas a pessoas reais)') })),
  key_points: arr(str('eixos que uma boa redação deveria discutir')),
  repertoire_suggestions: arr(str('repertórios socioculturais legítimos e verificáveis pertinentes')),
});

export async function proposeTheme(userId, { area = null } = {}) {
  return generateJSON({
    system: 'Você cria propostas de redação inéditas no estilo ENEM para treino. Textos motivadores devem ser originais; não invente estatísticas atribuídas a instituições. Indique que a proposta é inédita (criada por IA).',
    content: `Crie uma proposta de redação dissertativo-argumentativa${area ? ` sobre o eixo: ${area}` : ' sobre um problema social brasileiro relevante (saúde pública, educação, meio ambiente, tecnologia, cidadania)'}.`,
    schema: THEME_SCHEMA, feature: 'redacao_tema', userId, effort: 'medium', maxTokens: 6000,
  });
}

export function essayEvolution(userId) {
  return getDb().prepare("SELECT id, theme, total_estimate, evaluation, created_at FROM essays WHERE user_id=? AND status='corrigida' ORDER BY id").all(userId)
    .map((r) => { const ev = J.parse(r.evaluation, {}); return { id: r.id, date: r.created_at.slice(0, 10), theme: r.theme, total: r.total_estimate, low: ev.total_low, high: ev.total_high, c: ['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => Number(ev[k]?.score ?? 0)) }; });
}
