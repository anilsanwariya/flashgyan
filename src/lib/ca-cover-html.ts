// The magazine's cover page, ad pages and ruled notes pages as printable A4
// HTML. The daily issue has five cover layouts; the monthly issue ten
// designs with the editor's own photos (framed, or blurred behind the cover).
// Colours come in as CSS variables on the cover, so a monthly cover can use
// its own colour without changing the rest of the issue.
import type { Bi } from "@/lib/current-affairs";
import {
  designInfo,
  type CoverPhoto,
  type DailyLayout,
  type MagazineAd,
  type MonthlyCover,
} from "@/lib/ca-covers";

type Lang = "en" | "hi";

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const safeUrl = (u: string | undefined) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");
const pick = (b: Bi | null | undefined, lang: Lang) =>
  ((lang === "hi" ? b?.hi || b?.en : b?.en || b?.hi) ?? "").trim();

// A darker shade of a colour, for gradients.
export function darken(hex: string, amount = 0.45): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("")}`;
}

// What every cover can show, already in the issue's language.
export type CoverParts = {
  lang: Lang;
  // The day, or the first day of the month.
  period: string;
  title: string;
  dateLine: string;
  tagline: string;
  brand: string;
  edition: string;
  logoMain: string;
  logoPartner: string;
  // Labels are HTML (they may hold entities).
  stats: { n: number; label: string }[];
  // The most important stories first.
  top: { cat: string; headline: string; summary: string }[];
  rajasthan: { headline: string }[];
  inThisIssue: string;
  contents: string;
  tocHtml: string;
  ctaHtml: string;
};

export type CoverLook =
  | { kind: "daily"; layout: DailyLayout }
  | { kind: "monthly"; cover: MonthlyCover };

const CT = {
  en: {
    top: "Top story",
    coverStory: "Cover story",
    inside: "Inside",
    faces: "Faces of the Month",
    rajasthan: "Rajasthan this month",
    issue: "Issue",
    photo: "Photo",
    notes: "Notes",
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  },
  hi: {
    top: "प्रमुख खबर",
    coverStory: "आवरण कथा",
    inside: "इस अंक में",
    faces: "चर्चा में रहे चेहरे",
    rajasthan: "इस महीने राजस्थान",
    issue: "अंक",
    photo: "फोटो",
    notes: "नोट्स",
    months: [
      "जनवरी",
      "फ़रवरी",
      "मार्च",
      "अप्रैल",
      "मई",
      "जून",
      "जुलाई",
      "अगस्त",
      "सितंबर",
      "अक्टूबर",
      "नवंबर",
      "दिसंबर",
    ],
  },
};

// ---------- Shared pieces ----------

const logos = (p: CoverParts, cls = "cover-logos") =>
  `<div class="${cls}">${
    p.logoMain
      ? `<img src="${esc(p.logoMain)}" alt="" />`
      : `<span class="brand">${esc(p.brand)}</span>`
  }${p.logoPartner ? `<img src="${esc(p.logoPartner)}" alt="" />` : ""}</div>`;

const stats = (p: CoverParts, cls = "stats") =>
  `<div class="${cls}">${p.stats.map((s) => `<div><b>${s.n}</b><span>${s.label}</span></div>`).join("")}</div>`;

const hlCards = (list: CoverParts["top"]) =>
  list
    .map(
      (i) =>
        `<div class="hl"><span class="hl-cat">${esc(i.cat)}</span><div class="hl-hi">${esc(i.headline)}</div></div>`,
    )
    .join("");

const hlList = (list: CoverParts["top"], cls = "cv-list") =>
  `<ol class="${cls}">${list
    .map((i) => `<li><span class="hl-cat">${esc(i.cat)}</span><b>${esc(i.headline)}</b></li>`)
    .join("")}</ol>`;

const contents = (p: CoverParts, cls = "toc") =>
  `<h3 class="cover-h">${esc(p.contents)}</h3><div class="${cls}">${p.tocHtml}</div>`;

const foot = (p: CoverParts) =>
  `<div class="cover-foot"><span>${esc(p.brand)}</span><span>${p.edition}</span></div>`;

const head = (p: CoverParts) => (p.tagline ? `<div class="eyebrow">${esc(p.tagline)}</div>` : "");

// A photo in a frame; without a photo, a colour tile with a story's headline.
function frame(ph: CoverPhoto | undefined, lang: Lang, cls: string, fallback: string): string {
  const url = safeUrl(ph?.url);
  const caption = pick(ph?.caption, lang);
  const credit = ph?.credit
    ? `<span class="credit">${CT[lang].photo}: ${esc(ph.credit)}</span>`
    : "";
  const inner = url
    ? `<img src="${esc(url)}" alt="" />`
    : `<div class="ph-empty"><span>${esc(fallback)}</span></div>`;
  return `<figure class="fr ${cls}">${inner}${caption || credit ? `<figcaption>${caption ? `<b>${esc(caption)}</b>` : ""}${credit}</figcaption>` : ""}</figure>`;
}

// The blurred, darkened background photo behind a monthly cover.
function backdrop(c: MonthlyCover): string {
  const url = safeUrl(c.bg?.url);
  if (!url) return "";
  return `<div class="cv-bg"><img src="${esc(url)}" alt="" style="filter: blur(${c.bg_blur}px)" /></div><div class="cv-dim" style="opacity:${c.bg_dim / 100}"></div>`;
}

const monthName = (p: CoverParts) => {
  const [y, m] = p.period.split("-").map(Number);
  return { month: CT[p.lang].months[(m || 1) - 1], year: String(y) };
};

const issueLine = (c: MonthlyCover, p: CoverParts) =>
  c.issue_no ? `${CT[p.lang].issue} ${esc(c.issue_no)} · ${esc(p.dateLine)}` : esc(p.dateLine);

const ribbon = (c: MonthlyCover, lang: Lang, cls = "ribbon") => {
  const r = pick(c.ribbon, lang);
  return r ? `<div class="${cls}">${esc(r)}</div>` : "";
};

// The cover story: the editor's words, or the month's top story.
const coverStory = (c: MonthlyCover, p: CoverParts) =>
  pick(c.cover_story, p.lang) || p.top[0]?.headline || p.title;

// ---------- Daily layouts ----------

function dailyCover(p: CoverParts, layout: DailyLayout): string {
  const top = p.top.slice(0, 4);
  switch (layout) {
    case "band":
      return `<div class="band">
  ${logos(p, "band-logos")}
  ${head(p)}
  <h1>${esc(p.title)}</h1>
  <div class="date-pill">${esc(p.dateLine)}</div>
  ${stats(p, "band-stats")}
</div>
<div class="band-body">
  ${top.length ? `<h3 class="cover-h">${esc(p.inThisIssue)}</h3>${hlList(top)}` : ""}
  ${contents(p, "toc one")}
  ${p.ctaHtml}
  ${foot(p)}
</div>`;
    case "lead": {
      const [lead, ...rest] = top;
      return `${logos(p)}
<div class="cover-hero slim">
  <div>${head(p)}<h1>${esc(p.title)}</h1><div class="date-pill">${esc(p.dateLine)}</div></div>
  ${stats(p, "stats mini")}
</div>
<div class="cover-body">
  ${
    lead
      ? `<div class="lead"><span class="lead-tag">${CT[p.lang].top}</span><span class="hl-cat">${esc(lead.cat)}</span><h2>${esc(lead.headline)}</h2>${lead.summary ? `<p>${esc(lead.summary)}</p>` : ""}</div>`
      : ""
  }
  ${rest.length ? `<div class="hl-grid three">${hlCards(rest)}</div>` : ""}
  ${contents(p)}
  ${p.ctaHtml}
</div>
${foot(p)}`;
    }
    case "split":
      return `${logos(p)}
<div class="split-top">
  ${head(p)}
  <h1>${esc(p.title)}</h1>
  <div class="date-pill">${esc(p.dateLine)}</div>
  ${stats(p)}
</div>
<div class="cover-body">
  ${top.length ? `<h3 class="cover-h">${esc(p.inThisIssue)}</h3><div class="hl-grid">${hlCards(top)}</div>` : ""}
  ${contents(p)}
  ${p.ctaHtml}
</div>
${foot(p)}`;
    case "light":
      return `${logos(p)}
<div class="light-head">
  ${head(p)}
  <h1>${esc(p.title)}</h1>
  <div class="date-pill">${esc(p.dateLine)}</div>
  ${stats(p)}
</div>
<div class="cover-body">
  ${top.length ? `<h3 class="cover-h">${esc(p.inThisIssue)}</h3><div class="hl-grid">${hlCards(top)}</div>` : ""}
  ${contents(p)}
  ${p.ctaHtml}
</div>
${foot(p)}`;
    default:
      return classicCover(p, top);
  }
}

// The original cover.
function classicCover(p: CoverParts, top: CoverParts["top"]): string {
  return `${logos(p)}
<div class="cover-hero">
  ${head(p)}
  <h1>${esc(p.title)}</h1>
  <div class="date-pill">${esc(p.dateLine)}</div>
  ${stats(p)}
</div>
<div class="cover-body">
  ${top.length ? `<h3 class="cover-h">${esc(p.inThisIssue)}</h3><div class="hl-grid">${hlCards(top)}</div>` : ""}
  ${contents(p)}
  ${p.ctaHtml}
</div>
${foot(p)}`;
}

// ---------- Monthly designs ----------

function monthlyCover(p: CoverParts, c: MonthlyCover): string {
  const lang = p.lang;
  const photos = c.photos;
  const [min, max] = designInfo(c.design).frames;
  // Each design shows as many frames as it has room for; empty frames get a
  // story's headline.
  const frames = (cls: string, n = Math.min(max, Math.max(min, photos.length))) =>
    Array.from({ length: n }, (_, i) =>
      frame(photos[i], lang, cls, p.top[i]?.headline ?? p.title),
    ).join("");
  const bg = backdrop(c);
  const top = p.top;
  switch (c.design) {
    case "story": {
      const main = photos[0] ?? c.bg ?? undefined;
      const url = safeUrl(main?.url);
      const credit = main?.credit
        ? `<span class="credit">${CT[lang].photo}: ${esc(main.credit)}</span>`
        : "";
      return `<div class="cv-bg">${url ? `<img src="${esc(url)}" alt="" />` : ""}</div><div class="story-scrim"></div>
<div class="story-top">
  ${logos(p, "story-logos")}
  <h1>${esc(p.title)}</h1>
  <div class="story-line">${issueLine(c, p)}${p.tagline ? ` · ${esc(p.tagline)}` : ""}</div>
</div>
<div class="story-side">${top
        .slice(1, 4)
        .map((i) => `<div><span class="hl-cat">${esc(i.cat)}</span><b>${esc(i.headline)}</b></div>`)
        .join("")}</div>
<div class="story-bottom">
  ${ribbon(c, lang)}
  <div class="story-tag">${CT[lang].coverStory}</div>
  <h2>${esc(coverStory(c, p))}</h2>
  ${stats(p, "stats inline")}
  ${credit}
</div>`;
    }
    case "mosaic":
      return `${bg}<div class="cv-inner">
  ${logos(p)}
  <div class="mosaic-band">${head(p)}<h1>${esc(p.title)}</h1><div class="mosaic-line">${issueLine(c, p)}</div>${ribbon(c, lang)}</div>
  <div class="mosaic n${Math.min(max, Math.max(min, photos.length))}">${frames("tile")}</div>
  <div class="cover-body panel">
    <h3 class="cover-h">${esc(p.inThisIssue)}</h3><div class="hl-grid">${hlCards(top.slice(0, 4))}</div>
    ${p.ctaHtml}
  </div>
  ${foot(p)}
</div>`;
    case "polaroid":
      return `${bg || `<div class="cv-bg grad"></div>`}<div class="cv-inner">
  ${logos(p, "cover-logos on-dark")}
  <div class="pol-head">${head(p)}<h1>${esc(p.title)}</h1><div class="date-pill">${issueLine(c, p)}</div>${ribbon(c, lang)}</div>
  <div class="pols">${frames("pol")}</div>
  <div class="cover-body panel">
    <h3 class="cover-h">${esc(p.inThisIssue)}</h3><div class="hl-grid">${hlCards(top.slice(0, 4))}</div>
    ${p.ctaHtml}
  </div>
  ${foot(p)}
</div>`;
    case "month": {
      const m = monthName(p);
      return `${bg || `<div class="cv-bg grad"></div>`}<div class="cv-inner">
  ${logos(p, "cover-logos on-dark")}
  <div class="bm">
    ${head(p)}
    <div class="bm-title">${esc(p.title)}</div>
    <div class="bm-month">${esc(m.month)}</div>
    <div class="bm-year">${esc(m.year)}${c.issue_no ? `<span>${CT[lang].issue} ${esc(c.issue_no)}</span>` : ""}</div>
    ${ribbon(c, lang)}
    <h2>${esc(coverStory(c, p))}</h2>
  </div>
  <div class="cover-body panel">
    ${hlList(top.slice(0, 5))}
    ${p.ctaHtml}
  </div>
  ${foot(p)}
</div>`;
    }
    case "journal":
      return `${bg}<div class="cv-inner jr">
  <div class="jr-border"></div>
  ${logos(p)}
  <div class="jr-head">
    <h1>${esc(p.title)}</h1>
    <div class="jr-line">${issueLine(c, p)}</div>
    ${p.tagline ? `<div class="jr-tag">${esc(p.tagline)}</div>` : ""}
  </div>
  <div class="jr-photo">${frames("jr-fr", 1)}</div>
  ${ribbon(c, lang, "jr-ribbon")}
  <h2 class="jr-theme">${esc(coverStory(c, p))}</h2>
  <div class="jr-inside"><h3 class="cover-h">${esc(p.inThisIssue)}</h3>${hlList(top.slice(1, 5), "cv-list two")}</div>
  ${foot(p)}
</div>`;
    case "sidebar":
      return `${bg}<div class="sb">
  <aside class="sb-side">
    <div class="sb-label">${CT[lang].inside}</div>
    ${hlList(top.slice(0, 6))}
    ${stats(p, "band-stats")}
  </aside>
  <div class="sb-main">
    ${logos(p)}
    ${head(p)}
    <h1>${esc(p.title)}</h1>
    <div class="sb-line">${issueLine(c, p)}</div>
    <div class="sb-photo">${frames("sb-fr", 1)}${ribbon(c, lang)}</div>
    <h2>${esc(coverStory(c, p))}</h2>
    ${p.ctaHtml}
  </div>
</div>
${foot(p)}`;
    case "faces":
      return `${bg}<div class="cv-inner">
  ${logos(p)}
  <div class="fc-head">${head(p)}<h1>${esc(p.title)}</h1><div class="date-pill">${issueLine(c, p)}</div>${ribbon(c, lang)}</div>
  <h3 class="fc-title">${CT[lang].faces}</h3>
  <div class="faces">${frames("face")}</div>
  <div class="cover-body panel">
    <h3 class="cover-h">${esc(p.inThisIssue)}</h3><div class="hl-grid">${hlCards(top.slice(0, 4))}</div>
    ${p.ctaHtml}
  </div>
  ${foot(p)}
</div>`;
    case "rajasthan": {
      const raj = p.rajasthan.length ? p.rajasthan : top.map((t) => ({ headline: t.headline }));
      return `${bg}<div class="cv-inner">
  ${logos(p)}
  <div class="rj-head">${head(p)}<h1>${esc(p.title)}</h1><div class="date-pill">${issueLine(c, p)}</div></div>
  <div class="rj-photo">${frames("rj-fr", 1)}${ribbon(c, lang)}</div>
  <div class="rj-panel">
    <h3>${CT[lang].rajasthan}</h3>
    <ul>${raj
      .slice(0, 6)
      .map((r) => `<li>${esc(r.headline)}</li>`)
      .join("")}</ul>
  </div>
  <div class="cover-body panel">${p.ctaHtml}</div>
  ${foot(p)}
</div>`;
    }
    case "exam":
      return `${bg || `<div class="cv-bg grad"></div>`}<div class="cv-inner">
  ${logos(p, "cover-logos on-dark")}
  <div class="ex-head">${head(p)}<h1>${esc(p.title)}</h1><div class="date-pill">${issueLine(c, p)}</div></div>
  ${ribbon(c, lang, "ex-ribbon")}
  <div class="ex-mid">
    <div class="ex-badges">${p.stats
      .slice(0, 3)
      .map(
        (s) =>
          `<div class="badge"><b>${s.n}${s.n >= 10 ? "+" : ""}</b><span>${s.label}</span></div>`,
      )
      .join("")}</div>
    <div class="ex-frames n${Math.min(max, Math.max(min, photos.length))}">${frames("ex-fr")}</div>
  </div>
  <h2 class="ex-story">${esc(coverStory(c, p))}</h2>
  <div class="cover-body panel">
    ${hlList(top.slice(1, 3))}
    ${p.ctaHtml}
  </div>
  ${foot(p)}
</div>`;
    default:
      // Classic Plus: today's cover, over the blurred background if any.
      return bg
        ? `${bg}<div class="cv-inner glass">${classicCover(p, top.slice(0, 4))}</div>`
        : classicCover(p, top);
  }
}

// The cover section, its colours set on it.
export function coverHtml(
  p: CoverParts,
  look: CoverLook,
  colors: { c: string; c2: string },
): string {
  const vars = `--c:${colors.c};--cd:${darken(colors.c)};--cdd:${darken(colors.c, 0.55)};--c2:${colors.c2};--c2d:${darken(colors.c2, 0.35)}`;
  if (look.kind === "daily") {
    return `<section class="cover d-${look.layout}" style="${vars}">${dailyCover(p, look.layout)}</section>`;
  }
  const c = look.cover;
  return `<section class="cover m-${c.design}${safeUrl(c.bg?.url) ? " has-bg" : ""}" style="${vars}">${monthlyCover(p, c)}</section>`;
}

// ---------- Ad and notes pages ----------

// The PDF step puts each ad on a clean page of its own (no page footer): this
// page holds its place in the page count and carries a marker the PDF step
// finds. The image shows here too, for the preview and in case the PDF step
// can't load it.
export const PAGE_MARK = "https://flashgyan.invalid/page/";

export function adPageHtml(ad: MagazineAd, lang: Lang, where: string): string {
  const url = safeUrl(lang === "hi" && ad.url_hi ? ad.url_hi : ad.url);
  const img = url ? `<img class="${ad.fit}" src="${esc(url)}" alt="" />` : "";
  const link = safeUrl(ad.link);
  return `<section class="full-page ad-page" data-ad="${esc(ad.id)}"><a class="page-mark" href="${PAGE_MARK}ad/${encodeURIComponent(where)}/${encodeURIComponent(ad.id)}"></a>${link ? `<a href="${esc(link)}">${img}</a>` : img}</section>`;
}

// A ruled page for the reader's notes, added so the back cover lands on the
// outside of a printed issue.
export function notesPageHtml(lang: Lang, brand: string, accent: string): string {
  return `<section class="notes-page" style="--accent:${accent}"><a class="page-mark" href="${PAGE_MARK}notes"></a><h2>${CT[lang].notes}</h2><div class="rules">${'<div class="rule"></div>'.repeat(26)}</div><div class="notes-brand">${esc(brand)}</div></section>`;
}

export const COVER_FONTS =
  "family=Noto+Serif:wght@600;700&family=Noto+Serif+Devanagari:wght@600;700";

// The cover's look (all layouts), the ad pages and the notes pages.
export const COVER_CSS = `
@page :first { margin: 0; }
/* Full-bleed pages (the cover, ads): Chrome keeps the page margins on the
   first page when it prints a footer, but not on a named page. */
@page full { margin: 0; }
.cover { --c: #6d28d9; page: full; position: relative; width: 210mm; height: 297mm; display: flex; flex-direction: column; page-break-after: always; background: #fff; overflow: hidden; }
.cover-logos { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 9mm 14mm 7mm; }
.cover-logos img { height: 16mm; max-width: 75mm; object-fit: contain; }
.cover-logos.on-dark img, .band-logos img, .story-logos img { background: #fff; border-radius: 3mm; padding: 1.5mm 3mm; }
.cover-logos.on-dark .brand, .story-logos .brand { color: #fff; }
.brand { font-weight: 700; color: var(--c); font-size: 15pt; }
.cover-hero { position: relative; margin: 0 10mm; border-radius: 7mm; padding: 13mm 12mm 11mm; color: #fff; overflow: hidden;
  background: radial-gradient(circle at 92% 8%, rgba(255,255,255,.18) 0 22mm, transparent 22.2mm),
    radial-gradient(circle at 78% 105%, rgba(255,255,255,.10) 0 30mm, transparent 30.2mm),
    linear-gradient(135deg, var(--c) 0%, var(--cd) 100%); }
.eyebrow { font-size: 9pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .85; max-width: 150mm; }
html[lang="hi"] .eyebrow { letter-spacing: 0; font-size: 10pt; }
.cover h1 { margin: 3mm 0 0; font-size: 38pt; line-height: 1.05; font-weight: 700; letter-spacing: -.01em; max-width: 140mm; }
.date-pill { display: inline-block; margin-top: 6mm; padding: 1.8mm 5mm; border-radius: 20mm; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); font-size: 11pt; font-weight: 600; }
.stats { display: flex; gap: 4mm; margin-top: 9mm; }
.stats div { flex: 1; background: rgba(255,255,255,.12); border-radius: 3.5mm; padding: 3mm 4mm; }
.stats b { display: block; font-size: 20pt; line-height: 1.1; }
.stats span { font-size: 8.5pt; opacity: .9; }
.cover-body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8mm 14mm 6mm; overflow: hidden; }
.cta { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6mm; border-radius: 4mm; padding: 5mm 6mm; background: #f5f3ff; border: 1px solid #ddd6fe; }
a.cta { text-decoration: none; color: inherit; }
.cta b { display: block; font-size: 11pt; color: #1f2937; }
.cta span { font-size: 9pt; color: #64748b; }
.cta-handle { flex: none; padding: 2mm 5mm; border-radius: 20mm; background: var(--c); color: #fff; font-weight: 700; font-size: 11pt; }
.cover-h { margin: 0 0 3mm; font-size: 10pt; letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
.hl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; margin-bottom: 8mm; }
.hl-grid.three { grid-template-columns: 1fr 1fr 1fr; }
.hl { border: 1px solid #e5e7eb; border-top: 3px solid var(--c); border-radius: 3mm; padding: 3mm 3.5mm; background: #fff; }
.hl-cat { display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--c); }
.hl-hi { margin-top: 1mm; font-weight: 700; font-size: 10pt; line-height: 1.35; }
.toc { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
.toc.one { grid-template-columns: 1fr; }
.toc-row { display: flex; justify-content: space-between; padding: 2mm 0; border-bottom: 1px dashed #cbd5e1; font-size: 10pt; }
.toc-row b { color: var(--c); }
.cover-foot { position: relative; display: flex; justify-content: space-between; margin: 0 10mm 14mm; border-radius: 4mm; padding: 4mm 6mm; background: var(--cdd); color: #fff; font-size: 9pt; }
.cv-list { margin: 0 0 6mm; padding: 0; list-style: none; counter-reset: n; }
.cv-list li { counter-increment: n; position: relative; padding: 2.2mm 0 2.2mm 9mm; border-bottom: 1px solid #e5e7eb; font-size: 10pt; line-height: 1.35; }
.cv-list li::before { content: counter(n); position: absolute; left: 0; top: 2.4mm; width: 6mm; height: 6mm; border-radius: 50%; background: var(--c); color: #fff; font-size: 8pt; font-weight: 700; text-align: center; line-height: 6mm; }
.cv-list.two { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
.credit { display: block; font-size: 6.5pt; opacity: .75; }
/* Frames */
.fr { position: relative; margin: 0; overflow: hidden; }
.fr img { display: block; width: 100%; height: 100%; object-fit: cover; }
.fr figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 4mm 3mm 2mm; background: linear-gradient(transparent, rgba(0,0,0,.7)); color: #fff; font-size: 8pt; line-height: 1.3; }
.fr figcaption b { display: block; }
.ph-empty { display: flex; align-items: flex-end; width: 100%; height: 100%; padding: 4mm; background: linear-gradient(135deg, var(--c), var(--cd)); color: #fff; font-weight: 700; font-size: 10pt; line-height: 1.3; }
/* Background photo */
.cv-bg { position: absolute; inset: 0; overflow: hidden; background: var(--cdd); }
.cv-bg img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.08); }
.cv-bg.grad { background: radial-gradient(circle at 85% 10%, rgba(255,255,255,.16) 0 40mm, transparent 40.2mm), linear-gradient(160deg, var(--c), var(--cdd)); }
.cv-dim { position: absolute; inset: 0; background: #000; }
.cv-inner { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.panel { margin: 0 10mm 6mm; padding: 6mm 7mm 6mm; border-radius: 5mm; background: rgba(255,255,255,.94); color: #1f2937; }
.has-bg .cover-logos .brand { color: #fff; }
.has-bg .cover-logos img { background: #fff; border-radius: 3mm; padding: 1.5mm 3mm; }
.ribbon { display: inline-block; margin-top: 4mm; padding: 1.5mm 5mm; background: var(--c2); color: #111827; font-weight: 700; font-size: 11pt; border-radius: 1.5mm; }
.glass .cover-body { margin: 5mm 10mm 5mm; padding: 6mm 9mm 5mm; border-radius: 5mm; background: rgba(255,255,255,.94); }
.glass .cover-hero { padding: 10mm 12mm 9mm; }
.glass .stats { margin-top: 6mm; }
.glass .hl-grid { margin-bottom: 5mm; }
.glass .cover-logos img { background: #fff; border-radius: 3mm; padding: 1.5mm 3mm; }
/* Daily: Side Band */
.d-band { flex-direction: row; }
.band { width: 74mm; flex: none; display: flex; flex-direction: column; padding: 12mm 8mm; color: #fff; background: radial-gradient(circle at 20% 92%, rgba(255,255,255,.12) 0 26mm, transparent 26.2mm), linear-gradient(180deg, var(--c), var(--cd)); }
.band-logos { display: flex; flex-direction: column; gap: 3mm; margin-bottom: 10mm; }
.band-logos img { height: 14mm; max-width: 58mm; object-fit: contain; align-self: flex-start; }
.band-logos .brand { color: #fff; }
.band h1 { font-size: 30pt; }
.band-stats { display: flex; flex-direction: column; gap: 3mm; margin-top: auto; }
.band-stats div { border-top: 1px solid rgba(255,255,255,.35); padding-top: 2.5mm; }
.band-stats b { display: block; font-size: 22pt; line-height: 1.05; }
.band-stats span { font-size: 8.5pt; opacity: .9; }
.band-body { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 14mm 11mm 0; }
.band-body .cover-foot { margin: 6mm 0 14mm; }
/* Daily: Top Story First */
.cover-hero.slim { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; padding: 9mm 10mm; }
.cover-hero.slim h1 { font-size: 28pt; }
.cover-hero.slim .date-pill { margin-top: 3mm; }
.stats.mini { flex-direction: column; gap: 2mm; margin: 0; width: 36mm; flex: none; }
.stats.mini div { padding: 1.5mm 3mm; }
.stats.mini b { display: inline; font-size: 13pt; margin-right: 1.5mm; }
.lead { position: relative; margin-bottom: 6mm; padding: 5mm 6mm; border-left: 2.5mm solid var(--c); border-radius: 3mm; background: #f8fafc; }
.lead-tag { float: right; padding: .8mm 3mm; border-radius: 10mm; background: var(--c); color: #fff; font-size: 7.5pt; font-weight: 700; }
.lead h2 { margin: 1.5mm 0 2mm; font-size: 18pt; line-height: 1.2; }
.lead p { margin: 0; font-size: 10pt; color: #334155; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.three .hl { padding: 2.5mm 3mm; }
.three .hl-hi { font-size: 9pt; }
/* Daily: Split */
.split-top { padding: 12mm 14mm 12mm; color: #fff; background: radial-gradient(circle at 90% 12%, rgba(255,255,255,.16) 0 26mm, transparent 26.2mm), linear-gradient(135deg, var(--c), var(--cd)); }
.d-split .cover-body { padding-top: 9mm; }
/* Daily: Light */
.light-head { margin: 0 14mm; padding: 8mm 0 6mm; border-top: 2.5mm solid var(--c); border-bottom: 1px solid #e5e7eb; }
.light-head .eyebrow { color: var(--c); opacity: 1; }
.light-head h1 { color: var(--cdd); }
.light-head .date-pill { background: none; border: 1.5px solid var(--c); color: var(--c); }
.light-head .stats div { background: none; border: 1px solid #e5e7eb; }
.light-head .stats b { color: var(--c); }
.light-head .stats span { color: #64748b; }
.d-light .hl { border-top: 1px solid #e5e7eb; border-left: 3px solid var(--c); }
.d-light .cta { background: #fff; border-color: var(--c); }
.d-light .cover-foot { background: none; color: #64748b; border-top: 1px solid #e5e7eb; border-radius: 0; padding: 3mm 0; margin: 0 14mm 14mm; }
/* Monthly: Cover Story */
.m-story { color: #fff; }
.m-story .cv-bg img { transform: none; }
.story-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,.85) 100%); }
.story-top { position: relative; padding: 0 12mm; text-align: center; }
.story-logos { display: flex; justify-content: space-between; align-items: center; padding: 8mm 0 3mm; }
.story-logos img { height: 13mm; max-width: 60mm; object-fit: contain; }
.story-top h1 { max-width: none; margin: 0; font-family: "Noto Serif", "Noto Serif Devanagari", serif; font-size: 54pt; line-height: 1; text-transform: uppercase; letter-spacing: .02em; text-shadow: 0 1mm 4mm rgba(0,0,0,.4); }
html[lang="hi"] .story-top h1 { text-transform: none; font-size: 46pt; }
.story-line { margin-top: 2mm; font-size: 9.5pt; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.story-side { position: relative; width: 62mm; margin: 10mm 0 0 12mm; display: flex; flex-direction: column; gap: 4mm; }
.story-side div { padding: 2mm 3mm; border-left: 1mm solid var(--c2); border-radius: 0 2mm 2mm 0; background: rgba(0,0,0,.55); font-size: 10pt; line-height: 1.3; }
.story-side .hl-cat { color: var(--c2); }
.story-bottom { position: relative; margin-top: auto; padding: 0 12mm 14mm; }
.story-tag { margin-top: 3mm; font-size: 9pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--c2); }
.story-bottom h2 { margin: 1mm 0 0; font-family: "Noto Serif", "Noto Serif Devanagari", serif; font-size: 30pt; line-height: 1.12; }
.stats.inline { margin-top: 6mm; }
.stats.inline div { background: rgba(255,255,255,.14); }
.story-bottom .credit { margin-top: 3mm; }
/* Monthly: Mosaic */
.mosaic-band { margin: 0 10mm; padding: 7mm 9mm; border-radius: 5mm; color: #fff; background: linear-gradient(135deg, var(--c), var(--cd)); }
.mosaic-band h1 { font-size: 32pt; }
.mosaic-line { margin-top: 2mm; font-size: 10.5pt; font-weight: 600; opacity: .95; }
.mosaic { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 44mm; gap: 3mm; margin: 5mm 10mm; }
.mosaic.n4 { grid-template-columns: 1fr 1fr; grid-auto-rows: 44mm; }
.mosaic.n5 .fr:first-child { grid-row: span 2; }
.tile { border: 1.5mm solid #fff; border-radius: 2mm; box-shadow: 0 1mm 3mm rgba(0,0,0,.18); }
.m-mosaic .cover-body.panel { padding-top: 5mm; }
.m-mosaic .hl-grid { margin-bottom: 4mm; }
/* Monthly: Polaroids */
.pol-head { position: relative; padding: 2mm 14mm 0; color: #fff; }
.pols { position: relative; height: 112mm; margin: 4mm 10mm 0; }
.pol { position: absolute; width: 74mm; height: 88mm; padding: 3.5mm 3.5mm 16mm; background: #fff; box-shadow: 0 2mm 5mm rgba(0,0,0,.35); }
.pol img, .pol .ph-empty { height: 100%; }
.pol figcaption { top: auto; bottom: 2mm; padding: 0 4mm; background: none; color: #1f2937; font-size: 9pt; text-align: center; }
.pol:nth-child(1) { left: 0; top: 8mm; transform: rotate(-6deg); }
.pol:nth-child(2) { left: 58mm; top: 0; transform: rotate(3deg); z-index: 1; }
.pol:nth-child(3) { right: 0; top: 14mm; transform: rotate(-2deg); }
/* Monthly: Big Month */
.m-month { color: #fff; }
.bm { position: relative; padding: 4mm 14mm 0; flex: 1; }
.bm-title { font-size: 13pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-top: 4mm; }
.bm-month { margin-top: 2mm; font-family: "Noto Serif", "Noto Serif Devanagari", serif; font-size: 80pt; line-height: .95; font-weight: 700; text-transform: uppercase; letter-spacing: -.01em; }
html[lang="hi"] .bm-month { text-transform: none; font-size: 76pt; line-height: 1.15; }
.bm-year { display: flex; align-items: baseline; gap: 6mm; font-size: 40pt; font-weight: 700; color: transparent; -webkit-text-stroke: .5mm #fff; }
.bm-year span { color: #fff; -webkit-text-stroke: 0; font-size: 12pt; letter-spacing: .1em; text-transform: uppercase; }
.bm h2 { margin: 6mm 0 0; max-width: 160mm; font-size: 20pt; line-height: 1.25; }
.m-month .panel .cv-list { margin-bottom: 4mm; }
/* Monthly: Journal */
.m-journal { background: #fbf8f1; }
.m-journal.has-bg .cv-dim { background: #fbf8f1; }
.jr { text-align: center; }
.jr-border { position: absolute; inset: 6mm; border: 1.2mm double var(--c2d); pointer-events: none; }
.jr-head h1 { margin: 0 auto; max-width: none; font-family: "Noto Serif", "Noto Serif Devanagari", serif; font-size: 42pt; color: var(--cdd); }
.jr-line { margin-top: 2mm; font-size: 10pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--c2d); }
.jr-tag { margin: 1mm 20mm 0; font-size: 9pt; color: #57534e; }
.jr-photo { margin: 6mm auto 0; width: 140mm; height: 92mm; padding: 2.5mm; border: 1mm solid var(--c); background: #fff; }
.jr-fr { width: 100%; height: 100%; outline: .4mm solid var(--c2); outline-offset: -2mm; }
.jr-ribbon { margin: 5mm auto 0; font-size: 10pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--c); }
.jr-theme { margin: 2mm 18mm 0; font-family: "Noto Serif", "Noto Serif Devanagari", serif; font-size: 24pt; line-height: 1.2; color: #1c1917; }
.jr-inside { margin: 6mm 18mm 0; padding-top: 4mm; border-top: 1px solid #d6d3d1; text-align: left; }
.jr .cover-foot { margin-top: auto; background: var(--c); }
/* Monthly: Inside Sidebar */
.sb { position: relative; flex: 1; min-height: 0; display: flex; }
.sb-side { width: 68mm; flex: none; padding: 14mm 7mm 6mm; color: #fff; background: linear-gradient(180deg, var(--cd), var(--cdd)); display: flex; flex-direction: column; }
.sb-label { font-size: 16pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c2); margin-bottom: 4mm; }
.sb-side .cv-list li { border-color: rgba(255,255,255,.2); }
.sb-side .cv-list li::before { background: var(--c2); color: #111827; }
.sb-side .hl-cat { color: var(--c2); }
.sb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 0 10mm 0 8mm; background: rgba(255,255,255,.95); }
.sb-main .cover-logos { padding: 9mm 0 4mm; }
.sb-main .eyebrow { color: var(--c); }
.sb-main h1 { font-size: 34pt; color: var(--cdd); }
.sb-line { margin-top: 2mm; font-weight: 600; color: #475569; }
.sb-photo { position: relative; flex: 1; min-height: 70mm; margin-top: 5mm; }
.sb-fr { height: 100%; border-radius: 3mm; }
.sb-photo .ribbon { position: absolute; left: 4mm; top: 0; }
.sb-main h2 { margin: 4mm 0; font-size: 19pt; line-height: 1.2; }
.sb-main .cta { margin: 0 0 6mm; }
.m-sidebar .cover-foot { margin-top: 0; }
/* Monthly: Faces of the Month */
.fc-head { position: relative; margin: 0 10mm; padding: 7mm 9mm; border-radius: 5mm; color: #fff; background: linear-gradient(135deg, var(--c), var(--cd)); }
.fc-head h1 { font-size: 32pt; }
.fc-title { position: relative; margin: 6mm 0 3mm; text-align: center; font-size: 14pt; letter-spacing: .1em; text-transform: uppercase; color: var(--cdd); }
.has-bg .fc-title { color: #fff; }
.faces { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm 6mm; margin: 0 16mm 4mm; }
.face { overflow: visible; text-align: center; }
.face img, .face .ph-empty { width: 40mm; height: 40mm; margin: 0 auto; border-radius: 50%; border: 1.5mm solid var(--c2); object-fit: cover; }
.face .ph-empty { align-items: center; justify-content: center; text-align: center; padding: 4mm; font-size: 7.5pt; }
.face figcaption { position: static; margin-top: 1.5mm; padding: 0; background: none; color: #1f2937; font-size: 8.5pt; }
.has-bg .face figcaption { color: #fff; }
/* Monthly: Rajasthan Focus */
.rj-head { position: relative; padding: 0 14mm; }
.rj-head .eyebrow { color: var(--c); opacity: 1; }
.rj-head h1 { color: var(--cdd); }
.rj-head .date-pill { background: var(--c); color: #fff; }
.has-bg .rj-head h1, .has-bg .rj-head .eyebrow { color: #fff; }
.rj-photo { position: relative; margin: 5mm 10mm 0; height: 100mm; }
.rj-fr { height: 100%; border-radius: 4mm; border: 1.5mm solid #fff; box-shadow: 0 1mm 4mm rgba(0,0,0,.2); }
.rj-photo .ribbon { position: absolute; right: 5mm; bottom: -4mm; }
.rj-panel { position: relative; margin: 8mm 10mm 4mm; padding: 6mm 8mm; border-radius: 5mm; color: #fff; background: linear-gradient(135deg, var(--c2d), var(--cd)); }
.rj-panel h3 { margin: 0 0 3mm; font-size: 13pt; }
.rj-panel ul { margin: 0; padding-left: 5mm; }
.rj-panel li { padding: 1mm 0; font-size: 10pt; line-height: 1.35; }
.m-rajasthan .panel { flex: none; margin-top: auto; padding: 0; background: none; }
.rj-panel { flex: 1; }
/* Monthly: Exam Pack */
.m-exam { color: #fff; }
.ex-head { position: relative; padding: 0 14mm; }
.ex-head h1 { font-size: 40pt; text-transform: uppercase; }
html[lang="hi"] .ex-head h1 { text-transform: none; }
.ex-ribbon { position: relative; margin: 6mm -4mm 0; padding: 3mm 18mm; background: var(--c2); color: #111827; font-size: 17pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; transform: rotate(-2.5deg); box-shadow: 0 1mm 3mm rgba(0,0,0,.3); }
.ex-mid { position: relative; display: flex; align-items: center; gap: 6mm; margin: 8mm 12mm 0; }
.ex-badges { display: flex; flex-direction: column; gap: 4mm; flex: none; }
.badge { width: 30mm; height: 30mm; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: var(--c2); color: #111827; border: 1.2mm dashed rgba(17,24,39,.35); }
.badge b { font-size: 20pt; line-height: 1; }
.badge span { margin-top: 1mm; padding: 0 3mm; font-size: 7pt; font-weight: 700; line-height: 1.15; text-transform: uppercase; }
.ex-frames { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; height: 98mm; }
.ex-frames.n3 .fr:first-child { grid-column: span 2; }
.ex-fr { border: 1.5mm solid #fff; border-radius: 2mm; box-shadow: 0 1.5mm 4mm rgba(0,0,0,.35); }
.ex-story { position: relative; margin: 6mm 14mm 4mm; font-size: 20pt; line-height: 1.2; }
.m-exam .panel { color: #1f2937; }
/* Ad and notes pages */
.full-page { page: full; break-before: page; break-after: page; position: relative; width: 100%; height: 297mm; overflow: hidden; background: #fff; }
.full-page img { display: block; width: 100%; height: 100%; }
.full-page img.fill { object-fit: cover; }
.full-page img.fit { object-fit: contain; }
.page-mark { position: absolute; left: 0; top: 0; display: block; width: 1px; height: 1px; }
.notes-page { position: relative; break-before: page; break-after: page; height: 262mm; display: flex; flex-direction: column; }
.notes-page h2 { margin: 0 0 4mm; padding-bottom: 2mm; font-size: 16pt; color: var(--accent, #6d28d9); border-bottom: 1mm solid var(--accent, #6d28d9); }
.rules { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.rule { border-bottom: .3mm solid #cbd5e1; height: 0; }
.notes-brand { margin-top: 4mm; font-size: 8pt; color: #94a3b8; text-align: right; }
`;
