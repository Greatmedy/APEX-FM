import { motion } from 'framer-motion';
import { Modal } from '../ui';

const SHAPE_ICON = { Circle: '●', Triangle: '▲', Cross: '✚', Square: '■', Star: '★' };
const SHAPE_COLOR = { Circle: '#38bdf8', Triangle: '#f472b6', Cross: '#f87171', Square: '#fbbf24', Star: '#a78bfa' };
const SHAPE_NAMES = { Circle: 'Circle', Triangle: 'Triangle', Cross: 'Cross', Square: 'Square', Star: 'Star' };

export function WhotShapePicker({ open, onClose, onSelect }) {
  const shapes = ['Circle', 'Triangle', 'Cross', 'Square', 'Star'];

  return (
    <Modal open={open} onClose={onClose} title="Call a Shape" wide={false}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300 text-center">You played a <b className="text-orange-400">WHOT!</b> Choose the shape the next player must match.</p>
        <div className="grid grid-cols-5 gap-3">
          {shapes.map(shape => (
            <motion.button
              key={shape}
              onClick={() => { onSelect(shape); onClose(); }}
              className="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 transition-all hover:scale-105 active:scale-95"
              style={{
                background: `linear-gradient(145deg, ${SHAPE_COLOR[shape]}20, ${SHAPE_COLOR[shape]}10)`,
                border: `2px solid ${SHAPE_COLOR[shape]}40`,
              }}
              whileHover={{ borderColor: SHAPE_COLOR[shape], background: `linear-gradient(145deg, ${SHAPE_COLOR[shape]}30, ${SHAPE_COLOR[shape]}20)` }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-4xl" style={{ color: SHAPE_COLOR[shape] }}>{SHAPE_ICON[shape]}</span>
              <span className="text-xs font-bold text-slate-300">{SHAPE_NAMES[shape]}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </Modal>
  );
}