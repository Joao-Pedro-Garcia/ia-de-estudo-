// Modo concentração: sessões cronometradas com meta, pausas e registro de produtividade.
// Salvaguardas de saúde: sessões de 10 a 90 min, pausa sugerida após cada sessão e alerta acima de 8h/dia.
import { getDb, today } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { getDiscipline } from '../content/curriculum.js';
import { addStudySeconds } from './activity.js';

const DAILY_LIMIT_MIN = 8 * 60;

export function todayFocusMinutes(userId) {
  return Math.round(getDb().prepare("SELECT COALESCE(SUM(actual_sec),0) s FROM focus_sessions WHERE user_id=? AND date(started_at,'-3 hours')=?").get(userId, today()).s / 60);
}

export function startFocus(userId, { minutes = 25, discipline = null, topic = null, goal = null }) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 10 || m > 90) throw bad('A sessão deve ter entre 10 e 90 minutos. Sessões longas demais reduzem o rendimento.');
  if (discipline && !getDiscipline(discipline)) throw bad('Disciplina inválida');
  const db = getDb();
  db.prepare("UPDATE focus_sessions SET status='abandonada', ended_at=datetime('now') WHERE user_id=? AND status='ativa'").run(userId);
  const done = todayFocusMinutes(userId);
  const warning = done + m > DAILY_LIMIT_MIN
    ? `Você já estudou ${Math.round(done / 60 * 10) / 10}h hoje em modo concentração. Descanso e sono consolidam a memória — considere parar por hoje.`
    : null;
  const id = db.prepare('INSERT INTO focus_sessions (user_id, discipline, topic, goal, planned_min) VALUES (?,?,?,?,?)').run(userId, discipline, topic, goal ? String(goal).slice(0, 200) : null, m).lastInsertRowid;
  return { ...db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(id), warning };
}

export function finishFocus(userId, id, { actualSec, rating = null, note = null, interrupted = false }) {
  const db = getDb();
  const s = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, userId);
  if (!s) throw notFound('Sessão não encontrada');
  if (s.status !== 'ativa') throw bad('Sessão já encerrada');
  const elapsedServer = Math.round((Date.now() - new Date(s.started_at + 'Z').getTime()) / 1000);
  const sec = Math.max(0, Math.min(Number(actualSec) || 0, elapsedServer + 5, s.planned_min * 60 + 600));
  db.prepare("UPDATE focus_sessions SET actual_sec=?, status=?, rating=?, note=?, ended_at=datetime('now') WHERE id=?")
    .run(sec, interrupted ? 'interrompida' : 'concluida', rating && rating >= 1 && rating <= 5 ? rating : null, note ? String(note).slice(0, 300) : null, id);
  addStudySeconds(userId, sec);
  const breakMin = s.planned_min >= 50 ? 15 : s.planned_min >= 25 ? 5 : 3;
  return { saved: true, minutes: Math.round(sec / 60), suggested_break_min: breakMin, today_minutes: todayFocusMinutes(userId) };
}

export function focusStats(userId) {
  const db = getDb();
  return {
    today_minutes: todayFocusMinutes(userId),
    sessions: db.prepare("SELECT * FROM focus_sessions WHERE user_id=? ORDER BY id DESC LIMIT 20").all(userId),
    last7: db.prepare(`SELECT date(started_at,'-3 hours') d, SUM(actual_sec)/60 minutes, COUNT(*) n, AVG(rating) rating FROM focus_sessions
      WHERE user_id=? AND started_at >= datetime('now','-7 day') GROUP BY d ORDER BY d`).all(userId),
    completion: db.prepare("SELECT SUM(status='concluida') done, SUM(status='interrompida') interrupted, COUNT(*) total FROM focus_sessions WHERE user_id=? AND status!='ativa'").get(userId),
  };
}
