/* The network snapshot: nexus/public/network.json, or the fictional sample with ?sample (the
   sample is a separate chunk, loaded only then). A preview build links the maps published with the
   Nexus on the deployment that serves it (servedFrom), so a preview opens its own copy of them. */
import { useEffect, useState } from "react";
import { buildNetwork, servedFrom, SnapshotError, type NetworkModel } from "../lib/network.ts";

declare const __LINK_THIS_DEPLOYMENT__: boolean;

export type NetworkState = { status: "loading" } | { status: "ready"; model: NetworkModel; sample: boolean } | { status: "error"; message: string };

export function useNetwork(sample: boolean, attempt: number): NetworkState {
  const [state, setState] = useState<NetworkState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    const load: Promise<unknown> = sample
      ? import("../sample.ts").then((m) => m.SAMPLE_NETWORK)
      : fetch(`${import.meta.env.BASE_URL}network.json`, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(`The network list could not be loaded (HTTP ${r.status}).`);
          return r.json();
        });
    load
      .then((snapshot) => {
        if (!alive) return;
        const model = buildNetwork(snapshot);
        setState({ status: "ready", model: __LINK_THIS_DEPLOYMENT__ ? servedFrom(model, window.location.href) : model, sample });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const message = e instanceof SnapshotError || (e instanceof Error && e.message.startsWith("The network")) ? e.message : "The network list could not be loaded.";
        setState({ status: "error", message });
      });
    return () => {
      alive = false;
    };
  }, [sample, attempt]);
  return state;
}
