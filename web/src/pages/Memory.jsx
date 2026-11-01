import { api } from '../lib/api.js';
import { ErrorBox, Loading, MasteryBadge, useLoad } from '../components/ui.jsx';

export default function Memory() {
  const { data, loading, error, reload } = useLoad(() => api.get('/memory'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { snapshot: s, mastery } = data;
  const by = {};
  for (const m of mastery) (by[m.discipline] ||= []).push(m);
  return (
    <div className="stack">
      <div className="topbar"><h1>Minha evolução (memória acadêmica)</h1></div>
      <div className="alert">Isto é o que a professora sabe sobre você. O <strong>domínio</strong> de cada assunto é medido só por exercícios, aulas com teste e simulados — conversar ou assistir a uma aula não conta como domínio.</div>
      <div className="grid two">
        <div className="card"><h3>Observações da professora</h3>
          {s.notes.length ? s.notes.map((n, i) => <div key={i} style={{ marginBottom: 6 }}><span className="badge">{n.kind}</span> {n.text} <span className="faint">({n.source})</span></div>) : <p className="muted">Nenhuma ainda.</p>}</div>
        <div className="card"><h3>Atenção</h3>
          {s.lessons_without_evidence.length > 0 && <p><strong>Aulas concluídas sem comprovação de domínio:</strong> {s.lessons_without_evidence.join('; ')}</p>}
          {s.recurring_errors.length > 0 && <p><strong>Erros recorrentes:</strong> {s.recurring_errors.map((r) => `${r.topic_name} (${r.wrong})`).join('; ')}</p>}
          {s.due_reviews.length > 0 && <p><strong>Revisões vencidas:</strong> {s.due_reviews.join('; ')}</p>}
        </div>
      </div>
      {Object.entries(by).map(([d, list]) => (
        <div key={d} className="card"><h3>{s.disciplines.find((x) => x.discipline === d)?.name || d}</h3>
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Assunto</th><th>Situação</th><th>Questões</th><th>Acertos</th><th>Chutes certos</th><th>Aulas</th><th>Próx. revisão</th></tr></thead>
            <tbody>{list.map((m) => <tr key={m.topic}><td>{m.topic_name}</td><td><MasteryBadge level={m.level} /></td><td>{m.attempts}</td><td>{m.correct}</td><td>{m.guessed_correct}</td><td>{m.lessons_done}</td><td>{m.next_review_at ? m.next_review_at.slice(0, 10) : '—'}</td></tr>)}</tbody></table></div>
        </div>
      ))}
      <button className="btn small" onClick={reload}>Atualizar</button>
    </div>
  );
}
