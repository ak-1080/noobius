'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { avatarBuilder } from './avatarBuilder';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  OBJECTS,
  ZONES,
  OUTFITS,
  ITEMS,
  activeIncident,
  type Facility,
  type WorldObject,
} from '@/lib/facility';
import { EMERGENCY_STATIONS } from '@/lib/multiplayer';
import { planPath } from '@/lib/navigation';
export type CrewPerson = {
  id: string;
  name: string;
  x: number;
  z: number;
  outfit: string;
  accessory?: string;
};
type Props = {
  playerName?: string;
  sharedCampus?: boolean;
  facility: Facility;
  paused: boolean;
  people: CrewPerson[];
  onInteract: (object: WorldObject) => void;
  onPosition: (x: number, z: number) => void;
  zoomCommand: number;
  travelCommand: number;
  guideCommand: { id: string; revision: number } | null;
  objectiveId?: string;
  workEvent: { id: string; kind: string; revision: number } | null;
  onUnavailable: () => void;
  onCancelGuide: () => void;
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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      live.current.onUnavailable();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
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
    scene.add(new T.HemisphereLight('#c4e4e9', '#263441', 1.9));
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
      roomTitles: T.Sprite[] = [],
      fans: T.Object3D[] = [],
      bots: { body: T.Group; arm: T.Group; phase: number; id: string }[] = [];
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
      faultRed = mat('#ff826f', 0.1, '#bb3429'),
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
      if (live.current.sharedCampus && zone.id !== 'commons') continue;
      const g = new T.Group();
      g.position.set(zone.x, 0, zone.z);
      scene.add(g);
      box(18, 0.14, 16, floorMat, g, 0, -0.02, 0);
      const tiles = mesh(
        new T.PlaneGeometry(18, 16),
        (() => {
          const tinted = roomFloor.clone();
          tinted.color.set(zone.color).lerp(new T.Color('#d4e6ee'), 0.68);
          materials.push(tinted);
          return tinted;
        })(),
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
      const title = label(
        live.current.sharedCampus ? 'CREW CAMPUS' : zone.label,
        zone.color,
        6.3,
      );
      title.position.set(zone.x, 3.6, zone.z - 7.4);
      scene.add(title);
      roomTitles.push(title);
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
    const { makeAvatar, addAccessories } = avatarBuilder({
      mesh,
      box,
      sphere,
      skin,
      eyeBag,
      browMat,
      padding,
      white,
      black,
      steel,
      amber,
      dark,
    });
    // Coworker NPCs stay robots; other players have their own named Noobius.
    function makeRobot(kind: string, color: T.Material) {
      const root = new T.Group(),
        body = new T.Group(),
        arm = new T.Group();
      root.add(body);
      if (kind === 'bit') {
        box(1.35, 0.7, 1.05, color, body, 0, 0.65, 0);
        box(1.08, 0.12, 0.85, dark, body, 0, 1.06, 0);
        for (const side of [-1, 1]) {
          const wheel = mesh(
            new T.CylinderGeometry(0.27, 0.27, 0.18, 14),
            padding,
            root,
            side * 0.66,
            0.28,
            0,
          );
          wheel.rotation.z = Math.PI / 2;
          pipe(
            new T.Vector3(side * 0.63, 0.85, 0),
            new T.Vector3(side * 0.89, 1.22, 0.25),
            0.055,
            silver,
            body,
          );
        }
        mesh(
          new T.CylinderGeometry(0.23, 0.23, 0.18, 16),
          dark,
          body,
          0,
          1.3,
          0.13,
        ).rotation.x = Math.PI / 2;
        sphere(0.13, mint, body, 0, 1.3, 0.25);
        body.add(arm);
        arm.position.set(0.3, 1.13, 0);
        box(0.35, 0.15, 0.4, amber, arm);
      } else if (kind === 'margo') {
        mesh(
          new T.CylinderGeometry(0.34, 0.48, 0.22, 12),
          steel,
          root,
          0,
          0.13,
          0,
        );
        pipe(
          new T.Vector3(0, 0.25, 0),
          new T.Vector3(0, 1, 0),
          0.1,
          silver,
          body,
        );
        box(0.57, 0.88, 0.42, steel, body, 0, 1.03, 0);
        box(0.98, 0.64, 0.56, white, body, 0, 1.84, 0);
        box(0.82, 0.32, 0.05, padding, body, 0, 1.84, 0.3);
        for (const side of [-1, 1])
          box(0.17, 0.07, 0.04, amber, body, side * 0.2, 1.88, 0.34);
        pipe(
          new T.Vector3(0.28, 2.15, 0),
          new T.Vector3(0.28, 2.45, 0),
          0.025,
          silver,
          body,
        );
        sphere(0.075, amber, body, 0.28, 2.47, 0);
        body.add(arm);
        arm.position.set(0.4, 1.3, 0.04);
        pipe(
          new T.Vector3(),
          new T.Vector3(0.1, -0.35, 0.4),
          0.055,
          white,
          arm,
        );
        const pad = box(0.52, 0.1, 0.48, color, arm, 0.03, -0.2, 0.48);
        pad.rotation.x = 0.3;
      } else if (kind === 'outfitter') {
        for (const side of [-1, 1]) {
          box(0.16, 0.6, 0.18, silver, root, side * 0.2, 0.45, 0);
          box(0.33, 0.16, 0.42, padding, root, side * 0.2, 0.14, 0.05);
        }
        box(0.62, 0.87, 0.44, color, body, 0, 1.18, 0);
        box(0.47, 0.59, 0.05, white, body, 0, 1.04, 0.26);
        mesh(
          new T.ConeGeometry(0.48, 0.65, 3),
          color,
          body,
          0,
          1.97,
          0,
        ).rotation.y = Math.PI / 3;
        box(0.4, 0.09, 0.07, padding, body, 0, 1.93, 0.24);
        body.add(arm);
        arm.position.set(-0.42, 1.49, 0);
        pipe(
          new T.Vector3(),
          new T.Vector3(-0.12, -0.55, 0.17),
          0.06,
          silver,
          arm,
        );
        mesh(
          new T.TorusGeometry(0.11, 0.035, 6, 12, Math.PI * 1.4),
          amber,
          arm,
          -0.12,
          -0.58,
          0.17,
        );
      } else {
        box(0.7, 0.5, 0.62, color, body, 0, 0.82, 0);
        box(0.6, 0.19, 0.05, padding, body, 0, 0.9, 0.34);
        box(0.3, 0.05, 0.04, mint, body, 0, 0.91, 0.38);
        for (const side of [-1, 1])
          mesh(
            new T.CylinderGeometry(0.14, 0.22, 0.18, 8),
            steel,
            body,
            side * 0.45,
            0.57,
            0,
          );
        body.add(arm);
      }
      return { root, body, arm };
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
        const robot = makeRobot(obj.id, obj.id === 'bit' ? amber : accent);
        g.add(robot.root);
        robot.root.rotation.y = 0.35;
        bots.push({
          body: robot.body,
          arm: robot.arm,
          phase: bots.length * 2.1,
          id: obj.id,
        });
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
        const rotor = new T.Group();
        rotor.position.set(0, 2.2, 0.77);
        g.add(rotor);
        mesh(new T.TorusGeometry(0.2, 0.025, 6, 18), silver, rotor);
        for (let blade = 0; blade < 3; blade++) {
          const b = box(0.28, 0.055, 0.035, silver, rotor);
          b.rotation.z = (blade * Math.PI) / 3;
        }
        rotor.userData.rack = obj.id;
        fans.push(rotor);
      }
      if (obj.kind === 'node') {
        const contents = new T.Group();
        g.add(contents);
        g.userData.contents = contents;
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
              contents,
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
        live.current.sharedCampus
          ? (EMERGENCY_STATIONS.find((s) => s.object === obj.id)?.name ??
              obj.name)
          : obj.kind === 'node'
            ? '↓ ' + (obj.item ? ITEMS[obj.item].name : obj.name)
            : obj.name,
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
    const you = label(
      'YOU · ' + (live.current.playerName ?? 'NOOBIUS'),
      '#bdec99',
      2.6,
    );
    const wear = addAccessories(avatar.body);
    you.position.set(0, 2.6, 0);
    avatar.g.add(you);
    const playerRing = mesh(
      new T.RingGeometry(0.68, 0.74, 40),
      mint,
      avatar.g,
      0,
      0.04,
      0,
    );
    playerRing.rotation.x = -Math.PI / 2;
    playerRing.castShadow = false;
    const marker = new T.Group();
    scene.add(marker);
    const markerRing = mesh(
      new T.RingGeometry(0.95, 1.05, 40),
      amber,
      marker,
      0,
      0.075,
      0,
    );
    markerRing.rotation.x = -Math.PI / 2;
    markerRing.castShadow = false;
    const markerArrow = mesh(
      new T.ConeGeometry(0.2, 0.38, 4),
      amber,
      marker,
      0,
      3.2,
      0,
    );
    markerArrow.rotation.z = Math.PI;
    const routeDots = Array.from({ length: 16 }, () => {
      const dot = mesh(new T.CircleGeometry(0.09, 8), mint, scene);
      dot.rotation.x = -Math.PI / 2;
      dot.visible = false;
      dot.castShadow = false;
      return dot;
    });
    const sparks = Array.from({ length: 12 }, (_, i) => {
      const spark = sphere(0.055, i % 2 ? mint : amber, scene);
      spark.visible = false;
      spark.castShadow = false;
      return spark;
    });
    const machineObjects = OBJECTS.filter((o) => o.kind === 'build');
    const coinTexture = new T.TextureLoader().load(
      '/assets/compute-currency.png',
    );
    coinTexture.colorSpace = T.SRGBColorSpace;
    textures.push(coinTexture);
    const rewardCoins = Array.from({ length: 7 }, () => {
      const material = new T.SpriteMaterial({
        map: coinTexture,
        transparent: true,
        depthWrite: false,
      });
      materials.push(material);
      const coin = new T.Sprite(material);
      coin.visible = false;
      scene.add(coin);
      return coin;
    });
    const workTool = new T.Group();
    avatar.body.add(workTool);
    workTool.position.set(0.63, 0.6, 0.25);
    workTool.visible = false;
    box(0.065, 0.45, 0.08, silver, workTool);
    mesh(
      new T.TorusGeometry(0.1, 0.035, 6, 12, Math.PI * 1.5),
      amber,
      workTool,
      0,
      0.27,
      0,
    );
    let seenWork = 0,
      workStarted = 0,
      workObject = '',
      gait = 0;
    const fabricator = new T.Group();
    fabricator.position.set(19, 1.8, 9);
    scene.add(fabricator);
    box(0.12, 0.28, 0.4, mint, fabricator);
    const peers = new Map<string, T.Group>();
    const clear = (x: number, z: number) => {
      if (live.current.sharedCampus && (Math.abs(x) > 8 || z < 4 || z > 20))
        return false;
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
      const dest = options
        .filter(([x, z]) => clear(x, z))
        .sort(
          (a, b) =>
            Math.hypot(a[0] - avatar.g.position.x, a[1] - avatar.g.position.z) -
            Math.hypot(b[0] - avatar.g.position.x, b[1] - avatar.g.position.z),
        )[0];
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
      if (!id) {
        target = null;
        waypoints = [];
        targetObject = null;
        return;
      }
      const obj = OBJECTS.find((o) => o.id === id);
      if (obj && live.current.facility.unlocked.includes(obj.zone)) {
        walkObject(obj);
      }
    };
    travel.current(live.current.facility.zone);
    const click = (e: PointerEvent) => {
      if (live.current.paused) return;
      live.current.onCancelGuide();
      canvas.focus({ preventScroll: true });
      const r = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(clickable, false).find((h) => {
        let ancestor: T.Object3D | null = h.object;
        while (ancestor) {
          if (!ancestor.visible) return false;
          ancestor = ancestor.parent;
        }
        return true;
      });
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
        ].includes(k)
      ) {
        live.current.onCancelGuide();
        target = null;
        waypoints = [];
        targetObject = null;
      }
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
              (live.current.facility.unlocked.includes(o.zone) ||
                o.kind === 'gate') &&
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
      live.current.onUnavailable();
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    function frame(time: number) {
      if (disposed) return;
      if (document.hidden) {
        last = time;
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min((time - last) / 1000 || 0, 0.05);
      last = time;
      const p = live.current,
        f = p.facility;
      const beforeX = avatar.g.position.x,
        beforeZ = avatar.g.position.z;
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
      gait +=
        Math.hypot(
          avatar.g.position.x - beforeX,
          avatar.g.position.z - beforeZ,
        ) * 3.4;
      if (p.workEvent && p.workEvent.revision !== seenWork) {
        seenWork = p.workEvent.revision;
        workStarted = time;
        workObject = p.workEvent.id;
        const obj = OBJECTS.find((o) => o.id === workObject);
        if (
          obj &&
          Math.hypot(obj.x - avatar.g.position.x, obj.z - avatar.g.position.z) <
            4
        )
          avatar.g.rotation.y = Math.atan2(
            obj.x - avatar.g.position.x,
            obj.z - avatar.g.position.z,
          );
      }
      const working = time - workStarted < 1100 && seenWork > 0;
      workTool.visible =
        working &&
        !moving &&
        ['gather', 'craft', 'collect', 'build', 'utility'].includes(
          p.workEvent?.kind ?? '',
        );
      avatar.body.position.y = moving
        ? Math.abs(Math.sin(gait)) * 0.09
        : Math.sin(time * 0.0018) * 0.018;
      for (const [i, arm] of (avatar.g.userData.arms as T.Object3D[]).entries())
        arm.rotation.x = moving
          ? Math.sin(gait + i * Math.PI) * 0.42
          : workTool.visible && !motion.matches
            ? -0.55 + Math.sin(time * 0.02) * 0.2
            : motion.matches
              ? 0
              : Math.sin(time * 0.0018 + i) * 0.035;
      for (const [i, foot] of (
        avatar.g.userData.feet as T.Object3D[]
      ).entries()) {
        foot.position.z = moving ? Math.sin(gait + i * Math.PI) * 0.16 : 0;
        foot.position.y =
          0.12 +
          (moving ? Math.max(0, Math.sin(gait + i * Math.PI)) * 0.12 : 0);
      }
      you.visible = targetScale < 9;
      for (const title of roomTitles) title.visible = targetScale > 11;
      marker.visible = !!p.objectiveId && !p.paused;
      const objectiveObject = OBJECTS.find((o) => o.id === p.objectiveId);
      if (objectiveObject) {
        marker.position.set(objectiveObject.x, 0, objectiveObject.z);
        markerArrow.position.y =
          3.25 + (motion.matches ? 0 : Math.sin(time * 0.003) * 0.15);
      }
      const activeRoute = target ? [target, ...waypoints] : [];
      const route = [avatar.g.position, ...activeRoute];
      let segment = 1,
        remaining = 0.7;
      routeDots.forEach((dot) => {
        dot.visible = false;
        if (p.paused) return;
        while (segment < route.length) {
          const length = route[segment].distanceTo(route[segment - 1]);
          if (remaining <= length) {
            dot.position.lerpVectors(
              route[segment - 1],
              route[segment],
              remaining / Math.max(length, 0.001),
            );
            dot.position.y = 0.1;
            dot.visible = true;
            remaining += 0.7;
            break;
          }
          remaining -= length;
          segment++;
        }
      });
      const workAt = OBJECTS.find((o) => o.id === workObject);
      const collecting = [
        'compute-harvest',
        'compute-collect',
        'outage-fix',
        'tycoon-daily',
      ].includes(p.workEvent?.kind ?? '');
      rewardCoins.forEach((coin, i) => {
        const age = (time - workStarted - i * 55) / 1450;
        coin.visible =
          collecting && !!workAt && age >= 0 && age < 1 && !motion.matches;
        if (coin.visible && workAt) {
          const angle = (i * Math.PI * 2) / 7;
          coin.position.set(
            workAt.x + Math.cos(angle) * age * 1.6,
            1.5 + age * 3.4,
            workAt.z + Math.sin(angle) * age * 1.6,
          );
          coin.scale.setScalar(0.52 + Math.sin(age * Math.PI) * 0.15);
          coin.material.opacity = Math.min(1, (1 - age) * 3);
        }
      });
      for (const object of machineObjects) {
        const g = objects.get(object.id);
        if (g) {
          const age = (time - workStarted) / 850;
          const pop =
            object.id === workObject &&
            p.workEvent?.kind === 'build' &&
            age >= 0 &&
            age < 1 &&
            !motion.matches
              ? Math.sin(age * Math.PI) * 0.12
              : 0;
          g.scale.set(1 + pop * 0.3, 1 + pop, 1 + pop * 0.3);
        }
      }
      sparks.forEach((spark, i) => {
        spark.visible = working && !!workAt && !motion.matches;
        if (workAt) {
          const age = (time - workStarted) / 1100,
            angle = (i * Math.PI * 2) / 12;
          spark.position.set(
            workAt.x + Math.cos(angle) * age,
            0.7 + Math.sin(age * Math.PI) * 1.4,
            workAt.z + Math.sin(angle) * age,
          );
          spark.scale.setScalar(Math.max(0.1, 1 - age));
        }
      });
      if (!motion.matches)
        for (const fan of fans)
          fan.rotation.z +=
            dt * ((f.builds[fan.userData.rack] ?? 0) > 0 ? 5 : 0.5);
      for (const bot of bots) {
        bot.body.position.y = motion.matches
          ? 0
          : Math.sin(time * 0.0016 + bot.phase) * 0.025;
        bot.arm.rotation.x = motion.matches
          ? 0
          : Math.sin(time * 0.002 + bot.phase) * 0.16;
      }
      fabricator.position.x =
        19 + (f.craft && !motion.matches ? Math.sin(time * 0.005) * 0.6 : 0);
      fabricator.visible = !!f.craft;
      if (time - lastPosition > 600) {
        p.onPosition(avatar.g.position.x, avatar.g.position.z);
        lastPosition = time;
      }
      const appearance = JSON.stringify([
        f.builds,
        f.unlocked,
        f.outfit,
        f.accessory,
        p.playerName,
        f.cooldowns,
        activeIncident(f)?.rack,
      ]);
      if (appearance !== lastAppearance) {
        const nameCanvas = you.material.map!.image as HTMLCanvasElement;
        const nameContext = nameCanvas.getContext('2d')!;
        nameContext.clearRect(8, 8, 496, 84);
        nameContext.fillStyle = '#10232bdd';
        nameContext.fillRect(8, 8, 496, 84);
        nameContext.font = '500 32px sans-serif';
        nameContext.textAlign = 'center';
        nameContext.textBaseline = 'middle';
        nameContext.fillStyle = '#e6efe6';
        nameContext.fillText(
          'YOU · ' + (p.playerName ?? 'NOOBIUS'),
          256,
          51,
          480,
        );
        you.material.map!.needsUpdate = true;
        wear(f.accessory ?? 'none');
        shirt.color.set(
          OUTFITS.find((x) => x.id === f.outfit)?.color ?? '#d1d8c8',
        );
        for (const obj of OBJECTS) {
          const g = objects.get(obj.id)!,
            isOpen = f.unlocked.includes(obj.zone);
          g.visible =
            live.current.sharedCampus && obj.zone !== 'commons'
              ? false
              : obj.kind === 'gate'
                ? !isOpen
                : isOpen;
          if (obj.kind === 'build')
            g.traverse((child) => {
              if (child.userData.led)
                (child as T.Mesh).material =
                  activeIncident(f)?.rack === obj.id
                    ? faultRed
                    : (f.builds[obj.id] ?? 0) > 0
                      ? mint
                      : steel;
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
        l.visible =
          objects.get(obj.id)!.visible &&
          (obj.id === p.objectiveId ||
            (Math.hypot(
              obj.x - avatar.g.position.x,
              obj.z - avatar.g.position.z,
            ) < 5 &&
              targetScale < 15) ||
            (obj.kind === 'npc' &&
              Math.hypot(
                obj.x - avatar.g.position.x,
                obj.z - avatar.g.position.z,
              ) < 4 &&
              targetScale < 11));
        const contents = objects.get(obj.id)!.userData.contents as
          | T.Group
          | undefined;
        if (contents)
          contents.scale.setScalar(
            (f.cooldowns[obj.id] ?? 0) > Date.now() ? 0.12 : 1,
          );
      }
      for (const person of p.people) {
        let g = peers.get(person.id);
        if (!g) {
          const startG = geometry.length,
            startM = materials.length,
            startT = textures.length;
          const peerColor = mat(
            OUTFITS.find((o) => o.id === person.outfit)?.color ?? '#d1d8c8',
            0.05,
          );
          const peer = makeAvatar(peerColor);
          g = peer.g;
          g.userData.shirt = peerColor;
          g.userData.wear = addAccessories(peer.body);
          g.position.set(person.x, 0, person.z);
          const name = label(person.name, '#9bdde0', 2.5);
          name.position.y = 2.3;
          g.add(name);
          scene.add(g);
          g.userData.name = person.name;
          peers.set(person.id, g);
          g.userData.resources = {
            geometry: geometry.slice(startG),
            materials: materials.slice(startM),
            textures: textures.slice(startT),
          };
        }
        (g.userData.shirt as T.MeshStandardMaterial).color.set(
          OUTFITS.find((o) => o.id === person.outfit)?.color ?? '#d1d8c8',
        );
        g.userData.wear(person.accessory ?? 'none');
        const distance = Math.hypot(
          person.x - g.position.x,
          person.z - g.position.z,
        );
        if (distance > 0.08)
          g.rotation.y = Math.atan2(
            person.x - g.position.x,
            person.z - g.position.z,
          );
        (g.userData.arms as T.Object3D[]).forEach(
          (arm, i) =>
            (arm.rotation.x =
              distance > 0.08 ? Math.sin(time * 0.009 + i * Math.PI) * 0.3 : 0),
        );
        (g.userData.feet as T.Object3D[]).forEach(
          (foot, i) =>
            (foot.rotation.x =
              distance > 0.08 ? Math.sin(time * 0.009 + i * Math.PI) * 0.2 : 0),
        );
        g.position.lerp(
          new T.Vector3(person.x, 0, person.z),
          Math.min(1, dt * 5),
        );
        g.position.y = Math.sin(time * 0.002 + person.x) * 0.055;
      }
      for (const [id, g] of peers)
        if (!p.people.some((p) => p.id === id && p.name === g.userData.name)) {
          scene.remove(g);
          const resources = g.userData.resources;
          for (const [key, registry] of [
            ['geometry', geometry],
            ['materials', materials],
            ['textures', textures],
          ] as const) {
            for (const resource of resources[key]) {
              resource.dispose();
              const i = (registry as unknown[]).indexOf(resource);
              if (i >= 0) registry.splice(i, 1);
            }
          }
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
      if (!document.hidden) renderer.render(scene, camera);
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
