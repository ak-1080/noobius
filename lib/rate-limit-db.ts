import { databaseQuotaExceeded } from './service-unavailable.ts';

/** A D1 counter write may commit before its response fails. A retry can count
 * the same request twice, which is conservative; never bypass the limit. */
export async function rateCountWithRetry(
  write: () => Promise<number | null>,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<number | null> {
  try {
    return await write();
  } catch (error) {
    if (databaseQuotaExceeded(error)) throw error;
    await pause(40);
    return write();
  }
}
