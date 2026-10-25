import type { HeadlinerDef, HeadlinerId } from '../engine/types';

/** SPEC §4.7. Only Thrum is playable in Phase 1a; evolutions are previews until 1b. */
export const HEADLINERS: Partial<Record<HeadlinerId, HeadlinerDef>> = {
  thrum: {
    id: 'thrum',
    name: 'Thrum',
    title: 'the drum drake',
    passive: 'Tight hits give +1 energy (once per bar).',
    active: {
      name: 'Fill',
      text: 'For 2 beats, every unit fires on every eighth note.',
      cooldownBeats: 16,
      durationBeats: 2,
    },
    evolutions: [
      { name: 'Metronome', text: 'Timing windows widen, and every Tight extends the chain.' },
      { name: 'Polyrhythm', text: 'Alternating lanes on consecutive beats doubles Echo.' },
    ],
  },
};
