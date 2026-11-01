// Markdown -> HTML sanitizado (DOMPurify). Conteúdo da IA nunca é inserido sem sanitização.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
});

export function mdToHtml(src) {
  return DOMPurify.sanitize(marked.parse(String(src || '')), { USE_PROFILES: { html: true } });
}

export function stripMd(src) {
  return String(src || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_>`|]/g, ' ').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/\s+/g, ' ').trim();
}
