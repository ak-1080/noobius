import { careerFor, careerLevel, newCareer } from './contracts.ts';
import { newFacility, normalizeFacility, type Facility } from './facility.ts';
import {
  MEMBERSHIP_LEASE_MS,
  VISIBLE_FOR_MS,
  realmExists,
  type Membership,
  type RealmId,
  type NeighborhoodSnapshot,
} from './neighborhoods.ts';
import { legalMovement } from './world-navigation.ts';

export class NeighborhoodError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type PresenceRow = {
  wallet: string;
  neighborhood_id: string | null;
  slot: number | null;
  client_id: string | null;
  generation: number;
  sequence: number;
  room: string;
  x: number;
  z: number;
  updated_at: number;
  lease_until: number;
  realm?: RealmId;
};
export type Controller = { clientId: string; generation: number };
export function controllerFrom(body: Record<string, unknown>): Controller {
  if (
    typeof body.clientId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(body.clientId) ||
    !Number.isSafeInteger(body.generation) ||
    Number(body.generation) < 0
  )
    throw new NeighborhoodError(400, 'Reconnect to your neighborhood.');
  return { clientId: body.clientId, generation: Number(body.generation) };
}
const freshGeneration = () => {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (words[0] & 0x1fffff) * 0x100000000 + words[1];
};
const membership = (r: PresenceRow): Membership => ({
  neighborhoodId: r.neighborhood_id!,
  realm: r.realm!,
  slot: r.slot!,
  generation: r.generation,
  sequence: r.sequence,
  scene: r.room,
  x: r.x,
  z: r.z,
  leaseUntil: r.lease_until,
});
export async function ensurePublicId(db: D1Database, wallet: string) {
  const row = await db
    .prepare('SELECT public_id FROM players WHERE wallet=?')
    .bind(wallet)
    .first<{ public_id: string | null }>();
  if (!row) throw new NeighborhoodError(401, 'Reconnect your wallet.');
  if (row.public_id) return row.public_id;
  await db
    .prepare(
      'UPDATE players SET public_id=? WHERE wallet=? AND public_id IS NULL',
    )
    .bind(crypto.randomUUID().replaceAll('-', ''), wallet)
    .run();
  return (await db
    .prepare('SELECT public_id FROM players WHERE wallet=?')
    .bind(wallet)
    .first<{ public_id: string }>())!.public_id;
}
export async function presenceFor(db: D1Database, wallet: string) {
  return db
    .prepare(
      'SELECT p.*,n.realm FROM crew_presence p LEFT JOIN neighborhoods n ON n.id=p.neighborhood_id WHERE wallet=?',
    )
    .bind(wallet)
    .first<PresenceRow>();
}
export async function requireMembership(
  db: D1Database,
  wallet: string,
  controller?: Controller,
  now = Date.now(),
) {
  const row = await presenceFor(db, wallet);
  if (!row?.neighborhood_id || row.slot === null || row.lease_until <= now)
    throw new NeighborhoodError(
      409,
      'Your neighborhood connection expired. Rejoin to continue.',
    );
  if (controller && row.client_id !== controller.clientId)
    throw new NeighborhoodError(
      409,
      'This game is open in another tab. Choose Continue here to take control.',
    );
  if (controller && row.generation !== controller.generation)
    throw new NeighborhoodError(
      409,
      'Your connection changed. Rejoin to resync.',
    );
  return row;
}

// One wallet row and five unique slot values. The database, not a preceding
// count or a Worker-local map, decides which simultaneous join wins a slot.
export async function joinNeighborhood(
  db: D1Database,
  wallet: string,
  realm: RealmId,
  band: number,
  clientId: string,
  options: { target?: string; takeover?: boolean } = {},
  now = Date.now(),
): Promise<Membership> {
  if (!realmExists(realm) || !/^[a-f0-9-]{36}$/.test(clientId))
    throw new NeighborhoodError(400, 'Choose a valid realm.');
  if (options.target && !/^[a-f0-9]{32}$/.test(options.target))
    throw new NeighborhoodError(400, 'That neighborhood code is not valid.');
  await ensurePublicId(db, wallet);
  const old = await presenceFor(db, wallet);
  if (old?.neighborhood_id && old.lease_until > now) {
    if (old.client_id !== clientId && !options.takeover)
      throw new NeighborhoodError(
        409,
        'This game is open in another tab. Choose Continue here to take control.',
      );
    if (
      old.client_id === clientId &&
      old.realm === realm &&
      (!options.target || old.neighborhood_id === options.target)
    ) {
      const renewed = await db
        .prepare(
          'UPDATE crew_presence SET lease_until=MAX(lease_until,?) WHERE wallet=? AND generation=? AND client_id=? AND lease_until>? RETURNING *',
        )
        .bind(now + MEMBERSHIP_LEASE_MS, wallet, old.generation, clientId, now)
        .first<PresenceRow>();
      if (!renewed)
        throw new NeighborhoodError(
          409,
          'Your connection changed. Rejoin from this tab.',
        );
      return membership({ ...renewed, realm });
    }
  }
  const expected = old?.generation ?? 0,
    generation = freshGeneration();
  const vacancies = async () =>
    (
      await db
        .prepare(`SELECT n.id FROM neighborhoods n LEFT JOIN crew_presence p ON p.neighborhood_id=n.id AND p.lease_until>? AND p.wallet<>?
    WHERE n.realm=? GROUP BY n.id HAVING count(p.wallet)<5 ORDER BY ABS(n.preferred_band-?),count(p.wallet) DESC,n.created_at LIMIT 4`)
        .bind(now, wallet, realm, band)
        .all<{ id: string }>()
    ).results;
  for (let attempt = 0; attempt < 5; attempt++) {
    let targets: { id: string }[];
    if (options.target)
      targets = (
        await db
          .prepare('SELECT id FROM neighborhoods WHERE id=? AND realm=?')
          .bind(options.target, realm)
          .all<{ id: string }>()
      ).results;
    else targets = await vacancies();
    if (!targets.length && !options.target) {
      // Concurrent arrivals all re-query one newly created vacancy.
      await db
        .prepare(`INSERT INTO neighborhoods(id,realm,preferred_band,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(
        SELECT 1 FROM neighborhoods n WHERE n.realm=? AND (SELECT count(*) FROM crew_presence p WHERE p.neighborhood_id=n.id AND p.lease_until>?)<5)`)
        .bind(
          crypto.randomUUID().replaceAll('-', ''),
          realm,
          band,
          now,
          realm,
          now,
        )
        .run();
      targets = await vacancies();
    }
    for (const target of targets) {
      const results = await db.batch([
        db
          .prepare(
            'DELETE FROM crew_presence WHERE neighborhood_id=? AND lease_until<=? AND wallet<>?',
          )
          .bind(target.id, now, wallet),
        db
          .prepare(`WITH slots(slot) AS (VALUES(0),(1),(2),(3),(4))
          INSERT INTO crew_presence(wallet,neighborhood_id,slot,client_id,generation,sequence,room,x,z,updated_at,lease_until)
          SELECT ?,?,slot,?,?,0,'commons',0,17,?,? FROM slots WHERE NOT EXISTS(
            SELECT 1 FROM crew_presence p WHERE p.neighborhood_id=? AND p.slot=slots.slot AND p.wallet<>?) ORDER BY slot LIMIT 1
          ON CONFLICT(wallet) DO UPDATE SET neighborhood_id=excluded.neighborhood_id,slot=excluded.slot,client_id=excluded.client_id,
          generation=excluded.generation,sequence=0,room=excluded.room,x=excluded.x,z=excluded.z,updated_at=excluded.updated_at,lease_until=excluded.lease_until
          WHERE crew_presence.generation=? AND (crew_presence.client_id=? OR crew_presence.neighborhood_id IS NULL OR crew_presence.lease_until<=? OR ?=1)
          RETURNING *`)
          .bind(
            wallet,
            target.id,
            clientId,
            generation,
            now,
            now + MEMBERSHIP_LEASE_MS,
            target.id,
            wallet,
            expected,
            clientId,
            now,
            options.takeover ? 1 : 0,
          ),
      ]);
      const saved = results[1].results[0] as PresenceRow | undefined;
      if (saved) return membership({ ...saved, realm });
      const current = await presenceFor(db, wallet);
      if (
        current &&
        (current.generation !== expected ||
          (current.client_id !== clientId &&
            current.lease_until > now &&
            !options.takeover))
      )
        throw new NeighborhoodError(
          409,
          'Your connection changed. Reconnect from this tab.',
        );
    }
    if (options.target)
      throw new NeighborhoodError(
        409,
        'That neighborhood is full or unavailable. Your current place is unchanged.',
      );
  }
  throw new NeighborhoodError(
    503,
    'The neighborhood is busy. Try joining again in a moment.',
  );
}

export async function neighborhoodSnapshot(
  db: D1Database,
  wallet: string,
  controller?: Controller,
  now = Date.now(),
): Promise<NeighborhoodSnapshot> {
  const self = await requireMembership(db, wallet, controller, now);
  const rows = (
    await db
      .prepare(`SELECT p.public_id,p.name,p.facility_state,c.slot,c.room,c.x,c.z,c.updated_at
    FROM crew_presence c JOIN players p ON p.wallet=c.wallet WHERE c.neighborhood_id=? AND c.lease_until>? ORDER BY c.slot`)
      .bind(self.neighborhood_id, now)
      .all<{
        public_id: string;
        name: string;
        facility_state: string;
        slot: number;
        room: string;
        x: number;
        z: number;
        updated_at: number;
      }>()
  ).results;
  const publicRows = rows.map((r) => {
    const f = normalizeFacility(
      JSON.parse(r.facility_state || JSON.stringify(newFacility(now))),
      now,
    );
    return {
      id: r.public_id,
      name: r.name,
      slot: r.slot,
      scene: r.room,
      online: r.updated_at > now - VISIBLE_FOR_MS,
      level: careerLevel(careerFor(f)),
      racks: Object.values(f.builds).reduce((n, v) => n + v, 0),
      outfit: f.outfit,
      accessory: f.accessory ?? 'none',
      x: r.x,
      z: r.z,
    };
  });
  return {
    membership: membership(self),
    serverNow: now,
    neighbors: publicRows.map(({ x, z, ...neighbor }) => neighbor),
    people: publicRows
      .filter((r) => r.online && r.scene === self.room)
      .map(({ id, name, x, z, outfit, accessory }) => ({
        id,
        name,
        x,
        z,
        outfit,
        accessory,
      })),
  };
}

export async function changeScene(
  db: D1Database,
  wallet: string,
  controller: Controller,
  scene: string,
  now = Date.now(),
) {
  const self = await requireMembership(db, wallet, controller, now);
  if (scene !== 'commons') {
    if (!/^home-[a-f0-9]{32}$/.test(scene))
      throw new NeighborhoodError(
        400,
        'Choose one of your neighbors’ centers.',
      );
    const owner = await db
      .prepare(`SELECT p.wallet FROM players p JOIN crew_presence c ON c.wallet=p.wallet
      WHERE p.public_id=? AND c.neighborhood_id=? AND c.lease_until>?`)
      .bind(scene.slice(5), self.neighborhood_id, now)
      .first();
    if (!owner)
      throw new NeighborhoodError(
        403,
        'That center is no longer in your neighborhood. Your own center is safe.',
      );
  }
  const generation = freshGeneration();
  const updated = await db
    .prepare(`UPDATE crew_presence SET room=?,x=0,z=17,sequence=0,generation=?,updated_at=?,lease_until=?
    WHERE wallet=? AND client_id=? AND generation=? AND lease_until>? AND (?='commons' OR EXISTS(
      SELECT 1 FROM players p JOIN crew_presence c ON c.wallet=p.wallet WHERE p.public_id=? AND c.neighborhood_id=? AND c.lease_until>?)) RETURNING *`)
    .bind(
      scene,
      generation,
      now,
      now + MEMBERSHIP_LEASE_MS,
      wallet,
      controller.clientId,
      controller.generation,
      now,
      scene,
      scene.slice(5),
      self.neighborhood_id,
      now,
    )
    .first<PresenceRow>();
  if (!updated)
    throw new NeighborhoodError(
      409,
      'Your connection changed. Rejoin before traveling.',
    );
  return membership({ ...updated, realm: self.realm });
}

export async function leaveNeighborhood(
  db: D1Database,
  wallet: string,
  controller: Controller,
) {
  await db
    .prepare(
      'DELETE FROM crew_presence WHERE wallet=? AND client_id=? AND generation=?',
    )
    .bind(wallet, controller.clientId, controller.generation)
    .run();
}

export async function syncNeighborhood(
  db: D1Database,
  wallet: string,
  controller: Controller,
  sequence: number,
  position: { x: number; z: number },
  now = Date.now(),
) {
  const self = await requireMembership(db, wallet, controller, now);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    !position ||
    typeof position.x !== 'number' ||
    typeof position.z !== 'number'
  )
    throw new NeighborhoodError(400, 'Invalid movement update.');
  if (sequence <= self.sequence)
    return {
      ...(await neighborhoodSnapshot(db, wallet, controller, now)),
      corrected: true,
    };
  // A host can leave at any time. Visitors keep their neighborhood slot and
  // return to its plaza; a departed owner's private interior cannot linger.
  let f = newFacility(now);
  if (self.room !== 'commons') {
    const owner = await db
      .prepare(`SELECT p.facility_state FROM players p JOIN crew_presence c ON c.wallet=p.wallet
      WHERE p.public_id=? AND c.neighborhood_id=? AND c.lease_until>?`)
      .bind(self.room.slice(5), self.neighborhood_id, now)
      .first<{ facility_state: string }>();
    if (!owner) {
      const relocated = await changeScene(
        db,
        wallet,
        controller,
        'commons',
        now,
      );
      return {
        ...(await neighborhoodSnapshot(
          db,
          wallet,
          { ...controller, generation: relocated.generation },
          now,
        )),
        corrected: true,
      };
    }
    f = normalizeFacility(
      JSON.parse(owner.facility_state || JSON.stringify(f)),
      now,
    );
  }
  const moved = legalMovement(
    f,
    self.room === 'commons',
    self,
    position,
    now - self.updated_at,
  );
  const updated = await db
    .prepare(`UPDATE crew_presence SET x=?,z=?,sequence=?,updated_at=?,lease_until=MAX(lease_until,?)
    WHERE wallet=? AND client_id=? AND generation=? AND sequence=? AND lease_until>? RETURNING wallet`)
    .bind(
      moved ? position.x : self.x,
      moved ? position.z : self.z,
      sequence,
      now,
      now + MEMBERSHIP_LEASE_MS,
      wallet,
      controller.clientId,
      controller.generation,
      self.sequence,
      now,
    )
    .first();
  if (!updated)
    throw new NeighborhoodError(
      409,
      'A newer movement update arrived first. Reconnect to resync.',
    );
  return {
    ...(await neighborhoodSnapshot(db, wallet, controller, now)),
    corrected: !moved,
  };
}

export async function visitCenter(
  db: D1Database,
  wallet: string,
  owner: string,
  now = Date.now(),
) {
  if (!/^[a-f0-9]{32}$/.test(owner))
    throw new NeighborhoodError(400, 'Choose a neighbor’s center.');
  const self = await requireMembership(db, wallet, undefined, now);
  const row = await db
    .prepare(`SELECT p.name,p.facility_state FROM players p JOIN crew_presence c ON c.wallet=p.wallet
    WHERE p.public_id=? AND c.neighborhood_id=? AND c.lease_until>?`)
    .bind(owner, self.neighborhood_id, now)
    .first<{ name: string; facility_state: string }>();
  if (!row)
    throw new NeighborhoodError(
      403,
      'That center is no longer in your neighborhood.',
    );
  const f = normalizeFacility(
    JSON.parse(row.facility_state || JSON.stringify(newFacility(now))),
    now,
  );
  return {
    owner,
    name: row.name,
    facility: {
      ...newFacility(now),
      builds: f.builds,
      unlocked: f.unlocked,
      power: f.power,
      cooling: f.cooling,
      career: {
        ...newCareer(f),
        accent: f.career?.accent,
        trophy: f.career?.trophy,
        commissioned: f.career?.commissioned,
      },
      visiting: true,
    } as Facility,
  };
}
