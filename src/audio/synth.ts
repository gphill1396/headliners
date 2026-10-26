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
  /** Side Fill speaker: where the lane's sound points. -1 left, 1 right, 0 both ways (middle lane), null none. */
  aim?: -1 | 0 | 1 | null;
}

interface LaneBus {
  input: GainNode;
  shaper: WaveShaperNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
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
  /** Post-mix output. The metronome goes here directly, so band fades and muffling never touch it. */
  private out: AudioNode;
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
    this.out = comp;
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
      return { input, shaper, filter, panner, driveAmount: 0 };
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
    // Muffled, not gone: ~1.2 kHz keeps snares and hats audible, just softer, like hearing the band from backstage.
    this.muffle.frequency.setTargetAtTime(on ? 1_200 : 20_000, t, on ? 0.12 : 0.01);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.5 : 0.6, t, 0.05);
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
    // A speaker swings the lane's sound toward the lane it's aimed at.
    const home = LANE_PAN[lane] ?? 0;
    const pan = fx.aim === undefined || fx.aim === null ? home : fx.aim === 0 ? home : home + fx.aim * 0.45;
    bus.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
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

  /** The metronome: a dry wood-block tick, accented on beat 1. Bypasses the band's mute and fades. */
  metronome(t: number, accent: boolean, level = 1): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1_900 : 1_350, t);
    gain.gain.setValueAtTime((accent ? 0.16 : 0.09) * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /** Fade the band out over `seconds` (game over), leaving the metronome. */
  fadeBand(t: number, seconds: number): void {
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + seconds);
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(700, t, seconds / 3);
  }

  /** Bring the band bus back to normal (after a fade, before the band plays again). */
  resetBand(t: number): void {
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.6, t);
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(20_000, t);
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

  // ---------------------------------------------------------------- Clatter's pots and shaker

  /** Clank: a struck bit of scrap metal. Inharmonic partials plus a noisy hit. */
  clank(t: number, level = 1, dest: AudioNode = this.master, pitch = 1): void {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    gain.connect(dest);
    for (const ratio of [1, 2.76, 5.4]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 420 * pitch * ratio;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3_200 * pitch;
    bp.Q.value = 4;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.35 * level, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(bp).connect(ng).connect(dest);
    src.start(t, (t * 1.7) % 0.8);
    src.stop(t + 0.07);
  }

  /** Shaker: soft high noise with a little swell at the front. */
  shaker(t: number, level = 1, dest: AudioNode = this.master): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5_500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.12 * level, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(hp).connect(gain).connect(dest);
    src.start(t, (t * 2.3) % 0.8);
    src.stop(t + 0.11);
  }

  // ---------------------------------------------------------------- Aria's voices, Riot's pipes

  /** A sung vowel (Aria): a saw through two formant band-passes, with a soft attack. 'oo' is dark, 'ah' is open. */
  voice(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master, vowel: 'oo' | 'ah' = 'oo'): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToHz(midi);
    const vib = this.ctx.createOscillator();
    const vibAmt = this.ctx.createGain();
    vib.frequency.value = 5.5;
    vibAmt.gain.value = 6;
    vib.connect(vibAmt).connect(osc.detune);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.18 * level, t + Math.min(0.08, dur / 3));
    gain.gain.setValueAtTime(0.18 * level, t + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const [f, q] of vowel === 'oo' ? [[350, 6], [800, 8]] : [[750, 6], [1200, 8]]) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f!;
      bp.Q.value = q!;
      osc.connect(bp).connect(gain);
    }
    gain.connect(dest);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
  }

  /** Riot's band (was a fuzzed punk guitar): now bagpipes. `muted` is a short, clipped note. */
  punk(t: number, root: number, dur: number, level = 1, dest: AudioNode = this.master, muted = false): void {
    this.pipes(t, root, dur, level, dest, muted);
  }

  // ---------------------------------------------------------------- the ren faire band

  /** Lute (Lyra, and every strum): a plucked string. Saw + triangle through a low-pass that closes fast, plus a pick click. */
  lute(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master): void {
    const f = midiToHz(midi);
    const ring = Math.max(0.35, dur * 1.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(Math.min(6_000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.25);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.15 * level, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t + ring);
    lp.connect(gain).connect(dest);
    for (const [type, detune] of [['sawtooth', 0], ['triangle', 5]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + ring + 0.02);
    }
    const pick = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2_800;
    bp.Q.value = 2;
    const pg = this.ctx.createGain();
    pg.gain.setValueAtTime(0.06 * level, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    pick.connect(bp).connect(pg).connect(dest);
    pick.start(t, (t * 5.1) % 0.8);
    pick.stop(t + 0.02);
  }

  /** A lute strum: the notes plucked a hair apart, low to high. */
  strum(t: number, notes: number[], dur: number, level = 1, dest: AudioNode = this.master): void {
    notes.forEach((m, i) => this.lute(t + i * 0.018, m, dur, 0.75 * level, dest));
  }

  /** Tambourine: a slap of jingles. Keeps time for most of the band. */
  jingle(t: number, accent = false, dest: AudioNode = this.master): void {
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 7_000;
    bp.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.16 : 0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (accent ? 0.13 : 0.08));
    src.connect(bp).connect(gain).connect(dest);
    src.start(t, (t * 3.7) % 0.8);
    src.stop(t + 0.15);
    for (const f of [5_400, 7_900]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(accent ? 0.012 : 0.007, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  /** War drum (Thrum's kick, and the 1 of every bar): a big low boom with a skin slap. */
  boom(t: number, level = 1, dest: AudioNode = this.master): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    gain.gain.setValueAtTime(0.95 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.57);
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.3 * level, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(lp).connect(ng).connect(dest);
    src.start(t, (t * 4.3) % 0.8);
    src.stop(t + 0.06);
  }

  /** Bagpipes (Riot): a reedy chanter with a quick grace note, over a low drone unless it's a short `clipped` note. */
  pipes(t: number, root: number, dur: number, level = 1, dest: AudioNode = this.master, clipped = false): void {
    const len = clipped ? Math.min(dur, 0.12) : dur;
    const chanter = root + 12;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1_300;
    bp.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.09 * level, t + 0.01);
    gain.gain.setValueAtTime(0.09 * level, t + len * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    bp.connect(gain).connect(dest);
    for (const [type, detune] of [['sawtooth', 0], ['square', 4]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.detune.value = detune;
      // A grace note a fifth up, then the melody note: the pipes' signature flick.
      osc.frequency.setValueAtTime(midiToHz(chanter + 7), t);
      osc.frequency.setValueAtTime(midiToHz(chanter), t + 0.035);
      osc.connect(bp);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
    if (!clipped) this.drone(t, len, 0.6 * level, dest);
  }

  /** The pipes' (or the hurdy-gurdy's) drone: D and A, low and steady, whatever the chord. */
  drone(t: number, dur: number, level = 1, dest: AudioNode = this.master, buzz = false): void {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = buzz ? 1_800 : 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.05 * level, t + 0.06);
    gain.gain.setValueAtTime(0.05 * level, t + dur * 0.85);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(gain).connect(dest);
    for (const midi of [38, 45]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  /** Hurdy-gurdy (Clatter): a cranked, bowed note over a drone, with the buzzing "dog" kicking in at the front. */
  gurdy(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master): void {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2_400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.08 * level, t + 0.03);
    gain.gain.setValueAtTime(0.08 * level, t + dur * 0.8);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    // The dog: a fast rattle on the volume for the first moment of the note.
    const dog = this.ctx.createGain();
    dog.gain.value = 0.6;
    const lfo = this.ctx.createOscillator();
    const lfoAmt = this.ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 28;
    lfoAmt.gain.setValueAtTime(0.4, t);
    lfoAmt.gain.setValueAtTime(0, t + Math.min(0.16, dur * 0.5));
    lfo.connect(lfoAmt).connect(dog.gain);
    lp.connect(dog).connect(gain).connect(dest);
    for (const [m, d] of [[midi, 0], [midi, 6], [midi - 12, 0]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(m);
      osc.detune.value = d;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }

  /** Recorder / fife (Aria's high parts and the chain's lead line): breathy, nearly pure, a little vibrato. */
  recorder(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master): void {
    const f = midiToHz(midi);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.1 * level, t + Math.min(0.03, dur / 3));
    gain.gain.setValueAtTime(0.1 * level, t + dur * 0.75);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    gain.connect(dest);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const vib = this.ctx.createOscillator();
    const vibAmt = this.ctx.createGain();
    vib.frequency.value = 5;
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(10, t + Math.min(0.25, dur));
    vib.connect(vibAmt).connect(osc.detune);
    osc.connect(gain);
    const over = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    over.type = 'triangle';
    over.frequency.value = f * 2;
    og.gain.value = 0.15;
    over.connect(og).connect(gain);
    const breath = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2_500;
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.012 * level, t);
    bg.gain.exponentialRampToValueAtTime(0.002 * level, t + 0.08);
    breath.connect(hp).connect(bg).connect(gain);
    for (const o of [osc, over, vib]) {
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    breath.start(t, (t * 6.1) % 0.8);
    breath.stop(t + dur + 0.02);
  }

  /** Lyra's plucked strings (was an electric piano). Kept as `keys` so the groove reads the same. */
  keys(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master): void {
    this.lute(t, midi, dur, level, dest);
  }

  /** Bass viol: a bowed saw through a closing low-pass, with a soft bow attack. */
  bass(t: number, midi: number, dur: number, level = 1, dest: AudioNode = this.master): void {
    const osc = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1_400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.32 * level, t + Math.min(0.04, dur / 4));
    gain.gain.setValueAtTime(0.32 * level, t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp).connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A short chord stab: now a lute strum. */
  stab(t: number, notes: number[], dur: number, level = 1, dest: AudioNode = this.master): void {
    this.strum(t, notes, dur, 1.2 * level, dest);
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

  /** Lead note for the chain's arpeggio layer: a fife. */
  lead(t: number, midi: number, dur: number, level = 1): void {
    this.recorder(t, midi, Math.max(dur, 0.06), 0.55 * level);
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
