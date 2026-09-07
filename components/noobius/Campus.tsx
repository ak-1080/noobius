'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  OBJECTS,
  ZONES,
  OUTFITS,
  type Facility,
  type WorldObject,
} from '@/lib/facility';
import { planPath } from '@/lib/navigation';
export type CrewPerson = {
  id: string;
  name: string;
  x: number;
  z: number;
  outfit: string;
};
type Props = {
  facility: Facility;
  paused: boolean;
  people: CrewPerson[];
  onInteract: (object: WorldObject) => void;
  onPosition: (x: number, z: number) => void;
  zoomCommand: number;
  travelCommand: number;
  guideCommand: { id: string; revision: number } | null;
};
export default function Campus(props: Props) {
  const mount = useRef<HTMLDivElement>(null),
    live = useRef(props),
    travel = useRef<((zone: string) => void) | null>(null),
    zoom = useRef<((n: number) => void) | null>(null),
    guide = useRef<((id: string) => void) | null>(null);
  live.current = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    travel.current?.(props.facility.zone);
  }, [props.facility.zone, props.travelCommand]);
  useEffect(() => {
    if (props.zoomCommand) zoom.current?.(props.zoomCommand > 0 ? -0.15 : 0.15);
  }, [props.zoomCommand]);
  useEffect(() => {
    if (props.guideCommand) guide.current?.(props.guideCommand.id);
  }, [props.guideCommand]);
  useEffect(() => {
    const host = mount.current!;
    if (!host) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    host.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      'Noobius compute campus. Click to walk, click a character or station to interact. WASD to move, E to interact, mouse wheel to zoom, R to rotate.',
    );
    const scene = new T.Scene();
    scene.background = new T.Color('#13222d');
    scene.fog = new T.Fog('#13222d', 70, 125);
    const camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 180),
      focus = new T.Vector3(0, 0.5, 15),
      offset = new T.Vector3(16, 22, 20);
    let scale = 7,
      targetScale = 7,
      rotation = 0,
      lastPosition = 0;
    scene.add(new T.HemisphereLight('#c4e4e9', '#263441', 2.4));
    const sun = new T.DirectionalLight('#ffe8c5', 2.9);
    sun.position.set(6, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -37,
      right: 37,
      top: 40,
      bottom: -42,
    });
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    const geometry: T.BufferGeometry[] = [],
      materials: T.Material[] = [],
      textures: T.Texture[] = [],
      clickable: T.Object3D[] = [],
      obstacles: { x: number; z: number; w: number; d: number }[] = [],
      objects = new Map<string, T.Group>(),
      labels = new Map<string, T.Sprite>(),
      fans: T.Object3D[] = [];
    const mat = (color: string, metal = 0.3, emissive?: string) => {
      const m = new T.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: metal,
        ...(emissive ? { emissive, emissiveIntensity: 1.7 } : {}),
      });
      materials.push(m);
      return m;
    };
    const dark = mat('#142b37'),
      steel = mat('#355466'),
      silver = mat('#6a8895'),
      floorMat = mat('#345360'),
      black = mat('#091b25'),
      mint = mat('#b3e795', 0.1, '#6eae75'),
      amber = mat('#e6ad71', 0.1, '#a56429'),
      blue = mat('#a6c3d0', 0.05),
      white = mat('#e8f0e8', 0.05),
      shirt = mat(
        OUTFITS.find((x) => x.id === live.current.facility.outfit)?.color ??
          '#d1d8c8',
        0.05,
      );
    const mesh = (
      g: T.BufferGeometry,
      m: T.Material,
      parent: T.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      geometry.push(g);
      const o = new T.Mesh(g, m);
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
      m: T.Material,
      parent: T.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => mesh(new RoundedBoxGeometry(w, h, d, 1, 0.045), m, parent, x, y, z);
    const sphere = (
      r: number,
      m: T.Material,
      parent: T.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => mesh(new T.SphereGeometry(r, 16, 12), m, parent, x, y, z);
    const pipe = (
      a: T.Vector3,
      b: T.Vector3,
      r: number,
      m: T.Material,
      parent: T.Object3D,
    ) => {
      const dir = b.clone().sub(a),
        o = mesh(new T.CylinderGeometry(r, r, dir.length(), 8), m, parent);
      o.position.copy(a).add(b).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
      return o;
    };
    const label = (text: string, color: string, width = 4) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 100;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#10232bdd';
      ctx.beginPath();
      ctx.roundRect(4, 4, 504, 92, 18);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '500 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e6efe6';
      ctx.fillText(text, 256, 51);
      const tx = new T.CanvasTexture(c);
      textures.push(tx);
      const sm = new T.SpriteMaterial({
        map: tx,
        depthTest: false,
        transparent: true,
      });
      materials.push(sm);
      const s = new T.Sprite(sm);
      s.scale.set(width, width / 5.12, 1);
      return s;
    };
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 128;
    texCanvas.height = 128;
    const ctx = texCanvas.getContext('2d')!;
    ctx.fillStyle = '#304b59';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#233b48';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    const tx = new T.CanvasTexture(texCanvas);
    tx.colorSpace = T.SRGBColorSpace;
    tx.wrapS = tx.wrapT = T.RepeatWrapping;
    tx.repeat.set(100, 100);
    textures.push(tx);
    const roomTx = tx.clone();
    roomTx.repeat.set(12, 10);
    textures.push(roomTx);
    const roomFloor = new T.MeshStandardMaterial({
      map: roomTx,
      roughness: 0.85,
    });
    materials.push(roomFloor);
    const groundM = new T.MeshStandardMaterial({ map: tx, roughness: 0.8 });
    materials.push(groundM);
    const ground = mesh(
      new T.PlaneGeometry(150, 150),
      groundM,
      scene,
      0,
      -0.16,
      0,
    );
    ground.rotation.x = -Math.PI / 2;
    // Continuous aisles link all seven departments, including the future wings.
    for (const z of [12, -10]) box(64, 0.07, 3.6, steel, scene, 0, -0.04, z);
    for (const x of [-22, 0, 22])
      box(3.6, 0.07, 39, steel, scene, x, -0.04, -6);
    for (const zone of ZONES) {
      const g = new T.Group();
      g.position.set(zone.x, 0, zone.z);
      scene.add(g);
      box(18, 0.14, 16, floorMat, g, 0, -0.02, 0);
      const tiles = mesh(
        new T.PlaneGeometry(18, 16),
        roomFloor,
        g,
        0,
        0.052,
        0,
      );
      tiles.rotation.x = -Math.PI / 2;
      tiles.castShadow = false;
      const accent = mat(zone.color, 0.1);
      box(18, 0.08, 0.12, accent, g, 0, 0.09, 7.6);
      box(0.12, 0.08, 16, accent, g, -8.7, 0.09, 0);
      for (const side of [-1, 1]) {
        box(7.2, 1.5, 0.25, dark, g, side * 5.4, 0.62, -8);
        box(0.2, 0.55, 6.2, dark, g, -9, 0.25, side * 4.9);
      }
      for (let x = -8; x <= 8; x += 4) {
        box(0.12, 2.2, 0.16, silver, g, x, 1, -7.7);
        box(2, 0.08, 0.08, accent, g, x, 2, -7.55);
      }
      const title = label(zone.label, zone.color, 6.3);
      title.position.set(zone.x, 3.6, zone.z - 7.4);
      scene.add(title);
      // Passive machinery makes every wing readable at a glance.
      for (let i = 0; i < 3; i++) {
        const x = -6 + i * 5.5;
        if (zone.id === 'thermal') {
          mesh(
            new T.CylinderGeometry(0.62, 0.62, 2.2, 16),
            silver,
            g,
            x,
            1.1,
            -5,
          );
          pipe(
            new T.Vector3(x, 2.1, -5),
            new T.Vector3(x, 2.1, -7),
            0.13,
            accent,
            g,
          );
        } else if (zone.id === 'salvage') {
          for (let j = 0; j < 3; j++)
            box(
              1.2,
              0.45,
              0.85,
              j % 2 ? steel : dark,
              g,
              x + j * 0.1,
              0.3 + j * 0.44,
              -5 + j * 0.15,
            );
        } else if (zone.id !== 'commons') {
          box(1.4, 2.5, 1.1, dark, g, x, 1.25, -5);
          for (let row = 0; row < 5; row++) {
            box(1.18, 0.29, 0.1, steel, g, x, 0.4 + row * 0.42, -4.4);
            box(0.06, 0.06, 0.04, accent, g, x + 0.43, 0.4 + row * 0.42, -4.32);
          }
        }
        if (zone.id !== 'commons')
          obstacles.push({ x: zone.x + x, z: zone.z - 5, w: 1, d: 1 });
      }
    }
    const skin = mat('#a4bbc9', 0.02),
      eyeBag = mat('#8fa8bc', 0.02),
      browMat = mat('#354d65', 0.03),
      padding = mat('#101d28', 0.02);
    function makeAvatar(color: T.Material) {
      const g = new T.Group(),
        body = new T.Group();
      g.add(body);
      const lathe = (points: number[][], m: T.Material) => {
        const curve = new T.CatmullRomCurve3(
          points.map(([r, y]) => new T.Vector3(r, y, 0)),
        );
        const geo = new T.LatheGeometry(
          curve.getPoints(48).map((p) => new T.Vector2(Math.max(0, p.x), p.y)),
          40,
        );
        const shape = mesh(geo, m, body);
        shape.scale.z = 0.82;
        return shape;
      };
      // Continuous broad bean silhouette, with a loose shirt over its lower half.
      lathe(
        [
          [0, 0.53],
          [0.41, 0.62],
          [0.52, 0.88],
          [0.555, 1.22],
          [0.51, 1.55],
          [0.42, 1.83],
          [0.25, 2.01],
          [0, 2.075],
        ],
        skin,
      );
      lathe(
        [
          [0, 0.34],
          [0.48, 0.35],
          [0.59, 0.42],
          [0.6, 0.65],
          [0.59, 0.86],
          [0.54, 1.01],
          [0.5, 1.055],
        ],
        color,
      );
      const collar = mesh(
        new T.TorusGeometry(0.5, 0.026, 8, 36),
        color,
        body,
        0,
        1.055,
        0,
      );
      collar.rotation.x = Math.PI / 2;
      collar.scale.y = 0.82;
      const feet: T.Object3D[] = [],
        arms: T.Object3D[] = [];
      for (const side of [-1, 1]) {
        const arm = new T.Group();
        arm.position.set(side * 0.56, 0.88, 0);
        body.add(arm);
        const sleeve = mesh(
          new T.CapsuleGeometry(0.16, 0.13, 5, 14),
          color,
          arm,
          side * 0.04,
          -0.015,
          0,
        );
        sleeve.rotation.z = side * 0.18;
        mesh(
          new T.CapsuleGeometry(0.105, 0.24, 5, 14),
          skin,
          arm,
          side * 0.075,
          -0.27,
          0.015,
        );
        const hand = sphere(0.115, skin, arm, side * 0.075, -0.45, 0.03);
        hand.scale.y = 1.15;
        arms.push(arm);
        const foot = new T.Group();
        g.add(foot);
        foot.position.set(side * 0.235, 0.12, 0);
        mesh(new T.CapsuleGeometry(0.12, 0.17, 4, 12), skin, foot, 0, 0.13, 0);
        const shoe = sphere(0.17, padding, foot, 0, 0, 0.055);
        shoe.scale.set(0.83, 0.58, 1.24);
        feet.push(foot);
      }
      for (const eye of [
        { x: -0.225, y: 1.585, r: 0.245 },
        { x: 0.25, y: 1.535, r: 0.205 },
      ]) {
        const bag = sphere(
          eye.r * 1.08,
          eyeBag,
          body,
          eye.x,
          eye.y - 0.026,
          0.363,
        );
        bag.scale.set(1, 1.12, 0.36);
        const whiteEye = sphere(eye.r, white, body, eye.x, eye.y, 0.407);
        whiteEye.scale.set(0.97, 1.11, 0.63);
        const pupil = sphere(
          eye.r * 0.32,
          padding,
          body,
          eye.x + 0.008,
          eye.y - 0.025,
          0.407 + eye.r * 0.615,
        );
        pupil.scale.z = 0.53;
        sphere(
          eye.r * 0.07,
          white,
          body,
          eye.x - 0.014,
          eye.y + 0.007,
          0.415 + eye.r * 0.8,
        );
      }
      const arc = (points: number[][], radius: number, m: T.Material) =>
        mesh(
          new T.TubeGeometry(
            new T.CatmullRomCurve3(
              points.map(
                (p) => new T.Vector3(...(p as [number, number, number])),
              ),
            ),
            24,
            radius,
            10,
            false,
          ),
          m,
          body,
        );
      arc(
        [
          [-0.45, 1.88, 0.29],
          [-0.31, 1.935, 0.34],
          [-0.12, 1.98, 0.33],
        ],
        0.052,
        browMat,
      );
      arc(
        [
          [0.12, 1.94, 0.34],
          [0.28, 1.865, 0.35],
          [0.43, 1.82, 0.31],
        ],
        0.05,
        browMat,
      );
      const mouthShape = new T.Shape();
      mouthShape.moveTo(-0.14, 0);
      mouthShape.bezierCurveTo(-0.09, 0.09, 0.085, 0.095, 0.15, -0.01);
      mouthShape.quadraticCurveTo(0.14, -0.045, 0.045, -0.025);
      mouthShape.quadraticCurveTo(-0.065, -0.02, -0.14, -0.035);
      mouthShape.closePath();
      mesh(new T.ShapeGeometry(mouthShape, 24), padding, body, 0, 1.22, 0.473);
      box(0.047, 0.027, 0.018, white, body, -0.024, 1.272, 0.488);
      box(0.043, 0.025, 0.018, white, body, 0.025, 1.273, 0.488);
      for (const side of [-1, 1]) {
        const cushion = sphere(0.205, padding, body, side * 0.55, 1.62, -0.012);
        cushion.scale.set(0.37, 1.23, 0.77);
        const shell = sphere(0.18, black, body, side * 0.605, 1.62, -0.012);
        shell.scale.set(0.3, 1.23, 0.82);
      }
      const band = mesh(
        new T.TorusGeometry(0.615, 0.043, 10, 40, Math.PI),
        black,
        body,
        0,
        1.67,
        -0.035,
      );
      band.scale.y = 1.1;
      const bandTop = mesh(
        new T.TorusGeometry(0.625, 0.018, 8, 40, Math.PI),
        steel,
        body,
        0,
        1.68,
        -0.03,
      );
      bandTop.scale.y = 1.1;
      arc(
        [
          [0.62, 1.5, 0.06],
          [0.69, 1.36, 0.26],
          [0.65, 1.22, 0.48],
          [0.56, 1.18, 0.56],
        ],
        0.016,
        steel,
      );
      const mic = sphere(0.067, padding, body, 0.55, 1.18, 0.56);
      mic.scale.y = 1.2;
      g.userData.arms = arms;
      g.userData.feet = feet;
      return { g, body };
    }
    for (const obj of OBJECTS) {
      const g = new T.Group();
      g.position.set(obj.x, 0, obj.z);
      scene.add(g);
      objects.set(obj.id, g);
      const accent = mat(
        ZONES.find((z) => z.id === obj.zone)!.color,
        0.2,
        '#244936',
      );
      if (obj.kind === 'npc') {
        const person = makeAvatar(accent);
        g.add(person.g);
        person.g.rotation.y = 0.35;
        box(0.9, 0.1, 0.55, steel, g, 0, 0.7, 0.65);
      }
      if (obj.kind === 'build') {
        box(1.5, 2.45, 1.25, dark, g, 0, 1.22, 0);
        for (let row = 0; row < 6; row++) {
          box(1.28, 0.29, 0.1, steel, g, 0, 0.27 + row * 0.35, 0.68);
          const led = box(
            0.09,
            0.055,
            0.04,
            amber,
            g,
            0.48,
            0.27 + row * 0.35,
            0.76,
          );
          led.userData.led = row + 1;
        }
      }
      if (obj.kind === 'node') {
        if (obj.item === 'coolant') {
          mesh(
            new T.CylinderGeometry(0.65, 0.65, 1.8, 16),
            accent,
            g,
            0,
            0.9,
            0,
          );
          box(0.36, 0.4, 0.1, dark, g, 0, 1, 0.68);
        } else if (obj.item === 'core') {
          const c = box(0.95, 1.1, 0.95, accent, g, 0, 1, 0);
          c.rotation.y = 0.7;
          mesh(new T.TorusGeometry(0.9, 0.05, 8, 24), amber, g, 0, 1, 0);
        } else {
          box(1.7, 0.9, 1.3, steel, g, 0, 0.45, 0);
          for (let i = 0; i < 5; i++) {
            const part = box(
              0.5,
              0.22,
              0.6,
              accent,
              g,
              ((i % 3) - 1) * 0.43,
              1 + (i % 2) * 0.2,
              ((i % 2) - 0.5) * 0.35,
            );
            part.rotation.y = i * 0.3;
          }
        }
      }
      if (obj.kind === 'terminal') {
        box(1.7, 0.13, 0.8, steel, g, 0, 0.85, 0);
        box(0.12, 0.8, 0.12, silver, g, -0.65, 0.4, 0);
        box(0.12, 0.8, 0.12, silver, g, 0.65, 0.4, 0);
        box(1, 0.65, 0.1, black, g, 0, 1.25, -0.1);
        box(0.85, 0.5, 0.03, accent, g, 0, 1.25, -0.03);
      }
      if (obj.kind === 'gate') {
        box(3, 0.13, 0.25, accent, g, 0, 1.8, 0);
        for (const x of [-1.5, 1.5]) box(0.2, 2, 0.2, steel, g, x, 1, 0);
        for (let x = -1.2; x <= 1.2; x += 0.4)
          box(0.08, 1.7, 0.06, accent, g, x, 0.9, 0);
      }
      const badge = label(
        obj.kind === 'node' ? '↓ ' + obj.name : obj.name,
        ZONES.find((z) => z.id === obj.zone)!.color,
        obj.kind === 'gate' ? 4.6 : 3.5,
      );
      badge.position.set(0, obj.kind === 'build' ? 2.95 : 2.6, 0);
      g.add(badge);
      labels.set(obj.id, badge);
      g.traverse((child) => {
        if (child instanceof T.Mesh || child instanceof T.Sprite) {
          child.userData.object = obj;
          clickable.push(child);
        }
      });
      if (obj.kind !== 'gate')
        obstacles.push({
          x: obj.x,
          z: obj.z,
          w: obj.kind === 'npc' ? 0.6 : 1.1,
          d: obj.kind === 'npc' ? 0.5 : 0.85,
        });
    }
    const avatar = makeAvatar(shirt);
    scene.add(avatar.g);
    avatar.g.position.set(0, 0, 17);
    avatar.g.rotation.y = 0.67;
    const peers = new Map<string, T.Group>();
    const clear = (x: number, z: number) => {
      if (Math.abs(x) > 32 || z > 21 || z < -40) return false;
      const zone = ZONES.find(
        (d) => Math.abs(x - d.x) < 9 && Math.abs(z - d.z) < 8,
      );
      if (zone && !live.current.facility.unlocked.includes(zone.id))
        return false;
      const inRoom = !!zone,
        inHall =
          ((Math.abs(z - 12) < 1.8 || Math.abs(z + 10) < 1.8) &&
            Math.abs(x) < 32) ||
          ([-22, 0, 22].some((a) => Math.abs(x - a) < 1.8) &&
            z >= -32 &&
            z <= 12);
      if (!inRoom && !inHall) return false;
      return !obstacles.some(
        (o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d,
      );
    };
    let target: T.Vector3 | null = null,
      waypoints: T.Vector3[] = [],
      targetObject: WorldObject | null = null,
      raf = 0,
      last = 0,
      disposed = false,
      lastAppearance = '';
    const keys = new Set<string>(),
      ray = new T.Raycaster(),
      pointer = new T.Vector2(),
      plane = new T.Plane(new T.Vector3(0, 1, 0), 0),
      point = new T.Vector3();
    const go = (x: number, z: number, object: WorldObject | null) => {
      const path = planPath(
        [avatar.g.position.x, avatar.g.position.z],
        [x, z],
        clear,
        0.5,
      );
      waypoints = path.map(([x, z]) => new T.Vector3(x, 0, z));
      target = waypoints.shift() ?? null;
      targetObject = target ? object : null;
    };
    const walkObject = (obj: WorldObject) => {
      const options = [
        [obj.x, obj.z + 1.65],
        [obj.x + 1.65, obj.z],
        [obj.x - 1.65, obj.z],
        [obj.x, obj.z - 1.65],
      ];
      const dest = options.find(([x, z]) => clear(x, z));
      if (dest) go(dest[0], dest[1], obj);
    };
    travel.current = (zoneId) => {
      const z = ZONES.find((z) => z.id === zoneId);
      if (z && live.current.facility.unlocked.includes(z.id)) {
        avatar.g.position.set(z.x, 0, z.z + 5);
        target = null;
        waypoints = [];
        targetObject = null;
      }
    };
    guide.current = (id) => {
      const obj = OBJECTS.find((o) => o.id === id);
      if (obj && live.current.facility.unlocked.includes(obj.zone)) {
        travel.current?.(obj.zone);
        walkObject(obj);
      }
    };
    travel.current(live.current.facility.zone);
    const click = (e: PointerEvent) => {
      if (live.current.paused) return;
      canvas.focus({ preventScroll: true });
      const r = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray
        .intersectObjects(clickable, false)
        .find((h) => h.object.visible && h.object.parent?.visible);
      if (hit?.object.userData.object) {
        walkObject(hit.object.userData.object);
        return;
      }
      if (ray.ray.intersectPlane(plane, point) && clear(point.x, point.z))
        go(point.x, point.z, null);
    };
    const changeZoom = (delta: number) => {
      targetScale = T.MathUtils.clamp(targetScale * Math.exp(delta), 3.6, 24);
    };
    zoom.current = changeZoom;
    const wheel = (e: WheelEvent) => {
      if (live.current.paused || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      changeZoom(
        T.MathUtils.clamp(
          e.deltaY * (e.deltaMode === 1 ? 0.035 : 0.0015),
          -0.45,
          0.45,
        ),
      );
    };
    const down = (e: KeyboardEvent) => {
      if (
        live.current.paused ||
        ['INPUT', 'TEXTAREA', 'BUTTON'].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      const k = e.key.toLowerCase();
      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          'e',
          'r',
          '+',
          '-',
          '=',
        ].includes(k)
      ) {
        e.preventDefault();
        keys.add(k);
        if (!e.repeat && k === 'r') rotation += Math.PI / 2;
        if (!e.repeat && (k === '+' || k === '=')) changeZoom(-0.2);
        if (!e.repeat && k === '-') changeZoom(0.2);
        if (!e.repeat && k === 'e') {
          const n = OBJECTS.filter(
            (o) =>
              Math.hypot(o.x - avatar.g.position.x, o.z - avatar.g.position.z) <
              3,
          ).sort(
            (a, b) =>
              Math.hypot(a.x - avatar.g.position.x, a.z - avatar.g.position.z) -
              Math.hypot(b.x - avatar.g.position.x, b.z - avatar.g.position.z),
          )[0];
          if (n) live.current.onInteract(n);
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase()),
      blur = () => keys.clear();
    canvas.addEventListener('pointerdown', click);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const resize = () => {
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const contextLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    function frame(time: number) {
      if (disposed) return;
      const dt = Math.min((time - last) / 1000 || 0, 0.05);
      last = time;
      const p = live.current,
        f = p.facility;
      let dx = 0,
        dz = 0,
        moving = false;
      if (!p.paused) {
        dx =
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft'));
        dz =
          Number(keys.has('s') || keys.has('arrowdown')) -
          Number(keys.has('w') || keys.has('arrowup'));
        if (dx || dz) {
          target = null;
          waypoints = [];
          targetObject = null;
          const a = rotation + 0.67,
            xx = dx * Math.cos(a) + dz * Math.sin(a),
            zz = dz * Math.cos(a) - dx * Math.sin(a);
          dx = xx;
          dz = zz;
        } else if (target) {
          dx = target.x - avatar.g.position.x;
          dz = target.z - avatar.g.position.z;
          if (Math.hypot(dx, dz) < 0.06) {
            avatar.g.position.x = target.x;
            avatar.g.position.z = target.z;
            target = waypoints.shift() ?? null;
            dx = 0;
            dz = 0;
            if (!target && targetObject) {
              const o = targetObject;
              targetObject = null;
              p.onInteract(o);
            }
          }
        }
        const len = Math.hypot(dx, dz);
        if (len > 0.01) {
          dx /= len;
          dz /= len;
          const step = Math.min(4.2 * dt, len);
          if (clear(avatar.g.position.x + dx * step, avatar.g.position.z)) {
            avatar.g.position.x += dx * step;
            moving = true;
          }
          if (clear(avatar.g.position.x, avatar.g.position.z + dz * step)) {
            avatar.g.position.z += dz * step;
            moving = true;
          }
          avatar.g.rotation.y +=
            Math.atan2(
              Math.sin(Math.atan2(dx, dz) - avatar.g.rotation.y),
              Math.cos(Math.atan2(dx, dz) - avatar.g.rotation.y),
            ) * Math.min(1, dt * 12);
          if (!moving) {
            target = null;
            waypoints = [];
          }
        }
      } else keys.clear();
      avatar.body.position.y = moving
        ? Math.abs(Math.sin(time * 0.012)) * 0.07
        : Math.sin(time * 0.0018) * 0.018;
      for (const [i, arm] of (avatar.g.userData.arms as T.Object3D[]).entries())
        arm.rotation.x = moving
          ? Math.sin(time * 0.012 + i * Math.PI) * 0.32
          : 0;
      for (const [i, foot] of (
        avatar.g.userData.feet as T.Object3D[]
      ).entries())
        foot.position.z = moving
          ? Math.sin(time * 0.012 + i * Math.PI) * 0.12
          : 0;
      if (time - lastPosition > 600) {
        p.onPosition(avatar.g.position.x, avatar.g.position.z);
        lastPosition = time;
      }
      const appearance = JSON.stringify([
        f.builds,
        f.unlocked,
        f.outfit,
        f.cooldowns,
      ]);
      if (appearance !== lastAppearance) {
        shirt.color.set(
          OUTFITS.find((x) => x.id === f.outfit)?.color ?? '#d1d8c8',
        );
        for (const obj of OBJECTS) {
          const g = objects.get(obj.id)!,
            isOpen = f.unlocked.includes(obj.zone);
          g.visible = obj.kind === 'gate' ? !isOpen : isOpen;
          if (obj.kind === 'build')
            g.traverse((child) => {
              if (child.userData.led)
                (child as T.Mesh).material =
                  (f.builds[obj.id] ?? 0) * 2 >= child.userData.led
                    ? mint
                    : amber;
            });
        }
        lastAppearance = appearance;
      }
      for (const obj of OBJECTS) {
        const l = labels.get(obj.id)!;
        l.material.opacity =
          obj.kind === 'node' && (f.cooldowns[obj.id] ?? 0) > Date.now()
            ? 0.35
            : 1;
        l.visible = targetScale < 13 || obj.kind === 'gate';
      }
      for (const person of p.people) {
        let g = peers.get(person.id);
        if (!g) {
          const peer = makeAvatar(mat('#608ba0', 0.05));
          g = peer.g;
          const name = label(person.name, '#9bdde0', 2.5);
          name.position.y = 2.3;
          g.add(name);
          scene.add(g);
          peers.set(person.id, g);
        }
        g.position.lerp(
          new T.Vector3(person.x, 0, person.z),
          Math.min(1, dt * 5),
        );
      }
      for (const [id, g] of peers)
        if (!p.people.some((p) => p.id === id)) {
          scene.remove(g);
          peers.delete(id);
        }
      scale = T.MathUtils.lerp(scale, targetScale, Math.min(1, dt * 8));
      const aspect = host.clientWidth / host.clientHeight,
        view = aspect < 1 ? (scale * 0.72) / aspect : scale;
      camera.left = -view * aspect;
      camera.right = view * aspect;
      camera.top = view;
      camera.bottom = -view;
      camera.updateProjectionMatrix();
      focus.lerp(
        new T.Vector3(avatar.g.position.x, 0.7, avatar.g.position.z),
        Math.min(1, dt * 4),
      );
      offset.set(
        26 * Math.sin(rotation + 0.67),
        25,
        26 * Math.cos(rotation + 0.67),
      );
      camera.position.copy(focus).add(offset);
      camera.lookAt(focus);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      travel.current = null;
      zoom.current = null;
      guide.current = null;
      canvas.removeEventListener('pointerdown', click);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('webglcontextlost', contextLost);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      geometry.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);
  return (
    <div className="room-canvas" ref={mount}>
      {failed && (
        <div className="room-fallback">
          <img src="/assets/facility.png" alt="Noobius data center" />
          <p>
            3D is unavailable here. Use the map, backpack, and job menus to
            explore the facility and play every activity.
          </p>
        </div>
      )}
    </div>
  );
}
