/**
 * Content vocabulary (SPEC §4.4–4.8, §6).
 *
 * Cards are data: a type, stats, and lists of small effects and triggers.
 * New cards should be built by combining these parts; add a new Effect kind
 * only when no combination expresses the idea.
 */

export type CardType = 'unit' | 'gate' | 'riff' | 'amp';

export type Keyword = 'pierce' | 'splash' | 'echo' | 'downbeat' | 'encore' | 'feedback' | 'antiAir' | 'roadie' | 'shred' | 'priority' | 'speaker' | 'volume';

export type HeadlinerId = 'thrum' | 'lyra' | 'clatter';

/** 'token': created by other cards (e.g. Roadies), never drawn or offered. */
export type Rarity = 'starter' | 'common' | 'rare' | 'token';

export type Scope = 'lane' | 'all';

/** One step of something a card or trigger does. Amounts are base values before grade and chain multipliers. */
export type Effect =
  /** Hit the enemy closest to the stage in the lane. `prefer: 'priority'`: a Breaker, Hexer or boss in the lane if there is one. */
  | { do: 'damageFront'; amount: number; prefer?: 'priority' }
  /** Hit every enemy in the lane. */
  | { do: 'damageLane'; amount: number }
  /** Hit every enemy on the field (`only: 'flying'`: just flyers). */
  | { do: 'damageAll'; amount: number; only?: 'flying' }
  /** Every unit in the lane (or everywhere) fires extra shots right now. `tokensOnly`: just Roadies and other tokens. */
  | { do: 'volley'; scope: Scope; shots: number; tokensOnly?: boolean }
  /** Put Roadie tokens on stage in this lane, or in every lane (Clatter). */
  | { do: 'roadie'; count: number; scope?: Scope }
  /** Volume: the unit that owns this trigger gains +amount damage for good (up to 20 times). */
  | { do: 'volume'; amount: number }
  /** Downbeat bonus: different effects if this resolves on beat 1. */
  | { do: 'ifDownbeat'; then: Effect[]; else?: Effect[] }
  /** Restore durability to gates in the lane or everywhere (Lyra). */
  | { do: 'repairGates'; scope: Scope; amount: number }
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
  /** Priority: shots fly past other enemies to hit priority targets (Breakers, Hexers) first. */
  priority?: boolean;
  /** Tokens leave the stage after this many beats. */
  lifespanBeats?: number;
}

export type GateKind =
  /** Each projectile becomes `amount` projectiles. */
  | 'copy'
  /** +amount damage per projectile. */
  | 'damage'
  /** Projectiles gain Splash. */
  | 'splash'
  /** +amount Pierce. */
  | 'pierce'
  /** Shots ignore armor and pry past shields. */
  | 'shred'
  /** Shots gain Anti-Air. */
  | 'lift'
  /** A speaker: shots turn into the next lane over (from the middle, alternating left and right). */
  | 'aim';

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

export type EnemyKind = 'shambler' | 'brute' | 'swarmling' | 'bat' | 'splitter' | 'shieldbearer' | 'hexer' | 'breaker' | 'hush';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  trait: string;
  /** One short line for the banner when it first shows up. */
  tip: string;
  hp: number;
  /** Damage removed from every hit (min 0). */
  armor: number;
  /** Beats to walk from the top of the field to the stage. */
  travelBeats: number;
  crowdDamage: number;
  /** How many spawn together. */
  packSize: number;
  /** Flying: only Anti-Air shots (and riffs) can hit it. */
  flying?: boolean;
  /** Splits into `count` smaller copies when it dies, each with `hpPct`% of its max health, unless overkill reaches `overkillPct`% of max health. */
  splits?: { count: number; hpPct: number; overkillPct: number };
  /** Blocks shots fired straight up its lane until it has blocked this many. Pierce shots and shots from the side get through. */
  shieldHits?: number;
  /** Cards that answer this enemy. A card pick before it shows up offers one if your deck has none. */
  answers?: string[];
  /** Disables every gate ahead of it in its lane within this distance. */
  hexRange?: number;
  /** Stops at each gate in its lane and smashes this much durability off it every beat. */
  smashPerBeat?: number;
  /** Priority targets for units with the Priority keyword. */
  priority?: boolean;
  /** A boss: spawned by its own rule, never in a normal wave mix. */
  boss?: boolean;
  /** Spans every lane: shots and riffs from any lane can hit it. */
  wide?: boolean;
}

export type EvolutionId = 'metronome' | 'polyrhythm' | 'crescendo' | 'harmony' | 'load-out' | 'mosh-pit';

export interface EvolutionDef {
  id: EvolutionId;
  name: string;
  text: string;
}

export interface HeadlinerDef {
  id: HeadlinerId;
  name: string;
  title: string;
  passive: string;
  active: { name: string; text: string; cooldownBeats: number; durationBeats: number };
  /** The band's sound, shown on the select screen. */
  sound: string;
  /** One line on how this headliner plays. */
  style: string;
  evolutions: [EvolutionDef, EvolutionDef];
}
