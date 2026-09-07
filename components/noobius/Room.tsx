'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { JOBS, type JobType, type Shift } from '@/lib/game';
import { planPath } from '@/lib/navigation';

type Props = {
  shift: Shift;
  paused: boolean;
  destination: { job: JobType; key: number } | null;
  onArrive: (job: JobType) => void;
};
export default function Room({ shift, paused, destination, onArrive }: Props) {
  const mount = useRef<HTMLDivElement>(null),
    live = useRef({ shift, paused, onArrive }),
    go = useRef<((id: JobType) => void) | null>(null);
  const [failed, setFailed] = useState(false);
  live.current = { shift, paused, onArrive };
  useEffect(() => {
    if (destination) go.current?.(destination.job);
  }, [destination]);
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D server room. Use WASD or arrow keys to move, E to interact, or select a station from the job buttons.',
    );
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07141c');
    scene.fog = new THREE.Fog('#07141c', 27, 55);
    const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 100);
    const cameraOffset = new THREE.Vector3(12, 14.3, 17),
      cameraFocus = new THREE.Vector3(0.1, 0.7, 1.2);
    camera.position.copy(cameraFocus).add(cameraOffset);
    camera.lookAt(cameraFocus);
    scene.add(new THREE.HemisphereLight('#a8cddc', '#243840', 2.0));
    const keyLight = new THREE.DirectionalLight('#d2e3ea', 3);
    keyLight.position.set(3, 12, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.normalBias = 0.025;
    scene.add(keyLight);
    const fill = new THREE.PointLight('#63eee0', 50, 18, 2);
    fill.position.set(-4, 5, -2);
    scene.add(fill);
    const warm = new THREE.PointLight('#ffb962', 45, 14, 2);
    warm.position.set(5, 4, 1);
    scene.add(warm);
    const materials: THREE.Material[] = [],
      geometries: THREE.BufferGeometry[] = [],
      textures: THREE.Texture[] = [];
    const material = (
      color: string,
      metalness = 0.25,
      roughness = 0.6,
      emissive?: string,
    ) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness,
        ...(emissive ? { emissive, emissiveIntensity: 2 } : {}),
      });
      materials.push(m);
      return m;
    };
    const steel = material('#2a414e', 0.55, 0.45),
      dark = material('#10232e', 0.45, 0.52),
      panel = material('#405865', 0.35, 0.5),
      black = material('#07151e', 0.2, 0.65),
      tileA = material('#304550', 0.3, 0.6),
      tileB = material('#334b57', 0.3, 0.6),
      mint = material('#b1df94', 0.2, 0.5, '#71b85c'),
      cyan = material('#7bead9', 0.2, 0.3, '#30c8b9'),
      amber = material('#ffd090', 0.2, 0.3, '#f39a42'),
      rubber = material('#12242c', 0.05, 0.85),
      blue = material('#9db8c7', 0.05, 0.8),
      shirt = material('#d1d8c8', 0.05, 0.95),
      white = material('#e4eeed', 0.05, 0.25);
    const add = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      geometries.push(geometry);
      const o = new THREE.Mesh(geometry, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
      r = 0.045,
    ) =>
      add(
        new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 5, h / 5, d / 5)),
        mat,
        parent,
        x,
        y,
        z,
      );
    const sphere = (
      r: number,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => add(new THREE.SphereGeometry(r, 24, 16), mat, parent, x, y, z);
    const pipe = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      r: number,
      mat: THREE.Material,
      parent: THREE.Object3D,
    ) => {
      const dir = b.clone().sub(a),
        m = add(
          new THREE.CylinderGeometry(r, r, dir.length(), 12),
          mat,
          parent,
        );
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
      );
      return m;
    };
    const world = new THREE.Group();
    scene.add(world);
    // The surrounding facility floor continues beyond the viewport.
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const floorCtx = floorCanvas.getContext('2d')!;
    floorCtx.fillStyle = '#2e424e';
    floorCtx.fillRect(0, 0, 256, 256);
    floorCtx.fillStyle = '#324955';
    floorCtx.fillRect(0, 0, 128, 128);
    floorCtx.fillRect(128, 128, 128, 128);
    floorCtx.strokeStyle = '#172d39';
    floorCtx.lineWidth = 2;
    for (const x of [0, 128, 256]) {
      floorCtx.beginPath();
      floorCtx.moveTo(x, 0);
      floorCtx.lineTo(x, 256);
      floorCtx.stroke();
      floorCtx.beginPath();
      floorCtx.moveTo(0, x);
      floorCtx.lineTo(256, x);
      floorCtx.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(40, 40);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(floorTexture);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.8,
      metalness: 0.2,
    });
    materials.push(floorMaterial);
    const outerFloor = add(
      new THREE.PlaneGeometry(80, 80),
      floorMaterial,
      world,
      0,
      -0.12,
      0,
    );
    outerFloor.rotation.x = -Math.PI / 2;
    box(13, 0.12, 10, steel, world, 0, -0.12, 0, 0.03);
    for (let x = -6; x <= 6; x++)
      for (let z = -4.5; z <= 4.5; z++)
        box(
          0.96,
          0.1,
          0.96,
          (x + Math.round(z)) % 2 ? tileA : tileB,
          world,
          x,
          -0.02,
          z,
          0.015,
        );
    box(13, 3.5, 0.3, dark, world, 0, 1.4, -5);
    box(0.3, 2.8, 10, dark, world, -6.5, 1.07, 0);
    for (let x = -6; x <= 6; x += 2) {
      box(0.09, 3.5, 0.16, panel, world, x, 1.4, -4.8);
      box(1.78, 1.25, 0.05, steel, world, x + 1, 0.6, -4.81);
    }
    for (let z = -4; z <= 4; z += 2)
      box(0.13, 2.7, 0.08, panel, world, -6.28, 1.1, z);
    for (const x of [-4, 0, 4]) {
      box(1.5, 0.08, 0.08, cyan, world, x, 2.72, -4.65);
      box(1.85, 0.2, 0.18, black, world, x, 2.75, -4.81);
    }
    pipe(
      new THREE.Vector3(-6, 2.95, -4.65),
      new THREE.Vector3(6, 2.95, -4.65),
      0.12,
      panel,
      world,
    );
    pipe(
      new THREE.Vector3(-6.16, 2.8, -4.65),
      new THREE.Vector3(-6.16, 2.8, 4),
      0.12,
      panel,
      world,
    );
    for (let x = -5; x <= 5; x += 2)
      box(0.11, 0.42, 0.1, dark, world, x, 2.95, -4.51);
    // Raised cable trays, front grilles and maintenance stripes make the room tactile.
    for (let x = -5.8; x <= 5.8; x += 0.3) {
      box(0.14, 0.022, 0.48, black, world, x, 0.05, 4.4, 0.01);
      if (Math.abs(x) > 2)
        box(0.17, 0.024, 0.5, amber, world, x, 0.05, 3.2, 0.01).rotation.y =
          0.45;
    }
    const rackGroups: THREE.Group[] = [],
      indicators: THREE.MeshStandardMaterial[][] = [[], [], []];
    const jobObjects: THREE.Object3D[] = [],
      fans: THREE.Group[] = [];
    function tag(group: THREE.Object3D, id: JobType) {
      group.traverse((o) => {
        o.userData.job = id;
        if ((o as THREE.Mesh).isMesh) jobObjects.push(o);
      });
    }
    function rack(x: number, z: number, jobIndex: number) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      world.add(g);
      box(1.52, 2.8, 1.35, dark, g, 0, 1.4, 0, 0.1);
      box(1.3, 2.6, 0.06, black, g, 0, 1.4, 0.7);
      box(0.08, 2.7, 0.1, panel, g, -0.65, 1.4, 0.76);
      box(0.08, 2.7, 0.1, panel, g, 0.65, 1.4, 0.76);
      for (let row = 0; row < 7; row++) {
        const y = 0.28 + row * 0.35;
        box(1.13, 0.27, 0.13, steel, g, 0, y, 0.76, 0.025);
        for (let j = 0; j < 5; j++)
          box(0.08, 0.015, 0.02, black, g, -0.35 + j * 0.13, y, 0.84, 0.002);
        const m = material('#e9a572', 0.1, 0.4, '#d35e24');
        indicators[jobIndex].push(m);
        box(0.043, 0.06, 0.027, m, g, 0.43, y, 0.85, 0.002);
        box(0.035, 0.027, 0.027, cyan, g, 0.34, y, 0.85, 0.002);
      }
      for (let i = 0; i < 3; i++)
        box(0.25, 0.022, 0.82, black, g, -0.42 + i * 0.42, 2.813, 0, 0.008);
      tag(g, JOBS[jobIndex].id);
      rackGroups.push(g);
      return g;
    }
    rack(-4, -2.8, 0);
    rack(-2, -2.8, 0);
    rack(0, -2.8, 1);
    rack(2, -2.8, 1);
    rack(4, -2.8, 2);
    const cooler = new THREE.Group();
    cooler.position.set(-4, 0, 1);
    world.add(cooler);
    box(1.55, 1.75, 0.8, steel, cooler, 0, 0.9, 0, 0.1);
    for (const x of [-0.42, 0.42]) {
      const fan = new THREE.Group();
      fan.position.set(x, 1.12, 0.44);
      cooler.add(fan);
      add(new THREE.TorusGeometry(0.3, 0.045, 10, 32), panel, fan);
      for (let b = 0; b < 5; b++) {
        const blade = box(0.1, 0.26, 0.045, panel, fan, 0, 0.15, 0.02, 0.04);
        blade.position.x = Math.sin((b * Math.PI * 2) / 5) * 0.14;
        blade.position.y = Math.cos((b * Math.PI * 2) / 5) * 0.14;
        blade.rotation.z = (-b * Math.PI * 2) / 5 + 0.4;
      }
      sphere(0.075, black, fan, 0, 0, 0.05);
      fans.push(fan);
    }
    pipe(
      new THREE.Vector3(-4.65, 1.5, 1),
      new THREE.Vector3(-5.3, 1.5, 1),
      0.12,
      panel,
      world,
    );
    pipe(
      new THREE.Vector3(-5.3, 1.5, 1),
      new THREE.Vector3(-5.3, 1.5, -2.6),
      0.12,
      panel,
      world,
    );
    tag(cooler, 'cooling');
    const terminal = new THREE.Group();
    terminal.position.set(4, 0, 1);
    world.add(terminal);
    box(1.65, 0.12, 0.9, panel, terminal, 0, 1, 0);
    for (const x of [-0.62, 0.62]) box(0.1, 1, 0.1, steel, terminal, x, 0.5, 0);
    box(1.05, 0.65, 0.13, black, terminal, 0, 1.5, -0.1, 0.045);
    box(0.9, 0.49, 0.02, cyan, terminal, 0, 1.5, -0.02, 0.015);
    box(0.12, 0.3, 0.12, panel, terminal, 0, 1.11, -0.1);
    box(0.75, 0.04, 0.26, black, terminal, 0, 1.08, 0.22);
    for (let i = 0; i < 5; i++)
      box(
        0.6 - i * 0.1,
        0.025,
        0.018,
        steel,
        terminal,
        -i * 0.02,
        1.35 + i * 0.065,
        0,
        0.002,
      );
    tag(terminal, 'network');
    // A coffee mug and maintenance trolley belong to this particular shift.
    const cup = add(
      new THREE.CylinderGeometry(0.1, 0.08, 0.19, 20),
      shirt,
      terminal,
      0.6,
      1.16,
      0.12,
    );
    add(
      new THREE.TorusGeometry(0.075, 0.025, 8, 16),
      shirt,
      terminal,
      0.71,
      1.17,
      0.12,
    );
    const cart = new THREE.Group();
    cart.position.set(-1.8, 0, 2.55);
    world.add(cart);
    box(0.9, 0.13, 0.58, panel, cart, 0, 0.9, 0);
    box(0.9, 0.09, 0.58, steel, cart, 0, 0.27, 0);
    for (const x of [-0.35, 0.35])
      for (const z of [-0.22, 0.22]) {
        pipe(
          new THREE.Vector3(x, 0.13, z),
          new THREE.Vector3(x, 0.95, z),
          0.035,
          panel,
          cart,
        );
        sphere(0.095, rubber, cart, x, 0.12, z);
      }
    box(0.45, 0.22, 0.3, amber, cart, 0.12, 1.08, 0, 0.04);
    box(0.12, 0.055, 0.38, black, cart, -0.3, 1.0, 0, 0.02);
    const markerMaterials: THREE.MeshStandardMaterial[] = [];
    JOBS.forEach((job, i) => {
      const m = material('#ffc783', 0.1, 0.5, '#e69144');
      markerMaterials.push(m);
      const ring = add(
        new THREE.TorusGeometry(0.53, 0.035, 8, 48),
        m,
        world,
        job.location[0],
        0.07,
        job.location[1] + 1,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.userData.job = job.id;
      jobObjects.push(ring);
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#112631';
      ctx.beginPath();
      ctx.arc(64, 64, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#bad6bf';
      ctx.stroke();
      ctx.fillStyle = '#e2efdf';
      ctx.font = 'bold 60px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 64, 66);
      const texture = new THREE.CanvasTexture(canvas);
      textures.push(texture);
      const sm = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      materials.push(sm);
      const sprite = new THREE.Sprite(sm);
      sprite.position.set(
        job.location[0],
        i === 1 ? 3.6 : 2.55,
        job.location[1],
      );
      sprite.scale.set(0.6, 0.6, 1);
      sprite.userData.job = job.id;
      jobObjects.push(sprite);
      world.add(sprite);
    });
    const avatar = new THREE.Group();
    avatar.position.set(0.2, 0, 2.4);
    world.add(avatar);
    const body = new THREE.Group();
    avatar.add(body);
    add(
      new THREE.CylinderGeometry(0.31, 0.39, 0.64, 32),
      shirt,
      body,
      0,
      0.77,
      0,
    );
    const neck = sphere(0.4, blue, body, 0, 1.37, 0);
    neck.scale.set(1, 1.35, 0.9);
    const lower = sphere(0.33, shirt, body, 0, 0.5, 0);
    lower.scale.set(1.15, 0.6, 0.95);
    const limbs: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.36, 0.97, 0);
      body.add(arm);
      add(
        new THREE.CapsuleGeometry(0.11, 0.18, 4, 10),
        shirt,
        arm,
        side * 0.05,
        -0.12,
        0,
      );
      add(
        new THREE.CapsuleGeometry(0.085, 0.18, 4, 10),
        blue,
        arm,
        side * 0.075,
        -0.32,
        0.01,
      );
      sphere(0.105, blue, arm, side * 0.075, -0.49, 0.025);
      arm.rotation.z = -side * 0.12;
      limbs.push(arm);
      const leg = new THREE.Group();
      leg.position.set(side * 0.19, 0.35, 0);
      avatar.add(leg);
      add(new THREE.CapsuleGeometry(0.095, 0.2, 4, 10), blue, leg, 0, -0.05, 0);
      box(0.22, 0.13, 0.32, rubber, leg, 0, -0.24, 0.06, 0.06);
      limbs.push(leg);
    }
    for (const side of [-1, 1]) {
      const eye = sphere(0.175, white, body, side * 0.165, 1.5, 0.285);
      eye.scale.set(0.91, 1.1, 0.65);
      sphere(0.067, black, body, side * 0.16, 1.48, 0.39);
      sphere(0.022, white, body, side * 0.16 - 0.018, 1.508, 0.444);
      const brow = add(
        new THREE.CapsuleGeometry(0.032, 0.19, 4, 10),
        panel,
        body,
        side * 0.17,
        1.76,
        0.24,
      );
      brow.rotation.z = side * 0.95;
      const ear = sphere(0.16, rubber, body, side * 0.41, 1.47, 0);
      ear.scale.set(0.5, 1.25, 1);
      box(0.05, 0.22, 0.16, steel, body, side * 0.49, 1.48, 0, 0.03);
    }
    const mouth = sphere(0.085, black, body, 0, 1.19, 0.32);
    mouth.scale.set(1.25, 0.47, 0.4);
    box(0.06, 0.025, 0.02, white, body, -0.018, 1.215, 0.357, 0.004);
    add(
      new THREE.TorusGeometry(0.45, 0.042, 10, 40, Math.PI),
      steel,
      body,
      0,
      1.5,
      0,
    );
    pipe(
      new THREE.Vector3(0.48, 1.39, 0.04),
      new THREE.Vector3(0.39, 1.17, 0.39),
      0.017,
      panel,
      body,
    );
    sphere(0.053, rubber, body, 0.39, 1.17, 0.4);
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2(),
      point = new THREE.Vector3();
    let waypoints: THREE.Vector3[] = [];
    let target: THREE.Vector3 | null = null,
      targetJob: JobType | null = null,
      raf = 0,
      last = 0,
      disposed = false,
      celebration = 0,
      previousRepaired = 0;
    const keys = new Set<string>();
    const obstacles = [
      ...rackGroups.map((g) => ({
        x: g.position.x,
        z: g.position.z,
        w: 0.95,
        d: 0.95,
      })),
      { x: -4, z: 1, w: 1, d: 0.65 },
      { x: 4, z: 1, w: 1, d: 0.65 },
      { x: -1.8, z: 2.55, w: 0.7, d: 0.5 },
    ];
    const clear = (x: number, z: number) =>
      Math.abs(x) < 5.9 &&
      z > -4.4 &&
      z < 4.5 &&
      !obstacles.some(
        (o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d,
      );
    const routeTo = (x: number, z: number, id: JobType | null) => {
      waypoints = planPath(
        [avatar.position.x, avatar.position.z],
        [x, z],
        clear,
      ).map(([px, pz]) => new THREE.Vector3(px, 0, pz));
      target = waypoints.shift() ?? null;
      targetJob = target ? id : null;
    };
    go.current = (id) => {
      const job = JOBS.find((j) => j.id === id)!;
      routeTo(job.location[0], job.location[1] + 1.05, id);
    };
    const click = (e: PointerEvent) => {
      if (live.current.paused) return;
      renderer.domElement.focus({ preventScroll: true });
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(jobObjects, false)[0];
      if (hit?.object.userData.job) {
        go.current?.(hit.object.userData.job);
        return;
      }
      if (
        raycaster.ray.intersectPlane(floor, point) &&
        clear(point.x, point.z)
      ) {
        routeTo(point.x, point.z, null);
      }
      renderer.domElement.focus({ preventScroll: true });
    };
    const nearest = () => {
      let best: { id: JobType; d: number } | null = null;
      for (const j of JOBS) {
        const d = Math.hypot(
          avatar.position.x - j.location[0],
          avatar.position.z - j.location[1] - 1,
        );
        if (d < 1.7 && (!best || d < best.d)) best = { id: j.id, d };
      }
      return best;
    };
    const down = (e: KeyboardEvent) => {
      if (
        live.current.paused ||
        ['INPUT', 'TEXTAREA', 'BUTTON'].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      const key = e.key.toLowerCase();
      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowleft',
          'arrowdown',
          'arrowright',
          'e',
        ].includes(key)
      ) {
        e.preventDefault();
        keys.add(key);
        if (key === 'e' && !e.repeat) {
          const n = nearest();
          if (n) live.current.onArrive(n.id);
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    renderer.domElement.addEventListener('pointerdown', click);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight,
        aspect = w / h;
      const scale = aspect < 1 ? 3.8 / aspect : 5;
      camera.left = -scale * aspect;
      camera.right = scale * aspect;
      camera.top = scale;
      camera.bottom = -scale;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const contextLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    function frame(time: number) {
      if (disposed) return;
      const dt = Math.min((time - last) / 1000 || 0, 0.05);
      last = time;
      const state = live.current;
      let dx = 0,
        dz = 0,
        moving = false;
      const repaired = state.shift.jobs.filter(
        (j) => j.status === 'repaired',
      ).length;
      if (repaired > previousRepaired) celebration = 1;
      previousRepaired = repaired;
      if (!state.paused) {
        dx =
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft'));
        dz =
          Number(keys.has('s') || keys.has('arrowdown')) -
          Number(keys.has('w') || keys.has('arrowup'));
        if (dx || dz) {
          target = null;
          waypoints = [];
          targetJob = null;
          const xx = dx * 0.8 + dz * 0.6,
            zz = dz * 0.8 - dx * 0.6;
          dx = xx;
          dz = zz;
        } else if (target) {
          dx = target.x - avatar.position.x;
          dz = target.z - avatar.position.z;
          if (Math.hypot(dx, dz) < 0.05) {
            target = waypoints.shift() ?? null;
            dx = 0;
            dz = 0;
            if (!target) {
              const job = targetJob;
              targetJob = null;
              if (job) state.onArrive(job);
            }
          }
        }
        const len = Math.hypot(dx, dz);
        if (len > 0.01) {
          dx /= len;
          dz /= len;
          const step = Math.min(2.6 * dt, len),
            x = avatar.position.x + dx * step,
            z = avatar.position.z + dz * step;
          if (clear(x, avatar.position.z)) {
            avatar.position.x = x;
            moving = true;
          }
          if (clear(avatar.position.x, z)) {
            avatar.position.z = z;
            moving = true;
          }
          avatar.rotation.y = THREE.MathUtils.lerp(
            avatar.rotation.y,
            Math.atan2(dx, dz),
            Math.min(1, dt * 12),
          );
          if (!moving && target) {
            target = null;
            waypoints = [];
            targetJob = null;
          }
        }
      } else keys.clear();
      celebration = Math.max(0, celebration - dt);
      body.position.y = moving
        ? Math.abs(Math.sin(time * 0.009)) * 0.045
        : Math.sin(time * 0.0018) * 0.018;
      avatar.position.y =
        celebration > 0 ? Math.sin(celebration * Math.PI) * 0.28 : 0;
      limbs.forEach(
        (limb, i) =>
          (limb.rotation.x = moving
            ? Math.sin(time * 0.009 + (i < 2 ? 0 : Math.PI)) * 0.35
            : Math.sin(time * 0.0018) * 0.025),
      );
      fans.forEach((fan, i) => {
        fan.rotation.z +=
          dt *
          (state.shift.jobs[0].status === 'repaired' ? 5 : 1.3) *
          (i ? 1 : -1);
      });
      state.shift.jobs.forEach((job, i) => {
        const color =
          job.status === 'repaired'
            ? '#7ee4b0'
            : job.status === 'failed'
              ? '#cf665b'
              : '#efab69';
        const glow =
          job.status === 'repaired'
            ? '#3eba78'
            : job.status === 'failed'
              ? '#94352e'
              : '#dc7633';
        markerMaterials[i].color.set(color);
        markerMaterials[i].emissive.set(glow);
        markerMaterials[i].emissiveIntensity =
          job.status === 'repaired' ? 1.2 : 1 + Math.sin(time * 0.003) * 0.5;
        indicators[i].forEach((m, k) => {
          m.color.set(color);
          m.emissive.set(glow);
          m.emissiveIntensity =
            job.status === 'repaired'
              ? 1.5
              : 0.6 + (Math.sin(time * 0.004 + k) > 0 ? 0.8 : 0);
        });
      });
      cameraFocus.lerp(
        new THREE.Vector3(
          avatar.position.x * 0.7,
          0.7,
          avatar.position.z * 0.7,
        ),
        Math.min(1, dt * 3),
      );
      camera.position.copy(cameraFocus).add(cameraOffset);
      camera.lookAt(cameraFocus);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      go.current = null;
      renderer.domElement.removeEventListener('pointerdown', click);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="room-canvas" ref={mount}>
      {failed && (
        <div className="room-fallback">
          <img src="/assets/facility.png" alt="The server room" />
          <p>
            3D isn’t available on this device. All three stations still work
            using the job buttons.
          </p>
        </div>
      )}
    </div>
  );
}
