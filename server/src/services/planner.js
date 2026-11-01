// Planejador de estudos adaptativo.
// Técnicas: repetição espaçada (revisões por tópico + flashcards), recuperação ativa (exercícios em todo bloco),
// revisão cumulativa (revisões vencidas), intercalação (disciplinas alternadas no dia) e progressão
// (só avança no tópico seguinte quando o anterior está ao menos parcialmente dominado).
// Respeita o tempo disponível informado e inclui pausas; não agenda jornadas acima do limite.
import { getDb, J, today, addDays, tx } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { DISCIPLINES, getDiscipline, topicName, getTopic } from '../content/curriculum.js';
import { getMastery, dueTopics, recurringErrors } from './mastery.js';
import { getProfile } from './onboarding.js';
import { profileWeights, MED_PROFILES } from './universities.js';

const KIND_LABEL = { aula: 'Aula', exercicios: 'Exercícios', revisao: 'Revisão', redacao: 'Redação', simulado: 'Simulado', flashcards: 'Flashcards' };
const MINUTES = { '30 minutos': 30, '1 hora': 60, '2 horas': 120, '3 horas': 180, '4 horas': 240, '5 horas ou mais': 300 };
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const START = { 'Manhã': '08:00', Tarde: '14:00', Noite: '19:00' };
const AREA_OF = { CN: 'natureza', MT: 'matematica', LC: 'linguagens', CH: 'humanas', RED: 'redacao' };

export function addPlanItem(userId, { date, startTime = null, discipline = null, topic = null, kind, minutes, reason = null, createdBy = 'usuario' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw bad('Data inválida');
  if (!KIND_LABEL[kind]) throw bad('Tipo de atividade inválido');
  if (discipline && !getDiscipline(discipline)) throw bad('Disciplina inválida');
  const m = Math.max(5, Math.min(Number(minutes) || 30, 300));
  const id = getDb().prepare('INSERT INTO plan_items (user_id, date, start_time, discipline, topic, kind, minutes, reason, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(userId, date, startTime, discipline, topic, kind, m, reason, createdBy).lastInsertRowid;
  return getItem(userId, Number(id));
}

function getItem(userId, id) {
  const r = getDb().prepare('SELECT * FROM plan_items WHERE id=? AND user_id=?').get(id, userId);
  return r ? decorate(r) : null;
}

function decorate(r) {
  return { ...r, kind_label: KIND_LABEL[r.kind], discipline_name: r.discipline ? getDiscipline(r.discipline)?.name : null, topic_name: r.topic ? topicName(r.discipline, r.topic) : null };
}

export function updatePlanItem(userId, id, patch) {
  const it = getItem(userId, id);
  if (!it) throw notFound('Item não encontrado');
  const fields = {};
  if (patch.status && ['pendente', 'feito', 'pulado'].includes(patch.status)) fields.status = patch.status;
  if (patch.date && /^\d{4}-\d{2}-\d{2}$/.test(patch.date)) fields.date = patch.date;
  if (patch.start_time !== undefined) fields.start_time = patch.start_time || null;
  if (patch.minutes) fields.minutes = Math.max(5, Math.min(Number(patch.minutes), 300));
  if (patch.kind && KIND_LABEL[patch.kind]) fields.kind = patch.kind;
  if (!Object.keys(fields).length) return it;
  // Edição manual "protege" o item contra regeneração automática.
  fields.created_by = it.created_by === 'sistema' && (patch.date || patch.minutes || patch.start_time !== undefined || patch.kind) ? 'usuario' : it.created_by;
  const sets = Object.keys(fields).map((k) => `${k}=?`).join(', ');
  getDb().prepare(`UPDATE plan_items SET ${sets} WHERE id=? AND user_id=?`).run(...Object.values(fields), id, userId);
  return getItem(userId, id);
}

export function deletePlanItem(userId, id) {
  getDb().prepare('DELETE FROM plan_items WHERE id=? AND user_id=?').run(id, userId);
}

export function getPlan(userId, from = today(), days = 7) {
  const to = addDays(from, days - 1);
  return getDb().prepare('SELECT * FROM plan_items WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date, COALESCE(start_time, "99"), id').all(userId, from, to).map(decorate);
}

/** Pesos por área considerando os processos-alvo (só pesos oficiais verificados; senão, iguais). */
export function targetAreaWeights(userId) {
  const p = getProfile(userId).answers;
  const targets = MED_PROFILES.filter((m) => (p.universidades || []).includes(m.match));
  const acc = { redacao: 0, linguagens: 0, humanas: 0, natureza: 0, matematica: 0 };
  const sources = [];
  for (const t of targets) {
    const w = profileWeights(t.id);
    if (!w) continue;
    const sum = Object.values(w.weights).reduce((s, x) => s + Number(x), 0);
    for (const k of Object.keys(acc)) acc[k] += Number(w.weights[k] || 0) / sum;
    sources.push({ profile: t.name, url: w.source_url, period: w.reference_period });
  }
  if (!sources.length) return { weights: { redacao: 0.2, linguagens: 0.2, humanas: 0.2, natureza: 0.2, matematica: 0.2 }, sources: [], note: 'Sem pesos oficiais verificados para os alvos escolhidos: usando pesos iguais.' };
  const tot = Object.values(acc).reduce((s, x) => s + x, 0);
  for (const k of Object.keys(acc)) acc[k] /= tot;
  return { weights: acc, sources, note: 'Pesos médios dos processos-alvo, a partir de fontes oficiais verificadas.' };
}

/** Prioridade de cada disciplina: peso oficial da área × prioridade pedagógica p/ Medicina × lacuna medida. */
export function disciplinePriorities(userId) {
  const { weights } = targetAreaWeights(userId);
  const mastery = getMastery(userId);
  const prof = getProfile(userId).answers;
  const lang = prof.lingua_estrangeira === 'Espanhol' ? 'espanhol' : 'ingles';
  const out = [];
  for (const d of DISCIPLINES) {
    if ((d.id === 'ingles' || d.id === 'espanhol') && d.id !== lang) continue;
    const ms = mastery.filter((m) => m.discipline === d.id && m.attempts > 0);
    const n = ms.reduce((s, m) => s + m.attempts, 0);
    const theta = n ? ms.reduce((s, m) => s + m.theta * m.attempts, 0) / n : -0.5;
    const gap = Math.max(0.15, Math.min(1, (1.8 - theta) / 3)); // quanto falta até "avançado"
    const areaW = weights[AREA_OF[d.enemArea]] ?? 0.2;
    out.push({ discipline: d.id, name: d.name, score: areaW * 5 * (d.medPriority / 5) * gap, theta, gap, areaWeight: areaW });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Próximo tópico de uma disciplina respeitando a progressão (fundamentos antes). */
export function nextTopic(userId, discipline) {
  const d = getDiscipline(discipline);
  const mastery = Object.fromEntries(getMastery(userId).filter((m) => m.discipline === discipline).map((m) => [m.topic, m]));
  for (const [tid] of d.topics) {
    const m = mastery[tid];
    if (!m || m.level === 'a_aprender' || m.level === 'nao_avaliado') return tid;
  }
  // Tudo ao menos parcial: escolhe o parcial com menor θ.
  const partial = d.topics.map(([tid]) => mastery[tid]).filter((m) => m && m.level === 'parcial').sort((a, b) => a.theta - b.theta);
  return partial[0]?.topic || d.topics[0][0];
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Gera (ou regenera) o plano dos próximos `days` dias. Mantém itens feitos e itens criados/editados
 * pela estudante ou pela professora; substitui apenas itens pendentes gerados pelo sistema.
 */
export function generatePlan(userId, { days = 14, from = today() } = {}) {
  const prof = getProfile(userId).answers;
  const daily = Math.min(MINUTES[prof.minutos_dia] || 60, 300);
  const allowedDays = new Set((prof.dias_semana?.length ? prof.dias_semana : WEEKDAYS.slice(1, 6)));
  const start = START[prof.periodo] || '19:00';
  const prios = disciplinePriorities(userId);
  const due = dueTopics(userId, 30);
  const recurring = recurringErrors(userId);
  const examDate = prof.data_prova && prof.data_prova >= from ? prof.data_prova : null;
  const db = getDb();
  const items = [];
  // Fila de "aprendizado novo": disciplinas por prioridade, com rodízio ponderado.
  const queue = [];
  for (const p of prios) {
    const reps = Math.max(1, Math.round(p.score * 4));
    for (let i = 0; i < reps; i++) queue.push(p.discipline);
  }
  // Intercala (evita mesma disciplina em sequência).
  const interleaved = [];
  const pool = [...queue];
  while (pool.length) {
    const last = interleaved[interleaved.length - 1];
    const idx = pool.findIndex((d) => d !== last);
    interleaved.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  let qi = 0;
  let dueIdx = 0;
  let recIdx = 0;
  const topicCursor = {};
  const nextFor = (disc) => {
    if (!topicCursor[disc]) topicCursor[disc] = nextTopic(userId, disc);
    return topicCursor[disc];
  };
  let studyDayCount = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const wd = WEEKDAYS[new Date(date + 'T12:00:00Z').getUTCDay()];
    if (!allowedDays.has(wd)) continue;
    if (examDate && date > examDate) break;
    studyDayCount++;
    let left = daily;
    let clock = start;
    const push = (it) => {
      items.push({ ...it, date, start_time: clock });
      clock = addMinutes(clock, it.minutes + (it.minutes >= 40 ? 10 : 5)); // pausas entre blocos
      left -= it.minutes;
    };
    const daysToExam = examDate ? Math.round((new Date(examDate) - new Date(date)) / 86400000) : null;
    const finalStretch = daysToExam !== null && daysToExam <= 10;

    // 1) Flashcards (recuperação ativa curta) todos os dias.
    if (left >= 30) push({ kind: 'flashcards', discipline: null, topic: null, minutes: 10, reason: 'Repetição espaçada: cartões vencidos do dia.' });

    // 2) Reforço de padrão de erro (prioridade máxima quando existe).
    if (recurring.length && left >= 40 && studyDayCount % 2 === 1) {
      const r = recurring[recIdx++ % recurring.length];
      push({ kind: 'aula', discipline: r.discipline, topic: r.topic, minutes: Math.min(40, left), reason: `Reforço: ${r.wrong} erros recentes em ${r.topic_name}. Aula sob demanda + questões semelhantes.` });
    }

    // 3) Simulado quinzenal (fim de semana) quando há tempo; reta final prioriza simulados/revisão.
    if ((wd === 'Sábado' || wd === 'Domingo') && left >= 90 && (studyDayCount % 6 === 0 || finalStretch)) {
      push({ kind: 'simulado', discipline: null, topic: null, minutes: Math.min(left, 180), reason: finalStretch ? 'Reta final: treino de prova com tempo.' : 'Simulado periódico para medir evolução e ajustar o plano.' });
    }

    // 4) Redação 2x/semana (terça e sábado, ou nos dias disponíveis equivalentes).
    if ((wd === 'Terça' || wd === 'Sábado') && left >= 60) {
      push({ kind: 'redacao', discipline: 'redacao', topic: null, minutes: 60, reason: 'Treino contínuo de redação (proposta + escrita + correção).' });
    }

    // 5) Revisões vencidas (revisão cumulativa).
    while (left >= 25 && dueIdx < due.length && items.filter((x) => x.date === date && x.kind === 'revisao').length < (finalStretch ? 3 : 1)) {
      const t = due[dueIdx++];
      push({ kind: 'revisao', discipline: t.discipline, topic: t.topic, minutes: 25, reason: `Revisão espaçada (${t.level === 'dominado' ? 'manutenção' : 'consolidação'}).` });
    }

    // 6) Aprendizado novo + exercícios, intercalando disciplinas.
    let guard = 0;
    while (left >= 25 && guard++ < 8) {
      const disc = interleaved[qi++ % interleaved.length];
      if (disc === 'redacao') continue;
      const topic = nextFor(disc);
      const lessonMin = Math.min(left >= 70 ? 40 : 25, left);
      if (!finalStretch) push({ kind: 'aula', discipline: disc, topic, minutes: lessonMin, reason: 'Próximo tópico da trilha (fundamentos antes de avançar).' });
      if (left >= 20) push({ kind: 'exercicios', discipline: disc, topic, minutes: Math.min(30, left), reason: 'Recuperação ativa: questões no nível recomendado pelo seu domínio.' });
    }
  }
  tx(() => {
    db.prepare("DELETE FROM plan_items WHERE user_id=? AND date>=? AND status='pendente' AND created_by='sistema'").run(userId, from);
    const ins = db.prepare('INSERT INTO plan_items (user_id, date, start_time, discipline, topic, kind, minutes, reason, created_by) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const it of items) ins.run(userId, it.date, it.start_time, it.discipline, it.topic, it.kind, it.minutes, it.reason, 'sistema');
  });
  return { generated: items.length, priorities: prios.slice(0, 8), weights: targetAreaWeights(userId), exam_date: examDate };
}

/** Garante que existe plano para os próximos dias (estende automaticamente). */
export function ensurePlan(userId) {
  const last = getDb().prepare("SELECT MAX(date) d FROM plan_items WHERE user_id=? AND created_by='sistema'").get(userId).d;
  if (!last || last < addDays(today(), 6)) return generatePlan(userId);
  return null;
}

export function planProgress(userId, from = addDays(today(), -6)) {
  return getDb().prepare(`SELECT COUNT(*) total, SUM(status='feito') done, SUM(minutes) planned_min, SUM(CASE WHEN status='feito' THEN minutes ELSE 0 END) done_min
    FROM plan_items WHERE user_id=? AND date BETWEEN ? AND ?`).get(userId, from, today());
}

export { getTopic, KIND_LABEL, J };
