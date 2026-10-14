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

function itemHtml(item: MagazineItem, number: number, showDate: boolean): string {
  const c = item.content;
  const points = c.points.length
    ? `<div class="bi points"><ul class="hi" lang="hi">${c.points.map((p) => `<li>${esc(p.hi)}</li>`).join("")}</ul><ul class="en" lang="en">${c.points.map((p) => `<li>${esc(p.en)}</li>`).join("")}</ul></div>`
    : "";
  const tags = [
    item.rajasthan && item.category !== "rajasthan" ? `<span class="tag raj">राजस्थान</span>` : "",
    item.importance >= 3 ? `<span class="tag star">★ परीक्षा उपयोगी · Exam focus</span>` : "",
    showDate ? `<span class="tag">${esc(formatDate(item.issue_date, "en"))}</span>` : "",
  ].join("");
  const background = c.background
    ? `<div class="box context"><div class="box-title">पृष्ठभूमि · Background</div>${biBlock(c.background)}${
        item.context_sources.length
          ? `<div class="src">FlashGyan notes: ${esc(item.context_sources.map((s) => s.title).join(", "))}</div>`
          : ""
      }</div>`
    : "";
  const why =
    c.why.en || c.why.hi
      ? `<div class="box why"><div class="box-title">RAS हेतु महत्व · Why it matters</div>${biBlock(c.why)}</div>`
      : "";
  return `<article class="item">
  <div class="item-head"><span class="num">${number}</span><div class="heads"><h3 lang="hi">${esc(c.headline.hi)}</h3><h4 lang="en">${esc(c.headline.en)}</h4></div></div>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
  ${biBlock(c.summary, "summary")}
  ${points}
  ${why}
  ${background}
  ${item.source_names.length ? `<div class="src">Source: ${esc(item.source_names.join(", "))}</div>` : ""}
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
.cover { height: 265mm; display: flex; flex-direction: column; page-break-after: always; }
.cover-top { display: flex; justify-content: space-between; align-items: center; }
.cover-top img { height: 18mm; max-width: 70mm; object-fit: contain; }
.brand { font-weight: 700; color: ${accent}; font-size: 14pt; }
.cover-band { margin-top: 18mm; background: ${accent}; color: #fff; border-radius: 6mm; padding: 12mm 10mm; }
.cover-band h1 { margin: 0; font-size: 30pt; line-height: 1.2; }
.cover-band h2 { margin: 2mm 0 0; font-size: 18pt; font-weight: 600; opacity: .95; }
.cover-band .date { margin-top: 6mm; font-size: 13pt; }
.highlights { margin-top: 10mm; }
.highlights h3, .toc h3 { font-size: 12pt; color: ${accent}; border-bottom: 2px solid ${accent}; padding-bottom: 1mm; margin: 0 0 3mm; }
.highlights li { margin-bottom: 1.5mm; }
.toc { margin-top: 8mm; }
.toc table { width: 100%; border-collapse: collapse; }
.toc td { padding: 1.5mm 0; border-bottom: 1px dotted #cbd5e1; }
.toc td:last-child { text-align: right; color: #64748b; }
.cover-foot { margin-top: auto; text-align: center; color: #64748b; font-size: 9pt; }
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
.tag.star { background: #fef9c3; color: #854d0e; }
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
.part { font-size: 11pt; color: ${accent}; margin: 5mm 0 3mm; break-after: avoid; }
.mains-list li { margin-bottom: 2.5mm; break-inside: avoid; }
.mains-list .en, .answers .en { color: #64748b; }
.src { margin-top: 2mm; font-size: 8pt; color: #94a3b8; }
.mcq { break-inside: avoid; margin-bottom: 4mm; }
.mcq .q { display: flex; gap: 2mm; font-weight: 600; }
.mcq .stmt { white-space: pre-line; }
.mcq .stmt.en { color: #475569; font-weight: 500; margin-top: 1mm; }
.mcq ol { margin: 1mm 0 0; padding-left: 6mm; list-style: lower-alpha; }
.answers td { padding: 1mm 3mm; border: 1px solid #e5e7eb; font-size: 9pt; }
.answers { border-collapse: collapse; width: 100%; }
.corrections li { margin-bottom: 2mm; }
`;

// The last section: RAS Prelims MCQs (RPSC pattern) with an answer key, then
// RAS Mains questions from the same news.
function practicePage(items: MagazineItem[]): string {
  const withMcq = items.filter((i) => i.content.mcq);
  const withMains = items.filter((i) => i.content.mains);
  if (!withMcq.length && !withMains.length) return "";
  const qs = withMcq
    .map((i, n) => {
      const m = i.content.mcq!;
      return `<div class="mcq"><div class="q"><span class="qn">${n + 1}.</span><div><div class="stmt" lang="hi">${esc(m.question.hi)}</div><div class="stmt en">${esc(m.question.en)}</div></div></div><ol>${m.options
        .map((o) => `<li><span lang="hi">${esc(o.hi)}</span> / ${esc(o.en)}</li>`)
        .join("")}</ol></div>`;
    })
    .join("");
  const key = withMcq
    .map((i, n) => {
      const m = i.content.mcq!;
      return `<tr><td>${n + 1}</td><td>(${"abcd"[m.answer]})</td><td><span lang="hi">${esc(m.explanation.hi)}</span><br/><span class="en">${esc(m.explanation.en)}</span></td></tr>`;
    })
    .join("");
  const mains = withMains
    .map(
      (i, n) =>
        `<li><span lang="hi">${esc(i.content.mains!.hi)}</span><br/><span class="en">${esc(i.content.mains!.en)}</span></li>`,
    )
    .join("");
  return `<section class="section new-page"><div class="section-title"><h2 lang="hi">अभ्यास प्रश्न</h2><span>Practice Questions</span></div>
${qs ? `<h3 class="part">भाग अ: प्रारंभिक परीक्षा · Part A: Prelims (RPSC pattern)</h3>${qs}` : ""}
${mains ? `<h3 class="part">भाग ब: मुख्य परीक्षा · Part B: Mains</h3><ol class="mains-list">${mains}</ol>` : ""}
${key ? `<h3 class="part">उत्तर कुंजी · Answer key (Part A)</h3><table class="answers">${key}</table>` : ""}</section>`;
}

export function renderMagazine(opts: {
  kind: "daily" | "monthly";
  period: string;
  settings: MagazineSettings;
  items: MagazineItem[];
  corrections?: MagazineCorrection[];
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

  const title = monthly
    ? { hi: s.title_hi.replace("दैनिक", "मासिक"), en: s.title_en.replace(/^Daily/i, "Monthly") }
    : { hi: s.title_hi, en: s.title_en };
  const dateLine = monthly
    ? `${formatDate(opts.period, "hi", false)} · ${formatDate(opts.period, "en", false)}`
    : `${formatDate(opts.period, "hi")} · ${formatDate(opts.period, "en")}`;
  // Chrome repeats fixed elements on every printed page.
  const watermark = safeUrl(s.logo_main_url)
    ? `<div class="watermark"><img src="${esc(safeUrl(s.logo_main_url))}" alt="" /></div>`
    : `<div class="watermark"><span>FlashGyan</span></div>`;
  const logo = (u: string) => (safeUrl(u) ? `<img src="${esc(safeUrl(u))}" alt="" />` : "");
  const highlights = items
    .filter((i) => i.importance >= 3)
    .slice(0, monthly ? 12 : 6)
    .map(
      (i) =>
        `<li><b lang="hi">${esc(i.content.headline.hi)}</b><br/><span class="en">${esc(i.content.headline.en)}</span></li>`,
    )
    .join("");
  const toc = [...groups.entries()]
    .map(([cat, list]) => {
      const l = categoryLabel(cat);
      return `<tr><td><span lang="hi">${esc(l.hi)}</span> · ${esc(l.en)}</td><td>${list.length}</td></tr>`;
    })
    .join("");

  let n = 0;
  const sections = [...groups.entries()]
    .map(([cat, list]) => {
      const l = categoryLabel(cat);
      return `<section class="section${monthly ? " new-page" : ""}"><div class="section-title"><h2 lang="hi">${esc(l.hi)}</h2><span>${esc(l.en)}</span></div>${list
        .map((it) => itemHtml(it, ++n, monthly))
        .join("")}</section>`;
    })
    .join("");

  const corrections = opts.corrections?.length
    ? `<section class="section"><div class="section-title"><h2 lang="hi">अद्यतन एवं संशोधन</h2><span>Updates & corrections</span></div><ul class="corrections">${opts.corrections
        .map(
          (c) =>
            `<li><b>${esc(formatDate(c.date, "en"))}:</b> <span lang="hi">${esc(c.summary.hi)}</span><br/><span class="en">${esc(c.summary.en)}</span></li>`,
        )
        .join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8" />
<title>${esc(title.en)} — ${esc(dateLine)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
<style>${CSS(accent)}</style>
</head>
<body>
${watermark}
<section class="cover">
  <div class="cover-top">${logo(s.logo_main_url) || `<span class="brand">${esc(s.brand_line)}</span>`}${logo(s.logo_partner_url)}</div>
  <div class="cover-band">
    <h1 lang="hi">${esc(title.hi)}</h1>
    <h2>${esc(title.en)}</h2>
    <div class="date">${esc(dateLine)}</div>
  </div>
  ${highlights ? `<div class="highlights"><h3>मुख्य समाचार · Highlights</h3><ul>${highlights}</ul></div>` : ""}
  <div class="toc"><h3>विषय-सूची · Contents</h3><table>${toc}${items.some((i) => i.content.mcq || i.content.mains) ? `<tr><td><span lang="hi">अभ्यास प्रश्न</span> · Practice Questions</td><td>${items.filter((i) => i.content.mcq).length + items.filter((i) => i.content.mains).length}</td></tr>` : ""}</table></div>
  <div class="cover-foot">${esc(s.brand_line)} · RAS Prelims &amp; Mains</div>
</section>
${sections}
${corrections}
${practicePage(items)}
</body>
</html>`;
}

// Page numbers and brand line printed at the bottom of every page.
export function footerTemplate(settings: MagazineSettings): string {
  return `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${esc(settings.brand_line)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}
