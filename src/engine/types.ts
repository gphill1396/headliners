/**
 * Content vocabulary (SPEC §4.4–4.8, §6).
 *
 * Cards are data: a type, stats, and lists of small effects and triggers.
 * New cards should be built by combining these parts; add a new Effect kind
 * only when no combination expresses the idea.
 */

export type CardType = 'unit' | 'gate' | 'riff' | 'amp';

export type Keyword = 'pierce' | 'splash' | 'echo' | 'downbeat' | 'encore' | 'feedback' | 'antiAir';

export type HeadlinerId = 'thrum' | 'lyra' | 'clatter';

export type Rarity = 'starter' | 'common' | 'rare';

export type Scope = 'lane' | 'all';

/** One step of something a card or trigger does. Amounts are base values before grade and chain multipliers. */
export type Effect =
  /** Hit the enemy closest to the stage in the lane. */
  | { do: 'damageFront'; amount: number }
  /** Hit every enemy in the lane. */
  | { do: 'damageLane'; amount: number }
  /** Hit every enemy on the field. */
  | { do: 'damageAll'; amount: number }
  /** Every unit in the lane (or everywhere) fires extra shots right now. */
  | { do: 'volley'; scope: Scope; shots: number }
  /** The unit that owns this trigger fires extra shots. */
  | { do: 'selfFire'; shots: number }
  | { do: 'gainEnergy'; amount: number }
  | { do: 'draw'; count: number }
  /** Feedback cost: lose crowd. */
  | { do: 'loseCrowd'; amount: number }
  /** Encore-style condition on the current chain length. */
  | { do: 'ifChain'; min: number; then: Effect[]; else?: Effect[] };

export type TriggerWhen =
  /** Each beat 1 of the bar. */
  | 'downbeat'
  /** Each time the chain gains a link. */
  | 'chainGrow';

export interface Trigger {
  when: TriggerWhen;
  /** Whether this trigger firing adds a chain link. Triggers on 'chainGrow' must not link (that would loop). */
  link: boolean;
  effects: Effect[];
}

export interface UnitStats {
  damage: number;
  /** Fires every N eighth notes (2 = every beat). */
  fireEvery: number;
  pierce?: number;
  splash?: boolean;
  antiAir?: boolean;
}

export type GateKind =
  /** Each projectile becomes `amount` projectiles. */
  | 'copy'
  /** +amount damage per projectile. */
  | 'damage'
  /** Projectiles gain Splash. */
  | 'splash'
  /** +amount Pierce. */
  | 'pierce';

export interface GateStats {
  kind: GateKind;
  amount: number;
  /** Projectiles it can modify before it breaks. */
  durability: number;
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  rarity: Rarity;
  headliner?: HeadlinerId;
  keywords: Keyword[];
  unit?: UnitStats;
  gate?: GateStats;
  /** Effects when the card resolves. */
  onPlay?: Effect[];
  /** Ongoing triggers while the card is on the field (units and amps). */
  triggers?: Trigger[];
  /** Echo: onPlay happens again on the next beat. */
  echo?: boolean;
  /** Full rules text. */
  text: string;
  /** A few words shown on the card in hand: what it does at a glance. */
  short: string;
  flavor: string;
}

export type EnemyKind = 'shambler' | 'brute' | 'swarmling';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  trait: string;
  hp: number;
  /** Damage removed from every hit (min 0). */
  armor: number;
  /** Beats to walk from the top of the field to the stage. */
  travelBeats: number;
  crowdDamage: number;
  /** How many spawn together. */
  packSize: number;
}

export interface HeadlinerDef {
  id: HeadlinerId;
  name: string;
  title: string;
  passive: string;
  active: { name: string; text: string; cooldownBeats: number; durationBeats: number };
  evolutions: [{ name: string; text: string }, { name: string; text: string }];
}
