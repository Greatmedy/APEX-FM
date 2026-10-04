import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { Field } from '../components/ui';
import api, { errMsg } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api.post('/auth/forgot', { email }); setSent(true); }
    catch (er) { setErr(errMsg(er)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h1 className="font-display text-2xl tracking-wide">Forgot your password?</h1>
      {sent ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-200">If that email has an account, a reset link is on its way. It expires in 30 minutes. Check your spam folder too.</p>
          <Link to="/login" className="btn btn-gold w-full">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 mt-4">
          <p className="text-sm text-slate-300">Enter the email you signed up with and we will send you a reset link.</p>
          <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          {err && <p className="text-sm text-rose-300" role="alert">{err}</p>}
          <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Sending' : 'Send reset link'}</button>
          <p className="text-sm text-center"><Link to="/login" className="text-gold font-bold">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}