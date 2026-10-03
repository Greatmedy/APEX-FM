import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { ago, setServerNow } from '../lib/time';

const NAV = [['/home', 'Home'], ['/club', 'My team'], ['/tactics', 'Tactics'], ['/fixtures', 'Fixtures'], ['/league/1', 'Leagues']];
const ic = (d) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICON = { '/home': 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', '/club': 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', '/tactics': 'M4 4h16v16H4zM12 4v16M4 12h16', '/fixtures': 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', '/league/1': 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3' };

function Bell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();
  const ref = useRef(null);
  const toast = useToast();
  const load = () => api.get('/notifications').then(({ data }) => { setItems(data.items); setUnread(data.unread); }).catch(() => {});
  useEffect(() => {
    load();
    const s = getSocket();
    const h = (n) => { toast(n.title, 'info'); load(); };
    s.on('notification', h);
    const t = setInterval(load, 60000);
    return () => { s.off('notification', h); clearInterval(t); };
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    const c = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', c); return () => document.removeEventListener('mousedown', c);
  }, []);
  const toggle = () => { setOpen((o) => !o); if (!open && unread) api.post('/notifications/read').then(() => setUnread(0)).catch(() => {}); };
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost !px-3 relative" onClick={toggle} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        {ic('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0')}
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger text-[10px] font-extrabold grid place-items-center px-1">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] glass-deep p-2 z-50 max-h-[70vh] scroll-y">
          <p className="px-3 py-2 font-display tracking-wide">Notifications</p>
          {items.length === 0 && <p className="px-3 pb-4 text-sm text-slate-300">Nothing yet. Match reminders and results will show up here.</p>}
          {items.map((n) => (
            <button key={n._id} onClick={() => { setOpen(false); n.link && nav(n.link); }} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 block">
              <div className="flex justify-between gap-2"><span className="text-sm font-bold">{n.title}</span><span className="text-[11px] text-slate-400 shrink-0">{ago(n.createdAt)}</span></div>
              <p className="text-xs text-slate-300 mt-0.5">{n.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [wa, setWa] = useState('');
  const ref = useRef(null);
  useEffect(() => { api.get('/config').then(({ data }) => { setWa(data.whatsappLink || ''); setServerNow(data.serverNow); }).catch(() => {}); }, []);
  useEffect(() => {
    const c = (e) => ref.current && !ref.current.contains(e.target) && setMenu(false);
    document.addEventListener('mousedown', c); return () => document.removeEventListener('mousedown', c);
  }, []);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 glass-deep !rounded-none border-x-0 border-t-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 h-16 flex items-center gap-3">
          <Link to="/home" className="flex items-center gap-2 mr-1" aria-label="APEX FM home">
            <img src='/logo.jpg' alt="APEX FM Logo" className="h-12 w-auto rounded-lg" />
            <span className="font-display text-xl tracking-wide leading-none">APEX <span className="text-gold">FM</span></span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1 ml-4">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `px-3 min-h-[44px] flex items-center rounded-lg text-sm font-bold ${isActive ? 'bg-white/10 text-gold' : 'text-slate-300 hover:text-white'}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Bell />
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !px-3" aria-label="Open the WhatsApp managers group">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#14F195"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-.9c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.6-.1 1.1z" /></svg>
              </a>
            ) : (
              <span className="btn btn-ghost !px-3 opacity-40" title="The admin has not set the WhatsApp link yet" aria-disabled="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#94a3b8"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" /></svg>
              </span>
            )}
            <div className="relative" ref={ref}>
              <button className="btn btn-ghost !px-3" onClick={() => setMenu((m) => !m)} aria-label="Profile menu">
                <span className="w-7 h-7 rounded-full bg-gold text-ink grid place-items-center font-extrabold text-sm">{(user?.managerName || user?.username || '?')[0].toUpperCase()}</span>
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-60 glass-deep p-2 z-50">
                  <div className="px-3 py-2"><p className="font-bold truncate">{user?.managerName || user?.username}</p><p className="text-xs text-slate-400 truncate">@{user?.username} · {user?.country}</p></div>
                  {user?.role === 'admin' && <Link to="/admin" className="block px-3 py-2.5 rounded-lg hover:bg-white/10 text-sm font-semibold" onClick={() => setMenu(false)}>Admin</Link>}
                  <Link to="/club" className="block px-3 py-2.5 rounded-lg hover:bg-white/10 text-sm font-semibold" onClick={() => setMenu(false)}>My team</Link>
                  <button className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 text-sm font-semibold text-rose-300" onClick={logout}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-5 pb-nav"><Outlet /></main>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-deep !rounded-none border-x-0 border-b-0" style={{ paddingBottom: 'var(--safe-b)' }} aria-label="Primary">
        <div className="grid grid-cols-5">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 min-h-[60px] text-[11px] font-bold ${isActive ? 'text-gold' : 'text-slate-300'}`}>
              {ic(ICON[to])}{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
