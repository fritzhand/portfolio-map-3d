/* The kit gallery: open /?kit to see every model the walk world is built from (models.ts), one at a
   time on a turntable, lit and colored the way the island draws it, in the light or the dark theme.
   /?kit=<id> opens one (the ids are in models.ts). For people building their own world from the
   example: find a model, see which file builds it, change it and watch it here. */
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useTheme } from "../../components/TopBar";
import { hashString, seededRandom } from "../../data/layout";
import { SITE } from "../../site";
import { createToonShared } from "../../three/toon";
import type { Part } from "../walk/kit";
import { readScenePalette, watchScenePalette, type ScenePalette } from "../walk/palette";
import { SEA_LEVEL } from "../walk/terrain";
import { merge, paint, prefersReducedMotion } from "../walk/util";
import { SUN_DIR, kitMaterials, sceneLights } from "../walk/world";
import { KIT, KIT_GROUPS, type KitEntry } from "./models";
import "./kit.css";

/** The entry the URL asks for (?kit=<id>), or the first. */
function fromUrl(): KitEntry {
  const id = new URLSearchParams(window.location.search).get("kit");
  return KIT.find((e) => e.id === id) ?? KIT[0];
}

interface Moving {
  turn?: { mesh: THREE.Mesh; axis: "y" | "z"; speed: number; rest: number };
  boats: { mesh: THREE.Mesh; sink: number; bob: readonly [number, number]; roll: readonly [number, number] }[];
}

/** One model on its patch of ground, with the island's light; frames the camera on it. */
function Stage({ entry, palette, reduced }: { entry: KitEntry; palette: ScenePalette; reduced: boolean }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const moving = useRef<Moving>({ boats: [] });

  useEffect(() => {
    const owned: { dispose(): void }[] = [];
    const own = <T extends { dispose(): void }>(x: T) => {
      owned.push(x);
      return x;
    };
    const toon = createToonShared(null);
    toon.cloudStrength.value = 0;
    const mats = kitMaterials(palette, toon);
    const prop = own(mats.prop());
    const root = new THREE.Group();
    const model = entry.build(palette, seededRandom(hashString(entry.id)));
    const add = (parts: Part[] | undefined, material: THREE.Material, shadow: boolean) => {
      if (!parts?.length) return null;
      const mesh = new THREE.Mesh(own(merge(parts)), material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };
    // Loose things stand where they are: the gallery's ground is level.
    add([...model.parts, ...(model.loose ?? []).flatMap((l) => l.parts)], prop, true);
    add(model.glass, own(mats.glass()), false);
    add(model.panes, own(mats.panes()), false);
    add([...(model.lit ?? []), ...(model.loose ?? []).flatMap((l) => l.lit ?? [])], own(mats.lit()), false);
    const next: Moving = { boats: [] };
    if (model.turn) {
      const mesh = add(model.turn.parts, prop, true)!;
      mesh.position.copy(model.turn.at);
      next.turn = { mesh, axis: model.turn.axis, speed: model.turn.speed, rest: model.turn.rest };
    }
    for (const b of model.afloat ?? []) {
      const mesh = add(b.parts, prop, true)!;
      mesh.position.set(b.x, SEA_LEVEL - b.sink, b.z);
      mesh.rotation.y = b.yaw;
      next.boats.push({ mesh, sink: b.sink, bob: b.bob, roll: b.roll });
    }
    moving.current = next;

    // Frame the model (before its ground goes in).
    const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
    const r = Math.max(1.2, sphere.radius);
    const groundR = Math.max(10, r * 1.9);
    const disc = (radius: number, color: THREE.Color, y: number, z = 0) => {
      const mesh = new THREE.Mesh(own(paint(new THREE.CircleGeometry(radius, 72).rotateX(-Math.PI / 2).translate(0, y, z), color)), prop);
      mesh.receiveShadow = true;
      root.add(mesh);
    };
    if (entry.coast) {
      // Sand down to the water's edge a little in front of it, the shallows beyond.
      disc(groundR, palette.sand, -0.02, 7 - groundR);
      disc(groundR * 1.8, palette.seaShallow, SEA_LEVEL);
    } else {
      disc(groundR, palette.grass, -0.02);
    }
    const { hemi, sun } = sceneLights(palette, false);
    sun.position.copy(SUN_DIR).multiplyScalar(r * 3 + 30).add(sphere.center);
    sun.target.position.copy(sphere.center);
    const shadow = sun.shadow.camera;
    shadow.left = shadow.bottom = -r * 1.5;
    shadow.right = shadow.top = r * 1.5;
    shadow.near = 1;
    shadow.far = r * 6 + 80;
    shadow.updateProjectionMatrix();
    root.add(hemi, sun, sun.target);
    scene.add(root);

    const dist = (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.02;
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.75, 0.5, 1).normalize().multiplyScalar(dist));
    camera.near = Math.max(0.05, dist / 200);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(sphere.center);
      controls.update();
    }
    return () => {
      scene.remove(root);
      sun.shadow.map?.dispose();
      for (const d of owned) d.dispose();
    };
  }, [entry, palette, scene, camera, controls]);

  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    const { turn, boats } = moving.current;
    if (turn) turn.mesh.rotation[turn.axis] = reduced ? turn.rest : t * turn.speed;
    for (const b of boats) {
      b.mesh.position.y = SEA_LEVEL - b.sink + Math.sin(t * b.bob[1]) * b.bob[0];
      b.mesh.rotation.z = Math.sin(t * b.roll[1]) * b.roll[0];
    }
  });
  return null;
}

export default function KitView() {
  const [entry, setEntry] = useState(fromUrl);
  const [palette, setPalette] = useState(readScenePalette);
  const [theme, toggleTheme] = useTheme();
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const index = KIT.indexOf(entry);

  useEffect(() => watchScenePalette((p) => setPalette({ ...p })), []);
  useEffect(() => {
    document.title = `${entry.title} · Walk world kit · ${SITE.map.title}`;
    const url = new URL(window.location.href);
    url.searchParams.set("kit", entry.id);
    window.history.replaceState(null, "", url);
  }, [entry]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setEntry((cur) => KIT[(KIT.indexOf(cur) + 1) % KIT.length]);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setEntry((cur) => KIT[(KIT.indexOf(cur) - 1 + KIT.length) % KIT.length]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const back = new URL(window.location.href);
  back.search = "?view=walk";

  return (
    <div className="kit">
      <aside className="kit-side">
        <header className="kit-head">
          <h1>Walk world kit</h1>
          <p>Every model the walk world is built from, drawn the way the island draws it. Drag to turn it, scroll or pinch to zoom; the arrow keys step through the list.</p>
          <div className="kit-actions">
            <button type="button" className="kit-btn" onClick={toggleTheme} aria-pressed={theme === "dark"}>
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
            <a className="kit-btn" href={back.toString()}>
              Back to the walk
            </a>
          </div>
        </header>
        <nav aria-label="Models">
          {KIT_GROUPS.map((group) => (
            <section key={group} className="kit-group">
              <h2>{group}</h2>
              <ul>
                {KIT.filter((e) => e.group === group).map((e) => (
                  <li key={e.id}>
                    <button type="button" className="kit-item" aria-current={e === entry ? "true" : undefined} onClick={() => setEntry(e)}>
                      {e.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>
      <main className="kit-stage">
        <Canvas flat shadows dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ fov: 35, position: [12, 8, 16] }}>
          <Stage entry={entry} palette={palette} reduced={reduced} />
          <OrbitControls makeDefault enableDamping autoRotate={!reduced} autoRotateSpeed={0.6} maxPolarAngle={Math.PI * 0.49} />
        </Canvas>
        <div className="kit-caption">
          <span className="kit-count">
            {index + 1} / {KIT.length}
          </span>
          <strong>{entry.title}</strong>
          <code>
            src/views/walk/{entry.source} · {entry.id}
          </code>
        </div>
      </main>
    </div>
  );
}
