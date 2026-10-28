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
  .fork-level:hover svg { opacity: 0.7; }
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

  /* §7 touch: in View, a room's "open HA area" link is a page change and a
     hit target that lands on stairs/markers at phone zoom. Touch-only
     devices never show it; desktop hover keeps it. */
  @media (hover: none) {
    .stage.mode-view .rlgo.rlarea { display: none; }
  }

  @keyframes fork-rise {
    from { opacity: 0; transform: translateY(calc(-50% + 8px)); }
    to { opacity: 1; transform: translateY(-50%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .fork-levels, .fork-dock, .fork-stepout, .fork-callout { animation: none !important; }
    .fork-level svg { transition: none; }
  }
`;
