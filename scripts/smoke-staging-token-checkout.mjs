// Isolated hosted devnet payment test. It modifies only the two generated test
// identities in staging D1; no production account or real token is involved.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Client } from '../tests/api-client.mjs';
import { createKeyPairSignerFromBytes, getTransactionDecoder, partiallySignTransaction } from '@solana/kit';
import { findAssociatedTokenPda as findLegacyAta } from '@solana-program/token';
import { findAssociatedTokenPda as findToken2022Ata } from '@solana-program/token-2022';
import {
  SOLANA_GENESIS, SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, validSolanaAddress,
} from '../lib/solana-holdings.ts';
import { encodePaymentTransaction } from '../lib/solana-payment.ts';
import { configuredDevnetRpcUrl } from './devnet-rpc-config.mjs';

const origin = 'https://noobius-game-staging.rinkydooonso.workers.dev';
if (process.env.NOOBIUS_TEST_ORIGIN !== origin ||
    process.env.NOOBIUS_STAGING_TOKEN_CHECKOUT !== '1')
  throw Error('Explicit isolated staging checkout test flags are required.');
const proofPath = '.wrangler/noobius-devnet-proof.json';
const keysPath = '.wrangler/noobius-devnet-wallets.json';
if (!existsSync(proofPath) || !existsSync(keysPath))
  throw Error('Finalized devnet proof and generated test accounts are required.');
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
const saved = JSON.parse(readFileSync(keysPath, 'utf8'));
if (proof.network !== 'devnet' || saved.network !== 'devnet' ||
    ![SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(proof.tokenProgram) ||
    proof.apiCheckout?.status !== 'settled')
  throw Error('This trial requires a settled real-devnet test-token proof.');
const mint = proof.mint;
const buyers = {};
for (const role of ['buyer', 'seller']) {
  if (!validSolanaAddress(saved[role]?.address) || !saved[role]?.secret)
    throw Error('Generated test account is missing.');
  buyers[role] = await createKeyPairSignerFromBytes(Buffer.from(saved[role].secret, 'base64'));
  assert.equal(buyers[role].address, saved[role].address);
}

const rpcUrl = configuredDevnetRpcUrl();
async function rpc(method, params = []) {
  const id = crypto.randomUUID();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Devnet RPC unavailable for ' + method);
  const data = await response.json();
  if (data?.id !== id || data?.error || !Object.hasOwn(data, 'result'))
    throw Error('Devnet RPC rejected ' + method);
  return data.result;
}
assert.equal(await rpc('getGenesisHash'), SOLANA_GENESIS.devnet);

function d1(command) {
  const result = spawnSync('./node_modules/.bin/wrangler', [
    'd1', 'execute', 'DB', '--remote', '--config',
    'deploy/cloudflare/staging-game.json', '--command', command, '--json',
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw Error('Isolated staging database query failed.');
  const data = JSON.parse(result.stdout);
  if (data?.[0]?.success !== true || !Array.isArray(data[0].results))
    throw Error('Invalid isolated staging database reply.');
  return data[0].results;
}
function ok(reply) {
  assert.equal(reply.status, 200, JSON.stringify(reply.data));
  return reply.data;
}
const clients = {};
async function login(role) {
  const signer = buyers[role];
  const client = new Client({ address: signer.address });
  client.body = (body) => ({ expectedWallet: 'solana:' + signer.address, ...body });
  const nonce = ok(await client.request('nonce', {
    address: signer.address, ecosystem: 'solana',
  }));
  assert.match(nonce.message, /Chain ID: devnet/);
  const signature = '0x' + Buffer.from(await crypto.subtle.sign(
    'Ed25519', signer.keyPair.privateKey,
    new TextEncoder().encode(nonce.message),
  )).toString('hex');
  ok(await client.request('verify', { signature }));
  clients[role] = client;
  return client;
}
const buyer = await login('buyer');
const seller = await login('seller');
const market = ok(await buyer.request('compute-market'));
assert.equal(market.available, true, 'Devnet staging must be explicitly enabled first.');
assert.equal(market.network, 'devnet');
assert.equal(market.mint, mint);
assert.equal(market.decimals, 6);
const roles = [buyers.buyer.address, buyers.seller.address].map((address) =>
  "'solana:" + address + "'",
);
assert.deepEqual(d1(
  `SELECT COUNT(*) AS count FROM compute_payments WHERE buyer IN (${roles.join(',')}) OR listing_id IN (SELECT id FROM compute_listings WHERE seller IN (${roles.join(',')}))`,
), [{ count: 0 }], 'Test accounts must have no previous hosted payment.');
assert.deepEqual(d1(
  `SELECT COUNT(*) AS count FROM compute_listings WHERE seller IN (${roles.join(',')})`,
), [{ count: 0 }], 'Test accounts must have no previous hosted listing.');

// Qualify two dedicated test identities for trading and give the seller an
// isolated fixture balance. Ordinary gameplay/earning has separate acceptance.
for (const [role, amount] of [['buyer', 0], ['seller', 500]]) {
  const address = buyers[role].address;
  const result = d1(
    `UPDATE players SET credits=${amount},facility_state=json_set(facility_state,'$.stats.repairs',1) WHERE wallet='solana:${address}' RETURNING credits,json_extract(facility_state,'$.stats.repairs') AS repairs`,
  );
  assert.deepEqual(result, [{ credits: amount, repairs: 1 }]);
}
assert.equal(ok(await buyer.request('profile')).profile.credits, 0);
assert.equal(ok(await seller.request('profile')).profile.credits, 500);

const findAta = proof.tokenProgram === TOKEN_2022_PROGRAM
  ? findToken2022Ata : findLegacyAta;
async function tokenBalance(owner) {
  const [ata] = await findAta({ mint, owner, tokenProgram: proof.tokenProgram });
  const account = (await rpc('getAccountInfo', [ata, {
    encoding: 'jsonParsed', commitment: 'finalized',
  }])).value;
  return BigInt(account?.data?.parsed?.info?.tokenAmount?.amount ?? '0');
}
const buyerBefore = await tokenBalance(buyers.buyer.address);
const sellerBefore = await tokenBalance(buyers.seller.address);
assert.ok(buyerBefore >= 1000000n, 'Generated buyer needs one devnet test token.');

const listingId = crypto.randomUUID();
const created = ok(await seller.request('compute-listing-create', seller.body({
  id: listingId, compute: 250, tokenAmount: '1000000',
})));
assert.equal(created.listing.status, 'open');
const paymentId = crypto.randomUUID();
const offered = ok(await buyer.request('compute-payment-quote', buyer.body({
  id: paymentId, listingId,
})));
assert.equal(offered.quote.network, 'devnet');
assert.equal(offered.quote.mint, mint);
assert.equal(offered.quote.tokenProgram, proof.tokenProgram);
const signed = encodePaymentTransaction(await partiallySignTransaction(
  [buyers.buyer.keyPair],
  getTransactionDecoder().decode(Buffer.from(
    offered.quote.unsignedTransactionBase64, 'base64',
  )),
));
let receipt = ok(await buyer.request('compute-payment-submit', buyer.body({
  id: paymentId, transaction: signed,
}))).payment;
assert.equal(typeof receipt.signature, 'string');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let i = 0; i < 45 && receipt.status !== 'settled'; i++) {
  if (['failed', 'expired'].includes(receipt.status))
    throw Error('Hosted devnet purchase did not settle: ' + receipt.status);
  await sleep(4000);
  receipt = ok(await buyer.request('compute-payment-status', buyer.body({
    id: paymentId,
  }))).payment;
}
assert.equal(receipt.status, 'settled', 'Hosted devnet purchase timed out.');
const chain = await rpc('getTransaction', [receipt.signature, {
  encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0,
}]);
assert.equal(chain?.meta?.err, null);
assert.equal(await tokenBalance(buyers.buyer.address), buyerBefore - 1000000n);
assert.equal(await tokenBalance(buyers.seller.address), sellerBefore + 1000000n);
assert.equal(ok(await buyer.request('profile')).profile.credits, 250);
assert.equal(ok(await seller.request('profile')).profile.credits, 250);
receipt = ok(await buyer.request('compute-payment-status', buyer.body({
  id: paymentId,
}))).payment;
assert.equal(receipt.status, 'settled');
assert.equal(ok(await buyer.request('profile')).profile.credits, 250);

const result = {
  testedAt: new Date().toISOString(),
  origin, network: 'devnet', mint, tokenProgram: proof.tokenProgram,
  signature: receipt.signature, computeDelivered: 250,
  testTokensTransferred: '1', duplicateDeliveryPrevented: true,
  ledger: 'isolated hosted Cloudflare staging D1',
  wallet: 'generated test accounts, not browser extensions',
};
writeFileSync('.wrangler/noobius-staging-payment-proof.json', JSON.stringify(result, null, 2), {
  mode: 0o600,
});
console.log('HOSTED DEVNET TEST-TOKEN CHECKOUT PASSED', JSON.stringify(result));
