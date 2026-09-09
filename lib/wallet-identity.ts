import { base58 } from '@scure/base';

export type WalletEcosystem = 'evm' | 'solana';

export function solanaPublicKey(address: string): Uint8Array<ArrayBuffer> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
    throw new Error('Choose a valid Solana account.');
  const bytes = Uint8Array.from(base58.decode(address));
  if (bytes.length !== 32 || base58.encode(bytes) !== address)
    throw new Error('Choose a valid Solana account.');
  return bytes;
}

export function accountKey(
  address: string,
  ecosystem: WalletEcosystem = 'evm',
) {
  if (ecosystem === 'solana') {
    solanaPublicKey(address);
    return 'solana:' + address;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address))
    throw new Error('Choose a valid Ethereum account.');
  return address.toLowerCase();
}

export const accountEcosystem = (key: string): WalletEcosystem =>
  key.startsWith('solana:') ? 'solana' : 'evm';
export const walletAddress = (key: string) =>
  key.startsWith('solana:') ? key.slice(7) : key;
export function shortWalletAddress(key: string) {
  const address = walletAddress(key);
  return address.slice(0, 6) + '…' + address.slice(-4);
}
export function publicPlayerId(profile: { wallet: string; publicId?: string }) {
  return (
    profile.publicId ??
    (/^0x[0-9a-f]{40}$/.test(profile.wallet)
      ? profile.wallet.slice(2, 18)
      : 'guest')
  );
}

export function matchesAccount(accounts: unknown, key: string) {
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') return false;
  try {
    return accountKey(accounts[0], accountEcosystem(key)) === key;
  } catch {
    return false;
  }
}
