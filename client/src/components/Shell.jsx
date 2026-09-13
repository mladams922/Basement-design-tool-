import { NavLink } from 'react-router-dom';
import { api } from '../api.js';

export default function Shell({ children, onLogout }) {
  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">🎬 Basement Theater</div>
        <nav>
          <NavLink to="/" end>
            Plans
          </NavLink>
          <NavLink to="/calculators">Calculators</NavLink>
          <NavLink to="/acoustics">Acoustics</NavLink>
          <NavLink to="/equipment">Equipment</NavLink>
        </nav>
        <button className="link-btn" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
