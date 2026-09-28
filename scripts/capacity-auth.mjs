import { EARNING_POLICY } from '../lib/earning-policy.ts';
import { RETURNING_LOGIN_VERSION } from '../lib/returning-login.ts';

const MINUTE_THROTTLE = 'A little too fast. Please try again in a minute.';

export function assertReturningCapacityServer(health) {
  if (
    health?.status !== 'ok' ||
    health?.service !== 'noobius-game' ||
    health?.returningLoginVersion !== RETURNING_LOGIN_VERSION
  )
    throw new Error(
      'The hosted Worker does not support fenced returning QA sign-in. Deploy the tested returning-login version before running this cohort; no authentication was attempted.',
    );
}

export function assertFreshCapacityAccounts(count) {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error('Fresh-account capacity count must be a positive integer.');
  if (count > EARNING_POLICY.newNetworkAccounts)
    throw new Error(
      `Fresh capacity probe requests ${count} accounts, exceeding the ${EARNING_POLICY.newNetworkAccounts} new centers per network per rolling 24 hours. Use at most ${Math.floor(EARNING_POLICY.newNetworkAccounts / 5)} rooms or an explicitly registered returning QA cohort. Earlier signups may further reduce the available allowance.`,
    );
}

export async function authenticateCapacityActor({
  address,
  returningProfileId,
  request,
  sign,
  sleep,
  now = Date.now,
  isStopped = () => false,
  onThrottle = () => {},
}) {
  const fail = (stage, response) => {
    throw new Error(
      `Capacity authentication stopped at ${stage} (HTTP ${response.status}): ${response.data?.error ?? 'unexpected response'}. Only the known minute throttle is retryable; signup limits require existing test accounts or an available rolling-day allowance.`,
    );
  };
  const throttled = (response) =>
    response.status === 429 && response.data?.error === MINUTE_THROTTLE;
  const wait = async (attempt) => {
    if (attempt === 2)
      throw new Error(
        'Capacity authentication remained minute-throttled after three attempts.',
      );
    const delay = 60200 - (now() % 60000);
    onThrottle(delay);
    for (let remaining = delay; remaining > 0; remaining -= 10000) {
      if (isStopped()) throw new Error('Capacity authentication stopped.');
      await sleep(Math.min(remaining, 10000));
    }
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (isStopped()) throw new Error('Capacity authentication stopped.');
    const nonce = await request('nonce', { address, ecosystem: 'solana' });
    if (throttled(nonce)) {
      await wait(attempt);
      continue;
    }
    if (nonce.status !== 200) fail('nonce', nonce);
    if (typeof nonce.data?.message !== 'string')
      throw new Error('Capacity nonce response has no sign-in message.');
    const signature = await sign(nonce.data.message);
    const verification = await request('verify', {
      signature,
      ...(returningProfileId === undefined ? {} : { returningProfileId }),
    });
    if (throttled(verification)) {
      await wait(attempt);
      // Always obtain/sign a new challenge; never replay a verification body.
      continue;
    }
    if (verification.status !== 200) fail('verify', verification);
    return verification.data.profile;
  }
}
