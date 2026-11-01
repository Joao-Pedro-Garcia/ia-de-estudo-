// Recuperação de conhecimento (RAG) sobre documentos oficiais.
// - Ingestão: texto colado, página HTML ou PDF por URL (somente domínios oficiais por padrão).
// - Indexação: chunks de ~1.200 caracteres com sobreposição, em SQLite FTS5 (BM25, sem acentos).
// - Busca: consulta lexical ranqueada; o agente (professora) reformula a pergunta em termos de busca,
//   o que dá a camada semântica. Toda resposta carrega título, URL, tipo de fonte e data de coleta.
import crypto from 'node:crypto';
import { getDb, J, tx } from '../db.js';
import { config } from '../config.js';
import { bad } from '../lib/http.js';
import { log } from '../logger.js';

const CHUNK = 1200;
const OVERLAP = 200;

export function chunkText(text) {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + CHUNK);
    if (end < clean.length) {
      const cut = clean.lastIndexOf('\n', end);
      const dot = clean.lastIndexOf('. ', end);
      const best = Math.max(cut, dot);
      if (best > i + CHUNK * 0.5) end = best + 1;
    }
    out.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - OVERLAP, i + 1);
  }
  return out.filter((c) => c.length > 20);
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export function isOfficialUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return config.officialDomains.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

export function addDocument({ title, text, url = null, institution = null, kind = 'pagina_oficial', sourceType = 'oficial', referencePeriod = null, userId = null }) {
  if (!title || !text || text.trim().length < 50) throw bad('Documento sem conteúdo suficiente para indexar.');
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  const db = getDb();
  const dup = db.prepare('SELECT id FROM documents WHERE content_hash=?').get(hash);
  if (dup) return { id: dup.id, duplicate: true };
  const chunks = chunkText(text);
  return tx(() => {
    const id = Number(db.prepare(`INSERT INTO documents (title, institution, kind, url, source_type, reference_period, content_hash, added_by)
      VALUES (?,?,?,?,?,?,?,?)`).run(title, institution, kind, url, sourceType, referencePeriod, hash, userId).lastInsertRowid);
    const ins = db.prepare('INSERT INTO chunks (document_id, idx, text) VALUES (?,?,?)');
    chunks.forEach((c, i) => ins.run(id, i, c));
    return { id, chunks: chunks.length, duplicate: false };
  });
}

/** Baixa e indexa uma URL (HTML ou PDF). Por segurança, só domínios oficiais, salvo allowAny. */
export async function ingestUrl({ url, title, institution, kind, referencePeriod, userId, allowAny = false }) {
  let u;
  try { u = new URL(url); } catch { throw bad('URL inválida'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw bad('Apenas http/https');
  const official = isOfficialUrl(url);
  if (!official && !allowAny) throw bad(`Domínio não reconhecido como oficial (${u.hostname}). Domínios aceitos: ${config.officialDomains.join(', ')}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'AprovaFederalAI/1.0 (+indexador de documentos oficiais)' }, redirect: 'follow' });
  } catch (e) {
    throw bad(`Não foi possível baixar a URL: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw bad(`A fonte respondeu com erro HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) throw bad('Arquivo muito grande (máx. 25 MB)');
  let text; let docTitle = title;
  if (type.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const r = await extractText(pdf, { mergePages: true });
    text = Array.isArray(r.text) ? r.text.join('\n') : r.text;
  } else {
    const html = buf.toString('utf8');
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!docTitle && m) docTitle = m[1].trim();
    text = htmlToText(html);
  }
  log.info('documento baixado', { url, bytes: buf.length });
  return addDocument({ title: docTitle || url, text, url, institution, kind: kind || (type.includes('pdf') ? 'edital' : 'pagina_oficial'),
    sourceType: official ? 'oficial' : 'secundaria', referencePeriod, userId });
}

function ftsQuery(q) {
  const terms = String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
  if (!terms.length) return null;
  return [...new Set(terms)].map((t) => `"${t}"*`).join(' OR ');
}
const STOP = new Set(['para', 'com', 'que', 'dos', 'das', 'uma', 'por', 'como', 'qual', 'quais', 'sao', 'nos', 'nas', 'the', 'mais', 'sobre', 'esta', 'este']);

export function search(query, { institution = null, limit = 6 } = {}) {
  const fq = ftsQuery(query);
  if (!fq) return [];
  const rows = getDb().prepare(`SELECT c.id, c.text, c.document_id, d.title, d.url, d.institution, d.kind, d.source_type, d.fetched_at, d.reference_period,
      bm25(chunks_fts) score
    FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN documents d ON d.id = c.document_id
    WHERE chunks_fts MATCH ? ${institution ? 'AND d.institution = ?' : ''}
    ORDER BY score LIMIT ?`).all(...[fq, ...(institution ? [institution] : []), limit]);
  return rows.map((r) => ({
    chunk_id: r.id, document_id: r.document_id, title: r.title, url: r.url, institution: r.institution, kind: r.kind,
    source_type: r.source_type, fetched_at: r.fetched_at, reference_period: r.reference_period, text: r.text,
  }));
}

export function listDocuments() {
  return getDb().prepare(`SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) chunks FROM documents d ORDER BY fetched_at DESC`).all();
}

export function deleteDocument(id) {
  getDb().prepare('DELETE FROM documents WHERE id=?').run(id);
}

/** Indexa os fatos oficiais coletados (com fonte) como documentos pesquisáveis. */
export function indexFactsAsDocuments(facts) {
  let n = 0;
  for (const f of facts) {
    const text = `${f.title}\nInstituição: ${f.institution}\nPeríodo de referência: ${f.reference_period || 'não informado'}\nValor: ${
      typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}\nDetalhe: ${f.detail || ''}\nObservações: ${f.notes || ''}\nVerificado: ${f.verified ? 'sim' : 'não'} (${f.source_type})`;
    const r = addDocument({ title: `${f.institution}: ${f.title}`, text, url: f.source_url, institution: f.institution, kind: 'ficha_oficial',
      sourceType: f.source_type || 'oficial', referencePeriod: f.reference_period });
    if (!r.duplicate) n++;
  }
  return n;
}

export { J };
