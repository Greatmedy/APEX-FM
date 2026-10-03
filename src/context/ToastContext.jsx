import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-3), { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), type === 'error' ? 6000 : 3800);
  }, []);
  const colors = { info: 'border-white/20', success: 'border-pitch/70', error: 'border-danger/80' };
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="fixed z-[100] left-0 right-0 top-3 px-3 flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className={`pointer-events-auto glass-deep px-4 py-3 text-sm font-semibold max-w-md w-full border ${colors[t.type] || colors.info}`}>
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
