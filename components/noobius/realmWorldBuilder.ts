import * as T from 'three';
import { realmWorld, realmLandmarks } from '@/lib/realm-worlds';
import { realmFor, type RealmId } from '@/lib/realm-catalog';
// Fixed geometry and animation pools; this builder runs once per realm scene.
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
  const { box, mesh, mat, label } = kit,
    map = realmWorld(realm),
    color = realmFor(realm).color;
  const floor = mat(
    { commons: '#304250', thermal: '#174653', gpu: '#242c4a', core: '#423531' }[
      realm
    ],
  );
  const edge = mat(color, 0.3),
    dark = mat('#0a1822'),
    steel = mat('#435c6b');
  const movers: T.Object3D[] = [];
  for (const r of map.floors.slice(1)) {
    box(r.w, 0.4, r.d, dark, scene, r.x, -0.2, r.z);
    box(r.w - 0.15, 0.06, r.d - 0.15, floor, scene, r.x, 0.03, r.z);
    // Floor guides keep the routes legible from the isometric camera.
    if (r.w <= 5 || r.d <= 5) {
      box(
        r.w <= 5 ? 0.09 : r.w - 1,
        0.035,
        r.d <= 5 ? 0.09 : r.d - 1,
        edge,
        scene,
        r.x,
        0.085,
        r.z,
      );
    } else
      for (let x = -Math.floor(r.w / 4) * 2; x < r.w / 2; x += 4)
        box(0.025, 0.02, r.d - 0.4, steel, scene, r.x + x, 0.08, r.z);
  }
  for (const site of map.sites) {
    const district = label(site.name.toUpperCase(), color, 6);
    district.position.set(site.x, 4.4, site.z - 4);
    scene.add(district);
    const pad = mesh(
      new T.RingGeometry(2.2, 2.3, 40),
      edge,
      scene,
      site.x,
      0.1,
      site.z,
    );
    pad.rotation.x = -Math.PI / 2;
    // Decorations have shared collision footprints as well as visible support decks.
    const landmark = realmLandmarks(realm)[site.index];
    const p = new T.Group();
    p.position.set(landmark.x, 0, landmark.z);
    scene.add(p);
    box(landmark.w + 0.5, 0.45, landmark.d + 0.5, dark, p, 0, -0.2, 0);
    box(landmark.w + 0.5, 0.08, 0.08, edge, p, 0, 0.06, landmark.d / 2);
    if (realm === 'commons') {
      for (let n = 0; n < 3; n++) {
        box(4, 2.2, 2.4, n % 2 ? steel : floor, p, (n - 1) * 4.4, 1.1, 0);
        box(3.7, 0.1, 2.5, edge, p, (n - 1) * 4.4, 2.25, 0);
        for (let i = 0; i < 5; i++)
          box(
            0.06,
            1.8,
            0.08,
            dark,
            p,
            (n - 1) * 4.4 - 1.5 + i * 0.75,
            1.1,
            1.23,
          );
      }
      box(0.35, 7, 0.35, steel, p, -6, 3.5, 0);
      box(12, 0.35, 0.35, edge, p, 0, 7, 0);
      box(0.06, 4, 0.06, steel, p, 3, 5, 0);
      box(1, 0.4, 1, edge, p, 3, 3, 0);
    } else if (realm === 'thermal') {
      for (let i = -1; i <= 1; i++) {
        mesh(new T.CylinderGeometry(1.3, 1.3, 4, 20), steel, p, i * 3.3, 2, 0);
        mesh(
          new T.TorusGeometry(1.32, 0.13, 8, 24),
          edge,
          p,
          i * 3.3,
          3.1,
          0,
        ).rotation.x = Math.PI / 2;
        const fan = new T.Group();
        fan.position.set(i * 3.3, 2, 1.35);
        p.add(fan);
        for (let j = 0; j < 4; j++)
          box(1.6, 0.16, 0.12, edge, fan).rotation.z = (j * Math.PI) / 4;
        fan.userData.spinAxis = 'z';
        movers.push(fan);
      }
      box(11, 0.18, 0.18, edge, p, 0, 4.1, 0);
    } else if (realm === 'gpu') {
      for (let n = -2; n <= 2; n++) {
        box(1.7, 5, 1.7, dark, p, n * 2, 2.5, 0);
        for (let row = 0; row < 7; row++) {
          box(1.45, 0.36, 0.1, steel, p, n * 2, 0.5 + row * 0.63, 0.91);
          box(0.65, 0.05, 0.04, edge, p, n * 2, 0.5 + row * 0.63, 0.98);
        }
      }
      const chip = new T.Group();
      chip.position.y = 7;
      p.add(chip);
      box(2, 2, 0.3, edge, chip);
      box(1.35, 1.35, 0.05, dark, chip, 0, 0, 0.2);
      movers.push(chip);
    } else {
      mesh(new T.CylinderGeometry(2.4, 3, 1, 8), dark, p, 0, 0.5, 0);
      const vault = new T.Group();
      vault.position.y = 3;
      p.add(vault);
      mesh(new T.OctahedronGeometry(1.5), edge, vault);
      for (let i = 0; i < 3; i++) {
        const ring = mesh(
          new T.TorusGeometry(2 + i * 0.5, 0.07, 8, 48),
          steel,
          vault,
        );
        ring.rotation.x = 0.5 + i * 0.65;
      }
      movers.push(vault);
    }
  }
  const title = label(map.title, color, 10);
  title.position.set(0, 5, 3);
  scene.add(title);
  return movers;
}
