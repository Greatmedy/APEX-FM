import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';

// Track segment for rendering
function createTrackGeometry(trackPoints, options = {}) {
  const { trackWidth = 24, segmentsPerPoint = 8, roadColor = 0x2a2a2a, shoulderColor = 0x1a3a1a, lineColor = 0xffffee } = options;

  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const pointCount = trackPoints.length;
  const totalSegments = (pointCount - 1) * segmentsPerPoint;

  // Pre-calculate track directions and widths
  const trackData = [];
  for (let i = 0; i < pointCount - 1; i++) {
    const p0 = trackPoints[i];
    const p1 = trackPoints[(i + 1) % (pointCount - 1)];
    const pMinus1 = trackPoints[(i - 1 + (pointCount - 1)) % (pointCount - 1)];
    const pPlus2 = trackPoints[(i + 2) % (pointCount - 1)];

    trackData.push({ p0, p1, pMinus1, pPlus2, width: p0.width || trackWidth });
  }

  let vertexIndex = 0;

  for (let segIdx = 0; segIdx < trackData.length; segIdx++) {
    const { p0, p1, pMinus1, pPlus2, width } = trackData[segIdx];

    for (let s = 0; s < segmentsPerPoint; s++) {
      const t = s / segmentsPerPoint;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom interpolation
      const x = 0.5 * (
        (2 * p0.x) +
        (-pMinus1.x + p1.x) * t +
        (2 * pMinus1.x - 5 * p0.x + 4 * p1.x - pPlus2.x) * t2 +
        (-pMinus1.x + 3 * p0.x - 3 * p1.x + pPlus2.x) * t3
      );
      const z = 0.5 * (
        (2 * p0.z) +
        (-pMinus1.z + p1.z) * t +
        (2 * pMinus1.z - 5 * p0.z + 4 * p1.z - pPlus2.z) * t2 +
        (-pMinus1.z + 3 * p0.z - 3 * p1.z + pPlus2.z) * t3
      );

      const dx = 0.5 * (
        (-pMinus1.x + p1.x) +
        2 * (2 * pMinus1.x - 5 * p0.x + 4 * p1.x - pPlus2.x) * t +
        3 * (-pMinus1.x + 3 * p0.x - 3 * p1.x + pPlus2.x) * t2
      );
      const dz = 0.5 * (
        (-pMinus1.z + p1.z) +
        2 * (2 * pMinus1.z - 5 * p0.z + 4 * p1.z - pPlus2.z) * t +
        3 * (-pMinus1.z + 3 * p0.z - 3 * p1.z + pPlus2.z) * t2
      );

      const angle = Math.atan2(dz, dx);
      const cos = Math.cos(angle + Math.PI / 2);
      const sin = Math.sin(angle + Math.PI / 2);
      const halfWidth = width / 2;
      const shoulderWidth = halfWidth + 8;

      // Road surface vertices (4 per segment: left, right edges)
      // Left edge
      positions.push(x - cos * halfWidth, 0.01, z - sin * halfWidth);
      colors.push((roadColor >> 16) / 255, (roadColor >> 8 & 0xFF) / 255, (roadColor & 0xFF) / 255);
      uvs.push(0, segIdx * segmentsPerPoint + s);

      // Right edge
      positions.push(x + cos * halfWidth, 0.01, z + sin * halfWidth);
      colors.push((roadColor >> 16) / 255, (roadColor >> 8 & 0xFF) / 255, (roadColor & 0xFF) / 255);
      uvs.push(1, segIdx * segmentsPerPoint + s);

      // Shoulder left
      positions.push(x - cos * shoulderWidth, 0, z - sin * shoulderWidth);
      colors.push((shoulderColor >> 16) / 255, (shoulderColor >> 8 & 0xFF) / 255, (shoulderColor & 0xFF) / 255);
      uvs.push(-0.5, segIdx * segmentsPerPoint + s);

      // Shoulder right
      positions.push(x + cos * shoulderWidth, 0, z + sin * shoulderWidth);
      colors.push((shoulderColor >> 16) / 255, (shoulderColor >> 8 & 0xFF) / 255, (shoulderColor & 0xFF) / 255);
      uvs.push(1.5, segIdx * segmentsPerPoint + s);

      // Center line (dashed) - we'll add as separate geometry
      if (s % 2 === 0) {
        positions.push(x, 0.02, z);
        colors.push((lineColor >> 16) / 255, (lineColor >> 8 & 0xFF) / 255, (lineColor & 0xFF) / 255);
        uvs.push(0.5, segIdx * segmentsPerPoint + s);
      }

      vertexIndex += 5;
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  // Generate indices for triangles
  const idx = [];
  const vertsPerSeg = 5; // 4 for road+shoulder + 1 for center line (sometimes)

  for (let i = 0; i < totalSegments - 1; i++) {
    const base = i * 4; // 4 vertices per segment for road/shoulder (no center line in index)
    // Road quad (2 triangles)
    idx.push(base, base + 1, base + 4);
    idx.push(base + 1, base + 5, base + 4);
    // Left shoulder
    idx.push(base, base + 2, base + 4);
    idx.push(base + 2, base + 6, base + 4);
    // Right shoulder
    idx.push(base + 1, base + 5, base + 3);
    idx.push(base + 3, base + 5, base + 7);
  }

  geometry.setIndex(idx);
  geometry.computeVertexNormals();

  return geometry;
}

function createTrackMesh(trackPoints, theme = 'highway') {
  // Theme-based colors
  const themes = {
    highway: { road: 0x2a2a2a, shoulder: 0x1a3a1a, line: 0xffffee, sky: 0x87ceeb },
    urban: { road: 0x333333, shoulder: 0x2a2a2a, line: 0xffffee, sky: 0x7a9eb1 },
    coastal: { road: 0x2a2a2a, shoulder: 0x1a4a3a, line: 0xffffee, sky: 0x87ceeb },
    rural: { road: 0x3d352a, shoulder: 0x2a3a1a, line: 0xffffee, sky: 0x8ecae6 },
    campus: { road: 0x3a3a3a, shoulder: 0x2a3a2a, line: 0xffffee, sky: 0x87ceeb },
  };

  const colors = themes[theme] || themes.highway;

  const geometry = createTrackGeometry(trackPoints, {
    trackWidth: 24,
    roadColor: colors.road,
    shoulderColor: colors.shoulder,
    lineColor: colors.line,
  });

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return { mesh, colors };
}

function createSkybox(color) {
  const geometry = new THREE.SphereGeometry(5000, 32, 16);
  geometry.scale(-1, 1, 1); // Invert normals for inside view
  const material = new THREE.MeshBasicMaterial({
    color,
    fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

function createAmbientLight() {
  const light = new THREE.AmbientLight(0xffffff, 0.6);
  return light;
}

function createSunLight() {
  const light = new THREE.DirectionalLight(0xffffee, 1.2);
  light.position.set(100, 200, 50);
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 500;
  light.shadow.camera.left = -200;
  light.shadow.camera.right = 200;
  light.shadow.camera.top = 200;
  light.shadow.camera.bottom = -200;
  light.shadow.bias = -0.001;
  return light;
}

function createGroundPlane(color) {
  const geometry = new THREE.PlaneGeometry(10000, 10000);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.1;
  mesh.receiveShadow = true;
  return mesh;
}

export function createRaceScene(trackPoints, theme = 'highway') {
  const scene = new THREE.Scene();

  // Fog for depth
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.0008);

  // Skybox
  const { colors } = createTrackMesh(trackPoints, theme);
  const skybox = createSkybox(colors.sky);
  scene.add(skybox);

  // Ground
  const ground = createGroundPlane(colors.shoulder);
  scene.add(ground);

  // Track
  const { mesh: trackMesh } = createTrackMesh(trackPoints, theme);
  scene.add(trackMesh);

  // Lights
  scene.add(createAmbientLight());
  const sun = createSunLight();
  scene.add(sun);

  // Add some trackside objects (trees, buildings, etc.)
  addTracksideObjects(scene, trackPoints, theme);

  return { scene, trackMesh, sun };
}

function addTracksideObjects(scene, trackPoints, theme) {
  const rng = mulberry32(hashStr(theme + trackPoints.length));
  const segmentCount = trackPoints.length - 1;

  // Simple tree/building geometries
  const treeGeometry = new THREE.ConeGeometry(2, 6, 8);
  const treeMaterial = new THREE.MeshLambertMaterial({ color: 0x1a4a1a });
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x4a352a });

  const buildingGeometry = new THREE.BoxGeometry(8, 12, 8);
  const buildingMaterials = [
    new THREE.MeshLambertMaterial({ color: 0x8a7a6a }),
    new THREE.MeshLambertMaterial({ color: 0x7a6a5a }),
    new THREE.MeshLambertMaterial({ color: 0x6a5a4a }),
    new THREE.MeshLambertMaterial({ color: 0x5a4a3a }),
    new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
  ];

  for (let i = 0; i < segmentCount; i += 3) {
    if (rng() < 0.3) continue; // Skip some segments

    const p0 = trackPoints[i];
    const p1 = trackPoints[(i + 1) % segmentCount];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const angle = Math.atan2(dz, dx);
    const perpAngle = angle + Math.PI / 2;
    const halfWidth = (p0.width || 24) / 2;

    // Place objects on both sides
    for (const side of [-1, 1]) {
      if (rng() < 0.5) continue;

      const distance = halfWidth + 10 + rng() * 20;
      const x = p0.x + Math.cos(perpAngle) * distance * side;
      const z = p0.z + Math.sin(perpAngle) * distance * side;

      if (theme === 'urban' && rng() < 0.7) {
        // Building
        const building = new THREE.Mesh(buildingGeometry, buildingMaterials[Math.floor(rng() * buildingMaterials.length)]);
        building.position.set(x, 6, z);
        building.rotation.y = angle + (rng() - 0.5) * 0.5;
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
      } else if (theme !== 'urban' || rng() < 0.3) {
        // Tree
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 1;
        trunk.castShadow = true;
        tree.add(trunk);

        const leaves = new THREE.Mesh(treeGeometry, treeMaterial);
        leaves.position.y = 5;
        leaves.castShadow = true;
        tree.add(leaves);

        tree.position.set(x, 0, z);
        tree.rotation.y = rng() * Math.PI * 2;
        scene.add(tree);
      }
    }
  }

  // Start/finish line
  const startLineGeometry = new THREE.BoxGeometry(30, 0.1, 0.5);
  const startLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const startLine = new THREE.Mesh(startLineGeometry, startLineMaterial);
  startLine.position.set(trackPoints[0].x, 0.05, trackPoints[0].z);
  const firstAngle = Math.atan2(trackPoints[1].z - trackPoints[0].z, trackPoints[1].x - trackPoints[0].x);
  startLine.rotation.y = firstAngle + Math.PI / 2;
  scene.add(startLine);

  // Checkered pattern on start line
  for (let i = 0; i < 15; i++) {
    const checker = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.12, 0.5),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x000000 : 0xffffff })
    );
    checker.position.set(
      trackPoints[0].x + Math.cos(firstAngle + Math.PI / 2) * (i - 7) * 2,
      0.06,
      trackPoints[0].z + Math.sin(firstAngle + Math.PI / 2) * (i - 7) * 2
    );
    checker.rotation.y = firstAngle + Math.PI / 2;
    scene.add(checker);
  }
}

// Simple hash and PRNG (same as backend)
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Car creation
export function createCarMesh(color = 0xff0000, carType = 'default') {
  const group = new THREE.Group();

  // Body
  const bodyGeometry = new THREE.BoxGeometry(2.2, 0.8, 4.5);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.7,
    roughness: 0.3,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.6;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Cockpit
  const cockpitGeometry = new THREE.BoxGeometry(1.4, 0.6, 2);
  const cockpitMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2a,
    metalness: 0.2,
    roughness: 0.8,
    transparent: true,
    opacity: 0.7,
  });
  const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
  cockpit.position.y = 1.2;
  cockpit.position.z = -0.3;
  cockpit.castShadow = true;
  group.add(cockpit);

  // Wheels
  const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 0.1,
    roughness: 0.9,
  });

  const wheelPositions = [
    [-1.3, 0.3, 1.8],   // FL
    [1.3, 0.3, 1.8],    // FR
    [-1.3, 0.3, -1.8],  // RL
    [1.3, 0.3, -1.8],   // RR
  ];

  const wheels = [];
  wheelPositions.forEach((pos, i) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  });

  // Brake lights
  const brakeLightGeometry = new THREE.BoxGeometry(0.6, 0.15, 0.05);
  const brakeLightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0 });
  const brakeLightLeft = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
  brakeLightLeft.position.set(-0.8, 0.7, -2.3);
  group.add(brakeLightLeft);
  const brakeLightRight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
  brakeLightRight.position.set(0.8, 0.7, -2.3);
  group.add(brakeLightRight);

  group.userData = { wheels, brakeLightLeft, brakeLightRight, body, cockpit };

  return group;
}

export function updateCarMesh(carMesh, carData, dt) {
  if (!carMesh || !carMesh.userData) return;

  const { wheels, brakeLightLeft, brakeLightRight, body } = carMesh.userData;

  // Position and rotation
  carMesh.position.set(carData.x, 0.3, carData.z);
  carMesh.rotation.y = carData.angle;

  // Wheel rotation based on speed
  const wheelRotationSpeed = (carData.speed || 0) / 50 * dt * 60; // Approximate
  wheels.forEach(wheel => {
    wheel.rotation.x += wheelRotationSpeed;
  });

  // Steering wheel animation (front wheels)
  const steerAngle = (carData.steer || 0) * 0.5;
  wheels[0].rotation.y = steerAngle;
  wheels[1].rotation.y = steerAngle;

  // Brake lights
  const braking = (carData.brake || 0) > 0.1;
  brakeLightLeft.material.opacity = braking ? 1 : 0;
  brakeLightRight.material.opacity = braking ? 1 : 0;

  // Body lean in corners
  const targetLean = -(carData.steer || 0) * 0.15 * (carData.speed / 120);
  body.rotation.z += (targetLean - body.rotation.z) * 0.1;
}

export function createCameraRig() {
  const rig = new THREE.Group();

  // Chase camera position (behind and above car)
  rig.position.set(0, 3, -8);

  return rig;
}