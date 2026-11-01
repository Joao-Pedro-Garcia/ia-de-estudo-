import { useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox } from '../components/ui.jsx';

export default function Auth({ onDone }) {
  const [mode, setMode] = useState('register');
  const [f, setF] = useState({ email: '', password: '', name: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api.post(mode === 'register' ? '/auth/register' : '/auth/login', f); onDone(); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <div className="center-wrap">
      <div className="panel">
        <div className="hero">
          <img className="logo" src="/icon.svg" alt="" />
          <h1>Aprova Federal AI</h1>
          <p className="muted">Sua professora particular de IA para <strong>Medicina</strong> na UFT, UFNT, UFMA, EXATO e ENEM.</p>
        </div>
        <form className="card stack" onSubmit={submit}>
          <div className="row">
            <button type="button" className={`chip ${mode === 'register' ? 'on' : ''}`} onClick={() => setMode('register')}>Criar conta</button>
            <button type="button" className={`chip ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>Já tenho conta</button>
          </div>
          {mode === 'register' && <label className="field">Nome ou apelido<input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="nickname" /></label>}
          <label className="field">E-mail<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
          <label className="field">Senha {mode === 'register' && <span className="faint">(mínimo 8 caracteres)</span>}
            <input type="password" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
          <ErrorBox error={err} />
          <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : mode === 'register' ? 'Começar minha preparação' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  );
}
