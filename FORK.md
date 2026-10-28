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

Contents: §1 stairs fly-landing · §2 level indicator · §3 nested fly-in
targets · §4 touch callout · §5 scene dock · §6 "not in HA" ghost · §7
progressive disclosure · §8 compact value badges · §9 touch fixes · §10
everyday View chrome · §11 inactive (down) markers · §12 one marker per
device: callout actions and extra rows · §13 no fake badges · §14 phone room
view and room sheet · matt.2 fixes · Release.

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
  reduced density: 72 % size, icon only (no value badges or LQI; battery and
  maintenance marks stay, they are status). A focused room shows its devices
  at full size.
- beyond upstream's 8x zoom (§3 raises the limit to 32x) markers keep their
  8x size, so deeper levels spread equipment apart instead of ballooning
  every marker to the size of the stage (also keeps compositor layers
  stage-sized; `smoke_daycycle_zoom_layers`).
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

## 10. Everyday View chrome (matt.2)

**What.** View and kiosk show no editor or admin tools; the one menu button is
a ⋮. The Plan / Device /
Background editors, space settings, add space, general settings, PDF,
help & feedback, show hidden devices and the summary-panel controls all live
in the one header menu (upstream's phone menu, now used at every width). In
the header only the title, the space tabs (unless §2's indicator replaces
them), **Fit all** and the menu button remain; zoom −/+ show only with a mouse
on a ≥ 900 px wide screen (touch pinches). Kiosk has no header: its two
floating summary buttons become one round menu button in the map's top-right
corner. Editors themselves are unchanged (entering one restores the full
upstream header).

**Config keys** (card YAML): `fork_menu: false` restores the upstream header.

**Files.** `src/houseplan-card.ts` (`_forkCompactView`, host attribute
`data-fork-view-compact`, kiosk menu), `src/styles/fork.styles.ts`.

## 11. Inactive ("down") markers (matt.2)

**What.** A marker whose state source is inactive can look disconnected —
the §6 ghost look (dimmed, dashed, no text) — and drop its value badge, only
while inactive. Built on upstream's marker `state_source` (#977): the marker
is *inactive* when `state_source.active_states` is set and the source state is
not one of them (unknown/unavailable count as inactive). Example: a UniFi port
`link_speed` sensor reports `10` with no link → the port marker is a dashed
ghost with no badge; with a real link it shows `1G`/`100M` (§8). Its touch
callout shows a dashed "disconnected" glyph instead of a state or value —
never "10M". Taps keep the marker's configured action.

**Config keys** (persisted marker fields, validated by the integration):

```json
{
  "id": "udm-port-7", "binding": "entity:sensor.udm_port_7_link_speed", "tap_action": "callout",
  "state_source": { "entity_id": "sensor.udm_port_7_link_speed", "active_states": ["100", "1000", "2500", "10000"] },
  "inactive_presentation": "ghost",
  "hide_badge_when_inactive": true
}
```

`inactive_presentation`: `"ghost"` | `null`; `hide_badge_when_inactive`:
boolean | `null`. (`state_source` must reference an entity of the marker's own
binding, as upstream requires.)

## 12. One marker per physical device: callout actions and extra rows (matt.2)

**What.** Extras of a device live in its §4 touch callout instead of separate
map markers:

- `actions`: a row of round icon buttons (44 px) that run `script.turn_on` /
  `scene.turn_on` (only `script.*` / `scene.*`, up to 12; entries missing in HA
  are not shown);
- `extra_entities`: compact rows — name, HA-formatted state, and a switch for
  `switch`/`light`/`fan`/`input_boolean`/`siren`/`humidifier` (calls
  `<domain>.toggle`; never locks, covers or alarm panels) — up to 16.

The device hold card (600 ms) is unchanged in this release: the extras are in
the callout only.

**Config keys:**

```json
{
  "id": "mini-lanterns", "binding": "entity:light.mini_lanterns", "tap_action": "callout",
  "actions": [
    { "entity": "script.lanterns_candle", "icon": "mdi:candle", "name": "Candle" },
    { "entity": "script.lanterns_steady", "icon": "mdi:lightbulb-on-outline" },
    { "entity": "script.lanterns_dimmer", "icon": "mdi:brightness-4" },
    { "entity": "script.lanterns_brighter", "icon": "mdi:brightness-7" },
    { "entity": "script.lanterns_lowest", "icon": "mdi:brightness-1" },
    { "entity": "script.lanterns_brightest", "icon": "mdi:white-balance-sunny" }
  ],
  "extra_entities": ["select.lantern_scene", "switch.heater_oscillation", "number.heater_target"]
}
```

`icon` defaults to `mdi:play` (script) / `mdi:palette` (scene); `name` is the
accessible name / hover title only.

## 13. No fake badges (matt.2)

**What.** `badge_hide_when` lists raw source values for which the value badge
(and the value face) shows nothing: numbers compare numerically (`"0"` also
hides `0.0`), text case-insensitively; the token `"primary_off"` hides it while
the marker's primary entity is `off` (an oven display reading 0.0 °F while the
oven is off).

```json
{ "id": "oven", "binding": "entity:switch.oven", "badge_hide_when": ["0", "unknown", "unavailable", "primary_off"] }
```

Up to 8 strings of ≤ 32 characters.

The device editor has no fields for §7 `reveal` or §11–§13 keys; a dialog save
now carries all of them through unchanged (`forkMarkerCarry`; matt.1 dropped
`reveal` on a dialog save).

**Files (§11–§13).** `src/fork-marker.ts` (`markerInactive`,
`markerGhostNow`, `badgeSuppressed`, `markerActions`, `markerExtraEntities`,
`rowToggleable`, `forkMarkerCarry`), `src/device-presentation.ts`,
`src/fork-chrome.ts` (callout rows/actions/down glyph),
`src/houseplan-card.ts` (`_calloutModel`), `src/houseplan-editor-runtime.ts`
(carry on both save paths), `src/types.ts`, `src/styles/fork.styles.ts`,
`custom_components/houseplan/validation.py`, `scripts/config-schema.json`,
`docs/data-hp-contract.json`, `test/fork-marker.test.mjs`,
`tests_backend/test_fork_single_pane.py`.

## 14. Phone room view and room sheet (matt.2)

**What.** Tapping a room on a phone used to leave a small room with 35 px
unnamed markers under a large level switcher. Now:

- **A focused room fills the free stage** edge to edge (96 % instead of
  upstream's 80 % room fit; margins = the chrome bands and safe areas).
- **While a room or region is focused, everything outside it is dimmed (25 %)
  and inert**, so taps fall through to the focus; stepping out restores it.
- **Focused markers are ≥ 44 CSS px** (their size is `max(<plan size>, 44 px)`
  while focused) and carry a **1–2 word name label** under the icon (not on
  ghost / disconnected markers). Card YAML `focus_labels: false` hides the
  labels.
- **Phone chrome:** on stages ≤ 560 px wide the level switcher is a small
  horizontal pill docked bottom-right in the same band as the scene dock (it
  never covers a room); the kiosk's top-right buttons are one ⋮ menu (§10).
- **Room sheet:** when a focused room (or region) is still too dense for
  labelled 44 px targets on a phone — 6 or more visible devices on a stage
  ≤ 560 px wide — a sheet inside the map view (never a page) lists them: icon,
  name, state; a tap runs the marker's own tap action (e.g. its callout,
  anchored on the map) and highlights the marker. The room is fitted above
  the sheet. Card YAML `room_sheet: auto` (default) | `always` | `off`.
- Callouts open on the side of the marker with more free room and scroll
  inside it, so they never run under the toolbar, sheet or dock.

**Not done: rotating the plan** for a landscape room on a portrait phone. The
card's camera is an axis-aligned SVG viewBox shared by ~20 layers (plan SVG,
2.5D layers, HTML marker/label/callout layers, live pan/pinch transforms,
hit-testing, tooltips, vacuum paths, PDF export); a rotated camera means a
rotation term in every one of those paths and in every client→plan
conversion. It is a separate, larger change; until then such rooms are fitted
by width and the rest is reached by panning.

**Config keys** (card YAML):

```yaml
room_sheet: auto      # auto (default) | always | off
focus_labels: true    # false hides the focused-marker name labels
```

**Files.** `src/houseplan-card.ts` (`_forkInFocus`, `_forkShortName`,
`_forkUncapStyle` 44 px minimum, `_forkFocusDevices`, `_forkSheetHeight`,
`_forkSheetRows`, `_forkSheetTap`, chrome insets, room fit 0.96),
`src/fork-chrome.ts` (`renderRoomSheet`, callout `maxHeight`),
`src/header-menu.ts` (menu icon), `src/styles/fork.styles.ts`,
`src/i18n/*.json` (`fork.devices`), `docs/data-hp-contract.json`.

## matt.2 fixes to §2/§3/§7 (found on the live house)

1. **Card size in a panel view.** In kiosk the stage was `100dvh` tall, so under
   HA's 56 px app toolbar the dock, zoom badge and other bottom chrome were
   below the fold. Kiosk now subtracts the measured, bounded (≤ 120 px) space
   above the card — `calc(100dvh - <toolbar>px)`, the same budget upstream
   already used without kiosk. On stages ≤ 560 px wide (phones) the level
   indicator (34 px glyphs), dock (42 px buttons) and step-out shrink; the fit
   insets follow (58 / 66 px).
2. **Touch-sized targets at the deepest level.** A focus region now lands at
   `regionZoom` = the largest of: fit the whole region; for a region wider
   than the free stage, fit its height (≤ 2.5×, pan for the rest); 1.35× its
   parent's zoom (a nested level always lands visibly deeper); the zoom at
   which every interactive marker inside (not ghosts, not markers of hidden
   child regions) is ≥ 44 CSS px — clamped to 32x. Markers inside the focused
   region are not held at the 8x size (§7), so they render at that size.
   A region one tap away is never revealed early by zoom (its markers would
   cover it).
3. **Clutter outside the focus.** With a region focused, markers outside it
   render at 25 % opacity and are inert, so taps fall through to the region;
   they come back when you step out of the region. `focus_nested_markers`
   keeps its meaning for markers inside.

Verified in the demo harness under a real 56 px toolbar, `kiosk: true` and a
docked 256 px sidebar on desktop: `node demo/fork/shots.mjs --panel`
(`fork-shots/panel-*`).

## Release (how `v1.82.0-matt.1` was produced)

1. Versions: `package.json`, `package-lock.json` (2), `src/houseplan-card.ts`
   and `src/houseplan-editor-runtime.ts` (`CARD_VERSION`),
   `custom_components/houseplan/manifest.json`, `custom_components/houseplan/const.py`
   → `1.82.0-matt.1` (then `1.82.0-matt.2`). `hacs.json` unchanged (`houseplan.zip`, `zip_release`).
2. `npm ci --ignore-scripts` (upstream git hooks are not installed in the fork),
   `npm run bundle:release` (dist + `custom_components/houseplan/frontend`),
   `node scripts/bundle-tree.mjs dist custom_components/houseplan/frontend`.
3. Ratchets: `node scripts/ratchets.mjs tighten` set the size ceilings to the
   fork's facts (the card core grew by the fork code: `houseplan-card.ts`
   13166 → ~13.75k lines, initial View graph 333 938 → ~343 kB gzip);
   `node scripts/ci-registry-inventory.mjs --write`,
   `node scripts/ci-profiles.mjs --write`.
4. The upstream release-ledger contract test is skipped for `-matt.N`
   versions (fork releases are not part of upstream's stable cycle).
5. Asset build exactly like upstream `release.yml`:
   `git -c core.autocrlf=false archive --format=zip --output=houseplan.zip <sha>:custom_components/houseplan`,
   `node scripts/verify-houseplan-zip.mjs houseplan.zip custom_components/houseplan/frontend 1.82.0-matt.1`,
   `cp dist/houseplan-card.js houseplan.zip release-assets/`,
   `node scripts/release-assets.mjs sums release-assets`.
6. `gh release create v1.82.0-matt.1 --repo mabarbanel-ttw/houseplan-card`
   with `houseplan.zip`, `houseplan-card.js`, `SHA256SUMS` (full release).

Install: HACS → custom repository `mabarbanel-ttw/houseplan-card`
(Integration), version `v1.82.0-matt.1`; restart Home Assistant.

Verification run: `node demo/fork/shots.mjs` (real mouse/touch input against
the synthetic three-level fixture `demo/fork/fixture.mjs`; desktop 1440×900,
iPad 1366×1024 and 1024×1366 and phone 390×844 with touch emulation).
