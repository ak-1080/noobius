import { sharedRealmFloor } from './realm-worlds.ts';
import type { RealmId } from './realm-catalog.ts';
import { OBJECTS, ZONES, type Facility } from './facility.ts';
import { CENTER_ENTRANCES } from './neighborhoods.ts';
import { planPath } from './navigation.ts';

const obstacles = [
  ...OBJECTS.filter((o) => o.kind !== 'gate').map((o) => ({
    x: o.x,
    z: o.z,
    w: o.kind === 'npc' ? 0.6 : 1.1,
    d: o.kind === 'npc' ? 0.5 : 0.85,
  })),
  ...ZONES.filter((z) => z.id !== 'commons').flatMap((zone) =>
    [0, 1, 2].map((i) => ({
      x: zone.x - 6 + i * 5.5,
      z: zone.z - 5,
      w: 1,
      d: 1,
    })),
  ),
];
const gates = OBJECTS.filter((o) => o.kind === 'gate');
const GATE_BODY_CLEARANCE = 0.62;

// The closed gate has posts and a barrier at the room threshold. Keep the
// avatar's body clear of that mesh, not only its center out of the locked room.
const closedGateClear = (
  facility: Pick<Facility, 'unlocked'>,
  x: number,
  z: number,
) =>
  !gates.some(
    (gate) =>
      !facility.unlocked.includes(gate.zone) &&
      Math.abs(x - gate.x) < 2.1 &&
      Math.abs(z - gate.z) < GATE_BODY_CLEARANCE,
  );

/** Move a legacy save made against the old point-only gate rule to its safe side. */
export function closedGateExit(
  facility: Pick<Facility, 'unlocked'>,
  x: number,
  z: number,
) {
  const gate = gates.find(
    (gate) =>
      !facility.unlocked.includes(gate.zone) &&
      Math.abs(x - gate.x) < 2.1 &&
      z >= gate.z &&
      z < gate.z + GATE_BODY_CLEARANCE,
  );
  return gate ? { x, z: gate.z + GATE_BODY_CLEARANCE + 0.01 } : null;
}

/** The renderer and authority use the same floor, room gates and footprints. */
export function floorClear(
  facility: Pick<Facility, 'unlocked'>,
  shared: boolean,
  x: number,
  z: number,
  realm: RealmId = 'commons',
) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (shared)
    return (
      sharedRealmFloor(realm, x, z) &&
      !CENTER_ENTRANCES.some(
        (o) => Math.abs(x - o.x) < 1 && Math.abs(z - o.z) < 0.6,
      ) &&
      !obstacles
        .filter((o) => o.z >= 4 && Math.abs(o.x) < 9)
        .some((o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d)
    );
  if (Math.abs(x) > 32 || z > 21 || z < -40) return false;
  if (!closedGateClear(facility, x, z)) return false;
  const zone = ZONES.find(
    (d) => Math.abs(x - d.x) < 9 && Math.abs(z - d.z) < 8,
  );
  if (zone && !facility.unlocked.includes(zone.id)) return false;
  const hall =
    ((Math.abs(z - 12) < 1.8 || Math.abs(z + 10) < 1.8) && Math.abs(x) < 32) ||
    ([-22, 0, 22].some((a) => Math.abs(x - a) < 1.8) && z >= -32 && z <= 12);
  return (
    (!!zone || hall) &&
    !obstacles.some((o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d)
  );
}

export function legalMovement(
  facility: Pick<Facility, 'unlocked'>,
  shared: boolean,
  from: { x: number; z: number },
  to: { x: number; z: number },
  elapsed: number,
  realm: RealmId = 'commons',
) {
  if (elapsed < 0 || !floorClear(facility, shared, to.x, to.z, realm))
    return false;
  // Renderer walks at 4.2 units/s. Allow bounded transport/rounding tolerance,
  // not a fresh allowance per packet; sequence/time are committed together.
  const allowance = (Math.min(10000, elapsed) / 1000) * 4.8;
  if (Math.hypot(to.x - from.x, to.z - from.z) > allowance) return false;
  return movementDistance(facility, shared, from, to, realm) <= allowance;
}

/** Authoritative walkable distance, including detours around solid obstacles. */
export function movementDistance(
  facility: Pick<Facility, 'unlocked'>,
  shared: boolean,
  from: { x: number; z: number },
  to: { x: number; z: number },
  realm: RealmId = 'commons',
) {
  if (!floorClear(facility, shared, to.x, to.z, realm)) return Infinity;
  const direct = Math.hypot(to.x - from.x, to.z - from.z);
  if (direct < 0.001) return direct;
  const path = planPath(
    [from.x, from.z],
    [to.x, to.z],
    (x, z) => floorClear(facility, shared, x, z, realm),
    0.5,
  );
  if (!path.length) return Infinity;
  let distance = 0,
    previous = [from.x, from.z];
  for (const point of path) {
    distance += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return distance;
}
