/* The world mode's HUD geometry, in CSS pixels. The CSS reads the same numbers (WorldMode sets
   them as custom properties), and the 3D scene frames what is left between them (insets), so a
   world opened beside the panel is centered in the space the panel leaves. Pure, unit-tested. */

export const HUD = {
  /** At this width and below, the HUD is the phone layout: two-row top bar, bottom sheets. */
  phoneMax: 719,
  /** The list of worlds starts open at this width and above. */
  railFrom: 1100,
  topDesktop: 76,
  topPhone: 120,
  rail: 300,
  panel: 420,
  gap: 12,
  /** A bottom sheet's share of the screen height (phones). */
  sheet: 0.58,
} as const;

export interface HudState {
  panel: boolean;
  rail: boolean;
  sheet: boolean;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function isPhone(w: number): boolean {
  return w <= HUD.phoneMax;
}

/** The panel's width on a screen `w` wide (desktop and tablet). */
export function panelWidth(w: number): number {
  return Math.round(Math.min(HUD.panel, w * 0.46));
}

/** How much of each screen edge the HUD covers. */
export function hudInsets(view: { w: number; h: number }, s: HudState): Insets {
  if (isPhone(view.w)) return { top: HUD.topPhone, right: 0, left: 0, bottom: s.panel || s.sheet ? Math.round(view.h * HUD.sheet) : 0 };
  return {
    top: HUD.topDesktop,
    left: s.rail ? HUD.rail + HUD.gap * 2 : 0,
    right: s.panel ? panelWidth(view.w) + HUD.gap * 2 : 0,
    bottom: 0,
  };
}
