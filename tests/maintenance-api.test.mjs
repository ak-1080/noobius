import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (origin !== 'http://127.0.0.1:3003' || !process.env.NOOBIUS_RELEASE_QA_ROOT)
  throw Error('Maintenance acceptance requires the isolated runner.');
const rows = (sql) =>
  JSON.parse(
    execFileSync(
      './node_modules/.bin/wrangler',
      [
        'd1',
        'execute',
        'DB',
        '--local',
        '--config',
        '.openai/wrangler.local.json',
        '--persist-to',
        '.wrangler/qa-dispatch',
        '--command',
        sql,
        '--json',
      ],
      { encoding: 'utf8' },
    ),
  )[0].results;
test('maintenance fences ordinary APIs, room checkpoint ingress and health before any database side effects', async () => {
  const counts = () =>
    rows(
      'SELECT (SELECT COUNT(*) FROM players) AS players,(SELECT COUNT(*) FROM challenges) AS challenges,(SELECT COUNT(*) FROM rate_limits) AS rates,(SELECT COUNT(*) FROM earning_browsers) AS browsers',
    );
  const before = counts();
  for (const [url, method] of [
    ['/api/noobius/profile', 'GET'],
    ['/api/noobius/compute-market', 'GET'],
    ['/api/noobius/nonce', 'POST'],
    ['/api/noobius/verify', 'POST'],
    ['/api/noobius/facility', 'POST'],
    ['/api/noobius/compute-pay', 'POST'],
    ['/api/noobius/neighborhood-join', 'POST'],
    ['/api/noobius-room', 'POST'],
  ]) {
    const r = await fetch(origin + url, {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    assert.equal(r.status, 503, url);
    assert.equal(r.headers.get('Retry-After'), '60');
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.equal((await r.json()).code, 'MAINTENANCE');
  }
  const health = await fetch(origin + '/api/health');
  assert.equal(health.status, 503);
  assert.equal((await health.json()).status, 'maintenance');
  assert.deepEqual(
    counts(),
    before,
    'Even auth/read-rate bookkeeping must remain untouched',
  );
});
