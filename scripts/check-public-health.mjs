// Read-only public service probes. No accounts, wallets, secrets or player writes.
import { pathToFileURL } from 'node:url';
export async function checkPublicHealth(fetcher = fetch) {
  const checks = [
    {
      name: 'game-entry',
      url: 'https://play.noobius.io/',
      status: 200,
      validate: async (r) => /<title[^>]*>Noobius/i.test(await r.text()),
    },
    {
      name: 'coming-soon',
      url: 'https://noobius.io/',
      status: 200,
      validate: async (r) => /coming soon/i.test(await r.text()),
    },
    {
      name: 'game-database',
      url: 'https://play.noobius.io/api/health',
      status: 200,
      validate: async (r) => {
        const b = await r.json();
        return b.status === 'ok' && b.service === 'noobius-game';
      },
    },
    {
      name: 'anonymous-exchange',
      url: 'https://play.noobius.io/api/noobius/compute-market',
      status: 200,
      validate: async (r) => {
        const b = await r.json();
        return (
          typeof b.available === 'boolean' &&
          b.viewer === null &&
          Array.isArray(b.pending) &&
          b.pending.length === 0 &&
          Array.isArray(b.recent) &&
          b.recent.length === 0
        );
      },
    },
    {
      name: 'room-router',
      url: 'https://rooms.noobius.io/',
      status: 404,
      validate: async (r) => (await r.json()).error === 'Unknown room.',
    },
  ];
  const results = await Promise.all(
    checks.map(async (check) => {
      const began = performance.now();
      try {
        const response = await fetcher(check.url, {
          signal: AbortSignal.timeout(12000),
          redirect: 'error',
          headers: { 'User-Agent': 'Noobius public health check' },
        });
        const valid =
          response.status === check.status && (await check.validate(response));
        return {
          name: check.name,
          ok: valid,
          status: response.status,
          durationMs: Math.round(performance.now() - began),
          ...(valid ? {} : { reason: 'Unexpected response' }),
        };
      } catch (error) {
        return {
          name: check.name,
          ok: false,
          durationMs: Math.round(performance.now() - began),
          reason:
            error?.name === 'TimeoutError'
              ? 'Request timed out'
              : 'Request failed',
        };
      }
    }),
  );
  return {
    ok: results.every((r) => r.ok),
    checkedAt: new Date().toISOString(),
    checks: results,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await checkPublicHealth();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
