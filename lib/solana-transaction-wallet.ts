import { base64 } from '@scure/base';
import {
  address,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  verifySignature,
} from '@solana/kit';
import type { StandardWallet } from './solana-wallet.ts';
const encode64 = (bytes: ArrayLike<number>) =>
  base64.encode(Uint8Array.from(bytes));
export async function signSolanaTransaction(
  wallet: StandardWallet,
  wire: string,
  owner: string,
  network: string,
) {
  // MetaMask currently presents devnet checkout requests as Solana Mainnet.
  // Do not show a misleading approval prompt for a test-token payment.
  if (network === 'devnet' && /metamask/i.test(wallet.name))
    throw Error(
      'MetaMask is showing this devnet test payment as Solana Mainnet. Cancel this checkout and use a Solana wallet set to devnet for testing.',
    );
  const chain =
    network === 'mainnet-beta'
      ? 'solana:mainnet'
      : network === 'devnet'
        ? 'solana:devnet'
        : null;
  if (!chain) throw Error('Unsupported payment network.');
  const feature = wallet.features['solana:signTransaction'] as
    | {
        supportedTransactionVersions?: readonly (string | number)[];
        signTransaction?: (input: {
          account: StandardWallet['accounts'][number];
          chain: string;
          transaction: Uint8Array;
        }) => Promise<readonly { signedTransaction: Uint8Array }[]>;
      }
    | undefined;
  if (
    !feature?.signTransaction ||
    !feature.supportedTransactionVersions?.includes('legacy')
  )
    throw Error(
      'This wallet cannot approve this checkout. Choose a Solana wallet that supports signing transactions without sending them.',
    );
  const account = wallet.accounts.find(
    (a) =>
      a.address === owner &&
      a.chains.includes(chain as `${string}:${string}`) &&
      a.features.includes('solana:signTransaction'),
  );
  if (!account)
    throw Error('Connect the purchasing wallet on the correct Solana network.');
  if (wire.length > 1644) throw Error('Invalid payment transaction.');
  const bytes = base64.decode(wire),
    decode = getTransactionDecoder(),
    encode = getTransactionEncoder();
  if (!bytes.length || bytes.length > 1232 || encode64(bytes) !== wire)
    throw Error('Invalid payment transaction.');
  const original = decode.decode(bytes),
    signers = Object.keys(original.signatures);
  if (
    signers.length !== 2 ||
    signers[0] !== owner ||
    Object.values(original.signatures).some(Boolean) ||
    encode64(encode.encode(original)) !== wire
  )
    throw Error('Invalid checkout signers.');
  let result: readonly { signedTransaction: Uint8Array }[];
  try {
    result = await feature.signTransaction({
      account,
      chain,
      transaction: bytes,
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 4001)
      throw Error('Wallet approval cancelled. No payment was submitted.');
    throw Error('Wallet approval did not finish. No payment was submitted.');
  }
  const current = wallet.accounts.find(
    (a) =>
      a.address === owner && a.chains.includes(chain as `${string}:${string}`),
  );
  if (!current || !current.features.includes('solana:signTransaction'))
    throw Error(
      'Your wallet changed during approval. No payment was submitted.',
    );
  const signed = result[0]?.signedTransaction;
  if (
    result.length !== 1 ||
    !(signed instanceof Uint8Array) ||
    !signed.length ||
    signed.length > 1232
  )
    throw Error('The wallet returned an invalid transaction.');
  const tx = decode.decode(signed);
  if (
    encode64(tx.messageBytes) !== encode64(original.messageBytes) ||
    encode64(encode.encode(tx)) !== encode64(signed)
  )
    throw Error('The wallet changed the checkout. No payment was submitted.');
  const sig = tx.signatures[address(owner)];
  if (
    !sig ||
    tx.signatures[address(signers[1])] ||
    !(await verifySignature(
      await getPublicKeyFromAddress(address(owner)),
      sig,
      tx.messageBytes,
    ))
  )
    throw Error('The wallet did not return the expected payment approval.');
  return encode64(signed);
}
