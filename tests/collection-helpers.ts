export { createState } from '../src/engine';
import type { EngineEvent } from '../src/engine';
export const ofTypeSafe = <T extends EngineEvent['type']>(events: EngineEvent[], type: T) =>
  events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
