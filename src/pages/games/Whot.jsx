import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api, { errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Field, Modal } from '../../components/ui';
import { WhotCard, WhotCardBack } from '../../components/games/WhotCard';
import { WhotShapePicker } from '../../components/games/WhotShapePicker';

const SHAPE_ICON = { Circle: '●', Triangle: '▲', Cross: '✚', Square: '■', Star: '★', Whot: '✦' };
const SHAPE_COLOR = { Circle: '#38bdf8', Triangle: '#f472b6', Cross: '#f87171', Square: '#fbbf24', Star: '#a78bfa', Whot: '#f97316' };
const SPECIAL_CARD_LABELS = { 1: 'HOLD ON', 2: 'PICK 2', 5: 'PICK 3', 8: 'SKIP', 14: 'GEN. MARKET', 20: 'WHOT!' };

export default function Whot() {
  const { user } = useAuth();
  const userId = String(user?.id ?? user?._id ?? '');
  const toast = useToast();
  const [balance, setBalance] = useState(null);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState(null);
  const [bet, setBet] = useState(5000);
  const [rule, setRule] = useState('end');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [turnTimer, setTurnTimer] = useState(null);
  const [lastEffect, setLastEffect] = useState(null);
  const socket = getSocket();
  const effectTimeoutRef = useRef(null);

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

  useEffect(() => {
    if (!table) {
      const t = setInterval(refresh, 60000);
      return () => clearInterval(t);
    }
  }, [table, refresh]);

  useEffect(() => {
    const onState = (data) => api.get(`/games/whot/tables/${data.id}`).then(({ data: result }) => setTable(result.table)).catch(() => setTable(data));
    const onFinished = (data) => { toast(`Game over — winner received ₦${data.pot.toLocaleString()}!`, 'success'); refresh(); };
    const onTimer = (data) => setTurnTimer(data.remaining);

    socket.on('whot-state', onState);
    socket.on('whot-finished', onFinished);
    socket.on('whot-timer', onTimer);
    return () => { socket.off('whot-state', onState); socket.off('whot-finished', onFinished); socket.off('whot-timer', onTimer); };
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

  const handleCardClick = (card) => {
    if (!table || table.state !== 'PLAY') return;
    if (String(table.turnUser) !== userId) return;

    const isPlayable = isCardPlayable(card, table.topCard);
    if (!isPlayable) return;

    if (card.num === 20) {
      // Whot card - open shape picker
      setSelectedCardId(card.id);
      setShapePickerOpen(true);
    } else {
      playCard(card);
    }
  };

  const playCard = async (card, calledShape) => {
    if (!table || table.state !== 'PLAY') return;
    try {
      const payload = { card: card.id, marketRule: rule };
      if (calledShape) payload.calledShape = calledShape;
      const { data } = await api.post(`/games/whot/tables/${table.id}/play`, payload);
      setTable(data.table);

      // Show effect notification
      if (data.effect) {
        showEffect(data.effect, card);
      }
      if (data.won) toast('You won the round!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  const playShape = (shape) => {
    if (selectedCardId) {
      const card = table.myHand?.find(c => c.id === selectedCardId);
      if (card) playCard(card, shape);
      setSelectedCardId(null);
      setShapePickerOpen(false);
    }
  };

  const drawCard = async () => {
    if (!table || table.state !== 'PLAY') return;
    if (String(table.turnUser) !== userId) return;
    if (!table.marketCount) return;

    try {
      const { data } = await api.post(`/games/whot/tables/${table.id}/play`, { card: '__draw__', marketRule: rule });
      setTable(data.table);
      toast('Drew a card from market', 'info');
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  const isCardPlayable = (card, topCard) => {
    if (!topCard) return true;
    if (card.num === 20) return true; // Whot is always playable
    return card.shape === topCard.shape || card.num === topCard.num;
  };

  const showEffect = (effect, card) => {
    const messages = {
      'pick-two': `🎯 ${card.shape} ${card.num} — Next player picks 2!`,
      'pick-three': `🎯 ${card.shape} ${card.num} — Next player picks 3!`,
      'skip': `⏭️ ${card.shape} ${card.num} — Next player skipped!`,
      'general-market': `🎁 ${card.shape} ${card.num} — General Market! Everyone draws 1.`,
      'hold-on': `🔒 ${card.shape} ${card.num} — Hold On! You play again.`,
    };

    const msg = messages[effect] || `Special card played: ${effect}`;
    setLastEffect(msg);

    if (effectTimeoutRef.current) clearTimeout(effectTimeoutRef.current);
    effectTimeoutRef.current = setTimeout(() => setLastEffect(null), 4000);
  };

  const getPlayableCount = () => {
    if (!table?.myHand || !table.topCard) return 0;
    return table.myHand.filter(c => isCardPlayable(c, table.topCard)).length;
  };

  const me = table?.players?.find((p) => String(p.user) === userId);
  const allReady = table?.players?.every((p) => p.ready);
  const isMyTurn = table && String(table.turnUser) === userId;
  const playableCount = getPlayableCount();

  if (loading) return <Spinner label="Opening Whot" />;
  if (err && !table) return <ErrorState message={err} onRetry={refresh} />;

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
                        {p.isTurn && table.state === 'PLAY' && (
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <motion.span
                              className="w-1.5 h-1.5 rounded-full bg-orange-400"
                              animate={{ scale: [1, 1.3, 1] }}
                              transition={{ duration: 0.8, repeat: Infinity }}
                            />
                            <span className="text-[10px] text-orange-400 font-bold">YOUR TURN</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 grid place-items-center mb-1 text-slate-600">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Effect notification */}
          <AnimatePresence>
            {lastEffect && (
              <motion.div
                className="glass p-3 rounded-xl text-center text-sm font-bold text-orange-300 border border-orange-400/30 bg-orange-500/10"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {lastEffect}
              </motion.div>
            )}
          </AnimatePresence>

          {table.state === 'WAITING' && (
            <div className="glass p-5 rounded-xl space-y-3">
              <p className="text-sm text-slate-300">Waiting for players… ({table.players?.length || 1}/4 seated)</p>
              {me && <button className={`btn w-full !min-h-[52px] text-lg ${me.ready ? 'btn-ghost' : 'btn-gold'}`} onClick={toggleReady} disabled={busy}>{me.ready ? 'Ready ✓ · Click to unready' : "I'm ready"}</button>}
              {String(table.host) === userId ? (
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
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Play pile top</p>
                    {table.topCard ? <WhotCard card={table.topCard} small /> : <WhotCardBack small />}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Market</p>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-2xl num text-slate-300">{table.marketCount}</p>
                      <WhotCardBack small />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Turn</p>
                    <p className={`text-sm font-bold ${isMyTurn ? 'text-green-400 animate-pulse' : 'text-orange-400'}`}>
                      {isMyTurn ? 'Your turn!' : table.players?.find(p => p.user === table.turnUser)?.name || '—'}
                    </p>
                  </div>
                </div>
                {/* Turn timer */}
                {turnTimer !== null && (
                  <div className="flex items-center gap-2 text-right">
                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full"
                        style={{ width: `${(turnTimer / 15) * 100}%` }}
                        animate={{ width: `${(turnTimer / 15) * 100}%` }}
                        transition={{ duration: 1, ease: 'linear' }}
                      />
                    </div>
                    <span className={`text-sm font-bold num ${turnTimer <= 3 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{turnTimer}s</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Your hand ({table.myHand?.length || 0})</p>
                  {playableCount > 0 && isMyTurn && (
                    <span className="text-xs text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded">
                      {playableCount} playable
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 min-h-[90px]">
                  {(table.myHand || []).map((c) => (
                    <WhotCard
                      key={c.id}
                      card={c}
                      selected={selectedCardId === c.id}
                      playable={isMyTurn && isCardPlayable(c, table.topCard)}
                      onClick={() => handleCardClick(c)}
                    />
                  ))}
                  {(table.myHand || []).length === 0 && (
                    <div className="w-full text-center text-slate-500 py-8">
                      <p className="text-sm">No cards in hand</p>
                    </div>
                  )}
                </div>

                {isMyTurn && table.marketCount > 0 && (
                  <button
                    className="btn btn-ghost w-full sm:w-auto mt-2"
                    onClick={drawCard}
                    disabled={busy}
                  >
                    Draw from market ({table.marketCount} left)
                  </button>
                )}

                {!isMyTurn && (
                  <p className="text-sm text-slate-400 text-center">
                    Waiting for {table.players?.find(p => p.user === table.turnUser)?.name} to play…
                  </p>
                )}
              </div>
            </div>
          )}

          {table.state === 'FINISHED' && (
            <div className="glass p-5 rounded-xl text-center">
              <p className="font-display text-2xl text-gold mb-2">🏆 Game over</p>
              {table.winner && (
                <p className="text-sm text-slate-300 mb-4">
                  {table.winner === userId ? 'You won!' : `${table.winner} won the game!`}
                  {table.bet > 0 && ` Pot: ₦${(table.bet * table.players.length).toLocaleString()}`}
                </p>
              )}
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

      <WhotShapePicker open={shapePickerOpen} onClose={() => { setShapePickerOpen(false); setSelectedCardId(null); }} onSelect={playShape} />
    </div>
  );
}