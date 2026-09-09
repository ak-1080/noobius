import * as T from 'three';

type Mesh = (
  geometry: T.BufferGeometry,
  material: T.Material,
  parent: T.Object3D,
  x?: number,
  y?: number,
  z?: number,
) => T.Mesh;
type Box = (
  w: number,
  h: number,
  d: number,
  material: T.Material,
  parent: T.Object3D,
  x?: number,
  y?: number,
  z?: number,
) => T.Mesh;

// All tiers are created once. Upgrades reveal hardware inside the same walking
// footprint; the outer scene group remains free to play a purchase animation.
export function makeMachine({
  parent,
  mesh,
  box,
  dark,
  steel,
  silver,
  accent,
  powered,
  sleepy,
}: {
  parent: T.Group;
  mesh: Mesh;
  box: Box;
  dark: T.Material;
  steel: T.Material;
  silver: T.Material;
  accent: T.Material;
  powered: T.Material;
  sleepy: T.Material;
}) {
  const empty = new T.Group(),
    hardware = new T.Group(),
    roof = new T.Group();
  parent.add(empty, hardware);
  hardware.add(roof);
  const tiers: T.Group[] = [],
    lamps: T.Mesh[] = [],
    fans: T.Group[] = [];
  box(2, 0.12, 1.7, dark, parent, 0, 0.08, 0);
  const ring = mesh(
    new T.RingGeometry(0.64, 0.73, 32),
    accent,
    empty,
    0,
    0.151,
    0,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;
  box(0.66, 0.06, 0.17, accent, empty, 0, 0.17, 0).castShadow = false;
  box(0.17, 0.06, 0.66, accent, empty, 0, 0.17, 0).castShadow = false;
  for (const x of [-0.84, 0.84])
    for (const z of [-0.68, 0.68])
      box(0.13, 0.13, 0.13, accent, empty, x, 0.17, z).castShadow = false;

  for (let i = 0; i < 3; i++) {
    const tier = new T.Group();
    hardware.add(tier);
    tier.position.y = 0.16 + i * 0.75;
    tiers.push(tier);
    box(1.5, 0.72, 1.25, dark, tier, 0, 0.36, 0);
    box(1.54, 0.055, 1.28, steel, tier, 0, 0.045, 0);
    for (const side of [-1, 1])
      box(0.045, 0.57, 0.04, accent, tier, side * 0.69, 0.37, 0.65).castShadow =
        false;
    for (const y of [0.22, 0.51]) {
      box(0.87, 0.23, 0.055, steel, tier, -0.18, y, 0.65);
      box(0.5, 0.055, 0.018, dark, tier, -0.27, y, 0.683).castShadow = false;
      const lamp = box(0.075, 0.06, 0.035, powered, tier, 0.1, y, 0.7);
      lamp.castShadow = false;
      lamps.push(lamp);
    }
    const fan = new T.Group();
    fan.position.set(0.44, 0.37, 0.675);
    tier.add(fan);
    const rim = mesh(new T.TorusGeometry(0.15, 0.018, 6, 16), silver, fan);
    rim.castShadow = false;
    for (let blade = 0; blade < 3; blade++) {
      const part = box(0.23, 0.037, 0.025, silver, fan);
      part.rotation.z = (blade * Math.PI) / 3;
      part.castShadow = false;
    }
    fans.push(fan);
  }
  box(1.62, 0.14, 1.35, steel, roof, 0, 0.02, 0);
  box(1.3, 0.04, 0.055, accent, roof, 0, 0.11, 0.55).castShadow = false;
  const crown = new T.Group();
  roof.add(crown);
  for (const x of [-0.42, 0.42]) {
    mesh(new T.CylinderGeometry(0.18, 0.2, 0.25, 12), dark, crown, x, 0.22, 0);
    mesh(
      new T.CylinderGeometry(0.15, 0.15, 0.045, 12),
      accent,
      crown,
      x,
      0.365,
      0,
    ).castShadow = false;
  }
  const gauge = new T.Group();
  roof.add(gauge);
  gauge.position.set(0, 0.36, 0.74);
  const track = box(1.4, 0.085, 0.045, dark, gauge);
  const fill = box(1.34, 0.055, 0.065, sleepy, gauge);
  track.castShadow = false;
  fill.castShadow = false;
  gauge.visible = false;
  let work: 'waiting' | 'running' | 'ready' | null = null,
    needsAttention = false;
  const paint = () =>
    lamps.forEach((lamp) => {
      lamp.material = work === 'running' || needsAttention ? sleepy : powered;
    });
  let level = 0;
  return {
    update(nextLevel: number, needsBonus: boolean) {
      level = Math.max(0, Math.min(3, nextLevel));
      empty.visible = level === 0;
      hardware.visible = level > 0;
      tiers.forEach((tier, i) => {
        tier.visible = i < level;
      });
      roof.position.y = 0.16 + level * 0.75;
      crown.visible = level === 3;
      needsAttention = needsBonus;
      paint();
      return level ? roof.position.y + (level === 3 ? 0.95 : 0.65) : 0.95;
    },
    setWork(
      phase: 'waiting' | 'running' | 'ready' | null,
      value: number | null,
    ) {
      work = phase;
      paint();
      gauge.visible = level > 0 && value !== null && phase !== null;
      const fraction = Math.min(1, Math.max(0, value ?? 0));
      fill.scale.x = Math.max(0.001, fraction);
      fill.position.x = -0.67 + 0.67 * fraction;
      fill.material = phase === 'ready' ? powered : sleepy;
    },
    animate(dt: number, boost: number) {
      for (let i = 0; i < level; i++)
        fans[i].rotation.z += dt * Math.min(7, 2.5 + boost * 0.85);
    },
  };
}
