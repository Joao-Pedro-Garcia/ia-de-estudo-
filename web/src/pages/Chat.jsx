// Área de conversa com a professora: histórico por matéria, imagens, modos de resposta e voz.
import { useEffect, useRef, useState } from 'react';
import { api, readImage, streamPost } from '../lib/api.js';
import { go } from '../lib/router.js';
import { listen, speak, speechSupport, stopSpeaking } from '../lib/voice.js';
import { stripMd } from '../lib/md.js';
import { ErrorBox, Icon, Loading, Md, useCurriculum, useLoad } from '../components/ui.jsx';

const MODES = [['auto', 'Automático'], ['direta', 'Explicação direta'], ['aula', 'Aula completa'], ['resolucao', 'Resolução comentada'], ['exemplos', 'Exemplos'], ['exercicios', 'Exercícios'], ['revisao', 'Revisão'], ['objetiva', 'Resposta objetiva']];
const TOOL_LABEL = { buscar_documentos_oficiais: 'consultando documentos oficiais', consultar_central_medicina: 'consultando a Central de Medicina', consultar_desempenho: 'verificando seu desempenho', buscar_questao_do_banco: 'buscando questão no banco', registrar_resposta: 'registrando sua resposta', registrar_observacao: 'anotando na sua memória', criar_flashcards: 'criando flashcards', adicionar_ao_plano: 'atualizando seu plano', web_search: 'pesquisando em sites oficiais' };

export default function Chat({ me, convId, query }) {
  const curr = useCurriculum();
  const [filter, setFilter] = useState('');
  const list = useLoad(() => api.get(`/conversations${filter ? `?discipline=${filter}` : ''}`), [filter]);
  const [conv, setConv] = useState(null);
  const [text, setText] = useState(query?.q || '');
  const [images, setImages] = useState([]);
  const [mode, setMode] = useState('auto');
  const [streaming, setStreaming] = useState(null);
  const [tool, setTool] = useState(null);
  const [err, setErr] = useState(null);
  const [showList, setShowList] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const sup = speechSupport();

  useEffect(() => {
    setErr(null);
    if (convId) api.get(`/conversations/${convId}`).then(setConv).catch(setErr);
    else setConv(null);
  }, [convId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages?.length, streaming]);
  useEffect(() => () => stopSpeaking(), []);

  const newConv = async (discipline = null) => {
    const c = await api.post('/conversations', { discipline: discipline || undefined, title: 'Nova conversa' });
    list.reload();
    go(`/professora/${c.id}`);
    return c;
  };

  const send = async (overrideText) => {
    const body = (overrideText ?? text).trim();
    if (!body && !images.length) return;
    setErr(null);
    let c = conv;
    if (!c) c = await newConv(filter || null);
    const imgs = images.map(({ data, media_type }) => ({ data, media_type }));
    const optimistic = { id: `tmp${Date.now()}`, role: 'user', content: body, localImages: images.map((i) => i.preview) };
    setConv((cv) => ({ ...(cv || c), messages: [...((cv || c).messages || []), optimistic] }));
    setText(''); setImages([]); setStreaming(''); setTool(null);
    let acc = '';
    await streamPost(`/conversations/${c.id}/messages`, { text: body, images: imgs, mode, voice: voiceMode }, {
      delta: (d) => { acc += d.text; setStreaming(acc); },
      tool: (t) => setTool(TOOL_LABEL[t.name] || t.name),
      done: (d) => {
        setConv((cv) => ({ ...cv, messages: [...cv.messages, { id: d.id, role: 'assistant', content: d.text, meta: { citations: d.citations } }] }));
        setStreaming(null); setTool(null); list.reload();
        if (voiceMode) speak(stripMd(d.text));
      },
      error: (e) => {
        setStreaming(null); setTool(null);
        setConv((cv) => ({ ...cv, messages: cv.messages.filter((m) => m.id !== optimistic.id) }));
        setText(body);
        setErr({ message: e.message, code: e.code });
      },
    });
  };

  const mic = () => {
    if (listening) { recRef.current?.stop(); return; }
    stopSpeaking();
    setListening(true);
    recRef.current = listen({
      onResult: (t, final) => { setText(t); if (final && voiceMode) { setListening(false); send(t); } },
      onEnd: () => setListening(false),
      onError: (e) => { setListening(false); setErr(e); },
    });
  };

  const addImage = async (e) => {
    const files = [...e.target.files].slice(0, 3 - images.length);
    try { const r = await Promise.all(files.map((f) => readImage(f))); setImages((x) => [...x, ...r]); } catch (x) { setErr(x); }
    e.target.value = '';
  };

  return (
    <div className="chat">
      <aside className={`card convlist ${showList ? 'open' : ''}`}>
        <button className="btn primary block" onClick={() => newConv(filter || null)}><Icon name="plus" /> Nova conversa</button>
        <select style={{ margin: '10px 0' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por matéria">
          <option value="">Todas as matérias</option>
          {curr.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {list.loading ? <Loading /> : (list.data || []).map((c) => (
          <a key={c.id} href={`#/professora/${c.id}`} className={c.id === convId ? 'active' : ''} onClick={() => setShowList(false)}>
            <div className="t">{c.title}</div>
            <div className="faint">{c.discipline_name || 'Geral'}{c.mode === 'aula' ? ' · aula' : ''} · {c.n} msgs</div>
          </a>
        ))}
        {list.data?.length === 0 && <p className="faint">Nenhuma conversa ainda.</p>}
      </aside>
      <section className="chatpane">
        <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <button className="btn small hide-desktop" onClick={() => setShowList(!showList)}><Icon name="menu" /> Conversas</button>
          <strong style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv?.title || 'Professora Aurora'}</strong>
          {sup.recognition && sup.synthesis && (
            <button className={`chip ${voiceMode ? 'on' : ''}`} onClick={() => { setVoiceMode(!voiceMode); stopSpeaking(); }} title="Conversa por voz">
              <Icon name="speaker" size={16} /> Aula por voz
            </button>
          )}
        </div>
        <div className="msgs" aria-live="polite">
          {!conv?.messages?.length && streaming === null && (
            <div className="stack" style={{ margin: 'auto', maxWidth: 520, textAlign: 'center' }}>
              <h2>Oi, {me.profile?.nome || me.user.name}! Sobre o que vamos estudar?</h2>
              <p className="muted">Pergunte qualquer conteúdo, peça uma aula, envie a foto de uma questão ou peça um exercício. Eu uso o seu histórico para adaptar a explicação.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                {['Me explique mitose x meiose do zero', 'Quero treinar estequiometria', 'Quais os pesos do SISU para Medicina na UFT?', 'Corrija meu raciocínio nesta questão'].map((s) => (
                  <button key={s} className="chip" onClick={() => setText(s)}>{s}</button>
                ))}
              </div>
              {!me.ai.configured && <div className="alert warn">A IA não está ativada neste servidor (falta ANTHROPIC_API_KEY). As mensagens não poderão ser respondidas até a configuração.</div>}
            </div>
          )}
          {conv?.messages?.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.localImages?.map((p, i) => <img key={i} src={p} alt="Imagem enviada" />)}
              {m.images?.map((im) => <img key={im.id} src={`/api/images/${im.id}`} alt="Imagem enviada" loading="lazy" />)}
              <Md>{m.content}</Md>
              {m.role === 'assistant' && (
                <div className="row" style={{ marginTop: 6 }}>
                  {sup.synthesis && <button className="btn small ghost" onClick={() => speak(stripMd(m.content))} aria-label="Ouvir resposta"><Icon name="speaker" size={16} /> Ouvir</button>}
                </div>
              )}
              {m.meta?.citations?.length > 0 && (
                <div className="cites"><strong>Fontes consultadas:</strong>
                  {m.meta.citations.slice(0, 6).map((c) => <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer">{c.title}{c.fetched_at ? ` (coletado em ${String(c.fetched_at).slice(0, 10)})` : ''}{c.source_type === 'secundaria' ? ' — fonte secundária' : ''}</a>)}
                </div>
              )}
            </div>
          ))}
          {streaming !== null && (
            <div className="msg assistant">
              {tool && <div className="typing">🔎 {tool}…</div>}
              {streaming ? <Md>{streaming}</Md> : !tool && <div className="typing">A professora está pensando…</div>}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="composer">
          <ErrorBox error={err} />
          <div className="modes" role="group" aria-label="Tipo de resposta">
            {MODES.map(([k, t]) => <button key={k} className={`chip ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{t}</button>)}
          </div>
          {images.length > 0 && <div className="row">{images.map((im, i) => (
            <div key={i} style={{ position: 'relative' }}><img src={im.preview} alt="" style={{ height: 56, borderRadius: 8 }} />
              <button className="btn small" style={{ position: 'absolute', top: -6, right: -6, minHeight: 22, padding: '0 6px' }} onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remover imagem">×</button></div>
          ))}</div>}
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <label className="btn" title="Enviar foto de exercício" style={{ flexShrink: 0 }}>
              <Icon name="img" /><span className="sr">Anexar imagem</span>
              <input type="file" accept="image/*" capture="environment" multiple hidden onChange={addImage} />
            </label>
            {sup.recognition && <button className={`btn ${listening ? 'primary' : ''}`} onClick={mic} title="Falar" style={{ flexShrink: 0 }}><Icon name="mic" /><span className="sr">Falar</span></button>}
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? 'Ouvindo…' : 'Escreva sua dúvida…'} rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); if (streaming === null) send(); } }} />
            <button className="btn primary" disabled={streaming !== null || (!text.trim() && !images.length)} onClick={() => send()} style={{ flexShrink: 0 }} aria-label="Enviar"><Icon name="send" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
