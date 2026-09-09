import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { bytesToHex } from 'viem';
import { accountKey, publicPlayerId } from '../lib/wallet-identity.ts';
import {
  solanaSignInMessage,
  verifySolanaMessage,
} from '../lib/solana-auth.ts';
import { signInSolanaWallet } from '../lib/wallet.ts';
import { solanaWalletProvider } from '../lib/solana-wallet.ts';

async function fixture() {
  const key = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', key.publicKey),
  );
  const address = base58.encode(publicKey);
  const account = {
    address,
    publicKey,
    chains: ['solana:mainnet'],
    features: ['solana:signMessage'],
  };
  let listener;
  const wallet = {
    name: 'Test wallet',
    chains: ['solana:mainnet'],
    accounts: [account],
    features: {
      'standard:connect': {
        connect: async () => ({ accounts: wallet.accounts }),
      },
      'standard:events': {
        on: (_, fn) => {
          listener = fn;
          return () => {
            listener = undefined;
          };
        },
      },
      'solana:signMessage': {
        signMessage: async ({ message }) => [
          {
            signedMessage: message,
            signature: new Uint8Array(
              await crypto.subtle.sign('Ed25519', key.privateKey, message),
            ),
            signatureType: 'ed25519',
          },
        ],
      },
    },
  };
  return {
    key,
    wallet,
    address,
    account,
    emit: () => listener?.({ accounts: wallet.accounts }),
    listening: () => !!listener,
  };
}

test('Solana identities retain canonical case and use a separate namespace', async () => {
  const { address } = await fixture();
  assert.equal(accountKey(address, 'solana'), 'solana:' + address);
  assert.throws(() => accountKey('0x' + 'a'.repeat(40), 'solana'));
  assert.throws(() => accountKey('1'.repeat(31), 'solana'));
  assert.equal(
    publicPlayerId({ wallet: 'solana:' + address, publicId: 'a'.repeat(32) }),
    'a'.repeat(32),
  );
  assert.equal(
    publicPlayerId({ wallet: '0x' + 'b'.repeat(40) }),
    'b'.repeat(16),
  );
});

test('Wallet Standard signs the exact challenge and server verifies Ed25519 ownership', async () => {
  const f = await fixture(),
    provider = solanaWalletProvider(f.wallet);
  const message = solanaSignInMessage(
    f.address,
    'https://noobius.example',
    '1234567890abcdef',
    1700000000000,
  );
  assert.match(
    message,
    /^noobius.example wants you to sign in with your Solana account:/,
  );
  assert.match(message, /Expiration Time: 2023-11-14T22:18:20.000Z/);
  const result = await signInSolanaWallet(
    provider,
    async () => ({ message }),
    async (signature) => {
      assert.equal(
        await verifySolanaMessage(f.address, message, signature),
        true,
      );
      assert.equal(
        await verifySolanaMessage(f.address, message + '!', signature),
        false,
      );
      const other = await fixture();
      assert.equal(
        await verifySolanaMessage(other.address, message, signature),
        false,
      );
      return 'verified';
    },
  );
  assert.equal(result.data, 'verified');
  assert.equal(result.address, f.address);
  assert.equal(await verifySolanaMessage(f.address, message, '0x00'), false);
});

test('adapter rejects wallet message wrapping and cleans up account listeners', async () => {
  const f = await fixture(),
    provider = solanaWalletProvider(f.wallet);
  const seen = [],
    listener = (accounts) => seen.push(accounts);
  provider.on('accountsChanged', listener);
  f.wallet.accounts = [];
  f.emit();
  assert.deepEqual(seen, [[]]);
  provider.removeListener('accountsChanged', listener);
  assert.equal(f.listening(), false);
  f.wallet.accounts = [f.account];
  f.wallet.features['solana:signMessage'].signMessage = async () => [
    {
      signature: new Uint8Array(64),
      signedMessage: new TextEncoder().encode('wrapped'),
    },
  ];
  await assert.rejects(
    provider.request({
      method: 'solana_signMessage',
      params: ['original', f.address],
    }),
    /changed the login message/,
  );
});

test('account changes before and after verification stop Solana login', async () => {
  for (const changeAfterVerify of [false, true]) {
    const f = await fixture();
    let reads = 0,
      verified = false;
    const provider = {
      request: async ({ method }) => {
        if (method === 'solana_connect') return [f.address];
        if (method === 'solana_signMessage')
          return bytesToHex(new Uint8Array(64));
        return ++reads === (changeAfterVerify ? 2 : 1) ? [] : [f.address];
      },
    };
    await assert.rejects(
      signInSolanaWallet(
        provider,
        async () => ({ message: 'login' }),
        async () => {
          verified = true;
        },
      ),
      /changed during login/,
    );
    assert.equal(verified, changeAfterVerify);
  }
});

test('connection and signature cancellation allow a fresh attempt', async () => {
  const f = await fixture();
  for (const canceled of ['solana_connect', 'solana_signMessage']) {
    const provider = {
      request: async ({ method }) => {
        if (method === canceled)
          throw Object.assign(new Error('Declined'), { code: 4001 });
        return [f.address];
      },
    };
    await assert.rejects(
      signInSolanaWallet(
        provider,
        async () => ({ message: 'login' }),
        async () => assert.fail('must not verify'),
      ),
      /cancelled/,
    );
  }
});
