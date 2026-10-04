import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { Field } from '../components/ui';
import { useToast } from '../context/ToastContext';
import api, { errMsg } from '../lib/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const nav = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api.post('/auth/reset', { token, password, confirmPassword });
      toast('Password updated. Sign in with your new password.', 'success');
      nav('/login', { replace: true });
    } catch (er) { setErr(errMsg(er)); } finally { setBusy(false); }
  };

  if (!token) {
    return (
      <AuthShell>
        <h1 className="font-display text-2xl tracking-wide">Link not valid</h1>
        <p className="text-sm text-slate-300 mt-2">This reset link is missing its token. Request a new one.</p>
        <Link to="/forgot-password" className="btn btn-gold w-full mt-5">Request a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <h1 className="font-display text-2xl tracking-wide">Choose a new password</h1>
      <form onSubmit={submit} className="space-y-4 mt-4">
        <Field label="New password" hint="At least 8 characters."><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required /></Field>
        {err && <p className="text-sm text-rose-300" role="alert">{err} <Link to="/forgot-password" className="text-gold font-bold">Get a new link</Link></p>}
        <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Saving' : 'Update password'}</button>
      </form>
    </AuthShell>
  );
}