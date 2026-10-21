// Magazine covers and ad pages. The daily issue uses one of five cover
// layouts (chosen in Settings); each monthly issue picks one of ten designs
// and can add its own background photo, framed photos, colours, ribbon and
// cover story. Customised monthly covers can be saved as named presets.
// Ads are full A4 images from the ad library: the daily back cover, and in
// the monthly issue an ad after any section and a back cover. Pure helpers,
// shared by the server, the admin panel and tests.
import type { Bi } from "@/lib/current-affairs";

export const DAILY_LAYOUTS = [
  {
    id: "classic",
    name: "Classic",
    hint: "Today's cover: colour card, counts, top stories, contents",
  },
  { id: "band", name: "Side Band", hint: "A tall colour band with the title and date on the left" },
  {
    id: "lead",
    name: "Top Story First",
    hint: "The most important story in a big box, the rest below",
  },
  { id: "split", name: "Split", hint: "Top half in colour, bottom half white" },
  {
    id: "light",
    name: "Light",
    hint: "No filled colour, only lines: uses little ink when printed",
  },
] as const;
export type DailyLayout = (typeof DAILY_LAYOUTS)[number]["id"];

// frames: how many framed photos the design shows (min–max; 0 = none).
export const MONTHLY_DESIGNS = [
  {
    id: "classic",
    name: "Classic Plus",
    hint: "Today's cover over your blurred background",
    frames: [0, 0],
  },
  {
    id: "story",
    name: "Cover Story",
    hint: "One full-page photo with a big cover story headline",
    frames: [1, 1],
  },
  {
    id: "mosaic",
    name: "Mosaic",
    hint: "4–6 framed photos in a grid, title band across",
    frames: [4, 6],
  },
  { id: "polaroid", name: "Polaroids", hint: "3 tilted photos with captions", frames: [3, 3] },
  {
    id: "month",
    name: "Big Month",
    hint: "A giant month name, issue number and theme",
    frames: [0, 0],
  },
  {
    id: "journal",
    name: "Journal",
    hint: "A central theme in a bordered frame, like Yojana",
    frames: [1, 1],
  },
  {
    id: "sidebar",
    name: "Inside Sidebar",
    hint: "A tall photo with the “Inside” list down the left",
    frames: [1, 1],
  },
  {
    id: "faces",
    name: "Faces of the Month",
    hint: "4–6 round photos of people in the news",
    frames: [4, 6],
  },
  {
    id: "rajasthan",
    name: "Rajasthan Focus",
    hint: "A framed photo and the month's Rajasthan stories",
    frames: [1, 1],
  },
  {
    id: "exam",
    name: "Exam Pack",
    hint: "Bold badges, a ribbon and 2–3 framed photos",
    frames: [2, 3],
  },
] as const;
export type MonthlyDesign = (typeof MONTHLY_DESIGNS)[number]["id"];

export const designInfo = (id: string) =>
  MONTHLY_DESIGNS.find((d) => d.id === id) ?? MONTHLY_DESIGNS[0];

export type CoverPhoto = {
  url: string;
  path?: string;
  caption?: Bi;
  credit?: string;
};

// A monthly issue's cover. Empty fields fall back to the issue's own content
// (the cover story is the month's most important story) and the settings.
export type MonthlyCover = {
  design: MonthlyDesign;
  // Empty: the accent colour from Settings.
  color: string;
  color2: string;
  // The colour is used for the whole issue, or for the cover only.
  color_scope: "issue" | "cover";
  bg?: CoverPhoto | null;
  // How dark the blurred background is made (0–80 %) and how blurred (px).
  bg_dim: number;
  bg_blur: number;
  photos: CoverPhoto[];
  ribbon: Bi;
  cover_story: Bi;
  issue_no: string;
};

export const DEFAULT_COLOR2 = "#f59e0b";
export const MAX_COVER_PHOTOS = 6;

export const DEFAULT_MONTHLY_COVER: MonthlyCover = {
  design: "classic",
  color: "",
  color2: DEFAULT_COLOR2,
  color_scope: "issue",
  bg: null,
  bg_dim: 35,
  bg_blur: 18,
  photos: [],
  ribbon: { en: "", hi: "" },
  cover_story: { en: "", hi: "" },
  issue_no: "",
};

// A saved customised cover: the look, not this month's photos or words.
export type CoverPreset = {
  id: string;
  name: string;
  design: MonthlyDesign;
  color: string;
  color2: string;
  color_scope: "issue" | "cover";
  bg_dim: number;
  bg_blur: number;
  ribbon: Bi;
};
export const MAX_PRESETS = 200;

// An ad in the library: an A4 image, an optional Hindi version for the Hindi
// issue, and an optional link made clickable in the PDF.
export type MagazineAd = {
  id: string;
  name: string;
  url: string;
  path: string;
  url_hi?: string;
  path_hi?: string;
  link?: string;
  // "fill": cover the page (edges cropped); "fit": whole image, white bars.
  fit: "fill" | "fit";
};
export const MAX_ADS = 100;

// How a printed monthly issue is bound: a stapled booklet needs a multiple
// of 4 pages, glued or loose sheets an even number; "digital" adds nothing.
export type Binding = "booklet" | "even" | "digital";
export const BINDINGS: { id: Binding; name: string; hint: string }[] = [
  { id: "booklet", name: "Stapled booklet", hint: "Pages in fours (folded A3 sheets)" },
  { id: "even", name: "Glued, spiral or loose", hint: "An even number of pages" },
  { id: "digital", name: "Digital only", hint: "No pages added" },
];

// A monthly issue's choices, kept with the issue.
export type IssueDesign = {
  cover: MonthlyCover;
  // An ad page after sections, by section id ("" or missing: none).
  section_ads: Record<string, string>;
  back_cover: string;
};

export const DEFAULT_ISSUE_DESIGN: IssueDesign = {
  cover: DEFAULT_MONTHLY_COVER,
  section_ads: {},
  back_cover: "",
};

// Ruled notes pages to add before the back cover so the back cover lands on
// the outside: the whole issue, back cover included, in fours or even.
export function fillerPages(pages: number, binding: Binding): number {
  if (binding === "booklet") return (4 - (pages % 4)) % 4;
  if (binding === "even") return pages % 2;
  return 0;
}

const isColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const bi = (v: unknown, max: number): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: text(o.en, max), hi: text(o.hi, max) };
};
const num = (v: unknown, min: number, max: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
// Stored images are the storage's public URLs; the printed page only loads
// https ones. Ad links must be https.
const isUrl = (u: unknown): u is string =>
  typeof u === "string" && /^https?:\/\/[^\s"'<>]+$/.test(u);
const isLink = (u: unknown): u is string =>
  typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u);

function photo(v: unknown): CoverPhoto | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!isUrl(o.url)) return null;
  const p: CoverPhoto = { url: o.url };
  if (typeof o.path === "string" && o.path) p.path = o.path.slice(0, 300);
  const caption = bi(o.caption, 120);
  if (caption.en || caption.hi) p.caption = caption;
  const credit = text(o.credit, 80);
  if (credit) p.credit = credit;
  return p;
}

export function normalizeCover(v: unknown): MonthlyCover {
  const o = (v ?? {}) as Record<string, unknown>;
  const d = DEFAULT_MONTHLY_COVER;
  return {
    design: MONTHLY_DESIGNS.some((x) => x.id === o.design) ? (o.design as MonthlyDesign) : d.design,
    color: isColor(o.color) ? o.color : "",
    color2: isColor(o.color2) ? o.color2 : d.color2,
    color_scope: o.color_scope === "cover" ? "cover" : "issue",
    bg: photo(o.bg),
    bg_dim: num(o.bg_dim, 0, 80, d.bg_dim),
    bg_blur: num(o.bg_blur, 0, 40, d.bg_blur),
    photos: (Array.isArray(o.photos) ? o.photos : [])
      .map(photo)
      .filter((p): p is CoverPhoto => !!p)
      .slice(0, MAX_COVER_PHOTOS),
    ribbon: bi(o.ribbon, 60),
    cover_story: bi(o.cover_story, 160),
    issue_no: text(o.issue_no, 30),
  };
}

export function normalizeIssueDesign(v: unknown): IssueDesign {
  const o = (v ?? {}) as Record<string, unknown>;
  const ads: Record<string, string> = {};
  const s = (o.section_ads ?? {}) as Record<string, unknown>;
  for (const [k, id] of Object.entries(s)) {
    if (/^[a-z_]{1,30}$/.test(k) && typeof id === "string" && id) ads[k] = id.slice(0, 60);
  }
  return {
    cover: normalizeCover(o.cover),
    section_ads: ads,
    back_cover: typeof o.back_cover === "string" ? o.back_cover.slice(0, 60) : "",
  };
}

export function normalizePresets(list: unknown): CoverPreset[] {
  const out: CoverPreset[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = text(o.name, 60);
    const id = text(o.id, 60);
    if (!name || !id) continue;
    const c = normalizeCover(o);
    out.push({
      id,
      name,
      design: c.design,
      color: c.color,
      color2: c.color2,
      color_scope: c.color_scope,
      bg_dim: c.bg_dim,
      bg_blur: c.bg_blur,
      ribbon: c.ribbon,
    });
  }
  return out.slice(-MAX_PRESETS);
}

export function normalizeAds(list: unknown): MagazineAd[] {
  const out: MagazineAd[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = text(o.id, 60);
    if (!id || !isUrl(o.url) || typeof o.path !== "string") continue;
    const ad: MagazineAd = {
      id,
      name: text(o.name, 60) || "Ad",
      url: o.url,
      path: o.path.slice(0, 300),
      fit: o.fit === "fit" ? "fit" : "fill",
    };
    if (isUrl(o.url_hi) && typeof o.path_hi === "string") {
      ad.url_hi = o.url_hi;
      ad.path_hi = o.path_hi.slice(0, 300);
    }
    if (isLink(o.link)) ad.link = o.link;
    out.push(ad);
  }
  return out.slice(0, MAX_ADS);
}

// A preset applied to an issue's cover: the look changes, the month's photos
// and cover story stay.
export function applyPreset(cover: MonthlyCover, p: CoverPreset): MonthlyCover {
  return {
    ...cover,
    design: p.design,
    color: p.color,
    color2: p.color2,
    color_scope: p.color_scope,
    bg_dim: p.bg_dim,
    bg_blur: p.bg_blur,
    ribbon: p.ribbon.en || p.ribbon.hi ? p.ribbon : cover.ribbon,
  };
}

// The ad's image for an issue language.
export const adImage = (ad: MagazineAd, lang: "en" | "hi") =>
  lang === "hi" && ad.url_hi
    ? { url: ad.url_hi, path: ad.path_hi ?? "" }
    : { url: ad.url, path: ad.path };

// An A4 page is 210 × 297; images more than this far off that shape are
// flagged when uploaded.
export function a4Off(w: number, h: number): boolean {
  if (!w || !h) return false;
  return Math.abs(w / h - 210 / 297) > 0.03;
}
