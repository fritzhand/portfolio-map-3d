import { describe, expect, it } from "vitest";
import { isLoadFailure } from "./fallback";

describe("the walk view's error boundary", () => {
  it("tells a world's code failing to download apart from the device failing to draw", () => {
    for (const msg of [
      "Failed to fetch dynamically imported module: https://x.example/assets/ClassicWalk-abc.js",
      "Importing a module script failed.",
      "error loading dynamically imported module",
    ])
      expect(isLoadFailure(new TypeError(msg)), msg).toBe(true);
    expect(isLoadFailure(Object.assign(new Error("Loading chunk 3 failed"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isLoadFailure(new Error("Error creating WebGL context."))).toBe(false);
    expect(isLoadFailure("THREE.WebGLRenderer: Context Lost.")).toBe(false);
  });
});
