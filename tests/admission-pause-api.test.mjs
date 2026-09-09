import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
import { withQaDb } from './room-qa-db.mjs';
import { newFacility } from '../lib/facility.ts';
import { careerFor } from '../lib/contracts.ts';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
// Requires the isolated loopback server with GPU admission paused and explicit local holder testing.
// Generated accounts only; it cannot run against the ordinary preview or any hosted origin.
test('GPU admission pause preserves free travel, reserved reconnects, earned claims and escrow returns through the API', async () => {
  const client = new Client(),
    other = new Client();
  const profile = ok(await client.login()).profile;
  ok(await other.login());
  const wallet = client.account.address.toLowerCase();
  const controller = { clientId: crypto.randomUUID(), generation: 0 };
  const command = (action, args = {}) =>
    client.request(action, client.body({ ...controller, ...args }));
  const room = crypto.randomUUID().replaceAll('-', ''),
    otherRoom = crypto.randomUUID().replaceAll('-', '');
  const project = crypto.randomUUID(),
    listing = crypto.randomUUID();
  const now = Date.now(),
    facility = newFacility(now);
  facility.career = careerFor(facility);
  facility.career.completed = { service: 2, supply: 2, workload: 2 };
  facility.career.modules = ['fast'];
  facility.career.commissioned = 1;
  withQaDb((db) => {
    db.prepare(
      'UPDATE players SET facility_state=?,facility_version=?,credits=? WHERE wallet=?',
    ).run(JSON.stringify(facility), facility.version, facility.compute, wallet);
    for (const id of [room, otherRoom])
      db.prepare('INSERT INTO neighborhoods VALUES (?,?,?,?)').run(
        id,
        'gpu',
        0,
        now,
      );
  });
  try {
    const free = ok(
      await command('neighborhood-join', { realm: 'commons' }),
    ).membership;
    controller.generation = free.generation;
    const denied = await command('neighborhood-join', {
      realm: 'gpu',
      target: room,
    });
    assert.equal(denied.status, 503);
    assert.match(denied.data.error, /arrivals are paused/);
    assert.equal(
      ok(await command('neighborhood-state')).membership.neighborhoodId,
      free.neighborhoodId,
    );
    ok(
      await other.request(
        'neighborhood-join',
        other.body({ clientId: crypto.randomUUID(), realm: 'commons' }),
      ),
    );
    // Represent an already admitted GPU member before the operator paused arrivals.
    withQaDb((db) =>
      db
        .prepare(
          'UPDATE crew_presence SET neighborhood_id=?,room=?,sequence=17,x=2,z=15,lease_until=? WHERE wallet=?',
        )
        .run(room, 'home-' + profile.id, Date.now() + 45000, wallet),
    );
    const resumed = ok(
      await command('neighborhood-join', { realm: 'gpu' }),
    ).membership;
    assert.equal(resumed.neighborhoodId, room);
    assert.equal(resumed.scene, 'home-' + profile.id);
    assert.equal(resumed.sequence, 17);
    assert.equal(resumed.generation, controller.generation);
    controller.clientId = crypto.randomUUID();
    assert.equal(
      (await command('neighborhood-join', { realm: 'gpu' })).status,
      409,
    );
    const takeover = ok(
      await command('neighborhood-join', { realm: 'gpu', takeover: true }),
    ).membership;
    assert.equal(takeover.neighborhoodId, room);
    assert.equal(takeover.slot, resumed.slot);
    assert.notEqual(takeover.generation, resumed.generation);
    controller.generation = takeover.generation;
    assert.equal(
      (await command('neighborhood-join', { realm: 'gpu', target: otherRoom }))
        .status,
      503,
    );
    withQaDb((db) => {
      db.prepare(
        "INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,created_at,completed_at,work_version) VALUES (?,?,'gpu-launch','completed',1,?,?,?, ?,0)",
      ).run(
        project,
        room,
        JSON.stringify({ service: 1, supply: 0, workload: 0 }),
        JSON.stringify({ service: 1, supply: 0, workload: 0 }),
        now,
        now,
      );
      db.prepare(
        "INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) VALUES (?,?,?,'service',1,?)",
      ).run(crypto.randomUUID(), project, wallet, now);
      db.prepare(
        "INSERT INTO market_listings(id,wallet,item,quantity,price,status,created_at) VALUES (?,?,'copper',3,10,'open',?)",
      ).run(listing, wallet, now);
    });
    ok(await command('project-claim', { projectId: project }));
    assert.equal(
      (await command('project-claim', { projectId: project })).status,
      409,
    );
    ok(await command('listing-cancel', { id: listing }));
    assert.equal(
      (await command('listing-cancel', { id: listing })).status,
      409,
    );
    withQaDb((db) => {
      assert.equal(
        db
          .prepare(
            'SELECT count(*) n FROM cluster_claims WHERE project_id=? AND wallet=?',
          )
          .get(project, wallet).n,
        1,
      );
      assert.equal(
        db.prepare('SELECT status FROM market_listings WHERE id=?').get(listing)
          .status,
        'cancelled',
      );
      assert.equal(
        JSON.parse(
          db
            .prepare('SELECT facility_state FROM players WHERE wallet=?')
            .get(wallet).facility_state,
        ).bank.copper,
        3,
      );
    });
    const returned = ok(
      await command('neighborhood-join', { realm: 'commons' }),
    ).membership;
    assert.equal(returned.realm, 'commons');
    controller.generation = returned.generation;
  } finally {
    await command('neighborhood-leave').catch(() => {});
  }
});
