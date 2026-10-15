// The magazine as a printable A4 HTML page (Hindi and English side by side).
// Cloudflare's browser rendering turns it into the PDF; the admin panel shows
// the same HTML as a preview.
import {
  CATEGORIES,
  categoryLabel,
  formatDate,
  type Bi,
  type CaContent,
  type CaFact,
  type MagazineSettings,
} from "@/lib/current-affairs";
import { VISUAL_CSS, pointsToShow, visualHtml, type Visual } from "@/lib/ca-visuals";
import type { CaFeature } from "@/lib/ca-feature";

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

export type MagazineCorrection = { date: string; summary: Bi };

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const safeColor = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#6d28d9");
const safeUrl = (u: string) => (/^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");

function biBlock(b: Bi | null | undefined, cls = ""): string {
  if (!b || (!b.hi && !b.en)) return "";
  return `<div class="bi ${cls}"><div class="hi" lang="hi">${esc(b.hi)}</div><div class="en" lang="en">${esc(b.en)}</div></div>`;
}

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

function itemHtml(item: MagazineItem, number: number, showDate: boolean, accent: string): string {
  const c = item.content;
  // Facts the visual shows aren't repeated as points.
  const shown = pointsToShow(c);
  const points = shown.length
    ? `<div class="bi points"><ul class="hi" lang="hi">${shown.map((p) => `<li>${esc(p.hi)}</li>`).join("")}</ul><ul class="en" lang="en">${shown.map((p) => `<li>${esc(p.en)}</li>`).join("")}</ul></div>`
    : "";
  const tags = [
    item.rajasthan && item.category !== "rajasthan" ? `<span class="tag raj">Rajasthan</span>` : "",
    showDate ? `<span class="tag">${esc(formatDate(item.issue_date, "en"))}</span>` : "",
    item.source_names.length
      ? `<span class="tag src-tag">Source: ${esc(item.source_names.join(", "))}</span>`
      : "",
  ].join("");
  const background = c.background
    ? `<div class="box context"><div class="box-title">Background</div>${biBlock(c.background)}${
        item.context_sources.length
          ? `<div class="src">FlashGyan notes: ${esc(item.context_sources.map((s) => s.title).join(", "))}</div>`
          : ""
      }</div>`
    : "";
  const why =
    c.why.en || c.why.hi
      ? `<div class="box why"><div class="box-title">Why it matters</div>${biBlock(c.why)}</div>`
      : "";
  const dyk = c.dyk?.length
    ? `<div class="box dyk"><div class="box-title">Did you know?</div><ul>${c.dyk
        .map(
          (d) =>
            `<li><span lang="hi">${esc(d.hi)}</span><br/><span class="en">${esc(d.en)}</span> <span class="site">(${esc(d.site)})</span></li>`,
        )
        .join("")}</ul></div>`
    : "";
  return `<article class="item">
  <div class="item-head"><span class="num">${number}</span><div class="heads"><h3 lang="hi">${esc(c.headline.hi)}</h3><h4 lang="en">${esc(c.headline.en)}</h4></div></div>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
  ${biBlock(c.summary, "summary")}
  ${c.visual ? visualHtml(c.visual, accent) : ""}
  ${points}
  ${why}
  ${background}
  ${dyk}
</article>`;
}

const CSS = (accent: string) => `
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Noto Sans", "Noto Sans Devanagari", sans-serif; font-size: 9.5pt; line-height: 1.42; color: #1f2937; }
[lang="hi"], .hi { font-family: "Noto Sans Devanagari", "Noto Sans", sans-serif; }
.accent { color: ${accent}; }
.watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
.watermark img { width: 60%; opacity: .06; transform: rotate(-30deg); }
.watermark span { font-size: 80pt; font-weight: 700; color: ${accent}; opacity: .05; transform: rotate(-30deg); }
.cover, .section { position: relative; z-index: 1; }
@page :first { margin: 0; }
.cover { width: 210mm; height: 297mm; display: flex; flex-direction: column; page-break-after: always; background: #fff; overflow: hidden; }
.cover-logos { display: flex; justify-content: space-between; align-items: center; padding: 9mm 14mm 7mm; }
.cover-logos img { height: 16mm; max-width: 75mm; object-fit: contain; }
.brand { font-weight: 700; color: ${accent}; font-size: 15pt; }
.cover-hero { position: relative; margin: 0 10mm; border-radius: 7mm; padding: 13mm 12mm 11mm; color: #fff; overflow: hidden;
  background: radial-gradient(circle at 92% 8%, rgba(255,255,255,.18) 0 22mm, transparent 22.2mm),
    radial-gradient(circle at 78% 105%, rgba(255,255,255,.10) 0 30mm, transparent 30.2mm),
    linear-gradient(135deg, ${accent} 0%, ${darken(accent)} 100%); }
.eyebrow { font-size: 9pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .85; }
.cover-hero h1 { margin: 3mm 0 0; font-size: 38pt; line-height: 1.05; font-weight: 700; letter-spacing: -.01em; max-width: 140mm; }
.date-pill { display: inline-block; margin-top: 6mm; padding: 1.8mm 5mm; border-radius: 20mm; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); font-size: 11pt; font-weight: 600; }
.stats { display: flex; gap: 4mm; margin-top: 9mm; }
.stats div { flex: 1; background: rgba(255,255,255,.12); border-radius: 3.5mm; padding: 3mm 4mm; }
.stats b { display: block; font-size: 20pt; line-height: 1.1; }
.stats span { font-size: 8.5pt; opacity: .9; }
.cover-body { flex: 1; display: flex; flex-direction: column; padding: 8mm 14mm 6mm; }
.cta { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6mm; border-radius: 4mm; padding: 5mm 6mm; background: #f5f3ff; border: 1px solid #ddd6fe; }
.cta b { display: block; font-size: 11pt; color: #1f2937; }
.cta span { font-size: 9pt; color: #64748b; }
.cta-handle { flex: none; padding: 2mm 5mm; border-radius: 20mm; background: ${accent}; color: #fff; font-weight: 700; font-size: 11pt; }
.cover-h { margin: 0 0 3mm; font-size: 10pt; letter-spacing: .12em; text-transform: uppercase; color: ${accent}; }
.hl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; margin-bottom: 8mm; }
.hl { border: 1px solid #e5e7eb; border-top: 3px solid ${accent}; border-radius: 3mm; padding: 3mm 3.5mm; background: #fff; }
.hl-cat { font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${accent}; }
.hl-hi { margin-top: 1mm; font-weight: 700; font-size: 10pt; line-height: 1.35; }
.hl-en { margin-top: .8mm; font-size: 8.5pt; color: #64748b; line-height: 1.35; }
.toc { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
.toc-row { display: flex; justify-content: space-between; padding: 2mm 0; border-bottom: 1px dashed #cbd5e1; font-size: 10pt; }
.toc-row b { color: ${accent}; }
.cover-foot { display: flex; justify-content: space-between; margin: 0 10mm 14mm; border-radius: 4mm; padding: 4mm 6mm; background: ${darken(accent, 0.55)}; color: #fff; font-size: 9pt; }
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
.bi { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 2mm; }
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
.pair { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.side .stmt { white-space: pre-line; font-weight: 600; }
.side[lang="en"] { color: #334155; }
.side ol { list-style: none; margin: 1.5mm 0 0; padding: 0; }
.side li { margin-bottom: .6mm; }
.opt { font-weight: 600; color: ${accent}; }
.answers { border-collapse: collapse; width: 100%; }
.answers td { padding: 1.5mm 2.5mm; border: 1px solid #e5e7eb; font-size: 9pt; vertical-align: top; }
.answers .kn, .answers .ka { width: 9mm; text-align: center; font-weight: 600; }
.answers .en { color: #475569; }
.corrections li { margin-bottom: 2mm; }
.icon { width: 1.15em; height: 1.15em; vertical-align: -0.2em; flex: none; }
.section-title h2 { display: flex; align-items: center; gap: 2.5mm; }
.toc-row span { display: inline-flex; align-items: center; gap: 2mm; }
.toc-row .icon { color: ${accent}; }
.rev-cat { display: flex; align-items: center; gap: 2mm; font-size: 10pt; color: ${accent}; margin: 4mm 0 2mm; break-after: avoid; text-transform: uppercase; letter-spacing: .06em; }
.rev { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rev td:nth-child(2) { width: 47%; }
.visual + .points { margin-top: 2.5mm; }
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
${VISUAL_CSS(accent)}
`;

const hasRevision = (i: MagazineItem) =>
  Boolean(
    (i.content.quick && (i.content.quick.q.en || i.content.quick.q.hi)) ||
    (i.content.oneliner && (i.content.oneliner.en || i.content.oneliner.hi)),
  );

// One quick question (or, on older stories, one line) per story, by section,
// for last-minute revision.
function revisionPage(groups: Map<string, MagazineItem[]>): string {
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
            return `<tr><td class="rn">${++n}</td><td lang="hi">${esc(q.q.hi)} <span class="ans">— ${esc(q.a.hi)}</span></td><td class="en">${esc(q.q.en)} <span class="ans">— ${esc(q.a.en)}</span></td></tr>`;
          }
          const o = i.content.oneliner!;
          return `<tr><td class="rn">${++n}</td><td lang="hi">${esc(o.hi)}</td><td class="en">${esc(o.en)}</td></tr>`;
        })
        .join("");
      return rows
        ? `<h3 class="rev-cat">${icon(cat)} ${esc(categoryLabel(cat).en)}</h3><table class="rev">${rows}</table>`
        : "";
    })
    .join("");
  if (!n) return "";
  const sub =
    asked === n
      ? "Quick questions"
      : asked
        ? "Quick questions and key lines"
        : "One line per story";
  return `<section class="section new-page"><div class="section-title"><h2>${icon("revision")} 60-Second Revision</h2><span>${sub}</span></div>${parts}</section>`;
}

// The monthly background article: bilingual sections, one exam fact a line.
function featurePage(f: CaFeature): string {
  const lines = (t: string) =>
    t
      .split(/\n+/)
      .map((l) => l.replace(/^[\s•\-–*]+/, "").trim())
      .filter(Boolean);
  const sections = f.sections
    .map((s) => {
      const hi = lines(s.body.hi);
      const en = lines(s.body.en);
      return `<div class="feat-sec"><h3 class="feat-h"><span lang="hi">${esc(s.heading.hi)}</span> · <span>${esc(s.heading.en)}</span></h3><div class="bi"><ul class="hi" lang="hi">${hi.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><ul class="en" lang="en">${en.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
    })
    .join("");
  const sources = f.sources.length
    ? `<p class="feat-src">From FlashGyan study notes: ${esc(f.sources.join(", "))}</p>`
    : "";
  return `<section class="section new-page feature"><div class="section-title"><h2>${icon("background")} Background Article</h2><span>Static topic behind this month's news</span></div><h2 class="feat-title"><span lang="hi">${esc(f.title.hi)}</span><br/><span class="en">${esc(f.title.en)}</span></h2><div class="bi feat-intro"><p lang="hi">${esc(f.intro.hi)}</p><p class="en">${esc(f.intro.en)}</p></div>${sections}${sources}</section>`;
}

const OPTION_LETTERS = ["a", "b", "c", "d"];

function mcqSide(question: string, options: string[], lang: "hi" | "en"): string {
  return `<div class="side" lang="${lang}"><div class="stmt">${esc(question)}</div><ol>${options
    .map((o, i) => `<li><span class="opt">(${OPTION_LETTERS[i]})</span> ${esc(o)}</li>`)
    .join("")}</ol></div>`;
}

// The last section: RAS Prelims MCQs (RPSC pattern) with an answer key, then
// RAS Mains questions. Hindi and English sit side by side, as in RPSC papers.
function practicePage(items: MagazineItem[]): string {
  const withMcq = items.filter((i) => i.content.mcq);
  const withMains = items.filter((i) => i.content.mains);
  if (!withMcq.length && !withMains.length) return "";
  const qs = withMcq
    .map((i, n) => {
      const m = i.content.mcq!;
      return `<div class="mcq"><span class="qn">${n + 1}.</span><div class="pair">${mcqSide(
        m.question.hi,
        m.options.map((o) => o.hi),
        "hi",
      )}${mcqSide(
        m.question.en,
        m.options.map((o) => o.en),
        "en",
      )}</div></div>`;
    })
    .join("");
  const key = withMcq
    .map((i, n) => {
      const m = i.content.mcq!;
      return `<tr><td class="kn">${n + 1}</td><td class="ka">(${OPTION_LETTERS[m.answer]})</td><td lang="hi">${esc(m.explanation.hi)}</td><td class="en">${esc(m.explanation.en)}</td></tr>`;
    })
    .join("");
  const mains = withMains
    .map(
      (i, n) =>
        `<div class="mcq"><span class="qn">${n + 1}.</span><div class="pair"><div class="side" lang="hi">${esc(i.content.mains!.hi)}</div><div class="side" lang="en">${esc(i.content.mains!.en)}</div></div></div>`,
    )
    .join("");
  return `<section class="section new-page"><div class="section-title"><h2>${icon("practice")} Practice Questions</h2><span>RPSC pattern</span></div>
${qs ? `<h3 class="part">Part A: Prelims</h3>${qs}` : ""}
${mains ? `<h3 class="part">Part B: Mains</h3>${mains}` : ""}
${key ? `<h3 class="part">Answer key (Part A)</h3><table class="answers">${key}</table>` : ""}</section>`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// A darker shade of the accent colour for the cover gradient.
function darken(hex: string, amount = 0.45): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("")}`;
}

export function renderMagazine(opts: {
  kind: "daily" | "monthly";
  period: string;
  settings: MagazineSettings;
  items: MagazineItem[];
  corrections?: MagazineCorrection[];
  // Monthly only: the background article, when included.
  feature?: CaFeature | null;
}): string {
  const s = opts.settings;
  const accent = safeColor(s.accent);
  const monthly = opts.kind === "monthly";
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

  const title = monthly ? s.title_en.replace(/^Daily/i, "Monthly") : s.title_en;
  const dateLine = monthly
    ? formatDate(opts.period, "en", false)
    : `${WEEKDAYS[new Date(`${opts.period}T00:00:00Z`).getUTCDay()]}, ${formatDate(opts.period, "en")}`;
  // Chrome repeats fixed elements on every printed page.
  const watermark = safeUrl(s.logo_main_url)
    ? `<div class="watermark"><img src="${esc(safeUrl(s.logo_main_url))}" alt="" /></div>`
    : `<div class="watermark"><span>FlashGyan</span></div>`;
  const logo = (u: string) => (safeUrl(u) ? `<img src="${esc(safeUrl(u))}" alt="" />` : "");
  // The most exam-relevant stories lead the cover.
  const top = [...items].sort((a, b) => b.importance - a.importance).slice(0, monthly ? 6 : 4);
  const highlights = top
    .map(
      (i) =>
        `<div class="hl"><span class="hl-cat">${esc(categoryLabel(i.category).en)}</span><div class="hl-hi" lang="hi">${esc(i.content.headline.hi)}</div><div class="hl-en">${esc(i.content.headline.en)}</div></div>`,
    )
    .join("");
  // A public @username (numeric chat ids are not shown).
  const channel = /^@[A-Za-z0-9_]{4,}$/.test(s.channel.trim()) ? s.channel.trim() : "";
  const questions =
    items.filter((i) => i.content.mcq).length + items.filter((i) => i.content.mains).length;
  const revisionCount = items.filter(hasRevision).length;
  const visuals = items.filter((i) => i.content.visual).length;
  const toc = [...groups.entries()]
    .map(
      ([cat, list]) =>
        `<div class="toc-row"><span>${icon(cat)} ${esc(categoryLabel(cat).en)}</span><b>${list.length}</b></div>`,
    )
    .join("");

  let n = 0;
  const sections = [...groups.entries()]
    .map(([cat, list]) => {
      const l = categoryLabel(cat);
      return `<section class="section${monthly ? " new-page" : ""}"><div class="section-title"><h2>${icon(cat)} ${esc(l.en)}</h2><span>${list.length} ${list.length === 1 ? "story" : "stories"}</span></div>${list
        .map((it) => itemHtml(it, ++n, monthly, accent))
        .join("")}</section>`;
    })
    .join("");

  const corrections = opts.corrections?.length
    ? `<section class="section"><div class="section-title"><h2>Updates &amp; corrections</h2><span>This month</span></div><ul class="corrections">${opts.corrections
        .map(
          (c) =>
            `<li><b>${esc(formatDate(c.date, "en"))}:</b> <span lang="hi">${esc(c.summary.hi)}</span><br/><span class="en">${esc(c.summary.en)}</span></li>`,
        )
        .join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)} — ${esc(dateLine)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
<style>${CSS(accent)}</style>
</head>
<body>
${watermark}
<section class="cover">
  <div class="cover-logos">${logo(s.logo_main_url) || `<span class="brand">${esc(s.brand_line)}</span>`}${logo(s.logo_partner_url)}</div>
  <div class="cover-hero">
    <div class="eyebrow">RAS Prelims &amp; Mains · Bilingual</div>
    <h1>${esc(title)}</h1>
    <div class="date-pill">${esc(dateLine)}</div>
    <div class="stats">
      <div><b>${items.length}</b><span>${items.length === 1 ? "story" : "stories"}</span></div>
      <div><b>${groups.size}</b><span>${groups.size === 1 ? "section" : "sections"}</span></div>
      ${visuals ? `<div><b>${visuals}</b><span>charts &amp; diagrams</span></div>` : ""}
      <div><b>${questions}</b><span>practice questions</span></div>
    </div>
  </div>
  <div class="cover-body">
    ${highlights ? `<h3 class="cover-h">In this issue</h3><div class="hl-grid">${highlights}</div>` : ""}
    <h3 class="cover-h">Contents</h3>
    <div class="toc">${toc}${opts.feature ? `<div class="toc-row"><span>${icon("background")} Background: ${esc(opts.feature.title.en)}</span><b>1</b></div>` : ""}${revisionCount ? `<div class="toc-row"><span>${icon("revision")} 60-Second Revision</span><b>${revisionCount}</b></div>` : ""}${questions ? `<div class="toc-row"><span>${icon("practice")} Practice Questions</span><b>${questions}</b></div>` : ""}</div>
    ${
      channel
        ? `<div class="cta"><div><b>Get it every morning on Telegram</b><span>Daily current affairs for RAS, bilingual, free.</span></div><div class="cta-handle">${esc(channel)}</div></div>`
        : ""
    }
  </div>
  <div class="cover-foot"><span>${esc(s.brand_line)}</span><span>हिंदी &amp; English</span></div>
</section>
${sections}
${corrections}
${opts.feature ? featurePage(opts.feature) : ""}
${revisionPage(groups)}
${practicePage(items)}
</body>
</html>`;
}

// Page numbers and brand line printed at the bottom of every page.
export function footerTemplate(settings: MagazineSettings): string {
  return `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${esc(settings.brand_line)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

// One visual on its own page, for the admin preview.
export function visualPreviewHtml(visual: Visual, accent = "#6d28d9"): string {
  const a = safeColor(accent);
  return `<!doctype html><html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
<style>${CSS(a)} body { margin: 0; padding: 2px; background: #fff; } .box { margin-top: 0; }</style></head>
<body>${visualHtml(visual, a)}</body></html>`;
}
