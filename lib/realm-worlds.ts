import { realmExists, type RealmId } from './realm-catalog.ts';
import type { WorldObject } from './facility.ts';
export type WorldRect = { x: number; z: number; w: number; d: number };
export type RealmSite = WorldRect & {
  id: string;
  name: string;
  detail: string;
  index: number;
};
const rect = (x: number, z: number, w: number, d: number): WorldRect => ({
  x,
  z,
  w,
  d,
});
const hub = rect(0, 12, 18, 16);
const layouts: Record<RealmId, WorldRect[]> = {
  commons: [
    hub,
    rect(0, -2, 4, 14),
    rect(0, -12, 22, 16),
    rect(-21, -12, 18, 16),
    rect(-11, -12, 12, 4),
    rect(21, -27, 18, 18),
    rect(21, -10, 4, 20),
    rect(11, -6, 24, 4),
    rect(0, -32, 14, 12),
    rect(0, -23, 4, 14),
  ],
  thermal: [
    hub,
    rect(0, 0, 4, 14),
    rect(0, -6, 54, 5),
    rect(-25, -18, 5, 28),
    rect(25, -18, 5, 28),
    rect(0, -32, 54, 5),
    rect(-23, -16, 14, 14),
    rect(23, -16, 14, 14),
    rect(0, -32, 18, 12),
  ],
  gpu: [
    hub,
    rect(0, -14, 10, 42),
    rect(-21, -15, 16, 34),
    rect(21, -15, 16, 34),
    rect(0, -5, 46, 4),
    rect(0, -27, 46, 4),
    rect(0, -32, 14, 12),
  ],
  core: [
    hub,
    rect(0, -1, 4, 16),
    rect(0, -13, 17, 17),
    rect(-13, -13, 16, 4),
    rect(13, -13, 16, 4),
    rect(-23, -13, 16, 17),
    rect(23, -13, 16, 17),
    rect(0, -25, 4, 14),
    rect(0, -34, 18, 12),
  ],
};
const names: Record<RealmId, [string, string, string]> = {
  commons: ['Scrap wharf', 'Wire exchange', 'Component line'],
  thermal: ['Intake gardens', 'Heat exchanger', 'Pump house'],
  gpu: ['Inference hall', 'Batch foundry', 'Chip laboratory'],
  core: ['Snapshot vault', 'Mirror chamber', 'Cold archive'],
};
const positions: Record<RealmId, [number, number][]> = {
  commons: [
    [-21, -12],
    [0, -32],
    [21, -27],
  ],
  thermal: [
    [-23, -16],
    [0, -32],
    [23, -16],
  ],
  gpu: [
    [-21, -15],
    [0, -32],
    [21, -15],
  ],
  core: [
    [-23, -13],
    [0, -34],
    [23, -13],
  ],
};
const descriptions: Record<RealmId, [string, string, string]> = {
  commons: [
    'Sort a salvage shipment for working materials.',
    'Trade scrap processing time for extra wire.',
    'Rebuild discarded parts into a repair kit.',
  ],
  thermal: [
    'Route liquid through a working cooling loop.',
    'Recover a larger coolant supply for the shift.',
    'Refurbish a pump for reliability work.',
  ],
  gpu: [
    'Fit request batches into limited accelerator capacity.',
    'Recover optical links from retired compute boards.',
    'Qualify silicon for the next training run.',
  ],
  core: [
    'Choose a complete, compatible recovery snapshot.',
    'Recover a board without losing a valid checkpoint.',
    'Rescue a data core from cold storage.',
  ],
};
export const realmSites = (realm: RealmId): RealmSite[] =>
  positions[realm].map(([x, z], index) => ({
    id: `field-${realm}-${index}`,
    name: names[realm][index],
    detail: descriptions[realm][index],
    index,
    x,
    z,
    w: 1.1,
    d: 0.85,
  }));
export function fieldSite(id?: string) {
  for (const realm of ['commons', 'thermal', 'gpu', 'core'] as const) {
    const s = realmSites(realm).find((s) => s.id === id);
    if (s) return { ...s, realm };
  }
  return undefined;
}
export const realmWorld = (realm: RealmId) => ({
  floors: layouts[realm],
  sites: realmSites(realm),
  title: {
    commons: 'THE RECLAIM YARDS',
    thermal: 'THE COOLING CIRCUIT',
    gpu: 'THE ACCELERATOR CAMPUS',
    core: 'THE MEMORY ISLANDS',
  }[realm],
});
export const realmSiteObjects = (realm: RealmId): WorldObject[] =>
  realmSites(realm).map((s) => ({
    id: s.id,
    name: s.name,
    x: s.x,
    z: s.z,
    zone: 'commons',
    kind: 'terminal',
    panel: 'field',
  }));
export function realmLandmarks(realm: RealmId) {
  const size = {
    commons: [14, 3.4],
    thermal: [11, 3.4],
    gpu: [10, 3.4],
    core: [7, 7],
  }[realm];
  return realmSites(realm).map((site) => ({
    x: site.x + Math.sign(site.x) * 10,
    z: site.z - (site.x === 0 ? 10 : 3),
    w: size[0],
    d: size[1],
  }));
}
export function sharedRealmFloor(realm: RealmId, x: number, z: number) {
  return (
    realmExists(realm) &&
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    layouts[realm].some(
      (r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2,
    ) &&
    !realmLandmarks(realm).some(
      (r) =>
        Math.abs(x - r.x) < r.w / 2 + 0.25 &&
        Math.abs(z - r.z) < r.d / 2 + 0.25,
    ) &&
    !realmSites(realm).some(
      (s) => Math.abs(x - s.x) < s.w && Math.abs(z - s.z) < s.d,
    )
  );
}
