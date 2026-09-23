// Isolated Cloudflare staging probe. Uses one generated, unfunded Solana key.
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { Client } from '../tests/api-client.mjs';

const origin = 'https://noobius-game-staging.rinkydooonso.workers.dev';
if (process.env.NOOBIUS_TEST_ORIGIN !== origin)
  throw Error('Set NOOBIUS_TEST_ORIGIN to the isolated staging origin.');

const page = await fetch(origin, { signal: AbortSignal.timeout(15000) });
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /<title[^>]*>Noobius/i);
const asset = html.match(
  /href="(\/_next\/static\/chunks\/Game-[A-Za-z0-9_-]+\.js)"/,
)?.[1];
assert.ok(asset, 'Game asset missing from staging page');
const assetResponse = await fetch(origin + asset, {
  method: 'HEAD',
  signal: AbortSignal.timeout(15000),
});
assert.equal(assetResponse.status, 200);
assert.match(assetResponse.headers.get('content-type') ?? '', /javascript/i);

const health = await fetch(origin + '/api/health');
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'ok');

const key = await crypto.subtle.generateKey('Ed25519', true, [
  'sign',
  'verify',
]);
const address = base58.encode(
  new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey)),
);
const client = new Client({ address });
client.body = (body) => ({ expectedWallet: 'solana:' + address, ...body });
const request = async (action, body) => {
  const response = await client.request(action, body);
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
};

const nonce = await request('nonce', { address, ecosystem: 'solana' });
assert.match(nonce.message, /Chain ID: devnet/);
assert.match(nonce.message, /noobius-game-staging\.rinkydooonso\.workers\.dev/);
const signature =
  '0x' +
  Buffer.from(
    await crypto.subtle.sign(
      'Ed25519',
      key.privateKey,
      new TextEncoder().encode(nonce.message),
    ),
  ).toString('hex');
const first = await request('verify', { signature });
await request('name', client.body({ name: 'Devnet Tester' }));
const secondNonce = await request('nonce', { address, ecosystem: 'solana' });
const secondSignature =
  '0x' +
  Buffer.from(
    await crypto.subtle.sign(
      'Ed25519',
      key.privateKey,
      new TextEncoder().encode(secondNonce.message),
    ),
  ).toString('hex');
const again = await request('verify', { signature: secondSignature });
assert.equal(again.profile.id, first.profile.id);
assert.equal(again.profile.name, 'Devnet Tester');

const market = await request('compute-market');
assert.equal(market.available, false);
assert.equal(market.viewer, 'solana:' + address);
assert.equal(market.pending.length, 0);
const listing = await client.request(
  'compute-listing-create',
  client.body({ id: crypto.randomUUID(), compute: 1, tokenAmount: '1' }),
);
assert.equal(listing.status, 503, JSON.stringify(listing.data));
assert.match(listing.data.error, /not available/);

await request('logout', client.body({}));
console.log(
  JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    origin,
    wallet: 'solana:' + address,
    checks: [
      'page-and-asset',
      'database-health',
      'devnet-wallet-login',
      'persistent-profile',
      'paused-market',
    ],
  }),
);
