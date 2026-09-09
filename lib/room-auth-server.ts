import { normalizeFacility, newFacility, type ZoneId } from './facility.ts';
import { operatorLicense, careerFor } from './contracts.ts';
import { MEMBERSHIP_LEASE_MS, type Membership } from './neighborhoods.ts';
import { type Controller } from './neighborhoods-server.ts';
import { realmWriteGuard, type RealmPermit } from './realm-authority.ts';
import { noBlockSql } from './social.ts';
import { floorClear } from './world-navigation.ts';
import { DB_CLOCK_SQL } from './room-writer.ts';
import {
  RoomAuthError,
  ROOM_TICKET_MS,
  ROOM_GRANT_MS,
  ROOM_AUTH_LEASE_MS,
  ROOM_NONCE_MS,
  roomTokenHash,
  opaqueRoomToken,
  validRoomToken,
  verifyRoomServiceRequest,
  type RoomAuthConfig,
} from './room-auth.ts';

export type RoomSession = {
  wallet: string;
  sessionHash: string;
  expiresAt: number;
};
export type RoomAuthority = {
  player: { id: string; name: string; outfit: string; accessory: string };
  membership: Membership;
  navigation: { unlocked: ZoneId[] };
  serverNow: number;
  authorizedUntil: number;
  expiresAt: number;
  writerUntil: number;
  frozenUntil: number;
  frozenCheckpoint: string | null;
};
type BoundIdentity = RoomSession & {
  neighborhoodId: string;
  clientId: string;
  generation: number;
  scene: string;
};
type GrantRow = {
  grant_hash: string;
  wallet: string;
  session_hash: string;
  neighborhood_id: string;
  client_id: string;
  generation: number;
  scene: string;
  audience: string;
  key_id: string;
  expires_at: number;
};
// Private interiors require a present owner and bilateral visit permission.
// This predicate is repeated inside ticket/grant mutations, not just a read.
function sceneGuard(alias: string) {
  return `(${alias}.room='commons' OR EXISTS(SELECT 1 FROM players host JOIN crew_presence host_presence ON host_presence.wallet=host.wallet
    WHERE 'home-'||host.public_id=${alias}.room AND host_presence.neighborhood_id=${alias}.neighborhood_id
    AND host_presence.lease_until>MAX(?,${DB_CLOCK_SQL}) AND ${noBlockSql(alias + '.wallet', 'host.wallet')}))`;
}
async function authority(
  db: D1Database,
  bound: BoundIdentity,
  permit: RealmPermit | undefined,
  now: number,
  hardExpiry: number,
  grantHash?: string,
): Promise<RoomAuthority> {
  const row = await db
    .prepare(`SELECT c.*,n.realm,p.public_id,p.name,p.facility_state,s.expires_at AS session_expires_at,
    g.writer_until,g.frozen_until,g.frozen_checkpoint,
    (SELECT host.facility_state FROM players host WHERE 'home-'||host.public_id=c.room) AS host_facility
    FROM crew_presence c JOIN neighborhoods n ON n.id=c.neighborhood_id JOIN players p ON p.wallet=c.wallet
    JOIN sessions s ON s.wallet=c.wallet AND s.token_hash=?
    LEFT JOIN room_grants g ON g.grant_hash=? AND g.wallet=c.wallet
    WHERE c.wallet=? AND c.neighborhood_id=? AND c.client_id=? AND c.generation=? AND c.room=?
    AND c.lease_until>MAX(?,${DB_CLOCK_SQL}) AND s.expires_at>MAX(?,${DB_CLOCK_SQL}) AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')}
    AND (? IS NULL OR (g.grant_hash IS NOT NULL AND g.expires_at>MAX(?,${DB_CLOCK_SQL}) AND g.writer_until>MAX(?,${DB_CLOCK_SQL})))`)
    .bind(
      bound.sessionHash,
      grantHash ?? null,
      bound.wallet,
      bound.neighborhoodId,
      bound.clientId,
      bound.generation,
      bound.scene,
      now,
      now,
      now,
      grantHash ?? null,
      now,
      now,
    )
    .first<{
      realm: 'commons' | 'gpu';
      public_id: string;
      name: string;
      facility_state: string;
      host_facility: string | null;
      slot: number;
      sequence: number;
      x: number;
      z: number;
      lease_until: number;
      session_expires_at: number;
      writer_until: number | null;
      frozen_until: number | null;
      frozen_checkpoint: string | null;
    }>();
  if (!row)
    throw new RoomAuthError(
      409,
      'Room authority changed. Request a fresh connection.',
    );
  const own = normalizeFacility(JSON.parse(row.facility_state || '{}'), now);
  if (row.realm === 'gpu' && !operatorLicense(careerFor(own)))
    throw new RoomAuthError(
      403,
      'Earn your Operator license before entering this room.',
    );
  const navigation = row.host_facility
    ? normalizeFacility(JSON.parse(row.host_facility), now)
    : newFacility(now);
  return {
    player: {
      id: row.public_id,
      name: row.name,
      outfit: own.outfit,
      accessory: own.accessory ?? 'none',
    },
    membership: {
      neighborhoodId: bound.neighborhoodId,
      realm: row.realm,
      slot: row.slot,
      generation: bound.generation,
      scene: bound.scene,
      sequence: row.sequence,
      x: row.x,
      z: row.z,
      leaseUntil: row.lease_until,
    },
    navigation: { unlocked: navigation.unlocked },
    serverNow: now,
    authorizedUntil: Math.min(
      now + ROOM_AUTH_LEASE_MS,
      hardExpiry,
      row.session_expires_at,
      row.lease_until,
      grantHash ? (row.writer_until ?? 0) : Infinity,
    ),
    expiresAt: Math.min(hardExpiry, row.session_expires_at),
    writerUntil: row.writer_until ?? 0,
    frozenUntil: row.frozen_until ?? 0,
    frozenCheckpoint: row.frozen_checkpoint,
  };
}

export async function issueRoomTicket(
  db: D1Database,
  config: RoomAuthConfig,
  session: RoomSession,
  controller: Controller,
  permit?: RealmPermit,
  now = Date.now(),
) {
  if (session.expiresAt <= now)
    throw new RoomAuthError(401, 'Reconnect your wallet.');
  const presence = await db
    .prepare(
      'SELECT neighborhood_id,room FROM crew_presence WHERE wallet=? AND client_id=? AND generation=? AND lease_until>?',
    )
    .bind(session.wallet, controller.clientId, controller.generation, now)
    .first<{ neighborhood_id: string; room: string }>();
  if (!presence?.neighborhood_id)
    throw new RoomAuthError(409, 'Join a neighborhood before connecting.');
  const bound = {
    ...session,
    ...controller,
    neighborhoodId: presence.neighborhood_id,
    scene: presence.room,
  };
  await authority(db, bound, permit, now, session.expiresAt);
  const ticket = opaqueRoomToken(),
    expiresAt = Math.min(now + ROOM_TICKET_MS, session.expiresAt);
  const ticketHash = await roomTokenHash(ticket);
  const results = await db.batch([
    db
      .prepare(`INSERT INTO room_tickets(token_hash,wallet,session_hash,neighborhood_id,client_id,generation,scene,audience,expires_at)
      SELECT ?,c.wallet,s.token_hash,c.neighborhood_id,c.client_id,c.generation,c.room,?,MIN(?,s.expires_at)
      FROM crew_presence c JOIN sessions s ON s.wallet=c.wallet AND s.token_hash=?
      WHERE c.wallet=? AND c.client_id=? AND c.generation=? AND c.neighborhood_id=? AND c.room=? AND c.lease_until>MAX(?,${DB_CLOCK_SQL}) AND s.expires_at>MAX(?,${DB_CLOCK_SQL})
      AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')} RETURNING expires_at`)
      .bind(
        ticketHash,
        config.audience,
        expiresAt,
        session.sessionHash,
        session.wallet,
        controller.clientId,
        controller.generation,
        bound.neighborhoodId,
        bound.scene,
        now,
        now,
        now,
      ),
    // A stale issuer must not delete a newer controller's usable ticket.
    db
      .prepare(
        'DELETE FROM room_tickets WHERE expires_at<=? OR (wallet=? AND token_hash!=? AND EXISTS(SELECT 1 FROM room_tickets current WHERE current.token_hash=?))',
      )
      .bind(now, session.wallet, ticketHash, ticketHash),
  ]);
  if (!results[0].results?.length)
    throw new RoomAuthError(
      409,
      'Room authority changed. Request a fresh connection.',
    );
  return {
    ticket,
    expiresAt: (results[0].results[0] as { expires_at: number }).expires_at,
    coordinatorOrigin: config.coordinatorOrigin,
  };
}

async function consumeTicket(
  db: D1Database,
  config: RoomAuthConfig,
  ticket: unknown,
  keyId: string,
  permit: RealmPermit | undefined,
  now: number,
) {
  if (!validRoomToken(ticket))
    throw new RoomAuthError(400, 'Supply a valid room ticket.');
  const ticketHash = await roomTokenHash(ticket),
    grant = opaqueRoomToken(),
    grantHash = await roomTokenHash(grant);
  const result = await db.batch([
    db
      .prepare(`INSERT INTO room_grants(grant_hash,wallet,session_hash,neighborhood_id,client_id,generation,scene,audience,key_id,created_at,expires_at,writer_until)
      SELECT ?,t.wallet,t.session_hash,t.neighborhood_id,t.client_id,t.generation,t.scene,t.audience,?,?,MIN(?,s.expires_at),MIN(?,s.expires_at)
      FROM room_tickets t JOIN sessions s ON s.token_hash=t.session_hash AND s.wallet=t.wallet
      JOIN crew_presence c ON c.wallet=t.wallet AND c.neighborhood_id=t.neighborhood_id AND c.client_id=t.client_id AND c.generation=t.generation AND c.room=t.scene
      WHERE t.token_hash=? AND t.audience=? AND t.expires_at>MAX(?,${DB_CLOCK_SQL}) AND s.expires_at>MAX(?,${DB_CLOCK_SQL}) AND c.lease_until>MAX(?,${DB_CLOCK_SQL})
      AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')}
      ON CONFLICT(wallet) DO UPDATE SET grant_hash=excluded.grant_hash,session_hash=excluded.session_hash,
        neighborhood_id=excluded.neighborhood_id,client_id=excluded.client_id,generation=excluded.generation,scene=excluded.scene,
        audience=excluded.audience,key_id=excluded.key_id,created_at=excluded.created_at,expires_at=excluded.expires_at,
        writer_until=excluded.writer_until,frozen_until=0,frozen_checkpoint=NULL
      RETURNING *`)
      .bind(
        grantHash,
        keyId,
        now,
        now + ROOM_GRANT_MS,
        now + ROOM_AUTH_LEASE_MS,
        ticketHash,
        config.audience,
        now,
        now,
        now,
        now,
      ),
    db
      .prepare(
        `UPDATE crew_presence SET sequence=sequence+1 WHERE changes()=1 AND wallet=(SELECT wallet FROM room_grants WHERE grant_hash=?)`,
      )
      .bind(grantHash),
    db
      .prepare('DELETE FROM room_tickets WHERE token_hash=? OR expires_at<=?')
      .bind(ticketHash, now),
  ]);
  const row = result[0].results?.[0] as GrantRow | undefined;
  if (!row)
    throw new RoomAuthError(
      409,
      'Room ticket expired or was already used. Request another.',
    );
  const context = await refreshGrant(db, config, grant, permit, now, false);
  // No session hash, wallet account key, inventory, money or other grants.
  return { grant, ...context };
}

async function grantAuthority(
  db: D1Database,
  config: RoomAuthConfig,
  grant: unknown,
  permit: RealmPermit | undefined,
  now: number,
) {
  if (!validRoomToken(grant))
    throw new RoomAuthError(400, 'Supply a valid room grant.');
  const grantHash = await roomTokenHash(grant);
  const row = await db
    .prepare(
      `SELECT * FROM room_grants WHERE grant_hash=? AND audience=? AND expires_at>MAX(?,${DB_CLOCK_SQL}) AND writer_until>MAX(?,${DB_CLOCK_SQL})`,
    )
    .bind(grantHash, config.audience, now, now)
    .first<GrantRow>();
  if (!row || !Object.hasOwn(config.keys, row.key_id))
    throw new RoomAuthError(
      409,
      'Room grant expired or was replaced. Request a fresh connection.',
    );
  const bound: BoundIdentity = {
    wallet: row.wallet,
    sessionHash: row.session_hash,
    expiresAt: row.expires_at,
    neighborhoodId: row.neighborhood_id,
    clientId: row.client_id,
    generation: row.generation,
    scene: row.scene,
  };
  const context = await authority(
    db,
    bound,
    permit,
    now,
    row.expires_at,
    grantHash,
  );
  return { grantHash, row, bound, context };
}
// The writer lease and ordinary membership renew together. Once it expires,
// a grant cannot be revived: HTTP may already own the position again.
async function refreshGrant(
  db: D1Database,
  config: RoomAuthConfig,
  grant: unknown,
  permit: RealmPermit | undefined,
  now: number,
  renew = true,
) {
  const { grantHash, row, bound, context } = await grantAuthority(
    db,
    config,
    grant,
    permit,
    now,
  );
  if (!renew) return context;
  const result = await db.batch([
    db
      .prepare(`UPDATE crew_presence AS c SET lease_until=MAX(lease_until,?)
      WHERE c.wallet=? AND c.client_id=? AND c.generation=? AND c.neighborhood_id=? AND c.room=? AND c.lease_until>MAX(?,${DB_CLOCK_SQL})
      AND EXISTS(SELECT 1 FROM room_grants g JOIN sessions s ON s.token_hash=g.session_hash AND s.wallet=g.wallet
        WHERE g.grant_hash=? AND g.wallet=c.wallet AND g.client_id=c.client_id AND g.generation=c.generation
        AND g.neighborhood_id=c.neighborhood_id AND g.scene=c.room AND g.expires_at>MAX(?,${DB_CLOCK_SQL}) AND g.writer_until>MAX(?,${DB_CLOCK_SQL}) AND s.expires_at>MAX(?,${DB_CLOCK_SQL}))
      AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')} RETURNING lease_until`)
      .bind(
        Math.min(now + MEMBERSHIP_LEASE_MS, context.expiresAt),
        row.wallet,
        row.client_id,
        row.generation,
        row.neighborhood_id,
        row.scene,
        now,
        grantHash,
        now,
        now,
        now,
        now,
      ),
    db
      .prepare(
        `UPDATE room_grants SET writer_until=MIN(?,expires_at),frozen_checkpoint=CASE WHEN frozen_until<=MAX(?,${DB_CLOCK_SQL}) THEN NULL ELSE frozen_checkpoint END,frozen_until=CASE WHEN frozen_until<=MAX(?,${DB_CLOCK_SQL}) THEN 0 ELSE frozen_until END WHERE grant_hash=? AND changes()=1`,
      )
      .bind(
        Math.min(now + ROOM_AUTH_LEASE_MS, context.expiresAt),
        now,
        now,
        grantHash,
      ),
  ]);
  if (!result[0].results?.length)
    throw new RoomAuthError(
      409,
      'Room authority changed. Request a fresh connection.',
    );
  return authority(db, bound, permit, now, row.expires_at, grantHash);
}
const checkpointId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const ACTION_FREEZE_MS = 3000;
export type RoomCheckpoint = {
  id: string;
  baseSequence: number;
  inputSequence: number;
  x: number;
  z: number;
  intent?: string;
};
export type RoomCheckpointReceipt = {
  id: string;
  inputSequence: number;
  sequence: number;
  x: number;
  z: number;
  committedAt: number;
  frozenUntil: number;
};
async function checkpointMovement(
  db: D1Database,
  config: RoomAuthConfig,
  body: Record<string, unknown>,
  permit: RealmPermit | undefined,
  now: number,
) {
  if (
    !checkpointId(body.id) ||
    !Number.isSafeInteger(body.baseSequence) ||
    (body.baseSequence as number) < 0 ||
    (body.baseSequence as number) >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(body.inputSequence) ||
    (body.inputSequence as number) < 0 ||
    typeof body.x !== 'number' ||
    typeof body.z !== 'number' ||
    !Number.isFinite(body.x) ||
    !Number.isFinite(body.z) ||
    (body.intent !== undefined && !validRoomToken(body.intent))
  )
    throw new RoomAuthError(400, 'Invalid movement checkpoint.');
  const input = body as unknown as RoomCheckpoint;
  const payloadHash = await roomTokenHash(
    JSON.stringify([
      input.id,
      input.baseSequence,
      input.inputSequence,
      input.x,
      input.z,
      input.intent ?? null,
    ]),
  );
  const { grantHash, row, bound, context } = await grantAuthority(
    db,
    config,
    body.grant,
    permit,
    now,
  );
  const previous = () =>
    db
      .prepare(
        'SELECT payload_hash,receipt FROM room_checkpoints WHERE grant_hash=? AND id=?',
      )
      .bind(grantHash, input.id)
      .first<{ payload_hash: string; receipt: string }>();
  const reply = async (saved: { payload_hash: string; receipt: string }) => {
    if (saved.payload_hash !== payloadHash)
      throw new RoomAuthError(
        409,
        'Checkpoint identity was reused with different movement.',
      );
    return {
      checkpoint: JSON.parse(saved.receipt) as RoomCheckpointReceipt,
      authority: await authority(
        db,
        bound,
        permit,
        now,
        row.expires_at,
        grantHash,
      ),
    };
  };
  const saved = await previous();
  if (saved) return reply(saved);
  if (
    !floorClear(context.navigation, row.scene === 'commons', input.x, input.z)
  )
    throw new RoomAuthError(400, 'Checkpoint is outside the accessible floor.');
  // Movement hops are validated by the trusted coordinator. Sparse D1 commits
  // cannot re-run a ten-second single-hop check over an entire longer journey.
  const frozenUntil = input.intent
    ? Math.min(now + ACTION_FREEZE_MS, context.expiresAt)
    : 0;
  const receipt: RoomCheckpointReceipt = {
    id: input.id,
    inputSequence: input.inputSequence,
    sequence: input.baseSequence + 1,
    x: input.x,
    z: input.z,
    committedAt: now,
    frozenUntil,
  };
  await db.batch([
    db
      .prepare(`UPDATE crew_presence AS c SET x=?,z=?,sequence=sequence+1,updated_at=?,lease_until=MAX(lease_until,?)
      WHERE c.wallet=? AND c.client_id=? AND c.generation=? AND c.neighborhood_id=? AND c.room=? AND c.sequence=? AND c.lease_until>MAX(?,${DB_CLOCK_SQL})
      AND EXISTS(SELECT 1 FROM room_grants g JOIN sessions s ON s.token_hash=g.session_hash AND s.wallet=g.wallet WHERE g.grant_hash=? AND g.wallet=c.wallet
        AND g.client_id=c.client_id AND g.generation=c.generation AND g.neighborhood_id=c.neighborhood_id AND g.scene=c.room
        AND g.expires_at>MAX(?,${DB_CLOCK_SQL}) AND g.writer_until>MAX(?,${DB_CLOCK_SQL}) AND s.expires_at>MAX(?,${DB_CLOCK_SQL}) AND g.frozen_until<=?)
      AND NOT EXISTS(SELECT 1 FROM room_checkpoints WHERE grant_hash=? AND id=?) AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')} RETURNING sequence`)
      .bind(
        input.x,
        input.z,
        now,
        Math.min(now + MEMBERSHIP_LEASE_MS, context.expiresAt),
        row.wallet,
        row.client_id,
        row.generation,
        row.neighborhood_id,
        row.scene,
        input.baseSequence,
        now,
        grantHash,
        now,
        now,
        now,
        now,
        grantHash,
        input.id,
        now,
      ),
    db
      .prepare(
        'INSERT INTO room_checkpoints(grant_hash,id,payload_hash,receipt,intent,expires_at) SELECT ?,?,?,?,?,? WHERE changes()=1',
      )
      .bind(
        grantHash,
        input.id,
        payloadHash,
        JSON.stringify(receipt),
        input.intent ?? null,
        row.expires_at + 60000,
      ),
    db
      .prepare(
        'UPDATE room_grants SET writer_until=MIN(?,expires_at),frozen_until=?,frozen_checkpoint=? WHERE grant_hash=? AND changes()=1',
      )
      .bind(
        Math.min(now + ROOM_AUTH_LEASE_MS, context.expiresAt),
        frozenUntil,
        input.intent ? input.id : null,
        grantHash,
      ),
  ]);
  const committed = await previous();
  if (!committed)
    throw new RoomAuthError(
      409,
      'A newer position or connection arrived first. Reconnect to resync.',
    );
  // A competing identical retry may own the commit. Returning its stored result
  // performs no second movement, renewal or action-window extension.
  return reply(committed);
}
async function completeAction(
  db: D1Database,
  config: RoomAuthConfig,
  body: Record<string, unknown>,
  permit: RealmPermit | undefined,
  now: number,
) {
  if (!checkpointId(body.id))
    throw new RoomAuthError(400, 'Supply the completed action checkpoint.');
  const { grantHash, row, bound } = await grantAuthority(
    db,
    config,
    body.grant,
    permit,
    now,
  );
  await db
    .prepare(
      'UPDATE room_grants SET frozen_until=0,frozen_checkpoint=NULL WHERE grant_hash=? AND frozen_checkpoint=?',
    )
    .bind(grantHash, body.id)
    .run();
  return authority(db, bound, permit, now, row.expires_at, grantHash);
}
async function releaseGrant(
  db: D1Database,
  config: RoomAuthConfig,
  grant: unknown,
) {
  if (!validRoomToken(grant))
    throw new RoomAuthError(400, 'Supply a valid room grant.');
  // Specific hash only: an old socket cannot release its replacement. Position
  // stays at the last durable checkpoint; uncommitted local movement is dropped.
  await db
    .prepare('DELETE FROM room_grants WHERE grant_hash=? AND audience=?')
    .bind(await roomTokenHash(grant), config.audience)
    .run();
  return { released: true };
}

export async function handleRoomService(
  db: D1Database,
  request: Request,
  config: RoomAuthConfig,
  permit?: RealmPermit,
  clock = Date.now,
) {
  const signed = await verifyRoomServiceRequest(request, config, clock);
  const now = clock();
  const claimed = await db.batch([
    db.prepare('DELETE FROM room_service_nonces WHERE expires_at<=?').bind(now),
    db
      .prepare(
        'INSERT INTO room_service_nonces(key_id,nonce,expires_at) VALUES(?,?,?) ON CONFLICT(key_id,nonce) DO NOTHING RETURNING nonce',
      )
      .bind(signed.keyId, signed.nonce, now + ROOM_NONCE_MS),
    db.prepare('DELETE FROM room_grants WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM room_checkpoints WHERE expires_at<=?').bind(now),
  ]);
  if (!claimed[1].results?.length)
    throw new RoomAuthError(
      409,
      'Service request already used. Retry with a new request nonce.',
    );
  const { body } = signed;
  if (
    body.operation === 'ticket-consume' &&
    Object.keys(body).every((k) => ['operation', 'ticket'].includes(k))
  )
    return consumeTicket(db, config, body.ticket, signed.keyId, permit, now);
  if (
    body.operation === 'authority-refresh' &&
    Object.keys(body).every((k) => ['operation', 'grant'].includes(k))
  )
    return refreshGrant(db, config, body.grant, permit, now);
  if (
    body.operation === 'movement-checkpoint' &&
    Object.keys(body).every((k) =>
      [
        'operation',
        'grant',
        'id',
        'baseSequence',
        'inputSequence',
        'x',
        'z',
        'intent',
      ].includes(k),
    )
  )
    return checkpointMovement(db, config, body, permit, now);
  if (
    body.operation === 'action-complete' &&
    Object.keys(body).every((k) => ['operation', 'grant', 'id'].includes(k))
  )
    return completeAction(db, config, body, permit, now);
  if (
    body.operation === 'authority-release' &&
    Object.keys(body).every((k) => ['operation', 'grant'].includes(k))
  )
    return releaseGrant(db, config, body.grant);
  throw new RoomAuthError(400, 'Unknown room service operation.');
}
