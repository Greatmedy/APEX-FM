import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import api, { errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner, ErrorState, Field, Modal } from '../../components/ui';
import { createRaceScene, createCarMesh, updateCarMesh, createCameraRig } from '../../components/games/RaceTrack';
import { TouchControls, useKeyboardControls, useGamepadControls } from '../../components/games/TouchControls';
import { ControlGuide } from '../../components/games/ControlGuide';

export default function ApexGT() {
  const { user } = useAuth();
  const userId = String(user?.id ?? user?._id ?? '');
  const toast = useToast();

  // Lobby state
  const [balance, setBalance] = useState(null);
  const [venues, setVenues] = useState([]);
  const [races, setRaces] = useState([]);
  const [venue, setVenue] = useState('');
  const [bet, setBet] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [aiCount, setAiCount] = useState(3);

  // Race state
  const [race, setRace] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [raceResult, setRaceResult] = useState(null);
  const [raceState, setRaceState] = useState('WALLOON'); // WALLOON, COUNTDOWN, STARTED, FINISHED

  // 3D rendering
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const cameraRigRef = useRef(null);
  const carMeshesRef = useRef({}); // userId -> THREE.Group
  const trackPointsRef = useRef([]);
  const lapsRef = useRef(3);
  const startedAtRef = useRef(0);
  const animationRef = useRef(null);
  const lastFrameRef = useRef(0);

  // Input
  const { getInput: getKeyboardInput } = useKeyboardControls(true);
  const { getInput: getGamepadInput, connected: gamepadConnected } = useGamepadControls(true);
  const [inputMode, setInputMode] = useState('auto'); // auto, keyboard, gamepad, touch
  const [showControls, setShowControls] = useState(false);

  // Race data from server
  const [serverCars, setServerCars] = useState([]);
  const [myCarData, setMyCarData] = useState(null);
  const [racePositions, setRacePositions] = useState({});
  const [myPosition, setMyPosition] = useState(1);
  const [myLaps, setMyLaps] = useState(0);
  const [mySpeed, setMySpeed] = useState(0);
  const [myProgress, setMyProgress] = useState(0);
  const touchInputRef = useRef({ steer: 0, accelerate: 0, brake: 0, nitro: false });
  const frameStateRef = useRef({});
  frameStateRef.current = { race, raceState, countdown, serverCars, myCarData, inputMode, gamepadConnected };

  const socket = getSocket();

  // ========== LOBBY FUNCTIONS ==========
  const refresh = useCallback(async () => {
    try {
      const { data: b } = await api.get('/games/apex-gt/balance');
      setBalance(b.balance);
      const { data: v } = await api.get('/games/apex-gt/venues');
      setVenues(v.venues);
      const { data: r } = await api.get('/games/apex-gt/races');
      setRaces(r.races);
      setErr('');
    } catch (e) { setErr(errMsg(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh open races
  useEffect(() => {
    if (!race) {
      const t = setInterval(refresh, 60000);
      return () => clearInterval(t);
    }
  }, [race, refresh]);

  useEffect(() => {
    if (!race?.id) return undefined;
    const joinRoom = () => socket.emit('race:join-room', race.id);
    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);
    return () => {
      socket.off('connect', joinRoom);
      socket.emit('race:leave-room', race.id);
    };
  }, [race?.id, socket]);

  const enterRaceDisplay = () => {
    const fullscreen = document.documentElement.requestFullscreen?.();
    fullscreen?.catch(() => {});
    const orientationLock = window.screen?.orientation?.lock?.('landscape');
    orientationLock?.catch(() => {});
  };

  const returnToLobby = () => {
    window.clearTimeout(returnToLobbyRef.current);
    setRace(null);
    setRaceResult(null);
    setRaceState('WALLOON');
    setCountdown(null);
    setServerCars([]);
    setMyCarData(null);
    touchInputRef.current = { steer: 0, accelerate: 0, brake: 0, nitro: false };
    window.screen?.orientation?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen?.();
    refresh();
  };

  const returnToLobbyRef = useRef(null);
  useEffect(() => () => {
    window.clearTimeout(returnToLobbyRef.current);
    window.screen?.orientation?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen?.();
  }, []);

  const create = async (withAI = false) => {
    if (!venue) return toast('Pick a venue.', 'error');
    setAiModal(false);
    setBusy(true);
    try {
      const { data } = await api.post('/games/apex-gt/create', { venue, bet });
      setRace(data.race);
      if (withAI) {
        enterRaceDisplay();
        const { data: aiData } = await api.post(`/games/apex-gt/races/${data.race.id}/start-ai`, { count: aiCount });
        setRace(aiData.race);
        setRaceState(aiData.race.state);
        setCountdown(3);
        toast('AI race started!', 'success');
      } else {
        toast('Race created. Ready up, then start when you are set.', 'success');
      }
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const join = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${id}/join`);
      setRace(data.race);
      toast('Joined the race!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const toggleReady = async () => {
    const me = race?.participants?.find((p) => String(p.user) === userId);
    setBusy(true);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${race.id}/ready`, { ready: !me?.ready });
      setRace(data.race);
      toast(me?.ready ? 'Not ready' : 'Ready!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const start = async () => {
    enterRaceDisplay();
    setBusy(true);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${race.id}/start`);
      setRace(data.race);
      setRaceState(data.race.state);
      setCountdown(3);
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const startWithAI = async () => {
    enterRaceDisplay();
    setBusy(true);
    setAiModal(false);
    try {
      const { data } = await api.post(`/games/apex-gt/races/${race.id}/start-ai`, { count: aiCount });
      setRace(data.race);
      setRaceState(data.race.state);
      setCountdown(3);
      toast('AI racers added! Starting...', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  // ========== SOCKET EVENT HANDLERS ==========
  useEffect(() => {
    const onCountdown = (data) => {
      setCountdown(data.countdown);
      setRaceState('COUNTDOWN');
    };

    const onRaceState = (data) => {
      setRace(data);
      setRaceState(data.state);
    };

    const onStarted = (data) => {
      setCountdown(null);
      setRaceState('STARTED');
      startedAtRef.current = data.startedAt || Date.now();

      // Store track data for useEffect to pick up
      trackPointsRef.current = data.trackPoints;
      lapsRef.current = data.laps || 3;

      toast('GO! Race started.', 'success');
    };

    const onTick = (data) => {
      setServerCars(data.cars || []);

      // Find my car
      const myCar = data.cars?.find(c => c.user === userId);
      if (myCar) {
        setMyCarData(myCar);
        setMyPosition(myCar.position);
        setMyLaps(myCar.lapsCompleted);
        setMySpeed(myCar.speed);
        setMyProgress(myCar.progress);
      }

      // Update positions
      const positions = {};
      data.cars?.forEach(c => { positions[c.user] = c.position; });
      setRacePositions(positions);
    };

    const onFinish = (data) => {
      setRaceState('FINISHED');
      cancelAnimationFrame(animationRef.current);
      setRaceResult(data);
      toast('Race finished!', 'success');
      refresh();
      returnToLobbyRef.current = window.setTimeout(returnToLobby, 5000);
    };

    const onLap = (data) => {
      // Individual lap time notification
      if (data.user === userId) {
        toast(`Lap ${data.lap} completed!`, 'success');
      }
    };

    socket.on('race-countdown', onCountdown);
    socket.on('race-state', onRaceState);
    socket.on('race-started', onStarted);
    socket.on('race-tick', onTick);
    socket.on('race-finished', onFinish);
    socket.on('race-lap', onLap);
    socket.on('race-finish', (data) => {
      if (data.user === userId) {
        toast(`Finished ${data.position}${data.position === 1 ? 'st' : data.position === 2 ? 'nd' : data.position === 3 ? 'rd' : 'th'}!`, 'success');
      }
    });

    return () => {
      socket.off('race-countdown', onCountdown);
      socket.off('race-state', onRaceState);
      socket.off('race-started', onStarted);
      socket.off('race-tick', onTick);
      socket.off('race-finished', onFinish);
      socket.off('race-lap', onLap);
      socket.off('race-finish');
    };
  }, [socket, toast, refresh, userId]);

  // ========== 3D SCENE INITIALIZATION ==========
  const initializeRaceScene = useCallback((trackPoints, laps) => {
    if (!canvasRef.current) return;

    trackPointsRef.current = trackPoints;
    lapsRef.current = laps;

    // Create Three.js scene
    const { scene } = createRaceScene(trackPoints, getVenueTheme(race?.venue));
    sceneRef.current = scene;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Set initial size explicitly
    const initialWidth = canvasRef.current.clientWidth;
    const initialHeight = canvasRef.current.clientHeight;
    renderer.setSize(initialWidth, initialHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // Camera
    const camera = new THREE.PerspectiveCamera(70, initialWidth / initialHeight, 0.1, 5000);
    cameraRef.current = camera;

    // Camera rig (chase camera)
    const cameraRig = createCameraRig();
    cameraRig.add(camera);
    scene.add(cameraRig);
    cameraRigRef.current = cameraRig;

    // Position camera at start line initially
    if (trackPoints.length > 0) {
      const startPos = trackPoints[0];
      cameraRig.position.set(startPos.x, 15, startPos.z + 20);
      camera.lookAt(startPos.x, 0, startPos.z);
    }

    // Create car meshes for all participants
    race?.participants?.forEach((p, i) => {
      const hue = (i * 360 / Math.max(race.participants.length, 1)) % 360;
      const color = new THREE.Color().setHSL(hue / 360, 0.7, 0.5);
      const carMesh = createCarMesh(color.getHex());
      carMeshesRef.current[p.user] = carMesh;
      scene.add(carMesh);
    });

    // Handle resize
    const handleResize = () => {
      if (canvasRef.current && cameraRef.current && rendererRef.current) {
        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height, false);
      }
    };

    window.addEventListener('resize', handleResize);

    // Start render loop
    lastFrameRef.current = performance.now();
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((material) => material.dispose());
          else obj.material.dispose();
        }
      });
      carMeshesRef.current = {};
      renderer.dispose();
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      cameraRigRef.current = null;
    };
  }, [race]);

  // Initialize the 3D scene after its callback is declared.
  useEffect(() => {
    if (raceState !== 'STARTED' || !canvasRef.current || trackPointsRef.current.length === 0) return undefined;
    return initializeRaceScene(trackPointsRef.current, lapsRef.current);
  }, [raceState, race, initializeRaceScene]);

  // ========== RENDER LOOP ==========
  const animate = useCallback(() => {
    if (!sceneRef.current || !rendererRef.current || !cameraRef.current || !cameraRigRef.current) return;
    const frameState = frameStateRef.current;

    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
    lastFrameRef.current = now;

    // Get input and send to server
    if (frameState.raceState === 'STARTED') {
      let input = { steer: 0, accelerate: 0, brake: 0, nitro: false };

      if (frameState.inputMode === 'auto' || frameState.inputMode === 'keyboard') {
        const kb = getKeyboardInput();
        input.steer += kb.steer;
        input.accelerate = Math.max(input.accelerate, kb.accelerate);
        input.brake = Math.max(input.brake, kb.brake);
        input.nitro = input.nitro || kb.nitro;
      }

      if (frameState.inputMode === 'auto' || frameState.inputMode === 'touch') {
        const touch = touchInputRef.current;
        input.steer += touch.steer;
        input.accelerate = Math.max(input.accelerate, touch.accelerate);
        input.brake = Math.max(input.brake, touch.brake);
        input.nitro = input.nitro || touch.nitro;
      }

      if ((frameState.inputMode === 'auto' || frameState.inputMode === 'gamepad') && frameState.gamepadConnected) {
        const gp = getGamepadInput();
        // Gamepad takes precedence for steer if significant input
        if (Math.abs(gp.steer) > 0.1) input.steer = gp.steer;
        input.accelerate = Math.max(input.accelerate, gp.accelerate);
        input.brake = Math.max(input.brake, gp.brake);
        input.nitro = input.nitro || gp.nitro;
      }

      // Send input to server
      socket.emit('race:input', {
        raceId: frameState.race?.id,
        ...input
      });
    }

    // Update car positions from server data (interpolated)
    Object.entries(carMeshesRef.current).forEach(([userId, carMesh]) => {
      const serverCar = frameState.serverCars.find(c => c.user === userId);
      if (serverCar) {
        updateCarMesh(carMesh, serverCar, dt);
      }
    });

    // Update camera to follow my car
    if (frameState.myCarData && cameraRigRef.current) {
      const targetX = frameState.myCarData.x;
      const targetZ = frameState.myCarData.z;
      const targetAngle = frameState.myCarData.angle;

      // Smooth camera follow
      const lerpFactor = 0.1;
      cameraRigRef.current.position.x += (targetX - cameraRigRef.current.position.x) * lerpFactor;
      cameraRigRef.current.position.z += (targetZ - cameraRigRef.current.position.z) * lerpFactor;

      // Camera height based on speed
      const targetHeight = 3 + (frameState.myCarData.speed / 120) * 2;
      cameraRigRef.current.position.y += (targetHeight - cameraRigRef.current.position.y) * 0.05;

      // Camera rotation - look at car with offset
      cameraRigRef.current.rotation.y += ((targetAngle - Math.PI / 2) - cameraRigRef.current.rotation.y) * 0.05;
    } else if (frameState.raceState === 'STARTED' && trackPointsRef.current.length > 0) {
      // Fallback camera at start line until we get car data
      const center = trackPointsRef.current[0];
      cameraRigRef.current.position.x += (center.x - cameraRigRef.current.position.x) * 0.05;
      cameraRigRef.current.position.z += (center.z + 20 - cameraRigRef.current.position.z) * 0.05;
      cameraRigRef.current.position.y += (15 - cameraRigRef.current.position.y) * 0.05;
      cameraRef.current.lookAt(center.x, 0, center.z);
    }

    // Countdown camera (before race starts)
    if (frameState.raceState === 'COUNTDOWN' && frameState.countdown !== null) {
      // Show track overview
      if (trackPointsRef.current.length > 0) {
        const center = trackPointsRef.current[0];
        cameraRef.current.position.set(center.x, 50, center.z + 50);
        cameraRef.current.lookAt(center.x, 0, center.z);
      }
    }

    // Force render even if no cars yet
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationRef.current = requestAnimationFrame(animate);
  }, [getKeyboardInput, getGamepadInput, socket]);

  // ========== HELPER FUNCTIONS ==========
  const getVenueTheme = (venueId) => {
    const themes = {
      lekki: 'coastal', ikeja: 'urban', vi: 'coastal', abuja: 'urban',
      ekpoma: 'highway', benin: 'highway', auchi: 'rural', uromi: 'rural',
      aau: 'campus', uniben: 'campus',
    };
    return themes[venueId] || 'highway';
  };

  const formatTime = (ms) => {
    if (!ms) return '--:--.---';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  };

  // ========== RENDER ==========
  const me = race?.participants?.find((p) => String(p.user) === userId);
  const allReady = race?.participants?.every((p) => p.ready);
  const isHost = String(race?.host ?? '') === userId;

  if (loading) return <Spinner label="Opening APEX GT" />;
  if (err && !race) return <ErrorState message={err} onRetry={refresh} />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="glass p-5 rounded-xl flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl mb-1">APEX <span className="text-cyan-400">GT</span></h1>
          <p className="text-sm text-slate-400">3D multiplayer racing · Nigerian roads</p>
          <p className="text-xs text-cyan-300 mt-2">Balance: <b>₦{balance?.toLocaleString() ?? '—'}</b> <span className="text-slate-500">(in-game)</span></p>
        </div>
        <div className="text-4xl">🏎️</div>
      </div>

      {/* Lobby View */}
      {!race && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass p-5 rounded-xl space-y-3">
            <h2 className="font-display text-xl">Create a race</h2>
            <Field label="Venue">
              <select className="input" value={venue} onChange={(e) => setVenue(e.target.value)}>
                <option value="">Select venue…</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Wager per racer (₦5,000 – ₦100,000)" hint="Optional head-to-head. Winner takes the whole pot. Virtual naira only.">
              <input type="number" className="input" min={5000} max={100000} step={1000} value={bet} onChange={(e) => setBet(Number(e.target.value))} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-2">
              <button className="btn btn-ghost w-full" onClick={() => setAiModal(true)} disabled={busy || bet < 5000 || bet > 100000}>Race with AI</button>
              <button className="btn btn-gold w-full" onClick={() => create()} disabled={busy || bet < 5000 || bet > 100000}>{busy ? 'Creating…' : 'Create race'}</button>
            </div>
          </div>
          <div className="glass p-5 rounded-xl">
            <h2 className="font-display text-xl mb-3">Open races</h2>
            {races.length === 0 ? <p className="text-sm text-slate-400">No open races. Create one to start.</p> : (
              <div className="space-y-2">
                {races.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <p className="text-sm font-bold">{r.venueName}</p>
                      <p className="text-xs text-slate-400">{r.participants.length}/4 · <b className="text-gold">₦{r.bet.toLocaleString()}</b></p>
                    </div>
                    <button className="btn btn-ghost" onClick={() => join(r.id)} disabled={busy || r.participants.length >= 4}>Join</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Race View */}
      {race && (
        <div className="space-y-4">
          <div className="glass p-5 rounded-xl">
            {/* Race Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl">{race.venueName}</h2>
                <p className="text-xs text-slate-400">Wager: <b className="text-gold">₦{race.bet.toLocaleString()}</b> per racer · {lapsRef.current} laps</p>
              </div>
              <span className={`chip bg-white/10 text-white ${raceState === 'STARTED' ? 'bg-cyan-500/30' : raceState === 'FINISHED' ? 'bg-gold/30' : ''}`}>
                {raceState === 'COUNTDOWN' ? `Starting in ${countdown > 0 ? countdown : 'GO!'}` : raceState}
              </span>
            </div>

            {/* 3D Canvas */}
            {raceState !== 'WALLOON' && (
              <div className="race-stage race-stage-active relative aspect-video rounded-xl overflow-hidden bg-ink border border-white/10" style={{ minHeight: '300px' }}>
                <canvas
                  ref={canvasRef}
                  className="w-full h-full block"
                  style={{ touchAction: 'none' }}
                />

                {/* Countdown Overlay */}
                {raceState === 'COUNTDOWN' && countdown !== null && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="text-7xl sm:text-9xl font-bold num text-white text-shadow-2xl" style={{
                      textShadow: '0 0 40px rgba(226,182,87,0.8), 0 0 80px rgba(226,182,87,0.4)'
                    }}>
                      {countdown > 0 ? countdown : 'GO!'}
                    </div>
                  </motion.div>
                )}

                {/* Race HUD */}
                {raceState === 'STARTED' && (
                  <>
                    {/* Top HUD - Position, Lap, Speed */}
                    <div className="absolute top-4 left-4 right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pointer-events-none z-10">
                      {/* Position & Lap */}
                      <div className="glass px-4 py-2 rounded-xl flex items-center gap-4 min-w-[200px]">
                        <div className="text-center">
                          <p className="text-xs text-slate-400">POSITION</p>
                          <p className="text-2xl font-bold num text-gold">{myPosition}/{race.participants?.length || 1}</p>
                        </div>
                        <div className="w-px h-8 bg-white/20 mx-2" />
                        <div className="text-center">
                          <p className="text-xs text-slate-400">LAP</p>
                          <p className="text-2xl font-bold num text-cyan-400">{Math.min(myLaps + 1, lapsRef.current)}/{lapsRef.current}</p>
                        </div>
                        <div className="w-px h-8 bg-white/20 mx-2" />
                        <div className="text-center">
                          <p className="text-xs text-slate-400">SPEED</p>
                          <p className="text-2xl font-bold num text-white">{mySpeed} km/h</p>
                        </div>
                      </div>

                      {/* Mini Map */}
                      <div className="glass p-2 rounded-xl w-48 h-48 sm:w-56 sm:h-56 flex-shrink-0 relative overflow-hidden">
                        <MiniMap
                          trackPoints={trackPointsRef.current}
                          cars={serverCars}
                          myUserId={userId}
                          raceProgress={myProgress}
                        />
                      </div>
                    </div>

                    {/* Bottom HUD - Progress Bar & Controls Hint */}
                    <div className="absolute bottom-4 left-4 right-4 flex flex-col items-center gap-2 pointer-events-none z-10">
                      {/* Lap Progress */}
                      <div className="glass px-4 py-2 rounded-xl w-full max-w-md">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs text-slate-400 w-16">LAP PROGRESS</span>
                          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-cyan-400 to-gold rounded-full"
                              style={{ width: `${(myProgress || 0) * 100}%` }}
                              animate={{ width: `${(myProgress || 0) * 100}%` }}
                              transition={{ duration: 0.1 }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Controls hint for touch */}
                      <div className="text-xs text-slate-500 text-center px-4">
                        Touch: Steer ← → | Gas ↑ | Brake ↓ | NITRO | Keyboard: WASD/Arrows + Shift
                      </div>
                    </div>
                  </>
                )}

                {/* Finished Overlay */}
                {raceState === 'FINISHED' && raceResult && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-20 bg-ink/95 backdrop-blur">
                    <motion.div
                      className="glass p-8 rounded-2xl text-center max-w-md mx-4"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <h2 className="font-display text-3xl text-gold mb-2">🏁 Race Complete!</h2>
                      <p className="text-lg mb-4">You finished <b className="text-cyan-400">{myPosition}{myPosition === 1 ? 'st' : myPosition === 2 ? 'nd' : myPosition === 3 ? 'rd' : 'th'}</b> out of {race.participants?.length || 1} racers</p>

                      <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                        {raceResult.results?.map((r, i) => (
                          <div key={r.user} className={`flex justify-between text-sm py-1 px-3 rounded ${r.win ? 'bg-gold/20 text-gold font-bold' : 'text-slate-300'}`}>
                            <span>{i + 1}. {r.user === userId ? 'You' : r.user}</span>
                            <span>{r.win ? `+₦${(race.bet * race.participants.length).toLocaleString()}` : `-₦${race.bet.toLocaleString()}`}</span>
                          </div>
                        ))}
                      </div>

                      <button className="btn btn-ghost w-full" onClick={returnToLobby}>
                        Back to Lobby
                      </button>
                    </motion.div>
                  </div>
                )}
                {raceState === 'STARTED' && (
                  <TouchControls
                    onInput={(input) => { touchInputRef.current = input; }}
                    enabled
                  />
                )}
              </div>
            )}

            {/* Lobby/Waiting Area */}
            {raceState === 'WALLOON' && (
              <div className="space-y-4">
                {/* Participants Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {race.participants.map((p) => (
                    <div key={p.user} className={`rounded-xl p-3 border border-white/15 bg-white/5 ${p.user === race.host ? 'ring-1 ring-cyan-400' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-cyan-500/30 grid place-items-center font-bold text-sm mb-1">
                        {(p.name || '?')[0].toUpperCase()}
                      </div>
                      <p className="text-xs font-bold truncate">{p.name}{p.user === race.host ? ' 👑' : ''}</p>
                      <p className={`text-[10px] ${p.ready ? 'text-green-400' : 'text-slate-400'}`}>
                        {p.ready ? '✓ Ready' : 'Not ready'}
                      </p>
                      {p.ai && <span className="text-[10px] text-orange-400">🤖 AI</span>}
                    </div>
                  ))}
                </div>

                {/* Countdown Display */}
                {countdown !== null && (
                  <div className="mt-4 text-center">
                    <p className="text-5xl num font-bold text-red-400 animate-pulse">
                      {countdown > 0 ? countdown : 'GO!'}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 space-y-2">
                  {isHost && race.participants.length === 1 && (
                    <button className="btn btn-gold w-full" onClick={() => setAiModal(true)} disabled={busy}>
                      Race with AI
                    </button>
                  )}
                  {me && raceState === 'WALLOON' && (
                    <button className={`btn w-full mt-2 !min-h-[52px] text-lg ${me.ready ? 'btn-ghost' : 'btn-gold'}`} onClick={toggleReady} disabled={busy}>
                      {me.ready ? 'Ready ✓ · Click to unready' : 'I\'m ready'}
                    </button>
                  )}
                  {isHost && (
                    <button className="btn btn-gold w-full" onClick={start} disabled={busy || !allReady}>
                      {allReady ? 'Start race' : 'Ready up to enable Start race'}
                    </button>
                  )}
                  {!isHost && race.participants.length > 1 && (
                    <p className="text-sm text-slate-400 text-center">Use "I'm ready" above. Waiting for the host to start.</p>
                  )}
                </div>

                {me && (
                  <button className="btn btn-ghost w-full mt-3" onClick={() => {
                    setRace(null);
                    setRaceState('WALLOON');
                    setCountdown(null);
                    setRaceResult(null);
                    refresh();
                  }} disabled={busy}>
                    Leave race
                  </button>
                )}
              </div>
            )}

            {/* Race Results (legacy text view for non-3D fallback) */}
            {raceResult && raceState !== 'FINISHED' && (
              <div className="mt-4 glass p-4 rounded-xl">
                <p className="font-display text-lg text-gold mb-2">🏁 Race results</p>
                {raceResult.results?.map((r, i) => (
                  <div key={r.user} className={`flex justify-between text-sm py-1 ${r.win ? 'text-gold font-bold' : 'text-slate-300'}`}>
                    <span>{i + 1}. {String(r.user) === userId ? 'You' : r.user}</span>
                    <span>{r.win ? `+₦${(race.bet * race.participants.length).toLocaleString()}` : `-₦${race.bet.toLocaleString()}`} · {r.avgLap}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => {
              setRace(null);
              setRaceState('WALLOON');
              setCountdown(null);
              setRaceResult(null);
              refresh();
            }}>Leave race</button>
            <button className="btn btn-ghost" onClick={() => setShowControls(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </div>
      )}

      <Link to="/games" className="block text-center text-sm text-slate-400 hover:text-white">← Back to Games Lobby</Link>

      {/* Modals */}
      <Modal open={aiModal} onClose={() => setAiModal(false)} title="Race with AI">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Add AI racers to fill the grid. You can race with 1-3 AI opponents.</p>
          <Field label="Number of AI racers">
            <select className="input" value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))}>
              <option value="1">1 AI racer</option>
              <option value="2">2 AI racers</option>
              <option value="3">3 AI racers</option>
            </select>
          </Field>
          <button className="btn btn-gold w-full" onClick={() => race ? startWithAI() : create(true)} disabled={busy || !venue || bet < 5000 || bet > 100000}>{busy ? 'Starting…' : 'Start race with AI'}</button>
        </div>
      </Modal>

      <ControlGuide open={showControls} onClose={() => setShowControls(false)} />

    </div>
  );
}

// Mini Map Component
function MiniMap({ trackPoints, cars, myUserId, raceProgress }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !trackPoints?.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const size = Math.min(canvas.width, canvas.height);

    // Calculate track bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    trackPoints.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    });

    const trackWidth = maxX - minX;
    const trackHeight = maxZ - minZ;
    const padding = 20;
    const scale = (size - padding * 2) / Math.max(trackWidth, trackHeight);
    const offsetX = (size - trackWidth * scale) / 2 - minX * scale;
    const offsetY = (size - trackHeight * scale) / 2 - minZ * scale;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // Draw track
      ctx.strokeStyle = '#334';
      ctx.lineWidth = Math.max(2, 24 * scale);
      ctx.beginPath();
      trackPoints.forEach((p, i) => {
        const x = p.x * scale + offsetX;
        const y = p.z * scale + offsetY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Draw start/finish line
      const start = trackPoints[0];
      const next = trackPoints[1];
      const angle = Math.atan2(next.z - start.z, next.x - start.x) + Math.PI / 2;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = -7; i <= 7; i++) {
        const x = (start.x + Math.cos(angle) * i * 2) * scale + offsetX;
        const y = (start.z + Math.sin(angle) * i * 2) * scale + offsetY;
        if (i % 2 === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw cars
      cars?.forEach(car => {
        const x = car.x * scale + offsetX;
        const y = car.z * scale + offsetY;
        const isMe = car.user === myUserId;

        ctx.fillStyle = isMe ? '#14F195' : '#888';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, 4 * scale), 0, Math.PI * 2);
        ctx.fill();

        // Direction indicator
        ctx.strokeStyle = isMe ? '#14F195' : '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + Math.cos(car.angle) * 8 * scale,
          y + Math.sin(car.angle) * 8 * scale
        );
        ctx.stroke();

        if (isMe) {
          // Pulsing ring
          ctx.strokeStyle = '#14F195';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(6, 8 * scale), 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    };

    draw();
  }, [trackPoints, cars, myUserId, raceProgress]);

  return <canvas ref={canvasRef} className="w-full h-full" width={200} height={200} />;
}