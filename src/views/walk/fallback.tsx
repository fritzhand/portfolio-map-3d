/* What both walk worlds share when the 3D world cannot run: the WebGL probe, the error boundary
   and the card that sends the visitor to the list instead. */
import { Component, type ReactNode } from "react";
import { useStore } from "../../state/store";

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return false;
    // Release the probe's context now rather than at garbage collection: browsers cap how many
    // WebGL contexts a page may hold, and every walk visit runs this check.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Whether an error is a world's code failing to download (a dropped connection), not the device failing to draw. */
export function isLoadFailure(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /ChunkLoadError|dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch/i.test(text);
}

/**
 * A world that fails to start shows a card instead of taking the page down: the WebGL card when the
 * device cannot draw it, a reload card when its code failed to download (a lazy import that failed
 * stays failed until the page reloads).
 */
export class WalkBoundary extends Component<{ children: ReactNode }, { failed: null | "load" | "draw" }> {
  state: { failed: null | "load" | "draw" } = { failed: null };
  static getDerivedStateFromError(err: unknown) {
    return { failed: isLoadFailure(err) ? "load" : "draw" };
  }
  componentDidCatch(err: unknown) {
    console.error("Walkable world failed to start:", err);
  }
  render() {
    if (this.state.failed === "load") return <WalkLoadFailed />;
    return this.state.failed ? <WalkFallback /> : this.props.children;
  }
}

function WalkLoadFailed() {
  const setView = useStore((s) => s.setView);
  return (
    <div className="view walk-view walk-fallback">
      <div className="walk-card walk-fallback-card">
        <h2>The walkable world did not load</h2>
        <p>Its files could not be downloaded, which is usually the connection. Reload to try again; every company and every person is also in the list view.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>{" "}
        <button type="button" className="btn btn-quiet" onClick={() => setView("list")}>
          Open the company list
        </button>
      </div>
    </div>
  );
}

export function WalkFallback() {
  const setView = useStore((s) => s.setView);
  return (
    <div className="view walk-view walk-fallback">
      <div className="walk-card walk-fallback-card">
        <h2>The walkable world needs WebGL</h2>
        <p>This browser or device can't draw the 3D world. Every company and every person is in the list view, with the same details.</p>
        <button type="button" className="btn btn-primary" onClick={() => setView("list")}>
          Open the company list
        </button>
      </div>
    </div>
  );
}
