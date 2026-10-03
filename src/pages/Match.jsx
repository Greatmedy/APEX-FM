import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MatchPlayer } from '../lib/matchPlayer';
import { pickKits } from '../lib/kits';
import { sfx } from '../lib/audio';
import { fmtClock, nowMs, realToMatch, setServerNow } from '../lib/time';
import { STYLE_LABEL } from '../components/util';
import { Spinner, ErrorState } from '../components/ui';
import Crest from '../components/Crest';
import TimeWAT from '../components/TimeWAT';
import Countdown from '../components/Countdown';
import PitchCanvas from '../components/match/PitchCanvas';
import EventFeed, { describe } from '../components/match/EventFeed';
import MatchControls from '../components/match/MatchControls';
import MatchStats from '../components/match/MatchStats';
import { monoOf } from '../components/util';

function MuteButton() {
  const [m, setM] = useState(sfx.isMuted());
  useEffect(() => sfx.onChange(setM), []);
  return <button className="btn btn-ghost !min-h-[40px] !px-3 text-xs" onClick={() => { sfx.unlock(); sfx.startCrowd(); sfx.setMuted(!m); }} aria-pressed={m}>{m ? 'Sound off' : 'Sound on'}</button>;
}

function Hud({ setup, st, clock, status, last }) {
  const sc = st.score;
  return (
    <div className="glass-deep px-3 sm:px-5 py-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-2 min-w-0"><Crest colors={setup.h.crest} mono={setup.h.short} size={34} /><span className="font-display text-base sm:text-lg truncate">{setup.h.short}</span></div>
        <div className="text-center">
          <div className="num text-4xl sm:text-5xl leading-none tracking-wider">{sc.h}<span className="text-slate-500 mx-2">-</span>{sc.a}</div>
          <div className="num text-sm text-pitch mt-1 flex items-center justify-center gap-2">{status === 'live' && <span className="live-dot" />}{clock}</div>
        </div>
        <div className="flex items-center gap-2 justify-end min-w-0"><span className="font-display text-base sm:text-lg truncate">{setup.a.short}</span><Crest colors={setup.a.crest} mono={setup.a.short} size={34} /></div>
      </div>
      <p className="text-xs sm:text-sm text-slate-200 mt-2 truncate min-h-[20px]">{last ? describe(last, setup) : 'Waiting for kickoff'}</p>
    </div>
  );
}

function Header({ fx }) {
  return (
    <div className="glass p-5">
      <p className="text-xs font-bold text-slate-300 mb-3">APEX League {fx.tier} · Season {fx.season} · Gameweek {fx.gw}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {[fx.home, fx.away].map((c, i) => (
          <Link key={c.id} to={`/clubs/${c.id}`} className={`flex flex-col items-center gap-2 text-center min-w-0 ${i ? 'order-3' : ''}`}>
            <Crest colors={c.crestColors} mono={monoOf(c)} size={58} />
            <span className="font-display text-base sm:text-xl leading-tight">{c.displayName}</span>
            <span className="text-[11px] text-slate-400 truncate max-w-full">{c.isAI ? 'APEX AI' : c.stadiumName}</span>
          </Link>
        ))}
        <div className="order-2 num text-4xl sm:text-5xl text-center min-w-[84px]">{fx.result && ['finished', 'forfeit'].includes(fx.status) ? `${fx.result.h} - ${fx.result.a}` : 'vs'}</div>
      </div>
    </div>
  );
}

export default function Match() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [fx, setFx] = useState(null);
  const [err, setErr] = useState('');
  const [rep, setRep] = useState(null);
  const [offline, setOffline] = useState(false);
  const [mode, setMode] = useState(null); // 'live' | 'replay'
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [readyBusy, setReadyBusy] = useState(false);
  const [, force] = useReducer((x) => x + 1, 0);
  const pl = useRef(null);
  const fxRef = useRef(null);
  fxRef.current = fx;

  const onEvent = useCallback((ev) => {
    if (ev.k === 'goal') sfx.goal();
    else if (ev.k === 'foul' || ev.k === 'pen') sfx.whistle();
    else if (ev.k === 'halftime' || ev.k === 'fulltime') sfx.whistle(true);
    else if (ev.k === 'kickoff' && !ev.re) sfx.whistle();
    else if (ev.k === 'shot') sfx.swell(0.1, 1.2);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/matches/${id}`);
      setServerNow(data.serverNow);
      setFx(data); setErr('');
      if (data.status === 'live' && data.setup) {
        if (!pl.current || pl.current.setup.seed !== data.setup.seed || mode === 'replay') { pl.current = new MatchPlayer(data.setup, onEvent); setMode('live'); }
        const p = pl.current;
        for (const ev of data.events || []) p.push(ev);
        p.drain(p.idx === 0 && p.events.length > 3);
        force();
      } else if (data.status === 'finished' && data.hasReplay) {
        if (!pl.current || pl.current.setup.seed !== String(id) || mode !== 'replay') {
          const wasLive = mode === 'live';
          const r = await api.get(`/matches/${id}/replay`);
          setRep(r.data);
          const p = new MatchPlayer(r.data.setup, onEvent); p.setEvents(r.data.events);
          if (wasLive) p.seek(5400);
          pl.current = p; setMode('replay'); setPlaying(false);
        }
      }
    } catch (e) { setErr(errMsg(e)); }
  }, [id, mode, onEvent]);

  useEffect(() => { pl.current = null; setFx(null); setRep(null); setMode(null); setPlaying(false); }, [id]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // sockets
  useEffect(() => {
    const s = getSocket();
    const join = () => { s.emit('join', id, (a) => a?.serverNow && setServerNow(a.serverNow)); setOffline(false); };
    const onConnect = () => { join(); load(); };
    const onEv = ({ fixtureId, ev }) => {
      if (fixtureId !== id || !pl.current) return;
      if (!pl.current.push(ev)) { load(); return; }
      pl.current.drain(false); force();
    };
    const onReady = (d) => d.fixtureId === id && setFx((f) => f && { ...f, ready: d.ready });
    const onKick = (d) => d.fixtureId === id && load();
    const onFull = (d) => { if (d.fixtureId === id) { toast('Full time', 'info'); setTimeout(load, 1500); } };
    const onDisc = () => setOffline(true);
    if (s.connected) join();
    s.on('connect', onConnect); s.on('disconnect', onDisc); s.on('event', onEv); s.on('ready', onReady); s.on('kickoff', onKick); s.on('fulltime', onFull);
    return () => { s.emit('leave', id); ['connect', 'disconnect', 'event', 'ready', 'kickoff', 'fulltime'].forEach((e) => s.off(e)); };
    // eslint-disable-next-line
  }, [id]);

  // polling fallbacks: kickoff wait, dropped socket during live
  useEffect(() => {
    const t = setInterval(() => {
      const f = fxRef.current;
      if (!f) return;
      if (f.status === 'scheduled' && nowMs() > new Date(f.kickoffAt).getTime() - 500) load();
      else if (f.status === 'live' && offline) load();
      else if (f.status === 'live' && mode === 'live' && pl.current?.st.finished) load();
    }, 3000);
    return () => clearInterval(t);
  }, [load, offline, mode]);

  // HUD refresh + audio unlock
  useEffect(() => { const t = setInterval(force, 250); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!mode) return;
    const go = () => { sfx.unlock(); sfx.startCrowd(); };
    window.addEventListener('pointerdown', go, { once: true });
    return () => { window.removeEventListener('pointerdown', go); };
  }, [mode]);
  useEffect(() => () => sfx.stopCrowd(), []);

  // replay loop
  useEffect(() => {
    if (mode !== 'replay') return;
    let raf, last = performance.now(), n = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing && pl.current && mode === 'replay') {
        pl.current.tick(dt, speed);
        if (pl.current.idx >= pl.current.events.length) setPlaying(false);
        if (++n % 6 === 0) force();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, playing, speed]);

  const kits = useMemo(() => (pl.current ? pickKits(pl.current.setup.h.kit, pl.current.setup.a.kit) : null), [mode, fx?.setup, rep]); // eslint-disable-line

  if (err && !fx) return <ErrorState message={err} onRetry={load} />;
  if (!fx) return <Spinner label="Loading match" />;

  const side = fx.mySide;
  const myClub = side === 'h' ? fx.home : side === 'a' ? fx.away : null;
  const oppClub = side === 'h' ? fx.away : side === 'a' ? fx.home : null;
  const player = pl.current;
  const done = ['finished', 'forfeit'].includes(fx.status);
  const koMs = new Date(fx.kickoffAt).getTime();
  const readyOpen = nowMs() >= new Date(fx.readyOpensAt).getTime() && nowMs() < koMs;
  const myReady = side && fx.ready?.[side];
  const oppReady = side && fx.ready?.[side === 'h' ? 'a' : 'h'];
  const forfeitBy = fx.result?.forfeitBy;

  const doReady = async () => {
    setReadyBusy(true);
    try { const { data } = await api.post(`/matches/${id}/ready`); setFx((f) => ({ ...f, ready: data.ready })); toast('You are ready. Kickoff at 20:00 WAT.', 'success'); } catch (e) { toast(errMsg(e), 'error'); } finally { setReadyBusy(false); }
  };

  // clock
  let clock = '00:00';
  if (player) {
    if (mode === 'live' && fx.status === 'live') clock = fmtClock(Math.max(realToMatch((nowMs() - koMs) / 1000), player.st.sec));
    else if (mode === 'replay') clock = fmtClock(player.vsec);
    else clock = 'FT';
    if (player.st.half === 2 && player.st.sec <= 2700 && fx.status === 'live') clock = 'HT';
    if (player.st.finished) clock = 'FT';
  }
  const showViewer = player && (fx.status === 'live' || (fx.status === 'finished' && fx.hasReplay));
  const liveSide = fx.status === 'live' && side && player;

  return (
    <div className="space-y-4">
      <Header fx={fx} />

      {offline && fx.status === 'live' && (
        <div className="glass p-3 border-gold/50 flex flex-wrap items-center justify-between gap-2" role="alert">
          <p className="text-sm">Live connection dropped. The match keeps running on the server and we are catching up.</p>
          <button className="btn btn-gold !min-h-[40px]" onClick={load}>Catch up now</button>
        </div>
      )}

      {fx.status === 'forfeit' && (
        <div className="glass p-5 border-danger/50 text-center">
          <p className="font-display text-2xl">{side && String(forfeitBy) !== String(myClub?.id) ? 'Opponent forfeited. You win 3-0' : side ? 'You forfeited this match. 3-0 loss' : 'Settled by forfeit: 3-0'}</p>
          <p className="text-sm text-slate-300 mt-1">No match was played, so there is no replay.</p>
        </div>
      )}
      {fx.status === 'finished' && !fx.hasReplay && (
        <div className="glass p-5 text-center"><p className="font-display text-2xl">{fx.result?.noShow ? 'No-show: 0-0' : 'Result recorded'}</p><p className="text-sm text-slate-300 mt-1">{fx.result?.noShow ? 'Neither manager was ready at kickoff. One point each.' : 'This result was set by an admin, so there is no replay.'}</p></div>
      )}
      {fx.status === 'void' && <div className="glass p-5 text-center"><p className="font-display text-2xl">Match voided</p></div>}

      {(fx.status === 'scheduled' || fx.status === 'starting') && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass p-5">
            <p className="text-xs font-bold text-slate-300">Kickoff</p>
            <TimeWAT date={fx.kickoffAt} className="text-lg" />
            <p className="text-sm text-slate-300 mt-3">Venue: <b className="text-white">{fx.home.stadiumName}</b></p>
            <p className="num text-4xl text-pitch mt-3"><Countdown to={fx.kickoffAt} done="Kicking off" /></p>
          </div>
          <div className="glass p-5">
            {!side ? <p className="text-sm text-slate-300">You are viewing as a spectator. The live pitch opens at kickoff.</p> : (
              <>
                <p className="font-display text-lg">Ready check</p>
                {!readyOpen && nowMs() < koMs && <p className="text-sm text-slate-300 mt-1">The Ready button appears 10 minutes before kickoff, at <b>19:50 WAT</b>.</p>}
                {readyOpen && !myReady && <button className="btn btn-gold w-full mt-3 !min-h-[54px] text-lg" disabled={readyBusy} onClick={doReady}>{readyBusy ? 'Saving' : 'Ready'}</button>}
                {myReady && <p className="mt-3 text-pitch font-bold">You are ready.</p>}
                {(myReady || readyOpen) && (oppClub?.isAI ? <p className="text-sm text-slate-300 mt-2">{oppClub.displayName} is an APEX AI club and always plays.</p> : !oppReady ? <p className="text-sm text-slate-300 mt-2">Waiting for opponent{myReady ? ' to click Ready' : ''}.</p> : <p className="text-sm text-pitch mt-2">Opponent is ready.</p>)}
                <p className="text-xs text-slate-400 mt-4">If only one manager is ready, the match still starts at 20:00 and the other side is auto-readied. If neither is ready, it is recorded 0-0 with a point each. A dropped connection never stops a match.</p>
              </>
            )}
            {oppClub && <Link to={`/clubs/${oppClub.id}`} className="btn btn-ghost w-full mt-4">Scout {oppClub.displayName}</Link>}
          </div>
        </div>
      )}

      {showViewer && kits && (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-3">
            <Hud setup={player.setup} st={player.st} clock={clock} status={fx.status} last={player.st.lastEv} />
            <div className="glass p-2 sm:p-3">
              <PitchCanvas player={player} kits={kits} />
              <div className="flex items-center justify-between gap-2 mt-2 px-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-300"><span className="inline-block w-3 h-3 rounded-full border border-white" style={{ background: kits.h.shirt }} />{player.setup.h.short}<span className="inline-block w-3 h-3 rounded-full border border-white ml-2" style={{ background: kits.a.shirt }} />{player.setup.a.short}</div>
                <MuteButton />
              </div>
            </div>
            {(mode === 'replay') && (
              <div className="glass p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn btn-gold" onClick={() => { sfx.unlock(); if (player.idx >= player.events.length) { player.seek(0); } setPlaying((p) => !p); }}>{playing ? 'Pause' : player.idx >= player.events.length ? 'Replay again' : player.idx === 0 ? 'Watch replay' : 'Play'}</button>
                  <button className="btn btn-ghost" onClick={() => { player.seek(0); setPlaying(false); force(); }}>Restart</button>
                  <div className="flex gap-1 ml-auto">{[1, 2, 4, 8].map((x) => <button key={x} onClick={() => setSpeed(x)} className={`btn !min-h-[40px] !px-3 ${speed === x ? 'btn-gold' : 'btn-ghost'}`}>{x}x</button>)}</div>
                </div>
                <input type="range" min="0" max="5400" step="15" value={Math.round(player.vsec)} onChange={(e) => { player.seek(Number(e.target.value)); force(); }} className="w-full accent-[#14F195] h-8" aria-label="Replay position" />
              </div>
            )}
          </div>
          <div className="lg:col-span-2 space-y-4 min-h-0">
            {liveSide && (
              <div className="glass p-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-slate-300">Opponent:</span>
                <b>{player.setup[side === 'h' ? 'a' : 'h'].formation} · {STYLE_LABEL[player.st.sides[side === 'h' ? 'a' : 'h'].style]}</b>
              </div>
            )}
            {liveSide && <MatchControls fixtureId={id} side={side} st={player.st} />}
            <EventFeed events={player.events} upto={player.idx} setup={player.setup} />
          </div>
        </div>
      )}

      {fx.status === 'finished' && (rep || fx.stats) && (rep?.setup || player?.setup) && (
        <MatchStats stats={rep?.stats || fx.stats} goals={rep?.goals || fx.goals} cards={rep?.cards || fx.cards} setup={{ ...(rep?.setup || player.setup), gameweek: fx.gw }} result={fx.result} />
      )}
      {fx.status === 'live' && !player && <Spinner label="Kickoff in progress" />}
    </div>
  );
}
