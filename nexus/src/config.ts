/* What the Nexus's operators configure: the hero's audience words and the "Who it's for" section
   on the landing page, the "Services" section (a paid setup service, at #built-for-you) and the
   network's promo video. Edit the values here; the page renders whatever they say, in the third
   person.

   - HERO_WORDS: "Explore the ___ universe." The first word is the one screen readers hear and the
     one shown with reduced motion; the rest roll up after it, in order.
   - AUDIENCES: who uses a map, each with the maps in the network that show it (world ids; a world
     not in the network is left out) or a link to the service that builds it.

   - provider: who offers it; null names "the maintainers of portfolio-map-3d".
   - intake: where "Request a setup" goes: an email address (the button opens an email with the
     request's questions filled in) or an https form (a GitHub issue form is public, and the page
     says so).
   - note: one optional sentence, added to the short note beside "Request a setup".
   - packages: a price of null reads "Quoted per organization" (one line for all of them when no
     package has a price); a checkoutUrl adds a "Book" button; an add-on (addon: true) comes after
     the packages, across the row; exampleHref adds a "See an example" link (an https page, or
     "#video" for the promo video on this page). */
/** "Explore the ___ universe.": one lowercase word each, short enough to keep the line whole. */
export const HERO_WORDS: readonly string[] = ["company", "startup", "portfolio", "vendor"];

export interface Audience {
  /** Lowercase letters, digits and hyphens; picks its icon on the landing page. */
  id: string;
  name: string;
  summary: string;
  /** Maps in the network that show this use, by world id; shown only while they are in the network. */
  examples: string[];
  /** A service package (its id) that builds this kind of map, linked under the summary; or null. */
  service: string | null;
}

export const AUDIENCES: Audience[] = [
  {
    id: "accelerators",
    name: "Accelerators and incubators",
    summary: "Each cohort by track or program, as a globe, a walkable world and a directory.",
    examples: ["ambition-accelerated", "venturestudio"],
    service: null,
  },
  {
    id: "funds",
    name: "Funds and angel groups",
    summary: "A portfolio by sector or fund, for founders, co-investors and partners to explore.",
    examples: [],
    service: null,
  },
  {
    id: "hubs",
    name: "Hubs and regions",
    summary: "A hub's members, or a region's startups and support organizations, by district.",
    examples: ["embarc-collective", "florida-ecosystem-map", "india-ecosystem-map", "startup-usa-guide"],
    service: null,
  },
  {
    id: "events",
    name: "Conferences and summits",
    summary: "The event's floor plan as a walkable world, with a booth for each exhibitor, sponsor and vendor.",
    examples: [],
    service: "event-world",
  },
];

export interface WhiteGlovePackage {
  /** Lowercase letters, digits and hyphens. */
  id: string;
  name: string;
  summary: string;
  includes: string[];
  /** As it should read ("From $2,000"), or null: "Quoted per organization". */
  price: string | null;
  /** An https checkout or booking page for this package, or null. */
  checkoutUrl: string | null;
  /** Offered on top of any package rather than on its own. */
  addon: boolean;
  /** An example of the work: an https page, or a link within this page ("#video"); or null. */
  exampleHref: string | null;
}

/** Where requests go: an email address, or an https form. */
export type Intake = { email: string } | { url: string };

export interface WhiteGlove {
  provider: string | null;
  intake: Intake;
  note: string | null;
  packages: WhiteGlovePackage[];
}

export const WHITE_GLOVE: WhiteGlove = {
  provider: null,
  intake: { email: "jeremy@embarccollective.com" },
  note: null,
  packages: [
    {
      id: "setup",
      name: "Setup",
      summary: "Build and publish your map.",
      includes: [
        "Set your districts, labels and theme",
        "Import company data and record its sources",
        "Publish on your domain",
        "Join the network",
      ],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "custom-world",
      name: "Custom world",
      summary: "Setup with a walkable world in your branding.",
      includes: [
        "Place your building at the center",
        "Add live visitors on your Supabase project",
        "Create a preview image and favicon from your branding",
      ],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "event-world",
      name: "Event world",
      summary: "A conference or summit floor as a walkable world.",
      includes: [
        "Lay out halls, stages and booths from your floor plan",
        "Place each exhibitor, sponsor and vendor by its logo",
        "Find a booth by name or category",
        "Join the network as your event's map",
      ],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "care",
      name: "Updates",
      summary: "Keep your map current.",
      includes: ["Add companies on your schedule, with sources", "Update logos and descriptions", "Apply framework updates and recheck network access"],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "promo-video",
      name: "Map video",
      summary: "Show your map on your website and social channels.",
      includes: [
        "Record the walk view, a company and the Nexus portal",
        "Landscape 16:9 and vertical 9:16 videos, each with a cover image",
        "Use your map's names and counts in captions",
      ],
      price: null,
      checkoutUrl: null,
      addon: true,
      exampleHref: "#video",
    },
  ],
};

/**
 * The network's promo video, shown on the landing page under the hero, or null for none. The files
 * are served from elsewhere (they are not part of this repository); every URL is https.
 */
export interface PromoVideo {
  /** The 16:9 cut (MP4, H.264): the one the page plays. */
  src: string;
  /** The 9:16 cut, linked under the player for phones and social apps; or null. */
  portrait: string | null;
  /** The still shown until it plays (the cut's cover image). */
  poster: string;
  /** Its length, in whole seconds, as the section's title says it. */
  seconds: number;
  /** One line under the player: what it shows. */
  caption: string;
}

export const PROMO_VIDEO: PromoVideo | null = {
  src: "https://community.embarccollective.com/promo/nexus-16x9.mp4",
  portrait: "https://community.embarccollective.com/promo/nexus-9x16.mp4",
  poster: "https://community.embarccollective.com/promo/nexus-cover-16x9.jpg",
  seconds: 53,
  caption: "Filmed from the live sites: Ambition Accelerated's walkable Florida and its portal, the Nexus, and Embarc Collective's member globe. With music.",
};

/**
 * The music behind the floating button (bottom right, on the landing page and in the Nexus), or
 * null for no button: an MP3 in nexus/public/ (a path from the site's base), played on a loop at
 * `volume` (0 to 1). It never starts on its own, and nothing is fetched until the visitor presses
 * play.
 */
export interface Music {
  src: string;
  volume: number;
}

// The track is mastered at about -14 LUFS; half volume (-6 dB) keeps it under the page.
export const MUSIC: Music | null = { src: "music/ai-signal.mp3", volume: 0.5 };

/** Requests through GitHub are public: the page says so when the intake form is on github.com. */
export function isPublicGitHubForm(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com");
  } catch {
    return false;
  }
}

/** An email address as the intake accepts it: one address, no spaces, a dot in its domain. */
export const EMAIL_PATTERN = /^[^\s@<>()"',;:]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** The request's subject and questions, as the email opens with them. */
export const REQUEST_SUBJECT = "Map service request";
export const REQUEST_QUESTIONS = [
  "Organization and website:",
  "Service, if known:",
  "Number of companies or exhibitors:",
  "Company list or data source:",
  "Map domain:",
  "Target launch date:",
];

/** Where "Request a setup" points: a mailto link with the request filled in, or the form's address. */
export function intakeHref(intake: Intake): string {
  if ("url" in intake) return intake.url;
  const body = REQUEST_QUESTIONS.map((q) => `${q}\n\n`).join("");
  return `mailto:${intake.email}?subject=${encodeURIComponent(REQUEST_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
