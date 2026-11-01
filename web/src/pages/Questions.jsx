import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { go } from '../lib/router.js';
import { AnswerFeedback, ErrorBox, levelName, Loading, Md, OriginBadge, QuestionCard, useCurriculum, useLoad } from '../components/ui.jsx';

function Practice({ discipline, topic, difficulty, timed }) {
  const [q, setQ] = useState(null);
  const [res, setRes] = useState(null);
  const [seen, setSeen] = useState([]);
  const [err, setErr] = useState(null);
  const [sol, setSol] = useState(null);
  const [left, setLeft] = useState(null);
  const timer = useRef(null);
  const load = async () => {
    setRes(null); setSol(null); setErr(null);
    try {
      const r = await api.get(`/questions/next?discipline=${discipline}${topic ? `&topic=${topic}` : ''}${difficulty ? `&difficulty=${difficulty}` : ''}&exclude=${seen.join(',')}`);
      setQ(r.question); if (r.question) setSeen((s) => [...s, r.question.id]);
      if (timed) setLeft(180);
    } catch (x) { setErr(x); }
  };
  useEffect(() => { setSeen([]); load(); /* eslint-disable-next-line */ }, [discipline, topic, difficulty]);
  useEffect(() => {
    clearInterval(timer.current);
    if (timed && q && !res) timer.current = setInterval(() => setLeft((l) => (l > 0 ? l - 1 : 0)), 1000);
    return () => clearInterval(timer.current);
  }, [q?.id, res, timed]);
  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!q) return <div className="card">Não há mais questões com estes filtros. <button className="btn small" onClick={() => go('/questoes?gerar=1')}>Gerar questões inéditas</button></div>;
  return (
    <div className="stack">
      {timed && !res && <div className={`alert ${left === 0 ? 'bad' : ''}`}>⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} {left === 0 && '— tempo esgotado (média ENEM ≈ 3 min por questão). Responda mesmo assim.'}</div>}
      <QuestionCard q={q} result={res} disabled={!!sol} onAnswer={async (a) => setRes(await api.post(`/questions/${q.id}/answer`, { ...a, context: timed ? 'cronometrada' : 'pratica' }))}
        footer={<>
          <button className="btn ghost" onClick={async () => setSol(await api.get(`/questions/${q.id}/solution?explicit=1`))}>Quero ver a explicação</button>
          <button className="btn ghost" onClick={() => api.post(`/questions/${q.id}/save`, { save: true })}>☆ Salvar</button>
        </>} />
      {sol && !res && <div className="card"><div className="alert warn">Você pediu a explicação antes de responder: esta questão fica sem registro de resposta (não conta como domínio). Ela voltará em outra ocasião.</div><p><strong>Gabarito: {sol.answer}</strong></p><Md>{sol.explanation}</Md><button className="btn" onClick={load}>Próxima</button></div>}
      <AnswerFeedback result={res} onRecover={res?.errorId ? () => go(`/erros/${res.errorId}`) : null} onNext={load} />
    </div>
  );
}

function Generate({ curr }) {
  const [f, setF] = useState({ discipline: 'biologia', topic: 'genetica', difficulty: 3, count: 3, focus: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [out, setOut] = useState(null);
  const d = curr.find((x) => x.id === f.discipline);
  return (
    <div className="card stack">
      <h3>Gerar questões inéditas com IA</h3>
      <p className="faint" style={{ margin: 0 }}>Cada questão é resolvida novamente, às cegas, pela IA; se o gabarito não bater ou houver ambiguidade, ela é descartada. As aprovadas entram no seu banco marcadas como "inédita criada por IA".</p>
      <div className="grid two">
        <select value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value, topic: curr.find((x) => x.id === e.target.value).topics[0].id })}>{curr.filter((x) => x.id !== 'redacao').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{d?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{levelName(n)}</option>)}</select>
        <select value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} questão(ões)</option>)}</select>
      </div>
      <input type="text" placeholder="Foco opcional (ex.: heredogramas com herança ligada ao X)" value={f.focus} onChange={(e) => setF({ ...f, focus: e.target.value })} />
      <ErrorBox error={err} />
      <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { setOut(await api.post('/questions/generate', { ...f, focus: f.focus || undefined })); } catch (x) { setErr(x); } finally { setBusy(false); } }}>{busy ? 'Gerando e verificando…' : 'Gerar'}</button>
      {out && <div className="alert good">{out.accepted} aprovada(s), {out.discarded} descartada(s) na verificação. <a href={`#/questoes?discipline=${f.discipline}&topic=${f.topic}&modo=praticar`}>Praticar agora</a></div>}
    </div>
  );
}

export default function Questions({ query }) {
  const curr = useCurriculum();
  const [f, setF] = useState({ discipline: query.discipline || '', topic: query.topic || '', difficulty: '', origin: '', list: '' });
  const [mode, setMode] = useState(query.modo || (query.discipline ? 'praticar' : 'banco'));
  const qs = new URLSearchParams(Object.entries({ discipline: f.discipline, topic: f.topic, difficulty: f.difficulty, origin: f.origin, saved: f.list === 'saved' ? '1' : '', wrong: f.list === 'wrong' ? '1' : '', limit: 50 }).filter(([, v]) => v)).toString();
  const list = useLoad(() => (mode === 'banco' ? api.get(`/questions?${qs}`) : Promise.resolve(null)), [qs, mode]);
  const stats = useLoad(() => api.get('/questions/stats'), []);
  const [open, setOpen] = useState(null);
  const [res, setRes] = useState(null);
  const d = curr.find((x) => x.id === f.discipline);
  useEffect(() => { if (query.gerar) setMode('gerar'); }, [query.gerar]);
  return (
    <div className="stack">
      <div className="topbar"><h1>Banco de questões</h1>{stats.data && <span className="faint">{stats.data.total} questões disponíveis</span>}</div>
      <div className="row">
        {[['banco', 'Explorar banco'], ['praticar', 'Praticar (adaptativo)'], ['cronometrada', 'Cronometrada'], ['gerar', 'Gerar inéditas']].map(([k, t]) => <button key={k} className={`chip ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{t}</button>)}
      </div>
      {mode !== 'gerar' && (
        <div className="card grid four">
          <select value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value, topic: '' })} aria-label="Disciplina"><option value="">Disciplina</option>{curr.filter((x) => x.id !== 'redacao').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} disabled={!d} aria-label="Assunto"><option value="">Assunto</option>{d?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })} aria-label="Dificuldade"><option value="">{mode === 'banco' ? 'Dificuldade' : 'Dificuldade adaptativa'}</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{levelName(n)}</option>)}</select>
          {mode === 'banco' ? (
            <select value={f.list} onChange={(e) => setF({ ...f, list: e.target.value })} aria-label="Lista"><option value="">Todas</option><option value="saved">Salvas (difíceis)</option><option value="wrong">Que errei (refazer)</option></select>
          ) : <span />}
          {mode === 'banco' && <select value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} aria-label="Origem"><option value="">Qualquer origem</option><option value="oficial">Oficial</option><option value="adaptada">Adaptada</option><option value="inedita_ia">Inédita (IA)</option></select>}
        </div>
      )}
      {mode === 'gerar' && <Generate curr={curr} />}
      {(mode === 'praticar' || mode === 'cronometrada') && (f.discipline ? <Practice discipline={f.discipline} topic={f.topic} difficulty={f.difficulty} timed={mode === 'cronometrada'} /> : <div className="card">Escolha uma disciplina para começar.</div>)}
      {mode === 'banco' && (list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : (
        <>
          <p className="faint">{list.data.total} questões encontradas. O acervo inicial é de questões inéditas criadas por IA (não são oficiais). Questões oficiais podem ser importadas com fonte pelo administrador.</p>
          {list.data.items.map((q) => (
            <div key={q.id} className="card">
              <div className="row between">
                <div className="row"><span className="badge">{q.discipline_name} · {q.topic_name}</span><span className="badge">{levelName(q.difficulty)}</span><OriginBadge q={q} />
                  {q.attempts ? <span className={`badge ${q.last_correct ? 'good' : 'bad'}`}>{q.last_correct ? 'acertou' : 'errou'} ({q.attempts}x)</span> : null}{q.saved && <span className="badge warn">salva</span>}</div>
                <button className="btn small" onClick={() => { setOpen(open === q.id ? null : q.id); setRes(null); }}>{open === q.id ? 'Fechar' : q.attempts ? 'Refazer' : 'Resolver'}</button>
              </div>
              {open === q.id ? (
                <div className="stack" style={{ marginTop: 10 }}>
                  <QuestionCard q={q} showMeta={false} result={res} onAnswer={async (a) => setRes(await api.post(`/questions/${q.id}/answer`, a))} />
                  <AnswerFeedback result={res} onRecover={res?.errorId ? () => go(`/erros/${res.errorId}`) : null} />
                </div>
              ) : <p className="faint" style={{ marginTop: 6 }}>{q.statement.slice(0, 180)}…</p>}
            </div>
          ))}
        </>
      ))}
    </div>
  );
}
