import { step, TICK_MS, type EngineEvent, type EngineState, type Input } from '../engine';

interface TimedInput {
  tick: number;
  input: Input;
}

export interface RunnerHooks {
  /** Called after each simulated tick with that tick's events. */
  onEvents?: (events: EngineEvent[], state: EngineState) => void;
  /** Called once per animation frame. `alpha` is 0–1 progress toward the next tick, for smooth drawing. */
  onFrame?: (state: EngineState, alpha: number) => void;
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
  readonly state: EngineState;
  private hooks: RunnerHooks;
  /** performance.now() value at which simulation time 0 would have been. */
  private origin = 0;
  private rafId = 0;
  private pending: TimedInput[] = [];
  private _running = false;

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

  start(now = performance.now()): void {
    if (this._running) return;
    this.origin = now - this.state.tick * TICK_MS;
    this._running = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  pause(): void {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this.rafId);
    // Unresolved taps are dropped on pause; settings changes are kept.
    this.pending = this.pending.filter((p) => p.input.type !== 'commit');
  }

  /** Queue an input that happened at `timeStamp` (event.timeStamp or performance.now()). */
  send(input: Input, timeStamp = performance.now()): void {
    if (!this._running) {
      // Plays need a running clock; settings changes wait for the next tick.
      if (input.type !== 'commit') this.pending.push({ tick: this.state.tick, input });
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
    if (input.type === 'commit') input = { ...input, permille };
    this.pending.push({ tick, input });
  }

  private frame = (now: number): void => {
    if (!this._running) return;
    let target = Math.floor((now - this.origin) / TICK_MS);
    if (target - this.state.tick > MAX_CATCH_UP_TICKS) {
      // Long stall (tab switch, debugger, slow frame): skip ahead without simulating the gap.
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
    const alpha = Math.min(1, Math.max(0, (now - this.origin) / TICK_MS - this.state.tick));
    this.hooks.onFrame?.(this.state, alpha);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
