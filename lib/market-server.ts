import { ITEMS, type Facility, type ItemId } from './facility.ts';
import {
  canTrade,
  TRADE_QUALIFICATION,
  type ItemListing,
  type MarketPage,
} from './market.ts';
import { NeighborhoodError } from './neighborhoods-server.ts';
import { noBlockSql } from './social.ts';

// The recipient can leave or block the seller after the form was opened.
// Check that relationship in the same transaction that escrows the items.
export async function escrowListing(
  db: D1Database,
  listing: {
    id: string;
    wallet: string;
    item: ItemId;
    quantity: number;
    price: number;
    recipient: string | null;
  },
  before: Facility,
  now = Date.now(),
) {
  const after = structuredClone(before);
  if ((after.inventory[listing.item] ?? 0) < listing.quantity)
    throw new NeighborhoodError(400, 'You do not have enough items.');
  after.inventory[listing.item]! -= listing.quantity;
  after.version++;
  const statements = [
    db
      .prepare(`INSERT OR IGNORE INTO market_listings (id,wallet,item,quantity,price,status,created_at,recipient_wallet)
      SELECT ?,?,?,?,?,'open',?,? WHERE EXISTS(SELECT 1 FROM players seller WHERE seller.wallet=? AND seller.facility_version=?
      AND (? IS NULL OR EXISTS(SELECT 1 FROM crew_presence self JOIN crew_presence peer ON peer.neighborhood_id=self.neighborhood_id
        WHERE self.wallet=seller.wallet AND peer.wallet=? AND peer.wallet<>self.wallet
        AND self.lease_until>unixepoch('now')*1000 AND peer.lease_until>unixepoch('now')*1000
        AND ${noBlockSql('self.wallet', 'peer.wallet')})))`)
      .bind(
        listing.id,
        listing.wallet,
        listing.item,
        listing.quantity,
        listing.price,
        now,
        listing.recipient,
        listing.wallet,
        before.version,
        listing.recipient,
        listing.recipient,
      ),
    db
      .prepare(
        'UPDATE players SET facility_state=?,facility_version=? WHERE wallet=? AND changes()=1',
      )
      .bind(JSON.stringify(after), after.version, listing.wallet),
  ];
  const result = await db.batch(statements);
  if (result[0].meta.changes !== 1)
    throw new NeighborhoodError(
      409,
      'Your inventory or neighbor availability changed. Refresh the market.',
    );
}

export async function listingsPage(
  db: D1Database,
  wallet: string | null,
  facility: Facility | null,
  params: URLSearchParams,
  now = Date.now(),
): Promise<MarketPage> {
  const search = (params.get('q') ?? '').trim().slice(0, 64).toLowerCase();
  const item = params.get('item'),
    scope = params.get('scope') ?? 'all',
    cursor = params.get('cursor');
  if (
    (item && !Object.hasOwn(ITEMS, item)) ||
    !['all', 'mine', 'direct'].includes(scope)
  )
    throw new NeighborhoodError(400, 'Choose a valid market filter.');
  let before: { time: number; id: string } | null = null;
  if (cursor) {
    const match = /^(\d{1,16}):([a-zA-Z0-9-]{8,80})$/.exec(cursor);
    if (!match || !Number.isSafeInteger(Number(match[1])))
      throw new NeighborhoodError(400, 'Reload the market to continue.');
    before = { time: Number(match[1]), id: match[2] };
  }
  const args: (string | number)[] = [
    wallet ?? '',
    wallet ?? '',
    wallet ?? '',
    wallet ?? '',
    wallet ?? '',
    wallet ?? '',
  ];
  let filter = '';
  if (search) {
    const items = Object.entries(ITEMS)
      .filter(([id, value]) =>
        (id + ' ' + value.name.toLowerCase()).includes(search),
      )
      .map(([id]) => id);
    filter +=
      ' AND (instr(lower(p.name),?)>0' +
      (items.length
        ? ' OR l.item IN (' + items.map(() => '?').join(',') + ')'
        : '') +
      ')';
    args.push(search, ...items);
  }
  if (item) {
    filter += ' AND l.item=?';
    args.push(item);
  }
  if (scope === 'mine') {
    filter += ' AND l.wallet=?';
    args.push(wallet ?? '');
  }
  if (scope === 'direct') {
    filter += ' AND l.recipient_wallet=?';
    args.push(wallet ?? '');
  }
  if (before) {
    filter += ' AND (l.created_at<? OR (l.created_at=? AND l.id<?))';
    args.push(before.time, before.time, before.id);
  }
  const rows = await db
    .prepare(`SELECT l.id,p.public_id AS owner,(l.wallet=?) AS mine,p.name,l.item,l.quantity,l.price,l.created_at AS createdAt,(l.recipient_wallet IS NOT NULL) AS direct
    FROM market_listings l JOIN players p ON p.wallet=l.wallet WHERE l.status='open'
    AND (l.recipient_wallet IS NULL OR l.recipient_wallet=? OR l.wallet=?)
    AND (l.wallet=? OR NOT EXISTS(SELECT 1 FROM social_preferences blocked WHERE blocked.blocked=1 AND ((blocked.wallet=? AND blocked.target_wallet=l.wallet) OR (blocked.target_wallet=? AND blocked.wallet=l.wallet))))${filter}
    ORDER BY l.created_at DESC,l.id DESC LIMIT 26`)
    .bind(...args)
    .all<ItemListing>();
  const listings = rows.results
      .slice(0, 25)
      .map((row) => ({ ...row, mine: !!row.mine, direct: !!row.direct })),
    last = listings.at(-1);
  const peers = wallet
    ? await db
        .prepare(
          `SELECT p.public_id AS id,p.name FROM crew_presence self JOIN crew_presence peer ON peer.neighborhood_id=self.neighborhood_id JOIN players p ON p.wallet=peer.wallet WHERE self.wallet=? AND peer.wallet<>self.wallet AND self.lease_until>? AND peer.lease_until>? AND ${noBlockSql('self.wallet', 'peer.wallet')}`,
        )
        .bind(wallet, now, now)
        .all<{ id: string; name: string }>()
    : { results: [] };
  return {
    listings,
    nextCursor:
      rows.results.length > 25 && last ? last.createdAt + ':' + last.id : null,
    canTrade: !!facility && canTrade(facility),
    qualification: TRADE_QUALIFICATION,
    recipients: peers.results,
  };
}
