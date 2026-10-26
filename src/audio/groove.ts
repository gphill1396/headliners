import type { EngineState, HeadlinerId } from '../engine';
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
  lanes: { copy: boolean; drive: boolean; fuzz: boolean; aim?: -1 | 0 | 1 | null }[];
  blast: boolean;
  chain: number;
  /** Beat until which Fill (Thrum) is active. */
  fillUntil: number;
  /** Whose band this is: sets the time-keeping voices. Defaults to Thrum. */
  headliner?: HeadlinerId;
  /** Beat until which Swell (Lyra) is active. */
  swellUntil?: number;
  /** The Hush, phase 2: the beat is muted. Drums drop out; only a quiet chord remains. */
  hushed?: boolean;
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
    const aim: -1 | 0 | 1 | null = !kinds.includes('aim') ? null : lane === 0 ? 1 : lane === 2 ? -1 : 0;
    return { copy: kinds.includes('copy'), drive: kinds.includes('damage'), fuzz: kinds.includes('splash'), aim };
  });
  return {
    groups: [...groups.values()].sort((a, b) => a.lane - b.lane || a.cardId.localeCompare(b.cardId)),
    lanes,
    blast: s.amps.some((a) => a.cardId === 'blast-beat'),
    chain: s.chain.links,
    fillUntil: s.headliner.id === 'thrum' ? s.headliner.activeUntilBeat : -1,
    headliner: s.headliner.id,
    swellUntil: s.headliner.id === 'lyra' ? s.headliner.activeUntilBeat : -1,
    hushed: s.boss?.phase === 2,
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

  mix.lanes.forEach((l, lane) => synth.setLaneFx(lane, { drive: l.drive ? (chill ? 0.25 : 0.55) : 0, fuzz: l.fuzz, aim: l.aim ?? null }, t));

  // Hushed: no drums, no band. Just a soft held chord each bar, so you have to keep the beat yourself.
  if (mix.hushed) {
    if (onBeat && inBar === 0) synth.pad(t, [...chord.notes], eighthSec * 7.5, 0.6);
    return;
  }

  // Time-keeping: an empty stage is just a quarter-note hat and a kick on 1. It fills in as the band grows.
  // Clatter's crew keeps time on a shaker instead of a hi-hat.
  const shaker = mix.headliner === 'clatter';
  const tick = (at: number, accent: boolean, open = false) => (shaker ? synth.shaker(at, accent ? 1 : 0.7) : synth.hat(at, accent, open));
  if (chill) {
    if (onBeat) tick(t, false);
  } else if (mix.blast) {
    tick(t, onBeat);
    tick(t + sixteenth, false);
  } else if (mix.chain >= 8) {
    tick(t, onBeat, !onBeat);
  } else if (mix.groups.length > 0 || onBeat) {
    tick(t, onBeat);
  }
  // Aria's band: a soft "ooh" on the chord root every bar. Riot's: a crash to open every other bar.
  if (mix.headliner === 'aria' && onBeat && inBar === 0) synth.voice(t, chord.root + 24, eighthSec * 7, chill ? 0.4 : 0.6);
  if (mix.headliner === 'riot' && onBeat && inBar === 0 && beat % 8 === 0 && !chill) synth.crash(t);
  // Lyra's band keeps a soft low chord tone on 1 under everything.
  if (mix.headliner === 'lyra' && onBeat && inBar === 0) synth.keys(t, chord.root + 24, eighthSec * 3, chill ? 0.5 : 0.7);
  // Swell: the keys shimmer up the chord on every sixteenth.
  if (mix.swellUntil !== undefined && beat < mix.swellUntil) {
    for (let k = 0; k < 2; k++) synth.keys(t + k * sixteenth, chord.notes[(eighth * 2 + k) % 4]! + 24, sixteenth * 2, 0.45);
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
      case 'arpeggiator': {
        // Up the chord an eighth at a time; a copy gate adds the next chord tone as a harmony.
        if (chill && !onBeat) break;
        const i = ((eighth % 4) + 4) % 4;
        synth.keys(t, chord.notes[i]! + 12, eighthSec * 1.6, 0.8 * v, dest);
        if (copy && !chill) synth.keys(t, chord.notes[(i + 1) % 4]! + 12, eighthSec * 1.6, 0.4 * v, dest);
        break;
      }
      case 'crew-chief':
        if (chill && inBar % 2 === 1) break;
        synth.cowbell(t, (inBar === 0 && onBeat ? 1 : 0.7) * v, dest);
        if (copy && !chill) synth.cowbell(t + sixteenth, 0.35 * v, dest);
        break;
      case 'roadie': {
        // A pile of Roadies is a pile of scrap: each lane's crew clanks at its own pitch.
        if (chill && !(onBeat && inBar % 2 === 1)) break;
        synth.clank(t, 0.8 * v, dest, [0.85, 1, 1.2][g.lane] ?? 1);
        if (copy && !chill) synth.shaker(t + sixteenth, 0.6 * v, dest);
        break;
      }
      case 'hype-man':
        // Claps on 2 and 4, getting louder as it gains Volume.
        if (onBeat && inBar % 2 === 1) synth.snare(t, 0.5 * v, dest);
        break;
      case 'double-kick':
        if (chill && !onBeat) break;
        synth.kick(t, (onBeat ? 0.7 : 0.45) * v, dest);
        break;
      case 'tuning-fork':
        // A pure high tone, a fifth above the chord root.
        if (chill && !onBeat) break;
        synth.keys(t, chord.root + 43, eighthSec * 0.9, 0.35 * v, dest);
        break;
      case 'guitar-tech':
        if (chill && inBar % 2 === 1) break;
        synth.stab(t, [chord.root + 24, chord.root + 31], eighthSec * 0.6, 0.6 * v, dest);
        break;
      case 'security':
        if (chill && !onBeat) break;
        synth.tom(t, 43, 0.6 * v, dest);
        break;
      case 'rigger':
        if (chill && !onBeat) break;
        synth.clank(t, 0.45 * v, dest, 1.5);
        break;
      case 'backup-singer':
        // Oohs on 2 and 4, a chord tone above the root.
        if (onBeat && inBar % 2 === 1) synth.voice(t, chord.notes[1]! + 12, eighthSec * 1.8, 0.6 * v, dest);
        if (copy && !chill && onBeat && inBar % 2 === 1) synth.voice(t, chord.notes[2]! + 12, eighthSec * 1.8, 0.35 * v, dest);
        break;
      case 'soprano':
        if (chill && inBar % 2 === 1) break;
        if (onBeat) synth.voice(t, chord.notes[(inBar + 2) % 4]! + 24, eighthSec * 1.6, 0.5 * v, dest, 'ah');
        break;
      case 'skater':
        // Palm-muted eighths on the root.
        if (chill && !onBeat) break;
        synth.punk(t, chord.root + 12, eighthSec, 0.7 * v, dest, true);
        break;
      case 'bottle-rocket':
        if (chill && !onBeat) break;
        synth.hat(t, true, true, dest);
        synth.punk(t, chord.root + 24, eighthSec * 0.5, 0.4 * v, dest, true);
        break;
      case 'bouncer':
        if (chill && inBar % 2 === 1) break;
        synth.kick(t, 0.6 * v, dest);
        synth.punk(t, chord.root + 12, eighthSec * 1.5, 0.5 * v, dest);
        break;
      case 'pyro':
        // A sizzle and a pop, like a firework going up.
        if (chill && !onBeat) break;
        synth.hat(t, false, true, dest);
        synth.tom(t, 60, 0.45 * v, dest);
        break;
      case 'spotlight':
        // A bright chord tone picked out on the beat.
        if (chill && inBar % 2 === 1) break;
        synth.stab(t, [chord.notes[2]! + 12], eighthSec * 0.8, 0.8 * v, dest);
        break;
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
    case 'cymbal-crash':
      synth.crash(t);
      break;
    case 'rimshot':
      synth.snare(t, 0.9 * level, dest);
      synth.clank(t, 0.4 * level, dest, 2);
      break;
    case 'mic-drop':
      synth.kick(t, level, dest);
      synth.crash(t + 0.02);
      break;
    case 'drum-solo':
      for (let i = 0; i < 8; i++) synth.tom(t + i * (sixteenth / 2), 55 - i * 2, 0.7 * level, dest);
      break;
    case 'heckle':
      synth.stab(t, [chord.root + 36], 0.12, level, dest);
      synth.stab(t + sixteenth, [chord.root + 36], 0.12, level, dest);
      break;
    case 'glissando':
      for (let i = 0; i < 8; i++) synth.keys(t + i * (sixteenth / 2), chord.notes[i % 4]! + 12 * Math.floor(i / 4), 0.3, 0.45 * level, dest);
      break;
    case 'cadenza':
      chord.notes.forEach((m, i) => synth.keys(t + i * sixteenth, m + 12, 0.5, 0.6 * level, dest));
      break;
    case 'stage-dive':
      for (let i = 0; i < 3; i++) synth.clank(t + i * sixteenth, 0.7 * level, dest, 0.8 + i * 0.2);
      break;
    case 'crew-call':
      synth.cowbell(t, 0.8 * level, dest);
      synth.cowbell(t + sixteenth, 0.6 * level, dest);
      break;
    case 'lullaby':
      synth.voice(t, chord.notes[0]! + 12, 1.1, 0.6 * level, dest);
      synth.voice(t + 0.25, chord.notes[2]!, 0.9, 0.5 * level, dest);
      break;
    case 'high-note':
      synth.voice(t, chord.notes[3]! + 24, 0.6, 0.8 * level, dest, 'ah');
      break;
    case 'ballad':
      chord.notes.forEach((m, i) => synth.voice(t + i * 0.03, m + 12, 1.4, 0.4 * level, dest, 'ah'));
      break;
    case 'siren-call':
      for (let i = 0; i < 4; i++) synth.voice(t + i * sixteenth * 2, chord.notes[3 - i]! + 24, 0.5, 0.6 * level, dest, 'ah');
      break;
    case 'shatter':
      synth.voice(t, chord.notes[2]! + 36, 0.25, 0.7 * level, dest, 'ah');
      synth.crash(t + 0.05);
      break;
    case 'power-slide':
      synth.punk(t, chord.root + 24, 0.4, level, dest);
      synth.punk(t + 2 * sixteenth, chord.root + 19, 0.5, level, dest);
      break;
    case 'smash-the-guitar':
      synth.punk(t, chord.root + 12, 0.9, 1.2 * level, dest);
      synth.crash(t);
      synth.kick(t, level, dest);
      break;
    case 'anthem':
      for (let i = 0; i < 4; i++) synth.punk(t + i * sixteenth, chord.root + 12, sixteenth * 0.9, 0.8 * level, dest, i < 3);
      break;
    case 'crowd-surf':
      synth.crash(t);
      synth.punk(t, chord.root + 24, 0.5, 0.7 * level, dest);
      break;
    case 'sustain-pedal':
      // A held chord on the keys.
      chord.notes.forEach((m, i) => synth.keys(t + i * 0.012, m, 1.2, 0.55 * level, dest));
      break;
    case 'load-in':
      // Clank, clank, cowbell: gear hitting the stage.
      synth.clank(t, 0.8 * level, dest, 0.9);
      synth.clank(t + sixteenth, 0.7 * level, dest, 1.1);
      synth.cowbell(t + 2 * sixteenth, 0.6 * level, dest);
      break;
    default:
      synth.stab(t, [chord.root + 24, chord.root + 31], 0.25, 0.7 * level, dest);
  }
}
