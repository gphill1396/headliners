# Headliners

A portrait card-combo horde game for killing time on a phone. The full design is in [SPEC.md](SPEC.md).

**Play:** https://gphill1396.github.io/headliners/ — on iPhone, open in Safari, then Share → Add to Home Screen.

## Status

Your ren faire band fell through a portal into a land of monsters. Pick a headliner on the title screen — Thrum the war-drum drake (rhythm), Lyra the serpent lutenist (gates and multipliers), Clatter the kobold tinker (Squire swarms), Aria the siren (slow and hold the horde) or Riot the piper drake (spend crowd for big hits) — each with their own starter deck, ability and band sound (war drums, lute, hurdy-gurdy, voice and recorder, bagpipes). Play against twelve kinds of monster — Ghouls, Ogres, Spiderlings, Harpies, Slimes, Hags, Hobgoblins, Trolls, Wargs, Shamans, Wisps and Brood Mothers, each introduced on its own wave — in endless Encore waves, with chains, Echo, Downbeat, card picks every 3 waves, an adaptive soundtrack and save/resume. `npm run sim` plays thousands of bot runs and checks the depth thresholds. Every 10th wave a boss shows up: The Hush, The Black Knight and The Bone Wyrm take turns. Clean waves and long chains win crowd back. 62 cards in all, and after wave 5 your headliner evolves into one of two forms. Tap or drag cards onto lanes, long-press anything to read it, and Swap a card you don't want for 1 energy.

Two modes: **Encore** (endless waves for a high score) and **Tour** (three acts of shows, drafts, markets, inns and events, with a different boss at the end of each act). The **Collection** levels up your headliners, unlocks cards as you take them, and has a Workshop for building your own Encore decks, plus save backups.

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
