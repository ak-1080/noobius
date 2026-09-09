import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import {
  joinNeighborhood,
  syncNeighborhood,
} from '../lib/neighborhoods-server.ts';
import { issueRoomTicket, handleRoomService } from '../lib/room-auth-server.ts';
import {
  ROOM_SERVICE_PATH,
  opaqueRoomToken,
  roomServiceHeaders,
  roomTokenHash,
} from '../lib/room-auth.ts';
import {
  httpMovementGuard,
  roomWorkGuard,
  roomActionIntent,
} from '../lib/room-writer.ts';

const NOW = 1_000_000;
const config = {
  audience: 'https://game.example',
  coordinatorOrigin: 'https://rooms.example',
  activeKey: 'current',
  keys: { current: 'ab'.repeat(32) },
};
const status = (expected) => (error) => error.status === expected;

async function fixture(t) {
  const db = database();
  let dbTime = NOW;
  // Control the database clock independently of the signed request timestamp.
  // The half millisecond avoids floating-point truncation at an exact boundary.
  db.sqlite.function('julianday', (value) => {
    assert.equal(value, 'now');
    return (dbTime + 0.5) / 86_400_000 + 2_440_587.5;
  });
  const setDbTime = (time) => {
    dbTime = time;
  };
  t.after(() => db.sqlite.close());
  db.sqlite.exec('PRAGMA foreign_keys=ON');
  const wallet = '0x' + 'ab'.repeat(20);
  const session = {
    wallet,
    sessionHash: await roomTokenHash(opaqueRoomToken()),
    expiresAt: NOW + 600_000,
  };
  db.sqlite
    .prepare(
      'INSERT INTO players(wallet,name,created_at,facility_state,credits) VALUES(?,?,?,?,?)',
    )
    .run(
      wallet,
      'Checkpoint worker',
      NOW,
      JSON.stringify(newFacility(NOW)),
      4321,
    );
  db.sqlite
    .prepare('INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)')
    .run(session.sessionHash, wallet, session.expiresAt);
  const clientId = crypto.randomUUID();
  const membership = await joinNeighborhood(
    db,
    wallet,
    'commons',
    0,
    clientId,
    {},
    NOW,
  );
  const controller = { clientId, generation: membership.generation };
  const signed = async (body, time) => {
    const raw = JSON.stringify(body);
    return new Request(config.audience + ROOM_SERVICE_PATH, {
      method: 'POST',
      headers: await roomServiceHeaders(config, raw, time),
      body: raw,
    });
  };
  const service = async (body, time = NOW, target = db) =>
    handleRoomService(
      target,
      await signed(body, time),
      config,
      undefined,
      () => time,
    );
  const admissions = new Map();
  const connect = async (time = NOW, owner = controller) => {
    const issued = await issueRoomTicket(
      db,
      config,
      session,
      owner,
      undefined,
      time,
    );
    const connected = await service(
      { operation: 'ticket-consume', ticket: issued.ticket },
      time,
    );
    admissions.set(connected.grant, connected.membership.sequence);
    return connected;
  };
  const base = (grant) => admissions.get(grant);
  const presence = () => ({
    ...db.sqlite
      .prepare('SELECT * FROM crew_presence WHERE wallet=?')
      .get(wallet),
  });
  const grantRow = () => ({
    ...db.sqlite
      .prepare('SELECT * FROM room_grants WHERE wallet=?')
      .get(wallet),
  });
  const receipts = () =>
    db.sqlite
      .prepare('SELECT * FROM room_checkpoints ORDER BY id')
      .all()
      .map((r) => ({ ...r }));
  const checkpoint = (grant, overrides = {}) => ({
    operation: 'movement-checkpoint',
    grant,
    id: crypto.randomUUID(),
    baseSequence: base(grant),
    inputSequence: 12,
    x: 2,
    z: 17,
    ...overrides,
  });
  const allowed = (guard) =>
    db.sqlite
      .prepare(
        `SELECT ${guard} AS allowed FROM crew_presence c WHERE c.wallet=?`,
      )
      .get(wallet).allowed === 1;
  // Reproduce the existing already-authorized HTTP travel batch. The test
  // exercises its transport race, not facility travel eligibility or rewards.
  const travel = (x, z, time = NOW + 1000) =>
    db.batch([
      db
        .prepare(
          'UPDATE players SET facility_version=facility_version+1 WHERE wallet=?',
        )
        .bind(wallet),
      db
        .prepare(
          'UPDATE crew_presence SET x=?,z=?,sequence=sequence+1,updated_at=? WHERE wallet=? AND client_id=? AND generation=? AND changes()=1',
        )
        .bind(x, z, time, wallet, controller.clientId, controller.generation),
    ]);
  return {
    db,
    wallet,
    session,
    controller,
    membership,
    service,
    connect,
    base,
    presence,
    grantRow,
    receipts,
    checkpoint,
    allowed,
    travel,
    setDbTime,
  };
}

// Pause immediately before a real SQLite transaction, then perform the rival
// mutation on that same database. No query result or successful write is mocked.
function beforeCheckpointBatch(f, rival) {
  let fired = false;
  return {
    ...f.db,
    async batch(statements) {
      if (
        !fired &&
        statements.some((s) =>
          s.sql.startsWith('UPDATE crew_presence AS c SET x='),
        )
      ) {
        fired = true;
        await rival();
      }
      return f.db.batch(statements);
    },
  };
}

test('lost checkpoint responses retry one durable receipt without renewing or moving twice', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const body = f.checkpoint(grant);
  const first = await f.service(body, NOW + 1000);
  const presence = f.presence(),
    writer = f.grantRow(),
    receipts = f.receipts();
  // A new request/signature simulates a fresh coordinator retry after losing
  // the first HTTP response; the only remembered fact is its immutable body.
  const retried = await f.service({ ...body }, NOW + 2000);
  assert.deepEqual(retried.checkpoint, first.checkpoint);
  assert.equal(retried.checkpoint.sequence, f.base(grant) + 1);
  assert.equal(retried.checkpoint.inputSequence, body.inputSequence);
  assert.equal(retried.checkpoint.committedAt, NOW + 1000);
  assert.deepEqual(f.presence(), presence);
  assert.deepEqual(f.grantRow(), writer);
  assert.deepEqual(f.receipts(), receipts);
  assert.equal(receipts.length, 1);
  assert.equal(
    f.db.sqlite.prepare('SELECT credits FROM players').get().credits,
    4321,
  );
});

test('a receipt identity cannot be reused for changed position, sequence or action intent', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const body = f.checkpoint(grant);
  await f.service(body, NOW + 1000);
  const before = {
    presence: f.presence(),
    grant: f.grantRow(),
    receipts: f.receipts(),
  };
  for (const changed of [
    { x: 3 },
    { z: 18 },
    { inputSequence: 13 },
    { baseSequence: f.base(grant) + 1 },
    { intent: 'd'.repeat(64) },
  ]) {
    await assert.rejects(
      f.service({ ...body, ...changed }, NOW + 2000),
      status(409),
    );
    assert.deepEqual(
      { presence: f.presence(), grant: f.grantRow(), receipts: f.receipts() },
      before,
    );
  }
});

test('simultaneous identical retries commit once; distinct checkpoints cannot share a base sequence', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const body = f.checkpoint(grant);
  const duplicates = await Promise.all([
    f.service(body, NOW + 1000),
    f.service({ ...body }, NOW + 1000),
  ]);
  assert.deepEqual(duplicates[0].checkpoint, duplicates[1].checkpoint);
  assert.equal(f.presence().sequence, f.base(grant) + 1);
  assert.equal(f.receipts().length, 1);
  const rivals = [
    f.checkpoint(grant, {
      baseSequence: f.base(grant) + 1,
      inputSequence: 20,
      x: 3,
    }),
    f.checkpoint(grant, {
      baseSequence: f.base(grant) + 1,
      inputSequence: 21,
      x: 4,
    }),
  ];
  const settled = await Promise.allSettled(
    rivals.map((b) => f.service(b, NOW + 2000)),
  );
  assert.equal(settled.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(settled.find((r) => r.status === 'rejected').reason.status, 409);
  const winner = settled.find((r) => r.status === 'fulfilled').value.checkpoint;
  assert.equal(f.presence().sequence, f.base(grant) + 2);
  assert.equal(f.presence().x, winner.x);
  assert.equal(f.receipts().length, 2);
});

test('receipt persistence failure rolls back the presence update and remains retryable', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const body = f.checkpoint(grant),
    before = f.presence(),
    writer = f.grantRow();
  f.db.sqlite.exec(
    "CREATE TRIGGER checkpoint_failure BEFORE INSERT ON room_checkpoints BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;",
  );
  await assert.rejects(f.service(body, NOW + 1000), /injected receipt failure/);
  assert.deepEqual(f.presence(), before);
  assert.deepEqual(f.grantRow(), writer);
  assert.equal(f.receipts().length, 0);
  f.db.sqlite.exec('DROP TRIGGER checkpoint_failure');
  const saved = await f.service(body, NOW + 2000);
  assert.equal(saved.checkpoint.sequence, f.base(grant) + 1);
  assert.equal(f.receipts().length, 1);
});

test('HTTP travel winning the checkpoint race cannot be overwritten by a stale checkpoint', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const raced = beforeCheckpointBatch(f, () => f.travel(3, 17));
  await assert.rejects(
    f.service(f.checkpoint(grant), NOW + 1000, raced),
    status(409),
  );
  assert.equal(f.presence().x, 3);
  assert.equal(f.presence().sequence, f.base(grant) + 1);
  assert.equal(f.receipts().length, 0);
  const fresh = await f.service(
    { operation: 'authority-refresh', grant },
    NOW + 2000,
  );
  assert.equal(fresh.membership.x, 3);
  assert.equal(fresh.membership.sequence, f.base(grant) + 1);
  const next = await f.service(
    f.checkpoint(grant, { baseSequence: fresh.membership.sequence, x: 4 }),
    NOW + 2500,
  );
  assert.equal(next.checkpoint.sequence, f.base(grant) + 2);
  assert.equal(f.presence().x, 4);
});

test('HTTP travel following a checkpoint survives historical receipt replay', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const body = f.checkpoint(grant);
  const committed = await f.service(body, NOW + 1000);
  await f.travel(3, 17, NOW + 1500);
  const afterTravel = f.presence();
  const retried = await f.service(body, NOW + 2000);
  assert.deepEqual(retried.checkpoint, committed.checkpoint);
  assert.equal(retried.checkpoint.x, 2);
  assert.equal(retried.authority.membership.x, 3);
  assert.equal(retried.authority.membership.sequence, f.base(grant) + 2);
  assert.deepEqual(f.presence(), afterTravel);
  assert.equal(f.receipts().length, 1);
});

test('grant replacement at checkpoint commit fences the old writer and its later release', async (t) => {
  const f = await fixture(t),
    old = await f.connect();
  let replacement;
  const raced = beforeCheckpointBatch(f, async () => {
    replacement = await f.connect(NOW + 1000);
  });
  const before = f.presence();
  await assert.rejects(
    f.service(f.checkpoint(old.grant), NOW + 1000, raced),
    status(409),
  );
  assert.deepEqual(f.presence(), { ...before, sequence: before.sequence + 1 });
  assert.equal(f.receipts().length, 0);
  const activeHash = await roomTokenHash(replacement.grant);
  assert.equal(f.grantRow().grant_hash, activeHash);
  assert.deepEqual(
    await f.service(
      { operation: 'authority-release', grant: old.grant },
      NOW + 2000,
    ),
    { released: true },
  );
  assert.equal(f.grantRow().grant_hash, activeHash);
  const current = await f.service(f.checkpoint(replacement.grant), NOW + 2000);
  assert.equal(current.checkpoint.sequence, f.base(replacement.grant) + 1);
  await assert.rejects(
    f.service(
      f.checkpoint(old.grant, { baseSequence: current.checkpoint.sequence }),
      NOW + 2000,
    ),
    status(409),
  );
});

test('HTTP movement that read before grant acquisition loses the commit-time writer fence', async (t) => {
  const f = await fixture(t),
    before = f.presence();
  let acquired,
    fired = false;
  const raced = {
    ...f.db,
    prepare(sql) {
      const original = f.db.prepare(sql);
      if (!sql.startsWith('UPDATE crew_presence SET x=')) return original;
      return {
        bind(...args) {
          const bound = original.bind(...args);
          return {
            async first() {
              if (!fired) {
                fired = true;
                acquired = await f.connect(NOW + 1000);
              }
              return bound.first();
            },
          };
        },
      };
    },
  };
  await assert.rejects(
    syncNeighborhood(
      raced,
      f.wallet,
      f.controller,
      1,
      { x: 1, z: 17 },
      NOW + 1000,
    ),
    status(409),
  );
  assert.ok(acquired?.grant);
  assert.deepEqual(f.presence(), {
    ...before,
    sequence: acquired.membership.sequence,
  });
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 1000)), false);
});

test('ten-second writer expiry resumes HTTP movement and cannot be renewed or checkpointed', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  assert.equal(f.grantRow().writer_until, NOW + 10_000);
  await assert.rejects(
    syncNeighborhood(
      f.db,
      f.wallet,
      f.controller,
      f.base(grant) + 1,
      { x: 1, z: 17 },
      NOW + 9999,
    ),
    status(409),
  );
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }, NOW + 10_000),
    status(409),
  );
  await assert.rejects(
    f.service(f.checkpoint(grant), NOW + 10_000),
    status(409),
  );
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 10_000)), true);
  const moved = await syncNeighborhood(
    f.db,
    f.wallet,
    f.controller,
    f.base(grant) + 1,
    { x: 1, z: 17 },
    NOW + 10_000,
  );
  assert.equal(moved.corrected, false);
  assert.equal(moved.membership.x, 1);
  const current = f.presence();
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }, NOW + 11_000),
    status(409),
  );
  assert.deepEqual(f.presence(), current);
  assert.equal(f.grantRow().writer_until, NOW + 10_000);
});

test('a delayed refresh cannot revive its expired writer after HTTP reclaims movement', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  let moved,
    fired = false;
  const raced = {
    ...f.db,
    async batch(statements) {
      if (
        !fired &&
        statements.some((s) =>
          s.sql.startsWith('UPDATE crew_presence AS c SET lease_until='),
        )
      ) {
        fired = true;
        // The signed refresh passed its reads at +9s, but D1 executes the
        // queued transaction after HTTP legitimately reclaimed the writer.
        f.setDbTime(NOW + 11_000);
        moved = await syncNeighborhood(
          f.db,
          f.wallet,
          f.controller,
          f.base(grant) + 1,
          { x: 1, z: 17 },
          NOW + 11_000,
        );
      }
      return f.db.batch(statements);
    },
  };
  await assert.rejects(
    f.service({ operation: 'authority-refresh', grant }, NOW + 9000, raced),
    status(409),
  );
  assert.equal(fired, true);
  assert.equal(moved.corrected, false);
  assert.equal(f.presence().x, 1);
  assert.equal(f.presence().sequence, moved.membership.sequence);
  assert.equal(f.grantRow().writer_until, NOW + 10_000);
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 9000)), true);
});

test('checkpoint commit uses database time even when no competing movement changes its base', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const before = f.presence(),
    writer = f.grantRow();
  const raced = beforeCheckpointBatch(f, async () => {
    f.setDbTime(NOW + 10_000);
  });
  await assert.rejects(
    f.service(f.checkpoint(grant), NOW + 9000, raced),
    status(409),
  );
  assert.deepEqual(f.presence(), before);
  assert.deepEqual(f.grantRow(), writer);
  assert.equal(f.receipts().length, 0);
});

test('admission fences an earlier HTTP read even when the new grant releases before HTTP commits', async (t) => {
  const f = await fixture(t),
    before = f.presence();
  let admitted,
    fired = false;
  const raced = {
    ...f.db,
    prepare(sql) {
      const original = f.db.prepare(sql);
      if (!sql.startsWith('UPDATE crew_presence SET x=')) return original;
      return {
        bind(...args) {
          const bound = original.bind(...args);
          return {
            async first() {
              if (!fired) {
                fired = true;
                admitted = await f.connect(NOW + 1000);
                await f.service(
                  { operation: 'authority-release', grant: admitted.grant },
                  NOW + 1500,
                );
              }
              return bound.first();
            },
          };
        },
      };
    },
  };
  await assert.rejects(
    syncNeighborhood(
      raced,
      f.wallet,
      f.controller,
      before.sequence + 1,
      { x: 1, z: 17 },
      NOW + 1000,
    ),
    status(409),
  );
  assert.equal(fired, true);
  assert.equal(admitted.membership.sequence, before.sequence + 1);
  assert.deepEqual(f.presence(), {
    ...before,
    sequence: admitted.membership.sequence,
  });
  assert.equal(
    f.db.sqlite.prepare('SELECT count(*) n FROM room_grants').get().n,
    0,
  );
  const resumed = await syncNeighborhood(
    f.db,
    f.wallet,
    f.controller,
    admitted.membership.sequence + 1,
    { x: 1, z: 17 },
    NOW + 2000,
  );
  assert.equal(resumed.corrected, false);
  assert.equal(resumed.membership.sequence, admitted.membership.sequence + 1);
});

test('release is idempotent, preserves the committed position and immediately permits HTTP movement', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const body = f.checkpoint(grant);
  await f.service(body, NOW + 1000);
  const before = f.presence();
  for (let i = 0; i < 2; i++)
    assert.deepEqual(
      await f.service({ operation: 'authority-release', grant }, NOW + 1500),
      { released: true },
    );
  assert.deepEqual(f.presence(), before);
  assert.equal(
    f.db.sqlite.prepare('SELECT count(*) n FROM room_grants').get().n,
    0,
  );
  assert.equal(f.receipts().length, 1);
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 1500)), true);
  await assert.rejects(f.service(body, NOW + 1500), status(409));
  const resumed = await syncNeighborhood(
    f.db,
    f.wallet,
    f.controller,
    before.sequence + 1,
    { x: 3, z: 17 },
    NOW + 2000,
  );
  assert.equal(resumed.corrected, false);
  assert.equal(resumed.membership.x, 3);
});

test('action intent ignores only the proof field and binds action, request and account payloads', async () => {
  const body = {
    expectedWallet: '0x' + 'ab'.repeat(20),
    clientId: crypto.randomUUID(),
    generation: 42,
    action: { type: 'gather', id: 'salvage', requestId: crypto.randomUUID() },
  };
  const intent = await roomActionIntent('facility', body);
  assert.match(intent, /^[a-f0-9]{64}$/);
  assert.equal(
    await roomActionIntent('facility', {
      action: {
        requestId: body.action.requestId,
        id: 'salvage',
        type: 'gather',
      },
      generation: 42,
      clientId: body.clientId,
      expectedWallet: body.expectedWallet,
      roomCheckpoint: crypto.randomUUID(),
    }),
    intent,
  );
  for (const changed of [
    { ...body, expectedWallet: 'other-account' },
    { ...body, generation: 43 },
    { ...body, action: { ...body.action, requestId: crypto.randomUUID() } },
    { ...body, action: { ...body.action, id: 'workbench' } },
  ])
    assert.notEqual(await roomActionIntent('facility', changed), intent);
  assert.notEqual(await roomActionIntent('crew-work', body), intent);
});

test('frozen action proofs permit only the matching live intent and do not reopen through receipt replay', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const intent = await roomActionIntent('facility', {
    expectedWallet: f.wallet,
    ...f.controller,
    action: { type: 'gather', id: 'salvage', requestId: crypto.randomUUID() },
  });
  const body = f.checkpoint(grant, { intent });
  const saved = await f.service(body, NOW + 1000);
  const proof = { id: body.id, intent };
  assert.equal(saved.checkpoint.frozenUntil, NOW + 4000);
  assert.equal(f.allowed(roomWorkGuard('c', NOW + 2000)), false);
  assert.equal(f.allowed(roomWorkGuard('c', NOW + 2000, proof)), true);
  assert.equal(
    f.allowed(
      roomWorkGuard('c', NOW + 2000, { ...proof, id: crypto.randomUUID() }),
    ),
    false,
  );
  assert.equal(
    f.allowed(
      roomWorkGuard('c', NOW + 2000, { ...proof, intent: 'e'.repeat(64) }),
    ),
    false,
  );
  assert.equal(
    f.allowed(roomWorkGuard('c', NOW + 2000, { ...proof, intent: 'invalid' })),
    false,
  );
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 2000)), false);
  await assert.rejects(
    f.service(
      f.checkpoint(grant, { baseSequence: f.base(grant) + 1, x: 3 }),
      NOW + 2000,
    ),
    status(409),
  );
  const retried = await f.service(body, NOW + 2500);
  assert.deepEqual(retried.checkpoint, saved.checkpoint);
  assert.equal(f.grantRow().frozen_until, NOW + 4000);
  assert.equal(f.allowed(roomWorkGuard('c', NOW + 4000, proof)), false);
  // A proof checked by SQL after its freeze expires cannot rely on the
  // request's earlier timestamp to authorize economic work.
  f.setDbTime(NOW + 4000);
  assert.equal(f.allowed(roomWorkGuard('c', NOW + 2000, proof)), false);
  // Expiry of the three-second action barrier does not expire the writer.
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 4000)), false);
  const next = await f.service(
    f.checkpoint(grant, { baseSequence: f.base(grant) + 1, x: 3 }),
    NOW + 4000,
  );
  assert.equal(next.checkpoint.sequence, f.base(grant) + 2);
  assert.equal(f.allowed(roomWorkGuard('c', NOW + 4000, proof)), false);
});

test('action completion clears only its own barrier and a delayed completion cannot clear a new one', async (t) => {
  const f = await fixture(t),
    { grant } = await f.connect();
  const first = f.checkpoint(grant, { intent: 'd'.repeat(64) });
  await f.service(first, NOW + 1000);
  const wrong = await f.service(
    { operation: 'action-complete', grant, id: crypto.randomUUID() },
    NOW + 1500,
  );
  assert.equal(wrong.frozenCheckpoint, first.id);
  const completed = await f.service(
    { operation: 'action-complete', grant, id: first.id },
    NOW + 2000,
  );
  assert.equal(completed.frozenCheckpoint, null);
  assert.equal(completed.frozenUntil, 0);
  assert.equal(
    f.allowed(
      roomWorkGuard('c', NOW + 2000, { id: first.id, intent: first.intent }),
    ),
    false,
  );
  assert.equal(f.allowed(httpMovementGuard('c', NOW + 2000)), false);
  const second = f.checkpoint(grant, {
    baseSequence: f.base(grant) + 1,
    inputSequence: 13,
    x: 3,
    intent: 'e'.repeat(64),
  });
  await f.service(second, NOW + 2200);
  const stale = await f.service(
    { operation: 'action-complete', grant, id: first.id },
    NOW + 2500,
  );
  assert.equal(stale.frozenCheckpoint, second.id);
  assert.equal(
    f.allowed(
      roomWorkGuard('c', NOW + 2500, { id: second.id, intent: second.intent }),
    ),
    true,
  );
});
