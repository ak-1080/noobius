// Bounded local simulation; never targets the hosted game or a user's wallet.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Client } from './api-client.mjs';
import { qaSql } from './room-qa-db.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const rooms = Array.from({ length: 10 }, () =>
  crypto.randomUUID().replaceAll('-', ''),
);
qaSql(
  rooms
    .map(
      (id) =>
        `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES ('${id}','commons',0,${Date.now()})`,
    )
    .join(';'),
);
const clients = Array.from({ length: 50 }, (_, i) => {
  const c = new Client(),
    request = c.request.bind(c);
  // Model separate clients' edge-provided IPs only on loopback. A shared-IP
  // sign-in burst has a separate 20-auth-request/minute limit, intentionally.
  c.request = (action, body) =>
    request(action, body, { 'CF-Connecting-IP': '198.51.100.' + (i + 1) });
  c.controller = { clientId: crypto.randomUUID(), generation: 0 };
  c.command = (action, body = {}) =>
    c.request(action, c.body({ ...c.controller, ...body }));
  return c;
});
const started = Date.now(),
  latencies = [],
  errors = [],
  corrections = [];
try {
  // Ramp authentication separately from the synchronized presence burst.
  for (let i = 0; i < clients.length; i += 5) {
    await Promise.all(
      clients.slice(i, i + 5).map(async (c) => {
        c.id = ok(await c.login()).profile.id;
      }),
    );
  }
  await Promise.all(
    clients.map(async (c, i) => {
      const data = ok(
        await c.command('neighborhood-join', {
          realm: 'commons',
          target: rooms[Math.floor(i / 5)],
        }),
      );
      c.membership = data.membership;
      c.controller.generation = data.membership.generation;
      assert.ok(data.neighbors.length <= 5);
    }),
  );
  console.log(
    '50 signed-in clients admitted to 10 neighborhoods; starting 60-second sync run.',
  );
  for (let round = 0; round < 40; round++) {
    const began = performance.now();
    await Promise.all(
      clients.map(async (c, i) => {
        if (round === 10 || round === 25) {
          const scene =
            round === 10 && i % 2 === 0 ? 'home-' + c.id : 'commons';
          const entered = ok(await c.command('neighborhood-scene', { scene }));
          c.membership = entered.membership;
          c.controller.generation = entered.membership.generation;
        }
        const then = performance.now();
        const response = await c.command('neighborhood-sync', {
          sequence: c.membership.sequence + 1,
          position: { x: 0, z: 17 + Math.sin(round / 3) * 0.5 },
        });
        latencies.push(performance.now() - then);
        if (response.status !== 200) {
          errors.push({
            round,
            status: response.status,
            error: response.data.error,
          });
          return;
        }
        const data = response.data;
        assert.ok(data.neighbors.length <= 5);
        assert.equal(data.membership.neighborhoodId, rooms[Math.floor(i / 5)]);
        if (data.corrected) corrections.push({ round, client: i });
        c.membership = data.membership;
      }),
    );
    await wait(Math.max(0, 1500 - (performance.now() - began)));
  }
  const sorted = [...latencies].sort((a, b) => a - b),
    percentile = (p) => Math.round(sorted[Math.ceil(sorted.length * p) - 1]);
  const result = {
    scope:
      'local Miniflare; 50 synthetic clients, ten neighborhoods; not production capacity proof',
    completedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    requests: latencies.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: Math.round(sorted.at(-1)),
    errors,
    corrections,
  };
  writeFileSync(
    '/tmp/noobius-neighborhood-load-results.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  assert.equal(errors.length, 0);
  assert.equal(corrections.length, 0);
} finally {
  await Promise.allSettled(
    clients
      .filter((c) => c.membership)
      .map((c) => c.command('neighborhood-leave')),
  );
}
