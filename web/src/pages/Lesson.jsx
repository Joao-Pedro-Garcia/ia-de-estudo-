import { useState } from 'react';
import { api } from '../lib/api.js';
import { go } from '../lib/router.js';
import { AnswerFeedback, ErrorBox, Loading, Md, QuestionCard, useLoad } from '../components/ui.jsx';

function Exercise({ ex, i }) {
  const [c, setC] = useState(null);
  return (
    <div className="card">
      <strong>Exercício de fixação {i + 1}</strong> <span className="badge brand">inédito, criado por IA</span>
      <Md>{ex.statement}</Md>
      <div className="alts">{ex.alternatives.map((a) => (
        <button key={a.key} className={`alt ${c === a.key ? (a.key === ex.answer ? 'right' : 'wrong') : ''} ${c && a.key === ex.answer ? 'right' : ''}`} disabled={!!c} onClick={() => setC(a.key)}>
          <span className="k">{a.key}</span><span>{a.text}</span></button>))}
      </div>
      {c && <div className={`alert ${c === ex.answer ? 'good' : 'bad'}`}><strong>{c === ex.answer ? 'Correto.' : `Gabarito: ${ex.answer}.`}</strong> <Md>{ex.explanation}</Md></div>}
    </div>
  );
}

export default function Lesson({ id }) {
  const { data: l, error, loading } = useLoad(() => api.get(`/lessons/${id}`), [id]);
  const [test, setTest] = useState(null);
  const [results, setResults] = useState({});
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const c = l.content;
  if (!c) return <div className="card">Esta aula não foi gerada ({l.status}). <a href={`#/estudar/${l.discipline}`}>Voltar</a></div>;
  const ask = async () => { try { const conv = await api.post(`/lessons/${id}/conversation`); go(`/professora/${conv.id}`); } catch (x) { setErr(x); } };
  return (
    <div className="stack">
      <div><a href={`#/estudar/${l.discipline}`} className="faint">← {l.discipline_name}</a><h1>{c.title}</h1>
        <div className="row"><span className="badge">{l.topic_name}</span><span className="badge brand">nível {c.level}</span>{l.reason !== 'trilha' && <span className="badge info">aula personalizada</span>}</div></div>
      <div className="alert row between"><span>Dúvida em qualquer momento? Pergunte à professora — ela conhece esta aula.</span><button className="btn small primary" onClick={ask}>Perguntar sobre a aula</button></div>
      <ErrorBox error={err} />
      {c.prerequisites?.length > 0 && <div className="faint">Pré-requisitos: {c.prerequisites.join(' · ')}</div>}
      <div className="card"><h2>1. Introdução</h2><Md>{c.introduction}</Md></div>
      <div className="card"><h2>2. Explicação</h2><Md>{c.explanation}</Md></div>
      <div className="card"><h2>3. Exemplos resolvidos</h2>{c.examples.map((e, i) => (
        <div key={i} style={{ marginBottom: 12 }}><strong>Exemplo {i + 1}</strong><Md>{e.problem}</Md><details><summary>Ver resolução</summary><Md>{e.solution}</Md></details></div>))}</div>
      <div className="card"><h2>4. O que mais cai no vestibular</h2><ul>{c.exam_points.map((p, i) => <li key={i}><Md>{p}</Md></li>)}</ul></div>
      <div className="card"><h2>5. Erros comuns</h2>{c.common_mistakes.map((m, i) => <p key={i}><strong>✗ {m.mistake}</strong><br />✓ {m.correction}</p>)}</div>
      <h2>6. Exercícios de fixação</h2>
      {c.exercises.map((ex, i) => <Exercise key={i} ex={ex} i={i} />)}
      <div className="card stack"><h2>7. Teste de compreensão</h2>
        <p className="muted" style={{ margin: 0 }}>Questões do banco no seu nível. <strong>Só este teste conta para o seu domínio</strong> — concluir a aula não marca o assunto como dominado.</p>
        {!test && <button className="btn primary" onClick={async () => { try { setTest(await api.get(`/lessons/${id}/test`)); } catch (x) { setErr(x); } }}>Começar o teste</button>}
        {test?.note && <div className="alert warn">{test.note}</div>}
      </div>
      {test?.questions.map((q) => (
        <div key={q.id} className="stack">
          <QuestionCard q={q} result={results[q.id]} onAnswer={async (a) => { const r = await api.post(`/questions/${q.id}/answer`, { ...a, context: 'aula', contextId: id }); setResults((s) => ({ ...s, [q.id]: r })); }} />
          {results[q.id] && <AnswerFeedback result={results[q.id]} onRecover={results[q.id].errorId ? () => go(`/erros/${results[q.id].errorId}`) : null} />}
        </div>
      ))}
      <div className="card"><h2>8. Resumo final</h2><Md>{c.summary}</Md></div>
      {done ? (
        <div className={`alert ${done.understood ? 'good' : 'warn'}`}><strong>{done.correct_sure}/{done.answered} acertos seguros.</strong> {done.recommendation}
          {!done.understood && done.answered > 0 && <div style={{ marginTop: 8 }}><a className="btn small primary" href={`#/estudar/${l.discipline}`}>Pedir aula de reforço</a></div>}</div>
      ) : (
        <button className="btn primary" onClick={async () => { try { setDone(await api.post(`/lessons/${id}/complete`, { attemptIds: Object.values(results).map((r) => r.attemptId) })); } catch (x) { setErr(x); } }}>Concluir aula</button>
      )}
    </div>
  );
}
