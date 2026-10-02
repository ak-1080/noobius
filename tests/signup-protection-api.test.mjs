import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { base58 } from '@scure/base';
import { Client } from './api-client.mjs';
if (
  process.env.NOOBIUS_TEST_ORIGIN !== 'http://127.0.0.1:3003' ||
  !process.env.NOOBIUS_RELEASE_QA_ROOT
)
  throw Error(
    'Signup protection fixtures require the isolated release runner.',
  );
const sql = (command) =>
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
        command,
        '--json',
      ],
      { encoding: 'utf8' },
    ),
  )[0].results;
async function actor() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = base58.encode(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  const c = new Client({ address });
  const sign = async (message) =>
    '0x' +
    Buffer.from(
      await crypto.subtle.sign(
        'Ed25519',
        keys.privateKey,
        new TextEncoder().encode(message),
      ),
    ).toString('hex');
  return { c, sign, wallet: 'solana:' + address };
}
test('new Solana signup cannot create a save or earning pool without server-verified proof', async () => {
  const { c, sign, wallet } = await actor();
  const nonce = await c.request('nonce', {
    address: c.account.address,
    ecosystem: 'solana',
  });
  assert.equal(nonce.status, 200);
  assert.equal(nonce.data.signupProtection.siteKey, '0xQaPublicKey123456');
  assert.match(nonce.data.signupProtection.challenge, /^[a-f0-9]{64}$/);
  assert.equal('secretKey' in nonce.data.signupProtection, false);
  const signature = await sign(nonce.data.message);
  for (const extra of [
    {},
    { signupToken: {} },
    { signupToken: 'x'.repeat(2049) },
    { signupValidated: true },
  ]) {
    const r = await c.request('verify', { signature, ...extra });
    assert.equal(r.status, 403, JSON.stringify(r.data));
    assert.equal(
      sql(`SELECT COUNT(*) AS n FROM players WHERE wallet='${wallet}'`)[0].n,
      0,
    );
    assert.equal(
      sql(
        `SELECT COUNT(*) AS n FROM earning_accounts WHERE wallet='${wallet}'`,
      )[0].n,
      0,
    );
    assert.equal(
      sql(`SELECT COUNT(*) AS n FROM sessions WHERE wallet='${wallet}'`)[0].n,
      0,
    );
  }
});
test('returning wallet sign-in preserves saved progress, enrollment and single-use signature', async () => {
  const { c, sign, wallet } = await actor();
  const now = Date.now(),
    id = crypto.randomUUID().replaceAll('-', '');
  sql(
    `INSERT INTO players(wallet,name,credits,created_at,public_id) VALUES ('${wallet}','Returning QA',321,${now},'${id}'); INSERT INTO earning_accounts(wallet,browser_key,new_account,created_at) VALUES ('${wallet}','existing-pool',0,${now})`,
  );
  const nonce = await c.request('nonce', {
    address: c.account.address,
    ecosystem: 'solana',
  });
  assert.equal(nonce.status, 200);
  assert.equal(nonce.data.signupProtection, undefined);
  const signature = await sign(nonce.data.message);
  const r = await c.request('verify', { signature });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.profile.credits, 321);
  assert.equal(r.data.profile.publicId, id);
  assert.equal(
    sql(`SELECT browser_key FROM earning_accounts WHERE wallet='${wallet}'`)[0]
      .browser_key,
    'existing-pool',
  );
  assert.equal((await c.request('verify', { signature })).status, 401);
});
