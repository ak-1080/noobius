// A signed returning login may open a session only for this exact existing
// save. There is deliberately no INSERT/UPSERT of a player or earning account.
export const RETURNING_LOGIN_VERSION = 1;

export async function issueReturningSession(
  database: D1Database,
  wallet: string,
  publicId: string,
  sessionHash: string,
  expiresAt: number,
): Promise<boolean> {
  const result = await database
    .prepare(
      'INSERT INTO sessions(token_hash,wallet,expires_at) SELECT ?,p.wallet,? FROM players p JOIN earning_accounts e ON e.wallet=p.wallet WHERE p.wallet=? AND p.public_id=?',
    )
    .bind(sessionHash, expiresAt, wallet, publicId)
    .run();
  return result.meta.changes === 1;
}
