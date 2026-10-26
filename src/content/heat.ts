/**
 * Heat (SPEC S3.2): ten Tour difficulty tiers. Each adds one rule on top of the
 * ones before it, Slay the Spire Ascension-style. Heat N+1 unlocks once a Tour
 * is won at Heat N. Engine effects live in engine/tour.ts and engine/waves.ts.
 */
export const MAX_HEAT = 10;

/** Rule added at each Heat (index 0 = Heat 1). Short: these show on the title screen. */
export const HEAT_RULES: readonly string[] = [
  'Start the Tour with 25 crowd.',
  'Monsters have 15% more health.',
  'Tournaments are tougher.',
  'Market cards cost 25% more.',
  'Inns win back less crowd.',
  'Bosses have 35% more health.',
  'Monsters walk 15% faster.',
  'Each monster that gets through costs 1 more crowd.',
  'Card picks offer 2 cards instead of 3.',
  'Every show is as tough as a Tournament.',
];

/** Every rule in force at a Heat. */
export function heatRules(heat: number): string[] {
  return HEAT_RULES.slice(0, Math.max(0, Math.min(MAX_HEAT, heat)));
}
