# Soothe Quest — Developer Handoff

**What this is:** a complete, playable prototype of a match-3 game for chronic
pain patients, built as a single dependency-free HTML file, plus a bot-driven
level-validation pipeline. Your job: productionize it (persistence, billing,
content externalization, store submission). This document maps everything you
need.

---

## Package contents

| File | Purpose |
|---|---|
| `soothe-quest.html` | The entire game. Open in any browser (mobile viewport). This is the master file. |
| `level-validator.js` | Bot solver / difficulty pipeline. `node level-validator.js 50` = regression sweep; `node level-validator.js seeds 20` = obstacle-seed validation. |
| `APK-BUILD-GUIDE.md` | Capacitor packaging steps for a debug APK, plus PWA alternative. |
| `DEVELOPER-HANDOFF.md` | This file. |

---

## Architecture (single file, sectioned by comments)

Everything lives in `soothe-quest.html`. The `<script>` block is organized in
this order — search for the `/* ---------- SECTION ---------- */` banners:

1. **STATE** — one `state` object (lives, coins, subscription, skins, stars,
   rift depth, tutorial flags, plus the wellbeing fields: `playDays`, `saved`,
   `failCounts`, daily-goal, `a11y`). All in-memory; see production checklist.
2. **AUDIO (`Snd`)** — 100% procedural WebAudio. Calm music = pentatonic
   sequencer with per-world scales (`WORLD_SCALES`); battle music = bass/kick/
   hat step sequencer. All SFX synthesized. Zero audio assets.
3. **GEM ART** — inline SVG. `GEM_SHAPES` (6 silhouettes) x `SKINS` (8 palettes
   + accessories + optional glow) x `specOverlay()` (blaster/bomb/rainbow
   overlays) x optional `CB_GLYPH` colorblind symbols. Zero image assets.
4. **OBSTACLES** — ice (`G.ice` grid; shields a gem one hit, immovable) and
   stone (`G.grid[r][c] === -2`; cell blocker, cracked by adjacent clears).
5. **ENCOURAGEMENT + COMFORT JOURNAL** — `ENCOURAGEMENTS[]` (30+ `{id,text,
   cite}` records from *The Resilient Path*), shown after each cleared level;
   `state.saved` holds journaled ids; `shareQuote()` renders share cards.
   **The array is the #1 externalization target — see the dedicated section.**
6. **TUTORIAL** — `TUTORIAL[]` staged coach-marks (swap → match-4 → bomb →
   rainbow → combo → power-ups), each fired the first time the mechanic is
   relevant and tracked in `state.tut`.
7. **WELLBEING** — `gentleStreak()`/`markPlayDay()` (rest-friendly streak),
   `boostEligible()`/`retryLevel()` (adaptive gentle boost), `checkSession()`
   (stretch reminder), daily-goal helpers, `applyA11y()` (accessibility).
8. **LEVELS** — `NODES` array (54 campaign levels, 6 worlds, branch paths) +
   `genRiftLevel()` (procedural endless mode) + `genObstacleLayout(seed,diff)`
   (deterministic layouts via mulberry32) + `VALIDATED_SEEDS` (bot-approved
   layout seeds).
9. **MAP** — `buildMap()` + `mapDecor()` render a 5880px scrolling SVG world.
10. **MATCH-3 ENGINE** — the core. Key functions:
    - `findRuns()` — match detection + special-gem spawn decisions
      (4-run → line blaster, L/T → bomb, 5-run → rainbow)
    - `expandSpecials()` — chain detonation
    - `trySwap()` — input, rainbow swaps, and the special+special combo tier
    - `resolve()` — cascade loop, obstacle breaking, scoring (10/gem x chain)
    - `dropAndFill()` — segmented gravity (stationary cells split columns)
    - Grid encoding: `G.grid` >= 0 gem color, -1 empty, -2 stone;
      `G.spec` null/'row'/'col'/'bomb'/'rain'; `G.ice` 0/1.
11. **SLOTS, MODALS, SHOP** — Lucky Lantern, Soothe Plus trial flow, skins,
    encouragement / tutorial / journal / stretch / settings modals.

---

## ⭐ PRIORITY: Externalize the encouragement array into a content file

The encouragement messages are the emotional heart of the game and the one
thing that ties it directly to the author's book, *The Resilient Path*. Right
now they are hard-coded in `soothe-quest.html`:

```js
const ENCOURAGEMENTS = [
  "You are not powerless. You are not just your illness.",
  "Hurt does not always equal harm.",
  // ...15 lines total
];
```

**The author needs to edit, reorder, and expand these WITHOUT touching game
code or shipping a new build.** Please move them into a standalone content
file. This is a small task with a large payoff (the author owns the book and
will want to iterate on the copy, add seasonal lines, tie lines to chapters,
etc.).

### Recommended shape: `content/encouragements.json`

Move from a bare string array to a small schema so each line can carry
attribution, a category, and an enable flag:

```json
{
  "version": 3,
  "source": "The Resilient Path by Pendleton B. Wickersham, MD (© 2025)",
  "default_citation": "The Resilient Path",
  "messages": [
    {
      "id": "not-powerless",
      "text": "You are not powerless. You are not just your illness.",
      "citation": "The Resilient Path — Foreword",
      "tags": ["agency", "identity"],
      "enabled": true
    },
    {
      "id": "hurt-not-harm",
      "text": "Hurt does not always equal harm.",
      "citation": "The Resilient Path — Ch. 1",
      "tags": ["reassurance", "movement"],
      "enabled": true
    }
  ]
}
```

Why this shape:
- **`id`** — stable key so a "❤️ Save this one" / favorites feature (see
  suggestions) and analytics can reference a line even if its text is edited.
- **`text`** — the line shown on the win card.
- **`citation`** — per-line attribution (chapter-level looks more authentic
  than a blanket credit); falls back to `default_citation` if omitted.
- **`tags`** — optional. Lets you later show context-appropriate lines (e.g.
  a "movement" tag after an active level, a "rest" tag after a loss) or filter
  by theme. Ignore until needed; harmless if unused.
- **`enabled`** — the author can hide a line without deleting it.
- **`version`** — bump on each edit so the app can cache-bust and, once
  persistence exists, know when to re-sync.

### Loading it

**In the Capacitor/web build**, ship the JSON as a bundled asset and load once
at startup:

```js
let ENCOURAGEMENTS = [];
async function loadEncouragements() {
  try {
    const res = await fetch('content/encouragements.json');
    const data = await res.json();
    ENCOURAGEMENTS = data.messages
      .filter(m => m.enabled !== false)
      .map(m => ({
        text: m.text,
        cite: m.citation || data.default_citation
      }));
  } catch (e) {
    // fall back to a tiny built-in list so the game never shows a blank card
    ENCOURAGEMENTS = [{ text: "Even in pain, we are still powerful.", cite: "The Resilient Path" }];
  }
  if (!ENCOURAGEMENTS.length) ENCOURAGEMENTS = [/* built-in fallback */];
}
```

Then the win card reads `enc.text` and `enc.cite` instead of a bare string.
Keep the current 4-second "Take a breath…" hold on the Continue button — it is
a deliberate design choice so the message is read, not skipped.

### Making it editable by the author (pick one, in order of effort)

1. **Simplest:** the author edits `content/encouragements.json` in a text
   editor and hands it back; you drop it into the build. Zero infrastructure.
   Document the schema for them in a one-page README.
2. **Better:** host the JSON on a CDN / your backend and fetch at launch (with
   the bundled copy as offline fallback). Now the author's edits go live
   without an app-store release. Add an ETag/`version` check so you only
   re-download when it changes.
3. **Best (later):** a tiny CMS or even a Google Sheet the author edits, with
   a build step (or serverless function) that exports validated JSON. Add a
   lint check: max length per line (so it fits the card), required `id`
   uniqueness, and a profanity/format pass.

### Content guardrails to enforce

- **Length:** keep lines short enough to render on the card without scrolling
  (roughly ≤ 120 characters). Add a validation step that flags longer lines.
- **Attribution:** every line should carry a citation to *The Resilient Path*.
  The author is the rights holder, so no external licensing is needed — but
  keeping the credit visible is good for authenticity and book cross-promotion.
- **Tone:** these appear at emotionally loaded moments (including after a
  loss). Keep them supportive and non-prescriptive; avoid anything that reads
  as medical advice. The author is the right approver for all copy.

The same externalization pattern applies to the `TUTORIAL[]` steps if you want
those editable too, but that copy is far more stable, so it's lower priority.

---

## Game design spec (what the client approved)

- **Loop:** map → challenge (score/moves), battle (HP/timer, intense music),
  reward nodes → coins → slots/power-ups/skins. After each cleared level, an
  encouragement card from the book (held 4s before Continue).
- **Tutorial:** staged coach-marks in the early levels, each fired when its
  mechanic first appears; shown once, tracked in `state.tut`.
- **Difficulty (bot-validated):** 5 colors scores ~190 pts/move; 6 colors
  deals ~85 dmg/move. Challenges use 5 colors; **battles in worlds 4-6 use 6
  colors.** All campaign goals tuned to 60-90% smart-bot win rate.
- **Specials:** blaster / bomb / rainbow + full combo tier (giant cross, mega
  cross, 5x5 blast, rainbow storm/bombardment, double-rainbow board clear).
- **Endless Rift:** unlocks after final boss. Depth k drives all knobs.
  Challenges at depth >= 3 use pre-validated obstacle seeds. Battles scale
  and are *meant* to overwhelm eventually — depth reached is the bragging stat.

---

## Wellbeing & retention features (the differentiators)

This game is built for chronic-pain patients, so its retention design is
deliberately the *opposite* of exploitative mobile-game patterns. These
features are the product's identity and its marketing story ("no manipulative
timers, comfort-first"). Preserve their spirit — don't "optimize" them into
standard engagement mechanics. All of them depend on state persistence
(checklist #2); today they work in-session but reset on reload.

### 1. Rest-friendly streak (`gentleStreak()`, `markPlayDay()`)
Counts **calendar days the player showed up — not consecutive wins.** Losing
never breaks it, and a single rest day between sessions is forgiven (a gap of
up to 2 days keeps the streak alive). This mirrors the book's pacing message
(consistency over heroics). `state.playDays` is the source of truth; the win
card shows the current gentle streak. **Do not** convert this to a
break-on-miss daily streak — that would invert the entire point.
- *Persistence:* store `playDays` (array of date strings, capped ~400) and
  `lastPlayDay`. Compute streaks against **server** dates to prevent clock
  abuse and to handle timezones sanely.

### 2. Comfort Journal (`state.saved`, `openModal('journal')`)
Players tap 🤍 on any post-level encouragement to save it; saved lines live in
a dedicated screen (💚 in the map header) to revisit on a hard day, each with
its book citation and a share button. This is the emotional bridge to the book
and a genuine reason to reopen the app outside of gameplay.
- *Persistence:* `state.saved` is an array of encouragement **ids** (stable
  keys), so edits to a line's wording never orphan a save. Sync per-user.
- *Depends on* the encouragement content file (priority section above) for the
  id/text/citation records it renders.

### 3. Adaptive gentle boost (`boostEligible()`, `retryLevel(useBoost)`)
After **two consecutive losses on the same level**, the retry screen warmly
offers a boost (+3 moves, or +10s on battles) with non-judgmental copy. Pain
fluctuates day to day; difficulty that flexes with the player is the
mechanical form of the book's message. `state.failCounts[levelId]` tracks the
streak and resets on any win.
- *Balance note:* the boost is intentionally outside the validated difficulty
  band — it's a comfort valve, not the tuned path. Keep it opt-in; never
  auto-apply it or players lose the sense of earning the win.
- *Tuning knob:* the "2 losses" threshold and boost size are reasonable
  defaults; expose them so the client can adjust after seeing real funnel data.

### 4. Session check-in / stretch reminder (`checkSession()`, `resetSession()`)
After ~25 minutes of continuous play, a soft modal suggests changing position,
stretching, or resting hands — never a hard stop. Most games maximize session
length; this one respects the body. Timer resets on dismissal and when
entering the map.
- *Native:* consider pairing with a local notification only if the app is
  foregrounded; do **not** nag. The threshold (`STRETCH_MS`) should be a
  setting. Respect a "don't remind me" preference if you add one.

### 5. Daily gentle goal (`refreshDailyGoal()`, `bumpDailyGoal()`)
A small "clear 2 levels today" bar under the map HUD with a modest coin reward
(+50) at completion. Absence-proof: missing a day costs nothing, it simply
resets. A 90-second reason to open the app that never punishes.
- *Persistence + server time:* `dailyGoalDay/Done/Target`. Roll over on the
  server's date. Keep the target small (2-3); this is a gentle nudge, not a
  grind.

### 6. Shareable quote cards (`shareQuote(id)`)
Renders an encouragement to a 1080×1080 image (quote + book citation + subtle
branding) via `<canvas>`, then hands it to the OS share sheet. This is the
near-free organic-growth loop into the chronic-illness ("spoonie") community.
- *Native wiring:* the prototype uses the Web Share API with a PNG-download
  fallback. In Capacitor, install **@capacitor/share** (and, to save the PNG
  first, **@capacitor/filesystem**): write the canvas blob to a cache file,
  then `Share.share({ files: [uri] })`. Test on both platforms — iOS and
  Android differ on sharing image files vs. text.
- *Design:* keep the card tasteful and non-medical; it will be seen publicly.
  Offer a couple of background themes later if the client wants.

### 7. Accessibility ("Comfort & Access" — `state.a11y`, `applyA11y()`)
Title-screen settings panel: **larger gems** (bigger touch targets),
**colorblind shape symbols** (a distinct glyph per gem color, rendered live in
`gemSVG()`), and sound. A tap-to-select alternative to dragging already exists;
the panel surfaces it. This audience skews toward hand/joint pain and visual
fatigue, so treat accessibility as a **headline feature**, not a checkbox —
"designed for hands that hurt" is real and marketable.
- *Persistence:* `state.a11y` (`bigGems`, `shapes`). Apply on load via
  `applyA11y()` (already called at startup).
- *Extend:* font scaling, a high-contrast board background, reduced-motion
  (partially handled), and adjustable game speed are natural next additions.

### 8. Zen Garden (`startZen()`, `state.zenTotal`)
A no-fail sanctuary mode: no moves, no timer, no lose state — `checkEnd()`
returns early and moves never decrement (`n.zen` guards). Cumulative score
grows a garden through stages (🌱→🌿→🪴→🌷→🌳→✨🌳, thresholds in
`ZEN_STAGES`); the total banks to `state.zenTotal` on exit. Never costs a
life. This is the mode for 3am flare nights; treat it as a headline feature.
- *Persistence:* `zenTotal` is the emotional core here — losing a year of
  garden growth would genuinely hurt. Sync it.

### 9. Tiny Wins (`startTiny()`)
One-minute levels (score 1000 in 10 moves, 5 colors ≈ very winnable) for
low-energy days. Always free (no life to start, no life lost on a rare
fail), counts toward the daily gentle goal, small coin reward (30), no
stars/campaign progression pollution (guarded by `n.tiny`).

### 10. Calm Corner (`openModal('calm')`)
The relaxation hub: guided box breathing (4-4-4-4 overlay, `startBreathe()`),
procedural ambient soundscapes (`Snd.startAmbient('rain'|'waves')` — looped
filtered noise, zero assets, routed through the master gain so mute works),
Comfort Journal, and the From-the-Author panel.

### 11. Softer effects + tap-only input (`state.a11y.calm`, `state.a11y.tapOnly`)
`calm`: 1/3 confetti, 2-particle bursts, 1.35× slower cascades (`pace()`),
battle screen-flash suppressed (CSS `body.a11y-calm`). For migraine/
photosensitivity overlap. `tapOnly`: drag input disabled entirely
(`onMove` guard) — steady-hands mode for tremor and arthritic hands.

### 12. Pause + auto-pause (`pauseGame()`, `resumeGame()`, `exitLevel()`)
⏸ in the game HUD freezes battle timers with warm copy ("The path waits
for you"). Battles auto-pause on `visibilitychange` (calls, naps).
`exitLevel()` is now the single exit path and banks Zen score.
- *TODO for production:* mid-level auto-save across app restarts once
  persistence lands — interruptions are constant for this audience.

### 13. Lives never block the gentle goal (`goalPlayFree()`)
At 0 lives, campaign/rift levels still start while the daily gentle goal is
incomplete (with a "no life needed" toast), and the out-of-lives modal offers
the Zen Garden. The game can no longer tell someone "you failed enough
today."

### 14. Context-aware encouragement (`nextEncouragement(ctx)`)
The in-file array now carries the same `tags` as `encouragements.json`.
After a struggle (prior fails on the level) → self-compassion/resilience
pool; after a battle → empowerment/agency pool; otherwise full rotation
with an 8-entry no-repeat ring.

### 15. Ecosystem panel (`openModal('more')`)
Links the book/workbook and RheumCompanion via
brewsterwickershampublications.com. **RheumCompanion is iOS-only right
now** — the panel detects Android UAs and shows "coming soon" instead of a
dead end. When the Play Store version ships, update that string (search
for `droid` in the modal) and ideally deep-link both stores.

### Design guardrails for future content (please keep)
- **Anti-FOMO seasonal events only:** returning yearly content, no expiring
  rewards, no limited-time pressure. "Nothing punishes you for resting" is
  the product's promise.
- **No stress mechanics:** no descending bombs, spreading hazards, or
  move-or-die timers. New mechanics should be soothing puzzles.
- **Landscape:** compact-chrome CSS exists for lying-down play; do NOT lock
  portrait in the Capacitor config, and test the board on rotation.

### State fields these add (for your persistence layer)
```
playDays[]  lastPlayDay        // rest-friendly streak
saved[]                        // Comfort Journal (encouragement ids)
failCounts{}                   // gentle-boost counter, per level id
dailyGoalDay dailyGoalDone dailyGoalTarget   // daily gentle goal
zenTotal                       // Zen Garden lifetime growth (sync this!)
ambient                        // session soundscape choice
a11y{ bigGems, shapes, calm, tapOnly }       // accessibility toggles
tut{}                          // tutorial coach-marks already shown
```
Remember the existing Sets (`completed`, `unlocked`, `ownedSkins`) and objects
(`stars`, `tut`) still need custom serialization — Sets don't `JSON.stringify`
directly.

---

## Monetization spec (client decisions — do not change without asking)

- **Primary: "Soothe Plus" subscription.** $3.99/mo or $34.99/yr, 7-day free
  trial, yearly pre-selected. Perks: unlimited lives ("comfort mode"), +15s on
  battles, +25% coins, Royal Jewels skin, no refill prompts.
  → Implement as StoreKit / Play Billing **introductory offer** (the demo's
  trial countdown is UI-only).
- **Secondary IAP:** 5 lives $1.99, 600 coins $4.99, power pack $2.99.
- **Slots stay coin-only** (earned currency — keeps it a prize wheel, not
  gambling, for app review). Power-ups now pay out generously (trio +3, pair
  +2, mixed +1 each, single +1). **Plus members' heart prizes auto-convert to
  coins** — logic in `payout()`.
- **Skins:** 8 cosmetic sets, coin-priced 250-1200 (Royal is Plus-exclusive).
  Cosmetic only — every skin plays identically; safe for store review.
- Free tier: 5 lives/day. **Client is aware of the sensitivity of monetizing
  a patient audience** — keep the comfort-first framing in all upsell copy.

---

## The validation pipeline (please keep using it)

Any change to matching rules, specials, scoring, or level goals →
`node level-validator.js 50`. It loads the engine straight out of the HTML
(never duplicate rules into the bot — we caught a divergence bug doing that).

New obstacle layouts → `node level-validator.js seeds 20`, paste the printed
`VALIDATED_SEEDS` array into the HTML. Only in-band (55-90%) seeds ship.

**Statistical note:** n=40 runs gives roughly ±15pp confidence at 60% win
rate, so band-edge levels flicker between sweeps. For release certification,
run n=300 (±5.5pp). The prototype's goals were tuned across multiple n=40-50
sweeps; treat any single-sweep flag as a signal to re-run larger, not to
retune immediately.

Post-launch: calibrate bot-vs-human mapping with real funnel telemetry
(attempts per level vs bot prediction), then re-tune the band. Consider that
this audience on high-symptom days may play closer to the *greedy* bot.

---

## Production checklist (ordered)

1. **Externalize encouragements** into `content/encouragements.json` (see the
   priority section above). Do this early — the author will iterate on copy.
   The prototype ships 30+ lines from the book already in the right schema.
2. **Persistence** — serialize `state` to @capacitor/preferences + server sync.
   Note the tricky fields: `completed`/`unlocked`/`ownedSkins` are **Sets**
   (need custom (de)serialization); `stars`/`tut`/`a11y` are objects; and the
   wellbeing features add `playDays`, `lastPlayDay`, `saved`, `failCounts`,
   `dailyGoalDay/Done/Target` (see the wellbeing section for the full list).
   Without this, streaks, the Comfort Journal, and daily goals reset on reload.
3. **Server time** — daily life refill (`dailyRefill()`), free daily spin,
   daily gentle goal, rest-friendly streak, and trial countdown must all
   validate against server time; client clocks are trivially spoofed.
4. **Billing** — Play Billing / StoreKit for the three IAPs + subscription
   with intro offer. Replace `buy()`, `startTrial()`, `cancelPlus()`. Add
   restore-purchases.
5. **Share plugin** — wire `shareQuote()` to **@capacitor/share** (+
   **@capacitor/filesystem** to stage the PNG). The prototype's Web Share path
   works in-browser; native needs the plugin. Test image sharing on iOS +
   Android.
6. **Haptics** — light impact on match, medium on detonation, heavy on combos
   (@capacitor/haptics). High-value for a pain-distraction app.
7. **Offline fonts** — bundle Fredoka/Nunito woff2 (see APK guide).
8. **Keep-awake** during levels; portrait lock; safe-area already handled.
9. **Performance pass** — DOM rendering is fine for 8x8, but profile cascade
   + particle load on a low-end device; cap `burst()` particles if needed.
10. **Analytics** — level attempts/wins/fail-moves-remaining (feeds the bot
    calibration), trial start/convert/cancel, slots engagement, and (using the
    stable ids) which encouragement lines are seen/saved/shared. Watch gentle-
    boost usage and daily-goal completion to tune those thresholds.
11. **Accessibility** — build on the existing "Comfort & Access" panel
    (`state.a11y`): larger gems and colorblind shape glyphs already work; add
    font scaling, high-contrast board, and adjustable speed. Reduced-motion is
    partially handled. Treat this as a headline feature for this audience.
12. **Store prep** — health-adjacent positioning: avoid medical claims in
    listings ("relaxing distraction," not "pain treatment"), age rating with
    simulated-gambling disclosure for the slot machine, privacy policy.

---

## Suggested next features (nice-to-have)

The Comfort Journal, rest-friendly streak, gentle boost, stretch reminder,
daily goal, share cards, and accessibility panel are **already built** (see the
wellbeing section). Remaining ideas:

- **Context-aware lines** using the `tags` field in the content file — e.g.
  show a `reassurance`/`self-compassion` line after a loss, a `movement` line
  after an active level. The tags already exist; the selection logic doesn't.
- **Chapter tie-in** — tapping a citation could deep-link to buy/read the book
  (natural cross-promotion; the citation is already per-line).
- **Journal enrichment** — let players add a private note to a saved line, or
  get a gentle "line of the day" on the home screen.
- **Share-card themes** — a few background options for `shareQuote()`.
- **Author's voice** — an optional intro card from Dr. Wickersham on first
  launch, tying the game to the book's mission.

---

## Known demo shortcuts (intentional)

- All purchases/subscription are simulated and clearly labeled.
- State resets on reload (by design — see checklist #2). This now also means
  streaks, the Comfort Journal, saved quotes, and daily-goal progress reset;
  persistence is the first thing to wire.
- Encouragements are in-file (30+ lines, correct schema) pending move to the
  content file (checklist #1). A ready-to-use `encouragements.json` is included.
- Slot odds (`weightedSym()` + pity nudge) are placeholder; economy-balance
  before launch.
- Single-layer ice only; the engine supports multi-layer (`G.ice` is a
  counter) if design wants it.
