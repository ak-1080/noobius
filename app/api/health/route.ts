import { env } from 'cloudflare:workers';
import { RETURNING_LOGIN_VERSION } from '@/lib/returning-login';
import { runtimeControls } from '@/lib/operations';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (runtimeControls(env as unknown as Record<string, unknown>).maintenance)
    return Response.json(
      { status: 'maintenance', service: 'noobius-game' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
      },
    );
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM d1_migrations',
    ).first<{ count: number }>();
    // Current gameplay writes skill XP and holding timestamps from migration
    // 0014. A healthy Worker must have the complete schema installed.
    if (!row || row.count < 15) throw new Error('Schema unavailable');
    return Response.json(
      {
        status: 'ok',
        service: 'noobius-game',
        returningLoginVersion: RETURNING_LOGIN_VERSION,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable', service: 'noobius-game' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
