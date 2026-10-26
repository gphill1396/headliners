import type { Grade } from './clock';
import type { TourNodeKind } from './state';
import type { EnemyKind, EvolutionId, HeadlinerId } from './types';

/** What happened during a tick, for rendering, audio and haptics. Never fed back into the engine. */
/** Why crowd came back: a clean wave, a 10-link sing-along, a card, Riot's passive, a beaten boss, or a Tour stop. */
export type CrowdGainReason = 'clean' | 'singalong' | 'card' | 'riot' | 'boss' | 'tour';

export type EngineEvent =
  | { type: 'beat'; beat: number; beatInBar: number; downbeat: boolean }
  | { type: 'graded'; id: number; iid: number; cardId: string; lane: number; grade: Grade; offsetMilli: number; accuracyPct: number; resolveBeat: number }
  /** The pocket got deeper or shallower. */
  | { type: 'pocket'; depth: number; delta: number }
  | { type: 'rejected'; iid: number; reason: RejectReason }
  /** A practice tap (no card): graded, nothing else happens. */
  | { type: 'tapped'; lane: number; grade: Grade; offsetMilli: number }
  | { type: 'resolved'; id: number; cardId: string; lane: number; grade: Grade; beat: number; isEcho: boolean }
  | { type: 'link'; links: number; multPct: number; cardId: string; label: string; lane: number }
    /** `dropped`: an off-beat play broke it. `songEnd`: the wave (song) ended and the chain was banked. */
  | { type: 'chainEnd'; links: number; dropped: boolean; songEnd?: boolean }
  | { type: 'showstopper'; links: number; damage: number }
  | { type: 'unitPlaced'; unitId: number; cardId: string; lane: number; slot: number; replacedId: number | null }
  | { type: 'gatePlaced'; gateId: number; cardId: string; lane: number; slot: number; replacedId: number | null }
  | { type: 'gateBroken'; gateId: number; lane: number; slot: number }
  /** A token (Roadie) left the stage. */
  | { type: 'unitExpired'; unitId: number; cardId: string; lane: number; slot: number }
  | { type: 'gatesRepaired'; lane: number; amount: number }
  | { type: 'damage'; lane: number; depth: number; amount: number }
  | { type: 'killed'; enemyId: number; kind: EnemyKind; lane: number; depth: number }
  | { type: 'leaked'; enemyId: number; kind: EnemyKind; lane: number; crowdDamage: number; hatchedBy?: EnemyKind }
  /** A Medic patched up its lane. */
  | { type: 'healed'; lane: number; depth: number; amount: number }
  /** A Nest hatched Swarmlings. */
  | { type: 'hatched'; lane: number; depth: number; count: number }
  /** A Feedback card's price: crowd lost on purpose, not to a leak. */
  | { type: 'crowdCost'; amount: number; lane: number; cardId: string }
  | { type: 'energy'; amount: number; reason: 'tight' | 'card' }
  | { type: 'drew'; count: number }
  /** A card was discard-cycled for a fresh one. */
  | { type: 'cycled'; iid: number; cardId: string }
  /** `debut`: enemy kinds appearing for the first time this run. */
  | { type: 'waveStart'; index: number; kinds: EnemyKind[]; debut?: EnemyKind[]; boss?: boolean; bossKind?: EnemyKind }
  /** The Hush moved to a new phase. */
  | { type: 'bossPhase'; phase: 1 | 2 | 3; boss: EnemyKind }
  /** The Hush is gone: beaten (crowd won back) or it reached the stage. */
  | { type: 'bossEnd'; boss: EnemyKind; defeated: boolean; crowd: number }
  /** A Splitter burst into pieces. */
  | { type: 'split'; lane: number; depth: number; count: number }
  /** A Breaker hit a gate. */
  | { type: 'gateSmashed'; gateId: number; lane: number; slot: number; amount: number }
  /** A Shieldbearer blocked a shot. At most one per Shieldbearer per beat, for the pop. */
  | { type: 'blocked'; enemyId: number; lane: number; depth: number; broke: boolean }
  | { type: 'pickOffered'; options: string[] }
  /** Tour: you arrived at a stop on the map. */
  | { type: 'tourStop'; kind: TourNodeKind; act: number; row: number }
  /** Tour: a fight, elite or boss is won. */
  | { type: 'fightWon'; kind: 'fight' | 'elite' | 'boss'; merch: number }
  | { type: 'actStart'; act: number }
  | { type: 'tourWon'; merch: number; cleared: number }
  /** Tour: crowd changed outside a fight (rest, shop, event). */
  /** Crowd won back, and why (shown as a green pop). */
  | { type: 'crowdGain'; amount: number; reason: CrowdGainReason }
  /** Your headliner is ready to evolve: choose one of its two evolutions. */
  | { type: 'evolveOffered' }
  | { type: 'evolved'; headliner: HeadlinerId; evolution: EvolutionId }
  | { type: 'picked'; cardId: string | null }
  /** A headliner's active ability went off. (Named 'fill' after Thrum's, the first one.) */
  | { type: 'fill'; untilBeat: number; headliner: HeadlinerId; grade?: Grade }
  | { type: 'gameOver'; wave: number; score: number };

export type RejectReason = 'not-in-hand' | 'energy' | 'lane' | 'not-playing' | 'cooldown' | 'cycled';
