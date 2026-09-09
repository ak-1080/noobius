import { getWallets } from '@wallet-standard/app';
import { bytesToHex } from 'viem';
import type { Provider } from './wallet-options.ts';

export type StandardWallet = ReturnType<
  ReturnType<typeof getWallets>['get']
>[number];
type Account = StandardWallet['accounts'][number];
type Features = {
  'standard:connect': { connect(): Promise<{ accounts: readonly Account[] }> };
  'standard:events': {
    on(
      event: 'change',
      listener: (change: {
        accounts?: readonly Account[];
        chains?: readonly string[];
        features?: unknown;
      }) => void,
    ): () => void;
  };
  'solana:signMessage': {
    signMessage(input: { account: Account; message: Uint8Array }): Promise<
      readonly {
        signature: Uint8Array;
        signedMessage: Uint8Array;
        signatureType?: string;
      }[]
    >;
  };
};
const solanaAccounts = (accounts: readonly Account[]) =>
  accounts.filter(
    (account) =>
      account.chains.some((chain) => chain.startsWith('solana:')) &&
      account.features.includes('solana:signMessage'),
  );

export function supportsSolanaWallet(wallet: StandardWallet) {
  const features = wallet.features as Partial<Features>;
  return (
    wallet.chains.some((chain) => chain.startsWith('solana:')) &&
    typeof features['standard:connect']?.connect === 'function' &&
    typeof features['standard:events']?.on === 'function' &&
    typeof features['solana:signMessage']?.signMessage === 'function'
  );
}

// A small adapter lets both ecosystems share the application's session lifecycle.
// Wallet metadata only selects/display a provider; the server verifies ownership.
export function solanaWalletProvider(wallet: StandardWallet): Provider {
  const features = wallet.features as unknown as Features;
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let off: (() => void) | undefined;
  return {
    async request({ method, params }) {
      if (!supportsSolanaWallet(wallet))
        throw new Error(
          'This wallet no longer supports Solana message signing.',
        );
      if (method === 'solana_connect') {
        const { accounts } = await features['standard:connect'].connect();
        return solanaAccounts(accounts).map((account) => account.address);
      }
      if (method === 'solana_accounts')
        return solanaAccounts(wallet.accounts).map(
          (account) => account.address,
        );
      if (method === 'solana_signMessage') {
        const [text, address] = params ?? [];
        const account = solanaAccounts(wallet.accounts).find(
          (account) => account.address === address,
        );
        if (!account || typeof text !== 'string')
          throw new Error('Your Solana account changed. Connect again.');
        const message = new TextEncoder().encode(text);
        const [result] = await features['solana:signMessage'].signMessage({
          account,
          message,
        });
        if (
          !result ||
          result.signature.length !== 64 ||
          (result.signatureType && result.signatureType !== 'ed25519') ||
          result.signedMessage.length !== message.length ||
          !message.every((byte, index) => result.signedMessage[index] === byte)
        )
          throw new Error(
            'This wallet changed the login message. Choose a wallet that supports plain Solana message signing.',
          );
        return bytesToHex(result.signature);
      }
      throw new Error('Unsupported Solana wallet request.');
    },
    on(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
      off ??= features['standard:events'].on('change', () => {
        const accounts = supportsSolanaWallet(wallet)
          ? solanaAccounts(wallet.accounts).map((account) => account.address)
          : [];
        listeners.get('accountsChanged')?.forEach((fn) => fn(accounts));
      });
    },
    removeListener(name, listener) {
      listeners.get(name)?.delete(listener);
      if (![...listeners.values()].some((group) => group.size)) {
        off?.();
        off = undefined;
      }
    },
  };
}
