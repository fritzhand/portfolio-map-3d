/* The walk world's current theme, read from --scene-* and brand tokens.

   The light theme is a warm afternoon: a blue sky with cream cumulus, a low sun, toon-lit land and
   props (src/three/toon.ts), a turquoise coast, and unlit badges and signs that keep their colors.
   The dark theme is the same island by moonlight. District colors keep their meaning in both. */
import * as THREE from "three";
import "./scene-theme.css";

export interface ScenePalette {
  dark: boolean;
  skyTop: THREE.Color;
  /** Between the zenith and the horizon. */
  skyMid: THREE.Color;
  /** The horizon. */
  skyBottom: THREE.Color;
  /** The glow around the sun (or the moon). */
  glow: THREE.Color;
  /** The haze distant land fades into. */
  fog: THREE.Color;
  /** Sunlit cumulus, and their undersides. */
  cloud: THREE.Color;
  cloudShade: THREE.Color;
  sea: THREE.Color;
  /** Water over the sand just off the beach. */
  seaShallow: THREE.Color;
  seaDeep: THREE.Color;
  sand: THREE.Color;
  grass: THREE.Color;
  grassDark: THREE.Color;
  /** The tips of the grass tufts around the walker, and sun-dried patches of the land. */
  grassTip: THREE.Color;
  road: THREE.Color;
  /** The roads' edge and center lines. */
  roadLine: THREE.Color;
  plaza: THREE.Color;
  tree: THREE.Color;
  treeDark: THREE.Color;
  trunk: THREE.Color;
  rock: THREE.Color;
  palm: THREE.Color;
  palmTrunk: THREE.Color;
  /** Blossoms on the flowering shrubs. */
  bloom: THREE.Color;
  /** The street lamps' globes. */
  lampGlass: THREE.Color;
  /* The hub building (src/views/walk/hub.ts) and the plaza around it. */
  paint: THREE.Color;
  coping: THREE.Color;
  membrane: THREE.Color;
  roofWhite: THREE.Color;
  fascia: THREE.Color;
  concrete: THREE.Color;
  mulch: THREE.Color;
  glass: THREE.Color;
  signPanel: THREE.Color;
  navy: THREE.Color;
  ink: THREE.Color;
  /* The village (houses.ts, street.ts, scenery.ts): painted walls, roofs, glass, awnings. */
  wallMauve: THREE.Color;
  wallCream: THREE.Color;
  wallStone: THREE.Color;
  roofCoral: THREE.Color;
  roofRose: THREE.Color;
  roofSlate: THREE.Color;
  solar: THREE.Color;
  window: THREE.Color;
  windowLight: THREE.Color;
  shutter: THREE.Color;
  awning: THREE.Color;
  /** Warm accents: a banner, a parasol stripe, a balloon. */
  flag: THREE.Color;
  /** The low afternoon sun, or the moon. */
  sun: THREE.Color;
  /** The same colors as CSS strings, for the 2D minimap. */
  css: Record<string, string>;
}

const TOKENS: Record<string, [string, string]> = {
  skyTop: ["--scene-sky-top", "#2a83cf"],
  skyMid: ["--scene-sky-mid", "#6db6e6"],
  skyBottom: ["--scene-sky-bottom", "#cdeefb"],
  glow: ["--scene-sky-glow", "#fff1d2"],
  fog: ["--scene-fog", "#d3ebf5"],
  cloud: ["--scene-cloud", "#fff6e8"],
  cloudShade: ["--scene-cloud-shade", "#e8cfc3"],
  sea: ["--scene-sea", "#2b8cb8"],
  seaShallow: ["--scene-sea-shallow", "#46c4c3"],
  seaDeep: ["--scene-sea-deep", "#1a5a8e"],
  sand: ["--scene-sand", "#efdcb0"],
  grass: ["--scene-grass", "#7cb26c"],
  grassDark: ["--scene-grass-dark", "#5c975c"],
  grassTip: ["--scene-grass-tip", "#b9d98a"],
  road: ["--scene-road", "#a6abb1"],
  roadLine: ["--scene-road-line", "#f6edd5"],
  plaza: ["--scene-plaza", "#e2d8c5"],
  tree: ["--scene-tree", "#3e8d6b"],
  treeDark: ["--scene-tree-dark", "#286c58"],
  trunk: ["--scene-trunk", "#8a6a51"],
  rock: ["--scene-rock", "#b8ad9f"],
  palm: ["--scene-palm", "#6e8a34"],
  palmTrunk: ["--scene-palm-trunk", "#9a9278"],
  bloom: ["--scene-bloom", "#d9573f"],
  lampGlass: ["--scene-lamp-glass", "#f5f0e3"],
  paint: ["--scene-paint", "#ece8df"],
  coping: ["--scene-coping", "#c8ccce"],
  membrane: ["--scene-membrane", "#a3aab0"],
  roofWhite: ["--scene-roof-white", "#eef1f0"],
  fascia: ["--scene-fascia", "#3a3d42"],
  concrete: ["--scene-concrete", "#b8b5ad"],
  mulch: ["--scene-mulch", "#4a3a2c"],
  glass: ["--scene-glass", "#22303a"],
  signPanel: ["--scene-sign-panel", "#f7f6f2"],
  wallMauve: ["--scene-wall-mauve", "#a08b88"],
  wallCream: ["--scene-wall-cream", "#e8d3a2"],
  wallStone: ["--scene-wall-stone", "#bfae9c"],
  roofCoral: ["--scene-roof-coral", "#e27560"],
  roofRose: ["--scene-roof-rose", "#bb5a73"],
  roofSlate: ["--scene-roof-slate", "#5f6d99"],
  solar: ["--scene-solar", "#3f4f86"],
  window: ["--scene-window", "#41525a"],
  windowLight: ["--scene-window-light", "#a9d6ea"],
  shutter: ["--scene-shutter", "#6aa89d"],
  awning: ["--scene-awning", "#d9604b"],
  flag: ["--scene-flag", "#e9a23b"],
  navy: ["--brand-navy", "#2d4a65"],
  ink: ["--brand-ink", "#1d1f24"],
};

export function readScenePalette(): ScenePalette {
  const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const css: Record<string, string> = {};
  const colors: Record<string, THREE.Color> = {};
  const parse = (raw: string, fallback: string) => {
    try {
      return new THREE.Color(raw || fallback);
    } catch {
      return new THREE.Color(fallback);
    }
  };
  for (const [key, [name, fallback]] of Object.entries(TOKENS)) {
    const c = parse(cs?.getPropertyValue(name).trim() ?? "", fallback);
    colors[key] = c;
    css[key] = `#${c.getHexString()}`;
  }
  const dark = cs?.colorScheme.includes("dark") ?? false;
  const sun = parse(cs?.getPropertyValue("--scene-sun").trim() ?? "", dark ? "#d4d4d8" : "#fff0d6");
  css.sun = `#${sun.getHexString()}`;
  return { ...(colors as Omit<ScenePalette, "dark" | "sun" | "css">), dark, sun, css } as ScenePalette;
}

/** Watch theme changes without rebuilding the avatar, camera or multiplayer session. */
export function watchScenePalette(change: (palette: ScenePalette) => void): () => void {
  const initial = readScenePalette();
  let last = JSON.stringify([initial.dark, initial.css]);
  const refresh = () => {
    const palette = readScenePalette();
    const key = JSON.stringify([palette.dark, palette.css]);
    if (key === last) return;
    last = key;
    change(palette);
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", refresh);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", refresh);
  };
}

/**
 * The People area's color in the walk world (--scene-person): a lighter tint of the person color,
 * since the badge ring's slate reads near black on large flat-shaded props. Not a district color.
 */
export function personSceneColor(): string {
  const raw = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--scene-person").trim() : "";
  return raw || "#6f8296";
}

/** A new color `t` of the way from a to b. */
export function mix(a: THREE.Color, b: THREE.Color | string, t: number): THREE.Color {
  return a.clone().lerp(typeof b === "string" ? new THREE.Color(b) : b, t);
}
