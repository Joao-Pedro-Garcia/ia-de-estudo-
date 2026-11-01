// Rotas da API REST. Todas (exceto auth/health) exigem sessão. Entrada validada; erros tratados no app.
import express from 'express';
import { getDb } from '../db.js';
import { aiStatus, config } from '../config.js';
import { ah, bad, pick, forbidden } from '../lib/http.js';
import { hashPassword, verifyPassword, createSession, setSessionCookie, clearSession, requireAuth, requireAdmin, loginRateLimit, userFromRequest } from '../auth.js';
import { curriculumJSON, getDiscipline } from '../content/curriculum.js';
import * as Q from '../services/questions.js';
import * as OB from '../services/onboarding.js';
import * as M from '../services/mastery.js';
import * as MEM from '../services/memory.js';
import * as CH from '../services/chat.js';
import * as L from '../services/lessons.js';
import * as EX from '../services/exams.js';
import * as ES from '../services/essays.js';
import * as FC from '../services/flashcards.js';
import * as PL from '../services/planner.js';
import * as FO from '../services/focus.js';
import * as ER from '../services/errors.js';
import * as UNI from '../services/universities.js';
import * as RAG from '../services/rag.js';
import * as DASH from '../services/dashboard.js';
import { addStudySeconds } from '../services/activity.js';
import { aiEnabled } from '../ai/provider.js';
import { log } from '../logger.js';

export const api = express.Router();
const id = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw bad('id inválido');
  return n;
};

// ---------- Saúde / status ----------
api.get('/health', (req, res) => res.json({ ok: true, ai: aiStatus() }));

// ---------- Autenticação ----------
api.post('/auth/register', loginRateLimit, ah(async (req, res) => {
  if (!config.allowRegistration) throw forbidden('Cadastro desativado neste servidor.');
  const { email, password, name } = pick(req.body, { email: 'string', password: 'string', name: '?string' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('E-mail inválido');
  if (password.length < 8) throw bad('A senha precisa ter pelo menos 8 caracteres');
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw bad('Já existe uma conta com este e-mail');
  const isFirst = db.prepare('SELECT COUNT(*) n FROM users').get().n === 0;
  const uid = Number(db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)')
    .run(email, hashPassword(password), (name || email.split('@')[0]).slice(0, 80), isFirst ? 'admin' : 'estudante').lastInsertRowid);
  OB.getProfile(uid);
  const { token } = createSession(uid);
  setSessionCookie(res, token);
  log.info('conta criada', { uid });
  res.status(201).json({ user: { id: uid, email, name: name || email.split('@')[0], role: isFirst ? 'admin' : 'estudante' } });
}));

api.post('/auth/login', loginRateLimit, ah(async (req, res) => {
  const { email, password } = pick(req.body, { email: 'string', password: 'string' });
  const u = getDb().prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !verifyPassword(password, u.password_hash)) throw bad('E-mail ou senha incorretos');
  const { token } = createSession(u.id);
  setSessionCookie(res, token);
  res.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role } });
}));

api.post('/auth/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); });

api.get('/auth/me', (req, res) => {
  const u = userFromRequest(req);
  if (!u) return res.json({ user: null, ai: aiStatus() });
  const p = OB.getProfile(u.id);
  res.json({ user: u, ai: aiStatus(), onboarding_done: !!p.onboarding_done_at, diagnostic_done: !!p.diagnostic_done_at, profile: p.answers });
});

api.use(requireAuth);

// ---------- Currículo ----------
api.get('/curriculum', (req, res) => res.json(curriculumJSON()));

// ---------- Onboarding + diagnóstico ----------
api.get('/onboarding', (req, res) => {
  const p = OB.getProfile(req.user.id);
  res.json({ steps: OB.ONBOARDING_STEPS, answers: p.answers, step: p.onboarding_step, done: !!p.onboarding_done_at });
});
api.put('/onboarding/answer', ah(async (req, res) => {
  const { stepId } = pick(req.body, { stepId: 'string' });
  res.json(OB.saveOnboardingAnswer(req.user.id, { stepId, value: req.body.value, step: req.body.step }));
}));
api.post('/onboarding/complete', ah(async (req, res) => res.json(OB.completeOnboarding(req.user.id))));
api.post('/diagnostic/start', ah(async (req, res) => {
  const d = OB.startDiagnostic(req.user.id, { restart: !!req.body?.restart });
  res.json({ id: d.id, status: d.status });
}));
api.post('/diagnostic/redo', ah(async (req, res) => {
  OB.startDiagnostic(req.user.id, { restart: true });
  getDb().prepare('UPDATE profiles SET diagnostic_done_at=NULL WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
}));
api.get('/diagnostic/next', ah(async (req, res) => res.json(OB.nextDiagnosticStep(req.user.id))));
api.post('/diagnostic/answer', ah(async (req, res) => {
  const b = pick(req.body, { questionId: 'string', chosen: 'string', confidence: 'string' });
  res.json(OB.answerDiagnostic(req.user.id, b));
}));
api.post('/diagnostic/discursive', ah(async (req, res) => res.json(await OB.answerDiscursive(req.user.id, { text: req.body?.text, skip: !!req.body?.skip }))));
api.post('/diagnostic/finish', ah(async (req, res) => {
  const report = await OB.finishDiagnostic(req.user.id);
  const plan = PL.generatePlan(req.user.id);
  res.json({ report, plan });
}));
api.get('/diagnostic/report', ah(async (req, res) => {
  const d = OB.getActiveDiagnostic(req.user.id);
  const last = getDb().prepare("SELECT report, finished_at FROM diagnostics WHERE user_id=? AND status='concluido' ORDER BY id DESC LIMIT 1").get(req.user.id);
  res.json({ current: d ? { status: d.status } : null, report: last ? JSON.parse(last.report) : null, finished_at: last?.finished_at || null });
}));

// ---------- Memória acadêmica / desempenho ----------
api.get('/memory', (req, res) => res.json({ snapshot: MEM.studentSnapshot(req.user.id), mastery: M.getMastery(req.user.id) }));
api.delete('/memory/notes/:id', (req, res) => { MEM.deactivateNote(req.user.id, id(req)); res.json({ ok: true }); });
api.get('/dashboard', ah(async (req, res) => { PL.ensurePlan(req.user.id); res.json(DASH.dashboard(req.user.id)); }));
api.put('/goals', ah(async (req, res) => res.json(DASH.setGoals(req.user.id, req.body || {}))));

// ---------- Questões ----------
api.get('/questions', (req, res) => res.json(Q.listQuestions(req.user.id, { ...req.query, saved: req.query.saved === '1', wrong: req.query.wrong === '1', unseen: req.query.unseen === '1' })));
api.get('/questions/stats', (req, res) => res.json(Q.bankStats(req.user.id)));
api.get('/questions/next', ah(async (req, res) => {
  const { discipline, topic, difficulty } = req.query;
  if (!getDiscipline(discipline)) throw bad('Disciplina inválida');
  const exclude = String(req.query.exclude || '').split(',').filter(Boolean).slice(0, 200);
  const q = Q.pickAdaptive(req.user.id, { discipline, topic: topic || undefined, difficulty: difficulty ? Number(difficulty) : undefined, exclude });
  res.json({ question: q ? Q.publicQuestion(q) : null });
}));
api.get('/questions/:qid', ah(async (req, res) => {
  const q = Q.getQuestion(req.params.qid);
  if (!q || (q.created_for_user && q.created_for_user !== req.user.id)) throw bad('Questão não encontrada');
  res.json(Q.publicQuestion(q));
}));
// Resolução só com pedido explícito (ou após responder).
api.get('/questions/:qid/solution', ah(async (req, res) => {
  const q = Q.getQuestion(req.params.qid);
  if (!q || (q.created_for_user && q.created_for_user !== req.user.id)) throw bad('Questão não encontrada');
  if (req.query.explicit !== '1') {
    const answered = getDb().prepare('SELECT 1 FROM attempts WHERE user_id=? AND question_id=?').get(req.user.id, q.id);
    if (!answered) throw bad('Responda primeiro, ou peça a resolução explicitamente.');
  }
  res.json(Q.revealedQuestion(q));
}));
api.post('/questions/:qid/answer', ah(async (req, res) => {
  const b = pick(req.body, { chosen: 'string', confidence: '?string', timeMs: '?int', context: '?string', contextId: '?int' });
  const ctx = ['pratica', 'aula', 'recuperacao', 'lista', 'cronometrada', 'laboratorio'].includes(b.context) ? b.context : 'pratica';
  res.json(Q.answerQuestion(req.user.id, { questionId: req.params.qid, chosen: b.chosen, confidence: b.confidence || 'certeza', timeMs: b.timeMs, context: ctx, contextId: b.contextId }));
}));
api.post('/questions/:qid/save', ah(async (req, res) => res.json(Q.toggleSaved(req.user.id, req.params.qid, req.body?.save !== false))));
api.post('/questions/generate', ah(async (req, res) => {
  const b = pick(req.body, { discipline: 'string', topic: 'string', subtopic: '?string', difficulty: '?int', count: '?int', focus: '?string' });
  res.json(await Q.generateQuestions(req.user.id, b));
}));

// ---------- Caderno de erros ----------
api.get('/errors', (req, res) => res.json({ items: ER.listErrors(req.user.id, req.query), stats: ER.errorStats(req.user.id), types: ER.ERROR_TYPES }));
api.get('/errors/:id', ah(async (req, res) => res.json(ER.getError(req.user.id, id(req)))));
api.post('/errors/:id/recovery', ah(async (req, res) => res.json(await ER.startRecovery(req.user.id, id(req), { studentReasoning: req.body?.reasoning || '', errorType: req.body?.errorType || null }))));
api.post('/errors/:id/similar', ah(async (req, res) => res.json(ER.similarQuestion(req.user.id, id(req)))));

// ---------- Conversas ----------
api.get('/conversations', (req, res) => res.json(CH.listConversations(req.user.id, req.query)));
api.post('/conversations', ah(async (req, res) => res.status(201).json(CH.createConversation(req.user.id, req.body || {}))));
api.get('/conversations/:id', ah(async (req, res) => res.json(CH.getConversation(req.user.id, id(req)))));
api.patch('/conversations/:id', ah(async (req, res) => { CH.renameConversation(req.user.id, id(req), pick(req.body, { title: 'string' }).title); res.json({ ok: true }); }));
api.delete('/conversations/:id', ah(async (req, res) => { CH.deleteConversation(req.user.id, id(req)); res.json({ ok: true }); }));
api.get('/images/:imageId', (req, res) => {
  const p = CH.imagePath(req.user.id, req.params.imageId);
  if (!p) return res.status(404).end();
  res.sendFile(p);
});
// Streaming (Server-Sent Events sobre POST).
api.post('/conversations/:id/messages', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ka = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  try {
    const cid = id(req);
    await CH.sendMessage(req.user.id, cid, { text: req.body?.text || '', images: Array.isArray(req.body?.images) ? req.body.images : [], mode: req.body?.mode || 'auto', voice: !!req.body?.voice }, emit);
  } catch (e) {
    emit('error', { message: e.status ? e.message : 'Erro interno', code: e.details?.code || null });
    if (!e.status) log.error('erro no chat', { err: e.message, stack: e.stack });
  } finally {
    clearInterval(ka);
    res.end();
  }
});

// ---------- Aulas ----------
api.get('/lessons', (req, res) => res.json(L.listLessons(req.user.id, req.query)));
api.get('/lessons/trail/:discipline', ah(async (req, res) => res.json(L.lessonTrail(req.user.id, req.params.discipline))));
api.post('/lessons', ah(async (req, res) => {
  const b = pick(req.body, { discipline: 'string', topic: 'string', subtopic: '?string', reason: '?string', focus: '?string' });
  const reason = ['trilha', 'sob_demanda', 'reforco'].includes(b.reason) ? b.reason : 'trilha';
  res.status(201).json(await L.createLesson(req.user.id, { ...b, reason }));
}));
api.get('/lessons/:id', ah(async (req, res) => res.json(L.getLesson(req.user.id, id(req)))));
api.get('/lessons/:id/test', ah(async (req, res) => res.json(L.comprehensionTest(req.user.id, id(req)))));
api.post('/lessons/:id/complete', ah(async (req, res) => res.json(L.completeLesson(req.user.id, id(req), { attemptIds: req.body?.attemptIds || [] }))));
api.post('/lessons/:id/conversation', ah(async (req, res) => {
  const l = L.getLesson(req.user.id, id(req));
  if (l.conversation_id) return res.json(CH.getConversation(req.user.id, l.conversation_id));
  const c = CH.createConversation(req.user.id, { title: `Aula: ${l.title}`, discipline: l.discipline, topic: l.topic, mode: 'aula' });
  getDb().prepare('UPDATE lessons SET conversation_id=? WHERE id=?').run(c.id, l.id);
  res.json(c);
}));

// ---------- Simulados ----------
api.get('/exams/formats', (req, res) => res.json(Object.entries(EX.EXAM_FORMATS).map(([k, v]) => ({ kind: k, title: v.title, perArea: v.perArea || null, source: v.source }))));
api.get('/exams', (req, res) => res.json(EX.listExams(req.user.id)));
api.post('/exams', ah(async (req, res) => res.status(201).json(EX.createExam(req.user.id, req.body || {}))));
api.get('/exams/:id', ah(async (req, res) => res.json(EX.getExam(req.user.id, id(req)))));
api.put('/exams/:id/progress', ah(async (req, res) => res.json(EX.saveProgress(req.user.id, id(req), req.body || {}))));
api.post('/exams/:id/finish', ah(async (req, res) => res.json(await EX.finishExam(req.user.id, id(req), req.body?.answers ? req.body : null))));

// ---------- Redação ----------
api.get('/essays', (req, res) => res.json({ items: ES.listEssays(req.user.id), evolution: ES.essayEvolution(req.user.id), competencies: ES.competencies() }));
api.get('/essays/:id', ah(async (req, res) => res.json(ES.getEssay(req.user.id, id(req)))));
api.post('/essays', ah(async (req, res) => {
  const b = pick(req.body, { theme: 'string', text: 'string', fromImage: '?bool' });
  res.status(201).json(await ES.evaluateEssay(req.user.id, b));
}));
api.post('/essays/transcribe', ah(async (req, res) => res.json(await ES.transcribeEssay(req.user.id, { imageBase64: req.body?.data, mediaType: req.body?.media_type }))));
api.post('/essays/theme', ah(async (req, res) => res.json(await ES.proposeTheme(req.user.id, { area: req.body?.area || null }))));

// ---------- Flashcards ----------
api.get('/flashcards', (req, res) => res.json({ due: FC.dueCards(req.user.id, req.query), all: FC.listCards(req.user.id, req.query), stats: FC.cardStats(req.user.id) }));
api.post('/flashcards', ah(async (req, res) => {
  const b = pick(req.body, { discipline: 'string', topic: '?string', front: 'string', back: 'string' });
  res.status(201).json({ ids: FC.createCards(req.user.id, { discipline: b.discipline, topic: b.topic || null, cards: [{ front: b.front, back: b.back }] }) });
}));
api.post('/flashcards/generate', ah(async (req, res) => {
  const b = pick(req.body, { discipline: 'string', topic: 'string', count: '?int', focus: '?string' });
  res.json(await FC.generateCards(req.user.id, b));
}));
api.post('/flashcards/:id/review', ah(async (req, res) => res.json(FC.reviewCard(req.user.id, id(req), Number(req.body?.grade), Number(req.body?.seconds) || 0))));
api.delete('/flashcards/:id', (req, res) => { FC.deleteCard(req.user.id, id(req)); res.json({ ok: true }); });

// ---------- Plano de estudos ----------
api.get('/plan', ah(async (req, res) => {
  PL.ensurePlan(req.user.id);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : undefined;
  res.json({ items: PL.getPlan(req.user.id, from, Math.min(Number(req.query.days) || 7, 31)), priorities: PL.disciplinePriorities(req.user.id).slice(0, 8), weights: PL.targetAreaWeights(req.user.id) });
}));
api.post('/plan/regenerate', ah(async (req, res) => res.json(PL.generatePlan(req.user.id, { days: Math.min(Number(req.body?.days) || 14, 31) }))));
api.post('/plan/items', ah(async (req, res) => res.status(201).json(PL.addPlanItem(req.user.id, { ...req.body, startTime: req.body?.start_time, createdBy: 'usuario' }))));
api.patch('/plan/items/:id', ah(async (req, res) => res.json(PL.updatePlanItem(req.user.id, id(req), req.body || {}))));
api.delete('/plan/items/:id', (req, res) => { PL.deletePlanItem(req.user.id, id(req)); res.json({ ok: true }); });

// ---------- Modo concentração ----------
api.get('/focus', (req, res) => res.json(FO.focusStats(req.user.id)));
api.post('/focus', ah(async (req, res) => res.status(201).json(FO.startFocus(req.user.id, req.body || {}))));
api.post('/focus/:id/finish', ah(async (req, res) => res.json(FO.finishFocus(req.user.id, id(req), req.body || {}))));

// ---------- Laboratório virtual (registro de tempo de prática) ----------
api.post('/lab/activity', ah(async (req, res) => {
  const sec = Math.max(0, Math.min(Number(req.body?.seconds) || 0, 3600));
  addStudySeconds(req.user.id, sec);
  res.json({ ok: true });
}));

// ---------- Central de Medicina Federal / calendário / simulador ----------
api.get('/central', (req, res) => res.json({ profiles: UNI.allMedProfiles(), facts: UNI.listFacts({ institution: req.query.institution }) }));
api.post('/central/facts', requireAdmin, ah(async (req, res) => res.status(201).json(UNI.addFact(req.user.id, req.body || {}))));
api.post('/simulator', ah(async (req, res) => res.json({ results: UNI.simulateScores(req.body?.scores || {}, req.body?.profiles), disclaimer: 'Simulação com pesos oficiais verificados. Notas de corte são históricas e servem apenas de referência: não indicam chance de aprovação.' })));
api.get('/calendar', (req, res) => res.json(UNI.listEvents(req.user.id)));
api.post('/calendar', ah(async (req, res) => res.status(201).json(UNI.addPersonalEvent(req.user.id, req.body || {}))));
api.delete('/calendar/:id', (req, res) => { UNI.deletePersonalEvent(req.user.id, id(req)); res.json({ ok: true }); });

// ---------- Documentos (RAG) ----------
api.get('/documents', (req, res) => res.json(RAG.listDocuments()));
api.get('/documents/search', (req, res) => res.json(RAG.search(String(req.query.q || ''), { institution: req.query.institution || null, limit: 10 })));
api.post('/documents', requireAdmin, ah(async (req, res) => {
  if (req.body?.url) return res.status(201).json(await RAG.ingestUrl({ ...req.body, userId: req.user.id }));
  const b = pick(req.body, { title: 'string', text: 'string', institution: '?string', kind: '?string', sourceType: '?string', referencePeriod: '?string' });
  res.status(201).json(RAG.addDocument({ ...b, userId: req.user.id }));
}));
api.delete('/documents/:id', requireAdmin, (req, res) => { RAG.deleteDocument(id(req)); res.json({ ok: true }); });

// ---------- Uso da IA (transparência) ----------
api.get('/ai/usage', (req, res) => res.json({
  enabled: aiEnabled(), status: aiStatus(),
  last30: getDb().prepare("SELECT feature, COUNT(*) calls, SUM(input_tokens) input, SUM(output_tokens) output, SUM(ok=0) errors FROM ai_usage WHERE user_id=? AND created_at>=datetime('now','-30 day') GROUP BY feature").all(req.user.id),
}));

