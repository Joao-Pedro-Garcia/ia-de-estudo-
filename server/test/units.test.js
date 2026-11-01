// Testes de unidade das regras pedagógicas centrais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setDb, getDb, addDays, today } from '../src/db.js';
import { classify, recordOutcome, thetaToDifficulty, getMastery } from '../src/services/mastery.js';
import { schedule } from '../src/services/flashcards.js';
import { chunkText } from '../src/services/rag.js';

setDb(openDb(':memory:'));
getDb().prepare("INSERT INTO users (id, email, password_hash, name) VALUES (1,'u@t.com','x','U')").run();

test('acertos por chute nunca levam a "dominado"', () => {
  for (let i = 0; i < 12; i++) recordOutcome(1, { discipline: 'biologia', topic: 'genetica', difficulty: 3, correct: true, confidence: 'chute' });
  const m = getMastery(1).find((x) => x.topic === 'genetica');
  assert.notEqual(m.level, 'dominado');
  assert.equal(m.guessed_correct, 12);
});

test('domínio exige evidência: tentativas mínimas e acertos seguros recentes', () => {
  assert.equal(classify({ theta: 2, attempts: 2, recent: [{ c: 1, f: 'certeza' }, { c: 1, f: 'certeza' }] }), 'nao_avaliado');
  const sure = Array.from({ length: 6 }, () => ({ c: 1, f: 'certeza' }));
  assert.equal(classify({ theta: 1.2, attempts: 6, recent: sure }), 'dominado');
  const mixed = [...sure.slice(0, 3), { c: 0 }, { c: 0 }, { c: 1, f: 'certeza' }];
  assert.equal(classify({ theta: 1.2, attempts: 6, recent: mixed }), 'parcial');
  for (let i = 0; i < 8; i++) recordOutcome(1, { discipline: 'quimica', topic: 'solucoes', difficulty: 4, correct: true, confidence: 'certeza' });
  assert.equal(getMastery(1).find((x) => x.topic === 'solucoes').level, 'dominado');
});

test('erro antecipa a revisão; dificuldade recomendada acompanha a habilidade', () => {
  recordOutcome(1, { discipline: 'quimica', topic: 'solucoes', difficulty: 2, correct: false });
  const m = getMastery(1).find((x) => x.topic === 'solucoes');
  assert.ok(new Date(m.next_review_at) - Date.now() <= 86400000 + 5000, 'revisão em até 1 dia após erro');
  assert.equal(thetaToDifficulty(-2), 1);
  assert.ok(thetaToDifficulty(2.5) >= 3);
});

test('repetição espaçada (SM-2): intervalos crescem, erro reinicia', () => {
  let c = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
  c = { ...c, ...schedule(c, 2) }; assert.equal(c.interval_days, 1);
  c = { ...c, ...schedule(c, 2) }; assert.equal(c.interval_days, 6);
  c = { ...c, ...schedule(c, 2) }; assert.equal(c.interval_days, 15);
  c = { ...c, ...schedule(c, 0) }; assert.ok(c.interval_days < 0.01); assert.equal(c.lapses, 1); assert.ok(c.ease < 2.5);
});

test('plano: reta final antes da prova prioriza simulados/revisões e não agenda depois da prova', async () => {
  const { generatePlan, getPlan } = await import('../src/services/planner.js');
  const exam = addDays(today(), 5);
  getDb().prepare('INSERT INTO profiles (user_id, answers) VALUES (1, ?)').run(JSON.stringify({
    minutos_dia: '3 horas', dias_semana: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'], periodo: 'Manhã', data_prova: exam, universidades: ['Medicina UFT — Palmas'],
  }));
  generatePlan(1, { days: 14 });
  const items = getPlan(1, today(), 14);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.date <= exam), 'nada depois da prova');
  assert.ok(!items.some((i) => i.kind === 'aula' && i.reason.startsWith('Próximo tópico')), 'reta final não abre conteúdo novo');
  const perDay = {};
  for (const i of items) perDay[i.date] = (perDay[i.date] || 0) + i.minutes;
  assert.ok(Object.values(perDay).every((m) => m <= 180));
});

test('RAG: divisão em trechos com sobreposição', () => {
  const t = 'Frase de teste sobre o edital. '.repeat(200);
  const ch = chunkText(t);
  assert.ok(ch.length > 3);
  assert.ok(ch.every((c) => c.length <= 1300));
});
