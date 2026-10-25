import type { CardDef } from '../engine/types';

/**
 * Phase 1a card pool (SPEC §6): 3 units, 3 gates, 5 riffs, 1 amp.
 * Base numbers here are tuned by hand for the slice; the simulator (1b) tunes them for real.
 */
export const CARDS: readonly CardDef[] = [
  // ---- Units ----
  {
    id: 'stagehand',
    name: 'Stagehand',
    type: 'unit',
    cost: 1,
    rarity: 'starter',
    keywords: [],
    unit: { damage: 3, fireEvery: 2 },
    short: 'Shoots every beat',
    text: 'Unit. 3 damage, fires every beat.',
    flavor: 'Coils cables, throws punches.',
  },
  {
    id: 'kick-drum',
    name: 'Kick Drum',
    type: 'unit',
    cost: 2,
    rarity: 'starter',
    headliner: 'thrum',
    keywords: ['downbeat'],
    unit: { damage: 4, fireEvery: 4 },
    triggers: [{ when: 'downbeat', link: true, effects: [{ do: 'selfFire', shots: 3 }] }],
    short: 'Burst on beat 1',
    text: 'Unit. 4 damage, fires every 2 beats. Downbeat: fires 3 extra shots and adds a chain link.',
    flavor: 'Four on the floor, through the floor.',
  },
  {
    id: 'bassline',
    name: 'Bassline',
    type: 'unit',
    cost: 3,
    rarity: 'starter',
    keywords: ['pierce'],
    unit: { damage: 9, fireEvery: 4, pierce: 1 },
    short: 'Heavy shot, pierces',
    text: 'Unit. 9 damage, fires every 2 beats. Pierce 1.',
    flavor: 'Felt more than heard.',
  },

  // ---- Gates ----
  {
    id: 'double-stop',
    name: 'Double Stop',
    type: 'gate',
    cost: 2,
    rarity: 'starter',
    keywords: [],
    gate: { kind: 'copy', amount: 2, durability: 40 },
    short: 'Doubles shots',
    text: 'Gate. Each shot through it becomes 2. Lasts 40 shots.',
    flavor: 'Two strings, one bow, twice the trouble.',
  },
  {
    id: 'distortion',
    name: 'Overdrive',
    type: 'gate',
    cost: 2,
    rarity: 'starter',
    keywords: [],
    gate: { kind: 'damage', amount: 5, durability: 40 },
    short: '+5 per shot',
    text: 'Gate. +5 damage to each shot through it. Lasts 40 shots.',
    flavor: 'Gets through armor. Gets through walls.',
  },
  {
    id: 'fuzz',
    name: 'Fuzz Box',
    type: 'gate',
    cost: 3,
    rarity: 'common',
    keywords: ['splash'],
    gate: { kind: 'splash', amount: 1, durability: 30 },
    short: 'Shots splash',
    text: 'Gate. Shots through it gain Splash (half damage to nearby enemies). Lasts 30 shots.',
    flavor: 'Sounds like a swarm. Fixes swarms.',
  },

  // ---- Riffs ----
  {
    id: 'power-chord',
    name: 'Power Chord',
    type: 'riff',
    cost: 2,
    rarity: 'starter',
    keywords: [],
    onPlay: [{ do: 'damageFront', amount: 30 }],
    short: 'Big hit, front enemy',
    text: 'Riff. Deal 30 to the enemy closest to the stage in this lane.',
    flavor: 'Root, fifth, regret.',
  },
  {
    id: 'feedback-loop',
    name: 'Feedback Loop',
    type: 'riff',
    cost: 1,
    rarity: 'starter',
    keywords: ['feedback'],
    onPlay: [
      { do: 'damageLane', amount: 12 },
      { do: 'loseCrowd', amount: 1 },
    ],
    short: 'Hits whole lane',
    text: 'Riff. Deal 12 to every enemy in this lane. Feedback: lose 1 crowd.',
    flavor: 'The crowd covers its ears. So do the zombies.',
  },
  {
    id: 'snare-roll',
    name: 'Snare Roll',
    type: 'riff',
    cost: 1,
    rarity: 'starter',
    headliner: 'thrum',
    keywords: ['echo'],
    onPlay: [{ do: 'volley', scope: 'lane', shots: 2 }],
    echo: true,
    short: 'Lane fires, twice',
    text: 'Riff. Units in this lane fire 2 shots. Echo: happens again next beat.',
    flavor: 'Brrrrrrap.',
  },
  {
    id: 'paradiddle',
    name: 'Paradiddle',
    type: 'riff',
    cost: 1,
    rarity: 'starter',
    headliner: 'thrum',
    keywords: ['echo'],
    onPlay: [{ do: 'gainEnergy', amount: 1 }],
    echo: true,
    short: '+1 energy, twice',
    text: 'Riff. Gain 1 energy. Echo: happens again next beat.',
    flavor: 'R L R R. L R L L. Repeat until enlightened.',
  },
  {
    id: 'encore',
    name: 'Encore!',
    type: 'riff',
    cost: 2,
    rarity: 'common',
    keywords: ['encore'],
    onPlay: [
      {
        do: 'ifChain',
        min: 3,
        then: [
          { do: 'damageAll', amount: 15 },
          { do: 'draw', count: 1 },
        ],
        else: [{ do: 'draw', count: 1 }],
      },
    ],
    short: 'Draw. Chain 3+: hit all',
    text: 'Riff. Draw a card. Encore (chain 3+): also deal 15 to every enemy.',
    flavor: 'One more song!',
  },

  // ---- Amps ----
  {
    id: 'blast-beat',
    name: 'Blast Beat',
    type: 'amp',
    cost: 4,
    rarity: 'rare',
    headliner: 'thrum',
    keywords: [],
    triggers: [{ when: 'chainGrow', link: false, effects: [{ do: 'volley', scope: 'all', shots: 1 }] }],
    short: 'Chains fire all units',
    text: 'Amp. Whenever the chain grows, every unit fires a shot.',
    flavor: 'Tempo: yes.',
  },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

/** Encore starter deck: 12 cards. */
export const STARTER_DECK: readonly string[] = [
  'stagehand',
  'stagehand',
  'kick-drum',
  'kick-drum',
  'bassline',
  'double-stop',
  'double-stop',
  'distortion',
  'power-chord',
  'snare-roll',
  'paradiddle',
  'feedback-loop',
];

/** Cards that can show up in Encore card picks. */
export const PICK_POOL: readonly string[] = CARDS.map((c) => c.id);
