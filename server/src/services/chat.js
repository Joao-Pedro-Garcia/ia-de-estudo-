// Conversas com a professora: histórico persistente por matéria, imagens de exercícios, streaming.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../config.js';
import { getDb, J } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { getDiscipline } from '../content/curriculum.js';
import { runAgent } from '../ai/provider.js';
import { buildSystem, tutorTools, historyForModel, RESPONSE_MODES } from '../ai/tutor.js';
import { getLesson } from './lessons.js';

const UPLOADS = path.join(ROOT, 'data', 'uploads');
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function createConversation(userId, { title, discipline = null, topic = null, mode = 'chat' }) {
  if (discipline && !getDiscipline(discipline)) throw bad('Disciplina inválida');
  const t = (title || (discipline ? `Conversa de ${getDiscipline(discipline).name}` : 'Nova conversa')).slice(0, 120);
  const id = getDb().prepare('INSERT INTO conversations (user_id, title, discipline, topic, mode) VALUES (?,?,?,?,?)').run(userId, t, discipline, topic, mode).lastInsertRowid;
  return getConversation(userId, Number(id));
}

export function getConversation(userId, id) {
  const c = getDb().prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(id, userId);
  if (!c) throw notFound('Conversa não encontrada');
  const messages = getDb().prepare('SELECT id, role, content, images, meta, created_at FROM messages WHERE conversation_id=? ORDER BY id').all(id)
    .map((m) => ({ ...m, images: J.parse(m.images, []).map((im) => ({ id: im.id, media_type: im.media_type })), meta: J.parse(m.meta, {}) }));
  return { ...c, discipline_name: c.discipline ? getDiscipline(c.discipline)?.name : null, messages };
}

export function listConversations(userId, { discipline } = {}) {
  return getDb().prepare(`SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) n,
      (SELECT substr(content,1,140) FROM messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) last
    FROM conversations c WHERE c.user_id=? ${discipline ? 'AND c.discipline=?' : ''} ORDER BY c.updated_at DESC LIMIT 200`)
    .all(...[userId, ...(discipline ? [discipline] : [])]).map((c) => ({ ...c, discipline_name: c.discipline ? getDiscipline(c.discipline)?.name : null }));
}

export function renameConversation(userId, id, title) {
  getConversation(userId, id);
  getDb().prepare('UPDATE conversations SET title=? WHERE id=?').run(String(title).slice(0, 120), id);
}

export function deleteConversation(userId, id) {
  getConversation(userId, id);
  getDb().prepare('DELETE FROM conversations WHERE id=?').run(id);
}

/** Salva imagem enviada (base64) em disco, fora do banco. Retorna metadado. */
export function saveImage(userId, { data, media_type }) {
  if (!IMG_TYPES[media_type]) throw bad('Formato de imagem não suportado (use JPG, PNG, WEBP ou GIF)');
  const buf = Buffer.from(String(data), 'base64');
  if (buf.length > 5 * 1024 * 1024) throw bad('Imagem muito grande (máx. 5 MB). Tente uma foto com menor resolução.');
  const id = crypto.randomBytes(12).toString('hex');
  const dir = path.join(UPLOADS, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.${IMG_TYPES[media_type]}`), buf);
  return { id, media_type };
}

export function imagePath(userId, imageId) {
  if (!/^[a-f0-9]{24}$/.test(imageId)) return null;
  const dir = path.join(UPLOADS, String(userId));
  for (const ext of Object.values(IMG_TYPES)) {
    const p = path.join(dir, `${imageId}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function imageLoader(userId) {
  return (im) => {
    const p = imagePath(userId, im.id);
    if (!p) return null;
    return { type: 'image', source: { type: 'base64', media_type: im.media_type, data: fs.readFileSync(p).toString('base64') } };
  };
}

/**
 * Envia uma mensagem e transmite a resposta. emit(event, data) envia eventos SSE.
 * Se a IA falhar, a mensagem da estudante é removida e o erro é informado (o app devolve o texto à caixa).
 */
export async function sendMessage(userId, conversationId, { text, images = [], mode = 'auto', voice = false }, emit) {
  const conv = getDb().prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(conversationId, userId);
  if (!conv) throw notFound('Conversa não encontrada');
  if ((!text || !text.trim()) && !images.length) throw bad('Mensagem vazia');
  if (text && text.length > 12000) throw bad('Mensagem muito longa');
  if (images.length > 3) throw bad('Máximo de 3 imagens por mensagem');
  if (mode && !RESPONSE_MODES[mode]) throw bad('Modo inválido');
  const saved = images.map((im) => saveImage(userId, im));
  const db = getDb();
  const userMsgId = Number(db.prepare('INSERT INTO messages (conversation_id, role, content, images) VALUES (?,?,?,?)')
    .run(conversationId, 'user', (text || '').trim(), saved.length ? J.str(saved) : null).lastInsertRowid);
  emit('user_message', { id: userMsgId });
  let extra = '';
  if (conv.mode === 'aula') {
    const lesson = db.prepare('SELECT id FROM lessons WHERE conversation_id=? AND user_id=?').get(conversationId, userId);
    if (lesson) {
      const l = getLesson(userId, lesson.id);
      extra = `\n# AULA EM ANDAMENTO\nA estudante está estudando a aula "${l.title}" (${l.discipline_name}). Conteúdo resumido da aula: ${(l.content?.summary || '').slice(0, 3000)}\nResponda às perguntas dela no contexto desta aula; se a dúvida revelar lacuna de pré-requisito, diga e retome a base.`;
    }
  }
  try {
    const result = await runAgent({
      system: buildSystem(userId, { mode, discipline: conv.discipline, voice, extra }),
      messages: historyForModel(conversationId, { imageLoader: imageLoader(userId) }),
      tools: tutorTools(userId, { conversationId }),
      webSearch: true,
      feature: voice ? 'chat_voz' : 'chat',
      userId,
      onText: (d) => emit('delta', { text: d }),
      onTool: (t) => emit('tool', { name: t.name, isError: t.isError }),
      effort: mode === 'objetiva' ? 'low' : undefined,
    });
    const meta = { citations: result.citations, tools: result.toolCalls.map((t) => t.name), mode };
    const asstId = Number(db.prepare('INSERT INTO messages (conversation_id, role, content, meta) VALUES (?,?,?,?)')
      .run(conversationId, 'assistant', result.text || '(sem resposta)', J.str(meta)).lastInsertRowid);
    const n = db.prepare('SELECT COUNT(*) n FROM messages WHERE conversation_id=?').get(conversationId).n;
    if (n <= 2 && text && conv.title.startsWith('Nova conversa')) {
      db.prepare('UPDATE conversations SET title=? WHERE id=?').run(text.trim().slice(0, 60), conversationId);
    }
    db.prepare("UPDATE conversations SET updated_at=datetime('now') WHERE id=?").run(conversationId);
    emit('done', { id: asstId, text: result.text, citations: result.citations, tools: meta.tools });
    return { id: asstId };
  } catch (e) {
    db.prepare('DELETE FROM messages WHERE id=?').run(userMsgId);
    throw e;
  }
}
