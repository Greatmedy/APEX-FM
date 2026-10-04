import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const u = await login(email, password);
      nav(u.role === 'admin' ? '/admin' : u.onboarding?.step === 'done' ? '/home' : '/signup', { replace: true });
    } catch (er) { setErr(errMsg(er)); } finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <h1 className="font-display text-2xl tracking-wide">Welcome back, gaffer</h1>
      <p className="text-sm text-slate-300 mt-1 mb-5">Sign in to manage your club.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email or username"><input className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <div className="text-right -mt-2"><Link to="/forgot-password" className="text-sm text-gold font-bold">Forgot password?</Link></div>
        {err && <p className="text-sm text-rose-300" role="alert">{err}</p>}
        <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
      </form>
      <p className="text-sm text-slate-300 mt-5 text-center">New manager? <Link to="/signup" className="text-gold font-bold">Create an account</Link></p>
    </AuthShell>
  );
}
