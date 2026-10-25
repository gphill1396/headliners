import type { EnemyDef, EnemyKind } from '../engine/types';

/** Phase 1a enemies (SPEC §4.8). Each one asks for a different answer. */
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: {
    kind: 'shambler',
    name: 'Shambler',
    trait: 'Basic, but they come in pairs. Keeps walking.',
    hp: 12,
    armor: 0,
    travelBeats: 12,
    crowdDamage: 2,
    packSize: 2,
  },
  brute: {
    kind: 'brute',
    name: 'Brute',
    trait: 'Armored: every hit does 3 less damage. Needs big hits.',
    hp: 70,
    armor: 3,
    travelBeats: 16,
    crowdDamage: 4,
    packSize: 1,
  },
  swarmling: {
    kind: 'swarmling',
    name: 'Swarmlings',
    trait: 'Come in packs, low health, fast. Splash and Pierce shred them.',
    hp: 5,
    armor: 0,
    travelBeats: 9,
    crowdDamage: 1,
    packSize: 8,
  },
};
