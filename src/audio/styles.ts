import type { HeadlinerId } from '../engine';
import type { Synth } from './synth';

/**
 * Song styles (S4.7): each headliner's band plays its own kind of tune.
 *
 * - Thrum:   a war-drum march. D minor, straight, tabor on 2 and 4, a roll into every other bar.
 * - Lyra:    a lute ballad. D dorian, gentle, the lute rippling up the chord.
 * - Clatter: a workshop jig. G major, swung hard, a shaker and the hurdy-gurdy's drone.
 * - Aria:    a sea-shanty lament. A minor, a sway, stomp-stomp-clap and a sung "ooh".
 * - Riot:    a bagpipe reel. D mixolydian, driving eighths, the pipes' drone and a crash.
 *
 * A Tour band blends them: the lead's style sets the chords, the swing and the
 * time-keeping, and every member's signature part plays (the others' a little softer).
 */

export interface Chord {
  root: number;
  notes: readonly number[];
}

/** A chord from a bass root (MIDI) and its tones as semitones above the root, voiced two octaves up. */
function chord(root: number, tones: number[]): Chord {
  return { root, notes: tones.map((t) => root + 24 + t) };
}

const MIN7 = [0, 3, 7, 10];
const MAJ = [0, 4, 7, 12];
const MAJ7 = [0, 4, 7, 11];
const MIN = [0, 3, 7, 12];
const DOM7 = [0, 4, 7, 10];
const SUS = [0, 5, 7, 12];

export interface StyleCtx {
  t: number;
  onBeat: boolean;
  inBar: number;
  bar: number;
  eighth: number;
  sixteenth: number;
  eighthSec: number;
  chord: Chord;
  chill: boolean;
  /** The chain is long (8+): time-keeping doubles up. */
  hot: boolean;
}

export interface SongStyle {
  name: string;
  /** One chord per bar, four bars round. */
  chords: readonly Chord[];
  /** How far the off-beat eighths lean late, as a fraction of an eighth (0 = straight, 0.33 = a jig). */
  swing: number;
  /** The time-keeping, when this headliner leads. */
  keeper: (s: Synth, c: StyleCtx) => void;
  /** This headliner's own part; `level` is lower when they're not the lead. */
  signature: (s: Synth, c: StyleCtx, level: number) => void;
}

export const STYLES: Record<HeadlinerId, SongStyle> = {
  thrum: {
    name: 'War march',
    // i – VI – VII – i in D minor.
    chords: [chord(38, MIN7), chord(34, MAJ7), chord(36, MAJ), chord(38, MIN)],
    swing: 0,
    keeper: (s, c) => {
      if (c.onBeat && (c.inBar === 1 || c.inBar === 3)) s.snare(c.t, c.chill ? 0.25 : 0.35);
      if (c.onBeat && c.inBar === 2 && !c.chill) s.boom(c.t, 0.45);
      if (c.hot && !c.onBeat) s.snare(c.t, 0.18);
    },
    signature: (s, c, level) => {
      // A tabor roll into every other bar.
      if (!c.chill && c.bar % 2 === 1 && c.inBar === 3 && !c.onBeat) {
        for (let i = 0; i < 2; i++) s.snare(c.t + i * c.sixteenth, (0.2 + i * 0.1) * level);
      }
    },
  },
  lyra: {
    name: 'Lute ballad',
    // i – IV – i – v in D dorian.
    chords: [chord(38, MIN7), chord(43, MAJ), chord(38, MIN7), chord(45, MIN7)],
    swing: 0,
    keeper: (s, c) => {
      if (c.onBeat && (c.inBar === 1 || c.inBar === 3)) s.jingle(c.t, false);
      if (c.hot && !c.onBeat) s.jingle(c.t, false);
    },
    signature: (s, c, level) => {
      if (c.onBeat && c.inBar === 0) s.keys(c.t, c.chord.root + 24, c.eighthSec * 3, (c.chill ? 0.5 : 0.7) * level);
      // The lute ripples up the chord on beat 3.
      if (!c.chill && c.onBeat && c.inBar === 2) {
        for (let i = 0; i < 3; i++) s.keys(c.t + i * c.sixteenth, c.chord.notes[i + 1]!, c.eighthSec, 0.35 * level);
      }
    },
  },
  clatter: {
    name: 'Workshop jig',
    // I – IV – V – I in G major.
    chords: [chord(43, MAJ), chord(36, MAJ), chord(38, DOM7), chord(43, MAJ7)],
    swing: 0.33,
    keeper: (s, c) => {
      if (c.chill && !c.onBeat) return;
      s.shaker(c.t, c.onBeat ? 1 : 0.65);
    },
    signature: (s, c, level) => {
      if (c.onBeat && c.inBar === 0) s.drone(c.t, c.eighthSec * 7.6, (c.chill ? 0.45 : 0.7) * level, undefined, true);
      // A spanner on the last off-beat of the bar.
      if (!c.chill && !c.onBeat && c.inBar === 3) s.clank(c.t, 0.35 * level, undefined, 1.3);
    },
  },
  aria: {
    name: 'Sea-shanty lament',
    // i – iv – V – i in A minor.
    chords: [chord(33, MIN), chord(38, MIN7), chord(40, SUS), chord(33, MIN7)],
    swing: 0.15,
    keeper: (s, c) => {
      if (!c.onBeat) {
        if (c.hot) s.jingle(c.t, false);
        return;
      }
      // Stomp, stomp, clap.
      if (c.inBar === 0 || c.inBar === 1) s.boom(c.t, c.chill ? 0.3 : 0.42);
      if (c.inBar === 2) s.snare(c.t, c.chill ? 0.3 : 0.45);
    },
    signature: (s, c, level) => {
      if (c.onBeat && c.inBar === 0) s.voice(c.t, c.chord.root + 24, c.eighthSec * 7, (c.chill ? 0.4 : 0.6) * level);
    },
  },
  riot: {
    name: 'Bagpipe reel',
    // I – ♭VII – I – IV in D mixolydian.
    chords: [chord(38, MAJ), chord(36, MAJ), chord(38, MAJ), chord(43, MAJ)],
    swing: 0,
    keeper: (s, c) => {
      if (c.chill && !c.onBeat) return;
      s.jingle(c.t, c.onBeat);
    },
    signature: (s, c, level) => {
      if (c.onBeat && c.inBar === 0) {
        s.drone(c.t, c.eighthSec * 7.9, (c.chill ? 0.5 : 0.8) * level);
        if (c.bar % 2 === 0 && !c.chill && level >= 1) s.crash(c.t);
      }
    },
  },
};

export function styleOf(lead: HeadlinerId | undefined): SongStyle {
  return STYLES[lead ?? 'thrum'];
}

export function chordIn(style: SongStyle, beat: number): Chord {
  const bar = Math.floor(beat / 4);
  return style.chords[((bar % 4) + 4) % 4]!;
}
