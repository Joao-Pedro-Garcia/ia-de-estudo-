import { useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, Source, useLoad } from '../components/ui.jsx';

const AREAS = [['redacao', 'Redação'], ['linguagens', 'Linguagens'], ['humanas', 'Humanas'], ['natureza', 'Natureza'], ['matematica', 'Matemática']];
const show = (v) => (v === null || v === undefined ? 'não verificado' : typeof v === 'object' ? JSON.stringify(v, null, 1).replace(/[{}"]/g, '').replace(/_/g, ' ') : String(v));

function Simulator() {
  const [s, setS] = useState({ redacao: 800, linguagens: 650, humanas: 650, natureza: 650, matematica: 700 });
  const [r, setR] = useState(null); const [err, setErr] = useState(null);
  return (
    <div className="stack">
      <div className="card stack">
        <h2>Simulador de notas (SISU)</h2>
        <p className="muted" style={{ margin: 0 }}>Digite notas hipotéticas por área e veja a média ponderada em cada perfil de Medicina, com os pesos oficiais verificados. Compare com a nota de corte histórica (apenas referência).</p>
        <div className="grid three">{AREAS.map(([k, t]) => <label key={k} className="field">{t}<input type="number" min="0" max="1000" value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} /></label>)}</div>
        <ErrorBox error={err} />
        <button className="btn primary" onClick={async () => { setErr(null); try { setR(await api.post('/simulator', { scores: s })); } catch (x) { setErr(x); } }}>Simular</button>
      </div>
      {r && <>
        <div className="alert warn">{r.disclaimer}</div>
        {r.results.map((x) => (
          <div key={x.id} className="card">
            <div className="row between"><h3>{x.name}</h3>{x.available && <span className="badge brand">Média ponderada: {x.weighted_average}</span>}</div>
            {!x.available ? <p className="muted">{x.message}</p> : <>
              <p className="faint">Pesos: {AREAS.map(([k, t]) => `${t} ${x.weights[k]}`).join(' · ')} — <a href={x.weights_source.url} target="_blank" rel="noopener noreferrer">{x.weights_source.period}</a></p>
              {x.minimum_issues.length > 0 && <div className="alert bad">Nota mínima não atingida: {x.minimum_issues.join('; ')}</div>}
              {x.reference ? (
                <p>Nota de corte de referência (ampla concorrência, {x.reference.reference_period}): <strong>{x.reference.value}</strong> → diferença {x.reference.diff > 0 ? '+' : ''}{x.reference.diff} pontos.<br />
                  <Source url={x.reference.source_url} type={x.reference.source_type} verified={x.reference.verified} /><br /><span className="faint">{x.reference.warning}</span></p>
              ) : <p className="faint">Sem nota de corte de referência cadastrada.</p>}
            </>}
          </div>
        ))}
      </>}
    </div>
  );
}

export default function Central({ tab, me }) {
  const { data, loading, error } = useLoad(() => api.get('/central'), []);
  if (tab === 'simulador') return <Simulator />;
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const general = data.facts.filter((f) => ['ENEM', 'SISU', 'EXATO', 'IFMA'].includes(f.institution));
  const LABEL = { processo: 'Forma de ingresso', vagas: 'Vagas (SISU)', vagas_exato: 'Vagas (PS Exato)', pesos: 'Pesos e notas mínimas', corte: 'Nota de corte (histórica)', bonus: 'Bônus regional' };
  return (
    <div className="stack">
      <div className="topbar"><h1>Central de Medicina Federal</h1><a className="btn" href="#/central/simulador">Simulador de notas</a></div>
      <div className="alert">Todos os dados abaixo têm <strong>fonte, tipo de fonte e data de coleta</strong>. Dados de fonte secundária ou não verificados estão marcados. Cada universidade tem seu perfil independente: informações de um processo não são reaproveitadas em outro. Sempre confirme no edital vigente.</div>
      {data.profiles.map((p) => (
        <details key={p.id} className="card" open={me.profile?.universidades?.includes(p.match)}>
          <summary>{p.name} {me.profile?.universidades?.includes(p.match) && <span className="badge brand">seu objetivo</span>}</summary>
          {Object.entries(p.facts).map(([k, f]) => f && (
            <div key={k} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <strong>{LABEL[k] || k}</strong> <span className="faint">({f.reference_period || 'período não informado'})</span>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '.9rem' }}>{show(f.value)}</div>
              {f.detail && <div className="faint">{f.detail}</div>}
              <Source url={f.source_url} type={f.source_type} date={f.collected_at} verified={f.verified} />
            </div>
          ))}
        </details>
      ))}
      <h2>ENEM, SISU, EXATO e IFMA</h2>
      {general.map((f) => (
        <div key={f.id} className="card">
          <div className="row between"><strong>{f.title}</strong><span className="badge">{f.institution}</span></div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '.9rem' }}>{show(f.value)}</div>
          {f.detail && <div className="faint">{f.detail}</div>}
          <Source url={f.source_url} type={f.source_type} date={f.collected_at} verified={f.verified} />
        </div>
      ))}
      <div className="card"><p style={{ margin: 0 }}>Tem uma dúvida sobre edital? <a href={`#/professora?q=${encodeURIComponent('Quero entender as regras de ingresso em Medicina nos meus processos-alvo. Consulte as fontes oficiais e cite-as.')}`}>Pergunte à professora</a> — ela consulta os documentos oficiais indexados e cita a fonte.</p></div>
    </div>
  );
}
