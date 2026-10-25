# Headliners — notes for Claude Code

- SPEC.md is the source of truth. Build phase by phase; don't start a later phase early.
- Current phase: **Phase 0 done → Phase 1 next** (core loop + Encore). Follow the order in the kickoff: engine rules with tests → simulator + D1–D8 report → canvas/UI → Encore, save/resume, audio.
- Engine rules (src/engine/, src/content/): pure TS, no DOM/React/Node, no Math.random or clocks, plain JSON-safe state, all randomness via `rng.ts`, all time in ticks via `clock.ts`. `npm run typecheck` and `tests/engine-purity.test.ts` enforce this.
- Card effects are data built from small combinable parts in src/content/, not one-off code.
- Tests use `node:test` + `tsx` (`npm test`). Keep the 10,000-tick determinism test passing.
- If a depth threshold (D1–D8) fails, propose balance changes; don't loosen the threshold.
- All play input stays in the bottom ~38% of the screen. Sound off must be fully playable.
- After each step, summarize what's done, which acceptance criteria pass, and any spec deviations. Ask before deviating.
