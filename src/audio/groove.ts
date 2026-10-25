import type { EngineState } from '../engine';
import type { Synth } from './synth';

/**
 * The adaptive groove: the board is the band. Every unit is an instrument that
 * plays exactly when it fires, gates color their lane's sound, lanes are
 * panned left/center/right, and the chain brings in extra layers.
 */

/** I – vi – IV – V in D, voiced a bit wistful: Dmaj7, Bm7, Gmaj7, A6. One chord per bar. */
const CHORDS = [
  { root: 38, notes: [62, 66, 69, 73] },
  { root: 35, notes: [59, 62, 66, 69] },
  { root: 31, notes: [55, 59, 62, 66] },
  { root: 33, notes: [57, 61, 64, 66] },
] as const;

export function chordAt(beat: number) {
  const bar = Math.floor(beat / 4);
  return CHORDS[((bar % 4) + 4) % 4]!;
}

export interface BoardMix {
  /** One entry per unit type per lane; `count` units of it. */
  groups: { cardId: string; lane: number; count: number; fireEvery: number }[];
  lanes: { copy: boolean; drive: boolean; fuzz: boolean }[];
  blast: boolean;
  chain: number;
  /** Beat until which Fill is active. */
  fillUntil: number;
}

export function mixFrom(s: EngineState): BoardMix {
  const groups = new Map<string, BoardMix['groups'][number]>();
  for (const u of s.units) {
    const key = `${u.cardId}:${u.lane}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { cardId: u.cardId, lane: u.lane, count: 1, fireEvery: u.fireEvery });
  }
  const lanes = [0, 1, 2].map((lane) => {
    const kinds = s.gates.filter((g) => g.lane === lane).map((g) => g.kind);
    return { copy: kinds.includes('copy'), drive: kinds.includes('damage'), fuzz: kinds.includes('splash') };
  });
  return {
    groups: [...groups.values()].sort((a, b) => a.lane - b.lane || a.cardId.localeCompare(b.cardId)),
    lanes,
    blast: s.amps.some((a) => a.cardId === 'blast-beat'),
    chain: s.chain.links,
    fillUntil: s.headliner.activeUntilBeat,
  };
}

/** Schedule everything that plays on one eighth note at audio time `t`. */
export type MusicStyle = 'full' | 'chill';

/**
 * Schedule everything that plays on one eighth note at audio time `t`.
 * 'chill' keeps the same band but plays it sparser: no ghost notes, bursts,
 * flams or lead line, quarter-note hats, softer effects.
 */
export function scheduleGroove(synth: Synth, mix: BoardMix, eighth: number, t: number, eighthSec: number, style: MusicStyle = 'full'): void {
  const chill = style === 'chill';
  const beat = Math.floor(eighth / 2);
  const onBeat = eighth % 2 === 0;
  const inBar = ((beat % 4) + 4) % 4;
  const sixteenth = eighthSec / 2;
  const chord = chordAt(beat);
  const filling = beat < mix.fillUntil;
  const level = (count: number) => Math.min(1.25, 0.75 + 0.25 * (count - 1));

  mix.lanes.forEach((l, lane) => synth.setLaneFx(lane, { drive: l.drive ? (chill ? 0.25 : 0.55) : 0, fuzz: l.fuzz }, t));

  // Time-keeping: an empty stage is just a quarter-note hat and a kick on 1. It fills in as the band grows.
  if (chill) {
    if (onBeat) synth.hat(t, false);
  } else if (mix.blast) {
    synth.hat(t, onBeat);
    synth.hat(t + sixteenth, false);
  } else if (mix.chain >= 8) {
    synth.hat(t, onBeat, !onBeat);
  } else if (mix.groups.length > 0 || onBeat) {
    synth.hat(t, onBeat);
  }
  const hasKick = mix.groups.some((g) => g.cardId === 'kick-drum');
  if (!hasKick && onBeat && inBar === 0) synth.kick(t, 0.7);
  if (filling && (!chill || onBeat)) synth.snare(t, onBeat ? 0.8 : 0.55);

  // The band: each unit plays when it fires.
  for (const g of mix.groups) {
    const fires = filling || eighth % g.fireEvery === 0;
    if (!fires) continue;
    const dest = synth.lane(g.lane);
    const copy = mix.lanes[g.lane]?.copy ?? false;
    const v = level(g.count);
    switch (g.cardId) {
      case 'stagehand': {
        const backbeat = onBeat && (inBar === 1 || inBar === 3);
        if (chill && !backbeat) break;
        synth.snare(t, backbeat ? v : 0.3 * v, dest);
        if (copy && !chill) synth.snare(t + 0.028, (backbeat ? 0.5 : 0.18) * v, dest); // doubled: a flam
        break;
      }
      case 'kick-drum':
        synth.kick(t, v, dest);
        if (onBeat && inBar === 0 && !filling && !chill) {
          // Its downbeat burst, as a 16th-note pickup.
          synth.kick(t + sixteenth, 0.55 * v, dest);
          synth.kick(t + 2 * sixteenth, 0.65 * v, dest);
        }
        if (copy && !chill) synth.tom(t + sixteenth, 45, 0.5 * v, dest);
        break;
      case 'bassline': {
        const dur = (filling ? 1 : g.fireEvery) * eighthSec * 0.92;
        synth.bass(t, chord.root, dur, v, dest);
        if (copy && !chill) synth.bass(t, chord.root + 12, dur, 0.5 * v, dest);
        break;
      }
      default:
        synth.tom(t, 48, 0.7 * v, dest);
    }
  }

  // Chain layers: a pulsing chord at 4+ links, a lead arpeggio at 8+. They stop within a beat of the chain dropping.
  if (mix.chain >= 4 && onBeat) synth.pad(t, [...chord.notes], eighthSec * 2.05, (inBar === 0 ? 1.2 : 1) * (chill ? 0.7 : 1));
  if (mix.chain >= 8 && !chill) {
    for (let k = 0; k < 2; k++) {
      const idx = (eighth * 2 + k) % 8;
      const note = chord.notes[idx % 4]! + (idx >= 4 ? 12 : 0);
      synth.lead(t + k * sixteenth, note, sixteenth * 0.9, mix.chain >= 16 ? 1.3 : 1);
    }
  }
}

/** A riff card sounds when it resolves, in its lane. */
export function playRiff(synth: Synth, cardId: string, lane: number, beat: number, bpm: number, level = 1): void {
  const t = synth.ctx.currentTime;
  const sixteenth = 60 / bpm / 4;
  const chord = chordAt(beat);
  const dest = synth.lane(lane);
  switch (cardId) {
    case 'power-chord': {
      const r = chord.root + 24;
      synth.stab(t, [r, r + 7, r + 12], 0.45, level, dest);
      break;
    }
    case 'snare-roll':
      for (let i = 0; i < 4; i++) synth.snare(t + i * sixteenth, (0.45 + i * 0.12) * level, dest);
      break;
    case 'paradiddle':
      // R L R R on two toms.
      [52, 47, 52, 52].forEach((m, i) => synth.tom(t + i * sixteenth, m, 0.8 * level, dest));
      break;
    case 'feedback-loop':
      synth.squeal(lane);
      break;
    case 'encore':
      synth.crash(t);
      synth.stab(t, [...chord.notes], 0.6, 0.8 * level, dest);
      break;
    default:
      synth.stab(t, [chord.root + 24, chord.root + 31], 0.25, 0.7 * level, dest);
  }
}
