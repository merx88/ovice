# ovice — round 2 changes (design)

Date: 2026-11-13. Approved by the owner in conversation ("나머지 수정사항은 확인했어 그대로 진행해").
Builds on `2026-11-12-ovice-agent-office-design.md`; where the two differ, this document wins.

## Why

The owner watched the finished prototype in a real browser and asked for ten changes. Most are about the
character reading as alive and well made: its idle pose looked awkward, two of its gestures looked wrong,
its hand has a modelling fault, the room is shinier than intended, and the status above its head should
use the owner's own five symbols.

## What the owner asked for, and what will be built

Items marked **(call)** are the builder's decisions, shown to the owner and accepted with the rest.

### 1. Waiting: desk, then sofa

- At the desk the hands rest on the laptop's keys, hidden behind its screen when seen from the front.
- After 10 s without chat input the character stands up, walks to the silver sofa and sits there with its
  hands on its legs.
- On the sofa, when the owner clicks into the chat field or starts typing, it hurries back to the desk
  ("호다닥") and sits down, ready.
- **(call)** "Input" means the chat field only: focusing it or changing its text. Moving the mouse does
  not count. Following the cursor with its eyes and waving when the cursor stops work on the sofa as they
  do at the desk.
- **(call)** The gap between desk and sofa is 0.25 m and the body is 0.62 m wide, so the way is round the
  left end of the desk and along its front, the route already used for the hand-over. Walking there takes
  about 5 s, running back about 2 s. The side table in front of the sofa may move a little if it blocks
  the approach.
- **(call)** On phones (narrower than 768 px) the sofa is outside the picture, so there the character
  stays at the desk.
- **(call)** A task sent while it is still running back: it keeps running, sits, and starts working. A
  task started without typing (the retry button) calls it back the same way.
- **(call)** With "애니메이션 줄이기" on, the walk and the run are skipped as they are for the hand-over:
  the character changes place in one cut.

### 2. Coffee

Today the cup stays on the desk and the hand mimes. The hand grips the cup, the cup leaves the desk with
it, tilts at the mouth for the sip, and is put back where it stood.

### 3. Speech bubbles, one at a time

"The research is ready." while the character gets up and comes over; when it has arrived that bubble goes
and "Let me hand you the file." takes its place. Never two bubbles at once. **(call)** Each line stays at
least 1.5 s, also when the walk is skipped.

### 4. Poppins

All Latin text and digits in Poppins. Poppins has no Hangul, so Korean stays in Pretendard. Sizes and
spacing are re-fitted so no label overflows its pill.

### 5. Orange file

The folder the character hands over is the orange of the desk chair (`tokens.orange`).

### 6. Less glossy

Every surface two modest steps more matte: highlights broader and dimmer, chrome still reads as metal,
nothing chalky. The owner gets a comparison picture (now / one step / two steps) and can pick the other.

### 7. Wave

The palm faces the viewer and the thumb points towards the head (today the palm faces backwards).

### 8. Hand

On both hands the small outermost finger overlaps its neighbour. It is removed, leaving a thumb and three
fingers, with no hole or dent where it was.

### 9. Vercel

Explained to the owner (import the repository, defaults, deploy). The repository has one branch, which is
the one that gets deployed. Nothing to build.

### 10. Five status symbols

The ring above the head is replaced by the owner's five symbols, modelled in code, matte, at the size of
the present badge, in the colours of the owner's pictures:

| State | Symbol | Colour |
| --- | --- | --- |
| error | exclamation mark | red `#E93A3C` |
| resting | three Z's | grey `#7A7A7A` |
| task complete | ring with a bold "o" inside | orange `#D98C32` |
| thinking | the same ring | yellow `#E0CD74` |
| working | the same ring | green `#CDDC61` |

- **(call)** Thinking is the two steps where the character thinks (reading the request, comparing);
  working is the two where it types (searching, writing).
- **(call)** The symbols sway gently instead of spinning like a coin, so their shape is readable in any
  still frame.
- **(call)** The Z's show whenever the character waits, at the desk or on the sofa, and are hidden only
  while it runs back to the desk.

## Not part of this round

Real agent mode, library content, the other tabs, sound, new furniture, changes to the 2D layout other
than the font.

## Would make it a failure even if it "works"

- The character stuck on the sofa, or half-way, while a task runs or a file waits to be handed over.
- Hands visible beside the laptop at the desk, or floating above what they rest on.
- A cup that jumps, or travels without the hand.
- A symbol nobody can tell apart from another in a still picture.
- Text that overflows or is cut after the font change.

## Approaches considered

**Getting to the sofa.** (a) Round the left end of the desk — longer, but nothing is walked through, and
the hurried run round the desk is the comedy the owner asked for. (b) Through the 0.25 m gap — shorter,
the body passes through furniture. (c) Move the sofa to open the gap — it would leave the picture on the
right. Chosen: (a).

**Where the waiting place lives in the code.** (a) A `place` (desk / sofa) beside the existing waiting
states, plus two travelling states — the four waiting states and their rules stay single. (b) A second set
of four sofa states — every rule twice. Chosen: (a).

**The finger.** (a) Edit the model file once with a small script kept in the repository — the asset is
right for every later use. (b) Hide the finger at load time in the page — the fault stays in the file and
the page carries a patch for ever. Chosen: (a), falling back to moving the finger's points inside its
neighbour if it is not a separate piece of the mesh.

**The cup.** (a) The one cup in the scene follows the hand while it is held — one object, no popping.
(b) A second cup in the hand while the desk's is hidden — two objects to keep in step. Chosen: (a) unless
the builder finds the scene graph makes (b) clearly simpler.

## Left to the builder

Exact poses and timings of the new clips (sofa sit, hop on and off, run), the look of the three symbols
within the pictures' proportions, the amounts by which each material changes, and the type sizes after
the font change — each shown in screenshots.

## Order of work

1. Look and symbols (4, 5, 6, 10, 3).
2. Hands and clips (8, 7, 2, and the poses and clips for 1).
3. Sofa behaviour (the rules of 1), with the end-to-end tests updated.
4. One review of the whole branch.
