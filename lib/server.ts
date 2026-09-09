import { listingsPage, escrowListing } from './market-server';
import { reportQueue, reviewReport } from './moderation-server';
import { runtimeControls, pausedAction } from './operations';
import { canTrade, TRADE_QUALIFICATION } from './market';
import {
  rememberNeighbors,
  socialSnapshot,
  setSocialPreference,
  reportMessage,
} from './social-server';
import { QUICK_PINGS, playerName, noBlockSql } from './social';
import {
  localRealmTest,
  realmWriteGuard,
  type RealmPermit,
} from './realm-authority';
import { realmAccess, tokenPolicy } from './realm-access';
import {
  projectSnapshot,
  startProject,
  contributeProject,
  claimProject,
} from './projects-server';
import type { ContractFamily } from './contracts';
import { actionWorksite, needsHome } from './action-authority';
import {
  ensurePublicId,
  joinNeighborhood,
  neighborhoodSnapshot,
  controllerFrom,
  changeScene,
  leaveNeighborhood,
  syncNeighborhood,
  requireMembership,
  visitCenter,
} from './neighborhoods-server';
import { levelBand, realmExists } from './neighborhoods';
import { careerFor, operatorLicense } from './contracts';
import { EMERGENCY_STATIONS, eventAt } from './multiplayer';
import { facilityReceipt } from './game-feedback';
import { env } from 'cloudflare:workers';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { accountKey, walletAddress } from './wallet-identity';
import { solanaSignInMessage, verifySolanaMessage } from './solana-auth';
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
    ]);
}
type PlayerRow = {
  wallet: string;
  public_id: string | null;
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
  const publicId = await ensurePublicId(db(), wallet);
  return {
    id: publicId,
    wallet: p.wallet,
    publicId,
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
async function sharedSnapshot(wallet: string, neighborhoodId: string) {
  const now = Date.now(),
    event = eventAt(now);
  const work = await db()
    .prepare(
      'SELECT w.*,p.name FROM campus_work w JOIN players p ON p.wallet=w.wallet WHERE w.room=? AND w.event=?',
    )
    .bind(neighborhoodId, event)
    .all<any>();
  const reward = await db()
    .prepare('SELECT id FROM campus_rewards WHERE id=?')
    .bind(`${neighborhoodId}:${event}:${wallet}`)
    .first();
  const pending = await db()
    .prepare(`SELECT DISTINCT w.room,w.event FROM campus_work w WHERE w.wallet=? AND w.completed_at IS NOT NULL
    AND (SELECT count(*) FROM campus_work completed WHERE completed.room=w.room AND completed.event=w.event AND completed.completed_at IS NOT NULL)=3
    AND NOT EXISTS(SELECT 1 FROM campus_rewards r WHERE r.id=w.room || ':' || w.event || ':' || ?) ORDER BY w.event ASC LIMIT 20`)
    .bind(wallet, wallet)
    .all<{ room: string; event: number }>();
  return {
    room: neighborhoodId,
    event,
    endsAt: (event + 1) * 600000,
    serverNow: now,
    claimed: !!reward,
    pending: pending.results,
    work: work.results.map((w) => ({
      station: w.station,
      name: w.name,
      mine: w.wallet === wallet,
      startedAt: w.started_at,
      completedAt: w.completed_at,
    })),
  };
}
async function withShared(
  wallet: string,
  snapshot: Awaited<ReturnType<typeof neighborhoodSnapshot>> & {
    corrected?: boolean;
  },
) {
  const [world, project] = await Promise.all([
    sharedSnapshot(wallet, snapshot.membership.neighborhoodId),
    db()
      .prepare(
        "SELECT id,variant,state,required_json,progress_json FROM cluster_projects WHERE neighborhood_id=? ORDER BY (state='open') DESC,created_at DESC,id DESC LIMIT 1",
      )
      .bind(snapshot.membership.neighborhoodId)
      .first<{
        id: string;
        variant: string;
        state: string;
        required_json: string;
        progress_json: string;
      }>(),
  ]);
  const sum = (json: string) =>
    Object.values(JSON.parse(json) as Record<string, number>).reduce(
      (total, n) => total + n,
      0,
    );
  return {
    ...snapshot,
    world,
    cluster: project
      ? {
          id: project.id,
          variant: project.variant,
          online: project.state === 'completed',
          progress: sum(project.progress_json),
          total: sum(project.required_json),
        }
      : null,
  };
}
const realmValues = () => env as unknown as Record<string, unknown>;
function permitFor(request: Request): RealmPermit {
  const values = realmValues();
  const policy = tokenPolicy(values)?.key ?? null;
  return {
    policy,
    localTest:
      !policy &&
      localRealmTest(values, request.url, import.meta.env.DEV === true),
  };
}
async function accessFor(request: Request, wallet: string) {
  return realmAccess(db(), wallet, realmValues(), permitFor(request).localTest);
}
async function readableRealm(request: Request, wallet: string) {
  const membership = await requireMembership(db(), wallet);
  if (membership.realm === 'gpu' && !(await accessFor(request, wallet)).allowed)
    throw new ApiError(
      403,
      'Your realm access changed. Return to Crew Commons; your progress is safe.',
    );
  return membership;
}
async function recoverRealm(
  request: Request,
  wallet: string,
  body: Record<string, unknown>,
) {
  const controller = controllerFrom(body),
    membership = await requireMembership(db(), wallet, controller);
  if (membership.realm !== 'gpu') return null;
  const access = await accessFor(request, wallet);
  if (access.allowed) return null;
  const p = await player(wallet);
  const joined = await joinNeighborhood(
    db(),
    wallet,
    'commons',
    levelBand(p.facility!),
    controller.clientId,
    { expectedGeneration: membership.generation },
  );
  return {
    ...(await withShared(
      wallet,
      await neighborhoodSnapshot(db(), wallet, {
        ...controller,
        generation: joined.generation,
      }),
    )),
    corrected: true,
    notice:
      access.message +
      ' You are back in Crew Commons. Your center, items and earned rewards are safe.',
  };
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
    if (action === 'moderation-reports') {
      const wallet = await identity(request);
      return result(
        await reportQueue(
          db(),
          wallet,
          realmValues(),
          new URL(request.url).searchParams,
        ),
      );
    }
    if (action === 'leaderboard') {
      const rows = await db()
        .prepare(
          'SELECT name,best_score AS score,shifts,xp FROM players WHERE shifts>0 ORDER BY best_score DESC,created_at ASC LIMIT 20',
        )
        .all();
      return result({ entries: rows.results });
    }
    if (action === 'campus')
      throw new ApiError(
        410,
        'The neighborhood system has been upgraded. Refresh the game.',
      );
    if (action === 'social') {
      const wallet = await identity(request);
      if (!wallet) throw new ApiError(401, 'Connect to see your crew.');
      return result(await socialSnapshot(db(), wallet));
    }
    if (action === 'realm-access') {
      const wallet = await identity(request);
      if (!wallet) throw new ApiError(401, 'Connect to check realm access.');
      const p = await player(wallet);
      return result({
        ...(await accessFor(request, wallet)),
        licensed: operatorLicense(careerFor(p.facility!)),
      });
    }
    if (action === 'projects') {
      const wallet = await identity(request);
      if (!wallet)
        throw new ApiError(401, 'Connect your wallet to join a crew project.');
      await readableRealm(request, wallet);
      return result(await projectSnapshot(db(), wallet));
    }
    if (action === 'directory' || action === 'visit' || action === 'messages') {
      const wallet = await identity(request);
      if (!wallet) throw new ApiError(401, 'Connect to join a neighborhood.');
      const membership = await readableRealm(request, wallet);
      if (action === 'directory') {
        const snapshot = await neighborhoodSnapshot(db(), wallet);
        return result({ facilities: snapshot.neighbors });
      }
      if (action === 'visit')
        return result(
          await visitCenter(
            db(),
            wallet,
            new URL(request.url).searchParams.get('owner') ?? '',
          ),
        );
      const rows = await db()
        .prepare(
          `SELECT m.id,p.public_id AS author,p.name,m.message,m.created_at,(p.wallet=viewer.wallet) AS mine FROM crew_messages m JOIN players p ON p.wallet=m.wallet JOIN players viewer ON viewer.wallet=? WHERE m.neighborhood_id=? AND ${noBlockSql('viewer.wallet', 'p.wallet')} AND NOT EXISTS(SELECT 1 FROM social_preferences mute WHERE mute.wallet=viewer.wallet AND mute.target_wallet=p.wallet AND mute.muted=1) ORDER BY m.created_at DESC LIMIT 40`,
        )
        .bind(wallet, membership.neighborhood_id)
        .all();
      return result({ messages: rows.results.reverse() });
    }
    if (action === 'listings') {
      const wallet = await identity(request),
        p = wallet ? await player(wallet) : null;
      return result(
        await listingsPage(
          db(),
          wallet,
          p?.facility ?? null,
          new URL(request.url).searchParams,
        ),
      );
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
      : action === 'neighborhood-sync'
        ? 'presence-ingress'
        : 'game',
    action === 'nonce' || action === 'verify'
      ? 20
      : action === 'neighborhood-sync'
        ? 10000
        : 600,
  );
  if (action === 'nonce') {
    const ecosystem = body.ecosystem ?? 'evm';
    if (
      typeof body.address !== 'string' ||
      (ecosystem !== 'evm' && ecosystem !== 'solana') ||
      (ecosystem === 'evm' &&
        (!isAddress(body.address) ||
          !Number.isSafeInteger(body.chainId) ||
          Number(body.chainId) < 1))
    )
      throw new ApiError(400, 'Select a supported Ethereum or Solana account.');
    let wallet: string;
    try {
      wallet = accountKey(body.address, ecosystem);
    } catch {
      throw new ApiError(400, 'Select a valid wallet account.');
    }
    const secret = token(),
      now = Date.now(),
      siteOrigin = origin(request);
    const message =
      ecosystem === 'solana'
        ? solanaSignInMessage(body.address, siteOrigin, token(), now)
        : createSiweMessage({
            address: getAddress(body.address),
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
      .bind(await hash(secret), wallet, message, now + 300000)
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
      !/^0x(?:[a-fA-F0-9]{128}|[a-fA-F0-9]{130})$/.test(body.signature)
    )
      throw new ApiError(
        401,
        'The login expired or the wallet signature is unsupported. Connect again.',
      );
    const tokenHash = await hash(secret),
      challenge = await db()
        .prepare(
          'SELECT wallet,message FROM challenges WHERE token_hash=? AND expires_at>?',
        )
        .bind(tokenHash, Date.now())
        .first<{ wallet: string; message: string }>();
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
      valid = challenge.wallet.startsWith('solana:')
        ? await verifySolanaMessage(
            walletAddress(challenge.wallet),
            challenge.message,
            body.signature,
          )
        : /^0x[a-fA-F0-9]{130}$/.test(body.signature) &&
          (await verifyMessage({
            address: challenge.wallet as `0x${string}`,
            message: challenge.message,
            signature: body.signature as `0x${string}`,
          }));
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
    for (let attempt = 0; ; attempt++) {
      try {
        await db().batch([
          db()
            .prepare(
              'INSERT INTO players (wallet,name,created_at,public_id) VALUES (?,?,?,?) ON CONFLICT(wallet) DO NOTHING',
            )
            .bind(
              challenge.wallet,
              'Noob ' + challenge.wallet.slice(-5).toUpperCase(),
              now,
              challenge.wallet.startsWith('solana:')
                ? crypto.randomUUID().replaceAll('-', '')
                : null,
            ),
          db()
            .prepare(
              'INSERT INTO sessions (token_hash,wallet,expires_at) VALUES (?,?,?)',
            )
            .bind(await hash(session), challenge.wallet, now + 7 * 86400000),
        ]);
        break;
      } catch (error) {
        // Retry only an opaque public-ID collision, never swallow other failures.
        if (
          attempt >= 2 ||
          !(error instanceof Error) ||
          !error.message.includes('players.public_id')
        )
          throw error;
      }
    }
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
    action === 'neighborhood-sync' ? 'presence' : 'actions',
    action === 'neighborhood-sync' ? 150 : 120,
    wallet,
  );

  const permit = permitFor(request);
  if (action === 'moderation-review') {
    await rate(request, 'moderation', 30, wallet);
    return result(await reviewReport(db(), wallet, realmValues(), body));
  }
  const controls = runtimeControls(realmValues());
  const paused = pausedAction(action, controls);
  if (paused) throw new ApiError(503, paused);
  const realmBound =
    [
      'neighborhood-sync',
      'neighborhood-scene',
      'project-start',
      'project-contribute',
      'crew-work',
      'message',
    ].includes(action) ||
    (action === 'facility' &&
      !!body.action &&
      typeof body.action === 'object' &&
      needsHome(body.action as FacilityAction));
  if (realmBound) {
    const recovered = await recoverRealm(request, wallet, body);
    if (recovered) {
      if (action === 'neighborhood-sync' || action === 'neighborhood-scene')
        return result(recovered);
      throw new ApiError(
        409,
        'Your realm access changed. Rejoin Crew Commons to continue; your progress is safe.',
      );
    }
  }
  if (action === 'social-preference') {
    const social = await setSocialPreference(
      db(),
      wallet,
      String(body.target),
      String(body.kind),
      body.enabled,
    );
    return result({
      ...(await responseFor(wallet)),
      social,
      message: 'Player controls saved.',
    });
  }
  if (action === 'report') {
    await rate(request, 'reports', 10, wallet);
    await reportMessage(db(), wallet, String(body.messageId), body.reason);
    return result({
      ...(await responseFor(wallet)),
      message: 'Report saved for review.',
    });
  }
  if (action === 'project-start') {
    await startProject(
      db(),
      wallet,
      controllerFrom(body),
      String(body.variant),
      Date.now(),
      permit,
    );
    return result({
      ...(await responseFor(wallet)),
      message: 'Your cluster project is ready. Meet Margo in the plaza.',
    });
  }
  if (action === 'project-contribute') {
    await contributeProject(
      db(),
      wallet,
      controllerFrom(body),
      String(body.projectId),
      body.family as ContractFamily,
      String(body.requestId),
      Date.now(),
      permit,
    );
    return result({
      ...(await responseFor(wallet)),
      message: 'Contribution delivered. Your crew is one step closer.',
    });
  }
  if (action === 'project-claim') {
    const reward = await claimProject(db(), wallet, String(body.projectId));
    return result({
      ...(await responseFor(wallet)),
      message: `Cluster commissioned! +${reward.compute} Compute · +${reward.reputation} reputation.`,
    });
  }
  if (action === 'neighborhood-join') {
    const p = await player(wallet);
    if (!realmExists(body.realm) || typeof body.clientId !== 'string')
      throw new ApiError(400, 'Choose a realm.');
    if (body.realm === 'gpu') {
      if (!operatorLicense(careerFor(p.facility!)))
        throw new ApiError(
          403,
          'Earn your Operator license in Crew Commons first.',
        );
      const access = await accessFor(request, wallet);
      if (!access.allowed)
        throw new ApiError(
          access.status === 'ineligible' ? 403 : 503,
          access.message,
        );
    }
    const joined = await joinNeighborhood(
      db(),
      wallet,
      body.realm,
      levelBand(p.facility!),
      body.clientId,
      {
        target: typeof body.target === 'string' ? body.target : undefined,
        takeover: body.takeover === true,
        permit,
        maxActive: controls.maxPlayers,
        admissionPaused: controls.admissionPaused,
      },
    );
    await rememberNeighbors(db(), wallet, joined.neighborhoodId);
    return result(
      await withShared(
        wallet,
        await neighborhoodSnapshot(db(), wallet, {
          clientId: body.clientId,
          generation: joined.generation,
        }),
      ),
    );
  }
  if (action === 'neighborhood-sync')
    return result(
      await withShared(
        wallet,
        await syncNeighborhood(
          db(),
          wallet,
          controllerFrom(body),
          Number(body.sequence),
          body.position as { x: number; z: number },
          Date.now(),
          permit,
        ),
      ),
    );
  if (action === 'neighborhood-scene') {
    const controller = controllerFrom(body);
    const changed = await changeScene(
      db(),
      wallet,
      controller,
      String(body.scene),
      Date.now(),
      permit,
    );
    return result(
      await withShared(
        wallet,
        await neighborhoodSnapshot(db(), wallet, {
          ...controller,
          generation: changed.generation,
        }),
      ),
    );
  }
  if (action === 'neighborhood-leave') {
    await leaveNeighborhood(db(), wallet, controllerFrom(body));
    return result({ ok: true });
  }

  if (action === 'facility') {
    const p = await player(wallet),
      previous = p.facility!,
      a = body.action as FacilityAction;
    if (!a || typeof a.type !== 'string' || typeof a.requestId !== 'string')
      throw new ApiError(400, 'Choose a valid facility action.');
    const now = Date.now(),
      homeRequired = needsHome(a);
    const controller = homeRequired ? controllerFrom(body) : null;
    const presence = controller
      ? await requireMembership(db(), wallet, controller, now)
      : null;
    if (presence && presence.room !== 'home-' + p.id)
      throw new ApiError(403, 'Return to your own center to do this job.');
    const worksite = actionWorksite(previous, a);
    if (
      worksite &&
      (!presence ||
        presence.updated_at < now - 10000 ||
        Math.hypot(presence.x - worksite.x, presence.z - worksite.z) > 4)
    )
      throw new ApiError(400, 'Walk to ' + worksite.name + ' first.');
    const updated = applyFacility(previous, a, p.credits, now);
    if (updated.facility.version !== previous.version) {
      const authority = controller
        ? ` AND EXISTS(SELECT 1 FROM crew_presence c WHERE c.wallet=players.wallet AND c.client_id=? AND c.generation=? AND c.lease_until>? AND ${realmWriteGuard('c', permit)} AND c.room=?
        AND (?=0 OR (c.updated_at>? AND (c.x-?)*(c.x-?)+(c.z-?)*(c.z-?)<=16)))`
        : '';
      const bindings: (string | number)[] = [
        JSON.stringify(updated.facility),
        updated.facility.version,
        updated.credits,
        updated.xp,
        wallet,
        previous.version,
        p.credits,
      ];
      if (controller)
        bindings.push(
          controller.clientId,
          controller.generation,
          now,
          'home-' + p.id,
          worksite ? 1 : 0,
          now - 10000,
          worksite?.x ?? 0,
          worksite?.x ?? 0,
          worksite?.z ?? 0,
          worksite?.z ?? 0,
        );
      const statements = [
        db()
          .prepare(
            'UPDATE players SET facility_state=?,facility_version=?,credits=credits+?,xp=xp+? WHERE wallet=? AND facility_version=? AND credits=?' +
              authority,
          )
          .bind(...bindings),
      ];
      if (a.type === 'travel' && controller) {
        const zone = ZONES.find((z) => z.id === updated.facility.zone)!;
        statements.push(
          db()
            .prepare(
              'UPDATE crew_presence SET x=?,z=?,sequence=sequence+1,updated_at=? WHERE wallet=? AND client_id=? AND generation=? AND changes()=1',
            )
            .bind(
              zone.x,
              zone.z + 5,
              now,
              wallet,
              controller.clientId,
              controller.generation,
            ),
        );
      }
      const results = await db().batch(statements);
      if (results[0].meta.changes !== 1)
        throw new ApiError(
          409,
          'Your center or connection changed. Reconnect and try again.',
        );
    }
    return result({
      ...(await responseFor(wallet)),
      message: updated.message,
      receipt: facilityReceipt(previous, a, updated),
      actionApplied: !previous.requests.includes(a.requestId),
    });
  }
  if (action === 'presence')
    throw new ApiError(410, 'Refresh the game to join the new neighborhoods.');
  if (action === 'crew-work' || action === 'crew-claim') {
    const controller = action === 'crew-work' ? controllerFrom(body) : null;
    const presence = controller
      ? await requireMembership(db(), wallet, controller)
      : null;
    const room = presence?.neighborhood_id ?? String(body.room);
    const now = Date.now(),
      event = action === 'crew-work' ? eventAt(now) : Number(body.event);
    if (
      !/^(?:[a-f0-9]{32}|campus-[1-3])$/.test(room) ||
      !Number.isSafeInteger(event) ||
      event < 0 ||
      event > eventAt(now)
    )
      throw new ApiError(400, 'Choose an earned crew bonus.');
    if (action === 'crew-work' && body.event !== event)
      throw new ApiError(409, 'A new crew job has started. Reopen the board.');
    if (
      presence &&
      (presence.room !== 'commons' || presence.updated_at < now - 10000)
    )
      throw new ApiError(400, 'Enter the plaza before joining this job.');
    if (action === 'crew-work') {
      const station = EMERGENCY_STATIONS.find((s) => s.id === body.station);
      if (
        !station ||
        Math.hypot(presence!.x - station.x, presence!.z - station.z) > 5
      )
        throw new ApiError(400, 'Walk to the highlighted station first.');
      const id = `${room}:${event}:${station.id}`;
      const guard = `EXISTS(SELECT 1 FROM crew_presence c WHERE c.wallet=? AND c.neighborhood_id=? AND c.client_id=? AND c.generation=? AND c.lease_until>? AND ${realmWriteGuard('c', permit)} AND c.room='commons' AND c.updated_at>? AND (c.x-?)*(c.x-?)+(c.z-?)*(c.z-?)<=25)`;
      const guardArgs = [
        wallet,
        room,
        controller!.clientId,
        controller!.generation,
        now,
        now - 10000,
        station.x,
        station.x,
        station.z,
        station.z,
      ];
      if (body.finish !== true) {
        const r = await db()
          .prepare(
            `INSERT INTO campus_work (id,room,event,station,wallet,started_at) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET wallet=excluded.wallet,started_at=excluded.started_at WHERE campus_work.completed_at IS NULL AND campus_work.started_at<?`,
          )
          .bind(
            id,
            room,
            event,
            station.id,
            wallet,
            now,
            ...guardArgs,
            now - 30000,
          )
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
              `UPDATE campus_work SET completed_at=? WHERE id=? AND wallet=? AND completed_at IS NULL AND started_at<=? AND started_at>=? AND ${guard}`,
            )
            .bind(now, id, wallet, now - 6000, now - 30000, ...guardArgs),
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
    const membership = await requireMembership(
      db(),
      wallet,
      controllerFrom(body),
    );
    if (typeof body.ping === 'string' && Object.hasOwn(QUICK_PINGS, body.ping))
      body.message = QUICK_PINGS[body.ping as keyof typeof QUICK_PINGS];
    if (typeof body.message !== 'string')
      throw new ApiError(400, 'Write a message.');
    const msg = body.message.trim();
    if (msg.length < 1 || msg.length > 180 || /[\x00-\x1f]/.test(msg))
      throw new ApiError(400, 'Use 1–180 characters.');
    const now = Date.now();
    const inserted = await db()
      .prepare(
        `INSERT INTO crew_messages (id,wallet,message,created_at,neighborhood_id) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM crew_messages WHERE wallet=? AND created_at>?) AND EXISTS(SELECT 1 FROM crew_presence c WHERE c.wallet=? AND c.client_id=? AND c.generation=? AND c.neighborhood_id=? AND c.lease_until>? AND ${realmWriteGuard('c', permit)})`,
      )
      .bind(
        crypto.randomUUID(),
        wallet,
        msg,
        now,
        membership.neighborhood_id,
        wallet,
        now - 5000,
        wallet,
        membership.client_id,
        membership.generation,
        membership.neighborhood_id,
        now,
      )
      .run();
    if (inserted.meta.changes !== 1)
      throw new ApiError(
        429,
        'Wait a few seconds before sending another message.',
      );
    return result({ ...(await responseFor(wallet)), message: 'Message sent.' });
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
    if (!canTrade(f)) throw new ApiError(403, TRADE_QUALIFICATION);
    let recipient: string | null = null;
    if (body.recipient !== undefined && body.recipient !== '') {
      if (
        typeof body.recipient !== 'string' ||
        !/^[a-f0-9]{32}$/.test(body.recipient)
      )
        throw new ApiError(400, 'Choose a neighbor for this offer.');
      const peer = await db()
        .prepare(
          `SELECT p.wallet FROM crew_presence self JOIN crew_presence peer ON peer.neighborhood_id=self.neighborhood_id JOIN players p ON p.wallet=peer.wallet WHERE self.wallet=? AND p.public_id=? AND peer.wallet<>self.wallet AND self.lease_until>? AND peer.lease_until>? AND ${noBlockSql('self.wallet', 'peer.wallet')}`,
        )
        .bind(wallet, body.recipient, Date.now(), Date.now())
        .first<{ wallet: string }>();
      if (!peer)
        throw new ApiError(
          403,
          'That neighbor is no longer available for a direct offer.',
        );
      recipient = peer.wallet;
    }
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
    await escrowListing(
      db(),
      { id, wallet, item, quantity: n, price, recipient },
      f,
    );
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
    if (!canTrade(f)) throw new ApiError(403, TRADE_QUALIFICATION);
    if (row.recipient_wallet && row.recipient_wallet !== wallet)
      throw new ApiError(403, 'This offer is for another neighbor.');
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
          `UPDATE market_listings SET status='sold',buyer=? WHERE id=? AND status='open' AND (recipient_wallet IS NULL OR recipient_wallet=?) AND EXISTS(SELECT 1 FROM players buyer WHERE buyer.wallet=? AND buyer.facility_version=? AND buyer.credits>=? AND ${noBlockSql('buyer.wallet', 'market_listings.wallet')})`,
        )
        .bind(wallet, row.id, wallet, wallet, p.facility!.version, row.price),
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
    const name = playerName(body.name);
    if (!name)
      throw new ApiError(
        400,
        'Choose a friendly name with 2–20 letters, numbers, spaces, dashes or underscores. Staff titles are reserved.',
      );
    await db()
      .prepare('UPDATE players SET name=? WHERE wallet=?')
      .bind(name, wallet)
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
