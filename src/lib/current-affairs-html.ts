// The magazine as a printable A4 HTML page, one language a page: the Hindi
// issue and the English issue are made from the same stories. Cloudflare's
// browser rendering turns it into the PDF; the admin panel shows the same
// HTML as a preview.
import {
  CATEGORIES,
  DEFAULT_MAGAZINE_SETTINGS,
  categoryLabel,
  formatDate,
  type Bi,
  type CaContent,
  type CaFact,
  type CaImage,
  type MagazineSettings,
  sourcePublishers,
} from "@/lib/current-affairs";
import { VISUAL_CSS, pointsToShow, visualHtml, type Visual } from "@/lib/ca-visuals";
import type { CaFeature } from "@/lib/ca-feature";
import {
  COVER_CSS,
  COVER_FONTS,
  adPageHtml,
  coverHtml,
  notesPageHtml,
  type CoverLook,
  type CoverParts,
} from "@/lib/ca-cover-html";
import {
  DAILY_LAYOUTS,
  DEFAULT_COLOR2,
  normalizeAds,
  normalizeIssueDesign,
  type IssueDesign,
} from "@/lib/ca-covers";

export type MagazineItem = {
  id: string;
  issue_date: string;
  category: string;
  importance: number;
  rajasthan: boolean;
  content: CaContent;
  facts: CaFact[];
  context_sources: { title: string }[];
  source_names: string[];
};

// A correction approved this month: the story's day and headline, what
// changed, and the values before and after.
export type MagazineCorrection = {
  date: string;
  summary: Bi;
  headline?: Bi;
  changes?: { from: Bi; to: Bi }[];
};

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const safeColor = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#6d28d9");
const safeUrl = (u: string) => (/^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");

export type Lang = "en" | "hi";

// A part in the issue's language (the other one when it's missing: the
// Hindi–English check flags those before scheduling).
const pick = (b: Bi | null | undefined, lang: Lang) =>
  ((lang === "hi" ? b?.hi || b?.en : b?.en || b?.hi) ?? "").trim();

function block(b: Bi | null | undefined, lang: Lang, cls = ""): string {
  const t = pick(b, lang);
  return t ? `<div class="bi ${cls}">${esc(t)}</div>` : "";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The page's own words in each issue.
const T = {
  en: {
    stories: (n: number) => plural(n, "story", "stories").replace(/^\d+ /, ""),
    sections: (n: number) => (n === 1 ? "section" : "sections"),
    charts: "charts &amp; diagrams",
    questions: "practice questions",
    inThisIssue: "In this issue",
    contents: "Contents",
    corrections: "Corrections",
    background: "Background",
    revision: "60-Second Revision",
    practice: "Practice Questions",
    ctaText: "Free current affairs every morning.",
    edition: "English edition",
    source: "Source",
    rajasthan: "Rajasthan",
    rpsc: "RPSC / RSSB pattern",
    partA: "Part A: Prelims",
    partB: "Part B: Mains",
    key: "Answer key (Part A)",
    quick: "Quick questions",
    quickLines: "Quick questions and key lines",
    oneLine: "One line per story",
    article: "Background Article",
    articleSub: "Static topic behind this month's news",
    thisMonth: (n: number) => `${n} this month`,
    correctionsIntro:
      "These facts changed after the day's issue was posted. The stories in this issue already show them corrected.",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    letters: ["a", "b", "c", "d"],
  },
  hi: {
    stories: (n: number) => (n === 1 ? "खबर" : "खबरें"),
    sections: () => "खंड",
    charts: "चार्ट व आरेख",
    questions: "अभ्यास प्रश्न",
    inThisIssue: "इस अंक में",
    contents: "विषय-सूची",
    corrections: "सुधार",
    background: "पृष्ठभूमि",
    revision: "60 सेकंड रिवीजन",
    practice: "अभ्यास प्रश्न",
    ctaText: "हर सुबह निःशुल्क करेंट अफेयर्स।",
    edition: "हिंदी संस्करण",
    source: "स्रोत",
    rajasthan: "राजस्थान",
    rpsc: "RPSC / RSSB पैटर्न",
    partA: "भाग अ: प्रारंभिक परीक्षा",
    partB: "भाग ब: मुख्य परीक्षा",
    key: "उत्तर कुंजी (भाग अ)",
    quick: "त्वरित प्रश्न",
    quickLines: "त्वरित प्रश्न एवं मुख्य पंक्तियाँ",
    oneLine: "हर खबर एक पंक्ति में",
    article: "पृष्ठभूमि लेख",
    articleSub: "इस महीने की खबरों के पीछे का स्थैतिक विषय",
    thisMonth: (n: number) => `इस महीने ${n}`,
    correctionsIntro:
      "ये तथ्य दैनिक अंक प्रकाशित होने के बाद बदले। इस अंक की खबरों में सही तथ्य दिए गए हैं।",
    weekdays: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
    letters: ["अ", "ब", "स", "द"],
  },
};

// Line icons (Lucide, ISC licence) for the sections.
const ICON_PATHS: Record<string, string> = {
  rajasthan:
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  national:
    '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4z"/>',
  international:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  science:
    '<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  economy: '<path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/>',
  sports:
    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  misc: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  editorial: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  revision: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  practice:
    '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
};

function icon(id: string, cls = "icon"): string {
  const paths = ICON_PATHS[id] ?? ICON_PATHS.misc;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// The story boxes' names from the settings, the same in both issues.
type Boxes = { static: string; dyk: string; why: string };

function boxNames(s: MagazineSettings): Boxes {
  const d = DEFAULT_MAGAZINE_SETTINGS;
  return {
    static: esc(s.box_static?.trim() || d.box_static),
    dyk: esc(s.box_dyk?.trim() || d.box_dyk),
    why: esc(s.box_why?.trim() || d.box_why),
  };
}

// The usable width of a story box, the height image rows aim for, and the
// tallest a row may be.
const ROW_WIDTH_MM = 176;
const ROW_TARGET_MM = 55;
const ROW_MAX_MM = 75;
const GAP_MM = 2.5;
const MAX_PER_ROW = 3;
const ROW_OWN_MAX_MM = 100;
// An image beside the text: about this tall, within these widths.
const SIDE_HEIGHT_MM = 62;
const SIDE_MIN_MM = 42;
const SIDE_MAX_MM = 82;
// A generous width for one caption letter (8pt), and the most lines shown.
const CAPTION_CHAR_MM = 1.9;
const CAPTION_MAX_LINES = 4;

const imageRatio = (i: CaImage) => Math.min(6, Math.max(0.2, i.w / i.h));

// A row's height when its images fill the story's width.
const rowHeight = (row: CaImage[]) =>
  (ROW_WIDTH_MM - GAP_MM * (row.length - 1)) / row.reduce((n, i) => n + imageRatio(i), 0);

// The editor's images in rows of equal height that fill the story's width,
// whatever their shapes: each image is as wide as its share of the row's
// width-to-height ratios. The images keep their order and are split into
// rows of 1 to 3 whose heights come closest to the target; an image set to
// "own row" sits alone. The layout depends only on the images, so it is the
// same in the Hindi and English issues. Images beside the text aren't in
// the rows.
export function imageRows(images: CaImage[]): CaImage[][] {
  const rows: CaImage[][] = [];
  let run: CaImage[] = [];
  const flush = () => {
    rows.push(...bestRows(run));
    run = [];
  };
  for (const img of images) {
    if (img.layout === "own") {
      flush();
      rows.push([img]);
    } else run.push(img);
  }
  flush();
  return rows;
}

function bestRows(images: CaImage[]): CaImage[][] {
  const n = images.length;
  const best: { cost: number; from: number }[] = [{ cost: 0, from: 0 }];
  for (let end = 1; end <= n; end++) {
    best[end] = { cost: Infinity, from: 0 };
    for (let start = Math.max(0, end - MAX_PER_ROW); start < end; start++) {
      const cost = best[start].cost + (rowHeight(images.slice(start, end)) - ROW_TARGET_MM) ** 2;
      if (cost < best[end].cost) best[end] = { cost, from: start };
    }
  }
  const rows: CaImage[][] = [];
  for (let end = n; end > 0; end = best[end].from) rows.unshift(images.slice(best[end].from, end));
  return rows;
}

export const isSideImage = (i: CaImage) => i.layout === "right" || i.layout === "left";

// The lines a caption needs at a width (in either language, so both issues
// keep the same space).
function captionLines(i: CaImage, widthMm: number): number {
  const chars = Math.max(i.caption?.en.trim().length ?? 0, i.caption?.hi.trim().length ?? 0);
  return Math.min(CAPTION_MAX_LINES, Math.ceil((chars * CAPTION_CHAR_MM) / widthMm));
}

function figureHtml(i: CaImage, lang: Lang, style: string, lines: number, credits: boolean) {
  const r = imageRatio(i);
  const cap = lines
    ? `<figcaption style="height:${(lines * 1.35).toFixed(2)}em;-webkit-line-clamp:${lines}">${esc(pick(i.caption, lang))}</figcaption>`
    : "";
  const credit = credits ? `<div class="img-credit">${esc(i.credit?.trim() ?? "")}</div>` : "";
  return `<figure style="${style}"><img src="${esc(safeUrl(i.url))}" alt="" style="aspect-ratio:${r.toFixed(4)}" />${credit}${cap}</figure>`;
}

const usableImages = (images: CaImage[] | undefined) =>
  (images ?? []).filter((i) => safeUrl(i.url) && i.w > 0 && i.h > 0);

function imagesHtml(images: CaImage[] | undefined, lang: Lang): string {
  const usable = usableImages(images).filter((i) => !isSideImage(i));
  if (!usable.length) return "";
  const rows = imageRows(usable).map((row) => {
    const sum = row.reduce((n, i) => n + imageRatio(i), 0);
    // A row of tall images is kept to the tallest height, centred (an image
    // on its own row may be a little taller).
    const maxH = row.length === 1 && row[0].layout === "own" ? ROW_OWN_MAX_MM : ROW_MAX_MM;
    const capped =
      rowHeight(row) > maxH
        ? ` style="max-width:${(maxH * sum + GAP_MM * (row.length - 1)).toFixed(1)}mm"`
        : "";
    // Caption and credit space is the same in both issues, so the rows line
    // up: the lines the longest caption needs, in either language.
    const rowWidth = Math.min(ROW_WIDTH_MM, maxH * sum + GAP_MM * (row.length - 1));
    const lines = Math.max(
      0,
      ...row.map((i) =>
        captionLines(i, ((rowWidth - GAP_MM * (row.length - 1)) * imageRatio(i)) / sum),
      ),
    );
    const credits = row.some((i) => i.credit?.trim());
    return `<div class="img-row"${capped}>${row
      .map((i) =>
        // Shares of 100: flex hands out only part of the width when the
        // grow factors add up to less than 1.
        figureHtml(i, lang, `flex:${((imageRatio(i) / sum) * 100).toFixed(3)} 1 0`, lines, credits),
      )
      .join("")}</div>`;
  });
  return `<div class="images">${rows.join("")}</div>`;
}

// Images beside the story's text (portraits and squares save space this
// way): floated at the top of the story, the text running down beside them.
function sideImagesHtml(images: CaImage[] | undefined, lang: Lang): string {
  return usableImages(images)
    .filter(isSideImage)
    .map((i) => {
      const width = Math.min(SIDE_MAX_MM, Math.max(SIDE_MIN_MM, imageRatio(i) * SIDE_HEIGHT_MM));
      return figureHtml(
        i,
        lang,
        `width:${width.toFixed(1)}mm`,
        captionLines(i, width),
        Boolean(i.credit?.trim()),
      ).replace("<figure ", `<figure class="img-side ${i.layout}" `);
    })
    .join("");
}

function itemHtml(
  item: MagazineItem,
  number: number,
  showDate: boolean,
  accent: string,
  lang: Lang,
  boxes: Boxes,
): string {
  const c = item.content;
  const t = T[lang];
  // Facts the visual shows aren't repeated as points.
  const shown = pointsToShow(c)
    .map((p) => pick(p, lang))
    .filter(Boolean);
  const points = shown.length
    ? `<div class="bi points"><ul>${shown.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`
    : "";
  const tags = [
    item.rajasthan && item.category !== "rajasthan"
      ? `<span class="tag raj">${t.rajasthan}</span>`
      : "",
    showDate ? `<span class="tag">${esc(formatDate(item.issue_date, lang))}</span>` : "",
    item.source_names.length
      ? `<span class="tag src-tag">${t.source}: ${esc(item.source_names.join(", "))}</span>`
      : "",
  ].join("");
  // Static Connect: textbook facts on the concepts the news links to, each
  // led by its keyword (older stories: one background paragraph).
  const statics = (c.statics ?? [])
    .map((f) => {
      const k = pick(f.keyword, lang);
      const text = pick(f.text, lang);
      return text ? `<div class="bi">${k ? `<b>${esc(k)}:</b> ` : ""}${esc(text)}</div>` : "";
    })
    .join("");
  const background =
    pick(c.background, lang) || statics
      ? `<div class="box context"><div class="box-title">${boxes.static}</div>${block(c.background, lang)}${statics}${
          item.context_sources.length
            ? `<div class="src">${t.source}: ${esc(sourcePublishers(item.context_sources).join(", "))}</div>`
            : ""
        }</div>`
      : "";
  const why = pick(c.why, lang)
    ? `<div class="box why"><div class="box-title">${boxes.why}</div>${block(c.why, lang)}</div>`
    : "";
  const dyk = (c.dyk ?? []).filter((d) => pick(d, lang));
  const dykBox = dyk.length
    ? `<div class="box dyk"><div class="box-title">${boxes.dyk}</div><ul>${dyk
        .map((d) => `<li>${esc(pick(d, lang))} <span class="site">(${esc(d.site)})</span></li>`)
        .join("")}</ul></div>`
    : "";
  return `<article class="item">
  <div class="item-head"><span class="num">${number}</span><div class="heads"><h3>${esc(pick(c.headline, lang))}</h3></div></div>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
  ${sideImagesHtml(c.images, lang)}
  ${block(c.summary, lang, "summary")}
  ${imagesHtml(c.images, lang)}
  ${c.visual ? visualHtml(c.visual, accent, lang) : ""}
  ${c.visual2 ? visualHtml(c.visual2, accent, lang) : ""}
  ${points}
  ${why}
  ${background}
  ${dykBox}
</article>`;
}

const CSS = (accent: string) => `
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Noto Sans", "Noto Sans Devanagari", sans-serif; font-size: 10pt; line-height: 1.45; color: #1f2937; }
[lang="hi"], .hi { font-family: "Noto Sans Devanagari", "Noto Sans", sans-serif; }
.accent { color: ${accent}; }
.watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
.watermark img { width: 60%; opacity: .06; transform: rotate(-30deg); }
.watermark span { font-size: 80pt; font-weight: 700; color: ${accent}; opacity: .05; transform: rotate(-30deg); }
.cover, .section { position: relative; z-index: 1; }
.section { margin-bottom: 6mm; }
.section.new-page { page-break-before: always; }
.section-title { break-after: avoid; display: flex; justify-content: space-between; align-items: baseline; background: ${accent}; color: #fff; padding: 3mm 5mm; border-radius: 3mm; margin-bottom: 5mm; }
.section-title h2 { margin: 0; font-size: 15pt; }
.section-title span { font-size: 11pt; opacity: .9; }
.item { border: 1px solid #e5e7eb; border-left: 4px solid ${accent}; border-radius: 3mm; padding: 3mm 4mm; margin-bottom: 4mm; }
.item-head { display: flex; gap: 3mm; align-items: flex-start; break-inside: avoid; break-after: avoid; }
.num { flex: none; width: 7mm; height: 7mm; border-radius: 50%; background: ${accent}; color: #fff; font-weight: 700; font-size: 9pt; display: flex; align-items: center; justify-content: center; margin-top: 1mm; }
.heads h3 { margin: 0; font-size: 12pt; line-height: 1.3; }
.heads h4 { margin: .5mm 0 0; font-size: 9.5pt; font-weight: 600; color: #475569; }
.tags { margin: 2mm 0 0 10mm; display: flex; gap: 2mm; flex-wrap: wrap; }
.tag { font-size: 8pt; padding: .5mm 2mm; border-radius: 2mm; background: #f1f5f9; color: #475569; }
.tag.raj { background: #fff7ed; color: #c2410c; }
.tag.src-tag { background: transparent; color: #94a3b8; padding-left: 0; }
.bi { margin-top: 2mm; }
.bi li, .box { break-inside: avoid; }
.bi .en { color: #334155; }
.bi ul { margin: 0; padding-left: 4.5mm; }
.bi li { margin-bottom: .6mm; }
.box { margin-top: 2.5mm; border-radius: 2mm; padding: 2mm 3mm; }
.box .bi { margin-top: 1mm; }
.box-title { font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: .02em; }
.why { background: #f8fafc; }
.why .box-title { color: ${accent}; }
.context { background: #ecfdf5; border: 1px solid #a7f3d0; }
.context .box-title { color: #047857; }
.dyk { background: #f0f9ff; border: 1px dashed #7dd3fc; }
.dyk .box-title { color: #0369a1; }
.dyk ul { margin: 1mm 0 0; padding-left: 4.5mm; }
.dyk li { margin-bottom: 1mm; break-inside: avoid; }
.dyk .en { color: #475569; }
.dyk .site { color: #94a3b8; font-size: 8pt; }
.part { font-size: 11pt; color: ${accent}; margin: 5mm 0 3mm; break-after: avoid; text-transform: uppercase; letter-spacing: .06em; }
.mcq { display: flex; gap: 2mm; break-inside: avoid; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 1px dashed #e5e7eb; }
.qn { flex: none; width: 6mm; font-weight: 700; color: ${accent}; }
.pair { flex: 1; }
.side .stmt { white-space: pre-line; font-weight: 600; }
.side[lang="en"] { color: #334155; }
.side ol { list-style: none; margin: 1.5mm 0 0; padding: 0; }
.side li { margin-bottom: .6mm; }
.opt { font-weight: 600; color: ${accent}; }
.answers { border-collapse: collapse; width: 100%; }
.answers td { padding: 1.5mm 2.5mm; border: 1px solid #e5e7eb; font-size: 9pt; vertical-align: top; }
.answers .kn, .answers .ka { width: 9mm; text-align: center; font-weight: 600; }
.answers .en { color: #475569; }
.corrections { list-style: none; margin: 0; padding: 0; }
.corrections li { margin-bottom: 3.5mm; padding-bottom: 3mm; border-bottom: 1px dashed #e5e7eb; break-inside: avoid; }
.corrections .c-date { font-size: 8.5pt; font-weight: 600; color: ${accent}; text-transform: uppercase; letter-spacing: .04em; }
.corrections .c-head { font-weight: 700; margin: .5mm 0 1mm; }
.corrections .en { color: #475569; }
.corrections .c-change { margin-top: 1mm; font-size: 9.5pt; }
.corrections .c-change s { color: #94a3b8; }
.corrections-intro { color: #475569; font-size: 9.5pt; margin: 0 0 4mm; }
.icon { width: 1.15em; height: 1.15em; vertical-align: -0.2em; flex: none; }
.section-title h2 { display: flex; align-items: center; gap: 2.5mm; }
.toc-row span { display: inline-flex; align-items: center; gap: 2mm; }
.toc-row .icon { color: ${accent}; }
.rev-cat { display: flex; align-items: center; gap: 2mm; font-size: 10pt; color: ${accent}; margin: 4mm 0 2mm; break-after: avoid; text-transform: uppercase; letter-spacing: .06em; }
.rev { width: 100%; border-collapse: collapse; table-layout: fixed; }
.visual + .points { margin-top: 2.5mm; }
.visual + .visual { margin-top: 2.5mm; }
.rev td { padding: 1.6mm 2.5mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 9.2pt; }
.rev tr { break-inside: avoid; }
.rev .rn { width: 7mm; font-weight: 700; color: ${accent}; }
.rev .en { color: #475569; }
.feat-title { font-size: 15pt; line-height: 1.35; margin: 2mm 0 1mm; }
.feat-title .en { font-size: 12pt; color: #475569; }
.feat-intro p { margin: 0; font-style: italic; }
.feat-sec { break-inside: avoid; margin-top: 4mm; }
.feat-h { font-size: 11pt; color: ${accent}; margin: 0 0 1mm; }
.feat-src { margin-top: 4mm; font-size: 8.5pt; color: #64748b; }
.rev .ans { font-weight: 700; color: ${accent}; }
.images { margin-top: 2.5mm; }
.img-row { display: flex; gap: ${GAP_MM}mm; align-items: flex-start; margin: 0 auto 2mm; break-inside: avoid; }
.img-row figure { margin: 0; min-width: 0; }
.img-row img { display: block; width: 100%; height: auto; border-radius: 1.5mm; background: #f1f5f9; object-fit: cover; }
.item { display: flow-root; }
.img-side { margin: 2mm 0 2mm; break-inside: avoid; }
.img-side.right { float: right; clear: right; margin-left: 4mm; }
.img-side.left { float: left; clear: left; margin-right: 4mm; }
.img-side img { display: block; width: 100%; height: auto; border-radius: 1.5mm; background: #f1f5f9; object-fit: cover; }
.img-side figcaption { margin-top: 1mm; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; font-size: 8pt; line-height: 1.35; color: #64748b; }
.item .box { display: flow-root; }
.img-side.left ~ .bi ul { list-style-position: inside; padding-left: 0; }
.images, .item .visual { clear: both; }
.img-credit { margin-top: .6mm; font-size: 6.8pt; line-height: 1.3; height: 1.3em; color: #94a3b8; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.img-row figcaption { margin-top: 1mm; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; font-size: 8pt; line-height: 1.35; color: #64748b; }
${VISUAL_CSS(accent)}
${COVER_CSS}
`;

const hasRevision = (i: MagazineItem) =>
  Boolean(
    (i.content.quick && (i.content.quick.q.en || i.content.quick.q.hi)) ||
    (i.content.oneliner && (i.content.oneliner.en || i.content.oneliner.hi)),
  );

// One quick question (or, on older stories, one line) per story, by section,
// for last-minute revision.
function revisionPage(groups: Map<string, MagazineItem[]>, lang: Lang): string {
  const t = T[lang];
  let n = 0;
  let asked = 0;
  const parts = [...groups.entries()]
    .map(([cat, list]) => {
      const rows = list
        .filter(hasRevision)
        .map((i) => {
          const q = i.content.quick;
          if (q && (q.q.en || q.q.hi)) {
            asked++;
            return `<tr><td class="rn">${++n}</td><td>${esc(pick(q.q, lang))} <span class="ans">— ${esc(pick(q.a, lang))}</span></td></tr>`;
          }
          return `<tr><td class="rn">${++n}</td><td>${esc(pick(i.content.oneliner, lang))}</td></tr>`;
        })
        .join("");
      return rows
        ? `<h3 class="rev-cat">${icon(cat)} ${esc(categoryLabel(cat)[lang])}</h3><table class="rev">${rows}</table>`
        : "";
    })
    .join("");
  if (!n) return "";
  const sub = asked === n ? t.quick : asked ? t.quickLines : t.oneLine;
  return `<section class="section new-page"><div class="section-title"><h2>${icon("revision")} ${t.revision}</h2><span>${sub}</span></div>${parts}</section>`;
}

// The monthly background article: its sections, one exam fact a line.
function featurePage(f: CaFeature, lang: Lang): string {
  const t = T[lang];
  const lines = (text: string) =>
    text
      .split(/\n+/)
      .map((l) => l.replace(/^[\s•\-–*]+/, "").trim())
      .filter(Boolean);
  const sections = f.sections
    .map(
      (s) =>
        `<div class="feat-sec"><h3 class="feat-h">${esc(pick(s.heading, lang))}</h3><div class="bi"><ul>${lines(
          pick(s.body, lang),
        )
          .map((l) => `<li>${esc(l)}</li>`)
          .join("")}</ul></div></div>`,
    )
    .join("");
  const sources = f.sources.length
    ? `<p class="feat-src">${t.source}: ${esc(f.sources.join(", "))}</p>`
    : "";
  return `<section class="section new-page feature"><div class="section-title"><h2>${icon("background")} ${t.article}</h2><span>${t.articleSub}</span></div><h2 class="feat-title">${esc(pick(f.title, lang))}</h2><div class="bi feat-intro"><p>${esc(pick(f.intro, lang))}</p></div>${sections}${sources}</section>`;
}

function mcqSide(question: string, options: string[], letters: string[]): string {
  return `<div class="side"><div class="stmt">${esc(question)}</div><ol>${options
    .map((o, i) => `<li><span class="opt">(${letters[i] ?? i + 1})</span> ${esc(o)}</li>`)
    .join("")}</ol></div>`;
}

// The last section: RAS Prelims MCQs (RPSC pattern) with an answer key, then
// RAS Mains questions.
function practicePage(items: MagazineItem[], lang: Lang): string {
  const t = T[lang];
  const withMcq = items.filter((i) => i.content.mcq);
  const withMains = items.filter((i) => pick(i.content.mains, lang));
  if (!withMcq.length && !withMains.length) return "";
  const qs = withMcq
    .map((i, n) => {
      const m = i.content.mcq!;
      return `<div class="mcq"><span class="qn">${n + 1}.</span><div class="pair">${mcqSide(
        pick(m.question, lang),
        m.options.map((o) => pick(o, lang)),
        t.letters,
      )}</div></div>`;
    })
    .join("");
  const key = withMcq
    .map((i, n) => {
      const m = i.content.mcq!;
      return `<tr><td class="kn">${n + 1}</td><td class="ka">(${t.letters[m.answer] ?? m.answer + 1})</td><td>${esc(pick(m.explanation, lang))}</td></tr>`;
    })
    .join("");
  const mains = withMains
    .map(
      (i, n) =>
        `<div class="mcq"><span class="qn">${n + 1}.</span><div class="pair"><div class="side">${esc(pick(i.content.mains, lang))}</div></div></div>`,
    )
    .join("");
  return `<section class="section new-page"><div class="section-title"><h2>${icon("practice")} ${t.practice}</h2><span>${t.rpsc}</span></div>
${qs ? `<h3 class="part">${t.partA}</h3>${qs}` : ""}
${mains ? `<h3 class="part">${t.partB}</h3>${mains}` : ""}
${key ? `<h3 class="part">${t.key}</h3><table class="answers">${key}</table>` : ""}</section>`;
}

export function renderMagazine(opts: {
  kind: "daily" | "monthly";
  period: string;
  // The issue's language: the Hindi issue or the English issue.
  lang: Lang;
  settings: MagazineSettings;
  items: MagazineItem[];
  corrections?: MagazineCorrection[];
  // Monthly only: the background article, when included.
  feature?: CaFeature | null;
  // Monthly only: the issue's cover, ads and back cover.
  design?: IssueDesign | null;
  // Ruled notes pages before the back cover, so a printed issue's back
  // cover lands on the outside.
  fillers?: number;
  // Only the cover, for the editor's preview.
  coverOnly?: boolean;
}): string {
  const s = opts.settings;
  const lang = opts.lang;
  const t = T[lang];
  const monthly = opts.kind === "monthly";
  const design = monthly ? normalizeIssueDesign(opts.design) : null;
  const cover = design?.cover;
  const ownColor = cover?.color ? safeColor(cover.color) : "";
  // A monthly cover's colour is the whole issue's, unless set for the cover
  // only.
  const accent = ownColor && cover?.color_scope !== "cover" ? ownColor : safeColor(s.accent);
  const ads = normalizeAds(s.ads);
  const adById = (id: string | undefined) => (id ? ads.find((a) => a.id === id) : undefined);
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  const items = [...opts.items].sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.issue_date.localeCompare(b.issue_date) ||
      b.importance - a.importance,
  );
  const groups = new Map<string, MagazineItem[]>();
  for (const it of items) {
    const list = groups.get(it.category) ?? [];
    list.push(it);
    groups.set(it.category, list);
  }

  const title =
    lang === "hi"
      ? monthly
        ? (s.title_hi || s.title_en).replace(/दैनिक/, "मासिक")
        : s.title_hi || s.title_en
      : monthly
        ? s.title_en.replace(/^Daily/i, "Monthly")
        : s.title_en;
  const dateLine = monthly
    ? formatDate(opts.period, lang, false)
    : `${t.weekdays[new Date(`${opts.period}T00:00:00Z`).getUTCDay()]}, ${formatDate(opts.period, lang)}`;
  // Chrome repeats fixed elements on every printed page.
  const watermark = safeUrl(s.logo_main_url)
    ? `<div class="watermark"><img src="${esc(safeUrl(s.logo_main_url))}" alt="" /></div>`
    : `<div class="watermark"><span>FlashGyan</span></div>`;
  // The most exam-relevant stories lead the cover.
  const byImportance = [...items].sort((a, b) => b.importance - a.importance);
  const top = byImportance.slice(0, monthly ? 6 : 4);
  // The join link, shown as its @username (t.me/RASbandhu → @RASbandhu).
  const joinUrl = safeUrl((s.join_url ?? DEFAULT_MAGAZINE_SETTINGS.join_url).trim());
  const handle = /^https:\/\/t\.me\/([A-Za-z0-9_]{4,})\/?$/.exec(joinUrl)?.[1];
  const joinText = esc(s.join_text?.trim() || DEFAULT_MAGAZINE_SETTINGS.join_text);
  const tagline = ((lang === "hi" ? s.tagline_hi || s.tagline_en : s.tagline_en) ?? "").trim();
  const boxes = boxNames(s);
  const questions =
    items.filter((i) => i.content.mcq).length +
    items.filter((i) => pick(i.content.mains, lang)).length;
  const revisionCount = items.filter(hasRevision).length;
  const visuals = items.reduce(
    (n, i) => n + (i.content.visual ? 1 : 0) + (i.content.visual2 ? 1 : 0),
    0,
  );
  const toc = [...groups.entries()]
    .map(
      ([cat, list]) =>
        `<div class="toc-row"><span>${icon(cat)} ${esc(categoryLabel(cat)[lang])}</span><b>${list.length}</b></div>`,
    )
    .join("");

  let n = 0;
  const sections = [...groups.entries()]
    .map(([cat, list]) => {
      // A monthly issue can print an ad page after any section.
      const ad = adById(design?.section_ads[cat]);
      return `<section class="section${monthly ? " new-page" : ""}"><div class="section-title"><h2>${icon(cat)} ${esc(categoryLabel(cat)[lang])}</h2><span>${list.length} ${t.stories(list.length)}</span></div>${list
        .map((it) => itemHtml(it, ++n, monthly, accent, lang, boxes))
        .join("")}</section>${ad ? adPageHtml(ad, lang, cat) : ""}`;
    })
    .join("");

  // The month's corrections, on a page of their own: the facts that changed
  // after a day's issue was posted (this issue already prints them corrected).
  const fixes = opts.corrections ?? [];
  const change = (c: NonNullable<MagazineCorrection["changes"]>[number]) => {
    const from = pick(c.from, lang);
    const to = pick(c.to, lang);
    return from || to ? `<div class="c-change"><s>${esc(from)}</s> → <b>${esc(to)}</b></div>` : "";
  };
  const corrections = fixes.length
    ? `<section class="section${monthly ? " new-page" : ""}"><div class="section-title"><h2>✏️ ${t.corrections}</h2><span>${t.thisMonth(fixes.length)}</span></div><p class="corrections-intro">${t.correctionsIntro}</p><ol class="corrections">${fixes
        .map(
          (c) =>
            `<li><div class="c-date">${esc(formatDate(c.date, lang))}</div>${
              pick(c.headline, lang)
                ? `<div class="c-head">${esc(pick(c.headline, lang))}</div>`
                : ""
            }<div>${esc(pick(c.summary, lang))}</div>${(c.changes ?? []).map(change).join("")}</li>`,
        )
        .join("")}</ol></section>`
    : "";

  const tocHtml = `${toc}${fixes.length ? `<div class="toc-row"><span>✏️ ${t.corrections}</span><b>${fixes.length}</b></div>` : ""}${opts.feature ? `<div class="toc-row"><span>${icon("background")} ${t.background}: ${esc(pick(opts.feature.title, lang))}</span><b>1</b></div>` : ""}${revisionCount ? `<div class="toc-row"><span>${icon("revision")} ${t.revision}</span><b>${revisionCount}</b></div>` : ""}${questions ? `<div class="toc-row"><span>${icon("practice")} ${t.practice}</span><b>${questions}</b></div>` : ""}`;
  const parts: CoverParts = {
    lang,
    period: opts.period,
    title,
    dateLine,
    tagline,
    brand: s.brand_line,
    edition: t.edition,
    logoMain: safeUrl(s.logo_main_url),
    logoPartner: safeUrl(s.logo_partner_url),
    stats: [
      { n: items.length, label: t.stories(items.length) },
      { n: groups.size, label: t.sections(groups.size) },
      ...(visuals ? [{ n: visuals, label: t.charts }] : []),
      { n: questions, label: t.questions },
    ],
    top: top.map((i) => ({
      cat: categoryLabel(i.category)[lang],
      headline: pick(i.content.headline, lang),
      summary: pick(i.content.summary, lang),
    })),
    rajasthan: byImportance
      .filter((i) => i.rajasthan || i.category === "rajasthan")
      .map((i) => ({ headline: pick(i.content.headline, lang) })),
    inThisIssue: t.inThisIssue,
    contents: t.contents,
    tocHtml,
    ctaHtml: joinUrl
      ? `<a class="cta" href="${esc(joinUrl)}"><div><b>${joinText}</b><span>${t.ctaText}</span></div><div class="cta-handle">${handle ? `@${esc(handle)}` : joinText}</div></a>`
      : "",
  };
  const dailyLayout = DAILY_LAYOUTS.find((l) => l.id === s.daily_cover)?.id ?? "classic";
  const look: CoverLook = cover
    ? { kind: "monthly", cover }
    : { kind: "daily", layout: dailyLayout };
  const coverSection = coverHtml(parts, look, {
    c: ownColor || accent,
    c2: cover?.color2 ? safeColor(cover.color2) : DEFAULT_COLOR2,
  });
  // The back cover (an ad), after any ruled notes pages that bring it to the
  // outside of a printed issue.
  const back = adById(monthly ? design?.back_cover : s.daily_back_cover);
  const notes = Array.from({ length: Math.max(0, Math.min(3, opts.fillers ?? 0)) }, () =>
    notesPageHtml(lang, s.brand_line, accent),
  ).join("");

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(title)} — ${esc(dateLine)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&${COVER_FONTS}&display=swap" rel="stylesheet" />
<style>${CSS(accent)}</style>
</head>
<body>
${
  opts.coverOnly
    ? coverSection
    : `${watermark}
${coverSection}
${sections}
${corrections}
${opts.feature ? featurePage(opts.feature, lang) : ""}
${revisionPage(groups, lang)}
${practicePage(items, lang)}
${notes}
${back ? adPageHtml(back, lang, "back") : ""}`
}
</body>
</html>`;
}

// Page numbers and brand line printed at the bottom of every page.
export function footerTemplate(settings: MagazineSettings): string {
  return `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${esc(settings.brand_line)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

// One story as the issue prints it, in one language, for the editor's
// preview.
export function storyPreviewHtml(
  item: MagazineItem,
  lang: Lang,
  settings: MagazineSettings,
): string {
  const accent = safeColor(settings.accent);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
<style>${CSS(accent)} body { margin: 0; padding: 8px; background: #fff; } .item { margin: 0; }</style></head>
<body>${itemHtml(item, 1, false, accent, lang, boxNames(settings))}</body></html>`;
}

// One visual on its own page, for the admin preview.
export function visualPreviewHtml(visual: Visual, accent = "#6d28d9"): string {
  const a = safeColor(accent);
  return `<!doctype html><html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
<style>${CSS(a)} body { margin: 0; padding: 2px; background: #fff; } .box { margin-top: 0; }</style></head>
<body>${visualHtml(visual, a)}</body></html>`;
}
