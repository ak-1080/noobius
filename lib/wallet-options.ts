export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (name: string, fn: (...args: any[]) => void) => void;
  removeListener?: (name: string, fn: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  isRainbow?: boolean;
  providers?: Provider[];
};
export type WalletOption = {
  id: string;
  name: string;
  provider: Provider;
  rdns?: string;
};
export const WALLET_CATALOG = [
  { id: 'metamask', name: 'MetaMask', url: 'https://metamask.io/download/' },
  { id: 'rabby', name: 'Rabby Wallet', url: 'https://rabby.io/' },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    url: 'https://www.coinbase.com/wallet/downloads',
  },
  { id: 'phantom', name: 'Phantom', url: 'https://phantom.com/download' },
  { id: 'walletconnect', name: 'WalletConnect', url: null },
  { id: 'rainbow', name: 'Rainbow', url: 'https://rainbow.me/download' },
] as const;
export type WalletBrand = (typeof WALLET_CATALOG)[number]['id'];
const BRANDS: Record<string, WalletBrand> = {
  'io.metamask': 'metamask',
  'io.rabby': 'rabby',
  'com.coinbase.wallet': 'coinbase',
  'app.phantom': 'phantom',
  'me.rainbow': 'rainbow',
};

// Metadata is used for display only. Every connection still uses the exact
// provider chosen by the player and the same verified sign-in handshake.
export function walletBrand(option: WalletOption): WalletBrand | undefined {
  if (option.rdns) return BRANDS[option.rdns.toLowerCase()];
  const p = option.provider;
  if (p.isRabby) return 'rabby';
  if (p.isPhantom) return 'phantom';
  if (p.isCoinbaseWallet) return 'coinbase';
  if (p.isRainbow) return 'rainbow';
  if (p.isMetaMask) return 'metamask';
}

export function mergeWalletOption(
  options: WalletOption[],
  incoming: WalletOption,
): WalletOption[] {
  if (typeof incoming.provider?.request !== 'function') return options;
  const existing = options.findIndex(
    (option) => option.provider === incoming.provider,
  );
  if (existing >= 0) {
    // A late EIP-6963 announcement enriches the legacy entry without creating
    // a second row or changing the identity of a pending connection.
    if (!incoming.rdns || options[existing].rdns) return options;
    return options.map((option, index) =>
      index === existing ? { ...incoming, id: option.id } : option,
    );
  }
  if (options.some((option) => option.id === incoming.id)) return options;
  return [...options, incoming];
}

export function legacyWalletName(provider: Provider) {
  const brand = walletBrand({ id: '', name: '', provider });
  return (
    WALLET_CATALOG.find((wallet) => wallet.id === brand)?.name ??
    'Browser wallet'
  );
}
