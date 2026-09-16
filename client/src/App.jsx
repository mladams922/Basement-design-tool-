import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api.js';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import Dashboard from './components/Dashboard.jsx';
import FloorPlanEditor from './components/FloorPlanEditor.jsx';
import TheaterDesigner from './components/TheaterDesigner.jsx';
import Calculators from './components/Calculators.jsx';
import Acoustics from './components/Acoustics.jsx';
import Equipment from './components/Equipment.jsx';

export default function App() {
  const [authState, setAuthState] = useState('loading'); // loading | in | out

  useEffect(() => {
    api
      .session()
      .then((s) => setAuthState(s.authenticated ? 'in' : 'out'))
      .catch(() => setAuthState('out'));
  }, []);

  if (authState === 'loading') {
    return <div className="splash">Loading&hellip;</div>;
  }

  if (authState === 'out') {
    return <Login onLogin={() => setAuthState('in')} />;
  }

  return (
    <Shell onLogout={() => setAuthState('out')}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/designs/:designId" element={<FloorPlanEditor />} />
        <Route path="/designs/:designId/theater/:roomId" element={<TheaterDesigner />} />
        <Route path="/calculators" element={<Calculators />} />
        <Route path="/acoustics" element={<Acoustics />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
