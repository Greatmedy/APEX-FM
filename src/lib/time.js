let offset = 0; // server - client, ms
export const setServerNow = (serverNow) => { if (serverNow) offset = serverNow - Date.now(); };
export const nowMs = () => Date.now() + offset;

const WAT = 'Africa/Lagos';
const f = (opts, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts });
export const fmtWAT = (d) => f({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, WAT).format(new Date(d)).replace(',', '') + ' WAT';
export const fmtWATDay = (d) => f({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, WAT).format(new Date(d));
export const fmtWATTime = (d) => f({ hour: '2-digit', minute: '2-digit', hour12: false }, WAT).format(new Date(d)) + ' WAT';
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const fmtLocal = (d) => (localTz === WAT ? null : f({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, localTz).format(new Date(d)).replace(',', '') + ` (${localTz.split('/').pop().replace('_', ' ')})`);
export function countdown(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${String(sec).padStart(2, '0')}s`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}
export const ago = (d) => {
  const s = Math.max(1, Math.floor((nowMs() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};
/** real seconds since kickoff -> match seconds (matches the server mapping) */
export function realToMatch(real) {
  if (real <= 0) return 0;
  if (real < 300) return real * 9;
  if (real < 320) return 2700;
  return Math.min(5400, 2700 + (real - 320) * 9);
}
export const fmtClock = (sec) => {
  const m = Math.floor(sec / 60);
  return `${String(Math.min(m, 90)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
};
