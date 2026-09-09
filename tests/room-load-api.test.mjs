import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { Client } from './api-client.mjs';
import { RoomClient } from '../lib/room-client.ts';
import {
  qaOrigin as origin,
  qaSql,
  sqlQuote as q,
  withQaDb,
} from './room-qa-db.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const ids = (people) => people.map((person) => person.id).sort();
const percentile = (values, quantile) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length
    ? Number(
        ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)].toFixed(
          2,
        ),
      )
    : null;
};

void test(
  'ten isolated neighborhoods retain fifty moving clients and private peer scopes',
  { timeout: 180_000 },
  async (t) => {
    const reportPath = '/tmp/noobius-room-load-results.json';
    rmSync(reportPath, { force: true });
    const runId = crypto.randomUUID();
    const rooms = Array.from({ length: 10 }, () =>
      crypto.randomUUID().replaceAll('-', ''),
    );
    const actors = [],
      sockets = [],
      issues = [],
      rtts = [],
      metadataRtts = [];
    const setupTasks = new Set();
    const metrics = {
      moves: 0,
      accepted: 0,
      corrections: 0,
      peerFrames: 0,
      authorityFrames: 0,
      inboundSocketBytes: 0,
      metadataRequests: 0,
    };
    let stopping = false;
    let measuring = false;
    const timers = { motion: undefined };
    const allSettled = async (tasks, setup = false) => {
      if (setup) for (const task of tasks) setupTasks.add(task);
      const outcomes = await Promise.allSettled(tasks);
      if (setup) for (const task of tasks) setupTasks.delete(task);
      const failed = outcomes.find((outcome) => outcome.status === 'rejected');
      if (failed) throw failed.reason;
      return outcomes.map((outcome) => outcome.value);
    };
    const requireActive = () =>
      assert.equal(stopping, false, 'QA setup was cancelled');
    t.after(async () => {
      stopping = true;
      measuring = false;
      clearInterval(timers.motion);
      // Settle the whole current batch before disposing: one failed ticket
      // must not leave its sibling tasks opening sockets after cleanup.
      await Promise.allSettled(setupTasks);
      for (const actor of actors) actor.browser?.dispose();
      for (const socket of sockets) socket.terminate();
      await Promise.allSettled(
        actors.map(async (actor) => {
          try {
            if (actor.state)
              await actor.c.request(
                'neighborhood-leave',
                actor.c.body(actor.controller),
              );
          } finally {
            await actor.c.request('logout', actor.c.body());
          }
        }),
      );
    });
    qaSql(
      rooms
        .map(
          (id) =>
            `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (${q(id)},'commons',0,${Date.now()})`,
        )
        .join(';'),
    );
    const identity = (membership) => ({
      neighborhoodId: membership.neighborhoodId,
      generation: membership.generation,
      scene: membership.scene,
    });
    const connect = async (actor) => {
      requireActive();
      const ticket = ok(
        await actor.c.request('room-ticket', actor.c.body(actor.controller)),
      );
      requireActive();
      assert.equal(ticket.coordinatorOrigin, 'http://127.0.0.1:3004');
      const browser = new RoomClient({
        ...ticket,
        membership: actor.state.membership,
        createSocket: (url) => {
          requireActive();
          assert.equal(new URL(url).origin, 'ws://127.0.0.1:3004');
          const socket = new WebSocket(url, { origin }),
            send = socket.send.bind(socket);
          sockets.push(socket);
          socket.send = (data, ...rest) => {
            const frame = JSON.parse(String(data));
            if (frame.type === 'move') {
              if (measuring) {
                metrics.moves++;
                actor.moves++;
              }
              actor.pending.set(frame.inputSequence, {
                at: performance.now(),
                measured: measuring,
              });
            }
            return send(data, ...rest);
          };
          socket.on('message', (raw) => {
            if (measuring) metrics.inboundSocketBytes += raw.length;
            const frame = JSON.parse(String(raw));
            if (measuring && frame.type === 'authority')
              metrics.authorityFrames++;
            if (frame.type === 'move-ack') {
              const pending = actor.pending.get(frame.inputSequence);
              if (pending) {
                if (pending.measured) rtts.push(performance.now() - pending.at);
                actor.pending.delete(frame.inputSequence);
              }
              if (frame.accepted) {
                actor.acceptedPoint = { ...frame.position };
                if (pending?.measured) {
                  metrics.accepted++;
                  actor.accepted++;
                }
              } else if (pending?.measured) {
                metrics.corrections++;
                actor.corrections++;
              }
            }
          });
          return socket;
        },
        readPosition: () => actor.point,
        onMembership: (membership) => {
          actor.state = { ...actor.state, membership };
          if (
            JSON.stringify(identity(membership)) !==
            JSON.stringify(actor.identity)
          )
            issues.push('Membership changed: actor ' + actor.index);
        },
        onPeople: (people) => {
          actor.peerIds = ids(people);
          actor.lastPeerAt = performance.now();
          actor.peerFrames++;
          if (measuring) metrics.peerFrames++;
          if (new Set(actor.peerIds).size !== people.length)
            issues.push('Duplicate peer: actor ' + actor.index);
          for (const person of people) {
            actor.seen.add(person.id);
            if (!actor.expectedPeerIds.includes(person.id))
              issues.push(
                'Peer leaked across a room or private scene: actor ' +
                  actor.index,
              );
            if (
              ['wallet', 'inventory', 'credits', 'grant', 'session_hash'].some(
                (key) => Object.hasOwn(person, key),
              )
            )
              issues.push('Private peer data exposed: actor ' + actor.index);
          }
          if (
            measuring &&
            JSON.stringify(actor.peerIds) !==
              JSON.stringify(actor.expectedPeerIds)
          )
            issues.push('Incomplete scene peers: actor ' + actor.index);
        },
        onCorrection: (point) => {
          actor.point = { ...point };
        },
        onReady: () => {},
        onDisconnect: (reason) => {
          if (!stopping)
            issues.push(
              'Unexpected disconnect for actor ' + actor.index + ': ' + reason,
            );
        },
      });
      actor.browser = browser;
      await browser.connect();
      requireActive();
      assert.equal(browser.ready, true);
    };

    const rampStarted = performance.now();
    // Separate synthetic clients have separate edge IPs only on loopback. The
    // same-IP auth limit is tested elsewhere; this probe measures game transport.
    // Connect each admitted room before creating the next, so setup itself does
    // not leave the earliest players waiting out their 45-second presence lease.
    for (let roomIndex = 0; roomIndex < 10; roomIndex++) {
      const group = await allSettled(
        Array.from({ length: 5 }, async (_, lane) => {
          requireActive();
          const index = roomIndex * 5 + lane,
            c = new Client(),
            request = c.request.bind(c);
          c.request = (action, body) =>
            request(action, body, {
              'CF-Connecting-IP': '198.51.100.' + (index + 1),
            });
          const actor = {
            c,
            index,
            room: rooms[roomIndex],
            controller: { clientId: crypto.randomUUID(), generation: 0 },
            point: { x: 0, z: 17 },
            acceptedPoint: { x: 0, z: 17 },
            state: null,
            browser: null,
            pending: new Map(),
            seen: new Set(),
            peerIds: [],
            expectedPeerIds: [],
            lastPeerAt: 0,
            peerFrames: 0,
            moves: 0,
            accepted: 0,
            corrections: 0,
          };
          actors.push(actor);
          actor.profile = ok(await c.login()).profile;
          requireActive();
          actor.state = ok(
            await c.request(
              'neighborhood-join',
              c.body({
                ...actor.controller,
                realm: 'commons',
                target: actor.room,
              }),
            ),
          );
          actor.controller.generation = actor.state.membership.generation;
          requireActive();
          return actor;
        }),
        true,
      );
      const privateScene = 'home-' + group[0].profile.id;
      await allSettled(
        group.slice(0, 2).map(async (actor) => {
          requireActive();
          actor.state = ok(
            await actor.c.request(
              'neighborhood-scene',
              actor.c.body({ ...actor.controller, scene: privateScene }),
            ),
          );
          actor.controller.generation = actor.state.membership.generation;
          requireActive();
        }),
        true,
      );
      for (const actor of group) {
        actor.identity = identity(actor.state.membership);
        actor.roomIds = ids(group.map((member) => member.profile));
        actor.expectedPeerIds = ids(
          group
            .filter(
              (member) =>
                member.state.membership.scene === actor.identity.scene,
            )
            .map((member) => member.profile),
        );
        assert.equal(
          actor.expectedPeerIds.length,
          actor.identity.scene === 'commons' ? 3 : 2,
        );
      }
      await allSettled(group.map(connect), true);
    }
    assert.equal(actors.length, 50);
    const rampMs = performance.now() - rampStarted;
    const readyDeadline = Date.now() + 8000;
    while (
      !actors.every(
        (actor) =>
          JSON.stringify(actor.peerIds) ===
          JSON.stringify(actor.expectedPeerIds),
      )
    ) {
      assert.equal(issues.length, 0, issues.join('; '));
      assert.ok(
        Date.now() < readyDeadline,
        'Each room must expose exactly two interior peers and three plaza peers',
      );
      await sleep(50);
    }
    const walletSql = actors.map((actor) => q(actor.profile.wallet)).join(',');
    const checkpointCounts = () =>
      new Map(
        withQaDb((db) =>
          db
            .prepare(
              `SELECT g.wallet,COUNT(c.id) AS checkpoints FROM room_grants g LEFT JOIN room_checkpoints c ON c.grant_hash=g.grant_hash WHERE g.wallet IN (${walletSql}) GROUP BY g.wallet`,
            )
            .all(),
        ).map((row) => [row.wallet, row.checkpoints]),
      );
    const assertOccupancy = () => {
      const rows = withQaDb((db) =>
        db
          .prepare(
            `SELECT neighborhood_id,COUNT(*) AS occupants,COUNT(DISTINCT slot) AS slots FROM crew_presence WHERE neighborhood_id IN (${rooms.map(q).join(',')}) AND lease_until>${Date.now()} GROUP BY neighborhood_id`,
          )
          .all(),
      );
      assert.equal(rows.length, 10);
      for (const row of rows) {
        assert.equal(
          row.occupants,
          5,
          'Every neighborhood retains five occupants',
        );
        assert.equal(row.slots, 5, 'Each occupant owns a distinct room slot');
      }
    };
    assertOccupancy();
    const checkpointsBefore = checkpointCounts();
    assert.equal(checkpointsBefore.size, 50);
    const began = performance.now();
    measuring = true;
    timers.motion = setInterval(() => {
      const elapsed = performance.now() - began;
      for (const actor of actors)
        if (actor.browser.ready)
          actor.point = {
            x: 0,
            z: 17 - 0.4 * Math.sin(elapsed / 1200 + actor.index * 0.19) ** 2,
          };
    }, 160);
    for (let round = 0; round < 12; round++) {
      const roundAt = performance.now();
      const peerFramesBefore = new Map(
        actors.map((actor) => [actor, actor.peerFrames]),
      );
      await allSettled(
        actors.map(async (actor) => {
          const start = performance.now();
          const result = ok(
            await actor.c.request(
              'neighborhood-state',
              actor.c.body(actor.controller),
            ),
          );
          metrics.metadataRequests++;
          metadataRtts.push(performance.now() - start);
          assert.deepEqual(identity(result.membership), actor.identity);
          assert.equal(result.writerActive, true);
          assert.deepEqual(
            ids(result.neighbors),
            actor.roomIds,
            'HTTP metadata retains all five neighborhood occupants',
          );
          assert.deepEqual(
            ids(result.people),
            actor.expectedPeerIds,
            'HTTP presence respects private scenes',
          );
        }),
      );
      await sleep(Math.max(0, 5000 - (performance.now() - roundAt)));
      assert.equal(issues.length, 0, issues.join('; '));
      for (const actor of actors) {
        assert.equal(
          actor.browser.ready,
          true,
          'Every client must remain ready',
        );
        assert.deepEqual(actor.peerIds, actor.expectedPeerIds);
        assert.ok(
          actor.peerFrames > peerFramesBefore.get(actor),
          'Every client receives new peer frames each round',
        );
        assert.ok(
          performance.now() - actor.lastPeerAt < 3000,
          'Peer frames remain fresh for every client',
        );
      }
    }
    clearInterval(timers.motion);
    await allSettled(
      actors.map(async (actor) => {
        assert.equal(await actor.browser.syncPosition(), true);
        assert.equal(
          actor.pending.size,
          0,
          'Every final movement has an acknowledgement',
        );
      }),
    );
    measuring = false;
    const elapsedMs = performance.now() - began;
    assertOccupancy();
    const checkpointsAfter = checkpointCounts();
    const perActor = actors
      .map((actor) => {
        const checkpoints =
          (checkpointsAfter.get(actor.profile.wallet) ?? 0) -
          checkpointsBefore.get(actor.profile.wallet);
        assert.ok(
          actor.accepted >= 250,
          'Actor ' + actor.index + ' must exercise at least 250 accepted moves',
        );
        assert.equal(actor.corrections, 0);
        assert.ok(
          checkpoints >= 10,
          'Actor ' +
            actor.index +
            ' must persist at least ten checkpoints during the measured run',
        );
        assert.deepEqual(
          [...actor.seen].sort((a, b) => a.localeCompare(b)),
          actor.expectedPeerIds,
        );
        return {
          actor: actor.index,
          scene: actor.identity.scene === 'commons' ? 'commons' : 'interior',
          moves: actor.moves,
          accepted: actor.accepted,
          checkpoints,
        };
      })
      .sort((a, b) => a.actor - b.actor);
    assert.equal(
      metrics.corrections,
      0,
      'Ordinary movement must need no correction',
    );
    assert.equal(metrics.metadataRequests, 600);
    assert.equal(
      rtts.length,
      metrics.moves,
      'The RTT sample includes every measured movement',
    );
    assert.equal(issues.length, 0, issues.join('; '));

    // A successful load probe also demonstrates that its last accepted moves
    // survive release, rather than counting only historical checkpoint rows.
    const finalPoints = new Map(
      actors.map((actor) => [actor, { ...actor.acceptedPoint }]),
    );
    await allSettled(
      actors.map(async (actor) => {
        await actor.browser.release();
        const state = ok(
          await actor.c.request(
            'neighborhood-state',
            actor.c.body(actor.controller),
          ),
        );
        assert.equal(state.writerActive, false);
        assert.deepEqual(identity(state.membership), actor.identity);
        assert.deepEqual(
          { x: state.membership.x, z: state.membership.z },
          finalPoints.get(actor),
        );
      }),
    );
    const durablePositions = withQaDb((db) =>
      db
        .prepare(
          `SELECT wallet,neighborhood_id,room,generation,x,z FROM crew_presence WHERE wallet IN (${walletSql})`,
        )
        .all(),
    );
    assert.equal(durablePositions.length, 50);
    for (const row of durablePositions) {
      const actor = actors.find(
        (candidate) => candidate.profile.wallet === row.wallet,
      );
      assert.deepEqual(
        {
          neighborhoodId: row.neighborhood_id,
          scene: row.room,
          generation: row.generation,
        },
        actor.identity,
      );
      assert.deepEqual({ x: row.x, z: row.z }, finalPoints.get(actor));
    }
    assert.equal(issues.length, 0, issues.join('; '));
    const result = {
      runId,
      status: 'passed',
      scope:
        'Local Workers/Miniflare only; ten rooms, fifty synthetic RoomClients, each room split into two interior peers and three plaza peers; no rendered browser, hosted capacity or cost certification',
      completedAt: new Date().toISOString(),
      rampMs: Math.round(rampMs),
      elapsedMs: Math.round(elapsedMs),
      ...metrics,
      durableCheckpoints: perActor.reduce(
        (total, actor) => total + actor.checkpoints,
        0,
      ),
      durableFinalPositions: durablePositions.length,
      moveRtt: {
        p50: percentile(rtts, 0.5),
        p95: percentile(rtts, 0.95),
        p99: percentile(rtts, 0.99),
      },
      metadataRtt: {
        p50: percentile(metadataRtts, 0.5),
        p95: percentile(metadataRtts, 0.95),
        p99: percentile(metadataRtts, 0.99),
      },
      measurement:
        'Movement RTT is send-to-ack over loopback; inboundSocketBytes includes only inbound WebSocket messages during the measured interval. Setup, HTTP bytes, coordinator service traffic and rendered peer latency are excluded.',
      perActor,
      issues,
    };
    // Publish only after every correctness assertion, so an early failure can
    // never leave a previous or partially checked success report behind.
    writeFileSync(reportPath, JSON.stringify(result, null, 2));
    t.diagnostic(JSON.stringify(result));
  },
);
