/* The world mode's keyboard, beyond Tab and Enter: the arrow keys turn the view, + and - zoom,
   [ and ] step through the maps in the order of the list, 0 returns to the overview, / goes to
   search and ? shows this list. A key held with Ctrl, Alt or the command key is the browser's.
   Pure, unit-tested. */

export type KeyAction =
  | { kind: "orbit"; azimuth: number; polar: number }
  | { kind: "zoom"; factor: number }
  | { kind: "step"; by: 1 | -1 }
  | { kind: "overview" }
  | { kind: "search" }
  | { kind: "help" };

/** One press of an arrow key turns the view by this much, in radians. */
export const ORBIT_STEP = Math.PI / 30;
/** One press of + brings the camera to this share of its distance. */
export const ZOOM_STEP = 0.85;

/** What a key press does in the world mode, or null for a key that is not a shortcut. */
export function keyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case "ArrowLeft":
      return { kind: "orbit", azimuth: -ORBIT_STEP, polar: 0 };
    case "ArrowRight":
      return { kind: "orbit", azimuth: ORBIT_STEP, polar: 0 };
    case "ArrowUp":
      return { kind: "orbit", azimuth: 0, polar: -ORBIT_STEP };
    case "ArrowDown":
      return { kind: "orbit", azimuth: 0, polar: ORBIT_STEP };
    case "+":
    case "=":
      return { kind: "zoom", factor: ZOOM_STEP };
    case "-":
    case "_":
      return { kind: "zoom", factor: 1 / ZOOM_STEP };
    case "[":
      return { kind: "step", by: -1 };
    case "]":
      return { kind: "step", by: 1 };
    case "0":
      return { kind: "overview" };
    case "/":
      return { kind: "search" };
    case "?":
      return { kind: "help" };
    default:
      return null;
  }
}

/** The map `by` places from `current` in the list, around its ends; from the overview, the first or the last. */
export function stepWorld(ids: readonly string[], current: string | null, by: 1 | -1): string | null {
  if (!ids.length) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return by > 0 ? ids[0] : ids[ids.length - 1];
  return ids[(at + by + ids.length) % ids.length];
}

/** What the ? key lists. */
export const SHORTCUTS: readonly { keys: readonly string[]; does: string }[] = [
  { keys: ["←", "→", "↑", "↓"], does: "Turn the view" },
  { keys: ["+", "−"], does: "Zoom in or out" },
  { keys: ["[", "]"], does: "Previous or next map" },
  { keys: ["0"], does: "Overview of every map" },
  { keys: ["/"], does: "Search" },
  { keys: ["Esc"], does: "Close what is open" },
  { keys: ["?"], does: "Show or hide this list" },
];
