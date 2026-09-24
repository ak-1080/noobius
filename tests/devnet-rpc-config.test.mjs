import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivateDevnetRpcUrl } from '../scripts/devnet-rpc-config.mjs';

void test('hosted-payment setup requires a private HTTPS endpoint and never echoes a key in errors', () => {
  const secret = 'private-test-key';
  assert.equal(
    validatePrivateDevnetRpcUrl(`https://devnet.helius-rpc.com/?api-key=${secret}`),
    `https://devnet.helius-rpc.com/?api-key=${secret}`,
  );
  for (const value of [
    'https://api.devnet.solana.com',
    'http://devnet.helius-rpc.com/?api-key=' + secret,
    'https://user:pass@devnet.helius-rpc.com/?api-key=' + secret,
    'not-a-url-' + secret,
  ]) {
    assert.throws(() => validatePrivateDevnetRpcUrl(value), (error) =>
      !error.message.includes(secret));
  }
});
