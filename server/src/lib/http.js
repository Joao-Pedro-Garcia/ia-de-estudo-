// Utilitários HTTP: erros tipados, wrapper assíncrono e validação mínima de entrada.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'Não encontrado') => new HttpError(404, msg);
export const forbidden = (msg = 'Acesso negado') => new HttpError(403, msg);

/** Envolve handlers async para encaminhar erros ao middleware de erro. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validação simples de campos. spec: { campo: 'string'|'number'|'int'|'bool'|'array'|'object'|'?string'... } */
export function pick(body, spec) {
  const out = {};
  const src = body || {};
  for (const [k, t] of Object.entries(spec)) {
    const optional = t.startsWith('?');
    const type = optional ? t.slice(1) : t;
    const v = src[k];
    if (v === undefined || v === null || v === '') {
      if (!optional) throw bad(`Campo obrigatório: ${k}`);
      continue;
    }
    const ok = {
      string: typeof v === 'string',
      number: typeof v === 'number' && Number.isFinite(v),
      int: Number.isInteger(v),
      bool: typeof v === 'boolean',
      array: Array.isArray(v),
      object: typeof v === 'object' && !Array.isArray(v),
    }[type];
    if (!ok) throw bad(`Campo inválido: ${k} (esperado ${type})`);
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export function clampStr(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) : s;
}
