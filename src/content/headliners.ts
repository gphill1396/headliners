import type { HeadlinerDef, HeadlinerId } from '../engine/types';

/** SPEC §4.7. Phase 1b: pick one headliner per run. Evolutions are previews until later in 1b. */
export const HEADLINERS: Record<HeadlinerId, HeadlinerDef> = {
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
    sound: 'Drums: kick, snare, toms.',
    style: 'Rhythm. Keep chains going and hit the beat for energy.',
  },
  lyra: {
    id: 'lyra',
    name: 'Lyra',
    title: 'the serpent bard',
    passive: 'Every gate a shot passes through adds +1 damage.',
    active: {
      name: 'Swell',
      text: 'For 2 beats, every gate works twice as hard: one more copy, double damage, one more pierce.',
      cooldownBeats: 16,
      durationBeats: 2,
    },
    evolutions: [
      { name: 'Crescendo', text: 'Gates grow stronger the more shots pass through them.' },
      { name: 'Harmony', text: 'Two gates in the same lane combine their effects.' },
    ],
    sound: 'Keys: electric piano and shimmering arpeggios.',
    style: 'Multipliers. Stack gates, feed them shots, watch the numbers climb.',
  },
  clatter: {
    id: 'clatter',
    name: 'Clatter',
    title: 'the kobold road crew',
    passive: 'A Tight hit calls a Roadie to that lane (once per bar).',
    active: {
      name: 'All Hands',
      text: 'Put a Roadie on stage in every lane.',
      cooldownBeats: 16,
      durationBeats: 0,
    },
    evolutions: [
      { name: 'Load Out', text: 'When a Roadie leaves, a Riff card comes back to your hand.' },
      { name: 'Mosh Pit', text: 'Roadies gain Splash once you have 6 or more.' },
    ],
    sound: 'Junkyard percussion: cowbell, clanks, shakers.',
    style: 'Swarm. Flood the stage with Roadies and keep them busy.',
  },
};
