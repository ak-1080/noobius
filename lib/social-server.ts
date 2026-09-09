import {
  NeighborhoodError,
  requireMembership,
  type Controller,
} from './neighborhoods-server.ts';
import { realmWriteGuard, type RealmPermit } from './realm-authority.ts';
import {
  REPORT_REASONS,
  noBlockSql,
  type SocialSnapshot,
  type RecentNeighbor,
  QUICK_PINGS,
  isCrewPing,
  SIGNAL_LIFETIME_MS,
  type CrewSignal,
  type CrewSignalPacket,
} from './social.ts';

export async function sendCrewMessage(
  db: D1Database,
  wallet: string,
  controller: Controller,
  body: { ping?: unknown; message?: unknown },
  now = Date.now(),
  permit?: RealmPermit,
) {
  const membership = await requireMembership(db, wallet, controller, now);
  if (body.ping !== undefined && !isCrewPing(body.ping))
    throw new NeighborhoodError(400, 'Choose a crew signal.');
  const ping = isCrewPing(body.ping) ? body.ping : null;
  const message = ping ? QUICK_PINGS[ping] : body.message;
  if (typeof message !== 'string')
    throw new NeighborhoodError(400, 'Write a message.');
  const text = message.trim();
  if (
    !text.length ||
    text.length > 180 ||
    text.split('').some((c) => c.charCodeAt(0) < 32)
  )
    throw new NeighborhoodError(400, 'Use 1–180 characters.');
  const id = crypto.randomUUID();
  const inserted = await db
    .prepare(
      `INSERT INTO crew_messages (id,wallet,message,created_at,neighborhood_id,ping,signal_scene)
    SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM crew_messages WHERE wallet=? AND created_at>?)
    AND EXISTS(SELECT 1 FROM crew_presence c WHERE c.wallet=? AND c.client_id=? AND c.generation=?
      AND c.neighborhood_id=? AND c.room=? AND c.lease_until>? AND ${realmWriteGuard('c', permit)})`,
    )
    .bind(
      id,
      wallet,
      text,
      now,
      membership.neighborhood_id,
      ping,
      ping ? membership.room : null,
      wallet,
      now - 5000,
      wallet,
      membership.client_id,
      membership.generation,
      membership.neighborhood_id,
      membership.room,
      now,
    )
    .run();
  if (inserted.meta.changes !== 1)
    throw new NeighborhoodError(
      429,
      'Wait a few seconds before sending another message.',
    );
  return id;
}

// Piggyback on authenticated room metadata, never on an additional fast chat poll.
export async function crewSignalPacket(
  db: D1Database,
  wallet: string,
  neighborhood: string,
  now = Date.now(),
): Promise<CrewSignalPacket> {
  const rows = await db
    .prepare(
      `SELECT m.id,p.public_id AS author,p.name,m.ping,m.signal_scene AS scene,m.created_at AS createdAt
    FROM crew_messages m JOIN players p ON p.wallet=m.wallet
    JOIN players viewer ON viewer.wallet=?
    WHERE m.neighborhood_id=? AND m.created_at>? AND m.created_at<=? AND m.ping IS NOT NULL
      AND ${noBlockSql('viewer.wallet', 'p.wallet')}
      AND NOT EXISTS(SELECT 1 FROM social_preferences mute WHERE mute.wallet=viewer.wallet
        AND mute.target_wallet=p.wallet AND mute.muted=1)
    ORDER BY m.created_at DESC,m.id DESC LIMIT 20`,
    )
    .bind(wallet, neighborhood, now - SIGNAL_LIFETIME_MS, now)
    .all<CrewSignal>();
  return {
    observedAt: now,
    items: rows.results.filter((s) => isCrewPing(s.ping) && !!s.scene),
  };
}
export async function rememberNeighbors(
  db: D1Database,
  wallet: string,
  neighborhood: string,
  now = Date.now(),
) {
  const peers = await db
    .prepare(
      'SELECT wallet FROM crew_presence WHERE neighborhood_id=? AND wallet<>? AND lease_until>?',
    )
    .bind(neighborhood, wallet, now)
    .all<{ wallet: string }>();
  if (!peers.results.length) return;
  await db.batch(
    peers.results.flatMap((p) =>
      [
        [wallet, p.wallet],
        [p.wallet, wallet],
      ].map(([a, b]) =>
        db
          .prepare(
            'INSERT INTO recent_neighbors(wallet,target_wallet,last_seen) VALUES (?,?,?) ON CONFLICT(wallet,target_wallet) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen)',
          )
          .bind(a, b, now),
      ),
    ),
  );
}
export async function socialSnapshot(
  db: D1Database,
  wallet: string,
  now = Date.now(),
): Promise<SocialSnapshot> {
  const [preferences, recent] = await Promise.all([
    db
      .prepare(
        'SELECT p.public_id AS id,p.name,s.muted,s.blocked FROM social_preferences s JOIN players p ON p.wallet=s.target_wallet WHERE s.wallet=? AND (s.muted=1 OR s.blocked=1)',
      )
      .bind(wallet)
      .all<{ id: string; name: string; muted: number; blocked: number }>(),
    db
      .prepare(
        `SELECT p.public_id AS id,p.name,c.neighborhood_id AS neighborhoodId,n.realm FROM recent_neighbors r JOIN players p ON p.wallet=r.target_wallet LEFT JOIN crew_presence c ON c.wallet=p.wallet AND c.lease_until>? LEFT JOIN neighborhoods n ON n.id=c.neighborhood_id WHERE r.wallet=? AND ${noBlockSql('r.wallet', 'p.wallet')} ORDER BY r.last_seen DESC,p.public_id LIMIT 12`,
      )
      .bind(now, wallet)
      .all<RecentNeighbor>(),
  ]);
  return {
    preferences: preferences.results.map((p) => ({
      ...p,
      muted: !!p.muted,
      blocked: !!p.blocked,
    })),
    recent: recent.results,
  };
}
export async function setSocialPreference(
  db: D1Database,
  wallet: string,
  target: string,
  kind: string,
  enabled: unknown,
) {
  if (
    !/^[a-f0-9]{32}$/.test(target) ||
    !['mute', 'block'].includes(kind) ||
    typeof enabled !== 'boolean'
  )
    throw new NeighborhoodError(400, 'Choose a valid player control.');
  const peer = await db
    .prepare(`SELECT p.wallet FROM players p WHERE p.public_id=? AND p.wallet<>? AND (
    EXISTS(SELECT 1 FROM recent_neighbors r WHERE r.wallet=? AND r.target_wallet=p.wallet) OR
    EXISTS(SELECT 1 FROM social_preferences s WHERE s.wallet=? AND s.target_wallet=p.wallet))`)
    .bind(target, wallet, wallet, wallet)
    .first<{ wallet: string }>();
  if (!peer)
    throw new NeighborhoodError(404, 'That player is not in your recent crew.');
  const column = kind === 'mute' ? 'muted' : 'blocked';
  await db
    .prepare(
      `INSERT INTO social_preferences(wallet,target_wallet,${column}) VALUES (?,?,?) ON CONFLICT(wallet,target_wallet) DO UPDATE SET ${column}=excluded.${column}`,
    )
    .bind(wallet, peer.wallet, enabled ? 1 : 0)
    .run();
  return socialSnapshot(db, wallet);
}
export async function reportMessage(
  db: D1Database,
  wallet: string,
  messageId: string,
  reason: unknown,
) {
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number]))
    throw new NeighborhoodError(400, 'Choose a reason for your report.');
  const self = await requireMembership(db, wallet);
  const message = await db
    .prepare(
      'SELECT wallet,message FROM crew_messages WHERE id=? AND neighborhood_id=? AND wallet<>?',
    )
    .bind(messageId, self.neighborhood_id, wallet)
    .first<{ wallet: string; message: string }>();
  if (!message)
    throw new NeighborhoodError(
      404,
      'That message is not in your neighborhood.',
    );
  await db
    .prepare(
      'INSERT OR IGNORE INTO player_reports(id,wallet,target_wallet,message_id,message,reason,created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      wallet,
      message.wallet,
      messageId,
      message.message,
      reason as string,
      Date.now(),
    )
    .run();
}
