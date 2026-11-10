import { describe, expect, it } from "vitest";
import { keyAction, ORBIT_STEP, SHORTCUTS, stepWorld, ZOOM_STEP } from "./keys.ts";

describe("keyAction", () => {
  it("turns the view with the arrow keys", () => {
    expect(keyAction({ key: "ArrowLeft" })).toEqual({ kind: "orbit", azimuth: -ORBIT_STEP, polar: 0 });
    expect(keyAction({ key: "ArrowRight" })).toEqual({ kind: "orbit", azimuth: ORBIT_STEP, polar: 0 });
    expect(keyAction({ key: "ArrowUp" })).toEqual({ kind: "orbit", azimuth: 0, polar: -ORBIT_STEP });
    expect(keyAction({ key: "ArrowDown" })).toEqual({ kind: "orbit", azimuth: 0, polar: ORBIT_STEP });
  });

  it("zooms with + and -, shifted or not", () => {
    for (const key of ["+", "="]) expect(keyAction({ key })).toEqual({ kind: "zoom", factor: ZOOM_STEP });
    for (const key of ["-", "_"]) expect(keyAction({ key })).toEqual({ kind: "zoom", factor: 1 / ZOOM_STEP });
  });

  it("steps through the maps, returns to the overview, goes to search and shows the list", () => {
    expect(keyAction({ key: "[" })).toEqual({ kind: "step", by: -1 });
    expect(keyAction({ key: "]" })).toEqual({ kind: "step", by: 1 });
    expect(keyAction({ key: "0" })).toEqual({ kind: "overview" });
    expect(keyAction({ key: "/" })).toEqual({ kind: "search" });
    expect(keyAction({ key: "?" })).toEqual({ kind: "help" });
  });

  it("leaves the browser's own shortcuts and every other key alone", () => {
    expect(keyAction({ key: "+", ctrlKey: true })).toBeNull();
    expect(keyAction({ key: "0", metaKey: true })).toBeNull();
    expect(keyAction({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(keyAction({ key: "a" })).toBeNull();
    expect(keyAction({ key: "Enter" })).toBeNull();
  });

  it("lists every key it handles", () => {
    const listed = SHORTCUTS.flatMap((s) => s.keys).join(" ");
    for (const key of ["←", "→", "↑", "↓", "+", "[", "]", "0", "/", "?", "Esc"]) expect(listed).toContain(key);
  });
});

describe("stepWorld", () => {
  const ids = ["a", "b", "c"];

  it("moves to the next or the previous map, around the ends", () => {
    expect(stepWorld(ids, "a", 1)).toBe("b");
    expect(stepWorld(ids, "c", 1)).toBe("a");
    expect(stepWorld(ids, "a", -1)).toBe("c");
  });

  it("starts from the first or the last map in the overview", () => {
    expect(stepWorld(ids, null, 1)).toBe("a");
    expect(stepWorld(ids, null, -1)).toBe("c");
    expect(stepWorld(ids, "gone", 1)).toBe("a");
  });

  it("has nowhere to go in an empty network", () => {
    expect(stepWorld([], null, 1)).toBeNull();
  });
});
