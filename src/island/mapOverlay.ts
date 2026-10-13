// @ts-nocheck
// The map overlay on the generated island (mapWorld.ts): the Nexus portal's curtain and card, the
// picking and meeting of every company's totem and person's post (mapWorld.buildSpots), and the HUD
// on top of the canvas. Everything stands where the plan (mapLayout.ts) says, at the ground's own
// height (mapGround.islandHeight via scene.groundY). The only shader is the portal's curtain
// (adapted from src/views/walk/portal.ts to three r148).
//
// The HUD (island.css): a chip over each district's mast that never stacks on another
// (mapLabels.placeChips) and hops there on a click; the minimap (mapMinimap.ts), which hops too;
// a pill naming the district you are in; the meet prompt near a pin; the portal card in front of
// the portal; the sound toggle; a short hint. Words come from the site's labels (src/site.ts).

import {
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  BoxGeometry,
  Raycaster,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { LocateFixed, Minus, Plus, Users } from 'lucide-react';
import { DistrictIcon } from '../components/bits';
import { client } from './core/client';
import { events } from './core/events';
import { clock } from './engine/clock';
import { labelTexture } from '../three/logoTexture';
import { cpuCanvas } from '../three/cpuCanvas';
/** The pylon behind each district (art/assets/campus.py): the chips hang over its top. */
const MAST_HEIGHT = 11.65;
import { PORTAL_R, clusterAt, hopTargets, kidTheta, type ClusterPlan, type HopTarget, type MapPlan } from './mapLayout';
import { VIEW_MARGIN, inkOn, placeChips, screenBox, type ChipInput, type Occluder, type Rect } from './mapLabels';
import { buildMinimap } from './mapMinimap';
import { islandCatalog } from './catalogFor';
import { L, count } from '../site';
import { useStore } from '../state/store';
import { PORTAL_HREF } from '../network';
import type { Company, Person } from '../data/types';
import './island.css';

interface Pin {
  slug: string;
  district: string;
  isPerson: boolean;
  x: number;
  y: number;
  z: number;
  color: string;
}

/** Canvas textures are sRGB art; flag them so the r148 renderer decodes them. */
function srgb<T>(tex: T): T {
  (tex as any).encoding = 3001; // sRGBEncoding in r148
  return tex;
}
function canvasTex(canvas: HTMLCanvasElement) {
  const t = new CanvasTexture(canvas);
  t.anisotropy = 4;
  return srgb(t);
}

/** A district's icon (or the people icon) as static SVG markup, rendered once with the site's own icon set. */
const iconCache = new Map<string, string>();
function iconMarkup(c: Pick<ClusterPlan, 'slug' | 'isPeople'>, size: number): string {
  const key = `${c.slug}|${size}`;
  let html = iconCache.get(key);
  if (html == null) {
    const host = document.createElement('div');
    const root = createRoot(host);
    flushSync(() => root.render(c.isPeople ? createElement(Users, { size, 'aria-hidden': true, strokeWidth: 2.2 }) : createElement(DistrictIcon, { slug: c.slug, size })));
    html = host.innerHTML;
    root.unmount();
    iconCache.set(key, html);
  }
  return html;
}

/** A lucide icon as static SVG markup. */
function lucideMarkup(Icon: any, size: number): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement(Icon, { size, 'aria-hidden': true })));
  const html = host.innerHTML;
  root.unmount();
  return html;
}

/** "12 companies" or "5 coaches", in the site's words. */
const tally = (c: ClusterPlan) => (c.isPeople ? count(c.count, L.person, L.people) : count(c.count, L.company, L.companies));

export interface MapOverlay {
  plan: MapPlan;
  /** Collision boxes for the hub pieces (monument, pylons, portal posts). */
  colliders: Array<{ w: number; h: number; d: number; x: number; z: number; ry: number }>;
  mountLayer(host: HTMLElement): void;
  setSelected(slug: string | null, isPerson: boolean): void;
  /** Hop the kid to a district, the portal or the plaza (by hop target id). */
  hop(id: string): void;
}

export function buildMapOverlay(scene: any): MapOverlay {
  const store = useStore.getState();
  const hooks = {
    onMeetCompany: (slug: string) => store.select(slug, { fly: false }),
    onMeetPerson: (slug: string) => store.selectPerson(slug, { fly: false }),
    goNexus: () => window.location.assign(PORTAL_HREF),
  };
  const plan: MapPlan = scene.plan;
  const groundY = (x: number, z: number): number => scene.groundY(x, z);
  const { companies: COMPANIES, people: PEOPLE } = islandCatalog();
  const companyBySlug = new Map(COMPANIES.map((c) => [c.slug, c]));
  const personBySlug = new Map(PEOPLE.map((p) => [p.slug, p]));
  const clusterBySlug = new Map(plan.clusters.map((c) => [c.slug, c]));
  const still = !!scene.still;
  const colliders: MapOverlay['colliders'] = [];

  const root = new Group();
  root.name = 'map-overlay';
  scene.add(root);
  const add = (parent: Object3D, child: Object3D, x = 0, y = 0, z = 0) => {
    child.position.set(x, y, z);
    parent.add(child);
    return child;
  };
  const shadowed = <T extends Mesh>(m: T): T => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // The monument, the hub's pylons and the portal's frame are campus models (mapWorld.buildPlaza);
  // the overlay keeps the portal's curtain, its glow and its card.
  const MONUMENT_TOP = 7.9;

  // ---- the Nexus portal's curtain of light (its frame: portal_frame) ----
  let curtainUniforms = { uTime: { value: 0 } };
  const PORTAL_TOP = 2 * PORTAL_R + 1.5;
  {
    const p = plan.portal;
    const gy = groundY(p.x, p.z);
    const g = new Group();
    g.position.set(p.x, gy, p.z);
    g.rotation.y = p.facing;
    root.add(g);
    const cy = PORTAL_R + 0.24;
    // Warm light curtain (GLSL adapted from the procedural portal: r148 uses encodings_fragment).
    curtainUniforms = { uTime: { value: 0 } };
    const curtain = new Mesh(
      new CircleGeometry(PORTAL_R - 0.16, 48).translate(0, cy, 0),
      new ShaderMaterial({
        uniforms: { ...curtainUniforms, uA: { value: new Color('#e9a56e') }, uB: { value: new Color('#cc7292') } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
          void main() {
            vec2 q = vUv - 0.5;
            float edge = 1.0 - smoothstep(0.88, 1.0, length(q) * 2.0);
            float drift = uTime * 0.13;
            float bend = sin(vUv.y * 4.2 + drift) * 0.09 + sin(vUv.y * 9.0 - drift * 0.7) * 0.025;
            float folds = sin((vUv.x + bend) * 29.0 + drift);
            float ribbons = pow(0.5 + 0.5 * folds, 3.0);
            float veil = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
            vec3 col = mix(uA, uB, smoothstep(0.12, 0.9, vUv.y));
            col = mix(col, vec3(1.0, 0.88, 0.73), ribbons * 0.32);
            float alpha = edge * (0.10 + veil * (0.15 + ribbons * 0.40));
            gl_FragColor = vec4(col, alpha);
            #include <encodings_fragment>
          }`,
      }),
    );
    curtain.renderOrder = 2;
    g.add(curtain);
    // Glow pad + nameplate.
    const [gc, gctx] = cpuCanvas(128, 128);
    const grad = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(238,171,117,0.30)');
    grad.addColorStop(1, 'rgba(238,171,117,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    add(g, new Mesh(new PlaneGeometry(PORTAL_R * 2.4, PORTAL_R * 1.7).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: canvasTex(gc), transparent: true, depthWrite: false, toneMapped: false })), 0, 0.08, 0);
  }

  // ---- pins: each company's totem and each person's post (mapWorld.buildSpots) ----
  const pins: Pin[] = scene.spots.list.map((p) => ({ slug: p.slug, district: p.district, isPerson: p.isPerson, x: p.x, y: groundY(p.x, p.z), z: p.z, color: p.color }));
  const pickables: Object3D[] = scene.spots.pickables;
  // A ring of light on the ground round the totem you are near or the one selected.
  const markerMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const marker = new Mesh(new RingGeometry(1.25, 1.5, 48).rotateX(-Math.PI / 2), markerMat);
  marker.renderOrder = 1;
  marker.visible = false;
  root.add(marker);
  const tmpColor = new Color();
  const showMarker = () => {
    const p = nearPin ?? (selected ? pins.find((q) => q.slug === selected.slug) : null);
    if (!p) {
      marker.visible = false;
      return;
    }
    marker.position.set(p.x, p.y + 0.18, p.z);
    markerMat.color.copy(tmpColor.set(p.color)).lerp(new Color('#ffffff'), 0.3);
    marker.visible = true;
  };

  // ---- hopping ----
  const targets = hopTargets(plan, { portal: 'Nexus portal', plaza: `${L.hub} plaza` });
  const targetById = new Map(targets.map((t) => [t.id, t]));
  const hop = (id: string) => {
    const t = targetById.get(id);
    const kid = scene.characters?.mesh;
    if (!t || !kid) return;
    const y = groundY(t.land.x, t.land.z) + 0.05;
    kid.snap([t.land.x, y, t.land.z]);
    const theta = kidTheta(t.land.facing);
    kid._localObject.spherical.theta = theta;
    kid._localObject.targetSpherical.theta = theta;
    // The camera turns with the kid and jumps with it, rather than sweeping across the island.
    const cam = scene.camera;
    cam.spherical.theta = theta;
    cam.sphericalTarget.theta = theta;
    cam.baseTarget?.set(t.land.x, y + 1.1, t.land.z);
    hint.classList.add('is-gone');
  };

  // ---- DOM ----
  const layer = document.createElement('div');
  layer.className = 'island-layer';
  if (still) layer.classList.add('is-still');

  // District chips over each mast.
  const chips = plan.clusters.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `walk-district-label island-chip${c.isPeople ? ' is-people' : ''}`;
    b.style.setProperty('--d', c.color);
    // Its full name, or on a phone its short one, over the count.
    b.innerHTML = `<span class="walk-district-icon" aria-hidden="true"></span><span class="walk-district-text"><strong><span class="island-long"></span><span class="island-short"></span></strong><span></span></span>`;
    const icon = b.querySelector('.walk-district-icon');
    icon.innerHTML = iconMarkup(c, 17);
    if (!c.isPeople) icon.style.color = inkOn(c.color);
    b.querySelector('.island-long').textContent = c.label;
    b.querySelector('.island-short').textContent = c.short;
    b.querySelector('.walk-district-text > span').textContent = tally(c);
    b.setAttribute('aria-label', `Hop to ${c.label}, ${tally(c)}`);
    b.addEventListener('click', () => hop(c.slug));
    layer.append(b);
    return { c, el: b, w: 150, h: 44, shown: false, x: NaN, y: NaN };
  });
  const measureChips = () => {
    for (const k of chips) {
      k.w = k.el.offsetWidth || k.w;
      k.h = k.el.offsetHeight || k.h;
    }
  };

  // Where you are: the district you stand in.
  const here = document.createElement('div');
  here.className = 'island-here';
  here.setAttribute('role', 'status');
  here.hidden = true;
  layer.append(here);
  const showHere = (c: ClusterPlan | null) => {
    if (!c) {
      here.hidden = true;
      return;
    }
    here.style.setProperty('--d', c.color);
    here.classList.toggle('is-people', c.isPeople);
    here.innerHTML = `<span class="walk-district-icon" aria-hidden="true"></span><span class="walk-district-text"><strong></strong><span></span></span>`;
    const icon = here.querySelector('.walk-district-icon');
    icon.innerHTML = iconMarkup(c, 15);
    if (!c.isPeople) icon.style.color = inkOn(c.color);
    here.querySelector('strong').textContent = c.label;
    here.querySelector('.walk-district-text > span').textContent = tally(c);
    here.hidden = false;
  };

  const prompt = document.createElement('button');
  prompt.type = 'button';
  prompt.className = 'walk-prompt island-prompt';
  prompt.hidden = true;
  layer.append(prompt);

  const portalCard = document.createElement('div');
  portalCard.className = 'walk-portal-card island-portal-card';
  portalCard.hidden = true;
  portalCard.innerHTML = `<strong>Through the portal to the Nexus</strong><p class="walk-portal-what">The shared world of every map in the network.</p><div class="walk-portal-actions"><button type="button" class="btn btn-primary">Go now</button><button type="button" class="btn btn-quiet">Stay here</button></div>`;
  const [goBtn, stayBtn] = portalCard.querySelectorAll('button');
  let portalCooldownUntil = 0;
  let portalCardH = 200;
  const narrow = window.matchMedia('(max-width: 760px)');
  narrow.addEventListener?.('change', () => portalCard.style.removeProperty('transform'));
  goBtn.addEventListener('click', () => hooks.goNexus());
  stayBtn.addEventListener('click', () => {
    portalCard.hidden = true;
    portalCooldownUntil = performance.now() + 20000;
  });
  layer.append(portalCard);

  // Sound toggle (the town's audio starts on first interaction, muted).
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'walk-pill island-sound';
  soundBtn.textContent = 'Sound: off';
  soundBtn.addEventListener('click', () => events.emit('webgl_audio_mute_toggle'));
  events.on('webgl_audio_update_mute', (muted: boolean) => {
    soundBtn.textContent = muted ? 'Sound: off' : 'Sound: on';
  });
  layer.append(soundBtn);

  // One-line explainer; it fades after a while, or at the first hop.
  const hint = document.createElement('div');
  hint.className = 'walk-hint island-hint';
  hint.textContent =
    client.device === 'mobile'
      ? `Tap a ${L.district}'s name or the map to hop there · walk up to a pin to meet`
      : `Click a ${L.district}'s name or the map to hop there · hold Shift to run · walk up to a pin to meet`;
  layer.append(hint);
  window.setTimeout(() => hint.classList.add('is-gone'), 18000);

  // The minimap.
  const minimap = buildMinimap(plan, targets, {
    title: 'Map',
    hopLabel: (t: HopTarget) => (t.kind === 'district' ? `Hop to ${t.label}, ${tally(clusterBySlug.get(t.id))}` : `Hop to the ${t.label}`),
    onHop: (t: HopTarget) => hop(t.id),
  });
  // The minimap and, under it, the camera's buttons: zoom in, zoom out, back behind you.
  const corner = document.createElement('div');
  corner.className = 'island-corner';
  corner.append(minimap.el);
  const camBtns = document.createElement('div');
  camBtns.className = 'walk-cam-btns';
  for (const [label, title, icon, act] of [
    ['Zoom in', 'Zoom in', Plus, () => scene.camera?.zoomBy(0.8)],
    ['Zoom out', 'Zoom out', Minus, () => scene.camera?.zoomBy(1.25)],
    ['Recenter the camera behind you', 'Recenter', LocateFixed, () => scene.camera?.recenter()],
  ] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'walk-icon-btn';
    b.setAttribute('aria-label', label);
    b.title = title;
    b.innerHTML = lucideMarkup(icon, 18);
    b.addEventListener('click', () => act());
    camBtns.append(b);
  }
  corner.append(camBtns);
  layer.append(corner);

  // A HUD button clicked with the mouse or a finger gives its focus back, so Enter keeps meeting
  // pins (keyboard focus, from Tab, stays where it is).
  layer.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest?.('button');
    if (b && e.detail > 0) window.setTimeout(() => b.blur(), 0);
  });

  const mountLayer = (host: HTMLElement) => {
    if (layer.parentNode !== host) host.append(layer);
    measureChips();
  };
  window.addEventListener('resize', () => {
    measureChips();
    reservedAge = Infinity;
  });

  // ---- picking ----
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let nearPin: Pin | null = null;
  let selected: { slug: string; isPerson: boolean } | null = null;
  const playerPos = (): Vector3 | null => scene.characters?.mesh?._localObject?.position ?? null;
  const meet = (p: Pin) => (p.isPerson ? hooks.onMeetPerson : hooks.onMeetCompany)(p.slug);

  events.on('touch_click', (touch: any) => {
    if (!touch || !scene.camera) return;
    ndc.set(touch.position01.x * 2 - 1, touch.position01.y * 2 - 1);
    raycaster.setFromCamera(ndc as any, scene.camera);
    // The first thing under the pointer: a totem's screen or body, or something standing in front of it.
    const hit = raycaster.intersectObjects([...pickables, ...(scene.blockers ?? [])], false)[0];
    const i = hit ? scene.spots.pick(hit) : -1;
    if (i >= 0) meet(pins[i]);
  });

  // Enter meets the nearby pin (the prompt's hint). Ignored while typing.
  events.on('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !nearPin) return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'BUTTON' || ae.isContentEditable || ae.closest('.sheet, .panel'))) return;
    e.preventDefault();
    meet(nearPin);
  });

  // ---- per frame ----
  const projV = new Vector3();
  const project = (x: number, y: number, z: number) => {
    projV.set(x, y, z).project(scene.camera);
    return { x: (projV.x * 0.5 + 0.5) * client.screen.w, y: (-projV.y * 0.5 + 0.5) * client.screen.h, front: projV.z < 1 && projV.z > -1, ndcX: projV.x, ndcY: projV.y };
  };
  /** The corners of a box turned `facing` about its middle (cx, cz), `halfW` across, `halfD` deep, from y0 to y1, projected. */
  const boxCorners = (cx: number, cz: number, facing: number, halfW: number, halfD: number, y0: number, y1: number) => {
    const out = [];
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    for (const lx of [-halfW, halfW]) for (const lz of [-halfD, halfD]) for (const y of [y0, y1]) out.push(project(cx + lx * c + lz * s, y, cz - lx * s + lz * c));
    return out;
  };
  const camDist = (x: number, y: number, z: number) => scene.camera.position.distanceTo(projV.set(x, y, z));
  const monumentY = groundY(plan.monument.x, plan.monument.z);
  const portalY = groundY(plan.portal.x, plan.portal.z);
  const anchorY = new Map(plan.clusters.map((c) => [c.slug, groundY(c.mast.x, c.mast.z) + MAST_HEIGHT + 1.2]));

  // The HUD's own boxes, which no chip covers; refreshed when they change, and now and then.
  let reserved: Rect[] = [];
  let reservedAge = Infinity;
  // The engine draws at the window's size from the layer's top-left; the layer shows the part in view.
  let viewSize = { w: client.screen.w, h: client.screen.h };
  const refreshReserved = () => {
    const base = layer.getBoundingClientRect();
    if (base.width && base.height) viewSize = { w: Math.min(base.width, client.screen.w), h: Math.min(base.height, client.screen.h) };
    reserved = [];
    for (const el of [minimap.el, camBtns, soundBtn, prompt, portalCard, here, hint]) {
      if (el.hidden || el.classList.contains('is-gone') || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) reserved.push({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    }
    reservedAge = 0;
  };
  const watchHidden = new MutationObserver(() => {
    reservedAge = Infinity;
  });
  for (const el of [minimap.el, prompt, portalCard, here, hint]) watchHidden.observe(el, { attributes: true, attributeFilter: ['hidden', 'class'], subtree: el === minimap.el });

  let previous = new Map<string, number>();
  let lastChips: unknown = null;
  let currentCluster: ClusterPlan | null = null;
  let frame = 0;

  scene.beforeRenderCbs.push(() => {
    frame++;
    if (!still) curtainUniforms.uTime.value = clock.time;
    const player = playerPos();
    const kid = scene.characters?.mesh?._localObject;

    // Nearest pin → meet prompt.
    let best: Pin | null = null;
    let bestD = 4.2;
    if (player) {
      for (const p of pins) {
        const d = Math.hypot(player.x - p.x, player.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    if (best !== nearPin) {
      nearPin = best;
      showMarker();
      if (nearPin) {
        const holder = nearPin.isPerson ? personBySlug.get(nearPin.slug) : companyBySlug.get(nearPin.slug);
        prompt.innerHTML = '';
        const dot = document.createElement('span');
        dot.className = 'walk-dot';
        dot.style.background = nearPin.color;
        const name = document.createElement('span');
        name.textContent = `Meet ${(holder as any)?.name ?? nearPin.slug}`;
        const kbd = document.createElement('kbd');
        kbd.textContent = 'Enter';
        prompt.append(dot, name, kbd);
        prompt.hidden = false;
        const p = nearPin;
        prompt.onclick = () => meet(p);
      } else {
        prompt.hidden = true;
        prompt.onclick = null;
      }
    }

    if (player) {
      // Which district you stand in: its pill shows, its chip steps aside, the map rings it.
      const inside = clusterAt(plan, player.x, player.z);
      if (inside !== currentCluster) {
        currentCluster = inside;
        showHere(inside);
        minimap.setCurrent(inside?.slug ?? null);
      }
      minimap.update(player.x, player.z, kid?.spherical?.theta ?? 0);

      // The portal card, when you stand in front of the portal (and not just after "Stay here").
      const q = plan.portal;
      const dx = player.x - q.x;
      const dz = player.z - q.z;
      const ahead = dx * Math.sin(q.facing) + dz * Math.cos(q.facing);
      const across = dx * Math.cos(q.facing) - dz * Math.sin(q.facing);
      const inFront = ahead > -0.5 && ahead < 7.5 && Math.abs(across) < PORTAL_R + 2;
      const show = inFront && performance.now() >= portalCooldownUntil;
      if (portalCard.hidden === show) {
        portalCard.hidden = !show;
        if (show) portalCardH = portalCard.offsetHeight;
      }
      // Over the portal, kept inside the view; on a phone it docks at the bottom instead (island.css).
      if (show && !narrow.matches) {
        const s = project(q.x, portalY + PORTAL_TOP + 0.6, q.z);
        const half = Math.min(210, client.screen.w / 2 - 12);
        const x = Math.min(Math.max(s.x, half + 12), client.screen.w - half - 12);
        portalCard.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${Math.max(portalCardH + 12, s.y).toFixed(1)}px)`;
      }
    }

    // District chips: projected over each mast, placed so none stacks, skips the HUD or covers a nearer landmark.
    if (reservedAge++ > 45) refreshReserved();
    if (frame % 120 === 1) measureChips();
    const view = viewSize;
    const inputs: ChipInput[] = chips.map((k) => {
      const c = k.c;
      const y = anchorY.get(c.slug);
      const s = project(c.mast.x, y, c.mast.z);
      // The follow camera looks a little down, so a near mast's top can be above the view while
      // the mast stands in it: its chip then waits at the top edge, right over the mast.
      const inX = s.front && Math.abs(s.ndcX) < 1.02;
      const top = VIEW_MARGIN + k.h;
      const ay = inX && s.ndcY > 1 ? top : s.y;
      const onScreen = inX && s.ndcY > -1.02 && c !== currentCluster;
      return { id: c.slug, x: s.x, y: ay, depth: camDist(c.mast.x, y, c.mast.z), onScreen, w: k.w, h: k.h };
    });
    // Landmarks a chip from farther off must not cover: the monument's shaft and plinth, the portal's
    // ring, and each mast's banner (its own chip included, so a chip never hides the name it repeats).
    // A box reaching behind the camera is left out (it is beside the camera, not in the view).
    const occluders: Occluder[] = [];
    const occlude = (corners: ReturnType<typeof boxCorners>, depth: number) => {
      if (!corners.every((p) => p.front)) return;
      const box = screenBox(corners);
      if (box) occluders.push({ ...box, depth });
    };
    const m = plan.monument;
    const monDepth = camDist(m.x, monumentY + 3, m.z);
    occlude(boxCorners(m.x, m.z, m.facing, 0.9, 0.9, monumentY + 1.5, monumentY + MONUMENT_TOP), monDepth);
    occlude(boxCorners(m.x, m.z, m.facing, 2.7, 2.7, monumentY, monumentY + 1.6), monDepth);
    const q = plan.portal;
    occlude(boxCorners(q.x, q.z, q.facing, PORTAL_R + 0.3, 0.3, portalY, portalY + PORTAL_TOP), camDist(q.x, portalY + PORTAL_R, q.z));
    for (const c of plan.clusters) {
      const top = anchorY.get(c.slug) - 1.2;
      occlude(boxCorners(c.mast.x, c.mast.z, c.mast.facing, 1.0, 0.6, top - 7, top + 0.3), camDist(c.mast.x, top - 3, c.mast.z) - 1);
    }
    const spots = placeChips(inputs, { view, reserved, occluders, previous });
    lastChips = { inputs, occluders, reserved, spots };
    const placed = new Map(spots.map((s) => [s.id, s]));
    previous = new Map(spots.map((s) => [s.id, s.slot]));
    for (const k of chips) {
      const s = placed.get(k.c.slug);
      if (s) {
        const x = Math.round(s.x * 2) / 2;
        const y = Math.round(s.y * 2) / 2;
        if (x !== k.x || y !== k.y) {
          k.el.style.transform = `translate(${x}px,${y}px)`;
          k.x = x;
          k.y = y;
        }
      }
      if (!!s !== k.shown) {
        k.shown = !!s;
        k.el.classList.toggle('is-shown', k.shown);
        k.el.tabIndex = k.shown ? 0 : -1;
        if (k.shown) k.el.removeAttribute('aria-hidden');
        else k.el.setAttribute('aria-hidden', 'true');
      }
    }
  });

  const api: MapOverlay = {
    plan,
    colliders,
    mountLayer,
    hop,
    debugChips: () => lastChips,
    setSelected(slug, isPerson) {
      selected = slug ? { slug, isPerson } : null;
      showMarker();
    },
  };
  const syncSelection = () => {
    const s = useStore.getState();
    api.setSelected(s.selected ?? s.person, s.selected == null && s.person != null);
  };
  syncSelection();
  useStore.subscribe(syncSelection);
  return api;
}
