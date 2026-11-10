/* Lucide for interface controls; original artwork for the Nexus and GitHub marks. */
import { useId } from "react";
import { MARK, closedPath, ringFront } from "../lib/mark.ts";
export { ArrowRight, ArrowLeft, ArrowUpRight as External, Search as SearchIcon, X as Close, Copy as CopyIcon, Check, ChevronDown, List as ListIcon, Orbit, Globe2 as Globe, MapPin as Walk, ListFilter as Directory, Music2 as MusicNote, Keyboard } from "lucide-react";
type P = { size?: number; className?: string };

/** Animated bars retain the music control's reduced-motion behavior. */
export const SoundBars = ({ size = 20, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" focusable="false" className={className ? `sound-bars ${className}` : "sound-bars"}>
    <line x1="5" y1="9.5" x2="5" y2="14.5" />
    <line x1="9.67" y1="5.5" x2="9.67" y2="18.5" />
    <line x1="14.33" y1="8" x2="14.33" y2="16" />
    <line x1="19" y1="10" x2="19" y2="14" />
  </svg>
);

/** GitHub's mark (GitHub's Octicons, MIT License), for the link to the repository. */
export const GitHubMark = ({ size = 20, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
    <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
  </svg>
);

/** The Nexus mark: the core of the 3D world as an icon (lib/mark.ts has the geometry): a crystal
    in a geodesic cage, a ring that passes behind it and in front of it, and a glow. */
export function Mark({ size = 28, className }: P) {
  // Each mark on the page needs its own gradient ids.
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const { rx, ry, tilt } = MARK.ring;
  const ring = `rotate(${tilt} 32 32)`;
  const accent = { stroke: "var(--accent)" };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="32" cy="32" r="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--orb-glow)", stopOpacity: 0.6 }} />
          <stop offset="0.45" style={{ stopColor: "var(--accent)", stopOpacity: 0.16 }} />
          <stop offset="0.8" style={{ stopColor: "var(--violet)", stopOpacity: 0.07 }} />
          <stop offset="1" style={{ stopColor: "var(--violet)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`${id}-crystal`} x1="32" y1="18" x2="32" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--orb-bright)", stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: "var(--orb-deep)", stopOpacity: 0.95 }} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id}-glow)`} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="32" cy="32" rx={rx} ry={ry} transform={ring} style={accent} strokeWidth={3} />
        <path d={closedPath(MARK.cage) + closedPath(MARK.struts)} style={{ stroke: "var(--violet)" }} strokeWidth={1.8} strokeOpacity={0.85} />
        <path d={closedPath(MARK.crystal)} fill={`url(#${id}-crystal)`} style={accent} strokeWidth={3} />
        <path d={closedPath(MARK.facet)} style={{ stroke: "var(--orb-facet)" }} strokeWidth={2.2} />
        <path d={ringFront()} transform={ring} style={accent} strokeWidth={3} />
      </g>
    </svg>
  );
}
