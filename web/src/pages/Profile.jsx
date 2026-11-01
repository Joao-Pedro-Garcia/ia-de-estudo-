import { useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';

function Field({ step, value, onSave }) {
  const [v, setV] = useState(value ?? (step.type === 'multi' ? [] : ''));
  const [err, setErr] = useState(null); const [ok, setOk] = useState(false);
  const save = async () => { setErr(null); setOk(false); try { await onSave(step.id, v === '' || (Array.isArray(v) && !v.length) ? null : v); setOk(true); } catch (x) { setErr(x); } };
  return (
    <div className="card stack">
      <strong>{step.title}</strong>
      {step.type === 'text' && <input type="text" value={v} onChange={(e) => setV(e.target.value)} />}
      {step.type === 'number' && <input type="number" value={v} onChange={(e) => setV(e.target.value)} />}
      {step.type === 'date' && <input type="date" value={v} onChange={(e) => setV(e.target.value)} />}
      {step.type === 'select' && <select value={v} onChange={(e) => setV(e.target.value)}><option value="">—</option>{step.options.map((o) => <option key={o}>{o}</option>)}</select>}
      {step.type === 'multi' && <div className="row">{step.options.map((o) => <button key={o} className={`chip ${v.includes(o) ? 'on' : ''}`} onClick={() => setV(v.includes(o) ? v.filter((x) => x !== o) : [...v, o])}>{o}</button>)}</div>}
      <ErrorBox error={err} />
      <div className="row"><button className="btn small primary" onClick={save}>Salvar</button>{ok && <span className="badge good">salvo</span>}</div>
    </div>
  );
}

export default function Profile() {
  const { data, loading, error } = useLoad(() => api.get('/onboarding'), []);
  const [regen, setRegen] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const save = async (stepId, value) => { await api.put('/onboarding/answer', { stepId, value }); setRegen(true); };
  return (
    <div className="stack">
      <div className="topbar"><h1>Meu perfil</h1></div>
      <p className="muted">Mudou de objetivo, de rotina ou definiu a data da prova? Atualize aqui. Seu nível não é configurado aqui: ele é medido continuamente pelos exercícios e simulados.</p>
      {regen && <div className="alert row between"><span>Perfil atualizado. Recalcular o plano de estudos com as novas informações?</span><button className="btn small primary" onClick={async () => { await api.post('/plan/regenerate', {}); setRegen(false); window.location.hash = '/plano'; }}>Recalcular plano</button></div>}
      {data.steps.map((s) => <Field key={s.id} step={s} value={data.answers[s.id]} onSave={save} />)}
      <div className="card"><strong>Diagnóstico</strong><p className="muted">Quer refazer o teste de nivelamento? Seu histórico é mantido; o novo diagnóstico se soma à sua memória acadêmica.</p>
        <button className="btn" onClick={async () => { if (window.confirm('Iniciar um novo diagnóstico agora?')) { await api.post('/diagnostic/redo'); window.location.reload(); } }}>Refazer diagnóstico</button></div>
    </div>
  );
}
