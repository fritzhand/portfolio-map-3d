// @ts-nocheck
/* Day and night on the island, following the site's theme (light: a bright afternoon on the campus;
   dark: the campus at night, its lines of light, screens and lamps lit, stars out). The palette's rows
   switch (palette.ts), the scene materials' fog and the ground's tint (materials.ts), and the sky's
   and the sea's colors. */
import { setPaletteTheme } from './palette';
import { setMaterialsNight } from './scene/materials';

const SKY = {
  day: { horizon: '#d6efff', overlay: '#e4f3ff', sky: '#2f92d8', clouds: '#fbfdff' },
  night: { horizon: '#1b2945', overlay: '#223352', sky: '#060b17', clouds: '#26314a' },
};
const SEA = {
  day: { color: '#4f8fc4', foam: '#ffffff' },
  night: { color: '#0d1b31', foam: '#2c4a69' },
};

export function isNight(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
}

/** Put the island in the site's current theme. */
export function applyTheme(scene: any, night = isNight()): void {
  const k = night ? 'night' : 'day';
  setPaletteTheme(k);
  setMaterialsNight(night ? 1 : 0);
  const sky = scene.sky?.mesh?.material?.uniforms;
  if (sky) {
    sky.uColorHorizon.value.set(SKY[k].horizon);
    sky.uColorHorizonOverlay.value.set(SKY[k].overlay);
    sky.uColorSky.value.set(SKY[k].sky);
    sky.uColorClouds.value.set(SKY[k].clouds);
    sky.uNight.value = night ? 1 : 0;
  }
  const sea = scene.sea?.mesh?.material?.uniforms;
  if (sea?.uColor) {
    sea.uColor.value.set(SEA[k].color);
    sea.uColorFoam?.value.set(SEA[k].foam);
  }
}

/** Follow the site's theme toggle (the data-theme attribute on <html>). */
export function watchTheme(scene: any): () => void {
  applyTheme(scene);
  const obs = new MutationObserver(() => applyTheme(scene));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}
