import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, useCurriculum, useLoad } from '../components/ui.jsx';

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Focus() {
  const curr = useCurriculum();
  const stats = useLoad(() => api.get('/focus'), []);
  const [cfg, setCfg] = useState({ minutes: 25, discipline: '', goal: '' });
  const [session, setSession] = useState(null);
  const [left, setLeft] = useState(0);
  const [onBreak, setOnBreak] = useState(null);
  const [warn, setWarn] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(null);
  const started = useRef(0);
  useEffect(() => {
    if (!session && !onBreak) return undefined;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [session, onBreak]);
  useEffect(() => {
    if (left !== 0) return;
    if (session) finish(false);
    else if (onBreak) { setOnBreak(null); try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play(); } catch { /* */ } }
  }, [left]);
  const start = async () => {
    setErr(null); setSummary(null);
    try {
      const s = await api.post('/focus', { minutes: cfg.minutes, discipline: cfg.discipline || null, goal: cfg.goal || null });
      setSession(s); setLeft(cfg.minutes * 60); started.current = Date.now(); setWarn(s.warning);
    } catch (x) { setErr(x); }
  };
  const finish = async (interrupted, rating = null) => {
    const s = session; if (!s) return;
    setSession(null);
    try {
      const r = await api.post(`/focus/${s.id}/finish`, { actualSec: Math.round((Date.now() - started.current) / 1000), interrupted, rating });
      setSummary(r); setOnBreak(r.suggested_break_min); setLeft(r.suggested_break_min * 60); stats.reload();
    } catch (x) { setErr(x); }
  };
  return (
    <div className="stack">
      <div className="topbar"><h1>Modo concentração</h1></div>
      {!session && !onBreak && (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>Blocos de 10 a 90 minutos com pausas. Estudo eficiente não é estudo exaustivo: dormir bem e fazer pausas consolida a memória.</p>
          <div className="row">{[25, 40, 50].map((m) => <button key={m} className={`chip ${cfg.minutes === m ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, minutes: m })}>{m} min</button>)}
            <input type="number" min="10" max="90" value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: Number(e.target.value) })} style={{ width: 90 }} aria-label="Minutos" /></div>
          <select value={cfg.discipline} onChange={(e) => setCfg({ ...cfg, discipline: e.target.value })}><option value="">Disciplina (opcional)</option>{curr.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <input type="text" placeholder="Meta desta sessão (ex.: 15 questões de estequiometria)" value={cfg.goal} onChange={(e) => setCfg({ ...cfg, goal: e.target.value })} />
          <ErrorBox error={err} />
          <button className="btn primary" onClick={start}>Iniciar sessão</button>
        </div>
      )}
      {session && (
        <div className="card stack" style={{ textAlign: 'center' }}>
          {warn && <div className="alert warn">{warn}</div>}
          <div className="faint">{session.goal || 'Foco total'}</div>
          <div className="timer" role="timer" aria-live="off">{mmss(left)}</div>
          <p className="faint">Celular no silencioso, uma tarefa por vez.</p>
          <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => finish(true)}>Encerrar antes</button></div>
        </div>
      )}
      {onBreak && (
        <div className="card stack" style={{ textAlign: 'center' }}>
          <h2>Pausa de {onBreak} min</h2><div className="timer">{mmss(left)}</div>
          <p className="muted">Levante, beba água, olhe para longe. Evite redes sociais na pausa.</p>
          <button className="btn" onClick={() => { setOnBreak(null); setLeft(0); }}>Pular pausa</button>
        </div>
      )}
      {summary && <div className="alert good">Sessão registrada: {summary.minutes} min. Hoje: {summary.today_minutes} min em concentração.</div>}
      {stats.loading ? <Loading /> : stats.data && (
        <div className="grid two">
          <div className="card"><h3>Últimos 7 dias</h3>{stats.data.last7.length ? stats.data.last7.map((d) => <div key={d.d}>{d.d.slice(8)}/{d.d.slice(5, 7)}: {Math.round(d.minutes)} min em {d.n} sessão(ões)</div>) : <p className="muted">Sem sessões ainda.</p>}</div>
          <div className="card"><h3>Produtividade</h3><p>Hoje: <strong>{stats.data.today_minutes} min</strong></p>
            <p>Sessões concluídas: {stats.data.completion.done || 0} · interrompidas: {stats.data.completion.interrupted || 0}</p></div>
        </div>
      )}
    </div>
  );
}
