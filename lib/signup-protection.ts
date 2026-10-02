export const SIGNUP_ACTION = 'noobius_signup';
export type SignupChallenge = { siteKey: string; challenge: string };
export class SignupProtectionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
type Values = Record<string, unknown>;
const unavailable = () =>
  new SignupProtectionError(
    503,
    'New account verification is temporarily unavailable. Please try again.',
  );

// Configuration is evaluated only for account creation. A provider outage or
// bad deployment must not lock already enrolled players out of their saves.
export function signupConfig(values: Values, hostname: string) {
  const mode = values.NOOBIUS_SIGNUP_PROTECTION;
  if (mode === undefined || mode === '' || mode === 'off') return null;
  if (mode !== 'turnstile') throw unavailable();
  const siteKey = values.NOOBIUS_TURNSTILE_SITE_KEY;
  const secretKey = values.NOOBIUS_TURNSTILE_SECRET_KEY;
  if (
    typeof siteKey !== 'string' ||
    !/^[A-Za-z0-9_-]{10,100}$/.test(siteKey) ||
    typeof secretKey !== 'string' ||
    !/^[A-Za-z0-9_-]{10,100}$/.test(secretKey)
  )
    throw unavailable();
  // Cloudflare's published always-pass dummy keys are local test tools only.
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(hostname) &&
    (siteKey.startsWith('1x') ||
      siteKey.startsWith('2x') ||
      siteKey.startsWith('3x') ||
      secretKey.startsWith('1x') ||
      secretKey.startsWith('2x') ||
      secretKey.startsWith('3x'))
  )
    throw unavailable();
  return { siteKey, secretKey };
}

export async function validateSignup(
  values: Values,
  hostname: string,
  challenge: string,
  token: unknown,
  request: typeof fetch = fetch,
) {
  const config = signupConfig(values, hostname);
  if (!config) return false;
  if (typeof token !== 'string' || !token || token.length > 2048)
    throw new SignupProtectionError(
      403,
      'Complete the new account check, then connect again.',
    );
  let result: Record<string, unknown>;
  try {
    const response = await request(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: config.secretKey, response: token }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw unavailable();
    result = (await response.json()) as Record<string, unknown>;
    if (!result || typeof result !== 'object') throw unavailable();
  } catch {
    throw unavailable();
  }
  if (
    result.success !== true ||
    result.hostname !== hostname ||
    result.action !== SIGNUP_ACTION ||
    result.cdata !== challenge
  )
    throw new SignupProtectionError(
      403,
      'The new account check expired or did not match. Connect again.',
    );
  return true;
}
