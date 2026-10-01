// Bounded hosted capacity probe using generated, unfunded Solana accounts.
// Production is capped at fifty clients; isolated staging can test above that.
// Uses public admission and real RoomClient transport; no fixture SQL or tokens.
// Respects normal authentication throttles, then leaves/logs out.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { base58 } from '@scure/base';
import WebSocket from 'ws';
import { RoomClient } from '../lib/room-client.ts';
import { actionWorksite } from '../lib/action-authority.ts';
import { OBJECTS, RECIPES } from '../lib/facility.ts';
import { contractFor, serviceChallenge } from '../lib/contracts.ts';
import { planPath } from '../lib/navigation.ts';
import { floorClear } from '../lib/world-navigation.ts';
import {
  assertFreshCapacityAccounts,
  assertReturningCapacityServer,
  authenticateCapacityActor,
} from './capacity-auth.mjs';
import { openCapacityCohort } from './capacity-cohort.mjs';
import { CapacityTimeline } from './capacity-timeline.mjs';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
const destinations = {
  'https://play.noobius.io': {
    rooms: 'https://rooms.noobius.io',
    maxRooms: 10,
    report: '/tmp/noobius-hosted-capacity-results.json',
  },
  'https://noobius-game-staging.rinkydooonso.workers.dev': {
    rooms: 'https://noobius-rooms-staging.rinkydooonso.workers.dev',
    maxRooms: 20,
    report: '/tmp/noobius-hosted-capacity-staging-results.json',
  },
};
const destination = destinations[origin];
if (!destination)
  throw Error('Explicit, recognized hosted test origin required');
const roomCount = Number(process.env.NOOBIUS_LOAD_ROOMS ?? 10);
const durationSeconds = Number(process.env.NOOBIUS_LOAD_SECONDS ?? 90);
const motionMode = process.env.NOOBIUS_LOAD_WALK ?? 'full-speed';
const diagnoseSocket = process.env.NOOBIUS_DIAGNOSE_SOCKET === '1';
const jobsMode = process.env.NOOBIUS_LOAD_JOBS === '1';
const jobsStartSecond = Number(process.env.NOOBIUS_LOAD_JOBS_START_SECOND ?? 0);
assert.ok(['small-steps', 'full-speed'].includes(motionMode));
assert.ok(
  Number.isInteger(roomCount) &&
    roomCount >= 1 &&
    roomCount <= destination.maxRooms,
);
assert.ok(
  Number.isInteger(durationSeconds) &&
    durationSeconds >= 30 &&
    durationSeconds <= 360,
);
const cohortPath = process.env.NOOBIUS_CAPACITY_COHORT_FILE;
const cohortMode = process.env.NOOBIUS_CAPACITY_COHORT_MODE;
if (Boolean(cohortPath) !== Boolean(cohortMode))
  throw Error(
    'An explicit cohort file and create/returning mode must be supplied together.',
  );
if (
  jobsMode &&
  (origin !== 'https://noobius-game-staging.rinkydooonso.workers.dev' ||
    cohortMode !== 'returning' ||
    durationSeconds < 180)
)
  throw Error(
    'Mixed jobs require a returning staging cohort and at least 180 seconds.',
  );
if (
  !Number.isInteger(jobsStartSecond) ||
  jobsStartSecond < 0 ||
  (jobsMode && jobsStartSecond > durationSeconds - 90) ||
  (!jobsMode && jobsStartSecond !== 0)
)
  throw Error(
    'Job start must leave at least 90 measured seconds for completion.',
  );
// All cohort validation/key import finishes before requests or actor allocation.
// Returning records require their exact existing save; they never create accounts.
if (!cohortPath) assertFreshCapacityAccounts(roomCount * 5);
const cohort = cohortPath
  ? await openCapacityCohort({
      path: cohortPath,
      origin,
      count: roomCount * 5,
      mode: cohortMode,
    })
  : null;
const correctionReasons = {};
const { Client } = await import('../tests/api-client.mjs');
const actors = [],
  tasks = new Set(),
  issues = [],
  peerAnomalies = [],
  rtts = [],
  httpRtts = [];
const runId = crypto.randomUUID(),
  began = Date.now();
let stopped = false,
  measuring = false,
  phase = 0;
const timeline = new CapacityTimeline({ beganAt: began });
const counters = {
  unacknowledged: 0,
  sent: 0,
  accepted: 0,
  corrected: 0,
  peerFrames: 0,
  inboundBytes: 0,
  renewals: 0,
  interruptions: 0,
  admissionRetries: 0,
  admissionRecoveries: 0,
  expiredRejoins: 0,
  maxRecoveryMs: 0,
  maxRenewRecoveryMs: 0,
  releaseRetries: 0,
  cleanupRetries: 0,
  httpRequests: 0,
  jobCompletions: 0,
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const ids = (xs) => xs.map((x) => x.id).sort();
const refreshExpectedScenes = () => {
  for (const observer of actors) {
    if (!observer.expected.length || !observer.membership) continue;
    observer.expected = ids(
      actors
        .filter(
          (other) =>
            other.profile &&
            other.membership?.neighborhoodId ===
              observer.membership.neighborhoodId &&
            other.membership.scene === observer.membership.scene,
        )
        .map((other) => other.profile),
    );
  }
};
const quantile = (xs, p) =>
  xs.length
    ? Number(
        [...xs]
          .sort((a, b) => a - b)
          [Math.max(0, Math.ceil(xs.length * p) - 1)].toFixed(1),
      )
    : null;
const track = (promise) => {
  tasks.add(promise);
  promise.finally(() => tasks.delete(promise)).catch(() => {});
  return promise;
};
async function request(a, action, body) {
  const start = performance.now();
  const r = await a.c.request(action, body);
  counters.httpRequests++;
  if (measuring) httpRtts.push(performance.now() - start);
  return r;
}
async function authenticate(a) {
  a.profile = await authenticateCapacityActor({
    address: a.address,
    ...(a.returningProfileId
      ? { returningProfileId: a.returningProfileId }
      : {}),
    request: (action, body) => request(a, action, body),
    sign: async (message) =>
      '0x' +
      Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          a.keys.privateKey,
          new TextEncoder().encode(message),
        ),
      ).toString('hex'),
    sleep,
    isStopped: () => stopped,
    onThrottle: (delay) =>
      console.log(
        'Minute auth rate limit respected; waiting',
        Math.ceil(delay / 1000),
        'seconds',
      ),
  });
  if (a.returningProfileId)
    assert.equal(
      a.profile?.id,
      a.returningProfileId,
      'Returning saved profile must match the registered QA record',
    );
  if (cohort?.mode === 'create') cohort.register(a.index, a.profile.id);
}
async function connect(a, fastRenew = false) {
  if (stopped) return;
  a.transport?.dispose();
  const previousRoom = a.membership?.neighborhoodId;
  const refreshMembership = async () => {
    const previousScene = a.membership?.scene;
    let response = await request(
      a,
      'neighborhood-state',
      a.c.body(a.controller),
    );
    if (
      response.status === 409 &&
      /expired/i.test(response.data?.error ?? '')
    ) {
      response = await request(
        a,
        'neighborhood-join',
        a.c.body({
          clientId: a.controller.clientId,
          realm: a.membership.realm,
        }),
      );
      const rejoined = ok(response);
      a.controller.generation = rejoined.membership.generation;
      counters.expiredRejoins++;
      if (rejoined.membership.neighborhoodId !== previousRoom)
        issues.push('Recovered in a different neighborhood: actor ' + a.index);
    }
    a.membership = ok(response).membership;
    a.point = { x: a.membership.x, z: a.membership.z };
    if (measuring && a.membership.scene !== previousScene) {
      a.sceneChangedAt = Date.now();
      refreshExpectedScenes();
    }
  };
  if (!fastRenew) await refreshMembership();
  let ticketResponse = await request(a, 'room-ticket', a.c.body(a.controller));
  if (
    fastRenew &&
    ticketResponse.status === 409 &&
    /expired|changed|resync/i.test(ticketResponse.data?.error ?? '')
  ) {
    await refreshMembership();
    ticketResponse = await request(a, 'room-ticket', a.c.body(a.controller));
  }
  const ticket = ok(ticketResponse);
  timeline.record(a.index, 'ticket');
  assert.equal(ticket.coordinatorOrigin, destination.rooms);
  const transport = new RoomClient({
    ...ticket,
    membership: a.membership,
    readPosition: () => a.point,
    onMembership: (m, reset) => {
      a.membership = m;
      if (reset) a.point = { x: m.x, z: m.z };
    },
    onCorrection: (p) => {
      a.point = { ...p };
    },
    onReady: () => {},
    onPeople: (people) => {
      a.peers = ids(people);
      a.lastPeers = Date.now();
      if (measuring && a.expected.length) {
        const numericIds = (values) =>
          values.flatMap((id) => {
            const known = actors.find((actor) => actor.profile?.id === id);
            return known ? [known.index] : [];
          });
        timeline.peers(a.index, numericIds(a.expected), numericIds(a.peers));
      }
      if (!measuring) return;
      counters.peerFrames++;
      if (
        a.peers.some((id) => !a.expected.includes(id)) ||
        new Set(a.peers).size !== a.peers.length
      ) {
        if (peerAnomalies.length < 20) {
          const known = (ids) =>
            ids.flatMap((id) => {
              const actor = actors.find(
                (candidate) => candidate.profile?.id === id,
              );
              return actor ? [actor.index] : [];
            });
          peerAnomalies.push({
            atMs: Date.now() - began,
            observer: a.index,
            expected: known(a.expected),
            observed: known(a.peers),
            unknownCount: a.peers.length - known(a.peers).length,
            duplicateCount: a.peers.length - new Set(a.peers).size,
          });
        }
        const recentSceneChange = a.peers.some((id) => {
          const actor = actors.find(
            (candidate) => candidate.profile?.id === id,
          );
          return (
            actor?.sceneChangedAt && Date.now() - actor.sceneChangedAt < 5000
          );
        });
        if (!recentSceneChange || new Set(a.peers).size !== a.peers.length)
          issues.push('Foreign or duplicate peer for ' + a.index);
      }
      if (JSON.stringify(a.peers) === JSON.stringify(a.expected))
        a.incompleteSince = 0;
      else a.incompleteSince ||= Date.now();
      if (
        people.some((p) =>
          ['wallet', 'credits', 'inventory', 'grant', 'session_hash'].some(
            (k) => Object.hasOwn(p, k),
          ),
        )
      )
        issues.push('Private peer fields exposed');
    },
    onDisconnect: (reason) => {
      if (stopped || a.transitioning) return;
      for (const p of a.pending.values())
        if (p.measured) counters.unacknowledged++;
      a.pending.clear();
      if (reason === 'renew') {
        counters.renewals++;
        a.renewalStartedAt ||= Date.now();
      } else {
        counters.interruptions++;
        a.recoveryStartedAt ||= Date.now();
      }
      timeline.record(a.index, 'disconnect', {
        reason: reason === 'renew' ? 'renew' : 'interrupted',
        authorityAgeMs: a.lastAuthority
          ? Date.now() - a.lastAuthority
          : undefined,
      });
      console.log(
        'Connection recovery',
        JSON.stringify({
          actor: a.index,
          reason,
          elapsedMs: Date.now() - began,
          authorityAgeMs: a.lastAuthority ? Date.now() - a.lastAuthority : null,
        }),
      );
      if (!a.initializing && !a.reconnecting)
        a.reconnecting = track(
          (async () => {
            const until = Date.now() + 60000;
            for (let attempt = 0; Date.now() < until && !stopped; attempt++) {
              try {
                // The browser requests a fresh ticket immediately for both
                // planned renewals and unexpected closes. Match that path.
                await connect(a, attempt === 0);
                return;
              } catch (e) {
                if (!recoverableConnection(e)) {
                  issues.push('Reconnect failed: ' + e.message);
                  return;
                }
                await sleep(Math.min(5000, 750 * (attempt + 1)));
              }
            }
            if (!stopped) issues.push('Reconnect exceeded 60 seconds');
          })().finally(() => {
            a.reconnecting = null;
          }),
        );
    },
    createSocket: (url) => {
      assert.equal(
        new URL(url).origin,
        destination.rooms.replace(/^https:/, 'wss:'),
      );
      const socket = new WebSocket(url, { origin });
      a.socket = socket;
      const socketOrdinal = (a.socketOrdinal = (a.socketOrdinal ?? 0) + 1);
      socket.on('open', () =>
        timeline.record(a.index, 'open', { socket: socketOrdinal }),
      );
      socket.on('unexpected-response', (_request, response) =>
        timeline.record(a.index, 'handshake-rejected', {
          socket: socketOrdinal,
          status: response.statusCode,
        }),
      );
      socket.on('error', () =>
        timeline.record(a.index, 'socket-error', { socket: socketOrdinal }),
      );
      if (diagnoseSocket) {
        socket.on('open', () =>
          console.log(
            'Socket diagnostic',
            JSON.stringify({ actor: a.index, event: 'open' }),
          ),
        );
        socket.on('unexpected-response', (_request, response) =>
          console.log(
            'Socket diagnostic',
            JSON.stringify({
              actor: a.index,
              event: 'handshake-rejected',
              status: response.statusCode,
            }),
          ),
        );
        socket.on('error', (error) =>
          console.log(
            'Socket diagnostic',
            JSON.stringify({
              actor: a.index,
              event: 'error',
              code: error.code ?? 'unknown',
            }),
          ),
        );
      }
      const send = socket.send.bind(socket);
      socket.send = (data, ...rest) => {
        const f = JSON.parse(String(data));
        if (f.type === 'join')
          timeline.record(a.index, 'join-sent', { socket: socketOrdinal });
        if (diagnoseSocket && f.type === 'join')
          console.log(
            'Socket diagnostic',
            JSON.stringify({ actor: a.index, event: 'join-sent' }),
          );
        if (f.type === 'move') {
          a.pending.set(f.inputSequence, {
            time: performance.now(),
            measured: measuring,
          });
          if (measuring) {
            counters.sent++;
            a.sent++;
          }
        }
        return send(data, ...rest);
      };
      socket.on('message', (raw) => {
        if (measuring) counters.inboundBytes += raw.length;
        const f = JSON.parse(String(raw));
        if (['joined', 'rebase', 'renew'].includes(f.type))
          timeline.record(a.index, f.type, { socket: socketOrdinal });
        if (diagnoseSocket && ['joined', 'rebase', 'renew'].includes(f.type))
          console.log(
            'Socket diagnostic',
            JSON.stringify({ actor: a.index, event: f.type }),
          );
        if (['joined', 'authority', 'rebase'].includes(f.type))
          a.lastAuthority = Date.now();
        if (f.type === 'move-ack') {
          const p = a.pending.get(f.inputSequence);
          a.pending.delete(f.inputSequence);
          if (f.accepted) a.lastAccepted = { ...f.position };
          if (p?.measured) {
            rtts.push(performance.now() - p.time);
            if (f.accepted) {
              counters.accepted++;
              a.accepted++;
            } else {
              counters.corrected++;
              correctionReasons[f.reason ?? 'unspecified'] =
                (correctionReasons[f.reason ?? 'unspecified'] ?? 0) + 1;
            }
          }
        }
      });
      socket.on('close', (code, reason) => {
        timeline.record(a.index, 'close', {
          socket: socketOrdinal,
          code,
          reason: stopped
            ? 'shutdown'
            : a.transitioning
              ? 'transition'
              : 'interrupted',
        });
        if (!stopped && !a.transitioning)
          console.log(
            'Socket closed',
            JSON.stringify({
              actor: a.index,
              code,
              reason: reason?.toString('utf8').slice(0, 96) ?? '',
            }),
          );
      });
      return socket;
    },
  });
  a.transport = transport;
  await transport.connect();
  if (!transport.ready)
    throw Error(
      'Your room connection is recovering. Please retry when you are back.',
    );
  if (a.recoveryStartedAt) {
    timeline.record(a.index, 'recovered', {
      reason: 'interrupted',
      durationMs: Date.now() - a.recoveryStartedAt,
    });
    counters.maxRecoveryMs = Math.max(
      counters.maxRecoveryMs,
      Date.now() - a.recoveryStartedAt,
    );
    a.recoveryStartedAt = 0;
  }
  if (a.renewalStartedAt) {
    timeline.record(a.index, 'recovered', {
      reason: 'renew',
      durationMs: Date.now() - a.renewalStartedAt,
    });
    counters.maxRenewRecoveryMs = Math.max(
      counters.maxRenewRecoveryMs,
      Date.now() - a.renewalStartedAt,
    );
    a.renewalStartedAt = 0;
  }
}
const recoverableConnection = (error) =>
  error?.name === 'TimeoutError' ||
  /room connection is recovering|fetch failed/i.test(error?.message ?? '');
async function connectWithRetry(a) {
  // The browser keeps trying an initial room connection after a transient
  // failure. Retry here too, while leaving auth and validation errors fatal.
  // Suppress the ordinary disconnect handler so it cannot race this retry.
  a.initializing = true;
  try {
    const until = Date.now() + 60000;
    for (let attempt = 0; Date.now() < until; attempt++) {
      try {
        await connect(a);
        if (attempt) counters.admissionRecoveries++;
        return;
      } catch (error) {
        if (!recoverableConnection(error)) throw error;
        counters.admissionRetries++;
        await sleep(Math.min(5000, 750 * (attempt + 1)));
      }
    }
    throw Error('Room admission did not recover within 60 seconds');
  } finally {
    a.initializing = false;
  }
}
async function release(a) {
  // Like the game UI, wait for recovery before attempting a scene transition.
  // A scheduled grant renewal can begin between different batches of leavers.
  for (let attempt = 0; attempt < 3; attempt++) {
    const until = Date.now() + 15000;
    while (a.reconnecting || !a.transport?.ready) {
      assert.ok(Date.now() < until && !stopped, 'Ready before final save');
      await sleep(100);
    }
    const wasTransitioning = a.transitioning;
    a.transitioning = true;
    try {
      await a.transport.release();
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      counters.releaseRetries++;
      // The old transport is closed. Read the authoritative position; never
      // inject a client-side position to manufacture a successful save check.
      await connectWithRetry(a);
    } finally {
      a.transitioning = wasTransitioning;
    }
  }
}
async function cleanupAction(a, action, body) {
  // Leaving and logging out are idempotent. A transient 5xx or transport
  // timeout must still be surfaced in the report, but can be retried safely.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request(a, action, body);
      if (response.status === 200) return;
      if (response.status < 500 || attempt === 2) ok(response);
    } catch (error) {
      if (attempt === 2) throw error;
      if (
        error?.name !== 'TimeoutError' &&
        !/fetch failed/i.test(error?.message ?? '')
      )
        throw error;
    }
    counters.cleanupRetries++;
    await sleep(500 * (attempt + 1));
  }
}
const roomInterrupted = (error) =>
  /room connection is recovering|room is reconnecting|connection changed|position is syncing/i.test(
    error?.message ?? '',
  );
async function waitForJobRoom(a) {
  const until = Date.now() + 30000;
  while (!stopped && (!a.transport?.ready || a.reconnecting)) {
    assert.ok(Date.now() < until, 'Job room must recover within 30 seconds');
    await sleep(100);
  }
  assert.ok(!stopped, 'Capacity run remains active during job recovery');
}
async function jobAction(a, type, extra = {}, requestId = crypto.randomUUID()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await waitForJobRoom(a);
    const action = { type, requestId, ...extra };
    const payload = a.c.body({ ...a.controller, action });
    let lease = null;
    let retry = false;
    try {
      lease = actionWorksite(a.profile.facility, action)
        ? await a.transport.prepare('facility', payload)
        : null;
      const response = ok(
        await request(a, 'facility', {
          ...payload,
          ...(lease ? { roomCheckpoint: lease.checkpoint } : {}),
        }),
      );
      a.profile = response.profile;
      return response;
    } catch (error) {
      if (attempt === 3 || !roomInterrupted(error)) throw error;
      retry = true;
    } finally {
      await lease?.complete();
    }
    if (retry) {
      await waitForJobRoom(a);
      a.profile = ok(await request(a, 'profile')).profile;
    }
  }
  throw Error('Job room recovery exhausted');
}
async function walkToWorksite(a, id, restarts = 0) {
  await waitForJobRoom(a);
  const object = OBJECTS.find((o) => o.id === id);
  assert.ok(object, 'Known job worksite');
  const clear = (x, z) => floorClear(a.profile.facility, false, x, z);
  const paths = [
    [0, 1.65],
    [1.65, 0],
    [-1.65, 0],
    [0, -1.65],
  ]
    .map(([x, z]) => [object.x + x, object.z + z])
    .filter(([x, z]) => clear(x, z))
    .map((end) => planPath([a.point.x, a.point.z], end, clear, 0.5))
    .filter((path) => path.length)
    .sort((a, b) => a.length - b.length);
  assert.ok(paths.length, 'Reachable job worksite');
  for (const [x, z] of paths[0]) {
    const start = { ...a.point };
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(x - start.x, z - start.z) / 0.5),
    );
    for (let step = 1; step <= steps; step++) {
      if (!a.transport?.ready || a.reconnecting) {
        assert.ok(restarts < 3, 'Job walk recovery exhausted');
        await waitForJobRoom(a);
        return walkToWorksite(a, id, restarts + 1);
      }
      await sleep(180);
      a.point = {
        x: start.x + ((x - start.x) * step) / steps,
        z: start.z + ((z - start.z) * step) / steps,
      };
      try {
        if (!(await a.transport.syncPosition())) {
          assert.ok(restarts < 3, 'Job walk corrected repeatedly');
          return walkToWorksite(a, id, restarts + 1);
        }
      } catch (error) {
        if (!roomInterrupted(error) || restarts >= 3) throw error;
        await waitForJobRoom(a);
        return walkToWorksite(a, id, restarts + 1);
      }
    }
  }
}
async function collectFinishedCraft(a) {
  const craft = a.profile.facility.craft;
  if (!craft) return;
  await walkToWorksite(a, 'workbench');
  await sleep(Math.max(0, craft.readyAt - Date.now()) + 150);
  await jobAction(a, 'collect', { id: craft.id });
}
async function ensureJobMaterial(a, item, needed) {
  // Returning QA saves can rotate from salvage jobs to jobs that need crafted
  // parts. Obtain those parts through ordinary gather/craft actions rather than
  // assuming every service material has a salvage node.
  if ((a.profile.facility.inventory[item] ?? 0) >= needed) return;
  const recipe = RECIPES.find((candidate) => candidate.id === item);
  if (recipe) {
    assert.ok(
      a.profile.facility.unlocked.includes(recipe.zone),
      `QA account must unlock ${recipe.zone} to craft ${item}`,
    );
    while ((a.profile.facility.inventory[item] ?? 0) < needed) {
      await collectFinishedCraft(a);
      if ((a.profile.facility.inventory[item] ?? 0) >= needed) break;
      for (const [ingredient, quantity] of Object.entries(recipe.cost))
        await ensureJobMaterial(a, ingredient, quantity);
      await walkToWorksite(a, 'workbench');
      await jobAction(a, 'craft', { id: recipe.id });
      await collectFinishedCraft(a);
    }
    return;
  }
  const nodes = OBJECTS.filter(
    (object) =>
      object.kind === 'node' &&
      object.item === item &&
      a.profile.facility.unlocked.includes(object.zone),
  );
  assert.ok(nodes.length, `QA account needs an accessible source for ${item}`);
  for (
    let gathers = 0;
    (a.profile.facility.inventory[item] ?? 0) < needed;
    gathers++
  ) {
    assert.ok(gathers < 20, `QA material preparation bounded for ${item}`);
    const node = nodes.reduce((best, candidate) =>
      (a.profile.facility.cooldowns[candidate.id] ?? 0) <
      (a.profile.facility.cooldowns[best.id] ?? 0)
        ? candidate
        : best,
    );
    await walkToWorksite(a, node.id);
    await sleep(
      Math.max(0, (a.profile.facility.cooldowns[node.id] ?? 0) - Date.now()) +
        150,
    );
    await jobAction(a, 'gather', { id: node.id });
  }
}
async function runJob(a) {
  // One home owner per neighborhood does a real service job while the other
  // players keep moving. Existing QA saves and normal earning caps apply.
  if (!(a.profile.facility.builds?.['rack-a'] > 0))
    await jobAction(a, 'build', { id: 'rack-a' });
  const active = a.profile.facility.career.active.find(
    (candidate) => contractFor(candidate).family === 'service',
  );
  assert.ok(
    !active || active.state === 'accepted',
    'Existing QA service job must be unstarted to resume',
  );
  const offer =
    active ??
    a.profile.facility.career.offers.find(
      (candidate) => contractFor(candidate).family === 'service',
    );
  assert.ok(offer, 'Service job available under ordinary earning rules');
  const terms = contractFor(offer);
  const before = a.profile.facility.career.completed.service;
  if (!active) await jobAction(a, 'contract-accept', { id: offer.id });
  for (const [item, quantity] of Object.entries(terms.cost))
    await ensureJobMaterial(a, item, quantity);
  await walkToWorksite(a, terms.target);
  await jobAction(a, 'contract-start', { id: offer.id });
  for (let step = 0; step < 3; step++) {
    const run = a.profile.facility.career.active.find(
      (job) => job.id === offer.id,
    );
    assert.ok(run, 'Started job remains active');
    await sleep(Math.max(0, run.nextStepAt - Date.now()) + 150);
    await jobAction(a, 'contract-service', {
      id: offer.id,
      direction:
        step === 0
          ? 'Inspect'
          : step === 1
            ? serviceChallenge(run).answer
            : 'Test',
    });
  }
  const run = a.profile.facility.career.active.find(
    (job) => job.id === offer.id,
  );
  assert.ok(run, 'Serviced job remains claimable');
  const credits = a.profile.credits;
  const requestId = crypto.randomUUID();
  await jobAction(a, 'contract-claim', { id: offer.id }, requestId);
  await jobAction(a, 'contract-claim', { id: offer.id }, requestId);
  assert.equal(
    a.profile.credits,
    credits + run.reward,
    'Replayed job claim pays once',
  );
  assert.equal(a.profile.facility.career.completed.service, before + 1);
  counters.jobCompletions++;
}
let lastMotionAt = performance.now();
const motion = setInterval(
  () => {
    const now = performance.now();
    const seconds = Math.min(0.05, (now - lastMotionAt) / 1000);
    lastMotionAt = now;
    if (stopped || !measuring) return;
    phase += 0.16;
    for (const a of actors) {
      if (!a.transport?.ready || a.jobActive) continue;
      if (motionMode === 'full-speed') {
        a.direction ??= 1;
        const x = a.point.x + a.direction * 4.2 * seconds;
        if (x >= 3 || x <= -3) a.direction *= -1;
        a.point = { x: Math.max(-3, Math.min(3, x)), z: 17 };
      } else
        a.point = {
          x: 0,
          z: 17 - 0.35 * Math.sin(phase + a.index * 0.13) ** 2,
        };
    }
  },
  motionMode === 'full-speed' ? 16 : 160,
);
const heartbeat = setInterval(
  () =>
    console.log(
      'Capacity probe',
      JSON.stringify({
        elapsedSeconds: Math.round((Date.now() - began) / 1000),
        signedIn: actors.filter((a) => a.profile).length,
        connected: actors.filter((a) => a.transport?.ready).length,
        measuring,
        ...counters,
        issues: issues.length,
      }),
    ),
  30000,
);
const deadline = setTimeout(() => {
  issues.push('Probe exceeded fifteen-minute bound');
  stopped = true;
  for (const a of actors) {
    a.transport?.dispose();
    a.socket?.terminate();
  }
}, 900000);
let report;
let measuredAt = null;
let durablePositions = 0;
try {
  const healthResponse = await fetch(origin + '/api/health', {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(healthResponse.status, 200);
  if (cohort?.mode === 'returning')
    assertReturningCapacityServer(await healthResponse.json());
  for (let group = 0; group < roomCount; group++) {
    const members = [];
    let target;
    for (let lane = 0; lane < 5; lane++) {
      assert.ok(!stopped);
      assert.equal(issues.length, 0, issues.join('; '));
      const prepared = cohort?.actors[group * 5 + lane];
      const keys =
        prepared?.keys ??
        (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']));
      const address =
        prepared?.address ??
        base58.encode(
          new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
        );
      const c = new Client({ address });
      c.body = (body) => ({
        expectedWallet: 'solana:' + address,
        ...body,
      });
      const a = {
        c,
        address,
        keys,
        returningProfileId: prepared?.returningProfileId ?? undefined,
        index: group * 5 + lane,
        group,
        controller: { clientId: crypto.randomUUID(), generation: 0 },
        pending: new Map(),
        peers: [],
        expected: [],
        lastPeers: 0,
        sent: 0,
        accepted: 0,
      };
      actors.push(a);
      members.push(a);
      await authenticate(a);
      ok(
        await request(
          a,
          'name',
          c.body({ name: 'Capacity QA ' + (a.index + 1) }),
        ),
      );
      const joined = ok(
        await request(
          a,
          'neighborhood-join',
          c.body({
            ...a.controller,
            realm: 'commons',
            ...(target ? { target } : {}),
          }),
        ),
      );
      a.membership = joined.membership;
      a.controller.generation = a.membership.generation;
      target = a.membership.neighborhoodId;
      await connectWithRetry(a);
    }
    assert.ok(
      !actors
        .filter((a) => a.group !== group)
        .some((a) => a.membership?.neighborhoodId === target),
      'Groups must occupy separate neighborhoods',
    );
    // Two neighbors visit one home while three remain in the plaza.
    for (const a of members.slice(0, 2)) {
      const readyDeadline = Date.now() + 20000;
      while (!a.transport.ready || a.reconnecting) {
        assert.ok(
          Date.now() < readyDeadline,
          'Room must recover before changing scenes',
        );
        await sleep(100);
      }
      a.transitioning = true;
      try {
        await release(a);
        const changed = ok(
          await request(
            a,
            'neighborhood-scene',
            a.c.body({
              ...a.controller,
              scene: 'home-' + members[0].profile.id,
            }),
          ),
        );
        a.membership = changed.membership;
        a.controller.generation = a.membership.generation;
        await connectWithRetry(a);
      } finally {
        a.transitioning = false;
      }
    }
    for (const a of members)
      a.expected = ids(
        members
          .filter((b) => b.membership.scene === a.membership.scene)
          .map((b) => b.profile),
      );
    if (jobsMode) members[0].jobActor = true;
    console.log(
      'Admitted neighborhood',
      group + 1,
      'with two home visitors and three plaza players',
    );
  }
  const readyUntil = Date.now() + 15000;
  while (
    !actors.every(
      (a) =>
        a.transport.ready &&
        JSON.stringify(a.peers) === JSON.stringify(a.expected),
    )
  ) {
    assert.ok(
      Date.now() < readyUntil,
      'All admitted clients must have correct scene peers',
    );
    await sleep(100);
  }
  measuredAt = Date.now();
  measuring = true;
  const jobTasks = [];
  // Moving clients plus ordinary saved-profile reads, distributed over 90 seconds.
  for (let second = 0; second < durationSeconds; second++) {
    if (jobsMode && second === jobsStartSecond)
      for (const a of actors.filter((actor) => actor.jobActor)) {
        a.jobActive = true;
        jobTasks.push(
          track(
            runJob(a).catch((error) => {
              issues.push(`Job actor ${a.index}: ${error.message}`);
            }),
          ),
        );
      }
    assert.ok(!stopped);
    assert.equal(issues.length, 0, issues.slice(0, 5).join('; '));
    for (const a of actors)
      assert.ok(
        !a.incompleteSince || Date.now() - a.incompleteSince < 5000,
        `Scene peers must recover within five seconds: actor ${a.index}, ` +
          `missing for ${a.incompleteSince ? Date.now() - a.incompleteSince : 0} ms, ` +
          `expected ${JSON.stringify(a.expected)}, received ${JSON.stringify(a.peers)}`,
      );
    if (second % 10 === 0)
      await Promise.all(
        actors
          .filter((_, i) => i % 5 === (second / 10) % 5)
          .map(async (a) => {
            const state = ok(await request(a, 'profile'));
            assert.equal(state.profile.id, a.profile.id);
          }),
      );
    await sleep(1000);
  }
  await Promise.all(jobTasks);
  const measurementMs = Date.now() - measuredAt;
  measuring = false;
  timeline.freezePeers();
  await sleep(2000);
  assert.equal(actors.length, roomCount * 5);
  assert.equal(
    new Set(actors.map((a) => a.membership.neighborhoodId)).size,
    roomCount,
  );
  assert.equal(issues.length, 0, issues.slice(0, 5).join('; '));
  const settledUntil = Date.now() + 15000;
  while (actors.some((a) => !a.transport.ready || a.reconnecting)) {
    assert.ok(
      Date.now() < settledUntil && !stopped,
      'Every client must recover before the final save check',
    );
    assert.equal(issues.length, 0, issues.slice(0, 5).join('; '));
    await sleep(100);
  }
  assert.ok(
    actors.every((a) => a.accepted >= (a.jobActor ? 10 : durationSeconds * 2)),
    'Moving clients average two accepted updates per second and each worker walks to a job',
  );
  if (jobsMode)
    assert.equal(
      counters.jobCompletions,
      roomCount,
      'One service job completed in each neighborhood',
    );
  assert.ok(
    counters.accepted / counters.sent > 0.99,
    'At least 99% movement accepted',
  );
  assert.equal(
    rtts.length + counters.unacknowledged,
    counters.sent,
    'Every measured move must be acknowledged',
  );
  assert.ok(
    quantile(rtts, 0.95) < 1200,
    'p95 send-to-ack below 1.2 seconds from this runner',
  );
  const positions = [];
  for (let start = 0; start < actors.length; start += 5)
    await Promise.all(
      actors.slice(start, start + 5).map(async (a) => {
        await release(a);
        const saved = ok(
          await request(a, 'neighborhood-state', a.c.body(a.controller)),
        );
        assert.equal(saved.writerActive, false);
        assert.deepEqual(
          { x: saved.membership.x, z: saved.membership.z },
          a.lastAccepted,
        );
        positions.push(a.index);
      }),
    );
  durablePositions = positions.length;
  // Verify every saved position even if the measured reconnect exceeded its
  // acceptance target. A failed reliability run still needs durability data.
  assert.ok(
    counters.maxRecoveryMs <= 3000,
    `Unexpected room interruption must recover within three seconds; slowest took ${counters.maxRecoveryMs} ms`,
  );
  report = {
    runId,
    status: 'passed',
    motionMode,
    jobsMode,
    jobsStartSecond,
    identityMode: cohort?.mode ?? 'fresh-ephemeral',
    cohortId: cohort?.cohortId ?? null,
    beganAt: new Date(began).toISOString(),
    measuredAt: new Date(measuredAt).toISOString(),
    completedAt: new Date().toISOString(),
    scope: `Hosted Cloudflare Workers and Durable Objects; ${actors.length} synthetic RoomClients, ${roomCount} neighborhoods; two home visitors and three plaza players per room; ${jobsMode ? 'one service job per room; ' : ''}one network location, no rendered graphics or blockchain transfers`,
    rampMs: measuredAt - began,
    measurementMs,
    ...counters,
    correctionReasons,
    durablePositions,
    moveRtt: {
      p50: quantile(rtts, 0.5),
      p95: quantile(rtts, 0.95),
      p99: quantile(rtts, 0.99),
    },
    httpRtt: {
      p50: quantile(httpRtts, 0.5),
      p95: quantile(httpRtts, 0.95),
    },
    issues,
    peerAnomalies,
    timeline: timeline.snapshot(),
  };
  assert.equal(
    report.timeline.droppedEvents,
    0,
    'Capacity evidence must not drop timeline events',
  );
} catch (e) {
  measuring = false;
  timeline.freezePeers();
  report = {
    runId,
    status: 'failed',
    motionMode,
    jobsMode,
    jobsStartSecond,
    identityMode: cohort?.mode ?? 'fresh-ephemeral',
    cohortId: cohort?.cohortId ?? null,
    beganAt: new Date(began).toISOString(),
    measuredAt: measuredAt ? new Date(measuredAt).toISOString() : null,
    rampMs: measuredAt ? measuredAt - began : null,
    measurementMs: measuredAt ? Date.now() - measuredAt : null,
    at: new Date().toISOString(),
    error: e.message,
    ...counters,
    durablePositions,
    correctionReasons,
    moveRtt: {
      p50: quantile(rtts, 0.5),
      p95: quantile(rtts, 0.95),
      p99: quantile(rtts, 0.99),
    },
    perActorAccepted: actors.map((a) => a.accepted),
    issues,
    peerAnomalies,
    timeline: timeline.snapshot(),
  };
  throw e;
} finally {
  stopped = true;
  measuring = false;
  clearInterval(motion);
  clearInterval(heartbeat);
  clearTimeout(deadline);
  await Promise.allSettled(tasks);
  for (const a of actors) {
    a.transport?.dispose();
    a.socket?.terminate();
  }
  const cleanup = [];
  for (let start = 0; start < actors.length; start += 5)
    await Promise.all(
      actors.slice(start, start + 5).map(async (a) => {
        if (!a.profile) return;
        try {
          await cleanupAction(a, 'neighborhood-leave', a.c.body(a.controller));
          await cleanupAction(a, 'logout', a.c.body());
        } catch (e) {
          cleanup.push({ index: a.index, error: e.message });
        }
      }),
    );
  try {
    if (report) {
      report.cleanupRetries = counters.cleanupRetries;
      report.cleanupErrors = cleanup;
      if (cleanup.length) report.status = 'failed';
      writeFileSync(destination.report, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    cohort?.close();
  }
  assert.equal(
    cleanup.length,
    0,
    'All generated sessions must leave and log out',
  );
}
