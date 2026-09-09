import { solanaPublicKey } from './wallet-identity.ts';

export function solanaSignInMessage(
  address: string,
  origin: string,
  nonce: string,
  now: number,
) {
  solanaPublicKey(address);
  return `${new URL(origin).host} wants you to sign in with your Solana account:\n${address}\n\nSign in to Noobius to save your game progress. This does not authorize transactions or token spending.\n\nURI: ${origin}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(now + 300000).toISOString()}`;
}

export async function verifySolanaMessage(
  address: string,
  message: string,
  signature: string,
) {
  if (!/^0x[0-9a-fA-F]{128}$/.test(signature)) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      solanaPublicKey(address),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const bytes = Uint8Array.from(signature.slice(2).match(/../g)!, (x) =>
      parseInt(x, 16),
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      bytes,
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}
