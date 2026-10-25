// A notes book's cover and front pages as printable A4 HTML, in one
// language (the Hindi and English books print separately). Layout A: serif
// headings, one calm column. The cover has six designs; the front pages are
// the edition page, about these notes, how to use them, the contents, the
// syllabus coverage, what the exam asks and the sources. Server only: the
// map outlines are large.
import type { Bi } from "@/lib/current-affairs";
import { darken } from "@/lib/ca-cover-html";
import { INDIA_MAP, RAJASTHAN_MAP } from "@/lib/ca-map-data";
import {
  coverText,
  type BookData,
  type NotesBook,
  type NotesCover,
  type NotesFront,
  type NotesStage,
} from "@/lib/notes-books";

type Lang = "en" | "hi";

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const safeUrl = (u: string | undefined) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");
const pick = (x: Bi | null | undefined, lang: Lang) =>
  ((lang === "hi" ? x?.hi || x?.en : x?.en || x?.hi) ?? "").trim();

const T = {
  en: {
    chapter: "Chapter",
    edition: "About this edition",
    book: "Book",
    editionRow: "Edition",
    publisher: "Published by",
    updates: "Updates and corrections",
    medium: "English medium",
    about: "About these notes",
    howMade: "How we made them",
    help: "How they help you",
    howUse: "How to use these notes",
    example: "Example",
    meaning: "What it means",
    study: "A good way to study",
    contents: "Contents",
    coverage: "Syllabus coverage",
    coverageNote: "Each line of the official syllabus and the chapter that teaches it.",
    line: "Syllabus line",
    exam: "Exam",
    notYet: "Not in the outline yet",
    covered: (n: number, all: number) => `${n} of ${all} syllabus lines covered`,
    noLines: "No syllabus lines of this subject are in the syllabus library yet.",
    asks: "What the exam asks",
    asksNote: (p: number, y: string) =>
      `Questions in ${p} past paper${p === 1 ? "" : "s"}${y}, by chapter.`,
    noPyq: "No past questions are linked to this subject yet.",
    top: "Most asked topics",
    questions: (n: number) => `${n} question${n === 1 ? "" : "s"}`,
    asksHow:
      "This analysis is made from the questions linked to each topic, and is updated every edition.",
    sources: "Sources and acknowledgements",
    sourcesIntro:
      "These notes are based on the following. Each chapter ends with the sources used for it.",
    noChapters: "The master outline of this subject has no chapters yet.",
    topics: "Topics",
    legend: {
      number: "Chapter › topic › subtopic. Topics follow the order of the syllabus.",
      asked: "Exams in which this topic was asked. More tags, more important.",
      def: "A definition word for word from a standard book, with its source. Learn it as it is.",
      map: "Numbered places on the map match the numbers in the table beside it.",
      trap: "Facts students often confuse. Read these again before the exam.",
      pyq: "A real question from a past paper, with its answer.",
      revise: "One-line facts for the last revision.",
      official: "Text from the Constitution, an Act or a policy. Quote it in your answer.",
      plan: "How to split your words across the parts of an answer.",
      data: "Every figure with its year and source, so you can cite it.",
    },
    samples: {
      topic: "4.2 Rivers of the Bay of Bengal system",
      sub: "4.2.1 Chambal",
      asked: "Asked",
      tags: ["RAS Pre 2023", "RAS Pre 2018"],
      term: "Drainage basin",
      src: "NCERT, Class XI",
      map: "map and table",
      trap: "Exam trap",
      answer: "Answer: (b)",
      revQ: "Enters Rajasthan near",
      revA: "Chaurasigarh",
      official: "From the official text",
      art: "Article 262 …",
      data: "State Water Policy, 2010",
    },
  },
  hi: {
    chapter: "अध्याय",
    edition: "इस संस्करण के बारे में",
    book: "पुस्तक",
    editionRow: "संस्करण",
    publisher: "प्रकाशक",
    updates: "अद्यतन एवं संशोधन",
    medium: "हिंदी माध्यम",
    about: "इन नोट्स के बारे में",
    howMade: "हमने इन्हें कैसे बनाया",
    help: "ये आपकी कैसे मदद करते हैं",
    howUse: "इन नोट्स का उपयोग कैसे करें",
    example: "उदाहरण",
    meaning: "इसका अर्थ",
    study: "पढ़ने का एक अच्छा तरीका",
    contents: "विषय-सूची",
    coverage: "पाठ्यक्रम कवरेज",
    coverageNote: "आधिकारिक पाठ्यक्रम की हर पंक्ति और उसे पढ़ाने वाला अध्याय।",
    line: "पाठ्यक्रम की पंक्ति",
    exam: "परीक्षा",
    notYet: "अभी रूपरेखा में नहीं",
    covered: (n: number, all: number) => `पाठ्यक्रम की ${all} में से ${n} पंक्तियाँ शामिल`,
    noLines: "इस विषय की पाठ्यक्रम पंक्तियाँ अभी पाठ्यक्रम पुस्तकालय में नहीं हैं।",
    asks: "परीक्षा में क्या पूछा जाता है",
    asksNote: (p: number, y: string) => `${p} पिछले प्रश्नपत्रों${y} के प्रश्न, अध्याय अनुसार।`,
    noPyq: "इस विषय से अभी कोई पिछला प्रश्न नहीं जुड़ा है।",
    top: "सबसे अधिक पूछे गए विषय",
    questions: (n: number) => `${n} प्रश्न`,
    asksHow: "यह विश्लेषण हर विषय से जुड़े प्रश्नों से बनता है और हर संस्करण में अद्यतन होता है।",
    sources: "स्रोत एवं आभार",
    sourcesIntro:
      "ये नोट्स निम्नलिखित पर आधारित हैं। हर अध्याय के अंत में उस अध्याय के स्रोत दिए गए हैं।",
    noChapters: "इस विषय की मुख्य रूपरेखा में अभी कोई अध्याय नहीं है।",
    topics: "विषय",
    legend: {
      number: "अध्याय › विषय › उप-विषय। विषय पाठ्यक्रम के क्रम में हैं।",
      asked: "जिन परीक्षाओं में यह विषय पूछा गया। जितने अधिक टैग, उतना महत्वपूर्ण।",
      def: "मानक पुस्तक से शब्दशः परिभाषा, स्रोत सहित। इसे ज्यों का त्यों याद करें।",
      map: "मानचित्र पर क्रमांकित स्थान बगल की तालिका के क्रमांकों से मेल खाते हैं।",
      trap: "वे तथ्य जिनमें विद्यार्थी अक्सर भ्रमित होते हैं। परीक्षा से पहले इन्हें फिर पढ़ें।",
      pyq: "पिछले प्रश्नपत्र का वास्तविक प्रश्न, उत्तर सहित।",
      revise: "अंतिम पुनरावृत्ति के लिए एक पंक्ति के तथ्य।",
      official: "संविधान, अधिनियम या नीति का पाठ। इसे उत्तर में उद्धृत करें।",
      plan: "उत्तर के भागों में शब्दों का बँटवारा।",
      data: "हर आँकड़ा वर्ष और स्रोत सहित, ताकि आप उसे उद्धृत कर सकें।",
    },
    samples: {
      topic: "4.2 बंगाल की खाड़ी अपवाह तंत्र की नदियाँ",
      sub: "4.2.1 चंबल",
      asked: "पूछा गया",
      tags: ["RAS प्रा. 2023", "RAS प्रा. 2018"],
      term: "अपवाह द्रोणी",
      src: "एनसीईआरटी, कक्षा 11",
      map: "मानचित्र एवं तालिका",
      trap: "परीक्षा में भ्रम",
      answer: "उत्तर: (ब)",
      revQ: "राजस्थान में प्रवेश",
      revA: "चौरासीगढ़",
      official: "आधिकारिक पाठ से",
      art: "अनुच्छेद 262 …",
      data: "राज्य जल नीति, 2010",
    },
  },
};

export type BookContext = {
  subject: Bi;
  // "Edition 2026", used when the cover leaves it empty.
  edition: Bi;
  brand: string;
};

// ---------- The cover ----------

function outlineSvg(which: NotesCover["outline"]): string {
  if (which === "none") return "";
  const m = which === "india" ? INDIA_MAP : RAJASTHAN_MAP;
  const d = which === "india" ? INDIA_MAP.outline : RAJASTHAN_MAP.outline;
  return `<svg class="nc-map" viewBox="0 0 ${m.projection.width} ${m.projection.height}" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function coverPageHtml(
  book: Pick<NotesBook, "stage" | "cover">,
  lang: Lang,
  ctx: BookContext,
): string {
  const c = book.cover;
  const x = coverText(c, book.stage, ctx.subject, ctx.edition);
  const p = (b: Bi) => esc(pick(b, lang));
  const bg = safeUrl(c.bg?.url);
  const ph = safeUrl(c.photo?.url);
  const vars = `--c:${c.color};--cd:${darken(c.color, 0.35)};--c2:${c.color2};--dim:${c.bg_dim / 100}`;
  const features = `<ul class="nc-feat">${x.features.map((f) => `<li>${p(f)}</li>`).join("")}</ul>`;
  const top = `<div class="nc-top"><span class="nc-brand">${esc(ctx.brand)}</span><span>${p(x.edition)}</span></div>`;
  const titleBlock = `<div class="nc-kicker">${p(x.kicker)}</div><h1 class="nc-title">${p(x.title)}</h1><div class="nc-label">${p(x.label)}</div>`;
  const foot = `<div class="nc-foot"><div class="nc-src">${p(x.based_on)}</div>${pick(x.updated, lang) ? `<div class="nc-upd">${p(x.updated)}</div>` : ""}</div>`;
  const ribbon = pick(x.ribbon, lang)
    ? `<div class="nc-ribbon"><span>${p(x.ribbon)}</span></div>`
    : "";
  const map = outlineSvg(c.outline);
  let body: string;
  switch (c.design) {
    case "band":
      body = `<div class="nc-bandcol"><span class="nc-brand">${esc(ctx.brand)}</span><span class="nc-vlabel">${p(x.label)}</span></div><div class="nc-main">${map}<div class="nc-top"><span></span><span>${p(x.edition)}</span></div><div class="nc-mid"><div class="nc-kicker">${p(x.kicker)}</div><h1 class="nc-title">${p(x.title)}</h1><div class="nc-label">${p(x.label)}</div>${features}</div>${foot}</div>`;
      break;
    case "photo":
      body = `${bg ? `<img class="nc-bg" src="${esc(bg)}" alt=""/>` : ""}<div class="nc-shade"></div><div class="nc-in">${top}<div class="nc-mid">${titleBlock}${features}</div>${foot}</div>`;
      break;
    case "framed":
      body = `<div class="nc-in">${top}<div class="nc-frame">${ph ? `<img src="${esc(ph)}" alt=""/>` : map}</div><div class="nc-mid">${titleBlock}${features}</div>${foot}</div>`;
      break;
    case "split":
      body = `<div class="nc-upper">${map}${top}<div class="nc-mid">${titleBlock}</div></div><div class="nc-lower">${features}${foot}</div>`;
      break;
    case "minimal":
      body = `<div class="nc-in">${top}<div class="nc-mid">${titleBlock}${features}</div>${foot}</div>`;
      break;
    default:
      body = `${map}<div class="nc-in">${top}<div class="nc-mid">${titleBlock}${features}</div>${foot}</div>`;
  }
  return `<section class="nc nc-${c.design} ${lang}${ribbon ? " has-ribbon" : ""}" lang="${lang}" style="${vars}">${body}${ribbon}</section>`;
}

// ---------- Front pages ----------

const page = (title: string, body: string, cls = "") =>
  `<section class="fm ${cls}"><h1 class="fm-title">${esc(title)}</h1>${body}</section>`;
const list = (xs: Bi[], lang: Lang, tag = "ul") =>
  `<${tag} class="points">${xs.map((x) => `<li>${esc(pick(x, lang))}</li>`).join("")}</${tag}>`;

function imprintPage(book: NotesBook, lang: Lang, ctx: BookContext): string {
  const t = T[lang];
  const f = book.front;
  const x = coverText(book.cover, book.stage, ctx.subject, ctx.edition);
  const rows: [string, string][] = [
    [t.book, `${pick(x.title, lang)} · ${pick(x.label, lang)} (${t.medium})`],
    [t.editionRow, [pick(x.edition, lang), pick(x.updated, lang)].filter(Boolean).join(" · ")],
    [t.publisher, ctx.brand],
    [t.updates, pick(f.updates, lang)],
  ];
  return `<section class="fm imprint"><div class="imp-spacer"></div><h2>${esc(t.edition)}</h2><dl class="imp">${rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join(
      "",
    )}</dl><p>${esc(pick(f.errors, lang))}</p><p class="small">${esc(pick(f.disclaimer, lang))}</p><p class="small">${esc(pick(f.copyright, lang))}</p></section>`;
}

function aboutPage(f: NotesFront, lang: Lang): string {
  const t = T[lang];
  return page(
    t.about,
    `<p class="lead">${esc(pick(f.intro, lang))}</p>${
      f.how.length
        ? `<h3>${esc(t.howMade)}</h3><dl class="how">${f.how
            .map(
              (h) =>
                `<div><dt>${esc(pick(h.title, lang))}</dt><dd>${esc(pick(h.text, lang))}</dd></div>`,
            )
            .join("")}</dl>`
        : ""
    }${f.help.length ? `<h3>${esc(t.help)}</h3>${list(f.help, lang)}` : ""}<p class="sign">${esc(pick(f.sign, lang))}</p>`,
  );
}

function howToPage(f: NotesFront, stage: NotesStage, lang: Lang): string {
  const t = T[lang];
  const s = t.samples;
  const L = t.legend;
  const rows: [string, string][] = [
    [
      `<div class="ex-num"><span class="muted small">${esc(s.topic)}</span><b>${esc(s.sub)}</b></div>`,
      L.number,
    ],
    [
      `<span class="asked-label">${esc(s.asked)}</span>${s.tags.map((x) => `<span class="asked">${esc(x)}</span>`).join("")}`,
      L.asked,
    ],
    [
      `<figure class="def mini"><div class="def-term">${esc(s.term)}</div><blockquote>“…”</blockquote><figcaption>— ${esc(s.src)}</figcaption></figure>`,
      L.def,
    ],
    [
      `<span class="dn">1</span><span class="dn">2</span><span class="dn">3</span> <span class="muted">${esc(s.map)}</span>`,
      L.map,
    ],
  ];
  if (stage === "prelims")
    rows.push(
      [`<div class="trap mini"><b>⚠ ${esc(s.trap)}</b></div>`, L.trap],
      [
        `<span class="pyq-tag">${esc(s.tags[1])}</span> <span class="muted">${esc(s.answer)}</span>`,
        L.pyq,
      ],
      [
        `<div class="oneliner"><span>${esc(s.revQ)}</span><i></i><b>${esc(s.revA)}</b></div>`,
        L.revise,
      ],
    );
  else
    rows.push(
      [
        `<figure class="def mini"><div class="def-term">${esc(s.official)}</div><blockquote>${esc(s.art)}</blockquote></figure>`,
        L.official,
      ],
      [
        `<div class="frame-bar">${[15, 35, 30, 20].map((w, i) => `<span class="seg s${i}" style="flex:${w}">~${w}</span>`).join("")}</div>`,
        L.plan,
      ],
      [`<span>1.16% <span class="cite">(${esc(s.data)})</span></span>`, L.data],
    );
  return page(
    t.howUse,
    `<table class="legend"><thead><tr><th>${esc(t.example)}</th><th>${esc(t.meaning)}</th></tr></thead><tbody>${rows
      .map(([a, m]) => `<tr><td>${a}</td><td>${esc(m)}</td></tr>`)
      .join(
        "",
      )}</tbody></table>${f.study.length ? `<h3>${esc(t.study)}</h3>${list(f.study, lang, "ol")}` : ""}`,
  );
}

function contentsPage(d: BookData, lang: Lang): string {
  const t = T[lang];
  if (!d.chapters.length) return page(t.contents, `<p class="muted">${esc(t.noChapters)}</p>`);
  return page(
    t.contents,
    `<ol class="toc">${d.chapters
      .map(
        (c) =>
          `<li><div class="toc-row"><span class="toc-n">${c.n}</span><span class="toc-t">${esc(pick(c.name, lang))}</span></div>${
            c.topics.length
              ? `<div class="toc-sub">${c.topics.map((x, i) => `${c.n}.${i + 1} ${esc(pick(x, lang))}`).join(" · ")}</div>`
              : ""
          }</li>`,
      )
      .join("")}</ol>`,
  );
}

function coveragePage(d: BookData, lang: Lang): string {
  const t = T[lang];
  if (!d.coverage.length) return page(t.coverage, `<p class="muted">${esc(t.noLines)}</p>`);
  const done = d.coverage.filter((l) => l.chapters.length).length;
  return page(
    t.coverage,
    `<p class="muted">${esc(t.coverageNote)}</p><table class="tbl cov"><thead><tr><th>${esc(t.line)}</th><th>${esc(t.exam)}</th><th>${esc(t.chapter)}</th></tr></thead><tbody>${d.coverage
      .map(
        (l) =>
          `<tr><td>${esc(pick(l.text, lang))}</td><td class="nw">${esc(l.exam)}</td><td class="nw">${
            l.chapters.length ? l.chapters.join(", ") : `<span class="gap">${esc(t.notYet)}</span>`
          }</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table><p class="${done === d.coverage.length ? "covered" : "muted"}">${done === d.coverage.length ? "✓ " : ""}${esc(t.covered(done, d.coverage.length))}</p>`,
  );
}

// One series, most first: plain bars in the book's colour, values at the ends.
function pyqPage(d: BookData, lang: Lang): string {
  const t = T[lang];
  const q = d.pyq;
  if (!q.byChapter.length) return page(t.asks, `<p class="muted">${esc(t.noPyq)}</p>`);
  const max = Math.max(...q.byChapter.map((x) => x.count));
  const name = (n: number) => pick(d.chapters.find((c) => c.n === n)?.name, lang);
  const years = q.years
    ? q.years[0] === q.years[1]
      ? ` (${q.years[0]})`
      : ` (${q.years[0]}–${q.years[1]})`
    : "";
  return page(
    t.asks,
    `<p class="muted">${esc(t.asksNote(q.papers, years))}</p><figure class="bars">${q.byChapter
      .map(
        (x) =>
          `<div class="bar-row"><span class="bar-l">${x.n}. ${esc(name(x.n))}</span><span class="bar-track"><span class="bar" style="width:${((x.count / max) * 100).toFixed(1)}%"></span></span><span class="bar-v">${x.count}</span></div>`,
      )
      .join("")}</figure>${
      q.top.length
        ? `<h3>${esc(t.top)}</h3><ol class="top">${q.top.map((x) => `<li><span>${esc(pick(x.name, lang))}</span><b>${esc(t.questions(x.count))}</b></li>`).join("")}</ol>`
        : ""
    }<p class="muted small">${esc(t.asksHow)}</p>`,
  );
}

function sourcesPage(f: NotesFront, lang: Lang): string {
  const t = T[lang];
  return page(
    t.sources,
    `<p>${esc(t.sourcesIntro)}</p>${f.sources
      .map(
        (g) =>
          `<h4>${esc(pick(g.title, lang))}</h4><ol class="srcs">${g.items.map((i) => `<li>${esc(pick(i, lang))}</li>`).join("")}</ol>`,
      )
      .join("")}<p class="muted">${esc(pick(f.thanks, lang))}</p>`,
  );
}

export type FrontPart =
  | "cover"
  | "imprint"
  | "about"
  | "howto"
  | "contents"
  | "coverage"
  | "pyq"
  | "sources";
export const FRONT_PARTS: { id: FrontPart; name: string }[] = [
  { id: "cover", name: "Cover" },
  { id: "imprint", name: "Edition page" },
  { id: "about", name: "About these notes" },
  { id: "howto", name: "How to use" },
  { id: "contents", name: "Contents" },
  { id: "coverage", name: "Syllabus coverage" },
  { id: "pyq", name: "What the exam asks" },
  { id: "sources", name: "Sources" },
];

// The cover and front pages (or some of them) as one document.
export function bookFrontHtml(
  book: NotesBook,
  lang: Lang,
  ctx: BookContext,
  data: BookData,
  parts: FrontPart[] = FRONT_PARTS.map((p) => p.id),
): string {
  const make: Record<FrontPart, () => string> = {
    cover: () => coverPageHtml(book, lang, ctx),
    imprint: () => imprintPage(book, lang, ctx),
    about: () => aboutPage(book.front, lang),
    howto: () => howToPage(book.front, book.stage, lang),
    contents: () => contentsPage(data, lang),
    coverage: () => coveragePage(data, lang),
    pyq: () => pyqPage(data, lang),
    sources: () => sourcesPage(book.front, lang),
  };
  const body = parts.map((p) => make[p]()).join("\n");
  const accent = book.cover.color;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=794"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="${NOTES_FONTS}" rel="stylesheet"/>
<style>${NOTES_CSS.replace(/\$ACCENT/g, accent)}</style></head><body class="${lang}${parts.length === 1 && parts[0] === "cover" ? " one" : ""}">${body}</body></html>`;
}

export const NOTES_FONTS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700;800&family=Noto+Serif+Devanagari:wght@600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap";

const NOTES_CSS = `
@page { size: A4; margin: 16mm 18mm 18mm; }
@page cover { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #1f2430; font-size: 10pt; line-height: 1.5; }
body.en { --body: "Noto Sans", sans-serif; --serif: "Source Serif 4", Georgia, serif; }
body.hi { --body: "Noto Sans Devanagari", "Noto Sans", sans-serif; --serif: "Noto Serif Devanagari", "Noto Sans Devanagari", serif; line-height: 1.6; }
body { font-family: var(--body); }
b { font-weight: 600; }
.muted { color: #6b7080; } .small { font-size: 8.4pt; }

/* ---- Front pages ---- */
.fm { break-before: page; }
.fm .fm-title { font-family: var(--serif); font-size: 22pt; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 0.6mm solid $ACCENT; }
.fm h3 { font-family: var(--serif); font-size: 12pt; color: $ACCENT; margin: 5mm 0 1.5mm; }
.fm h4 { font-size: 9.6pt; margin: 3.5mm 0 1mm; }
.fm p { margin: 0 0 2.5mm; }
.fm .lead { font-size: 1.05em; }
.points { margin: 0 0 2mm; padding-left: 5mm; } .points li { margin-bottom: 1mm; }
dl.how div { display: grid; grid-template-columns: 50mm 1fr; gap: 4mm; padding: 1.6mm 0; border-bottom: 0.25mm solid #eceef1; break-inside: avoid; }
dl.how dt { font-weight: 700; color: $ACCENT; } dl.how dd { margin: 0; }
.sign { text-align: right; font-family: var(--serif); font-style: italic; margin-top: 4mm; }
.imprint { padding-top: 0; }
.imp-spacer { height: 110mm; }
.imprint h2 { font-family: var(--serif); font-size: 14pt; margin: 0 0 3mm; }
.imp { margin: 0 0 3mm; } .imp div { display: grid; grid-template-columns: 44mm 1fr; gap: 3mm; padding: 1.4mm 0; border-bottom: 0.25mm solid #eceef1; font-size: 9pt; }
.imp dt { color: #6b7080; } .imp dd { margin: 0; }
.imprint p { font-size: 9pt; }
.legend { width: 100%; border-collapse: collapse; }
.legend th { text-align: left; font-size: 8pt; color: #6b7080; font-weight: 600; border-bottom: 0.4mm solid #1f2430; padding: 1mm 2mm; }
.legend td { border-bottom: 0.25mm solid #eceef1; padding: 1.8mm 2mm; vertical-align: middle; }
.legend td:first-child { width: 62mm; }
.ex-num { display: flex; flex-direction: column; } .ex-num b { font-family: var(--serif); font-size: 13pt; }
.asked-label { font-size: 7.5pt; color: #8a8f9c; margin-right: 1.5mm; text-transform: uppercase; letter-spacing: .06em; }
.hi .asked-label { text-transform: none; letter-spacing: 0; }
.asked { display: inline-block; font-size: 7.5pt; border: 0.3mm solid $ACCENT66; color: $ACCENT; border-radius: 99px; padding: 0.2mm 2mm; margin: 0 1mm 0.8mm 0; }
.def { margin: 0; border-left: 1mm solid $ACCENT; background: #f6f3ff; padding: 1.2mm 3mm; border-radius: 0 1.5mm 1.5mm 0; }
.def blockquote { margin: 0; font-family: var(--serif); } .def-term { font-weight: 700; }
.def figcaption { font-size: 7.5pt; color: #6b7080; font-style: italic; }
.dn { display: inline-flex; align-items: center; justify-content: center; width: 4.2mm; height: 4.2mm; border-radius: 50%; background: $ACCENT; color: #fff; font-size: 6.5pt; font-weight: 700; margin-right: 1mm; }
.trap { background: #fffbeb; border: 0.3mm solid #f59e0b; border-radius: 1.5mm; padding: 1mm 2.5mm; color: #b45309; }
.pyq-tag { font-size: 7pt; background: $ACCENT; color: #fff; border-radius: 1mm; padding: 0.2mm 1.5mm; }
.oneliner { display: flex; align-items: baseline; gap: 1.5mm; } .oneliner i { flex: 1; border-bottom: 0.3mm dotted #9aa0ad; }
.frame-bar { display: flex; gap: 0.5mm; border-radius: 1.5mm; overflow: hidden; }
.frame-bar .seg { padding: 0.6mm 1.2mm; color: #fff; font-size: 7.5pt; }
.frame-bar .s0 { background: $ACCENT; } .frame-bar .s1 { background: #2563eb; } .frame-bar .s2 { background: #dc2626; } .frame-bar .s3 { background: #059669; }
.cite { color: #6b7080; font-size: .92em; }
.toc { list-style: none; padding: 0; margin: 2mm 0 0; }
.toc li { padding: 2.2mm 0; border-bottom: 0.25mm solid #eceef1; break-inside: avoid; }
.toc-row { display: flex; align-items: baseline; gap: 3mm; font-size: 11pt; font-weight: 600; }
.toc-n { font-family: var(--serif); font-weight: 700; color: $ACCENT; width: 8mm; font-size: 13pt; flex: none; }
.toc-sub { margin-left: 11mm; font-size: 8.4pt; color: #6b7080; }
.tbl { width: 100%; border-collapse: collapse; font-size: 9pt; }
.tbl th { text-align: left; font-weight: 600; padding: 1.2mm 2mm; border-bottom: 0.5mm solid #1f2430; }
.tbl td { padding: 1.1mm 2mm; border-bottom: 0.25mm solid #e4e6eb; vertical-align: top; }
.tbl tr { break-inside: avoid; }
.nw { white-space: nowrap; }
.gap { color: #b45309; }
.covered { color: #047857; font-weight: 700; margin-top: 3mm; }
.bars { margin: 3mm 0 2mm; }
.bar-row { display: grid; grid-template-columns: 62mm 1fr 8mm; align-items: center; gap: 3mm; padding: 1.2mm 0; }
.bar-l { font-size: 9pt; }
.bar-track { height: 4.2mm; display: block; }
.bar { display: block; height: 100%; background: $ACCENT; border-radius: 0 1mm 1mm 0; }
.bar-v { font-weight: 700; font-size: 9pt; text-align: right; font-variant-numeric: tabular-nums; }
.top { padding-left: 5mm; max-width: 140mm; } .top li { padding: 1mm 0; }
.top li span { display: inline-flex; width: calc(100% - 30mm); }
.top li span::after { content: ""; flex: 1; border-bottom: 0.3mm dotted #9aa0ad; margin: 0 2mm 1.2mm; }
.srcs { padding-left: 5mm; margin: 0 0 1mm; } .srcs li { margin-bottom: 0.8mm; }

/* ---- The cover ---- */
.nc { page: cover; width: 210mm; height: 297mm; position: relative; overflow: hidden; break-after: page; background: #faf8f3; color: #1f2430; display: flex; flex-direction: column; }
.nc + .fm { break-before: auto; }
.nc-in { position: relative; flex: 1; display: flex; flex-direction: column; padding: 16mm 18mm; }
.nc-top { display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: #6b7080; position: relative; }
.nc-brand { font-weight: 800; color: var(--c); font-size: 14pt; letter-spacing: .02em; }
.nc-mid { position: relative; margin-top: 42mm; }
.nc-kicker { font-size: 10pt; color: #6b7080; margin-bottom: 4mm; }
.nc-title { font-family: var(--serif); font-size: 44pt; line-height: 1.12; margin: 0; }
.nc-label { display: inline-block; margin-top: 5mm; background: var(--c); color: #fff; font-weight: 700; font-size: 15pt; padding: 2mm 6mm; border-radius: 1.5mm; }
.nc-feat { list-style: none; padding: 0; margin: 12mm 0 0; font-size: 11pt; position: relative; }
.nc-feat li { padding: 1.6mm 0 1.6mm 6mm; position: relative; }
.nc-feat li::before { content: ""; position: absolute; left: 0; top: 50%; width: 2.6mm; height: 2.6mm; margin-top: -1.3mm; border-radius: 50%; background: var(--c); }
.nc-foot { position: relative; margin-top: auto; border-top: 0.4mm solid currentColor; padding-top: 3mm; display: flex; justify-content: space-between; gap: 8mm; font-size: 9pt; }
.nc-src { max-width: 125mm; }
.nc-upd { opacity: .75; white-space: nowrap; }
.nc-map { position: absolute; right: -38mm; top: 128mm; width: 165mm; }
.nc-map path { fill: var(--c); fill-opacity: .07; stroke: var(--c); stroke-opacity: .35; stroke-width: 1.2; }
.has-ribbon .nc-top > :last-child { margin-right: 24mm; }
.nc-ribbon { position: absolute; top: 0; right: 0; width: 60mm; height: 60mm; overflow: hidden; pointer-events: none; }
.nc-ribbon span { position: absolute; top: 14mm; right: -16mm; width: 80mm; transform: rotate(45deg); background: var(--c2); color: #fff; text-align: center; font-weight: 700; font-size: 10pt; padding: 1.6mm 0; box-shadow: 0 1mm 2mm rgba(0,0,0,.15); }

/* Colour band */
.nc-band { flex-direction: row; }
.nc-bandcol { width: 56mm; background: var(--c); color: #fff; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 16mm 0; flex: none; }
.nc-bandcol .nc-brand { color: #fff; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 16pt; }
.nc-vlabel { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 22pt; font-weight: 800; opacity: .9; }
.nc-band .nc-main { position: relative; flex: 1; display: flex; flex-direction: column; padding: 16mm 16mm; overflow: hidden; }
.nc-band .nc-title { font-size: 38pt; }
.nc-band .nc-label { background: transparent; color: var(--c); border: 0.6mm solid var(--c); }
.nc-band .nc-map { right: -60mm; top: 140mm; }

/* Full photo */
.nc-photo { background: linear-gradient(160deg, var(--c), var(--cd)); color: #fff; }
.nc-photo .nc-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.nc-photo .nc-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,calc(var(--dim) * .6)) 0%, rgba(0,0,0,var(--dim)) 100%); }
.nc-photo .nc-top, .nc-photo .nc-kicker { color: rgba(255,255,255,.85); }
.nc-photo .nc-brand { color: #fff; }
.nc-photo .nc-label { background: var(--c2); }
.nc-photo .nc-feat li::before { background: var(--c2); }
.nc-photo .nc-mid { margin-top: auto; margin-bottom: 10mm; }
.nc-photo .nc-title { text-shadow: 0 1mm 4mm rgba(0,0,0,.35); }

/* Framed photo */
.nc-framed .nc-frame { margin: 12mm auto 0; width: 150mm; height: 100mm; background: #fff; padding: 3mm; border-radius: 2mm; box-shadow: 0 2mm 6mm rgba(0,0,0,.12); position: relative; overflow: hidden; }
.nc-framed .nc-frame img { width: 100%; height: 100%; object-fit: cover; border-radius: 1mm; display: block; }
.nc-framed .nc-frame .nc-map { position: static; width: 100%; height: 100%; }
.nc-framed .nc-frame .nc-map path { fill-opacity: .12; }
.nc-framed .nc-mid { margin-top: 12mm; }
.nc-framed .nc-title { font-size: 38pt; }
.nc-framed .nc-feat { margin-top: 7mm; }

/* Split */
.nc-split { background: #fff; }
.nc-upper { position: relative; height: 165mm; background: linear-gradient(160deg, var(--c), var(--cd)); color: #fff; padding: 16mm 18mm; overflow: hidden; }
.nc-upper .nc-top, .nc-upper .nc-kicker { color: rgba(255,255,255,.85); }
.nc-upper .nc-brand { color: #fff; }
.nc-upper .nc-mid { margin-top: 30mm; }
.nc-upper .nc-label { background: var(--c2); }
.nc-upper .nc-map { top: 20mm; right: -30mm; width: 150mm; }
.nc-upper .nc-map path { fill: #fff; fill-opacity: .08; stroke: #fff; stroke-opacity: .3; }
.nc-lower { flex: 1; display: flex; flex-direction: column; padding: 4mm 18mm 16mm; }
.nc-lower .nc-feat { margin-top: 6mm; }

/* Minimal */
.nc-minimal { background: #fff; }
.nc-minimal .nc-in { margin: 10mm; border: 0.5mm solid #1f2430; outline: 0.25mm solid #1f2430; outline-offset: 1.5mm; padding: 14mm 14mm; }
.nc-minimal .nc-brand { color: #1f2430; }
.nc-minimal .nc-mid { margin-top: 60mm; text-align: center; }
.nc-minimal .nc-label { background: transparent; color: var(--c); padding: 0; font-size: 16pt; border-bottom: 0.5mm solid var(--c); border-radius: 0; }
.nc-minimal .nc-label { display: table; margin: 5mm auto 0; }
.nc-minimal .nc-feat { display: table; margin: 12mm auto 0; text-align: left; }
.nc-minimal .nc-feat li::before { background: #1f2430; width: 1.6mm; height: 1.6mm; margin-top: -0.8mm; }

/* On screen (the preview): each front page shows as a sheet. */
@media screen {
  body { background: #e5e7eb; padding: 0; }
  .fm { width: 210mm; min-height: 297mm; margin: 0 auto 6mm; padding: 16mm 18mm 18mm; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .nc { margin: 0 auto 6mm; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  body.one .nc { margin: 0; box-shadow: none; }
}
`;
