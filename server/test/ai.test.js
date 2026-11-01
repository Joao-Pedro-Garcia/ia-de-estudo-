// Testes dos fluxos de IA com um cliente de teste injetado (apenas nos testes).
// Verificam a orquestração real: ferramentas, citações, persistência, validação de JSON e controle de qualidade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client } from './helpers.js';

let srv; let c; let provider; const calls = [];
let script = [];

function fakeClient() {
  return {
    beta: {
      messages: {
        stream(params) {
          calls.push(params);
          const next = script.shift();
          if (!next) throw new Error('sem resposta roteirizada');
          const msg = typeof next === 'function' ? next(params) : next;
          const handlers = {};
          return {
            on(ev, fn) { handlers[ev] = fn; return this; },
            async finalMessage() {
              for (const b of msg.content) if (b.type === 'text' && handlers.text) handlers.text(b.text);
              return { model: 'test', usage: { input_tokens: 10, output_tokens: 5 }, ...msg };
            },
          };
        },
      },
    },
  };
}
const text = (t, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: t }] });
const json = (o) => text(JSON.stringify(o));

before(async () => {
  srv = await startTestServer();
  provider = await import('../src/ai/provider.js');
  provider.__setTestClient(fakeClient());
  c = client(srv.base);
  await c.post('/auth/register', { email: 'bia@teste.com', password: 'senhaforte1', name: 'Bia' });
  for (const [stepId, value] of Object.entries({ nome: 'Bia', escolaridade: 'Já concluí o ensino médio', universidades: ['Medicina UFNT — Araguaína'], minutos_dia: '3 horas', dias_semana: ['Segunda', 'Quarta'], periodo: 'Manhã' })) {
    await c.put('/onboarding/answer', { stepId, value });
  }
  await c.post('/onboarding/complete');
});
after(async () => { provider.__setTestClient(null); await srv.close(); });

test('chat: professora usa ferramenta de documentos oficiais, cita a fonte e persiste o histórico', async () => {
  script = [
    { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Vou verificar nas fontes oficiais.' }, { type: 'tool_use', id: 't1', name: 'buscar_documentos_oficiais', input: { consulta: 'pesos medicina UFNT', instituicao: 'UFNT' } }] },
    (params) => {
      const last = params.messages[params.messages.length - 1];
      assert.equal(last.content[0].type, 'tool_result');
      assert.match(last.content[0].content, /ufnt|UFNT/);
      return text('Na UFNT (SISU 2026) o peso de Natureza é 4. Fonte: termo de adesão.');
    },
  ];
  const conv = (await c.post('/conversations', { discipline: 'biologia' })).data;
  const res = await c.stream(`/conversations/${conv.id}/messages`, { text: 'Quais os pesos da UFNT?', mode: 'auto' });
  assert.match(res, /event: delta/);
  assert.match(res, /event: tool/);
  assert.match(res, /event: done/);
  const sys = calls[calls.length - 1].system;
  assert.match(sys, /Professora Aurora/);
  assert.match(sys, /MEMÓRIA ACADÊMICA/);
  assert.match(sys, /Medicina UFNT — Araguaína/, 'memória inclui objetivos da estudante');
  const tools = calls[calls.length - 1].tools.map((t) => t.name);
  assert.ok(tools.includes('buscar_documentos_oficiais') && tools.includes('web_search'));
  const full = (await c.get(`/conversations/${conv.id}`)).data;
  assert.equal(full.messages.length, 2);
  assert.equal(full.messages[0].role, 'user');
  assert.match(full.messages[1].content, /peso de Natureza é 4/);
  assert.ok(full.messages[1].meta.citations.length > 0, 'citação da fonte registrada');
  assert.ok(full.messages[1].meta.tools.includes('buscar_documentos_oficiais'));
  // Continuação: histórico enviado na próxima mensagem (só texto, append-only).
  script = [text('Continuando...')];
  await c.stream(`/conversations/${conv.id}/messages`, { text: 'E a UFT?' });
  const msgs = calls[calls.length - 1].messages;
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].content, 'Quais os pesos da UFNT?');
  assert.ok(!JSON.stringify(msgs).includes('thinking'));
});

test('chat: professora registra resposta de questão do banco na memória acadêmica', async () => {
  let qid;
  script = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'buscar_questao_do_banco', input: { disciplina: 'quimica', topico: 'estequiometria' } }] },
    (params) => {
      const r = JSON.parse(params.messages[params.messages.length - 1].content[0].content);
      qid = r.id;
      assert.ok(r.answer, 'a professora recebe o gabarito para corrigir');
      return text('Resolva esta questão...');
    },
  ];
  const conv = (await c.post('/conversations', { discipline: 'quimica' })).data;
  await c.stream(`/conversations/${conv.id}/messages`, { text: 'Me passe uma questão' });
  script = [
    (params) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't3', name: 'registrar_resposta', input: { questao_id: qid, alternativa: 'A', confianca: 'duvida' } }] }),
    text('Corrigido.'),
  ];
  await c.stream(`/conversations/${conv.id}/messages`, { text: 'Acho que é A' });
  const mem = (await c.get('/memory')).data;
  assert.ok(mem.mastery.some((m) => m.discipline === 'quimica' && m.topic === 'estequiometria' && m.attempts === 1));
});

test('chat: falha da IA não perde dados nem grava resposta falsa', async () => {
  script = [];
  const conv = (await c.post('/conversations', {})).data;
  const out = await c.stream(`/conversations/${conv.id}/messages`, { text: 'teste' });
  assert.match(out, /event: error/);
  const full = (await c.get(`/conversations/${conv.id}`)).data;
  assert.equal(full.messages.length, 0, 'mensagem removida para reenvio; nenhuma resposta inventada');
});

test('aula: gera as 8 seções, teste de compreensão mede domínio de verdade', async () => {
  script = [json({
    title: 'Citologia: membrana plasmática', level: 'básico', introduction: 'Intro', explanation: 'Explicação longa',
    examples: [{ problem: 'P', solution: 'S' }], exam_points: ['ponto'], common_mistakes: [{ mistake: 'm', correction: 'c' }],
    exercises: [{ statement: 'E', alternatives: ['A', 'B', 'C', 'D', 'E'].map((k) => ({ key: k, text: `alt ${k}` })), answer: 'B', explanation: 'x' }],
    summary: 'Resumo', prerequisites: ['química da água'],
  })];
  const l = await c.post('/lessons', { discipline: 'biologia', topic: 'citologia' });
  assert.equal(l.status, 201);
  assert.equal(l.data.status, 'pronta');
  for (const k of ['introduction', 'explanation', 'examples', 'exam_points', 'common_mistakes', 'exercises', 'summary']) assert.ok(l.data.content[k], k);
  const t = await c.get(`/lessons/${l.data.id}/test`);
  assert.ok(t.data.questions.length >= 1);
  const attemptIds = [];
  for (const q of t.data.questions) {
    const wrong = 'A';
    const r = await c.post(`/questions/${q.id}/answer`, { chosen: wrong, confidence: 'certeza', context: 'aula', contextId: l.data.id });
    attemptIds.push(r.data.attemptId);
  }
  const done = await c.post(`/lessons/${l.data.id}/complete`, { attemptIds });
  assert.equal(done.status, 200);
  const trail = (await c.get('/lessons/trail/biologia')).data;
  const cito = trail.find((x) => x.id === 'citologia');
  assert.equal(cito.lessons_done, 1);
  assert.notEqual(cito.level, 'dominado', 'assistir aula não é domínio');
  const conv = await c.post(`/lessons/${l.data.id}/conversation`, {});
  assert.equal(conv.data.mode, 'aula');
});

test('questões inéditas por IA: verificação às cegas descarta gabarito divergente', async () => {
  const mk = (ans) => ({ subtopic: 'mitose', difficulty: 2, statement: `Enunciado ${ans}`, alternatives: ['A', 'B', 'C', 'D', 'E'].map((k) => ({ key: k, text: `op ${k} ${ans}` })),
    answer: ans, explanation: 'exp', wrong_notes: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' }, concept: 'c', skills: ['s'] });
  script = [
    json({ questions: [mk('C'), mk('D')] }),
    json({ answer: 'C', confidence: 'alta', ambiguous: false, reason: 'ok' }),
    json({ answer: 'A', confidence: 'alta', ambiguous: false, reason: 'diverge' }),
  ];
  const r = await c.post('/questions/generate', { discipline: 'biologia', topic: 'citologia', count: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.data.accepted, 1);
  assert.equal(r.data.discarded, 1);
  assert.equal(r.data.questions[0].origin, 'inedita_ia');
  assert.equal(r.data.questions[0].origin_label, 'Questão inédita criada por IA');
  // Só a dona vê a questão gerada para ela.
  const other = client(srv.base);
  await other.post('/auth/register', { email: 'outra@teste.com', password: 'senhaforte1' });
  assert.equal((await other.get(`/questions/${r.data.questions[0].id}`)).status, 400);
});

test('redação: 5 competências, faixa de incerteza, aviso de estimativa e evolução', async () => {
  const comp = (s) => ({ score: String(s), low: String(Math.max(0, s - 40)), high: String(Math.min(200, s + 40)), justification: 'j', problems: [{ excerpt: 'trecho', issue: 'i', suggestion: 's' }], how_to_improve: 'h' });
  const ev = { on_topic: 'sim', zero_risk: 'nenhum', thesis: 't', structure: 's', repertoire: 'r', c1: comp(160), c2: comp(120), c3: comp(120), c4: comp(160), c5: comp(80),
    strengths: ['x'], priorities: ['y'], rewritten_paragraph: 'p', evolution_comment: 'primeira redação', repertoire_cards: [{ front: 'f', back: 'b' }] };
  script = [json(ev)];
  const r = await c.post('/essays', { theme: 'Desafios da saúde no interior', text: 'Parágrafo. '.repeat(40) });
  assert.equal(r.status, 201);
  assert.equal(r.data.total_estimate, 640);
  assert.equal(r.data.evaluation.total_low, 440);
  assert.equal(r.data.evaluation.total_high, 840);
  assert.match(r.data.evaluation.disclaimer, /banca/);
  const list = (await c.get('/essays')).data;
  assert.equal(list.evolution.length, 1);
  assert.deepEqual(list.evolution[0].c, [160, 120, 120, 160, 80]);
  const fc = (await c.get('/flashcards')).data;
  assert.ok(fc.all.some((x) => x.discipline === 'redacao'), 'repertórios viram flashcards');
});

test('JSON inválido da IA vira erro tratado (sem conteúdo falso)', async () => {
  script = [text('isto não é json')];
  const r = await c.post('/flashcards/generate', { discipline: 'biologia', topic: 'genetica' });
  assert.equal(r.status, 502);
  assert.equal(r.data.code, 'AI_BAD_JSON');
});
