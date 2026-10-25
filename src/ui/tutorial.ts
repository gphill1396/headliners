import { createState, type EngineEvent, type EngineState, type Input } from '../engine';

/**
 * The soundcheck: a guided first run that teaches one idea per step and
 * waits for the player to do it. It runs on the real engine in 'tutorial'
 * mode (no waves, leaks cost nothing) and uses 'grant'/'spawn' inputs to set
 * up each step.
 */

/** Things the coach can point at. */
export type Target = 'pads' | 'lanes' | 'lane-0' | 'lane-1' | 'lane-2' | 'crowd' | 'energy' | 'chain' | 'fill' | `card:${string}`;

export interface Progress {
  /** Practice taps that landed Good or Tight. */
  hits: number;
  taps: number;
  /** Beats since the step started. */
  beats: number;
  kills: number;
  /** Cards that resolved during this step. */
  plays: number;
  /** Set when the player needs a nudge (e.g. a chain was dropped). */
  nudge: string | null;
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** What to highlight. Depends on whether a card is already selected. */
  targets: (selectedCardId: string | null) => Target[];
  /** Inputs to send when the step starts. */
  setup?: Input[];
  /** Lane taps with no card selected are practice taps (graded, no effect). */
  practiceTaps?: boolean;
  /** Advance with a button instead of an action. */
  button?: string;
  /** Advance when this returns true, checked after every engine tick. */
  done?: (events: EngineEvent[], state: EngineState, p: Progress) => boolean;
  /** Called after every tick; may return inputs to re-set up the step (e.g. hand out cards again). */
  retry?: (events: EngineEvent[], state: EngineState, p: Progress) => Input[] | null;
}

export function createTutorialState(relaxedTiming: boolean): EngineState {
  return createState({ seed: 'soundcheck', mode: 'tutorial', deck: [], relaxedTiming, bpm: 96 });
}

export function freshProgress(): Progress {
  return { hits: 0, taps: 0, beats: 0, kills: 0, plays: 0, nudge: null };
}

const has = (s: EngineState, cardId: string) => s.hand.some((c) => c.cardId === cardId) || s.queue.some((q) => q.card.cardId === cardId);

export const TUTORIAL: readonly TutorialStep[] = [
  {
    id: 'beat',
    title: 'This is the beat',
    body: 'The four lights count the bar; the wide amber one is beat one. Tap any lane button right as a light flashes.',
    targets: () => ['pads', 'lanes'],
    practiceTaps: true,
    done: (_e, _s, p) => p.hits >= 3 || p.taps >= 10,
  },
  {
    id: 'unit',
    title: 'Cards are your band',
    body: 'A shambler is walking down the middle lane. Tap the Stagehand card, then tap Mid on the beat.',
    targets: (sel) => (sel === 'stagehand' ? ['lane-1'] : ['card:stagehand']),
    setup: [
      { type: 'grant', cardIds: ['stagehand'], energy: 10 },
      { type: 'spawn', kind: 'shambler', lane: 1, travelBeats: 24 },
    ],
    done: (events) => events.some((e) => e.type === 'unitPlaced'),
    retry: (_e, s) => (!has(s, 'stagehand') && !s.units.length ? [{ type: 'grant', cardIds: ['stagehand'] }] : null),
  },
  {
    id: 'unit-watch',
    title: 'Units shoot up their lane',
    body: 'Your Stagehand stands on the stage and fires every beat. Watch it take down the shambler.',
    targets: () => [],
    done: (_e, _s, p) => p.kills >= 1 || p.beats >= 10,
  },
  {
    id: 'gate',
    title: 'Gates multiply your shots',
    body: 'Gates sit mid-lane and change every shot that passes through. Tap Double Stop, then tap Mid on the beat.',
    targets: (sel) => (sel === 'double-stop' ? ['lane-1'] : ['card:double-stop']),
    setup: [
      { type: 'grant', cardIds: ['double-stop'], energy: 10 },
      { type: 'spawn', kind: 'shambler', lane: 1, travelBeats: 20 },
    ],
    done: (events) => events.some((e) => e.type === 'gatePlaced'),
    retry: (_e, s) => (!has(s, 'double-stop') && !s.gates.length ? [{ type: 'grant', cardIds: ['double-stop'] }] : null),
  },
  {
    id: 'gate-watch',
    title: 'Twice the shots',
    body: 'Every shot through Double Stop becomes two. Gates wear out; the thin bar under a gate shows what’s left.',
    targets: () => [],
    setup: [{ type: 'spawn', kind: 'shambler', lane: 1, travelBeats: 16 }],
    done: (_e, _s, p) => p.kills >= 2 || p.beats >= 10,
  },
  {
    id: 'energy',
    title: 'Cards cost energy',
    body: 'The number in a card’s corner is its cost. You gain 1 energy every beat, up to 10. Dim cards cost more than you have.',
    targets: () => ['energy'],
    button: 'Got it',
  },
  {
    id: 'chain',
    title: 'Chain plays together',
    body: 'Cards played on back-to-back beats build a chain, and each link multiplies your damage. Play both Power Chords on two beats in a row, any lane.',
    targets: (sel) => (sel === 'power-chord' ? ['lanes', 'chain'] : ['card:power-chord', 'chain']),
    setup: [
      { type: 'grant', cardIds: ['power-chord', 'power-chord'], energy: 10 },
      { type: 'spawn', kind: 'brute', lane: 0, travelBeats: 30 },
      { type: 'spawn', kind: 'brute', lane: 2, travelBeats: 30 },
    ],
    done: (events) => events.some((e) => e.type === 'link' && e.links >= 2),
    retry: (events, s, p) => {
      if (p.plays > 0 && events.some((e) => e.type === 'chainEnd')) p.nudge = 'Too slow or off the beat, so the chain dropped. Play the next card on the very next beat.';
      if (!has(s, 'power-chord')) return [{ type: 'grant', cardIds: ['power-chord', 'power-chord'], energy: 10 }];
      return null;
    },
  },
  {
    id: 'crowd',
    title: 'Protect your crowd',
    body: 'Enemies walk toward the stage. Each one that gets there costs crowd, the red bar at the top. Lose all your crowd and the show is over.',
    targets: () => ['crowd'],
    button: 'Got it',
  },
  {
    id: 'fill',
    title: 'Thrum’s Fill',
    body: 'Your headliner, Thrum the drum drake, has Fill: for 2 beats every unit goes rapid-fire. Save it for a crowded lane. And stay in time: off-beat plays break your chain.',
    targets: () => ['fill'],
    button: 'Start the show',
  },
];
