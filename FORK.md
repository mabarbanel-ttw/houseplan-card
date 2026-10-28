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
- markers inside a region you have **not** entered are hidden and do not take
  the tap (§7) — on an iPad/phone their 44 px touch targets would otherwise
  cover the whole rack and you could never fly into it. As soon as you are
  inside the region they are ordinary markers again (tap = action, hold =
  device card), and a tap on a marker never triggers a fly-in. Card option
  `focus_nested_markers: inert` keeps them painted-but-untappable instead;
  `tappable` restores upstream marker behaviour everywhere.

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
focus_nested_markers: hide     # hide (default, §7) | inert | tappable
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

## 5. On-map scene dock

**What.** Card option `scene_dock` paints a small floating dock of round icon
buttons over the map (frosted capsule, default bottom-left corner). A tap runs
the entry: `script.turn_on` for a script, `scene.turn_on` for a scene. The
pressed button flashes the accent; a script that is currently running glows;
an entity missing in HA is drawn dashed/ghosted and disabled. No text: the
optional `name` is only the desktop hover title / accessible name.

The dock respects the safe areas, never covers the level indicator (it lives
in a corner, the indicator on the right edge's middle; the top-left corner is
shifted right of the step-out control), and the zoom badge moves above a
bottom-left dock. Every fit keeps the plan clear of the dock's band (§2). Dock
presses never pan, fly or dismiss anything on the plan.

**Config keys** (Lovelace card YAML; up to 12 entries, only `script.*`/`scene.*`
entity ids are accepted, duplicates dropped; a bare string is also accepted):

```yaml
scene_dock:
  - entity: script.night_study
    icon: mdi:book-open-variant
    name: Study                 # optional, hover title only
  - entity: script.late_night_chill
    icon: mdi:weather-night
  - scene.all_off               # icon defaults: scene → mdi:palette, script → mdi:play
scene_dock_corner: bottom-left  # bottom-left (default) | bottom-right | top-left | top-right
```

**Files.** `src/fork-chrome.ts` (`renderSceneDock`, `sceneDockService`, dock
normalization in `forkCardOptions`), `src/houseplan-card.ts` (`_runDockItem`,
dock band in `_chromeInsets`), `src/styles/fork.styles.ts`, `src/types.ts`,
`test/fork-chrome.test.mjs`.

## 6. "Not in HA" presentation

**What.** Marker option `presentation: "ghost"` for virtual markers (things
that exist in the house but not in Home Assistant — a Hue bridge, candles, a
filament dryer). The marker is drawn as a dimmed, greyscale icon in a dashed
ring; it paints no text, no value badge, no battery/LQI/maintenance marks and
no live state, and shows no hover tooltip in View. A tap does nothing unless a
tap action is explicitly set on the marker (then that action runs as usual);
the 600 ms hold still opens the device card. The device editor shows a
**Not in HA** switch for virtual markers (and for any marker that already
carries the flag).

**Config keys.** Marker field (persisted; integration schema
`vol.Any("ghost", None)`; absent/`null` = ordinary marker):

```json
{ "id": "hue-bridge", "binding": "virtual", "name": "Hue bridge", "icon": "mdi:hub-outline", "presentation": "ghost" }
```

**Files.** `src/device-presentation.ts` (ghost → neutral static icon,
`presentation-ghost` class, no badges), `src/houseplan-card.ts`
(`_clickDevice` ghost default = do nothing, `_showDeviceTip`),
`src/editors/marker-dialog.ts`, `src/houseplan-editor-runtime.ts` (draft +
both save paths), `src/types.ts`, `src/styles/fork.styles.ts`,
`src/i18n/*.json` (`fork.ghost`), `custom_components/houseplan/validation.py`,
`scripts/config-schema.json`, `tests_backend/test_fork_single_pane.py`.

## 7. Progressive disclosure (detail appears as you fly in)

**What.** At whole-level zoom a busy room (the living room carries ~45
markers plus the rack and faceplate drawings) was an unreadable cluster. Now
detail belongs to the zoom level it is meant for and fades in during the
fly-in, out again on back-out (240 ms opacity; reduced motion = instant):

- a **marker inside a focus region** (§3) is hidden — and not tappable, so the
  tap reaches the region — until that region is on your fly-in path (you are
  in it or deeper). Ports on the faceplate appear when you enter the
  faceplate; the rack's own devices when you enter the rack;
- a **decor item or background image inside a focus region** appears one level
  earlier, once the region's parent is on the path: the rack drawing shows in
  the living room, the faceplate drawing in the rack. Level-level regions'
  drawings are always shown;
- zooming by hand also reveals: a region that fills ≥ 85 % of the view counts
  as entered for its markers (≥ 40 % for decor), so pinch/wheel work without
  tapping;
- the **whole level** (no room focused, zoom < 1.5) shows room devices at
  reduced density: 72 % size, icon only (no value badges, battery, LQI,
  maintenance marks). A focused room shows its devices at full size.
- per-item override with `reveal` (marker or decor):
  `"room"` = only once its room is the position (or the room fills ≥ 70 % of
  the view); `"region:<id>"` = only once that region is on the path (or fills
  ≥ 85 %); `{"min_zoom": n}` = only from camera zoom `n` (1 = fit all).

**Config keys.**

Persisted, marker and decor item (integration `_REVEAL` schema; absent/`null`
= automatic rules above):

```json
{ "id": "candles", "binding": "virtual", "reveal": "room" }
{ "id": "udm-port-7", "binding": "entity:sensor.udm_port_7_speed", "reveal": "region:fr_faceplate" }
{ "id": "rack-elevation", "kind": "image", "asset_id": "…", "x": 0.62, "y": 0.12, "w": 0.24, "h": 0.14, "reveal": {"min_zoom": 2} }
```

Lovelace card YAML:

```yaml
level_density: reduced          # reduced (default) | full — whole-level marker density
focus_nested_markers: hide      # hide (default) | inert (painted, untappable) | tappable (upstream)
```

For the owner's data builder: `fork_slots.json` lists regions as
`rect_norm: [x0, y0, x1, y1]`; the persisted record is
`{"id", "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "room_id" | "parent_id"}`
(e.g. `fr_rack` → `{"id": "fr_rack", "x": 0.62, "y": 0.122941176, "w":
0.241176471, "h": 0.138823530, "room_id": "m_living"}`, `fr_faceplate` →
`parent_id: "fr_rack"`). Markers and decor whose position lies inside a region
need no `reveal` field.

**Files.** `src/fork-focus.ts` (`parseReveal`, `revealShown`,
`REVEAL_*_FRACTION`), `src/houseplan-card.ts` (`_forkRevealContext`,
`_forkMarkerClass`, `_forkRevealDecor`, decor layer wraps items in
`.fork-reveal`), `src/styles/fork.styles.ts`,
`custom_components/houseplan/validation.py` (`_REVEAL` on markers and every
decor kind), `scripts/config-schema.json`, `test/fork-focus.test.mjs`,
`tests_backend/test_fork_single_pane.py`, `demo/fork/*`.

## 8. Compact value badges

**What.** Badges on small markers have room for ~5 characters.

- Data rates (`bit/s`, `kbit/s`, `Mbit/s`, `Gbit/s`, `bps`/`Mbps`/…, and
  byte rates `B/s`…`GB/s`, `KiB/s`…) are shown in compact SI form from the raw
  state: `1000 Mbit/s` → `1G`, `100` → `100M`, `10000` → `10G`, `940` → `940M`,
  `2500` → `2.5G`; byte rates keep a `B` (`13MB`).
- Durations (`device_class: duration` or unit `ms`/`s`/`min`/`h`/`d`):
  `95 min` → `95m`, `135 min` → `2h15m`, `3 d` → `3d`, `45 s` → `45s`.
- No unit is ever doubled: when Home Assistant's formatter already put its own
  unit text on the value (e.g. a duration formatted `95m` for a `min`
  sensor), nothing is appended (this was `95m min`).

Applies to value badges and to the value face (`display: value`). Every other
value keeps HA's formatting and precision. Tooltips/callouts show the same
compact text.

**Config keys.** None.

**Files.** `src/fork-format.ts` (`compactRate`, `compactDuration`,
`compactBadgeValue`), `src/device-value-badge.ts`, `src/device-presentation.ts`,
`src/logic.ts` (`valueWithUnit`), `test/fork-format.test.mjs`.

## 9. Touch fixes found on the way

- **Room "open HA area" link hidden on touch-only devices in View** (CSS
  `@media (hover: none)`): it is a page change (breaks the single pane) and,
  at phone zoom, its fixed-size button landed on top of stairs and markers and
  swallowed their taps (observed in the phone demo: a stair tap opened the
  area link target). Desktop hover keeps it.
- **Markers no longer block fly-in on touch** (§3/§7): hidden detail drops its
  44 px touch floor.
- **On-map chrome owns its input** (`data-scene-surface`): level glyphs, dock,
  step-out and callout never start a pan/pinch, never count as a plan tap, and
  use `touch-action: manipulation` (no double-tap zoom delay in iOS WKWebView).
- **Fits keep content clear of chrome and safe areas** (§2): no landing or
  room fit puts its target under the level indicator or dock; all chrome uses
  `env(safe-area-inset-*)`.
- **Outside-tap dismissal is consumed** (§4): closing a callout never also
  fits a room underneath.

Verified with touch emulation (`hasTouch`, `(hover: none)`, `(pointer:
coarse)`) on 1366×1024, 1024×1366 and 390×844 in `demo/fork/shots.mjs`; pinch
and pan are unchanged upstream code paths (`smoke_room_fit`, `smoke_stairs`,
`smoke_pan_any_zoom` still pass, see release notes in the report).
