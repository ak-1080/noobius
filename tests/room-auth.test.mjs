import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import { joinNeighborhood, changeScene } from '../lib/neighborhoods-server.ts';
import { issueRoomTicket, handleRoomService } from '../lib/room-auth-server.ts';
import {
  roomAuthConfig,
  roomServiceHeaders,
  roomTokenHash,
  opaqueRoomToken,
  verifyRoomServiceRequest,
  ROOM_SERVICE_PATH,
} from '../lib/room-auth.ts';

const now = 1_000_000;
const config = {
  audience: 'https://game.example',
  coordinatorOrigin: 'https://rooms.example',
  activeKey: 'current',
  keys: { current: 'ab'.repeat(32) },
};
const status = (n) => (error) => error.status === n;
async function request(body, cfg = config, time = now, options = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = await roomServiceHeaders(cfg, raw, time, options.nonce);
  return new Request(config.audience + ROOM_SERVICE_PATH, {
    method: 'POST',
    headers,
    body: raw,
  });
}
async function fixture(t, count = 1, expiresAt = now + 600_000) {
  const db = database();
  t.after(() => db.sqlite.close());
  const crew = [];
  for (let i = 0; i < count; i++) {
    const wallet = '0x' + String(i + 1).padStart(40, '0'),
      clientId = crypto.randomUUID();
    const sessionHash = await roomTokenHash(opaqueRoomToken());
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,facility_state,credits) VALUES(?,?,?,?,?)',
      )
      .run(wallet, `Worker ${i}`, now, JSON.stringify(newFacility(now)), 4321);
    db.sqlite
      .prepare(
        'INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)',
      )
      .run(sessionHash, wallet, expiresAt);
    const membership = await joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      {},
      now,
    );
    crew.push({
      session: { wallet, sessionHash, expiresAt },
      controller: { clientId, generation: membership.generation },
      membership,
    });
  }
  const issue = (p = crew[0], time = now, cfg = config, permit) =>
    issueRoomTicket(db, cfg, p.session, p.controller, permit, time);
  const service = async (
    body,
    time = now,
    cfg = config,
    permit,
    clock = () => time,
  ) =>
    handleRoomService(db, await request(body, cfg, time), cfg, permit, clock);
  const connect = async (p = crew[0], time = now, cfg = config, permit) =>
    service(
      {
        operation: 'ticket-consume',
        ticket: (await issue(p, time, cfg, permit)).ticket,
      },
      time,
      cfg,
      permit,
    );
  return { db, crew, issue, service, connect };
}

test('room config defaults off and rejects malformed origins, keys and rotation sets', () => {
  assert.equal(roomAuthConfig({}), null);
  const read = (c, local = false) =>
    roomAuthConfig(
      {
        NOOBIUS_ROOM_AUTH_ENABLED: 'true',
        NOOBIUS_ROOM_AUTH_CONFIG: JSON.stringify(c),
      },
      local,
    );
  assert.deepEqual(read(config), config);
  for (const c of [
    {},
    { ...config, audience: 'http://game.example' },
    { ...config, audience: 'https://game.example/path' },
    { ...config, activeKey: 'missing' },
    { ...config, keys: { current: 'short' } },
    {
      ...config,
      keys: {
        current: config.keys.current,
        one: config.keys.current,
        two: config.keys.current,
      },
    },
  ])
    assert.throws(() => read(c), status(503));
  const local = {
    ...config,
    audience: 'http://127.0.0.1:3003',
    coordinatorOrigin: 'http://localhost:8787',
  };
  assert.throws(() => read(local), status(503));
  assert.deepEqual(read(local, true), local);
});

test('service signatures bind exact bytes, path, origin, audience, key and timestamp', async () => {
  const body = { operation: 'ticket-consume', ticket: 'a'.repeat(64) };
  assert.deepEqual(
    (await verifyRoomServiceRequest(await request(body), config, () => now))
      .body,
    body,
  );
  const signed = await request(body);
  for (const [url, method, raw] of [
    [signed.url, 'POST', JSON.stringify({ ...body, ticket: 'b'.repeat(64) })],
    [config.audience + '/api/noobius/facility', 'POST', JSON.stringify(body)],
    [signed.url + '?operation=other', 'POST', JSON.stringify(body)],
    ['https://other.example' + ROOM_SERVICE_PATH, 'POST', JSON.stringify(body)],
    [signed.url, 'PUT', JSON.stringify(body)],
  ])
    await assert.rejects(
      verifyRoomServiceRequest(
        new Request(url, { method, headers: signed.headers, body: raw }),
        config,
        () => now,
      ),
    );
  await assert.rejects(
    verifyRoomServiceRequest(
      await request(body, { ...config, audience: 'https://other.example' }),
      config,
      () => now,
    ),
    status(401),
  );
  await assert.rejects(
    verifyRoomServiceRequest(
      await request(body, {
        ...config,
        activeKey: 'old',
        keys: { old: config.keys.current },
      }),
      config,
      () => now,
    ),
    status(401),
  );
  await assert.rejects(
    verifyRoomServiceRequest(
      await request(body, config, now - 31_000),
      config,
      () => now,
    ),
    status(401),
  );
  await assert.rejects(
    verifyRoomServiceRequest(
      await request(' '.repeat(4097)),
      config,
      () => now,
    ),
    status(413),
  );
});

test('slow signed bodies cannot outlive the signature window or ticket deadline', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.issue();
  let clock = now;
  const delayed = async (advance) => {
    const raw = JSON.stringify({ operation: 'ticket-consume', ticket });
    const headers = await roomServiceHeaders(config, raw, now);
    const body = new ReadableStream({
      start(c) {
        setTimeout(() => {
          clock = now + advance;
          c.enqueue(new TextEncoder().encode(raw));
          c.close();
        }, 5);
      },
    });
    return new Request(config.audience + ROOM_SERVICE_PATH, {
      method: 'POST',
      headers,
      body,
      duplex: 'half',
    });
  };
  await assert.rejects(
    handleRoomService(
      f.db,
      await delayed(31_000),
      config,
      undefined,
      () => clock,
    ),
    status(401),
  );
  assert.equal(
    f.db.sqlite.prepare('SELECT count(*) AS n FROM room_service_nonces').get()
      .n,
    0,
  );
  clock = now;
  // At exactly 30 seconds the signature is valid but the ticket is expired.
  await assert.rejects(
    handleRoomService(
      f.db,
      await delayed(30_000),
      config,
      undefined,
      () => clock,
    ),
    /ticket expired/,
  );
  assert.equal(
    f.db.sqlite.prepare('SELECT count(*) AS n FROM room_grants').get().n,
    0,
  );
});

test('tickets are hashed, single-use and return only limited room authority', async (t) => {
  const f = await fixture(t),
    p = f.crew[0];
  const issued = await f.issue();
  assert.equal(issued.expiresAt, now + 30_000);
  const stored = f.db.sqlite.prepare('SELECT * FROM room_tickets').get();
  assert.equal(stored.token_hash, await roomTokenHash(issued.ticket));
  assert.notEqual(stored.token_hash, issued.ticket);
  assert.equal(stored.session_hash, p.session.sessionHash);
  const a = await f.service({
    operation: 'ticket-consume',
    ticket: issued.ticket,
  });
  assert.deepEqual(Object.keys(a).sort(), [
    'authorizedUntil',
    'expiresAt',
    'grant',
    'membership',
    'navigation',
    'player',
    'serverNow',
  ]);
  assert.deepEqual(Object.keys(a.player).sort(), [
    'accessory',
    'id',
    'name',
    'outfit',
  ]);
  assert.deepEqual(Object.keys(a.navigation), ['unlocked']);
  const serialized = JSON.stringify(a);
  for (const secret of [
    p.session.wallet,
    p.session.sessionHash,
    'inventory',
    'credits',
    'facility_state',
    'session_hash',
  ])
    assert.ok(!serialized.includes(secret), secret);
  assert.equal(a.authorizedUntil, now + 10_000);
  assert.equal(a.expiresAt, now + 300_000);
  await assert.rejects(
    f.service({ operation: 'ticket-consume', ticket: issued.ticket }),
    status(409),
  );
});

test('concurrent ticket consumers create at most one usable grant; nonces execute once', async (t) => {
  const f = await fixture(t),
    { ticket } = await f.issue();
  const attempts = await Promise.allSettled([
    f.service({ operation: 'ticket-consume', ticket }),
    f.service({ operation: 'ticket-consume', ticket }),
  ]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  const grant = attempts.find((r) => r.status === 'fulfilled').value.grant;
  const r = await request({ operation: 'authority-refresh', grant });
  const attempts2 = await Promise.allSettled([
    handleRoomService(f.db, r.clone(), config, undefined, () => now),
    handleRoomService(f.db, r.clone(), config, undefined, () => now),
  ]);
  assert.equal(attempts2.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal(
    attempts2.find((v) => v.status === 'rejected').reason.status,
    409,
  );
});

test('reissuing replaces only usable tickets; a stale issuer cannot delete a takeover ticket', async (t) => {
  const f = await fixture(t),
    p = f.crew[0];
  const old = await f.issue(),
    newer = await f.issue();
  await assert.rejects(
    f.service({ operation: 'ticket-consume', ticket: old.ticket }),
    status(409),
  );
  await f.service({ operation: 'ticket-consume', ticket: newer.ticket });
  let replacement;
  const staleDb = {
    ...f.db,
    async batch(statements) {
      const clientId = crypto.randomUUID();
      const next = await joinNeighborhood(
        f.db,
        p.session.wallet,
        'commons',
        0,
        clientId,
        { takeover: true },
        now + 1,
      );
      replacement = await issueRoomTicket(
        f.db,
        config,
        p.session,
        { clientId, generation: next.generation },
        undefined,
        now + 1,
      );
      return f.db.batch(statements);
    },
  };
  await assert.rejects(
    issueRoomTicket(staleDb, config, p.session, p.controller, undefined, now),
    status(409),
  );
  await f.service(
    { operation: 'ticket-consume', ticket: replacement.ticket },
    now + 1,
  );
});

test('new grants replace old grants and removed service keys revoke their grants', async (t) => {
  const f = await fixture(t),
    first = await f.connect(),
    second = await f.connect();
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant: first.grant }),
    status(409),
  );
  await f.service({ operation: 'authority-refresh', grant: second.grant });
  const rotating = {
    ...config,
    activeKey: 'next',
    keys: { ...config.keys, next: 'cd'.repeat(32) },
  };
  await f.service(
    { operation: 'authority-refresh', grant: second.grant },
    now,
    rotating,
  );
  const nextOnly = { ...rotating, keys: { next: rotating.keys.next } };
  await assert.rejects(
    f.service(
      { operation: 'authority-refresh', grant: second.grant },
      now,
      nextOnly,
    ),
    status(409),
  );
});

test('originating session logout, expiry and shortening are respected despite a second login', async (t) => {
  const f = await fixture(t),
    p = f.crew[0],
    { grant } = await f.connect();
  f.db.sqlite
    .prepare('INSERT INTO sessions VALUES(?,?,?)')
    .run('another-session', p.session.wallet, now + 900_000);
  f.db.sqlite
    .prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?')
    .run(now + 7000, p.session.sessionHash);
  const fresh = await f.service(
    { operation: 'authority-refresh', grant },
    now + 1000,
  );
  assert.equal(fresh.authorizedUntil, now + 7000);
  assert.equal(fresh.expiresAt, now + 7000);
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }, now + 7000),
    status(409),
  );
  f.db.sqlite
    .prepare('DELETE FROM sessions WHERE token_hash=?')
    .run(p.session.sessionHash);
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }),
    status(409),
  );
});

test('authority refresh preserves position freshness, observes HTTP travel, and never resurrects leases', async (t) => {
  const f = await fixture(t),
    p = f.crew[0],
    { grant } = await f.connect();
  f.db.sqlite
    .prepare(
      'UPDATE crew_presence SET x=12,z=14,sequence=7,updated_at=? WHERE wallet=?',
    )
    .run(now + 1000, p.session.wallet);
  const a = await f.service(
    { operation: 'authority-refresh', grant },
    now + 4000,
  );
  assert.equal(a.membership.x, 12);
  assert.equal(a.membership.z, 14);
  assert.equal(a.membership.sequence, 7);
  assert.equal(a.membership.leaseUntil, now + 49000);
  assert.equal(
    f.db.sqlite.prepare('SELECT updated_at FROM crew_presence').get()
      .updated_at,
    now + 1000,
  );
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }, now + 49000),
    status(409),
  );
  assert.equal(
    f.db.sqlite.prepare('SELECT lease_until FROM crew_presence').get()
      .lease_until,
    now + 49000,
  );
});

test('a concurrent replacement between authorization and refresh cannot renew the stale grant', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const before = f.db.sqlite
    .prepare('SELECT lease_until FROM crew_presence')
    .get().lease_until;
  const raced = {
    ...f.db,
    prepare(sql) {
      if (sql.startsWith('UPDATE crew_presence AS c'))
        f.db.sqlite
          .prepare('UPDATE room_grants SET grant_hash=?')
          .run('f'.repeat(64));
      return f.db.prepare(sql);
    },
  };
  await assert.rejects(
    handleRoomService(
      raced,
      await request(
        { operation: 'authority-refresh', grant },
        config,
        now + 1000,
      ),
      config,
      undefined,
      () => now + 1000,
    ),
    status(409),
  );
  assert.equal(
    f.db.sqlite.prepare('SELECT lease_until FROM crew_presence').get()
      .lease_until,
    before,
  );
});

test('controller takeover, scene change and expired tickets invalidate earlier connections', async (t) => {
  const f = await fixture(t),
    p = f.crew[0],
    issued = await f.issue();
  await assert.rejects(
    f.service(
      { operation: 'ticket-consume', ticket: issued.ticket },
      now + 30000,
    ),
    status(409),
  );
  const { grant } = await f.connect();
  const scene = await changeScene(
    f.db,
    p.session.wallet,
    p.controller,
    'home-' +
      f.db.sqlite.prepare('SELECT public_id FROM players').get().public_id,
    now,
  );
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }),
    status(409),
  );
  p.controller.generation = scene.generation;
  const interior = await f.connect();
  await joinNeighborhood(
    f.db,
    p.session.wallet,
    'commons',
    0,
    crypto.randomUUID(),
    { takeover: true },
    now + 1,
  );
  await assert.rejects(
    f.service(
      { operation: 'authority-refresh', grant: interior.grant },
      now + 1,
    ),
    status(409),
  );
});

test('private interior permission and realm entitlement are rechecked at refresh', async (t) => {
  const f = await fixture(t, 2),
    [host, guest] = f.crew;
  const hostId = f.db.sqlite
    .prepare('SELECT public_id FROM players WHERE wallet=?')
    .get(host.session.wallet).public_id;
  const scene = await changeScene(
    f.db,
    guest.session.wallet,
    guest.controller,
    'home-' + hostId,
    now,
  );
  guest.controller.generation = scene.generation;
  const a = await f.connect(guest);
  f.db.sqlite
    .prepare(
      'INSERT INTO social_preferences(wallet,target_wallet,blocked) VALUES(?,?,1)',
    )
    .run(host.session.wallet, guest.session.wallet);
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant: a.grant }),
    status(409),
  );
  f.db.sqlite.prepare('DELETE FROM social_preferences').run();
  f.db.sqlite
    .prepare('UPDATE crew_presence SET lease_until=? WHERE wallet=?')
    .run(now, host.session.wallet);
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant: a.grant }),
    status(409),
  );
  f.db.sqlite
    .prepare('UPDATE crew_presence SET lease_until=? WHERE wallet=?')
    .run(now + 45000, host.session.wallet);
  f.db.sqlite.prepare("UPDATE neighborhoods SET realm='gpu'").run();
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant: a.grant }),
    status(409),
  );
});

test('narrow service operations reject arbitrary identity, checkpoints and client positions before mutation', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const before = f.db.sqlite.prepare('SELECT * FROM crew_presence').get();
  for (const body of [
    { operation: 'movement-checkpoint', grant, x: 20, z: 20 },
    { operation: 'authority-refresh', grant, wallet: f.crew[0].session.wallet },
    { operation: 'facility', grant, action: { type: 'collect' } },
  ])
    await assert.rejects(f.service(body), status(400));
  assert.deepEqual(
    f.db.sqlite.prepare('SELECT * FROM crew_presence').get(),
    before,
  );
  assert.equal(
    f.db.sqlite.prepare('SELECT credits FROM players').get().credits,
    4321,
  );
  const r = await request({ operation: 'authority-refresh', grant });
  r.headers.set('X-Noobius-Room-Signature', '0'.repeat(64));
  const nonceCount = f.db.sqlite
    .prepare('SELECT count(*) AS n FROM room_service_nonces')
    .get().n;
  await assert.rejects(
    handleRoomService(f.db, r, config, undefined, () => now),
    status(401),
  );
  assert.equal(
    f.db.sqlite.prepare('SELECT count(*) AS n FROM room_service_nonces').get()
      .n,
    nonceCount,
  );
});
