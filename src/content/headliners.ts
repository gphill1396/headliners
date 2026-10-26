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
      { id: 'metronome', name: 'Metronome', text: 'Timing windows are 30% wider, and a Tight play keeps your chain alive one extra beat.' },
      { id: 'polyrhythm', name: 'Polyrhythm', text: 'Play an Echo card in a different lane from the beat before, and it echoes twice.' },
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
      { id: 'crescendo', name: 'Crescendo', text: 'Gates grow stronger the more shots pass through: +5% damage per 10 shots, up to double.' },
      { id: 'harmony', name: 'Harmony', text: 'Two gates in the same lane harmonize: both work as if Swelled, all the time.' },
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
      { id: 'load-out', name: 'Load Out', text: 'When a Roadie leaves, a Riff from your discard pile comes back to your hand (once per beat).' },
      { id: 'mosh-pit', name: 'Mosh Pit', text: 'With 5 or more Roadies on stage, their shots Splash.' },
    ],
    sound: 'Junkyard percussion: cowbell, clanks, shakers.',
    style: 'Swarm. Flood the stage with Roadies and keep them busy.',
  },
  aria: {
    id: 'aria',
    name: 'Aria',
    title: 'the siren',
    passive: 'Her Tight riffs slow the enemies in their lane to half speed for 2 beats.',
    active: {
      name: 'Hold',
      text: 'For 2 beats, every enemy stops where it is.',
      cooldownBeats: 16,
      durationBeats: 2,
    },
    evolutions: [
      { id: 'long-note', name: 'Long Note', text: 'Hold lasts twice as long.' },
      { id: 'banshee', name: 'Banshee', text: 'Slowed enemies take 50% more damage.' },
    ],
    sound: 'Voices: oohs, aahs and one long held note.',
    style: 'Control. Slow the horde down, hold it still, and win the crowd back.',
  },
  riot: {
    id: 'riot',
    name: 'Riot',
    title: 'the punk drake',
    passive: 'While your chain is 3 or longer, every 8 kills win back 1 crowd.',
    active: {
      name: 'Riot',
      text: 'For 2 beats, all your damage is doubled.',
      cooldownBeats: 16,
      durationBeats: 2,
    },
    evolutions: [
      { id: 'anarchy', name: 'Anarchy', text: 'Feedback costs no crowd while your chain is 5 or longer.' },
      { id: 'comeback', name: 'Comeback', text: '+3% damage for every point of crowd you are missing, up to +60%.' },
    ],
    sound: 'Punk guitar: fuzzed power chords and crash cymbals.',
    style: 'Aggression. Spend crowd on huge hits, then earn it back by clearing the horde.',
  },
};
