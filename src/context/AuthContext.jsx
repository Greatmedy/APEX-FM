import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../lib/api';
import { resetSocket } from '../lib/socket';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('apex_token'));

  const refreshUser = useCallback(async () => {
    try { const { data } = await api.get('/auth/me'); setUser(data.user); return data.user; }
    catch { setUser(null); return null; }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('apex_token')) { setLoading(false); return; }
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    const h = () => { setUser(null); resetSocket(); };
    window.addEventListener('apex-logout', h);
    return () => window.removeEventListener('apex-logout', h);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('apex_token', data.token); resetSocket(); setUser(data.user); return data.user;
  };
  const signup = async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    localStorage.setItem('apex_token', data.token); resetSocket(); setUser(data.user); return data.user;
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* token may already be invalid */ }
    localStorage.removeItem('apex_token'); resetSocket(); setUser(null);
  };
  return <Ctx.Provider value={{ user, setUser, loading, login, signup, logout, refreshUser }}>{children}</Ctx.Provider>;
}
