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

## 3. Nested fly-in targets (room → rack → faceplate)

**What.** Each space may carry `focus_regions`: rectangles that are real zoom
levels below the room. A region belongs to a room (`room_id`) or to another
region (`parent_id`), so the living room can hold an equipment rack and the
rack the UDM faceplate. The camera keeps a *fly-in position* — whole level,
a room, or a region — and:

- a clean tap (same rules as room fit: one primary tap, applied after the
  350 ms double-tap window; pan, pinch, long press, swipe and cancelled
  pointers never fly) on a region that is a child of the current position
  flies into it (rack inside the fitted living room, faceplate inside the
  fitted rack). Siblings and the surroundings work too: from the faceplate a
  tap on the switch faceplate next to it flies there, a tap on the rack around
  it flies back to the rack. A tap on a room outside your position keeps the
  upstream room fit; a tap outside everything keeps the upstream behaviour;
- the **step-out control** (round back-arrow button, top-left of the map;
  dots show the depth) steps out one level at a time: faceplate → rack →
  living room → whole level. **Fit all** (toolbar or double-tap) goes straight
  to the whole level;
- the regions one tap away from where you are get a faint dashed outline, so
  you can see where you can go deeper; nothing else is drawn, no text;
- markers inside a region you have **not** entered are painted but do not take
  the tap — on an iPad/phone their 44 px touch targets would otherwise cover
  the whole rack and you could never fly into it. As soon as you are inside the
  region they are ordinary markers again (tap = action, hold = device card), and
  a tap on a marker never triggers a fly-in. Card option
  `focus_nested_markers: tappable` restores upstream marker taps everywhere.

The maximum zoom is raised from 8x to 32x so a 44 cm faceplate on a 12 m plan
can fill the stage (fly-ins clamp to it; wheel/pinch can now also go deeper).
Fly-ins use the existing camera transition, keep clear of the on-map chrome
(§2), re-fit atomically on resize like room fit, and never write the
per-level zoom preference. 2.5D uses the projected rectangle and the floor
plane for tap hit-testing.

**Authoring.** With card option `focus_edit: true`, a writer sees two extra
round buttons under the step-out control in View: **+** saves the middle 80 %
of the current camera as a new region, child of the current position (frame
the rack with pinch/wheel while the living room is the position, press **+**;
then frame the faceplate inside the rack, press **+**). **−** deletes the
region you are in (its child regions move up to its parent) and steps out.
Regions can also be written by hand in an exported config (JSON below) and
re-imported. Remove `focus_edit` again for day-to-day use.

**Config keys.**

Persisted, per space (validated by `FOCUS_REGION_SCHEMA` in
`custom_components/houseplan/validation.py` and `focusRegionList` in
`src/fork-focus.ts`; additive, no model/store version change, unknown sibling
fields preserved):

```json
"focus_regions": [
  { "id": "rack", "x": 0.395, "y": 0.115, "w": 0.09, "h": 0.12, "room_id": "living" },
  { "id": "udm", "x": 0.402, "y": 0.128, "w": 0.076, "h": 0.022, "parent_id": "rack", "name": "UDM" }
]
```

- `id` string 1–64, unique within the space (required);
- `x`, `y` top-left corner, `w`, `h` positive size — normalized plan
  coordinates, both axes divided by the plan width, exactly like `room.poly`
  (required; |x|,|y| ≤ 5000, 0 < w,h ≤ 5000);
- `parent_id` (region id) or `room_id` (room id), optional, nullable; neither =
  a level-level region reachable directly from the whole level; `parent_id`
  wins when both are set;
- `name` optional (≤ 64 chars), never painted (UI copy rule);
- at most 200 per space. A missing parent or a parent cycle is read as "no
  parent" without rewriting the stored record.

Transfers: full backup/import and space export keep the records; plan-only
export keeps them (they are plan geometry); a one-space import remaps
`room_id` through the same room-id map as the rooms.

Lovelace card YAML:

```yaml
focus_edit: false              # true: show the + / − authoring buttons to writers in View
focus_nested_markers: inert    # inert (default) | tappable
```

**Files.** `src/fork-focus.ts` (`FocusRegion`, `focusRegionList`,
`focusParent`, `focusChildren`, `resolveFocusTap`, `focusPath`, `nestedAway`,
`focusRegionFromView`), `src/room-fit.ts` (`PlanTapGestureController` offers
delayed room/background taps to `planTap` before room fit),
`src/houseplan-card.ts` (`_focusNode`, `_fitRegion`, `_focusPlanTap`,
`_clientToPlanNorm`, `_stepOut`, `_renderFocusHints`, `_forkNestedAway`,
`_addFocusRegionFromView`, `_removeCurrentFocusRegion`, resize re-apply,
`ZOOM_MAX` 32), `src/fork-chrome.ts` (`renderStepOut`),
`src/styles/fork.styles.ts`, `src/i18n/{en,ru,de,fr}.json` (`fork.*`),
`custom_components/houseplan/validation.py`,
`custom_components/houseplan/import_export.py`, `scripts/config-schema.json`
(regenerated), `test/fork-focus.test.mjs`, `test/room-fit.test.mjs`,
`tests_backend/test_fork_single_pane.py`, `tests_backend/test_ha_import_export.py`.

## 4. Touch callout (per-device detail on tap)

**What.** New marker tap action **Callout** (`tap_action: "callout"`, chosen in
the device editor's action list like any other). A short tap/click opens a
small popover anchored to the marker, in place — not a dialog, not a page:

- the marker icon and name;
- the primary entity's state (HA-formatted);
- the marker's value-badge source value when it has one (e.g. link speed);
- a switch control when the primary entity is a `switch.*` or `light.*`
  (calls `<domain>.toggle` on exactly that entity; locks, covers and every
  other domain never get a switch here);
- a **⋯** control that opens HA more-info for the primary entity.

Tapping outside closes it (that tap does nothing else — it does not also fit a
room or fly in; a tap on another marker still acts on that marker). A second
tap on the same marker, Escape, a level switch or entering an editor also
close it. The callout follows the camera (it lives in the camera layer), stays
on screen near the edges (its beak keeps pointing at the marker) and opens
below the marker near the top edge.

Desktop keeps the hover tooltips; the callout also works with a mouse click.
Every existing action (device card, more-info, toggle, run, do nothing) and the
600 ms hold → device card are unchanged.

**Config keys.** Marker `tap_action` accepts `"callout"` (persisted; added to
the integration's marker schema enum, the support-package wire schema and the
frontend `TAP_ACTIONS`):

```json
{ "id": "port-3", "binding": "entity:sensor.udm_port_3_speed", "tap_action": "callout" }
```

**Files.** `src/fork-chrome.ts` (`renderCallout`, `calloutToggleEntity`),
`src/houseplan-card.ts` (`_openCallout`, `_closeCallout`, `_calloutModel`,
`_renderCalloutLayer`, `callout` branch of `_clickDevice`), `src/logic.ts`
(`TAP_ACTIONS`), `src/device-toggle.ts` (`projectedTapAction`),
`src/styles/fork.styles.ts`, `src/i18n/*.json` (`tap.callout`,
`fork.callout_*`), `custom_components/houseplan/validation.py`,
`custom_components/houseplan/support_wire_schema.py`,
`scripts/config-schema.json`, `test/fork-chrome.test.mjs`,
`test/logic.test.mjs`, `tests_backend/test_fork_single_pane.py`.
