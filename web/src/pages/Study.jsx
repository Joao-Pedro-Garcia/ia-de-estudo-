import { useState } from 'react';
import { api } from '../lib/api.js';
import { go } from '../lib/router.js';
import { ErrorBox, Loading, MasteryBadge, useCurriculum, useLoad } from '../components/ui.jsx';

export default function Study({ discipline }) {
  const curr = useCurriculum();
  const lessons = useLoad(() => api.get('/lessons'), []);
  const trail = useLoad(() => (discipline ? api.get(`/lessons/trail/${discipline}`) : Promise.resolve(null)), [discipline]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [focus, setFocus] = useState('');
  const create = async (topic, reason = 'trilha') => {
    setBusy(topic); setErr(null);
    try { const l = await api.post('/lessons', { discipline, topic, reason, focus: focus || undefined }); go(`/aula/${l.id}`); } catch (x) { setErr(x); } finally { setBusy(null); }
  };
  if (!discipline) {
    const ordered = [...curr].sort((a, b) => b.medPriority - a.medPriority);
    return (
      <div className="stack">
        <div className="topbar"><h1>Aulas e disciplinas</h1></div>
        <p className="muted">Ordenadas pela prioridade para Medicina. Cada trilha avança dos fundamentos ao avançado, respeitando o seu domínio medido.</p>
        <div className="grid three">
          {ordered.map((d) => (
            <a key={d.id} href={`#/estudar/${d.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', borderLeft: `4px solid ${d.color}` }}>
              <strong>{d.name}</strong>
              <div className="faint">{d.topics.length} tópicos · prioridade Medicina {'★'.repeat(d.medPriority)}</div>
            </a>
          ))}
        </div>
        <div className="card"><h3>Aulas recentes</h3>
          {lessons.loading ? <Loading /> : lessons.data?.length ? <ul>{lessons.data.slice(0, 12).map((l) => <li key={l.id}><a href={`#/aula/${l.id}`}>{l.title}</a> <span className="faint">· {l.discipline_name} · {l.status}</span></li>)}</ul> : <p className="muted">Nenhuma aula ainda.</p>}
        </div>
      </div>
    );
  }
  const d = curr.find((x) => x.id === discipline);
  return (
    <div className="stack">
      <div className="topbar"><div><a href="#/estudar" className="faint">← Disciplinas</a><h1>{d?.name || discipline}</h1></div></div>
      <div className="card stack">
        <strong>Aula personalizada sob demanda</strong>
        <p className="faint" style={{ margin: 0 }}>Não entendeu algo específico? Descreva a dificuldade e escolha o tópico: a professora monta uma aula só para isso.</p>
        <input type="text" placeholder="Ex.: não entendo quando usar Le Chatelier com pressão" value={focus} onChange={(e) => setFocus(e.target.value)} />
      </div>
      <ErrorBox error={err} />
      {busy && <div className="alert">Preparando sua aula… isso pode levar cerca de um minuto.</div>}
      {trail.loading ? <Loading /> : trail.error ? <ErrorBox error={trail.error} /> : trail.data.map((t) => (
        <div className="card" key={t.id}>
          <div className="row between">
            <div><strong>{t.order}. {t.name}</strong> <MasteryBadge level={t.level} /></div>
            <div className="row">
              <a className="btn small" href={`#/questoes?discipline=${discipline}&topic=${t.id}`}>Exercícios</a>
              <button className="btn small primary" disabled={!!busy} onClick={() => create(t.id, focus ? 'sob_demanda' : 'trilha')}>{busy === t.id ? 'Gerando…' : focus ? 'Aula sob demanda' : 'Iniciar aula'}</button>
            </div>
          </div>
          <div className="faint">{t.subtopics.join(' · ')}</div>
          <div className="faint">{t.attempts} questões respondidas · {t.lessons_done} aulas concluídas</div>
          {t.warning && <div className="alert warn" style={{ marginTop: 8, fontSize: '.85rem' }}>{t.warning}</div>}
        </div>
      ))}
    </div>
  );
}
