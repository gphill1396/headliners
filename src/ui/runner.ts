import { BEATS_PER_BAR, step, TICK_MS, type EngineEvent, type EngineState, type Input } from '../engine';

interface TimedInput {
  tick: number;
  input: Input;
}

export interface CountIn {
  /** 0–3: which count of the bar we're on. */
  beat: number;
  /** 0–1 progress through that count. */
  phase: number;
}

export interface RunnerHooks {
  /** Called after each simulated tick with that tick's events. */
  onEvents?: (events: EngineEvent[], state: EngineState) => void;
  /** Called once per animation frame. `alpha` is 0–1 progress toward the next tick, for smooth drawing. */
  onFrame?: (state: EngineState, alpha: number, countIn: CountIn | null, now: number) => void;
}

/** If the page stalls longer than this, drop the lost time instead of fast-forwarding the game. */
const MAX_CATCH_UP_TICKS = 12;

/**
 * Drives the pure engine from real time.
 *
 * Owns the only wall-clock code in the game: requestAnimationFrame and input
 * timestamps. Taps are stamped with their exact time and handed to the engine
 * as (tick, permille), so timing grades don't depend on frame rate.
 */
export class GameRunner {
  state: EngineState;
  private hooks: RunnerHooks;
  /** performance.now() value at which simulation time 0 would have been. */
  private origin = 0;
  private rafId = 0;
  private pending: TimedInput[] = [];
  private _running = false;
  private countInStart = 0;
  private countInEnd = 0;

  constructor(state: EngineState, hooks: RunnerHooks = {}) {
    this.state = state;
    this.hooks = hooks;
  }

  get running(): boolean {
    return this._running;
  }

  setHooks(hooks: RunnerHooks): void {
    this.hooks = hooks;
  }

  /** Swap in a different run (new game or a restored save). */
  load(state: EngineState): void {
    this.pause();
    this.pending = [];
    this.state = state;
  }

  /** Start (or resume) after a one-bar count-in, so you can find the beat again (SPEC S1.8). */
  start(withCountIn = true, now = performance.now()): void {
    if (this._running) return;
    this.origin = now - this.state.tick * TICK_MS;
    this.countInStart = this.countInEnd = now;
    if (withCountIn) this.delay(this.barMs(), now);
    this._running = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Hold the simulation for `ms` (a count-in), keeping inputs aligned. */
  delay(ms: number, now = performance.now()): void {
    // If a count-in is already running, replace it rather than stacking a second one on top.
    const alreadyHeldUntil = Math.max(now, this.countInEnd);
    this.origin += now + ms - alreadyHeldUntil;
    this.countInStart = now;
    this.countInEnd = now + ms;
  }

  barMs(): number {
    return (60_000 / this.state.clock.bpm) * BEATS_PER_BAR;
  }

  pause(): void {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this.rafId);
    // Unresolved taps are dropped on pause; settings changes are kept.
    this.pending = this.pending.filter((p) => p.input.type !== 'commit' && p.input.type !== 'activate');
  }

  isCountingIn(now = performance.now()): boolean {
    return now < this.countInEnd;
  }

  /** Queue an input that happened at `timeStamp` (event.timeStamp or performance.now()). */
  send(input: Input, timeStamp = performance.now()): void {
    const timed = input.type === 'commit' || input.type === 'activate';
    if (timed && (!this._running || this.isCountingIn(timeStamp))) return;
    if (!timed) {
      this.pending.push({ tick: this.state.tick, input });
      return;
    }
    const simTicks = (timeStamp - this.origin) / TICK_MS;
    let tick = Math.floor(simTicks);
    let permille = Math.floor((simTicks - tick) * 1000);
    if (tick < this.state.tick) {
      // Arrived after its tick was simulated: apply at the start of the current tick.
      tick = this.state.tick;
      permille = 0;
    }
    this.pending.push({ tick, input: { ...input, permille } });
  }

  private frame = (now: number): void => {
    if (!this._running) return;
    let target = Math.floor((now - this.origin) / TICK_MS);
    if (target - this.state.tick > MAX_CATCH_UP_TICKS) {
      // Long stall (tab switch, slow frame): skip ahead without simulating the gap.
      this.origin = now - this.state.tick * TICK_MS;
      target = this.state.tick;
    }
    while (this.state.tick < target) {
      const tick = this.state.tick;
      const due = this.pending.filter((p) => p.tick <= tick).map((p) => p.input);
      if (due.length) this.pending = this.pending.filter((p) => p.tick > tick);
      const events = step(this.state, due);
      this.hooks.onEvents?.(events, this.state);
    }
    let countIn: CountIn | null = null;
    if (now < this.countInEnd) {
      const beatMs = (this.countInEnd - this.countInStart) / BEATS_PER_BAR;
      const elapsed = (now - this.countInStart) / beatMs;
      countIn = { beat: Math.min(BEATS_PER_BAR - 1, Math.floor(elapsed)), phase: elapsed % 1 };
    }
    const alpha = Math.min(1, Math.max(0, (now - this.origin) / TICK_MS - this.state.tick));
    this.hooks.onFrame?.(this.state, alpha, countIn, now);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
