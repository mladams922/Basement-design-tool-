import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError('Incorrect password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">🎬 Basement Theater Design Tool</div>
        <p className="login-sub">Enter the password to continue</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
