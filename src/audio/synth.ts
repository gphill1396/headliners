/**
 * Synthesized sound (SPEC §8): no samples, everything built from oscillators
 * and noise with the Web Audio API. The groove is scheduled slightly ahead
 * against the audio clock so it stays locked to the beat; game sounds play
 * immediately when events happen.
 *
 * Each lane has its own bus (pan + gate effects), so what you put in a lane
 * is what you hear from that side.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export interface LaneFx {
  /** Overdrive gate: distortion amount 0–1. */
  drive: number;
  /** Fuzz gate: resonant low-pass on the lane. */
  fuzz: boolean;
}

interface LaneBus {
  input: GainNode;
  shaper: WaveShaperNode;
  filter: BiquadFilterNode;
  driveAmount: number;
}

const LANE_PAN = [-0.6, 0, 0.6];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function driveCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 60;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export class Synth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private muffle: BiquadFilterNode;
  /** Game sound effects level (lower in Chill music). */
  sfx = 1;
  private noise: AudioBuffer;
  private lanes: LaneBus[];
  private lastKill = 0;
  private offset: number | null = null;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    // Muffle: the band heard from backstage while a card pick is open.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20_000;
    this.master.connect(this.muffle).connect(comp);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let x = 1234567;
    for (let i = 0; i < data.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (x / 0x7fffffff) * 2 - 1;
    }

    this.lanes = LANE_PAN.map((pan) => {
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18_000;
      filter.Q.value = 0.7;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      input.connect(shaper).connect(filter).connect(panner).connect(this.master);
      return { input, shaper, filter, driveAmount: 0 };
    });
  }

  /** Create on a user gesture (required by iOS). Returns null if Web Audio isn't available. */
  static create(): Synth | null {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      // 'ambient': respects the iPhone silent switch and mixes with the player's own music.
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession) nav.audioSession.type = 'ambient';
    } catch {
      /* not supported */
    }
    return new Synth(new Ctor());
  }

  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx.state === 'running') void this.ctx.suspend();
  }

  /**
   * Convert a performance.now() timestamp to audio-clock time. The audio clock
   * only advances in ~3 ms blocks, so the offset between the two clocks is
   * measured with getOutputTimestamp where available and smoothed.
   */
  audioTimeAt(perfNowMs: number): number {
    let sample: number;
    const ts = typeof this.ctx.getOutputTimestamp === 'function' ? this.ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime && ts.contextTime !== undefined) sample = ts.contextTime - ts.performanceTime / 1000;
    else sample = this.ctx.currentTime - performance.now() / 1000;
    this.offset = this.offset === null || Math.abs(sample - this.offset) > 0.05 ? sample : this.offset * 0.95 + sample * 0.05;
    return Math.max(this.ctx.currentTime, this.offset + perfNowMs / 1000);
  }

  /** Muffle the whole band (card pick screen) or bring it back, at audio time `t`. */
  setMuffle(on: boolean, t = this.ctx.currentTime): void {
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(on ? 420 : 20_000, t, on ? 0.12 : 0.01);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.45 : 0.6, t, 0.05);
  }

  /** Where a lane's instruments go. */
  lane(lane: number): AudioNode {
    return (this.lanes[lane] ?? this.lanes[1]!).input;
  }

  /** Gates color their lane's sound. Cheap to call every eighth; only changes when needed. */
  setLaneFx(lane: number, fx: LaneFx, t: number): void {
    const bus = this.lanes[lane];
    if (!bus) return;
    if (bus.driveAmount !== fx.drive) {
      bus.driveAmount = fx.drive;
      bus.shaper.curve = fx.drive > 0 ? driveCurve(fx.drive) : null;
    }
    bus.filter.frequency.setTargetAtTime(fx.fuzz ? 1_400 : 18_000, t, 0.05);
    bus.filter.Q.setTargetAtTime(fx.fuzz ? 9 : 0.7, t, 0.05);
  }

  // ---------------------------------------------------------------- drums

  kick(t: number, level = 1, dest: AudioNode = this.master): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.9 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  snare(t: number, level = 1, dest: AudioNode = this.master): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(hp).connect(gain).connect(dest);
    src.start(t, (t * 7.3) % 0.8);
    src.stop(t + 0.18);
    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    bodyGain.gain.setValueAtTime(0.3 * level, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    body.connect(bodyGain).connect(dest);
    body.start(t);
    body.stop(t + 0.1);
  }

  hat(t: number, accent = false, open = false, dest: AudioNode = this.master): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const gain = this.ctx.createGain();
    const len = open ? 0.22 : accent ? 0.06 : 0.035;
    gain.gain.setValueAtTime(open ? 0.16 : accent ? 0.2 : 0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(hp).connect(gain).connect(dest);
    src.start(t, (t * 3.1) % 0.8);
    src.stop(t + len + 0.02);
  }

  tom(t: number, midi: number, level = 1, dest: AudioNode = this.master): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const f = midiToHz(midi);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    gain.gain.setValueAtTime(0.5 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  /** Drumstick click for count-ins. */
  click(t: number, downbeat: boolean): void {
    this.tone(t, downbeat ? 1760 : 1320, 0.035, 'square', 0.12);
  }

  crash(t = this.ctx.currentTime): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    src.connect(hp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 1.5);
  }

  // ---------------------------------------------------------------- pitched band

  /** Bass note: saw through a closing low-pass, a little pluck. */
  bass(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master): void {
    const osc = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1_400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    gain.gain.setValueAtTime(0.32 * level, t);
    gain.gain.setValueAtTime(0.32 * level, t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp).connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Guitar-ish stab: a few detuned saws, short. */
  stab(t: number, notes: number[], dur: number, level = 1, dest: AudioNode = this.master): void {
    for (const midi of notes) {
      for (const detune of [-7, 7]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(midiToHz(midi), t);
        osc.detune.value = detune;
        gain.gain.setValueAtTime(0.05 * level, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain).connect(dest);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    }
  }

  /** Soft sustained chord pad. */
  pad(t: number, notes: number[], dur: number, level = 1): void {
    for (const midi of notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToHz(midi), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.045 * level, t + Math.min(0.25, dur / 3));
      gain.gain.setValueAtTime(0.045 * level, t + dur * 0.8);
      gain.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  /** Bright lead note for the arpeggio layer. */
  lead(t: number, midi: number, dur: number, level = 1): void {
    this.tone(t, midiToHz(midi), dur, 'square', 0.05 * level);
  }

  // ---------------------------------------------------------------- game sounds

  /** Card resolved: brighter and cleaner the better the timing. */
  play(grade: 'tight' | 'good' | 'off'): void {
    const t = this.ctx.currentTime;
    if (grade === 'tight') {
      this.tone(t, 988, 0.09, 'square', 0.1 * this.sfx);
      this.tone(t + 0.04, 1319, 0.09, 'square', 0.08 * this.sfx);
    } else if (grade === 'good') {
      this.tone(t, 784, 0.1, 'square', 0.08 * this.sfx);
    } else {
      this.tone(t, 220, 0.12, 'sawtooth', 0.08 * this.sfx);
    }
  }

  /** Chain stinger: climbs a pentatonic scale as the chain grows. */
  link(links: number): void {
    const scale = [0, 2, 4, 7, 9];
    const step = Math.min(links - 1, 24);
    const semis = scale[step % 5]! + 12 * Math.floor(step / 5);
    this.tone(this.ctx.currentTime, 440 * Math.pow(2, semis / 12), 0.12, 'triangle', 0.12 * this.sfx);
  }

  kill(): void {
    const now = this.ctx.currentTime;
    if (now - this.lastKill < 0.05) return;
    this.lastKill = now;
    this.tone(now, 1600, 0.03, 'square', 0.04 * this.sfx);
  }

  leak(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 110, 0.25, 'sawtooth', 0.18 * this.sfx);
    this.tone(t + 0.08, 82, 0.3, 'sawtooth', 0.15 * this.sfx);
  }

  /** Placement cue: a gate shimmers, a unit thunks. */
  place(kind: 'unit' | 'gate'): void {
    const t = this.ctx.currentTime;
    if (kind === 'gate') {
      this.tone(t, 660, 0.15, 'triangle', 0.08 * this.sfx);
      this.tone(t + 0.05, 990, 0.15, 'triangle', 0.06 * this.sfx);
    } else {
      this.tone(t, 330, 0.08, 'square', 0.06 * this.sfx);
    }
  }

  /** Feedback squeal for Feedback Loop. */
  squeal(lane: number): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1_800, t);
    osc.frequency.exponentialRampToValueAtTime(3_200, t + 0.35);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.08 * this.sfx, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(this.lane(lane));
    osc.start(t);
    osc.stop(t + 0.42);
  }

  private tone(t: number, freq: number, dur: number, type: OscillatorType, level: number, dest: AudioNode = this.master): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }
}
