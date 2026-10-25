# Headliners — Game Spec

A portrait card-combo horde game for killing time on a phone, with real depth.

You play as a fantasy band on tour. You pick three headliners (dragon-like creatures that evolve), build a deck, and hold back escalating hordes. Cards summon units, gates and riffs onto the field. Synergies chain into combos, and playing on the beat multiplies them.

- **Owner:** Grant (gphill1396)
- **Use:** personal, hosted on GitHub Pages
- **Status:** v0.1 spec

---

## 1. Design pillars

These rank in this order. When two conflict, the higher one wins.

1. **Not shallow.** Every few seconds there's a real choice. No dominant strategy. The skill ceiling is high. Depth is *tested* (§9), not assumed.
2. **Satisfying chains.** Big combos and number-go-up moments are visible and readable. You can see *why* the number got big.
3. **Kills time anywhere.** Works for 2-minute or 30-minute sessions. Pauses instantly, resumes mid-wave, saves continuously.
4. **Sound off first.** Everything is readable without audio. Sound is an enhancement.
5. **Honest.** No energy timers, no ads, no fake choices, no fake urgency.

### Influences (what to take from each)

| Source | Take |
|---|---|
| Horde/gate mobile ads | Escalating hordes, gates that multiply projectiles, ever-bigger threats |
| Magic Arena / Commander | Keyword synergies, rule-changing cards, build-around commanders |
| Yu-Gi-Oh | Cards become units and objects on the field |
| 3-dragon evolution game | Team of 3 creatures that level, evolve and swap |
| Wordle | One shared daily seed with a shareable result |
| Bus Unblock | Logic-puzzle side mode (Phase 4) |
| Slay the Spire / Balatro | Run drafting, escalating difficulty tiers, scoring that breaks open |

---

## 2. Platform & tech

- **Stack:** React + TypeScript, built with Vite.
- **Rendering:**
  - The playfield is drawn on HTML Canvas 2D.
  - Menus, the hand and overlays are React.
- **Engine:** pure TypeScript in `src/engine/`.
  - No DOM, no React, no `Math.random`, no wall-clock time.
  - Runs on a fixed timestep (60 ticks/sec) with a seeded random number generator.
  - It must run headless in Node, for the simulator and tests.
- **Determinism:** the same seed plus the same inputs gives the same result. This is required for the daily seed, replays and the simulator.
- **Installable web app:** add-to-home-screen, works offline, full-screen in portrait.
- **Saves:** stored on the device.
  - The full run state saves every bar, and whenever the app goes to the background.
  - The save format is versioned, with migrations between versions.
- **Hosting:** GitHub Pages, deployed by a GitHub Actions workflow on every push to `main`.
  - Set the Vite `base` path to match the repo name.
- **Testing:**
  - Unit tests for the engine (rules, keywords, chain resolution, determinism).
  - The simulator (§9) runs as an npm script.
- **Performance target:** a steady 60 fps on a recent iPhone with 300 enemies and 1,000 projectiles on screen. Reuse objects instead of creating new ones every frame.
- **No outside assets that need licensing.**
  - Sprites are drawn in code or as original pixel art.
  - Sound is synthesized with the Web Audio API.
  - Fonts come from Google Fonts or are bundled open-license fonts.

### Repo layout

```
src/
  engine/      # pure TS rules: state, tick, beat clock, cards, keywords, chain, enemies, waves
  content/     # data: cards, headliners, enemies, waves, bosses
  render/      # canvas drawing, sprites, effects, damage numbers
  ui/          # React screens, hand, overlays, menus
  audio/       # Web Audio synth (drums on beat, combo stingers)
  save/        # serialization, migrations
sim/           # headless simulator + bots + report
tests/
.github/workflows/deploy.yml
```

---

## 3. Screen layout (portrait, two thumbs)

```
┌───────────────────────────┐
│ HUD: wave · score · crowd │  ~6%
├───────────────────────────┤
│                           │
│   FIELD (3 lanes)         │  ~56%
│   enemies march DOWN      │
│   gates sit mid-lane      │
│   units at the bottom     │
│   stage edge ─────────    │
├───────────────────────────┤
│ beat bar · energy · chain │  ~6%
│ [card][card][card][card][card] │  CONTROL ZONE
│ [ L ][ M ][ R ] lane targets│  ~32% (iOS keyboard height)
└───────────────────────────┘
```

- **All input is in the bottom ~38%**, where the iOS keyboard sits. Nothing above the field divider needs a tap during play. Tapping the field only opens an info view.
- **Two-thumb flow:** select a card with one thumb, tap a lane with the other. Dragging a card onto a lane also works.
- **Long-press a card** to open full card text and keyword definitions.
- Respect the phone's safe areas, including the home indicator.
- Minimum touch target: 44 × 44 pt.

---

## 4. Core mechanics

### 4.1 Field

- There are 3 lanes. Enemies spawn at the top and march down.
- Each lane has **2 gate slots** (mid-lane) and **3 unit slots** (bottom).
- Units auto-fire straight up their lane.
- **Gates:** when a projectile passes through a gate, the gate changes it.
  - Examples: ×2 copies, +3 damage, gains Pierce.
  - This is the horde-ad loop, but you choose and place the gates.
- **Crowd meter:** an enemy that reaches the stage edge costs crowd, scaled by the enemy. The run ends when crowd hits 0.

### 4.2 Beat clock

- The game runs in 4/4 time. The tempo starts at 100 BPM and rises with wave tier.
- **Card plays are quantized:** a card you commit resolves on the *next beat*.
- **Timing grades:** if your commit lands inside a window before the beat, you get a grade.
  - **Tight:** ±60 ms, gives ×1.5 to that card's effects.
  - **Good:** ±120 ms, gives ×1.2.
- **Downbeat** cards gain their bonus when they resolve on beat 1 of a bar.
- The beat is always visible as a pulsing bar in the control zone, marked for beat 1 vs beats 2–4. Haptics fire where the device supports them.
- **Accessibility setting:** "relaxed timing" doubles the windows. Daily scores record whether it was on.

### 4.3 Energy, hand, deck

- You gain 1 energy per beat, up to a cap of 10.
- Cards cost 0–7 energy.
- Hand size is 5. You redraw up to 5 at the start of each bar.
- Each card in your hand can be **Discard-cycled** once per bar for 1 energy.
- **Deck sizes:**
  - Tour starts with 12 starter cards and grows through drafting.
  - Collection decks are 20–30 cards, with a max of 2 copies of each card.

### 4.4 Card types

| Type | What it does |
|---|---|
| **Unit** | Occupies a unit slot. Fires automatically. Has stats: damage, fire rate, keywords. |
| **Gate** | Occupies a gate slot. Changes projectiles that pass through it. Has durability. |
| **Riff** | One-shot effect (instant) that resolves on the beat. |
| **Amp** | Stays on the field and changes rules for a lane or globally, like an MTG enchantment. Limit of 2 Amps active. |

### 4.5 Keywords (Phase 1 set — keep it small, make it interact)

| Keyword | Effect |
|---|---|
| **Pierce N** | Projectile passes through N extra enemies |
| **Splash** | Deals 50% damage around the point of impact |
| **Echo** | The effect happens again on the next beat (once) |
| **Downbeat** | Bonus if it resolves on beat 1 |
| **Volume X** | Gains +1 Volume counter each time it triggers; scales by X per counter |
| **Encore** | Triggers when the current chain reaches 3+ links |
| **Roadie** | Creates a small token unit |
| **Feedback** | Strong effect, but deals damage to your own crowd or a gate |
| **Anti-Air** | Can hit Flying enemies |

### 4.6 Chains (the combo engine)

- Every trigger that happens within the same beat links into a **chain**.
- **Chain multiplier:**
  - ×1 for the first link, then +0.25 for each link after it.
  - Tight timing on the card that starts the chain adds +0.5.
- **Chain resolution must be readable:**
  - Each link shows as a small labeled pop: card name → effect → number.
  - The chain counter in the control zone counts up.
  - A big chain (8+) gets a screen-shake/flash moment that can be turned down in settings.
- **Loop guard:** a chain caps at 50 links. When it hits the cap, it **resolves as a "Showstopper"** for a big flat bonus. The engine must never hang on an infinite loop; this cap is how it detects and ends one.

### 4.7 Headliners (team of 3)

- Before a run, you choose 3 headliners. Each one:
  - Defines an archetype, by adding a passive and **signature cards** to the draft and collection pools.
  - Has a single active ability with a cooldown in beats, triggered by a button in the control zone.
  - Levels up from XP earned in runs. At set levels it **evolves along a branch: choose A or B**. Evolutions are permanent per headliner in Collection, but chosen fresh in each Tour run.
- **Swapping** a headliner in Collection changes which signature cards your decks can include.

**Phase 1 headliners:**

**Thrum — the drum drake (rhythm / on-beat)**
- Passive: Tight hits give +1 energy (once per bar).
- Evolution A, **Metronome**: the timing windows widen, and every Tight extends the chain.
- Evolution B, **Polyrhythm**: alternating lanes on consecutive beats doubles Echo.

**Lyra — the serpent bard (gates / multipliers, number go up)**
- Passive: Gates have +1 durability.
- Evolution A, **Crescendo**: gates gain +5% multiplier for every 10 projectiles that pass through them.
- Evolution B, **Harmony**: two gates in the same lane combine their effects.

**Clatter — the kobold road crew (swarm / tokens)**
- Passive: Roadie tokens have +1 damage.
- Evolution A, **Load Out**: when a token dies, it creates a Riff card in your hand.
- Evolution B, **Mosh Pit**: tokens gain Splash once you have 6 or more.

### 4.8 Enemies (Phase 1)

Each enemy type exists to demand a different answer.

| Enemy | Trait | Demands |
|---|---|---|
| Shambler | Basic | — |
| Brute | Armored: −N damage on every hit | Big individual hits, not many tiny ones |
| Swarmlings | Arrive in packs of 12, low HP | Splash, Pierce |
| Bat | Flying | Anti-Air |
| Splitter | Splits into 3 when it dies | Splash or overkill |
| Shieldbearer | Blocks frontal hits in its lane | Pierce, attacks from side lanes |
| Hexer | Aura: disables the nearest gate | Burst it down fast |
| Breaker | Targets and destroys gates | Units with priority targeting |

**Phase 1 boss: The Hush** (every 10th wave in Encore)
- Phase 1: shields the other enemies.
- Phase 2: mutes the beat. Timing bonuses are disabled and the beat bar goes dim.
- Phase 3: a periodic wave of Brutes.
- *Why:* it punishes decks that rely on only one thing.

### 4.9 Waves and scaling

- Waves are generated from the seed, with templates per tier.
- Every wave's mix must include **at least 2 enemy traits** from Wave 3 onward.
- Enemy health scales exponentially per tier, and player multipliers must be able to keep up. Long runs should get into **huge numbers**.
- **Number formatting:**
  - Plain numbers below 1,000.
  - Then suffixes: K, M, B, T, aa, ab…
  - A setting switches to scientific notation.
- Damage numbers pop on screen, grouped together so they don't become noise.

---

## 5. Modes

| Mode | Phase | Summary |
|---|---|---|
| **Encore** | 1 | Endless waves for a high score. Uses a fixed starter deck plus 3 headliners. |
| **Tour** | 2 | Roguelike run. You travel a node map of gigs, choosing among fights, card drafts, rests, shops and events, with an elite and a boss each act. 3 acts. |
| **Collection** | 2 | Persistent save. Level and evolve headliners, unlock cards, and build decks in the Workshop. |
| **Daily Setlist** | 3 | One shared seed per day, with a fixed starting deck and headliners. One scored attempt. Gives a shareable emoji result. |
| **Heat** | 3 | Escalating difficulty tiers (1–10) that unlock after you clear Tour. Each tier adds a rule modifier. |
| **Load-In** | 4 | Logic puzzle where you slide gear cases to get the van loaded, in the spirit of Bus Unblock. Daily and pack levels. |

---

## 6. Content targets

| Phase | Cards | Headliners | Enemies | Bosses |
|---|---|---|---|---|
| 1 | ~40 (12 starter + ~9 signature per headliner + neutrals) | 3 | 8 | 1 |
| 2 | ~90 | 5 | 12 | 3 |
| 3 | ~130 | 6 | 14 | 4 |

- Content lives in `src/content/` as typed data.
- Card effects are made from **small effect parts that combine** — triggers, conditions, actions — rather than one-off code. This is how keywords end up interacting with each other.
- Every card has: id, name, type, cost, rarity, headliner tag (if any), keywords, rules text (generated from the effect data where possible), and flavor text.

---

## 7. Save, resume & session behavior

- When the app goes to the background:
  - The game pauses instantly.
  - It saves a snapshot of the full engine state, including the random number state.
- When you reopen the app:
  - It goes to a "Resume" screen and stays paused.
  - Tapping Resume shows a 1-bar count-in before play continues.
- Mid-run state survives closing the app and reloading the page.
- Settings and meta-progress (Collection, unlocks, personal bests) are stored separately from run state.
- **Export/import save** to a file, as a backup.

---

## 8. Audio, haptics, visuals

- **Sound off by default is fully playable.** Every audio cue has a visual equivalent.
- **Sound on adds:**
  - A synthesized drum loop locked to the beat clock.
  - Hits and chain stingers pitched up as the chain grows.
  - A Tight-hit accent.
- Haptics fire on Tight hits and on 8+ chains, where supported. Note: iOS Safari doesn't support the web vibration API, so visuals must carry everything.
- **Art direction:** GBA-era pixel look.
  - A limited palette (one main palette plus one for each headliner).
  - Pixel-perfect scaling.
  - Clear silhouettes so each enemy is readable at small sizes.

---

## 9. Depth assurance — the simulator

A headless simulator in `sim/` runs the real engine with bot players. Run it with `npm run sim -- --runs 2000 --mode encore`.

**Bots:**
- `random`: plays a random legal action.
- `greedy`: plays the highest immediate value.
- `archetype`: one per headliner. Prioritizes that headliner's signature cards and synergies, with simulated timing accuracy.
- `timingSkill`: a setting from 0–1 that controls how often the bot hits Tight timing.

**Report** (written as JSON and printed as a summary):
- Average wave reached and score, for each bot and each headliner.
- How often each card appears in the decks of top-25% runs.
- Each card's share of total damage.
- Which enemy types and what situations most often cause a loss.
- Average number of meaningful choices per bar: legal affordable plays with clearly different outcomes.
- Highest chain length reached, and how often the 50-link cap triggered.

**Depth acceptance thresholds.** CI prints a warning when these fail. Treat a failure as a balance bug.

| ID | Criterion |
|---|---|
| D1 | Skill matters: archetype bots reach a median wave at least **3×** higher than random bots. |
| D2 | Timing matters: archetype bots with timingSkill 0.9 score at least **1.5×** higher than with 0.2. |
| D3 | No solved headliner: the best headliner's median wave is no more than **1.4×** the worst's. |
| D4 | No must-pick card: no single card is in more than **40%** of top-25% decks across all archetypes. |
| D5 | No single damage source: in winning runs, no one card produces more than **35%** of total damage on average. |
| D6 | Every enemy matters: each enemy type is the top cause of at least **5%** of losses. |
| D7 | Real choices: the median number of meaningful choices per bar is at least **2**. |
| D8 | Infinite loops are rare: the 50-link cap triggers in fewer than **1%** of runs. |

---

## 10. User stories & acceptance criteria

### Phase 0 — Foundation

**S0.1 Deploy pipeline**
*As Grant, I want the game deployed to GitHub Pages automatically, so I can play the latest build on my phone.*
- [ ] Pushing to `main` builds the game and deploys it to Pages through Actions.
- [ ] The site loads correctly at the `/<repo>/` path, with no broken links to scripts or images.
- [ ] It can be added to the iOS home screen and opens full-screen in portrait.
- [ ] After the first visit, it loads and plays with no connection.

**S0.2 Deterministic engine core**
*As a developer, I want a pure, seeded engine, so the daily seed, replays and the simulator all work.*
- [ ] The engine has no imports from the DOM or React and runs in Node.
- [ ] Given the same seed and inputs, running 10,000 ticks produces the same final state (tested by comparing a hash of the state).
- [ ] The beat clock, tick loop and random number generator are each unit-tested.

### Phase 1 — Core loop + Encore

Phase 1 is built in two steps, so the feel can be judged on a phone before content is scaled up.

**Phase 1a — Vertical slice.** One headliner (Thrum) and about 12 cards: 3 units, 3 gates, 5 riffs and 1 amp. 3 enemy types: Shambler, Brute and Swarmlings. Includes chains with the multiplier and Showstopper cap, Echo, Downbeat and Encore, and Encore waves with crowd and game over. Save/resume is in. No sound yet.
- *Slice addition:* every 3 waves, Encore offers a **card pick** (choose 1 of 3 to add to your deck, or skip), so long runs grow. To be revisited with the simulator in 1b.
- *Slice simplifications:*
  - Card text is hand-written for now, not yet generated from effect data.
  - No discard-cycle.
  - No drag-to-play.
  - No long-press: tapping a card shows its text.
  - Evolutions appear as a preview only.

**Phase 1b — Fill out.** Adds the simulator and the D1–D8 report, then tunes the slice against it. Then adds Lyra and Clatter, the other 5 enemy types, The Hush, the full ~40 cards, evolutions, the remaining keywords, audio, discard-cycle and drag-to-play.

**S1.1 Play a card into a lane**
*As a player, I want to select a card and tap a lane with my two thumbs, so I can act fast without reaching up.*
- [ ] Every play input is inside the bottom ~38% of the screen.
- [ ] Two ways to play: select, then tap a lane; or drag the card onto a lane.
- [ ] The card is visibly queued and resolves on the next beat.
- [ ] A card you can't afford, or a lane or slot that isn't valid, shows the reason without opening a dialog.

**S1.2 Beat and timing**
*As a player, I want to see the beat and be rewarded for hitting it, so rhythm skill matters even with the sound off.*
- [ ] The beat bar pulses, with beat 1 shown distinctly.
- [ ] After each commit, a Tight / Good / Off grade shows for about 300 ms.
- [ ] The timing multipliers apply as described in §4.2. Covered by unit tests.
- [ ] Relaxed timing mode doubles the windows.

**S1.3 Chains are visible and satisfying**
*As a player, I want to watch a combo resolve link by link, so I understand why the number got huge.*
- [ ] Each link shows a labeled pop: source → effect → value.
- [ ] The chain counter and multiplier update live.
- [ ] Chains of 8 or more trigger the big-chain moment, which can be reduced in settings.
- [ ] The 50-link cap converts into a Showstopper, and the engine never freezes.

**S1.4 Gates multiply projectiles**
*As a player, I want to place gates that multiply what passes through them, so I get the horde-ad payoff with my own decisions.*
- [ ] Projectiles visibly change when they pass through a gate: copies, damage, keywords.
- [ ] Gate durability shows on the gate. Breakers and Hexers interact with gates as specified.
- [ ] 1,000 or more projectiles on screen stay at 60 fps on a recent iPhone.

**S1.5 Headliners**
*As a player, I want to pick 3 headliners that change how I play, so each run feels different.*
- [ ] There's a select screen with all 3 headliners, showing their passive, active ability and signature cards.
- [ ] Active abilities are in the control zone and show their cooldown in beats.
- [ ] Phase 1 shows the evolution branches as a preview. They're fully playable in Encore after a set number of waves.

**S1.6 Enemies demand answers**
*As a player, I want enemies that need specific tools, so I have to think about my build.*
- [ ] All 8 enemy types are implemented with their traits, each with a unit test.
- [ ] From wave 3 onward, every wave mixes at least 2 traits.
- [ ] Long-press an enemy to see its trait.
- [ ] The Hush boss arrives every 10th wave, with 3 phases.

**S1.7 Encore mode**
*As a player, I want endless waves that escalate into huge numbers, so I can chase a high score.*
- [ ] Waves scale per §4.9. Numbers format with suffixes, or scientific notation as a setting.
- [ ] The game-over screen shows: wave, score, best chain, and a damage breakdown by card (top 10).
- [ ] Personal bests are saved.

**S1.8 Pause, resume, never lose a run**
*As Grant, I want to put the phone down at any time and pick up exactly where I was.*
- [ ] Leaving the app pauses and saves within 100 ms.
- [ ] Reopening, even after the app was fully closed, restores the exact state, behind a Resume screen with a 1-bar count-in.
- [ ] A manual pause button sits in the control zone.

**S1.9 Sound as enhancement**
*As a player, I want the game fully playable silent, with sound making it better.*
- [ ] Audio is off by default and switched on in settings.
- [ ] With sound on, the synthesized drum loop stays locked to the beat clock (drift under 10 ms over 5 minutes) and chain stingers rise in pitch.
- [ ] Every audio cue has a visual equivalent.

**S1.10 Simulator + depth report**
*As Grant, I want proof the game isn't shallow before I get bored of it.*
- [ ] `npm run sim` runs the bots from §9 and writes the report.
- [ ] D1–D8 are evaluated and printed as pass or fail.
- [ ] CI runs a small simulation (200 runs) on every push and prints a warning if a threshold fails.

### Phase 2 — Tour + Collection

**S2.1 Tour run**
*As a player, I want a roguelike tour with drafting and branching paths, so every run builds a different deck.*
- [ ] There are 3 acts, each with a node map: fight, elite, draft, rest, shop, event, boss.
- [ ] Drafts offer a choice of 3 cards weighted toward your headliners, with a skip option.
- [ ] Evolutions are chosen during the run when a headliner reaches the right level.
- [ ] You can save and resume at any point on the map or mid-fight.

**S2.2 Collection & Workshop**
*As Grant, I want to tinker with decks the way I tune Commander decks, with real stats.*
- [ ] Deck builder enforces 20–30 cards, max 2 copies, and limits signature cards to your active headliners.
- [ ] Deck stats show: cost curve, keyword counts, card types, and synergy links between cards.
- [ ] Each card tracks its history: games played, average damage share, and wins.
- [ ] You can save up to 10 deck lists.

**S2.3 Content expansion**
- [ ] 2 new headliners, 4 new enemies and 2 bosses are added, all following §4 and §6.
- [ ] The simulator thresholds still pass after they're added.

### Phase 3 — Daily Setlist + Heat

**S3.1 Daily Setlist**
*As a player, I want one shared daily challenge, Wordle-style.*
- [ ] The seed comes from the date (UTC). Everyone gets the same waves, deck and headliners.
- [ ] One scored attempt per day. Practice runs afterward are marked as unscored.
- [ ] A share button copies an emoji summary: wave reached, best chain, a timing grade row, and whether relaxed timing was on.

**S3.2 Heat tiers**
- [ ] Heat 1–10 unlock in order after clearing Tour. Each adds one rule modifier.
- [ ] The highest Heat cleared is tracked per headliner.

### Phase 4 — Load-In + polish

**S4.1 Load-In puzzles**
- [ ] A sliding-block puzzle where you clear gear cases so the van can be loaded. Includes a daily puzzle and a pack of 30 hand-checked levels.
- [ ] Every level is verified as solvable by a solver script, which also reports the minimum number of moves.
- [ ] Includes undo, restart, and a move counter with par.

---

## 11. Out of scope (for now)

- Accounts, online leaderboards, multiplayer.
- Purchases or ads of any kind.
- Licensed music, art or characters.

---

## 12. Open questions

- Should the field get a lane-swap mechanic (moving units sideways) in Phase 2?
- Should the Daily Setlist have a light leaderboard (paste-based, no backend)?
- How do Heat modifiers interact with the daily seed?
