import { useEffect, useState } from 'react';
import { countdown, nowMs } from '../lib/time';

export default function Countdown({ to, className = '', done = 'Starting now' }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const ms = new Date(to).getTime() - nowMs();
  return <span className={`num ${className}`}>{ms <= 0 ? done : countdown(ms)}</span>;
}
