// Laboratório virtual de Ciências: simulações calculadas de verdade, ligadas ao banco de questões e à professora.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const TOOLS = [
  { id: 'genetica', name: 'Cruzamentos genéticos', area: 'Biologia', discipline: 'biologia', topic: 'genetica' },
  { id: 'hardy', name: 'Hardy-Weinberg', area: 'Biologia', discipline: 'biologia', topic: 'genetica' },
  { id: 'solucoes', name: 'Diluição e pH', area: 'Química', discipline: 'quimica', topic: 'solucoes' },
  { id: 'lentes', name: 'Lentes e visão', area: 'Física', discipline: 'fisica', topic: 'optica' },
  { id: 'pressao', name: 'Pressão hidrostática no corpo', area: 'Física', discipline: 'fisica', topic: 'estatica_hidro' },
];

// ---------- Genética ----------
export function gametes(genotype) {
  const pairs = genotype.match(/[A-Za-z]{2}/g) || [];
  let out = [''];
  for (const p of pairs) out = out.flatMap((g) => [g + p[0], g + p[1]]);
  return out;
}
const normPair = (a, b) => (a <= b ? a + b : b + a); // maiúscula vem antes ("Aa")
export function cross(g1, g2) {
  const a = gametes(g1); const b = gametes(g2);
  const counts = {};
  for (const x of a) for (const y of b) {
    let geno = '';
    for (let i = 0; i < x.length; i++) geno += normPair(x[i], y[i]);
    counts[geno] = (counts[geno] || 0) + 1;
  }
  const total = a.length * b.length;
  const pheno = {};
  for (const [g, n] of Object.entries(counts)) {
    const ph = (g.match(/../g) || []).map((p) => (p[0] === p[0].toUpperCase() ? `${p[0].toUpperCase()}_` : p)).join(' ');
    pheno[ph] = (pheno[ph] || 0) + n;
  }
  return { a, b, counts, pheno, total };
}
function Genetica() {
  const [p1, setP1] = useState('Aa'); const [p2, setP2] = useState('Aa');
  const valid = (g) => (/^([A-Za-z]{2}){1,3}$/.test(g) && (g.match(/../g) || []).every((p) => p[0].toLowerCase() === p[1].toLowerCase()));
  const ok = valid(p1) && valid(p2) && p1.length === p2.length;
  const r = useMemo(() => (ok ? cross(p1, p2) : null), [p1, p2, ok]);
  return (
    <div className="stack">
      <p className="muted">Digite os genótipos dos pais (1 a 3 genes, ex.: <code>Aa</code>, <code>AaBb</code>). Dominância completa assumida.</p>
      <div className="row"><input type="text" value={p1} onChange={(e) => setP1(e.target.value.trim())} style={{ width: 120 }} aria-label="Genitor 1" /> × <input type="text" value={p2} onChange={(e) => setP2(e.target.value.trim())} style={{ width: 120 }} aria-label="Genitor 2" /></div>
      {!ok && <div className="alert warn">Use pares de alelos da mesma letra (ex.: AaBb) e o mesmo número de genes nos dois pais.</div>}
      {r && r.a.length <= 8 && (
        <div className="tablewrap"><table className="tbl" style={{ textAlign: 'center' }}><thead><tr><th>♀ \ ♂</th>{r.b.map((g, i) => <th key={i}>{g}</th>)}</tr></thead>
          <tbody>{r.a.map((x, i) => <tr key={i}><th>{x}</th>{r.b.map((y, j) => { let g = ''; for (let k = 0; k < x.length; k++) g += normPair(x[k], y[k]); return <td key={j}>{g}</td>; })}</tr>)}</tbody></table></div>
      )}
      {r && (
        <div className="grid two">
          <div><strong>Genótipos</strong>{Object.entries(r.counts).map(([g, n]) => <div key={g}>{g}: {n}/{r.total} ({((n / r.total) * 100).toFixed(1)}%)</div>)}</div>
          <div><strong>Fenótipos</strong>{Object.entries(r.pheno).sort((a, b) => b[1] - a[1]).map(([g, n]) => <div key={g}>{g}: {n}/{r.total} ({((n / r.total) * 100).toFixed(1)}%)</div>)}
            <p className="faint">Proporção fenotípica: {Object.values(r.pheno).sort((a, b) => b - a).join(' : ')}</p></div>
        </div>
      )}
    </div>
  );
}

function Hardy() {
  const [q2, setQ2] = useState(0.04);
  const q = Math.sqrt(q2); const p = 1 - q;
  return (
    <div className="stack">
      <p className="muted">Frequência do fenótipo recessivo na população (q²). Ex.: uma doença autossômica recessiva com 1 afetado a cada 2.500 → q² = 0,0004.</p>
      <label className="field">q² = {q2.toFixed(4)}<input type="range" min="0.0001" max="0.5" step="0.0001" value={q2} onChange={(e) => setQ2(Number(e.target.value))} /></label>
      <input type="number" step="0.0001" min="0" max="1" value={q2} onChange={(e) => setQ2(Math.min(1, Math.max(0, Number(e.target.value))))} />
      <div className="grid three">
        <div className="card stat"><div className="label">q (alelo recessivo)</div><div className="value">{q.toFixed(4)}</div></div>
        <div className="card stat"><div className="label">p (alelo dominante)</div><div className="value">{p.toFixed(4)}</div></div>
        <div className="card stat"><div className="label">Heterozigotos (2pq)</div><div className="value">{(2 * p * q * 100).toFixed(2)}%</div><div className="sub">portadores</div></div>
      </div>
      <p className="faint">p² (homozigotos dominantes) = {(p * p * 100).toFixed(2)}%. Pressupostos: população grande, panmixia, sem seleção, mutação ou migração.</p>
    </div>
  );
}

function Solucoes() {
  const [c1, setC1] = useState(1); const [v1, setV1] = useState(10); const [v2, setV2] = useState(100);
  const [kind, setKind] = useState('acido'); const [n, setN] = useState(1);
  const c2 = (c1 * v1) / v2;
  const conc = c2 * n;
  const pH = conc > 0 ? (kind === 'acido' ? -Math.log10(conc) : 14 + Math.log10(conc)) : 7;
  return (
    <div className="stack">
      <p className="muted">Diluição: C₁·V₁ = C₂·V₂. pH de ácido/base <strong>forte</strong> totalmente ionizado (válido para concentrações acima de ~10⁻⁶ mol/L, a 25 °C).</p>
      <div className="grid three">
        <label className="field">C₁ (mol/L)<input type="number" step="any" value={c1} onChange={(e) => setC1(Number(e.target.value))} /></label>
        <label className="field">V₁ (mL)<input type="number" step="any" value={v1} onChange={(e) => setV1(Number(e.target.value))} /></label>
        <label className="field">V₂ final (mL)<input type="number" step="any" value={v2} onChange={(e) => setV2(Number(e.target.value))} /></label>
        <label className="field">Tipo<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="acido">Ácido forte</option><option value="base">Base forte</option></select></label>
        <label className="field">{kind === 'acido' ? 'H⁺' : 'OH⁻'} por fórmula<select value={n} onChange={(e) => setN(Number(e.target.value))}><option value={1}>1 (ex.: HCl, NaOH)</option><option value={2}>2 (ex.: H₂SO₄*, Ca(OH)₂)</option></select></label>
      </div>
      {v2 < v1 ? <div className="alert warn">V₂ deve ser maior ou igual a V₁ (diluição).</div> : (
        <div className="grid three">
          <div className="card stat"><div className="label">C₂</div><div className="value">{c2.toPrecision(3)}</div><div className="sub">mol/L</div></div>
          <div className="card stat"><div className="label">Água adicionada</div><div className="value">{(v2 - v1).toFixed(1)}</div><div className="sub">mL</div></div>
          <div className="card stat"><div className="label">pH</div><div className="value">{pH.toFixed(2)}</div><div className="sub">{pH < 7 ? 'ácido' : pH > 7 ? 'básico' : 'neutro'}</div></div>
        </div>
      )}
      <p className="faint">* Aproximação: a 2ª ionização do H₂SO₄ não é completa. Diluir 10× muda o pH em 1 unidade.</p>
    </div>
  );
}

function Lentes() {
  const [f, setF] = useState(20); const [p, setP] = useState(30);
  const [far, setFar] = useState(50);
  const pp = (f * p) / (p - f);
  const A = -pp / p;
  const real = pp > 0;
  const V = 100 / f;
  return (
    <div className="stack">
      <p className="muted">Equação de Gauss: 1/f = 1/p + 1/p′. Lente convergente: f &gt; 0; divergente: f &lt; 0. Vergência V = 1/f (f em metros), em dioptrias (“graus”).</p>
      <div className="grid three">
        <label className="field">Distância focal f (cm)<input type="number" step="any" value={f} onChange={(e) => setF(Number(e.target.value))} /></label>
        <label className="field">Distância do objeto p (cm)<input type="number" step="any" value={p} onChange={(e) => setP(Number(e.target.value))} /></label>
      </div>
      {p === f ? <div className="alert">Objeto no foco: a imagem é imprópria (raios paralelos, “no infinito”).</div> : (
        <div className="grid four">
          <div className="card stat"><div className="label">p′ (imagem)</div><div className="value">{pp.toFixed(1)}</div><div className="sub">cm</div></div>
          <div className="card stat"><div className="label">Aumento A</div><div className="value">{A.toFixed(2)}</div></div>
          <div className="card stat"><div className="label">Natureza</div><div className="value" style={{ fontSize: '1rem' }}>{real ? 'Real' : 'Virtual'}, {A < 0 ? 'invertida' : 'direita'}, {Math.abs(A) > 1 ? 'maior' : Math.abs(A) < 1 ? 'menor' : 'mesmo tamanho'}</div></div>
          <div className="card stat"><div className="label">Vergência</div><div className="value">{V.toFixed(2)}</div><div className="sub">dioptrias</div></div>
        </div>
      )}
      <hr />
      <strong>Correção de miopia</strong>
      <p className="muted">O míope não enxerga nítido além do ponto remoto. A lente divergente corretora tem f = −(ponto remoto).</p>
      <label className="field">Ponto remoto (cm)<input type="number" value={far} onChange={(e) => setFar(Number(e.target.value))} /></label>
      <p>Lente: f = −{far} cm → V = <strong>{(-100 / far).toFixed(2)} di</strong> (≈ {(100 / far).toFixed(1)} “graus” de miopia).</p>
    </div>
  );
}

function Pressao() {
  const [h, setH] = useState(120); const [pc, setPc] = useState(100);
  const rho = 1060; const g = 9.8;
  const dP = rho * g * (h / 100); const dmm = dP / 133.3;
  return (
    <div className="stack">
      <p className="muted">Teorema de Stevin: ΔP = ρ·g·h. Sangue: ρ ≈ 1.060 kg/m³; 1 mmHg ≈ 133,3 Pa. Pessoa em pé: a pressão nos pés é maior que no coração.</p>
      <div className="grid two">
        <label className="field">Distância vertical coração → pés (cm)<input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} /></label>
        <label className="field">Pressão média no coração (mmHg)<input type="number" value={pc} onChange={(e) => setPc(Number(e.target.value))} /></label>
      </div>
      <div className="grid three">
        <div className="card stat"><div className="label">ΔP</div><div className="value">{Math.round(dP)}</div><div className="sub">Pa</div></div>
        <div className="card stat"><div className="label">ΔP</div><div className="value">{dmm.toFixed(1)}</div><div className="sub">mmHg</div></div>
        <div className="card stat"><div className="label">Pressão nos pés</div><div className="value">{(pc + dmm).toFixed(0)}</div><div className="sub">mmHg (em pé)</div></div>
      </div>
      <p className="faint">Por isso a pressão arterial é medida com o manguito na altura do coração.</p>
    </div>
  );
}

const COMP = { genetica: Genetica, hardy: Hardy, solucoes: Solucoes, lentes: Lentes, pressao: Pressao };

export default function Lab({ tool }) {
  const t = TOOLS.find((x) => x.id === tool);
  useEffect(() => {
    if (!t) return undefined;
    const t0 = Date.now();
    return () => { const s = Math.round((Date.now() - t0) / 1000); if (s > 20) api.post('/lab/activity', { seconds: s }).catch(() => {}); };
  }, [tool]);
  if (!t) {
    return (
      <div className="stack">
        <div className="topbar"><h1>Laboratório virtual</h1></div>
        <p className="muted">Experimente, mude os valores e veja o que acontece. Cada simulação calcula de verdade e se conecta a questões do banco e à professora. O tempo de prática entra no seu registro de estudo.</p>
        <div className="grid three">{TOOLS.map((x) => <a key={x.id} href={`#/laboratorio/${x.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}><span className="badge">{x.area}</span><h3 style={{ marginTop: 6 }}>{x.name}</h3></a>)}</div>
      </div>
    );
  }
  const C = COMP[t.id];
  return (
    <div className="stack">
      <a href="#/laboratorio" className="faint">← Laboratório</a>
      <h1>{t.name}</h1>
      <div className="card"><C /></div>
      <div className="row">
        <a className="btn primary" href={`#/questoes?discipline=${t.discipline}&topic=${t.topic}&modo=praticar`}>Desafio: questões deste assunto</a>
        <a className="btn" href={`#/professora?q=${encodeURIComponent(`Estou no laboratório virtual (${t.name}). Me proponha um experimento mental e me faça perguntas para verificar se entendi.`)}`}>Discutir com a professora</a>
      </div>
    </div>
  );
}
