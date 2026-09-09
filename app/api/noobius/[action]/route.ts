import { NeighborhoodError } from '@/lib/neighborhoods-server';
import { FacilityError } from '@/lib/facility';
import { ApiError, handleGame } from '@/lib/server';
export const dynamic = 'force-dynamic';
async function respond(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    return await handleGame(request, (await params).action);
  } catch (error) {
    if (error instanceof ApiError || error instanceof NeighborhoodError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    if (error instanceof FacilityError)
      return Response.json(
        { error: error.message },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    if (
      error instanceof Error &&
      /station|shift|equipment|diagnostics|hint/.test(error.message)
    )
      return Response.json(
        { error: error.message },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    console.error('Noobius request failed', error);
    return Response.json(
      { error: 'The facility hit a snag. Please try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
async function handle(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const started = performance.now(),
    requestId = crypto.randomUUID();
  const response = await respond(request, context);
  response.headers.set('X-Request-ID', requestId);
  const action = (await context.params).action.slice(0, 64);
  const important =
    response.status >= 400 ||
    /^(listing-|project-claim|project-contribute|neighborhood-join)/.test(
      action,
    );
  if (important || Math.random() < 0.02)
    console.log(
      JSON.stringify({
        event: 'noobius-request',
        requestId,
        action,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        sampleRate: important ? 1 : 0.02,
      }),
    );
  return response;
}
export const GET = handle;
export const POST = handle;
