import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { Field, Tabs, Spinner, ErrorState } from '../components/ui';
import Crest from '../components/Crest';
import PlayerPortrait from '../components/PlayerPortrait';
import SquadModal from '../components/SquadModal';
import { LEAGUE_BADGE } from '../components/util';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { errMsg } from '../lib/api';

const STEPS = ['Account', 'Club', 'Manager', 'League'];
const CONTINENTS = ['Africa', 'Europe', 'North America', 'South America', 'Asia', 'Oceania'];

function Progress({ step }) {
  return (
    <ol className="flex items-center gap-2 mb-6" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= step ? 'bg-pitch' : 'bg-white/15'}`} />
          <p className={`text-[11px] mt-1.5 font-bold ${i === step ? 'text-white' : 'text-slate-400'}`}>{s}</p>
        </li>
      ))}
    </ol>
  );
}

function AccountStep() {
  const { signup } = useAuth();
  const [f, setF] = useState({ username: '', email: '', password: '', confirmPassword: '', terms: false });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErrs({}); setBusy(true);
    try { await signup(f); } catch (er) { const d = er.response?.data; setErrs({ [d?.field || 'form']: errMsg(er) }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="font-display text-2xl tracking-wide">Create your manager account</h1>
      <Field label="Username" error={errs.username} hint="3-20 letters, numbers or underscores. Must be unique."><input className="input" value={f.username} onChange={set('username')} autoComplete="username" required /></Field>
      <Field label="Email" error={errs.email}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Password" error={errs.password}><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required /></Field>
        <Field label="Confirm password" error={errs.confirmPassword}><input className="input" type="password" value={f.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required /></Field>
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-200 min-h-[44px]">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#14F195]" checked={f.terms} onChange={set('terms')} />
        <span>I accept the APEX FM terms. Real club and player names are used as public facts. Ratings are original APEX estimates.</span>
      </label>
      {(errs.terms || errs.form) && <p className="text-sm text-rose-300" role="alert">{errs.terms || errs.form}</p>}
      <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Creating account' : 'Continue'}</button>
      <p className="text-sm text-slate-300 text-center">Already managing? <Link to="/login" className="text-gold font-bold">Sign in</Link></p>
    </form>
  );
}

function ClubStep({ onDone }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('EPL');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = () => api.get('/templates').then(({ data: d }) => setData(d.leagues)).catch((e) => setErr(errMsg(e)));
  useEffect(() => { load(); }, []);
  const choose = async (key) => {
    setBusy(true);
    try { await api.post('/onboarding/club', { templateKey: key }); onDone(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!data) return <Spinner label="Loading clubs" />;
  const cur = data.find((l) => l.league === tab);
  return (
    <div>
      <h1 className="font-display text-2xl tracking-wide">Choose your club</h1>
      <p className="text-sm text-slate-300 mt-1 mb-4">Pick any club. Many managers can choose the same one, and each of you gets your own copy of the squad.</p>
      <Tabs tabs={data.map((l) => ({ id: l.league, label: l.leagueName }))} value={tab} onChange={setTab} className="mb-4" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cur.clubs.map((c) => {
          const [lb, lc] = LEAGUE_BADGE[c.league];
          return (
            <button key={c.key} onClick={() => setOpen(c.key)} className="glass p-4 text-left hover:bg-white/15 transition">
              <div className="flex items-center gap-3">
                <Crest colors={c.crest} mono={c.short} size={46} />
                <div className="min-w-0 flex-1"><p className="font-display text-lg leading-tight truncate">{c.name}</p><p className="text-xs text-slate-300 truncate">{c.stadium}</p></div>
                <span className="chip !px-2 text-white" style={{ background: lc }}>{lb}</span>
              </div>
              <div className="flex items-center gap-2 mt-4">
                {c.stars.map((p, i) => (
                  <div key={i} className="relative">
                    <PlayerPortrait seed={p.portraitSeed} name={p.name} shirt={c.kit.shirt} size={54} />
                    <span className="absolute bottom-0 right-0 num text-[11px] bg-ink/90 text-gold rounded-tl-md px-1">{p.ovr}</span>
                  </div>
                ))}
                <div className="ml-auto text-right"><p className="text-[11px] text-slate-400">Best XI</p><p className="num text-2xl text-gold leading-none">{c.ovr}</p></div>
              </div>
              <p className="text-xs text-pitch font-bold mt-3">View full squad</p>
            </button>
          );
        })}
      </div>
      <SquadModal templateKey={open} onClose={() => setOpen(null)} onChoose={choose} busy={busy} />
    </div>
  );
}

function ManagerStep({ user, onDone }) {
  const [f, setF] = useState({ managerName: user.managerName || '', continent: user.continent || '', country: user.country || '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErrs({}); setBusy(true);
    try { await api.post('/onboarding/manager', f); onDone(); } catch (er) { setErrs({ [er.response?.data?.field || 'form']: errMsg(er) }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4 max-w-md mx-auto">
      <h1 className="font-display text-2xl tracking-wide">Who is the manager?</h1>
      <p className="text-sm text-slate-300">Your display name appears next to your club everywhere, like Chelsea — {f.managerName || 'Tunde'}. It can differ from your username.</p>
      <Field label="Manager display name" error={errs.managerName}><input className="input" maxLength={24} value={f.managerName} onChange={set('managerName')} required /></Field>
      <Field label="Continent" error={errs.continent}>
        <select className="input" value={f.continent} onChange={set('continent')} required><option value="">Select continent</option>{CONTINENTS.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="Country of residence" error={errs.country}><input className="input" value={f.country} onChange={set('country')} required /></Field>
      {errs.form && <p className="text-sm text-rose-300">{errs.form}</p>}
      <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Saving' : 'Continue'}</button>
    </form>
  );
}

function LeagueStep({ user, onDone }) {
  const [leagues, setLeagues] = useState(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');
  const load = () => api.get('/onboarding/leagues').then(({ data }) => setLeagues(data.leagues)).catch((e) => setErr(errMsg(e)));
  useEffect(() => { load(); }, []);
  const join = async (tier) => {
    setBusy(tier); setErr('');
    try { await api.post('/onboarding/league', { tier }); onDone(); } catch (e) { setErr(errMsg(e)); load(); } finally { setBusy(0); }
  };
  if (!leagues) return err ? <ErrorState message={err} onRetry={load} /> : <Spinner label="Checking league slots" />;
  const open = leagues.filter((l) => l.free > 0);
  if (user.onboarding.step === 'waitlist' || open.length === 0) {
    return (
      <div className="text-center max-w-md mx-auto py-6">
        <p className="font-display text-2xl">Both leagues are full</p>
        <p className="text-slate-300 mt-2 text-sm">You are on the waitlist. When the next season is drawn and a slot opens, you will get a notification and your club appears on your dashboard. Your club choice and manager details are saved.</p>
        {open.length === 0 && user.onboarding.step !== 'waitlist' && <button className="btn btn-gold mt-5" onClick={() => join(2)} disabled={!!busy}>Join the waitlist</button>}
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-2xl tracking-wide">Pick your league</h1>
      <p className="text-sm text-slate-300 mt-1 mb-5">Each league has 20 clubs and 38 gameweeks. Matches kick off at 20:00 WAT every Monday and Thursday. League 1 is the top flight.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {leagues.map((l) => (
          <div key={l.tier} className={`glass p-5 ${l.free === 0 ? 'opacity-60' : ''}`}>
            <p className="font-display text-xl">{l.name}</p>
            <p className="text-sm text-slate-300 mt-1">{l.tier === 1 ? 'The higher league. Bottom 3 are relegated.' : 'The lower league. Top 3 are promoted.'}</p>
            <p className="num text-4xl mt-4 text-pitch">{l.free}<span className="text-sm text-slate-300 font-sans ml-2">free slot{l.free === 1 ? '' : 's'}</span></p>
            <button className="btn btn-gold w-full mt-4" disabled={l.free === 0 || !!busy} onClick={() => join(l.tier)}>{l.free === 0 ? 'League full' : busy === l.tier ? 'Joining' : `Join ${l.name}`}</button>
          </div>
        ))}
      </div>
      {err && <p className="text-sm text-rose-300 mt-4" role="alert">{err}</p>}
    </div>
  );
}

export default function Signup() {
  const { user, refreshUser } = useAuth();
  const nav = useNavigate();
  const stepIdx = !user ? 0 : { club: 1, manager: 2, league: 3, waitlist: 3, done: 4 }[user.onboarding?.step] ?? 1;
  const next = async () => { const u = await refreshUser(); if (u?.onboarding?.step === 'done') nav('/home', { replace: true }); };
  useEffect(() => { if (user?.onboarding?.step === 'done') nav('/home', { replace: true }); }, [user, nav]);
  return (
    <AuthShell wide={stepIdx === 1 || stepIdx === 3}>
      {user && <Progress step={Math.min(stepIdx, 3)} />}
      {!user && <AccountStep />}
      {user && stepIdx === 1 && <ClubStep onDone={next} />}
      {user && stepIdx === 2 && <ManagerStep user={user} onDone={next} />}
      {user && stepIdx === 3 && <LeagueStep user={user} onDone={next} />}
    </AuthShell>
  );
}
