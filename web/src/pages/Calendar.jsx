import { useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, Source, useLoad } from '../components/ui.jsx';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const br = (d) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export default function Calendar() {
  const { data, loading, error, reload } = useLoad(() => api.get('/calendar'), []);
  const [f, setF] = useState({ title: '', date_start: '' });
  const [err, setErr] = useState(null);
  const [past, setPast] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = today();
  const items = data.filter((e) => past || (e.date_end || e.date_start) >= t);
  return (
    <div className="stack">
      <div className="topbar"><h1>Calendário de vestibulares</h1><button className="chip" onClick={() => setPast(!past)}>{past ? 'Ocultar passados' : 'Mostrar passados'}</button></div>
      <p className="muted">Datas oficiais coletadas com fonte. Datas ainda não publicadas não aparecem aqui — não inventamos datas.</p>
      {items.map((e) => {
        const days = Math.ceil((new Date(e.date_start + 'T12:00:00') - new Date()) / 86400000);
        return (
          <div key={e.id} className="card">
            <div className="row between"><strong>{e.title}</strong><span className="badge">{e.institution || 'pessoal'}</span></div>
            <div>{br(e.date_start)}{e.date_end ? ` a ${br(e.date_end)}` : ''} {days >= 0 ? <span className="badge info">{days === 0 ? 'hoje' : `em ${days} dia(s)`}</span> : <span className="badge">passado</span>}</div>
            {e.personal ? <button className="btn small ghost danger" onClick={async () => { await api.del(`/calendar/${e.id}`); reload(); }}>Remover</button> : <Source url={e.source_url} type={e.source_type} verified={e.verified} />}
          </div>
        );
      })}
      <form className="card stack" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.post('/calendar', f); setF({ title: '', date_start: '' }); reload(); } catch (x) { setErr(x); } }}>
        <h3>Adicionar data pessoal</h3>
        <div className="row"><input type="text" placeholder="Ex.: inscrição do vestibular X" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required style={{ flex: 1, minWidth: 200 }} />
          <input type="date" value={f.date_start} onChange={(e) => setF({ ...f, date_start: e.target.value })} required style={{ width: 170 }} /><button className="btn primary">Adicionar</button></div>
        <ErrorBox error={err} />
      </form>
    </div>
  );
}
