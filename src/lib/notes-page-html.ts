// A notes book's topics as Layout A pages: the chapter's opening, each
// topic's notes (Prelims or Mains parts), its map, its past questions, and
// at the chapter's end the sources it used. In the review copy, lines written
// by the AI without a passage carry ◇ until the editor checks them; the
// student copy shows no source marks. Server only (the maps' outlines).
import type { Bi } from "@/lib/current-affairs";
import type { NotesStage } from "@/lib/notes-books";
import type { NoteContent, NotePoint } from "@/lib/notes-write";
import { noteMapHtml, NOTE_MAP_CSS } from "@/lib/notes-map";

type Lang = "en" | "hi";

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const pick = (x: Bi | null | undefined, lang: Lang) =>
  ((lang === "hi" ? x?.hi || x?.en : x?.en || x?.hi) ?? "").trim();
// Text with **bold** marks.
const rich = (x: Bi | null | undefined, lang: Lang) =>
  esc(pick(x, lang)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

const T = {
  en: {
    chapter: "Chapter",
    syllabus: "Syllabus",
    asked: "Asked",
    keyPoints: "Key points",
    trap: "Exam trap",
    pyq: "Previous year question",
    answer: "Answer",
    revise: "Quick revision",
    keywords: "Keywords to use",
    official: "From the official text",
    plan: (w: number) => `Writing it in ${w} words`,
    practice: "Practise",
    map: "Map",
    end: (n: number) => `End of Chapter ${n}`,
    sources: "Sources for this chapter",
    maps: "Maps: rivers from Natural Earth; outlines from DataMeet, following the Survey of India boundary; not to scale.",
    review: "Review copy: ◇ marks lines written without a source passage.",
    words: "words",
  },
  hi: {
    chapter: "अध्याय",
    syllabus: "पाठ्यक्रम",
    asked: "पूछा गया",
    keyPoints: "मुख्य बिंदु",
    trap: "परीक्षा में भ्रम",
    pyq: "पिछले वर्ष का प्रश्न",
    answer: "उत्तर",
    revise: "त्वरित पुनरावृत्ति",
    keywords: "उपयोगी मुख्य शब्द",
    official: "आधिकारिक पाठ से",
    plan: (w: number) => `${w} शब्दों में उत्तर`,
    practice: "अभ्यास",
    map: "मानचित्र",
    end: (n: number) => `अध्याय ${n} समाप्त`,
    sources: "इस अध्याय के स्रोत",
    maps: "मानचित्र: नदियाँ Natural Earth से; सीमाएँ DataMeet से, भारतीय सर्वेक्षण की सीमा के अनुसार; पैमाने पर नहीं।",
    review: "समीक्षा प्रति: ◇ उन पंक्तियों पर है जो किसी स्रोत अंश के बिना लिखी गईं।",
    words: "शब्द",
  },
};
const OPT = { en: ["a", "b", "c", "d"], hi: ["अ", "ब", "स", "द"] };

export type TopicPyq = { exam: string; q: Bi; options: Bi[]; correct: number | null };

export type TopicPage = {
  topic_id: string;
  number: string;
  name: Bi;
  // The topics above it ("Rivers of the Bay of Bengal system").
  parent: Bi | null;
  syllabus: string[];
  asked: string[];
  pyqs: TopicPyq[];
  content: NoteContent;
};

export type ChapterPages = {
  n: number;
  name: Bi;
  topics: TopicPage[];
  sources: string[];
};

const mark = (p: { src: number[]; ok?: boolean }, review: boolean) =>
  review && !p.src.length && !p.ok
    ? `<sup class="ai" title="Written without a source passage">◇</sup>`
    : "";

function points(xs: NotePoint[], lang: Lang, review: boolean): string {
  return `<ul class="points">${xs.map((p) => `<li>${rich(p.text, lang)}${mark(p, review)}</li>`).join("")}</ul>`;
}

export function topicHtml(
  t: TopicPage,
  stage: NotesStage,
  lang: Lang,
  review: boolean,
  accent: string,
): string {
  const L = T[lang];
  const c = t.content;
  const h3 = (s: string) => `<h3>${esc(s)}</h3>`;
  const meta = `<div class="meta">${t.syllabus.length ? `<div class="syl">${esc(L.syllabus)}: ${esc(t.syllabus.join(" · "))}</div>` : ""}${
    t.asked.length
      ? `<div class="asked-row"><span class="asked-label">${esc(L.asked)}</span>${t.asked.map((a) => `<span class="asked">${esc(a)}</span>`).join("")}</div>`
      : ""
  }</div>`;
  const intro = pick(c.intro.text, lang)
    ? `<p class="lead">${rich(c.intro.text, lang)}${mark(c.intro, review)}</p>`
    : "";
  const defs = c.definitions
    .map(
      (d) =>
        `<figure class="def"><div class="def-term">${esc(pick(d.term, lang))}</div><blockquote>“${esc(pick(d.text, lang))}”${mark(d, review)}</blockquote>${d.source ? `<figcaption>— ${esc(d.source)}</figcaption>` : ""}</figure>`,
    )
    .join("");
  const table = c.table
    ? `<figure class="tfig">${pick(c.table.caption, lang) ? `<figcaption>${esc(pick(c.table.caption, lang))}</figcaption>` : ""}<table class="tbl"><thead><tr>${c.table.head.map((h) => `<th>${esc(pick(h, lang))}</th>`).join("")}</tr></thead><tbody>${c.table.rows
        .map(
          (r) =>
            `<tr>${r.map((x, i) => `<td${i === 0 ? ' class="first"' : ""}>${rich(x, lang)}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody></table></figure>`
    : "";
  const map = c.map
    ? `${h3(pick(c.map.title, lang) || L.map)}${noteMapHtml(c.map, lang, accent)}`
    : "";
  const sourced = (xs: NoteContent["data"], cls: string) =>
    xs
      .map(
        (d) =>
          `<p class="${cls}">${rich(d.text, lang)}${d.source ? ` <span class="cite">(${esc(d.source)})</span>` : ""}${mark(d, review)}</p>`,
      )
      .join("");
  let body = "";
  if (stage === "prelims") {
    const pyq = t.pyqs[0];
    const right = [
      pyq
        ? `<div><h3>${esc(L.pyq)}</h3><div class="pyq"><div class="pyq-q"><span class="pyq-tag">${esc(pyq.exam)}</span> ${esc(pick(pyq.q, lang))}</div><ol class="pyq-opts">${pyq.options
            .map(
              (o, i) => `<li><span class="o">(${OPT[lang][i]})</span> ${esc(pick(o, lang))}</li>`,
            )
            .join(
              "",
            )}</ol>${pyq.correct ? `<div class="pyq-a">${esc(L.answer)}: (${OPT[lang][pyq.correct - 1]}) ${esc(pick(pyq.options[pyq.correct - 1], lang))}</div>` : ""}</div></div>`
        : "",
      c.oneliners.length
        ? `<div><h3>${esc(L.revise)}</h3><dl class="oneliners">${c.oneliners.map((o) => `<div><dt>${esc(pick(o.q, lang))}</dt><dd>${esc(pick(o.a, lang))}</dd></div>`).join("")}</dl></div>`
        : "",
    ].filter(Boolean);
    body = `${intro}${defs}${c.points.length ? h3(L.keyPoints) + points(c.points, lang, review) : ""}${table}${map}${
      pick(c.trap, lang)
        ? `<div class="trap"><span class="trap-label">⚠ ${esc(L.trap)}</span> ${rich(c.trap, lang)}</div>`
        : ""
    }${right.length ? `<div class="${right.length === 2 ? "two" : ""}">${right.join("")}</div>` : ""}`;
  } else {
    const total = c.plan.reduce((n, p) => n + p.words, 0);
    const tail = [
      c.plan.length
        ? `<div class="frame"><div class="frame-title">${esc(L.plan(total))}</div><div class="frame-bar">${c.plan
            .map(
              (p, i) =>
                `<div class="seg s${i % 4}" style="flex:${p.words}"><b>${esc(pick(p.part, lang))}</b><span>~${p.words}</span></div>`,
            )
            .join("")}</div></div>`
        : "",
      pick(c.practice, lang)
        ? `<div class="practice"><div class="practice-label">✎ ${esc(L.practice)}</div><p>${esc(pick(c.practice, lang))}</p><div class="rule"></div><div class="rule"></div></div>`
        : "",
    ].filter(Boolean);
    body = `${intro}${sourced(c.data, "data")}${
      c.keywords.length
        ? `<div class="kw"><b>${esc(L.keywords)}:</b> <span class="chips">${c.keywords.map((k) => `<span class="chip">${esc(pick(k, lang))}</span>`).join("")}</span></div>`
        : ""
    }${defs}${c.points.length ? points(c.points, lang, review) : ""}${table}${map}${c.sections
      .map((s) => h3(pick(s.heading, lang)) + points(s.points, lang, review))
      .join("")}${
      c.official.length
        ? c.official
            .map(
              (o) =>
                `<figure class="def official"><div class="def-term">${esc(L.official)}</div><blockquote>${rich(o.text, lang)}${o.source ? ` <span class="cite">(${esc(o.source)})</span>` : ""}${mark(o, review)}</blockquote></figure>`,
            )
            .join("")
        : ""
    }${tail.length ? `<div class="${tail.length === 2 ? "two" : ""}">${tail.join("")}</div>` : ""}`;
  }
  return `<section class="tp" data-topic="${esc(t.topic_id)}">${t.parent ? `<div class="topic-line">${esc(pick(t.parent, lang))}</div>` : ""}<h1 class="tp-title">${esc(t.number)} ${esc(pick(t.name, lang))}</h1>${meta}${body}</section>`;
}

export function chapterHtml(
  ch: ChapterPages,
  stage: NotesStage,
  lang: Lang,
  review: boolean,
  accent: string,
): string {
  const L = T[lang];
  const hasMap = ch.topics.some((t) => t.content.map);
  return `<section class="chapter"><header class="ch-open"><span class="ch-no">${esc(L.chapter)} ${ch.n}</span><h1>${esc(pick(ch.name, lang))}</h1></header>${ch.topics
    .map((t) => topicHtml(t, stage, lang, review, accent))
    .join("")}<div class="ch-end"><span>${esc(L.end(ch.n))}</span></div>${
    ch.sources.length || hasMap
      ? `<section class="ch-sources"><h2>${esc(L.sources)}</h2><ol class="srcs">${ch.sources.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${hasMap ? `<p class="small muted">${esc(L.maps)}</p>` : ""}</section>`
      : ""
  }</section>`;
}

export const reviewNote = (lang: Lang) => `<p class="review-note">${esc(T[lang].review)}</p>`;

export const NOTES_PAGE_CSS = `
${NOTE_MAP_CSS}
.chapter { break-before: page; }
.ch-open { border-bottom: 0.8mm solid $ACCENT; padding-bottom: 3mm; margin-bottom: 6mm; }
.ch-no { font-size: 10pt; color: $ACCENT; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
.hi .ch-no { text-transform: none; letter-spacing: 0; }
.ch-open h1 { font-family: var(--serif); font-size: 26pt; margin: 1mm 0 0; }
.tp { margin-bottom: 8mm; }
.tp + .tp { border-top: 0.3mm solid #e4e6eb; padding-top: 5mm; }
.topic-line { color: #6b7080; font-size: 9pt; }
.tp-title { font-family: var(--serif); font-size: 18pt; margin: 0.5mm 0 1.5mm; break-after: avoid; }
.tp h3 { font-family: var(--serif); font-size: 11.5pt; color: $ACCENT; margin: 3mm 0 1mm; break-after: avoid; }
.meta { border-top: 0.3mm solid #e4e6eb; border-bottom: 0.3mm solid #e4e6eb; padding: 1.5mm 0; margin-bottom: 3mm; }
.meta:empty { display: none; }
.syl { font-size: 8pt; color: #6b7080; font-style: italic; margin-bottom: 1mm; }
.tp .lead { font-size: 1.04em; }
.tp .def { margin: 0 0 2.5mm; padding: 2.2mm 3.5mm; break-inside: avoid; }
.tp .def blockquote { font-size: 1.04em; }
.tfig { margin: 1mm 0 3mm; break-inside: avoid; }
.tfig figcaption { font-size: 8.5pt; color: #6b7080; margin-bottom: 1mm; }
.tbl td.first { font-weight: 600; }
.trap { margin: 0 0 3mm; padding: 1.8mm 2.5mm; color: inherit; break-inside: avoid; }
.trap-label { font-weight: 700; color: #b45309; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; break-inside: avoid; }
.pyq { font-size: 0.95em; }
.pyq-opts { list-style: none; padding: 0; margin: 1.2mm 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.6mm 3mm; }
.pyq-opts .o { color: #6b7080; }
.pyq-a { font-size: 0.88em; color: #047857; font-weight: 600; }
.oneliners { margin: 0; }
.oneliners div { display: flex; align-items: baseline; gap: 1.5mm; margin-bottom: 1mm; }
.oneliners dt { white-space: nowrap; }
.oneliners div::after { content: ""; order: 1; flex: 1; border-bottom: 0.3mm dotted #9aa0ad; }
.oneliners dd { order: 2; margin: 0; font-weight: 600; white-space: nowrap; }
.data { border-left: 1mm solid #9aa0ad; padding: 0.5mm 0 0.5mm 3mm; }
.kw { display: flex; gap: 2mm; align-items: baseline; flex-wrap: wrap; margin-bottom: 2mm; }
.chips { display: inline-flex; flex-wrap: wrap; gap: 1.4mm; }
.chip { border: 0.3mm solid #d8d2ee; border-radius: 99px; padding: 0.4mm 2.6mm; font-size: 0.92em; background: #f6f3ff; }
.frame-title { font-weight: 700; font-size: 0.92em; margin-bottom: 1mm; }
.frame .seg { padding: 1.2mm 1.5mm; font-size: 0.78em; line-height: 1.25; min-width: 0; }
.frame .seg b, .frame .seg span { display: block; }
.practice { border: 0.3mm dashed #9aa0ad; border-radius: 1.5mm; padding: 1.8mm 2.5mm; }
.practice-label { font-weight: 700; color: $ACCENT; font-size: 0.9em; }
.practice p { margin: 0.5mm 0 1mm; }
.practice .rule { border-bottom: 0.25mm solid #d9dbe1; height: 6.5mm; }
sup.ai { color: #c2410c; font-size: 7.5pt; margin-left: 2px; }
.ch-end { display: flex; align-items: center; gap: 3mm; margin: 6mm 0 4mm; color: #6b7080; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .12em; }
.hi .ch-end { text-transform: none; letter-spacing: 0; }
.ch-end::before, .ch-end::after { content: ""; flex: 1; border-top: 0.3mm solid #c9ccd4; }
.ch-sources { background: #f7f7f9; border-top: 0.8mm solid #1f2430; padding: 3mm 5mm; font-size: 9pt; break-inside: avoid; }
.ch-sources h2 { font-family: var(--serif); font-size: 13pt; margin: 0 0 1mm; }
.review-note { background: #fff7ed; border: 0.3mm solid #fdba74; border-radius: 1.5mm; padding: 2mm 3mm; font-size: 9pt; }
@media screen {
  .chapter, .tp-only { width: 210mm; margin: 0 auto 6mm; padding: 16mm 18mm 18mm; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
}
`;
