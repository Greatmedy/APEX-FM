import { createState, applyEvent } from './matchCore';

/** Plays an event log against a setup. Same class drives live viewing and replay. */
export class MatchPlayer {
  constructor(setup, onEvent) {
    this.setup = setup; this.onEvent = onEvent || null;
    this.events = []; this.reset();
  }
  reset() { this.st = createState(this.setup); this.idx = 0; this.vsec = 0; this.hold = 0; this.appliedAt = 0; this.rev = 0; }
  /** live: append events by index; returns false when a gap needs a resync */
  push(ev) {
    if (ev.i < this.events.length) return true;
    if (ev.i > this.events.length) return false;
    this.events.push(ev);
    return true;
  }
  setEvents(list) { this.events = list.slice(); }
  applyNext(silent) {
    const ev = this.events[this.idx++];
    applyEvent(this.st, ev);
    this.appliedAt = performance.now(); this.rev++;
    if (!silent && this.onEvent) this.onEvent(ev, this.st);
    return ev;
  }
  /** live follow: apply everything received */
  drain(silent = false) { let n = 0; while (this.idx < this.events.length) { this.applyNext(silent); n++; } return n; }
  /** replay clock; dt in real seconds */
  tick(dt, speed = 1) {
    if (this.hold > 0) { this.hold -= dt * speed; return; }
    if (this.idx >= this.events.length) return;
    this.vsec += dt * 9 * speed;
    while (this.idx < this.events.length && this.events[this.idx].s <= this.vsec) {
      const ev = this.applyNext(false);
      if (ev.k === 'halftime') { this.hold = 20; break; }
    }
  }
  seek(sec) {
    this.reset(); this.vsec = sec;
    while (this.idx < this.events.length && this.events[this.idx].s <= sec) this.applyNext(true);
  }
  get ball() {
    const st = this.st;
    const z = st.z, x = st.poss === 'a' ? 1 - z : z;
    return { x, y: st.y };
  }
}
