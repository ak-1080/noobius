import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicHealth } from '../scripts/check-public-health.mjs';
const healthy = async (url) =>
  url === 'https://play.noobius.io/'
    ? new Response(
        '<link rel="stylesheet" href="/_next/static/css/index.abc123.css"/>' +
          '<link rel="modulepreload" href="/_next/static/chunks/Game-abc123.js"/>' +
          '<title>Noobius — The Night Shift</title>',
      )
    : url.endsWith('/Game-abc123.js')
      ? new Response(null, {
          headers: { 'content-type': 'text/javascript' },
        })
      : url.endsWith('/index.abc123.css')
        ? new Response(null, { headers: { 'content-type': 'text/css' } })
        : url === 'https://noobius.io/'
          ? new Response('Coming soon')
          : url.endsWith('/api/health')
            ? Response.json({ status: 'ok', service: 'noobius-game' })
            : url.endsWith('compute-market')
              ? Response.json({
                  available: false,
                  viewer: null,
                  pending: [],
                  recent: [],
                })
              : Response.json({ error: 'Unknown room.' }, { status: 404 });
void test('public health tolerates intentional room 404 and disabled trading, using no credentials', async () => {
  const r = await checkPublicHealth(async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    assert.equal(options.headers.Authorization, undefined);
    return healthy(url);
  });
  assert.equal(r.ok, true);
  assert.equal(r.checks.length, 5);
});
void test('public health catches missing game assets even when the page title loads', async () => {
  for (const badAsset of [
    'https://play.noobius.io/_next/static/chunks/Game-abc123.js',
    'https://play.noobius.io/_next/static/css/index.abc123.css',
  ]) {
    const r = await checkPublicHealth((url) =>
      url === badAsset
        ? new Response(null, {
            status: 404,
            headers: { 'content-type': 'text/html' },
          })
        : healthy(url),
    );
    assert.equal(r.ok, false);
    assert.equal(
      r.checks.find((check) => check.name === 'game-entry').ok,
      false,
    );
  }
  const fallback = await checkPublicHealth((url) =>
    url.endsWith('/Game-abc123.js')
      ? new Response('<title>Noobius</title>', {
          headers: { 'content-type': 'text/html' },
        })
      : healthy(url),
  );
  assert.equal(
    fallback.checks.find((check) => check.name === 'game-entry').ok,
    false,
  );
});
void test('health rejects failed database, exposed private receipts and missing coming-soon page', async () => {
  for (const [url, response] of [
    [
      'https://play.noobius.io/api/health',
      Response.json({ status: 'error', service: 'noobius-game' }),
    ],
    [
      'https://play.noobius.io/api/noobius/compute-market',
      Response.json({
        available: true,
        viewer: null,
        pending: [{ id: 'private' }],
        recent: [],
      }),
    ],
    ['https://noobius.io/', new Response('Not found', { status: 404 })],
  ])
    assert.equal(
      (await checkPublicHealth((u) => (u === url ? response : healthy(u)))).ok,
      false,
    );
});
void test('transport failures are bounded and do not expose raw exception details', async () => {
  const r = await checkPublicHealth(async () => {
    throw Error('private-provider-secret');
  });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r).includes('private-provider-secret'), false);
});
