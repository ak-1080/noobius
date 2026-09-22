// Creates only a valueless DEVNET test mint. Never use a user wallet or mainnet.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  generateKeyPairSigner,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  partiallySignTransaction,
} from '@solana/kit';
import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
} from '@solana-program/token';
import { database } from '../tests/sqlite-d1.mjs';
import { SOLANA_GENESIS, solanaHoldingPolicy } from '../lib/solana-holdings.ts';
import { ComputePaymentRpc } from '../lib/compute-payment-rpc.ts';
import {
  createComputeListing,
  reserveComputePayment,
  recordBuyerComputePayment,
  getComputePayment,
} from '../lib/compute-market.ts';
import {
  createComputePaymentQuote,
  encodePaymentTransaction,
} from '../lib/solana-payment.ts';
import { getTransactionDecoder } from '@solana/kit';
import { reconcileComputePayment } from '../lib/compute-payment-recovery.ts';
const rpcUrl =
  process.env.NOOBIUS_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
if (new URL(rpcUrl).protocol !== 'https:')
  throw Error('Use an HTTPS devnet RPC.');
async function rpc(method, params = []) {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await r.json();
  if (!r.ok || json.error)
    throw Error(
      'Devnet RPC failed for ' + method + ' (HTTP ' + r.status + ').',
    );
  return json.result;
}
assert.equal(
  await rpc('getGenesisHash'),
  SOLANA_GENESIS.devnet,
  'REFUSING a non-devnet network',
);
const secretPath = '.wrangler/noobius-devnet-wallets.json';
let saved;
if (fs.existsSync(secretPath))
  saved = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
else {
  saved = { network: 'devnet' };
  for (const role of ['payer', 'buyer', 'seller', 'authorization', 'mint']) {
    const key = await generateKeyPairSigner(true),
      jwk = await crypto.subtle.exportKey('jwk', key.keyPair.privateKey);
    saved[role] = {
      address: key.address,
      secret: Buffer.concat([
        Buffer.from(jwk.d, 'base64url'),
        Buffer.from(
          await crypto.subtle.exportKey('raw', key.keyPair.publicKey),
        ),
      ]).toString('base64'),
    };
  }
  fs.mkdirSync('.wrangler', { recursive: true });
  fs.writeFileSync(secretPath, JSON.stringify(saved, null, 2), { mode: 0o600 });
}
assert.equal(saved.network, 'devnet');
const keys = {};
for (const role of ['payer', 'buyer', 'seller', 'authorization', 'mint']) {
  keys[role] = await createKeyPairSignerFromBytes(
    Buffer.from(saved[role].secret, 'base64'),
  );
  assert.equal(keys[role].address, saved[role].address);
}
const balance = await rpc('getBalance', [
  keys.payer.address,
  { commitment: 'finalized' },
]);
if (balance.value < 30000000)
  throw Error(
    'Fund DEVNET test payer ' +
      keys.payer.address +
      ' with 0.1 free devnet SOL, then rerun. Do not send real SOL.',
  );
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function confirmed(signature) {
  for (let i = 0; i < 90; i++) {
    const result = await rpc('getTransaction', [
      signature,
      {
        encoding: 'base64',
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (result) {
      assert.equal(result.meta.err, null, 'Devnet transaction failed');
      return result;
    }
    await sleep(2000);
  }
  throw Error(
    'Devnet confirmation timed out; inspect the existing signature before retrying.',
  );
}
async function send(instructions, signers = [keys.payer]) {
  const latest = await rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = appendTransactionMessageInstructions(
    instructions,
    setTransactionMessageLifetimeUsingBlockhash(
      {
        ...latest.value,
        lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight),
      },
      setTransactionMessageFeePayer(
        keys.payer.address,
        createTransactionMessage({ version: 'legacy' }),
      ),
    ),
  );
  const wire = encodePaymentTransaction(
    await partiallySignTransaction(
      signers.map((k) => k.keyPair),
      compileTransaction(message),
    ),
  );
  const signature = await rpc('sendTransaction', [
    wire,
    {
      encoding: 'base64',
      preflightCommitment: 'finalized',
      skipPreflight: false,
    },
  ]);
  console.log('Devnet setup submitted:', signature);
  await confirmed(signature);
  return signature;
}
const mint = keys.mint.address;
if (!(await rpc('getAccountInfo', [mint, { commitment: 'finalized' }])).value) {
  const rent = await rpc('getMinimumBalanceForRentExemption', [getMintSize()]);
  await send(
    [
      getCreateAccountInstruction({
        payer: keys.payer,
        newAccount: keys.mint,
        lamports: BigInt(rent),
        space: BigInt(getMintSize()),
        programAddress: TOKEN_PROGRAM_ADDRESS,
      }),
      getInitializeMint2Instruction({
        mint,
        decimals: 6,
        mintAuthority: keys.payer.address,
      }),
    ],
    [keys.payer, keys.mint],
  );
}
const [buyerAta] = await findAssociatedTokenPda({
  mint,
  owner: keys.buyer.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
await send([
  getTransferSolInstruction({
    source: keys.payer,
    destination: keys.buyer.address,
    amount: BigInt(10000000),
  }),
  getCreateAssociatedTokenIdempotentInstruction({
    payer: keys.payer,
    ata: buyerAta,
    owner: keys.buyer.address,
    mint,
  }),
  getMintToInstruction({
    mint,
    token: buyerAta,
    mintAuthority: keys.payer,
    amount: BigInt(100000000),
  }),
]);
const policy = solanaHoldingPolicy({
  NOOBIUS_SOLANA_NETWORK: 'devnet',
  NOOBIUS_TOKEN_MINT: mint,
  NOOBIUS_TOKEN_DECIMALS: '6',
  NOOBIUS_TOKEN_RPC_URL: rpcUrl,
});
assert.ok(policy);
const chain = new ComputePaymentRpc(policy),
  db = database();
for (const role of ['buyer', 'seller'])
  db.sqlite
    .prepare(
      'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
    )
    .run('solana:' + keys[role].address, 'Devnet ' + role, 1000, Date.now());
const listingId = crypto.randomUUID(),
  quoteId = crypto.randomUUID(),
  wallet = 'solana:' + keys.buyer.address;
await createComputeListing(
  db,
  {
    id: listingId,
    seller: 'solana:' + keys.seller.address,
    compute: 250,
    tokenAmount: '1000000',
  },
  policy,
);
const quote = await createComputePaymentQuote({
  quoteId,
  network: 'devnet',
  buyer: keys.buyer.address,
  seller: keys.seller.address,
  mint,
  decimals: 6,
  amount: '1000000',
  authorizationSigner: keys.authorization.address,
  ...(await chain.quoteLifetime()),
});
await reserveComputePayment(db, listingId, wallet, quote, policy);
const signed = encodePaymentTransaction(
  await partiallySignTransaction(
    [keys.buyer.keyPair],
    getTransactionDecoder().decode(
      Buffer.from(quote.unsignedTransactionBase64, 'base64'),
    ),
  ),
);
const recorded = await recordBuyerComputePayment(db, quoteId, wallet, signed);
await reconcileComputePayment(db, quoteId, chain, keys.authorization.keyPair);
console.log('Devnet purchase submitted:', recorded.buyer_signature);
await confirmed(recorded.buyer_signature);
await reconcileComputePayment(db, quoteId, chain);
await reconcileComputePayment(db, quoteId, chain);
assert.equal((await getComputePayment(db, quoteId)).status, 'settled');
assert.equal(
  db.sqlite.prepare('SELECT credits FROM players WHERE wallet=?').get(wallet)
    .credits,
  1250,
);
assert.equal(
  db.sqlite
    .prepare('SELECT credits FROM players WHERE wallet=?')
    .get('solana:' + keys.seller.address).credits,
  750,
);
const proof = {
  testedAt: new Date().toISOString(),
  network: 'devnet',
  mint,
  signature: recorded.buyer_signature,
  computeDelivered: 250,
  duplicateDeliveryPrevented: true,
  ledger: 'local SQLite using production modules',
  wallet: 'generated test keys; not a browser extension',
};
fs.writeFileSync(
  '.wrangler/noobius-devnet-proof.json',
  JSON.stringify(proof, null, 2),
  { mode: 0o600 },
);
console.log('DEVNET PAYMENT PASSED', JSON.stringify(proof));
