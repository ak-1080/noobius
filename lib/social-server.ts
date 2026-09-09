import {
  NeighborhoodError,
  requireMembership,
} from './neighborhoods-server.ts';
import {
  REPORT_REASONS,
  noBlockSql,
  type SocialSnapshot,
  type RecentNeighbor,
} from './social.ts';
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
