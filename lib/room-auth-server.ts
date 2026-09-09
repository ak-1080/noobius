import { normalizeFacility, newFacility, type ZoneId } from './facility.ts';
import { operatorLicense, careerFor } from './contracts.ts';
import { MEMBERSHIP_LEASE_MS, type Membership } from './neighborhoods.ts';
import { type Controller } from './neighborhoods-server.ts';
import { realmWriteGuard, type RealmPermit } from './realm-authority.ts';
import { noBlockSql } from './social.ts';
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
    AND host_presence.lease_until>? AND ${noBlockSql(alias + '.wallet', 'host.wallet')}))`;
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
    (SELECT host.facility_state FROM players host WHERE 'home-'||host.public_id=c.room) AS host_facility
    FROM crew_presence c JOIN neighborhoods n ON n.id=c.neighborhood_id JOIN players p ON p.wallet=c.wallet
    JOIN sessions s ON s.wallet=c.wallet AND s.token_hash=?
    WHERE c.wallet=? AND c.neighborhood_id=? AND c.client_id=? AND c.generation=? AND c.room=?
    AND c.lease_until>? AND s.expires_at>? AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')}
    AND (? IS NULL OR EXISTS(SELECT 1 FROM room_grants g WHERE g.grant_hash=? AND g.wallet=c.wallet AND g.expires_at>?))`)
    .bind(
      bound.sessionHash,
      bound.wallet,
      bound.neighborhoodId,
      bound.clientId,
      bound.generation,
      bound.scene,
      now,
      now,
      now,
      grantHash ?? null,
      grantHash ?? null,
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
    ),
    expiresAt: Math.min(hardExpiry, row.session_expires_at),
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
      WHERE c.wallet=? AND c.client_id=? AND c.generation=? AND c.neighborhood_id=? AND c.room=? AND c.lease_until>? AND s.expires_at>?
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
      .prepare(`INSERT INTO room_grants(grant_hash,wallet,session_hash,neighborhood_id,client_id,generation,scene,audience,key_id,created_at,expires_at)
      SELECT ?,t.wallet,t.session_hash,t.neighborhood_id,t.client_id,t.generation,t.scene,t.audience,?,?,MIN(?,s.expires_at)
      FROM room_tickets t JOIN sessions s ON s.token_hash=t.session_hash AND s.wallet=t.wallet
      JOIN crew_presence c ON c.wallet=t.wallet AND c.neighborhood_id=t.neighborhood_id AND c.client_id=t.client_id AND c.generation=t.generation AND c.room=t.scene
      WHERE t.token_hash=? AND t.audience=? AND t.expires_at>? AND s.expires_at>? AND c.lease_until>?
      AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')}
      ON CONFLICT(wallet) DO UPDATE SET grant_hash=excluded.grant_hash,session_hash=excluded.session_hash,
        neighborhood_id=excluded.neighborhood_id,client_id=excluded.client_id,generation=excluded.generation,scene=excluded.scene,
        audience=excluded.audience,key_id=excluded.key_id,created_at=excluded.created_at,expires_at=excluded.expires_at
      RETURNING *`)
      .bind(
        grantHash,
        keyId,
        now,
        now + ROOM_GRANT_MS,
        ticketHash,
        config.audience,
        now,
        now,
        now,
        now,
      ),
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

async function refreshGrant(
  db: D1Database,
  config: RoomAuthConfig,
  grant: unknown,
  permit: RealmPermit | undefined,
  now: number,
  renew = true,
) {
  if (!validRoomToken(grant))
    throw new RoomAuthError(400, 'Supply a valid room grant.');
  const grantHash = await roomTokenHash(grant);
  const row = await db
    .prepare(
      'SELECT * FROM room_grants WHERE grant_hash=? AND audience=? AND expires_at>?',
    )
    .bind(grantHash, config.audience, now)
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
  // A refresh cannot resurrect an expired membership, take over another tab,
  // fake a fresh position, or renew a concurrently replaced grant.
  const changed = await db
    .prepare(`UPDATE crew_presence AS c SET lease_until=MAX(lease_until,?)
    WHERE c.wallet=? AND c.client_id=? AND c.generation=? AND c.neighborhood_id=? AND c.room=? AND c.lease_until>?
    AND EXISTS(SELECT 1 FROM room_grants g JOIN sessions s ON s.token_hash=g.session_hash AND s.wallet=g.wallet
      WHERE g.grant_hash=? AND g.wallet=c.wallet AND g.client_id=c.client_id AND g.generation=c.generation
      AND g.neighborhood_id=c.neighborhood_id AND g.scene=c.room AND g.expires_at>? AND s.expires_at>?)
    AND ${realmWriteGuard('c', permit)} AND ${sceneGuard('c')} RETURNING lease_until`)
    .bind(
      renew
        ? Math.min(now + MEMBERSHIP_LEASE_MS, context.expiresAt)
        : context.membership.leaseUntil,
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
    )
    .first<{ lease_until: number }>();
  if (!changed)
    throw new RoomAuthError(
      409,
      'Room authority changed. Request a fresh connection.',
    );
  // Refetch after the fence, so an authorized same-generation travel update
  // returns the new position/sequence instead of an old pre-await snapshot.
  return authority(db, bound, permit, now, row.expires_at, grantHash);
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
  // Never accept browser positions through a generic service proxy. The
  // checkpoint operation requires its own coordinator/writer-fencing pass.
  throw new RoomAuthError(400, 'Unknown room service operation.');
}
