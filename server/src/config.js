// Configuração central. Todas as chaves ficam APENAS no servidor (variáveis de ambiente).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// Carrega server/.env se existir (formato KEY=VALUE simples), sem sobrescrever o ambiente.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|sim)$/i.test(v));

export const config = {
  port: Number(process.env.PORT || 3001),
  env: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'aprova.db'),
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
  webDist: process.env.WEB_DIST || path.resolve(ROOT, '..', 'web', 'dist'),
  ai: {
    // Sem ANTHROPIC_API_KEY a IA fica DESATIVADA e a interface mostra exatamente o que falta.
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-opus-5-5',
    // Modelo para tarefas auxiliares (classificação, geração em lote). Por padrão, o mesmo.
    fastModel: process.env.AI_FAST_MODEL || process.env.AI_MODEL || 'claude-opus-5-5',
    effort: process.env.AI_EFFORT || 'medium',
    // Fallback no servidor quando o classificador de segurança recusar (ex.: biologia/microbiologia).
    serverFallback: bool(process.env.AI_SERVER_FALLBACK, true),
    // Busca na web restrita a domínios oficiais (custo extra por busca).
    webSearch: bool(process.env.AI_WEB_SEARCH, true),
    maxTokens: Number(process.env.AI_MAX_TOKENS || 16000),
  },
  // Domínios considerados fontes oficiais para RAG/busca web.
  officialDomains: (process.env.OFFICIAL_DOMAINS ||
    'gov.br,inep.gov.br,mec.gov.br,uft.edu.br,ufnt.edu.br,ufma.br,ifma.edu.br,in.gov.br').split(',').map((s) => s.trim()).filter(Boolean),
};

export function aiStatus() {
  return {
    configured: !!config.ai.apiKey,
    model: config.ai.model,
    webSearch: config.ai.webSearch,
    missing: config.ai.apiKey ? [] : ['ANTHROPIC_API_KEY (defina em server/.env ou no ambiente do servidor)'],
  };
}
