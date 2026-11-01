// Camada de acesso ao modelo de linguagem (Claude, via SDK oficial @anthropic-ai/sdk).
// - A chave existe apenas no servidor (config.ai.apiKey).
// - Sem chave, todas as funções lançam AiNotConfigured: NENHUMA resposta simulada é produzida.
// - Fallback no servidor (`fallbacks: "default"`) para recusas de classificadores de segurança
//   — importante numa plataforma de Biologia/Medicina (microbiologia, parasitologia, fármacos).
// - O histórico persistido guarda apenas TEXTO; blocos de "thinking" nunca são reenviados entre
//   requisições, então o histórico é sempre válido (append-only, sem reescrita de blocos assinados).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { log } from '../logger.js';
import { HttpError } from '../lib/http.js';

export class AiNotConfigured extends HttpError {
  constructor() {
    super(503, 'A professora de IA ainda não está ativada: falta configurar ANTHROPIC_API_KEY no servidor. Veja o README (seção "Ativando a IA").', { code: 'AI_NOT_CONFIGURED' });
  }
}

let client = null;
let testDouble = null;

/** Permite aos testes automatizados injetar um cliente falso (nunca usado em produção). */
export function __setTestClient(c) { testDouble = c; }

export function aiEnabled() {
  return !!(testDouble || config.ai.apiKey);
}

function getClient() {
  if (testDouble) return testDouble;
  if (!config.ai.apiKey) throw new AiNotConfigured();
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

function baseParams({ model, maxTokens, effort, system }) {
  const p = {
    model: model || config.ai.model,
    max_tokens: maxTokens || config.ai.maxTokens,
    output_config: { effort: effort || config.ai.effort },
    system,
  };
  if (config.ai.serverFallback && !testDouble) {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}

function recordUsage({ userId, feature, model, usage, ok = true, error = null }) {
  try {
    getDb().prepare('INSERT INTO ai_usage (user_id, feature, model, input_tokens, output_tokens, ok, error) VALUES (?,?,?,?,?,?,?)')
      .run(userId ?? null, feature, model ?? null, usage?.input_tokens ?? null, usage?.output_tokens ?? null, ok ? 1 : 0, error);
  } catch (e) {
    log.warn('falha ao registrar uso de IA', { err: e.message });
  }
}

function translateError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new HttpError(503, 'A chave da API de IA é inválida. Verifique ANTHROPIC_API_KEY.', { code: 'AI_AUTH' });
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'A IA está com muitas solicitações agora. Tente de novo em instantes.', { code: 'AI_RATE' });
  if (err instanceof Anthropic.BadRequestError) return new HttpError(502, 'A IA rejeitou a solicitação (requisição inválida).', { code: 'AI_BAD_REQUEST' });
  if (err instanceof Anthropic.APIError) return new HttpError(502, `Falha temporária na IA (${err.status ?? 'rede'}). Tente novamente.`, { code: 'AI_UPSTREAM' });
  return new HttpError(502, 'Falha ao contatar a IA. Tente novamente.', { code: 'AI_UNKNOWN' });
}

const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('');

/**
 * Laço de agente com ferramentas do cliente (+ busca web oficial opcional), com streaming de texto.
 * tools: [{ name, description, input_schema, run: async (input) => string|object }]
 * Retorna { text, citations, toolCalls, stopReason }.
 */
export async function runAgent({ system, messages, tools = [], webSearch = false, feature, userId, onText, onTool, maxIterations = 8, effort }) {
  const c = getClient();
  const params = baseParams({ system, effort });
  const toolDefs = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  if (webSearch && config.ai.webSearch) {
    toolDefs.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 4, allowed_domains: config.officialDomains });
  }
  const convo = [...messages];
  const citations = [];
  const toolCalls = [];
  let finalText = '';
  let stopReason = null;
  try {
    for (let i = 0; i < maxIterations; i++) {
      const stream = c.beta.messages.stream({ ...params, tools: toolDefs.length ? toolDefs : undefined, messages: convo });
      if (onText) stream.on('text', (d) => onText(d));
      const msg = await stream.finalMessage();
      recordUsage({ userId, feature, model: msg.model, usage: msg.usage });
      stopReason = msg.stop_reason;
      finalText += textOf(msg.content);
      for (const b of msg.content) {
        if (b.type === 'text' && Array.isArray(b.citations)) {
          for (const ci of b.citations) if (ci.url) citations.push({ url: ci.url, title: ci.title || ci.url, origin: 'web' });
        }
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const r of b.content) if (r.url) citations.push({ url: r.url, title: r.title || r.url, origin: 'web', page_age: r.page_age || null });
        }
      }
      if (msg.stop_reason === 'refusal') {
        finalText += finalText ? '' : 'Não consegui responder a essa solicitação. Reformule a pergunta com foco no conteúdo de estudo.';
        break;
      }
      if (msg.stop_reason === 'pause_turn') {
        convo.push({ role: 'assistant', content: msg.content });
        continue;
      }
      if (msg.stop_reason !== 'tool_use') break;
      const uses = msg.content.filter((b) => b.type === 'tool_use');
      convo.push({ role: 'assistant', content: msg.content });
      const results = [];
      for (const u of uses) {
        const tool = tools.find((t) => t.name === u.name);
        let content; let isError = false;
        try {
          if (!tool) throw new Error(`ferramenta desconhecida: ${u.name}`);
          const out = await tool.run(u.input || {});
          content = typeof out === 'string' ? out : JSON.stringify(out);
          if (out && out.__citations) citations.push(...out.__citations);
        } catch (e) {
          isError = true;
          content = `Erro: ${e.message}`;
        }
        toolCalls.push({ name: u.name, input: u.input, isError });
        if (onTool) onTool({ name: u.name, input: u.input, isError });
        results.push({ type: 'tool_result', tool_use_id: u.id, content, is_error: isError || undefined });
      }
      convo.push({ role: 'user', content: results });
      if (finalText && !finalText.endsWith('\n')) { finalText += '\n\n'; if (onText) onText('\n\n'); }
    }
  } catch (err) {
    log.error('erro na IA (agente)', { feature, err: err.message, status: err.status });
    recordUsage({ userId, feature, ok: false, error: String(err.message).slice(0, 300) });
    throw translateError(err);
  }
  const uniq = [];
  const seen = new Set();
  for (const c2 of citations) { if (!seen.has(c2.url)) { seen.add(c2.url); uniq.push(c2); } }
  return { text: finalText.trim(), citations: uniq, toolCalls, stopReason };
}

/**
 * Gera JSON validado por esquema (structured outputs). content pode conter imagens.
 */
export async function generateJSON({ system, content, schema, feature, userId, effort, maxTokens = 32000, model }) {
  const c = getClient();
  const params = baseParams({ system, effort, maxTokens, model });
  try {
    const stream = c.beta.messages.stream({
      ...params,
      output_config: { ...params.output_config, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    });
    const msg = await stream.finalMessage();
    recordUsage({ userId, feature, model: msg.model, usage: msg.usage });
    if (msg.stop_reason === 'refusal') throw new HttpError(422, 'A IA não pôde gerar este conteúdo. Tente reformular.', { code: 'AI_REFUSAL' });
    if (msg.stop_reason === 'max_tokens') throw new HttpError(502, 'A resposta da IA ficou incompleta (limite de tamanho). Tente novamente.', { code: 'AI_TRUNCATED' });
    const raw = textOf(msg.content);
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(502, 'A IA retornou um formato inválido. Tente novamente.', { code: 'AI_BAD_JSON' });
    }
  } catch (err) {
    if (!(err instanceof HttpError)) {
      log.error('erro na IA (json)', { feature, err: err.message, status: err.status });
      recordUsage({ userId, feature, ok: false, error: String(err.message).slice(0, 300) });
    }
    throw translateError(err);
  }
}

/** Helper para esquemas compatíveis com structured outputs (objetos fechados, todos os campos obrigatórios). */
export function obj(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
export const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
export const int = (description) => ({ type: 'integer', ...(description ? { description } : {}) });
export const arr = (items, description) => ({ type: 'array', items, ...(description ? { description } : {}) });
export const en = (values, description) => ({ type: 'string', enum: values, ...(description ? { description } : {}) });
