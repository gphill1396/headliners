import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * SPEC §2: the engine is pure TypeScript — no DOM, no React, no Math.random,
 * no wall-clock time. tsconfig.engine.json enforces "no DOM" at compile time;
 * this test catches the rest.
 */
const ROOT = join(import.meta.dirname, '..');
const ENGINE_DIRS = ['src/engine', 'src/content'];

const FORBIDDEN: [RegExp, string][] = [
  [/Math\.random\s*\(/, 'Math.random — use src/engine/rng'],
  [/\bDate\b/, 'Date — engine time is ticks'],
  [/\bperformance\s*\./, 'performance timers — engine time is ticks'],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, 'timers — the runner drives the engine'],
  [/\b(window|document|navigator|localStorage)\b/, 'browser globals'],
  [/\bprocess\./, 'Node globals'],
  [/from\s+['"](?!\.\.?\/)[^'"]+['"]/, 'non-relative import — engine must not depend on packages'],
  [/\bstructuredClone\b/, 'structuredClone — use cloneState'],
];

function files(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(files(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Strip comments so documentation can mention forbidden things. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('engine and content code use no forbidden APIs or package imports', () => {
  const all = ENGINE_DIRS.flatMap((d) => files(join(ROOT, d)));
  assert.ok(all.length > 0, 'no engine files found');
  const problems: string[] = [];
  for (const file of all) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const [pattern, why] of FORBIDDEN) {
        if (pattern.test(line)) problems.push(`${relative(ROOT, file)}:${i + 1} ${why}\n    ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
