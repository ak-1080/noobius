import { EMERGENCY_STATIONS, eventAt, validRoom } from './multiplayer';
import { facilityReceipt } from './game-feedback';
import { env } from 'cloudflare:workers';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import {
  activateJob,
  answerJob,
  hintJob,
  newShift,
  UPGRADES,
  type Profile,
  type Shift,
  type JobType,
  type Equipment,
} from './game';
import {
  applyFacility,
  newFacility,
  normalizeFacility,
  repairLoot,
  ITEMS,
  ZONES,
  itemCount,
  type Facility,
  type FacilityAction,
  type ItemId,
} from './facility';
const SITE_ORIGIN = 'https://noobius-compute-crew.rivd609.chatgpt.site';
const SESSION_COOKIE = 'noobius_session',
  CHALLENGE_COOKIE = 'noobius_challenge';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const db = () => {
  if (!env.DB)
    throw new ApiError(
      503,
      'The facility is temporarily offline. Please try again.',
    );
  return env.DB;
};
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
const token = () =>
  crypto.randomUUID().replaceAll('-', '') +
  crypto.randomUUID().replaceAll('-', '');
function cookieValue(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + '='))
    ?.slice(name.length + 1);
}
function cookie(request: Request, name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' || request.headers.get('origin') === SITE_ORIGIN ? '; Secure' : ''}`;
}
function origin(request: Request) {
  const incoming = request.headers.get('origin');
  if (
    !incoming ||
    ![new URL(request.url).origin, SITE_ORIGIN].includes(incoming)
  )
    throw new ApiError(
      403,
      'This request did not originate from the facility.',
    );
  return incoming;
}
async function bodyOf(request: Request) {
  origin(request);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApiError(415, 'Send JSON to this endpoint.');
  if (Number(request.headers.get('content-length') ?? 0) > 12000)
    throw new ApiError(413, 'Request too large.');
  const raw = await request.text();
  if (raw.length > 12000) throw new ApiError(413, 'Request too large.');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new ApiError(400, 'Invalid request.');
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'Invalid request.');
  }
}
async function rate(
  request: Request,
  action: string,
  limit = 120,
  wallet?: string,
) {
  const now = Date.now(),
    key = await hash(
      `${wallet ? 'wallet:' + wallet : (request.headers.get('cf-connecting-ip') ?? 'local')}:${action}:${Math.floor(now / 60000)}`,
    );
  const row = await db()
    .prepare(
      'INSERT INTO rate_limits (key,count,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(key, now + 120000)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit)
    throw new ApiError(429, 'A little too fast. Please try again in a minute.');
  if (Math.random() < 0.02)
    await db().batch([
      db().prepare('DELETE FROM rate_limits WHERE resets_at < ?').bind(now),
      db().prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now),
      db().prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      db()
        .prepare('DELETE FROM campus_work WHERE event < ?')
        .bind(eventAt(now) - 144),
      db()
        .prepare('DELETE FROM campus_rewards WHERE created_at < ?')
        .bind(now - 86400000),
    ]);
}
type PlayerRow = {
  wallet: string;
  name: string;
  credits: number;
  xp: number;
  shifts: number;
  best_score: number;
  scanner: number;
  visor: number;
  tracer: number;
  facility_state: string | null;
  facility_version: number;
};
async function player(wallet: string): Promise<Profile> {
  let p = await db()
    .prepare('SELECT * FROM players WHERE wallet=?')
    .bind(wallet)
    .first<PlayerRow>();
  if (!p) throw new ApiError(401, 'Please reconnect your wallet.');
  if (!p.facility_state) {
    await db()
      .prepare(
        'UPDATE players SET facility_state=? WHERE wallet=? AND facility_state IS NULL',
      )
      .bind(JSON.stringify(newFacility()), wallet)
      .run();
    p = (await db()
      .prepare('SELECT * FROM players WHERE wallet=?')
      .bind(wallet)
      .first<PlayerRow>())!;
  }
  const saved = JSON.parse(p.facility_state!);
  if (saved.economyVersion !== 2) {
    const migrated = { ...saved, economyVersion: 2, compute: 0 };
    await db()
      .prepare(
        'UPDATE players SET credits=credits+?,facility_state=?,facility_version=facility_version+1 WHERE wallet=? AND facility_version=? AND facility_state=?',
      )
      .bind(
        Math.max(0, Number(saved.compute) || 0),
        JSON.stringify(migrated),
        wallet,
        p.facility_version,
        p.facility_state,
      )
      .run();
    return player(wallet);
  }
  if (saved.tycoonVersion !== 1) {
    // Commit the rate transition before returning it to the client. Otherwise
    // a legacy read could display new-rate earnings that a later write reverts.
    const migrated = normalizeFacility(saved, Date.now());
    await db()
      .prepare(
        'UPDATE players SET facility_state=?,facility_version=facility_version+1 WHERE wallet=? AND facility_version=? AND facility_state=?',
      )
      .bind(
        JSON.stringify(migrated),
        wallet,
        p.facility_version,
        p.facility_state,
      )
      .run();
    return player(wallet);
  }
  return {
    wallet: p.wallet,
    name: p.name,
    credits: p.credits,
    xp: p.xp,
    shifts: p.shifts,
    bestScore: p.best_score,
    equipment: { scanner: !!p.scanner, visor: !!p.visor, tracer: !!p.tracer },
    facility: normalizeFacility({
      ...JSON.parse(p.facility_state!),
      version: p.facility_version,
      compute: p.credits,
    }),
  };
}
async function identity(request: Request) {
  const t = cookieValue(request, SESSION_COOKIE);
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const s = await db()
    .prepare('SELECT wallet FROM sessions WHERE token_hash=? AND expires_at>?')
    .bind(await hash(t), Date.now())
    .first<{ wallet: string }>();
  return s?.wallet ?? null;
}
async function getRun(wallet: string, id?: string) {
  const row = id
    ? await db()
        .prepare('SELECT state FROM shifts WHERE wallet=? AND id=?')
        .bind(wallet, id)
        .first<{ state: string }>()
    : await db()
        .prepare(
          'SELECT state FROM shifts WHERE wallet=? ORDER BY started_at DESC LIMIT 1',
        )
        .bind(wallet)
        .first<{ state: string }>();
  return row ? (JSON.parse(row.state) as Shift) : null;
}
function result(data: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, {
    status,
    headers: responseHeaders,
  });
}
async function responseFor(wallet: string, shift?: Shift | null) {
  return {
    profile: await player(wallet),
    shift: shift === undefined ? await getRun(wallet) : shift,
  };
}
async function saveRun(wallet: string, previous: Shift, next: Shift) {
  const mutation = token(),
    deltaCredits =
      next.credits -
      previous.credits +
      15 *
        next.jobs.filter(
          (j) =>
            j.status === 'repaired' &&
            previous.jobs.find((p) => p.id === j.id)?.status !== 'repaired',
        ).length,
    deltaXp = next.xp - previous.xp,
    finished = !previous.completedAt && !!next.completedAt;
  const repaired = next.jobs.filter(
    (j) =>
      j.status === 'repaired' &&
      previous.jobs.find((p) => p.id === j.id)?.status !== 'repaired',
  );
  const p = await player(wallet),
    oldFacility = p.facility!;
  let facility = oldFacility;
  for (const job of repaired) facility = repairLoot(facility, job.id);
  const results = await db().batch([
    db()
      .prepare(
        'UPDATE shifts SET state=?,version=?,mutation=?,completed_at=? WHERE id=? AND wallet=? AND version=? AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=?)',
      )
      .bind(
        JSON.stringify(next),
        next.version,
        mutation,
        next.completedAt,
        next.id,
        wallet,
        previous.version,
        wallet,
        oldFacility.version,
      ),
    db()
      .prepare(
        'UPDATE players SET credits=credits+?,xp=xp+?,shifts=shifts+?,best_score=MAX(best_score,?),facility_state=?,facility_version=? WHERE wallet=? AND EXISTS(SELECT 1 FROM shifts WHERE id=? AND mutation=?)',
      )
      .bind(
        deltaCredits,
        deltaXp,
        finished ? 1 : 0,
        finished ? next.score : 0,
        JSON.stringify(facility),
        facility.version,
        wallet,
        next.id,
        mutation,
      ),
  ]);
  if (results[0].meta.changes !== 1)
    throw new ApiError(409, 'Your shift changed in another tab. Please retry.');
  return next;
}
export async function handleGame(request: Request, action: string) {
  if (request.method === 'GET') {
    await rate(
      request,
      'reads',
      1200,
      action === 'campus'
        ? ((await identity(request)) ?? undefined)
        : undefined,
    );
    if (action === 'leaderboard') {
      const rows = await db()
        .prepare(
          'SELECT name,best_score AS score,shifts,xp FROM players WHERE shifts>0 ORDER BY best_score DESC,created_at ASC LIMIT 20',
        )
        .all();
      return result({ entries: rows.results });
    }
    if (action === 'campus') {
      const wallet = await identity(request);
      const room = new URL(request.url).searchParams.get('room') ?? 'campus-1';
      if (!validRoom(room))
        throw new ApiError(400, 'Choose a campus or a facility.');
      const people = await db()
        .prepare(
          'SELECT substr(p.wallet,3,16) AS id,p.name,c.x,c.z,p.facility_state FROM crew_presence c JOIN players p ON p.wallet=c.wallet WHERE c.room=? AND c.updated_at>? LIMIT 30',
        )
        .bind(room, Date.now() - 10000)
        .all<any>();
      const now = Date.now(),
        event = eventAt(now);
      const work = await db()
        .prepare(
          'SELECT w.*,p.name FROM campus_work w JOIN players p ON p.wallet=w.wallet WHERE w.room=? AND w.event=?',
        )
        .bind(room, event)
        .all<any>();
      const reward = wallet
        ? await db()
            .prepare('SELECT id FROM campus_rewards WHERE id=?')
            .bind(`${room}:${event}:${wallet}`)
            .first()
        : null;
      return result({
        people: people.results.map((p) => ({
          id: p.id,
          name: p.name,
          x: p.x,
          z: p.z,
          outfit: JSON.parse(p.facility_state || '{}').outfit ?? 'classic',
          accessory: JSON.parse(p.facility_state || '{}').accessory ?? 'none',
        })),
        world: {
          room,
          event,
          endsAt: (event + 1) * 600000,
          serverNow: now,
          claimed: !!reward,
          work: work.results.map((w) => ({
            station: w.station,
            name: w.name,
            mine: w.wallet === wallet,
            startedAt: w.started_at,
            completedAt: w.completed_at,
          })),
        },
      });
    }
    if (action === 'directory') {
      const rows = await db()
        .prepare(
          'SELECT substr(p.wallet,3,16) AS id,p.name, p.facility_state FROM players p JOIN crew_presence c ON c.wallet=p.wallet WHERE c.updated_at>? ORDER BY c.updated_at DESC LIMIT 30',
        )
        .bind(Date.now() - 120000)
        .all<any>();
      return result({
        facilities: rows.results.map((p) => ({
          id: p.id,
          name: p.name,
          racks: Object.values(
            JSON.parse(p.facility_state || '{}').builds || {},
          ).reduce((a: any, b: any) => a + b, 0),
        })),
      });
    }
    if (action === 'visit') {
      const owner = new URL(request.url).searchParams.get('owner');
      if (!owner || !/^[a-fA-F0-9]{16}$/.test(owner))
        throw new ApiError(400, 'Choose a facility from the directory.');
      const row = await db()
        .prepare(
          'SELECT name,facility_state FROM players WHERE substr(wallet,3,16)=?',
        )
        .bind(owner)
        .first<any>();
      if (!row) throw new ApiError(404, 'That facility is unavailable.');
      const f = normalizeFacility(JSON.parse(row.facility_state || '{}'));
      return result({
        owner,
        name: row.name,
        facility: {
          ...newFacility(),
          builds: f.builds,
          unlocked: f.unlocked,
          power: f.power,
          cooling: f.cooling,
          visiting: true,
        },
      });
    }
    if (action === 'messages') {
      const rows = await db()
        .prepare(
          'SELECT m.id,p.name,m.message,m.created_at FROM crew_messages m JOIN players p ON p.wallet=m.wallet ORDER BY m.created_at DESC LIMIT 40',
        )
        .all();
      return result({ messages: rows.results.reverse() });
    }
    if (action === 'listings') {
      const wallet = await identity(request);
      const rows = await db()
        .prepare(
          "SELECT l.id,substr(l.wallet,3,16) AS owner,p.name,l.item,l.quantity,l.price FROM market_listings l JOIN players p ON p.wallet=l.wallet WHERE l.status='open' AND (l.wallet=? OR l.id IN (SELECT id FROM market_listings WHERE status='open' ORDER BY created_at DESC LIMIT 50)) ORDER BY l.created_at DESC",
        )
        .bind(wallet ?? '')
        .all();
      return result({ listings: rows.results });
    }
    if (action === 'profile') {
      const wallet = await identity(request);
      return result(
        wallet ? await responseFor(wallet) : { profile: null, shift: null },
      );
    }
    throw new ApiError(404, 'Unknown endpoint.');
  }
  const body = await bodyOf(request);
  await rate(
    request,
    action === 'nonce' || action === 'verify'
      ? 'auth'
      : action === 'presence'
        ? 'presence-ingress'
        : 'game',
    action === 'nonce' || action === 'verify'
      ? 20
      : action === 'presence'
        ? 10000
        : 600,
  );
  if (action === 'nonce') {
    if (
      typeof body.address !== 'string' ||
      !isAddress(body.address) ||
      !Number.isSafeInteger(body.chainId) ||
      Number(body.chainId) < 1
    )
      throw new ApiError(400, 'Select an Ethereum-compatible wallet account.');
    const wallet = getAddress(body.address),
      secret = token(),
      now = Date.now(),
      siteOrigin = origin(request);
    const message = createSiweMessage({
      address: wallet,
      chainId: Number(body.chainId),
      domain: new URL(siteOrigin).host,
      uri: siteOrigin,
      version: '1',
      nonce: token(),
      issuedAt: new Date(now),
      expirationTime: new Date(now + 300000),
      statement:
        'Sign in to Noobius to save your game progress. This does not authorize transactions or token spending.',
    });
    const old = cookieValue(request, CHALLENGE_COOKIE);
    if (old)
      await db()
        .prepare('DELETE FROM challenges WHERE token_hash=?')
        .bind(await hash(old))
        .run();
    await db()
      .prepare(
        'INSERT INTO challenges (token_hash,wallet,message,expires_at) VALUES (?,?,?,?)',
      )
      .bind(await hash(secret), wallet.toLowerCase(), message, now + 300000)
      .run();
    return result({ message }, 200, {
      'Set-Cookie': cookie(request, CHALLENGE_COOKIE, secret, 300),
    });
  }
  if (action === 'verify') {
    const secret = cookieValue(request, CHALLENGE_COOKIE);
    if (
      !secret ||
      typeof body.signature !== 'string' ||
      !/^0x[a-fA-F0-9]{130}$/.test(body.signature)
    )
      throw new ApiError(
        401,
        'The login expired or the wallet signature is unsupported. Connect again using a standard wallet account.',
      );
    const tokenHash = await hash(secret),
      challenge = await db()
        .prepare(
          'SELECT wallet,message FROM challenges WHERE token_hash=? AND expires_at>?',
        )
        .bind(tokenHash, Date.now())
        .first<{ wallet: `0x${string}`; message: string }>();
    if (!challenge)
      throw new ApiError(
        401,
        'Your login message expired. Please connect again.',
      );
    const expectedDomain = new URL(origin(request)).host;
    if (!challenge.message.startsWith(expectedDomain + ' wants you to sign in'))
      throw new ApiError(401, 'This login belongs to another site.');
    let valid = false;
    try {
      valid = await verifyMessage({
        address: challenge.wallet,
        message: challenge.message,
        signature: body.signature as `0x${string}`,
      });
    } catch {
      /* invalid signature */
    }
    if (!valid)
      throw new ApiError(
        401,
        'The signature does not match this wallet. Please try again.',
      );
    const consumed = await db()
      .prepare(
        'DELETE FROM challenges WHERE token_hash=? AND expires_at>? RETURNING wallet',
      )
      .bind(tokenHash, Date.now())
      .first<{ wallet: string }>();
    if (!consumed)
      throw new ApiError(
        401,
        'This login message was already used. Connect again.',
      );
    const session = token(),
      now = Date.now();
    await db().batch([
      db()
        .prepare(
          'INSERT OR IGNORE INTO players (wallet,name,created_at) VALUES (?,?,?)',
        )
        .bind(
          challenge.wallet,
          'Noob ' + challenge.wallet.slice(-5).toUpperCase(),
          now,
        ),
      db()
        .prepare(
          'INSERT INTO sessions (token_hash,wallet,expires_at) VALUES (?,?,?)',
        )
        .bind(await hash(session), challenge.wallet, now + 7 * 86400000),
    ]);
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    headers.append(
      'Set-Cookie',
      cookie(request, SESSION_COOKIE, session, 604800),
    );
    headers.append('Set-Cookie', cookie(request, CHALLENGE_COOKIE, '', 0));
    return Response.json(await responseFor(challenge.wallet), { headers });
  }
  if (action === 'logout') {
    const current = await identity(request);
    if (current && body.expectedWallet !== current)
      throw new ApiError(
        401,
        'Your wallet session changed in another tab. Reconnect before continuing.',
      );
    const secret = cookieValue(request, SESSION_COOKIE);
    if (secret)
      await db()
        .prepare('DELETE FROM sessions WHERE token_hash=?')
        .bind(await hash(secret))
        .run();
    return result({ ok: true }, 200, {
      'Set-Cookie': cookie(request, SESSION_COOKIE, '', 0),
    });
  }
  const wallet = await identity(request);
  if (!wallet)
    throw new ApiError(
      401,
      'Your shift session ended. Reconnect your wallet to continue.',
    );
  if (body.expectedWallet !== wallet)
    throw new ApiError(
      401,
      'Your wallet session changed in another tab. Reconnect before continuing.',
    );

  await rate(
    request,
    action === 'presence' ? 'presence' : 'actions',
    action === 'presence' ? 150 : 120,
    wallet,
  );

  if (action === 'facility') {
    const p = await player(wallet),
      previous = p.facility!,
      a = body.action as FacilityAction;
    if (!a || typeof a.type !== 'string' || typeof a.requestId !== 'string')
      throw new ApiError(400, 'Choose a valid facility action.');
    const updated = applyFacility(previous, a, p.credits);
    if (updated.facility.version !== previous.version) {
      const r = await db()
        .prepare(
          'UPDATE players SET facility_state=?,facility_version=?,credits=credits+?,xp=xp+? WHERE wallet=? AND facility_version=? AND credits=?',
        )
        .bind(
          JSON.stringify(updated.facility),
          updated.facility.version,
          updated.credits,
          updated.xp,
          wallet,
          previous.version,
          p.credits,
        )
        .run();
      if (r.meta.changes !== 1)
        throw new ApiError(
          409,
          'Your facility changed in another tab. Please retry.',
        );
    }
    return result({
      ...(await responseFor(wallet)),
      message: updated.message,
      receipt: facilityReceipt(previous, a, updated),
      actionApplied: !previous.requests.includes(a.requestId),
    });
  }
  if (action === 'presence') {
    const room = body.room ?? 'campus-1';
    if (!validRoom(room)) throw new ApiError(400, 'Choose a valid room.');
    const x = Number(body.x),
      z = Number(body.z);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      Math.abs(x) > 34 ||
      z > 23 ||
      z < -43
    )
      throw new ApiError(400, 'Invalid campus position.');
    const joined = await db()
      .prepare(
        'INSERT INTO crew_presence (wallet,x,z,updated_at,room) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM crew_presence WHERE room=? AND updated_at>? AND wallet<>?)<30 ON CONFLICT(wallet) DO UPDATE SET x=excluded.x,z=excluded.z,updated_at=excluded.updated_at,room=excluded.room',
      )
      .bind(
        wallet,
        Math.round(x * 10) / 10,
        Math.round(z * 10) / 10,
        Date.now(),
        room,
        room,
        Date.now() - 10000,
        wallet,
      )
      .run();
    if (!joined.meta.changes)
      throw new ApiError(409, 'This room is full. Choose another campus.');
    return result({ ok: true });
  }
  if (action === 'crew-work' || action === 'crew-claim') {
    const room = body.room;
    if (typeof room !== 'string' || !/^campus-[1-3]$/.test(room))
      throw new ApiError(400, 'Join a shared campus first.');
    const now = Date.now(),
      event = eventAt(now);
    if (body.event !== event)
      throw new ApiError(
        409,
        'A new emergency has started. Reopen the job board.',
      );
    const presence = await db()
      .prepare(
        'SELECT * FROM crew_presence WHERE wallet=? AND room=? AND updated_at>?',
      )
      .bind(wallet, room, now - 10000)
      .first<any>();
    if (!presence)
      throw new ApiError(400, 'Enter this campus before joining its job.');
    if (action === 'crew-work') {
      const station = EMERGENCY_STATIONS.find((s) => s.id === body.station);
      if (
        !station ||
        Math.hypot(presence.x - station.x, presence.z - station.z) > 5
      )
        throw new ApiError(400, 'Walk to the highlighted station first.');
      const id = `${room}:${event}:${station.id}`;
      if (body.finish !== true) {
        const r = await db()
          .prepare(
            'INSERT INTO campus_work (id,room,event,station,wallet,started_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET wallet=excluded.wallet,started_at=excluded.started_at WHERE campus_work.completed_at IS NULL AND campus_work.started_at<?',
          )
          .bind(id, room, event, station.id, wallet, now, now - 30000)
          .run();
        if (!r.meta.changes)
          throw new ApiError(
            409,
            'A crewmate is working here, or this station is already repaired.',
          );
      } else {
        const r = await db().batch([
          db()
            .prepare(
              'UPDATE campus_work SET completed_at=? WHERE id=? AND wallet=? AND completed_at IS NULL AND started_at<=? AND started_at>=?',
            )
            .bind(now, id, wallet, now - 6000, now - 30000),
          db()
            .prepare(
              'UPDATE players SET credits=credits+20,xp=xp+10 WHERE wallet=? AND changes()=1',
            )
            .bind(wallet),
        ]);
        if (!r[0].meta.changes)
          throw new ApiError(
            409,
            'Wait for the repair timer, or restart an expired repair.',
          );
      }
    } else {
      const r = await db().batch([
        db()
          .prepare(
            'INSERT OR IGNORE INTO campus_rewards (id,wallet,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM campus_work WHERE room=? AND event=? AND completed_at IS NOT NULL)=3 AND EXISTS(SELECT 1 FROM campus_work WHERE room=? AND event=? AND wallet=? AND completed_at IS NOT NULL)',
          )
          .bind(
            `${room}:${event}:${wallet}`,
            wallet,
            now,
            room,
            event,
            room,
            event,
            wallet,
          ),
        db()
          .prepare(
            'UPDATE players SET credits=credits+30,xp=xp+20 WHERE wallet=? AND changes()=1',
          )
          .bind(wallet),
      ]);
      if (!r[0].meta.changes)
        throw new ApiError(
          409,
          'Complete a station and finish the group job to collect your bonus once.',
        );
    }
    return result({
      ...(await responseFor(wallet)),
      message:
        action === 'crew-claim'
          ? 'Cluster restored! +30 Compute'
          : body.finish
            ? 'Station repaired! +20 Compute'
            : 'Repair started. Hold position for six seconds.',
    });
  }
  if (action === 'message') {
    if (typeof body.message !== 'string')
      throw new ApiError(400, 'Write a message.');
    const msg = body.message.trim();
    if (msg.length < 1 || msg.length > 180 || /[\x00-\x1f]/.test(msg))
      throw new ApiError(400, 'Use 1–180 characters.');
    const now = Date.now();
    const inserted = await db()
      .prepare(
        'INSERT INTO crew_messages (id,wallet,message,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM crew_messages WHERE wallet=? AND created_at>?)',
      )
      .bind(crypto.randomUUID(), wallet, msg, now, wallet, now - 5000)
      .run();
    if (inserted.meta.changes !== 1)
      throw new ApiError(
        429,
        'Wait a few seconds before sending another message.',
      );
    return result({ ok: true });
  }
  if (action === 'listing-create') {
    const id = body.requestId,
      item = body.item as ItemId,
      n = Number(body.quantity),
      price = Number(body.price);
    if (
      typeof id !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(id) ||
      !Object.hasOwn(ITEMS, item) ||
      !Number.isSafeInteger(n) ||
      n < 1 ||
      n > 50 ||
      !Number.isSafeInteger(price) ||
      price < 1 ||
      price > 10000
    )
      throw new ApiError(400, 'Use valid item, quantity and total price.');
    const duplicate = await db()
      .prepare('SELECT wallet FROM market_listings WHERE id=?')
      .bind(id)
      .first<{ wallet: string }>();
    if (duplicate) {
      if (duplicate.wallet !== wallet)
        throw new ApiError(409, 'Choose a new listing identifier.');
      return result(await responseFor(wallet));
    }
    const p = await player(wallet),
      f = structuredClone(p.facility!);
    if ((f.inventory[item] ?? 0) < n)
      throw new ApiError(400, 'You do not have enough items.');
    const count = await db()
      .prepare(
        "SELECT COUNT(*) AS n FROM market_listings WHERE wallet=? AND status='open'",
      )
      .bind(wallet)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 10)
      throw new ApiError(400, 'You can have ten active listings.');
    f.inventory[item]! -= n;
    f.version++;
    const r = await db().batch([
      db()
        .prepare(
          "INSERT OR IGNORE INTO market_listings (id,wallet,item,quantity,price,status,created_at) SELECT ?,?,?,?,?,'open',? WHERE EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=?)",
        )
        .bind(
          id,
          wallet,
          item,
          n,
          price,
          Date.now(),
          wallet,
          p.facility!.version,
        ),
      db()
        .prepare(
          'UPDATE players SET facility_state=?,facility_version=? WHERE wallet=? AND changes()=1',
        )
        .bind(JSON.stringify(f), f.version, wallet),
    ]);
    if (r[0].meta.changes !== 1)
      throw new ApiError(409, 'Your inventory changed. Retry.');
    return result(await responseFor(wallet));
  }
  if (
    (action === 'listing-cancel' || action === 'listing-buy') &&
    (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(body.id))
  )
    throw new ApiError(400, 'Choose a valid listing.');
  if (action === 'listing-cancel') {
    const row = await db()
      .prepare(
        "SELECT * FROM market_listings WHERE id=? AND wallet=? AND status='open'",
      )
      .bind(body.id, wallet)
      .first<any>();
    if (!row) throw new ApiError(409, 'This listing is no longer active.');
    const p = await player(wallet),
      f = structuredClone(p.facility!);
    f.bank[row.item as ItemId] =
      (f.bank[row.item as ItemId] ?? 0) + row.quantity;
    f.version++;
    const r = await db().batch([
      db()
        .prepare(
          "UPDATE market_listings SET status='cancelled' WHERE id=? AND status='open' AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=?)",
        )
        .bind(row.id, wallet, p.facility!.version),
      db()
        .prepare(
          'UPDATE players SET facility_state=?,facility_version=? WHERE wallet=? AND changes()=1',
        )
        .bind(JSON.stringify(f), f.version, wallet),
    ]);
    if (r[0].meta.changes !== 1)
      throw new ApiError(409, 'The listing changed. Refresh the market.');
    return result(await responseFor(wallet));
  }
  if (action === 'listing-buy') {
    const row = await db()
      .prepare("SELECT * FROM market_listings WHERE id=? AND status='open'")
      .bind(body.id)
      .first<any>();
    if (!row || row.wallet === wallet)
      throw new ApiError(409, 'Choose another available listing.');
    const p = await player(wallet),
      f = structuredClone(p.facility!);
    if (p.credits < row.price)
      throw new ApiError(400, 'You need more credits.');
    if (itemCount(f.inventory) + row.quantity > 120 + f.storage * 40)
      throw new ApiError(400, 'Make room in your backpack first.');
    f.inventory[row.item as ItemId] =
      (f.inventory[row.item as ItemId] ?? 0) + row.quantity;
    f.version++;
    const r = await db().batch([
      db()
        .prepare(
          "UPDATE market_listings SET status='sold',buyer=? WHERE id=? AND status='open' AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=? AND credits>=?)",
        )
        .bind(wallet, row.id, wallet, p.facility!.version, row.price),
      db()
        .prepare(
          'UPDATE players SET facility_state=?,facility_version=?,credits=credits-? WHERE wallet=? AND changes()=1',
        )
        .bind(JSON.stringify(f), f.version, row.price, wallet),
      db()
        .prepare(
          'UPDATE players SET credits=credits+? WHERE wallet=? AND changes()=1',
        )
        .bind(row.price, row.wallet),
    ]);
    if (r[0].meta.changes !== 1)
      throw new ApiError(
        409,
        'Someone bought this listing first. Refresh the market.',
      );
    return result(await responseFor(wallet));
  }
  if (action === 'name') {
    if (
      typeof body.name !== 'string' ||
      !/^[A-Za-z0-9 _-]{2,20}$/.test(body.name.trim())
    )
      throw new ApiError(
        400,
        'Use 2–20 letters, numbers, spaces, dashes, or underscores.',
      );
    await db()
      .prepare('UPDATE players SET name=? WHERE wallet=?')
      .bind(body.name.trim(), wallet)
      .run();
    return result(await responseFor(wallet));
  }
  if (action === 'start') {
    const current = await getRun(wallet);
    if (
      current &&
      !current.completedAt &&
      Date.now() - current.startedAt < 86400000
    )
      return result(await responseFor(wallet, current));
    if (current && !current.completedAt) {
      const closed = {
        ...current,
        completedAt: Date.now(),
        version: current.version + 1,
      };
      await db()
        .prepare(
          'UPDATE shifts SET completed_at=?,state=?,version=? WHERE id=? AND wallet=? AND version=?',
        )
        .bind(
          closed.completedAt,
          JSON.stringify(closed),
          closed.version,
          current.id,
          wallet,
          current.version,
        )
        .run();
    }
    const p = await player(wallet),
      next = newShift(p.equipment);
    await db()
      .prepare(
        'INSERT OR IGNORE INTO shifts (id,wallet,state,version,mutation,started_at) VALUES (?,?,?,0,?,?)',
      )
      .bind(next.id, wallet, JSON.stringify(next), token(), next.startedAt)
      .run();
    return result(await responseFor(wallet));
  }
  if (action === 'upgrade') {
    const upgrade = UPGRADES.find((u) => u.id === body.upgrade);
    if (!upgrade) throw new ApiError(400, 'Unknown equipment.');
    // The column identifier comes exclusively from the fixed server-side catalog.
    const changed = await db()
      .prepare(
        `UPDATE players SET credits=credits-?,${upgrade.id}=1 WHERE wallet=? AND credits>=? AND ${upgrade.id}=0`,
      )
      .bind(upgrade.price, wallet, upgrade.price)
      .run();
    if (changed.meta.changes !== 1)
      throw new ApiError(
        409,
        'This equipment is already owned, or you need more credits.',
      );
    return result(await responseFor(wallet));
  }
  if (['activate', 'answer', 'hint'].includes(action)) {
    if (
      typeof body.shiftId !== 'string' ||
      typeof body.job !== 'string' ||
      !['cooling', 'boot', 'network'].includes(body.job)
    )
      throw new ApiError(400, 'Choose a valid station.');
    const previous = await getRun(wallet, body.shiftId);
    if (!previous)
      throw new ApiError(404, 'This shift does not belong to your wallet.');
    let next: Shift;
    let correct: boolean | undefined;
    if (action === 'activate') {
      next = activateJob(previous, body.job as JobType);
      if (next.version === previous.version)
        return result(await responseFor(wallet, next));
    } else if (action === 'hint') next = hintJob(previous, body.job as JobType);
    else {
      if (
        typeof body.requestId !== 'string' ||
        !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)
      )
        throw new ApiError(400, 'Missing repair request identifier.');
      const attempt = answerJob(
        previous,
        body.job as JobType,
        body.answer,
        body.requestId,
      );
      next = attempt.shift;
      correct = attempt.correct;
      if (attempt.duplicate)
        return result({
          ...(await responseFor(wallet, next)),
          correct,
          duplicate: true,
        });
    }
    await saveRun(wallet, previous, next);
    return result({
      ...(await responseFor(wallet, next)),
      correct,
      initialReveal:
        action === 'activate' &&
        previous.jobs.find((j) => j.id === body.job)?.status === 'pending',
    });
  }
  throw new ApiError(404, 'Unknown endpoint.');
}
