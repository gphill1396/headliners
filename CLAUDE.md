# Headliners — notes for Claude Code

- SPEC.md is the source of truth. Build phase by phase; don't start a later phase early.
- Current phase: **Phase 1b.** Done: simulator + D1–D8 report (`npm run sim`), balance pass (see SPEC Phase 1b balance pass), adaptive groove, the beat never stops, Lyra and Clatter (one headliner per run, each with its own deck and instrument family; see SPEC "Phase 1b progress"). All 8 enemies and speaker placement (Side Fill) are in; see SPEC "Phase 1b progress". The Hush is in, and cards in hand show only cost and name (keep on-screen text light: Cass found it overstimulating). The full card set (43) is in; each starter deck carries its headliner's own answers. Evolutions are in (after wave 5). All D1–D8 pass, several right on the line. Phase 1b leftovers: discard-cycle, drag-to-play, long-press enemy info, card text generated from effect data. Rerun the sim after every content change.
- Engine rules (src/engine/, src/content/): pure TS, no DOM/React/Node, no Math.random, Math.pow/exp/log or clocks, plain JSON-safe state, all randomness via `rng.ts`, all time in ticks via `clock.ts`. `npm run typecheck` and `tests/engine-purity.test.ts` enforce this.
- Card effects are data built from small combinable parts in src/content/ (see `src/engine/types.ts`), not one-off code.
- Tests use `node:test` + `tsx` (`npm test`). Keep the 10,000-tick determinism test passing.
- If a depth threshold (D1–D8) fails, propose balance changes; don't loosen the threshold.
- All play input stays in the bottom ~38% of the screen. Sound off must be fully playable.
- After each step, summarize what's done, which acceptance criteria pass, and any spec deviations. Ask before deviating.
