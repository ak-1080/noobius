import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signupConfig,
  validateSignup,
  SignupProtectionError,
  SIGNUP_ACTION,
} from '../lib/signup-protection.ts';
const values = {
  NOOBIUS_SIGNUP_PROTECTION: 'turnstile',
  NOOBIUS_TURNSTILE_SITE_KEY: '0xQaPublicKey123456',
  NOOBIUS_TURNSTILE_SECRET_KEY: '0xQaPrivateKey123456',
};
const hostname = 'staging.example.com',
  challenge = 'a'.repeat(64);
const verdict = {
  success: true,
  hostname,
  action: SIGNUP_ACTION,
  cdata: challenge,
};
const reply = (result) => async () => Response.json(result);
test('disabled signup protection does not call an external provider', async () => {
  assert.equal(signupConfig({}, hostname), null);
  assert.equal(
    await validateSignup({}, hostname, challenge, undefined, () => {
      throw Error('must not call');
    }),
    false,
  );
});
test('enabled signup requires complete configuration and rejects hosted dummy keys', () => {
  for (const config of [
    { ...values, NOOBIUS_TURNSTILE_SECRET_KEY: undefined },
    { ...values, NOOBIUS_SIGNUP_PROTECTION: 'typo' },
    { ...values, NOOBIUS_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
  ])
    assert.throws(
      () => signupConfig(config, hostname),
      (error) => error instanceof SignupProtectionError && error.status === 503,
    );
  assert.ok(
    signupConfig(
      { ...values, NOOBIUS_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
      '127.0.0.1',
    ),
  );
});
test('missing, malformed and oversized client tokens are denied before provider requests', async () => {
  for (const token of [null, undefined, {}, '', 'x'.repeat(2049)])
    await assert.rejects(
      validateSignup(values, hostname, challenge, token, () => {
        throw Error('must not call');
      }),
      (error) => error.status === 403,
    );
});
test('server accepts only exact successful origin, action and signed-login challenge', async () => {
  for (const changes of [
    { success: false },
    { success: 'true' },
    { hostname: 'other.example.com' },
    { action: 'login' },
    { cdata: 'b'.repeat(64) },
    { cdata: undefined },
  ])
    await assert.rejects(
      validateSignup(
        values,
        hostname,
        challenge,
        'token',
        reply({ ...verdict, ...changes }),
      ),
      (error) => error.status === 403,
    );
  assert.equal(
    await validateSignup(
      values,
      hostname,
      challenge,
      'token',
      async (url, init) => {
        assert.equal(
          url,
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        );
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body), {
          secret: values.NOOBIUS_TURNSTILE_SECRET_KEY,
          response: 'token',
        });
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json(verdict);
      },
    ),
    true,
  );
});
test('replayed provider token is refused; network and bad provider replies fail closed without leaking secrets', async () => {
  await assert.rejects(
    validateSignup(
      values,
      hostname,
      challenge,
      'used-token',
      reply({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    ),
    (error) => error.status === 403,
  );
  for (const request of [
    () => {
      throw Error('private key/network detail');
    },
    async () => new Response('private key', { status: 503 }),
    async () => new Response('not json'),
    reply(null),
  ])
    await assert.rejects(
      validateSignup(values, hostname, challenge, 'token', request),
      (error) => error.status === 503 && !error.message.includes('private'),
    );
});
