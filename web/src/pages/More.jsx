import { NAV, toggleTheme } from '../App.jsx';
import { Icon } from '../components/ui.jsx';

export default function More({ me, onLogout }) {
  return (
    <div className="stack">
      <h1>Mais</h1>
      <div className="grid two">
        {NAV.filter((n) => n.to && !['/', '/professora', '/estudar', '/questoes'].includes(n.to)).map((n) => (
          <a key={n.to} href={`#${n.to}`} className="card row" style={{ textDecoration: 'none', color: 'inherit' }}><Icon name={n.icon} /> {n.label}</a>
        ))}
      </div>
      <div className="card stack">
        <button className="btn" onClick={toggleTheme}><Icon name="moon" /> Alternar tema claro/escuro</button>
        <button className="btn danger" onClick={onLogout}><Icon name="logout" /> Sair ({me.user.email})</button>
      </div>
    </div>
  );
}
