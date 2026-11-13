# ovice Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's ten changes: a livelier wait (desk, then sofa, a hurried run back), corrected gestures and hand, the owner's five status symbols, one speech bubble at a time, Poppins, an orange file and a less glossy room.

**Architecture:** Unchanged. Rules stay in pure modules (`stateMachine`, `clipForState`, `bubble`, `taskEvents`), poses in `clips/`, the driver hook turns rules into placement and clips, and scene and interface talk only through zustand stores. The waiting place is one new field (`place`) beside the existing waiting states plus two travelling states; nothing is duplicated per place.

**Tech Stack:** as the first plan (Vite 5, React 18, TypeScript strict, three, @react-three/fiber + drei, zustand, vitest, Playwright). No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-13-ovice-round-2-design.md` (wins over the first spec where they differ). First plan: `docs/superpowers/plans/2026-11-12-ovice-agent-office.md` — its Global Constraints still bind.

## Global Constraints

- `npm test`, `npm run build` green before every commit; `npm run e2e` green before a task's last commit. No skipped tests, no test-only branches in `src/`.
- Colours only in `src/theme/tokens.ts`. Status colours, exactly: red `#E93A3C`, grey `#7A7A7A`, orange `#D98C32`, yellow `#E0CD74`, green `#CDDC61`. The file is `tokens.orange` (`#F5570A`).
- Font: Latin and digits `Poppins` (Google Fonts, weights 400, 500, 600, 700 only); Korean stays `Pretendard Variable`.
- Speech lines are unchanged strings; never more than one bubble on screen.
- Times: sofa after `10000` ms without chat input; each hand-over line at least `1500` ms; pointer still `1200` ms and greeting interval `8000` ms as before.
- Viewports narrower than `768` px (`MOBILE_BREAKPOINT`): the character never goes to the sofa.
- Every clip stays procedural and replaceable by a model clip of the same name.
- Symbols, furniture changes and poses are modelled in code; the only asset edited is `public/models/ovice_guy.glb` (the finger), by a script kept in `scripts/`.
- No AI model name or identifier in code, comments, docs or commit bodies (the chip label `Claude` stays).

## Review Focus

1. A task starts while the character is on the sofa or travelling (retry button, or Enter typed fast): it ends up working at the desk and the file is still handed over. Never stuck. → Task 13 steps 2, 6.
2. Chat input half-way to the sofa, twice in a row, or during the hop onto it: the character turns round where it is, no jump in position, and ends seated at the desk. → Task 13 step 6.
3. A sip is cut short (the mouse moves, a task starts) while the cup is in the hand: the cup is put back first, never left in the air. → Task 12 steps 5, 6.
4. The window crosses 768 px, or a phone is used: on a narrow view the character never leaves the desk, and one already on the sofa comes back. → Task 13 steps 2, 6, 8.
5. Reload, reduced motion and a late model: a reload while on the sofa starts clean at the desk; with reduced motion places change without walking and nothing hangs; a result that finished before the model loaded is still handed over. → Task 13 steps 6, 8.

---

### Task 11: Look and symbols

**Files:**
- Modify: `index.html`, `src/index.css`, `src/ui/*.css` (font), `src/theme/tokens.ts`, `src/theme/tokens.test.ts`
- Modify: `src/character/Folder.tsx`, `src/scene/materials.ts`, `src/character/rig.ts` (suit finish; model materials), `src/scene/Lighting.tsx` (only if needed)
- Create: `src/character/statusSymbols.ts`, `src/character/statusSymbols.test.ts`
- Modify: `src/character/StatusBadge.tsx`, `src/character/bubble.ts`, `src/character/bubble.test.ts`, `src/character/clipForState.ts`, `src/character/useCharacterDriver.ts` (+ test), `src/store/characterSignals.ts`
- Modify: `src/ui/SpeechBubble.tsx`, `src/ui/bubble.css` (+ tests), `e2e/*.spec.ts` where a test waits on the hand-over lines

**Interfaces:**
- Produces: `BadgeStatus = 'idle' | 'thinking' | 'working' | 'done' | 'error' | 'hidden'` (`'idle'` is the owner's "resting"; `'hidden'` draws nothing and is used by Task 13).
- Produces: `isThinkingStep(step: AgentStep | null): boolean` in `clipForState.ts` — true for `null`, `'reading'`, `'comparing'` (the steps whose clip is `think`).
- Produces: `badgeForState(state: CharState, queued: Queued, step: AgentStep | null): BadgeStatus`.
- Produces: `BubbleContext.sinceDone: number | null` (ms since the first hand-over line appeared) and `DONE_FIRST_LINE_MS = 1500`.
- Produces: tokens `badgeRed`, `badgeGrey`, `badgeOrange`, `badgeYellow`, `badgeGreen` (values above). `folderBlue` is removed; any other token is removed only if nothing uses it any more.

- [ ] **Step 1: Orange file.** `Folder.tsx` uses `tokens.orange` where it used `tokens.folderBlue`; drop the token and update the key list in `tokens.test.ts` (it must fail first). Commit `feat: hand over an orange file`.

- [ ] **Step 2: Poppins.** Test first (new `src/theme/fonts.test.ts`, reading `index.html` and the stylesheets as text the way `src/ui/colors.test.ts` does): no `Inter` anywhere; the Google Fonts link asks for `family=Poppins:wght@400;500;600;700`; every `font-weight` in `src/**/*.css` is one of 400, 500, 600, 700; the body's stack starts `'Poppins', 'Pretendard Variable'`. Then change the link, the stack, and re-fit sizes, weights and letter-spacing per element against the interface references 1–3 (1728 px wide): each label's width within 2 px of the reference's where the reference shows it, and nothing clipped or overflowing at 1728, 1440, 1280, 1024, 900, 768, 390, 360 and 320 px wide in the ten states Task 9's layout audit covered. Commit `feat: set the interface in Poppins`.

- [ ] **Step 3: Two steps more matte.** Starting values, to be tuned by eye for one coherent result (highlights broader and dimmer; chrome still metal; nothing chalky): `glossy()` roughness 0.30 → 0.50, clearcoat 1 → 0.3, clearcoatRoughness 0.12 → 0.40; `chrome` roughness 0.15 → 0.30; `silver` 0.22 → 0.38; suit roughness 0.30 → 0.46; `matte()` 0.65 → 0.80; the model's own face, hand and boot materials as much less shiny as the furniture. "One step" is half of each change. Update any test that pins the old numbers. Deliverable `r2-matte-compare.png`: the same full view three times — as it was, one step, two steps (labelled). Commit the two-step version: `feat: make the room two steps more matte`.

- [ ] **Step 4: Status rules.** Tests first in `bubble.test.ts`:

```ts
it.each([
  ['reading', 'thinking'], ['searching', 'working'], ['comparing', 'thinking'], ['writing', 'working'], [null, 'thinking'],
] as const)('working on %s shows %s', (step, badge) => {
  expect(badgeForState('working', null, step)).toBe(badge)
})
it('shows what a queued task has come to on the way back', () => {
  expect(badgeForState('returning', 'work', 'searching')).toBe('working')
  expect(badgeForState('returning', 'work', 'reading')).toBe('thinking')
  expect(badgeForState('returning', 'done', null)).toBe('done')
  expect(badgeForState('returning', 'failed', null)).toBe('error')
  expect(badgeForState('returning', null, null)).toBe('idle')
})
```

Waiting states stay `'idle'`, the three hand-over states `'done'`, `error` `'error'`. The driver passes the running task's step; the signals store's `badge` type follows. Commit with step 5.

- [ ] **Step 5: The five symbols.** `statusSymbols.ts` builds the geometries once, in code: `ringSymbol()` (an outer ring and, inside it, a bold "o": an oval with a narrow upright hole — proportions from the owner's picture: ring band ≈ 0.18 of the outer diameter, the "o" ≈ 0.51 × 0.44 of it, its hole ≈ 0.09 × 0.20, depth ≈ 0.14, soft edges), `exclamationSymbol()` (a bar wider at the top over a round puck), `zzzSymbol()` (three chunky Z's: a large one, one as large tilted up to the right, a smaller one below it). The owner's five pictures are kept with the other references, outside the repository: `5.webp` (exclamation), `6.webp` (Z's), `7.png`, `8.webp`, `9.webp` (rings). Tests in `statusSymbols.test.ts`: each symbol's bounding box is centred on the origin; the ring's outer diameter is `0.236` (the present badge's, ± 0.002); the exclamation's and the Z's larger side is between 0.22 and 0.24; no position is `NaN`; `symbolFor(status)` maps `idle → 'zzz'`, `thinking | working | done → 'ring'`, `error → 'exclamation'`, `hidden → null`, and `colorFor(status)` returns the five tokens. `StatusBadge.tsx` draws the symbol with `matte(colorFor(status))`, keeps its place above the head, its float and its pop on a change, replaces the coin spin with a sway about the vertical axis (resting about 22° to one side as in the pictures, ± 10°, period about 4 s) and stands still at the resting angle when `reduceMotion` is on. Remove the old ring's geometry and colours. Commit `feat: show the five status symbols above the head`.

- [ ] **Step 6: One bubble at a time.** Tests first in `bubble.test.ts`:

```ts
const said = (state: CharState, sinceDone: number | null) =>
  bubbleFor({ state, queued: null, message: null, sinceCancel: null, sinceDone })
it('says the two hand-over lines one after the other', () => {
  expect(said('standingUp', 0)).toEqual(['The research is ready.'])
  expect(said('walkingOut', 900)).toEqual(['The research is ready.'])
  expect(said('handingFile', 1499)).toEqual(['The research is ready.'])
  expect(said('handingFile', 1500)).toEqual(['Let me hand you the file.'])
  expect(said('handingFile', null)).toEqual(['Let me hand you the file.'])
})
it('never says two lines at once', () => { /* every state × queued × sinceDone ∈ {null, 0, 5000}: length ≤ 1 */ })
```

The driver measures `sinceDone` from the frame the first line appears. In `SpeechBubble.tsx` / `bubble.css` remove what only two bubbles needed (the stagger). Update the driver test and the e2e flow: after the hand-over exactly one `.bubble` is in the DOM and it reads `Let me hand you the file.`. Commit `feat: say the hand-over lines one at a time`.

- [ ] **Step 7: Look at it.** Built app, real browser: deliver `r2-symbols.png` (the five symbols close up, beside the owner's five pictures), `r2-idle.png`, `r2-thinking.png`, `r2-working.png`, `r2-handoff.png` (orange ring, orange file, one bubble), `r2-error.png`, `r2-mobile.png` (390 × 844), all in the scratchpad root. Console free of errors and warnings. `npm run e2e` green.

---

### Task 12: Hands and clips

**Files:**
- Create: `scripts/remove-extra-finger.mjs`; Modify: `public/models/ovice_guy.glb`
- Modify: `src/character/clips/shared.ts`, `wave.ts`, `sip.ts`, `idle.ts`, `typing.ts`, `tap.ts` and any clip that used `ARM_ON_DESK`; `src/character/clips/index.ts` (+ tests)
- Create: `src/character/clips/lounge.ts` (`loungeIdle`, `loungeWave`, `loungeStretch`, `loungeLookAround`), `hop.ts` (`hopOn`, `hopOff`), `run.ts` (+ tests)
- Create: `src/character/heldCup.ts`; Modify: `src/character/Character.tsx`, `src/scene/OfficeScene.tsx` or `src/scene/furniture/Props.tsx` (the cup follows the hand)
- Modify: `src/character/stateMachine.ts` (+ test) — the sip rule only
- Modify: `src/scene/layout.ts` (+ test): sofa spots; `SIDE_TABLE_POS` only if the seated character needs the room

**Interfaces:**
- Consumes: Task 11's `BadgeStatus`.
- Produces: `ClipName` gains `'loungeIdle' | 'loungeWave' | 'loungeStretch' | 'loungeLookAround' | 'hopOn' | 'hopOff' | 'run'`, all in `CLIPS`.
- Produces: `ARM_ON_KEYS` exported from `clips/shared.ts`; `seatedBase` rests both hands on the keys. `ARM_ON_DESK` goes if nothing uses it.
- Produces: `RUN_SPEED` (m/s the `run` clip strides at) from `clips/run.ts`, as `WALK_SPEED` is for `walk`.
- Produces: `SIP_GRIP = { from: number, to: number }` (seconds of the `sip` clip during which the cup is in the hand) from `clips/sip.ts`; `heldCup: { held: boolean; matrix: Matrix4 }` from `heldCup.ts` — one mutable object, written by the character each frame while it holds the cup, read by the cup.
- Produces in `layout.ts`: `SOFA_SEAT_POS: Vec3` (the `placement.position` while it sits on the sofa), `SOFA_FACING: number` (its yaw there), `SOFA_STAND_POS: Vec3` (where it stands just before hopping on), `SOFA_LIFT: number` (how far the seated body is lifted, as `SEAT_LIFT` is at the desk).
- Produces: `hopOn` starts with the body over `SOFA_STAND_POS` and ends in `loungeIdle`'s pose; `hopOff` is the way back. Both are sampled with `placement.position = SOFA_SEAT_POS`; the offset to the stand spot is in the pose's `'root 1'.pos`.

- [ ] **Step 1: The finger.** `scripts/remove-extra-finger.mjs` (plain Node, no new dependency: a GLB is a JSON chunk and a binary chunk) finds, on each hand, the small outermost finger that overlaps its neighbour and removes it — by dropping its triangles if it is a separate shell of the mesh, otherwise by moving its points inside the neighbouring finger. It prints the triangle counts before and after, exits non-zero if it cannot find the finger, and changes nothing when run a second time. Run it, commit script and model together. Deliver `r2-hand-before.png` and `r2-hand-after.png`: both hands close up from front, back and 45°, at rest and in `holdFile`, `wave` and `typing` — a thumb and three fingers, no hole, no dent, no dark seam. Commit `fix: remove the doubled finger from both hands`.

- [ ] **Step 2: Hands on the keys.** `seatedBase` uses `ARM_ON_KEYS`; the palms touch the keys (today they float about 3 cm) and, from the product camera, no part of either hand shows beside or above the laptop's lid — also with the pointer at the left and right screen edges (the camera's parallax) and on the phone camera. Every desk clip starts and ends there (`wave`, `sip`, `stretch`, `lookAround`, `tap`, `think`, `scratchHead`, `standUp`, `sitDown`). Deliver `r2-desk-idle.png` (three views: pointer centre, left edge, right edge). Commit `feat: rest the hands on the laptop while waiting at the desk`.

- [ ] **Step 3: The wave.** In `wave.ts` the raised hand shows its palm to the camera with the thumb on the head's side, through the whole sweep. Check in the browser with the hand bone's world axes (palm normal · direction to the camera > 0.7; thumb direction pointing towards the head) at both ends of the sweep, and deliver `r2-wave.png`. Commit `fix: wave with the palm to the viewer`.

- [ ] **Step 4: The sip rule.** Tests first in `stateMachine.test.ts`:

```ts
const sipping: CharMachine = { ...initialMachine(0), state: 'fidgeting', fidget: 'sip' }
it('finishes a sip before looking at the pointer', () => {
  const m = transition(sipping, { type: 'pointerMove' }, 500)
  expect(m).toMatchObject({ state: 'fidgeting', fidget: 'sip', lastPointerAt: 500 })
})
it('puts the cup down before starting on a task', () => {
  const queued = transition(sipping, { type: 'taskStarted' }, 500)
  expect(queued).toMatchObject({ state: 'fidgeting', fidget: 'sip', queued: 'work' })
  expect(transition(queued, { type: 'clipFinished' }, 900).state).toBe('working')
  const done = transition(queued, { type: 'taskDone' }, 700)
  expect(transition(done, { type: 'clipFinished' }, 900).state).toBe('standingUp')
  const failed = transition(queued, { type: 'taskFailed' }, 700)
  expect(transition(failed, { type: 'clipFinished' }, 900).state).toBe('error')
  const cancelled = transition(queued, { type: 'taskCancelled' }, 700)
  expect(transition(cancelled, { type: 'clipFinished' }, 900).state).toBe('resting')
})
```

Other fidgets behave as before. `bubbleFor` and `badgeForState` treat a sip with a queued task as they treat `returning` with one. Commit with step 5.

- [ ] **Step 5: The sip.** `sip.ts`: the hand reaches the cup, closes round it, lifts it to the mouth, the cup tilts towards the face while the head tips back a little, the cup goes back to `CUP_POS`, the hand lets go and returns to the keys. While `SIP_GRIP.from ≤ t < SIP_GRIP.to` the character writes the cup's world matrix into `heldCup` from its hand bone; otherwise the cup stands at `CUP_POS`. The cup's position is continuous at pick-up and put-down (no jump larger than 2 mm between two frames) and it ends within 1 mm of `CUP_POS`; cup and hand never part while held. Tests: `SIP_GRIP` lies inside the clip; the clip is continuous and ends in `seatedBase`. Deliver `r2-sip.png` (five moments, front and side). Commit `fix: lift the cup for a sip and put it back`.

- [ ] **Step 6: Sofa spots and poses.** Add the sofa constants to `layout.ts` (test: the seat spot lies inside the cushion's footprint and between the arms; the stand spot is a body radius clear of the desk, the sofa and the side table). `loungeIdle`: seated on the cushion, leaning back a little, both hands resting on the legs — touching, not floating, not sunk in; loops. `loungeWave`, `loungeStretch`, `loungeLookAround`: the desk gestures from that base, each ending in `loungeIdle`'s pose. If the side table hides the seated character's hands or face from the product camera, or stands where the character must stand, move `SIDE_TABLE_POS` by at most 0.3 m to the right and 0.2 m towards the camera, keeping it inside the picture, and show before and after. Extend the DEV-only review aid so a clip can be viewed at the sofa. Commit `feat: add the sofa poses`.

- [ ] **Step 7: Hop and run.** `hopOn` (about 0.6 s): from standing at the stand spot, a small jump backwards and up, landing seated. `hopOff` (about 0.35 s): the reverse, landing ready to run. `run`: leaning forward, arms pumping, a clear bounce, feet that do not slide at `RUN_SPEED`; `RUN_SPEED` at least twice the brisk walk's ground speed (`WALK_SPEED × WALK_PACE`). Tests: registry lists the seven names; `loungeIdle` and `run` loop seamlessly; `hopOn` ends in `loungeIdle.sample(0)`, `hopOff` starts from it; every new clip is continuous. Commit `feat: add the hop onto the sofa and the run`.

- [ ] **Step 8: Look at it moving.** For `sip`, `wave`, `hopOn`, `hopOff`, `run` and each lounge clip deliver a strip of consecutive frames (`r2-clips-<name>.png`) and one animated file `r2-clips.webp` or `.gif` (≤ 5 MB) the owner can watch: when the renderer is slower than 10 frames a second each rendered frame is 0.1 s of animation, so the captured frames played at 10 per second run at true speed. `npm run e2e` green.

---

### Task 13: Sofa behaviour

**Files:**
- Modify: `src/character/constants.ts`, `stateMachine.ts`, `clipForState.ts`, `bubble.ts`, `useCharacterDriver.ts` (+ their tests)
- Create: `src/store/chatActivity.ts` (+ test), `src/character/sceneLabel.ts` (+ test)
- Modify: `src/store/characterSignals.ts`, `src/ui/PromptBar.tsx` (+ test), `src/app/App.tsx` (+ test), `src/scene/layout.ts` (+ test)
- Create: `e2e/sofa.spec.ts`; Modify: other e2e specs and `README.md` where they describe the wait

**Interfaces:**
- Consumes: Task 12's clips, `RUN_SPEED`, sofa constants; Task 11's `'hidden'` badge.
- Produces: `Place = 'desk' | 'sofa'`; `CharState` gains `'goingToSofa' | 'rushingToDesk'`; `CharMachine` gains `place: Place` and `idleSince: number`; `CharEvent` gains `{ type: 'chatActivity' }` and the tick becomes `{ type: 'tick'; now: number; canLounge: boolean }`.
- Produces: `SOFA_AFTER_MS = 10_000`; `SOFA_FIDGETS: readonly FidgetKind[] = ['stretch', 'lookAround']`; `RUN_PACE` beside `WALK_PACE`.
- Produces: `TravelPhase = 'rising' | 'moving' | 'settling'`; `clipToPlay(state, fidget, step, place, phase): ClipName`; `clipAwaitedBy(state, fidget, place): ClipName | null`.
- Produces: `SOFA_PATH: readonly Vec3[]` in `layout.ts` — from the seat round the left end of the desk and along its front to `SOFA_STAND_POS`.
- Produces: `useChatActivity` (`{ at: number; report(): void }`) — the prompt field calls `report()` on focus and on every change of its text; the driver turns a change of `at` into a `chatActivity` event.
- Produces: `CharacterSignals.place`; `sceneLabel(state: CharState, place: Place): string`.

- [ ] **Step 1: The rules, tests first** (`stateMachine.test.ts`; `tick(now, canLounge = true)` builds the event):

```ts
it('goes to the sofa after 10 s without chat input', () => {
  const m = initialMachine(0)
  expect(transition(m, tick(9_999), 9_999).state).toBe('resting')
  expect(transition(m, tick(10_000), 10_000).state).toBe('goingToSofa')
})
it('goes although the pointer keeps moving', () => {
  const watching = transition(initialMachine(0), { type: 'pointerMove' }, 9_500)
  expect(transition(watching, tick(10_000), 10_000).state).toBe('goingToSofa')
})
it('counts from the last chat input', () => {
  const m = transition(initialMachine(0), { type: 'chatActivity' }, 6_000)
  expect(transition(m, tick(15_999), 15_999).state).toBe('resting')
  expect(transition(m, tick(16_000), 16_000).state).toBe('goingToSofa')
})
it('does not leave in the middle of a wave or a fidget', () => { /* greeting and fidgeting ignore the tick; the next tick in resting leaves */ })
it('stays at the desk where the sofa cannot be seen', () => {
  expect(transition(initialMachine(0), tick(60_000, false), 60_000).state).toBe('resting')
})
it('sits on the sofa when it has arrived', () => {
  expect(transition(going, { type: 'clipFinished' }, 17_000)).toMatchObject({ state: 'resting', place: 'sofa' })
})
it('waits on the sofa as it does at the desk, without the desk fidgets', () => { /* pointerMove → watching; still 1200 ms → greeting; a fidget is 'stretch' or 'lookAround' for rand 0, 0.3, 0.6, 0.99 */ })
it('hurries back when the chat is touched', () => { /* resting, watching, greeting, fidgeting at the sofa and goingToSofa: chatActivity → rushingToDesk */ })
it('hurries back for a task started without typing', () => {
  expect(transition(onSofa, { type: 'taskStarted' }, 20_000)).toMatchObject({ state: 'rushingToDesk', queued: 'work' })
})
it('acts on the task once it is seated', () => { /* rushingToDesk + clipFinished: queued work → working, done → standingUp, failed → error, null → resting; always place 'desk' */ })
it('follows the queued task while it runs', () => { /* as 'returning' does: taskDone, taskFailed, taskCancelled */ })
it('comes back when the sofa leaves the view', () => {
  expect(transition(onSofa, tick(30_000, false), 30_000).state).toBe('rushingToDesk')
})
it('counts the wait from when it is back at rest', () => { /* returning → resting, error → resting, working → cancelled, rushingToDesk → resting: idleSince is that moment */ })
```

Chat input at the desk only restarts the count. Commit with step 2.

- [ ] **Step 2: Clips, bubble, badge for the new states.** Tests first. `clipToPlay`: waiting at the sofa → `loungeIdle`, `loungeWave`, `loungeStretch`, `loungeLookAround`; `goingToSofa` → `standUp` / `walk` / `hopOn` by phase; `rushingToDesk` → `hopOff` / `run` / `sitDown`; `returning` → `walk` / `sitDown`. `clipAwaitedBy`: `goingToSofa` → `hopOn`, `rushingToDesk` → `sitDown`, the sofa's greeting and fidgets → their lounge clips. `clipSpeedFor('run')` is `RUN_PACE`. `bubbleFor`: `rushingToDesk` with a queued task shows that task's line, otherwise both new states say nothing (the cancel line still shows for its 2 s). `badgeForState`: `goingToSofa` → `'idle'`; `rushingToDesk` → `'hidden'` with nothing queued, otherwise what the queued task has come to (Task 11's rule). Commit `feat: add the rules for waiting on the sofa`.

- [ ] **Step 3: Chat activity.** `chatActivity.ts` and its test (`report()` changes `at`; two reports give two changes). `PromptBar` reports on the field's focus and on each change of its text — test with the real store: typing a character reports, a blank Enter does not need to, the progress pill replacing the field reports nothing. Commit `feat: tell the character when the chat is being used`.

- [ ] **Step 4: The route.** `SOFA_PATH` with a test: every point of the rounded route keeps `CHARACTER_BODY_RADIUS` from the desk, the bookshelf, the drawer unit, the sofa and the side table (the last stretch to the stand spot excepted where the stand spot itself is checked in Task 12). Commit with step 5.

- [ ] **Step 5: The driver.** It sends `canLounge = window.innerWidth >= MOBILE_BREAKPOINT` with every tick and `chatActivity` when the store's `at` changes; walks `SOFA_PATH` at the walk's pace on the way out and runs it back at `RUN_SPEED × RUN_PACE`, from wherever on the route it is when it turns round; plays the phase clips; holds `SOFA_SEAT_POS` / `SOFA_FACING` while on the sofa, with the look at the pointer working there; skips the travelling when `reduceMotion` is on, as it does for the hand-over; publishes `place`. Seated and ready within 3.5 s of the first key press.

- [ ] **Step 6: Driver tests** (`useCharacterDriver.test.tsx`, its existing frame harness): after 10 s it ends on the sofa (`SOFA_SEAT_POS`, `loungeIdle`); chat activity brings it back through `hopOff`, `run`, `sitDown` to `SEAT_GROUND_POS`; activity half-way out turns it round with no step between two frames longer than one frame of running; activity twice, and during `hopOn`, still ends seated at the desk; a task started on the sofa ends in `working` at the desk and is handed over when done; a fast task that is already done on arrival is handed over; `window.innerWidth = 390` → it never leaves; narrowing the window while it lounges brings it back; reduced motion → no `walk` or `run` clip and it is on the sofa within a few frames; the badge is `'hidden'` only while it runs back with nothing queued; a result finished before the driver mounted is still handed over. Commit `feat: wait on the sofa and run back when the chat is used`.

- [ ] **Step 7: A name for the scene.** `sceneLabel` returns one Korean sentence per situation (waiting at the desk, on the way to the sofa, resting on the sofa, running to the desk, working, bringing the result, holding the file, going back, failed) — test every state and place. The scene's wrapper in `App.tsx` gets `role="img"` and that `aria-label`; it is not a live region. Commit `feat: describe what the character is doing to screen readers`.

- [ ] **Step 8: End to end** (`e2e/sofa.spec.ts`, the built app; read the scene's label). With reduced motion seeded: the label says desk, then sofa after 10 s; a click into the chat field brings it back; a prompt sent then runs to the hand-over. Without reduced motion, small viewport, once: it walks to the sofa and runs back after a key press, and the console stays clean. At 390 × 844: still at the desk after 12 s. Reload while on the sofa: back at the desk, nothing running. Existing flows stay green (`npm run e2e`); say how long the suite takes now. Update `README.md` if it describes the wait. Commit `test: cover the sofa wait end to end`.

- [ ] **Step 9: Look at it moving.** Deliver `r2-sofa-idle.png` (the app with the character on the sofa under its Z's), `r2-running.png`, `r2-back-at-desk.png`, `r2-mobile-idle.png`, a strip `r2-sofa-trip.png`, and animated `r2-sofa-trip.webp` / `r2-run-back.webp` (true speed, as in Task 12 step 8).
