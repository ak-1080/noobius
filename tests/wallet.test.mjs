import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToString, verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signInWallet } from '../lib/wallet.ts';
import {
  walletBrand,
  mergeWalletOption,
  legacyWalletName,
} from '../lib/wallet-options.ts';

test('wallet discovery distinguishes compatibility providers from MetaMask', () => {
  for (const [flag, brand, name] of [
    ['isRabby', 'rabby', 'Rabby Wallet'],
    ['isPhantom', 'phantom', 'Phantom'],
    ['isCoinbaseWallet', 'coinbase', 'Coinbase Wallet'],
    ['isRainbow', 'rainbow', 'Rainbow'],
  ]) {
    const provider = {
      request: async () => [],
      isMetaMask: true,
      [flag]: true,
    };
    assert.equal(walletBrand({ id: 'test', name: 'test', provider }), brand);
    assert.equal(legacyWalletName(provider), name);
  }
  const provider = { request: async () => [], isMetaMask: true };
  assert.equal(
    walletBrand({
      id: 'test',
      name: 'test',
      provider,
      rdns: 'com.unknown.wallet',
    }),
    undefined,
  );
  assert.equal(
    walletBrand({ id: 'test', name: 'test', provider, rdns: 'io.rabby' }),
    'rabby',
  );
});

test('late wallet announcements enrich one provider without replacing its connection identity', () => {
  const first = { request: async () => ['first'] },
    second = { request: async () => ['second'] };
  let options = mergeWalletOption([], {
    id: 'legacy0',
    name: 'Browser wallet',
    provider: first,
  });
  options = mergeWalletOption(options, {
    id: 'uuid1',
    name: 'Rabby',
    rdns: 'io.rabby',
    provider: first,
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].id, 'legacy0');
  assert.equal(options[0].provider, first);
  assert.equal(walletBrand(options[0]), 'rabby');
  options = mergeWalletOption(options, {
    id: 'uuid2',
    name: 'MetaMask',
    rdns: 'io.metamask',
    provider: second,
  });
  assert.equal(options.length, 2);
  assert.equal(options[1].provider, second);
  const before = options;
  assert.equal(
    mergeWalletOption(options, {
      id: 'uuid2',
      name: 'Replacement',
      provider: { request: async () => [] },
    }),
    before,
  );
  assert.equal(
    mergeWalletOption(options, { id: 'bad', name: 'Invalid', provider: {} }),
    before,
  );
});
test('the actual wallet handshake requests accounts, signs readable hex, checks account and chain, then verifies', async () => {
  const account = privateKeyToAccount(generatePrivateKey()),
    methods = [],
    message = 'Sign in to Noobius. No transactions.';
  const provider = {
    async request({ method, params }) {
      methods.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts')
        return [account.address];
      if (method === 'eth_chainId') return '0x1';
      if (method === 'personal_sign') {
        assert.equal(params[1], account.address);
        assert.equal(hexToString(params[0]), message);
        return account.signMessage({ message: hexToString(params[0]) });
      }
      throw Error('Unexpected wallet method');
    },
  };
  const result = await signInWallet(
    provider,
    async (address, chainId) => {
      assert.equal(address, account.address);
      assert.equal(chainId, 1);
      return { message };
    },
    async (signature) => ({
      valid: await verifyMessage({
        address: account.address,
        message,
        signature,
      }),
    }),
  );
  assert.equal(result.data.valid, true);
  assert.deepEqual(methods, [
    'eth_requestAccounts',
    'eth_chainId',
    'personal_sign',
    'eth_accounts',
    'eth_chainId',
  ]);
});
test('switching accounts mid-signature never calls verify', async () => {
  const a = privateKeyToAccount(generatePrivateKey()),
    b = privateKeyToAccount(generatePrivateKey());
  let verified = false;
  const provider = {
    async request({ method }) {
      if (method === 'eth_requestAccounts') return [a.address];
      if (method === 'eth_accounts') return [b.address];
      if (method === 'eth_chainId') return '0x1';
      return '0xsigned';
    },
  };
  await assert.rejects(
    () =>
      signInWallet(
        provider,
        async () => ({ message: 'test' }),
        async () => {
          verified = true;
        },
      ),
    /wallet changed/,
  );
  assert.equal(verified, false);
});
test('rejected wallet connection is an actionable cancellation', async () => {
  await assert.rejects(
    () =>
      signInWallet(
        {
          async request() {
            throw { code: 4001 };
          },
        },
        async () => ({ message: 'unused' }),
        async () => {},
      ),
    /connection cancelled/,
  );
});
