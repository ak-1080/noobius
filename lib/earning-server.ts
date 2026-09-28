import {
  EARNING_POLICY,
  type EarningAllowance,
  type EarningCharge,
} from './earning-policy.ts';

export class EarningError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const EARNING_BROWSER_COOKIE = 'noobius_earning_browser';

/** Opaque server-issued browser cookie. A random string supplied by a client
 * is not an identity: it must already exist in the server's registry. */
export async function earningBrowser(
  db: D1Database,
  candidate: string | undefined,
  now: number,
) {
  if (candidate && /^[a-f0-9]{64}$/.test(candidate)) {
    const key = await digest(candidate);
    const known = await db
      .prepare('SELECT key FROM earning_browsers WHERE key=? AND expires_at>?')
      .bind(key, now)
      .first();
    if (known) {
      await db
        .prepare('UPDATE earning_browsers SET expires_at=? WHERE key=?')
        .bind(now + EARNING_POLICY.retentionMs, key)
        .run();
      return { key, token: candidate };
    }
  }
  const token =
    crypto.randomUUID().replaceAll('-', '') +
    crypto.randomUUID().replaceAll('-', '');
  const key = await digest(token);
  await db
    .prepare('INSERT INTO earning_browsers(key,expires_at) VALUES (?,?)')
    .bind(key, now + EARNING_POLICY.retentionMs)
    .run();
  return { key, token };
}

/** IPv6 /64 avoids creating a new signup bucket by rotating interface suffixes.
 * This key is a signup throttle only; shared Wi-Fi never merges players. */
export function networkPrefix(ip: string) {
  if (/^::ffff:(?:\d{1,3}\.){3}\d{1,3}$/i.test(ip))
    return networkPrefix(ip.slice(7));
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const pieces = ip.split('.').map(Number);
    if (pieces.every((n) => n <= 255)) return pieces.join('.');
  }
  if (/^[a-fA-F0-9:]+$/.test(ip) && ip.includes(':')) {
    const halves = ip.toLowerCase().split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    if ([...left, ...right].some((s) => !/^[a-f0-9]{1,4}$/.test(s)))
      return null;
    const missing = 8 - left.length - right.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const values = [...left, ...Array(missing).fill('0'), ...right].map((s) =>
      Number.parseInt(s, 16),
    );
    if (values.slice(0, 5).every((n) => n === 0) && values[5] === 0xffff)
      return [
        values[6] >> 8,
        values[6] & 255,
        values[7] >> 8,
        values[7] & 255,
      ].join('.');
    return (
      values
        .slice(0, 4)
        .map((n) => n.toString(16))
        .join(':') + '::/64'
    );
  }
  return null;
}

/** Do not let a client-supplied secondary IPv6 header replace the canonical
 * edge IP. Cloudflare supplies the preserved IPv6 only in Pseudo IPv4
 * overwrite mode, identified by its Class E canonical address. */
export function signupNetworkIp(headers: Headers) {
  const ip = headers.get('cf-connecting-ip');
  if (!ip) return null;
  const prefix = networkPrefix(ip);
  if (prefix && !prefix.includes(':') && Number(prefix.split('.')[0]) >= 240) {
    const ipv6 = headers.get('cf-connecting-ipv6');
    if (!ipv6 || !networkPrefix(ipv6)?.endsWith('::/64'))
      throw new EarningError(
        503,
        'Sign-in protection is temporarily unavailable. Please try again.',
      );
    return ipv6;
  }
  return ip;
}

export async function earningNetwork(db: D1Database, ip: string | null) {
  if (ip === null) return null; // Local fixtures only; hosted caller fails closed.
  const prefix = networkPrefix(ip);
  if (!prefix)
    throw new EarningError(
      503,
      'Sign-in protection is temporarily unavailable. Please try again.',
    );
  await db
    .prepare(
      "INSERT OR IGNORE INTO earning_secrets(key,value) VALUES ('network-salt',?)",
    )
    .bind(crypto.randomUUID() + crypto.randomUUID())
    .run();
  const salt = await db
    .prepare("SELECT value FROM earning_secrets WHERE key='network-salt'")
    .first<{ value: string }>();
  if (!salt)
    throw new EarningError(
      503,
      'Sign-in protection is temporarily unavailable.',
    );
  // No raw IP, wallet key, browser fingerprint or provider secret is logged.
  return digest(salt.value + ':' + prefix);
}

/** Append to the SAME D1 transaction, immediately after its guarded final write.
 * changes()=0 means a replay/race consumed nothing. A quota trigger aborts the
 * entire transaction, including inputs, currency, reports and completed flags. */
export async function earningBatch(
  db: D1Database,
  wallet: string,
  charge: EarningCharge | null,
  statements: D1PreparedStatement[],
  now = Date.now(),
) {
  if (!charge) return db.batch(statements);
  if (
    !/^[a-z-]{1,40}$/.test(charge.source) ||
    ![charge.compute, charge.materials].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    (charge.compute === 0 && charge.materials === 0)
  )
    throw new Error('Invalid issuance charge.');
  try {
    return (
      await db.batch([
        ...statements,
        db
          .prepare(`INSERT INTO earning_events(id,wallet,browser_key,source,compute,materials,created_at)
      SELECT ?,?,(SELECT browser_key FROM earning_accounts WHERE wallet=?),?,?,?,? WHERE changes()=1`)
          .bind(
            crypto.randomUUID(),
            wallet,
            wallet,
            charge.source,
            charge.compute,
            charge.materials,
            now,
          ),
      ])
    ).slice(0, statements.length);
  } catch (error) {
    earningFailure(error);
    throw error;
  }
}

export function earningFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('earning-signup-browser'))
    throw new EarningError(
      429,
      'This browser has opened its three new centers for the last 24 hours. Existing centers can still sign in.',
    );
  if (message.includes('earning-signup-network'))
    throw new EarningError(
      429,
      'Too many new centers have been opened on this network in the last 24 hours. Existing centers can still sign in.',
    );
  if (message.includes('earning-budget-compute'))
    throw new EarningError(
      429,
      'The 6,000 Compute earning allowance for the last 24 hours is reserved. Finish booked work, build or trade. More allowance returns as earlier work leaves that window; linked wallets share it.',
    );
  if (message.includes('earning-budget-materials'))
    throw new EarningError(
      429,
      'Recovered supplies are used for now. Use stored parts, craft or trade. More recovery opens as earlier work leaves the last 24 hours; linked wallets share it.',
    );
  if (message.includes('earning-budget-shifts'))
    throw new EarningError(
      429,
      'Four repair shifts are already booked within the last 24 hours. Finish your current shift or choose other work; linked wallets share this allowance.',
    );
}

export async function earningAllowance(
  db: D1Database,
  wallet: string,
  now = Date.now(),
): Promise<EarningAllowance> {
  const rows = await db
    .prepare(`SELECT
    SUM(CASE WHEN e.wallet=? THEN e.compute ELSE 0 END) AS accountCompute,
    SUM(CASE WHEN e.wallet=? THEN e.materials ELSE 0 END) AS accountMaterials,
    SUM(CASE WHEN e.wallet=? AND e.source='shift-start' THEN 1 ELSE 0 END) AS accountShifts,
    SUM(e.compute) AS poolCompute, SUM(e.materials) AS poolMaterials,
    SUM(CASE WHEN e.source='shift-start' THEN 1 ELSE 0 END) AS poolShifts,
    MIN(e.created_at) AS oldest,
    EXISTS(SELECT 1 FROM earning_accounts other WHERE other.wallet<>? AND other.browser_key=(SELECT browser_key FROM earning_accounts WHERE wallet=?)) AS shared
    FROM earning_events e WHERE e.created_at>? AND (e.wallet=? OR e.browser_key=(SELECT browser_key FROM earning_accounts WHERE wallet=?))`)
    .bind(
      wallet,
      wallet,
      wallet,
      wallet,
      wallet,
      now - EARNING_POLICY.windowMs,
      wallet,
      wallet,
    )
    .first<{
      accountCompute: number;
      accountMaterials: number;
      accountShifts: number;
      poolCompute: number;
      poolMaterials: number;
      poolShifts: number;
      oldest: number | null;
      shared: number;
    }>();
  if (!rows) throw new Error('Earning allowance unavailable.');
  return {
    compute: Math.max(
      0,
      EARNING_POLICY.compute -
        Math.max(rows.accountCompute ?? 0, rows.poolCompute ?? 0),
    ),
    materials: Math.max(
      0,
      EARNING_POLICY.materials -
        Math.max(rows.accountMaterials ?? 0, rows.poolMaterials ?? 0),
    ),
    shifts: Math.max(
      0,
      EARNING_POLICY.shifts -
        Math.max(rows.accountShifts ?? 0, rows.poolShifts ?? 0),
    ),
    nextAt: rows.oldest === null ? null : rows.oldest + EARNING_POLICY.windowMs,
    shared: !!rows.shared,
  };
}
