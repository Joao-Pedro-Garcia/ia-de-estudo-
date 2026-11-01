import { useState } from 'react';
import { api, readImage } from '../lib/api.js';
import { go } from '../lib/router.js';
import { ErrorBox, LineChart, Loading, Md, useLoad } from '../components/ui.jsx';

function Evaluation({ e }) {
  const ev = e.evaluation;
  if (!ev) return <div className="card">Esta redação não foi corrigida ({e.status}).</div>;
  return (
    <div className="stack">
      <div className="card"><div className="row between"><h2>Nota estimada: {e.total_estimate} <span className="faint">(faixa {ev.total_low}–{ev.total_high})</span></h2></div>
        <div className="alert warn">{ev.disclaimer}</div>
        <p><strong>Tema:</strong> {e.theme}</p>
        <p><strong>Adequação ao tema:</strong> {ev.on_topic === 'sim' ? 'adequada' : ev.on_topic === 'parcial' ? 'tangencia o tema' : 'fuga ao tema'} · <strong>Riscos de zero:</strong> {ev.zero_risk}</p>
        <p><strong>Tese:</strong> {ev.thesis}</p><p><strong>Estrutura:</strong> {ev.structure}</p><p><strong>Repertório:</strong> {ev.repertoire}</p>
      </div>
      {['c1', 'c2', 'c3', 'c4', 'c5'].map((k, i) => (
        <div className="card" key={k}>
          <div className="row between"><h3>Competência {i + 1}</h3><span className="badge brand">{ev[k].score} / 200 <span className="faint">(faixa {ev[k].low}–{ev[k].high})</span></span></div>
          <Md>{ev[k].justification}</Md>
          {ev[k].problems.map((p, j) => <div key={j} className="alert bad" style={{ marginBottom: 6 }}><em>“{p.excerpt}”</em><br /><strong>Problema:</strong> {p.issue}<br /><strong>Como reescrever:</strong> {p.suggestion}</div>)}
          <p><strong>Para subir de nível:</strong> {ev[k].how_to_improve}</p>
        </div>
      ))}
      <div className="grid two">
        <div className="card"><h3>Pontos fortes</h3><ul>{ev.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
        <div className="card"><h3>Prioridades para a próxima</h3><ul>{ev.priorities.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </div>
      <div className="card"><h3>Exemplo de reescrita</h3><Md>{ev.rewritten_paragraph}</Md></div>
      <div className="card"><h3>Evolução</h3><p>{ev.evolution_comment}</p><p className="faint">Repertórios sugeridos foram salvos nos seus flashcards de Redação.</p></div>
      <details className="card"><summary>Seu texto</summary><p style={{ whiteSpace: 'pre-wrap' }}>{e.text}</p></details>
    </div>
  );
}

export default function Essays({ id }) {
  const list = useLoad(() => api.get('/essays'), [id]);
  const one = useLoad(() => (id ? api.get(`/essays/${id}`) : Promise.resolve(null)), [id]);
  const [theme, setTheme] = useState('');
  const [proposal, setProposal] = useState(null);
  const [text, setText] = useState(() => { try { return localStorage.getItem('essay-draft') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [ocr, setOcr] = useState(null);
  const setDraft = (t) => { setText(t); try { localStorage.setItem('essay-draft', t); } catch { /* */ } };
  if (id) return one.loading ? <Loading /> : one.error ? <ErrorBox error={one.error} /> : <><a href="#/redacao" className="faint">← Academia de redação</a><Evaluation e={one.data} /></>;
  const run = async (k, fn) => { setBusy(k); setErr(null); try { await fn(); } catch (x) { setErr(x); } finally { setBusy(null); } };
  const lines = text.split('\n').filter((l) => l.trim()).length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="stack">
      <div className="topbar"><h1>Academia de redação</h1></div>
      <div className="card stack">
        <h3>1. Tema</h3>
        <div className="row"><input type="text" placeholder="Digite o tema da redação" value={theme} onChange={(e) => setTheme(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <button className="btn" disabled={!!busy} onClick={() => run('tema', async () => { const p = await api.post('/essays/theme'); setProposal(p); setTheme(p.theme); })}>{busy === 'tema' ? 'Criando…' : 'Propor um tema'}</button></div>
        {proposal && (
          <div className="alert"><span className="badge brand">Proposta inédita criada por IA</span><h3 style={{ marginTop: 6 }}>{proposal.theme}</h3>
            {proposal.motivating_texts.map((t, i) => <div key={i}><strong>Texto {i + 1} — {t.title}</strong><Md>{t.text}</Md></div>)}
            <details><summary>Eixos e repertórios para estudar</summary><ul>{proposal.key_points.map((k) => <li key={k}>{k}</li>)}</ul><ul>{proposal.repertoire_suggestions.map((k) => <li key={k}>{k}</li>)}</ul></details>
          </div>
        )}
        <h3>2. Texto</h3>
        <div className="row"><label className="btn">📷 Enviar foto da redação<input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = '';
          if (f) run('ocr', async () => { const img = await readImage(f, 2200); const r = await api.post('/essays/transcribe', { data: img.data, media_type: img.media_type }); setOcr(r); setDraft(r.text); });
        }} /></label>{busy === 'ocr' && <span className="faint">Transcrevendo…</span>}</div>
        {ocr && <div className="alert warn">Transcrição com confiança {ocr.confidence}. <strong>Revise o texto abaixo</strong> antes de enviar — a correção avalia exatamente o que estiver aqui.{ocr.illegible?.length ? ` Trechos ilegíveis: ${ocr.illegible.join('; ')}` : ''}</div>}
        <textarea style={{ minHeight: 320 }} value={text} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva ou cole sua redação (rascunho salvo neste aparelho automaticamente)." />
        <p className="faint" style={{ margin: 0 }}>{words} palavras · {lines} parágrafos. No ENEM: até 30 linhas; menos de 8 linhas zera.</p>
        <ErrorBox error={err} />
        <button className="btn primary" disabled={!!busy || !theme.trim() || text.trim().length < 100} onClick={() => run('corrigir', async () => { const e = await api.post('/essays', { theme, text, fromImage: !!ocr }); setDraft(''); go(`/redacao/${e.id}`); })}>{busy === 'corrigir' ? 'Corrigindo pelas 5 competências…' : 'Corrigir redação'}</button>
      </div>
      <div className="card"><h3>Evolução</h3>
        {list.data && <LineChart points={list.data.evolution.map((e) => ({ x: e.date.slice(5).split('-').reverse().join('/'), y: e.total }))} yMax={1000} label="pts" />}
        {list.data?.items.length ? (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Tema</th><th>Data</th><th>C1</th><th>C2</th><th>C3</th><th>C4</th><th>C5</th><th>Total</th></tr></thead>
            <tbody>{list.data.items.map((e) => <tr key={e.id}><td><a href={`#/redacao/${e.id}`}>{e.theme}</a></td><td>{e.created_at.slice(0, 10)}</td>{e.comps.map((c, i) => <td key={i}>{c ?? '—'}</td>)}<td><strong>{e.total_estimate ?? e.status}</strong></td></tr>)}</tbody></table></div>
        ) : <p className="muted">Nenhuma redação corrigida ainda.</p>}
      </div>
      {list.data?.competencies && <details className="card"><summary>As 5 competências do ENEM</summary><ol>{list.data.competencies.list.map((c) => <li key={c.id}>{c.desc}</li>)}</ol>
        {list.data.competencies.official && <p className="faint">Fonte oficial: <a href={list.data.competencies.official.source_url} target="_blank" rel="noopener noreferrer">{list.data.competencies.official.period}</a></p>}</details>}
    </div>
  );
}
