// Server/coordinator protocol only. No wallet signatures or session cookies
// belong in these messages, and this key must never enter a browser bundle.
export const ROOM_SERVICE_PATH = '/api/noobius-room';
export const ROOM_TICKET_MS = 30_000;
export const ROOM_GRANT_MS = 300_000;
export const ROOM_AUTH_LEASE_MS = 10_000;
export const ROOM_NONCE_MS = 120_000;
export const ROOM_BODY_LIMIT = 4096;
const ROOM_BODY_READ_MS = 5000;
export class RoomAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type RoomAuthConfig = {
  audience: string;
  coordinatorOrigin: string;
  activeKey: string;
  keys: Record<string, string>;
};
const keyId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(v);
const hex = (v: unknown, length: number): v is string =>
  typeof v === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(v);
const bytes = (value: string) =>
  Uint8Array.from(value.match(/../g)!, (v) => parseInt(v, 16));
const encoded = (value: ArrayBuffer) =>
  [...new Uint8Array(value)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
const text = new TextEncoder();
export const opaqueRoomToken = () =>
  encoded(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const roomTokenHash = async (value: string) =>
  encoded(await crypto.subtle.digest('SHA-256', text.encode(value)));
export const validRoomToken = (value: unknown): value is string =>
  hex(value, 64);
function validOrigin(value: unknown, local: boolean): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (local &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
export function roomAuthConfig(
  values: Record<string, unknown>,
  local = false,
): RoomAuthConfig | null {
  if (values.NOOBIUS_ROOM_AUTH_ENABLED !== 'true') return null;
  try {
    const parsed = JSON.parse(String(values.NOOBIUS_ROOM_AUTH_CONFIG));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !validOrigin(parsed.audience, local) ||
      !validOrigin(parsed.coordinatorOrigin, local) ||
      !keyId(parsed.activeKey) ||
      !parsed.keys ||
      typeof parsed.keys !== 'object' ||
      Array.isArray(parsed.keys)
    )
      throw new Error();
    const keys = Object.entries(parsed.keys);
    if (
      keys.length < 1 ||
      keys.length > 2 ||
      !keys.every(([id, value]) => keyId(id) && hex(value, 64)) ||
      !Object.hasOwn(parsed.keys, parsed.activeKey)
    )
      throw new Error();
    return {
      audience: parsed.audience,
      coordinatorOrigin: parsed.coordinatorOrigin,
      activeKey: parsed.activeKey,
      keys: parsed.keys,
    };
  } catch {
    throw new RoomAuthError(503, 'Room authentication is not configured.');
  }
}
function canonical(
  config: RoomAuthConfig,
  id: string,
  timestamp: string,
  nonce: string,
  digest: string,
) {
  return [
    'noobius-room-service-v1',
    id,
    config.audience,
    'POST',
    ROOM_SERVICE_PATH,
    timestamp,
    nonce,
    digest,
  ].join('\n');
}
async function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}
export async function roomServiceHeaders(
  config: RoomAuthConfig,
  body: string,
  now = Date.now(),
  nonce = opaqueRoomToken().slice(0, 32),
) {
  const timestamp = String(Math.floor(now / 1000)),
    id = config.activeKey;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(config.keys[id], 'sign'),
    text.encode(
      canonical(config, id, timestamp, nonce, await roomTokenHash(body)),
    ),
  );
  return {
    'Content-Type': 'application/json',
    'X-Noobius-Room-Key': id,
    'X-Noobius-Room-Time': timestamp,
    'X-Noobius-Room-Nonce': nonce,
    'X-Noobius-Room-Signature': encoded(signature),
  };
}
// Cryptography is checked before persistent replay protection is touched.
export async function verifyRoomServiceRequest(
  request: Request,
  config: RoomAuthConfig,
  clock = Date.now,
) {
  const now = clock();
  if (
    request.method !== 'POST' ||
    new URL(request.url).origin !== config.audience ||
    new URL(request.url).pathname !== ROOM_SERVICE_PATH ||
    new URL(request.url).search
  )
    throw new RoomAuthError(404, 'Unknown room service operation.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new RoomAuthError(415, 'Send a JSON service request.');
  const id = request.headers.get('X-Noobius-Room-Key'),
    timestamp = request.headers.get('X-Noobius-Room-Time'),
    nonce = request.headers.get('X-Noobius-Room-Nonce'),
    signature = request.headers.get('X-Noobius-Room-Signature');
  if (
    !keyId(id) ||
    !Object.hasOwn(config.keys, id) ||
    !timestamp ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 30 ||
    !hex(nonce, 32) ||
    !hex(signature, 64)
  )
    throw new RoomAuthError(401, 'Room service authentication failed.');
  if (Number(request.headers.get('content-length') ?? 0) > ROOM_BODY_LIMIT)
    throw new RoomAuthError(413, 'Room service request too large.');
  const reader = request.body?.getReader();
  let raw = new Uint8Array(0);
  if (reader) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new RoomAuthError(408, 'Room service request timed out.')),
        ROOM_BODY_READ_MS,
      );
    });
    try {
      for (;;) {
        const next = await Promise.race([reader.read(), deadline]);
        if (next.done) break;
        if (raw.byteLength + next.value.byteLength > ROOM_BODY_LIMIT)
          throw new RoomAuthError(413, 'Room service request too large.');
        const joined = new Uint8Array(raw.byteLength + next.value.byteLength);
        joined.set(raw);
        joined.set(next.value, raw.byteLength);
        raw = joined;
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  const digest = encoded(await crypto.subtle.digest('SHA-256', raw));
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(config.keys[id], 'verify'),
    bytes(signature),
    text.encode(canonical(config, id, timestamp, nonce, digest)),
  );
  if (!ok || Math.abs(clock() / 1000 - Number(timestamp)) > 30)
    throw new RoomAuthError(401, 'Room service authentication failed.');
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw new RoomAuthError(400, 'Invalid room service request.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new RoomAuthError(400, 'Invalid room service request.');
  return { keyId: id, nonce, body: body as Record<string, unknown> };
}
