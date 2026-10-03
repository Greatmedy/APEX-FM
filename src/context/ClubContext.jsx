import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { errMsg } from '../lib/api';
import { useAuth } from './AuthContext';

const Ctx = createContext(null);
export const useClub = () => useContext(Ctx);

/** The signed-in manager's own club (profile, squad, tactics). */
export function ClubProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user?.clubId) { setData(null); return null; }
    setLoading(true); setError('');
    try { const { data: d } = await api.get('/clubs/me'); setData(d); return d; }
    catch (e) { setError(errMsg(e)); return null; }
    finally { setLoading(false); }
  }, [user?.clubId]);

  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ ...(data || {}), club: data?.club, data, loading, error, refresh }}>{children}</Ctx.Provider>;
}
