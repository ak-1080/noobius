export const QUICK_PINGS = {
  wave: '👋 Hey, crew!',
  project: '🔧 Meet me at Margo. Let’s work on the cluster.',
  parts: '📦 Anyone have spare parts to trade?',
  thanks: '✨ Thanks for helping!',
} as const;
export const REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Impersonation',
  'Other',
] as const;
export type SocialPerson = {
  id: string;
  name: string;
  muted: boolean;
  blocked: boolean;
};
export type RecentNeighbor = {
  id: string;
  name: string;
  neighborhoodId: string | null;
  realm: 'commons' | 'gpu' | null;
};
export type SocialSnapshot = {
  preferences: SocialPerson[];
  recent: RecentNeighbor[];
};
export function playerName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) return null;
  const plain = name.toLowerCase().replace(/[ _-]/g, '');
  if (
    /^(admin|moderator|support|official|noobiusadmin|noobiussupport)$/.test(
      plain,
    )
  )
    return null;
  if (/(fuck|shit|cunt|nigg|faggot)/.test(plain)) return null;
  return name;
}

// Arguments are SQL column expressions owned by our queries, never request text.
export const noBlockSql = (a: string, b: string) =>
  `NOT EXISTS(SELECT 1 FROM social_preferences block WHERE block.blocked=1 AND ((block.wallet=${a} AND block.target_wallet=${b}) OR (block.wallet=${b} AND block.target_wallet=${a})))`;
