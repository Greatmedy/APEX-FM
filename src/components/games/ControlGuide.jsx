import { useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '../ui';

export function ControlGuide({ open, onClose }) {
  const [tab, setTab] = useState('keyboard');

  const controls = {
    keyboard: [
      { key: '↑ / W', action: 'Accelerate' },
      { key: '↓ / S / Space', action: 'Brake / Reverse' },
      { key: '← / A', action: 'Steer Left' },
      { key: '→ / D', action: 'Steer Right' },
      { key: 'Shift (Left)', action: 'Nitro Boost' },
      { key: 'Esc', action: 'Pause / Menu' },
    ],
    gamepad: [
      { key: 'Left Stick ←/→', action: 'Steer' },
      { key: 'Right Trigger (RT)', action: 'Accelerate' },
      { key: 'Left Trigger (LT)', action: 'Brake' },
      { key: 'A Button', action: 'Nitro Boost' },
      { key: 'B Button', action: 'Handbrake / Drift' },
      { key: 'Start', action: 'Pause / Menu' },
    ],
    touch: [
      { key: 'Left Buttons', action: 'Steer Left / Right' },
      { key: 'Right Top Button', action: 'Accelerate' },
      { key: 'Right Bottom Button', action: 'Brake' },
      { key: 'Center Button', action: 'Nitro Boost' },
      { key: 'Tilt (optional)', action: 'Steer by tilting device' },
    ],
  };

  return (
    <Modal open={open} onClose={onClose} title="Controls" wide>
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10" role="tablist">
          {(['keyboard', 'gamepad', 'touch']).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-[40px] px-4 rounded-lg text-sm font-bold whitespace-nowrap transition ${
                tab === t ? 'bg-gold text-ink' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Controls List */}
        <div className="space-y-2" role="tabpanel">
          {controls[tab].map((c, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg border border-white/10">
              <kbd className="px-3 py-1.5 rounded bg-ink/50 border border-white/10 font-mono text-sm text-cyan-300">
                {c.key}
              </kbd>
              <span className="text-slate-200 ml-4">{c.action}</span>
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="mt-4 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
          <h4 className="font-bold text-cyan-400 mb-2">Tips</h4>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>• Brake before corners, accelerate out of them</li>
            <li>• Use nitro on straights for maximum speed</li>
            <li>• AI opponents adapt to your driving style</li>
            <li>• Watch the mini-map for upcoming corners</li>
            <li>• Game pauses automatically when tab loses focus</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}