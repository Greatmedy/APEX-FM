import { useMemo, useState } from 'react';
import { minuteOf } from '../../lib/matchCore';

const KEY = new Set(['goal', 'shot', 'save', 'foul', 'yellow', 'red', 'sub', 'pen', 'corner', 'miss', 'injury', 'halftime', 'fulltime', 'style']);
const TAG = {
  goal: ['GOAL', 'bg-pitch text-ink'], shot: ['SHOT', 'bg-white/15'], save: ['SAVE', 'bg-sky-500/70'], miss: ['MISS', 'bg-white/10'], foul: ['FOUL', 'bg-orange-500/70'],
  yellow: ['YELLOW', 'bg-yellow-400 text-ink'], red: ['RED', 'bg-danger'], pass: ['PASS', 'bg-white/10'], dribble: ['RUN', 'bg-white/10'], tackle: ['TACKLE', 'bg-white/10'],
  interception: ['CUT OUT', 'bg-white/10'], sub: ['SUB', 'bg-violet-500/70'], pen: ['PEN', 'bg-danger/80'], corner: ['CORNER', 'bg-white/15'], injury: ['INJURY', 'bg-rose-700'],
  kickoff: ['KICKOFF', 'bg-white/15'], goalkick: ['GOAL KICK', 'bg-white/10'], halftime: ['HT', 'bg-gold text-ink'], fulltime: ['FT', 'bg-gold text-ink'], style: ['TACTIC', 'bg-white/15'],
};

export function describe(ev, setup, assistNameFor) {
  const nm = (side, id) => {
    const S = setup[side];
    const p = S.lineup.find((x) => x.id === id) || S.bench.find((x) => x.id === id);
    return p ? p.name : 'Unknown';
  };
  const o = ev.t === 'h' ? 'a' : 'h';
  const team = setup[ev.t].short;
  switch (ev.k) {
    case 'goal': return `${nm(ev.t, ev.p)} scores${ev.pen ? ' from the spot' : ''} for ${team}.${ev.q ? ` Assist: ${nm(ev.t, ev.q)}.` : ''}`;
    case 'shot': return `${nm(ev.t, ev.p)} shoots${ev.pen ? ' the penalty' : ''}.`;
    case 'save': return `${nm(ev.t, ev.p)} saves from ${nm(o, ev.q)}.`;
    case 'miss': return ev.bl ? `${nm(ev.t, ev.p)}'s shot is blocked by ${nm(o, ev.q)}.` : ev.post ? `${nm(ev.t, ev.p)} hits the post.` : `${nm(ev.t, ev.p)} shoots wide.`;
    case 'pass': return `${nm(ev.t, ev.p)} passes to ${nm(ev.t, ev.q)}.`;
    case 'dribble': return `${nm(ev.t, ev.p)} carries the ball forward.`;
    case 'tackle': return `${nm(ev.t, ev.p)} wins the ball${ev.q ? ` from ${nm(o, ev.q)}` : ''}.`;
    case 'interception': return `${nm(ev.t, ev.p)} intercepts the pass.`;
    case 'foul': return `Foul by ${nm(ev.t, ev.p)} on ${nm(o, ev.q)}.`;
    case 'yellow': return `Yellow card for ${nm(ev.t, ev.p)}${ev.second ? ' (second yellow)' : ''}.`;
    case 'red': return `Red card. ${nm(ev.t, ev.p)} is sent off${ev.why === '2y' ? ' for a second yellow' : ''}.`;
    case 'pen': return `Penalty to ${team}.`;
    case 'corner': return `Corner to ${team}, taken by ${nm(ev.t, ev.p)}.`;
    case 'goalkick': return `Goal kick, ${nm(ev.t, ev.p)}.`;
    case 'sub': return `${team} substitution: ${nm(ev.t, ev.q)} on for ${nm(ev.t, ev.p)}${ev.forced ? ' (injury)' : ''}.`;
    case 'injury': return `${nm(ev.t, ev.p)} (${team}) is injured.`;
    case 'style': return `${team} switch to ${ev.style === 'press' ? 'high press' : ev.style === 'park' ? 'park the bus' : ev.style}.`;
    case 'kickoff': return ev.re ? `${team} restart after the goal.` : 'Kick off.';
    case 'halftime': return 'Half time.';
    case 'fulltime': return 'Full time.';
    default: return '';
  }
}

export default function EventFeed({ events, upto, setup, className = '' }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => events.slice(0, upto).filter((e) => all || KEY.has(e.k)).slice(-120).reverse(), [events, upto, all]);
  return (
    <div className={`glass flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="font-display text-lg tracking-wide">Match feed</p>
        <button className="text-xs font-bold text-pitch min-h-[36px] px-2" onClick={() => setAll((a) => !a)}>{all ? 'Key events only' : 'Show every pass'}</button>
      </div>
      <ul className="scroll-y flex-1 max-h-[340px] lg:max-h-none">
        {rows.length === 0 && <li className="p-5 text-sm text-slate-300">Waiting for kickoff.</li>}
        {rows.map((e) => {
          const [label, cls] = TAG[e.k] || ['', ''];
          return (
            <li key={e.i} className={`flex gap-3 px-4 py-2.5 border-b border-white/5 text-sm ${e.k === 'goal' ? 'bg-pitch/10' : ''}`}>
              <span className="num w-9 text-slate-300 shrink-0">{minuteOf(e.s)}'</span>
              <span className={`chip !px-1.5 h-fit mt-0.5 shrink-0 text-[10px] ${cls}`}>{label}</span>
              <span className="text-slate-100">{describe(e, setup)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
