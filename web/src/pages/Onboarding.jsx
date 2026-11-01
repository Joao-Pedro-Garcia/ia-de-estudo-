import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, Progress } from '../components/ui.jsx';

export default function Onboarding({ onDone }) {
  const [data, setData] = useState(null);
  const [i, setI] = useState(-1); // -1 = boas-vindas
  const [val, setVal] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/onboarding').then((d) => { setData(d); if (d.step > 0) setI(Math.min(d.step, d.steps.length - 1)); }).catch(setErr); }, []);
  const visible = data ? data.steps.filter((s) => !s.showIf || Object.entries(s.showIf).every(([k, vs]) => vs.includes(data.answers[k]))) : [];
  const step = visible[i];
  useEffect(() => { if (step) setVal(data.answers[step.id] ?? (step.type === 'multi' ? [] : '')); }, [i, step?.id]);
  if (!data) return err ? <ErrorBox error={err} /> : <Loading />;

  const save = async (skip = false) => {
    setBusy(true); setErr(null);
    try {
      const value = skip ? null : val;
      await api.put('/onboarding/answer', { stepId: step.id, value, step: i + 1 });
      const answers = { ...data.answers }; if (value === null || value === '') delete answers[step.id]; else answers[step.id] = value;
      setData({ ...data, answers });
      if (i + 1 < visible.length) setI(i + 1);
      else { await api.post('/onboarding/complete'); onDone(); }
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };

  if (i < 0) {
    return (
      <div className="center-wrap"><div className="panel">
        <div className="hero"><img className="logo" src="/icon.svg" alt="" /><h1>Bem-vinda! Eu sou a Professora Aurora.</h1></div>
        <div className="card stack">
          <p>Vou acompanhar sua preparação para <strong>Medicina</strong> do primeiro dia até a prova. Antes de começar, preciso te conhecer:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Algumas perguntas rápidas</strong> sobre seus objetivos e sua rotina (cerca de 2 minutos).</li>
            <li><strong>Um teste de nivelamento adaptativo</strong> com questões de 11 disciplinas. Eu não vou perguntar seu nível: o teste descobre, ajustando a dificuldade às suas respostas.</li>
            <li>Com isso eu monto o <strong>seu Mapa de Aprovação</strong> e o seu plano de estudos.</li>
          </ol>
          <p className="faint">Tudo é salvo automaticamente: você pode parar e continuar depois, de qualquer aparelho.</p>
          <button className="btn primary block" onClick={() => setI(0)}>Vamos começar</button>
        </div>
      </div></div>
    );
  }
  const toggle = (o) => setVal((v) => (v.includes(o) ? v.filter((x) => x !== o) : [...v, o]));
  const canNext = !step.required || (Array.isArray(val) ? val.length > 0 : String(val).trim() !== '');
  return (
    <div className="center-wrap"><div className="panel stack">
      <div className="row between"><span className="faint">Etapa 1 de 2 · Pergunta {i + 1} de {visible.length}</span>{!step.required && <span className="badge">opcional</span>}</div>
      <Progress value={((i + 1) / visible.length) * 50} />
      <div className="card stack">
        <h2>{step.title}</h2>
        <div className="why"><strong>Por que pergunto:</strong> {step.why}</div>
        {step.type === 'text' && <input type="text" autoFocus value={val} maxLength={80} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canNext && save()} />}
        {step.type === 'number' && <input type="number" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} />}
        {step.type === 'date' && <input type="date" value={val} onChange={(e) => setVal(e.target.value)} />}
        {step.type === 'select' && <div className="optlist">{step.options.map((o) => <button key={o} className={`opt ${val === o ? 'on' : ''}`} onClick={() => setVal(o)}>{o}</button>)}</div>}
        {step.type === 'multi' && <div className="optlist">{step.options.map((o) => <button key={o} className={`opt ${val.includes(o) ? 'on' : ''}`} aria-pressed={val.includes(o)} onClick={() => toggle(o)}>{val.includes(o) ? '✓ ' : ''}{o}</button>)}</div>}
        <ErrorBox error={err} />
        <div className="row">
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Voltar</button>}
          <div className="spacer" />
          {!step.required && <button className="btn ghost" disabled={busy} onClick={() => save(true)}>Pular</button>}
          <button className="btn primary" disabled={!canNext || busy} onClick={() => save(false)}>{i + 1 === visible.length ? 'Ir para o teste' : 'Continuar'}</button>
        </div>
      </div>
    </div></div>
  );
}
