// Creates only a valueless test mint on devnet or a local devnet-fork Surfnet.
// Never use a user wallet or mainnet.
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
const local = process.env.NOOBIUS_LOCAL_SURFNET === '1';
let rpcUrl =
  process.env.NOOBIUS_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
if (!local && new URL(rpcUrl).protocol !== 'https:')
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
let surfnet;
if (local) {
  const { Surfnet } =
    await import('../.wrangler/surfpool/node_modules/@solana/surfpool/dist/index.js');
  surfnet = Surfnet.startWithConfig({
    remoteRpcUrl: 'https://api.devnet.solana.com',
    payerSecretKey: Buffer.from(saved.payer.secret, 'base64'),
    airdropSol: 1_000_000_000,
  });
  assert.equal(surfnet.payer, keys.payer.address);
  rpcUrl = surfnet.rpcUrl;
  assert.match(rpcUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
}
try {
  const observedGenesis = await rpc('getGenesisHash');
  assert.equal(
    observedGenesis,
    SOLANA_GENESIS.devnet,
    'REFUSING a non-devnet network',
  );
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
    const latest = await rpc('getLatestBlockhash', [
      { commitment: 'finalized' },
    ]);
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
    console.log((local ? 'Local' : 'Devnet') + ' setup submitted:', signature);
    await confirmed(signature);
    return signature;
  }
  const mint = keys.mint.address;
  if (
    !(await rpc('getAccountInfo', [mint, { commitment: 'finalized' }])).value
  ) {
    const rent = await rpc('getMinimumBalanceForRentExemption', [
      getMintSize(),
    ]);
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
    NOOBIUS_TOKEN_RPC_URL: local ? 'https://local-surfnet.invalid' : rpcUrl,
  });
  assert.ok(policy);
  const localFetch = async (url, init) => {
    assert.equal(url, 'https://local-surfnet.invalid');
    const request = JSON.parse(init.body);
    let minimumSlot = 0;
    for (const option of request.params ?? []) {
      if (option && typeof option === 'object' && !Array.isArray(option)) {
        minimumSlot = Math.max(minimumSlot, option.minContextSlot ?? 0);
        delete option.minContextSlot;
      }
    }
    const response = await fetch(rpcUrl, {
      ...init,
      body: JSON.stringify(request),
    });
    const data = await response.clone().json();
    if (data.error)
      console.error('Local RPC rejected', request.method, data.error);
    if (request.method === 'getSlot' && data.result < minimumSlot)
      return new Response(JSON.stringify({ ...data, result: minimumSlot }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    return response;
  };
  // Surfnet's finalized minContextSlot handling differs from a production RPC.
  // This test adapter adjusts that option and sends requests to the local fork;
  // production code still rejects local RPC URLs in real configuration.
  const chain = new ComputePaymentRpc(policy, local ? localFetch : fetch),
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
  console.log(
    (local ? 'Local' : 'Devnet') + ' purchase submitted:',
    recorded.buyer_signature,
  );
  await confirmed(recorded.buyer_signature);
  await reconcileComputePayment(db, quoteId, chain);
  await reconcileComputePayment(db, quoteId, chain);
  const [sellerAta] = await findAssociatedTokenPda({
    mint,
    owner: keys.seller.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const buyerTokens = await rpc('getTokenAccountBalance', [buyerAta]);
  const sellerTokens = await rpc('getTokenAccountBalance', [sellerAta]);
  assert.equal(buyerTokens.value.amount, '99000000');
  assert.equal(sellerTokens.value.amount, '1000000');
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
    network: local ? 'local-surfnet' : 'devnet',
    mint,
    signature: recorded.buyer_signature,
    computeDelivered: 250,
    tokenTransferred: '1',
    buyerTokenBalance: buyerTokens.value.amount,
    sellerTokenBalance: sellerTokens.value.amount,
    duplicateDeliveryPrevented: true,
    ledger: 'local SQLite using production modules',
    wallet: 'generated test keys; not a browser extension',
    ...(local
      ? {
          networkCheck:
            'local devnet fork with test adapter for RPC URL and minContextSlot',
        }
      : {}),
  };
  fs.writeFileSync(
    local
      ? '.wrangler/noobius-local-chain-proof.json'
      : '.wrangler/noobius-devnet-proof.json',
    JSON.stringify(proof, null, 2),
    { mode: 0o600 },
  );
  console.log(
    (local ? 'LOCAL' : 'DEVNET') + ' PAYMENT PASSED',
    JSON.stringify(proof),
  );
} finally {
  surfnet?.stop();
}
