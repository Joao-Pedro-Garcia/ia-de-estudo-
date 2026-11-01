// Cliente da API (cookies de sessão httpOnly; nenhuma chave no frontend).
export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

async function req(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* vazio */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Erro ${res.status}`, data?.code);
  return data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b = {}) => req('PUT', u, b),
  patch: (u, b = {}) => req('PATCH', u, b),
  del: (u) => req('DELETE', u),
};

/** POST com resposta em Server-Sent Events. handlers: { delta, tool, done, error, user_message } */
export async function streamPost(url, body, handlers, signal) {
  const res = await fetch('/api' + url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    let msg = `Erro ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* */ }
    handlers.error?.({ message: msg });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message'; let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) ev = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) { try { handlers[ev]?.(JSON.parse(data)); } catch { /* */ } }
    }
  }
}

/** Lê arquivo de imagem, reduz para no máx. 1600px e devolve {data(base64), media_type, preview}. */
export function readImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL('image/jpeg', 0.85);
        resolve({ data: url.split(',')[1], media_type: 'image/jpeg', preview: url });
      };
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
