# Headliners — Game Spec

A portrait card-combo horde game for killing time on a phone, with real depth.

You play as a fantasy band on tour. You pick three headliners (dragon-like creatures that evolve), build a deck, and hold back escalating hordes. Cards summon units, gates and riffs onto the field. Synergies chain into combos, and playing on the beat multiplies them.

- **Owner:** Grant (gphill1396)
- **Use:** personal, hosted on GitHub Pages
- **Status:** v0.1 spec

> **Direction from Grant (Oct 26):**
> - **Theme (applied):** you're a ren faire band pulled through a portal into a fantasy world, protecting the crowd from monsters. Names, flavor text and instruments are rethemed (see "Ren faire retheme" under Phase 2). Code ids are unchanged, so saves and the simulator carry over.
> - **Art bar:** at minimum the level of *Metroid Fusion* (detailed, shaded GBA-style pixel sprites with animation frames). Claude draws palette-indexed sprites; Thrum's portrait (title screen) is the first sample for Grant to judge before the rest. Everything else is still placeholder art. The playfield is 144 px wide today; the art pass will likely need it wider (GBA is 240) for that level of detail.

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
- **Shift (S4.3):** with no card selected, slide from one lane button to another to swap the two lanes' units.
- **Long-press a card** to open full card text and keyword definitions.
- Respect the phone's safe areas, including the home indicator.
- Minimum touch target: 44 × 44 pt.

---

## 4. Core mechanics

### 4.1 Field

- There are 3 lanes. Enemies spawn at the top and march down.
- Each lane has **2 gate slots** (mid-lane) and **3 unit slots** (bottom).
- Units auto-fire straight up their lane. A **Shift** swaps two lanes' units (2 energy, once per bar; gates stay put).
- **Gates:** when a projectile passes through a gate, the gate changes it.
  - Examples: ×2 copies, +3 damage, gains Pierce.
  - This is the horde-ad loop, but you choose and place the gates.
- **Crowd meter:** an enemy that reaches the stage edge costs crowd, scaled by the enemy. The run ends when crowd hits 0.

### 4.2 Beat clock

- The game runs in 4/4 time. The tempo starts at 100 BPM and rises 3 BPM a wave, up to 160 (Oct 27; was 2 a wave, up to 150).
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

**Phase 1b: one headliner per run.** With only three headliners, a team of 3 would always be the same three, so for now you pick one on the title screen (it's remembered). It sets your starter deck, passive, ability and the band's instruments. Teams of 3 come back once there are more than three headliners (Phase 2). *(Deviation from S1.5, flagged to Grant.)* **Phase 2: Tour is played as a team of 3 (S2.4); Encore stays one headliner.**

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

**Tour targets** (added Oct 26; `npm run sim:tour`, about 12 minutes at 80 solo Tours per headliner and 30 per team per Heat, not run in CI):

| # | Target |
|---|---|
| T1 | No solved Tour headliner: solo win rates at Heat 0, best ÷ worst ≤ **1.5×**. |
| T2 | Heat climbs: a skilled band of 3 wins **60–85%** at Heat 0, **35–60%** at Heat 5, **10–30%** at Heat 10. |
| T3 | Skill matters: random play never wins a Tour at Heat 0. |
| T4 | No solved band: at Heat 5, the best band of 3 wins at most **2.5×** as often as the worst (added Oct 26; the report lists every band). |

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

**Ren faire retheme and winning crowd back, as built (after 2c part 2):**
- **Theme:** headliners are the band, changed on the way through the portal. Thrum, the war-drum drake (war drums, tabor, kettle drums). Lyra, the serpent lutenist (lute, harp). Clatter, the kobold tinker (hurdy-gurdy; Roadies are now **Squires**). Aria, the siren (voice, recorder). Riot, the piper drake (bagpipes).
- **Monsters:** Shambler → Ghoul, Brute → Ogre, Swarmlings → Spiderlings, Bats → Harpies, Splitter → Slime, Shieldbearer → Hobgoblin, Hexer → Hag, Breaker → Troll, Charger → Warg, Medic → Shaman, Nest → Brood Mother, Ghost → Wisp. Bosses: The Hush (kept), The Critic → The Black Knight, Dead Air → The Bone Wyrm.
- **Cards:** renamed where the old name was modern gear (Stagehand → Page, Kick Drum → War Drum, Overdrive → Bellows, Fuzz Box → Rattle, Side Fill → Ram's Horn, Mic Drop → Gong, Soundboard → Songbook, Feedback Loop → Cacophony, Smash the Guitar → Smash the Lute, and so on); flavor text rewritten. Keywords stay musical (Echo, Downbeat, Encore, Feedback); the speaker keyword reads "Horn" and Toolbox reads "Tinker".
- **Tour:** gigs are Shows, big gigs are Tournaments, the merch table is the Market, rest stops are Inns, merch is coin, and the van is a wagon. Events rewritten.
- **Sound:** new voices: lute (plucked string, also every strum), tambourine (keeps time), war drum (the 1 of every bar), bagpipes with a drone, hurdy-gurdy with its buzzing "dog", recorder/fife (the chain's lead line). Bass is a bowed viol.
- **Winning crowd back** (Grant asked for more ways; before this only Ballad, Crowd Surf, Riot's passive, beating a boss and Tour stops did it):
  - **Clean set:** a wave where nothing gets through, ended with the band in the pocket, wins back 1 crowd. *(The pocket condition keeps it a skill reward: without it, random play gained enough to tie D1.)*
  - **Sing-along:** every 15 links in one chain wins back 1.
  - **Tavern Chorus** (new neutral amp, cost 3): on beat 1 with a 5+ chain, win back 1.
  - Every gain shows as a green "+1 crowd" pop. Feedback costs show as "−1 crowd · Feedback".
- **Balance pass that came with it:** surviving longer, the sharpest bot ran a single chain to the 50-link cap in long boss fights (D8 2.4%), so **a boss fight banks the chain every 36 beats**, like the end of a wave. The horde now grows late (one more Ghoul per pack every 6 waves after 6; two more Spiderlings every 6 after 9), and the Warg is tougher (health 40, crowd 5).
- **Results** at 200 runs per bot: median wave Thrum 19, Lyra 17, Clatter 18, Aria 18, Riot 18, random 5. All D1–D8 pass: D1 3.40× (Lyra), D2 6.6×, D3 1.12×, D4 36.0%, D5 19.2%, D6 5.5% (Spiderlings), D7 3.0, D8 0.1%.
- Tour (80 runs): Thrum 90%, Aria 71%, Clatter 55%, Lyra 51%, Riot 38%. The spread between headliners in Tour is wide; flagged, no threshold covers it.

**S2.3 Content expansion**
- [x] 2 new headliners, 4 new enemies and 2 bosses are added, all following §4 and §6.
- [x] The simulator thresholds still pass after they're added.

**S2.4 Team Tour**
*As a player, I want to take a band of three headliners on Tour, so runs mix archetypes and the draft has more to chase.*
- [x] A Tour starts with exactly 3 headliners, picked on the title screen; the first one picked leads.
- [x] All three passives are on all the time.
- [x] One ability button; small chips beside it switch the lead (whose ability it fires). Shared cooldown; no switching while an ability is running.
- [x] The starter deck is 12 cards: 3 neutral (Page, Double Stop, Mighty Strum) plus 3 from each headliner (core card, flyer answer, priority answer).
- [x] Draft picks, the Market and events draw from all three headliners' signature cards.
- [x] After the act 1 and act 2 bosses, you choose which headliner evolves and into which form.
- [x] The band's time-keeping follows the lead; each unit still plays its own instrument.
- [x] Collection XP from a Tour goes to all three headliners.
- [x] `npm run sim -- --mode tour` plays every team of 3; Encore D1–D8 still pass (unchanged: Encore stays solo).

*As built:* engine state keeps the team on `headliner.team` (pick order) with `headliner.id` as the lead and `headliner.evolutions` per member; solo runs and old saves are unchanged. Passives check membership (`hasMember`), abilities check the lead. Tour sim (10 runs per team, skilled bot): 72% overall; by team from 90% (Thrum+Lyra+Clatter and three others) down to 30% (Lyra+Clatter+Riot); random play 0%. Solo Tours (40 runs): Thrum 85%, Aria 75%, Clatter 55%, Lyra 53%, Riot 38%. No threshold covers Tour; Heat (Phase 3) is where its difficulty is tuned.

### Phase 3 — Daily Setlist + Heat

**S3.1 Daily Setlist**
*As a player, I want one shared daily challenge, Wordle-style.*
- [x] The seed comes from the date (UTC). Everyone gets the same waves, deck and headliners.
- [x] One scored attempt per day. Practice runs afterward are marked as unscored.
- [x] A share button copies an emoji summary: wave reached, best chain, a timing grade row, and whether relaxed timing was on.

*As built:* **Daily** is a third mode on the title screen. It plays Encore's endless waves with the day's band of 3 (all 10 teams of 3 in turn, the lead rotating each cycle), the team starter deck and no Collection deck or evolution, so it's the same for everyone. Each wave and each card pick draws from its own stream seeded by the date (`daily-YYYY-MM-DD:wave:N`), so the waves don't depend on how you play (tested). The band evolves once after wave 5 (you choose who). Starting the day's run uses the scored attempt (leaving it unfinished still uses it); later runs show "Practice" and aren't kept. Daily runs don't touch Encore bests but do give Collection XP to the band. The share text (share sheet on phones, else copied): date, band, wave, chain, score, a 10-square 🟩🟨🟥 timing row, relaxed timing on/off and a day streak. Logic in `src/meta/daily.ts`.

**S3.2 Heat tiers**
- [x] Heat 1–10 unlock in order after clearing Tour. Each adds one rule modifier.
- [x] The highest Heat cleared is tracked per headliner.

*As built:* Heat applies to Tour only (rules in `src/content/heat.ts`, effects in `engine/tour.ts` and `engine/waves.ts`), cumulative: 1 start with 25 crowd · 2 monsters +15% health · 3 Tournaments tougher (+60% health, was +30% before Shift, one more monster kind) · 4 Market cards +25% · 5 Inns heal 5 instead of 10 · 6 bosses +35% health · 7 monsters 15% faster · 8 each leak costs 1 more crowd · 9 picks offer 2 cards · 10 every show is as tough as a Tournament. *(Retuned in the Tour balance pass below; Heat 10 was "bosses call help twice as often".)* Winning a Tour marks its Heat cleared for every member of the band (Collection, shown in the Band tab); the title screen's Heat stepper goes up to one above the highest Heat won by anyone. Answer to open question "How do Heat modifiers interact with the daily seed?": they don't; the Daily Setlist has no Heat.
- Sim, teams of 3 (10 runs per team): Heat 0 72%, Heat 3 63%, Heat 6 65%, Heat 10 47%; random play 0% at every Heat. The middle tiers barely move the bots, and Heat 10 may be too easy for a top tier; tune after playtesting (`npm run sim -- --mode tour --heat N`).

**Tour balance pass (Oct 26, after Phase 4):** Tour targets T1–T3 added to §9, then tuned until they pass. Before: solo Tours Thrum 90%, Aria 71%, Clatter 55%, Lyra 51%, Riot 38% (T1 2.4×); teams Heat 0 79%, Heat 5 62%, Heat 10 46%.
- Heat: the numbers above (stronger 2, 3, 5, 6, 7; a new Heat 10).
- Headliners: Thrum's Fill cools down in 24 beats (was 16); Lyra's Swell and Riot's Riot in 12 (was 16); Lyra's gates add +2 (was +1); Riot wins back 1 crowd every 5 kills (was 8); Squires hit for 4 (was 3) and stay 10 beats (was 8).
- Results: solo Tours (80 each) Thrum 83%, Aria 71%, Lyra 66%, Clatter 66%, Riot 66% (T1 1.25×); teams (10 per team) Heat 0 82%, Heat 5 58%, Heat 10 23%; random 0%. All pass. Encore (200 runs per bot): median wave Thrum 19, Lyra 18, Clatter 18, Aria 18, Riot 20, random 6; D1–D8 all pass, D1 3.00× (Lyra) right on the line.

### Phase 4 — Load-In + polish

**S4.1 Load-In puzzles**
- [x] A sliding-block puzzle where you clear gear chests so the wagon can be loaded. Includes a daily puzzle and a pack of 30 hand-checked levels.
- [x] Every level is verified as solvable by a solver script, which also reports the minimum number of moves.
- [x] Includes undo, restart, and a move counter with par.

*As built:* opened from the title screen ("Load-In"). A 6×6 yard: slide chests along their length (one slide, however far, is one move) until the lute case reaches the wagon at the right end of row 3; barrels don't move. Logic and solver in `src/meta/loadin.ts` (breadth-first search for the fewest moves; the generator takes a random yard and finds its hardest start). The pack (`src/content/loadin-levels.ts`): 2 hand-made introductions plus 28 generated with `npm run loadin` and picked and ordered by hand, par 1 → 27; `tests/loadin-pack.test.ts` re-solves all 30 and checks par. Levels open in order; solving in par turns a level gold. The daily puzzle comes from the UTC date (par 12–30), same for everyone, made on the device (under a second in a desktop browser) and kept for the day. The yard sits in the bottom ~38% of the screen; Undo, Restart and the counters sit above it.

**S4.2 Art pass (the Metroid Fusion bar)**
*As Grant, I want the whole game to look like Thrum's portrait, so it feels finished.*
- [x] Every headliner, unit, monster and boss has shaded, palette-indexed pixel art with at least 2 animation frames, drawn to the bar Thrum's portrait set (approved Oct 26).
- [x] The playfield is redrawn at a higher internal resolution (toward the GBA's 240 px wide) so that detail reads, and still fits a phone in portrait with input in the bottom ~38%.
- [x] Each sprite reads at a glance: a clear silhouette, a dark outline, and lit from the top left.
- [x] Calmer flashes and the light on-screen text rule still hold.

*Progress:* the pipeline is in `art/` (shapes → shading → outline → hand touches, regenerated with `python3 art/build.py`). **Batch 1 (done):** the playfield is now 240 px wide (the GBA's width), and all 12 monsters, the shieldless Hobgoblin, the small Slime and the three bosses are redrawn with two frames each (a step every beat; Harpies flap, Wisps flicker, Spiderlings scurry). **Batch 2 (done):** all 19 units (the 18 unit cards and the Squire token) as front-facing performers in their headliner's colours, playing on the first part of each beat; and portraits for Lyra (a cobra-hooded naga with a lute), Clatter (a goggled kobold cranking a hurdy-gurdy), Aria (a siren mid-song) and Riot (a mohawked drake on the bagpipes), shown on the title screen like Thrum's. Not redrawn (still simple shapes, by design): gates, shots, bursts and the stage. Open: Grant's verdict on batch 2.

**S4.3 Shift: move units between lanes**
*As a player, I want to move my band to the lane under pressure, so a bad placement isn't stuck for the rest of the wave.*
- [x] With no card selected, slide a thumb from one lane button to another to **Shift**: the two lanes swap their units (an empty lane just receives them). Gates stay where they are.
- [x] A Shift costs 2 energy and can be done once per bar. Moved units skip one beat of firing while they walk over.
- [x] It doesn't link or break the chain, and it isn't graded.
- [x] All input stays in the bottom ~38% (the lane buttons); it works with sound off; the field shows the move.
- [x] Skilled sim bots use it, and D1–D8 and T1–T3 still pass.

*As built:* input `{ type: 'shift', from, to }` (`engine/step.ts`), rejected with `shifted` if one was already done this bar. Moved units keep their slots, skip firing for the rest of that beat and the next (`movedUntilBeat`), and are drawn walking across (`movedFrom`, `movedAt`). On the phone: press a lane button with no card selected, slide to another and let go; letting go on the same lane shows the usual hint, which now mentions Shift. Skilled bots Shift when the most threatened lane has a monster past the halfway mark and a lane with no threat has more than twice its firepower (tokens not counted); random play never Shifts. `SIM_NO_SHIFT=1` turns it off for comparison.
*Balance:* at 1 energy, Shift lifted solo Tours for Thrum (83% → 95%) and Lyra (66% → 83%) and T1 failed (1.95×). Two changes: Shift costs 2 energy, and the bots were taught not to Shift for passing Squires (Clatter had dropped to 49%). Then Heat 5 sat at 61%, so Heat 3's Tournaments went from +30% to +40% health. Results: solo Tours Thrum 88%, Aria 73%, Lyra 71%, Riot 68%, Clatter 63% (T1 1.40×); teams Heat 0 79%, Heat 5 58%, Heat 10 30% (T2 passes, on the line at Heat 10); random 0%. Encore at 200 runs: D1–D8 all pass (D1 3.00×, Clatter and Aria; D3 1.17×; D4 tavern-chorus 36.0%; D6 5.9%). The soundcheck teaches it as step 6 of 11 ("Shift your band", after the gate steps): a ghoul comes down the empty Left lane, and the step ends once the band has moved over and Left is clear.
*One-unit Shift, tested (Oct 26, not shipped):* two variants at 1 energy: move the newest unit, or the strongest, into a free slot (trading places with the oldest unit there if the lane is full). Solo Tours vs no Shift (Thrum 83%, Aria 71%, Lyra 66%, Clatter 66%, Riot 66%): newest-unit Thrum 89%, Lyra 76%, Clatter 68%, Aria 68%, Riot 66% (T1 1.34×); strongest-unit Thrum 89%, Lyra 79%, Clatter 70%, Aria 70%, Riot 68% (T1 1.31×). Teams (10 per team): newest 85/58/32%, strongest 82/61/33% at Heat 0/5/10, both just failing T2, and no Shift is 82/57/31%. Encore at 200 runs: all D1–D8 pass for both, nearly the same as the whole-lane Shift. Verdict: the sim can't separate them (the gaps are within noise). The whole-lane swap stays because it's one predictable move; with input kept to the lane buttons, a one-unit Shift can't let you pick which unit moves.
*Sample size and the Heat fix (Oct 26):* `npm run sim:tour` now runs 30 per team (not 10): at 10, near-identical builds swung by ±5 points. At 30, the whole-lane Shift with Tournaments at +40% gave teams 83 / 62 / 29% at Heat 0/5/10, so Heat 5 was over T2's 60% cap. What was ruled out: sing-along win-backs are small (about 2 crowd a Tour), and halving every in-play win-back at Heat 5 moved Heat 5 by only 1 point; starting with 22 crowd instead of 25 changed nothing (win-backs refill it); Heat 2 at +18% health and Thrum's Fill at 28 beats both moved the wrong way, within noise. Where Heat 5 Tours are lost: act 3 Tournaments (25 of 41 losses), and bands with Thrum win far more (Thrum + Lyra + Riot 10 of 10; Clatter + Aria + Riot 1 of 10). The lever that works is Tournament health (Heat 3): +30% → 65%, +40% → 62%, +50% → 58% at Heat 5. Shipped: +50%. Result: solo Tours Thrum 88%, Aria 73%, Lyra 71%, Riot 68%, Clatter 63% (T1 1.40×); teams 83% / 58% / 27% (T2 passes); random 0%. Bands: see the band balance pass below.

**S4.4 Leaving and starting runs on purpose**
*As a player, I want to step out to the home screen without losing my run, and never end a run by accident.*
- [x] Pause offers Resume and Home. Home goes to the title screen with the run saved, ready to resume.
- [x] Pause no longer offers "Start a new run". New runs start from the title screen.
- [x] When a saved run would be lost, starting a new one needs a press and hold (about a second, with a fill showing progress).
- [x] The end-of-run screen ignores taps for its first moment, like the card pick, so a tap meant for a lane can't start the next run; it offers Home as well as Play again.

*As built:* `HoldButton` (`ui/Overlays.tsx`, 1 second, keyboard Enter/Space still confirms at once) on the title screen's new-run button whenever a run is saved. End screens (Encore, Daily and Tour) ignore taps for 1.2 seconds. Home from the soundcheck leaves it unfinished and goes back to any saved run.

**S4.5 Themed UI**
*As a player, I want the menus and HUD to feel like the ren faire band's world, not a generic app.*
- [x] Menus look like parchment and wood (banners, framed panels, wax-seal buttons) in the game's palette, with no new on-screen text.
- [x] The HUD and control zone use the same materials; cards look like playing cards from the faire.
- [x] Headings use a display face in keeping with the theme; body text stays plain and legible at phone size.
- [x] Works offline with no external font or image requests; "Calmer flashes" and contrast still hold.

*As built:* a theme layer at the end of `src/ui/styles.css` with material tokens (oak, iron, vellum, ink, crimson, gilt). Menus are full vellum pages framed in oak, with ink text and a crimson initial on the title; primary buttons are crimson canvas edged in gilt, secondary ones oak boards. The HUD is an oak crossbeam, the control zone is stage floorboards, lane buttons are riveted oak plaques, cards in hand are vellum playing cards with a wax-seal cost, beat lights are iron lanterns, and a crimson valance hangs over the field. The Tour map is drawn in ink on the page. Fonts: Jacquard 24 (pixel blackletter) for titles and banners only, Pixelify Sans for everything else, both subset and self-hosted from `src/ui/fonts/` (SIL OFL), so the Google Fonts request is gone. No copy was added. Unit cards' ribbon is oak now (cream vanished on vellum).


**S4.6 Classic game feel**
*As a player, I want Headliners to feel like a GBA game from a ren faire, not a web page.*
- [x] Launch opens on a title screen: a pixel-art night faire (striped pavilions, the band on a bunting-hung stage, the crowd), the logo, a two-line story ("Mid-encore at the Grand Faire, a portal swallowed the stage…"), and "Tap to begin".
- [x] Then a classic framed menu with a cursor: Continue, New show, How to play, Songbook, Collection, Load-In, Options. Learn to play comes first until the soundcheck is done.
- [x] New show lists the three modes, each with one line on what it is, then who plays and Start.
- [x] Frames, buttons, cards, chips, lane plaques and textures are pixel art from `art/ui.py`, drawn at whole pixels; no smooth gradients.
- [x] Card types are colour-coded like heraldry with a small badge: Units forest green (a figure), Gates royal blue (an arch), Riffs gold (a note), Amps crimson (a pennant), on the card's bottom band and in the Songbook.
- [x] The Songbook explains every card, grouped by type. It opens from the menu and from Pause (there it starts on your deck).

*As built:* `art/ui.py` writes `src/ui/pixel-ui.css` (PNG data URIs as CSS variables: window, button, plank, card, chip, plaque frames as 9-slices; vellum, oak, awning and bunting tiles; heart, coin, cursor, seal, type badges; the 240×128 title scene). The pixel layer sits at the end of `styles.css`; one art pixel is 2 CSS px (`--upx`), and the title scene is drawn at exactly 4 screen pixels per art pixel on a 3× phone. The title flow lives in `TitleOverlay` (splash → menu → new show / options); coming back from a run opens on the menu. `SongbookOverlay.tsx` is new. The tent awning hangs from the HUD over the top of the field. *Oct 27:* Pixelify Sans's 5 read as an S, so a clearer 5 (flat top, square corners) is laid over it for both weights (`art/fonts/five.py` → `src/ui/fonts/pixelify-five-*.woff`, `unicode-range: U+0035`). Scrolling panels no longer slide sideways (`overflow-x: hidden`).

**S4.7 The band's music**
*As a player, I want each headliner's band to sound like itself, every card to sound like what it is, and the music never to drop out.*
- [x] Each headliner has a song style: Thrum a war-drum march (D minor), Lyra a lute ballad (D dorian), Clatter a swung workshop jig (G major), Aria a sea-shanty lament (A minor, stomp-stomp-clap), Riot a bagpipe reel (D mixolydian).
- [x] A Tour band blends them: the lead's style sets chords, swing and time-keeping; every member's signature part plays (the others' softer). Switching the lead changes the song.
- [x] Unit sounds match what they are: the Page throws rocks (whoosh and thud), Slingers and Fire Arrows loose with a whoosh, Fire Jugglers whirl torches, the Lantern Bearer and Town Crier ring bells, the Tuning Fork rings pure, the Luthier tries her strings, the Gate Guard's halberd clangs, the Jester jingles, the Bouncer stamps.
- [x] Waiting screens (title, pause, picks, game over) play the run's bare-bones beat in the band's style, never a metronome click. On the title it follows the headliner you've picked.
- [x] No drop-outs: the music is scheduled 220 ms ahead and every eighth note in that window is scheduled, so a slow frame no longer skips notes.

*As built:* styles in `src/audio/styles.ts` (`STYLES`, `chordIn`); `scheduleGroove` applies the lead's swing and keeper and each member's signature (`BoardMix.team`); riffs follow the lead's chords. New synth voices: `whoosh`, `bell`. The Conductor's 'metronome' mode now plays `bareMix` (the empty-stage groove). Tempo (Oct 27): +3 BPM a wave (was +2), up to 160 (was 150); Tour act 3 now runs about 124–136 BPM. D1–D8 pass at 200 runs (D6 Shield-bearer 5.0%, on the line); T1 1.40×, T4 2.25×; T2 unchanged (Heat 0 89%, Heat 5 64%, too easy, as before).

**S4.8 Room for a bigger crowd**
*As a player, I want ways to grow my crowd past where it started, so a strong run feels like the show is building.*
- [x] Beating a boss spreads the word: the crowd meter grows by 3 and those fans arrive (in Encore and Tour), on top of the usual 5 back.
- [x] Tour Markets sell handbills once per visit: room for 3 more crowd, and the fans to fill it.
- [x] The meter never grows past 45. The HUD shows the new maximum once it's above 30.
- [x] D1–D8 still pass; Tour targets reported.

*As built:* `raiseCrowdCap` in `engine/effects.ts` (event `crowdCap`), `BOSS_CROWD_CAP`, `TOUR_SHOP_HANDBILLS` (+3 for 35 coin) and `MAX_CROWD_CAP` in constants; the shop action `handbills`. Bots buy handbills when they have coin to spare. To keep D6 (every enemy matters) above 5% with longer Encore runs, the Shield-bearer's leak now costs 4 crowd (was 3). Results: Encore D1–D8 all pass (D6 Splitter 5.1%). Tour: solo Thrum 98%, Clatter 88%, Aria 81%, Riot 76%, Lyra 75% (T1 1.30×); bands 92% / 64% / 30% at Heat 0/5/10 (T2 fails on the easy side, as before, a little more so); T4 2.55× (just over 2.5×). More crowd made Tours easier, as expected; the Tour difficulty question stays open for playtesting.

**S4.9 The road from the cave**
*As a player, I want the field to look like the faire's roads leading out of a monster cave, and the stage to look like a stage.*
- [x] The three lanes are dirt roads through grass, with wheel ruts, stones, wildflowers and pennant poles along the verges.
- [x] The roads are tilted back in perspective: they narrow toward a cave mouth near the top, and monsters far up the road are smaller (pixel-dropped, like GBA sprite scaling) and grow as they come.
- [x] The next boss looms over the cave mouth, in shadow (in Tour the act's boss; in Encore the next one due).
- [x] The bottom of the field is the band's stage, with boards and lanterns along the apron; the control area below has velvet curtains at the wings and bunting overhead.
- [x] Gameplay is unchanged: the same depths and timings; only the drawing moved. Labels and pops follow the perspective.
- [x] A "Decks" item on the home menu opens the Workshop to build and edit Encore decks.

*As built:* `render/field.ts`: `CAVE_FRACTION` 0.2, tilt `Z_FAR` 2.4 (the cave end of a road is drawn as if 2.4× as far as the stage end), `scaleAt`, `laneX`, `fieldPoint`; the land is drawn once per canvas size (`land()`), monsters are cached per frame and drawn with nearest-neighbour scaling (`drawScaled`). Assuming: "longer roads" means looking longer and further away, not a slower walk; monster travel times are unchanged.


**S4.10 Calibrate timing**
*As a player on a phone with a slow speaker or Bluetooth headphones, I want the game to learn how late I hear and tap the beat, so Tight means Tight.*
- [x] Options has "Calibrate timing": tap a drum along with the bare beat 8 times, with beat lights to watch.
- [x] It shows the result in a few words ("You tap 42 ms late") with Save, Try again, Reset to 0 and Back. Scattered taps don't count ("Try again?").
- [x] Once saved, the music plays that much earlier, so taps made in time with what you hear land on the engine's beat. It is saved on the device.
- [x] Calibration never touches the engine: grading, windows and the sims are unchanged. It needs Sound on (it says so if Sound is off).

*As built:* `Settings.latencyMs` (`ui/storage.ts`, clamped to −150…250 ms). `Synth.latencyMs` shifts every scheduled note earlier (`audioTimeAt`), and both schedulers look that much further ahead and skip a note that would already be late. `ui/calibrate.ts` does the sums: offsets from the nearest Conductor beat, the median, taps more than 80 ms from it dropped as slips, at least 5 must agree, and the result adds back the calibration already in force (so recalibrating converges). `ui/CalibrateOverlay.tsx` is the screen. *Deviation (asked for "subtract latency from tap timestamps"):* shifting the taps backward would put most of them in ticks the engine has already simulated, where they can't be graded; moving the music earlier gives the same result and keeps the engine's input path unchanged. Sound effects for your own taps still play at once.

**S4.11 The intro: through the portal**
*As a new player, I want to see the band fall through the portal into the land of monsters, so the setup makes sense before the menu.*
- [x] After "Tap to begin", the title's picture of the faire grows smoothly out of its window to fill the screen and becomes the first shot (the page around it darkens; nothing jumps).
- [x] A short pixel-art scene (about 8½ seconds): the faire at night; a portal tears open over the stage and lifts the band out of the picture one by one; they fall through a tunnel of rings and stars; they land on the stage in front of the monsters' cave, where eyes open in the dark. It fades out onto the menu.
- [x] One short caption per beat of the story, each on screen about two seconds, nothing else but a faint "tap to skip". A tap skips to the menu.
- [x] Tapping the picture on the home menu plays the intro again, growing from that picture.
- [x] Sound cues if Sound is on (the portal's rush, the fall, the landing) over the bare beat; silent otherwise. "Calmer flashes" drops the flash; reduced motion skips the scene.

*As built:* `ui/IntroCutscene.tsx`, drawn at 240×320 game pixels on a canvas and scaled up pixelated. The title scene (`--ui-scene`, 240×128) sits in the canvas's middle rows; at the start the canvas is transformed to sit exactly over the tapped picture and eases to its place in 0.8 s (a FLIP transition), while the sky and crowd around the scene fade in. The band in the intro is the title picture's four performers, drawn separately over an empty-stage copy of the scene (`--ui-scene-empty`, `art/ui.py`), so they can be lifted out; they're shown at 2× through the fall and landing. The landing reuses the field's own land (`land()` in `render/field.ts`). Once the intro covers the page the menu is put behind it, so the fade-out lands on the menu. Slowed on Oct 27 (5.4 s → 8.6 s) so the captions can be read. *Fix (Oct 27):* on Grant's phone the picture grew and then froze. The intro read its empty-stage scene back out of the CSS, which iOS Safari evidently mangled, and drawing a broken image throws there, so the first frame failed and the frame loop stopped. Now the scene comes from a generated module (`ui/scene-art.ts`, written by `art/ui.py`), loaded at startup; a frame that fails to draw no longer stops the loop; the grow's transform is cleared once it's done; and a backstop ends the intro on time whatever happens. *Fix 2:* the band stayed on the stage after the portal lifted them: the "empty" scene still had them painted in (in `art/ui.py` a local variable reused the parameter's name, so the band was always drawn). The empty-stage scene is now truly empty, and it lives only in `ui/scene-art.ts` (no longer in the CSS).

**S4.12 Shots on the beat**
*As a player, I want my band's shots to sound exactly on the beat they fire.*
- [x] Every unit's sound lands on the straight eighth the engine fires it on. A style's swing (Clatter's jig, Aria's shanty) applies only to the backing parts, never to shots.
- [x] Each shot's sound is loudest at its start: whooshes peak in 8 ms (they swelled for up to 80 ms), sung units start in 12 ms (80), and the hurdy-gurdy, bass and recorder start in 12–15 ms (30–40). The Page's thud is on the beat (it came 100 ms after), with the whoosh behind it.
- [x] A unit sliding to another lane (Shift) is silent until it fires again, as it doesn't fire.

*As built:* `scheduleGroove` plays units at `tBeat`, keeper and signature parts at the swung `t` (`audio/groove.ts`); attack times in `audio/synth.ts` (`voice` takes an `attack`). Tests: shots stay on the grid in Clatter's jig; moving units drop out of the mix.


**S4.13 Tour log**
*As Grant playtesting Tour balance, I want every finished Tour recorded, so I can send real results without writing them down.*
- [x] Each finished Tour (won or lost; not the Daily Setlist) is logged on the device: date, band (lead first), Heat, won or where it was lost (act and stop), stops cleared, crowd left, and Tight / Good / Off share.
- [x] Options → Tour log lists them, newest first, one short card each (band, Heat, result, date, Tight %).
- [x] "Copy log" copies the whole log as plain text, one Tour a line, ready to paste into a message.
- [x] "Clear log" needs a press and hold. The log keeps the 50 most recent Tours.

*As built:* `src/meta/tourlog.ts` (pure: `tourLogEntry`, `addToLog`, `logText`), stored under `headliners.tourlog.v1` (`logTour` in `ui/storage.ts`, called from `finishRun`), shown by `ui/TourLogOverlay.tsx`. The Tight % is there to compare human timing with the sim bots' (timingSkill 0.7).

**Band balance pass (Oct 26, after S4.3):** T4 added (no solved band). The report now lists every band at Heat 0/5/10.
- **Found:** Riot's passive had no limit. In a band with Thrum it won back about 40 crowd a Tour (the max crowd is 30), and Thrum + Lyra + Riot won 100% at Heat 5. *Shipped:* Riot wins back at most 2 crowd a wave (`RIOT_CROWD_PER_WAVE`). Thrum + Lyra + Riot 100% → 90%, Thrum + Aria + Riot 90% → 90% (noise), solo Riot 68% → 63%.
- **Shipped:** Aria's Hold recharges in 13 beats (was 16). Solo Aria 73% → 79%; most Aria bands rose a few points.
- **Tried and reverted (no measurable effect at 30 per band):** Squires at 5 damage, Thrum's energy refund once every 2 bars, and Battle Cadence firing only from the 4th link. Thrum-led bands stayed in the 80s–90s each time, and the lead order made no difference (Thrum + Aria + Riot 87%, Riot + Aria + Thrum 90%).
- **Result:** solo Thrum 88%, Aria 79%, Lyra 71%, Clatter 63%, Riot 63% (T1 1.40×). Teams 82% / 57% / 23% (T2 passes). T3 passes. **T4 fails at 3.38×:** Thrum + Lyra + Riot 90%, Clatter + Aria + Riot 27% at Heat 5. Clatter is in three of the four weakest bands.
- **Clatter (Oct 26, later):** measured 40 solo Tours each. Clatter and Thrum deal about the same total damage (30k vs 31k a Tour, a quarter of Clatter's from Squires), but Clatter loses three times as often, at act 3 bosses and Tournaments. Leaks Clatter lets through that Thrum doesn't: Harpies (3.3 crowd a Tour vs under 0.5), Wisps (3.3 vs 0.6), Trolls (2 vs 0.6), Shield-bearers and Hags. Tried, then reverted: Squires that hit flyers and ignore armor (solo Clatter 63% → 63%; it also pushed bands at Heat 0 past 85%), and Squires at 7 damage (64%). Only an extreme 12 damage moved it (13 of the first 16 Tours won). *Shipped:* the bot now values Squires from the card's real stats (it assumed 3 damage); no rule change.
- **Bot audit (Oct 27):** no misplay found. What separates Clatter from Thrum is energy, not damage. The Thrum bot sits at the 10-energy cap on 45% of beats; the Clatter bot on 8%: he is always short. Thrum's band also fires about 2.5× the raw damage (Fill and volleys), at a lower hit rate. Tested: Squires that walk to the busiest lane (they stood in empty lanes 66% of the time) made solo Clatter worse (57%); cheaper Clatter cards made it worse (55%); +2 energy on All Hands barely helped (65%); a Squire bringing 1 energy every other bar, 64%; every Tight-hit Squire bringing 1 energy (once per bar, like Thrum's refund), **79%**. *Shipped:* "A Tight hit calls a Squire to that lane, with 1 energy (once per bar)" (`CLATTER_SUPPLY_BARS = 1`). In a band with Thrum, both refunds pay.
- **Result:** solo Thrum 88%, Clatter 79%, Aria 79%, Lyra 70%, Riot 61% (T1 1.43×). T4 passes: 2.45× (best Thrum + Aria + Riot 90%, worst Clatter + Aria + Riot 37%). **T2 fails on the easy side:** bands win 89% at Heat 0 and 63% at Heat 5 (caps 85% and 60%); Heat 10 26% is in range. Heat 3 Tournaments went to +60% health (it moved Heat 5 from 65% to 63%). Tried for overall difficulty, all reverted: Tournaments at +40% from Heat 0 (widened every gap: Thrum 93%, Riot 49%), Tour bosses +20% health (Thrum up, others down), a 26-crowd Tour meter (no change). Health-based difficulty favours Thrum's volume of fire. Encore at 200 runs: D1–D8 all pass.
- **Energy cap on Tour (Oct 27, tried, not shipped):** since Thrum's bot sat at the cap so often, a Tour-only cap of 9 and of 8 energy were tested (30 per team). Cap 9: solo T1 1.32×, bands 93% / 66% / 31%, T4 2.23×. Cap 8: T1 1.34×, bands 93% / 67% / 32%, T4 2.33×. Overall difficulty didn't move (before: 92% / 64% / 30%), so the surplus energy isn't what wins Tours; the T4 change is within noise. Reverted. Every band, Thrum or not, wins 80–100% at Heat 0, so Heat 0 is easy for everyone, not just Thrum.
- **Decision (Oct 27, Grant):** playtest before any more Tour tuning. Grant and Cass play a few Tours; the Tour log (S4.13) records band, Heat, result and timing, and Copy log sends it.
- **Open:** whether the gap is the game or the bot (the sim bot may simply play Thrum's cards better). Real Tour plays by Grant and Cass, noting band and Heat, would settle it before more tuning.
---

### Phase 5 — Release (buy once, the full game)

The goal: a paid app on the App Store and Google Play, one price, the whole game, with no ads, in-app purchases, accounts or tracking. The web version on GitHub Pages can stay as Grant's own build. This phase starts only after Phases 3–4. *(This replaces "Purchases of any kind" in §11 for a single upfront price only. Ads and in-app purchases stay out.)*

**S5.1 Native apps**
*As a player, I want to install Headliners from the App Store or Google Play and play offline.*
- [ ] The same web build is wrapped as iOS and Android apps (e.g. Capacitor), one codebase. Engine rules (§2) unchanged.
- [ ] Fully playable offline, and with sound off; audio starts on first tap; the phone's silent switch and other audio are respected.
- [ ] Haptics use the native API where available.
- [ ] Runs at 60 fps on a 4-year-old mid-range phone, with input-to-sound latency calibrated per device (the existing timing offset).

**S5.2 Saves that follow you**
*As a player, I want my Collection and a run in progress to survive a new phone.*
- [ ] Saves sync through the platform (iCloud key-value store on iOS, Android backup) without an account of ours.
- [ ] The existing export/import backup file still works on every platform.
- [ ] A save from the web version can be imported into the app.

**S5.3 Store listing**
*As Grant, I want a listing that shows the game honestly.*
- [ ] Screenshots and a short gameplay video for both stores, captured from real play.
- [ ] Age rating questionnaires completed; privacy labels declare no data collected.
- [ ] A privacy policy page (hosted with the web build) stating that nothing is collected.
- [ ] Name check: "Headliners" (or a final title) cleared against existing game trademarks before any spending on the listing.

**S5.4 Business setup**
*As Grant, I want the money side set up properly.*
- [ ] Sold under Patternman Productions LLC (developer accounts in the LLC's name).
- [ ] Apple Small Business Program and Google's reduced fee enrolled (15% on the first $1M a year).
- [ ] Price decided from comparable premium games, with no in-app purchases; any future content is a free update or a separate app.
- [ ] Trademark, LLC and tax questions reviewed with a professional before launch.

**S5.5 Release quality**
*As a player paying upfront, I want it to feel finished.*
- [ ] Phases 3–4 done (Daily Setlist, Heat, Load-In, art pass).
- [ ] A playtest round with people outside the project (Cass counts), with their notes addressed.
- [ ] Simulator thresholds D1–D8 pass on the release build; Tour win rates per team reported in the release notes.
- [ ] No crashes across a device test matrix (current iOS and Android, small and large phones).

---

## 11. Out of scope (for now)

- Accounts, online leaderboards, multiplayer.
- Ads and in-app purchases of any kind. (A single upfront price is planned for Phase 5.)
- Licensed music, art or characters.

---

## 12. Open questions

- **Speaker placement** (Grant's idea) — first version built in Phase 1b as the Side Fill gate. Open: more speaker cards (fan a shot across two lanes, a speaker on a unit slot), and whether speakers should be their own card type.
- ~~Should the field get a lane-swap mechanic (moving units sideways)?~~ Yes: Shift (S4.3).
- Should the Daily Setlist have a light leaderboard (paste-based, no backend)?
- ~~How do Heat modifiers interact with the daily seed?~~ They don't: Daily has no Heat (S3.2).
