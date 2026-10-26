import { HEADLINERS } from '../content/headliners';
import type { EngineState } from './state';
import type { EvolutionId } from './types';

/** The evolution the headliner took this run, if it has evolved (SPEC §4.7). */
export function evolution(state: EngineState): EvolutionId | null {
  const index = state.headliner.evolution;
  if (index === undefined || index === null) return null;
  return HEADLINERS[state.headliner.id].evolutions[index]?.id ?? null;
}

export function evolvedInto(state: EngineState, id: EvolutionId): boolean {
  return evolution(state) === id;
}
