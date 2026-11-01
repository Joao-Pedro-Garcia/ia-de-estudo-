import { useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, useCurriculum, useLoad } from '../components/ui.jsx';

const KINDS = [['aula', 'Aula'], ['exercicios', 'Exercícios'], ['revisao', 'Revisão'], ['redacao', 'Redação'], ['simulado', 'Simulado'], ['flashcards', 'Flashcards']];
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function Plan() {
  const curr = useCurriculum();
  const [from, setFrom] = useState(today());
  const { data, error, loading, reload } = useLoad(() => api.get(`/plan?from=${from}&days=7`), [from]);
  const [add, setAdd] = useState(null);
  const [err, setErr] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const byDay = {};
  for (const it of data.items) (byDay[it.date] ||= []).push(it);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const shift = (n) => { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); setFrom(d.toISOString().slice(0, 10)); };
  const upd = async (id, p) => { try { await api.patch(`/plan/items/${id}`, p); reload(); } catch (x) { setErr(x); } };
  return (
    <div className="stack">
      <div className="topbar"><h1>Plano de estudos</h1>
        <button className="btn" onClick={async () => { if (window.confirm('Recalcular o plano com base no seu desempenho atual? Itens feitos e criados por você são mantidos.')) { await api.post('/plan/regenerate', {}); reload(); } }}>Recalcular plano</button></div>
      <div className="card">
        <p style={{ margin: 0 }}>O plano usa <strong>repetição espaçada</strong>, <strong>recuperação ativa</strong>, <strong>revisão cumulativa</strong>, <strong>intercalação</strong> de disciplinas e <strong>progressão</strong> (fundamentos antes de avançar). Assuntos com dificuldade voltam mais vezes; assuntos dominados, menos.</p>
        <p className="faint" style={{ margin: '6px 0 0' }}>{data.weights.note} {data.weights.sources.map((s) => <a key={s.url + s.profile} href={s.url} target="_blank" rel="noopener noreferrer">{s.profile} ({s.period}) </a>)}</p>
        <details style={{ marginTop: 8 }}><summary>Prioridades atuais</summary><ol>{data.priorities.map((p) => <li key={p.discipline}>{p.name} <span className="faint">(peso da área {Math.round(p.areaWeight * 100)}%, lacuna {Math.round(p.gap * 100)}%)</span></li>)}</ol></details>
      </div>
      <div className="row"><button className="btn small" onClick={() => shift(-7)}>← Semana anterior</button><button className="btn small" onClick={() => setFrom(today())}>Hoje</button><button className="btn small" onClick={() => shift(7)}>Próxima semana →</button></div>
      <ErrorBox error={err} />
      {days.map((d) => (
        <div className="card" key={d}>
          <div className="row between"><strong>{WD[new Date(d + 'T12:00:00Z').getUTCDay()]}, {d.slice(8)}/{d.slice(5, 7)}{d === today() ? ' · hoje' : ''}</strong>
            <span className="faint">{(byDay[d] || []).reduce((s, x) => s + x.minutes, 0)} min</span></div>
          {(byDay[d] || []).map((it) => (
            <div key={it.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" aria-label="Feito" checked={it.status === 'feito'} onChange={(e) => upd(it.id, { status: e.target.checked ? 'feito' : 'pendente' })} />
              <input type="time" value={it.start_time || ''} onChange={(e) => upd(it.id, { start_time: e.target.value })} style={{ width: 110, minHeight: 32, padding: 4 }} aria-label="Horário" />
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong style={{ textDecoration: it.status !== 'pendente' ? 'line-through' : 'none' }}>{it.kind_label}</strong>{it.discipline_name ? ` · ${it.discipline_name}` : ''}{it.topic_name ? ` — ${it.topic_name}` : ''}
                <div className="faint">{it.reason} {it.created_by !== 'sistema' && <span className="badge">{it.created_by}</span>}</div>
              </div>
              <input type="number" value={it.minutes} min="5" max="300" onChange={(e) => upd(it.id, { minutes: Number(e.target.value) })} style={{ width: 70, minHeight: 32, padding: 4 }} aria-label="Minutos" />
              <button className="btn small ghost" onClick={() => upd(it.id, { status: 'pulado' })}>Pular</button>
              <button className="btn small ghost danger" onClick={async () => { await api.del(`/plan/items/${it.id}`); reload(); }} aria-label="Remover">✕</button>
            </div>
          ))}
          {add === d ? (
            <form className="row" style={{ marginTop: 8 }} onSubmit={async (e) => {
              e.preventDefault(); const f = new FormData(e.target);
              try { await api.post('/plan/items', { date: d, kind: f.get('kind'), discipline: f.get('discipline') || null, minutes: Number(f.get('minutes')), start_time: f.get('start') || null }); setAdd(null); reload(); } catch (x) { setErr(x); }
            }}>
              <select name="kind">{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              <select name="discipline"><option value="">—</option>{curr.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <input name="minutes" type="number" defaultValue="30" style={{ width: 80 }} /><input name="start" type="time" style={{ width: 110 }} />
              <button className="btn primary small">Adicionar</button><button type="button" className="btn small" onClick={() => setAdd(null)}>Cancelar</button>
            </form>
          ) : <button className="btn small ghost" style={{ marginTop: 6 }} onClick={() => setAdd(d)}>+ adicionar atividade</button>}
        </div>
      ))}
    </div>
  );
}
