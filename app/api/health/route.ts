import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM d1_migrations',
    ).first<{ count: number }>();
    if (!row || row.count < 13) throw new Error('Schema unavailable');
    return Response.json(
      { status: 'ok', service: 'noobius-game' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable', service: 'noobius-game' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
