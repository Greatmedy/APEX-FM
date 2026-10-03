import { useEffect, useState } from 'react';
import api, { errMsg } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { ago } from '../lib/time';
import { Spinner } from './ui';

/** In-app managers board so banter survives if the WhatsApp link dies. */
export default function BoardPanel() {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = () => api.get('/board').then(({ data }) => setItems(data.items)).catch((e) => toast(errMsg(e), 'error'));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []); // eslint-disable-line
  const post = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api.post('/board', { text }); setText(''); await load(); } catch (er) { toast(errMsg(er), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="glass p-4">
      <p className="font-display text-lg tracking-wide mb-3">Managers board</p>
      <form onSubmit={post} className="flex gap-2 mb-3">
        <input className="input" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Say something to the league" aria-label="Write a post" />
        <button className="btn btn-gold" disabled={busy || !text.trim()}>Post</button>
      </form>
      {!items ? <Spinner label="Loading board" /> : items.length === 0 ? <p className="text-sm text-slate-300 py-4">No posts yet. Start the banter.</p> : (
        <ul className="space-y-3 max-h-72 scroll-y pr-1">
          {items.map((p) => (
            <li key={p._id} className="text-sm">
              <div className="flex items-baseline gap-2"><b>{p.author}</b><span className="text-xs text-slate-400 truncate">{p.clubName}</span><span className="text-[11px] text-slate-500 ml-auto shrink-0">{ago(p.createdAt)}</span></div>
              <p className="text-slate-200 break-words">{p.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
