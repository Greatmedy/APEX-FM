import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Field, Modal } from '../../components/ui';

const SHAPE_ICON = { Circle: '●', Triangle: '▲', Cross: '✚', Square: '■', Star: '★', Whot: '✦' };
const SHAPE_COLOR = { Circle: '#38bdf8', Triangle: '#f472b6', Cross: '#f87171', Square: '#fbbf24', Star: '#a78bfa', Whot: '#f97316' };

function Card({ card, onClick, small }) {
  if (!card) return null;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative rounded-lg border border-white/20 ${small ? 'w-10 h-14' : 'w-14 h-20 sm:w-16 sm:h-24'} flex flex-col items-center justify-center shadow-lg transition ${onClick ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}`}
      style={{ background: 'linear-gradient(145deg,#1e293b,#0f172a)' }}
      aria-label={`${card.shape} ${card.num}`}
    >
      <span className="absolute top-0.5 left-1 text-[9px] font-bold" style={{ color: SHAPE_COLOR[card.shape] }}>{card.num}</span>
      <span className="text-lg sm:text-2xl" style={{ color: SHAPE_COLOR[card.shape] }}>{SHAPE_ICON[card.shape]}</span>
      <span className="absolute bottom-0.5 right-1 text-[9px] font-bold" style={{ color: SHAPE_COLOR[card.shape] }}>{card.num}</span>
    </button>
  );
}

export default function Whot() {
  const { user } = useAuth();
  const toast = useToast();
  const [balance, setBalance] = useState(null);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState(null); // my current table state
  const [bet, setBet] = useState(5000);
  const [rule, setRule] = useState('end');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const socket = getSocket();

  const refresh = useCallback(async () => {
    try {
      const { data: b } = await api.get('/games/whot/balance');
      setBalance(b.balance);
      const { data: t } = await api.get('/games/whot/tables');
      setTables(t.tables);
      setErr('');
    } catch (e) { setErr(errMsg(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh open tables every 30 seconds
  useEffect(() => {
    if (!table) {
      const t = setInterval(refresh, 60000);
      return () => clearInterval(t);
    }
  }, [table, refresh]);

  useEffect(() => {
    const onState = (data) => api.get(`/games/whot/tables/${data.id}`).then(({ data: result }) => setTable(result.table)).catch(() => setTable(data));
    const onFinished = (data) => { toast(`Game over — winner received ₦${data.pot.toLocaleString()}!`, 'success'); refresh(); };
    socket.on('whot-state', onState);
    socket.on('whot-finished', onFinished);
    socket.on('whot-timer', () => {});
    return () => { socket.off('whot-state', onState); socket.off('whot-finished', onFinished); socket.off('whot-timer'); };
  }, [socket, toast, refresh]);

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/games/whot/create', { bet });
      setTable(data.table);
      socket.emit('whot:join-room', data.table.id);
      setCreateOpen(false);
      toast('Table created!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const join = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/whot/tables/${id}/join`);
      setTable(data.table);
      socket.emit('whot:join-room', id);
      toast('Seated!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/whot/tables/${table.id}/start`);
      setTable(data.table);
      toast('Game started!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const toggleReady = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/whot/tables/${table.id}/ready`, { ready: !me?.ready });
      setTable(data.table);
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const play = async (card) => {
    if (!table || table.state !== 'PLAY') return;
    try {
      const { data } = await api.post(`/games/whot/tables/${table.id}/play`, { card: card ? card.id : '__draw__', marketRule: rule });
      setTable(data.table);
      if (data.won) toast('You won the round!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  if (loading) return <Spinner label="Opening Whot" />;
  if (err && !table) return <ErrorState message={err} onRetry={refresh} />;

  const me = table?.players?.find((p) => p.user === user?._id);
  const allReady = table?.players?.every((p) => p.ready);

  return (
    <div className="space-y-5">
      <div className="glass p-5 rounded-xl flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl mb-1">Nigerian <span className="text-orange-400">Whot</span></h1>
          <p className="text-sm text-slate-400">Match shape or number. First to empty their hand wins the pot.</p>
          <p className="text-xs text-orange-300 mt-2">Balance: <b>₦{balance?.toLocaleString() ?? '—'}</b> <span className="text-slate-500">(in-game)</span></p>
        </div>
        <div className="text-4xl">🃏</div>
      </div>

      {!table && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Open tables</h2>
            <button className="btn btn-gold" onClick={() => setCreateOpen(true)}>+ Create table</button>
          </div>
          {tables.length === 0 ? (
            <p className="text-sm text-slate-400 glass p-5 rounded-xl">No open tables. Create one or invite a friend by username.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {tables.map((t) => (
                <div key={t.id} className="glass p-4 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{t.hostName}'s table</p>
                    <p className="text-xs text-slate-400">{t.players}/4 players · <b className="text-gold">₦{t.bet.toLocaleString()}</b></p>
                  </div>
                  <button className="btn btn-ghost" onClick={() => join(t.id)} disabled={busy || t.players >= 4}>Join</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {table && (
        <div className="space-y-4">
          <div className="glass p-5 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl">Table · ₦{table.bet.toLocaleString()}</h2>
              <span className="chip bg-white/10 text-white">{table.state}</span>
            </div>
            {/* Seats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => {
                const p = table.players?.[i];
                return (
                  <div key={i} className={`rounded-xl p-3 border ${p ? 'border-white/20 bg-white/5' : 'border-dashed border-white/10'} ${p?.isTurn ? 'ring-2 ring-orange-400' : ''}`}>
                    {p ? (
                      <>
                        <div className="w-8 h-8 rounded-full bg-orange-500/30 grid place-items-center font-bold text-sm mb-1">{(p.name || '?')[0].toUpperCase()}</div>
                        <p className="text-xs font-bold truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.handCount} card{p.handCount === 1 ? '' : 's'}</p>
                        {table.state === 'WAITING' && <p className={`text-[10px] font-semibold ${p.ready ? 'text-green-400' : 'text-slate-400'}`}>{p.ready ? '✓ Ready' : 'Not ready'}</p>}
                      </>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 grid place-items-center mb-1 text-slate-600">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {table.state === 'WAITING' && (
            <div className="glass p-5 rounded-xl space-y-3">
              <p className="text-sm text-slate-300">Waiting for players… ({table.players?.length || 1}/4 seated)</p>
              {me && <button className={`btn w-full !min-h-[52px] text-lg ${me.ready ? 'btn-ghost' : 'btn-gold'}`} onClick={toggleReady} disabled={busy}>{me.ready ? 'Ready ✓ · Click to unready' : 'I’m ready'}</button>}
              {table.host === user?._id ? (
                <>
                  <p className="text-xs text-slate-400">Start with 2 or more ready players. Each player escrows ₦{table.bet.toLocaleString()}.</p>
                  <button className="btn btn-gold w-full" onClick={start} disabled={busy || (table.players?.length || 1) < 2 || !allReady}>{(table.players?.length || 1) < 2 ? 'Need 2 players' : allReady ? 'Start Whot' : 'Ready up to enable Start'}</button>
                </>
              ) : (
                <p className="text-sm text-slate-400">Ready up above, then wait for the host to start.</p>
              )}
            </div>
          )}

          {table.state === 'PLAY' && (
            <div className="glass p-5 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-slate-400">Play pile top</p>
                  {table.topCard ? <Card card={table.topCard} small /> : <p className="text-sm">Empty</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Market</p>
                  <p className="text-2xl num text-slate-300">{table.marketCount}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Turn</p>
                  <p className="text-sm font-bold text-orange-400">{table.turnUser === user?._id ? 'You!' : table.players?.find(p => p.user === table.turnUser)?.name || '—'}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-2">Your hand ({table.myHand?.length || 0})</p>
              <div className="flex flex-wrap gap-2">
                {(table.myHand || []).map((c) => <Card key={c.id} card={c} onClick={() => play(c)} />)}
              </div>
              <button className="btn btn-ghost mt-4" onClick={() => play(null)} disabled={!table.marketCount || table.turnUser !== user?._id}>
                Draw from market ({table.marketCount} left)
              </button>
            </div>
          )}

          {table.state === 'FINISHED' && (
            <div className="glass p-5 rounded-xl text-center">
              <p className="font-display text-2xl text-gold mb-2">🏆 Game over</p>
              <p className="text-sm text-slate-300">Winner takes the pot. Rematch anytime.</p>
              <button className="btn btn-ghost mt-4" onClick={() => { setTable(null); refresh(); }}>Back to tables</button>
            </div>
          )}
        </div>
      )}

      <Link to="/games" className="block text-center text-sm text-slate-400 hover:text-white">← Back to Games Lobby</Link>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Whot table">
        <div className="space-y-4">
          <Field label="Bet (₦5,000 – ₦100,000)" hint="Escrowed at start. Winner takes the whole pot.">
            <input type="number" className="input" min={5000} max={100000} step={1000} value={bet} onChange={(e) => setBet(Number(e.target.value))} />
          </Field>
          <Field label="Market rule">
            <select className="input" value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="end">End when market finishes (lowest sum wins)</option>
              <option value="reshuffle">Reshuffle when market is empty</option>
            </select>
          </Field>
          <button className="btn btn-gold w-full" onClick={create} disabled={busy || bet < 5000 || bet > 100000}>{busy ? 'Creating…' : 'Create table'}</button>
        </div>
      </Modal>
    </div>
  );
}
