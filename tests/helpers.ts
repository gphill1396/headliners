import { BEAT_UNITS, createState, step, type EngineEvent, type EngineState, type Enemy, type Input } from '../src/engine';

/** A fresh run with lots of energy and an empty field, for rules tests. */
export function testState(seed = 'test', bpm = 100): EngineState {
  const s = createState({ seed, bpm });
  s.energy = 10;
  return s;
}

/** Put a specific card in hand; returns its instance id. */
export function giveCard(s: EngineState, cardId: string): number {
  const iid = s.nextId++;
  s.hand.push({ iid, cardId });
  return iid;
}

export function runTicks(s: EngineState, n: number, inputs: (tick: number) => Input[] = () => []): EngineEvent[] {
  const all: EngineEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...step(s, inputs(i)));
  return all;
}

/** Step until the next tick will land a beat, so an input with permille 0 is a Tight hit on that beat. */
export function toBeatEdge(s: EngineState): EngineEvent[] {
  const events: EngineEvent[] = [];
  while (s.clock.phase + s.clock.bpm < BEAT_UNITS) events.push(...step(s));
  return events;
}

/** Play a card right on the next beat (Tight). Returns the events of the tick it resolved on. */
export function playOnBeat(s: EngineState, cardId: string, lane: number): EngineEvent[] {
  const iid = giveCard(s, cardId);
  toBeatEdge(s);
  return step(s, [{ type: 'commit', iid, lane, permille: 0 }]);
}

/** Advance to the next beat edge and step through the beat. */
export function nextBeat(s: EngineState): EngineEvent[] {
  const events = toBeatEdge(s);
  events.push(...step(s));
  return events;
}

export function addEnemy(s: EngineState, partial: Partial<Enemy> & { lane: number; depth: number }): Enemy {
  const e: Enemy = {
    id: s.nextId++,
    kind: 'shambler',
    speed: 0,
    hp: 100,
    maxHp: 100,
    armor: 0,
    crowdDamage: 2,
    leaked: false,
    ...partial,
  };
  s.enemies.push(e);
  return e;
}

/** Keep the test field quiet: no waves will start. */
export function noWaves(s: EngineState): void {
  s.wave = { index: 1, startBeat: 1_000_000, hpMult: 1, spawns: [], nextSpawn: 0, kinds: [] };
}

export const ofType = <T extends EngineEvent['type']>(events: EngineEvent[], type: T) =>
  events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);

/** Run ticks and count how many distinct shots were fired. */
export function countShots(s: EngineState, ticks: number, inputs: (tick: number) => Input[] = () => []): number {
  const seen = new Set(s.projectiles.map((p) => p.id));
  let fired = 0;
  for (let i = 0; i < ticks; i++) {
    step(s, inputs(i));
    for (const p of s.projectiles) if (!seen.has(p.id)) { seen.add(p.id); fired++; }
  }
  return fired;
}
