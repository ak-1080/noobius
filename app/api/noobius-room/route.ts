import { RoomAuthError } from '@/lib/room-auth';
import { ApiError, handleRoomRequest } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    return await handleRoomRequest(request);
  } catch (error) {
    if (error instanceof RoomAuthError || error instanceof ApiError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    // Never log signed headers, opaque grants, cookies or request bodies.
    console.error('Room authentication operation failed');
    return Response.json(
      { error: 'Room service unavailable. Try again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
