// Tempo de estudo e sequência de dias (streak).
import { getDb, today, addDays } from '../db.js';

export function addStudySeconds(userId, seconds, date = today()) {
  if (!seconds || seconds <= 0) return;
  getDb().prepare(`INSERT INTO study_time (user_id, date, seconds) VALUES (?,?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET seconds = seconds + excluded.seconds`).run(userId, date, Math.round(seconds));
}

/** Dias com atividade: tempo registrado OU questões respondidas. */
export function activeDays(userId) {
  const rows = getDb().prepare(`SELECT date FROM study_time WHERE user_id=? AND seconds>0
    UNION SELECT date(created_at, '-3 hours') FROM attempts WHERE user_id=?`).all(userId, userId);
  return new Set(rows.map((r) => r.date));
}

export function streak(userId) {
  const days = activeDays(userId);
  let d = today();
  if (!days.has(d)) d = addDays(d, -1); // a sequência continua viva se estudou ontem
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function studySeries(userId, nDays = 28) {
  const start = addDays(today(), -(nDays - 1));
  const rows = getDb().prepare('SELECT date, seconds FROM study_time WHERE user_id=? AND date>=?').all(userId, start);
  const m = Object.fromEntries(rows.map((r) => [r.date, r.seconds]));
  const out = [];
  for (let i = 0; i < nDays; i++) {
    const d = addDays(start, i);
    out.push({ date: d, minutes: Math.round((m[d] || 0) / 60) });
  }
  return out;
}
