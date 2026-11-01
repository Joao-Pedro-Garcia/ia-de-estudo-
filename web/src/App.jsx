import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { useRoute, go } from './lib/router.js';
import { Loading, Icon, ErrorBoundary } from './components/ui.jsx';
import Auth from './pages/Auth.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Diagnostic from './pages/Diagnostic.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Chat from './pages/Chat.jsx';
import Study from './pages/Study.jsx';
import Lesson from './pages/Lesson.jsx';
import Questions from './pages/Questions.jsx';
import Exams from './pages/Exams.jsx';
import Essays from './pages/Essays.jsx';
import Plan from './pages/Plan.jsx';
import Flashcards from './pages/Flashcards.jsx';
import ErrorsPage from './pages/Errors.jsx';
import Lab from './pages/Lab.jsx';
import Focus from './pages/Focus.jsx';
import Central from './pages/Central.jsx';
import Calendar from './pages/Calendar.jsx';
import Memory from './pages/Memory.jsx';
import MapReport from './pages/MapReport.jsx';
import More from './pages/More.jsx';
import Profile from './pages/Profile.jsx';

export const NAV = [
  { to: '/', label: 'Início', icon: 'home' },
  { to: '/professora', label: 'Professora', icon: 'chat', teacher: true },
  { to: '/estudar', label: 'Aulas', icon: 'book' },
  { to: '/questoes', label: 'Questões', icon: 'check' },
  { to: '/simulados', label: 'Simulados', icon: 'clock' },
  { to: '/redacao', label: 'Redação', icon: 'pen' },
  { sec: 'Preparação' },
  { to: '/plano', label: 'Plano de estudos', icon: 'cal' },
  { to: '/flashcards', label: 'Flashcards', icon: 'cards' },
  { to: '/erros', label: 'Caderno de erros', icon: 'alert' },
  { to: '/laboratorio', label: 'Laboratório', icon: 'flask' },
  { to: '/concentracao', label: 'Concentração', icon: 'target' },
  { sec: 'Medicina Federal' },
  { to: '/central', label: 'Central de Medicina', icon: 'hosp' },
  { to: '/calendario', label: 'Calendário', icon: 'cal' },
  { to: '/central/simulador', label: 'Simulador de notas', icon: 'calc' },
  { to: '/memoria', label: 'Minha evolução', icon: 'brain' },
  { to: '/mapa', label: 'Mapa de aprovação', icon: 'star' },
  { to: '/perfil', label: 'Meu perfil', icon: 'home' },
];

export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* */ }
}

function Layout({ me, children, path, onLogout }) {
  const active = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'));
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navegação principal">
        <div className="brand"><img src="/icon.svg" width="30" height="30" alt="" /> Aprova Federal AI</div>
        {NAV.map((n, i) => n.sec
          ? <div className="sec" key={i}>{n.sec}</div>
          : <a key={n.to} href={`#${n.to}`} className={`${active(n.to) ? 'active' : ''} ${n.teacher ? 'teacher' : ''}`}><Icon name={n.icon} />{n.label}</a>)}
        <div className="spacer" />
        <button className="btn ghost small" onClick={toggleTheme}><Icon name="moon" /> Tema claro/escuro</button>
        <button className="btn ghost small" onClick={onLogout}><Icon name="logout" /> Sair ({me.user.name})</button>
        {!me.ai.configured && <div className="alert warn" style={{ fontSize: '.8rem', marginTop: 8 }}>IA desativada: falta configurar ANTHROPIC_API_KEY no servidor.</div>}
      </nav>
      <main className="main">
        {!me.ai.configured && <div className="alert warn hide-desktop" style={{ marginBottom: 12, fontSize: '.85rem' }}>A professora de IA está desativada neste servidor (falta ANTHROPIC_API_KEY). Questões, simulados, plano e flashcards funcionam normalmente.</div>}
        {children}
      </main>
      <nav className="bottomnav" aria-label="Navegação rápida">
        {[NAV[0], NAV[2], NAV[1], NAV[3], { to: '/mais', label: 'Mais', icon: 'menu' }].map((n) => (
          <a key={n.to} href={`#${n.to}`} className={`${active(n.to) ? 'active' : ''} ${n.teacher ? 'teacher' : ''}`}><Icon name={n.icon} />{n.label}</a>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const { path, parts, query } = useRoute();
  const refresh = () => api.get('/auth/me').then(setMe).catch(() => setMe({ user: null, ai: { configured: false } }));
  useEffect(() => { refresh(); }, []);
  if (!me) return <Loading />;
  if (!me.user) return <Auth onDone={refresh} />;
  // Diagnóstico obrigatório antes de liberar o painel principal.
  if (!me.onboarding_done) return <Onboarding onDone={refresh} />;
  if (!me.diagnostic_done) return <Diagnostic me={me} onDone={() => { refresh(); go('/mapa'); }} />;
  const logout = async () => { await api.post('/auth/logout'); setMe({ user: null, ai: me.ai }); };
  let page;
  switch (parts[0]) {
    case undefined: page = <Dashboard me={me} />; break;
    case 'professora': page = <Chat me={me} convId={parts[1] ? Number(parts[1]) : null} query={query} />; break;
    case 'estudar': page = <Study discipline={parts[1]} me={me} />; break;
    case 'aula': page = <Lesson id={Number(parts[1])} me={me} />; break;
    case 'questoes': page = <Questions query={query} me={me} />; break;
    case 'simulados': page = <Exams id={parts[1] ? Number(parts[1]) : null} me={me} />; break;
    case 'redacao': page = <Essays id={parts[1] ? Number(parts[1]) : null} me={me} />; break;
    case 'plano': page = <Plan />; break;
    case 'flashcards': page = <Flashcards me={me} />; break;
    case 'erros': page = <ErrorsPage id={parts[1] ? Number(parts[1]) : null} me={me} />; break;
    case 'laboratorio': page = <Lab tool={parts[1]} />; break;
    case 'concentracao': page = <Focus />; break;
    case 'central': page = <Central tab={parts[1]} me={me} />; break;
    case 'calendario': page = <Calendar />; break;
    case 'memoria': page = <Memory />; break;
    case 'mapa': page = <MapReport me={me} />; break;
    case 'perfil': page = <Profile />; break;
    case 'mais': page = <More me={me} onLogout={logout} />; break;
    default: page = <div className="card">Página não encontrada. <a href="#/">Voltar ao início</a></div>;
  }
  return <Layout me={me} path={path} onLogout={logout}><ErrorBoundary resetKey={path}>{page}</ErrorBoundary></Layout>;
}
