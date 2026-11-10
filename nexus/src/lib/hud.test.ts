import { describe, expect, it } from "vitest";
import { HUD, hudInsets, isPhone, panelWidth } from "./hud.ts";

describe("hudInsets", () => {
  it("leaves room for the rail and the panel on desktop", () => {
    expect(hudInsets({ w: 1440, h: 900 }, { panel: false, rail: false, sheet: false })).toEqual({ top: HUD.topDesktop, right: 0, bottom: 0, left: 0 });
    expect(hudInsets({ w: 1440, h: 900 }, { panel: true, rail: true, sheet: false })).toEqual({ top: HUD.topDesktop, right: HUD.panel + 2 * HUD.gap, bottom: 0, left: HUD.rail + 2 * HUD.gap });
  });

  it("uses the bottom sheet on phones", () => {
    expect(isPhone(390)).toBe(true);
    expect(hudInsets({ w: 390, h: 844 }, { panel: true, rail: true, sheet: false })).toEqual({ top: HUD.topPhone, right: 0, bottom: Math.round(844 * HUD.sheet), left: 0 });
    expect(hudInsets({ w: 390, h: 844 }, { panel: false, rail: false, sheet: false }).bottom).toBe(0);
  });

  it("narrows the panel on tablets", () => {
    expect(panelWidth(800)).toBe(368);
    expect(panelWidth(2000)).toBe(HUD.panel);
  });
});
