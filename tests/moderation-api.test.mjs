import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { privateKeyToAccount } from 'viem/accounts';
import { Client } from './api-client.mjs';

// This key is a public fixture, never a real moderator. Run only against the
// isolated local preview with this fixture account explicitly allowlisted.
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):3002$/.test(origin))
  throw new Error(
    'Moderation fixtures require the isolated loopback preview on port 3002.',
  );
const sql = (command) =>
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      '.openai/wrangler.local.json',
      '--persist-to',
      '.wrangler/qa-moderation',
      '--command',
      command,
    ],
    { stdio: 'pipe' },
  );
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const ok = (result) => {
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
};
async function response(client, action, body, headers = {}) {
  return fetch(origin + '/api/noobius/' + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin,
      Cookie: [...client.cookies].map(([k, v]) => k + '=' + v).join('; '),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('moderation HTTP boundaries protect reports, reject stale accounts and retain committed review evidence', async () => {
  const moderator = new Client(privateKeyToAccount('0x' + '11'.repeat(32))),
    ordinary = new Client(),
    anonymous = new Client();
  const operator = ok(await moderator.login()).profile,
    person = ok(await ordinary.login()).profile;
  const id = crypto.randomUUID(),
    messageId = crypto.randomUUID();
  sql(
    `INSERT INTO crew_messages(id,wallet,message,created_at) VALUES (${quote(messageId)},${quote(person.wallet)},'Moderation API fixture',${Date.now()}); INSERT INTO player_reports(id,wallet,target_wallet,message_id,message,reason,created_at) VALUES (${quote(id)},${quote(operator.wallet)},${quote(person.wallet)},${quote(messageId)},'Moderation API fixture','Spam',${Date.now()});`,
  );
  const review = { id, decision: 'removed', note: 'Fixture message reviewed' };
  for (const [client, status] of [
    [anonymous, 401],
    [ordinary, 403],
  ]) {
    const get = await response(client, 'moderation-reports');
    assert.equal(get.status, status);
    assert.equal(get.headers.get('Cache-Control'), 'no-store');
    assert.ok(!(await get.text()).includes('Moderation API fixture'));
    assert.equal(
      (await client.request('moderation-review', client.body(review))).status,
      status,
    );
  }
  for (const body of [review, { ...review, expectedWallet: person.wallet }])
    assert.equal(
      (await moderator.request('moderation-review', body)).status,
      401,
    );
  const foreign = await response(
    moderator,
    'moderation-review',
    moderator.body(review),
    { Origin: 'https://wrong-origin.example' },
  );
  assert.equal(foreign.status, 403);
  const queueResponse = await response(moderator, 'moderation-reports');
  assert.equal(queueResponse.status, 200);
  assert.equal(queueResponse.headers.get('Cache-Control'), 'no-store');
  const queue = await queueResponse.json();
  assert.equal(queue.operatorId, operator.publicId);
  assert.ok(queue.reports.some((r) => r.id === id));
  assert.ok(!JSON.stringify(queue).includes(person.wallet));
  const saved = await response(
    moderator,
    'moderation-review',
    moderator.body(review),
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('Cache-Control'), 'no-store');
  assert.equal(
    (await moderator.request('moderation-review', moderator.body(review)))
      .status,
    409,
  );
  const history = ok(
    await moderator.request('moderation-reports?status=removed'),
  );
  const reviewed = history.reports.find((r) => r.id === id);
  assert.equal(reviewed.reviewedBy, operator.publicId);
  assert.equal(reviewed.reviewNote, review.note);
  assert.equal(reviewed.message, 'Moderation API fixture');
  sql(`DELETE FROM sessions WHERE wallet=${quote(operator.wallet)}`);
  assert.equal((await moderator.request('moderation-reports')).status, 401);
  assert.equal(
    (await moderator.request('moderation-review', moderator.body(review)))
      .status,
    401,
  );
});
