import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
  assertIsFullySignedTransaction,
} from '@solana/kit';
import {
  createComputePaymentQuote,
  encodePaymentTransaction,
  validateBuyerPayment,
  coSignRecordedPayment,
  verifyFinalizedPayment,
} from '../lib/solana-payment.ts';
import { TOKEN_2022_PROGRAM } from '../lib/solana-holdings.ts';
const decode = (wire) =>
  getTransactionDecoder().decode(Buffer.from(wire, 'base64'));
async function fixture() {
  const buyer = await generateKeyPairSigner(),
    seller = await generateKeyPairSigner(),
    signer = await generateKeyPairSigner();
  const quote = await createComputePaymentQuote({
    quoteId: crypto.randomUUID(),
    network: 'devnet',
    buyer: buyer.address,
    seller: seller.address,
    mint: (await generateKeyPairSigner()).address,
    decimals: 6,
    amount: '1000000',
    authorizationSigner: signer.address,
    recentBlockhash: (await generateKeyPairSigner()).address,
    lastValidBlockHeight: 100,
    contextSlot: 50,
  });
  const transaction = await partiallySignTransaction(
    [buyer.keyPair],
    decode(quote.unsignedTransactionBase64),
  );
  return { buyer, seller, signer, quote, transaction };
}
void test('buyer approval alone cannot broadcast; recorded payment authorizes once without changing payer signature', async () => {
  const { quote, transaction, signer } = await fixture();
  assert.throws(() => assertIsFullySignedTransaction(transaction));
  const recorded = await validateBuyerPayment(
    quote,
    encodePaymentTransaction(transaction),
  );
  const authorized = await coSignRecordedPayment(
    quote,
    recorded,
    signer.keyPair,
  );
  assert.equal(authorized.signature, recorded.signature);
  assertIsFullySignedTransaction(decode(authorized.transactionBase64));
  assert.deepEqual(
    await coSignRecordedPayment(quote, recorded, signer.keyPair),
    authorized,
  );
  assert.deepEqual(
    await verifyFinalizedPayment(quote, recorded.signature, {
      slot: 123,
      meta: { err: null },
      transaction: [authorized.transactionBase64, 'base64'],
    }),
    { signature: recorded.signature, slot: 123, amount: '1000000' },
  );
});
void test('altered recipient, amount, memo, blockhash or network cannot replace the durable quote', async () => {
  const { quote, buyer } = await fixture();
  for (const change of [
    { seller: (await generateKeyPairSigner()).address },
    { amount: '2000000' },
    { quoteId: crypto.randomUUID() },
    { recentBlockhash: (await generateKeyPairSigner()).address },
    { network: 'mainnet-beta' },
  ]) {
    const changed = await createComputePaymentQuote({ ...quote, ...change });
    const signed = await partiallySignTransaction(
      [buyer.keyPair],
      decode(changed.unsignedTransactionBase64),
    );
    await assert.rejects(
      validateBuyerPayment(quote, encodePaymentTransaction(signed)),
      /differs/,
    );
  }
  await assert.rejects(
    validateBuyerPayment(
      { ...quote, network: 'mainnet-beta' },
      quote.unsignedTransactionBase64,
    ),
    /inconsistent/,
  );
});
void test('Token-2022 is bound to the signed transaction and cannot be switched after approval', async () => {
  const { quote, buyer } = await fixture();
  const token2022Quote = await createComputePaymentQuote({
    ...quote,
    tokenProgram: TOKEN_2022_PROGRAM,
  });
  assert.notEqual(token2022Quote.messageBase64, quote.messageBase64);
  const signed = await partiallySignTransaction(
    [buyer.keyPair],
    decode(token2022Quote.unsignedTransactionBase64),
  );
  await assert.rejects(
    validateBuyerPayment(quote, encodePaymentTransaction(signed)),
    /differs/,
  );
  assert.ok(
    (
      await validateBuyerPayment(
        token2022Quote,
        encodePaymentTransaction(signed),
      )
    ).signature,
  );
});
void test('missing, corrupt, unexpected authorization or wrong-key signatures are rejected', async () => {
  const { quote, transaction, signer, buyer } = await fixture();
  await assert.rejects(
    validateBuyerPayment(quote, quote.unsignedTransactionBase64),
    /signature/,
  );
  const recorded = await validateBuyerPayment(
    quote,
    encodePaymentTransaction(transaction),
  );
  await assert.rejects(
    coSignRecordedPayment(
      quote,
      recorded,
      (await generateKeyPairSigner()).keyPair,
    ),
    /Wrong/,
  );
  await assert.rejects(
    coSignRecordedPayment(
      quote,
      { ...recorded, signature: 'wrong' },
      signer.keyPair,
    ),
    /changed/,
  );
  const corrupt = Uint8Array.from(transaction.signatures[buyer.address]);
  corrupt[0] ^= 1;
  await assert.rejects(
    validateBuyerPayment(
      quote,
      encodePaymentTransaction({
        ...transaction,
        signatures: { ...transaction.signatures, [buyer.address]: corrupt },
      }),
    ),
    /signature/,
  );
  const full = await coSignRecordedPayment(quote, recorded, signer.keyPair);
  await assert.rejects(
    validateBuyerPayment(quote, full.transactionBase64),
    /signature/,
  );
});
void test('failed, pending, unrelated or unsigned chain results never credit Compute', async () => {
  const { quote, transaction, signer } = await fixture();
  const recorded = await validateBuyerPayment(
    quote,
    encodePaymentTransaction(transaction),
  );
  const full = await coSignRecordedPayment(quote, recorded, signer.keyPair);
  for (const result of [
    null,
    {
      slot: 123,
      meta: { err: { InstructionError: [0, 'error'] } },
      transaction: [full.transactionBase64, 'base64'],
    },
    {
      slot: 123,
      meta: { err: null },
      transaction: [recorded.transactionBase64, 'base64'],
    },
    {
      slot: -1,
      meta: { err: null },
      transaction: [full.transactionBase64, 'base64'],
    },
  ])
    await assert.rejects(
      verifyFinalizedPayment(quote, recorded.signature, result),
    );
  await assert.rejects(
    verifyFinalizedPayment(quote, 'unrelated', {
      slot: 123,
      meta: { err: null },
      transaction: [full.transactionBase64, 'base64'],
    }),
    /mismatch/,
  );
});
void test('invalid price/precision/self-trade and malformed wire encodings are rejected', async () => {
  const { quote, transaction } = await fixture();
  for (const change of [
    { amount: '0' },
    { amount: '1.5' },
    { amount: '18446744073709551616' },
    { decimals: 19 },
    { seller: quote.buyer },
    { authorizationSigner: quote.buyer },
    { lastValidBlockHeight: 0 },
  ])
    await assert.rejects(createComputePaymentQuote({ ...quote, ...change }));
  for (const wire of [
    '',
    encodePaymentTransaction(transaction) + '\n',
    'a'.repeat(2000),
  ])
    await assert.rejects(validateBuyerPayment(quote, wire));
});
