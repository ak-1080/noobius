import * as T from 'three';
import { realmWorld, realmLandmarks } from '@/lib/realm-worlds';
import { realmFor, type RealmId } from '@/lib/realm-catalog';

// These are visual-only layers. Walkable floors, worksite coordinates and the
// collision footprints are defined in realm-worlds.ts and remain unchanged.
export function buildRealmWorld(
  realm: RealmId,
  scene: T.Scene,
  kit: {
    box: (
      w: number,
      h: number,
      d: number,
      m: T.Material,
      p: T.Object3D,
      x?: number,
      y?: number,
      z?: number,
    ) => T.Mesh;
    mesh: (
      g: T.BufferGeometry,
      m: T.Material,
      p: T.Object3D,
      x?: number,
      y?: number,
      z?: number,
    ) => T.Mesh;
    mat: (
      color: string,
      metal?: number,
      emissive?: string,
    ) => T.MeshStandardMaterial;
    label: (text: string, color: string, width?: number) => T.Sprite;
  },
) {
  const { box, mesh, mat, label } = kit;
  const map = realmWorld(realm);
  const color = realmFor(realm).color;
  const floor = mat(
    {
      commons: '#394753',
      thermal: '#143c49',
      gpu: '#1d2746',
      core: '#292532',
    }[realm],
  );
  const underfloor = mat('#08141d');
  const steel = mat('#526977', 0.45);
  const shadow = mat('#10212b');
  const accent = mat(color, 0.35, color);
  const mutedAccent = mat(
    {
      commons: '#98765f',
      thermal: '#306773',
      gpu: '#394771',
      core: '#67585a',
    }[realm],
  );
  const warning = mat('#e9a160', 0.15, '#9c4f27');
  // The shared material factory makes emissive surfaces suitable for tiny
  // status lamps; large inlays need a gentler glow to preserve floor contrast.
  accent.emissiveIntensity = 0.45;
  warning.emissiveIntensity = 0.35;
  const movers: T.Object3D[] = [];
  const ring = (
    radius: number,
    tube: number,
    material: T.Material,
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
  ) => {
    const torus = mesh(
      new T.TorusGeometry(radius, tube, 6, 32),
      material,
      parent,
      x,
      y,
      z,
    );
    torus.rotation.x = -Math.PI / 2;
    return torus;
  };
  const cylinder = (
    radius: number,
    height: number,
    material: T.Material,
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    sides = 12,
  ) =>
    mesh(
      new T.CylinderGeometry(radius, radius, height, sides),
      material,
      parent,
      x,
      y,
      z,
    );

  // Draw the realm's real path manifest. Its dimensions are the same on the
  // client and movement authority; the shallow markings below never block it.
  for (const [index, r] of map.floors.slice(1).entries()) {
    box(r.w, 0.42, r.d, underfloor, scene, r.x, -0.22, r.z);
    box(r.w - 0.12, 0.06, r.d - 0.12, floor, scene, r.x, 0.03, r.z);
    const corridor = r.w <= 5 || r.d <= 5;
    if (realm === 'commons') {
      // Reclaimed loading roads: dashed lane marks and mismatched steel plates.
      if (corridor) {
        const horizontal = r.d <= 5;
        const length = horizontal ? r.w : r.d;
        for (let n = -length / 2 + 2; n < length / 2 - 1; n += 3.4)
          box(
            horizontal ? 1.3 : 0.08,
            0.025,
            horizontal ? 0.08 : 1.3,
            warning,
            scene,
            r.x + (horizontal ? n : 0),
            0.075,
            r.z + (horizontal ? 0 : n),
          );
      } else {
        for (let n = -Math.floor(r.w / 6) * 3; n < r.w / 2 - 1; n += 6)
          box(0.065, 0.018, r.d - 0.7, mutedAccent, scene, r.x + n, 0.073, r.z);
        if (index % 2 === 0)
          for (let n = -1; n <= 1; n++)
            box(
              0.7,
              0.025,
              0.12,
              warning,
              scene,
              r.x + n * 1.2,
              0.078,
              r.z + r.d / 2 - 0.5,
            );
      }
    } else if (realm === 'thermal') {
      // The ring reads as a pair of visible coolant lines, even from far away.
      if (corridor) {
        const horizontal = r.d <= 5;
        for (const side of [-1, 1])
          box(
            horizontal ? r.w - 0.6 : 0.09,
            0.025,
            horizontal ? 0.09 : r.d - 0.6,
            side < 0 ? accent : mutedAccent,
            scene,
            r.x + (horizontal ? 0 : side * (r.w / 2 - 0.65)),
            0.083,
            r.z + (horizontal ? side * (r.d / 2 - 0.65) : 0),
          );
      } else {
        for (let n = -r.d / 2 + 1.8; n < r.d / 2 - 1; n += 2.8)
          box(r.w - 1, 0.018, 0.065, mutedAccent, scene, r.x, 0.077, r.z + n);
      }
    } else if (realm === 'gpu') {
      // Parallel accelerator lanes and transverse power/data buses.
      if (r.d > r.w * 1.6) {
        for (const side of [-1, 1])
          box(
            0.1,
            0.025,
            r.d - 0.7,
            accent,
            scene,
            r.x + side * (r.w / 2 - 0.8),
            0.08,
            r.z,
          );
        for (let n = -r.d / 2 + 2.5; n < r.d / 2 - 1; n += 5)
          box(r.w - 2, 0.025, 0.14, mutedAccent, scene, r.x, 0.085, r.z + n);
      } else {
        for (const side of [-1, 1])
          box(
            r.w - 0.8,
            0.025,
            0.08,
            mutedAccent,
            scene,
            r.x,
            0.082,
            r.z + side * Math.max(0.5, r.d / 2 - 0.65),
          );
      }
    } else {
      // Broken archive islands have bright bridge seams, not a continuous road.
      for (const side of [-1, 1]) {
        const horizontal = r.d <= 5;
        box(
          horizontal ? r.w - 0.65 : 0.07,
          0.025,
          horizontal ? 0.07 : r.d - 0.65,
          mutedAccent,
          scene,
          r.x + (horizontal ? 0 : side * (r.w / 2 - 0.5)),
          0.085,
          r.z + (horizontal ? side * (r.d / 2 - 0.5) : 0),
        );
      }
      if (!corridor)
        for (let n = -r.w / 2 + 2; n < r.w / 2 - 1; n += 3)
          box(0.055, 0.025, r.d - 1.5, accent, scene, r.x + n, 0.078, r.z);
    }
  }

  // Inaccessible negative space also describes the district: a cooling
  // reservoir, cable trenches, and isolated archive wells. These surfaces sit
  // below the actual floor and do not imply a new traversable route.
  if (realm === 'thermal') {
    const water = mat('#124550', 0.2, '#16444b');
    water.emissiveIntensity = 0.25;
    box(29, 0.025, 18.5, water, scene, 0, -0.09, -19);
    for (const x of [-9, 0, 9]) {
      ring(2.25, 0.07, mutedAccent, scene, x, -0.055, -19);
      cylinder(0.45, 0.1, accent, scene, x, -0.035, -19, 8);
    }
  } else if (realm === 'gpu') {
    const trench = mat('#111d38');
    for (const side of [-1, 1]) {
      box(5.7, 0.025, 28, trench, scene, side * 9, -0.09, -17);
      for (let z = -28; z < -3; z += 5)
        box(4.9, 0.025, 0.08, accent, scene, side * 9, -0.055, z);
    }
  } else if (realm === 'core') {
    const well = mat('#211e2b');
    for (const side of [-1, 1]) {
      box(11, 0.025, 10, well, scene, side * 14, -0.09, -23);
      ring(2.1, 0.055, mutedAccent, scene, side * 14, -0.05, -23);
    }
  } else {
    const gravel = mat('#1e3039');
    for (const [x, z] of [
      [-11, -27],
      [11, -18],
      [31, -13],
    ]) {
      box(5, 0.025, 3.2, gravel, scene, x, -0.09, z);
      for (const offset of [-1, 0, 1])
        box(
          0.5,
          0.08,
          0.45,
          mutedAccent,
          scene,
          x + offset * 1.3,
          -0.015,
          z + offset * 0.4,
        );
    }
  }

  // Campus owns the walkable arrival slab. A thin color skin and emblem make
  // its otherwise identical footprint belong to the destination visually.
  box(17.8, 0.025, 15.8, floor, scene, 0, 0.082, 12);
  const arrival = new T.Group();
  arrival.position.set(0, 0.13, 14.5);
  scene.add(arrival);
  if (realm === 'commons') {
    for (const side of [-1, 1])
      for (let n = 0; n < 3; n++)
        box(0.55, 0.025, 0.12, warning, arrival, side * (2.5 + n * 0.65), 0, 0);
    box(3.5, 0.025, 0.14, warning, arrival);
  } else if (realm === 'thermal') {
    ring(2.35, 0.065, accent, arrival, 0, 0, 0);
    ring(1.6, 0.055, mutedAccent, arrival, 0, 0, 0);
    box(0.12, 0.025, 5, accent, arrival);
  } else if (realm === 'gpu') {
    for (let lane = -1; lane <= 1; lane++) {
      box(0.15, 0.025, 5.2, accent, arrival, lane * 2, 0, 0);
      box(1.2, 0.025, 0.12, mutedAccent, arrival, lane * 2, 0, -2.25);
    }
  } else {
    ring(2.2, 0.07, accent, arrival, 0, 0, 0);
    const diamond = box(2.3, 0.025, 2.3, mutedAccent, arrival);
    diamond.rotation.y = Math.PI / 4;
    box(0.1, 0.025, 5.2, accent, arrival);
  }
  // Perimeter architecture sits beyond the arrival floor. This creates a
  // different skyline at spawn without inventing an unregistered obstacle.
  const gate = new T.Group();
  gate.position.set(0, 0, 12);
  scene.add(gate);
  if (realm === 'commons') {
    for (const side of [-1, 1]) {
      box(1.7, 5.1, 2.5, steel, gate, side * 10.1, 2.55, 0);
      box(1.8, 0.22, 2.65, warning, gate, side * 10.1, 5.2, 0);
    }
    box(21, 0.28, 0.35, warning, gate, 0, 6.2, 0);
    box(0.06, 1.2, 0.06, steel, gate, 5.8, 5.45, 0);
    box(1.2, 0.5, 0.9, mutedAccent, gate, 5.8, 4.6, 0);
  } else if (realm === 'thermal') {
    for (const side of [-1, 1]) {
      cylinder(1.55, 6.5, steel, gate, side * 10.5, 3.25, 0, 16);
      ring(1.6, 0.13, accent, gate, side * 10.5, 6.5, 0);
      cylinder(0.85, 1.6, mutedAccent, gate, side * 10.5, 7.2, 0, 16);
    }
    box(20.9, 0.28, 0.28, accent, gate, 0, 6.35, 0);
  } else if (realm === 'gpu') {
    for (const side of [-1, 1]) {
      box(1.3, 8.2, 2.5, shadow, gate, side * 10.3, 4.1, 0);
      for (let n = 0; n < 6; n++)
        box(0.11, 0.22, 1.7, accent, gate, side * 10.3, 1.4 + n * 1.1, 1.3);
    }
    box(21.2, 0.22, 0.5, steel, gate, 0, 8.2, 0);
    for (let lane = -1; lane <= 1; lane++)
      box(0.4, 0.07, 0.55, accent, gate, lane * 2, 8.05, 0.28);
  } else {
    // The archive's rear spire is beyond z=20, where the arrival floor ends.
    const spire = new T.Group();
    spire.position.set(0, 0, 22.5);
    scene.add(spire);
    cylinder(2.4, 2.3, shadow, spire, 0, 1.15, 0, 8);
    box(1.7, 7.2, 1.7, steel, spire, 0, 5.9, 0).rotation.y = Math.PI / 4;
    const orbit = new T.Group();
    orbit.position.y = 9.4;
    spire.add(orbit);
    mesh(new T.OctahedronGeometry(1.1), accent, orbit);
    for (let n = 0; n < 2; n++) {
      const halo = mesh(
        new T.TorusGeometry(2.1 + n * 0.45, 0.07, 6, 36),
        mutedAccent,
        orbit,
      );
      halo.rotation.x = 0.55 + n * 0.45;
    }
    movers.push(orbit);
  }

  for (const site of map.sites) {
    const name = label(site.name.toUpperCase(), color, 6);
    name.position.set(site.x, 4.3, site.z - 4);
    scene.add(name);
    if (realm === 'commons') {
      // Rectangular cargo bay and striped approach instead of a generic ring.
      box(4.5, 0.035, 3.6, mutedAccent, scene, site.x, 0.1, site.z);
      for (const side of [-1, 1])
        box(
          0.2,
          0.045,
          3.4,
          warning,
          scene,
          site.x + side * 2.15,
          0.13,
          site.z,
        );
    } else if (realm === 'thermal') {
      ring(2.35, 0.095, accent, scene, site.x, 0.12, site.z);
      ring(1.75, 0.06, mutedAccent, scene, site.x, 0.12, site.z);
    } else if (realm === 'gpu') {
      box(5, 0.035, 3.2, mutedAccent, scene, site.x, 0.105, site.z);
      for (const offset of [-1.6, 0, 1.6])
        box(0.11, 0.025, 2.8, accent, scene, site.x + offset, 0.13, site.z);
    } else {
      ring(2.3, 0.075, accent, scene, site.x, 0.12, site.z);
      for (const side of [-1, 1])
        box(
          3.2,
          0.025,
          0.065,
          mutedAccent,
          scene,
          site.x,
          0.13,
          site.z + side * 1.75,
        );
    }

    const landmark = realmLandmarks(realm)[site.index];
    const p = new T.Group();
    p.position.set(landmark.x, 0, landmark.z);
    scene.add(p);
    box(landmark.w + 0.5, 0.45, landmark.d + 0.5, underfloor, p, 0, -0.2, 0);
    // All raised architecture is within this landmark's existing collision
    // deck; no new barriers appear on walkable paths or beside terminals.
    if (realm === 'commons') {
      if (site.index === 0) {
        // Container wharf and tall loading crane.
        for (let n = -1; n <= 1; n++) {
          box(
            3.5,
            2.2 + (n === 0 ? 1.3 : 0),
            2.2,
            n === 0 ? warning : steel,
            p,
            n * 4.4,
            1.1 + (n === 0 ? 0.65 : 0),
            0,
          );
          for (const stripe of [-0.7, 0, 0.7])
            box(0.05, 1.7, 0.035, shadow, p, n * 4.4 + stripe, 1.1, 1.12);
        }
        for (const side of [-1, 1])
          box(0.2, 6.8, 0.2, steel, p, side * 6, 3.4, 0);
        box(12.2, 0.23, 0.25, warning, p, 0, 6.8, 0);
        box(0.05, 2.5, 0.05, steel, p, 3.7, 5.5, 0);
        box(1.6, 0.9, 1.25, mutedAccent, p, 3.7, 3.8, 0);
      } else if (site.index === 1) {
        // Cable exchange: spools give this long yard a round silhouette.
        for (let n = -1; n <= 1; n++) {
          cylinder(1.1, 2.1, steel, p, n * 4.1, 1.2, 0, 16).rotation.z =
            Math.PI / 2;
          for (const side of [-1, 1])
            cylinder(
              1.45,
              0.18,
              warning,
              p,
              n * 4.1 + side * 1.05,
              1.2,
              0,
              16,
            ).rotation.z = Math.PI / 2;
        }
        box(13.2, 0.18, 0.18, warning, p, 0, 4.2, 0);
        for (const side of [-1, 1])
          box(0.18, 4.2, 0.18, steel, p, side * 6.5, 2.1, 0);
      } else {
        // Component sort line: separated bins under an overhead conveyor.
        for (let n = -1; n <= 1; n++) {
          box(
            3.5,
            1.4,
            2.15,
            n === 0 ? steel : mutedAccent,
            p,
            n * 4.5,
            0.7,
            0,
          );
          box(3.1, 0.08, 0.1, warning, p, n * 4.5, 1.43, 1.1);
        }
        box(13.5, 0.35, 0.8, shadow, p, 0, 3.1, 0);
        for (const side of [-1, 1])
          box(0.18, 3.1, 0.18, steel, p, side * 6.5, 1.55, 0);
      }
    } else if (realm === 'thermal') {
      if (site.index === 0) {
        // Intake towers and three animated turbine faces.
        for (let n = -1; n <= 1; n++) {
          cylinder(
            1.2,
            4 + (n === 0 ? 1.5 : 0),
            steel,
            p,
            n * 3.3,
            2 + (n === 0 ? 0.75 : 0),
            0,
            16,
          );
          ring(1.22, 0.09, accent, p, n * 3.3, 4, 0);
          const fan = new T.Group();
          fan.position.set(n * 3.3, 2.1, 1.25);
          p.add(fan);
          ring(0.75, 0.08, shadow, fan, 0, 0, 0).rotation.x = 0;
          for (let blade = 0; blade < 4; blade++)
            box(1.15, 0.12, 0.06, accent, fan).rotation.z =
              (blade * Math.PI) / 4;
          fan.userData.spinAxis = 'z';
          movers.push(fan);
        }
      } else if (site.index === 1) {
        // Exchanger bank: low horizontal heat fins and overhead coolant bridge.
        for (let n = -1; n <= 1; n++) {
          box(2.7, 3.5, 2.4, steel, p, n * 3.3, 1.75, 0);
          for (let fin = 0; fin < 5; fin++)
            box(2.9, 0.08, 2.5, mutedAccent, p, n * 3.3, 0.5 + fin * 0.6, 0);
        }
        box(10.7, 0.34, 0.34, accent, p, 0, 5.4, 0);
        for (const side of [-1, 1])
          box(0.23, 3.1, 0.23, accent, p, side * 4.8, 4, 0);
      } else {
        // Pump house: one broad turbine drum with two pressure towers.
        cylinder(1.9, 3.4, shadow, p, 0, 2.1, 0, 20);
        ring(1.95, 0.13, accent, p, 0, 3.8, 0);
        for (const side of [-1, 1]) {
          cylinder(0.85, 5.2, steel, p, side * 3.7, 2.6, 0, 14);
          ring(0.9, 0.1, accent, p, side * 3.7, 5.2, 0);
        }
      }
    } else if (realm === 'gpu') {
      if (site.index === 0) {
        // Dense inference racks with a suspended accelerator bus.
        for (let n = -2; n <= 2; n++) {
          box(1.55, 5.4, 1.85, shadow, p, n * 2, 2.7, 0);
          for (let row = 0; row < 6; row++) {
            box(1.3, 0.38, 0.08, steel, p, n * 2, 0.65 + row * 0.76, 0.97);
            box(0.62, 0.045, 0.035, accent, p, n * 2, 0.65 + row * 0.76, 1.03);
          }
        }
        box(10.2, 0.22, 0.5, accent, p, 0, 6.2, 0);
      } else if (site.index === 1) {
        // Batch foundry: three tall processor columns and a gantry bridge.
        for (let n = -1; n <= 1; n++) {
          box(2.2, 6.6, 2.3, shadow, p, n * 3.1, 3.3, 0);
          for (let y = 1; y < 6; y++)
            box(1.6, 0.1, 0.08, accent, p, n * 3.1, y, 1.2);
        }
        box(10.5, 0.3, 0.4, steel, p, 0, 7.2, 0);
      } else {
        // Chip lab: wafer chambers beneath a tall signal mast.
        for (let n = -1; n <= 1; n++) {
          cylinder(1.15, 2.3, steel, p, n * 3, 1.2, 0, 14);
          ring(1.2, 0.09, accent, p, n * 3, 2.35, 0);
        }
        box(0.24, 7.2, 0.24, accent, p, 0, 5.7, 0);
        box(5.5, 0.18, 0.25, accent, p, 0, 8.3, 0);
      }
    } else {
      // Memory islands: every vault is a different silhouette, with slow
      // orbital markers that keep moving even when the job is idle.
      if (site.index === 0) {
        for (let n = -1; n <= 1; n++) {
          cylinder(
            1.1,
            3.6 + (n === 0 ? 1.8 : 0),
            shadow,
            p,
            n * 2.1,
            1.8 + (n === 0 ? 0.9 : 0),
            0,
            8,
          );
          ring(1.14, 0.085, accent, p, n * 2.1, 3.65, 0);
        }
      } else if (site.index === 1) {
        for (const side of [-1, 1]) {
          box(2.35, 5.8, 2.4, shadow, p, side * 2, 2.9, 0);
          box(0.09, 4.8, 0.08, accent, p, side * 2, 2.9, 1.25);
        }
        box(3.4, 0.25, 0.25, accent, p, 0, 6.1, 0);
      } else {
        cylinder(2.1, 3.9, shadow, p, 0, 1.95, 0, 10);
        for (let n = 0; n < 4; n++)
          ring(
            2.14,
            0.08,
            n % 2 ? accent : mutedAccent,
            p,
            0,
            0.65 + n * 0.9,
            0,
          );
      }
      const vault = new T.Group();
      vault.position.set(0, 6.6, 0);
      p.add(vault);
      mesh(
        new T.OctahedronGeometry(site.index === 2 ? 1.15 : 0.85),
        accent,
        vault,
      );
      for (let n = 0; n < 2; n++) {
        const orbit = mesh(
          new T.TorusGeometry(1.35 + n * 0.35, 0.055, 6, 30),
          steel,
          vault,
        );
        orbit.rotation.x = 0.45 + n * 0.55;
      }
      movers.push(vault);
    }
  }
  const title = label(map.title, color, 10);
  title.position.set(0, 5, 3);
  scene.add(title);
  return movers;
}
