import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Field } from '../../components/ui';
import { LudoBoard } from '../../components/games/LudoBoard';

const COLOR = { red: '#E63946', yellow: '#F4A261', green: '#2A9D8F', blue: '#457B9D' };
const COLOR_NAME = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };

export default function Ludo() {
  const { user } = useAuth();
  const userId = String(user?.id ?? user?._id ?? '');
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
  const [lastRollInfo, setLastRollInfo] = useState(null);
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

  // Auto-refresh open games every 30 seconds
  useEffect(() => {
    if (!game) {
      const t = setInterval(refresh, 60000);
      return () => clearInterval(t);
    }
  }, [game, refresh]);

  useEffect(() => {
    const onState = (data) => {
      setGame(data);
      setDie(data.lastDie);
      setRolled(false);
      if (data.lastRoll) {
        setLastRollInfo(data.lastRoll);
      }
    };
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

  const toggleReady = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/ludo/games/${game.id}/ready`, { ready: !me?.ready });
      setGame(data.game);
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

  const me = game?.players?.find((p) => String(p.user) === userId);
  const myTurn = String(game?.players?.[game.turnIndex]?.user ?? '') === userId;
  const myColor = me?.color || 'red';

  // Check for six streak
  const sixStreak = game?.sixStreak || 0;

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
                <div key={p.user} className={`rounded-xl p-3 border ${p.isTurn ? 'ring-2' : ''}`} style={{ borderColor: COLOR[p.color], ['--tw-ring-color']: COLOR[p.color] }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full" style={{ background: COLOR[p.color] }} />
                    <p className="text-xs font-bold truncate">{p.name}{String(p.user) === userId ? ' (you)' : ''}</p>
                  </div>
                  <div className="flex gap-1">
                    {p.tokens.map((t, i) => (
                      <span key={i} className={`w-4 h-4 rounded-full border ${t >= 0 ? '' : 'opacity-30'}`} style={{ background: t >= 0 ? COLOR[p.color] : 'transparent', borderColor: COLOR[p.color] }} />
                    ))}
                  </div>
                  {game.state === 'WAITING' && <p className={`text-[10px] mt-1 font-semibold ${p.ready ? 'text-green-400' : 'text-slate-400'}`}>{p.ready ? '✓ Ready' : 'Not ready'}</p>}
                </div>
              ))}
            </div>
            {/* Interactive Board */}
            <div className="mt-4 aspect-square max-w-[420px] mx-auto rounded-xl border-2 p-3" style={{ borderColor: '#1D3557', background: '#FFF8F0' }}>
              <LudoBoard
                game={game}
                myColor={myColor}
                myTokens={me?.tokens || [-1, -1, -1, -1]}
                die={die}
                myTurn={myTurn}
                rolled={rolled}
                onTokenClick={move}
                disabled={busy || !myTurn || !rolled}
              />
            </div>
          </div>

          {game.state === 'WAITING' && (
            <div className="glass p-5 rounded-xl space-y-3">
              <p className="text-sm text-slate-300">Waiting for players… ({game.players?.length || 1}/4 seated)</p>
              {me && <button className={`btn w-full !min-h-[52px] text-lg ${me.ready ? 'btn-ghost' : 'btn-gold'}`} onClick={toggleReady} disabled={busy}>{me.ready ? 'Ready ✓ · Click to unready' : "I'm ready"}</button>}
              {String(game.host) === userId ? (
                <button className="btn btn-gold w-full" onClick={start} disabled={busy || (game.players?.length || 1) < 2 || !game.players?.every((p) => p.ready)}>{(game.players?.length || 1) < 2 ? 'Need 2 players' : game.players?.every((p) => p.ready) ? 'Start Ludo' : 'Ready up to enable Start'}</button>
              ) : (
                <p className="text-sm text-slate-400">Ready up above, then wait for the host to start.</p>
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
                {sixStreak > 0 && (
                  <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                    ⚠ {sixStreak} six{'s' in sixStreak ? '' : ''} in a row!
                  </div>
                )}
              </div>
              {myTurn && !rolled && (
                <button className="btn btn-gold w-full sm:w-auto" onClick={roll} disabled={busy}>
                  Roll die
                </button>
              )}
              {myTurn && rolled && (
                <p className="text-sm text-green-400 animate-pulse">Now tap a highlighted token to move →</p>
              )}
              {!myTurn && (
                <p className="text-sm text-slate-400">Waiting for {game.players?.[game.turnIndex]?.name} to roll…</p>
              )}
              {lastRollInfo && (
                <p className="text-xs text-slate-500">Last roll: {lastRollInfo.die} by {lastRollInfo.user === userId ? 'you' : lastRollInfo.user}</p>
              )}
            </div>
          )}

          {game.state === 'FINISHED' && (
            <div className="glass p-5 rounded-xl text-center">
              <p className="font-display text-2xl text-gold mb-2">🏆 Game over</p>
              {game.winner && (
                <p className="text-sm text-slate-300 mb-4">
                  {game.winner === userId ? 'You won!' : `${game.winner} won the game!`}
                  {game.bet > 0 && ` Pot: ₦${(game.bet * game.players.length).toLocaleString()}`}
                </p>
              )}
              <button className="btn btn-ghost mt-4" onClick={() => { setGame(null); refresh(); }}>Back to games</button>
            </div>
          )}
        </div>
      )}

      <Link to="/games" className="block text-center text-sm text-slate-400 hover:text-white">← Back to Games Lobby</Link>
    </div>
  );
}