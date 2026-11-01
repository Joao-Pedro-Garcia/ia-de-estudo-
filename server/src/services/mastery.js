// Modelo de domínio por assunto (memória acadêmica quantitativa).
//
// Cada (estudante, disciplina, tópico) tem uma habilidade θ estimada por um modelo logístico
// (tipo Rasch/Elo) contra a dificuldade das questões (1..4 → b = -1, 0, 1, 2).
// Regras pedagógicas implementadas:
//  - "Assistir aula" NÃO aumenta θ; só respostas a questões contam.
//  - Acerto marcado como "chute" vale pouco (resultado 0,35); "com dúvida" vale 0,75.
//  - "Dominado" exige evidência: ≥ 5 tentativas, θ ≥ 1,0 e ≥ 80% de acertos seguros nas últimas 6.
//  - Revisão espaçada: o próximo momento de revisão depende do nível e é antecipado após erros.
import { getDb, J } from '../db.js';
import { getDiscipline, topicName } from '../content/curriculum.js';

export const DIFF_B = { 1: -1.0, 2: 0.0, 3: 1.0, 4: 2.0 };
const OUTCOME = { certeza: 1, duvida: 0.75, chute: 0.35 };

export const LEVEL_LABEL = {
  nao_avaliado: 'Sem evidência suficiente',
  a_aprender: 'Precisa aprender desde a base',
  parcial: 'Parcialmente dominado',
  dominado: 'Dominado',
};

export function probability(theta, difficulty) {
  return 1 / (1 + Math.exp(-1.7 * (theta - DIFF_B[difficulty])));
}

export function classify({ theta, attempts, recent }) {
  if (attempts < 3) return 'nao_avaliado';
  const lastSure = recent.slice(-6);
  const sureRate = lastSure.length ? lastSure.filter((r) => r.c === 1 && r.f !== 'chute').length / lastSure.length : 0;
  if (attempts >= 5 && theta >= 1.0 && sureRate >= 0.8) return 'dominado';
  if (theta >= -0.2) return 'parcial';
  return 'a_aprender';
}

const REVIEW_DAYS = { nao_avaliado: 2, a_aprender: 1, parcial: 3, dominado: 10 };

function addDaysISO(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

/** Atualiza o domínio após uma resposta. Retorna o registro novo. */
export function recordOutcome(userId, { discipline, topic, difficulty, correct, confidence = 'certeza' }) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM topic_mastery WHERE user_id=? AND discipline=? AND topic=?').get(userId, discipline, topic);
  if (!row) {
    db.prepare('INSERT INTO topic_mastery (user_id, discipline, topic) VALUES (?,?,?)').run(userId, discipline, topic);
    row = db.prepare('SELECT * FROM topic_mastery WHERE user_id=? AND discipline=? AND topic=?').get(userId, discipline, topic);
  }
  const outcome = correct ? (OUTCOME[confidence] ?? 1) : 0;
  const p = probability(row.theta, difficulty);
  const k = Math.max(0.25, 0.9 / Math.sqrt(1 + row.attempts / 3));
  const theta = Math.max(-3, Math.min(3.5, row.theta + k * (outcome - p)));
  const recent = J.parse(row.recent, []);
  recent.push({ c: correct ? 1 : 0, f: confidence, d: difficulty });
  while (recent.length > 12) recent.shift();
  const attempts = row.attempts + 1;
  const level = classify({ theta, attempts, recent });
  let reviewDays = REVIEW_DAYS[level];
  if (!correct) reviewDays = Math.min(reviewDays, 1);
  db.prepare(`UPDATE topic_mastery SET theta=?, attempts=?, correct=correct+?, guessed_correct=guessed_correct+?, recent=?, level=?,
      last_practice_at=datetime('now'), next_review_at=?, updated_at=datetime('now') WHERE user_id=? AND discipline=? AND topic=?`)
    .run(theta, attempts, correct ? 1 : 0, correct && confidence === 'chute' ? 1 : 0, J.str(recent), level, addDaysISO(reviewDays), userId, discipline, topic);
  return { discipline, topic, theta, attempts, level, previousLevel: row.level };
}

/** Registra que a estudante concluiu uma aula do tópico (não altera θ). */
export function recordLessonDone(userId, discipline, topic) {
  const db = getDb();
  db.prepare(`INSERT INTO topic_mastery (user_id, discipline, topic, lessons_done) VALUES (?,?,?,1)
    ON CONFLICT(user_id, discipline, topic) DO UPDATE SET lessons_done = lessons_done + 1, updated_at = datetime('now')`).run(userId, discipline, topic);
}

export function getMastery(userId) {
  return getDb().prepare('SELECT * FROM topic_mastery WHERE user_id=? ORDER BY discipline, topic').all(userId)
    .map((r) => ({ ...r, recent: J.parse(r.recent, []), topic_name: topicName(r.discipline, r.topic), level_label: LEVEL_LABEL[r.level] }));
}

/** Nível qualitativo da disciplina a partir dos tópicos avaliados. */
export function disciplineSummary(userId) {
  const rows = getMastery(userId);
  const by = {};
  for (const r of rows) {
    (by[r.discipline] ||= []).push(r);
  }
  const out = {};
  for (const [disc, list] of Object.entries(by)) {
    const evaluated = list.filter((r) => r.attempts > 0);
    const n = evaluated.reduce((s, r) => s + r.attempts, 0);
    const theta = n ? evaluated.reduce((s, r) => s + r.theta * r.attempts, 0) / n : null;
    const correct = evaluated.reduce((s, r) => s + r.correct, 0);
    out[disc] = {
      discipline: disc,
      name: getDiscipline(disc)?.name || disc,
      attempts: n,
      accuracy: n ? correct / n : null,
      theta,
      level: thetaToLevel(theta, n),
      topics: {
        dominado: list.filter((r) => r.level === 'dominado').length,
        parcial: list.filter((r) => r.level === 'parcial').length,
        a_aprender: list.filter((r) => r.level === 'a_aprender').length,
        nao_avaliado: list.filter((r) => r.level === 'nao_avaliado').length,
      },
    };
  }
  return out;
}

export function thetaToLevel(theta, n) {
  if (theta === null || n < 3) return { key: 'indefinido', label: 'Ainda sem dados suficientes', score: null };
  // Escala 0–100 só para visualização (não é nota oficial nem probabilidade).
  const score = Math.round(Math.max(0, Math.min(100, ((theta + 2) / 5) * 100)));
  if (theta < -0.5) return { key: 'inicial', label: 'Inicial', score };
  if (theta < 0.4) return { key: 'basico', label: 'Básico', score };
  if (theta < 1.3) return { key: 'intermediario', label: 'Intermediário', score };
  return { key: 'avancado', label: 'Avançado', score };
}

/** Dificuldade recomendada para a próxima questão do tópico (adaptação contínua). */
export function recommendedDifficulty(userId, discipline, topic) {
  const row = getDb().prepare('SELECT theta, attempts FROM topic_mastery WHERE user_id=? AND discipline=? AND topic=?').get(userId, discipline, topic);
  if (!row || row.attempts === 0) {
    // Usa a média da disciplina como prior, se houver.
    const d = getDb().prepare('SELECT AVG(theta) t, SUM(attempts) n FROM topic_mastery WHERE user_id=? AND discipline=? AND attempts>0').get(userId, discipline);
    return d && d.n ? thetaToDifficulty(d.t) : 1;
  }
  return thetaToDifficulty(row.theta);
}

export function thetaToDifficulty(theta) {
  // Escolhe a dificuldade cuja probabilidade de acerto fica mais próxima de ~65% (zona de desafio produtivo).
  let best = 1; let bestGap = 9;
  for (const d of [1, 2, 3, 4]) {
    const gap = Math.abs(probability(theta, d) - 0.65);
    if (gap < bestGap) { bestGap = gap; best = d; }
  }
  return best;
}

/** Tópicos com revisão vencida (repetição espaçada por tópico) e tópicos "esquecendo". */
export function dueTopics(userId, limit = 10) {
  return getDb().prepare(`SELECT * FROM topic_mastery WHERE user_id=? AND attempts>0 AND next_review_at <= datetime('now','+0 day')
    ORDER BY CASE level WHEN 'a_aprender' THEN 0 WHEN 'parcial' THEN 1 WHEN 'nao_avaliado' THEN 2 ELSE 3 END, next_review_at LIMIT ?`).all(userId, limit)
    .map((r) => ({ ...r, topic_name: topicName(r.discipline, r.topic) }));
}

/** Padrões de erro recorrentes: tópicos com ≥2 erros entre as últimas tentativas. */
export function recurringErrors(userId, days = 30) {
  return getDb().prepare(`SELECT q.discipline, q.topic, COUNT(*) wrong,
      SUM(CASE WHEN a.created_at >= datetime('now','-7 day') THEN 1 ELSE 0 END) wrong_7d
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id=? AND a.correct=0 AND a.created_at >= datetime('now', ?)
    GROUP BY q.discipline, q.topic HAVING wrong >= 2 ORDER BY wrong DESC LIMIT 10`).all(userId, `-${days} day`)
    .map((r) => ({ ...r, topic_name: topicName(r.discipline, r.topic) }));
}
