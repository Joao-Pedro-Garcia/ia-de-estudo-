// Roteador por hash (funciona em qualquer hospedagem estática e no PWA).
import { useEffect, useState } from 'react';

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const h = () => { setHash(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const [path, qs] = hash.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export const go = (to) => { window.location.hash = to; };
