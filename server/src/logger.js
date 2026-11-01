// Logger estruturado simples (JSON por linha). Nunca registra senhas, tokens ou conteúdo de chaves.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 20;

function write(level, msg, extra) {
  if (LEVELS[level] < min) return;
  const line = { t: new Date().toISOString(), level, msg, ...(extra || {}) };
  const out = JSON.stringify(line);
  if (level === 'error' || level === 'warn') process.stderr.write(out + '\n');
  else process.stdout.write(out + '\n');
}

export const log = {
  debug: (m, e) => write('debug', m, e),
  info: (m, e) => write('info', m, e),
  warn: (m, e) => write('warn', m, e),
  error: (m, e) => write('error', m, e),
};
