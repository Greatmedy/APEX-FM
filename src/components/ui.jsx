import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const Glass = ({ className = '', children, deep, ...p }) => <div className={`${deep ? 'glass-deep' : 'glass'} ${className}`} {...p}>{children}</div>;

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-300" role="status">
      <span className="h-5 w-5 rounded-full border-2 border-white/20 border-t-pitch animate-spin" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}
export const EmptyState = ({ title, body, action }) => (
  <div className="text-center py-10 px-4">
    <p className="font-display text-xl tracking-wide">{title}</p>
    {body && <p className="text-slate-300 text-sm mt-1 max-w-sm mx-auto">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
export const ErrorState = ({ message, onRetry }) => (
  <div className="text-center py-10 px-4">
    <p className="font-display text-xl text-rose-300">Could not load this</p>
    <p className="text-slate-300 text-sm mt-1">{message}</p>
    {onRetry && <button className="btn btn-ghost mt-4" onClick={onRetry}>Try again</button>}
  </div>
);
export function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
      {error && <span className="block text-xs text-rose-300 mt-1" role="alert">{error}</span>}
    </label>
  );
}
export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-root fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            className={`glass-deep modal-panel w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'} flex flex-col rounded-b-none sm:rounded-b-[1.1rem]`}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
              <h2 className="font-display text-xl tracking-wide truncate">{title}</h2>
              <button className="btn btn-ghost !min-h-[40px] !px-3" onClick={onClose} aria-label="Close">Close</button>
            </div>
            <div className="scroll-y p-5 flex-1 min-h-0">{children}</div>
            {footer && <div className="shrink-0 border-t border-white/10 p-3 sm:p-4 modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 overflow-x-auto ${className}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`min-h-[40px] px-4 rounded-lg text-sm font-bold whitespace-nowrap transition ${value === t.id ? 'bg-gold text-ink' : 'text-slate-300 hover:bg-white/10'}`}>{t.label}</button>
      ))}
    </div>
  );
}
export const FormChips = ({ form = [] }) => (
  <div className="flex gap-1">
    {form.length === 0 && <span className="text-xs text-slate-400">No matches yet</span>}
    {form.slice(-5).map((r, i) => (
      <span key={i} className={`chip ${r === 'W' ? 'bg-pitch text-ink' : r === 'D' ? 'bg-slate-500 text-white' : 'bg-danger text-white'}`}>{r}</span>
    ))}
  </div>
);
export const Stat = ({ label, value, accent }) => (
  <div className="glass px-4 py-3">
    <div className="text-xs text-slate-300 font-semibold">{label}</div>
    <div className={`num text-3xl leading-tight ${accent === 'gold' ? 'text-gold' : accent === 'pitch' ? 'text-pitch' : ''}`}>{value}</div>
  </div>
);
