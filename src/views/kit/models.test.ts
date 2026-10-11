import { describe, expect, it } from "vitest";
import { hashString, seededRandom } from "../../data/layout";
import { readScenePalette } from "../walk/palette";
import { PIECE_KINDS } from "../walk/pieces";
import { KIT, KIT_GROUPS } from "./models";

describe("the kit gallery's models", () => {
  it("has every set piece, and each model once", () => {
    const ids = KIT.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of PIECE_KINDS) expect(ids).toContain(kind);
    for (const e of KIT) expect(KIT_GROUPS).toContain(e.group);
  });

  it("builds every model from the scene palette", () => {
    const p = readScenePalette();
    for (const e of KIT) {
      const m = e.build(p, seededRandom(hashString(e.id)));
      expect(m.parts.length + (m.loose?.length ?? 0), e.id).toBeGreaterThan(0);
      for (const g of m.parts) expect(g.attributes.color, e.id).toBeDefined();
    }
  });
});
