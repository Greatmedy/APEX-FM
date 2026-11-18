import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Modal } from '../../components/ui';

function ApexGTCard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const toast = useToast();

  const getBalance = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/games/apex-gt/balance');
      setBalance(data);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getBalance();
    const s = api.get('/games/apex-gt/balance');
    const h = () => getBalance();
    s.catch(() => {}).finally(() => setLoading(false));
    return () => {};
  }, []);

  return (
    <Link to="/games/apex-gt" className="block h-full p-5 glass-deep rounded-xl hover:bg-white/5 transition group">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl">
          🏎️
        </div>
        <div>
          <h3 className="font-display text-xl text-white group-hover:text-cyan-400 transition">APEX GT</h3>
          <p className="text-xs text-slate-400">3D Multiplayer Racing</p>
        </div>
      </div>
      <p className="text-sm text-slate-300 mb-4">Drive Nigerian roads, challenge friends, and race for virtual naira.</p>
      {balance ? (
        <div className="text-xs">
          <span className="text-slate-400">Balance:</span>{' '}
          <span className="text-cyan-400 font-bold">₦{balance.balance.toLocaleString()}</span>
        </div>
      ) : loading ? <Spinner label="" /> : null}
    </Link>
  );
}

function WhotCard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/games/whot/balance').then(({ data }) => { setBalance(data); }).catch(() => {}).finally(() => setLoading(false));
    // periodic refresh could go here
  }, []);

  return (
    <Link to="/games/whot" className="block h-full p-5 glass-deep rounded-xl hover:bg-white/5 transition group">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-bold text-xl">
          ♠️
        </div>
        <div>
          <h3 className="font-display text-xl text-white group-hover:text-orange-400 transition">Nigerian Whot</h3>
          <p className="text-xs text-slate-400">Nigerian Whot Game</p>
        </div>
      </div>
      <p className="text-sm text-slate-300 mb-4">Classic Nigerian Whot game. Beat your friends to win the pot.</p>
      {balance ? (
        <div className="text-xs">
          <span className="text-slate-400">Balance:</span>{' '}
          <span className="text-orange-400 font-bold">₦{balance.balance.toLocaleString()}</span>
        </div>
      ) : loading ? <Spinner label="" /> : null}
    </Link>
  );
}

function LudoCard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/games/ludo/balance').then(({ data }) => { setBalance(data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <Link to="/games/ludo" className="block h-full p-5 glass-deep rounded-xl hover:bg-white/5 transition group">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xl">
          🎲
        </div>
        <div>
          <h3 className="font-display text-xl text-white group-hover:text-green-400 transition">Nigerian Ludo</h3>
          <p className="text-xs text-slate-400">Nigerian Ludo Game</p>
        </div>
      </div>
      <p className="text-sm text-slate-300 mb-4">Roll the dice, move your tokens home. Classic Nigerian Ludo.</p>
      {balance ? (
        <div className="text-xs">
          <span className="text-slate-400">Balance:</span>{' '}
          <span className="text-green-400 font-bold">₦{balance.balance.toLocaleString()}</span>
        </div>
      ) : loading ? <Spinner label="" /> : null}
    </Link>
  );
}

export default function Games() {
  const [leaderboards, setLeaderboards] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/games/leaderboard').then(({ data }) => { setLeaderboards(data); }).catch((e) => setErr(errMsg(e)));
    const s = api.get('/games/leaderboard');
    const h = () => api.get('/games/leaderboard').then(({ data }) => { setLeaderboards(data); }).catch((e) => setErr(errMsg(e)));
    const t = setInterval(h, 300000);
    return () => {
      s.catch(() => {});
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl mb-4">APEX FM <span className="text-gold">Games</span></h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ApexGTCard />
        <WhotCard />
        <LudoCard />
      </div>

      {leaderboards && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl mb-4">Leaderboards</h2>
          <div className="glass p-5 rounded-xl">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <h3 className="text-sm text-slate-400 mb-2">APEX GT</h3>
                <div className="space-y-2">
                  {leaderboards.apex.map((entry, i) => (
                    <div key={i} className="flex justify-between text-sm text-slate-200">
                      <span>{entry.user}</span>
                      <span className="text-cyan-400 font-bold">₦{entry.balance.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm text-slate-400 mb-2">Nigerian Whot</h3>
                <div className="space-y-2">
                  {leaderboards.whot.map((entry, i) => (
                    <div key={i} className="flex justify-between text-sm text-slate-200">
                      <span>{entry.user}</span>
                      <span className="text-orange-400 font-bold">₦{entry.balance.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm text-slate-400 mb-2">Nigerian Ludo</h3>
                <div className="space-y-2">
                  {leaderboards.ludo.map((entry, i) => (
                    <div key={i} className="flex justify-between text-sm text-slate-200">
                      <span>{entry.user}</span>
                      <span className="text-green-400 font-bold">₦{entry.balance.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        <strong>VIRTUAL CURRENCY ONLY:</strong> All in-game balances are virtual ₦10,000,000. No real-money deposits or cash-outs.
      </p>
    </div>
  );
}