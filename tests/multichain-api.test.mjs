import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { bytesToHex } from 'viem';
import { Client } from './api-client.mjs';
import { execFileSync } from 'node:child_process';

const origin = new URL(
  process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000',
);
if (
  origin.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(origin.hostname)
)
  throw new Error('Authentication fixtures must use an isolated local server.');
const localSql = (command) =>
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
      '.wrangler/state',
      '--command',
      command,
    ],
    { stdio: 'pipe' },
  );

const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
async function solanaClient() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = base58.encode(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  const client = new Client({
    address,
    signMessage: async ({ message }) =>
      bytesToHex(
        new Uint8Array(
          await crypto.subtle.sign(
            'Ed25519',
            keys.privateKey,
            new TextEncoder().encode(message),
          ),
        ),
      ),
  });
  client.body = (body) => ({
    expectedWallet: 'solana:' + address,
    ...body,
  });
  client.login = async () => {
    const nonce = ok(
      await client.request('nonce', { address, ecosystem: 'solana' }),
    );
    return client.request('verify', {
      signature: await client.account.signMessage(nonce),
    });
  };
  return client;
}

test('both ecosystems retain independent persistent accounts and public room identifiers', async () => {
  const sol = await solanaClient(),
    evm = new Client();
  const first = ok(await sol.login()).profile;
  assert.equal(first.wallet, sol.body().expectedWallet);
  assert.match(first.publicId, /^[a-f0-9]{32}$/);
  const ethereum = ok(await evm.login()).profile;
  assert.equal(
    ethereum.publicId,
    evm.account.address.toLowerCase().slice(2, 18),
  );
  ok(await sol.request('name', sol.body({ name: 'Solana Tester' })));
  ok(
    await sol.request(
      'facility',
      sol.body({
        action: {
          type: 'outfit',
          id: 'starter-blue',
          requestId: crypto.randomUUID(),
        },
      }),
    ),
  );
  assert.equal(
    (await sol.request('name', evm.body({ name: 'Wrong account' }))).status,
    401,
  );
  const again = ok(await sol.login()).profile;
  assert.equal(again.publicId, first.publicId);
  assert.equal(again.name, 'Solana Tester');
  assert.equal(again.facility.outfit, 'starter-blue');
  const visit = ok(await evm.request('visit?owner=' + first.publicId));
  assert.equal(visit.name, 'Solana Tester');
  const room = 'home-' + first.publicId;
  ok(await sol.request('presence', sol.body({ room, x: 0, z: 0 })));
  assert.ok(
    ok(await evm.request('campus?room=' + room)).people.some(
      (p) => p.id === first.publicId,
    ),
  );
  assert.ok(
    ok(await evm.request('directory')).facilities.some(
      (p) => p.id === first.publicId,
    ),
  );
  assert.equal(
    ok(await evm.request('profile')).profile.wallet,
    evm.body().expectedWallet,
  );
});

test('Solana challenge rejects wrong origins, modified signatures and replay', async () => {
  const sol = await solanaClient();
  assert.equal(
    (
      await sol.request(
        'nonce',
        { address: sol.account.address, ecosystem: 'solana' },
        { Origin: 'https://attacker.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await sol.request('nonce', { address: 'invalid', ecosystem: 'solana' }))
      .status,
    400,
  );
  const nonce = ok(
    await sol.request('nonce', {
      address: sol.account.address,
      ecosystem: 'solana',
    }),
  );
  assert.equal(
    (
      await sol.request('verify', {
        signature: await sol.account.signMessage({
          message: nonce.message + '!',
        }),
      })
    ).status,
    401,
  );
  const signature = await sol.account.signMessage(nonce);
  const concurrent = await Promise.all([
    sol.request('verify', { signature }),
    sol.request('verify', { signature }),
  ]);
  assert.equal(
    concurrent.filter((r) => r.status === 200).length,
    1,
    JSON.stringify(concurrent),
  );
  assert.ok(concurrent.some((r) => r.status === 401));
  assert.equal((await sol.request('verify', { signature })).status, 401);
});

test('expired Solana challenges and sessions cannot authenticate', async () => {
  const sol = await solanaClient();
  const nonce = ok(
    await sol.request('nonce', {
      address: sol.account.address,
      ecosystem: 'solana',
    }),
  );
  localSql(
    "UPDATE challenges SET expires_at=0 WHERE wallet='" +
      sol.body().expectedWallet +
      "'",
  );
  assert.equal(
    (
      await sol.request('verify', {
        signature: await sol.account.signMessage(nonce),
      })
    ).status,
    401,
  );
  ok(await sol.login());
  localSql(
    "UPDATE sessions SET expires_at=0 WHERE wallet='" +
      sol.body().expectedWallet +
      "'",
  );
  assert.equal(ok(await sol.request('profile')).profile, null);
  assert.equal(
    (await sol.request('name', sol.body({ name: 'Expired session' }))).status,
    401,
  );
});
