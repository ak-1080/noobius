/** Earned account XP is the only source of player level. Holdings never add XP. */
export const xpForLevel = (level: number) =>
  50 * Math.max(0, Math.floor(level) - 1) ** 2;
export function playerProgress(xp: number) {
  const total = Number.isSafeInteger(xp) && xp >= 0 ? xp : 0;
  const level = 1 + Math.floor(Math.sqrt(total / 50));
  const start = xpForLevel(level),
    next = xpForLevel(level + 1);
  return {
    level,
    xp: total,
    start,
    next,
    earned: total - start,
    remaining: next - total,
    percent: ((total - start) / (next - start)) * 100,
  };
}
export const playerLevel = (xp: number) => playerProgress(xp).level;
export const playerBand = (xp: number) =>
  Math.min(2, Math.floor((playerLevel(xp) - 1) / 5));
