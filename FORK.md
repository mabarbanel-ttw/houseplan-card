# FORK.md — `mabarbanel-ttw/houseplan-card` (branch `matt/single-pane`)

This fork of [Matysh/houseplan-card](https://github.com/Matysh/houseplan-card)
starts at upstream **v1.82.0** (`eb172115f3b90568d22a8b99dc947dd66cf2b409`) and
turns the House Plan card into a **single pane**: the house map is the whole
interface on desktop, a 12.9" iPad Pro kiosk and a phone. You fly in and out —
house → room → equipment rack → faceplate — and back out, change levels by
tapping stairs, tap a device to control it and hold it for full controls,
without ever leaving the map.

Releases are tagged `vX.Y.Z-matt.N` on this fork and keep the upstream HACS
layout (`hacs.json` → `houseplan.zip`, `zip_release: true`).

UI copy rule for every fork feature: no sentences or text badges in the UI;
state is shown visually (dimmed, dashed outline, icon); labels are at most one
or two words.

Upstream's issue/label/trailer process (AGENTS.md, PROCESS.md) governs
contributions to upstream and does not bind this fork.

---

## 1. Stairs fly-landing

**What.** Following a valid stair (clean tap/click, Enter or Space in View or
kiosk) still switches to the target level, and then animates the camera with
the existing short smooth camera transition to the stair *on the target level
that leads back* to the level you came from (`target_space_id` equal to the
source space id). With several such stairs, the one nearest to the source
stair's normalized position wins. With none, the camera fits the target
level's whole content (the same action as **Fit all**). The same happens in
reverse, so up-then-down lands you where you started.

The landing frames the stair with context: the stair's footprint is grown to at
least half of the level frame's longer side and fitted into the middle 80 % of
the stage, so you see the stair and the rooms around it. In 2.5D the projected
footprint is used. Like room fit, the landing is session-only: it does not
replace the per-level zoom saved in the browser.

Pan, pinch, long press, swipe and cancelled pointers still never follow a
stair (unchanged upstream guards). A card configured with `floor` keeps its
inert stairs.

**Why.** On the iPad the stairs are the way between levels; arriving at the
remembered camera of the other level (often somewhere unrelated) broke the
sense of walking up the stairs.

**Config keys.** None (uses the existing `spaces[].stairs[].target_space_id`).

**Files.** `src/fork-focus.ts` (`stairLanding`, `inflateToContext`),
`src/stairs-view.ts` (navigation routes through `_followStair`),
`src/houseplan-card.ts` (`_followStair`, `_landOnSpace`, `_flyToBounds`,
`_planRectBounds`), `test/fork-focus.test.mjs`, `demo/fork/*`.

## 2. Level indicator instead of tabs

**What.** Card option `level_nav: indicator` hides the text tab strip in View
and kiosk and paints a compact vertical stack of level glyphs on the right edge
of the map (one stylised floor slab per space; the current level lit in the
accent colour, the others ghosted). Tapping a glyph switches to that level and
flies to its whole content (the same landing as a stair without a link back);
tapping the current level's glyph fits the whole level. The glyphs carry no
text — the level title is only the accessible name / desktop hover title.

Editors keep the ordinary tab strip (spaces are still created, renamed and
reordered there). A card with `floor` (a fixed level) or a house with one
level shows no indicator.

On-map chrome never sits on top of the plan you are trying to see: every fit
the card performs — Fit all, double-tap, room fit, nested fly-in, stair and
level landings — fits into the part of the stage left of the indicator (and,
with §5, clear of the scene dock). Without fork chrome the camera maths is
bit-for-bit upstream room fit (unit-tested).

**Config keys** (Lovelace card YAML; normalized in `src/fork-chrome.ts`):

```yaml
type: custom:houseplan-card
level_nav: indicator        # default: tabs (upstream behaviour)
level_nav_order: tabs       # glyphs top-to-bottom: tabs (first tab on top, default) | reverse
```

Order your tabs Upper, Main, Lower (Plan editor tab drag) to read the stack as
the building; or keep the upstream ground-first order and set
`level_nav_order: reverse`.

**Files.** `src/fork-chrome.ts` (`forkCardOptions`, `levelGlyphs`,
`renderLevelIndicator`), `src/fork-focus.ts` (`insetCameraTarget`),
`src/styles/fork.styles.ts`, `src/styles.ts`, `src/types.ts` (`CardConfig`),
`src/houseplan-card.ts` (`_fork`, `_levelIndicatorOn`, `_flyToLevel`,
`_renderForkChrome`, `_chromeInsets`, `_cameraTargetFor`; room fit and
`_resetZoom` use the chrome-aware target), `test/fork-chrome.test.mjs`,
`test/fork-focus.test.mjs`.
