/* The map's place in the Portfolio Map Network (federation/protocol.ts, docs/network.md).

   Every map built on this framework links to the Nexus, the shared world where every map in the
   network is a world of its own. That link is the network's one requirement, so the framework
   draws it in three places that are not configurable: the walk world's portal on the plaza, the
   top bar's Nexus button and the About panel. The build also writes the map's manifest
   (/portfolio-map.json) and a meta tag naming the Nexus, which the Nexus checks before it shows
   the map. */
import { ACCEPTED_NEXUS_URLS, NEXUS_URL, cameFromNexus, nexusHref, onThisDeployment } from "../federation/protocol.ts";
import { SITE } from "./site";

export { NEXUS_URL };

declare const __LINK_THIS_DEPLOYMENT__: boolean;

/**
 * The Nexus this map's links open. A map published on the Nexus's own site (the example map) is
 * deployed with the Nexus, so in a preview build (vite.config.ts linkThisDeployment) it opens the
 * preview's own Nexus. Every other map, and every production build, opens the Nexus itself.
 */
const NEXUS_BASE =
  __LINK_THIS_DEPLOYMENT__ && typeof window !== "undefined" && ACCEPTED_NEXUS_URLS.includes(new URL(SITE.map.url).origin)
    ? onThisDeployment(NEXUS_URL, window.location.href)
    : NEXUS_URL;

/** The Nexus, opened at this map's world. */
export const NEXUS_HREF = nexusHref(SITE.network.id, "link", NEXUS_BASE);

/** The Nexus, as the walk world's portal opens it (the Nexus plays its arrival for a portal). */
export const PORTAL_HREF = nexusHref(SITE.network.id, "portal", NEXUS_BASE);

/** Did this visit start in the Nexus? (Read once at load: the URL sync drops `from` afterwards.) */
export const ARRIVED_FROM_NEXUS = typeof window !== "undefined" && cameFromNexus(window.location.search);

/** The network's name, as the interface says it. */
export const NETWORK_NAME = "Portfolio Map Network";
