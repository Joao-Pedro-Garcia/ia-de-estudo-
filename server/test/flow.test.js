// Teste de ponta a ponta do fluxo da estudante (sem chave de IA: verifica que nada é simulado).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client } from './helpers.js';

let srv; let c;
before(async () => { srv = await startTestServer(); c = client(srv.base); });
after(async () => { await srv.close(); });

test('autenticação: cadastro, sessão e proteção de rotas', async () => {
  const anon = client(srv.base);
  assert.equal((await anon.get('/dashboard')).status, 401);
  assert.equal((await anon.post('/auth/register', { email: 'x@y', password: '123' })).status, 400);
  const r = await c.post('/auth/register', { email: 'ana@teste.com', password: 'senhaforte1', name: 'Ana' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, 'admin', 'primeira conta é administradora');
  const me = await c.get('/auth/me');
  assert.equal(me.data.user.email, 'ana@teste.com');
  assert.equal(me.data.onboarding_done, false);
  assert.equal(me.data.ai.configured, false);
  const bad = await anon.post('/auth/login', { email: 'ana@teste.com', password: 'errada123' });
  assert.equal(bad.status, 400);
});

test('onboarding: obrigatórias, opcionais e conclusão', async () => {
  const ob = await c.get('/onboarding');
  assert.ok(ob.data.steps.length >= 10);
  assert.ok(ob.data.steps.every((s) => s.why), 'toda pergunta explica o porquê');
  assert.equal((await c.post('/onboarding/complete')).status, 400, 'não conclui sem obrigatórias');
  assert.equal((await c.put('/onboarding/answer', { stepId: 'nome', value: '' })).status, 400);
  const answers = {
    nome: 'Ana', escolaridade: 'Cursando o 3º ano do ensino médio', universidades: ['Medicina UFT — Palmas', 'Medicina UFMA — São Luís'],
    minutos_dia: '2 horas', dias_semana: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'], periodo: 'Tarde', idade: 17,
  };
  for (const [stepId, value] of Object.entries(answers)) {
    const r = await c.put('/onboarding/answer', { stepId, value });
    assert.equal(r.status, 200, `salvar ${stepId}`);
  }
  assert.equal((await c.put('/onboarding/answer', { stepId: 'periodo', value: 'Madrugada' })).status, 400, 'opção inválida');
  assert.equal((await c.put('/onboarding/answer', { stepId: 'cursinho', value: null })).status, 200, 'pular opcional');
  const done = await c.post('/onboarding/complete');
  assert.equal(done.status, 200);
  assert.ok(done.data.onboarding_done_at);
});

test('diagnóstico adaptativo completo gera mapa de aprovação e plano', async () => {
  const s = await c.post('/diagnostic/start');
  assert.equal(s.status, 200);
  let step = (await c.get('/diagnostic/next')).data;
  let guard = 0;
  const levelsSeen = {};
  while (!step.readyToFinish && guard++ < 80) {
    assert.ok(step.question, 'há questão');
    assert.equal(step.question.answer, undefined, 'gabarito não vaza no diagnóstico');
    assert.ok(step.why, 'explica por que está respondendo');
    (levelsSeen[step.discipline] ||= []).push(step.question.difficulty);
    // Estratégia: acerta Biologia com certeza (deve subir de nível), erra Matemática (deve ficar no básico).
    const full = (await c.get(`/questions/${step.question.id}/solution?explicit=1`)).data;
    let chosen = full.answer;
    if (step.discipline === 'matematica') chosen = ['A', 'B', 'C', 'D', 'E'].find((k) => k !== full.answer);
    const conf = step.discipline === 'quimica' ? 'chute' : 'certeza';
    const a = await c.post('/diagnostic/answer', { questionId: step.question.id, chosen, confidence: conf });
    assert.equal(a.status, 200);
    step = (await c.get('/diagnostic/next')).data;
  }
  assert.ok(step.readyToFinish, 'sem IA, discursiva é pulada e o diagnóstico fica pronto');
  // Adaptação: biologia subiu de nível; matemática não.
  assert.ok(Math.max(...levelsSeen.biologia) >= 3, `biologia subiu: ${levelsSeen.biologia}`);
  assert.ok(Math.max(...levelsSeen.matematica) <= 2, `matemática ficou na base: ${levelsSeen.matematica}`);
  const fin = await c.post('/diagnostic/finish');
  assert.equal(fin.status, 200);
  const rep = fin.data.report;
  assert.equal(rep.title, 'SEU MAPA DE APROVAÇÃO — MEDICINA');
  assert.match(rep.disclaimer, /ESTIMATIVA INICIAL/);
  const bio = rep.disciplines.find((d) => d.discipline === 'biologia');
  const mat = rep.disciplines.find((d) => d.discipline === 'matematica');
  const qui = rep.disciplines.find((d) => d.discipline === 'quimica');
  assert.ok(['intermediario', 'avancado'].includes(bio.level.key), `bio ${bio.level.key}`);
  assert.equal(mat.level.key, 'inicial');
  assert.ok(qui.guessed_correct > 0 && qui.correct_sure === 0, 'chute não conta como domínio');
  assert.ok(rep.recurring_difficulties.some((t) => /chute/.test(t)));
  assert.ok(fin.data.plan.generated > 0, 'plano gerado automaticamente');
  const me = await c.get('/auth/me');
  assert.equal(me.data.diagnostic_done, true);
});

test('plano de estudos: respeita dias/tempo, pesos oficiais e é editável', async () => {
  const p = await c.get('/plan?days=14');
  assert.equal(p.status, 200);
  assert.ok(p.data.items.length > 0);
  assert.ok(p.data.weights.sources.length >= 1, 'usa pesos oficiais verificados dos alvos');
  for (const it of p.data.items) assert.notEqual(new Date(it.date + 'T12:00:00Z').getUTCDay(), 0, 'não agenda domingo');
  const byDay = {};
  for (const it of p.data.items) byDay[it.date] = (byDay[it.date] || 0) + it.minutes;
  for (const [d, m] of Object.entries(byDay)) assert.ok(m <= 120, `dia ${d} com ${m} min excede o tempo disponível`);
  assert.equal(p.data.priorities[0].discipline !== undefined, true);
  const item = p.data.items[0];
  const u = await c.patch(`/plan/items/${item.id}`, { status: 'feito' });
  assert.equal(u.data.status, 'feito');
  const add = await c.post('/plan/items', { date: item.date, kind: 'revisao', minutes: 20, discipline: 'biologia' });
  assert.equal(add.status, 201);
  const regen = await c.post('/plan/regenerate', {});
  assert.ok(regen.data.generated > 0);
  const after = await c.get('/plan?days=14');
  assert.ok(after.data.items.some((i) => i.id === item.id && i.status === 'feito'), 'regeneração preserva itens feitos');
  assert.ok(after.data.items.some((i) => i.id === add.data.id), 'regeneração preserva itens da estudante');
});

test('questões: gabarito oculto, erro abre recuperação guiada, memória atualiza', async () => {
  const list = await c.get('/questions?discipline=biologia&topic=genetica');
  assert.ok(list.data.total > 0);
  assert.ok(list.data.items.every((q) => q.answer === undefined && q.origin_label));
  const q = list.data.items[0];
  assert.equal((await c.get(`/questions/${q.id}/solution`)).status, 400, 'sem resposta não mostra resolução');
  const sol = (await c.get(`/questions/${q.id}/solution?explicit=1`)).data;
  const wrong = ['A', 'B', 'C', 'D', 'E'].find((k) => k !== sol.answer);
  const r = await c.post(`/questions/${q.id}/answer`, { chosen: wrong, confidence: 'certeza', timeMs: 60000 });
  assert.equal(r.data.correct, false);
  assert.equal(r.data.answer, undefined, 'não entrega só o gabarito ao errar');
  assert.ok(r.data.errorId && r.data.recovery_available);
  assert.ok(r.data.likely_reason, 'aponta o provável motivo (nota do distrator)');
  // Recuperação: passos 1-4 (sem IA usa o banco), 5 questão semelhante, 6-7 verificação e registro.
  const rec = await c.post(`/errors/${r.data.errorId}/recovery`, { errorType: 'conceito', reasoning: 'achei que era dominante' });
  assert.equal(rec.status, 200);
  assert.ok(rec.data.entry.recovery_steps.identificacao.topic_name);
  assert.ok(rec.data.entry.recovery_steps.reexplicacao.text);
  assert.equal(rec.data.original.answer, sol.answer);
  const sim = await c.post(`/errors/${r.data.errorId}/similar`, {});
  assert.ok(sim.data.question, 'questão semelhante');
  assert.notEqual(sim.data.question.id, q.id);
  assert.equal(sim.data.question.topic, 'genetica');
  const simSol = (await c.get(`/questions/${sim.data.question.id}/solution?explicit=1`)).data;
  const ok = await c.post(`/questions/${sim.data.question.id}/answer`, { chosen: simSol.answer, confidence: 'certeza', context: 'recuperacao', contextId: r.data.errorId });
  assert.equal(ok.data.correct, true);
  const err = await c.get(`/errors/${r.data.errorId}`);
  assert.equal(err.data.entry.status, 'resolvido');
  const mem = await c.get('/memory');
  assert.ok(mem.data.mastery.some((m) => m.discipline === 'biologia' && m.topic === 'genetica' && m.attempts >= 2));
  assert.ok(mem.data.snapshot.notes.some((n) => /Erro conceitual/.test(n.text)));
  const sv = await c.post(`/questions/${q.id}/save`, { save: true });
  assert.equal(sv.data.saved, true);
  assert.ok((await c.get('/questions?saved=1')).data.items.some((x) => x.id === q.id));
  assert.ok((await c.get('/questions?wrong=1')).data.items.some((x) => x.id === q.id));
});

test('simulado: autosave, correção exata, relatório e pesos oficiais', async () => {
  const fm = await c.get('/exams/formats');
  assert.ok(fm.data.find((f) => f.kind === 'EXATO'));
  const e = await c.post('/exams', { kind: 'UFT', size: 4 });
  assert.equal(e.status, 201);
  const exam = e.data;
  assert.equal(exam.questions.length, 16);
  assert.ok(exam.questions.every((q) => q.answer === undefined));
  // Responde metade certo usando o gabarito, metade em branco.
  const answers = {};
  for (const [i, q] of exam.questions.entries()) {
    if (i % 2 === 0) answers[q.id] = (await c.get(`/questions/${q.id}/solution?explicit=1`)).data.answer;
  }
  const save = await c.put(`/exams/${exam.id}/progress`, { answers, flags: [exam.questions[1].id], elapsed_s: 300 });
  assert.equal(save.data.answered, 8);
  const reload = await c.get(`/exams/${exam.id}`);
  assert.deepEqual(reload.data.answers, answers, 'autosave persiste');
  assert.deepEqual(reload.data.flags, [exam.questions[1].id]);
  const fin = await c.post(`/exams/${exam.id}/finish`, {});
  assert.equal(fin.status, 200);
  assert.equal(fin.data.correct, 8);
  assert.equal(fin.data.blank, 8);
  assert.equal(fin.data.pct, 50);
  assert.ok(fin.data.by_discipline.length > 0 && fin.data.by_area.length === 4);
  assert.ok(fin.data.weighted && fin.data.weighted.source_url, 'aproveitamento ponderado com fonte');
  assert.equal((await c.put(`/exams/${exam.id}/progress`, { answers: {} })).status, 400, 'finalizado não aceita alteração');
  const done = await c.get(`/exams/${exam.id}`);
  assert.ok(done.data.questions[0].answer, 'gabarito liberado após finalizar');
});

test('flashcards com repetição espaçada', async () => {
  const r = await c.post('/flashcards', { discipline: 'biologia', topic: 'citologia', front: 'Organela da respiração celular?', back: 'Mitocôndria' });
  assert.equal(r.status, 201);
  const fc = await c.get('/flashcards');
  assert.ok(fc.data.due.length >= 1);
  const id = r.data.ids[0];
  const good = await c.post(`/flashcards/${id}/review`, { grade: 2 });
  assert.ok(good.data.interval_days >= 1);
  const again = await c.post(`/flashcards/${id}/review`, { grade: 0 });
  assert.ok(again.data.interval_days < 0.01 && again.data.lapses === 1);
});

test('modo concentração com limites saudáveis', async () => {
  assert.equal((await c.post('/focus', { minutes: 240 })).status, 400);
  const s = await c.post('/focus', { minutes: 25, discipline: 'quimica', goal: 'estequiometria' });
  assert.equal(s.status, 201);
  const f = await c.post(`/focus/${s.data.id}/finish`, { actualSec: 99999, rating: 4 });
  assert.ok(f.data.minutes <= 1, 'não aceita tempo maior que o decorrido');
  assert.ok(f.data.suggested_break_min > 0);
});

test('central, simulador e calendário: só dados com fonte, sem inventar', async () => {
  const cen = await c.get('/central');
  assert.equal(cen.data.profiles.length, 5);
  for (const f of cen.data.facts) assert.ok(f.source_url || f.value === null, `fato ${f.fact_key} tem fonte`);
  const uft = cen.data.profiles.find((p) => p.id === 'uft-palmas');
  assert.equal(uft.facts.pesos.verified, true);
  assert.equal(uft.facts.corte.verified, false, 'nota de corte de fonte secundária marcada como não verificada');
  const sim = await c.post('/simulator', { scores: { redacao: 900, linguagens: 700, humanas: 680, natureza: 750, matematica: 800 } });
  const r = sim.data.results.find((x) => x.id === 'uft-palmas');
  // (900*3 + 700*3 + 680*2 + 750*4 + 800*2) / 14
  assert.equal(r.weighted_average, Math.round(((900 * 3 + 700 * 3 + 680 * 2 + 750 * 4 + 800 * 2) / 14) * 100) / 100);
  assert.ok(r.reference.warning && r.reference.verified === false);
  assert.ok(!JSON.stringify(sim.data).match(/probabilidade de aprova/i));
  const ufma = sim.data.results.find((x) => x.id === 'ufma-pinheiro');
  assert.equal(ufma.weighted_average, (900 + 700 + 680 + 750 + 800) / 5);
  const low = await c.post('/simulator', { scores: { redacao: 200, linguagens: 700, humanas: 680, natureza: 750, matematica: 800 }, profiles: ['uft-palmas'] });
  assert.ok(low.data.results[0].minimum_issues.length > 0, 'detecta redação abaixo do mínimo');
  const cal = await c.get('/calendar');
  assert.ok(cal.data.some((e) => /Enem 2026/.test(e.title) && e.verified));
  const ev = await c.post('/calendar', { title: 'Meu simulado', date_start: '2026-12-01' });
  assert.equal(ev.status, 201);
});

test('RAG: busca com acentos/sem acentos e citação da fonte', async () => {
  const s = await c.get('/documents/search?q=pesos medicina UFT');
  assert.ok(s.data.length > 0);
  assert.ok(s.data[0].url && s.data[0].fetched_at);
  const add = await c.post('/documents', { title: 'Nota de teste', text: 'O conteúdo programático de Biologia inclui citologia, genética e ecologia. '.repeat(3), institution: 'UFT', sourceType: 'secundaria' });
  assert.equal(add.status, 201);
  const s2 = await c.get('/documents/search?q=genetica');
  assert.ok(s2.data.some((d) => d.title === 'Nota de teste'));
});

test('IA desativada: recursos de IA respondem 503 explicando o que falta (sem respostas simuladas)', async () => {
  const conv = await c.post('/conversations', { discipline: 'biologia' });
  assert.equal(conv.status, 201);
  const res = await fetch(`${srv.base}/conversations/${conv.data.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: (await (async () => '')()) }, body: JSON.stringify({ text: 'oi' }) });
  assert.equal(res.status, 401, 'sem cookie não acessa');
  const lesson = await c.post('/lessons', { discipline: 'biologia', topic: 'citologia' });
  assert.equal(lesson.status, 503);
  assert.match(lesson.data.error, /ANTHROPIC_API_KEY/);
  assert.equal(lesson.data.code, 'AI_NOT_CONFIGURED');
  const essay = await c.post('/essays', { theme: 'Tema', text: 'x'.repeat(200) });
  assert.equal(essay.status, 503);
  const after = await c.get(`/conversations/${conv.data.id}`);
  assert.equal(after.data.messages.length, 0);
});

test('painel consolida dados reais de todos os módulos', async () => {
  const d = await c.get('/dashboard');
  assert.equal(d.status, 200);
  assert.ok(d.data.totals.questions > 40);
  assert.ok(d.data.totals.streak >= 1);
  assert.ok(d.data.disciplines.length >= 11);
  assert.equal(d.data.exams.length, 1);
  assert.ok(d.data.flashcards.total >= 1);
  assert.ok(d.data.week.questions > 0);
  const g = await c.put('/goals', { minutes: 900, questions: 150 });
  assert.equal(g.data.goals.minutes, 900);
});
