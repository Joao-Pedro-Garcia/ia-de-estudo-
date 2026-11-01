// Montagem do app Express (separado de index.js para permitir testes).
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';
import { api } from './routes/api.js';
import { HttpError } from './lib/http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
    next();
  });
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  // Proteção CSRF simples: requisições que alteram estado precisam vir da própria origem (fetch com JSON).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.is('application/json') && req.headers['content-length'] && req.headers['content-length'] !== '0') {
      return next(new HttpError(415, 'Envie JSON'));
    }
    const origin = req.headers.origin;
    if (origin && req.headers.host && new URL(origin).host !== req.headers.host && config.env === 'production') {
      return next(new HttpError(403, 'Origem não permitida'));
    }
    next();
  });
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api')) log.info('req', { m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - t });
    });
    next();
  });
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

  // Frontend compilado (web/dist), com fallback de SPA.
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo muito grande' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'JSON inválido' });
    const status = err.status || 500;
    if (status >= 500) log.error('erro', { p: req.path, err: err.message, stack: err.stack });
    res.status(status).json({ error: status >= 500 && !err.status ? 'Erro interno. Tente novamente.' : err.message, code: err.details?.code || null });
  });
  return app;
}
