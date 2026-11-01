// Simulados. Formatos baseados nos editais coletados (ver Central de Medicina Federal):
//  - ENEM 2026 (Edital Inep 64/2026): 45 questões por área (LC, CH, CN, MT) + redação; TRI.
//  - EXATO 2026/2 (Edital Copese 068/2026): 80 objetivas (20 por área) + redação.
//  - UFT/UFNT Medicina: SISU (ENEM) e PS Exato (EXATO) → simulado no formato ENEM com pesos oficiais verificados.
//  - UFMA Medicina: SISU (ENEM), pesos iguais (verificado).
//  - IFMA: cursos superiores via SISU; seletivo técnico com formato de fonte secundária (indicado como tal).
// A correção é exata (objetivas). Nota TRI oficial NÃO é reproduzida: mostramos aproveitamento e médias ponderadas.
import { getDb, J, tx } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { DISCIPLINES, getDiscipline, topicName } from '../content/curriculum.js';
import { getQuestion, publicQuestion, revealedQuestion } from './questions.js';
import { recordOutcome, thetaToDifficulty, getMastery } from './mastery.js';
import { addStudySeconds } from './activity.js';
import { profileWeights } from './universities.js';
import { addPlanItem } from './planner.js';
import { aiEnabled, generateJSON, obj, str, arr } from '../ai/provider.js';
import { log } from '../logger.js';
import { today, addDays } from '../db.js';

const AREA_DISCS = {
  LC: ['interpretacao', 'portugues', 'literatura', 'ingles', 'espanhol'],
  CH: ['historia', 'geografia', 'filosofia', 'sociologia'],
  CN: ['biologia', 'quimica', 'fisica'],
  MT: ['matematica'],
};
const AREA_NAME = { LC: 'Linguagens', CH: 'Ciências Humanas', CN: 'Ciências da Natureza', MT: 'Matemática' };
const AREA_KEY = { LC: 'linguagens', CH: 'humanas', CN: 'natureza', MT: 'matematica' };

export const EXAM_FORMATS = {
  ENEM: { title: 'Simulado ENEM', perArea: 45, minPerQuestion: 3, source: 'Edital Inep nº 64/2026 (ENEM 2026): 45 questões por área; 5h30 no 1º dia e 5h no 2º dia.', weightsProfile: null },
  EXATO: { title: 'Simulado EXATO', perArea: 20, minPerQuestion: 3, source: 'Edital Copese/UFT nº 068/2026 (EXATO 2026/2): 80 questões objetivas, 20 por área, + redação.', weightsProfile: null },
  UFT: { title: 'Simulado Medicina UFT — Palmas', perArea: 45, minPerQuestion: 3, source: 'Ingresso em Medicina UFT via SISU (ENEM) e PS Exato. Formato ENEM + pesos SISU 2026 oficiais da UFT.', weightsProfile: 'uft-palmas' },
  UFNT: { title: 'Simulado Medicina UFNT — Araguaína', perArea: 45, minPerQuestion: 3, source: 'Ingresso em Medicina UFNT via SISU (ENEM) e PS Exato. Formato ENEM + pesos SISU 2026 oficiais da UFNT.', weightsProfile: 'ufnt-araguaina' },
  UFMA: { title: 'Simulado Medicina UFMA', perArea: 45, minPerQuestion: 3, source: 'Ingresso em Medicina UFMA via SISU (ENEM), pesos iguais (termo de adesão SISU 2026).', weightsProfile: 'ufma-saoluis' },
  IFMA: { title: 'Simulado IFMA (seletivo técnico)', custom: { portugues: 8, interpretacao: 7, matematica: 15 }, minPerQuestion: 3,
    source: 'Formato do seletivo técnico IFMA 2027 (30 questões: 15 Língua Portuguesa, 15 Matemática) informado por FONTE SECUNDÁRIA (G1), não verificado no edital. Cursos superiores do IFMA usam SISU.', weightsProfile: null },
  PERSONALIZADO: { title: 'Simulado personalizado', minPerQuestion: 3, source: 'Configurado pela estudante.', weightsProfile: null },
};

function thetaByDiscipline(userId) {
  const m = getMastery(userId);
  const out = {};
  for (const d of DISCIPLINES) {
    const ms = m.filter((x) => x.discipline === d.id && x.attempts > 0);
    const n = ms.reduce((s, x) => s + x.attempts, 0);
    out[d.id] = n ? ms.reduce((s, x) => s + x.theta * x.attempts, 0) / n : -0.5;
  }
  return out;
}

/** Seleciona questões de uma disciplina perto da dificuldade adaptada (±1), preferindo não vistas e variando tópicos. */
function selectFor(userId, discipline, n, targetDiff, exclude) {
  if (n <= 0) return [];
  const rows = getDb().prepare(`SELECT id, topic, difficulty FROM questions WHERE status='ativa' AND type='multipla_escolha' AND discipline=?
    AND (created_for_user IS NULL OR created_for_user=?)`).all(discipline, userId).filter((r) => !exclude.has(r.id));
  const seen = new Set(getDb().prepare('SELECT DISTINCT question_id FROM attempts WHERE user_id=?').all(userId).map((r) => r.question_id));
  const topicCount = {};
  const scored = rows.map((r) => ({ ...r, s: Math.abs(r.difficulty - targetDiff) * 3 + (seen.has(r.id) ? 4 : 0) + Math.random() * 2 }));
  scored.sort((a, b) => a.s - b.s);
  const out = [];
  for (const r of scored) {
    if (out.length >= n) break;
    if ((topicCount[r.topic] || 0) >= Math.max(2, Math.ceil(n / 4)) && scored.length > n) continue;
    topicCount[r.topic] = (topicCount[r.topic] || 0) + 1;
    out.push(r.id); exclude.add(r.id);
  }
  for (const r of scored) { if (out.length >= n) break; if (!exclude.has(r.id)) { out.push(r.id); exclude.add(r.id); } }
  return out;
}

/**
 * Cria simulado. size: 'completo' (contagem oficial) | número de questões por área (reduzido).
 * custom (PERSONALIZADO): { disciplines: [...], count, difficulty?, minutes? }
 */
export function createExam(userId, { kind, size = 10, custom = null, language = 'ingles' }) {
  const fmt = EXAM_FORMATS[kind];
  if (!fmt) throw bad('Tipo de simulado inválido');
  const thetas = thetaByDiscipline(userId);
  const exclude = new Set();
  const ids = [];
  const plan = {};
  let requested = 0;
  if (kind === 'PERSONALIZADO') {
    const discs = (custom?.disciplines || []).filter((d) => getDiscipline(d) && d !== 'redacao');
    if (!discs.length) throw bad('Escolha ao menos uma disciplina');
    const count = Math.max(5, Math.min(Number(custom.count) || 20, 180));
    requested = count;
    discs.forEach((d, i) => { plan[d] = Math.floor(count / discs.length) + (i < count % discs.length ? 1 : 0); });
    for (const [d, n] of Object.entries(plan)) ids.push(...selectFor(userId, d, n, custom.difficulty || thetaToDifficulty(thetas[d]), exclude));
  } else if (fmt.custom) {
    for (const [d, n] of Object.entries(fmt.custom)) { plan[d] = n; requested += n; ids.push(...selectFor(userId, d, n, thetaToDifficulty(thetas[d]), exclude)); }
  } else {
    const perArea = size === 'completo' ? fmt.perArea : Math.max(3, Math.min(Number(size) || 10, fmt.perArea));
    for (const [area, discs0] of Object.entries(AREA_DISCS)) {
      const discs = discs0.filter((d) => (d === 'ingles' || d === 'espanhol') ? d === language : true);
      // Distribuição proporcional dentro da área (LC: língua estrangeira = 5 no ENEM completo).
      let alloc;
      if (area === 'LC') {
        const foreign = size === 'completo' ? 5 : Math.max(1, Math.round(perArea / 9));
        const rest = perArea - foreign;
        alloc = { [language]: foreign, interpretacao: Math.ceil(rest * 0.45), portugues: Math.ceil(rest * 0.3) };
        alloc.literatura = rest - alloc.interpretacao - alloc.portugues;
      } else {
        alloc = {};
        discs.forEach((d, i) => { alloc[d] = Math.floor(perArea / discs.length) + (i < perArea % discs.length ? 1 : 0); });
      }
      for (const [d, n] of Object.entries(alloc)) { plan[d] = n; requested += n; ids.push(...selectFor(userId, d, n, thetaToDifficulty(thetas[d]), exclude)); }
    }
  }
  if (!ids.length) throw bad('Não há questões suficientes no banco para este simulado.');
  const minutes = kind === 'PERSONALIZADO' && custom?.minutes ? Number(custom.minutes) : Math.round(ids.length * fmt.minPerQuestion);
  const config = { kind, size, plan, requested, available: ids.length, language, source: fmt.source, weightsProfile: fmt.weightsProfile,
    shortage: ids.length < requested ? `O banco tem ${ids.length} das ${requested} questões necessárias para este formato. Gere questões inéditas para completar.` : null };
  const title = `${fmt.title}${size === 'completo' ? ' (completo)' : kind === 'PERSONALIZADO' ? '' : ` (reduzido: ${ids.length} questões)`}`;
  const id = getDb().prepare('INSERT INTO exams (user_id, kind, title, config, question_ids, time_limit_s) VALUES (?,?,?,?,?,?)')
    .run(userId, kind, title, J.str(config), J.str(ids), minutes * 60).lastInsertRowid;
  return getExam(userId, Number(id));
}

export function getExam(userId, id) {
  const e = getDb().prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(id, userId);
  if (!e) throw notFound('Simulado não encontrado');
  const ids = J.parse(e.question_ids, []);
  const finished = e.status === 'finalizado';
  return {
    ...e, config: J.parse(e.config), answers: J.parse(e.answers, {}), flags: J.parse(e.flags, []), result: J.parse(e.result),
    questions: ids.map((qid) => { const q = getQuestion(qid); return finished ? revealedQuestion(q) : publicQuestion(q); }),
  };
}

export function listExams(userId) {
  return getDb().prepare('SELECT id, kind, title, status, started_at, finished_at, time_limit_s, elapsed_s, result FROM exams WHERE user_id=? ORDER BY id DESC').all(userId)
    .map((e) => { const r = J.parse(e.result); return { ...e, result: r ? { pct: r.pct, correct: r.correct, total: r.total } : null }; });
}

/** Salvamento automático: respostas, marcações e tempo decorrido. */
export function saveProgress(userId, id, { answers, flags, elapsed_s }) {
  const e = getDb().prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(id, userId);
  if (!e) throw notFound('Simulado não encontrado');
  if (e.status !== 'em_andamento') throw bad('Simulado já finalizado');
  const ids = new Set(J.parse(e.question_ids, []));
  const clean = {};
  for (const [qid, v] of Object.entries(answers || {})) if (ids.has(qid) && ['A', 'B', 'C', 'D', 'E'].includes(v)) clean[qid] = v;
  const fl = (Array.isArray(flags) ? flags : []).filter((q) => ids.has(q));
  const el = Math.max(e.elapsed_s, Math.min(Number(elapsed_s) || 0, 24 * 3600));
  getDb().prepare('UPDATE exams SET answers=?, flags=?, elapsed_s=? WHERE id=?').run(J.str(clean), J.str(fl), el, id);
  return { saved: true, answered: Object.keys(clean).length, elapsed_s: el };
}

const NARR_SCHEMA = obj({ analysis: str('análise da professora (markdown, 8-14 frases)'), recovery_plan: arr(str('ações concretas de recuperação')) });

export async function finishExam(userId, id, progress = null) {
  if (progress) saveProgress(userId, id, progress);
  const e = getDb().prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(id, userId);
  if (!e) throw notFound('Simulado não encontrado');
  if (e.status === 'finalizado') return getExam(userId, id).result;
  const ids = J.parse(e.question_ids, []);
  const answers = J.parse(e.answers, {});
  const cfg = J.parse(e.config, {});
  const byDisc = {}; const byArea = {}; const byTopic = {};
  let correct = 0; let blank = 0;
  tx((db) => {
    for (const qid of ids) {
      const q = getQuestion(qid);
      const chosen = answers[qid];
      const ok = chosen === q.answer;
      if (!chosen) blank++;
      if (ok) correct++;
      const d = (byDisc[q.discipline] ||= { discipline: q.discipline, name: getDiscipline(q.discipline).name, total: 0, correct: 0 });
      d.total++; if (ok) d.correct++;
      const area = getDiscipline(q.discipline).enemArea;
      const a = (byArea[area] ||= { area, name: AREA_NAME[area], total: 0, correct: 0 });
      a.total++; if (ok) a.correct++;
      const tk = `${q.discipline}/${q.topic}`;
      const t = (byTopic[tk] ||= { discipline: q.discipline, topic: q.topic, name: `${getDiscipline(q.discipline).name}: ${topicName(q.discipline, q.topic)}`, total: 0, correct: 0 });
      t.total++; if (ok) t.correct++;
      if (chosen) {
        const att = db.prepare('INSERT INTO attempts (user_id, question_id, context, context_id, chosen, correct, confidence) VALUES (?,?,?,?,?,?,?)')
          .run(userId, qid, 'simulado', id, chosen, ok ? 1 : 0, 'certeza');
        recordOutcome(userId, { discipline: q.discipline, topic: q.topic, difficulty: q.difficulty, correct: ok, confidence: 'certeza' });
        if (!ok) {
          db.prepare('INSERT INTO error_notebook (user_id, question_id, attempt_id, discipline, topic, chosen) VALUES (?,?,?,?,?,?)')
            .run(userId, qid, att.lastInsertRowid, q.discipline, q.topic, chosen);
        }
      }
    }
    addStudySeconds(userId, Math.min(e.elapsed_s, 6 * 3600));
  });
  const pct = (x) => (x.total ? Math.round((x.correct / x.total) * 1000) / 10 : 0);
  const topics = Object.values(byTopic).map((t) => ({ ...t, pct: pct(t) }));
  const result = {
    total: ids.length, correct, wrong: ids.length - correct - blank, blank, pct: pct({ total: ids.length, correct }),
    elapsed_s: e.elapsed_s, time_limit_s: e.time_limit_s,
    by_discipline: Object.values(byDisc).map((d) => ({ ...d, pct: pct(d) })).sort((a, b) => a.pct - b.pct),
    by_area: Object.values(byArea).map((a) => ({ ...a, pct: pct(a) })),
    dominated: topics.filter((t) => t.total >= 2 && t.correct === t.total).map((t) => t.name),
    reinforce: topics.filter((t) => t.correct / t.total < 0.5).sort((a, b) => a.pct - b.pct).map((t) => t.name),
    weighted: null,
    note: 'Aproveitamento bruto (acertos/total). A nota oficial do ENEM usa TRI e não pode ser reproduzida com exatidão; os valores aqui servem para acompanhar evolução.',
  };
  if (cfg.weightsProfile) {
    const w = profileWeights(cfg.weightsProfile);
    if (w) {
      const areas = Object.values(byArea);
      const sumW = areas.reduce((s, a) => s + Number(w.weights[AREA_KEY[a.area]] || 0), 0);
      result.weighted = {
        pct: sumW ? Math.round((areas.reduce((s, a) => s + pct(a) * Number(w.weights[AREA_KEY[a.area]] || 0), 0) / sumW) * 10) / 10 : null,
        weights: w.weights, source_url: w.source_url, period: w.reference_period,
        note: 'Aproveitamento ponderado pelos pesos oficiais das áreas objetivas (sem redação).',
      };
    }
  }
  // Evolução: compara com o simulado anterior do mesmo tipo.
  const prev = getDb().prepare("SELECT result FROM exams WHERE user_id=? AND kind=? AND status='finalizado' AND id<? ORDER BY id DESC LIMIT 1").get(userId, e.kind, id);
  if (prev) result.previous_pct = J.parse(prev.result)?.pct ?? null;
  // Recomendações determinísticas + plano de recuperação (itens no plano de estudos).
  result.recommendations = [];
  const weak = result.by_discipline.filter((d) => d.pct < 50).slice(0, 3);
  for (const d of weak) result.recommendations.push(`Reforçar ${d.name} (${d.pct}%): aula de base + lista de exercícios no nível recomendado.`);
  if (result.blank > 0) result.recommendations.push(`${result.blank} questões em branco: treine gestão de tempo (no ENEM não há penalidade por chute, mas o TRI valoriza coerência).`);
  if (e.time_limit_s && e.elapsed_s > e.time_limit_s) result.recommendations.push('Você ultrapassou o tempo previsto: pratique questões cronometradas.');
  const reinforceTopics = topics.filter((t) => t.correct / t.total < 0.5).slice(0, 4);
  reinforceTopics.forEach((t, i) => {
    try {
      addPlanItem(userId, { date: addDays(today(), i + 1), discipline: t.discipline, topic: t.topic, kind: 'aula', minutes: 40, reason: `Recuperação pós-simulado: ${t.correct}/${t.total} em ${t.name}.`, createdBy: 'professora' });
    } catch { /* ignore */ }
  });
  if (aiEnabled()) {
    try {
      result.teacher = await generateJSON({
        system: 'Você é a Professora Aurora (pré-Medicina, UFT/UFNT/UFMA/ENEM/EXATO). Analise o simulado com honestidade, sem prometer aprovação nem dar probabilidades.',
        content: `Simulado: ${e.title}. Resultado: ${JSON.stringify({ pct: result.pct, por_disciplina: result.by_discipline, por_area: result.by_area, dominados: result.dominated, reforcar: result.reinforce, em_branco: result.blank, anterior: result.previous_pct, tempo_usado_min: Math.round(e.elapsed_s / 60), tempo_previsto_min: Math.round((e.time_limit_s || 0) / 60), ponderado: result.weighted })}`,
        schema: NARR_SCHEMA, feature: 'simulado_analise', userId, effort: 'medium', maxTokens: 8000,
      });
    } catch (err) { log.warn('análise do simulado indisponível', { err: err.message }); }
  }
  getDb().prepare("UPDATE exams SET status='finalizado', finished_at=datetime('now'), result=? WHERE id=?").run(J.str(result), id);
  return result;
}

export { AREA_DISCS };
