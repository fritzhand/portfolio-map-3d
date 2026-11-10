import { describe, expect, it } from "vitest";
import { overlaps, touchesDisc, type Rect } from "../lib/declutter.ts";
import { layoutMoonLabels, leaderStart, MOON_LABEL, MoonLabelLayout, moonLabelsCompact, type MoonAnchor, type MoonLabelPosition } from "./moonLabels.ts";

describe("persistent moon labels", () => {
  it.each([[390,234],[320,118],[600,720]])("fits 36 names in %i×%i without overlapping text", (w,h) => {
    const anchors=Array.from({length:36},(_,i)=>({slug:String(i),x:w/2+Math.cos(i)*70,y:h/2+Math.sin(i)*50,radius:4}));
    const result=layoutMoonLabels(anchors,{l:0,t:0,r:w,b:h});
    expect(result).toHaveLength(36);
    for (const a of result) {
      expect(a.x-a.width/2).toBeGreaterThanOrEqual(0);expect(a.x+a.width/2).toBeLessThanOrEqual(w);
      expect(a.y-8).toBeGreaterThanOrEqual(0);expect(a.y+8).toBeLessThanOrEqual(h);
      for (const b of result) if(a!==b) expect(Math.abs(a.x-b.x)>= (a.width+b.width)/2 || Math.abs(a.y-b.y)>=16).toBe(true);
    }
  });
  it("keeps dense names steady during damping and updates after a visible camera move", () => {
    const layout = new MoonLabelLayout();
    const area = { l: 0, t: 0, r: 390, b: 234 };
    const anchors = Array.from({ length: 36 }, (_, i) => ({ slug: String(i), x: 100 + i, y: 120, radius: 4 }));
    const first = layout.update(anchors, area, []);
    expect(layout.update(anchors.map((a) => ({ ...a, x: a.x + 2 })), area, [])).toBe(first);
    expect(layout.update(anchors.map((a) => ({ ...a, x: a.x + 9 })), area, [])).not.toBe(first);
  });
  it("reflows on viewport or publisher-label changes even while the camera stays still", () => {
    const layout = new MoonLabelLayout();
    const anchors = [{ slug: "region", x: 120, y: 130, radius: 4 }];
    const area = { l: 0, t: 0, r: 390, b: 234 };
    const first = layout.update(anchors, area, []);
    const narrowed = layout.update(anchors, { ...area, r: 320 }, []);
    expect(narrowed).not.toBe(first);
    const obstacle = { l: 60, r: 180, t: 100, b: 150 };
    const obstructed = layout.update(anchors, { ...area, r: 320 }, [obstacle]);
    expect(obstructed).not.toBe(narrowed);
    expect(obstructed[0].y - 8 >= obstacle.b || obstructed[0].y + 8 <= obstacle.t || obstructed[0].x - obstructed[0].width / 2 >= obstacle.r || obstructed[0].x + obstructed[0].width / 2 <= obstacle.l).toBe(true);
  });
});

describe("names beside their moons", () => {
  const area = { l: 0, t: 0, r: 700, b: 800 };
  const planet = { x: 350, y: 400, r: 100 };
  // Two rings of moons around the planet, flattened as tilted orbits appear on screen.
  const ring = (n: number, rx: number, ry: number, phase: number): MoonAnchor[] =>
    Array.from({ length: n }, (_, i) => {
      const a = phase + (i / n) * Math.PI * 2;
      return { slug: `${rx}-${i}`, x: planet.x + Math.cos(a) * rx, y: planet.y + Math.sin(a) * ry, radius: 14, want: 110 + (i % 4) * 30 };
    });
  const anchors = [...ring(8, 190, 90, 0.2), ...ring(7, 250, 120, 0.6)];
  const box = (p: MoonLabelPosition): Rect => ({ l: p.x - p.width / 2, r: p.x + p.width / 2, t: p.y - MOON_LABEL.height / 2, b: p.y + MOON_LABEL.height / 2 });
  const disc = (a: MoonAnchor): Rect => ({ l: a.x - a.radius, r: a.x + a.radius, t: a.y - a.radius, b: a.y + a.radius });

  it("gives every name its whole width, off the planet, the moons and the other names", () => {
    const result = layoutMoonLabels(anchors, area, [], { planet });
    expect(result).toHaveLength(anchors.length);
    for (const p of result) {
      const rect = box(p);
      expect(p.width).toBe(anchors.find((a) => a.slug === p.slug)!.want);
      expect(rect.l >= area.l && rect.r <= area.r && rect.t >= area.t && rect.b <= area.b).toBe(true);
      expect(touchesDisc(rect, planet)).toBe(false);
      for (const a of anchors) expect(overlaps(rect, disc(a))).toBe(false);
      for (const q of result) if (q !== p) expect(overlaps(rect, box(q))).toBe(false);
    }
  });

  it("stands most names next to their moon", () => {
    const result = layoutMoonLabels(anchors, area, [], { planet });
    const gaps = result.map((p) => {
      const a = anchors.find((x) => x.slug === p.slug)!;
      const r = box(p);
      return Math.hypot(a.x - Math.max(r.l, Math.min(a.x, r.r)), a.y - Math.max(r.t, Math.min(a.y, r.b))) - a.radius;
    });
    expect(gaps.filter((g) => g <= 2 * MOON_LABEL.row).length).toBeGreaterThanOrEqual(anchors.length - 2);
  });

  it("shortens a name only as far as the scene's edge requires", () => {
    const [p] = layoutMoonLabels([{ slug: "long", x: 60, y: 60, radius: 10, want: 400 }], { l: 0, t: 0, r: 300, b: 120 });
    expect(p.width).toBe(300);
    expect(layoutMoonLabels([{ slug: "short", x: 60, y: 60, radius: 10, want: 90 }], { l: 0, t: 0, r: 300, b: 120 })[0].width).toBe(90);
  });

  it("keeps a name on the side it took last time", () => {
    const moon = { slug: "one", x: 350, y: 400, radius: 12, want: 100 };
    const fresh = layoutMoonLabels([moon], area)[0];
    expect(fresh.side).toBe(0);
    const above = layoutMoonLabels([moon], area, [], { previous: new Map([["one", 2]]) })[0];
    expect(above.side).toBe(2);
    expect(above.y).toBeLessThan(moon.y);
  });

  it("keeps grid names off the planet where a place allows it", () => {
    // Too many names for places beside the moons: the grid takes over.
    const crowd = Array.from({ length: 30 }, (_, i) => ({ slug: String(i), x: 195 + Math.cos(i) * 60, y: 117 + Math.sin(i) * 40, radius: 4 }));
    const small = { l: 0, t: 0, r: 390, b: 234 };
    const center = { x: 195, y: 117, r: 30 };
    const result = layoutMoonLabels(crowd, small, [], { planet: center });
    expect(result).toHaveLength(30);
    expect(result.every((p) => p.side === -1)).toBe(true);
    expect(result.filter((p) => touchesDisc(box(p), center)).length).toBeLessThanOrEqual(2);
  });
});

describe("moonLabelsCompact", () => {
  const phone = { l: 4, t: 124, r: 386, b: 350 };
  const desktop = { l: 328, t: 80, r: 1004, b: 896 };

  it("names every moon where the scene has room, and only the chosen one where it does not", () => {
    expect(moonLabelsCompact(6, phone)).toBe(false);
    expect(moonLabelsCompact(7, phone)).toBe(true);
    expect(moonLabelsCompact(36, phone)).toBe(true);
    expect(moonLabelsCompact(36, desktop)).toBe(false);
  });
});

describe("leaderStart", () => {
  const moon = { slug: "m", x: 100, y: 100, radius: 10 };

  it("starts at the moon's edge, and draws nothing to a name right beside it", () => {
    expect(leaderStart(moon, 100, 40)).toEqual({ x: 100, y: 90 });
    expect(leaderStart(moon, 100, 85)).toBeNull();
  });

  it("starts at the planet's edge for a moon behind the planet", () => {
    const planet = { x: 100, y: 120, r: 50 };
    expect(leaderStart({ ...moon, hidden: true }, 100, 20, planet)).toEqual({ x: 100, y: 70 });
    expect(leaderStart(moon, 100, 20, planet)).toEqual({ x: 100, y: 90 });
  });
});
