// Aulas inteligentes: geradas pela IA no nível medido da estudante, com as 8 seções pedidas.
// Exercícios de fixação gerados na aula são verificados; o TESTE DE COMPREENSÃO usa questões do banco
// e registra domínio de verdade. Concluir a aula não marca o assunto como dominado.
import { getDb, J } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { getDiscipline, getTopic, topicName } from '../content/curriculum.js';
import { generateJSON, obj, str, arr, en } from '../ai/provider.js';
import { getMastery, recordLessonDone } from './mastery.js';
import { pickAdaptive, publicQuestion } from './questions.js';
import { snapshotForPrompt } from './memory.js';

const LESSON_SCHEMA = obj({
  title: str(),
  level: en(['básico', 'intermediário', 'avançado']),
  introduction: str('introdução e por que importa para Medicina/vestibular (markdown)'),
  explanation: str('explicação detalhada e progressiva com fundamentação teórica e analogias (markdown, longa)'),
  examples: arr(obj({ problem: str(), solution: str('passo a passo') })),
  exam_points: arr(str('pontos importantes cobrados em vestibulares')),
  common_mistakes: arr(obj({ mistake: str(), correction: str() })),
  exercises: arr(obj({
    statement: str(),
    alternatives: arr(obj({ key: en(['A', 'B', 'C', 'D', 'E']), text: str() })),
    answer: en(['A', 'B', 'C', 'D', 'E']),
    explanation: str(),
  })),
  summary: str('resumo final em tópicos (markdown)'),
  prerequisites: arr(str('pré-requisitos que a estudante deve dominar')),
});

export function lessonTrail(userId, discipline) {
  const d = getDiscipline(discipline);
  if (!d) throw notFound('Disciplina não encontrada');
  const m = Object.fromEntries(getMastery(userId).filter((x) => x.discipline === discipline).map((x) => [x.topic, x]));
  let foundationsOk = true;
  return d.topics.map(([id, name, subtopics], i) => {
    const mm = m[id];
    const level = mm?.level || 'nao_avaliado';
    const item = {
      id, name, subtopics, order: i + 1, level, attempts: mm?.attempts || 0, lessons_done: mm?.lessons_done || 0,
      warning: foundationsOk ? null : 'Tópicos anteriores ainda não têm domínio comprovado. Recomendado reforçar a base antes.',
    };
    if (!(level === 'dominado' || level === 'parcial')) foundationsOk = false;
    return item;
  });
}

function levelFor(userId, discipline, topic) {
  const mm = getMastery(userId).find((x) => x.discipline === discipline && x.topic === topic);
  if (!mm || mm.attempts < 3 || mm.level === 'a_aprender') return 'básico';
  if (mm.level === 'parcial') return 'intermediário';
  return 'avançado';
}

/** Cria e gera uma aula. reason: trilha | sob_demanda | reforco. focus: dificuldade específica. */
export async function createLesson(userId, { discipline, topic, subtopic = null, reason = 'trilha', focus = null }) {
  const t = getTopic(discipline, topic);
  if (!t) throw bad('Disciplina/tópico inválido');
  const d = getDiscipline(discipline);
  const db = getDb();
  const title = `${t.name}${subtopic ? ` — ${subtopic}` : ''}${reason !== 'trilha' ? ' (aula personalizada)' : ''}`;
  const id = Number(db.prepare('INSERT INTO lessons (user_id, discipline, topic, subtopic, title, reason, focus) VALUES (?,?,?,?,?,?,?)')
    .run(userId, discipline, topic, subtopic, title, reason, focus).lastInsertRowid);
  const level = levelFor(userId, discipline, topic);
  const errors = db.prepare(`SELECT q.concept, q.wrong_notes, e.chosen FROM error_notebook e JOIN questions q ON q.id=e.question_id
    WHERE e.user_id=? AND e.discipline=? AND e.topic=? ORDER BY e.id DESC LIMIT 6`).all(userId, discipline, topic)
    .map((e) => `${e.concept || ''} (escolheu ${e.chosen}: ${J.parse(e.wrong_notes, {})[e.chosen] || 'motivo não registrado'})`);
  try {
    const content = await generateJSON({
      system: 'Você é a Professora Aurora, professora de cursinho de Medicina de alto desempenho. Escreve aulas profundas, corretas e progressivas, em português do Brasil, com foco em UFT, UFNT, UFMA, EXATO e ENEM. Não simplifique além do correto.',
      content: `Prepare uma aula de ${d.name}: "${t.name}"${subtopic ? `, subtópico "${subtopic}"` : ` (subtópicos: ${t.subtopics.join(', ')})`}.
Nível da aula: ${level} (medido pelo desempenho da estudante).
Motivo: ${reason === 'trilha' ? 'próximo passo da trilha' : reason === 'reforco' ? 'reforço após erros recorrentes' : 'aula sob demanda pedida pela estudante'}.
${focus ? `FOCO ESPECÍFICO (dificuldade a resolver): ${focus}\n` : ''}${errors.length ? `Erros recentes da estudante neste tópico: ${errors.join(' | ')}\n` : ''}
Memória acadêmica resumida:\n${snapshotForPrompt(userId).slice(0, 2500)}

Estrutura obrigatória: introdução; explicação detalhada (fundamentação teórica, conceitos essenciais, analogias quando úteis, aplicações em saúde/Medicina quando pertinente); 2-3 exemplos resolvidos passo a passo; pontos importantes para vestibulares; erros comuns e correção; 3 exercícios de fixação de múltipla escolha (A–E, uma correta, contas conferidas); resumo final; pré-requisitos.
Se o nível for básico, comece pelos fundamentos; não pule etapas.`,
      schema: LESSON_SCHEMA, feature: 'aula', userId, effort: 'high', maxTokens: 32000,
    });
    db.prepare("UPDATE lessons SET content=?, title=?, status='pronta' WHERE id=?").run(J.str(content), content.title || title, id);
  } catch (e) {
    db.prepare("UPDATE lessons SET status='erro' WHERE id=?").run(id);
    throw e;
  }
  return getLesson(userId, id);
}

export function getLesson(userId, id) {
  const r = getDb().prepare('SELECT * FROM lessons WHERE id=? AND user_id=?').get(id, userId);
  if (!r) throw notFound('Aula não encontrada');
  return { ...r, content: J.parse(r.content), check_result: J.parse(r.check_result), discipline_name: getDiscipline(r.discipline)?.name, topic_name: topicName(r.discipline, r.topic) };
}

export function listLessons(userId, { discipline } = {}) {
  return getDb().prepare(`SELECT id, discipline, topic, subtopic, title, reason, status, created_at, completed_at FROM lessons WHERE user_id=? ${discipline ? 'AND discipline=?' : ''} ORDER BY id DESC LIMIT 100`)
    .all(...[userId, ...(discipline ? [discipline] : [])]).map((r) => ({ ...r, discipline_name: getDiscipline(r.discipline)?.name, topic_name: topicName(r.discipline, r.topic) }));
}

/** Teste de compreensão: questões do banco do tópico (medição real). */
export function comprehensionTest(userId, id, n = 3) {
  const l = getLesson(userId, id);
  const picked = [];
  for (let i = 0; i < n; i++) {
    const q = pickAdaptive(userId, { discipline: l.discipline, topic: l.topic, exclude: picked.map((p) => p.id) });
    if (!q) break;
    picked.push(q);
  }
  return { lesson_id: id, questions: picked.map(publicQuestion), note: picked.length ? null : 'Ainda não há questões no banco para este tópico; gere questões inéditas na aba Questões.' };
}

/** Conclui a aula com o resultado do teste (ids das tentativas). Recomenda reforço quando necessário. */
export function completeLesson(userId, id, { attemptIds = [] }) {
  const l = getLesson(userId, id);
  const ids = attemptIds.filter(Number.isInteger);
  const atts = ids.length ? getDb().prepare(`SELECT correct, confidence FROM attempts WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`).all(userId, ...ids) : [];
  const sure = atts.filter((a) => a.correct && a.confidence !== 'chute').length;
  const result = {
    answered: atts.length, correct_sure: sure,
    understood: atts.length > 0 && sure / atts.length >= 0.67,
    recommendation: null,
  };
  if (!atts.length) result.recommendation = 'Responda o teste de compreensão: só ele mostra se o conteúdo foi aprendido.';
  else if (!result.understood) result.recommendation = 'O teste indica que ainda há dúvidas. Recomendo uma aula personalizada focada nos pontos errados antes de avançar.';
  else result.recommendation = 'Bom sinal! O domínio será confirmado com mais exercícios e revisões espaçadas.';
  getDb().prepare("UPDATE lessons SET status='concluida', completed_at=datetime('now'), check_result=? WHERE id=?").run(J.str(result), id);
  if (l.status !== 'concluida') recordLessonDone(userId, l.discipline, l.topic);
  return result;
}
