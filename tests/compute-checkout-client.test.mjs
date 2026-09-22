import test from 'node:test';
import assert from 'node:assert/strict';
import { base64, base58 } from '@scure/base';
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
  getTransactionEncoder,
} from '@solana/kit';
import {
  createComputePaymentQuote,
  validateBuyerPayment,
} from '../lib/solana-payment.ts';
import { solanaWalletProvider } from '../lib/solana-wallet.ts';
import {
  ComputeCheckoutSession,
  formatTokenUnits,
  tokenUnits,
  transactionLink,
} from '../lib/compute-trading-client.ts';
async function fixture() {
  const buyer = await generateKeyPairSigner(),
    seller = await generateKeyPairSigner(),
    authorization = await generateKeyPairSigner(),
    mint = await generateKeyPairSigner();
  const quote = await createComputePaymentQuote({
    quoteId: crypto.randomUUID(),
    network: 'devnet',
    buyer: buyer.address,
    seller: seller.address,
    mint: mint.address,
    decimals: 6,
    amount: '12000000',
    authorizationSigner: authorization.address,
    recentBlockhash: mint.address,
    lastValidBlockHeight: 100,
    contextSlot: 50,
  });
  const account = {
    address: buyer.address,
    publicKey: base58.decode(buyer.address),
    chains: ['solana:devnet'],
    features: ['solana:signMessage', 'solana:signTransaction'],
  };
  const calls = [];
  const wallet = {
    name: 'Test Solana Wallet',
    chains: ['solana:devnet'],
    accounts: [account],
    features: {
      'standard:connect': {
        connect: async () => ({ accounts: wallet.accounts }),
      },
      'standard:events': { on: () => () => {} },
      'solana:signMessage': { signMessage: async () => [] },
      'solana:signAndSendTransaction': {
        signAndSendTransaction: async () =>
          assert.fail('Must never bypass server co-signing'),
      },
      'solana:signTransaction': {
        supportedTransactionVersions: ['legacy'],
        signTransaction: async (input) => {
          calls.push(input);
          const tx = await partiallySignTransaction(
            [buyer.keyPair],
            getTransactionDecoder().decode(input.transaction),
          );
          return [
            {
              signedTransaction: Uint8Array.from(
                getTransactionEncoder().encode(tx),
              ),
            },
          ];
        },
      },
    },
  };
  const provider = solanaWalletProvider(wallet),
    sign = () =>
      provider.request({
        method: 'solana_signTransaction',
        params: [quote.unsignedTransactionBase64, buyer.address, 'devnet'],
      });
  const payment = {
    id: quote.quoteId,
    listingId: crypto.randomUUID(),
    status: 'quoted',
    signature: null,
    network: 'devnet',
    amount: quote.amount,
    mint: quote.mint,
    decimals: 6,
    compute: 250,
    seller: seller.address,
    expiresAt: Date.now() + 90000,
  };
  return { buyer, seller, quote, wallet, provider, calls, sign, payment };
}
void test('token prices use exact integer units without floating point loss', () => {
  assert.equal(tokenUnits('123456789.123456789', 9), '123456789123456789');
  assert.equal(tokenUnits('0.000001', 6), '1');
  assert.equal(
    formatTokenUnits('123456789123456789', 9),
    '123,456,789.123456789',
  );
  assert.equal(formatTokenUnits('12000000', 6), '12');
  for (const value of ['0', '-1', '1e6', '1,000', '1.0000001', '01', 'NaN', ''])
    assert.throws(() => tokenUnits(value, 6));
  assert.throws(() => tokenUnits('18446744073709551616', 0));
});
void test('Wallet Standard signs the exact devnet transaction without broadcasting it', async () => {
  const f = await fixture(),
    signed = await f.sign();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].chain, 'solana:devnet');
  assert.equal(f.calls[0].account.address, f.buyer.address);
  assert.equal(
    (await validateBuyerPayment(f.quote, signed)).transactionBase64,
    signed,
  );
  assert.equal(
    base64.encode(f.calls[0].transaction),
    f.quote.unsignedTransactionBase64,
  );
});
void test('wallet account/network changes and missing sign-only capability stop approval', async () => {
  const f = await fixture();
  await assert.rejects(
    f.provider.request({
      method: 'solana_signTransaction',
      params: [
        f.quote.unsignedTransactionBase64,
        f.buyer.address,
        'mainnet-beta',
      ],
    }),
    /correct Solana network/,
  );
  const original = f.wallet.features['solana:signTransaction'].signTransaction;
  f.wallet.features['solana:signTransaction'].signTransaction = async (
    input,
  ) => {
    const result = await original(input);
    f.wallet.accounts = [];
    return result;
  };
  await assert.rejects(f.sign(), /wallet changed/);
  const g = await fixture();
  delete g.wallet.features['solana:signTransaction'];
  await assert.rejects(g.sign(), /cannot approve/);
});
void test('changed messages, corrupt signatures, and rejected wallet prompts never produce a submission', async () => {
  const f = await fixture(),
    original = f.wallet.features['solana:signTransaction'].signTransaction;
  const changed = await createComputePaymentQuote({
    ...f.quote,
    amount: '12000001',
  });
  f.wallet.features['solana:signTransaction'].signTransaction = () =>
    original({
      transaction: Buffer.from(changed.unsignedTransactionBase64, 'base64'),
    });
  await assert.rejects(f.sign(), /changed the checkout/);
  f.wallet.features['solana:signTransaction'].signTransaction = async () => {
    throw { code: 4001 };
  };
  await assert.rejects(f.sign(), /cancelled/);
  f.wallet.features['solana:signTransaction'].signTransaction = async () => [
    {
      signedTransaction: Buffer.from(
        f.quote.unsignedTransactionBase64,
        'base64',
      ),
    },
  ];
  await assert.rejects(f.sign(), /expected payment approval/);
});
void test('uncertain send retries the identical approval, then status checks finish without signing again', async () => {
  const f = await fixture();
  let signCount = 0,
    attempt = 0;
  const sent = [];
  const session = new ComputeCheckoutSession(
    'solana:' + f.buyer.address,
    async (action, body) => {
      if (action === 'compute-payment-status')
        return { payment: { ...f.payment, status: 'settled' } };
      assert.equal(action, 'compute-payment-submit');
      sent.push(body);
      if (++attempt === 1) throw Error('Connection interrupted');
      return { payment: { ...f.payment, status: 'recorded' } };
    },
    async () => {
      signCount++;
      return f.sign();
    },
  );
  session.setCheckout({ payment: f.payment, quote: f.quote });
  await assert.rejects(session.approve(), /interrupted/);
  assert.equal(session.hasApproval, true);
  assert.equal(signCount, 1);
  await session.approve();
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(signCount, 1);
  assert.equal((await session.check()).payment.status, 'settled');
  assert.equal(signCount, 1);
});
void test('reopening pending checkout never triggers a wallet signature; concurrent approvals are excluded', async () => {
  const f = await fixture();
  const restored = new ComputeCheckoutSession(
    'solana:' + f.buyer.address,
    async () => ({ payment: { ...f.payment, status: 'submitted' } }),
    async () => assert.fail('No signing on reopen'),
  );
  await restored.resume(f.payment.id);
  assert.equal(restored.checkout.payment.status, 'submitted');
  await restored.check();
  let release;
  const awaiting = new Promise((resolve) => {
    release = resolve;
  });
  const session = new ComputeCheckoutSession(
    'solana:' + f.buyer.address,
    async () => ({ payment: { ...f.payment, status: 'recorded' } }),
    async () => {
      await awaiting;
      return 'signed';
    },
  );
  session.setCheckout({ payment: f.payment, quote: f.quote });
  const first = session.approve();
  await assert.rejects(session.approve(), /in progress/);
  release();
  await first;
});
void test('moving to another checkout clears an old approval and explorer links preserve the network', async () => {
  const f = await fixture();
  let n = 0;
  const session = new ComputeCheckoutSession(
    'solana:' + f.buyer.address,
    async () => {
      throw Error('timeout');
    },
    async () => {
      n++;
      return 'old';
    },
  );
  session.setCheckout({ payment: f.payment, quote: f.quote });
  await assert.rejects(session.approve());
  assert.equal(session.hasApproval, true);
  session.setCheckout({
    payment: { ...f.payment, status: 'expired', id: crypto.randomUUID() },
    quote: null,
  });
  assert.equal(session.hasApproval, false);
  assert.equal(n, 1);
  assert.equal(
    transactionLink({ ...f.payment, signature: 'abc' }),
    'https://explorer.solana.com/tx/abc?cluster=devnet',
  );
});

void test('review amount and wallet must match the payment that will be signed', async () => {
  const f = await fixture();
  const session = new ComputeCheckoutSession(
    'solana:' + f.buyer.address,
    async () => assert.fail('No request'),
    async () => assert.fail('No signing'),
  );
  for (const change of [
    { amount: '1' },
    { mint: f.buyer.address },
    { network: 'mainnet-beta' },
    { seller: f.buyer.address },
    { id: crypto.randomUUID() },
  ])
    assert.throws(
      () =>
        session.setCheckout({
          payment: { ...f.payment, ...change },
          quote: f.quote,
        }),
      /do not match/,
    );
});
