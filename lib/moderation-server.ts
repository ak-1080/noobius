import { accountKey } from './wallet-identity.ts';
import { NeighborhoodError } from './neighborhoods-server.ts';
import {
  REPORT_FILTERS,
  type ModerationReport,
  type ReportQueue,
} from './moderation.ts';

// Configuration is server-owned. Invalid configuration fails closed as a whole;
// a progression license, public name or client-supplied role never grants access.
export function moderatorAccounts(
  values: Record<string, unknown>,
): Set<string> {
  const raw = values.NOOBIUS_MODERATOR_WALLETS;
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 5000)
    return new Set();
  try {
    const entries = raw.split(',').map((entry) => entry.trim());
    if (entries.length > 50 || entries.some((entry) => !entry))
      return new Set();
    return new Set(
      entries.map((entry) =>
        entry.startsWith('solana:')
          ? accountKey(entry.slice(7), 'solana')
          : accountKey(entry, 'evm'),
      ),
    );
  } catch {
    return new Set();
  }
}

async function requireModerator(
  db: D1Database,
  wallet: string | null,
  values: Record<string, unknown>,
) {
  if (!wallet)
    throw new NeighborhoodError(
      401,
      'Connect your moderator wallet from the game first.',
    );
  if (!moderatorAccounts(values).has(wallet))
    throw new NeighborhoodError(
      403,
      'This account does not have report-review access.',
    );
  const row = await db
    .prepare('SELECT public_id FROM players WHERE wallet=?')
    .bind(wallet)
    .first<{ public_id: string | null }>();
  if (!row?.public_id || !/^[a-f0-9]{32}$/.test(row.public_id))
    throw new NeighborhoodError(
      403,
      'Reconnect your moderator wallet from the game first.',
    );
  return row.public_id;
}

export async function reportQueue(
  db: D1Database,
  wallet: string | null,
  values: Record<string, unknown>,
  params: URLSearchParams,
): Promise<ReportQueue> {
  const operatorId = await requireModerator(db, wallet, values);
  const status = params.get('status') ?? 'open';
  if (!REPORT_FILTERS.includes(status as (typeof REPORT_FILTERS)[number]))
    throw new NeighborhoodError(400, 'Choose an available report filter.');
  const cursor = params.get('cursor');
  let beforeTime = Number.MAX_SAFE_INTEGER,
    beforeId = '';
  if (cursor) {
    const parts = cursor.match(/^(\d{1,16}):([a-f0-9-]{36})$/);
    if (!parts || !Number.isSafeInteger(Number(parts[1])))
      throw new NeighborhoodError(400, 'That report page is no longer valid.');
    beforeTime = Number(parts[1]);
    beforeId = parts[2];
  }
  const rows = await db
    .prepare(`SELECT r.id, reporter.public_id AS reporter, reporter.name AS reporterName,
    author.public_id AS author, author.name AS authorName, r.message, r.reason,
    r.created_at AS createdAt, r.status, r.reviewed_by AS reviewedBy,
    r.reviewed_at AS reviewedAt, r.review_note AS reviewNote
    FROM player_reports r JOIN players reporter ON reporter.wallet=r.wallet
    JOIN players author ON author.wallet=r.target_wallet
    WHERE r.status=? AND (r.created_at<? OR (r.created_at=? AND r.id<?))
    ORDER BY r.created_at DESC,r.id DESC LIMIT 26`)
    .bind(status, beforeTime, beforeTime, beforeId)
    .all<ModerationReport>();
  const reports = rows.results.slice(0, 25),
    last = reports.at(-1);
  return {
    operatorId,
    reports,
    nextCursor:
      rows.results.length > 25 && last ? `${last.createdAt}:${last.id}` : null,
  };
}

export async function reviewReport(
  db: D1Database,
  wallet: string | null,
  values: Record<string, unknown>,
  input: { id?: unknown; decision?: unknown; note?: unknown },
  now = Date.now(),
) {
  const moderatorId = await requireModerator(db, wallet, values);
  if (
    typeof input.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(input.id) ||
    typeof input.decision !== 'string' ||
    !['dismissed', 'removed'].includes(input.decision) ||
    typeof input.note !== 'string'
  )
    throw new NeighborhoodError(
      400,
      'Choose a report, decision and review note.',
    );
  const note = input.note.trim();
  if (
    note.length < 3 ||
    note.length > 500 ||
    Array.from(note).some((character) => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    throw new NeighborhoodError(
      400,
      'Add a review note between 3 and 500 characters.',
    );
  const update = db
    .prepare(
      `UPDATE player_reports SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND status='open'`,
    )
    .bind(input.decision, moderatorId, now, note, input.id);
  const statements = [update];
  if (input.decision === 'removed')
    statements.push(
      db
        .prepare(`DELETE FROM crew_messages
    WHERE id=(SELECT message_id FROM player_reports WHERE id=? AND status='removed')
    AND wallet=(SELECT target_wallet FROM player_reports WHERE id=?) AND changes()=1`)
        .bind(input.id, input.id),
    );
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1)
    throw new NeighborhoodError(
      409,
      'This report was already reviewed or is no longer available. Refresh the queue.',
    );
  return {
    ok: true,
    message:
      input.decision === 'removed'
        ? 'Message removed. The report and review note are retained.'
        : 'Report dismissed. The message is unchanged.',
  };
}
