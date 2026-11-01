// Banco de questões: carga do acervo, seleção adaptativa, correção, caderno de erros e geração por IA.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { getDb, J, tx } from '../db.js';
import { log } from '../logger.js';
import { bad, notFound } from '../lib/http.js';
import { getDiscipline, getTopic, topicName, isValidTopic } from '../content/curriculum.js';
import { recordOutcome, recommendedDifficulty } from './mastery.js';
import { validateQuestion } from '../../scripts/validate-questions.js';
import { generateJSON, obj, str, int, arr, en } from '../ai/provider.js';
import { addStudySeconds } from './activity.js';

export const ORIGIN_LABEL = {
  oficial: 'Questão oficial',
  adaptada: 'Questão adaptada',
  inedita_ia: 'Questão inédita criada por IA',
};

/** Carrega/atualiza o acervo a partir de data/questions/*.json (idempotente). */
export function seedQuestions(dir = path.join(ROOT, 'data', 'questions')) {
  if (!fs.existsSync(dir)) return 0;
  const db = getDb();
  const ins = db.prepare(`INSERT INTO questions (id, discipline, topic, subtopic, difficulty, type, origin, style_ref, source, statement,
      alternatives, answer, expected_answer, explanation, wrong_notes, concept, skills)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET discipline=excluded.discipline, topic=excluded.topic, subtopic=excluded.subtopic,
      difficulty=excluded.difficulty, type=excluded.type, origin=excluded.origin, style_ref=excluded.style_ref, source=excluded.source,
      statement=excluded.statement, alternatives=excluded.alternatives, answer=excluded.answer, expected_answer=excluded.expected_answer,
      explanation=excluded.explanation, wrong_notes=excluded.wrong_notes, concept=excluded.concept, skills=excluded.skills`);
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let list;
    try { list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { log.error('arquivo de questões inválido', { f, err: e.message }); continue; }
    tx(() => {
      for (const q of list) {
        const errs = validateQuestion(q);
        if (errs.length) { log.warn('questão ignorada', { id: q.id, errs }); continue; }
        ins.run(q.id, q.discipline, q.topic, q.subtopic || null, q.difficulty, q.type, q.origin, q.style_ref || null, J.str(q.source || null),
          q.statement, J.str(q.alternatives || null), q.answer || null, q.expected_answer || null, q.explanation, J.str(q.wrong_notes || {}),
          q.concept || null, J.str(q.skills || []));
        n++;
      }
    });
  }
  return n;
}

function hydrate(r) {
  if (!r) return null;
  return {
    ...r,
    source: J.parse(r.source),
    alternatives: J.parse(r.alternatives, []),
    wrong_notes: J.parse(r.wrong_notes, {}),
    skills: J.parse(r.skills, []),
  };
}

export function getQuestion(id) {
  return hydrate(getDb().prepare('SELECT * FROM questions WHERE id=?').get(id));
}

/** Versão SEM gabarito para mostrar antes da resposta. */
export function publicQuestion(q) {
  if (!q) return null;
  return {
    id: q.id, discipline: q.discipline, discipline_name: getDiscipline(q.discipline)?.name, topic: q.topic, topic_name: topicName(q.discipline, q.topic),
    subtopic: q.subtopic, difficulty: q.difficulty, type: q.type, origin: q.origin, origin_label: ORIGIN_LABEL[q.origin],
    source: q.source, style_ref: q.style_ref, statement: q.statement, alternatives: q.alternatives, skills: q.skills,
  };
}

/** Versão COM gabarito e resolução (após responder ou pedido explícito). */
export function revealedQuestion(q) {
  return { ...publicQuestion(q), answer: q.answer, expected_answer: q.expected_answer, explanation: q.explanation, wrong_notes: q.wrong_notes, concept: q.concept };
}

/** Lista questões com filtros (sem gabarito). */
export function listQuestions(userId, f = {}) {
  const where = ["status='ativa'", '(created_for_user IS NULL OR created_for_user = ?)'];
  const args = [userId];
  if (f.discipline) { where.push('discipline=?'); args.push(f.discipline); }
  if (f.topic) { where.push('topic=?'); args.push(f.topic); }
  if (f.difficulty) { where.push('difficulty=?'); args.push(Number(f.difficulty)); }
  if (f.origin) { where.push('origin=?'); args.push(f.origin); }
  if (f.style) { where.push('style_ref LIKE ?'); args.push(`%${f.style}%`); }
  if (f.year) { where.push("json_extract(source,'$.year') = ?"); args.push(Number(f.year)); }
  if (f.institution) { where.push("json_extract(source,'$.exam') LIKE ?"); args.push(`%${f.institution}%`); }
  if (f.saved) { where.push('id IN (SELECT question_id FROM saved_questions WHERE user_id=?)'); args.push(userId); }
  if (f.wrong) { where.push('id IN (SELECT question_id FROM attempts WHERE user_id=? AND correct=0)'); args.push(userId); }
  if (f.unseen) { where.push('id NOT IN (SELECT question_id FROM attempts WHERE user_id=?)'); args.push(userId); }
  const limit = Math.min(Number(f.limit) || 50, 200);
  const offset = Number(f.offset) || 0;
  const rows = getDb().prepare(`SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY discipline, topic, difficulty, id LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = getDb().prepare(`SELECT COUNT(*) n FROM questions WHERE ${where.join(' AND ')}`).get(...args).n;
  const status = statusMap(userId, rows.map((r) => r.id));
  return { total, items: rows.map((r) => ({ ...publicQuestion(hydrate(r)), ...status[r.id] })) };
}

function statusMap(userId, ids) {
  if (!ids.length) return {};
  const ph = ids.map(() => '?').join(',');
  const out = {};
  for (const r of getDb().prepare(`SELECT question_id, COUNT(*) n, SUM(correct) c, MAX(id) last FROM attempts WHERE user_id=? AND question_id IN (${ph}) GROUP BY question_id`).all(userId, ...ids)) {
    const last = getDb().prepare('SELECT correct FROM attempts WHERE id=?').get(r.last);
    out[r.question_id] = { attempts: r.n, last_correct: !!last?.correct };
  }
  for (const r of getDb().prepare(`SELECT question_id FROM saved_questions WHERE user_id=? AND question_id IN (${ph})`).all(userId, ...ids)) {
    out[r.question_id] = { ...(out[r.question_id] || {}), saved: true };
  }
  return out;
}

/**
 * Escolhe a próxima questão adaptativa: prioriza não vistas, dificuldade recomendada pelo domínio atual.
 */
export function pickAdaptive(userId, { discipline, topic, difficulty, exclude = [] }) {
  const db = getDb();
  const target = difficulty || (topic ? recommendedDifficulty(userId, discipline, topic) : 1);
  const ex = exclude.length ? `AND id NOT IN (${exclude.map(() => '?').join(',')})` : '';
  const base = `SELECT * FROM questions WHERE status='ativa' AND type='multipla_escolha' AND (created_for_user IS NULL OR created_for_user=?)
    AND discipline=? ${topic ? 'AND topic=?' : ''} ${ex}`;
  const args = [userId, discipline, ...(topic ? [topic] : []), ...exclude];
  const seen = `AND id NOT IN (SELECT question_id FROM attempts WHERE user_id=${Number(userId)})`;
  const order = 'ORDER BY ABS(difficulty - ?) , RANDOM() LIMIT 1';
  return hydrate(db.prepare(`${base} ${seen} ${order}`).get(...args, target))
    || hydrate(db.prepare(`${base} ${order}`).get(...args, target));
}

/**
 * Registra a resposta da estudante. Atualiza: tentativas, domínio do tópico, caderno de erros e tempo de estudo.
 * Retorno em caso de ERRO não entrega só o gabarito: identifica o conteúdo, aponta o provável motivo
 * (nota do distrator escolhido) e abre a recuperação guiada.
 */
export function answerQuestion(userId, { questionId, chosen, confidence = 'certeza', timeMs = null, context = 'pratica', contextId = null }) {
  const q = getQuestion(questionId);
  if (!q) throw notFound('Questão não encontrada');
  if (q.type !== 'multipla_escolha') throw bad('Questões discursivas são corrigidas pela IA (use /api/questions/:id/discursive).');
  if (!['A', 'B', 'C', 'D', 'E'].includes(chosen)) throw bad('Alternativa inválida');
  if (!['certeza', 'duvida', 'chute'].includes(confidence)) throw bad('Confiança inválida');
  const correct = chosen === q.answer;
  return tx((db) => {
    const att = db.prepare('INSERT INTO attempts (user_id, question_id, context, context_id, chosen, correct, confidence, time_ms) VALUES (?,?,?,?,?,?,?,?)')
      .run(userId, q.id, context, contextId, chosen, correct ? 1 : 0, confidence, timeMs);
    const mastery = recordOutcome(userId, { discipline: q.discipline, topic: q.topic, difficulty: q.difficulty, correct, confidence });
    if (timeMs) addStudySeconds(userId, Math.min(Math.round(timeMs / 1000), 1800));
    let errorId = null;
    if (!correct && context !== 'diagnostico') {
      const open = db.prepare("SELECT id FROM error_notebook WHERE user_id=? AND question_id=? AND status!='resolvido'").get(userId, q.id);
      if (open) errorId = open.id;
      else {
        errorId = Number(db.prepare('INSERT INTO error_notebook (user_id, question_id, attempt_id, discipline, topic, chosen) VALUES (?,?,?,?,?,?)')
          .run(userId, q.id, att.lastInsertRowid, q.discipline, q.topic, chosen).lastInsertRowid);
      }
    }
    // Acerto de questão de recuperação resolve a entrada do caderno.
    if (correct && context === 'recuperacao' && contextId) {
      const e = db.prepare('SELECT * FROM error_notebook WHERE id=? AND user_id=?').get(contextId, userId);
      if (e) {
        const steps = { ...J.parse(e.recovery_steps, {}), verificacao: { correct: true, confidence, at: new Date().toISOString() } };
        const resolved = confidence !== 'chute';
        db.prepare(`UPDATE error_notebook SET recovery_steps=?, status=?, resolved_at=CASE WHEN ? THEN datetime('now') ELSE resolved_at END WHERE id=?`)
          .run(J.str(steps), resolved ? 'resolvido' : 'em_recuperacao', resolved ? 1 : 0, e.id);
      }
    } else if (!correct && context === 'recuperacao' && contextId) {
      const e = db.prepare('SELECT * FROM error_notebook WHERE id=? AND user_id=?').get(contextId, userId);
      if (e) {
        const steps = { ...J.parse(e.recovery_steps, {}), verificacao: { correct: false, at: new Date().toISOString() } };
        db.prepare("UPDATE error_notebook SET recovery_steps=?, status='em_recuperacao' WHERE id=?").run(J.str(steps), e.id);
      }
    }
    const base = {
      attemptId: Number(att.lastInsertRowid), correct, mastery,
      topic: { discipline: q.discipline, topic: q.topic, topic_name: topicName(q.discipline, q.topic), subtopic: q.subtopic, concept: q.concept },
    };
    if (correct) {
      return { ...base, answer: q.answer, explanation: q.explanation, wrong_notes: q.wrong_notes,
        note: confidence === 'chute' ? 'Você acertou, mas marcou como chute: isso conta pouco como domínio. Vale revisar a resolução.' : null };
    }
    // Em diagnóstico não revelamos (evita contaminar o restante da avaliação).
    if (context === 'diagnostico') return { ...base };
    return {
      ...base,
      errorId,
      likely_reason: q.wrong_notes?.[chosen] || null,
      recovery_available: true,
      message: 'Antes de ver o gabarito, vamos entender o erro: siga a recuperação guiada.',
    };
  });
}

export function toggleSaved(userId, questionId, save) {
  if (!getQuestion(questionId)) throw notFound('Questão não encontrada');
  if (save) getDb().prepare('INSERT OR IGNORE INTO saved_questions (user_id, question_id) VALUES (?,?)').run(userId, questionId);
  else getDb().prepare('DELETE FROM saved_questions WHERE user_id=? AND question_id=?').run(userId, questionId);
  return { saved: !!save };
}

export function bankStats(userId) {
  const db = getDb();
  return {
    byDiscipline: db.prepare(`SELECT discipline, COUNT(*) n, SUM(origin='oficial') oficiais, SUM(origin='adaptada') adaptadas, SUM(origin='inedita_ia') ineditas
      FROM questions WHERE status='ativa' AND (created_for_user IS NULL OR created_for_user=?) GROUP BY discipline`).all(userId),
    total: db.prepare("SELECT COUNT(*) n FROM questions WHERE status='ativa' AND (created_for_user IS NULL OR created_for_user=?)").get(userId).n,
  };
}

// ---------------- Geração de questões inéditas por IA (com verificação independente) ----------------

const GEN_SCHEMA = obj({
  questions: arr(obj({
    subtopic: str(),
    difficulty: int('1 a 4'),
    statement: str('texto-base contextualizado + comando'),
    alternatives: arr(obj({ key: en(['A', 'B', 'C', 'D', 'E']), text: str() })),
    answer: en(['A', 'B', 'C', 'D', 'E']),
    explanation: str('resolução comentada, passo a passo'),
    wrong_notes: obj({ A: str(), B: str(), C: str(), D: str(), E: str() }),
    concept: str(),
    skills: arr(str()),
  })),
});

const SOLVE_SCHEMA = obj({ answer: en(['A', 'B', 'C', 'D', 'E']), confidence: en(['alta', 'media', 'baixa']), ambiguous: { type: 'boolean' }, reason: str() });

/**
 * Gera questões inéditas para a estudante (marcadas como "inédita criada por IA").
 * Controle de qualidade: cada questão é resolvida de novo, às cegas, pela IA; se a resposta divergir
 * do gabarito ou for considerada ambígua, a questão é descartada.
 */
export async function generateQuestions(userId, { discipline, topic, subtopic, difficulty, count = 3, focus, style = 'ENEM' }) {
  const t = getTopic(discipline, topic);
  if (!t) throw bad('Disciplina/tópico inválido');
  count = Math.max(1, Math.min(Number(count) || 3, 5));
  const d = getDiscipline(discipline);
  const prompt = `Crie ${count} questões INÉDITAS de múltipla escolha (A–E) de ${d.name}, tópico "${t.name}"${subtopic ? `, subtópico "${subtopic}"` : ''}.
Dificuldade: ${difficulty ? `nível ${difficulty} (1 básica, 2 intermediária, 3 avançada, 4 muito avançada)` : 'variada entre 2 e 4'}.
Estilo de referência: ${style} (provas de acesso a Medicina em universidades federais: UFT, UFNT, UFMA, via ENEM/SISU).
${focus ? `Foco pedagógico específico (dificuldade observada na estudante): ${focus}\n` : ''}
Exigências:
- Texto-base contextualizado (situação real, experimento, dados em tabela markdown, texto científico, problema de saúde) e interdisciplinar quando natural.
- Exatamente uma alternativa correta; distratores baseados em erros conceituais reais; wrong_notes explica o equívoco de cada distrator (para a correta, escreva "correta").
- Confira todas as contas. Não use imagens. Não cite como oficial nenhuma questão; não copie questões existentes.
- explanation: resolução comentada que ENSINA o conceito, passo a passo.`;
  const out = await generateJSON({
    system: 'Você é uma elaboradora sênior de itens de vestibular de Medicina no Brasil, rigorosa com precisão conceitual e com a matriz do ENEM.',
    content: prompt, schema: GEN_SCHEMA, feature: 'gerar_questoes', userId, effort: 'high',
  });
  const accepted = [];
  for (const g of out.questions || []) {
    const q = {
      id: `ia-${discipline.slice(0, 3)}-${topic}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      discipline, topic, subtopic: g.subtopic || subtopic || null,
      difficulty: Math.max(1, Math.min(4, Number(g.difficulty) || difficulty || 2)),
      type: 'multipla_escolha', origin: 'inedita_ia', style_ref: style,
      statement: g.statement, alternatives: g.alternatives, answer: g.answer, explanation: g.explanation,
      wrong_notes: Object.fromEntries(Object.entries(g.wrong_notes || {}).filter(([k]) => k !== g.answer)),
      concept: g.concept, skills: g.skills || [],
    };
    if (validateQuestion(q).length) continue;
    // Verificação independente (resolução às cegas).
    try {
      const check = await generateJSON({
        system: 'Resolva a questão de vestibular com rigor. Indique se há ambiguidade (mais de uma alternativa defensável ou nenhuma correta).',
        content: `${q.statement}\n\n${q.alternatives.map((a) => `${a.key}) ${a.text}`).join('\n')}`,
        schema: SOLVE_SCHEMA, feature: 'verificar_questao', userId, effort: 'high', maxTokens: 8000,
      });
      if (check.answer !== q.answer || check.ambiguous) {
        log.info('questão gerada descartada na verificação', { expected: q.answer, got: check.answer, ambiguous: check.ambiguous });
        continue;
      }
    } catch (e) {
      log.warn('verificação falhou; questão descartada', { err: e.message });
      continue;
    }
    getDb().prepare(`INSERT INTO questions (id, discipline, topic, subtopic, difficulty, type, origin, style_ref, statement, alternatives, answer,
        explanation, wrong_notes, concept, skills, created_for_user) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(q.id, q.discipline, q.topic, q.subtopic, q.difficulty, q.type, q.origin, q.style_ref, q.statement, J.str(q.alternatives), q.answer,
        q.explanation, J.str(q.wrong_notes), q.concept, J.str(q.skills), userId);
    accepted.push(publicQuestion(getQuestion(q.id)));
  }
  return { requested: count, accepted: accepted.length, discarded: (out.questions || []).length - accepted.length, questions: accepted };
}

export { isValidTopic };
