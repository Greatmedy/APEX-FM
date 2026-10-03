import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Club from './pages/Club';
import Tactics from './pages/Tactics';
import ClubPublic from './pages/ClubPublic';
import League from './pages/League';
import Fixtures from './pages/Fixtures';
import Match from './pages/Match';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

function Guard({ children, adminOnly }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center"><Spinner label="Opening APEX FM" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (user.role === 'admin') return adminOnly || loc.pathname === '/admin' || loc.pathname.startsWith('/match') || loc.pathname.startsWith('/league') || loc.pathname.startsWith('/clubs') ? children : <Navigate to="/admin" replace />;
  if (adminOnly) return <Navigate to="/home" replace />;
  if (user.onboarding?.step !== 'done') return <Navigate to="/signup" replace />;
  return children;
}
function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><Spinner label="Opening APEX FM" /></div>;
  if (user && (user.role === 'admin' || user.onboarding?.step === 'done')) return <Navigate to={user.role === 'admin' ? '/admin' : '/home'} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Public><Login /></Public>} />
      <Route path="/signup" element={user && user.onboarding?.step !== 'done' && user.role !== 'admin' ? <Signup /> : <Public><Signup /></Public>} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/home" element={<Home />} />
        <Route path="/club" element={<Club />} />
        <Route path="/tactics" element={<Tactics />} />
        <Route path="/fixtures" element={<Fixtures />} />
        <Route path="/clubs/:id" element={<ClubPublic />} />
        <Route path="/league/:tier" element={<League />} />
        <Route path="/match/:id" element={<Match />} />
        <Route path="/admin" element={<Guard adminOnly><Admin /></Guard>} />
      </Route>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
