// Professora por voz: reconhecimento de fala (Web Speech API) + síntese de voz em pt-BR.
// Funciona no Chrome/Edge (desktop e Android) e no Safari (iOS 14.5+). Sem custo adicional.
export function speechSupport() {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  return { recognition: !!SR, synthesis: typeof window !== 'undefined' && 'speechSynthesis' in window };
}

export function listen({ onResult, onEnd, onError, interim = true }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError?.(new Error('Reconhecimento de voz não suportado neste navegador.')); return null; }
  const r = new SR();
  r.lang = 'pt-BR';
  r.interimResults = interim;
  r.continuous = false;
  r.onresult = (e) => {
    let text = '';
    for (const res of e.results) text += res[0].transcript;
    onResult?.(text, e.results[e.results.length - 1].isFinal);
  };
  r.onerror = (e) => onError?.(new Error(e.error === 'not-allowed' ? 'Permita o uso do microfone.' : `Erro de voz: ${e.error}`));
  r.onend = () => onEnd?.();
  r.start();
  return r;
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'pt-BR' && /female|feminina|luciana|francisca|maria/i.test(v.name))
    || voices.find((v) => v.lang === 'pt-BR') || voices.find((v) => v.lang?.startsWith('pt'));
}

export function speak(text, { rate = 1.02, onEnd } = {}) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  // Divide em frases para evitar cortes em textos longos (bug conhecido do Chrome).
  const parts = String(text).match(/[^.!?\n]+[.!?]?/g) || [text];
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = 'pt-BR'; u.rate = rate;
    const v = pickVoice(); if (v) u.voice = v;
    if (i === parts.length - 1 && onEnd) u.onend = onEnd;
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
