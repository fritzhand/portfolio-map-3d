/* The walk world (src/island): the walker, camera, controls, light, grade and sound, in a
   world generated from the map's own layout (src/island/mapWorld.ts): a founding hub
   (monument, pylons, Nexus portal) on the plaza, one district per district plus the
   people area.

   This file only hosts the engine: a div for the canvas, a loader while the world
   boots. The engine is a module-level singleton: it boots once per
   page load. A persistent host div owns the canvas and the input listeners, and each
   React mount moves that div here, so StrictMode remounts and view switches keep working. */
import { useEffect, useRef, useState } from "react";

interface Boot {
  engine: { active: boolean; render(time: number, delta: number): void };
  mountLayer(host: HTMLElement): void;
}

let boot: Promise<Boot> | null = null;
let persistentHost: HTMLDivElement | null = null;

function bootOnce(): Promise<Boot> {
  if (!boot) {
    boot = (async () => {
      const { client } = await import("../../island/core/client");
      if (!client.capabilities.webgl) throw new Error("WebGL2 is not available in this browser.");
      const { gsap } = await import("gsap");
      const { CustomEase } = await import("gsap/CustomEase");
      gsap.registerPlugin(CustomEase);
      CustomEase.create("inOut1", "M0,0 C0.5,0 0.1,1 1,1");
      CustomEase.create("inOut2", "M0,0 C0.56,0 0,1 1,1");
      CustomEase.create("inOut3", "M0,0 C0.6,0 0,1 1,1");
      CustomEase.create("inOut4", "M0,0 C0.4,0 -0.06,1 1,1");
      const { engine } = await import("../../island/engine/globals");
      const { clock } = await import("../../island/engine/clock");
      const { MainController } = await import("../../island/scene/mainController");
      const { MapScene } = await import("../../island/mapWorld");
      persistentHost = document.createElement("div");
      persistentHost.style.position = "absolute";
      persistentHost.style.inset = "0";
      const safariDesktop = client.browser.name === "safari" && client.device === "desktop";
      engine.init({
        webglContainer: persistentHost,
        fingers: 2,
        contextMenu: false,
        DPR: safariDesktop ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
        adaptiveDPR: true,
      });
      engine.active = true;
      const controller = new MainController(() => new MapScene()) as unknown as {
        environment: { overlay: { mountLayer(host: HTMLElement): void } };
        ready: Promise<void>;
      };
      if (import.meta.env.DEV) (window as unknown as { __island?: unknown }).__island = { engine, controller };
      // Like the original main.ts: the loop runs from boot; readiness only releases the intro.
      clock.start((time, delta) => engine.render(time, delta));
      await controller.ready;
      // This is what fades the white intro photo into the world (MainController.playIntro waits on it).
      engine.initialSceneLoaded.resolve();
      return { engine, mountLayer: (host: HTMLElement) => controller.environment.overlay.mountLayer(host) };
    })();
    boot.catch(() => {
      boot = null;
      persistentHost = null;
    });
  }
  return boot;
}

export default function IslandWalk() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const host = hostRef.current;
        if (!host) return;
        const b = await bootOnce();
        if (!alive) return;
        // Move the persistent canvas host here (first mount appends, remounts re-append).
        if (persistentHost && persistentHost.parentNode !== host) host.append(persistentHost);
        b.mountLayer(host);
        b.engine.active = true;
        setReady(true);
      } catch (err) {
        console.error("IslandWalk failed to start:", err);
        if (alive) setFailed(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
      // Pause rendering while unmounted; the next mount resumes. The shared loop stays up.
      boot?.then((b) => {
        b.engine.active = false;
      }).catch(() => {});
    };
  }, []);

  return (
    <div className="view walk-view" role="region" aria-label="Walkable world">
      <div ref={hostRef} className="walk-canvas" style={{ position: "absolute", inset: 0 }} />
      {!ready && !failed && (
        <div className="walk-card walk-intro" style={{ position: "absolute", top: 16, left: 16 }}>
          <h2>Loading the town…</h2>
          <p>Fetching the models, textures and sound.</p>
        </div>
      )}
      {failed && (
        <div className="walk-card walk-intro" style={{ position: "absolute", top: 16, left: 16 }}>
          <h2>The town could not start</h2>
          <p>{failed}</p>
        </div>
      )}
    </div>
  );
}
