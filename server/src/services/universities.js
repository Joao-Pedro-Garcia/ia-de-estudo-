// Central de Medicina Federal + Calendário de vestibulares + Simulador de notas.
// Regra de ouro: nenhum número sem fonte. Cada fato tem URL, tipo de fonte (oficial/secundária),
// período de referência, data de coleta e flag "verificado". Fatos de um processo NÃO são reutilizados em outro.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { getDb, J, tx, today } from '../db.js';
import { bad } from '../lib/http.js';
import { indexFactsAsDocuments } from './rag.js';

/** Perfis independentes de Medicina; cada um aponta para as chaves de fatos que lhe pertencem. */
export const MED_PROFILES = [
  { id: 'uft-palmas', name: 'Medicina UFT — Palmas', institution: 'UFT', campus: 'Palmas', match: 'Medicina UFT — Palmas',
    facts: { processo: 'uft-med-processo', vagas: 'uft-med-sisu-vagas', pesos: 'uft-med-sisu-pesos', corte: 'uft-med-corte', bonus: 'uft-med-bonus' }, corteKey: null },
  { id: 'ufnt-araguaina', name: 'Medicina UFNT — Araguaína', institution: 'UFNT', campus: 'Araguaína', match: 'Medicina UFNT — Araguaína',
    facts: { processo: 'ufnt-med-processo', vagas: 'ufnt-med-sisu-vagas', vagas_exato: 'ufnt-med-psexato', pesos: 'ufnt-med-sisu-pesos', corte: 'ufnt-med-corte', bonus: 'ufnt-med-bonus' }, corteKey: null },
  { id: 'ufma-saoluis', name: 'Medicina UFMA — São Luís', institution: 'UFMA', campus: 'São Luís', match: 'Medicina UFMA — São Luís',
    facts: { processo: 'ufma-med-processo', vagas: 'ufma-med-vagas', pesos: 'ufma-med-pesos', corte: 'ufma-med-corte', bonus: 'ufma-med-bonus' }, corteKey: 'Sao_Luis' },
  { id: 'ufma-pinheiro', name: 'Medicina UFMA — Pinheiro', institution: 'UFMA', campus: 'Pinheiro', match: 'Medicina UFMA — Pinheiro',
    facts: { processo: 'ufma-med-processo', vagas: 'ufma-med-vagas', pesos: 'ufma-med-pesos', corte: 'ufma-med-corte', bonus: 'ufma-med-bonus' }, corteKey: 'Pinheiro' },
  { id: 'ufma-imperatriz', name: 'Medicina UFMA — Imperatriz', institution: 'UFMA', campus: 'Imperatriz', match: 'Medicina UFMA — Imperatriz',
    facts: { processo: 'ufma-med-processo', vagas: 'ufma-med-vagas', pesos: 'ufma-med-pesos', corte: 'ufma-med-corte', bonus: 'ufma-med-bonus' }, corteKey: 'Imperatriz' },
];

const AREAS = ['redacao', 'linguagens', 'humanas', 'natureza', 'matematica'];

export function seedOfficialData(file = path.join(ROOT, 'data', 'official', 'official_data.json')) {
  if (!fs.existsSync(file)) return { facts: 0, events: 0 };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const db = getDb();
  const collected = data.collected_at || today();
  let nf = 0; let ne = 0;
  tx(() => {
    const insF = db.prepare(`INSERT INTO uni_facts (fact_key, institution, campus, topic, title, value, detail, reference_period, source_url, source_name, source_type, verified, collected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fact_key) DO UPDATE SET value=excluded.value, detail=excluded.detail, reference_period=excluded.reference_period,
      source_url=excluded.source_url, source_name=excluded.source_name, source_type=excluded.source_type, verified=excluded.verified, collected_at=excluded.collected_at, title=excluded.title`);
    for (const f of data.facts || []) {
      insF.run(f.id, f.institution, f.campus || null, f.topic, f.title, J.str(f.value), [f.detail, f.notes].filter(Boolean).join(' — ') || null,
        f.reference_period || null, f.source_url || null, f.source_name || null, f.source_type || 'oficial', f.verified ? 1 : 0, collected);
      nf++;
    }
    const insE = db.prepare(`INSERT INTO calendar_events (event_key, title, institution, date_start, date_end, source_url, source_type, verified)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO UPDATE SET title=excluded.title, date_start=excluded.date_start, date_end=excluded.date_end,
      source_url=excluded.source_url, source_type=excluded.source_type, verified=excluded.verified`);
    for (const e of data.events || []) {
      insE.run(`${e.institution}:${e.title}`, e.title, e.institution, e.date_start, e.date_end || null, e.source_url || null, e.source_type || null, e.verified ? 1 : 0);
      ne++;
    }
  });
  try { indexFactsAsDocuments(data.facts || []); } catch { /* indexação é complementar */ }
  return { facts: nf, events: ne };
}

function hydrateFact(r) {
  return r ? { ...r, value: J.parse(r.value), verified: !!r.verified } : null;
}

export function getFact(key) {
  return hydrateFact(getDb().prepare('SELECT * FROM uni_facts WHERE fact_key=?').get(key));
}

export function listFacts({ institution } = {}) {
  const rows = institution
    ? getDb().prepare('SELECT * FROM uni_facts WHERE institution=? ORDER BY topic, id').all(institution)
    : getDb().prepare('SELECT * FROM uni_facts ORDER BY institution, topic, id').all();
  return rows.map(hydrateFact);
}

export function addFact(userId, f) {
  for (const k of ['institution', 'topic', 'title', 'source_url']) if (!f[k]) throw bad(`Campo obrigatório: ${k} (nenhum dado sem fonte)`);
  const key = f.fact_key || `manual-${Date.now()}`;
  getDb().prepare(`INSERT INTO uni_facts (fact_key, institution, campus, topic, title, value, detail, reference_period, source_url, source_name, source_type, verified, collected_at, added_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(key, f.institution, f.campus || null, f.topic, f.title, J.str(f.value ?? null), f.detail || null,
    f.reference_period || null, f.source_url, f.source_name || null, f.source_type || 'oficial', f.verified ? 1 : 0, today(), userId);
  return getFact(key);
}

/** Perfil de Medicina com os fatos resolvidos (com fonte). */
export function medProfile(profileId) {
  const p = MED_PROFILES.find((x) => x.id === profileId);
  if (!p) return null;
  const facts = {};
  for (const [k, key] of Object.entries(p.facts)) facts[k] = getFact(key);
  // Recorte por campus quando o fato agrega vários campi.
  const vagas = facts.vagas?.value && p.corteKey && facts.vagas.value[p.corteKey.replace('Sao_Luis', 'Sao_Luis')]
    ? { ...facts.vagas, value: facts.vagas.value[p.corteKey] } : facts.vagas;
  const corte = facts.corte && p.corteKey && facts.corte.value && typeof facts.corte.value === 'object'
    ? { ...facts.corte, value: facts.corte.value[p.corteKey] ?? null } : facts.corte;
  return { ...p, facts: { ...facts, vagas, corte } };
}

export function allMedProfiles() {
  return MED_PROFILES.map((p) => medProfile(p.id));
}

/** Pesos oficiais verificados de um perfil, ou null (nunca inventa). */
export function profileWeights(profileId) {
  const f = medProfile(profileId)?.facts.pesos;
  if (!f || !f.verified || !f.value?.pesos) return null;
  return { weights: f.value.pesos, minimums: f.value.notas_minimas || null, source_url: f.source_url, reference_period: f.reference_period, collected_at: f.collected_at };
}

/**
 * Simulador de notas: média ponderada SISU com pesos oficiais verificados.
 * Compara com nota de corte histórica SOMENTE como referência (indicando fonte e se é verificada).
 * Nunca retorna probabilidade de aprovação.
 */
export function simulateScores(scores, profileIds) {
  for (const a of AREAS) {
    const v = Number(scores[a]);
    if (!Number.isFinite(v) || v < 0 || v > 1000) throw bad(`Nota inválida em ${a} (0 a 1000)`);
  }
  const ids = profileIds?.length ? profileIds : MED_PROFILES.map((p) => p.id);
  return ids.map((id) => {
    const prof = medProfile(id);
    if (!prof) return { id, error: 'perfil desconhecido' };
    const w = profileWeights(id);
    if (!w) return { id, name: prof.name, available: false, message: 'Pesos oficiais ainda não verificados para este processo. Cadastre a fonte oficial na Central.' };
    const sumW = AREAS.reduce((s, a) => s + Number(w.weights[a] || 0), 0);
    const avg = AREAS.reduce((s, a) => s + Number(scores[a]) * Number(w.weights[a] || 0), 0) / sumW;
    const minIssues = [];
    if (w.minimums) {
      for (const [k, v] of Object.entries(w.minimums)) {
        if (k === 'todas_areas') { for (const a of AREAS) if (Number(scores[a]) < Number(v)) minIssues.push(`${a} abaixo do mínimo ${v}`); }
        else if (AREAS.includes(k) && Number(scores[k]) < Number(v)) minIssues.push(`${k} abaixo do mínimo exigido (${v})`);
      }
    }
    const corte = prof.facts.corte;
    let reference = null;
    if (corte && typeof corte.value === 'number') {
      reference = {
        value: corte.value, diff: Math.round((avg - corte.value) * 100) / 100,
        verified: corte.verified, source_type: corte.source_type, source_url: corte.source_url, reference_period: corte.reference_period,
        warning: 'Nota de corte é um dado HISTÓRICO de uma edição específica (ampla concorrência). Ela muda a cada edição; não é previsão nem garantia.',
      };
    }
    return {
      id, name: prof.name, available: true, weighted_average: Math.round(avg * 100) / 100, weights: w.weights, minimum_issues: minIssues,
      weights_source: { url: w.source_url, period: w.reference_period, collected_at: w.collected_at }, reference,
    };
  });
}

export function listEvents(userId) {
  return getDb().prepare('SELECT * FROM calendar_events WHERE user_id IS NULL OR user_id=? ORDER BY date_start').all(userId)
    .map((e) => ({ ...e, verified: !!e.verified, personal: e.user_id !== null }));
}

export function addPersonalEvent(userId, { title, date_start, date_end, institution }) {
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date_start || '')) throw bad('Título e data (AAAA-MM-DD) são obrigatórios');
  const id = getDb().prepare(`INSERT INTO calendar_events (user_id, title, institution, date_start, date_end, source_type, verified) VALUES (?,?,?,?,?, 'pessoal', 0)`)
    .run(userId, title, institution || null, date_start, date_end || null).lastInsertRowid;
  return getDb().prepare('SELECT * FROM calendar_events WHERE id=?').get(id);
}

export function deletePersonalEvent(userId, id) {
  getDb().prepare('DELETE FROM calendar_events WHERE id=? AND user_id=?').run(id, userId);
}

export function upcomingEvents(userId, n = 5) {
  return listEvents(userId).filter((e) => (e.date_end || e.date_start) >= today()).slice(0, n);
}
