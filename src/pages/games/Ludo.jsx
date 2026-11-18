import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Field } from '../../components/ui';

const COLOR = { red: '#E63946', yellow: '#F4A261', green: '#2A9D8F', blue: '#457B9D' };
const COLOR_NAME = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };

export default function Ludo() {
  const { user } = useAuth();
  const toast = useToast();
  const [balance, setBalance] = useState(null);
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(null);
  const [bet, setBet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [die, setDie] = useState(null);
  const [rolled, setRolled] = useState(false);
  const socket = getSocket();

  const refresh = useCallback(async () => {
    try {
      const { data: b } = await api.get('/games/ludo/balance');
      setBalance(b.balance);
      const { data: g } = await api.get('/games/ludo/games');
      setGames(g.games);
      setErr('');
    } catch (e) { setErr(errMsg(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onState = (data) => { setGame(data); setDie(data.lastDie); setRolled(false); };
    const onFinished = (data) => { toast('Game over! Someone brought all four tokens home.', 'success'); refresh(); };
    socket.on('ludo-state', onState);
    socket.on('ludo-finished', onFinished);
    return () => { socket.off('ludo-state', onState); socket.off('ludo-finished', onFinished); };
  }, [socket, toast, refresh]);

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/games/ludo/create', { bet });
      setGame(data.game);
      socket.emit('ludo:join-room', data.game.id);
      toast('Game created!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const join = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/ludo/games/${id}/join`);
      setGame(data.game);
      socket.emit('ludo:join-room', id);
      toast('Seated!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/ludo/games/${game.id}/start`);
      setGame(data.game);
      toast('Game started!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const roll = async () => {
    if (rolled) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/games/ludo/games/${game.id}/roll`);
      setDie(data.die);
      setRolled(true);
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const move = async (tokenIndex) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/ludo/games/${game.id}/move`, { token: tokenIndex });
      setGame(data.game);
      setDie(data.game.lastDie);
      setRolled(false);
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  if (loading) return <Spinner label="Opening Ludo" />;
  if (err && !game) return <ErrorState message={err} onRetry={refresh} />;

  const me = game?.players?.find((p) => p.user === user?._id);
  const myTurn = game?.players?.[game.turnIndex]?.user === user?._id;

  return (
    <div className="space-y-5">
      <div className="glass p-5 rounded-xl flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl mb-1">Nigerian <span className="text-green-400">Ludo</span></h1>
          <p className="text-sm text-slate-400">Roll a 6 to leave the yard. Bring all four tokens home first.</p>
          <p className="text-xs text-green-300 mt-2">Balance: <b>₦{balance?.toLocaleString() ?? '—'}</b> <span className="text-slate-500">(in-game)</span></p>
        </div>
        <div className="text-4xl">🎲</div>
      </div>

      {!game && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Open games</h2>
            <button className="btn btn-gold" onClick={create}>+ Create game</button>
          </div>
          {games.length === 0 ? (
            <p className="text-sm text-slate-400 glass p-5 rounded-xl">No open games. Create one and invite up to 4 players.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {games.map((g) => (
                <div key={g.id} className="glass p-4 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{g.hostName}'s game</p>
                    <p className="text-xs text-slate-400">{g.players}/4 players {g.bet > 0 ? `· ₦${g.bet.toLocaleString()}` : '· Free'}</p>
                  </div>
                  <button className="btn btn-ghost" onClick={() => join(g.id)} disabled={busy || g.players >= 4}>Join</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {game && (
        <div className="space-y-4">
          <div className="glass p-5 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xl">Ludo game</h2>
              <span className="chip bg-white/10 text-white">{game.state}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {game.players?.map((p) => (
                <div key={p.user} className={`rounded-xl p-3 border ${p.isTurn ? 'ring-2' : ''}`} style={{ borderColor: COLOR[p.color], ['--tw-ring-color' ]: COLOR[p.color] }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full" style={{ background: COLOR[p.color] }} />
                    <p className="text-xs font-bold truncate">{p.name}{p.user === user?._id ? ' (you)' : ''}</p>
                  </div>
                  <div className="flex gap-1">
                    {p.tokens.map((t, i) => (
                      <span key={i} className={`w-4 h-4 rounded-full border ${t >= 0 ? '' : 'opacity-30'}`} style={{ background: t >= 0 ? COLOR[p.color] : 'transparent', borderColor: COLOR[p.color] }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Board */}
            <div className="mt-4 aspect-square max-w-[380px] mx-auto rounded-xl border-2 p-3" style={{ borderColor: '#1D3557', background: '#FFF8F0' }}>
              <div className="grid grid-cols-3 h-full">
                <div className="flex items-center justify-center" style={{ background: COLOR.red }} />
                <div className="grid grid-cols-6 gap-1 p-1 bg-[#FFF8F0]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`t${i}`} className={`rounded ${(i % 8) === 0 ? 'ring-2 ring-amber-400' : ''}`} style={{ background: '#E8D8C4' }} />
                  ))}
                </div>
                <div className="flex items-center justify-center" style={{ background: COLOR.yellow }} />
                <div className="grid grid-rows-6 gap-1 p-1 bg-[#FFF8F0]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`l${i}`} className={`rounded ${(i % 8) === 0 ? 'ring-2 ring-amber-400' : ''}`} style={{ background: '#E8D8C4' }} />
                  ))}
                </div>
                <div className="flex items-center justify-center" style={{ background: '#1D3557' }}>
                  <div className="w-16 h-16 rounded-full bg-white/10 text-center text-[10px] text-white/70 grid place-items-center">HOME</div>
                </div>
                <div className="grid grid-rows-6 gap-1 p-1 bg-[#FFF8F0]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`r${i}`} className={`rounded ${(i % 8) === 0 ? 'ring-2 ring-amber-400' : ''}`} style={{ background: '#E8D8C4' }} />
                  ))}
                </div>
                <div className="flex items-center justify-center" style={{ background: COLOR.green }} />
                <div className="grid grid-cols-6 gap-1 p-1 bg-[#FFF8F0]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`b${i}`} className={`rounded ${(i % 8) === 0 ? 'ring-2 ring-amber-400' : ''}`} style={{ background: '#E8D8C4' }} />
                  ))}
                </div>
                <div className="flex items-center justify-center" style={{ background: COLOR.blue }} />
              </div>
            </div>
          </div>

          {game.state === 'WAITING' && (
            <div className="glass p-5 rounded-xl space-y-3">
              <p className="text-sm text-slate-300">Waiting for players… ({game.players?.length || 1}/4 seated)</p>
              {game.host === user?._id ? (
                <button className="btn btn-gold" onClick={start} disabled={busy || (game.players?.length || 1) < 2}>{(game.players?.length || 1) < 2 ? 'Need 2 players' : 'Start now'}</button>
              ) : (
                <p className="text-sm text-slate-400">Waiting for the host to start…</p>
              )}
            </div>
          )}

          {game.state === 'PLAY' && (
            <div className="glass p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-white/5 grid place-items-center text-3xl font-bold num" style={{ color: die ? '#fff' : '#64748b' }}>{die || '—'}</div>
                  <div>
                    <p className="text-xs text-slate-400">Turn</p>
                    <p className="text-sm font-bold">{myTurn ? 'Your turn!' : game.players?.[game.turnIndex]?.name || '—'}</p>
                  </div>
                </div>
                {myTurn && !rolled && <button className="btn btn-gold" onClick={roll} disabled={busy}>Roll die</button>}
                {myTurn && rolled && <p className="text-sm text-green-400 animate-pulse">Now move a token →</p>}
              </div>
              {me && myTurn && rolled && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">Tap a token to move:</p>
                  <div className="flex gap-2">
                    {me.tokens.map((t, i) => (
                      <button key={i} onClick={() => move(i)} disabled={busy}
                        className={`w-12 h-12 rounded-full border-2 font-bold text-xs grid place-items-center transition ${t >= 0 ? 'hover:scale-105' : 'opacity-40'}`}
                        style={{ borderColor: COLOR[me.color], background: t >= 0 ? COLOR[me.color] : 'transparent', color: t >= 0 ? '#fff' : COLOR[me.color] }}>
                        {t >= 0 ? (t + 1) : 'Yard'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!myTurn && <p className="text-sm text-slate-400">Waiting for {game.players?.[game.turnIndex]?.name} to roll…</p>}
            </div>
          )}

          {game.state === 'FINISHED' && (
            <div className="glass p-5 rounded-xl text-center">
              <p className="font-display text-2xl text-gold mb-2">🏆 Game over</p>
              <button className="btn btn-ghost mt-4" onClick={() => { setGame(null); refresh(); }}>Back to games</button>
            </div>
          )}
        </div>
      )}

      <Link to="/games" className="block text-center text-sm text-slate-400 hover:text-white">← Back to Games Lobby</Link>
    </div>
  );
}