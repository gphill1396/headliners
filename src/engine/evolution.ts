import { HEADLINERS } from '../content/headliners';
import type { EngineState } from './state';
import type { EvolutionId, HeadlinerId } from './types';

/** The headliners on this run: a Tour team of 3, or just the one. */
export function teamOf(state: EngineState): readonly HeadlinerId[] {
  return state.headliner.team ?? [state.headliner.id];
}

/** Is this headliner on the run? (Passives work for every member; the ability belongs to the lead.) */
export function hasMember(state: EngineState, id: HeadlinerId): boolean {
  return state.headliner.team ? state.headliner.team.includes(id) : state.headliner.id === id;
}

/** Which of its two forms a member chose, if it has evolved. */
export function evolutionIndex(state: EngineState, id: HeadlinerId): 0 | 1 | null {
  if (state.headliner.team) return state.headliner.evolutions?.[id] ?? null;
  return id === state.headliner.id ? (state.headliner.evolution ?? null) : null;
}

/** Members that haven't evolved yet this run. */
export function unevolved(state: EngineState): HeadlinerId[] {
  return teamOf(state).filter((id) => evolutionIndex(state, id) === null);
}

/** The evolution the lead took this run, if it has evolved (SPEC §4.7). */
export function evolution(state: EngineState): EvolutionId | null {
  const index = evolutionIndex(state, state.headliner.id);
  return index === null ? null : (HEADLINERS[state.headliner.id].evolutions[index]?.id ?? null);
}

/** Every evolution on the run (one per evolved member). */
export function evolutions(state: EngineState): EvolutionId[] {
  return teamOf(state).flatMap((id) => {
    const index = evolutionIndex(state, id);
    return index === null ? [] : [HEADLINERS[id].evolutions[index].id];
  });
}

export function evolvedInto(state: EngineState, id: EvolutionId): boolean {
  if (!state.headliner.team) return evolution(state) === id;
  return evolutions(state).includes(id);
}
