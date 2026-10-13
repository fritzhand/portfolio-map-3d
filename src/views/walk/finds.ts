/* The keepsakes: five small things hidden around the island for a visitor to find by wandering (a
   seashell, a message in a bottle, a golden feather, a brass key, a paper boat), each near one of
   the set pieces (scenery.ts). They glow softly and turn in the air; walking up to one picks it up,
   a line says what it was, and the counter (n/5, in the HUD) goes up. What a visitor has found is
   kept in this browser only (localStorage), nothing is sent anywhere and nothing is tied to a
   person, a company or a district.

   findSpots() picks each place from the layout and the set pieces alone (pure: finds.test.ts):
   beside its piece when there is one, in the open and clear of every obstacle. Finds is the live
   part: the meshes, the pickup test and the saved progress. */
import * as THREE from "three";
import { hashString, seededRandom, type WorldLayout } from "../../data/layout";
import { cpuCanvas } from "../../three/cpuCanvas";
import { PIECES, type PieceKind } from "./pieces";
import type { Anchor } from "./scenery";
import type { ScenePalette } from "./palette";
import type { Terrain } from "./terrain";
import { clamp } from "./util";

export interface FindKind {
  id: string;
  name: string;
  /** What is shown for a find not yet found. */
  hint: string;
  /** The set piece it hides near. */
  near: PieceKind;
}

export const FIND_KINDS: readonly FindKind[] = [
  { id: "shell", name: "a spiral seashell", hint: "Something small washed up by the parasols.", near: "beach" },
  { id: "bottle", name: "a message in a bottle", hint: "Where the pier meets the sand.", near: "pier" },
  { id: "feather", name: "a golden feather", hint: "The gulls let things fall near the lighthouse.", near: "lighthouse" },
  { id: "key", name: "a brass key", hint: "The windmill keeps its secrets.", near: "windmill" },
  { id: "boat", name: "a paper boat", hint: "Someone left it by the campfire.", near: "camp" },
];

export interface FindSpot {
  id: string;
  x: number;
  z: number;
  /** The set piece it hides beside: its own, or another when the island has none of its own (null: out on the hills). */
  near: PieceKind | null;
}

/** What blocks a spot: anything that returns true makes it unusable (a collider, a house, the sea). */
export type Blocked = (x: number, z: number) => boolean;

/**
 * Where each find hides: a few units from its set piece, on open ground (never in an obstacle, on a
 * road or underwater). A find whose piece is missing (a small map has fewer wedges) goes beside
 * another piece, or out on the hills. Deterministic, and pure.
 */
export function findSpots(layout: WorldLayout, anchors: readonly Anchor[], blocked: Blocked): FindSpot[] {
  const rand = seededRandom(hashString("walk-finds"));
  const out: FindSpot[] = [];
  FIND_KINDS.forEach((kind, i) => {
    const home = anchors.find((a) => a.kind === kind.near) ?? (anchors.length ? anchors[(i * 3 + 1) % anchors.length] : null);
    for (let tries = 0; tries < 400; tries++) {
      let x: number;
      let z: number;
      if (home) {
        const a = rand() * Math.PI * 2;
        const r = 5 + rand() * (4 + tries * 0.05);
        x = home.x + Math.cos(a) * r;
        z = home.z + Math.sin(a) * r;
      } else {
        const a = rand() * Math.PI * 2;
        const r = layout.ringRadius * (0.8 + rand() * 0.3);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (blocked(x, z)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 8)) continue;
      out.push({ id: kind.id, x, z, near: home ? home.kind : null });
      return;
    }
  });
  return out;
}

const STORE_KEY = "portfolio-map:walk-keepsakes";

function loadFound(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string" && FIND_KINDS.some((k) => k.id === v)) : []);
  } catch {
    return new Set();
  }
}

function saveFound(found: Set<string>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...found]));
  } catch {
    /* private mode: kept for this visit only */
  }
}

export interface FindProgress {
  total: number;
  found: string[];
  /** The keepsakes hidden on this island, and what the list says about each until it is found. */
  hidden: { id: string; name: string; hint: string }[];
}

/** What the list says about a keepsake not yet found: its own hint beside its own set piece, otherwise where it really is. */
export function findHint(kind: FindKind, spot: FindSpot): string {
  if (spot.near === kind.near) return kind.hint;
  if (!spot.near) return "Somewhere out on the hills.";
  const title = PIECES[spot.near].title;
  return `Somewhere near ${title.charAt(0).toLowerCase()}${title.slice(1)}.`;
}

/** A soft golden glow for behind a find (CPU canvas). */
function glowTexture(): THREE.CanvasTexture {
  const [cv, ctx] = cpuCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,244,200,0.95)");
  g.addColorStop(0.35, "rgba(255,214,120,0.45)");
  g.addColorStop(1, "rgba(255,200,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Finds {
  group: THREE.Group;
  spots: readonly FindSpot[];
  progress(): FindProgress;
  /** Turn and bob the finds, and pick one up if the walker is at it. Returns the find just picked up, if any. */
  update(time: number, dt: number, reduced: boolean, walker: { x: number; z: number; y: number }): FindKind | null;
  dispose(): void;
}

export function buildFinds(spots: readonly FindSpot[], terrain: Pick<Terrain, "heightAt">, p: ScenePalette): Finds {
  const group = new THREE.Group();
  group.name = "keepsakes";
  const found = loadFound();
  const glow = glowTexture();
  const gold = p.dark ? new THREE.Color("#ffe9a8") : new THREE.Color("#ffc94a");
  const gem = new THREE.MeshBasicMaterial({ color: gold, toneMapped: false, fog: false });
  const rim = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff7dc"), toneMapped: false, fog: false });
  const gemGeo = new THREE.OctahedronGeometry(0.34, 0).scale(0.8, 1.2, 0.8);
  const ringGeo = new THREE.TorusGeometry(0.5, 0.025, 4, 18);
  const items = spots.map((s) => {
    const root = new THREE.Group();
    const y = Math.max(0, terrain.heightAt(s.x, s.z));
    root.position.set(s.x, y + 1.25, s.z);
    const mesh = new THREE.Mesh(gemGeo, gem);
    const ring = new THREE.Mesh(ringGeo, rim);
    ring.rotation.x = Math.PI / 2.4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
    sprite.scale.setScalar(2.8);
    root.add(sprite, mesh, ring);
    root.visible = !found.has(s.id);
    group.add(root);
    return { spot: s, root, mesh, ring, sprite, y: y + 1.25, pop: -1, phase: (hashString(s.id) % 628) / 100 };
  });

  return {
    group,
    spots,
    progress: () => ({
      total: spots.length,
      found: [...found].filter((id) => spots.some((s) => s.id === id)),
      hidden: spots.flatMap((s) => {
        const kind = FIND_KINDS.find((k) => k.id === s.id);
        return kind ? [{ id: kind.id, name: kind.name, hint: findHint(kind, s) }] : [];
      }),
    }),
    update(time, dt, reduced, walker) {
      let got: FindKind | null = null;
      for (const it of items) {
        if (it.pop >= 0) {
          // Picked up: it rises, swells and fades out.
          it.pop += dt;
          const t = clamp(it.pop / 0.7, 0, 1);
          it.root.position.y = it.y + t * 1.6;
          it.root.scale.setScalar(1 + t * 1.2);
          (it.sprite.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - t);
          if (t >= 1) {
            it.pop = -1;
            it.root.visible = false;
            it.root.scale.setScalar(1);
            (it.sprite.material as THREE.SpriteMaterial).opacity = 0.85;
          }
          continue;
        }
        if (!it.root.visible) continue;
        const t = reduced ? 0 : time;
        it.mesh.rotation.y = t * 1.4 + it.phase;
        it.ring.rotation.z = t * 0.8 + it.phase;
        it.root.position.y = it.y + Math.sin(t * 1.6 + it.phase) * 0.14;
        const s = 1 + Math.sin(t * 2.2 + it.phase) * 0.06;
        it.sprite.scale.setScalar(2.8 * s);
        if (!got && Math.hypot(walker.x - it.spot.x, walker.z - it.spot.z) < 2.2 && Math.abs(walker.y - it.y) < 3.5) {
          found.add(it.spot.id);
          saveFound(found);
          it.pop = 0;
          got = FIND_KINDS.find((k) => k.id === it.spot.id) ?? null;
        }
      }
      return got;
    },
    dispose() {
      glow.dispose();
      gem.dispose();
      rim.dispose();
      gemGeo.dispose();
      ringGeo.dispose();
      for (const it of items) (it.sprite.material as THREE.SpriteMaterial).dispose();
    },
  };
}
