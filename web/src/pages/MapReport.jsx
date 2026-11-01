import { api } from '../lib/api.js';
import { Bars, ErrorBox, Loading, Md, useLoad } from '../components/ui.jsx';

export default function MapReport() {
  const { data, error, loading } = useLoad(() => Promise.all([api.get('/diagnostic/report'), api.get('/plan?days=7')]), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const [{ report, finished_at: fin }, plan] = data;
  if (!report) return <div className="card">Nenhum diagnóstico concluído.</div>;
  const ds = report.disciplines;
  return (
    <div className="stack">
      <div className="card" style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}>
        <h1 style={{ marginBottom: 4 }}>{report.title}</h1>
        <p style={{ margin: 0, opacity: .9 }}>Diagnóstico de {String(fin).slice(0, 10)}</p>
      </div>
      <div className="alert warn">{report.disclaimer}</div>
      {report.teacher && (
        <div className="card"><h2>Mensagem da Professora Aurora</h2><Md>{report.teacher.message}</Md>
          <h3>Prioridades</h3><ul>{report.teacher.priorities.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      <div className="card">
        <h2>Nível atual por disciplina</h2>
        <p className="faint">Escala visual 0–100 derivada do modelo de habilidade (não é nota do ENEM).</p>
        <Bars items={ds.map((d) => ({ label: d.name, value: d.level.score ?? 0, hint: d.level.label }))} fmt={(v) => String(v)} />
        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>Disciplina</th><th>Nível</th><th>Acertos seguros</th><th>Chutes certos</th></tr></thead>
            <tbody>{ds.map((d) => <tr key={d.discipline}><td>{d.name}</td><td>{d.level.label}{d.insufficient ? ' *' : ''}</td><td>{d.correct_sure}/{d.answered}</td><td>{d.guessed_correct}</td></tr>)}</tbody>
          </table>
        </div>
        {ds.some((d) => d.insufficient) && <p className="faint">* poucas questões: estimativa com baixa confiança.</p>}
      </div>
      <div className="grid two">
        <div className="card"><h3>Principais pontos de atenção</h3>
          {report.attention.length ? <ul>{report.attention.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="muted">Nenhuma disciplina crítica neste diagnóstico.</p>}
          {report.recurring_difficulties.map((r) => <p key={r} className="alert">{r}</p>)}
        </div>
        <div className="card"><h3>Por assunto</h3>
          {ds.map((d) => (d.from_scratch.length || d.dominated.length) ? (
            <div key={d.discipline} style={{ marginBottom: 8 }}>
              <strong>{d.name}</strong>
              {d.dominated.length > 0 && <div className="faint">Bom desempenho: {d.dominated.join(', ')}</div>}
              {d.partial.length > 0 && <div className="faint">Parcial: {d.partial.join(', ')}</div>}
              {d.from_scratch.length > 0 && <div className="faint">Aprender desde a base: {d.from_scratch.join(', ')}</div>}
              {d.skills_to_develop.length > 0 && <div className="faint">Habilidades a desenvolver: {d.skills_to_develop.join(', ')}</div>}
            </div>) : null)}
        </div>
      </div>
      <div className="card">
        <h2>Plano inicial (próximos 7 dias)</h2>
        <p className="faint">{plan.weights.note}</p>
        <ul>{plan.items.slice(0, 10).map((it) => <li key={it.id}><strong>{it.date.slice(8)}/{it.date.slice(5, 7)} {it.start_time}</strong> — {it.kind_label}{it.discipline_name ? `: ${it.discipline_name}` : ''}{it.topic_name ? ` (${it.topic_name})` : ''} · {it.minutes} min</li>)}</ul>
        <div className="row"><a className="btn primary" href="#/">Ir para o painel</a><a className="btn" href="#/plano">Ver plano completo</a><a className="btn" href="#/professora">Conversar com a professora</a></div>
      </div>
    </div>
  );
}
