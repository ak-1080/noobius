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

// Kintara-style total level: five independently earned skills, averaged down.
// The old `players.xp` column remains a projection for existing room admission
// checks. It is no longer a spendable or token-derived value.
export const LEVEL_SKILLS = [
  'salvaging',
  'engineering',
  'production',
  'operations',
  'fieldwork',
] as const;
export type LevelSkill = (typeof LEVEL_SKILLS)[number];
export type SkillXp = Record<LevelSkill, number>;
export const FREE_LEVEL_LIMIT = 10;
// A serialization safety bound, not a designed endgame cap. It exceeds every
// previously supported player level so old high-level saves can be seeded.
export const MAX_SKILL_LEVEL = 1000;
export const skillXpForLevel = (level: number) =>
  20 * Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.floor(level)) - 1) ** 2;
export const skillLevelFromXp = (xp: number) =>
  Math.min(MAX_SKILL_LEVEL, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 20)));
export const seedSkillXp = (legacyXp: number): SkillXp => {
  const threshold = skillXpForLevel(Math.min(MAX_SKILL_LEVEL, playerLevel(legacyXp)));
  return Object.fromEntries(LEVEL_SKILLS.map((skill) => [skill, threshold])) as SkillXp;
};
export function validSkillXp(value: unknown): value is SkillXp {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    LEVEL_SKILLS.every((skill) => {
      const xp = (value as Record<string, unknown>)[skill];
      return Number.isSafeInteger(xp) && (xp as number) >= 0 &&
        (xp as number) <= skillXpForLevel(MAX_SKILL_LEVEL);
    });
}
export const totalLevel = (skills: SkillXp) =>
  Math.floor(LEVEL_SKILLS.reduce((sum, skill) => sum + skillLevelFromXp(skills[skill]), 0) / LEVEL_SKILLS.length);
export function projectedPlayerXp(skills: SkillXp) {
  const average = LEVEL_SKILLS.reduce((sum, skill) => sum + skillLevelFromXp(skills[skill]), 0) / LEVEL_SKILLS.length;
  return Math.floor(50 * (average - 1) ** 2);
}
export function awardSkillXp(
  previous: SkillXp | null,
  legacyXp: number,
  skill: LevelSkill,
  amount: number,
  holder: boolean,
) {
  const skills = { ...(previous ?? seedSkillXp(legacyXp)) };
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error('Invalid skill award.');
  if (!holder && totalLevel(skills) >= FREE_LEVEL_LIMIT)
    return { skills, xp: legacyXp, awarded: 0 };
  const before = skills[skill];
  // A free account can reach level 10 but cannot train beyond it. Keep any
  // remaining award at the boundary instead of losing prior progress.
  let low = 0, high = Math.min(amount, skillXpForLevel(MAX_SKILL_LEVEL) - before);
  if (!holder) {
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      skills[skill] = before + mid;
      if (totalLevel(skills) <= FREE_LEVEL_LIMIT) low = mid;
      else high = mid - 1;
    }
    skills[skill] = before + low;
  } else skills[skill] = before + high;
  return { skills, xp: Math.max(legacyXp, projectedPlayerXp(skills)), awarded: skills[skill] - before };
}

export function skillForFacilityAction(type: string): LevelSkill {
  if (type === 'gather') return 'salvaging';
  if (['craft', 'collect', 'build', 'outage-fix', 'repair'].includes(type))
    return 'engineering';
  if (type === 'compute-collect') return 'production';
  if (type.startsWith('field-')) return 'fieldwork';
  return 'operations';
}
