import { NeighborhoodError } from '@/lib/neighborhoods-server';
import { FacilityError } from '@/lib/facility';
import { ApiError, handleGame } from '@/lib/server';
export const dynamic = 'force-dynamic';
async function handle(
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
export const GET = handle;
export const POST = handle;
