import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

// Ludo board constants
const COLORS = {
  red: '#E63946',
  yellow: '#F4A261',
  green: '#2A9D8F',
  blue: '#457B9D',
};

const COLOR_LIGHT = {
  red: '#ff6b6b',
  yellow: '#ffd93d',
  green: '#6bdb9a',
  blue: '#74b9ff',
};

// Generate board coordinates
function generateBoardData() {
  // Yard positions (4 tokens per color, stacked)
  const yardOffsets = {
    red: { x: 1, y: 1 },      // Top-left
    yellow: { x: 13, y: 1 },  // Top-right
    green: { x: 13, y: 13 },  // Bottom-right
    blue: { x: 1, y: 13 },    // Bottom-left
  };

  // Track positions (52 squares around the board)
  // Verified layout for 15x15 grid with center at (7,7)
  const positions = [];

  // Red arm: 6 squares from (7,1) to (7,6) - indices 0-5
  for (let i = 0; i < 6; i++) positions.push({x: 7, y: 1 + i});

  // Top cross: 6 squares from (8,6) to (13,6) - indices 6-11
  for (let i = 1; i <= 6; i++) positions.push({x: 7 + i, y: 6});

  // Yellow arm: 6 squares from (13,7) to (8,7) [leftward] - indices 12-17
  for (let i = 0; i < 6; i++) positions.push({x: 13 - i, y: 7});

  // Right cross: 6 squares from (7,8) to (7,13) - indices 18-23
  for (let i = 1; i <= 6; i++) positions.push({x: 7, y: 7 + i});

  // Green arm: 6 squares from (6,13) to (6,8) [upward] - indices 24-29
  for (let i = 0; i < 6; i++) positions.push({x: 6, y: 13 - i});

  // Bottom cross: 6 squares from (5,7) to (0,7) [leftward] - indices 30-35
  for (let i = 1; i <= 6; i++) positions.push({x: 7 - i, y: 7});

  // Blue arm: 6 squares from (0,6) to (5,6) [rightward] - indices 36-41
  for (let i = 0; i < 6; i++) positions.push({x: i, y: 6});

  // Left cross: 6 squares from (6,5) to (6,0) [upward] - indices 42-47
  for (let i = 1; i <= 6; i++) positions.push({x: 6, y: 6 - i});

  // Top cross left: 4 squares from (7,0) to (10,0) - indices 48-51
  for (let i = 1; i <= 4; i++) positions.push({x: 7 + i, y: 0});

  // We now have 6*8 + 4 = 52 positions
  // Safe squares at indices: 0, 8, 13, 21, 26, 34, 39, 47
  const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  // Ensure exactly 52 positions
  while (positions.length < 52) positions.push({x: 7, y: 0});
  positions.length = 52;

  // Map to coordinates with safe flag
  const trackCoords = positions.map((p, i) => ({
    x: p.x,
    y: p.y,
    safe: SAFE_INDICES.has(i),
  }));

  const center = {x: 7, y: 7};

  return { trackCoords, center, yardOffsets };
}

const BOARD_DATA = generateBoardData();
const TRACK_COORDS = BOARD_DATA.trackCoords;
const CENTER = BOARD_DATA.center;
const YARD_OFFSETS = BOARD_DATA.yardOffsets;

// Convert board grid coordinates to SVG coordinates (0-100%)
function gridToSvg(x, y) {
  const padding = 5;
  const scale = 90 / 15;
  return {
    x: padding + x * scale,
    y: padding + y * scale,
  };
}

// Get SVG position for a token at a given game position
function getTokenSvgPosition(color, position, tokenIndex) {
  if (position === -1) {
    const base = YARD_OFFSETS[color];
    const row = Math.floor(tokenIndex / 2);
    const col = tokenIndex % 2;
    return gridToSvg(base.x + col * 2.5, base.y + row * 2.5);
  }

  if (position >= 0 && position <= 51) {
    const trackPos = TRACK_COORDS[position];
    if (trackPos) return gridToSvg(trackPos.x, trackPos.y);
  }

  if (position >= 52 && position <= 57) {
    const step = position - 52;
    let x = CENTER.x, y = CENTER.y;
    switch (color) {
      case 'red': x = 7; y = 7 - step - 1; break;
      case 'yellow': x = 7 + (6 - step); y = 7; break;
      case 'green': x = 7; y = 7 + step + 1; break;
      case 'blue': x = 7 - (6 - step); y = 7; break;
    }
    return gridToSvg(x, y);
  }

  return gridToSvg(CENTER.x, CENTER.y);
}

// Check if a track position is safe
function isSafePosition(pos) {
  if (pos < 0 || pos > 51) return false;
  return TRACK_COORDS[pos]?.safe || false;
}

// Determine if a token can move given die roll
function canTokenMove(tokenPos, die) {
  if (tokenPos === -1) return die === 6;
  if (tokenPos >= 52) return tokenPos + die <= 57;
  const newPos = tokenPos + die;
  if (newPos > 57) return false;
  return true;
}

export function LudoBoard({
  game,
  myColor,
  myTokens,
  die,
  myTurn,
  rolled,
  onTokenClick,
  disabled,
}) {
  const players = game?.players || [];

  // Get all tokens on board for collision detection
  const allTokensOnBoard = useMemo(() => {
    const tokens = [];
    players.forEach(p => {
      p.tokens.forEach((pos, i) => {
        if (pos >= 0) {
          tokens.push({ color: p.color, position: pos, tokenIndex: i, playerId: p.user });
        }
      });
    });
    return tokens;
  }, [players]);

  // Get tokens at each position
  const tokensAtPosition = useMemo(() => {
    const map = {};
    allTokensOnBoard.forEach(t => {
      if (!map[t.position]) map[t.position] = [];
      map[t.position].push(t);
    });
    return map;
  }, [allTokensOnBoard]);

  // Determine which of my tokens are movable
  const movableTokens = useMemo(() => {
    if (!myTurn || !rolled || !die) return new Set();
    const movable = new Set();
    myTokens.forEach((pos, i) => {
      if (canTokenMove(pos, die)) {
        movable.add(i);
      }
    });
    return movable;
  }, [myTurn, rolled, die, myTokens]);

  const cellSize = 90 / 15; // 6%

  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
    >
      <defs>
        {/* Gradients for yards */}
        {['red', 'yellow', 'green', 'blue'].map(color => (
          <linearGradient key={color} id={`yard-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS[color]} stopOpacity="0.3" />
            <stop offset="100%" stopColor={COLORS[color]} stopOpacity="0.1" />
          </linearGradient>
        ))}

        {/* Safe square glow */}
        <filter id="safe-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        {/* Token shadow */}
        <filter id="token-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.3"/>
        </filter>
      </defs>

      {/* Background */}
      <rect x="0" y="0" width="100" height="100" fill="#FFF8F0" />

      {/* Four yard quadrants */}
      <rect x="5" y="5" width="40" height="40" fill="url(#yard-red)" stroke={COLORS.red} strokeWidth="1.5" rx="3" />
      <rect x="55" y="5" width="40" height="40" fill="url(#yard-yellow)" stroke={COLORS.yellow} strokeWidth="1.5" rx="3" />
      <rect x="55" y="55" width="40" height="40" fill="url(#yard-green)" stroke={COLORS.green} strokeWidth="1.5" rx="3" />
      <rect x="5" y="55" width="40" height="40" fill="url(#yard-blue)" stroke={COLORS.blue} strokeWidth="1.5" rx="3" />

      {/* Yard labels */}
      <text x="25" y="28" textAnchor="middle" fill={COLORS.red} fontSize="8" fontWeight="bold" fontFamily="system-ui">RED</text>
      <text x="75" y="28" textAnchor="middle" fill={COLORS.yellow} fontSize="8" fontWeight="bold" fontFamily="system-ui">YELLOW</text>
      <text x="75" y="78" textAnchor="middle" fill={COLORS.green} fontSize="8" fontWeight="bold" fontFamily="system-ui">GREEN</text>
      <text x="25" y="78" textAnchor="middle" fill={COLORS.blue} fontSize="8" fontWeight="bold" fontFamily="system-ui">BLUE</text>

      {/* Center home area */}
      <circle cx="50" cy="50" r="18" fill="#1D3557" stroke="#fff" strokeWidth="1" opacity="0.2" />
      <text x="50" y="53" textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold" fontFamily="system-ui" opacity="0.7">HOME</text>

      {/* Track squares */}
      {TRACK_COORDS.map((trackPos, index) => {
        const svgPos = gridToSvg(trackPos.x, trackPos.y);
        const isSafe = trackPos.safe;
        const tokensHere = tokensAtPosition[index] || [];

        return (
          <g key={index}>
            {/* Track square */}
            <rect
              x={svgPos.x - cellSize/2}
              y={svgPos.y - cellSize/2}
              width={cellSize * 0.9}
              height={cellSize * 0.9}
              rx={1}
              fill={isSafe ? COLORS[myColor] : '#E8D8C4'}
              stroke={isSafe ? COLORS[myColor] : '#D4C4B0'}
              strokeWidth={isSafe ? 1.5 : 0.5}
              opacity={isSafe ? 0.4 : 1}
              filter={isSafe ? 'url(#safe-glow)' : 'none'}
            />

            {/* Safe star indicator */}
            {isSafe && (
              <text
                x={svgPos.x}
                y={svgPos.y + 1.5}
                textAnchor="middle"
                fill={COLORS[myColor]}
                fontSize="3.5"
                fontWeight="bold"
              >
                ★
              </text>
            )}

            {/* Tokens on this square */}
            {tokensHere.map((token, ti) => {
              const offset = tokensHere.length > 1 ? (ti - (tokensHere.length - 1) / 2) * 1.8 : 0;
              const isMyToken = token.color === myColor;
              const canMove = isMyToken && movableTokens.has(token.tokenIndex);

              return (
                <motion.g
                  key={`${token.color}-${token.tokenIndex}`}
                  filter="url(#token-shadow)"
                  style={{ cursor: canMove && !disabled ? 'pointer' : 'default' }}
                  onClick={() => canMove && !disabled && onTokenClick(token.tokenIndex)}
                  whileTap={{ scale: 0.9 }}
                  animate={canMove && !disabled ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <circle
                    cx={svgPos.x + offset}
                    cy={svgPos.y}
                    r={cellSize * 0.35}
                    fill={COLORS[token.color]}
                    stroke="#fff"
                    strokeWidth={isMyToken && canMove && !disabled ? 2.5 : 1.5}
                    strokeDasharray={isMyToken && canMove && !disabled ? "3 2" : "none"}
                  />
                  <text
                    x={svgPos.x + offset}
                    y={svgPos.y + 1.2}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="2.5"
                    fontWeight="bold"
                    fontFamily="system-ui"
                    pointerEvents="none"
                  >
                    {token.tokenIndex + 1}
                  </text>
                </motion.g>
              );
            })}
          </g>
        );
      })}

      {/* Home paths */}
      {['red', 'yellow', 'green', 'blue'].map(color => {
        const colorTokens = allTokensOnBoard.filter(t => t.color === color && t.position >= 52 && t.position <= 57);
        return colorTokens.map(token => {
          const step = token.position - 52;
          let x = CENTER.x, y = CENTER.y;

          switch (color) {
            case 'red': x = 7; y = 7 - step - 1; break;
            case 'yellow': x = 7 + (6 - step); y = 7; break;
            case 'green': x = 7; y = 7 + step + 1; break;
            case 'blue': x = 7 - (6 - step); y = 7; break;
          }

          const svgPos = gridToSvg(x, y);
          const isMyToken = color === myColor;
          const canMove = isMyToken && movableTokens.has(token.tokenIndex);

          return (
            <motion.g
              key={`home-${color}-${token.tokenIndex}`}
              filter="url(#token-shadow)"
              style={{ cursor: canMove && !disabled ? 'pointer' : 'default' }}
              onClick={() => canMove && !disabled && onTokenClick(token.tokenIndex)}
              whileTap={{ scale: 0.9 }}
              animate={canMove && !disabled ? { scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <rect
                x={svgPos.x - cellSize * 0.35}
                y={svgPos.y - cellSize * 0.35}
                width={cellSize * 0.7}
                height={cellSize * 0.7}
                rx={2}
                fill={COLORS[color]}
                stroke="#fff"
                strokeWidth={isMyToken && canMove && !disabled ? 2.5 : 1.5}
                strokeDasharray={isMyToken && canMove && !disabled ? "3 2" : "none"}
              />
              <text
                x={svgPos.x}
                y={svgPos.y + 1.2}
                textAnchor="middle"
                fill="#fff"
                fontSize="2.5"
                fontWeight="bold"
                fontFamily="system-ui"
                pointerEvents="none"
              >
                {token.tokenIndex + 1}
              </text>
            </motion.g>
          );
        });
      })}

      {/* Yard tokens */}
      {players.map(p => {
        return p.tokens.map((pos, i) => {
          if (pos !== -1) return null;

          const base = YARD_OFFSETS[p.color];
          const row = Math.floor(i / 2);
          const col = i % 2;
          const svgPos = gridToSvg(base.x + col * 2.5, base.y + row * 2.5);
          const isMyToken = p.color === myColor;
          const canMove = isMyToken && movableTokens.has(i) && die === 6;

          return (
            <motion.g
              key={`yard-${p.color}-${i}`}
              filter="url(#token-shadow)"
              style={{ cursor: canMove && !disabled ? 'pointer' : 'default' }}
              onClick={() => canMove && !disabled && onTokenClick(i)}
              whileTap={{ scale: 0.9 }}
              animate={canMove && !disabled ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <circle
                cx={svgPos.x}
                cy={svgPos.y}
                r={cellSize * 0.45}
                fill={COLORS[p.color]}
                stroke="#fff"
                strokeWidth={isMyToken && canMove && !disabled ? 3 : 1.5}
                strokeDasharray={isMyToken && canMove && !disabled ? "4 2" : "none"}
                opacity={isMyToken && canMove && !disabled ? 1 : 0.6}
              />
              <text
                x={svgPos.x}
                y={svgPos.y + 1.5}
                textAnchor="middle"
                fill="#fff"
                fontSize="3"
                fontWeight="bold"
                fontFamily="system-ui"
                pointerEvents="none"
              >
                {i + 1}
              </text>
            </motion.g>
          );
        });
      })}

      {/* Finished tokens in center */}
      {players.map(p => {
        const finishedCount = p.tokens.filter(t => t >= 58).length;
        if (finishedCount === 0) return null;

        return Array.from({ length: finishedCount }, (_, i) => (
          <g key={`finished-${p.color}-${i}`}>
            <circle
              cx={50 + (i - (finishedCount - 1) / 2) * 3}
              cy={50}
              r={4}
              fill={COLORS[p.color]}
              stroke="#fff"
              strokeWidth="1.5"
            />
            <text
              x={50 + (i - (finishedCount - 1) / 2) * 3}
              y={51.5}
              textAnchor="middle"
              fill="#fff"
              fontSize="2"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              ✓
            </text>
          </g>
        ));
      })}
    </svg>
  );
}