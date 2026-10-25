import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOne } from '../sim/run';
import { evaluate } from '../sim/report';

test('the simulator plays full runs reproducibly', () => {
  const bot = { name: 'thrum', kind: 'archetype' as const, headliner: 'thrum' as const, timingSkill: 0.7 };
  const a = runOne(bot, 'sim-test');
  const b = runOne(bot, 'sim-test');
  assert.deepEqual(a, b);
  assert.ok(a.wave >= 3 && !a.capped);
  assert.ok(a.timing.tight + a.timing.good + a.timing.off > 20);
});

test('the report evaluates all eight checks', () => {
  const mk = (name: string, kind: 'random' | 'greedy' | 'archetype', skill: number, headliner: 'thrum' | 'lyra' | 'clatter' | 'rotate' = 'thrum') =>
    [0, 1, 2].map((i) => runOne({ name, kind, headliner, timingSkill: skill }, `t${i}`));
  const report = evaluate(
    {
      random: mk('random', 'random', 0, 'rotate'),
      greedy: mk('greedy', 'greedy', 0.6),
      thrum: mk('thrum', 'archetype', 0.7),
      lyra: mk('lyra', 'archetype', 0.7, 'lyra'),
      clatter: mk('clatter', 'archetype', 0.7, 'clatter'),
      'thrum-sharp': mk('thrum-sharp', 'archetype', 0.9),
      'thrum-sloppy': mk('thrum-sloppy', 'archetype', 0.2),
    },
    3,
  );
  assert.deepEqual(report.checks.map((c) => c.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']);
  assert.notEqual(report.checks.find((c) => c.id === 'D3')!.pass, null);
});
