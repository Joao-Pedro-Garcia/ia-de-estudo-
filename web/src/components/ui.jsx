// Componentes compartilhados: ícones, markdown, estados, questão, gráficos.
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { mdToHtml } from '../lib/md.js';
import { api } from '../lib/api.js';

const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  chat: 'M4 5h16v11H8l-4 4z',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z',
  check: 'M4 12l5 5L20 6',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  cards: 'M6 4h12v16H6zM9 9h6M9 13h6',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.5',
  flask: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-10V3',
  target: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  hosp: 'M4 21V7l8-4 8 4v14zM12 9v6M9 12h6',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h1M14 12h1M9 16h1M14 16h1',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 3 5 3 3 0 0 0 3 3V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-3 5 3 3 0 0 1-3 3V4z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  img: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  send: 'M4 12l16-8-6 16-2-7z',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4 4l1.5 1.5M18.5 18.5L20 20M1 12h2M21 12h2M4 20l1.5-1.5M18.5 5.5L20 4',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8',
};

export function Icon({ name, size = 20, ...p }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d={PATHS[name] || PATHS.more} />
    </svg>
  );
}

export function Md({ children, className = '' }) {
  const html = useMemo(() => mdToHtml(children), [children]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Loading({ text = 'Carregando…' }) {
  return <div className="loading" role="status">{text}</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const ai = error.code === 'AI_NOT_CONFIGURED';
  return (
    <div className={`alert ${ai ? 'warn' : 'bad'}`} role="alert">
      <strong>{ai ? 'IA não ativada. ' : ''}</strong>{error.message}
      {onRetry && <> <button className="btn small" onClick={onRetry}>Tentar de novo</button></>}
    </div>
  );
}

/** Hook simples de carregamento. Trocar os parâmetros (deps) volta ao estado "carregando" imediatamente. */
export function useLoad(fn, deps = []) {
  const key = JSON.stringify(deps);
  const [state, set] = useState({ loading: true, data: null, error: null, key: null });
  const reload = () => {
    set((s) => ({ ...s, loading: true, error: null }));
    return fn().then((data) => set({ loading: false, data, error: null, key })).catch((error) => set({ loading: false, data: null, error, key }));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);
  const stale = state.key !== key;
  return { ...state, loading: state.loading || stale, data: stale ? null : state.data, error: stale ? null : state.error, reload,
    setData: (d) => set((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function useCurriculum() {
  const r = useLoad(() => (window.__curr ? Promise.resolve(window.__curr) : api.get('/curriculum').then((c) => (window.__curr = c))), []);
  return r.data || [];
}

export function Progress({ value }) {
  return <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function OriginBadge({ q }) {
  const cls = q.origin === 'oficial' ? 'good' : q.origin === 'adaptada' ? 'info' : 'brand';
  const src = q.source?.exam ? ` — ${q.source.exam}${q.source.year ? ` ${q.source.year}` : ''}` : '';
  return <span className={`badge ${cls}`} title="Origem da questão">{q.origin_label}{src}</span>;
}

const LV = { 1: 'Básica', 2: 'Intermediária', 3: 'Avançada', 4: 'Muito avançada' };
export const levelName = (d) => LV[d] || d;
export const MASTERY = {
  nao_avaliado: ['Sem evidência', ''], a_aprender: ['A aprender', 'bad'], parcial: ['Parcial', 'warn'], dominado: ['Dominado', 'good'],
};
export function MasteryBadge({ level }) {
  const [t, c] = MASTERY[level] || [level, ''];
  return <span className={`badge ${c}`}>{t}</span>;
}

/**
 * Cartão de questão de múltipla escolha. Não mostra gabarito antes da resposta.
 * onAnswer({chosen, confidence, timeMs}) deve devolver o resultado do servidor.
 */
export function QuestionCard({ q, onAnswer, result, disabled, showMeta = true, askConfidence = true, footer }) {
  const [chosen, setChosen] = useState(null);
  const [conf, setConf] = useState('certeza');
  const [busy, setBusy] = useState(false);
  const t0 = useRef(Date.now());
  useEffect(() => { setChosen(null); setConf('certeza'); t0.current = Date.now(); }, [q?.id]);
  if (!q) return null;
  const answered = !!result;
  const send = async () => {
    if (!chosen) return;
    setBusy(true);
    try { await onAnswer({ chosen, confidence: conf, timeMs: Date.now() - t0.current }); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      {showMeta && (
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="badge">{q.discipline_name} · {q.topic_name}</span>
          <span className="badge">{levelName(q.difficulty)}</span>
          <OriginBadge q={q} />
        </div>
      )}
      <Md className="statement">{q.statement}</Md>
      <div className="alts" role="radiogroup">
        {q.alternatives.map((a) => {
          let cls = 'alt';
          if (chosen === a.key) cls += ' sel';
          if (answered && result.answer === a.key) cls += ' right';
          if (answered && !result.correct && chosen === a.key && result.answer) cls += ' wrong';
          return (
            <button key={a.key} className={cls} role="radio" aria-checked={chosen === a.key} disabled={answered || disabled} onClick={() => setChosen(a.key)}>
              <span className="k">{a.key}</span><span className="md">{a.text}</span>
            </button>
          );
        })}
      </div>
      {!answered && (
        <div className="stack">
          {askConfidence && (
            <div className="row" aria-label="Confiança na resposta">
              <span className="faint">Sua confiança:</span>
              {[['certeza', 'Tenho certeza'], ['duvida', 'Com dúvida'], ['chute', 'Chutei']].map(([k, t]) => (
                <button key={k} className={`chip ${conf === k ? 'on' : ''}`} onClick={() => setConf(k)}>{t}</button>
              ))}
            </div>
          )}
          <div className="row">
            <button className="btn primary" disabled={!chosen || busy || disabled} onClick={send}>{busy ? 'Enviando…' : 'Responder'}</button>
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

/** Resultado de uma resposta: acerto mostra resolução; erro mostra motivo provável e leva à recuperação. */
export function AnswerFeedback({ result, onRecover, onNext }) {
  if (!result) return null;
  if (result.correct) {
    return (
      <div className="card">
        <div className="alert good"><strong>Correto!</strong> {result.note}</div>
        <h3 style={{ marginTop: 12 }}>Resolução comentada</h3>
        <Md>{result.explanation}</Md>
        <p className="faint">Domínio do tópico agora: <MasteryBadge level={result.mastery.level} /></p>
        {onNext && <button className="btn primary" onClick={onNext}>Próxima questão</button>}
      </div>
    );
  }
  return (
    <div className="card">
      <div className="alert bad"><strong>Ainda não.</strong> {result.message}</div>
      <p style={{ marginTop: 10 }}><strong>Conteúdo envolvido:</strong> {result.topic.topic_name}{result.topic.subtopic ? ` — ${result.topic.subtopic}` : ''}</p>
      {result.likely_reason && <p><strong>Provável motivo do erro:</strong> {result.likely_reason}</p>}
      <div className="row">
        {onRecover && <button className="btn primary" onClick={onRecover}>Fazer a recuperação guiada</button>}
        {onNext && <button className="btn" onClick={onNext}>Pular por agora</button>}
      </div>
    </div>
  );
}

/** Gráfico de linha simples (uma série) com tooltip por ponto. */
export function LineChart({ points, yMax = 100, height = 180, label = '%', yFmt = (v) => v }) {
  const [hover, setHover] = useState(null);
  if (!points?.length) return <p className="faint">Ainda sem dados suficientes.</p>;
  const W = 600; const H = height; const P = { l: 34, r: 12, t: 10, b: 24 };
  const xs = (i) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (points.length - 1));
  const ys = (v) => P.t + (1 - v / yMax) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.y)}`).join(' ');
  const ticks = [0, yMax / 2, yMax];
  return (
    <div className="viz">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico: ${points.map((p) => `${p.x}: ${yFmt(p.y)}`).join(', ')}`}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} />)}</g>
        {ticks.map((t) => <text key={t} className="axis" x={P.l - 6} y={ys(t) + 4} textAnchor="end">{yFmt(t)}</text>)}
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <circle cx={xs(i)} cy={ys(p.y)} r="14" fill="transparent" />
            <circle cx={xs(i)} cy={ys(p.y)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
        {points.length <= 12 && points.map((p, i) => <text key={`x${i}`} className="axis" x={xs(i)} y={H - 6} textAnchor="middle">{p.x}</text>)}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${(xs(hover) / W) * 100}%`, top: `${(ys(points[hover].y) / H) * 100}%` }}>
          {points[hover].x}: <strong>{yFmt(points[hover].y)}</strong>{label === '%' ? '' : ` ${label}`}
        </div>
      )}
    </div>
  );
}

/** Barras horizontais com rótulo direto (magnitude, uma cor). */
export function Bars({ items, max = 100, fmt = (v) => `${v}%` }) {
  if (!items?.length) return <p className="faint">Ainda sem dados suficientes.</p>;
  return (
    <div>
      {items.map((it) => (
        <div className="bar-row" key={it.label} title={`${it.label}: ${fmt(it.value)}${it.hint ? ` — ${it.hint}` : ''}`}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <div className="track"><div className="fill" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} /></div>
          <span className="val">{it.value === null ? '—' : fmt(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="card" style={{ textAlign: 'center', color: 'var(--text-2)' }}>{children}</div>;
}

export function Source({ url, type, date, verified }) {
  if (!url) return <span className="faint">Fonte não informada</span>;
  let host = url;
  try { host = new URL(url).hostname; } catch { /* */ }
  return (
    <span className="faint">
      Fonte: <a href={url} target="_blank" rel="noopener noreferrer">{host}</a>
      {type && <> · <span className={`badge ${type === 'oficial' ? 'good' : 'warn'}`}>{type === 'oficial' ? 'oficial' : 'secundária'}</span></>}
      {verified === false && <> · <span className="badge warn">não verificado</span></>}
      {date && <> · coletado em {String(date).slice(0, 10)}</>}
    </span>
  );
}

/** Barreira de erro: uma falha numa tela nunca deixa o app em branco. */
export class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="alert bad" role="alert">
        <strong>Algo deu errado nesta tela.</strong> Seus dados estão salvos. <button className="btn small" onClick={() => window.location.reload()}>Recarregar</button>
        <div className="faint">{String(this.state.error.message || this.state.error)}</div>
      </div>
    );
  }
}
