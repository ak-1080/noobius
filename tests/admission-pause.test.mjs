import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import { joinNeighborhood, changeScene } from '../lib/neighborhoods-server.ts';
import { runtimeControls, pausedAction } from '../lib/operations.ts';
async function fixture(t) {
  const db = database(),
    now = Date.now(),
    wallet = '0x' + 'b'.repeat(40),
    clientId = crypto.randomUUID(),
    permit = { localTest: true, policy: null };
  t.after(() => db.sqlite.close());
  db.sqlite
    .prepare(
      'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
    )
    .run(wallet, 'Pause test', now, JSON.stringify(newFacility(now)));
  const a = crypto.randomUUID().replaceAll('-', ''),
    b = crypto.randomUUID().replaceAll('-', '');
  for (const id of [a, b])
    db.sqlite
      .prepare('INSERT INTO neighborhoods VALUES (?,?,?,?)')
      .run(id, 'gpu', 0, now);
  const joined = await joinNeighborhood(
    db,
    wallet,
    'gpu',
    0,
    clientId,
    { target: a, permit },
    now,
  );
  return {
    db,
    now,
    wallet,
    clientId,
    permit,
    a,
    b,
    joined,
    read: () =>
      db.sqlite
        .prepare('SELECT * FROM crew_presence WHERE wallet=?')
        .get(wallet),
  };
}
test('GPU pause is strictly configured and does not pause free admission or earned recovery actions', async (t) => {
  for (const value of [true, 'TRUE', '1', false, undefined])
    assert.equal(
      runtimeControls({ NOOBIUS_GPU_ADMISSION_PAUSED: value })
        .gpuAdmissionPaused,
      false,
    );
  const controls = runtimeControls({ NOOBIUS_GPU_ADMISSION_PAUSED: 'true' });
  assert.equal(controls.gpuAdmissionPaused, true);
  assert.equal(controls.admissionPaused, false);
  for (const action of [
    'room-ticket',
    'project-claim',
    'listing-cancel',
    'facility',
    'crew-claim',
    'project-contribute',
  ])
    assert.equal(pausedAction(action, controls), null);
  const f = await fixture(t);
  const returned = await joinNeighborhood(
    f.db,
    f.wallet,
    'commons',
    0,
    f.clientId,
    { gpuAdmissionPaused: true },
    f.now,
  );
  assert.equal(returned.realm, 'commons');
  const saved = f.read();
  await assert.rejects(
    joinNeighborhood(
      f.db,
      f.wallet,
      'gpu',
      0,
      f.clientId,
      { gpuAdmissionPaused: true, permit: f.permit },
      f.now,
    ),
    /paused/,
  );
  assert.deepEqual(f.read(), saved);
});
test('paused live resume preserves the exact interior, movement and slot even below the new cap', async (t) => {
  const f = await fixture(t);
  const ownId = f.db.sqlite
    .prepare('SELECT public_id FROM players WHERE wallet=?')
    .get(f.wallet).public_id;
  await changeScene(
    f.db,
    f.wallet,
    { clientId: f.clientId, generation: f.joined.generation },
    'home-' + ownId,
    f.now,
    f.permit,
  );
  f.db.sqlite
    .prepare('UPDATE crew_presence SET sequence=17,x=2,z=15 WHERE wallet=?')
    .run(f.wallet);
  const old = f.read();
  const resumed = await joinNeighborhood(
    f.db,
    f.wallet,
    'gpu',
    0,
    f.clientId,
    { gpuAdmissionPaused: true, maxActive: 1, permit: f.permit },
    f.now,
  );
  assert.equal(resumed.neighborhoodId, f.a);
  assert.equal(resumed.scene, 'home-' + ownId);
  assert.equal(resumed.sequence, 17);
  assert.equal(resumed.x, 2);
  assert.equal(resumed.slot, old.slot);
  assert.equal(resumed.generation, old.generation);
});
test('paused takeover stays in its reserved room instead of running matchmaking', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) {
    const w = '0x' + String(i + 1).repeat(40);
    f.db.sqlite
      .prepare('INSERT INTO players(wallet,name,created_at) VALUES (?,?,?)')
      .run(w, 'Neighbor', f.now);
    await joinNeighborhood(
      f.db,
      w,
      'gpu',
      0,
      crypto.randomUUID(),
      { target: f.b, permit: f.permit },
      f.now,
    );
  }
  const newClient = crypto.randomUUID();
  await assert.rejects(
    joinNeighborhood(
      f.db,
      f.wallet,
      'gpu',
      0,
      newClient,
      { gpuAdmissionPaused: true, permit: f.permit },
      f.now,
    ),
    /another tab/,
  );
  for (const options of [
    { gpuAdmissionPaused: true },
    { admissionPaused: true },
  ]) {
    const previous = f.read();
    const result = await joinNeighborhood(
      f.db,
      f.wallet,
      'gpu',
      0,
      crypto.randomUUID(),
      { ...options, takeover: true, permit: f.permit, maxActive: 1 },
      f.now,
    );
    assert.equal(result.neighborhoodId, f.a);
    assert.equal(result.slot, previous.slot);
    assert.notEqual(result.generation, previous.generation);
    assert.equal(result.scene, 'commons');
    assert.equal(result.sequence, 0);
  }
  const current = f.read();
  await assert.rejects(
    joinNeighborhood(
      f.db,
      f.wallet,
      'gpu',
      0,
      current.client_id,
      { target: f.b, gpuAdmissionPaused: true, permit: f.permit },
      f.now,
    ),
    /paused/,
  );
  assert.deepEqual(f.read(), current);
});
test('paused resumption fails closed when membership changes during the read/write gap', async (t) => {
  for (const kind of [
    'delete',
    'expire',
    'generation',
    'client',
    'neighborhood',
  ]) {
    const f = await fixture(t),
      prepare = f.db.prepare;
    let expected;
    f.db.prepare = (sql) => {
      if (sql.includes('UPDATE crew_presence SET client_id=')) {
        if (kind === 'delete')
          f.db.sqlite
            .prepare('DELETE FROM crew_presence WHERE wallet=?')
            .run(f.wallet);
        if (kind === 'expire')
          f.db.sqlite
            .prepare('UPDATE crew_presence SET lease_until=? WHERE wallet=?')
            .run(f.now - 100, f.wallet);
        if (kind === 'generation')
          f.db.sqlite
            .prepare(
              'UPDATE crew_presence SET generation=generation+1 WHERE wallet=?',
            )
            .run(f.wallet);
        if (kind === 'client')
          f.db.sqlite
            .prepare('UPDATE crew_presence SET client_id=? WHERE wallet=?')
            .run(crypto.randomUUID(), f.wallet);
        if (kind === 'neighborhood')
          f.db.sqlite
            .prepare(
              'UPDATE crew_presence SET neighborhood_id=? WHERE wallet=?',
            )
            .run(f.b, f.wallet);
        expected = f.read();
      }
      return prepare(sql);
    };
    await assert.rejects(
      joinNeighborhood(
        f.db,
        f.wallet,
        'gpu',
        0,
        f.clientId,
        { gpuAdmissionPaused: true, permit: f.permit },
        f.now - 1000,
      ),
      /connection or access changed/,
    );
    assert.deepEqual(f.read(), expected, kind);
  }
});

test('paused admission rejects missing and expired membership without changing saved ownership', async (t) => {
  for (const kind of ['missing', 'expired'])
    for (const takeover of [false, true]) {
      const f = await fixture(t);
      if (kind === 'missing')
        f.db.sqlite
          .prepare('DELETE FROM crew_presence WHERE wallet=?')
          .run(f.wallet);
      else
        f.db.sqlite
          .prepare('UPDATE crew_presence SET lease_until=? WHERE wallet=?')
          .run(f.now, f.wallet);
      const before = f.read();
      const player = f.db.sqlite
        .prepare('SELECT * FROM players WHERE wallet=?')
        .get(f.wallet);
      const rooms = f.db.sqlite
        .prepare('SELECT * FROM neighborhoods ORDER BY id')
        .all();
      f.db.batch = async () =>
        assert.fail('Paused admission must not allocate a membership');
      await assert.rejects(
        joinNeighborhood(
          f.db,
          f.wallet,
          'gpu',
          0,
          takeover ? crypto.randomUUID() : f.clientId,
          { target: f.a, takeover, gpuAdmissionPaused: true, permit: f.permit },
          f.now,
        ),
        { status: 503 },
      );
      assert.deepEqual(f.read(), before);
      assert.deepEqual(
        f.db.sqlite
          .prepare('SELECT * FROM players WHERE wallet=?')
          .get(f.wallet),
        player,
      );
      assert.deepEqual(
        f.db.sqlite.prepare('SELECT * FROM neighborhoods ORDER BY id').all(),
        rooms,
      );
    }
});

test('paused GPU resume and takeover fence holdings revoked at the write', async (t) => {
  for (const takeover of [false, true]) {
    const f = await fixture(t),
      permit = { localTest: false, policy: 'pause-live-policy' };
    f.db.sqlite
      .prepare(
        "INSERT INTO realm_entitlements(wallet,policy,amount,block,status,checked_at,next_check_at,grace_until) VALUES (?,?,'888','0x1','eligible',?,?,?)",
      )
      .run(f.wallet, permit.policy, f.now, f.now + 60000, f.now + 300000);
    await joinNeighborhood(
      f.db,
      f.wallet,
      'gpu',
      0,
      f.clientId,
      { gpuAdmissionPaused: true, permit },
      f.now,
    );
    const before = f.read(),
      player = f.db.sqlite
        .prepare('SELECT * FROM players WHERE wallet=?')
        .get(f.wallet),
      prepare = f.db.prepare;
    let writes = 0;
    f.db.prepare = (sql) => {
      if (sql.includes('UPDATE crew_presence SET client_id=')) {
        writes++;
        f.db.sqlite
          .prepare(
            "UPDATE realm_entitlements SET status='ineligible',grace_until=0 WHERE wallet=?",
          )
          .run(f.wallet);
      }
      return prepare(sql);
    };
    f.db.batch = async () =>
      assert.fail('A failed paused resume must not allocate a membership');
    await assert.rejects(
      joinNeighborhood(
        f.db,
        f.wallet,
        'gpu',
        0,
        takeover ? crypto.randomUUID() : f.clientId,
        { takeover, gpuAdmissionPaused: true, permit },
        f.now,
      ),
      { status: 409 },
    );
    assert.equal(writes, 1);
    assert.deepEqual(f.read(), before);
    assert.deepEqual(
      f.db.sqlite.prepare('SELECT * FROM players WHERE wallet=?').get(f.wallet),
      player,
    );
    assert.equal(
      f.db.sqlite
        .prepare('SELECT status FROM realm_entitlements WHERE wallet=?')
        .get(f.wallet).status,
      'ineligible',
    );
  }
});
