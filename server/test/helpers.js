// Utilitários de teste: banco temporário + app em porta aleatória + cliente HTTP com cookie.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function startTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aprova-test-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
  process.env.ANTHROPIC_API_KEY = '';
  const { config } = await import('../src/config.js');
  config.dbPath = process.env.DB_PATH;
  config.ai.apiKey = '';
  const { openDb, setDb } = await import('../src/db.js');
  setDb(openDb(process.env.DB_PATH));
  const { seedQuestions } = await import('../src/services/questions.js');
  const { seedOfficialData } = await import('../src/services/universities.js');
  seedQuestions();
  seedOfficialData();
  const { createApp } = await import('../src/app.js');
  const server = await new Promise((resolve) => { const s = createApp().listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { server, base, dir, close: () => new Promise((r) => server.close(r)) };
}

export function client(base) {
  let cookie = '';
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  }
  async function stream(url, body) {
    const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
    return res.text();
  }
  return {
    stream, cookie: () => cookie,
    get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b),
    patch: (u, b = {}) => call('PATCH', u, b), del: (u) => call('DELETE', u),
  };
}
