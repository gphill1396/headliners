# Headliners — Game Spec

A portrait card-combo horde game for killing time on a phone, with real depth.

You play as a fantasy band on tour. You pick three headliners (dragon-like creatures that evolve), build a deck, and hold back escalating hordes. Cards summon units, gates and riffs onto the field. Synergies chain into combos, and playing on the beat multiplies them.

- **Owner:** Grant (gphill1396)
- **Use:** personal, hosted on GitHub Pages
- **Status:** v0.1 spec

> **Direction from Grant (Oct 26), to apply next:**
> - **Theme:** you're a ren faire band transported to a fantasy world, protecting the crowd from monsters. Retheme pass right after Phase 2c part 2 (before teams of 3): headliner, card, enemy and boss names, flavor text, and instruments (lute, bagpipes, hurdy-gurdy, drums and so on).
> - **Art bar:** at minimum the level of *Metroid Fusion* (detailed, shaded GBA-style pixel sprites with animation frames). Claude hand-draws palette-indexed sprites; one character first so Grant can judge the bar before the rest. The current sprites are placeholders.

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
  - **Off:** gives ×0.75. Changed from ×1 in the Phase 1b balance pass, so timing is the skill.
- **Accuracy is continuous** (Grant's change, Phase 1b). A play's own effect scales with how close it lands to the beat: dead-on ×1.6, edge of Tight ×1.3, edge of Good ×1.05, Off ×0.75. The Tight/Good/Off grades still name the windows.
- **The pocket** rewards consistency, not perfection.
  - A Tight play that lands within ±25 ms of your own running average timing deepens the pocket by 1, up to 10.
  - A Tight play that drifts costs 1, a Good play costs 2, and an Off play empties it. If a chain lapses because you stopped playing, the pocket halves.
  - Each level adds +4% to all damage, including units firing on their own, for up to +40%.
  - Sitting a little behind the beat counts, as long as you stay there.
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
| **Priority** | Shots fly past other enemies to hit Breakers and Hexers first *(added in Phase 1b)* |
| **Speaker** | A gate that turns shots into the next lane over; side shots get past shields *(Grant's speaker placement, Phase 1b)* |

### 4.6 Chains (the combo engine)

- Every trigger that happens within the same beat links into a **chain**.
- **Chain multiplier:** each link raises it by how on-beat that play was: dead-on (±15 ms) +30%, Tight +20%, Good +8%. Automatic links (Echo, Downbeat triggers) add +5%. *(Changed in Phase 1b; it was a flat +25% per link plus a Tight-start bonus.)*
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

**Phase 1b: one headliner per run.** With only three headliners, a team of 3 would always be the same three, so for now you pick one on the title screen (it's remembered). It sets your starter deck, passive, ability and the band's instruments. Teams of 3 come back once there are more than three headliners (Phase 2). *(Deviation from S1.5, flagged to Grant.)*

**Phase 1 headliners:**

**Thrum — the drum drake (rhythm / on-beat)**
- Passive: Tight hits give +1 energy (once per bar).
- Evolution A, **Metronome**: the timing windows widen, and every Tight extends the chain (keeps it alive an extra beat).
- Evolution B, **Polyrhythm**: alternating lanes on consecutive beats doubles Echo.

**Lyra — the serpent bard (gates / multipliers, number go up)**
- Passive: every gate a shot passes through adds +1 damage. *(Balance pass: was "gates last longer", which barely mattered.)*
- Active, **Swell** (cooldown 16 beats): for 2 beats every gate works twice as hard — one more copy, double damage, one more pierce.
- Signature cards: Arpeggiator (unit, fires every eighth), Harmonizer (gate, ×3), Sustain Pedal (riff: +1 energy and repair gates, Echo), Resonance (amp: chain links repair every gate).
- Band: keys — electric piano arpeggios, a low chord tone on beat 1, a shimmer during Swell.
- Evolution A, **Crescendo**: gates gain +5% multiplier for every 10 projectiles that pass through them.
- Evolution B, **Harmony**: two gates in the same lane combine their effects.

**Clatter — the kobold road crew (swarm / tokens)**
- Passive: a Tight hit calls a Roadie to that lane (once per bar). *(Balance pass: was "+1 Roadie damage". The new one rewards timing, like Thrum's.)*
- Active, **All Hands** (cooldown 16 beats): a Roadie in every lane.
- **Roadies** are token units: 3 damage, fire every beat, leave after 8 beats. They take a free slot, or replace the oldest Roadie, never a real card. They blink in their last 2 beats and never enter the deck.
- Signature cards: Load-In (free riff: a Roadie here, Echo), Crew Chief (unit: a Roadie and a link every beat 1), Toolbox (gate: shots ignore armor), Mosh Pit (amp: every Roadie bursts on beat 1).
- Band: junkyard percussion — cowbell, clanks pitched per lane, a shaker keeping time.
- Evolution A, **Load Out**: when a token dies, it creates a Riff card in your hand.
- Evolution B, **Mosh Pit**: tokens gain Splash once you have 6 or more.

### 4.8 Enemies (Phase 1)

Each enemy type exists to demand a different answer.

| Enemy | Trait | Demands |
|---|---|---|
| Shambler | Basic | — |
| Brute | Armored: −N damage on every hit | Big individual hits, not many tiny ones |
| Swarmlings | Arrive in packs of 12, low HP | Splash, Pierce |
| Bat | Flying: shots pass under them until they swoop down near the stage | Anti-Air (Pyro), riffs |
| Splitter | Splits into 3 (30% health each) when it dies, unless one hit overkills it by half its health | Splash or overkill |
| Shieldbearer | Its shield blocks straight shots (and protects whoever is behind it) until it has blocked 8 + wave/2 shots | Pierce, Toolbox, attacks from side lanes (Side Fill speaker) |
| Hexer | Aura: switches off every gate ahead of it in its lane | Burst it down fast, Priority (Spotlight) |
| Breaker | Stops at each gate in its lane and smashes 10 durability a beat | Units with priority targeting (Spotlight) |

**Phase 2c enemies:**

| Enemy | Trait | Demands |
|---|---|---|
| Charger | Ambles at 55% speed, then sprints at 230% once it is past halfway | Slows, Hold, early burst (Heckle, Power Chord) |
| Medic | Priority. Every beat, heals the others in its lane 8% of their health (at most 12) | Priority shots and riffs: kill it first |
| Nest | Armor 1. Hatches 2 Swarmlings where it stands every 5 beats | Splash and big hits, fast |
| Ghost | Fades on beats 2 and 4: shots and riffs pass through | Timing: land riffs and Downbeats on 1 and 3 (no card is its answer) |

Debuts: Charger 9, Medic 11, Ghost 12, Nest 13. From wave 13, waves mix in 3 specials (was 3 from wave 15).

*As built in Phase 1b:* each enemy debuts on its own wave with a banner that explains it (Swarmlings 2, Brute 3, Bats 4, Splitter 5, Hexer 6, Shieldbearer 7, Breaker 8). Shamblers are the horde and walk in every wave; Swarmlings join them from wave 9. If an enemy is coming in the next 3 waves (or is already here) and your deck has nothing that answers it, the card pick offers an answer.

**Phase 1 boss: The Hush** (every 10th wave in Encore)
- Phase 1: shields the other enemies.
- Phase 2: mutes the beat. Timing bonuses are disabled and the beat bar goes dim.
- Phase 3: a periodic wave of Brutes.
- *Why:* it punishes decks that rely on only one thing.
- *As built in Phase 1b:*
  - It spans all three lanes, so shots and riffs from any lane hit it (Spotlight treats it as a priority target). It sinks toward the stage over 72 beats; reaching the stage costs 15 crowd. Beating it wins back 5.
  - 1200 health × the wave's health growth. Its phase follows its health: above 2/3, phase 1; above 1/3, phase 2; then phase 3.
  - Phase 1: other enemies take half damage. Phase 2: plays can't earn more than ×1.0 or a Good-sized chain step, the pocket doesn't grow, and Tight-hit passives pause (Off plays still cost you). The drums drop out of the music, leaving a held chord. Phase 3: a Brute every 6 beats.
  - The boss wave brings half the usual escort, and lasts until The Hush is gone.

**Phase 2c bosses: The Critic and Dead Air.** The three bosses take turns: The Hush on waves 10, 40, 70…, The Critic on 20, 50…, Dead Air on 30, 60…. In Tour, act 1 ends with The Hush, act 2 with The Critic, act 3 with Dead Air. Both span all lanes, sink over 72 beats, cost 15 crowd if they reach the stage and win back 5 if beaten.
- **The Critic** (1300 health, armor 6). Phase 1: armored (needs big hits). Phase 2: armor off, but *unimpressed*: plays keep your chain alive but it doesn't grow (no new links, no multiplier growth). Phase 3: calls a Medic every 6 beats.
- **Dead Air** (1400 health). Phase 1: flying, so only Anti-Air shots and riffs reach it. Phase 2: lands and calls a Ghost every 6 beats. Phase 3: rush, every other enemy moves 50% faster.
- *Why:* The Critic punishes leaning on one long chain; Dead Air punishes a deck with no Anti-Air or riffs and then tests timing (Ghosts).

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

- **Fully playable with sound off** (silent switch or setting). Every audio cue has a visual equivalent. Sound is on by default.
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

**Phase 1a — Vertical slice.** One headliner (Thrum) and about 12 cards: 3 units, 3 gates, 5 riffs and 1 amp. 3 enemy types: Shambler, Brute and Swarmlings. Includes chains with the multiplier and Showstopper cap, Echo, Downbeat and Encore, and Encore waves with crowd and game over. Save/resume and synthesized sound are in.
- *Slice addition:* a guided **soundcheck** (first-run tutorial). It has 9 steps, each teaching one idea and waiting for the player to do it. It is offered on first launch and replayable from the title.
- *Slice addition:* **adaptive groove** (Grant's idea): the board is the band.
  - Every unit is an instrument that plays exactly when it fires. Stagehand is the snare backbeat, Kick Drum the kick with its beat-1 burst, and Bassline plays bass over the chord progression.
  - Lanes are panned left, center and right.
  - Gates color their lane: Double Stop doubles the part, Overdrive distorts it, Fuzz filters it.
  - Riffs sound when they land.
  - Chain layers: a pad at 4+ links and a lead arpeggio at 8+. Both drop out within a beat when the chain breaks.
- *Slice addition:* the groove keeps playing, muffled, behind the **card pick**. After a pick the band comes back in on the next beat 1.
- *Slice addition:* **Chill music** setting: the same band, played sparser.
- *Slice addition:* **the beat never stops**.
  - A metronome starts on the first tap at launch.
  - Pause and card picks keep the band going, muffled.
  - At game over the band fades out over two bars into the metronome.
  - Every start and resume drops in on the running beat.
- *Slice addition:* **off-beat plays drop the chain**, so timing is the skill that keeps chains alive.
- *Slice addition:* every 3 waves, Encore offers a **card pick**: choose 1 of 3 to add to your deck, or skip, so long runs grow.
  - It ignores taps for 0.6 s after opening and only counts fresh taps.
  - It needs a tap on a card plus a confirm, so a play in progress can't pick by accident.
- *Slice simplifications:*
  - Card text is hand-written for now, not yet generated from effect data. *(Done in Phase 1b.)*
  - No discard-cycle. *(Done in Phase 1b.)*
  - No drag-to-play. *(Done in Phase 1b.)*
  - No long-press: tapping a card shows its text. *(Done in Phase 1b.)*
  - Evolutions appear as a preview only.

**Phase 1b balance pass (simulator-driven).** Every change was rerun through the depth report before it was kept.
- **Each wave is a song.** The chain resets when a new wave starts, so a Showstopper means 50 links within one song. (Fixed D8: cap hit in 37% of runs, now 0%.)
- **Kick Drum:** the downbeat burst drops from 3 shots to 2. Copies of the same card add one chain link per bar between them, not one each. (D5: Kick Drum damage share went from 41% to 27%.)
- **Off-beat plays land at ×0.75.** (D1 and D2: timing is the skill.)
- **Shamblers come in pairs** (12 HP each). **Brute leaks cost 4 crowd**, down from 5. (D6: every enemy type matters.)
- Tried and reverted: Brute armor 2 / 85 HP. Brutes then caused 94% of losses, and random play got relatively stronger.
- **Results** at 200 runs per bot:
  - D1 3.4×, D2 4.25×, D5 32.8%, D6 6.0% (minimum), D7 3.0, D8 0% — all pass.
  - D3 is n/a: only one headliner.
  - D4 can't be judged with a 12-card pool. Only 3 cards sit outside the starter deck, so any sensible picker takes them. Revisit at full content.

**Phase 1b progress — Lyra and Clatter** (done):
- Headliner pick on the title screen; each headliner has its own 12-card starter deck, and card picks offer neutral cards plus only that headliner's signature cards.
- The ability button, banner and colors follow the headliner.
- New effect parts: `roadie` (token units with a lifespan), `repairGates`, `volley` with `tokensOnly`; amps can trigger on beat 1; new gate kind **Shred** (shots ignore armor).
- The simulator has one archetype bot per headliner; random and greedy bots rotate headliners. D1 is checked for every headliner (the weakest must clear 3×), and D3 is now measured.
- Balance pass for the new headliners, each rerun through the report:
  - First cut: Lyra 12 and Clatter 12 median waves vs Thrum 15 (D1 2.4×). Both were short on energy compared with Thrum's Tight-hit refund.
  - **Sustain Pedal** gains +1 energy (repair 15 → 10). Lyra 12 → 16.
  - **Load-In** becomes free and puts 1 Roadie down with Echo (was cost 1 for 2 Roadies). **Crew Chief** costs 2 (was 3).
  - **Toolbox** becomes the Shred gate (was Pierce 1): Clatter lost 100% of runs to Brutes, whose armor 3 cancels Roadie shots.
  - Tried and reverted: "Roadies ignore armor" as Clatter's passive. It made Clatter strong even for the random bot, so skill mattered less (D1 fell to 2.0×). Two Toolboxes in the starter deck: no change.
- **Results** at 200 runs per bot (before the new enemies): median wave Thrum 15, Lyra 16, Clatter 15, random 5.
  - D1 3.00× (Thrum and Clatter; Lyra 3.2×), D2 4.9×, D3 1.07×, D5 26.9%, D6 5.1% (Swarmlings), D7 3.0, D8 0% — all pass. D1 and D6 sit right on the line.
  - D4 still can't be judged (each headliner's pick pool is about 15 cards).

**Phase 1b progress — the other 5 enemies and speaker placement** (done):
- Bats, Splitter, Shieldbearer, Hexer and Breaker, each with a unit test, a sprite, a debut banner and on-field cues (Blocked / Shield broke / Split! / Smash, hexed gates shown crossed out).
- New neutral cards that answer them: **Pyro** (unit, Anti-Air), **Spotlight** (unit, Priority) and **Side Fill** (a speaker gate). A Side Fill also swings its lane's sound toward where it points. **Toolbox** now also pries past shields.
- **Bot fix that changes earlier numbers:** the simulator's bots were playing Feedback Loop about 26 times a run, so most runs ended with the bots spending their own crowd. They now only play it when it saves more crowd than it costs. Earlier D1–D8 results were measured with that flaw.
- Balance pass, each step rerun through the report:
  - First cut: D1 2.2×, Bats 41% and Shieldbearers 34% of losses, Shamblers, Swarmlings and Hexers ~1%.
  - Shields break after 8 + wave/2 blocks. Bats can be hit by anything once they swoop down near the stage (pack of 3, not 4).
  - Card picks offer an answer to an enemy you can't yet handle.
  - Shamblers walk in every wave; Swarmlings join them from wave 9; waves 4–8 add one special you've met to the new one.
  - Enemy health grows ×1.08 per wave (was ×1.1).
  - Hexers switch off every gate ahead of them in their lane (50 health, 4 crowd). Breakers have 60 health and cost 4 crowd.
- **Results** at 200 runs per bot: median wave Thrum 21, Lyra 18, Clatter 18, random 6.
  - D1 3.00× (Lyra and Clatter; Thrum 3.5×), D2 8.5×, D3 1.17×, D5 23.8%, D6 7.1% (Hexer is the lowest; Brute is the highest at 25%), D7 3.0, D8 0% — all pass. D1 sits right on the line.
  - D4 fails as expected: Pyro is in every top deck because it's the only Anti-Air card. The full card set needs a second answer for each enemy.

**Phase 1b progress — The Hush, and simpler cards** (done):
- The Hush as described in §4.8, with a health bar notched at its phase changes, a banner for each phase, and tests for all three phases.
- Tuning: at 420 health bots killed it in 3–6 beats, before its phases mattered; at 1200 a fight lasts about 10–35 beats.
- **Simpler cards** (Cass found the screen overstimulating): cards in hand show only cost and name. What a card does appears above the hand when you select it, and in full on card picks.
- **Results** at 200 runs per bot: median wave Thrum 22, Lyra 19, Clatter 18, random 6. D1 3.00× (Clatter; Lyra 3.17×, Thrum 3.67×), D2 7.7×, D3 1.22×, D5 24.5%, D6 6.2% (Shamblers lowest), D7 3.0, D8 0.1% — all pass. D4 still waits on the full card set. The Hush itself rarely ends a run, but it costs crowd along the way.

**Phase 1b progress — the full card set** (done):
- 43 cards: 16 neutral and 9 signature cards per headliner (plus the Roadie token).
  - New neutral: Hype Man (Volume: +1 damage every beat 1), Riser (gate: Anti-Air), Heckle (riff: hits a Breaker/Hexer/Hush first), Mic Drop (riff: Downbeat bonus), Soundboard (amp: draw on beat 1).
  - Thrum: Cymbal Crash (hits all flyers, Echo), Double Kick, Rimshot (free; seeks Breakers; Downbeat bonus), Four on the Floor (amp), Drum Solo (Encore).
  - Lyra: Glissando, Cadenza, Choir (×4 gate, fragile), Falsetto (cheap Anti-Air gate), Tuning Fork (Priority unit for gates to multiply).
  - Clatter: Stage Dive, Guitar Tech, Security (Priority), Rigger (Anti-Air), Crew Call (a Roadie in every lane).
- New effect parts: Volume, a Downbeat condition, "hit a priority target first", "flyers only", Roadies in every lane, and the Lift gate (Anti-Air).
- Every enemy now has at least 2 answers for every headliner, and **each starter deck carries its headliner's own answers** to flyers and to Breakers/Hexers (Thrum: Cymbal Crash, Rimshot; Lyra: Falsetto, Tuning Fork; Clatter: Rigger, Security). Neutral answers are upgrades from picks.
- Starter decks (see `STARTER_DECKS`): Thrum trades a Double Stop and Snare Roll for Cymbal Crash and Rimshot (Snare Roll is still in its picks). Lyra trades a Stagehand and a Sustain Pedal for Tuning Fork and Falsetto. Clatter trades a Stagehand and a Double Stop for Security and Rigger.
- Balance and measurement changes, each rerun through the report:
  - Encore! only works on a 3+ chain and deals 8 (was: always draw, 15 on a chain). Spotlight deals 5 (was 6). Bats come in 4s again.
  - Bots: they now aim for a deck shape when picking (about 40% units, 25% gates, 30% riffs), skip picks as the deck grows, and only count an answer card as urgent when nothing in the deck answers that enemy.
  - D4 is now measured on the three headliner archetype bots, one per headliner, as §9 says ("across all archetypes"). Before, the two extra Thrum timing bots made Thrum's signature cards look over-picked. The old measure is still printed.
- **Results** at 200 runs per bot: median wave Thrum 19, Lyra 18, Clatter 18, random 6. D1 3.00× (Lyra and Clatter), D2 4.6×, D3 1.06×, D5 22.3%, D6 5.6%, D7 3.0, D8 0% — pass.
  - **D4 still fails narrowly:** Encore! is in 44% of top archetype decks (Fuzz Box 41%). Top runs take about 8 picks from a pool of about 25, so most cards land near 30–40% and the top few sit just over the line. Nerfing whichever card is on top just moves the top spot (Encore! at cost 3 put Fuzz Box at 44% and dropped Lyra below D1).

**Phase 1b progress — evolutions** (done):
- After wave 5, the run stops on an evolve screen (guarded like a card pick, the band keeps playing muffled) and you choose one of your headliner's two evolutions for the rest of the run.
- As built (changes from §4.7 marked):
  - **Metronome** (Thrum): timing windows 30% wider, and a Tight play keeps the chain alive one extra beat. *(First built as "every Tight adds an extra link": the 50-link cap then hit in 6.9% of runs, failing D8.)*
  - **Polyrhythm** (Thrum): an Echo card played in a different lane from the beat before echoes twice.
  - **Crescendo** (Lyra): +5% damage per 10 shots through a gate, up to double.
  - **Harmony** (Lyra): two gates in the same lane both work as if Swelled, all the time. *(Changed: "combine their effects" means nothing here, since every shot already passes both gates in its lane.)*
  - **Load Out** (Clatter): when a Roadie leaves, your latest Riff comes back from the discard pile (once per beat, hand up to 7).
  - **Mosh Pit** (Clatter): with 5 or more Roadies on stage, their shots Splash. *(Changed from 6: with 9 stage slots, 6 left almost no room for real units.)* Clatter's amp card that shared the name is now **Circle Pit**.
- The sim's bots flip a coin for their evolution, and the report prints each one's median wave: Metronome 21, Polyrhythm 19, Crescendo 19, Harmony 18, Load Out 18, Mosh Pit 18.
- **Results** at 200 runs per bot: median wave Thrum 20, Lyra 18, Clatter 18, random 6. **All eight checks pass**: D1 3.00× (Lyra and Clatter; Thrum 3.33×), D2 5.4×, D3 1.11×, D4 40.0% (Soundboard, right on the line), D5 22.0%, D6 7.2%, D7 3.0, D8 0.2%.

**Phase 1b progress — the leftovers** (done):
- **Card text is generated from the card data** (`src/content/text.ts`), so the numbers on a card always match what it does. A card's optional `note` adds a sentence the data can't say (e.g. Kick Drum: "Several Kick Drums add one link a bar between them."). Short taglines on cards stay hand-written.
- **Drag-to-play:** drag a card from your hand onto a lane button; it plays when your finger lifts, timed like a tap. The lane under your finger lights up. Select-then-tap still works.
- **Long-press** a card (in hand) for its full text, keyword definitions and flavor; long-press an enemy on the field for its trait. Both close when you let go. (Enemy long-press is information only, so it sits outside the bottom-38% play zone.)
- **Discard-cycle (Swap):** select a card and a Swap button appears next to it: 1 energy to discard it and draw the next one. The card you get can't be swapped again that bar. The sim's bots don't use Swap yet, so the depth report doesn't measure it.
- Sim unchanged (same seeds, same results): all D1–D8 pass.

**Phase 1b — Fill out.** Adds the simulator and the D1–D8 report, then tunes the slice against it. Then adds Lyra and Clatter, the other 5 enemy types, The Hush, the full ~40 cards, evolutions, the remaining keywords, audio, discard-cycle and drag-to-play.

**S1.1 Play a card into a lane**
*As a player, I want to select a card and tap a lane with my two thumbs, so I can act fast without reaching up.*
- [ ] Every play input is inside the bottom ~38% of the screen.
- [x] Two ways to play: select, then tap a lane; or drag the card onto a lane.
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
- [ ] There's a select screen with all 3 headliners, showing their passive, active ability and signature cards. *(Phase 1b: pick one per run on the title screen; see §4.7.)*
- [ ] Active abilities are in the control zone and show their cooldown in beats.
- [x] Phase 1 shows the evolution branches as a preview. They're fully playable in Encore after a set number of waves. *(After wave 5.)*

**S1.6 Enemies demand answers**
*As a player, I want enemies that need specific tools, so I have to think about my build.*
- [x] All 8 enemy types are implemented with their traits, each with a unit test. *(The Hush is separate.)*
- [x] From wave 3 onward, every wave mixes at least 2 traits.
- [x] Long-press an enemy to see its trait.
- [x] The Hush boss arrives every 10th wave, with 3 phases.

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
- [ ] Audio is on by default, can be turned off in settings, and respects the iPhone silent switch.
- [ ] With sound on, the synthesized drum loop stays locked to the beat clock (drift under 10 ms over 5 minutes) and chain stingers rise in pitch.
- [ ] Every audio cue has a visual equivalent.

**S1.10 Simulator + depth report**
*As Grant, I want proof the game isn't shallow before I get bored of it.*
- [ ] `npm run sim` runs the bots from §9 and writes the report.
- [ ] D1–D8 are evaluated and printed as pass or fail.
- [ ] CI runs a small simulation (200 runs) on every push and prints a warning if a threshold fails.

### Phase 2 — Tour + Collection

Built in three steps: **2a Tour** (done), 2b Collection & Workshop, 2c new headliners, enemies and bosses.

**Phase 2a — Tour, as built** (Grant's calls: one headliner per Tour until there are more than three; a Tour should take about 15–20 minutes):
- Pick Encore or Tour on the title screen (remembered). A Tour is 3 acts. Each act is a map of 4 rows of 3 stops, each linked to the stops straight and diagonally ahead, then the boss.
  - Row 1 is always gigs (fights). Later rows roll gigs, events, drafts, shops, rests and (rows 3–4) a big gig (elite). Every act has an elite, a shop in rows 2–3 and a rest in row 4.
- **Fights:** a gig is 3 waves from its row's level (act 1 starts at level 1, act 2 at 5, act 3 at 9), after a 2-bar count-in; the last wave ends when it's cleared. A big gig plays one level higher, enemies have 25% more health and one more special. A boss fight is one wave, then The Hush.
- **Your gear stays set up** between fights in the same act (units, gates and amps stay on stage; Roadies go home; your hand and discard shuffle back in). The stage is struck at the start of each act. *(First built with a fresh stage every fight: Lyra and Clatter won 2–3% of simulated Tours against Thrum's 73%, because their engines need set-up time.)*
- **Crowd** carries over the whole Tour.
- **Merch** pays for the shop: 20 per gig, 40 per big gig, 60 per boss.
- After every fight, a card pick (3 cards, signature cards weighted ×3, commons ×2); big gigs and bosses always offer a rare. Draft stops are a free pick.
- **Rest:** +10 crowd, or cut a card. **Shop (merch table):** 4 cards (starter 30, common 40, rare 65, signature +5), remove a card (45, once), +8 crowd (25, once). **Events:** 7 short choices with trade-offs (`src/content/events.ts`).
- Beating the act 1 boss lets your headliner evolve. Beating the act 3 boss wins the Tour.
- Saves anywhere: on the map, in a menu or mid-fight.
- `npm run sim -- --mode tour` plays whole Tours with the bots. Bot results at 120 Tours each: Thrum wins 91%, Lyra 64%, Clatter 61%, random 0% (random play rarely gets past act 1). About 6–7 minutes of fight time per Tour; with menus, about 15 minutes.
  - Open: Thrum is clearly the strongest Tour headliner (no D-threshold covers Tour yet), and the bots may find Tour easier than people do. Heat (Phase 3) is where difficulty goes up.

**S2.1 Tour run**
*As a player, I want a roguelike tour with drafting and branching paths, so every run builds a different deck.*
- [x] There are 3 acts, each with a node map: fight, elite, draft, rest, shop, event, boss.
- [x] Drafts offer a choice of 3 cards weighted toward your headliners, with a skip option.
- [x] Evolutions are chosen during the run when a headliner reaches the right level. *(After the act 1 boss, until Collection adds levels.)*
- [x] You can save and resume at any point on the map or mid-fight.

**Phase 2b — Collection & Workshop, as built** (`src/meta/collection.ts`, screens in `src/ui/CollectionOverlay.tsx`):
- **Collection** opens from the title screen: Band, Workshop, Cards and Backup.
- **Headliner XP and levels:** 10 XP per Encore wave; 15 per Tour stop plus 100 for winning a Tour. Levels 2–5 at 100, 250, 450 and 700 XP.
  - At **level 3** you choose a permanent evolution. Encore then applies it after wave 5 without asking (same timing as before, so Encore balance is unchanged). Tours still choose fresh, per §4.7. At level 5 you can change it.
- **Unlocks:** all three starter decks' cards are unlocked from the start. Any other card unlocks once a run ends with it in your deck (picked, bought or from an event). Card picks in runs always offer the full pool.
- **Workshop:** up to 10 deck lists. A new deck starts as the headliner's starter deck. Shows the count against 20–30, the cost curve, average cost, card types, top keywords, and synergy links between cards, worked out from the card data (e.g. Load-In → Stage Dive: more Roadies to work with). A deck saves as a draft until it's legal (20–30 cards, max 2 copies, only that headliner's signature cards, unlocked cards only).
- **Playing a deck:** in Encore, a ready deck for the chosen headliner appears as a choice on the title screen; Tours always start from the starter deck (§4.3).
- **Card history:** runs played with it, average share of damage, Tour wins and best Encore wave; shown when you tap a card in the Workshop or the Cards tab.
- **Backup (§7):** export everything the game keeps on this device to a JSON file, and restore from one.
- End-of-run screens show XP gained, level-ups and new unlocks.
- The simulator still plays starter decks, so D1–D8 are unchanged (all pass).

**Phase 2c, part 1 — two new headliners, as built:**
- **Aria, the siren (control).** Passive: her *Tight* riffs slow the enemies in their lane to half speed for 2 beats. Ability **Hold**: every enemy stops for 2 beats. Evolutions: **Long Note** (Hold lasts twice as long) / **Banshee** (slowed enemies take 50% more damage). Cards: Backup Singer, Lullaby, Vibrato (gate: shots slow), Soprano (Priority), Shatter (hits all flyers), High Note (double vs slowed), Power Ballad (win back crowd), Siren Call, Chorus Line (amp). Band: sung "ooh/aah" voices.
- **Riot, the punk drake (aggression).** Passive: while your chain is 3+, every 8 kills win back 1 crowd. Ability **Riot**: all damage doubled for 2 beats. Evolutions: **Anarchy** (no Feedback cost on a 5+ chain) / **Comeback** (+3% damage per missing crowd, up to +60%). Cards: Skater (Splash), Power Slide, Cranked (+8 gate, fragile), Bottle Rocket (Anti-Air), Bouncer (Priority), Smash the Guitar, Anthem, Crowd Surf, Wall of Death (amp). Band: fuzzed punk power chords.
- New effect parts: slow (lane or all), heal, "more damage vs slowed", and a Vibrato gate (shots slow what they hit). 61 cards in all.
- **Abilities now land on the beat, for every headliner** *(change from §4.7, flagged to Grant)*: Tight = full effect, Good = a beat shorter (Clatter: Roadies in the two outer lanes only), Off = fizzles and you can retry after 4 beats. Without it, random play as Aria reached wave 8 just by mashing Hold, which pulled skill-vs-random (D1) below 3×.
- Balance passes: Aria's passive needs Tight riffs; Lullaby and Backup Singer slow less; Riot's crowd-back needs a 3+ chain.
- **Results** at 200 runs per bot (5 headliners): median wave Thrum 20, Lyra 19, Clatter 18, Aria 20, Riot 19, random 6. All D1–D8 pass: D1 3.00× (Clatter), D2 5.9×, D3 1.11×, D4 36.4%, D5 19.5%, D6 6.5%, D7 3.0, D8 0.2%. Random play as Aria still reaches wave 8 (as Clatter 7), so her skill gap is the narrowest.
- Tour (80 runs): Thrum 94%, Aria 93%, Lyra 71%, Riot 71%, Clatter 66%.

**S2.2 Collection & Workshop**
*As Grant, I want to tinker with decks the way I tune Commander decks, with real stats.*
- [x] Deck builder enforces 20–30 cards, max 2 copies, and limits signature cards to your active headliners.
- [x] Deck stats show: cost curve, keyword counts, card types, and synergy links between cards.
- [x] Each card tracks its history: games played, average damage share, and wins.
- [x] You can save up to 10 deck lists.

**Phase 2c, part 2 — four enemies and two bosses, as built:** see §4.8 for what each does.
- New enemy parts in the data: `charge`, `healsPct`, `hatches`, `phased`; bosses carry a `kind` and the boss calls (Brutes, Medics, Ghosts) share one helper.
- **Crowd you lose on purpose now shows** (Grant asked why crowd dropped with nothing getting through): Feedback cards (Feedback Loop in every starter deck; Smash the Guitar, Anthem, Power Slide) pop "−1 crowd · Feedback" where leaks show, and carry a small red −1 mark in hand.
- **Balance pass** (D6 failed at first, with 11 non-boss enemies sharing the losses): Swarmlings were 32% of losses, Medics 0.4%.
  - Leaks by a Nest's hatchlings count as the Nest's in the simulator's loss causes *(measurement change; the Nest caused them)*.
  - Crowd damage: Bat 1→2, Splitter 2→3 (and its pieces 1→2), Hexer 4→5 (health 50→60), Breaker 4→5. Ghost health 40→36.
  - Ghost has no card answer: answer lists for it and the Charger made Mic Drop, then Hype Man, then Soundboard must-picks (D4).
  - The Critic's phase 2 holds the chain instead of only freezing the multiplier; long boss fights were letting the sharpest bot hit the 50-link cap (D8).
- **Results** at 200 runs per bot: median wave Thrum 19, Lyra 17, Clatter 17, Aria 18.5, Riot 18, random 5. All D1–D8 pass: D1 3.40× (Lyra), D2 5.0×, D3 1.12×, D4 36.0%, D5 19.6%, D6 5.6% (Swarmling), D7 3.0, D8 0.7%. Loss causes: Brute 15%, Nest 10%, Ghost 10%, Medic 9%, Splitter 8%, Hexer 8%, Breaker 8%, Shieldbearer 7%, the rest 6%.
- Tour (80 runs): Thrum 78%, Aria 74%, Riot 60%, Lyra 51%, Clatter 44% (was 94/93/71/71/66). Act 3 is now the wall: Dead Air plus the new enemies. No D-threshold covers Tour; flagged.

**S2.3 Content expansion**
- [x] 2 new headliners, 4 new enemies and 2 bosses are added, all following §4 and §6.
- [x] The simulator thresholds still pass after they're added.

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

- **Speaker placement** (Grant's idea) — first version built in Phase 1b as the Side Fill gate. Open: more speaker cards (fan a shot across two lanes, a speaker on a unit slot), and whether speakers should be their own card type.
- Should the field get a lane-swap mechanic (moving units sideways) in Phase 2?
- Should the Daily Setlist have a light leaderboard (paste-based, no backend)?
- How do Heat modifiers interact with the daily seed?
