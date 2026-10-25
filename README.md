# Headliners

A portrait card-combo horde game for killing time on a phone. The full design is in [SPEC.md](SPEC.md).

**Play:** https://gphill1396.github.io/headliners/ — on iPhone, open in Safari, then Share → Add to Home Screen.

## Status

Phase 1b is under way. Pick a headliner on the title screen — Thrum the drum drake (rhythm), Lyra the serpent bard (gates and multipliers) or Clatter the kobold road crew (Roadie swarms) — each with their own starter deck, ability and band sound. Play against Shamblers, Brutes and Swarmlings in endless Encore waves, with chains, Echo, Downbeat, card picks every 3 waves, an adaptive soundtrack and save/resume. `npm run sim` plays thousands of bot runs and checks the depth thresholds. Next: the other enemy types, The Hush, the full card set and evolutions.

**How to play:** tap a card, then tap a lane on the beat. The wide amber light is beat one. Off-beat plays break your chain.

## Develop

```sh
npm install
npm run dev        # local dev server
npm test           # engine tests (node:test via tsx)
npm run typecheck  # app, tests, and the engine purity check
npm run build      # production build into dist/
npm run sim        # depth simulator: bots play the real engine, checks D1–D8 (SPEC §9)
```

Pushing to `main` runs typecheck, tests and build, then deploys to GitHub Pages.

## Layout

| Path | What lives there |
|---|---|
| `src/engine/` | Pure, deterministic rules. No DOM, React, `Math.random` or clocks. |
| `src/render/` | Canvas drawing for the field. |
| `src/ui/` | React screens and the runner that drives the engine from real time. |
| `public/` | Web app manifest, service worker, icons. |
| `src/content/` | Cards, enemies and headliners as data. |
| `src/audio/` | Synth voices and the adaptive groove (the board is the band). |
| `sim/` | Depth simulator: bot players, D1–D8 report. Results land in `sim/out/`. |
| `tests/` | Engine rules tests, including the 10,000-tick determinism check. |

The engine purity rule is enforced twice: `tsconfig.engine.json` compiles `src/engine` with no DOM types, and `tests/engine-purity.test.ts` rejects forbidden APIs and package imports.
