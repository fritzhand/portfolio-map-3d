import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import { PORTAL, hubClearance, plazaLamps, plazaSeats, roadDistance } from "../../data/hub";
import { PLAZA_RADIUS, ROAD_WIDTH, WALK_SPEED, layoutWorld } from "../../data/layout";
import { directoryFor, fingerposts, secondsText, walkSeconds } from "./wayfinding";

const layout = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);
const furniture = [...plazaLamps(layout), ...plazaSeats(layout)];

describe("walkSeconds", () => {
  it("rounds to 5 seconds, never under 5", () => {
    for (const disc of layout.discs) {
      for (const [x, z] of [[0, 0], [10, 30], [-40, -10]]) {
        const s = walkSeconds(layout, disc.slug, x, z);
        expect(s % 5).toBe(0);
        expect(s).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("goes across the plaza to the road, then along it: farther takes as long or longer", () => {
    const disc = layout.discs[0];
    const ux = Math.cos(disc.angle);
    const uz = Math.sin(disc.angle);
    const near = walkSeconds(layout, disc.slug, ux * 30, uz * 30);
    const far = walkSeconds(layout, disc.slug, -ux * 30, -uz * 30);
    expect(far).toBeGreaterThan(near);
    // From the far side the walk is about 60 more units of plaza.
    expect(far - near).toBeGreaterThanOrEqual(Math.floor(60 / WALK_SPEED / 5) * 5);
  });

  it("counts only what is left of the road once out on it", () => {
    const disc = layout.discs[0];
    const ux = Math.cos(disc.angle);
    const uz = Math.sin(disc.angle);
    const entry = Math.hypot(disc.x, disc.z) - disc.r;
    expect(walkSeconds(layout, disc.slug, ux * (entry - 2), uz * (entry - 2))).toBe(5);
  });
});

describe("fingerposts", () => {
  const posts = fingerposts(layout);

  it("stands one inside the plaza where each road leaves it, beside the road", () => {
    expect(posts).toHaveLength(layout.discs.length);
    posts.forEach((post, i) => {
      expect(Math.hypot(post.x, post.z)).toBeLessThan(PLAZA_RADIUS);
      expect(Math.hypot(post.x, post.z)).toBeGreaterThan(PLAZA_RADIUS - 4);
      const d = roadDistance(layout, post.x, post.z);
      expect(d).toBeGreaterThan(ROAD_WIDTH / 2 + 0.5);
      expect(d).toBeLessThan(ROAD_WIDTH / 2 + 3);
      expect(post.arms[0].slug).toBe(layout.discs[i].slug);
    });
  });

  it("points one arm out along its road and one back to the hub", () => {
    posts.forEach((post, i) => {
      const out = post.arms[0].heading;
      expect(Math.cos(out - layout.discs[i].angle)).toBeCloseTo(1, 6);
      const back = post.arms[1];
      expect(back.slug).toBeNull();
      // Toward the plaza's center.
      expect(Math.cos(back.heading) * -post.x + Math.sin(back.heading) * -post.z).toBeCloseTo(Math.hypot(post.x, post.z), 4);
    });
  });

  it("keeps clear of the plaza's lamps and seats, the hub and the portal", () => {
    for (const post of posts) {
      for (const f of furniture) expect(Math.hypot(post.x - f.x, post.z - f.z)).toBeGreaterThan(1.2);
      expect(hubClearance(post.x, post.z)).toBeGreaterThan(2);
      expect(Math.hypot(post.x - PORTAL.x, post.z - PORTAL.z)).toBeGreaterThan(PORTAL.r + 2);
    }
  });
});

describe("the Walking times board", () => {
  const dir = directoryFor(layout);
  const s = layout.spawn;

  it("stands ahead of the spawn and to its left, facing it, clear of the walk to the hub", () => {
    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    const ahead = (dir.x - s.x) * fx + (dir.z - s.z) * fz;
    const left = (dir.x - s.x) * fz - (dir.z - s.z) * fx;
    expect(ahead).toBeGreaterThan(4);
    expect(left).toBeGreaterThan(3.5);
    // Its face (+z) turns toward the spawn.
    expect(Math.sin(dir.yaw) * (s.x - dir.x) + Math.cos(dir.yaw) * (s.z - dir.z)).toBeCloseTo(Math.hypot(s.x - dir.x, s.z - dir.z), 4);
    for (const f of furniture) expect(Math.hypot(dir.x - f.x, dir.z - f.z)).toBeGreaterThan(3);
    expect(hubClearance(dir.x, dir.z)).toBeGreaterThan(4);
    expect(Math.hypot(dir.x - PORTAL.x, dir.z - PORTAL.z)).toBeGreaterThan(PORTAL.r + 4);
    expect(roadDistance(layout, dir.x, dir.z)).toBeGreaterThan(ROAD_WIDTH);
  });

  it("lists every area once, from the reader's left to right", () => {
    expect(dir.rows.map((r) => r.slug).sort()).toEqual(layout.discs.map((d) => d.slug).sort());
    for (let i = 1; i < dir.rows.length; i++) expect(dir.rows[i].bearing).toBeGreaterThanOrEqual(dir.rows[i - 1].bearing);
  });

  it("points each arrow where the area really is, for someone facing the board", () => {
    for (const row of dir.rows) {
      const disc = layout.discs.find((d) => d.slug === row.slug)!;
      // Into the board's own frame: +x is the reader's right, +z comes out of the board toward the reader.
      const dx = disc.x - dir.x;
      const dz = disc.z - dir.z;
      const lx = dx * Math.cos(dir.yaw) - dz * Math.sin(dir.yaw);
      const lz = dx * Math.sin(dir.yaw) + dz * Math.cos(dir.yaw);
      expect(Math.cos(row.bearing - Math.atan2(lx, -lz))).toBeCloseTo(1, 6);
    }
  });

  it("says the time the way the signs do", () => {
    expect(secondsText(15)).toBe("15 s");
  });
});
