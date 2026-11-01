import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBox, Loading, Progress, QuestionCard } from '../components/ui.jsx';

export default function Diagnostic({ me, onDone }) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const next = () => api.get('/diagnostic/next').then(setStep).catch(setErr);
  const start = async () => { setErr(null); try { await api.post('/diagnostic/start'); setStarted(true); await next(); } catch (x) { setErr(x); } };
  useEffect(() => { api.get('/diagnostic/report').then((r) => { if (r.current?.status === 'em_andamento') { setStarted(true); next(); } }).catch(() => {}); }, []);
  const finish = async () => { setBusy(true); setErr(null); try { await api.post('/diagnostic/finish'); onDone(); } catch (x) { setErr(x); } finally { setBusy(false); } };

  if (!started) {
    return (
      <div className="center-wrap"><div className="panel stack">
        <Progress value={50} />
        <div className="card stack">
          <h2>Etapa 2 de 2 · Teste de nivelamento</h2>
          <p>Agora vou descobrir o que você já sabe. São cerca de <strong>45 questões</strong> de Matemática, Biologia, Química, Física, Português, Interpretação, Literatura, História, Geografia, Filosofia e Sociologia.</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Começo no nível básico; se você acertar, a próxima fica mais difícil; se errar, mais fácil.</li>
            <li>Marque com honestidade se teve <strong>certeza, dúvida ou chutou</strong>. Acerto por chute não conta como domínio.</li>
            <li>Não mostro o gabarito durante o teste, para não influenciar as próximas respostas.</li>
            <li>Pode parar quando quiser: o progresso é salvo a cada resposta.</li>
          </ul>
          <ErrorBox error={err} />
          <button className="btn primary block" onClick={start}>Iniciar o teste</button>
        </div>
      </div></div>
    );
  }
  if (!step) return err ? <div className="center-wrap"><div className="panel"><ErrorBox error={err} onRetry={next} /></div></div> : <Loading />;

  return (
    <div className="center-wrap"><div className="panel stack">
      <div className="row between"><strong>{step.discipline_name || 'Diagnóstico'}</strong><span className="faint">{step.progress.answered} de {step.progress.total} respondidas</span></div>
      <Progress value={50 + step.progress.pct / 2} />
      {step.why && <div className="why"><strong>Por que esta disciplina:</strong> {step.why}</div>}
      <ErrorBox error={err} />
      {step.question && (
        <QuestionCard key={step.question.id} q={step.question} showMeta
          onAnswer={async ({ chosen, confidence }) => {
            setErr(null);
            try { await api.post('/diagnostic/answer', { questionId: step.question.id, chosen, confidence }); await next(); } catch (x) { setErr(x); }
          }} />
      )}
      {step.discursive && (
        <div className="card stack">
          <h3>Resposta escrita curta</h3>
          <p>{step.prompt}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva aqui…" />
          <div className="row">
            <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { await api.post('/diagnostic/discursive', { skip: true }); await next(); } catch (x) { setErr(x); } finally { setBusy(false); } }}>Pular</button>
            <button className="btn primary" disabled={busy || text.trim().length < 40} onClick={async () => { setBusy(true); setErr(null); try { await api.post('/diagnostic/discursive', { text }); await next(); } catch (x) { setErr(x); } finally { setBusy(false); } }}>{busy ? 'Corrigindo…' : 'Enviar'}</button>
          </div>
        </div>
      )}
      {step.readyToFinish && (
        <div className="card stack">
          <h2>Teste concluído!</h2>
          <p>Vou montar o <strong>seu Mapa de Aprovação</strong> e o plano inicial de estudos.</p>
          <button className="btn primary block" disabled={busy} onClick={finish}>{busy ? 'Analisando suas respostas…' : 'Ver meu Mapa de Aprovação'}</button>
        </div>
      )}
      <p className="faint" style={{ textAlign: 'center' }}>Progresso salvo automaticamente. Pode fechar e continuar depois.</p>
    </div></div>
  );
}
