// Memória acadêmica consolidada: junta dados de TODOS os módulos para a professora de IA e o painel.
import { getDb, J } from '../db.js';
import { getDiscipline, topicName } from '../content/curriculum.js';
import { disciplineSummary, dueTopics, recurringErrors, getMastery } from './mastery.js';
import { getProfile } from './onboarding.js';
import { streak } from './activity.js';
import { upcomingEvents } from './universities.js';

export function addNote(userId, { kind, discipline = null, topic = null, text, source }) {
  if (!text) return null;
  const dup = getDb().prepare('SELECT id FROM memory_notes WHERE user_id=? AND text=? AND active=1').get(userId, text);
  if (dup) return dup.id;
  return Number(getDb().prepare('INSERT INTO memory_notes (user_id, kind, discipline, topic, text, source) VALUES (?,?,?,?,?,?)')
    .run(userId, kind, discipline, topic, text.slice(0, 500), source).lastInsertRowid);
}

export function listNotes(userId, limit = 30) {
  return getDb().prepare('SELECT * FROM memory_notes WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT ?').all(userId, limit);
}

export function deactivateNote(userId, id) {
  getDb().prepare('UPDATE memory_notes SET active=0 WHERE id=? AND user_id=?').run(id, userId);
}

/** Snapshot estruturado da estudante (usado no prompt da IA e na tela "Minha memória"). */
export function studentSnapshot(userId) {
  const db = getDb();
  const profile = getProfile(userId);
  const summary = disciplineSummary(userId);
  const mastery = getMastery(userId);
  const essays = db.prepare("SELECT id, theme, total_estimate, created_at FROM essays WHERE user_id=? AND status='corrigida' ORDER BY id DESC LIMIT 5").all(userId);
  const exams = db.prepare("SELECT id, kind, title, result, finished_at FROM exams WHERE user_id=? AND status='finalizado' ORDER BY id DESC LIMIT 3").all(userId)
    .map((e) => { const r = J.parse(e.result, {}); return { id: e.id, title: e.title, pct: r.pct, correct: r.correct, total: r.total, finished_at: e.finished_at }; });
  const openErrors = db.prepare("SELECT discipline, topic, COUNT(*) n FROM error_notebook WHERE user_id=? AND status!='resolvido' GROUP BY discipline, topic ORDER BY n DESC LIMIT 8").all(userId)
    .map((r) => ({ ...r, topic_name: topicName(r.discipline, r.topic) }));
  const totals = db.prepare('SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE user_id=?').get(userId);
  const lessons = db.prepare("SELECT discipline, topic, title, status, created_at FROM lessons WHERE user_id=? ORDER BY id DESC LIMIT 6").all(userId);
  const studied = db.prepare('SELECT COALESCE(SUM(seconds),0) s FROM study_time WHERE user_id=?').get(userId).s;
  return {
    profile: profile.answers,
    diagnostic_done: !!profile.diagnostic_done_at,
    totals: { questions: totals.n, accuracy: totals.n ? totals.c / totals.n : null, hours: Math.round((studied / 3600) * 10) / 10, streak: streak(userId) },
    disciplines: Object.values(summary),
    weak_topics: mastery.filter((m) => m.level === 'a_aprender').map((m) => `${getDiscipline(m.discipline)?.name}: ${m.topic_name}`).slice(0, 12),
    partial_topics: mastery.filter((m) => m.level === 'parcial').map((m) => `${getDiscipline(m.discipline)?.name}: ${m.topic_name}`).slice(0, 12),
    mastered_topics: mastery.filter((m) => m.level === 'dominado').map((m) => `${getDiscipline(m.discipline)?.name}: ${m.topic_name}`).slice(0, 12),
    lessons_without_evidence: mastery.filter((m) => m.lessons_done > 0 && m.attempts < 3).map((m) => `${getDiscipline(m.discipline)?.name}: ${m.topic_name}`),
    recurring_errors: recurringErrors(userId),
    due_reviews: dueTopics(userId, 8).map((t) => `${getDiscipline(t.discipline)?.name}: ${t.topic_name}`),
    open_errors: openErrors,
    essays,
    exams,
    lessons,
    notes: listNotes(userId, 15).map((n) => ({ kind: n.kind, text: n.text, source: n.source, at: n.created_at })),
    upcoming: upcomingEvents(userId, 4),
  };
}

/** Texto compacto para o prompt do sistema. */
export function snapshotForPrompt(userId) {
  const s = studentSnapshot(userId);
  const p = s.profile;
  const lines = [];
  lines.push(`Nome: ${p.nome || 'estudante'}${p.idade ? `, ${p.idade} anos` : ''}. Escolaridade: ${p.escolaridade || 'não informada'}.`);
  lines.push(`Objetivos: ${(p.universidades || []).join('; ') || 'não informados'}. Prova prevista: ${p.data_prova || 'não informada'}. Tempo diário: ${p.minutos_dia || '?'}; período: ${p.periodo || '?'}.`);
  if (p.dificuldades?.length) lines.push(`Dificuldades que ELA RELATA (percepção, não medida): ${p.dificuldades.join(', ')}.`);
  lines.push(`Questões respondidas: ${s.totals.questions}${s.totals.accuracy !== null ? ` (acerto ${Math.round(s.totals.accuracy * 100)}%)` : ''}. Horas registradas: ${s.totals.hours}. Sequência: ${s.totals.streak} dias.`);
  if (s.disciplines.length) {
    lines.push('Nível MEDIDO por disciplina (questões/avaliações): ' + s.disciplines.map((d) => `${d.name}: ${d.level.label}${d.accuracy !== null ? ` (${Math.round(d.accuracy * 100)}% em ${d.attempts})` : ''}`).join('; ') + '.');
  }
  if (s.weak_topics.length) lines.push(`Assuntos a aprender desde a base: ${s.weak_topics.join('; ')}.`);
  if (s.partial_topics.length) lines.push(`Assuntos parcialmente dominados: ${s.partial_topics.join('; ')}.`);
  if (s.mastered_topics.length) lines.push(`Assuntos dominados (com evidência): ${s.mastered_topics.join('; ')}.`);
  if (s.lessons_without_evidence.length) lines.push(`Aulas concluídas SEM evidência de domínio ainda (não considerar dominado): ${s.lessons_without_evidence.join('; ')}.`);
  if (s.recurring_errors.length) lines.push(`PADRÕES DE ERRO recorrentes (30 dias): ${s.recurring_errors.map((r) => `${getDiscipline(r.discipline)?.name}/${r.topic_name}: ${r.wrong} erros`).join('; ')}.`);
  if (s.due_reviews.length) lines.push(`Revisões vencidas (repetição espaçada): ${s.due_reviews.join('; ')}.`);
  if (s.essays.length) lines.push(`Redações (estimativas, mais recente primeiro): ${s.essays.map((e) => `${e.total_estimate ?? '?'} pts`).join(', ')}.`);
  if (s.exams.length) lines.push(`Simulados recentes: ${s.exams.map((e) => `${e.title}: ${e.pct}%`).join('; ')}.`);
  if (s.notes.length) lines.push(`Observações da memória: ${s.notes.slice(0, 10).map((n) => `[${n.kind}] ${n.text}`).join(' | ')}`);
  if (s.upcoming.length) lines.push(`Próximas datas oficiais: ${s.upcoming.map((e) => `${e.title} em ${e.date_start}${e.verified ? '' : ' (não verificado)'}`).join('; ')}.`);
  return lines.join('\n');
}
