import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import { careerFor } from '../lib/contracts.ts';
import { canTrade } from '../lib/market.ts';
import { listingsPage, escrowListing } from '../lib/market-server.ts';
import { playerName } from '../lib/social.ts';
import {
  runtimeControls,
  pausedAction,
  retryDelay,
} from '../lib/operations.ts';
import {
  rememberNeighbors,
  socialSnapshot,
  setSocialPreference,
  reportMessage,
} from '../lib/social-server.ts';
import {
  joinNeighborhood,
  changeScene,
  visitCenter,
  syncNeighborhood,
  ensurePublicId,
} from '../lib/neighborhoods-server.ts';
async function fixture() {
  const db = database(),
    now = Date.now(),
    people = [];
  for (let i = 0; i < 3; i++) {
    const wallet = '0x' + String(i + 1).padStart(40, '0'),
      clientId = crypto.randomUUID();
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
      )
      .run(wallet, 'Tech ' + i, now, JSON.stringify(newFacility(now)));
    const membership = await joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      {},
      now,
    );
    people.push({
      wallet,
      id: await ensurePublicId(db, wallet),
      controller: { clientId, generation: membership.generation },
      membership,
    });
    await rememberNeighbors(db, wallet, membership.neighborhoodId, now);
  }
  return { db, now, people };
}
test('operational pauses preserve recovery actions and retries back off within a bound', () => {
  const controls = runtimeControls({
    NOOBIUS_TRADE_PAUSED: 'true',
    NOOBIUS_PROJECTS_PAUSED: 'true',
    NOOBIUS_MAX_PLAYERS: '12',
  });
  assert.equal(controls.maxPlayers, 12);
  for (const action of ['listing-buy', 'listing-create', 'project-start'])
    assert.ok(pausedAction(action, controls));
  for (const action of [
    'listing-cancel',
    'project-claim',
    'project-contribute',
    'facility',
  ])
    assert.equal(pausedAction(action, controls), null);
  assert.equal(runtimeControls({ NOOBIUS_MAX_PLAYERS: '-1' }).maxPlayers, 50);
  assert.ok(retryDelay(1, 0) < retryDelay(3, 0));
  assert.ok(retryDelay(100, 1) <= 34500);
});
test('the global player cap is atomic across neighborhoods and does not reject an existing player reconnect', async () => {
  const {
    db,
    now,
    people: [a, b, c],
  } = await fixture();
  db.sqlite
    .prepare('DELETE FROM crew_presence WHERE wallet IN (?,?)')
    .run(b.wallet, c.wallet);
  const joined = await Promise.allSettled(
    [b, c].map((person) =>
      joinNeighborhood(
        db,
        person.wallet,
        'commons',
        0,
        person.controller.clientId,
        { maxActive: 2 },
        now,
      ),
    ),
  );
  assert.equal(joined.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    db.sqlite
      .prepare('SELECT COUNT(*) n FROM crew_presence WHERE lease_until>?')
      .get(now).n,
    2,
  );
  const resumed = await joinNeighborhood(
    db,
    a.wallet,
    'commons',
    0,
    a.controller.clientId,
    { maxActive: 2, admissionPaused: true },
    now,
  );
  assert.equal(resumed.neighborhoodId, a.membership.neighborhoodId);
});
test('direct-offer escrow observes a block or departure that happens immediately before commit', async () => {
  for (const change of ['block', 'departure']) {
    const {
      db,
      people: [a, b],
    } = await fixture();
    const f = newFacility();
    f.inventory.scrap = 3;
    db.sqlite
      .prepare(
        'UPDATE players SET facility_state=?,facility_version=? WHERE wallet=?',
      )
      .run(JSON.stringify(f), f.version, a.wallet);
    const batch = db.batch.bind(db);
    db.batch = async (statements) => {
      if (change === 'block')
        await setSocialPreference(db, b.wallet, a.id, 'block', true);
      else
        db.sqlite
          .prepare('DELETE FROM crew_presence WHERE wallet=?')
          .run(b.wallet);
      return batch(statements);
    };
    await assert.rejects(
      escrowListing(
        db,
        {
          id: crypto.randomUUID(),
          wallet: a.wallet,
          recipient: b.wallet,
          item: 'scrap',
          quantity: 1,
          price: 5,
        },
        f,
      ),
      /availability changed/,
    );
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) n FROM market_listings').get().n,
      0,
    );
    assert.deepEqual(
      JSON.parse(
        db.sqlite
          .prepare('SELECT facility_state FROM players WHERE wallet=?')
          .get(a.wallet).facility_state,
      ),
      f,
    );
  }
});
test('saved player controls survive renames and block both directions of private visits', async () => {
  const {
    db,
    now,
    people: [a, b],
  } = await fixture();
  assert.ok(
    (await socialSnapshot(db, a.wallet, now)).recent.some((p) => p.id === b.id),
  );
  await setSocialPreference(db, a.wallet, b.id, 'mute', true);
  db.sqlite
    .prepare('UPDATE players SET name=? WHERE wallet=?')
    .run('Renamed', b.wallet);
  assert.equal(
    (await socialSnapshot(db, a.wallet, now)).preferences[0].id,
    b.id,
  );
  assert.equal(
    (await socialSnapshot(db, a.wallet, now)).preferences[0].muted,
    true,
  );
  const visited = await changeScene(
    db,
    b.wallet,
    b.controller,
    'home-' + a.id,
    now,
  );
  await setSocialPreference(db, a.wallet, b.id, 'block', true);
  await assert.rejects(visitCenter(db, b.wallet, a.id, now));
  const returned = await syncNeighborhood(
    db,
    b.wallet,
    { ...b.controller, generation: visited.generation },
    1,
    { x: 0, z: 17 },
    now,
  );
  assert.equal(returned.membership.scene, 'commons');
  await assert.rejects(
    changeScene(
      db,
      b.wallet,
      { ...b.controller, generation: returned.membership.generation },
      'home-' + a.id,
      now,
    ),
  );
  await assert.rejects(
    changeScene(db, a.wallet, a.controller, 'home-' + b.id, now),
  );
  await setSocialPreference(db, a.wallet, b.id, 'block', false);
  assert.equal(
    (await socialSnapshot(db, a.wallet, now)).preferences[0].muted,
    true,
  );
});
test('reports are durable, once per reporter/message, and name filtering rejects staff impersonation', async () => {
  const {
      db,
      now,
      people: [a, b],
    } = await fixture(),
    id = crypto.randomUUID();
  db.sqlite
    .prepare(
      'INSERT INTO crew_messages(id,wallet,message,created_at,neighborhood_id) VALUES (?,?,?,?,?)',
    )
    .run(id, b.wallet, 'A reported message', now, a.membership.neighborhoodId);
  await reportMessage(db, a.wallet, id, 'Spam');
  await reportMessage(db, a.wallet, id, 'Spam');
  assert.equal(
    db.sqlite.prepare('SELECT count(*) n FROM player_reports').get().n,
    1,
  );
  assert.equal(
    db.sqlite.prepare('SELECT message FROM player_reports').get().message,
    'A reported message',
  );
  await assert.rejects(reportMessage(db, a.wallet, 'missing', 'Spam'));
  assert.equal(playerName('  Night  Tech  '), 'Night Tech');
  assert.equal(playerName('ＮＯＯＢＩＵＳ_ＡＤＭＩＮ'), null);
  assert.equal(playerName('<script>'), null);
});
test('the market paginates tied timestamps without losing listings and keeps direct offers private', async () => {
  const {
      db,
      now,
      people: [a, b, c],
    } = await fixture(),
    f = newFacility(now);
  for (let i = 0; i < 55; i++)
    db.sqlite
      .prepare(
        "INSERT INTO market_listings(id,wallet,item,quantity,price,status,created_at) VALUES (?,?,?,1,5,'open',?)",
      )
      .run(
        'listing-' + String(i).padStart(4, '0'),
        a.wallet,
        i % 2 ? 'board' : 'copper',
        now,
      );
  db.sqlite
    .prepare(
      "INSERT INTO market_listings(id,wallet,item,quantity,price,status,created_at,recipient_wallet) VALUES ('private-offer',?,'board',1,5,'open',?,?)",
    )
    .run(a.wallet, now + 1, b.wallet);
  const ids = [],
    query = new URLSearchParams();
  do {
    const page = await listingsPage(db, c.wallet, f, query, now);
    ids.push(...page.listings.map((l) => l.id));
    if (!page.nextCursor) break;
    query.set('cursor', page.nextCursor);
  } while (true);
  assert.equal(ids.length, 55);
  assert.equal(new Set(ids).size, 55);
  assert.equal(
    (
      await listingsPage(
        db,
        b.wallet,
        f,
        new URLSearchParams('scope=direct'),
        now,
      )
    ).listings[0].id,
    'private-offer',
  );
  assert.ok(
    !(
      await listingsPage(db, null, null, new URLSearchParams(), now)
    ).listings.some((l) => l.id === 'private-offer'),
  );
  assert.ok(
    (
      await listingsPage(db, c.wallet, f, new URLSearchParams('q=board'), now)
    ).listings.every((l) => l.item === 'board'),
  );
  await setSocialPreference(db, c.wallet, a.id, 'block', true);
  assert.equal(
    (await listingsPage(db, c.wallet, f, new URLSearchParams(), now)).listings
      .length,
    0,
  );
  assert.ok(
    (
      await listingsPage(
        db,
        a.wallet,
        f,
        new URLSearchParams('scope=mine'),
        now,
      )
    ).listings.length > 0,
  );
});
test('trading requires earned work while old upgraded centers keep their access', () => {
  const f = newFacility(0);
  f.compute = 1000000;
  assert.equal(canTrade(f), false);
  f.builds = { 'rack-a': 1 };
  assert.equal(canTrade(f), false);
  f.builds['rack-a'] = 2;
  assert.equal(canTrade(f), true);
  f.builds = {};
  f.career = careerFor(f);
  f.career.completed.service = 1;
  assert.equal(canTrade(f), true);
});
