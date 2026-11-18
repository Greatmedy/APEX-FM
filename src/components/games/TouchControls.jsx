import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function TouchControls({ onInput, enabled = true, layout = 'standard' }) {
  const [activeKeys, setActiveKeys] = useState({ left: false, right: false, accelerate: false, brake: false, nitro: false });
  const touchRefs = useRef({});
  const rafRef = useRef(null);

  // Send input at 60Hz
  const sendInput = useCallback(() => {
    if (!enabled) return;

    onInput({
      steer: (activeKeys.left ? -1 : 0) + (activeKeys.right ? 1 : 0),
      accelerate: activeKeys.accelerate ? 1 : 0,
      brake: activeKeys.brake ? 1 : 0,
      nitro: activeKeys.nitro,
    });

    rafRef.current = requestAnimationFrame(sendInput);
  }, [activeKeys, enabled, onInput]);

  useEffect(() => {
    if (enabled) {
      rafRef.current = requestAnimationFrame(sendInput);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, sendInput]);

  const setKey = (key, value) => {
    setActiveKeys(prev => ({ ...prev, [key]: value }));
  };

  const createTouchHandlers = (key) => ({
    onTouchStart: (e) => { e.preventDefault(); setKey(key, true); },
    onTouchEnd: (e) => { e.preventDefault(); setKey(key, false); },
    onMouseDown: (e) => { e.preventDefault(); setKey(key, true); },
    onMouseUp: (e) => { e.preventDefault(); setKey(key, false); },
    onMouseLeave: (e) => { e.preventDefault(); setKey(key, false); },
    onContextMenu: (e) => e.preventDefault(),
  });

  // Only render on touch devices or when forced
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouchDevice && !enabled) return null;

  return (
    <div className="touch-controls fixed inset-0 pointer-events-none select-none z-40" style={{ touchAction: 'none' }}>
      <AnimatePresence mode="wait">
        {enabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto"
          >
            {/* Left side - Steering */}
            <div className="absolute bottom-6 left-4 flex flex-col items-center gap-3" style={{
              zIndex: 50,
              transform: 'translateZ(0)',
            }}>
              <motion.button
                {...createTouchHandlers('left')}
                className={`touch-btn w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center transition-all ${
                  activeKeys.left ? 'scale-95' : ''
                }`}
                style={{
                  background: activeKeys.left ? 'rgba(226,182,87,0.4)' : 'rgba(255,255,255,0.1)',
                  border: activeKeys.left ? '2px solid #E2B657' : '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  touchAction: 'none',
                }}
                aria-label="Steer left"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </motion.button>
              <motion.button
                {...createTouchHandlers('right')}
                className={`touch-btn w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center transition-all ${
                  activeKeys.right ? 'scale-95' : ''
                }`}
                style={{
                  background: activeKeys.right ? 'rgba(226,182,87,0.4)' : 'rgba(255,255,255,0.1)',
                  border: activeKeys.right ? '2px solid #E2B657' : '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  touchAction: 'none',
                }}
                aria-label="Steer right"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </motion.button>
            </div>

            {/* Right side - Accelerate/Brake */}
            <div className="absolute bottom-6 right-4 flex flex-col items-center gap-3" style={{
              zIndex: 50,
              transform: 'translateZ(0)',
            }}>
              <motion.button
                {...createTouchHandlers('accelerate')}
                className={`touch-btn w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center transition-all ${
                  activeKeys.accelerate ? 'scale-95' : ''
                }`}
                style={{
                  background: activeKeys.accelerate ? 'rgba(20,241,149,0.4)' : 'rgba(255,255,255,0.1)',
                  border: activeKeys.accelerate ? '2px solid #14F195' : '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  touchAction: 'none',
                }}
                aria-label="Accelerate"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </motion.button>
              <motion.button
                {...createTouchHandlers('brake')}
                className={`touch-btn w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center transition-all ${
                  activeKeys.brake ? 'scale-95' : ''
                }`}
                style={{
                  background: activeKeys.brake ? 'rgba(225,29,72,0.4)' : 'rgba(255,255,255,0.1)',
                  border: activeKeys.brake ? '2px solid #E11D48' : '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  touchAction: 'none',
                }}
                aria-label="Brake"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 15 12 9 18 15"></polyline>
                </svg>
              </motion.button>
            </div>

            {/* Nitro button - bottom center */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2" style={{ zIndex: 50 }}>
              <motion.button
                {...createTouchHandlers('nitro')}
                className={`touch-btn w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${activeKeys.nitro ? 'scale-95' : ''}`}
                style={{
                  background: activeKeys.nitro ? 'rgba(249,115,22,0.5)' : 'linear-gradient(135deg, #f97316, #ea580c)',
                  border: activeKeys.nitro ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                  boxShadow: activeKeys.nitro ? '0 0 20px rgba(249,115,22,0.6)' : '0 4px 16px rgba(249,115,22,0.3)',
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  touchAction: 'none',
                }}
                aria-label="Nitro boost"
              >
                NITRO
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Alternative layout: Tilt steering (for devices with accelerometer)
export function TiltControls({ onInput, enabled = true, sensitivity = 1.0 }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [permission, setPermission] = useState(null);
  const rafRef = useRef(null);

  const sendInput = useCallback(() => {
    if (!enabled) return;

    // Map tilt to steer (x-axis) and accelerate/brake (y-axis)
    const steer = Math.max(-1, Math.min(1, tilt.x * sensitivity * 3));
    const accelerate = Math.max(0, -tilt.y * sensitivity * 2);
    const brake = Math.max(0, tilt.y * sensitivity * 2);

    onInput({ steer, accelerate, brake, nitro: false });
    rafRef.current = requestAnimationFrame(sendInput);
  }, [tilt, enabled, sensitivity, onInput]);

  useEffect(() => {
    const handleOrientation = (e) => {
      // gamma: left/right tilt (-90 to 90)
      // beta: front/back tilt (-180 to 180)
      setTilt({
        x: Math.max(-1, Math.min(1, (e.gamma || 0) / 30)),
        y: Math.max(-1, Math.min(1, (e.beta || 0) / 45)),
      });
    };

    const requestPermission = async () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          setPermission(perm);
          if (perm === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (err) {
          console.warn('DeviceOrientation permission denied:', err);
        }
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
        setPermission('granted');
      }
    };

    if (enabled) {
      requestPermission();
      rafRef.current = requestAnimationFrame(sendInput);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, sendInput, sensitivity]);

  if (!enabled || permission !== 'granted') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-center text-xs text-slate-400 bg-ink/80 backdrop-blur px-3 py-2 rounded-lg border border-white/10 z-40">
      Tilt to steer • Tip forward/back for gas/brake
    </div>
  );
}

// Keyboard controls hook for desktop
export function useKeyboardControls(enabled = true) {
  const keysRef = useRef({ ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, Space: false, ShiftLeft: false, KeyW: false, KeyA: false, KeyS: false, KeyD: false });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (keysRef.current.hasOwnProperty(e.code)) {
        e.preventDefault();
        keysRef.current[e.code] = true;
      }
    };

    const handleKeyUp = (e) => {
      if (keysRef.current.hasOwnProperty(e.code)) {
        e.preventDefault();
        keysRef.current[e.code] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled]);

  const getInput = useCallback(() => {
    const k = keysRef.current;
    return {
      steer: (k.ArrowLeft || k.KeyA ? -1 : 0) + (k.ArrowRight || k.KeyD ? 1 : 0),
      accelerate: (k.ArrowUp || k.KeyW) ? 1 : 0,
      brake: (k.ArrowDown || k.KeyS || k.Space) ? 1 : 0,
      nitro: k.ShiftLeft,
    };
  }, []);

  return { getInput, keys: keysRef.current };
}

// Gamepad controls hook
export function useGamepadControls(enabled = true) {
  const [gamepadIndex, setGamepadIndex] = useState(-1);

  useEffect(() => {
    if (!enabled) return;

    const handleConnect = (e) => {
      const gp = e.gamepad;
      console.log('Gamepad connected:', gp.id, gp.index);
      // Prefer gamepads with standard mapping
      if (gp.mapping === 'standard' || gp.buttons.length >= 12) {
        setGamepadIndex(gp.index);
      }
    };

    const handleDisconnect = (e) => {
      if (e.gamepad.index === gamepadIndex) {
        setGamepadIndex(-1);
      }
    };

    window.addEventListener('gamepadconnected', handleConnect);
    window.addEventListener('gamepaddisconnected', handleDisconnect);

    // Check for already connected gamepads
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp && (gp.mapping === 'standard' || gp.buttons.length >= 12)) {
        setGamepadIndex(gp.index);
        break;
      }
    }

    return () => {
      window.removeEventListener('gamepadconnected', handleConnect);
      window.removeEventListener('gamepaddisconnected', handleDisconnect);
    };
  }, [enabled]);

  const getInput = useCallback(() => {
    if (gamepadIndex < 0) return { steer: 0, accelerate: 0, brake: 0, nitro: false };

    const gamepads = navigator.getGamepads();
    const gp = gamepads[gamepadIndex];
    if (!gp) return { steer: 0, accelerate: 0, brake: 0, nitro: false };

    // Standard gamepad mapping:
    // Left stick X: axes[0] (-1 to 1)
    // Left stick Y: axes[1] (-1 to 1)
    // Right trigger: axes[5] or buttons[7] (0 to 1)
    // Left trigger: axes[2] or buttons[6] (0 to 1)
    // A button: buttons[0] (nitro)
    // B button: buttons[1] (handbrake/brake)

    const deadzone = 0.1;
    const steerRaw = gp.axes[0] || 0;
    const steer = Math.abs(steerRaw) > deadzone ? steerRaw : 0;

    // Right trigger for accelerate (axes[5] on standard, or buttons[7])
    const accelerateRaw = gp.axes[5] !== undefined ? (gp.axes[5] + 1) / 2 : (gp.buttons[7]?.value || 0);
    const accelerate = accelerateRaw > deadzone ? accelerateRaw : 0;

    // Left trigger for brake (axes[2] on standard, or buttons[6])
    const brakeRaw = gp.axes[2] !== undefined ? (gp.axes[2] + 1) / 2 : (gp.buttons[6]?.value || 0);
    const brake = brakeRaw > deadzone ? brakeRaw : 0;

    // A button for nitro
    const nitro = gp.buttons[0]?.pressed || false;

    return { steer, accelerate, brake, nitro };
  }, [gamepadIndex]);

  return { getInput, connected: gamepadIndex >= 0, index: gamepadIndex };
}