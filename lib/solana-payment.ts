// Server-side primitives; no route enables payments yet. Persist the buyer's
// signature/submission intent BEFORE co-signing or exposing a broadcastable tx.
import { Buffer } from 'node:buffer';
import { base58 } from '@scure/base';
import {
  address,
  blockhash,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageComputeUnitPrice,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  getTransactionEncoder,
  getTransactionDecoder,
  getPublicKeyFromAddress,
  getAddressFromPublicKey,
  verifySignature,
  partiallySignTransaction,
  type Transaction,
} from '@solana/kit';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from '@solana-program/token';
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  findAssociatedTokenPda as findToken2022AssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction as getCreateToken2022AssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction as getToken2022TransferCheckedInstruction,
} from '@solana-program/token-2022';
import { getAddMemoInstruction } from '@solana-program/memo';
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  type SupportedTokenProgram,
} from './solana-holdings.ts';
export type ComputePaymentTerms = {
  quoteId: string;
  network: keyof typeof SOLANA_GENESIS;
  buyer: string;
  seller: string;
  mint: string;
  tokenProgram?: SupportedTokenProgram;
  decimals: number;
  amount: string;
  authorizationSigner: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  contextSlot: number;
};
export type ComputePaymentQuote = ComputePaymentTerms & {
  messageBase64: string;
  unsignedTransactionBase64: string;
};
export type RecordedBuyerPayment = {
  signature: string;
  transactionBase64: string;
};
export const encodePaymentTransaction = (tx: Transaction) =>
  Buffer.from(getTransactionEncoder().encode(tx)).toString('base64');
function decodeTransaction(value: string) {
  if (
    typeof value !== 'string' ||
    value.length > 1644 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw Error('Invalid payment transaction.');
  const bytes = Buffer.from(value, 'base64');
  if (
    !bytes.length ||
    bytes.length > 1232 ||
    bytes.toString('base64') !== value
  )
    throw Error('Invalid payment transaction.');
  const tx = getTransactionDecoder().decode(bytes);
  if (encodePaymentTransaction(tx) !== value)
    throw Error('Noncanonical payment transaction.');
  return tx;
}
export async function createComputePaymentQuote(
  terms: ComputePaymentTerms,
): Promise<ComputePaymentQuote> {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      terms.quoteId,
    ) ||
    !Object.hasOwn(SOLANA_GENESIS, terms.network) ||
    !Number.isSafeInteger(terms.lastValidBlockHeight) ||
    terms.lastValidBlockHeight <= 0 ||
    !Number.isSafeInteger(terms.contextSlot) ||
    terms.contextSlot < 1 ||
    !Number.isInteger(terms.decimals) ||
    terms.decimals < 0 ||
    terms.decimals > 18 ||
    !/^[1-9]\d{0,19}$/.test(terms.amount) ||
    BigInt(terms.amount) > BigInt('18446744073709551615') ||
    ![SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(
      terms.tokenProgram ?? SPL_TOKEN_PROGRAM,
    )
  )
    throw Error('Invalid payment terms.');
  const buyer = address(terms.buyer),
    seller = address(terms.seller),
    mint = address(terms.mint),
    signer = address(terms.authorizationSigner);
  if (buyer === seller || buyer === signer || seller === signer)
    throw Error('Payment participants must be distinct.');
  const tokenProgram = terms.tokenProgram ?? SPL_TOKEN_PROGRAM;
  const token2022 = tokenProgram === TOKEN_2022_PROGRAM;
  const [source] = token2022
    ? await findToken2022AssociatedTokenPda({
        mint,
        owner: buyer,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
    : await findAssociatedTokenPda({
        mint,
        owner: buyer,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
  const [destination] = token2022
    ? await findToken2022AssociatedTokenPda({
        mint,
        owner: seller,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
    : await findAssociatedTokenPda({
        mint,
        owner: seller,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
  const buyerSigner = createNoopSigner(buyer);
  const createDestination = token2022
    ? getCreateToken2022AssociatedTokenIdempotentInstruction({
        payer: buyerSigner,
        ata: destination,
        owner: seller,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
    : getCreateAssociatedTokenIdempotentInstruction({
        payer: buyerSigner,
        ata: destination,
        owner: seller,
        mint,
      });
  const transfer = token2022
    ? getToken2022TransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: buyerSigner,
        amount: BigInt(terms.amount),
        decimals: terms.decimals,
      })
    : getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: buyerSigner,
        amount: BigInt(terms.amount),
        decimals: terms.decimals,
      });
  const message = appendTransactionMessageInstructions(
    [
      createDestination,
      transfer,
      getAddMemoInstruction({
        memo: 'noobius:compute:v1:' + terms.network + ':' + terms.quoteId,
        signers: [buyerSigner, createNoopSigner(signer)],
      }),
    ],
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash(terms.recentBlockhash),
        lastValidBlockHeight: BigInt(terms.lastValidBlockHeight),
      },
      setTransactionMessageComputeUnitPrice(
        BigInt(1_000),
        setTransactionMessageComputeUnitLimit(
          300_000,
          setTransactionMessageFeePayer(
            buyer,
            createTransactionMessage({ version: 'legacy' }),
          ),
        ),
      ),
    ),
  );
  const tx = compileTransaction(message);
  return {
    ...terms,
    messageBase64: Buffer.from(tx.messageBytes).toString('base64'),
    unsignedTransactionBase64: encodePaymentTransaction(tx),
  };
}
async function matchingTransaction(
  quote: ComputePaymentQuote,
  encoded: string,
) {
  const expected = await createComputePaymentQuote(quote);
  if (
    expected.messageBase64 !== quote.messageBase64 ||
    expected.unsignedTransactionBase64 !== quote.unsignedTransactionBase64
  )
    throw Error('Stored payment quote is inconsistent.');
  const tx = decodeTransaction(encoded);
  if (
    Buffer.from(tx.messageBytes).toString('base64') !== expected.messageBase64
  )
    throw Error('The signed payment differs from the quoted trade.');
  const signers = Object.keys(tx.signatures);
  if (
    signers.length !== 2 ||
    signers[0] !== quote.buyer ||
    !Object.hasOwn(tx.signatures, quote.authorizationSigner)
  )
    throw Error('Invalid payment signers.');
  return tx;
}
export async function validateBuyerPayment(
  quote: ComputePaymentQuote,
  encoded: string,
): Promise<RecordedBuyerPayment> {
  const tx = await matchingTransaction(quote, encoded);
  const signature = tx.signatures[address(quote.buyer)];
  if (
    !signature ||
    tx.signatures[address(quote.authorizationSigner)] ||
    !(await verifySignature(
      await getPublicKeyFromAddress(address(quote.buyer)),
      signature,
      tx.messageBytes,
    ))
  )
    throw Error('Invalid buyer payment signature.');
  return {
    signature: base58.encode(Uint8Array.from(signature)),
    transactionBase64: encoded,
  };
}
export async function coSignRecordedPayment(
  quote: ComputePaymentQuote,
  recorded: RecordedBuyerPayment,
  authorizationKeyPair: CryptoKeyPair,
) {
  const verified = await validateBuyerPayment(
    quote,
    recorded.transactionBase64,
  );
  if (verified.signature !== recorded.signature)
    throw Error('Recorded payment signature changed.');
  if (
    (await getAddressFromPublicKey(authorizationKeyPair.publicKey)) !==
    quote.authorizationSigner
  )
    throw Error('Wrong payment authorization key.');
  const tx = await partiallySignTransaction(
    [authorizationKeyPair],
    await matchingTransaction(quote, recorded.transactionBase64),
  );
  const encoded = encodePaymentTransaction(tx);
  await verifyAllSignatures(quote, tx);
  return { signature: recorded.signature, transactionBase64: encoded };
}
async function verifyAllSignatures(
  quote: ComputePaymentQuote,
  tx: Transaction,
) {
  for (const signer of [quote.buyer, quote.authorizationSigner]) {
    const sig = tx.signatures[address(signer)];
    if (
      !sig ||
      !(await verifySignature(
        await getPublicKeyFromAddress(address(signer)),
        sig,
        tx.messageBytes,
      ))
    )
      throw Error('Invalid payment signature.');
  }
}
// Feed only getTransaction(..., commitment:'finalized', encoding:'base64') data
// from a server-verified network. JSON shape alone cannot prove chain finality.
export async function verifyFinalizedPayment(
  quote: ComputePaymentQuote,
  recordedSignature: string,
  result: unknown,
) {
  const verified = await verifyPaymentIdentity(
    quote,
    recordedSignature,
    result,
  );
  if (verified.error !== null)
    throw Error('Payment is not a successful finalized transaction.');
  return {
    signature: verified.signature,
    slot: verified.slot,
    amount: quote.amount,
  };
}
// Finality and network are established by the RPC caller, never by a request body.
export async function verifyPaymentIdentity(
  quote: ComputePaymentQuote,
  recordedSignature: string,
  result: unknown,
) {
  const value = result as {
    slot?: unknown;
    meta?: { err?: unknown };
    transaction?: unknown[];
  } | null;
  if (
    !value ||
    !Number.isSafeInteger(value.slot) ||
    Number(value.slot) < 0 ||
    !value.meta ||
    !Object.hasOwn(value.meta, 'err') ||
    !Array.isArray(value.transaction) ||
    value.transaction[1] !== 'base64' ||
    typeof value.transaction[0] !== 'string'
  )
    throw Error('Payment is not a successful finalized transaction.');
  const tx = await matchingTransaction(quote, value.transaction[0]);
  await verifyAllSignatures(quote, tx);
  if (
    base58.encode(Uint8Array.from(tx.signatures[address(quote.buyer)]!)) !==
    recordedSignature
  )
    throw Error('Finalized payment signature mismatch.');
  return {
    signature: recordedSignature,
    slot: Number(value.slot),
    error: value.meta.err,
  };
}
