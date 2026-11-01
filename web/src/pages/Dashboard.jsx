import { useState } from 'react';
import { api } from '../lib/api.js';
import { Bars, ErrorBox, Icon, LineChart, Loading, Progress, useLoad } from '../components/ui.jsx';

const fmtDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const KIND_LINK = { aula: (it) => `#/estudar/${it.discipline || ''}`, exercicios: (it) => `#/questoes?discipline=${it.discipline || ''}&topic=${it.topic || ''}`, revisao: (it) => `#/questoes?discipline=${it.discipline || ''}&topic=${it.topic || ''}`, redacao: () => '#/redacao', simulado: () => '#/simulados', flashcards: () => '#/flashcards' };

function Goals({ data, reload }) {
  const [edit, setEdit] = useState(false);
  const [g, setG] = useState(data.goals.goals);
  const items = [['minutes', 'Minutos de estudo'], ['questions', 'Questões'], ['essays', 'Redações'], ['flashcards', 'Flashcards revisados']];
  return (
    <div className="card">
      <div className="row between"><h3>Metas da semana</h3><button className="btn small ghost" onClick={() => setEdit(!edit)}>{edit ? 'Cancelar' : 'Editar'}</button></div>
      {items.map(([k, t]) => (
        <div key={k} style={{ marginBottom: 8 }}>
          <div className="row between"><span>{t}</span><span className="faint">{data.week[k]} / {edit ? <input type="number" style={{ width: 80, minHeight: 30, padding: 4 }} value={g[k]} onChange={(e) => setG({ ...g, [k]: Number(e.target.value) })} /> : data.goals.goals[k]}</span></div>
          <Progress value={data.goals.goals[k] ? (data.week[k] / data.goals.goals[k]) * 100 : 0} />
        </div>
      ))}
      {edit && <button className="btn primary small" onClick={async () => { await api.put('/goals', g); setEdit(false); reload(); }}>Salvar metas</button>}
    </div>
  );
}

export default function Dashboard({ me }) {
  const { data, error, loading, reload } = useLoad(() => api.get('/dashboard'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const d = data;
  const name = me.profile?.nome || me.user.name;
  const exam = d.upcoming.find((e) => /Enem|Exato/i.test(e.title));
  const days = exam ? Math.ceil((new Date(exam.date_start + 'T12:00:00') - new Date()) / 86400000) : null;
  return (
    <div className="stack">
      <div className="topbar"><div><h1>Olá, {name}!</h1><p className="muted" style={{ margin: 0 }}>Vamos rumo à Medicina, um passo de cada vez.</p></div></div>
      {exam && days >= 0 && (
        <div className="alert"><strong>{exam.title}</strong> em {days === 0 ? 'hoje' : `${days} dia(s)`} ({fmtDate(exam.date_start)}). {exam.verified ? 'Data oficial verificada.' : 'Data não verificada.'} <a href="#/calendario">Calendário</a></div>
      )}
      <a href="#/professora" className="card row" style={{ textDecoration: 'none', color: 'inherit', borderColor: 'var(--brand)' }}>
        <Icon name="chat" size={28} />
        <div><strong>Fale com a Professora Aurora</strong><div className="faint">Tire dúvidas, peça uma aula, envie a foto de um exercício ou converse por voz.</div></div>
      </a>
      <div className="grid four">
        <div className="card stat"><div className="label">Horas estudadas</div><div className="value">{d.totals.hours}</div><div className="sub">registradas na plataforma</div></div>
        <div className="card stat"><div className="label">Dias seguidos</div><div className="value">{d.totals.streak}</div><div className="sub">sequência atual</div></div>
        <div className="card stat"><div className="label">Questões</div><div className="value">{d.totals.questions}</div><div className="sub">{d.totals.accuracy !== null ? `${d.totals.accuracy}% de acerto` : 'sem respostas ainda'}</div></div>
        <div className="card stat"><div className="label">Simulados</div><div className="value">{d.totals.exams}</div><div className="sub">{d.open_errors} erros a recuperar</div></div>
      </div>
      <div className="grid two">
        <div className="card">
          <div className="row between"><h3>Plano de hoje</h3><a href="#/plano" className="faint">ver tudo</a></div>
          {d.today_plan.length ? d.today_plan.map((it) => (
            <div key={it.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" aria-label="Concluído" checked={it.status === 'feito'} onChange={async (e) => { await api.patch(`/plan/items/${it.id}`, { status: e.target.checked ? 'feito' : 'pendente' }); reload(); }} />
              <span className="faint" style={{ width: 44 }}>{it.start_time}</span>
              <a href={KIND_LINK[it.kind]?.(it)} style={{ flex: 1, textDecoration: it.status === 'feito' ? 'line-through' : 'none', color: 'inherit' }}>
                <strong>{it.kind_label}</strong>{it.discipline_name ? ` · ${it.discipline_name}` : ''}{it.topic_name ? ` — ${it.topic_name}` : ''}
              </a>
              <span className="faint">{it.minutes}min</span>
            </div>
          )) : <p className="muted">Nada agendado para hoje. Que tal revisar flashcards?</p>}
        </div>
        <Goals data={d} reload={reload} />
      </div>
      <div className="grid two">
        <div className="card"><h3>Nível por disciplina</h3><p className="faint">Medido por questões e simulados (escala 0–100).</p>
          <Bars items={d.disciplines.filter((x) => x.level.score !== null).sort((a, b) => b.level.score - a.level.score).map((x) => ({ label: x.name, value: x.level.score, hint: `${x.level.label}, ${x.attempts} questões` }))} fmt={(v) => String(v)} />
        </div>
        <div className="card"><h3>Minutos de estudo (28 dias)</h3>
          <LineChart points={d.study_series.map((s) => ({ x: fmtDate(s.date), y: s.minutes }))} yMax={Math.max(60, ...d.study_series.map((s) => s.minutes))} label="min" />
        </div>
      </div>
      <div className="grid two">
        <div className="card"><h3>Simulados</h3>
          <LineChart points={d.exams.map((e) => ({ x: e.date ? fmtDate(e.date) : '', y: e.pct }))} yFmt={(v) => `${v}%`} />
        </div>
        <div className="card"><h3>Redações (estimativa)</h3>
          <LineChart points={d.essays.map((e) => ({ x: fmtDate(e.date), y: e.total }))} yMax={1000} label="pts" />
        </div>
      </div>
      <div className="grid three">
        <div className="card"><h3>Revisões vencidas</h3>{d.due_reviews.length ? <ul>{d.due_reviews.map((t) => <li key={t.discipline + t.topic}><a href={`#/questoes?discipline=${t.discipline}&topic=${t.topic}`}>{t.topic_name}</a></li>)}</ul> : <p className="muted">Em dia!</p>}
          <p className="faint">{d.flashcards.due || 0} flashcards para hoje · <a href="#/flashcards">revisar</a></p></div>
        <div className="card"><h3>Padrões de erro</h3>{d.recurring_errors.length ? <ul>{d.recurring_errors.map((r) => <li key={r.discipline + r.topic}>{r.topic_name}: {r.wrong} erros <a href={`#/estudar/${r.discipline}`}>reforçar</a></li>)}</ul> : <p className="muted">Nenhum padrão recorrente nos últimos 30 dias.</p>}</div>
        <div className="card"><h3>Conteúdos pendentes</h3>{d.pending.length ? <ul>{d.pending.slice(0, 8).map((p) => <li key={p.discipline + p.topic}>{p.discipline_name}: {p.topic_name}</li>)}</ul> : <p className="muted">Sem pendências medidas.</p>}</div>
      </div>
    </div>
  );
}
