import { gradeMultiplierPct } from './clock';
import { ENGINE_STATE_VERSION, type EngineState } from './state';

/**
 * JSON with object keys sorted, so the same state always produces the same
 * string regardless of the order properties were created in.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`canonicalJson: non-finite number ${value}`);
    }
    if (value === undefined) throw new TypeError('canonicalJson: undefined is not allowed in state');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** 53-bit string hash (cyrb53), returned as fixed-width hex. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

/** Fingerprint of the full state, used by determinism tests and replays. */
export function hashState(state: EngineState): string {
  return hashString(canonicalJson(state));
}

/** Serialize for saving. */
export function toSnapshot(state: EngineState): string {
  return canonicalJson(state);
}

/** Restore from a save. Older versions are migrated here as the format grows. */
export function fromSnapshot(snapshot: string): EngineState {
  const parsed = JSON.parse(snapshot) as Partial<EngineState>;
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
    throw new Error('fromSnapshot: not an engine snapshot');
  }
  if (parsed.version > ENGINE_STATE_VERSION) {
    throw new Error(`fromSnapshot: snapshot v${parsed.version} is newer than engine v${ENGINE_STATE_VERSION}`);
  }
  if (parsed.version < 2) {
    // v1 was the Phase 0 rhythm sandbox; its state has nothing a real run can use.
    throw new Error(`fromSnapshot: v${parsed.version} saves are from the Phase 0 sandbox and can't be resumed`);
  }
  // v2 → v3: added `mode`. Every v2 save was a real Encore run.
  if (parsed.version === 2) {
    parsed.mode = 'encore';
    parsed.version = 3;
  }
  // v3 → v4: continuous accuracy and the pocket.
  if (parsed.version === 3) {
    parsed.pocket = { depth: 0, avgOffsetMilli: 0 };
    for (const q of parsed.queue ?? []) {
      q.accuracyPct ??= gradeMultiplierPct(q.grade);
      q.chainStepPct ??= q.grade === 'tight' ? 20 : q.grade === 'good' ? 8 : 0;
    }
    if (parsed.chain) delete (parsed.chain as { tightStart?: boolean }).tightStart;
    parsed.version = 4;
  }
  return parsed as EngineState;
}

/** Deep copy via snapshot round-trip (state is plain data by contract). */
export function cloneState(state: EngineState): EngineState {
  return fromSnapshot(toSnapshot(state));
}
