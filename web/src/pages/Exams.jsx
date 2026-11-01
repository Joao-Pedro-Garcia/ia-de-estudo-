import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { go } from '../lib/router.js';
import { Bars, ErrorBox, Loading, Md, OriginBadge, useCurriculum, useLoad, levelName } from '../components/ui.jsx';

const fmt = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function NewExam({ me }) {
  const curr = useCurriculum();
  const formats = useLoad(() => api.get('/exams/formats'), []);
  const [kind, setKind] = useState('ENEM');
  const [size, setSize] = useState(10);
  const [custom, setCustom] = useState({ disciplines: ['biologia', 'quimica'], count: 20, minutes: 60 });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const lang = me.profile?.lingua_estrangeira === 'Espanhol' ? 'espanhol' : 'ingles';
  const f = formats.data?.find((x) => x.kind === kind);
  const create = async () => {
    setBusy(true); setErr(null);
    try { const e = await api.post('/exams', { kind, size, custom: kind === 'PERSONALIZADO' ? custom : undefined, language: lang }); go(`/simulados/${e.id}`); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <div className="card stack">
      <h2>Novo simulado</h2>
      <div className="row">{(formats.data || []).map((x) => <button key={x.kind} className={`chip ${kind === x.kind ? 'on' : ''}`} onClick={() => setKind(x.kind)}>{x.title.replace('Simulado ', '')}</button>)}</div>
      {f && <p className="faint" style={{ margin: 0 }}>{f.source}</p>}
      {kind !== 'PERSONALIZADO' && kind !== 'IFMA' && (
        <label className="field">Tamanho
          <select value={size} onChange={(e) => setSize(e.target.value === 'completo' ? 'completo' : Number(e.target.value))}>
            <option value={5}>Mini (5 por área)</option><option value={10}>Reduzido (10 por área)</option><option value={20}>Médio (20 por área)</option><option value="completo">Completo ({f?.perArea} por área)</option>
          </select></label>
      )}
      {kind === 'PERSONALIZADO' && (
        <div className="stack">
          <div className="row">{curr.filter((d) => d.id !== 'redacao').map((d) => (
            <button key={d.id} className={`chip ${custom.disciplines.includes(d.id) ? 'on' : ''}`} onClick={() => setCustom({ ...custom, disciplines: custom.disciplines.includes(d.id) ? custom.disciplines.filter((x) => x !== d.id) : [...custom.disciplines, d.id] })}>{d.name}</button>))}</div>
          <div className="grid three">
            <label className="field">Questões<input type="number" min="5" max="180" value={custom.count} onChange={(e) => setCustom({ ...custom, count: Number(e.target.value) })} /></label>
            <label className="field">Tempo (min)<input type="number" min="5" value={custom.minutes} onChange={(e) => setCustom({ ...custom, minutes: Number(e.target.value) })} /></label>
            <label className="field">Dificuldade<select value={custom.difficulty || ''} onChange={(e) => setCustom({ ...custom, difficulty: e.target.value ? Number(e.target.value) : undefined })}><option value="">Adaptativa</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{levelName(n)}</option>)}</select></label>
          </div>
        </div>
      )}
      <p className="faint" style={{ margin: 0 }}>A dificuldade se adapta ao seu desempenho por disciplina. Questões ainda não vistas têm prioridade.</p>
      <ErrorBox error={err} />
      <button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Montando…' : 'Começar simulado'}</button>
    </div>
  );
}

function Runner({ exam, onFinished }) {
  const [answers, setAnswers] = useState(exam.answers || {});
  const [flags, setFlags] = useState(exam.flags || []);
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(exam.elapsed_s || 0);
  const [saved, setSaved] = useState('salvo');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const st = useRef({ answers, flags, elapsed });
  st.current = { answers, flags, elapsed };
  useEffect(() => { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }, []);
  const save = async () => {
    try { setSaved('salvando…'); await api.put(`/exams/${exam.id}/progress`, { answers: st.current.answers, flags: st.current.flags, elapsed_s: st.current.elapsed }); setSaved('salvo'); dirty.current = false; } catch { setSaved('erro ao salvar — tentando de novo'); }
  };
  useEffect(() => { const t = setInterval(() => { if (dirty.current) save(); }, 4000); const h = () => save(); window.addEventListener('beforeunload', h); return () => { clearInterval(t); window.removeEventListener('beforeunload', h); }; }, []);
  useEffect(() => { const t = setInterval(save, 30000); return () => clearInterval(t); }, []);
  const q = exam.questions[i];
  const pick = (k) => { setAnswers((a) => ({ ...a, [q.id]: k })); dirty.current = true; };
  const flag = () => { setFlags((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id])); dirty.current = true; };
  const left = exam.time_limit_s ? exam.time_limit_s - elapsed : null;
  const finish = async () => {
    const blank = exam.questions.length - Object.keys(answers).length;
    if (!window.confirm(blank ? `Há ${blank} questão(ões) em branco. Finalizar mesmo assim?` : 'Finalizar e corrigir o simulado?')) return;
    setBusy(true); setErr(null);
    try { await onFinished({ answers, flags, elapsed_s: elapsed }); } catch (x) { setErr(x); setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="card row between" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <strong>{exam.title}</strong>
        <span className={left !== null && left < 0 ? 'badge bad' : 'badge'}>⏱ {left !== null ? (left >= 0 ? `restam ${fmt(left)}` : `excedido ${fmt(-left)}`) : fmt(elapsed)}</span>
        <span className="faint">{Object.keys(answers).length}/{exam.questions.length} · {saved}</span>
      </div>
      {exam.config.shortage && <div className="alert warn">{exam.config.shortage}</div>}
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}><strong>Questão {i + 1}</strong><div className="row"><span className="badge">{q.discipline_name}</span><OriginBadge q={q} /></div></div>
        <Md>{q.statement}</Md>
        <div className="alts">{q.alternatives.map((a) => (
          <button key={a.key} className={`alt ${answers[q.id] === a.key ? 'sel' : ''}`} onClick={() => pick(a.key)}><span className="k">{a.key}</span><span>{a.text}</span></button>))}</div>
        <div className="row">
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Anterior</button>
          <button className={`btn ${flags.includes(q.id) ? 'primary' : ''}`} onClick={flag}>⚑ {flags.includes(q.id) ? 'Marcada' : 'Marcar'}</button>
          <div className="spacer" />
          {i < exam.questions.length - 1 ? <button className="btn primary" onClick={() => setI(i + 1)}>Próxima →</button> : <button className="btn primary" disabled={busy} onClick={finish}>{busy ? 'Corrigindo…' : 'Finalizar'}</button>}
        </div>
      </div>
      <div className="card"><div className="row between"><strong>Navegação</strong><button className="btn small" disabled={busy} onClick={finish}>Finalizar simulado</button></div>
        <div className="qnav" style={{ marginTop: 8 }}>{exam.questions.map((x, j) => (
          <button key={x.id} className={`${answers[x.id] ? 'ans' : ''} ${j === i ? 'cur' : ''} ${flags.includes(x.id) ? 'flag' : ''}`} onClick={() => setI(j)} aria-label={`Questão ${j + 1}`}>{j + 1}</button>))}</div>
        <p className="faint">Azul = respondida · traço amarelo = marcada para revisar. Salvamento automático; pode sair e continuar depois.</p>
      </div>
      <ErrorBox error={err} />
    </div>
  );
}

function Result({ exam }) {
  const r = exam.result;
  const [show, setShow] = useState(false);
  return (
    <div className="stack">
      <h1>{exam.title}</h1>
      <div className="grid four">
        <div className="card stat"><div className="label">Aproveitamento</div><div className="value">{r.pct}%</div>{r.previous_pct != null && <div className="sub">anterior: {r.previous_pct}%</div>}</div>
        <div className="card stat"><div className="label">Acertos</div><div className="value">{r.correct}</div><div className="sub">de {r.total}</div></div>
        <div className="card stat"><div className="label">Erros</div><div className="value">{r.wrong}</div><div className="sub">{r.blank} em branco</div></div>
        <div className="card stat"><div className="label">Tempo</div><div className="value" style={{ fontSize: '1.2rem' }}>{fmt(r.elapsed_s)}</div><div className="sub">previsto {fmt(r.time_limit_s || 0)}</div></div>
      </div>
      {r.weighted && <div className="alert">Aproveitamento ponderado pelos pesos oficiais: <strong>{r.weighted.pct}%</strong>. {r.weighted.note} <a href={r.weighted.source_url} target="_blank" rel="noopener noreferrer">fonte ({r.weighted.period})</a></div>}
      <p className="faint">{r.note}</p>
      <div className="grid two">
        <div className="card"><h3>Por disciplina</h3><Bars items={r.by_discipline.map((d) => ({ label: d.name, value: d.pct, hint: `${d.correct}/${d.total}` }))} /></div>
        <div className="card"><h3>Por área</h3><Bars items={r.by_area.map((d) => ({ label: d.name, value: d.pct, hint: `${d.correct}/${d.total}` }))} /></div>
      </div>
      <div className="grid two">
        <div className="card"><h3>Assuntos dominados neste simulado</h3>{r.dominated.length ? <ul>{r.dominated.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Nenhum assunto com 100% (mín. 2 questões).</p>}</div>
        <div className="card"><h3>Precisam de reforço</h3>{r.reinforce.length ? <ul>{r.reinforce.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Nenhum abaixo de 50%.</p>}</div>
      </div>
      <div className="card"><h3>Recomendações e plano de recuperação</h3>
        <ul>{r.recommendations.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="faint">Aulas de recuperação foram adicionadas ao seu plano. Erros foram enviados ao caderno de erros.</p>
        {r.teacher && <><h3>Análise da professora</h3><Md>{r.teacher.analysis}</Md><ul>{r.teacher.recovery_plan.map((x) => <li key={x}>{x}</li>)}</ul></>}
        <div className="row"><a className="btn primary" href="#/erros">Abrir caderno de erros</a><a className="btn" href="#/plano">Ver plano</a></div>
      </div>
      <button className="btn" onClick={() => setShow(!show)}>{show ? 'Ocultar' : 'Ver'} gabarito comentado</button>
      {show && exam.questions.map((q, i) => (
        <div key={q.id} className="card"><strong>{i + 1}. </strong><span className="badge">{q.discipline_name}</span> <span className={`badge ${exam.answers[q.id] === q.answer ? 'good' : 'bad'}`}>sua: {exam.answers[q.id] || '—'} · gabarito: {q.answer}</span>
          <Md>{q.statement}</Md><details><summary>Resolução</summary><Md>{q.explanation}</Md></details></div>
      ))}
    </div>
  );
}

export default function Exams({ id, me }) {
  const list = useLoad(() => (id ? Promise.resolve(null) : api.get('/exams')), [id]);
  const ex = useLoad(() => (id ? api.get(`/exams/${id}`) : Promise.resolve(null)), [id]);
  if (id) {
    if (ex.loading) return <Loading />;
    if (ex.error) return <ErrorBox error={ex.error} />;
    if (ex.data.status === 'finalizado') return <Result exam={ex.data} />;
    return <Runner exam={ex.data} onFinished={async (p) => { await api.post(`/exams/${id}/finish`, p); ex.reload(); }} />;
  }
  return (
    <div className="stack">
      <div className="topbar"><h1>Simulados</h1></div>
      <NewExam me={me} />
      <div className="card"><h3>Histórico</h3>
        {list.loading ? <Loading /> : list.data?.length ? (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Simulado</th><th>Data</th><th>Situação</th><th>Resultado</th></tr></thead>
            <tbody>{list.data.map((e) => <tr key={e.id}><td><a href={`#/simulados/${e.id}`}>{e.title}</a></td><td>{e.started_at.slice(0, 10)}</td><td>{e.status === 'finalizado' ? 'Finalizado' : 'Em andamento'}</td><td>{e.result ? `${e.result.pct}% (${e.result.correct}/${e.result.total})` : '—'}</td></tr>)}</tbody></table></div>
        ) : <p className="muted">Nenhum simulado ainda.</p>}
      </div>
    </div>
  );
}
