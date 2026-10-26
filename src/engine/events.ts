import type { Grade } from './clock';
import type { EnemyKind, EvolutionId, HeadlinerId } from './types';

/** What happened during a tick, for rendering, audio and haptics. Never fed back into the engine. */
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
  | { type: 'leaked'; enemyId: number; kind: EnemyKind; lane: number; crowdDamage: number }
  | { type: 'energy'; amount: number; reason: 'tight' | 'card' }
  | { type: 'drew'; count: number }
  /** `debut`: enemy kinds appearing for the first time this run. */
  | { type: 'waveStart'; index: number; kinds: EnemyKind[]; debut?: EnemyKind[]; boss?: boolean }
  /** The Hush moved to a new phase. */
  | { type: 'bossPhase'; phase: 1 | 2 | 3 }
  /** The Hush is gone: beaten (crowd won back) or it reached the stage. */
  | { type: 'bossEnd'; defeated: boolean; crowd: number }
  /** A Splitter burst into pieces. */
  | { type: 'split'; lane: number; depth: number; count: number }
  /** A Breaker hit a gate. */
  | { type: 'gateSmashed'; gateId: number; lane: number; slot: number; amount: number }
  /** A Shieldbearer blocked a shot. At most one per Shieldbearer per beat, for the pop. */
  | { type: 'blocked'; enemyId: number; lane: number; depth: number; broke: boolean }
  | { type: 'pickOffered'; options: string[] }
  /** Your headliner is ready to evolve: choose one of its two evolutions. */
  | { type: 'evolveOffered' }
  | { type: 'evolved'; headliner: HeadlinerId; evolution: EvolutionId }
  | { type: 'picked'; cardId: string | null }
  /** A headliner's active ability went off. (Named 'fill' after Thrum's, the first one.) */
  | { type: 'fill'; untilBeat: number; headliner: HeadlinerId }
  | { type: 'gameOver'; wave: number; score: number };

export type RejectReason = 'not-in-hand' | 'energy' | 'lane' | 'not-playing' | 'cooldown';
