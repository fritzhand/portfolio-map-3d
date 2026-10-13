import { describe, expect, it } from "vitest";
import PALETTE from "./palette.json";
import { ACCENT_SLOT, BASE_ROW, DISTRICT_ROW, MAX_DISTRICTS, RAMP_ROWS, ROWS_PER_DISTRICT, districtRamps, rampRow } from "./ramps";

const HEX = /^#[0-9a-f]{6}$/;
const lightness = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);

describe("the island palette", () => {
  it("lays its rows out without overlaps", () => {
    expect(BASE_ROW + PALETTE.ramps.length).toBeLessThanOrEqual(DISTRICT_ROW);
    expect(DISTRICT_ROW + MAX_DISTRICTS * ROWS_PER_DISTRICT).toBeLessThanOrEqual(ACCENT_SLOT);
    expect(ACCENT_SLOT + ROWS_PER_DISTRICT).toBeLessThanOrEqual(RAMP_ROWS);
    // The largest map in the network has 36 districts; the plaza takes slot 0.
    expect(MAX_DISTRICTS).toBeGreaterThanOrEqual(37);
  });

  it("names every ramp once, with day and night stops that start at 0 and rise", () => {
    const names = PALETTE.ramps.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    for (const r of PALETTE.ramps) {
      for (const theme of ["day", "night"] as const) {
        const stops = r[theme] as [number, string][];
        expect(stops[0][0], `${r.name} ${theme}`).toBe(0);
        stops.forEach(([u, h], i) => {
          expect(h, `${r.name} ${theme}`).toMatch(HEX);
          if (i) expect(u).toBeGreaterThan(stops[i - 1][0]);
        });
      }
    }
  });

  it("finds a ramp's row by name and refuses an unknown one", () => {
    expect(rampRow(PALETTE.ramps[0].name)).toBe(BASE_ROW);
    expect(rampRow("glow")).toBe(BASE_ROW + PALETTE.ramps.findIndex((r) => r.name === "glow"));
    expect(() => rampRow("no-such-ramp")).toThrow();
  });

  it("makes four ramps per district color, darker at night, the glow kept bright", () => {
    for (const color of ["#7a9a01", "#2a78d6", "#e34948", "#000000", "#ffffff"]) {
      const day = districtRamps(color, "day");
      const night = districtRamps(color, "night");
      expect(day).toHaveLength(4);
      expect(night).toHaveLength(4);
      for (const ramps of [day, night]) for (const r of ramps) for (const [, h] of r) expect(h).toMatch(HEX);
      // accent: shade darker than body darker than highlight (by day)
      expect(lightness(day[0][0][1])).toBeLessThanOrEqual(lightness(day[0][1][1]));
      expect(lightness(day[0][1][1])).toBeLessThanOrEqual(lightness(day[0][2][1]));
      // the accent's body is darker at night; the glow is as bright at night as by day, or brighter
      expect(lightness(night[0][1][1])).toBeLessThanOrEqual(lightness(day[0][1][1]));
      expect(lightness(night[1][0][1])).toBeGreaterThanOrEqual(lightness(day[1][0][1]));
    }
  });

  it("is deterministic", () => {
    expect(districtRamps("#00a3b4", "day")).toEqual(districtRamps("#00a3b4", "day"));
  });
});
