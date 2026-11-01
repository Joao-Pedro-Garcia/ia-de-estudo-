// Onboarding (questionário inicial) + Diagnóstico adaptativo de nivelamento.
// O nível NÃO é perguntado à estudante: ele é inferido pelas respostas do teste.
import { getDb, J, tx } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { DIAGNOSTIC_DISCIPLINES, getDiscipline, topicName } from '../content/curriculum.js';
import { answerQuestion, getQuestion, publicQuestion } from './questions.js';
import { probability, thetaToLevel } from './mastery.js';
import { aiEnabled, generateJSON, obj, str, int, arr } from '../ai/provider.js';
import { log } from '../logger.js';

export const ONBOARDING_STEPS = [
  { id: 'nome', title: 'Como você gostaria de ser chamada?', why: 'A professora vai conversar com você pelo nome ou apelido.', type: 'text', required: true },
  { id: 'idade', title: 'Qual é a sua idade?', why: 'Ajuda a ajustar a linguagem e o ritmo. É opcional.', type: 'number', required: false },
  { id: 'escolaridade', title: 'Qual é a sua escolaridade atual?', why: 'Define o ponto de partida provável dos conteúdos (o teste é que confirma).', type: 'select', required: true,
    options: ['Cursando o 1º ano do ensino médio', 'Cursando o 2º ano do ensino médio', 'Cursando o 3º ano do ensino médio', 'Já concluí o ensino médio', 'Estou em outro curso superior', 'Outro'] },
  { id: 'vestibular_previo', title: 'Você já prestou vestibular?', why: 'Experiência com prova muda a estratégia de treino com tempo e simulados.', type: 'select', required: false, options: ['Não', 'Sim, uma vez', 'Sim, mais de uma vez'] },
  { id: 'enem_previo', title: 'Você já fez o ENEM?', why: 'Se já fez, sua nota anterior ajuda a acompanhar a evolução (opcional).', type: 'select', required: false, options: ['Não', 'Sim, como treineira', 'Sim, para valer'] },
  { id: 'enem_nota', title: 'Se lembrar, qual foi sua média aproximada no ENEM?', why: 'Opcional. Usada só como referência de evolução, nunca para prever aprovação.', type: 'number', required: false, showIf: { enem_previo: ['Sim, como treineira', 'Sim, para valer'] } },
  { id: 'universidades', title: 'Quais processos seletivos de Medicina você pretende disputar?', why: 'Cada universidade tem regras e pesos próprios; o plano considera os perfis escolhidos.', type: 'multi', required: true,
    options: ['Medicina UFT — Palmas', 'Medicina UFNT — Araguaína', 'Medicina UFMA — São Luís', 'Medicina UFMA — Pinheiro', 'Medicina UFMA — Imperatriz', 'ENEM/SISU — outras federais'] },
  { id: 'data_prova', title: 'Qual a data prevista da sua próxima prova (ENEM ou vestibular)?', why: 'Permite distribuir conteúdos e revisões até o dia da prova. Pode deixar em branco.', type: 'date', required: false },
  { id: 'minutos_dia', title: 'Quanto tempo por dia você consegue estudar com a plataforma?', why: 'O plano diário é montado dentro desse limite, com pausas.', type: 'select', required: true,
    options: ['30 minutos', '1 hora', '2 horas', '3 horas', '4 horas', '5 horas ou mais'] },
  { id: 'dias_semana', title: 'Em quais dias você pode estudar?', why: 'O plano só agenda estudos nesses dias.', type: 'multi', required: true,
    options: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] },
  { id: 'periodo', title: 'Em qual período você prefere estudar?', why: 'Os blocos de estudo são sugeridos nesse horário.', type: 'select', required: true, options: ['Manhã', 'Tarde', 'Noite'] },
  { id: 'dificuldades', title: 'Você sente dificuldade em alguma disciplina?', why: 'É só a sua percepção — o diagnóstico vai medir de verdade. Pode pular.', type: 'multi', required: false,
    options: ['Matemática', 'Biologia', 'Química', 'Física', 'Português', 'Literatura', 'Redação', 'História', 'Geografia', 'Filosofia', 'Sociologia', 'Inglês', 'Espanhol'] },
  { id: 'cursinho', title: 'Você já frequenta algum cursinho ou escola preparatória?', why: 'Evita duplicar o que você já estuda em outro lugar.', type: 'select', required: false, options: ['Não', 'Sim, presencial', 'Sim, online'] },
  { id: 'lingua_estrangeira', title: 'Qual língua estrangeira você pretende fazer no ENEM?', why: 'Entra no plano e nos simulados.', type: 'select', required: false, options: ['Inglês', 'Espanhol', 'Ainda não sei'] },
];

export function getProfile(userId) {
  const db = getDb();
  let p = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
  if (!p) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
    p = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
  }
  return { ...p, answers: J.parse(p.answers, {}) };
}

export function saveOnboardingAnswer(userId, { stepId, value, step }) {
  const def = ONBOARDING_STEPS.find((s) => s.id === stepId);
  if (!def) throw bad('Etapa inválida');
  const p = getProfile(userId);
  const answers = { ...p.answers };
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
    if (def.required) throw bad('Esta pergunta é obrigatória.');
    delete answers[stepId];
  } else {
    if (def.type === 'select' && !def.options.includes(value)) throw bad('Opção inválida');
    if (def.type === 'multi' && (!Array.isArray(value) || value.some((v) => !def.options.includes(v)))) throw bad('Opções inválidas');
    if (def.type === 'number' && !Number.isFinite(Number(value))) throw bad('Número inválido');
    if (def.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad('Data inválida');
    if (def.type === 'text' && String(value).length > 80) throw bad('Texto muito longo');
    answers[stepId] = def.type === 'number' ? Number(value) : value;
  }
  getDb().prepare("UPDATE profiles SET answers=?, onboarding_step=MAX(onboarding_step, ?), updated_at=datetime('now') WHERE user_id=?")
    .run(J.str(answers), Number.isInteger(step) ? step : 0, userId);
  return getProfile(userId);
}

export function completeOnboarding(userId) {
  const p = getProfile(userId);
  const missing = ONBOARDING_STEPS.filter((s) => s.required && (p.answers[s.id] === undefined || (Array.isArray(p.answers[s.id]) && !p.answers[s.id].length)));
  if (missing.length) throw bad(`Faltam respostas obrigatórias: ${missing.map((m) => m.title).join(' | ')}`);
  getDb().prepare("UPDATE profiles SET onboarding_done_at=COALESCE(onboarding_done_at, datetime('now')) WHERE user_id=?").run(userId);
  if (p.answers.nome) getDb().prepare('UPDATE users SET name=? WHERE id=?').run(p.answers.nome, userId);
  return getProfile(userId);
}

// ---------------- Diagnóstico adaptativo ----------------

const ITEMS_PER_DISC = { biologia: 5, quimica: 5, matematica: 5, fisica: 4 };
const itemsFor = (d) => ITEMS_PER_DISC[d] || 3;
const WHY = {
  matematica: 'Matemática é base para Física, Química e estatística em saúde.',
  biologia: 'Biologia é o coração da prova de Medicina: aqui medimos de onde partir.',
  quimica: 'Química pesa muito em Ciências da Natureza e é muito cobrada em Medicina.',
  fisica: 'Física completa Ciências da Natureza; medimos conceito e interpretação.',
  portugues: 'Gramática aparece em Linguagens e é essencial para a Redação (competência 1).',
  interpretacao: 'Interpretação de texto atravessa a prova inteira, inclusive exatas.',
  literatura: 'Literatura aparece em Linguagens; medimos leitura de textos literários.',
  historia: 'História compõe Ciências Humanas e dá repertório para a Redação.',
  geografia: 'Geografia compõe Ciências Humanas e cobra muita leitura de dados.',
  filosofia: 'Filosofia (inclusive bioética) aparece em Humanas e na Redação.',
  sociologia: 'Sociologia aparece em Humanas e oferece repertório sociocultural.',
};

function newState() {
  return {
    order: DIAGNOSTIC_DISCIPLINES,
    idx: 0,
    disc: Object.fromEntries(DIAGNOSTIC_DISCIPLINES.map((d) => [d, { level: 1, theta: -0.5, items: [], done: false }])),
    current: null,
    discursive: { status: aiEnabled() ? 'pendente' : 'indisponivel' },
  };
}

export function getActiveDiagnostic(userId) {
  const r = getDb().prepare("SELECT * FROM diagnostics WHERE user_id=? ORDER BY id DESC LIMIT 1").get(userId);
  return r ? { ...r, state: J.parse(r.state), report: J.parse(r.report) } : null;
}

export function startDiagnostic(userId, { restart = false } = {}) {
  const cur = getActiveDiagnostic(userId);
  if (cur && cur.status === 'em_andamento' && !restart) return cur;
  if (cur && cur.status === 'em_andamento' && restart) getDb().prepare("UPDATE diagnostics SET status='cancelado' WHERE id=?").run(cur.id);
  getDb().prepare('INSERT INTO diagnostics (user_id, state) VALUES (?,?)').run(userId, J.str(newState()));
  return getActiveDiagnostic(userId);
}

function pickDiagnosticQuestion(userId, discipline, level, askedIds, askedTopics) {
  const db = getDb();
  const ex = askedIds.length ? `AND id NOT IN (${askedIds.map(() => '?').join(',')})` : '';
  const sql = `SELECT id, topic, difficulty FROM questions WHERE status='ativa' AND type='multipla_escolha' AND created_for_user IS NULL AND discipline=? ${ex}`;
  const rows = db.prepare(sql).all(discipline, ...askedIds);
  if (!rows.length) return null;
  const seen = new Set(db.prepare('SELECT DISTINCT question_id FROM attempts WHERE user_id=?').all(userId).map((r) => r.question_id));
  rows.sort((a, b) => {
    const sa = Math.abs(a.difficulty - level) * 10 + (askedTopics.includes(a.topic) ? 3 : 0) + (seen.has(a.id) ? 5 : 0) + Math.random();
    const sb = Math.abs(b.difficulty - level) * 10 + (askedTopics.includes(b.topic) ? 3 : 0) + (seen.has(b.id) ? 5 : 0) + Math.random();
    return sa - sb;
  });
  return rows[0].id;
}

/** Retorna o próximo passo do diagnóstico (questão a responder, discursiva ou fim). */
export function nextDiagnosticStep(userId) {
  const diag = getActiveDiagnostic(userId);
  if (!diag) throw notFound('Nenhum diagnóstico iniciado');
  if (diag.status === 'concluido') return { done: true, report: diag.report };
  const st = diag.state;
  const total = st.order.reduce((s, d) => s + itemsFor(d), 0);
  const answered = st.order.reduce((s, d) => s + st.disc[d].items.length, 0);
  const progress = { answered, total, pct: Math.round((answered / total) * 100) };

  if (st.current) {
    const q = getQuestion(st.current.questionId);
    return { done: false, progress, discipline: q.discipline, discipline_name: getDiscipline(q.discipline).name, why: WHY[q.discipline], question: publicQuestion(q) };
  }
  while (st.idx < st.order.length) {
    const d = st.order[st.idx];
    const ds = st.disc[d];
    if (ds.items.length >= itemsFor(d)) { ds.done = true; st.idx++; continue; }
    const qid = pickDiagnosticQuestion(userId, d, ds.level, ds.items.map((i) => i.questionId), ds.items.map((i) => i.topic));
    if (!qid) { ds.done = true; ds.insufficient = true; st.idx++; continue; }
    st.current = { questionId: qid, startedAt: Date.now() };
    saveState(diag.id, st);
    const q = getQuestion(qid);
    return { done: false, progress, discipline: d, discipline_name: getDiscipline(d).name, why: WHY[d], question: publicQuestion(q) };
  }
  // Etapa discursiva (curta), corrigida por IA quando disponível.
  if (st.discursive.status === 'pendente' && aiEnabled()) {
    saveState(diag.id, st);
    return {
      done: false, progress: { ...progress, pct: 98 }, discursive: true, discipline: 'interpretacao', discipline_name: 'Escrita e argumentação',
      why: 'Uma resposta curta escrita mostra organização de ideias e domínio da norma — base da Redação.',
      prompt: 'Em 5 a 8 linhas, responda: "Por que a vacinação em massa protege também quem não pode ser vacinado?" Explique com suas palavras, com um argumento e um exemplo.',
    };
  }
  return { done: false, progress: { ...progress, pct: 100 }, readyToFinish: true };
}

function saveState(id, st) {
  getDb().prepare('UPDATE diagnostics SET state=? WHERE id=?').run(J.str(st), id);
}

export function answerDiagnostic(userId, { questionId, chosen, confidence }) {
  const diag = getActiveDiagnostic(userId);
  if (!diag || diag.status !== 'em_andamento') throw bad('Não há diagnóstico em andamento');
  const st = diag.state;
  if (!st.current || st.current.questionId !== questionId) throw bad('Esta não é a questão atual do diagnóstico');
  const q = getQuestion(questionId);
  const timeMs = Math.min(Date.now() - (st.current.startedAt || Date.now()), 30 * 60000);
  const res = answerQuestion(userId, { questionId, chosen, confidence, timeMs, context: 'diagnostico', contextId: diag.id });
  const ds = st.disc[q.discipline];
  const outcome = res.correct ? ({ certeza: 1, duvida: 0.75, chute: 0.35 }[confidence] ?? 1) : 0;
  ds.theta = Math.max(-3, Math.min(3.5, ds.theta + 0.8 * (outcome - probability(ds.theta, q.difficulty))));
  ds.items.push({ questionId, topic: q.topic, difficulty: q.difficulty, correct: res.correct, confidence, skills: q.skills });
  // Escada adaptativa: acerto seguro sobe, erro desce, chute mantém.
  if (res.correct && confidence !== 'chute') ds.level = Math.min(4, ds.level + 1);
  else if (!res.correct) ds.level = Math.max(1, ds.level - 1);
  st.current = null;
  saveState(diag.id, st);
  return { ok: true };
}

const DISC_SCHEMA = obj({ score: int('0 a 200, estimativa pedagógica'), strengths: arr(str()), problems: arr(str()), feedback: str() });

export async function answerDiscursive(userId, { text, skip }) {
  const diag = getActiveDiagnostic(userId);
  if (!diag || diag.status !== 'em_andamento') throw bad('Não há diagnóstico em andamento');
  const st = diag.state;
  if (skip || !text?.trim()) {
    st.discursive = { status: 'pulada' };
  } else {
    const r = await generateJSON({
      system: 'Você é professora de redação e língua portuguesa. Avalie com rigor e gentileza uma resposta curta de diagnóstico.',
      content: `Pergunta: "Por que a vacinação em massa protege também quem não pode ser vacinado?"\nResposta da estudante:\n"""${text.slice(0, 3000)}"""\n
Avalie: correção conceitual (imunidade coletiva), clareza, argumento, exemplo, norma-padrão. "score" de 0 a 200 é uma ESTIMATIVA pedagógica de escrita (não é nota oficial).`,
      schema: DISC_SCHEMA, feature: 'diagnostico_discursiva', userId, effort: 'medium', maxTokens: 6000,
    });
    st.discursive = { status: 'corrigida', text: text.slice(0, 3000), ...r };
  }
  saveState(diag.id, st);
  return { ok: true, discursive: st.discursive };
}

/** Constrói o relatório a partir das respostas (determinístico), opcionalmente com comentário da professora (IA). */
export function buildReport(st) {
  const disciplines = [];
  const attention = [];
  for (const d of st.order) {
    const ds = st.disc[d];
    const items = ds.items;
    const n = items.length;
    const correctSure = items.filter((i) => i.correct && i.confidence !== 'chute').length;
    const guessed = items.filter((i) => i.correct && i.confidence === 'chute').length;
    const level = n ? thetaToLevel(ds.theta, Math.max(n, 3)) : { key: 'indefinido', label: 'Não avaliado', score: null };
    const byTopic = {};
    for (const i of items) (byTopic[i.topic] ||= []).push(i);
    const dominated = []; const partial = []; const fromScratch = [];
    for (const [t, list] of Object.entries(byTopic)) {
      const name = topicName(d, t);
      const ok = list.filter((i) => i.correct && i.confidence === 'certeza');
      const wrong = list.filter((i) => !i.correct);
      if (ok.length && !wrong.length && Math.max(...ok.map((i) => i.difficulty)) >= 2) dominated.push(name);
      else if (wrong.length && Math.min(...wrong.map((i) => i.difficulty)) <= 1) fromScratch.push(name);
      else partial.push(name);
    }
    const skillsToDevelop = [...new Set(items.filter((i) => !i.correct).flatMap((i) => i.skills || []))].slice(0, 4);
    const maxLevelOk = Math.max(0, ...items.filter((i) => i.correct && i.confidence !== 'chute').map((i) => i.difficulty));
    disciplines.push({
      discipline: d, name: getDiscipline(d).name, answered: n, correct_sure: correctSure, guessed_correct: guessed,
      level, max_level_ok: maxLevelOk, dominated, partial, from_scratch: fromScratch, skills_to_develop: skillsToDevelop,
      insufficient: !!ds.insufficient || n < 2,
    });
    if (n && (level.key === 'inicial' || correctSure / n < 0.4)) attention.push(getDiscipline(d).name);
  }
  const guessedTotal = disciplines.reduce((s, x) => s + x.guessed_correct, 0);
  const recurring = [];
  if (guessedTotal >= 3) recurring.push(`${guessedTotal} acertos foram marcados como chute — eles não contam como domínio.`);
  const lowLevelErrors = disciplines.filter((x) => x.from_scratch.length).map((x) => x.name);
  if (lowLevelErrors.length) recurring.push(`Erros em questões básicas em: ${lowLevelErrors.join(', ')} — indicam lacunas de fundamentos.`);
  return {
    title: 'SEU MAPA DE APROVAÇÃO — MEDICINA',
    disciplines,
    attention,
    recurring_difficulties: recurring,
    discursive: st.discursive,
    disclaimer: 'Este diagnóstico é uma ESTIMATIVA INICIAL, feita com poucas questões por disciplina. Ele não prevê aprovação. A precisão melhora com o acompanhamento contínuo: cada exercício, simulado e redação atualiza seu mapa.',
  };
}

const NARRATIVE_SCHEMA = obj({ message: str('mensagem da professora, 6-10 frases, em segunda pessoa'), priorities: arr(str(), '3 a 5 prioridades concretas') });

export async function finishDiagnostic(userId) {
  const diag = getActiveDiagnostic(userId);
  if (!diag) throw notFound('Nenhum diagnóstico');
  if (diag.status === 'concluido') return diag.report;
  const st = diag.state;
  const pending = st.order.filter((d) => !st.disc[d].done && st.disc[d].items.length < itemsFor(d));
  if (pending.length) throw bad('Ainda há questões do diagnóstico a responder.');
  const report = buildReport(st);
  const profile = getProfile(userId);
  if (aiEnabled()) {
    try {
      report.teacher = await generateJSON({
        system: 'Você é a professora particular da plataforma Aprova Federal AI (foco Medicina UFT/UFNT/UFMA/ENEM). Seja honesta, encorajadora e exigente. Nunca prometa aprovação nem dê probabilidades.',
        content: `Nome: ${profile.answers.nome || 'estudante'}. Objetivos: ${(profile.answers.universidades || []).join(', ')}.
Resultado do diagnóstico (JSON): ${JSON.stringify(report.disciplines.map((d) => ({ d: d.name, nivel: d.level.label, acertos_seguros: d.correct_sure, respondidas: d.answered, chutes_certos: d.guessed_correct, base_a_aprender: d.from_scratch, parciais: d.partial, dominados: d.dominated })))}
Discursiva: ${JSON.stringify(st.discursive)}
Escreva uma mensagem explicando o mapa, por onde começaremos e por quê, e lembrando que é uma estimativa inicial.`,
        schema: NARRATIVE_SCHEMA, feature: 'diagnostico_relatorio', userId, effort: 'medium', maxTokens: 6000,
      });
    } catch (e) {
      log.warn('comentário da professora indisponível', { err: e.message });
    }
  }
  tx((db) => {
    db.prepare("UPDATE diagnostics SET status='concluido', report=?, finished_at=datetime('now') WHERE id=?").run(J.str(report), diag.id);
    db.prepare("UPDATE profiles SET diagnostic_done_at=datetime('now') WHERE user_id=?").run(userId);
    // Notas de memória qualitativas a partir do diagnóstico.
    for (const d of report.disciplines) {
      if (d.from_scratch.length) {
        db.prepare("INSERT INTO memory_notes (user_id, kind, discipline, text, source) VALUES (?,?,?,?,?)")
          .run(userId, 'dificuldade', d.discipline, `Diagnóstico: lacunas de base em ${d.from_scratch.join(', ')}.`, 'diagnostico');
      }
      if (d.dominated.length) {
        db.prepare("INSERT INTO memory_notes (user_id, kind, discipline, text, source) VALUES (?,?,?,?,?)")
          .run(userId, 'ponto_forte', d.discipline, `Diagnóstico: bom desempenho em ${d.dominated.join(', ')}.`, 'diagnostico');
      }
    }
  });
  return report;
}
