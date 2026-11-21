import * as THREE from 'three';

// Simple, guaranteed-to-render track using basic primitives
export function createRaceScene(trackPoints, theme = 'highway') {
  const scene = new THREE.Scene();

  // Fog for depth
  const themes = {
    highway: { sky: 0x87ceeb, road: 0x2a2a2a, shoulder: 0x1a3a1a, line: 0xffffee },
    urban: { sky: 0x7a9eb1, road: 0x333333, shoulder: 0x2a2a2a, line: 0xffffee },
    coastal: { sky: 0x87ceeb, road: 0x2a2a2a, shoulder: 0x1a4a3a, line: 0xffffee },
    rural: { sky: 0x8ecae6, road: 0x3d352a, shoulder: 0x2a3a1a, line: 0xffffee },
    campus: { sky: 0x87ceeb, road: 0x3a3a3a, shoulder: 0x2a3a2a, line: 0xffffee },
  };
  const colors = themes[theme] || themes.highway;

  scene.fog = new THREE.FogExp2(colors.sky, 0.0008);
  scene.background = new THREE.Color(colors.sky);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(10000, 10000);
  const groundMat = new THREE.MeshLambertMaterial({ color: colors.shoulder });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  const trackGroup = new THREE.Group();
  const centerline = trackPoints.slice(0, -1);
  const trackWidth = centerline[0]?.width || 24;
  const shoulderMat = new THREE.MeshLambertMaterial({ color: colors.shoulder, side: THREE.DoubleSide });
  const roadMat = new THREE.MeshLambertMaterial({ color: colors.road, side: THREE.DoubleSide });
  const shoulder = new THREE.Mesh(createTrackStrip(centerline, trackWidth + 16), shoulderMat);
  shoulder.position.y = 0.01;
  shoulder.receiveShadow = true;
  trackGroup.add(shoulder);

  const road = new THREE.Mesh(createTrackStrip(centerline, trackWidth), roadMat);
  road.position.y = 0.02;
  road.receiveShadow = true;
  trackGroup.add(road);

  const dashPositions = [];
  centerline.forEach((point, i) => {
    const next = centerline[(i + 1) % centerline.length];
    dashPositions.push(
      point.x + (next.x - point.x) * 0.2, 0.04, point.z + (next.z - point.z) * 0.2,
      point.x + (next.x - point.x) * 0.55, 0.04, point.z + (next.z - point.z) * 0.55
    );
  });
  const dashGeometry = new THREE.BufferGeometry();
  dashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3));
  trackGroup.add(new THREE.LineSegments(dashGeometry, new THREE.LineBasicMaterial({ color: colors.line })));
  scene.add(trackGroup);

  if (centerline.length > 1) {
    const start = centerline[0];
    const next = centerline[1];
    const tangentLength = Math.hypot(next.x - start.x, next.z - start.z) || 1;
    const nx = -(next.z - start.z) / tangentLength;
    const nz = (next.x - start.x) / tangentLength;
    const halfWidth = trackWidth / 2;
    const checkerCount = 12;
    for (let i = 0; i < checkerCount; i++) {
      const checker = new THREE.Mesh(
        new THREE.BoxGeometry(trackWidth / checkerCount, 0.12, 1),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x000000 : 0xffffff })
      );
      checker.position.set(start.x + nx * (i - 5.5) * (trackWidth / checkerCount), 0.05, start.z + nz * (i - 5.5) * (trackWidth / checkerCount));
      checker.rotation.y = -Math.atan2(nz, nx);
      scene.add(checker);
    }
  }

  const rng = mulberry32(hashStr(theme + trackPoints.length));
  const sceneryStep = Math.max(1, Math.floor(centerline.length / 24));
  for (let i = 0; i < centerline.length; i += sceneryStep) {
    if (rng() < 0.4) continue;
    const point = centerline[i];
    const next = centerline[(i + 1) % centerline.length];
    const tangentLength = Math.hypot(next.x - point.x, next.z - point.z) || 1;
    const side = rng() < 0.5 ? -1 : 1;
    const distance = trackWidth / 2 + 10 + rng() * 20;
    const x = point.x - ((next.z - point.z) / tangentLength) * distance * side;
    const z = point.z + ((next.x - point.x) / tangentLength) * distance * side;

    if (theme === 'urban' && rng() < 0.7) {
      // Building
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(8, 12 + rng() * 10, 8),
        new THREE.MeshLambertMaterial({ color: 0x6a5a4a })
      );
      building.position.set(x, 6 + rng() * 5, z);
      building.rotation.y = Math.atan2(next.z - point.z, next.x - point.x) + (rng() - 0.5) * 0.5;
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
    } else {
      // Tree
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.5, 2, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a352a })
      );
      trunk.position.y = 1;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(2, 6, 8),
        new THREE.MeshLambertMaterial({ color: 0x1a4a1a })
      );
      leaves.position.y = 5;
      leaves.castShadow = true;
      tree.add(leaves);

      tree.position.set(x, 0, z);
      tree.rotation.y = rng() * Math.PI * 2;
      scene.add(tree);
    }
  }

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffee, 1.2);
  sun.position.set(100, 200, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // Skybox
  const skyGeo = new THREE.SphereGeometry(5000, 32, 16);
  skyGeo.scale(-1, 1, 1);
  const skyMat = new THREE.MeshBasicMaterial({ color: colors.sky, fog: false });
  const skybox = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skybox);

  return { scene, trackGroup, sun };
}

function createTrackStrip(points, width) {
  const count = points.length;
  const positions = [];
  const indices = [];

  points.forEach((point, i) => {
    const previous = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const halfWidth = width / 2;
    const nx = -dz / length * halfWidth;
    const nz = dx / length * halfWidth;
    positions.push(point.x - nx, 0, point.z - nz, point.x + nx, 0, point.z + nz);
  });

  for (let i = 0; i < count; i++) {
    const current = i * 2;
    const next = ((i + 1) % count) * 2;
    indices.push(current, next, current + 1, next, next + 1, current + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Car mesh - simple but recognizable
export function createCarMesh(color = 0xff0000) {
  const group = new THREE.Group();

  // Main body
  const bodyGeo = new THREE.BoxGeometry(2.2, 0.6, 4.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.3 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Cockpit
  const cockpitGeo = new THREE.BoxGeometry(1.4, 0.5, 2);
  const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, metalness: 0.2, roughness: 0.8, transparent: true, opacity: 0.7 });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(0, 1.05, -0.3);
  cockpit.castShadow = true;
  group.add(cockpit);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.9 });
  const wheelPositions = [
    [-1.2, 0.3, 1.8], [1.2, 0.3, 1.8],
    [-1.2, 0.3, -1.8], [1.2, 0.3, -1.8]
  ];
  const wheels = [];
  wheelPositions.forEach((pos, i) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  });

  // Brake lights
  const brakeLightGeo = new THREE.BoxGeometry(0.5, 0.12, 0.05);
  const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0 });
  const brakeLightLeft = new THREE.Mesh(brakeLightGeo, brakeLightMat);
  brakeLightLeft.position.set(-0.7, 0.6, -2.35);
  group.add(brakeLightLeft);
  const brakeLightRight = new THREE.Mesh(brakeLightGeo, brakeLightMat);
  brakeLightRight.position.set(0.7, 0.6, -2.35);
  group.add(brakeLightRight);

  group.userData = { wheels, brakeLightLeft, brakeLightRight, body, cockpit };
  return group;
}

export function updateCarMesh(carMesh, carData, dt) {
  if (!carMesh || !carMesh.userData) return;
  const { wheels, brakeLightLeft, brakeLightRight, body } = carMesh.userData;

  carMesh.position.set(carData.x, 0.3, carData.z);
  carMesh.rotation.y = carData.angle;

  const wheelRotationSpeed = (carData.speed || 0) / 50 * dt * 60;
  wheels.forEach(wheel => {
    wheel.rotation.x += wheelRotationSpeed;
  });

  const steerAngle = (carData.steer || 0) * 0.5;
  wheels[0].rotation.y = steerAngle;
  wheels[1].rotation.y = steerAngle;

  const braking = (carData.brake || 0) > 0.1;
  brakeLightLeft.material.opacity = braking ? 1 : 0;
  brakeLightRight.material.opacity = braking ? 1 : 0;

  const targetLean = -(carData.steer || 0) * 0.15 * (carData.speed / 120);
  body.rotation.z += (targetLean - body.rotation.z) * 0.1;
}

export function createCameraRig() {
  const rig = new THREE.Group();
  rig.position.set(0, 3, -8);
  return rig;
}

// Simple hash and PRNG
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