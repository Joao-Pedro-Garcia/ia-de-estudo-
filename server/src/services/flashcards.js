// Flashcards com repetição espaçada (variante do SM-2) + geração por IA a partir de assuntos e erros.
import { getDb } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { getTopic, getDiscipline, topicName } from '../content/curriculum.js';
import { generateJSON, obj, str, arr } from '../ai/provider.js';
import { addStudySeconds } from './activity.js';

export function createCards(userId, { discipline, topic = null, cards, source = 'manual' }) {
  if (!getDiscipline(discipline)) throw bad('Disciplina inválida');
  if (!Array.isArray(cards) || !cards.length) throw bad('Nenhum cartão');
  const ins = getDb().prepare('INSERT INTO flashcards (user_id, discipline, topic, front, back, source) VALUES (?,?,?,?,?,?)');
  const ids = [];
  for (const c of cards.slice(0, 30)) {
    if (!c.front?.trim() || !c.back?.trim()) continue;
    ids.push(Number(ins.run(userId, discipline, topic, c.front.trim().slice(0, 1000), c.back.trim().slice(0, 2000), source).lastInsertRowid));
  }
  return ids;
}

/**
 * grade: 0 = errei, 1 = difícil, 2 = bom, 3 = fácil.
 * Errar reinicia o intervalo (lapso) e o cartão volta em 10 minutos.
 */
export function schedule(card, grade) {
  let { ease, interval_days: interval, reps, lapses } = card;
  if (grade === 0) {
    lapses += 1; reps = 0; interval = 0.007; // ~10 min
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval = grade === 3 ? 3 : 1;
    else if (reps === 2) interval = grade === 1 ? 3 : 6;
    else interval = interval * (grade === 1 ? 1.2 : grade === 3 ? ease * 1.3 : ease);
    ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  }
  interval = Math.min(interval, 365);
  return { ease, interval_days: interval, reps, lapses, due_at: new Date(Date.now() + interval * 86400000).toISOString() };
}

export function reviewCard(userId, id, grade, seconds = 0) {
  if (![0, 1, 2, 3].includes(grade)) throw bad('Nota inválida (0..3)');
  const db = getDb();
  const card = db.prepare('SELECT * FROM flashcards WHERE id=? AND user_id=?').get(id, userId);
  if (!card) throw notFound('Cartão não encontrado');
  const s = schedule(card, grade);
  db.prepare("UPDATE flashcards SET ease=?, interval_days=?, reps=?, lapses=?, due_at=?, last_review_at=datetime('now') WHERE id=?")
    .run(s.ease, s.interval_days, s.reps, s.lapses, s.due_at, id);
  if (seconds) addStudySeconds(userId, Math.min(seconds, 300));
  return { ...card, ...s };
}

export function dueCards(userId, { discipline, limit = 30 } = {}) {
  const now = new Date().toISOString();
  return getDb().prepare(`SELECT * FROM flashcards WHERE user_id=? AND due_at <= ? ${discipline ? 'AND discipline=?' : ''} ORDER BY due_at LIMIT ?`)
    .all(...[userId, now, ...(discipline ? [discipline] : []), limit]).map(withNames);
}

export function listCards(userId, { discipline } = {}) {
  return getDb().prepare(`SELECT * FROM flashcards WHERE user_id=? ${discipline ? 'AND discipline=?' : ''} ORDER BY due_at`)
    .all(...[userId, ...(discipline ? [discipline] : [])]).map(withNames);
}

export function deleteCard(userId, id) {
  getDb().prepare('DELETE FROM flashcards WHERE id=? AND user_id=?').run(id, userId);
}

export function cardStats(userId) {
  const now = new Date().toISOString();
  return getDb().prepare(`SELECT COUNT(*) total, SUM(due_at <= ?) due, SUM(reps >= 3 AND interval_days >= 7) mature FROM flashcards WHERE user_id=?`).get(now, userId);
}

function withNames(c) {
  return { ...c, discipline_name: getDiscipline(c.discipline)?.name, topic_name: c.topic ? topicName(c.discipline, c.topic) : null };
}

const CARDS_SCHEMA = obj({ cards: arr(obj({ front: str('pergunta objetiva para recuperação ativa'), back: str('resposta correta, concisa e precisa') })) });

/** Gera cartões por IA para um tópico (opcionalmente focados nos erros da estudante). */
export async function generateCards(userId, { discipline, topic, count = 8, focus = null }) {
  const t = getTopic(discipline, topic);
  if (!t) throw bad('Tópico inválido');
  const errors = getDb().prepare(`SELECT q.concept, e.chosen, q.wrong_notes FROM error_notebook e JOIN questions q ON q.id=e.question_id
    WHERE e.user_id=? AND e.discipline=? AND e.topic=? ORDER BY e.id DESC LIMIT 5`).all(userId, discipline, topic);
  const r = await generateJSON({
    system: 'Você cria flashcards de recuperação ativa para vestibular de Medicina. Perguntas específicas (não "explique tudo sobre"), respostas corretas e curtas. Português do Brasil.',
    content: `Crie ${Math.min(Number(count) || 8, 15)} flashcards de ${getDiscipline(discipline).name} — ${t.name} (subtópicos: ${t.subtopics.join(', ')}).
${focus ? `Foco: ${focus}.` : ''}${errors.length ? `\nConceitos em que a estudante errou recentemente: ${errors.map((e) => e.concept).filter(Boolean).join('; ')}` : ''}`,
    schema: CARDS_SCHEMA, feature: 'gerar_flashcards', userId, effort: 'medium', maxTokens: 8000,
  });
  const ids = createCards(userId, { discipline, topic, cards: r.cards, source: 'ia' });
  return { created: ids.length };
}
