import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WALLET_CATALOG,
  walletBrand,
  supportedWalletOptions,
} from '../lib/wallet-options.ts';

test('the player catalog contains exactly the four approved Solana wallets in order', () => {
  assert.deepEqual(
    WALLET_CATALOG.map((w) => w.name),
    ['Phantom', 'Solflare', 'Backpack', 'Jupiter'],
  );
  for (const wallet of WALLET_CATALOG) {
    assert.equal(walletBrand(wallet.name), wallet.id);
    assert.equal(new URL(wallet.url).protocol, 'https:');
  }
});
test('names match complete approved products, never arbitrary substrings or EVM compatibility flags', () => {
  for (const name of [
    'Jupiter',
    'Jupiter Wallet',
    'Jupiter Mobile',
    ' jUpItEr ',
  ])
    assert.equal(walletBrand(name), 'jupiter');
  for (const name of [
    'MetaMask',
    'Rabby Wallet',
    'Coinbase Wallet',
    'Rainbow',
    'WalletConnect',
    'Unknown Wallet',
    'Phantom clone',
    'My Solflare',
    'Backpack Extra',
    'Jupiter Impostor',
  ])
    assert.equal(walletBrand(name), undefined);
  const provider = {
    request: async () => [],
    isPhantom: true,
    isMetaMask: true,
  };
  const allowed = { id: 'a', name: 'Phantom', provider, ecosystem: 'solana' };
  assert.deepEqual(
    supportedWalletOptions([
      allowed,
      { ...allowed, name: 'MetaMask' },
      { ...allowed, ecosystem: 'evm' },
      { ...allowed, provider: {} },
    ]),
    [allowed],
  );
});
