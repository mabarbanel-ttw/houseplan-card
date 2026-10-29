/**
 * Fork (matt/single-pane) on-map chrome: level indicator (FORK.md §2),
 * step-out control and focus-region hints (§3), touch callout (§4),
 * scene dock (§5) and the "not in HA" ghost presentation (§6).
 *
 * Visual language: frosted dark capsules that float over the plan, one accent
 * for "you are here / on", ghosting for "elsewhere / not in HA". No text.
 */
import { css } from 'lit';

export const forkStyles = css`
  :host {
    --fork-glass: color-mix(in srgb, var(--card-background-color, #1c2530) 78%, transparent);
    --fork-edge: color-mix(in srgb, var(--primary-text-color, #e1e1e1) 16%, transparent);
    --fork-ink: var(--primary-text-color, #e1e1e1);
    --fork-accent: var(--hp-accent, #3ea6ff);
    --fork-inset: 12px;
    --fork-shadow: 0 6px 22px rgba(0, 0, 0, 0.32), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
  }

  /* ---- §2 level indicator: a stylised building section on the right edge */
  .fork-levels {
    position: absolute;
    z-index: 14;
    top: 50%;
    right: max(var(--fork-inset), env(safe-area-inset-right, 0px));
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 4px;
    border-radius: 26px;
    background: var(--fork-glass);
    border: 1px solid var(--fork-edge);
    box-shadow: var(--fork-shadow);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
    touch-action: manipulation;
    animation: fork-rise 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .fork-levels::before {
    /* the stair core the slabs hang on */
    content: '';
    position: absolute;
    top: 14px;
    bottom: 14px;
    left: 50%;
    width: 2px;
    transform: translateX(-1px);
    border-radius: 1px;
    background: linear-gradient(var(--fork-edge), color-mix(in srgb, var(--fork-accent) 30%, transparent), var(--fork-edge));
    pointer-events: none;
  }
  .fork-level {
    position: relative;
    width: 48px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 22px;
    background: transparent;
    color: var(--fork-ink);
    cursor: pointer;
    display: grid;
    place-items: center;
    -webkit-tap-highlight-color: transparent;
  }
  .fork-level svg {
    width: 30px;
    height: 15px;
    overflow: visible;
    fill: color-mix(in srgb, var(--fork-ink) 6%, transparent);
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
    opacity: 0.38;
    transition: opacity 180ms ease, transform 180ms ease, fill 180ms ease;
  }
  :host([data-pointer-hover]) .fork-level:hover svg { opacity: 0.7; }
  .fork-level:focus-visible { outline: 2px solid var(--fork-accent); outline-offset: -2px; }
  .fork-level.current svg {
    opacity: 1;
    fill: var(--fork-accent);
    stroke: color-mix(in srgb, var(--fork-accent) 70%, white);
    transform: scale(1.12);
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--fork-accent) 70%, transparent));
  }
  .fork-level:active svg { transform: scale(0.94); }

  /* §2: with the level indicator the View tab strip is empty; a reader
     without editor rights has nothing else in it, so it disappears. */
  .tabs.fork-levelnav { display: none; }
  .tabs.fork-levelnav-edit { background: transparent; border-color: transparent; box-shadow: none; padding: 0; min-width: 0; }

  /* §9 touch: in View, a room's "open HA area" link is a page change and a
     hit target that lands on stairs/markers at phone zoom. Touch-only
     devices never show it; desktop hover keeps it. */
  @media (hover: none) {
    .stage.mode-view .rlgo.rlarea { display: none; }
  }

  /* ---- §3 nested fly-in: step-out control, target hints, authoring */
  .fork-stepout {
    position: absolute;
    z-index: 14;
    top: max(var(--fork-inset), env(safe-area-inset-top, 0px));
    left: max(var(--fork-inset), env(safe-area-inset-left, 0px));
    width: 52px;
    height: 52px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--fork-edge);
    background: var(--fork-glass);
    color: var(--fork-ink);
    box-shadow: var(--fork-shadow);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
    display: grid;
    place-items: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    animation: fork-pop 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .fork-stepout ha-icon { --mdc-icon-size: 24px; line-height: 1; margin-top: -6px; }
  .fork-stepout:active { transform: scale(0.94); }
  .fork-stepout:focus-visible { outline: 2px solid var(--fork-accent); outline-offset: 2px; }
  .fork-depth {
    position: absolute;
    bottom: 9px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 3px;
  }
  .fork-depth i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--fork-accent);
    opacity: 0.45;
  }
  .fork-depth i:last-child { opacity: 1; box-shadow: 0 0 5px var(--fork-accent); }

  .fork-focus-hint {
    fill: color-mix(in srgb, var(--fork-accent) 7%, transparent);
    stroke: var(--fork-accent);
    stroke-width: 1.6px;
    stroke-dasharray: 6 5;
    vector-effect: non-scaling-stroke;
    opacity: 0.75;
    animation: fork-hint 1.6s ease-out 1;
  }
  @keyframes fork-hint {
    0% { opacity: 0; }
    35% { opacity: 1; }
    100% { opacity: 0.75; }
  }

  /* §7 progressive disclosure: detail of a region/room you have not entered
     fades out (and is not tappable); it fades in during the fly-in. */
  .stage.mode-view .dev,
  .stage.mode-view .fork-reveal {
    transition: opacity 240ms ease, visibility 0s linear 0s;
  }
  .stage.mode-view .dev.fork-hidden,
  .stage.mode-view .fork-reveal.fork-hidden {
    opacity: 0 !important;
    visibility: hidden;
    transition: opacity 200ms ease, visibility 0s linear 200ms;
  }
  .stage.mode-view .dev.fork-hidden,
  .stage.mode-view .dev.fork-hidden *,
  .stage.mode-view .dev.fork-hidden::before,
  .stage.mode-view .fork-reveal.fork-hidden * {
    pointer-events: none !important;
  }
  /* The whole level shows room devices at reduced density: smaller (the
     devlayer's icon size, see _forkDensity — never a per-marker transform,
     which would break the #564 face/floor stacking), no value text or LQI.
     Battery and maintenance marks stay: they are status. */
  .stage.mode-view .dev.fork-reduced .device-sections,
  .stage.mode-view .dev.fork-reduced [class*='lqi'] {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .stage.mode-view .dev, .stage.mode-view .fork-reveal { transition: none; }
  }

  /* matt.2: with a region focused, markers outside it step back: dimmed and
     inert, so a tap falls through to the region (and its surroundings). */
  .stage.mode-view .dev.fork-outside {
    opacity: 0.25;
  }
  .stage.mode-view .dev.fork-outside,
  .stage.mode-view .dev.fork-outside *,
  .stage.mode-view .dev.fork-outside::before {
    pointer-events: none !important;
  }

  /* Markers inside a fly-in target you have not entered: painted, not tappable. */
  .stage.mode-view .dev.fork-nested,
  .stage.mode-view .dev.fork-nested *,
  .stage.mode-view .dev.fork-nested::before {
    pointer-events: none !important;
  }

  .fork-focus-edit {
    position: absolute;
    z-index: 14;
    top: calc(max(var(--fork-inset), env(safe-area-inset-top, 0px)) + 62px);
    left: max(var(--fork-inset), env(safe-area-inset-left, 0px));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fork-round {
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 50%;
    border: 1px dashed color-mix(in srgb, var(--fork-accent) 70%, transparent);
    background: var(--fork-glass);
    color: var(--fork-accent);
    box-shadow: var(--fork-shadow);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .fork-round ha-icon { --mdc-icon-size: 22px; line-height: 1; }

  /* ---- §6 "not in HA": dimmed icon in a dashed ring, no text, no state */
  .dev.presentation-ghost .device-shell {
    opacity: 0.62;
    filter: grayscale(1);
  }
  .dev.presentation-ghost .device-shell-frame {
    border-style: dashed;
    border-width: max(1.5px, var(--device-shell-border-width, 1px));
    border-color: var(--secondary-text-color, #8a929c);
    box-shadow: none;
  }
  .dev.presentation-ghost .device-core {
    background: transparent;
    color: var(--secondary-text-color, #8a929c);
  }
  .dev.presentation-ghost .device-sections,
  .dev.presentation-ghost .valtext,
  .dev.presentation-ghost .device-battery,
  .dev.presentation-ghost .device-maintenance,
  .dev.presentation-ghost .device-pulse,
  .dev.presentation-ghost .activity-dot,
  .dev.presentation-ghost .newdot,
  .dev.presentation-ghost [class*='lqi'] {
    display: none !important;
  }

  /* ---- §5 scene dock: round icon buttons floating in a corner */
  .fork-dock {
    position: absolute;
    z-index: 14;
    display: flex;
    gap: 10px;
    padding: 6px;
    border-radius: 34px;
    background: var(--fork-glass);
    border: 1px solid var(--fork-edge);
    box-shadow: var(--fork-shadow);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
    animation: fork-pop 240ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .fork-dock.bottom-left { left: max(var(--fork-inset), env(safe-area-inset-left, 0px)); bottom: max(var(--fork-inset), env(safe-area-inset-bottom, 0px)); }
  .fork-dock.bottom-right { right: calc(max(var(--fork-inset), env(safe-area-inset-right, 0px)) + 4px); bottom: max(var(--fork-inset), env(safe-area-inset-bottom, 0px)); }
  /* top corners leave room for the step-out control (top-left) */
  .fork-dock.top-left { left: calc(max(var(--fork-inset), env(safe-area-inset-left, 0px)) + 64px); top: max(var(--fork-inset), env(safe-area-inset-top, 0px)); }
  .fork-dock.top-right { right: max(var(--fork-inset), env(safe-area-inset-right, 0px)); top: max(var(--fork-inset), env(safe-area-inset-top, 0px)); }
  .fork-dock-btn {
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--fork-ink) 8%, transparent);
    color: var(--fork-ink);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: transform 140ms ease, background 160ms ease, box-shadow 160ms ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .fork-dock-btn ha-icon { --mdc-icon-size: 24px; line-height: 1; }
  :host([data-pointer-hover]) .fork-dock-btn:hover { background: color-mix(in srgb, var(--fork-ink) 16%, transparent); }
  .fork-dock-btn:active, .fork-dock-btn.pressed { transform: scale(0.9); }
  .fork-dock-btn.pressed {
    background: color-mix(in srgb, var(--fork-accent) 40%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--fork-accent) 35%, transparent);
  }
  .fork-dock-btn.on {
    color: var(--fork-accent);
    border-color: color-mix(in srgb, var(--fork-accent) 60%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--fork-accent) 45%, transparent);
  }
  .fork-dock-btn.missing { opacity: 0.35; border-style: dashed; border-color: var(--fork-edge); cursor: default; }
  .fork-dock-btn:focus-visible { outline: 2px solid var(--fork-accent); outline-offset: 2px; }
  /* the zoom badge moves above a bottom-left dock instead of under it */
  .stage:has(.fork-dock.bottom-left) .zoombadge { bottom: calc(var(--sp-4, 12px) + 70px); }

  /* ---- §4 touch callout: an in-place popover anchored to the marker */
  .fork-callout-layer {
    position: absolute;
    inset: 0;
    z-index: 13;
    pointer-events: none;
  }
  .fork-callout {
    position: absolute;
    pointer-events: auto;
    min-width: 168px;
    max-width: min(280px, 72vw);
    padding: 10px 12px 10px;
    border-radius: 16px;
    background: var(--fork-glass);
    border: 1px solid var(--fork-edge);
    box-shadow: var(--fork-shadow);
    backdrop-filter: blur(14px) saturate(1.3);
    -webkit-backdrop-filter: blur(14px) saturate(1.3);
    color: var(--fork-ink);
    font-size: 14px;
    line-height: 1.25;
    touch-action: manipulation;
    animation: fork-callout-in 180ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .fork-callout { overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; }
  .fork-callout.above { transform: translate(-50%, calc(-100% - 30px)); }
  .fork-callout.below { transform: translate(-50%, 30px); }
  .fork-callout::after {
    /* the beak pointing at the marker */
    content: '';
    position: absolute;
    left: calc(50% + var(--fork-beak, 0px));
    width: 0;
    height: 0;
    border: 8px solid transparent;
    transform: translateX(-50%);
  }
  .fork-callout.above::after { bottom: -16px; border-top-color: var(--fork-glass); }
  .fork-callout.below::after { top: -16px; border-bottom-color: var(--fork-glass); }
  .fork-callout.on { border-color: color-mix(in srgb, var(--fork-accent) 55%, transparent); }
  .fork-callout-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .fork-callout-icon {
    --mdc-icon-size: 20px;
    line-height: 1;
    flex: none;
    color: var(--fork-accent);
  }
  .fork-callout-name {
    font-weight: 650;
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fork-callout-vals {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .fork-callout-state,
  .fork-callout-value {
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--fork-ink) 9%, transparent);
  }
  .fork-callout.on .fork-callout-state {
    background: color-mix(in srgb, var(--fork-accent) 24%, transparent);
    color: color-mix(in srgb, var(--fork-accent) 35%, var(--fork-ink));
  }
  .fork-callout-value {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--fork-ink) 22%, transparent);
  }
  .fork-callout-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .fork-callout-spacer { flex: 1; }
  .fork-callout-toggle {
    position: relative;
    width: 52px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 16px;
    background: color-mix(in srgb, var(--fork-ink) 22%, transparent);
    cursor: pointer;
    transition: background 160ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .fork-callout-toggle i {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
    transition: transform 160ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .fork-callout-toggle.on { background: var(--fork-accent); }
  .fork-callout-toggle.on i { transform: translateX(20px); }
  .fork-callout-toggle:disabled { opacity: 0.4; cursor: default; }
  .fork-callout-more {
    width: 44px;
    height: 36px;
    padding: 0;
    border-radius: 18px;
    border: 1px solid var(--fork-edge);
    background: transparent;
    color: var(--fork-ink);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .fork-callout-more ha-icon { --mdc-icon-size: 20px; line-height: 1; }
  /* matt.2 §11: an inactive (disconnected) marker's callout says "down" by look */
  .fork-callout.inactive { border-style: dashed; }
  .fork-callout.inactive .fork-callout-icon { color: var(--secondary-text-color, #8a929c); opacity: 0.7; }
  .fork-callout-down {
    display: inline-grid; place-items: center;
    width: 36px; height: 26px; border-radius: 999px;
    border: 1px dashed var(--secondary-text-color, #8a929c);
    color: var(--secondary-text-color, #8a929c);
  }
  .fork-callout-down ha-icon { --mdc-icon-size: 18px; line-height: 1; }
  /* matt.2 §12: extra entity rows and script buttons of one physical device */
  .fork-callout-rows { display: grid; gap: 6px; margin-top: 10px; }
  .fork-callout-row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px;
    font-size: 13px;
  }
  .fork-callout-row-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8; }
  .fork-callout-row-state { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fork-callout-toggle.small { width: 44px; height: 26px; border-radius: 13px; }
  .fork-callout-toggle.small i { width: 20px; height: 20px; }
  .fork-callout-toggle.small.on i { transform: translateX(18px); }
  .fork-callout-run { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .fork-callout-run-btn {
    width: 44px; height: 44px; padding: 0; border-radius: 50%;
    border: 1px solid var(--fork-edge); background: color-mix(in srgb, var(--fork-ink) 8%, transparent);
    color: var(--fork-ink); display: grid; place-items: center; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .fork-callout-run-btn:active { transform: scale(0.92); background: color-mix(in srgb, var(--fork-accent) 35%, transparent); }
  .fork-callout-run-btn ha-icon { --mdc-icon-size: 22px; line-height: 1; }
  .fork-callout:has(.fork-callout-rows, .fork-callout-run) { min-width: 220px; max-width: min(300px, 86vw); }
  /* matt.3 §16: in-place row controls — select picker, number stepper */
  .fork-callout-row.has-select { grid-template-columns: minmax(0, 1fr) minmax(0, auto); }
  .fork-callout-select {
    max-width: 150px; min-height: 36px; padding: 0 28px 0 12px; border-radius: 18px;
    border: 1px solid var(--fork-edge); color: var(--fork-ink); font: inherit; font-weight: 600;
    background: color-mix(in srgb, var(--fork-ink) 8%, transparent)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") right 6px center / 18px no-repeat;
    -webkit-appearance: none; appearance: none; text-overflow: ellipsis; cursor: pointer;
    touch-action: manipulation;
  }
  .fork-callout-select option { color: initial; }
  .fork-callout-select:disabled { opacity: 0.4; cursor: default; }
  .fork-callout-stepper { display: inline-flex; gap: 4px; }
  .fork-callout-step {
    width: 40px; height: 36px; padding: 0; border-radius: 18px;
    border: 1px solid var(--fork-edge); background: color-mix(in srgb, var(--fork-ink) 8%, transparent);
    color: var(--fork-ink); display: grid; place-items: center; cursor: pointer;
    touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  }
  .fork-callout-step:active { background: color-mix(in srgb, var(--fork-accent) 35%, transparent); }
  .fork-callout-step:disabled { opacity: 0.35; cursor: default; }
  .fork-callout-step ha-icon { --mdc-icon-size: 18px; line-height: 1; }

  /* ---- matt.3 §15 rotate-to-fit: the camera frame (.zoomwrap) is turned;
     everything that must read upright is counter-turned about its anchor. */
  .zoomwrap.fork-turned { container-type: inline-size; }
  .zoomwrap.fork-turned .dev { rotate: var(--fork-unrot, 0deg); }
  .zoomwrap.fork-turned .roomlabel,
  .zoomwrap.fork-turned .oplock,
  .zoomwrap.fork-turned .vacpuck {
    rotate: var(--fork-unrot, 0deg);
    transform-origin: 0 0;
  }
  /* matt.3 §17: a marker that stepped aside keeps its label inside its slot */
  .stage.mode-view .dev.fork-spread .fork-label { max-width: calc(var(--dev-size) * 1.27 + 4px); }
  .fork-callout-anchor { position: absolute; width: 0; height: 0; pointer-events: none; }
  .fork-callout.turned { width: max-content; }

  @keyframes fork-callout-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* matt.2: narrow stages (phones) get compact chrome — the indicator took
     a sixth of a 390 px map. Matches the insets in _chromeInsets(). */
  @container (max-width: 560px) {
    .fork-levels { padding: 4px 2px; border-radius: 18px; gap: 0; }
    .fork-levels::before { top: 10px; bottom: 10px; }
    .fork-level { width: 34px; height: 36px; border-radius: 17px; }
    .fork-level svg { width: 20px; height: 10px; }
    .fork-dock { gap: 6px; padding: 4px; border-radius: 26px; }
    .fork-dock-btn { width: 42px; height: 42px; }
    .fork-dock-btn ha-icon { --mdc-icon-size: 21px; }
    .fork-stepout { width: 46px; height: 46px; }
  }

  /* ---- §10 everyday View chrome (matt.2): editors and admin tools live in
     the one header menu at every width; zoom ± only with a mouse on a wide
     screen (touch pinches); Fit all stays. */
  :host([data-fork-view-compact]) .head > .modes,
  :host([data-fork-view-compact]) .head > .header-action,
  :host([data-fork-view-compact]) .header-actions > .header-action,
  :host([data-fork-view-compact]) .header-actions > .summary-control,
  :host([data-fork-view-compact]) .head > .summary-control {
    display: none !important;
  }
  :host([data-fork-view-compact]) .header-menu-wrap { display: inline-flex; }
  :host([data-fork-view-compact]) .tabs .tabadd,
  :host([data-fork-view-compact]) .tabs .tabedit { display: none !important; }
  @media not ((hover: hover) and (min-width: 900px)) {
    :host([data-fork-view-compact]) .zoomctl [data-hp="zoom-out"],
    :host([data-fork-view-compact]) .zoomctl [data-hp="zoom-in"] { display: none; }
    :host([data-fork-view-compact]) .hdr > .head .zoomctl .zb { border-radius: var(--rad-m); }
  }
  .fork-kiosk-menu {
    position: absolute;
    z-index: 15;
    top: max(var(--fork-inset), env(safe-area-inset-top, 0px));
    right: max(var(--fork-inset), env(safe-area-inset-right, 0px));
  }
  .fork-kiosk-menu .header-menu-wrap { display: inline-flex; }
  .fork-kiosk-menu .header-menu-button {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--fork-glass); border: 1px solid var(--fork-edge); box-shadow: var(--fork-shadow);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  }
  .fork-kiosk-menu .header-menu { right: 0; left: auto; }

  /* ---- matt.2 round 4: focused markers carry a 1–2 word name */
  .stage.mode-view .dev .fork-label {
    position: absolute;
    left: 50%;
    top: calc(100% + var(--device-shell-inset, 4px) + 3px);
    transform: translateX(-50%);
    max-width: 96px;
    padding: 1px 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--card-background-color, #1c2530) 82%, transparent);
    color: var(--primary-text-color, #e1e1e1);
    font: 600 11px/1.3 var(--paper-font-body1_-_font-family, inherit);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 3;
    /* matt.3: screen-sized while a fly-in projects the marker layer */
    transform-origin: 0 0;
    scale: calc(1 / var(--hp-live-k, 1));
  }
  /* matt.3: a bottom value badge sits under the core — the name goes below it */
  .stage.mode-view .dev:has(.device-shell.with-values.pos-bottom) .fork-label {
    top: calc(100% + var(--dev-size) * (0.1 + 0.7875) + var(--device-shell-inset, 4px) + 3px);
  }
  .stage.mode-view .dev.fork-hl .device-shell-frame {
    box-shadow: 0 0 0 3px var(--fork-accent), 0 0 18px color-mix(in srgb, var(--fork-accent) 70%, transparent);
  }

  /* ---- §14 room sheet: the focused room's devices, inside the map view */
  .fork-sheet {
    position: absolute;
    z-index: 14;
    left: max(8px, env(safe-area-inset-left, 0px));
    right: max(8px, env(safe-area-inset-right, 0px));
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    background: var(--fork-glass);
    border: 1px solid var(--fork-edge);
    box-shadow: var(--fork-shadow);
    backdrop-filter: blur(14px) saturate(1.2);
    -webkit-backdrop-filter: blur(14px) saturate(1.2);
    overflow: hidden;
    animation: fork-rise-sheet 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .fork-sheet-grip {
    flex: none; align-self: center; width: 36px; height: 4px; margin: 7px 0 5px;
    border-radius: 2px; background: var(--fork-edge);
  }
  .fork-sheet-list {
    flex: 1; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
    -webkit-overflow-scrolling: touch; padding: 0 6px 6px;
  }
  .fork-sheet-row {
    display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px;
    width: 100%; min-height: 48px; padding: 4px 10px; border: 0; border-radius: 12px;
    background: transparent; color: var(--fork-ink); text-align: start; cursor: pointer;
    font-size: 14px; -webkit-tap-highlight-color: transparent;
  }
  .fork-sheet-row ha-icon { --mdc-icon-size: 22px; line-height: 1; color: var(--secondary-text-color, #9aa4ad); }
  .fork-sheet-row.on ha-icon { color: var(--fork-accent); }
  .fork-sheet-row.ghost { opacity: 0.55; }
  .fork-sheet-row.hl, .fork-sheet-row:active { background: color-mix(in srgb, var(--fork-accent) 20%, transparent); }
  :host([data-pointer-hover]) .fork-sheet-row:hover { background: color-mix(in srgb, var(--fork-ink) 9%, transparent); }
  .fork-sheet-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fork-sheet-state { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; opacity: 0.85; }
  @keyframes fork-rise-sheet { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

  /* round 4: on a phone the level stack is a small horizontal pill docked in
     the bottom-right corner, in the same band as the dock (never over a room) */
  @container (max-width: 560px) {
    .fork-levels {
      top: auto;
      transform: none;
      bottom: max(var(--fork-inset), env(safe-area-inset-bottom, 0px));
      flex-direction: row;
      padding: 3px 4px;
      animation: none;
    }
    .fork-levels::before { top: 50%; bottom: auto; left: 12px; right: 12px; width: auto; height: 2px; transform: translateY(-1px); }
    .fork-level { width: 34px; height: 44px; }
  }

  @keyframes fork-pop {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes fork-rise {
    from { opacity: 0; transform: translateY(calc(-50% + 8px)); }
    to { opacity: 1; transform: translateY(-50%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .fork-levels, .fork-dock, .fork-stepout, .fork-callout, .fork-focus-hint { animation: none !important; }
    .fork-level svg { transition: none; }
  }
`;
