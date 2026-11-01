import { useState } from 'react';
import { api } from '../lib/api.js';
import { AnswerFeedback, ErrorBox, Loading, Md, QuestionCard, useLoad } from '../components/ui.jsx';

const STATUS = { aberto: ['Aberto', 'bad'], em_recuperacao: ['Em recuperação', 'warn'], resolvido: ['Resolvido', 'good'] };

function Recovery({ id }) {
  const { data, loading, error, reload } = useLoad(() => api.get(`/errors/${id}`), [id]);
  const [reasoning, setReasoning] = useState('');
  const [type, setType] = useState('');
  const [rec, setRec] = useState(null);
  const [sim, setSim] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const types = useLoad(() => api.get('/errors?status=__none'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { entry, question } = data;
  const steps = rec?.entry.recovery_steps || entry.recovery_steps;
  const start = async () => { setBusy(true); setErr(null); try { setRec(await api.post(`/errors/${id}/recovery`, { reasoning, errorType: type || null })); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <div className="stack">
      <a href="#/erros" className="faint">← Caderno de erros</a>
      <div className="row"><h1 style={{ margin: 0 }}>Recuperação guiada</h1><span className={`badge ${STATUS[entry.status][1]}`}>{STATUS[entry.status][0]}</span></div>
      <div className="card"><strong>1. Conteúdo envolvido:</strong> {entry.discipline_name} — {entry.topic_name}{question.subtopic ? ` (${question.subtopic})` : ''}</div>
      <div className="card"><h3>A questão que você errou</h3><Md>{question.statement}</Md>
        <ul>{question.alternatives.map((a) => <li key={a.key} style={{ fontWeight: a.key === entry.chosen ? 700 : 400 }}>{a.key}) {a.text}{a.key === entry.chosen ? ' ← sua resposta' : ''}{question.answer === a.key ? ' ✓ gabarito' : ''}</li>)}</ul></div>
      {!steps.reexplicacao && (
        <div className="card stack"><h3>2. Vamos descobrir o motivo do erro</h3>
          <label className="field">Como você pensou para chegar na alternativa {entry.chosen}? (opcional, ajuda muito)<textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} /></label>
          <div className="row">{Object.entries(types.data?.types || {}).map(([k, t]) => <button key={k} className={`chip ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{t}</button>)}</div>
          <ErrorBox error={err} />
          <button className="btn primary" disabled={busy} onClick={start}>{busy ? 'Analisando…' : 'Analisar meu erro'}</button>
        </div>
      )}
      {steps.reexplicacao && (
        <>
          <div className="card"><h3>2. Provável motivo do erro</h3>
            {steps.motivo?.ai && <Md>{steps.motivo.ai}</Md>}
            {steps.motivo?.distractor_note && <p><strong>Sobre a alternativa {entry.chosen}:</strong> {steps.motivo.distractor_note}</p>}
          </div>
          <div className="card"><h3>3. O conceito, explicado de novo</h3><Md>{steps.reexplicacao.text}</Md></div>
          {steps.exemplo && <div className="card"><h3>4. Outro exemplo</h3><Md>{steps.exemplo.text}</Md></div>}
          {rec?.check_question && <div className="alert"><strong>Pense:</strong> {rec.check_question}</div>}
          <div className="card stack"><h3>5. Questão semelhante</h3>
            {!sim && <button className="btn primary" onClick={async () => { try { setSim(await api.post(`/errors/${id}/similar`)); } catch (x) { setErr(x); } }}>Quero tentar uma semelhante</button>}
            {sim && !sim.question && <div className="alert warn">{sim.message} <a href={`#/questoes?gerar=1`}>Gerar questões</a></div>}
          </div>
          {sim?.question && (
            <>
              <QuestionCard q={sim.question} result={res} onAnswer={async (a) => { const r = await api.post(`/questions/${sim.question.id}/answer`, { ...a, ...sim.answer_context }); setRes(r); reload(); }} />
              {res && (res.correct
                ? <div className="alert good"><strong>6–7. Compreensão verificada e registrada na sua memória acadêmica.</strong> {res.note || 'Erro marcado como resolvido.'}<Md>{res.explanation}</Md></div>
                : <><AnswerFeedback result={res} /><div className="alert warn">Ainda há dúvida — isso é normal. Peça uma <a href={`#/estudar/${entry.discipline}`}>aula personalizada</a> sobre este ponto ou tente outra semelhante.<button className="btn small" style={{ marginLeft: 8 }} onClick={async () => { setRes(null); setSim(await api.post(`/errors/${id}/similar`)); }}>Outra semelhante</button></div></>)}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ErrorsPage({ id }) {
  const [status, setStatus] = useState('');
  const { data, loading, error } = useLoad(() => api.get(`/errors${status ? `?status=${status}` : ''}`), [status, id]);
  if (id) return <Recovery id={id} />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      <div className="topbar"><h1>Caderno inteligente de erros</h1></div>
      <p className="muted">Cada erro passa por: identificar o conteúdo → descobrir o motivo → reexplicar → novo exemplo → questão semelhante → verificar → registrar.</p>
      <div className="grid three">
        <div className="card"><h3>Por situação</h3>{data.stats.byStatus.map((s) => <div key={s.status}>{STATUS[s.status]?.[0]}: <strong>{s.n}</strong></div>)}</div>
        <div className="card"><h3>Tipos de erro</h3>{data.stats.byType.length ? data.stats.byType.map((s) => <div key={s.error_type}>{s.label}: <strong>{s.n}</strong></div>) : <p className="faint">Classificados durante a recuperação.</p>}</div>
        <div className="card"><h3>Assuntos com mais erros</h3>{data.stats.byTopic.slice(0, 5).map((s) => <div key={s.discipline + s.topic}>{s.topic_name}: <strong>{s.n}</strong></div>)}</div>
      </div>
      <div className="row">{[['', 'Todos'], ['aberto', 'Abertos'], ['em_recuperacao', 'Em recuperação'], ['resolvido', 'Resolvidos']].map(([k, t]) => <button key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{t}</button>)}</div>
      {data.items.length ? data.items.map((e) => (
        <a key={e.id} href={`#/erros/${e.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="row between"><strong>{e.discipline_name} — {e.topic_name}</strong><span className={`badge ${STATUS[e.status][1]}`}>{STATUS[e.status][0]}</span></div>
          <div className="faint">{e.question_preview}…</div>
          <div className="faint">{e.created_at.slice(0, 10)}{e.error_type_label ? ` · ${e.error_type_label}` : ''}</div>
        </a>
      )) : <div className="card muted">Nenhum erro aqui. Erros de questões, aulas e simulados aparecem automaticamente.</div>}
    </div>
  );
}
