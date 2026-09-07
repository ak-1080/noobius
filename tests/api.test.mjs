import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const solution = (p) => p.targets ?? p.sequence ?? p.mapping;
test('wallet authentication, isolation, persistence, concurrent rewards and purchases', async () => {
  const a = new Client(),
    b = new Client(),
    anonymous = new Client();
  assert.equal((await anonymous.request('start', {})).status, 401);
  const na = await a.request('nonce', {
    address: a.account.address,
    chainId: 1,
  });
  assert.equal(na.status, 200);
  assert.match(na.data.message, /Noobius/);
  const wrong = await b.account.signMessage({ message: na.data.message });
  assert.equal((await a.request('verify', { signature: wrong })).status, 401);
  const altered = await a.account.signMessage({
    message: na.data.message.replace('Noobius', 'A different game'),
  });
  assert.equal((await a.request('verify', { signature: altered })).status, 401);
  const correct = await a.account.signMessage({ message: na.data.message });
  assert.equal(
    (await anonymous.request('verify', { signature: correct })).status,
    401,
  );
  assert.equal((await a.request('verify', { signature: correct })).status, 200);
  assert.equal(
    (await a.request('verify', { signature: correct })).status,
    401,
    'nonce is consumed once',
  );
  assert.equal(
    (
      await a.request(
        'name',
        a.body({ name: 'QA ' + a.account.address.slice(-6) }),
      )
    ).status,
    200,
  );
  const bLogin = await b.login();
  assert.equal(bLogin.data.profile.credits, 0);
  assert.equal(
    (
      await a.request('name', a.body({ name: 'wrong origin' }), {
        Origin: 'https://attacker.invalid',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await a.request('upgrade', {
        expectedWallet: b.account.address.toLowerCase(),
        upgrade: 'scanner',
      })
    ).status,
    401,
    'stale tab wallet rejected',
  );
  const starts = await Promise.all(
    Array.from({ length: 5 }, () => a.request('start', a.body())),
  );
  assert.ok(starts.every((r) => r.status === 200));
  assert.equal(
    new Set(starts.map((r) => r.data.shift.id)).size,
    1,
    'one active shift per wallet',
  );
  let s = starts[0].data.shift;
  assert.equal(
    (await b.request('activate', b.body({ shiftId: s.id, job: 'cooling' })))
      .status,
    404,
  );
  assert.equal(
    (
      await a.request(
        'answer',
        a.body({
          shiftId: s.id,
          job: 'boot',
          requestId: crypto.randomUUID(),
          answer: [0],
          credits: 999999,
        }),
      )
    ).status,
    400,
  );
  for (const id of ['cooling', 'boot', 'network']) {
    const active = await a.request(
      'activate',
      a.body({ shiftId: s.id, job: id }),
    );
    assert.equal(active.status, 200);
    assert.equal(active.data.initialReveal, true);
    s = active.data.shift;
    const again = await a.request(
      'activate',
      a.body({ shiftId: s.id, job: id }),
    );
    assert.ok(!again.data.initialReveal);
    await delay(1100);
    const body = a.body({
      shiftId: s.id,
      job: id,
      requestId: crypto.randomUUID(),
      answer: solution(s.jobs.find((j) => j.id === id).puzzle),
      credits: 999999,
      xp: 999999,
      score: 999999,
      success: true,
    });
    const concurrent = await Promise.all(
      Array.from({ length: 20 }, () => a.request('answer', body)),
    );
    assert.ok(
      concurrent.every((r) => [200, 409].includes(r.status)),
      JSON.stringify(concurrent.map((r) => r.status)),
    );
    const retry = await a.request('answer', body);
    assert.equal(retry.status, 200);
    assert.equal(retry.data.duplicate, true);
    s = retry.data.shift;
  }
  let current = await a.request('profile');
  assert.equal(current.data.profile.credits, 100);
  assert.equal(current.data.profile.xp, 100);
  assert.equal(current.data.profile.shifts, 1);
  assert.equal(current.data.profile.facility.stats.repairs, 3);
  assert.deepEqual(current.data.profile.facility.bank, {
    coolant: 2,
    silicon: 2,
    copper: 2,
  });
  assert.ok(
    current.data.profile.bestScore <= 1500 &&
      current.data.profile.bestScore > 900,
  );
  assert.ok(current.data.shift.completedAt);
  const reloaded = new Client(a.account);
  reloaded.cookies = new Map(a.cookies);
  assert.equal((await reloaded.request('profile')).data.shift.id, s.id);
  const buys = await Promise.all([
    a.request('upgrade', a.body({ upgrade: 'scanner' })),
    a.request('upgrade', a.body({ upgrade: 'scanner' })),
    a.request('upgrade', a.body({ upgrade: 'visor' })),
  ]);
  assert.equal(buys.filter((r) => r.status === 200).length, 1);
  current = await a.request('profile');
  assert.equal(current.data.profile.credits, 0);
  assert.equal(current.data.profile.equipment.scanner, true);
  assert.equal(current.data.profile.equipment.visor, false);
  const next = await a.request('start', a.body());
  assert.notEqual(next.data.shift.id, s.id);
  assert.equal(next.data.shift.jobs[0].puzzle.tolerance, 5);
  const board = await anonymous.request('leaderboard');
  assert.equal(board.status, 200);
  assert.ok(
    board.data.entries.some(
      (p) => p.name === 'QA ' + a.account.address.slice(-6),
    ),
  );
  const bProfile = await b.request('profile');
  assert.equal(bProfile.data.profile.credits, 0);
  assert.equal(bProfile.data.profile.shifts, 0);
  assert.equal((await a.request('logout', a.body())).status, 200);
  assert.equal((await reloaded.request('profile')).data.profile, null);
  assert.equal((await a.request('start', a.body())).status, 401);
});
