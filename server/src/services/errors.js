// Caderno inteligente de erros + Recuperação guiada.
// Processo (pedido pela estudante): 1) identificar o conteúdo; 2) descobrir o provável motivo do erro;
// 3) reexplicar o conceito; 4) outro exemplo; 5) questão semelhante; 6) verificar compreensão; 7) registrar.
// Funciona com o banco (notas dos distratores + resolução + questão semelhante) e é enriquecido pela IA.
import { getDb, J } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { getDiscipline, topicName } from '../content/curriculum.js';
import { getQuestion, publicQuestion, revealedQuestion, pickAdaptive } from './questions.js';
import { aiEnabled, generateJSON, obj, str, en } from '../ai/provider.js';
import { addNote } from './memory.js';

export const ERROR_TYPES = {
  conceito: 'Não sabia/confundi o conceito',
  calculo: 'Errei a conta',
  interpretacao: 'Interpretei mal o enunciado',
  atencao: 'Falta de atenção',
  tempo: 'Pressa / falta de tempo',
  chute: 'Chutei',
};

function hydrate(e) {
  return {
    ...e, recovery_steps: J.parse(e.recovery_steps, {}), analysis: J.parse(e.analysis),
    discipline_name: getDiscipline(e.discipline)?.name, topic_name: topicName(e.discipline, e.topic), error_type_label: ERROR_TYPES[e.error_type] || null,
  };
}

export function listErrors(userId, { status, discipline } = {}) {
  const where = ['user_id=?']; const args = [userId];
  if (status) { where.push('status=?'); args.push(status); }
  if (discipline) { where.push('discipline=?'); args.push(discipline); }
  return getDb().prepare(`SELECT * FROM error_notebook WHERE ${where.join(' AND ')} ORDER BY CASE status WHEN 'aberto' THEN 0 WHEN 'em_recuperacao' THEN 1 ELSE 2 END, id DESC LIMIT 200`)
    .all(...args).map((e) => {
      const q = getQuestion(e.question_id);
      return { ...hydrate(e), question_preview: q?.statement.slice(0, 180), concept: q?.concept };
    });
}

export function errorStats(userId) {
  const db = getDb();
  return {
    byStatus: db.prepare('SELECT status, COUNT(*) n FROM error_notebook WHERE user_id=? GROUP BY status').all(userId),
    byType: db.prepare('SELECT error_type, COUNT(*) n FROM error_notebook WHERE user_id=? AND error_type IS NOT NULL GROUP BY error_type').all(userId)
      .map((r) => ({ ...r, label: ERROR_TYPES[r.error_type] })),
    byTopic: db.prepare('SELECT discipline, topic, COUNT(*) n FROM error_notebook WHERE user_id=? GROUP BY discipline, topic ORDER BY n DESC LIMIT 10').all(userId)
      .map((r) => ({ ...r, topic_name: topicName(r.discipline, r.topic), discipline_name: getDiscipline(r.discipline)?.name })),
  };
}

function getEntry(userId, id) {
  const e = getDb().prepare('SELECT * FROM error_notebook WHERE id=? AND user_id=?').get(id, userId);
  if (!e) throw notFound('Erro não encontrado no caderno');
  return e;
}

const ANALYSIS_SCHEMA = obj({
  probable_cause: str('provável motivo do erro, considerando a alternativa escolhida e o relato da estudante'),
  cause_type: en(Object.keys(ERROR_TYPES)),
  reexplanation: str('reexplicação do conceito por outro caminho (markdown)'),
  new_example: str('novo exemplo resolvido, diferente da questão original (markdown)'),
  check_question: str('pergunta curta de verificação para ela responder mentalmente'),
});

/**
 * Passos 1–4: diagnóstico do erro + reexplicação + novo exemplo. Revela o gabarito e a resolução da questão original.
 * studentReasoning: como ela pensou (opcional, melhora o diagnóstico). errorType: autoavaliação (opcional).
 */
export async function startRecovery(userId, id, { studentReasoning = '', errorType = null } = {}) {
  const e = getEntry(userId, id);
  if (errorType && !ERROR_TYPES[errorType]) throw bad('Tipo de erro inválido');
  const q = getQuestion(e.question_id);
  const steps = J.parse(e.recovery_steps, {});
  steps.identificacao = { discipline: q.discipline, topic: q.topic, topic_name: topicName(q.discipline, q.topic), subtopic: q.subtopic, concept: q.concept };
  const distractorNote = q.wrong_notes?.[e.chosen] || null;
  let analysis = null;
  if (aiEnabled()) {
    analysis = await generateJSON({
      system: 'Você é a Professora Aurora. Faça um diagnóstico preciso do erro de uma estudante de pré-Medicina e ensine de novo, por outro caminho. Seja específica, gentil e rigorosa.',
      content: `Questão (${q.origin}):\n${q.statement}\n${q.alternatives.map((a) => `${a.key}) ${a.text}`).join('\n')}\nGabarito: ${q.answer}\nResolução: ${q.explanation}
Ela escolheu: ${e.chosen}. Nota sobre esse distrator: ${distractorNote || 'não há'}.
${studentReasoning ? `Como ela explicou o raciocínio: """${studentReasoning.slice(0, 1500)}"""` : 'Ela não descreveu o raciocínio.'}
${errorType ? `Autoavaliação dela: ${ERROR_TYPES[errorType]}.` : ''}`,
      schema: ANALYSIS_SCHEMA, feature: 'recuperacao_erro', userId, effort: 'medium', maxTokens: 10000,
    });
  }
  steps.motivo = { distractor_note: distractorNote, self_report: errorType, reasoning: studentReasoning || null, ai: analysis?.probable_cause || null };
  steps.reexplicacao = { source: analysis ? 'ia' : 'banco', text: analysis?.reexplanation || q.explanation };
  steps.exemplo = analysis?.new_example ? { text: analysis.new_example } : null;
  const type = errorType || analysis?.cause_type || null;
  getDb().prepare("UPDATE error_notebook SET recovery_steps=?, analysis=?, error_type=COALESCE(?, error_type), student_note=COALESCE(?, student_note), status='em_recuperacao' WHERE id=?")
    .run(J.str(steps), J.str(analysis), type, studentReasoning || null, id);
  if (type === 'conceito' || analysis?.cause_type === 'conceito') {
    addNote(userId, { kind: 'dificuldade', discipline: q.discipline, topic: q.topic, text: `Erro conceitual em ${topicName(q.discipline, q.topic)}: ${q.concept || ''}`.trim(), source: 'caderno_de_erros' });
  }
  return { entry: hydrate(getEntry(userId, id)), original: revealedQuestion(q), analysis, check_question: analysis?.check_question || null };
}

/** Passo 5: questão semelhante (mesmo tópico, preferencialmente mesmo subtópico, não vista). */
export function similarQuestion(userId, id) {
  const e = getEntry(userId, id);
  const q = getQuestion(e.question_id);
  const tried = J.parse(e.recovery_steps, {}).tried || [];
  const exclude = [q.id, ...tried];
  let sim = null;
  if (q.subtopic) {
    const row = getDb().prepare(`SELECT id FROM questions WHERE status='ativa' AND type='multipla_escolha' AND discipline=? AND topic=? AND subtopic=? AND (created_for_user IS NULL OR created_for_user=?)
      AND id NOT IN (${exclude.map(() => '?').join(',')}) ORDER BY ABS(difficulty-?), RANDOM() LIMIT 1`).get(q.discipline, q.topic, q.subtopic, userId, ...exclude, q.difficulty);
    if (row) sim = getQuestion(row.id);
  }
  if (!sim) sim = pickAdaptive(userId, { discipline: q.discipline, topic: q.topic, difficulty: q.difficulty, exclude });
  if (!sim) return { question: null, message: 'Não há outra questão deste tópico no banco ainda. Use "Gerar questões inéditas" para criar uma semelhante.' };
  const steps = J.parse(e.recovery_steps, {});
  steps.tried = [...tried, sim.id];
  steps.semelhante = { question_id: sim.id };
  getDb().prepare('UPDATE error_notebook SET recovery_steps=?, recovery_question_id=? WHERE id=?').run(J.str(steps), sim.id, id);
  // Passos 6–7: a resposta vai por /api/questions/:id/answer com context=recuperacao e contextId=id do erro.
  return { question: publicQuestion(sim), answer_context: { context: 'recuperacao', contextId: id } };
}

export function getError(userId, id) {
  const e = hydrate(getEntry(userId, id));
  const q = getQuestion(e.question_id);
  // A resolução só aparece depois de iniciar a recuperação.
  return { entry: e, question: e.recovery_steps.reexplicacao ? revealedQuestion(q) : { ...publicQuestion(q), chosen: e.chosen } };
}
