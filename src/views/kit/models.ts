/* Every model in the walk world's kit, for the kit gallery (?kit) and its test: the set pieces
   (pieces.ts), the houses (houses.ts), the street furniture and the plaza's props (street.ts), the
   balloon and the cat (life.ts). Each builds from the scene palette into a PieceModel in its own
   frame (y up, standing on y = 0, its front toward +z). */
import { HOUSE_KINDS, buildHouse, type HouseKind } from "../walk/houses";
import { blend, type Part } from "../walk/kit";
import { balloonParts, catParts } from "../walk/life";
import type { ScenePalette } from "../walk/palette";
import { PIECES, PIECE_KINDS, type PieceModel } from "../walk/pieces";
import { bikeRack, busStop, fence, fountain, haystack, hydrant, iceCreamCart, kiosk, lampPost, mailbox, picnic, stall, stoneWall, trashCan } from "../walk/street";

export interface KitEntry {
  id: string;
  group: "Set pieces" | "Houses" | "Street and plaza" | "Life";
  title: string;
  /** The file its builder is in, under src/views/walk/. */
  source: string;
  /** It stands on the shore: the gallery puts it on sand by the sea. */
  coast?: boolean;
  build(p: ScenePalette, rand: () => number): PieceModel;
}

const only = (parts: Part[]): PieceModel => ({ parts, colliders: [] });
/** Parts built along +x from 0 to len, centered. */
const centered = (parts: Part[], len: number) => parts.map((g) => g.translate(-len / 2, 0, 0));

const HOUSE_TITLES: Record<HouseKind, string> = {
  cottage: "A cottage",
  townhouse: "A townhouse",
  solar: "A house with solar panels",
  shop: "A corner shop",
  villa: "A villa",
  shed: "A shed",
};

export const KIT: readonly KitEntry[] = [
  ...PIECE_KINDS.map((kind): KitEntry => ({ id: kind, group: "Set pieces", title: PIECES[kind].title, source: "pieces.ts", coast: PIECES[kind].coast, build: PIECES[kind].build })),
  ...HOUSE_KINDS.map((kind): KitEntry => ({ id: `house-${kind}`, group: "Houses", title: HOUSE_TITLES[kind], source: "houses.ts", build: (p, rand) => only(buildHouse(kind, p, rand).parts) })),
  {
    id: "lamp",
    group: "Street and plaza",
    title: "A street lamp",
    source: "street.ts",
    build: (p) => {
      const lamp = lampPost(p, false);
      return { parts: lamp.iron, glass: lamp.glass, colliders: [] };
    },
  },
  {
    id: "lamp-double",
    group: "Street and plaza",
    title: "A double street lamp",
    source: "street.ts",
    build: (p) => {
      const lamp = lampPost(p, true);
      return { parts: lamp.iron, glass: lamp.glass, colliders: [] };
    },
  },
  { id: "bus-stop", group: "Street and plaza", title: "A bus shelter", source: "street.ts", build: (p) => only(busStop(p)) },
  { id: "picnic", group: "Street and plaza", title: "A picnic table under a parasol", source: "street.ts", build: (p) => only(picnic(p)) },
  {
    id: "curb",
    group: "Street and plaza",
    title: "A mailbox, a hydrant and a trash can",
    source: "street.ts",
    build: (p) => only([...mailbox(p).map((g) => g.translate(-1.1, 0, 0)), ...hydrant(p), ...trashCan(p).map((g) => g.translate(1.1, 0, 0))]),
  },
  { id: "fence", group: "Street and plaza", title: "A picket fence", source: "street.ts", build: (p) => only(centered(fence(6, p), 6)) },
  { id: "stone-wall", group: "Street and plaza", title: "A stone wall", source: "street.ts", build: (p) => only(centered(stoneWall(6, p), 6)) },
  { id: "haystack", group: "Street and plaza", title: "A haystack and a bale", source: "street.ts", build: (p) => only(haystack(p)) },
  { id: "fountain", group: "Street and plaza", title: "The plaza's fountain", source: "street.ts", build: (p) => only(fountain(p)) },
  { id: "stall", group: "Street and plaza", title: "A market stall", source: "street.ts", build: (p) => only(stall(p, p.awning)) },
  { id: "ice-cream-cart", group: "Street and plaza", title: "An ice-cream cart", source: "street.ts", build: (p) => only(iceCreamCart(p)) },
  { id: "kiosk", group: "Street and plaza", title: "A newsstand kiosk", source: "street.ts", build: (p) => only(kiosk(p)) },
  { id: "bike-rack", group: "Street and plaza", title: "A bike rack", source: "street.ts", build: (p) => only(bikeRack(p)) },
  { id: "balloon", group: "Life", title: "A hot-air balloon", source: "life.ts", build: (p) => only(balloonParts(p)) },
  {
    id: "cat",
    group: "Life",
    title: "The cat",
    source: "life.ts",
    build: (p) => {
      const cat = catParts(blend(p.roofCoral, p.flag, 0.45), p);
      return only([...cat.body, ...cat.tail]);
    },
  },
];

export const KIT_GROUPS = ["Set pieces", "Houses", "Street and plaza", "Life"] as const;
