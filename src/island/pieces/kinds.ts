/* The island's set pieces as the plan sees them (mapLayout.ts): which kinds there are, whether each
   stands on the coast or inland, whether it is a one-off landmark, and how much ground it takes.
   What each looks like is its Blender model (art/assets/pieces.py, placed by mapPieces.ts); this file
   is pure data, so the plan and the ground stay free of three.js.

   The order is the order they are handed out in: each kind once, then the ones that may repeat, by turns. */

export type PieceKind =
  | "beacon"
  | "marina"
  | "beach"
  | "cabanas"
  | "boathouse"
  | "turbine"
  | "farm"
  | "pods"
  | "datacenter"
  | "solar"
  | "observatory"
  | "greenhouse";

export interface PieceInfo {
  /** On the shore facing the sea, or inland on the hills facing the plaza. */
  coast: boolean;
  /** A landmark: one at most on the island. */
  once: boolean;
  /** The ground it takes, as a radius around where it stands (its model and colliders keep inside). */
  footprint: number;
  /** How far round where it stands the ground is leveled for it. */
  pad: number;
  /** What it is, in a few words. */
  title: string;
}

export const PIECE_INFO: Record<PieceKind, PieceInfo> = {
  beacon: { coast: true, once: true, footprint: 4.6, pad: 5, title: "A beacon tower" },
  marina: { coast: true, once: true, footprint: 3.2, pad: 3, title: "A marina pier and two electric launches" },
  beach: { coast: true, once: false, footprint: 8, pad: 7, title: "Umbrellas, loungers and a beach shower" },
  cabanas: { coast: true, once: false, footprint: 13, pad: 12, title: "Cabanas and a lifeguard tower" },
  boathouse: { coast: true, once: false, footprint: 7, pad: 6.5, title: "A boathouse with a slipway" },
  turbine: { coast: false, once: true, footprint: 5.6, pad: 4, title: "A wind turbine" },
  farm: { coast: false, once: false, footprint: 11.5, pad: 8, title: "A vertical farm and crop beds" },
  pods: { coast: false, once: false, footprint: 6.6, pad: 6.4, title: "Sleeping pods round a fire pit" },
  datacenter: { coast: false, once: true, footprint: 3.6, pad: 3.5, title: "A small data center" },
  solar: { coast: false, once: false, footprint: 9.6, pad: 8.6, title: "A solar field" },
  observatory: { coast: false, once: true, footprint: 5.6, pad: 4.2, title: "An observatory" },
  greenhouse: { coast: false, once: false, footprint: 6.2, pad: 5.5, title: "A greenhouse" },
};

/** Every kind, in the order the island hands them out. */
export const PIECE_KINDS = Object.keys(PIECE_INFO) as PieceKind[];
