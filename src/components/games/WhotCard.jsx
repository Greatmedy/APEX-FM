import { motion } from 'framer-motion';

const SHAPE_ICON = { Circle: '●', Triangle: '▲', Cross: '✚', Square: '■', Star: '★', Whot: '✦' };
const SHAPE_COLOR = { Circle: '#38bdf8', Triangle: '#f472b6', Cross: '#f87171', Square: '#fbbf24', Star: '#a78bfa', Whot: '#f97316' };
const SPECIAL_CARD_LABELS = {
  1: 'HOLD ON',
  2: 'PICK 2',
  5: 'PICK 3',
  8: 'SKIP',
  14: 'GEN. MARKET',
  20: 'WHOT!',
};

export function WhotCard({
  card,
  onClick,
  selected = false,
  playable = true,
  small = false,
  showSpecialLabel = true,
}) {
  if (!card) return null;

  const isSpecial = [1, 2, 5, 8, 14, 20].includes(card.num);
  const isWhot = card.num === 20;

  return (
    <motion.button
      onClick={onClick}
      disabled={!onClick || !playable}
      whileTap={{ scale: 0.95 }}
      animate={selected ? { scale: 1.05, y: -4 } : {}}
      transition={{ duration: 0.15 }}
      className={`relative rounded-lg border transition-all ${small ? 'w-10 h-14' : 'w-14 h-20 sm:w-16 sm:h-24'} flex flex-col items-center justify-center shadow-lg ${playable ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
      style={{
        background: 'linear-gradient(145deg,#1e293b,#0f172a)',
        borderColor: selected ? '#E2B657' : (playable ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'),
        borderWidth: selected ? 3 : 1,
        boxShadow: selected ? '0 0 20px rgba(226,182,87,0.4)' : '0 4px 12px rgba(0,0,0,0.3)',
      }}
      aria-label={`${card.shape} ${card.num}${isSpecial ? ` (${SPECIAL_CARD_LABELS[card.num]})` : ''}`}
      aria-pressed={selected}
    >
      <span className="absolute top-0.5 left-1 text-[9px] font-bold" style={{ color: SHAPE_COLOR[card.shape] }}>{card.num}</span>
      <span className="text-lg sm:text-2xl" style={{ color: SHAPE_COLOR[card.shape] }}>{SHAPE_ICON[card.shape]}</span>
      <span className="absolute bottom-0.5 right-1 text-[9px] font-bold" style={{ color: SHAPE_COLOR[card.shape] }}>{card.num}</span>

      {/* Special card indicator */}
      {showSpecialLabel && isSpecial && (
        <span className="absolute bottom-0 left-0 right-0 text-[7px] font-bold px-1 text-center"
              style={{
                color: isWhot ? '#fff' : '#000',
                background: isWhot ? 'linear-gradient(90deg, #f97316, #ea580c)' : 'linear-gradient(90deg, #E2B657, #fbbf24)',
                borderRadius: '0 0 8px 8px',
              }}>
          {SPECIAL_CARD_LABELS[card.num]}
        </span>
      )}

      {/* Whot wild indicator */}
      {isWhot && (
        <motion.span
          className="absolute top-0 left-0 right-0 text-[7px] font-bold px-1 text-center"
          style={{
            color: '#fff',
            background: 'linear-gradient(90deg, #f97316, #ea580c, #38bdf8, #a78bfa)',
            backgroundSize: '200% 200%',
            borderRadius: '8px 8px 0 0',
          }}
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          WILD
        </motion.span>
      )}

      {/* Selection glow */}
      {selected && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            border: '2px solid #E2B657',
            boxShadow: '0 0 15px rgba(226,182,87,0.6), inset 0 0 15px rgba(226,182,87,0.2)',
          }}
          animate={{ boxShadow: ['0 0 15px rgba(226,182,87,0.6)', '0 0 25px rgba(226,182,87,0.9)', '0 0 15px rgba(226,182,87,0.6)'] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}

      {/* Playable hint */}
      {playable && !selected && !small && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1.5 py-0.5 rounded"
             style={{ background: 'rgba(20,241,149,0.9)', color: '#07111F' }}>
          PLAY
        </div>
      )}
    </motion.button>
  );
}

export function WhotCardBack({ small = false }) {
  return (
    <div className={`relative rounded-lg border border-white/20 ${small ? 'w-10 h-14' : 'w-14 h-20 sm:w-16 sm:h-24'} flex items-center justify-center`}
         style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)' }}>
      <div className="text-center p-1">
        <div className="w-full h-1 bg-gradient-to-r from-cyan-400 via-gold to-orange-400 rounded mb-1" />
        <div className="w-full h-1 bg-gradient-to-r from-cyan-400 via-gold to-orange-400 rounded mb-1" />
        <div className="w-full h-1 bg-gradient-to-r from-cyan-400 via-gold to-orange-400 rounded" />
      </div>
      <span className="absolute bottom-1 right-1 text-[7px] font-bold text-white/30">WHOT</span>
    </div>
  );
}