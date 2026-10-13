import { describe, expect, it } from "vitest";
import { seededRandom } from "../data/layout";
import { CHIP_GAP, SLOT, VIEW_MARGIN, contrast, inkOn, mapMarks, overlaps, placeChips, screenBox, slotsFor, type ChipInput, type Rect } from "./mapLabels";

const view = { w: 1280, h: 720 };
const chip = (id: string, x: number, y: number, depth: number, w = 150, h = 44): ChipInput => ({ id, x, y, depth, onScreen: true, w, h });
const rectOf = (c: ChipInput, s: { x: number; y: number }): Rect => ({ x: s.x, y: s.y, w: c.w, h: c.h });

describe("placeChips", () => {
  it("stands a lone chip right above its anchor", () => {
    const c = chip("a", 640, 300, 50);
    const [s] = placeChips([c], { view, reserved: [], occluders: [] });
    expect(s).toEqual({ id: "a", x: 640 - 75, y: 300 - 44, slot: 0 });
  });

  it("never stacks two chips: the farther one moves up a step", () => {
    const near = chip("near", 640, 300, 40);
    const far = chip("far", 660, 304, 90);
    const spots = placeChips([far, near], { view, reserved: [], occluders: [] });
    const a = spots.find((s) => s.id === "near")!;
    const b = spots.find((s) => s.id === "far")!;
    expect(a.slot).toBe(0);
    expect(b.slot).toBeGreaterThan(0);
    expect(overlaps(rectOf(near, a), rectOf(far, b), CHIP_GAP)).toBe(false);
  });

  it("keeps chips inside the view, off the HUD and off nearer landmarks, and never overlapping, however many crowd in", () => {
    const rand = seededRandom(3);
    const reserved: Rect[] = [{ x: 1090, y: 12, w: 180, h: 210 }, { x: 1150, y: 660, w: 118, h: 48 }];
    const occluders = [{ x: 600, y: 200, w: 80, h: 220, depth: 30 }];
    for (let round = 0; round < 50; round++) {
      const chips = Array.from({ length: 12 }, (_, i) => chip(`d${i}`, rand() * 1280, 40 + rand() * 640, 20 + rand() * 160, 110 + rand() * 80));
      const spots = placeChips(chips, { view, reserved, occluders });
      const rects = spots.map((s) => rectOf(chips.find((c) => c.id === s.id)!, s));
      rects.forEach((r, i) => {
        expect(r.x).toBeGreaterThanOrEqual(VIEW_MARGIN);
        expect(r.y).toBeGreaterThanOrEqual(VIEW_MARGIN);
        expect(r.x + r.w).toBeLessThanOrEqual(view.w - VIEW_MARGIN);
        expect(r.y + r.h).toBeLessThanOrEqual(view.h - VIEW_MARGIN);
        for (const q of reserved) expect(overlaps(r, q, CHIP_GAP)).toBe(false);
        const c = chips.find((k) => k.id === spots[i].id)!;
        if (c.depth > occluders[0].depth) expect(overlaps(r, occluders[0], CHIP_GAP)).toBe(false);
        for (let j = i + 1; j < rects.length; j++) expect(overlaps(r, rects[j], CHIP_GAP)).toBe(false);
      });
    }
  });

  it("lets a chip nearer than a landmark stand over it, moves one behind it aside, and leaves one out that has nowhere else to go", () => {
    const monument = { x: 590, y: 180, w: 100, h: 240, depth: 30 };
    const opts = { view, reserved: [], occluders: [monument] };
    expect(placeChips([chip("front", 640, 300, 20)], opts)[0].slot).toBe(0);
    const aside = placeChips([chip("back", 690, 300, 80)], opts);
    expect(aside).toHaveLength(1);
    expect(aside[0].slot).toBe(SLOT.right);
    expect(overlaps(rectOf(chip("back", 690, 300, 80), aside[0]), monument, CHIP_GAP)).toBe(false);
    // Its mast stands right behind the monument: the chip waits until the kid walks round.
    expect(placeChips([chip("hidden", 640, 300, 80)], opts)).toEqual([]);
  });

  it("slides a chip at the view's edge back inside rather than dropping it", () => {
    const [s] = placeChips([chip("edge", 20, 300, 60)], { view, reserved: [], occluders: [] });
    expect(s.slot).toBe(0);
    expect(s.x).toBe(VIEW_MARGIN);
  });

  it("leaves out chips whose anchor is off screen", () => {
    expect(placeChips([{ ...chip("gone", 640, 300, 60), onScreen: false }], { view, reserved: [], occluders: [] })).toEqual([]);
  });

  it("keeps last frame's spot while its first choice is taken, and goes back once it is free", () => {
    const near = chip("near", 640, 300, 40);
    const far = chip("far", 760, 300, 90);
    // Without a past, "far" would reach right from its anchor; last frame it stood to the right, and its first choice is still taken, so it stays there.
    expect(placeChips([near, far], { view, reserved: [], occluders: [] }).find((s) => s.id === "far")!.slot).toBe(SLOT.aboveRight);
    const kept = placeChips([near, far], { view, reserved: [], occluders: [], previous: new Map([["near", SLOT.above], ["far", SLOT.right]]) });
    expect(kept.find((s) => s.id === "far")!.slot).toBe(SLOT.right);
    // Once "near" is gone, "far" goes back above its anchor.
    const back = placeChips([far], { view, reserved: [], occluders: [], previous: new Map([["far", SLOT.right]]) });
    expect(back[0].slot).toBe(SLOT.above);
  });

  it("does not let a newcomer at about the same distance bump a chip already shown", () => {
    const shown = chip("shown", 640, 300, 52);
    const newcomer = chip("newcomer", 650, 300, 50);
    const spots = placeChips([shown, newcomer], { view, reserved: [], occluders: [], previous: new Map([["shown", 0]]) });
    expect(spots.find((s) => s.id === "shown")!.slot).toBe(0);
  });

  it("offers the spot above first, then reaching either way with a corner over the anchor, then higher, beside, below", () => {
    const c = chip("c", 400, 400, 10, 100, 40);
    const s = slotsFor(c, 6);
    expect(s[SLOT.above]).toEqual({ x: 350, y: 360 });
    for (const k of [SLOT.aboveLeft, SLOT.aboveRight]) {
      expect(s[k].y).toBe(360);
      expect(s[k].x).toBeLessThan(c.x);
      expect(s[k].x + c.w).toBeGreaterThan(c.x);
    }
    expect(s[SLOT.aboveLeft].x).toBeLessThan(s[SLOT.above].x);
    expect(s[SLOT.aboveRight].x).toBeGreaterThan(s[SLOT.above].x);
    expect(s[SLOT.higher].y).toBeLessThan(s[SLOT.above].y);
    expect(s[SLOT.higherStill].y).toBeLessThan(s[SLOT.higher].y);
    expect(s[SLOT.right].x).toBeGreaterThan(c.x);
    expect(s[SLOT.left].x + c.w).toBeLessThan(c.x);
    expect(s[SLOT.below].y).toBeGreaterThan(c.y);
  });

  it("finds a chip room beside a HUD box over its anchor by reaching the other way", () => {
    const narrowView = { w: 390, h: 730 };
    const minimap = { x: 242, y: 10, w: 148, h: 190 };
    const [s] = placeChips([chip("d", 200, 160, 80, 150, 40)], { view: narrowView, reserved: [minimap], occluders: [] });
    expect(s.slot).toBe(SLOT.aboveLeft);
  });
});

describe("screenBox", () => {
  it("bounds the points in front of the camera, or is null when none is", () => {
    expect(screenBox([{ x: 10, y: 20, front: true }, { x: 30, y: 5, front: true }, { x: 999, y: 999, front: false }])).toEqual({ x: 10, y: 5, w: 20, h: 15 });
    expect(screenBox([{ x: 1, y: 1, front: false }])).toBeNull();
  });
});

describe("the minimap's marks", () => {
  it("uses each district's first letter, or more where two would read the same", () => {
    expect(mapMarks(["Health", "AI & Data", "Climate", "Fintech", "Hardware", "Commerce", "Coaches"])).toEqual(["HE", "A", "CL", "F", "HA", "COM", "COA"]);
    expect(mapMarks(["Fintech", "Health"])).toEqual(["F", "H"]);
  });

  it("never gives two districts the same mark", () => {
    const marks = mapMarks(["Alpha", "Alps", "Alto", "Beta"]);
    expect(new Set(marks).size).toBe(marks.length);
  });
});

describe("ink on a district's color", () => {
  it("picks whichever of white and black reads better: 4.5:1 or better on every example color, for the minimap's small marks", () => {
    for (const color of ["#e34948", "#00a3b4", "#7a9a01", "#2a78d6", "#c2185b", "#eda100", "#8a8f98"]) {
      const ink = inkOn(color);
      expect(contrast(ink, color)).toBeGreaterThanOrEqual(Math.max(contrast("#ffffff", color), contrast("#000000", color)));
      expect(contrast(ink, color)).toBeGreaterThanOrEqual(4.5);
    }
    expect(inkOn("#eda100")).toBe("#000000");
    expect(inkOn("#c2185b")).toBe("#ffffff");
  });

  it("reads at 3:1 or better with the site's ink, for the large type on the boards", () => {
    for (const color of ["#e34948", "#00a3b4", "#7a9a01", "#2a78d6", "#c2185b", "#eda100", "#8a8f98"]) expect(contrast(inkOn(color, "#1d1f24"), color)).toBeGreaterThanOrEqual(3);
  });
});
