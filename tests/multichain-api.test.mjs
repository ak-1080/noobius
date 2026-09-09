import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { bytesToHex } from 'viem';
import { Client } from './api-client.mjs';
import { isolatedNeighborhood, attachWorld } from './world-client.mjs';
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

test('both ecosystems retain independent saves and opaque identities in the same neighborhood', async (t) => {
  const sol = await solanaClient(),
    evm = new Client();
  const first = ok(await sol.login()).profile;
  assert.equal(first.wallet, 'solana:' + sol.account.address);
  assert.match(first.id, /^[a-f0-9]{32}$/);
  assert.equal(first.publicId, first.id);
  const ethereum = ok(await evm.login()).profile;
  assert.equal(ethereum.wallet, evm.body().expectedWallet);
  assert.match(ethereum.id, /^[a-f0-9]{32}$/);
  assert.equal(ethereum.publicId, ethereum.id);
  assert.notEqual(first.id, ethereum.id);
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
  assert.equal(again.wallet, first.wallet);
  assert.equal(again.id, first.id);
  assert.equal(again.publicId, first.publicId);
  assert.equal(again.name, 'Solana Tester');
  assert.equal(again.facility.outfit, 'starter-blue');

  const neighborhood = isolatedNeighborhood();
  t.after(async () => {
    for (const client of [sol, evm]) {
      if (client.world?.generation)
        await client.request(
          'neighborhood-leave',
          client.body({ ...client.world }),
        );
    }
  });
  await attachWorld(sol, neighborhood);
  await attachWorld(evm, neighborhood);
  assert.equal(sol.membership.neighborhoodId, neighborhood);
  assert.equal(evm.membership.neighborhoodId, neighborhood);
  assert.equal(sol.membership.scene, 'home-' + first.id);
  assert.equal(evm.membership.scene, 'home-' + ethereum.id);

  // Publish the Solana owner's current position through the same authoritative
  // controller/sequence path used by EVM players, with no wallet-key conversion.
  const ownerSnapshot = ok(
    await sol.request(
      'neighborhood-sync',
      sol.body({
        ...sol.world,
        sequence: sol.membership.sequence + 1,
        position: { x: sol.membership.x, z: sol.membership.z },
      }),
    ),
  );
  sol.membership = ownerSnapshot.membership;
  assert.equal(ownerSnapshot.corrected, false);
  const visiting = ok(
    await evm.request(
      'neighborhood-scene',
      evm.body({ ...evm.world, scene: 'home-' + first.id }),
    ),
  );
  evm.world.generation = visiting.membership.generation;
  evm.membership = visiting.membership;
  assert.equal(visiting.membership.neighborhoodId, neighborhood);
  assert.equal(visiting.membership.scene, 'home-' + first.id);
  assert.deepEqual(
    new Set(visiting.people.map((person) => person.id)),
    new Set([first.id, ethereum.id]),
  );
  assert.equal(JSON.stringify(visiting).includes(first.wallet), false);
  assert.equal(JSON.stringify(visiting).includes(ethereum.wallet), false);

  const visit = ok(await evm.request('visit?owner=' + first.id));
  assert.equal(visit.name, 'Solana Tester');
  assert.equal(visit.facility.visiting, true);
  assert.equal(visit.facility.compute, 0);
  assert.deepEqual(visit.facility.inventory, {});
  assert.deepEqual(visit.facility.bank, {});
  assert.equal(
    (
      await evm.request(
        'facility',
        evm.body({
          ...evm.world,
          action: { type: 'compute-harvest', requestId: crypto.randomUUID() },
        }),
      )
    ).status,
    403,
  );
  assert.ok(
    ok(await evm.request('directory')).facilities.some(
      (p) => p.id === first.id,
    ),
  );
  const restoredEthereum = ok(await evm.request('profile')).profile;
  assert.equal(restoredEthereum.wallet, ethereum.wallet);
  assert.equal(restoredEthereum.id, ethereum.id);
  assert.equal(restoredEthereum.name, ethereum.name);
  const restoredSolana = ok(await sol.request('profile')).profile;
  assert.equal(restoredSolana.wallet, first.wallet);
  assert.equal(restoredSolana.id, first.id);
  assert.equal(restoredSolana.name, 'Solana Tester');
  assert.equal(restoredSolana.facility.outfit, 'starter-blue');
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
