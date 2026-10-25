# Headliners

A portrait card-combo horde game for killing time on a phone. The full design is in [SPEC.md](SPEC.md).

**Play:** https://gphill1396.github.io/headliners/ — on iPhone, open in Safari, then Share → Add to Home Screen.

## Status

Phase 1a (vertical slice) is in. You play Thrum, the drum drake, with 12 cards (units, gates, riffs and an amp) against Shamblers, Brutes and Swarmlings in endless Encore waves. It has chains, Echo, Downbeat and Encore, card picks every 3 waves, and save/resume. Next is Phase 1b: the depth simulator, then the full content set.

**How to play:** tap a card, then tap a lane on the beat. The wide amber light is beat one. Off-beat plays break your chain.

## Develop

```sh
npm install
npm run dev        # local dev server
npm test           # engine tests (node:test via tsx)
npm run typecheck  # app, tests, and the engine purity check
npm run build      # production build into dist/
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
| `tests/` | Engine rules tests, including the 10,000-tick determinism check. |

The engine purity rule is enforced twice: `tsconfig.engine.json` compiles `src/engine` with no DOM types, and `tests/engine-purity.test.ts` rejects forbidden APIs and package imports.
