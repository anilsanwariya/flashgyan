// Words in the News round-ups: the week's posted words as one printable A4
// PDF for the channel (every card's details, English then Hindi), and the
// month's words as a page of the monthly magazine. Pure.
import { igDate, igMarkup, markWord, type IgCard, type IgLang } from "@/lib/ig-cards";

export type IgRoundupWord = { lang: IgLang; card: IgCard; posted_on: string };

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FONTS =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Noto+Sans+Devanagari:wght@400;600;800&family=Playfair+Display:wght@800&display=block";

// Each word as a revision box: the word, how to say it, its meanings, the
// news line, synonyms and antonyms, and its tips.
function wordBox(w: IgRoundupWord, n: number): string {
  const c = w.card;
  const hi = w.lang === "hi";
  const list = (label: string, xs: string[]) =>
    xs.length ? `<div class="row"><b>${label}:</b> ${xs.map(esc).join(", ")}</div>` : "";
  return `<article class="box">
  <div class="head"><span class="n">${n}</span><span class="word">${esc(c.word)}</span><span class="pos">${esc(c.pos)}</span></div>
  ${c.say || c.ipa ? `<div class="say">${esc(c.say)}${c.ipa ? ` <span class="ipa">${esc(c.ipa)}</span>` : ""}</div>` : ""}
  <div class="main">${igMarkup(c.main)}</div>
  ${c.sub ? `<div class="sub">${igMarkup(c.sub)}</div>` : ""}
  ${
    c.news
      ? `<div class="news">${c.rewritten ? markWord(c.news, c.word) : `“${markWord(c.news, c.word)}”`}${c.paper ? ` <span class="paper">— ${esc(c.paper)}</span>` : ""}${c.newsHi ? `<div class="newshi">${esc(c.newsHi)}</div>` : ""}</div>`
      : ""
  }
  ${list(hi ? "पर्यायवाची" : "Synonyms", c.synonyms)}
  ${list(hi ? "विलोम" : "Antonyms", c.antonyms)}
  ${c.extras.map((x) => `<div class="tip"><b>${esc(x.title)}:</b> ${igMarkup(x.text)}</div>`).join("")}
  <div class="date">${esc(igDate(w.posted_on, hi ? "hi" : "short"))}</div>
</article>`;
}

// The week's PDF: a title band, then English and Hindi words, two to a row.
export function roundupHtml(
  words: IgRoundupWord[],
  o: { from: string; to: string; assetBase: string; channel: string },
): string {
  const a = (f: string) => esc(`${o.assetBase.replace(/\/$/, "")}/infographics/${f}`);
  const en = words.filter((w) => w.lang === "en");
  const hi = words.filter((w) => w.lang === "hi");
  let n = 0;
  const section = (title: string, list: IgRoundupWord[]) =>
    list.length
      ? `<h2>${title} <span>${list.length}</span></h2><div class="grid">${list.map((w) => wordBox(w, ++n)).join("")}</div>`
      : "";
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
@page { size: A4; margin: 12mm 11mm 14mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Poppins, 'Noto Sans Devanagari', sans-serif; color: #241a3d; font-size: 9.5pt; }
.band { display: flex; align-items: center; justify-content: space-between; gap: 6mm; padding: 6mm 7mm; border-radius: 4mm; background: linear-gradient(120deg, #3d2a78, #6d4bd1); color: #fff; margin-bottom: 6mm; position: relative; overflow: hidden; }
.band h1 { font-family: 'Playfair Display', serif; font-size: 24pt; line-height: 1.1; }
.band p { font-size: 10pt; opacity: .9; margin-top: 1mm; }
.band img.logo { height: 11mm; filter: brightness(0) invert(1); }
.band img.f { position: absolute; right: 30mm; top: -6mm; height: 40mm; opacity: .12; filter: brightness(0) invert(1); transform: rotate(-12deg); }
h2 { font-size: 13pt; color: #3d2a78; border-bottom: 2px solid #3d2a78; padding-bottom: 1mm; margin: 2mm 0 3mm; break-after: avoid; }
h2 span { font-size: 9pt; font-weight: 600; color: #fff; background: #b4572a; border-radius: 3mm; padding: .3mm 2.2mm; vertical-align: middle; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; margin-bottom: 5mm; }
.box { border: 1px solid #e3dcf3; border-radius: 3mm; padding: 3mm 3.5mm; break-inside: avoid; background: #fcfbff; position: relative; }
.head { display: flex; align-items: baseline; gap: 2mm; flex-wrap: wrap; }
.n { font-size: 8pt; font-weight: 700; color: #fff; background: #3d2a78; border-radius: 50%; width: 5mm; height: 5mm; display: inline-flex; align-items: center; justify-content: center; }
.word { font-size: 14pt; font-weight: 800; color: #3d2a78; }
.pos { font-size: 8pt; color: #b4572a; font-weight: 600; }
.say { font-size: 8.5pt; color: #555; }
.ipa { color: #888; }
.main { font-size: 11pt; font-weight: 700; margin-top: 1.2mm; }
.sub { font-size: 9pt; color: #444; }
.news { margin-top: 1.5mm; padding: 1.5mm 2mm; background: #fff8e6; border-left: 2.5px solid #e2a82e; border-radius: 1mm; font-size: 8.8pt; }
.news mark { background: #ffe08a; padding: 0 .5mm; }
.paper { color: #888; font-size: 8pt; }
.newshi { color: #555; margin-top: .6mm; }
.row, .tip { font-size: 8.8pt; margin-top: 1mm; }
.row b, .tip b { color: #3d2a78; }
.date { position: absolute; right: 3mm; top: 2.5mm; font-size: 7pt; color: #999; }
.foot { text-align: center; color: #3d2a78; font-size: 9pt; font-weight: 600; margin-top: 2mm; }
</style></head><body>
<div class="band"><img class="f" src="${a("f-mark.png")}" alt=""><div><h1>Words in the News</h1><p>Weekly Revision · ${esc(igDate(o.from, "long"))} – ${esc(igDate(o.to, "long"))} · ${words.length} words</p></div><img class="logo" src="${a("wordmark.png")}" alt="FlashGyan"></div>
${section("English words", en)}
${section("हिंदी शब्द", hi)}
<p class="foot">${esc(o.channel ? `${o.channel} · FlashGyan app` : "FlashGyan app")}</p>
</body></html>`;
}

// The monthly magazine's "Words of the month": every word posted in the
// month, one line each, English then Hindi, in two columns.
export function monthWordsPage(words: IgRoundupWord[], lang: IgLang): string {
  if (!words.length) return "";
  const line = (w: IgRoundupWord) => {
    const c = w.card;
    const extra = [
      c.synonyms.length
        ? `${w.lang === "hi" ? "पर्याय" : "Syn"}: ${c.synonyms.slice(0, 3).map(esc).join(", ")}`
        : "",
      c.antonyms.length
        ? `${w.lang === "hi" ? "विलोम" : "Ant"}: ${c.antonyms.slice(0, 2).map(esc).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return `<li><b>${esc(c.word)}</b>${c.pos ? ` <i>${esc(c.pos.split("·")[0].trim())}</i>` : ""} — ${igMarkup(c.main)}${c.sub ? ` <span class="wm-sub">(${igMarkup(c.sub)})</span>` : ""}${extra ? `<div class="wm-x">${extra}</div>` : ""}</li>`;
  };
  const block = (title: string, list: IgRoundupWord[]) =>
    list.length
      ? `<h3 class="rev-cat">${title}</h3><ol class="wm-list">${list.map(line).join("")}</ol>`
      : "";
  const hi = lang === "hi";
  return `<section class="section new-page words-month"><style>
.wm-list { columns: 2; column-gap: 6mm; padding-left: 0; margin: 0 0 3mm; list-style: none; }
.wm-list li { break-inside: avoid; padding: 1.2mm 0; font-size: 9pt; border-bottom: 1px dotted #e5e7eb; }
.wm-list i { color: #6b7280; font-size: 8pt; }
.wm-sub { color: #4b5563; }
.wm-x { font-size: 8pt; color: #6b7280; }
</style><div class="section-title"><h2>📰 ${hi ? "माह के शब्द · Words in the News" : "Words of the Month · Words in the News"}</h2><span>${hi ? "इस माह चैनल पर आए सभी शब्द" : "Every word posted on the channel this month"}</span></div>${block(
    hi ? "English words" : "English words",
    words.filter((w) => w.lang === "en"),
  )}${block(
    "हिंदी शब्द",
    words.filter((w) => w.lang === "hi"),
  )}</section>`;
}
