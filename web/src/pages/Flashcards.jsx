import { useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, Md, useCurriculum, useLoad } from '../components/ui.jsx';

export default function Flashcards() {
  const curr = useCurriculum();
  const { data, loading, error, reload } = useLoad(() => api.get('/flashcards'), []);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [t0, setT0] = useState(Date.now());
  const [gen, setGen] = useState({ discipline: 'biologia', topic: 'citologia' });
  const [manual, setManual] = useState({ discipline: 'biologia', front: '', back: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const due = data.due;
  const card = due[i];
  const grade = async (g) => { await api.post(`/flashcards/${card.id}/review`, { grade: g, seconds: Math.round((Date.now() - t0) / 1000) }); setFlip(false); setT0(Date.now()); if (i + 1 >= due.length) { setI(0); reload(); } else setI(i + 1); };
  const d = curr.find((x) => x.id === gen.discipline);
  return (
    <div className="stack">
      <div className="topbar"><h1>Flashcards</h1><span className="faint">{data.stats.total || 0} cartões · {data.stats.due || 0} para hoje · {data.stats.mature || 0} maduros</span></div>
      {card ? (
        <div className="stack">
          <div className="faint">Cartão {i + 1} de {due.length} · {card.discipline_name}{card.topic_name ? ` — ${card.topic_name}` : ''}</div>
          <div className="card flash" onClick={() => setFlip(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === ' ' && setFlip(true)}>
            <div><Md>{card.front}</Md>{flip ? <><hr /><Md>{card.back}</Md></> : <p className="faint">Tente lembrar antes de virar (toque para ver a resposta)</p>}</div>
          </div>
          {flip && <div className="grid four">{[[0, 'Errei', 'danger'], [1, 'Difícil', ''], [2, 'Bom', ''], [3, 'Fácil', 'primary']].map(([g, t, c]) => <button key={g} className={`btn ${c}`} onClick={() => grade(g)}>{t}</button>)}</div>}
          <p className="faint">Errou? O cartão volta em minutos. Acertou? O intervalo cresce (1 dia, 6 dias, semanas…).</p>
        </div>
      ) : <div className="card"><strong>Nenhum cartão para revisar agora.</strong> <span className="muted">Volte mais tarde ou crie novos cartões.</span></div>}
      <div className="grid two">
        <div className="card stack"><h3>Gerar com a professora</h3>
          <select value={gen.discipline} onChange={(e) => setGen({ discipline: e.target.value, topic: curr.find((x) => x.id === e.target.value).topics[0].id })}>{curr.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={gen.topic} onChange={(e) => setGen({ ...gen, topic: e.target.value })}>{d?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <p className="faint" style={{ margin: 0 }}>Os cartões consideram seus erros recentes neste assunto.</p>
          <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await api.post('/flashcards/generate', gen); reload(); } catch (x) { setErr(x); } finally { setBusy(false); } }}>{busy ? 'Gerando…' : 'Gerar cartões'}</button>
        </div>
        <form className="card stack" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/flashcards', manual); setManual({ ...manual, front: '', back: '' }); reload(); } catch (x) { setErr(x); } }}>
          <h3>Criar cartão</h3>
          <select value={manual.discipline} onChange={(e) => setManual({ ...manual, discipline: e.target.value })}>{curr.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <input type="text" placeholder="Frente (pergunta)" value={manual.front} onChange={(e) => setManual({ ...manual, front: e.target.value })} required />
          <input type="text" placeholder="Verso (resposta)" value={manual.back} onChange={(e) => setManual({ ...manual, back: e.target.value })} required />
          <button className="btn">Salvar</button>
        </form>
      </div>
      <ErrorBox error={err} />
      <details className="card"><summary>Todos os cartões ({data.all.length})</summary>
        <div className="tablewrap"><table className="tbl"><thead><tr><th>Frente</th><th>Disciplina</th><th>Próxima revisão</th><th /></tr></thead>
          <tbody>{data.all.map((c) => <tr key={c.id}><td>{c.front}</td><td>{c.discipline_name}</td><td>{c.due_at.slice(0, 10)}</td><td><button className="btn small ghost danger" onClick={async () => { await api.del(`/flashcards/${c.id}`); reload(); }}>✕</button></td></tr>)}</tbody></table></div>
      </details>
    </div>
  );
}
