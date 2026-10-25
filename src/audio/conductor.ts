import type { MusicStyle } from './groove';
import type { BoardMix } from './groove';
import { scheduleGroove } from './groove';
import type { Synth } from './synth';

/**
 * The beat never stops. Whenever the engine isn't driving the music (title,
 * pause, card pick, game over), the Conductor keeps a virtual clock going and
 * plays the right thing on it:
 *
 * - 'metronome' — title screen and after the band fades at game over.
 * - 'muffled'   — pause and card pick: the band from backstage, with the metronome on top.
 * - 'fade'      — game over: the band fades out over two bars into the metronome.
 * - 'engine'    — a run is playing; the engine's clock drives the music.
 *
 * When play resumes, the engine is held so its beat lands on the Conductor's
 * beat, and the band comes back in exactly in time.
 */
export type ConductorMode = 'metronome' | 'muffled' | 'fade' | 'engine';

export interface Handoff {
  /** Engine eighth note that lands at `at`. */
  eighth: number;
  /** performance.now() time. */
  at: number;
}

const LOOKAHEAD_MS = 120;
const FADE_BARS = 2;

export class Conductor {
  mode: ConductorMode = 'metronome';
  /** performance.now() time of virtual beat number `beatOffset`. */
  private beat0 = 0;
  bpm = 100;
  /** Beat number (engine numbering) at beat0, so the bar position carries across. */
  private beatOffset = 0;
  /** Next virtual eighth to schedule, counted from beat0. */
  private k = 0;
  private resumeAt: number | null = null;
  private resumeEighth = 0;
  private fadeEnd = 0;
  private started = false;

  get running(): boolean {
    return this.started;
  }

  /** Start the metronome from scratch (first tap after launch). */
  startMetronome(now: number, bpm: number): void {
    this.started = true;
    this.mode = 'metronome';
    this.bpm = bpm;
    this.beat0 = now;
    this.beatOffset = 0;
    this.k = 0;
    this.resumeAt = null;
  }

  /**
   * Take over from the engine. `beatTime` is when the engine's current beat
   * `beat` happened; `nextEighth` is the first engine eighth not yet scheduled.
   */
  takeOver(mode: 'muffled' | 'fade', now: number, beatTime: number, beat: number, bpm: number, nextEighth: number, synth: Synth | null): void {
    this.started = true;
    this.mode = mode;
    this.bpm = bpm;
    this.beat0 = beatTime;
    this.beatOffset = beat;
    this.k = Math.max(1, nextEighth - 2 * beat);
    this.resumeAt = null;
    if (mode === 'fade') {
      const barMs = (60_000 / bpm) * 4;
      this.fadeEnd = now + FADE_BARS * barMs;
      synth?.fadeBand(synth.audioTimeAt(now), (FADE_BARS * barMs) / 1000);
    } else {
      synth?.setMuffle(true);
    }
  }

  /** Switch the live sound (e.g. resume onto a pick screen) without moving the clock. */
  setMode(mode: 'metronome' | 'muffled', synth: Synth | null): void {
    this.mode = mode;
    if (mode === 'muffled') synth?.setMuffle(true);
  }

  /**
   * The next time a beat with this bar position (0 = beat 1) comes around, at
   * least `minLeadBeats` from now. Used to drop a run in exactly on the beat.
   */
  nextBeatAt(now: number, barPosition: number, minLeadBeats = 1): number {
    const beatMs = 60_000 / this.bpm;
    let n = Math.ceil((now + minLeadBeats * beatMs - this.beat0) / beatMs);
    if (n < 0) n = 0;
    while (((this.beatOffset + n) % 4 + 4) % 4 !== barPosition) n++;
    return this.beat0 + n * beatMs;
  }

  /** Hand the music back to the engine at `at`, where engine beat `engineBeat` lands. */
  handBackAt(at: number, engineBeat: number): void {
    this.resumeAt = at;
    this.resumeEighth = 2 * engineBeat;
  }

  /** Where the virtual clock is: beat in bar (0–3) and 0–1 progress, for the beat lights. */
  position(now: number): { beat: number; phase: number } {
    const elapsed = (now - this.beat0) / (60_000 / this.bpm);
    const beat = Math.floor(elapsed) + this.beatOffset;
    return { beat: ((beat % 4) + 4) % 4, phase: ((elapsed % 1) + 1) % 1 };
  }

  /**
   * Schedule what's due in the next ~120 ms. Returns a handoff when the engine
   * should take the music back.
   */
  tick(now: number, synth: Synth | null, style: MusicStyle, mix: () => BoardMix): Handoff | null {
    if (!this.started || this.mode === 'engine') return null;
    const eighthMs = 30_000 / this.bpm;
    // After a long gap (app in the background), skip ahead instead of replaying missed notes.
    const behind = Math.floor((now - this.beat0) / eighthMs) - 2;
    if (behind > this.k) this.k = behind;

    for (;;) {
      const tK = this.beat0 + this.k * eighthMs;
      if (this.resumeAt !== null && tK >= this.resumeAt - 1) {
        const at = this.resumeAt;
        this.resumeAt = null;
        this.mode = 'engine';
        if (synth) synth.resetBand(synth.audioTimeAt(at));
        return { eighth: this.resumeEighth, at };
      }
      if (tK - now > LOOKAHEAD_MS) return null;

      if (this.mode === 'fade' && tK >= this.fadeEnd) {
        this.mode = 'metronome';
        if (synth) synth.resetBand(synth.audioTimeAt(tK));
      }
      if (synth && tK > now - 40) {
        const eighth = 2 * this.beatOffset + this.k;
        const at = synth.audioTimeAt(tK);
        const onBeat = eighth % 2 === 0;
        const beatInBar = ((Math.floor(eighth / 2) % 4) + 4) % 4;
        if (this.mode === 'muffled' || this.mode === 'fade') {
          scheduleGroove(synth, { ...mix(), chain: 0, fillUntil: -1 }, eighth, at, eighthMs / 1000, style);
        }
        // The metronome is always there when the band isn't fully playing, so the pulse can never disappear.
        if (onBeat) synth.metronome(at, beatInBar === 0, this.mode === 'muffled' ? 0.7 : 1);
      }
      this.k += 1;
    }
  }
}
