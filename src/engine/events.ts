import type { Grade } from './clock';
import type { EnemyKind } from './types';

/** What happened during a tick, for rendering, audio and haptics. Never fed back into the engine. */
export type EngineEvent =
  | { type: 'beat'; beat: number; beatInBar: number; downbeat: boolean }
  | { type: 'graded'; id: number; iid: number; cardId: string; lane: number; grade: Grade; offsetMilli: number; resolveBeat: number }
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
  | { type: 'damage'; lane: number; depth: number; amount: number }
  | { type: 'killed'; enemyId: number; kind: EnemyKind; lane: number; depth: number }
  | { type: 'leaked'; enemyId: number; kind: EnemyKind; lane: number; crowdDamage: number }
  | { type: 'energy'; amount: number; reason: 'tight' | 'card' }
  | { type: 'drew'; count: number }
  | { type: 'waveStart'; index: number; kinds: EnemyKind[] }
  | { type: 'pickOffered'; options: string[] }
  | { type: 'picked'; cardId: string | null }
  | { type: 'fill'; untilBeat: number }
  | { type: 'gameOver'; wave: number; score: number };

export type RejectReason = 'not-in-hand' | 'energy' | 'lane' | 'not-playing' | 'cooldown';
