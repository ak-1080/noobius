// Staging-only, newly generated unfunded identities. No token signing, SQL,
// private endpoint access, purchases, load tests or existing wallets.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { base58 } from '@scure/base';
import { Client } from '../tests/api-client.mjs';
import { EARNING_POLICY } from '../lib/earning-policy.ts';
import { EARNING_BROWSER_COOKIE } from '../lib/earning-server.ts';

if (
  process.env.NOOBIUS_TEST_ORIGIN !==
  'https://noobius-game-staging.rinkydooonso.workers.dev'
)
  throw Error('This acceptance requires the isolated staging origin');
const clients = [],
  checks = [],
  began = Date.now();
const report = {
  origin: process.env.NOOBIUS_TEST_ORIGIN,
  beganAt: new Date(began).toISOString(),
  checks,
};
const ok = (response) => {
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
};
async function actor(cookies) {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = base58.encode(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  const c = new Client({ address });
  const request = c.request.bind(c);
  c.request = async (...args) => {
    const started = Date.now();
    const response = await request(...args);
    console.log(
      JSON.stringify({
        action: args[0],
        status: response.status,
        durationMs: Date.now() - started,
      }),
    );
    return response;
  };
  c.body = (fields) => ({ expectedWallet: 'solana:' + address, ...fields });
  if (cookies) c.cookies = new Map(cookies);
  c.login = async () => {
    const { message } = ok(
      await c.request('nonce', { address, ecosystem: 'solana' }),
    );
    const signature =
      '0x' +
      Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          keys.privateKey,
          new TextEncoder().encode(message),
        ),
      ).toString('hex');
    return c.request('verify', { signature });
  };
  clients.push(c);
  return c;
}
try {
  const a = await actor();
  ok(await a.login());
  const b = await actor(a.cookies);
  ok(await b.login());
  const c = await actor(a.cookies);
  ok(await c.login());
  for (const member of [a, b, c]) {
    const { earningAllowance } = ok(await member.request('profile')).profile;
    assert.equal(earningAllowance.shared, true);
    assert.equal(earningAllowance.compute, EARNING_POLICY.compute);
  }
  checks.push(
    'Three new Solana centers in one browser share the server allowance pool',
  );
  const fourth = await actor(a.cookies);
  const denied = await fourth.login();
  assert.equal(denied.status, 429, JSON.stringify(denied.data));
  assert.match(denied.data.error, /three new centers/);
  checks.push('A fourth new wallet is refused before creating a new center');
  ok(await a.request('logout', a.body()));
  assert.ok(a.cookies.get(EARNING_BROWSER_COOKIE));
  a.cookies.clear();
  assert.equal(ok(await a.login()).profile.earningAllowance.shared, true);
  checks.push(
    'An existing center can sign back in; clearing cookies keeps its original shared pool',
  );
  fourth.cookies.clear();
  const independent = ok(await fourth.login()).profile;
  assert.equal(independent.earningAllowance.shared, false);
  checks.push(
    'Independent browsers on the same network retain separate allowances (also demonstrates the fresh-browser limitation)',
  );
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  const cleanupFailures = [];
  for (const c of clients) {
    try {
      const response = await c.request('logout', c.body());
      if (response.status !== 200) cleanupFailures.push('logout');
    } catch {
      cleanupFailures.push('logout');
    }
  }
  report.cleanupFailures = cleanupFailures;
  if (cleanupFailures.length) {
    report.ok = false;
    process.exitCode = 1;
  }
  report.elapsedMs = Date.now() - began;
  report.completedAt = new Date().toISOString();
  writeFileSync(
    '/tmp/noobius-staging-earning-abuse.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
