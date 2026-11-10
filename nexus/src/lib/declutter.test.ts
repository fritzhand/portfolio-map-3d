import { describe, expect, it } from "vitest";
import { overlaps, place, touchesDisc, type LabelBox, type Rect } from "./declutter.ts";

const r = (l: number, t: number, w: number, h: number): Rect => ({ l, t, r: l + w, b: t + h });
const screen = r(0, 0, 1000, 800);
/** Labels with one place each: which of them show? */
const declutter = (boxes: readonly LabelBox[], area: Rect) => place(boxes, area).map((at) => at === 0);

describe("declutter", () => {
  it("keeps labels that do not touch", () => {
    expect(declutter([{ rect: r(10, 10, 100, 40), priority: 1 }, { rect: r(300, 10, 100, 40), priority: 2 }], screen)).toEqual([true, true]);
  });

  it("hides the lower-priority label of an overlapping pair, whatever the input order", () => {
    const near = { rect: r(100, 100, 200, 50), priority: 1 };
    const far = { rect: r(150, 120, 200, 50), priority: 5 };
    expect(declutter([far, near], screen)).toEqual([false, true]);
    expect(declutter([near, far], screen)).toEqual([true, false]);
  });

  it("always shows a pinned label, and it claims its space", () => {
    const pinned = { rect: r(100, 100, 200, 50), priority: 9, pinned: true };
    const near = { rect: r(150, 120, 200, 50), priority: 1 };
    expect(declutter([near, pinned], screen)).toEqual([false, true]);
    expect(declutter([{ ...pinned, rect: r(-50, 0, 100, 40) }], screen)).toEqual([true]);
  });

  it("hides labels that leave the visible area (under the HUD or the headline)", () => {
    const area = r(400, 70, 600, 730);
    expect(declutter([{ rect: r(380, 200, 100, 40), priority: 1 }, { rect: r(500, 200, 100, 40), priority: 2 }], area)).toEqual([false, true]);
  });

  it("keeps a gap between labels", () => {
    expect(overlaps(r(0, 0, 10, 10), r(14, 0, 10, 10), 6)).toBe(true);
    expect(overlaps(r(0, 0, 10, 10), r(17, 0, 10, 10), 6)).toBe(false);
  });

  it("handles many labels", () => {
    const boxes = Array.from({ length: 200 }, (_, i) => ({ rect: r((i * 37) % 900, (i * 53) % 760, 120, 30), priority: i }));
    const shown = declutter(boxes, screen);
    const kept = boxes.filter((_, i) => shown[i]).map((b) => b.rect);
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) expect(overlaps(kept[i], kept[j], 6)).toBe(false);
    expect(shown[0]).toBe(true);
  });
});

describe("place", () => {
  const label = r(400, 300, 200, 40);
  const below = r(400, 420, 200, 40);
  const chip = r(480, 300, 40, 40);

  it("takes the first place when nothing is in the way", () => {
    expect(place([{ rect: label, priority: 1, alternates: [below, chip] }], screen)).toEqual([0]);
  });

  it("moves a label off another world, and keeps it over its own", () => {
    const world = { x: 500, y: 320, r: 30 };
    expect(place([{ rect: label, priority: 1, alternates: [below, chip] }], screen, { discs: [world] })).toEqual([1]);
    expect(place([{ rect: label, priority: 1, alternates: [below, chip], own: 0 }], screen, { discs: [world] })).toEqual([0]);
  });

  it("falls back to the next free place, then hides", () => {
    const near = { rect: label, priority: 1 };
    const far = { rect: r(450, 310, 200, 40), priority: 2, alternates: [r(450, 330, 200, 40), r(700, 310, 40, 40)] };
    expect(place([far, near], screen)).toEqual([2, 0]);
    expect(place([{ ...far, alternates: [r(450, 330, 200, 40)] }, near], screen)).toEqual([-1, 0]);
  });

  it("keeps labels out of blocked rectangles and inside the area", () => {
    const headline = r(0, 500, 600, 300);
    expect(place([{ rect: r(100, 520, 200, 40), priority: 1, alternates: [r(100, 440, 200, 40)] }], screen, { blocked: [headline] })).toEqual([1]);
    expect(place([{ rect: r(900, 100, 200, 40), priority: 1, alternates: [r(940, 100, 40, 40)] }], screen)).toEqual([1]);
  });

  it("shows a pinned label at its first place whatever is there", () => {
    expect(place([{ rect: label, priority: 9, pinned: true, alternates: [below] }], screen, { discs: [{ x: 500, y: 320, r: 30 }] })).toEqual([0]);
  });

  it("measures a disc as a circle, not as its bounding box", () => {
    const disc = { x: 100, y: 100, r: 50 };
    expect(touchesDisc(r(140, 140, 40, 40), disc)).toBe(false);
    expect(touchesDisc(r(130, 130, 40, 40), disc)).toBe(true);
    expect(touchesDisc(r(152, 80, 40, 40), disc)).toBe(false);
    expect(touchesDisc(r(152, 80, 40, 40), disc, 4)).toBe(true);
  });
});
