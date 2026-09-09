import { DurableObject } from 'cloudflare:workers';

// Temporary owner-private hosting proof. No player, save or economy access.
export type TransportProbeEnv = {
  TRANSPORT_PROBE?: DurableObjectNamespace<TransportProbe>;
};
const siteOrigin = 'https://noobius-compute-crew.rivd609.chatgpt.site';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function permittedOrigin(request: Request) {
  const url = new URL(request.url);
  const expected = ['localhost', '127.0.0.1'].includes(url.hostname)
    ? url.origin
    : siteOrigin;
  return request.headers.get('Origin') === expected;
}

function singleExchange(receipt: number): Response {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  const timer = setTimeout(() => server.close(1000, 'Probe expired'), 5000);
  server.addEventListener('close', () => clearTimeout(timer));
  server.addEventListener('message', (event) => {
    if (event.data === 'ping')
      server.send(JSON.stringify({ pong: true, receipt }));
    server.close(event.data === 'ping' ? 1000 : 1008, 'Probe complete');
    clearTimeout(timer);
  });
  return new Response(null, { status: 101, webSocket: client });
}

export async function transportProbe(request: Request, env: TransportProbeEnv) {
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405);
  const mode = new URL(request.url).searchParams.get('mode');
  if (!mode) return json({ probe: 1, roomBinding: !!env.TRANSPORT_PROBE });
  if (!permittedOrigin(request))
    return json({ error: 'Origin not allowed' }, 403);
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    return json({ error: 'WebSocket required' }, 426);
  if (mode === 'socket') return singleExchange(0);
  if (mode === 'room') {
    if (!env.TRANSPORT_PROBE)
      return json({ error: 'Room binding unavailable' }, 503);
    return env.TRANSPORT_PROBE.getByName('hosting-proof-v1').fetch(request);
  }
  return json({ error: 'Unknown probe' }, 404);
}

export class TransportProbe extends DurableObject<TransportProbeEnv> {
  async fetch(request: Request) {
    if (
      !permittedOrigin(request) ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
    )
      return json({ error: 'WebSocket required' }, 400);
    const receipt = await this.ctx.storage.transaction(async (txn) => {
      const next = ((await txn.get<number>('receipt')) ?? 0) + 1;
      await txn.put('receipt', next);
      return next;
    });
    return singleExchange(receipt);
  }
}
