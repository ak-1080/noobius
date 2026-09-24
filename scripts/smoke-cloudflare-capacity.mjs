// Bounded hosted capacity probe using generated, unfunded Solana accounts.
// Production is capped at fifty clients; isolated staging can test above that.
// Uses public admission and real RoomClient transport; no fixture SQL or tokens.
// Respects normal authentication throttles, then leaves/logs out.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { base58 } from '@scure/base';
import WebSocket from 'ws';
import { RoomClient } from '../lib/room-client.ts';
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
const correctionReasons = {};
const { Client } = await import('../tests/api-client.mjs');
const actors = [],
  tasks = new Set(),
  issues = [],
  rtts = [],
  httpRtts = [];
const runId = crypto.randomUUID(),
  began = Date.now();
let stopped = false,
  measuring = false,
  phase = 0;
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
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const ids = (xs) => xs.map((x) => x.id).sort();
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
  const auth = async (action, body) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await request(a, action, body);
      if (r.status !== 429) return ok(r);
      const delay = 60200 - (Date.now() % 60000);
      console.log(
        'Auth rate limit respected; waiting',
        Math.ceil(delay / 1000),
        'seconds',
      );
      for (let remaining = delay; remaining > 0; remaining -= 10000) {
        await sleep(Math.min(remaining, 10000));
        assert.ok(!stopped);
      }
    }
    throw Error('Authentication remained throttled');
  };
  const nonce = await auth('nonce', {
    address: a.address,
    ecosystem: 'solana',
  });
  const signature =
    '0x' +
    Buffer.from(
      await crypto.subtle.sign(
        'Ed25519',
        a.keys.privateKey,
        new TextEncoder().encode(nonce.message),
      ),
    ).toString('hex');
  a.profile = (await auth('verify', { signature })).profile;
}
async function connect(a, fastRenew = false) {
  if (stopped) return;
  a.transport?.dispose();
  const previousRoom = a.membership?.neighborhoodId;
  const refreshMembership = async () => {
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
      if (!measuring) return;
      counters.peerFrames++;
      if (
        a.peers.some((id) => !a.expected.includes(id)) ||
        new Set(a.peers).size !== a.peers.length
      )
        issues.push('Foreign or duplicate peer for ' + a.index);
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
            if (reason !== 'renew') await sleep(500);
            const until = Date.now() + 60000;
            for (let attempt = 0; Date.now() < until && !stopped; attempt++) {
              try {
                await connect(a, reason === 'renew' && attempt === 0);
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
    counters.maxRecoveryMs = Math.max(
      counters.maxRecoveryMs,
      Date.now() - a.recoveryStartedAt,
    );
    a.recoveryStartedAt = 0;
  }
  if (a.renewalStartedAt) {
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
      a.transitioning = false;
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
let lastMotionAt = performance.now();
const motion = setInterval(
  () => {
    const now = performance.now();
    const seconds = Math.min(0.05, (now - lastMotionAt) / 1000);
    lastMotionAt = now;
    if (stopped || !measuring) return;
    phase += 0.16;
    for (const a of actors) {
      if (!a.transport?.ready) continue;
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
try {
  assert.equal((await fetch(origin + '/api/health')).status, 200);
  for (let group = 0; group < roomCount; group++) {
    const members = [];
    let target;
    for (let lane = 0; lane < 5; lane++) {
      assert.ok(!stopped);
      assert.equal(issues.length, 0, issues.join('; '));
      const keys = await crypto.subtle.generateKey('Ed25519', true, [
        'sign',
        'verify',
      ]);
      const address = base58.encode(
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
      await a.transport.release();
      const changed = ok(
        await request(
          a,
          'neighborhood-scene',
          a.c.body({ ...a.controller, scene: 'home-' + members[0].profile.id }),
        ),
      );
      a.membership = changed.membership;
      a.controller.generation = a.membership.generation;
      await connectWithRetry(a);
      a.transitioning = false;
    }
    for (const a of members)
      a.expected = ids(
        members
          .filter((b) => b.membership.scene === a.membership.scene)
          .map((b) => b.profile),
      );
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
  const measuredAt = Date.now();
  measuring = true;
  // Moving clients plus ordinary saved-profile reads, distributed over 90 seconds.
  for (let second = 0; second < durationSeconds; second++) {
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
  const measurementMs = Date.now() - measuredAt;
  measuring = false;
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
    actors.every((a) => a.accepted >= durationSeconds * 2),
    'Every client averages at least two accepted updates per scheduled second',
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
  report = {
    runId,
    status: 'passed',
    motionMode,
    beganAt: new Date(began).toISOString(),
    measuredAt: new Date(measuredAt).toISOString(),
    completedAt: new Date().toISOString(),
    scope: `Hosted Cloudflare Workers and Durable Objects; ${actors.length} synthetic RoomClients, ${roomCount} neighborhoods; two home visitors and three plaza players per room; one network location, no rendered graphics or blockchain transfers`,
    rampMs: measuredAt - began,
    measurementMs,
    ...counters,
    correctionReasons,
    durablePositions: positions.length,
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
  };
} catch (e) {
  report = {
    runId,
    status: 'failed',
    motionMode,
    at: new Date().toISOString(),
    error: e.message,
    ...counters,
    correctionReasons,
    moveRtt: {
      p50: quantile(rtts, 0.5),
      p95: quantile(rtts, 0.95),
      p99: quantile(rtts, 0.99),
    },
    perActorAccepted: actors.map((a) => a.accepted),
    issues,
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
  if (report) {
    report.cleanupRetries = counters.cleanupRetries;
    report.cleanupErrors = cleanup;
    if (cleanup.length) report.status = 'failed';
    writeFileSync(destination.report, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
  assert.equal(
    cleanup.length,
    0,
    'All generated sessions must leave and log out',
  );
}
