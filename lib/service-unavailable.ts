// Classify only the known provider quota failure. Do not expose SQL, account
// information, or internal provider messages to players, or retry mutations.
export function databaseQuotaExceeded(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    if (
      /D1_ERROR:/i.test(current.message) &&
      /exceeded D1's free tier daily row (?:read|write) limit/i.test(
        current.message,
      )
    )
      return true;
    current = current.cause;
  }
  return false;
}

export function databaseQuotaResponse(error: unknown): Response | null {
  if (!databaseQuotaExceeded(error)) return null;
  return Response.json(
    {
      error:
        'Online play is temporarily unavailable. Please wait before trying again. Your last confirmed save will be loaded when service returns.',
      code: 'SERVICE_UNAVAILABLE',
    },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    },
  );
}
