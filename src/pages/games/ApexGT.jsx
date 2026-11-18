import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Field, Modal } from '../../components/ui';

export default function ApexGT() {
  const { user } = useAuth();
  const userId = String(user?.id ?? user?._id ?? '');
  const toast = useToast();
  const [balance, setBalance] = useState(null);
  const [venues, setVenues] = useState([]);
  const [races, setRaces] = useState([]);
  const [race, setRace] = useState(null);
  const [venue, setVenue] = useState('');
  const [bet, setBet] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [lap, setLap] = useState(0);
  const [raceResult, setRaceResult] = useState(null);
  const [aiModal, setAiModal] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const socket = getSocket();

  const refresh = useCallback(async () => {
    try {
      const { data: b } = await api.get('/games/apex-gt/balance');
      setBalance(b.balance);
      const { data: v } = await api.get('/games/apex-gt/venues');
      setVenues(v.venues);
      const { data: r } = await api.get('/games/apex-gt/races');
      setRaces(r.races);
      setErr('');
    } catch (e) { setErr(errMsg(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh the open race list once per minute.
  useEffect(() => {
    if (!race) {
      const t = setInterval(refresh, 60000);
      return () => clearInterval(t);
    }
  }, [race, refresh]);

  useEffect(() => {
    const onCountdown = (data) => { setCountdown(data.countdown); };
    const onRaceState = (data) => setRace(data);
    const onStarted = () => { setCountdown(null); setRace((current) => current && { ...current, state: 'STARTED' }); setRaceResult(null); toast('GO! Race started.', 'success'); };
    const onLap = (data) => { setLap(data.lap); };
    const onFinished = (data) => { setRaceResult(data); setLap(3); toast('Race finished!', 'success'); refresh(); };
    socket.on('race-countdown', onCountdown);
    socket.on('race-state', onRaceState);
    socket.on('race-started', onStarted);
    socket.on('race-lap', onLap);
    socket.on('race-finished', onFinished);
    return () => {
      socket.off('race-countdown', onCountdown);
      socket.off('race-state', onRaceState);
      socket.off('race-started', onStarted);
      socket.off('race-lap', onLap);
      socket.off('race-finished', onFinished);
    };
  }, [socket, toast, refresh]);

  const create = async (withAI = false) => {
    if (!venue) return toast('Pick a venue.', 'error');
    setAiModal(false);
    setBusy(true);
    try {
      const { data } = await api.post('/games/apex-gt/create', { venue, bet });
      setRace(data.race);
      socket.emit('race:join-room', data.race.id);
      if (withAI) {
        const { data: aiData } = await api.post(`/games/apex-gt/races/${data.race.id}/start-ai`, { count: aiCount });
        setRace(aiData.race);
        toast('AI race started!', 'success');
      } else {
        toast('Race created. Ready up, then start when you are set.', 'success');
      }
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const join = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${id}/join`);
      setRace(data.race);
      socket.emit('race:join-room', id);
      toast('Joined the race!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const toggleReady = async () => {
    const me = race?.participants?.find((p) => String(p.user) === userId);
    setBusy(true);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${race.id}/ready`, { ready: !me?.ready });
      setRace(data.race);
      toast(me?.ready ? 'Not ready' : 'Ready!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const start = async () => {
    setBusy(true);
    try {
      await api.post(`/games/apex-gt/races/${race.id}/start`);
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const startWithAI = async () => {
    setBusy(true);
    setAiModal(false);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${race.id}/start-ai`, { count: aiCount });
      setRace(data.race);
      toast('AI racers added! Starting...', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  if (loading) return <Spinner label="Opening APEX GT" />;
  if (err && !race) return <ErrorState message={err} onRetry={refresh} />;

  const me = race?.participants?.find((p) => String(p.user) === userId);
  const allReady = race?.participants?.every((p) => p.ready);
  const isHost = String(race?.host ?? '') === userId;

  return (
    <div className="space-y-5">
      <div className="glass p-5 rounded-xl flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl mb-1">APEX <span className="text-cyan-400">GT</span></h1>
          <p className="text-sm text-slate-400">3D multiplayer racing · Nigerian roads</p>
          <p className="text-xs text-cyan-300 mt-2">Balance: <b>₦{balance?.toLocaleString() ?? '—'}</b> <span className="text-slate-500">(in-game)</span></p>
        </div>
        <div className="text-4xl">🏎️</div>
      </div>

      {!race && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass p-5 rounded-xl space-y-3">
            <h2 className="font-display text-xl">Create a race</h2>
            <Field label="Venue"><select className="input" value={venue} onChange={(e) => setVenue(e.target.value)}>
              <option value="">Select venue…</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select></Field>
            <Field label="Wager per racer (₦5,000 – ₦100,000)" hint="Optional head-to-head. Winner takes the whole pot. Virtual naira only.">
              <input type="number" className="input" min={5000} max={100000} step={1000} value={bet} onChange={(e) => setBet(Number(e.target.value))} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-2">
              <button className="btn btn-ghost w-full" onClick={() => setAiModal(true)} disabled={busy || bet < 5000 || bet > 100000}>Race with AI</button>
              <button className="btn btn-gold w-full" onClick={() => create()} disabled={busy || bet < 5000 || bet > 100000}>{busy ? 'Creating…' : 'Create race'}</button>
            </div>
          </div>
          <div className="glass p-5 rounded-xl">
            <h2 className="font-display text-xl mb-3">Open races</h2>
            {races.length === 0 ? <p className="text-sm text-slate-400">No open races. Create one to start.</p> : (
              <div className="space-y-2">
                {races.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <p className="text-sm font-bold">{r.venueName}</p>
                      <p className="text-xs text-slate-400">{r.participants.length}/4 · <b className="text-gold">₦{r.bet.toLocaleString()}</b></p>
                    </div>
                    <button className="btn btn-ghost" onClick={() => join(r.id)} disabled={busy || r.participants.length >= 4}>Join</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {race && (
        <div className="space-y-4">
          <div className="glass p-5 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl">{race.venueName}</h2>
                <p className="text-xs text-slate-400">Wager: <b className="text-gold">₦{race.bet.toLocaleString()}</b> per racer</p>
              </div>
              <span className="chip bg-white/10 text-white">{race.state}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {race.participants.map((p) => (
                <div key={p.user} className={`rounded-xl p-3 border border-white/15 bg-white/5 ${p.user === race.host ? 'ring-1 ring-cyan-400' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-cyan-500/30 grid place-items-center font-bold text-sm mb-1">{(p.name || '?')[0].toUpperCase()}</div>
                  <p className="text-xs font-bold truncate">{p.name}{p.user === race.host ? ' 👑' : ''}</p>
                  <p className={`text-[10px] ${p.ready ? 'text-green-400' : 'text-slate-400'}`}>{p.ready ? '✓ Ready' : 'Not ready'}</p>
                </div>
              ))}
            </div>
            {countdown !== null && (
              <div className="mt-4 text-center">
                <p className="text-5xl num font-bold text-red-400 animate-pulse">{countdown > 0 ? countdown : 'GO!'}</p>
              </div>
            )}
            {lap > 0 && race.state !== 'FINISHED' && (
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-300">Lap <b className="text-cyan-400">{lap}</b>/3</p>
              </div>
            )}
            {race.state === 'WALLOON' && (
              <div className="mt-4 space-y-2">
                {isHost && race.participants.length === 1 && (
                  <button className="btn btn-gold w-full" onClick={() => setAiModal(true)} disabled={busy}>
                    Race with AI
                  </button>
                )}
                {me && race.state === 'WALLOON' && (
                  <button className={`btn w-full mt-2 !min-h-[52px] text-lg ${me.ready ? 'btn-ghost' : 'btn-gold'}`} onClick={toggleReady} disabled={busy}>
                    {me.ready ? 'Ready ✓ · Click to unready' : 'I’m ready'}
                  </button>
                )}
                {isHost && (
                  <button className="btn btn-gold w-full" onClick={start} disabled={busy || !allReady}>
                    {allReady ? 'Start race' : 'Ready up to enable Start race'}
                  </button>
                )}
                {!isHost && race.participants.length > 1 && (
                  <p className="text-sm text-slate-400 text-center">Use “I’m ready” above. Waiting for the host to start.</p>
                )}
              </div>
            )}
            {me && race.state === 'WALLOON' && (
              <button className="btn btn-ghost w-full mt-3" onClick={() => { setRace(null); setLap(0); setRaceResult(null); refresh(); }} disabled={busy}>
                Leave race
              </button>
            )}
            {raceResult && (
              <div className="mt-4 glass p-4 rounded-xl">
                <p className="font-display text-lg text-gold mb-2">🏁 Race results</p>
                {raceResult.results?.map((r, i) => (
                  <div key={r.user} className={`flex justify-between text-sm py-1 ${r.win ? 'text-gold font-bold' : 'text-slate-300'}`}>
                    <span>{i + 1}. {String(r.user) === userId ? 'You' : r.user}</span>
                    <span>{r.win ? `+₦${(race.bet * race.participants.length).toLocaleString()}` : `-₦${race.bet.toLocaleString()}`} · {r.avgLap}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={() => { setRace(null); setLap(0); setRaceResult(null); refresh(); }}>Leave race</button>
        </div>
      )}

      <Link to="/games" className="block text-center text-sm text-slate-400 hover:text-white">← Back to Games Lobby</Link>

      <Modal open={aiModal} onClose={() => setAiModal(false)} title="Race with AI">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Add AI racers to fill the grid. You can race with 1-3 AI opponents.</p>
          <Field label="Number of AI racers">
            <select className="input" value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))}>
              <option value="1">1 AI racer</option>
              <option value="2">2 AI racers</option>
              <option value="3">3 AI racers</option>
            </select>
          </Field>
          <button className="btn btn-gold w-full" onClick={() => race ? startWithAI() : create(true)} disabled={busy || !venue || bet < 5000 || bet > 100000}>{busy ? 'Starting…' : 'Start race with AI'}</button>
        </div>
      </Modal>
    </div>
  );
}
