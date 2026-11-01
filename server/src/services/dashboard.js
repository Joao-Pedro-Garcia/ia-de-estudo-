// Painel de desempenho: agrega dados reais de todos os módulos.
import { getDb, J, today, addDays } from '../db.js';
import { getDiscipline, topicName } from '../content/curriculum.js';
import { disciplineSummary, dueTopics, recurringErrors } from './mastery.js';
import { streak, studySeries } from './activity.js';
import { cardStats } from './flashcards.js';
import { essayEvolution } from './essays.js';
import { planProgress, getPlan } from './planner.js';
import { upcomingEvents } from './universities.js';

function weekStart(d = today()) {
  const dt = new Date(d + 'T12:00:00Z');
  const wd = (dt.getUTCDay() + 6) % 7; // segunda = 0
  return addDays(d, -wd);
}

export const DEFAULT_GOALS = { minutes: 600, questions: 100, essays: 1, flashcards: 100 };

export function getGoals(userId) {
  const ws = weekStart();
  const r = getDb().prepare('SELECT goals FROM weekly_goals WHERE user_id=? AND week_start=?').get(userId, ws);
  return { week_start: ws, goals: r ? J.parse(r.goals) : DEFAULT_GOALS, custom: !!r };
}

export function setGoals(userId, goals) {
  const ws = weekStart();
  const g = {};
  for (const k of Object.keys(DEFAULT_GOALS)) g[k] = Math.max(0, Math.min(Number(goals[k] ?? DEFAULT_GOALS[k]) || 0, 10000));
  getDb().prepare('INSERT INTO weekly_goals (user_id, week_start, goals) VALUES (?,?,?) ON CONFLICT(user_id, week_start) DO UPDATE SET goals=excluded.goals').run(userId, ws, J.str(g));
  return getGoals(userId);
}

export function weekProgress(userId) {
  const db = getDb();
  const ws = weekStart();
  return {
    minutes: Math.round(db.prepare('SELECT COALESCE(SUM(seconds),0) s FROM study_time WHERE user_id=? AND date>=?').get(userId, ws).s / 60),
    questions: db.prepare("SELECT COUNT(*) n FROM attempts WHERE user_id=? AND date(created_at,'-3 hours')>=?").get(userId, ws).n,
    essays: db.prepare("SELECT COUNT(*) n FROM essays WHERE user_id=? AND status='corrigida' AND date(created_at,'-3 hours')>=?").get(userId, ws).n,
    flashcards: db.prepare("SELECT COUNT(*) n FROM flashcards WHERE user_id=? AND last_review_at IS NOT NULL AND date(last_review_at,'-3 hours')>=?").get(userId, ws).n,
  };
}

export function dashboard(userId) {
  const db = getDb();
  const tot = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(correct),0) c FROM attempts WHERE user_id=?').get(userId);
  const hours = db.prepare('SELECT COALESCE(SUM(seconds),0) s FROM study_time WHERE user_id=?').get(userId).s / 3600;
  // Evolução semanal de acerto por disciplina (últimas 8 semanas).
  const evo = db.prepare(`SELECT q.discipline, strftime('%Y-%W', a.created_at) wk, COUNT(*) n, SUM(a.correct) c FROM attempts a JOIN questions q ON q.id=a.question_id
    WHERE a.user_id=? AND a.created_at >= datetime('now','-56 day') GROUP BY q.discipline, wk ORDER BY wk`).all(userId);
  const evolution = {};
  for (const r of evo) (evolution[r.discipline] ||= []).push({ week: r.wk, n: r.n, pct: Math.round((r.c / r.n) * 100) });
  const exams = db.prepare("SELECT id, title, kind, result, finished_at FROM exams WHERE user_id=? AND status='finalizado' ORDER BY id").all(userId)
    .map((e) => ({ id: e.id, title: e.title, kind: e.kind, date: e.finished_at?.slice(0, 10), pct: J.parse(e.result)?.pct }));
  const pending = db.prepare(`SELECT tm.discipline, tm.topic, tm.level FROM topic_mastery tm WHERE tm.user_id=? AND tm.level IN ('a_aprender','nao_avaliado') ORDER BY tm.theta LIMIT 12`).all(userId)
    .map((r) => ({ ...r, discipline_name: getDiscipline(r.discipline)?.name, topic_name: topicName(r.discipline, r.topic) }));
  return {
    totals: { hours: Math.round(hours * 10) / 10, streak: streak(userId), questions: tot.n, accuracy: tot.n ? Math.round((tot.c / tot.n) * 1000) / 10 : null, exams: exams.length },
    disciplines: Object.values(disciplineSummary(userId)),
    evolution,
    exams,
    essays: essayEvolution(userId),
    pending,
    due_reviews: dueTopics(userId, 8),
    recurring_errors: recurringErrors(userId),
    open_errors: db.prepare("SELECT COUNT(*) n FROM error_notebook WHERE user_id=? AND status!='resolvido'").get(userId).n,
    flashcards: cardStats(userId),
    study_series: studySeries(userId, 28),
    goals: getGoals(userId),
    week: weekProgress(userId),
    plan_week: planProgress(userId),
    today_plan: getPlan(userId, today(), 1),
    next_plan: (() => { const items = getPlan(userId, addDays(today(), 1), 7); const d = items[0]?.date; return d ? items.filter((i) => i.date === d) : []; })(),
    upcoming: upcomingEvents(userId, 5),
  };
}
