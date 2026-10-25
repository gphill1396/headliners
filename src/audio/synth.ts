/**
 * Synthesized sound (SPEC §8): no samples, everything built from oscillators
 * and noise with the Web Audio API. The drum loop is scheduled slightly ahead
 * of time against the audio clock so it stays locked to the beat; game sounds
 * play immediately when events happen.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export class Synth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private noise: AudioBuffer;
  private lastKill = 0;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    // Fixed pseudo-random noise (UI side, so Math.random would be fine; this keeps it identical every load).
    let x = 1234567;
    for (let i = 0; i < data.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (x / 0x7fffffff) * 2 - 1;
    }
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

  private offset: number | null = null;

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
    // Never schedule in the past.
    return Math.max(this.ctx.currentTime, this.offset + perfNowMs / 1000);
  }

  // ---------------------------------------------------------------- drum voices

  kick(t: number, level = 1): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.9 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  snare(t: number, level = 1): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(hp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.18);
    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    bodyGain.gain.setValueAtTime(0.3 * level, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    body.connect(bodyGain).connect(this.master);
    body.start(t);
    body.stop(t + 0.1);
  }

  hat(t: number, accent = false): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.22 : 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (accent ? 0.06 : 0.035));
    src.connect(hp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.08);
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
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    src.connect(hp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 1.5);
  }

  // ---------------------------------------------------------------- game sounds

  /** Card resolved: brighter and cleaner the better the timing. */
  play(grade: 'tight' | 'good' | 'off'): void {
    const t = this.ctx.currentTime;
    if (grade === 'tight') {
      this.tone(t, 988, 0.09, 'square', 0.12);
      this.tone(t + 0.04, 1319, 0.09, 'square', 0.1);
    } else if (grade === 'good') {
      this.tone(t, 784, 0.1, 'square', 0.1);
    } else {
      this.tone(t, 220, 0.12, 'sawtooth', 0.08);
    }
  }

  /** Chain stinger: climbs a pentatonic scale as the chain grows. */
  link(links: number): void {
    const scale = [0, 2, 4, 7, 9];
    const step = Math.min(links - 1, 24);
    const semis = scale[step % 5]! + 12 * Math.floor(step / 5);
    this.tone(this.ctx.currentTime, 440 * Math.pow(2, semis / 12), 0.12, 'triangle', 0.14);
  }

  kill(): void {
    const now = this.ctx.currentTime;
    if (now - this.lastKill < 0.05) return;
    this.lastKill = now;
    this.tone(now, 1600, 0.03, 'square', 0.05);
  }

  leak(): void {
    const t = this.ctx.currentTime;
    this.tone(t, 110, 0.25, 'sawtooth', 0.18);
    this.tone(t + 0.08, 82, 0.3, 'sawtooth', 0.15);
  }

  place(kind: 'unit' | 'gate'): void {
    const t = this.ctx.currentTime;
    if (kind === 'gate') {
      this.tone(t, 660, 0.15, 'triangle', 0.1);
      this.tone(t + 0.05, 990, 0.15, 'triangle', 0.08);
    } else {
      this.tone(t, 330, 0.08, 'square', 0.08);
    }
  }

  private tone(t: number, freq: number, dur: number, type: OscillatorType, level: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }
}

/**
 * The drum loop for one eighth note. `eighth` counts from the start of the run:
 * beat = eighth / 2. Kick on 1 and 3, snare on 2 and 4, hats on every eighth.
 * During Fill the snare plays every eighth.
 */
export function scheduleEighth(synth: Synth, eighth: number, t: number, filling: boolean): void {
  const beat = Math.floor(eighth / 2);
  const onBeat = eighth % 2 === 0;
  const inBar = ((beat % 4) + 4) % 4;
  if (onBeat && (inBar === 0 || inBar === 2)) synth.kick(t, inBar === 0 ? 1 : 0.8);
  if (filling) synth.snare(t, onBeat ? 0.9 : 0.6);
  else if (onBeat && (inBar === 1 || inBar === 3)) synth.snare(t);
  synth.hat(t, onBeat);
}
