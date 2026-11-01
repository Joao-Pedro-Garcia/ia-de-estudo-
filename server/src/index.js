// Ponto de entrada do servidor.
import { config, aiStatus } from './config.js';
import { getDb } from './db.js';
import { log } from './logger.js';
import { createApp } from './app.js';
import { seedQuestions } from './services/questions.js';
import { seedOfficialData } from './services/universities.js';

getDb();
const nq = seedQuestions();
const off = seedOfficialData();
log.info('acervo carregado', { questoes: nq, fatos_oficiais: off.facts, eventos: off.events });
const ai = aiStatus();
if (!ai.configured) log.warn('IA DESATIVADA: defina ANTHROPIC_API_KEY em server/.env para ativar a professora.', { missing: ai.missing });

createApp().listen(config.port, () => log.info(`Aprova Federal AI ouvindo em http://localhost:${config.port}`, { model: ai.model, ai: ai.configured }));

process.on('unhandledRejection', (e) => log.error('unhandledRejection', { err: String(e?.stack || e) }));
