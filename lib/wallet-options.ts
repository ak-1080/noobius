export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (name: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (name: string, fn: (...args: unknown[]) => void) => void;
};
export type WalletOption = {
  id: string;
  name: string;
  provider: Provider;
  icon?: string;
  ecosystem: 'solana';
};

// One catalog governs the picker, discovery and signing adapters. Wallet
// Standard names select a product; signed challenges still prove account control.
// Names are not cryptographic proof of which extension the player installed.
export const WALLET_CATALOG = [
  {
    id: 'phantom',
    name: 'Phantom',
    url: 'https://phantom.com/download',
    names: ['phantom'],
  },
  {
    id: 'solflare',
    name: 'Solflare',
    url: 'https://www.solflare.com/download/',
    names: ['solflare'],
  },
  {
    id: 'backpack',
    name: 'Backpack',
    url: 'https://backpack.app/download',
    names: ['backpack'],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    url: 'https://jup.ag/wallet',
    names: ['jupiter', 'jupiter wallet', 'jupiter mobile'],
  },
] as const;
export type WalletBrand = (typeof WALLET_CATALOG)[number]['id'];
export const UNSUPPORTED_WALLET =
  'Choose Phantom, Solflare, Backpack or Jupiter to play Noobius.';

export function walletBrand(name: string): WalletBrand | undefined {
  const normalized = name.trim().toLowerCase();
  return WALLET_CATALOG.find((wallet) =>
    wallet.names.some((alias) => alias === normalized),
  )?.id;
}

export function supportedWalletOptions(
  options: WalletOption[],
): WalletOption[] {
  return options.filter(
    (option) =>
      option.ecosystem === 'solana' &&
      walletBrand(option.name) &&
      typeof option.provider?.request === 'function',
  );
}
