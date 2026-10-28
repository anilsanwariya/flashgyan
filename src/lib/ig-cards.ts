// Infographics: "Words in the News" cards as 1080×1920 HTML pages, ready
// to be photographed (by the browser rendering service) or shown in an
// iframe for the editor. Twelve designs share one layout of parts (the
// word, its meaning, the line from today's paper, synonyms and antonyms, a
// tip or two); each design only styles them. Every card carries the
// FlashGyan logo, a faint large "F" watermark and the channel in its footer.
// Text that runs long is shrunk to fit by a small script on the page.

export type IgLang = "en" | "hi";

// One word's card. For an English word `main` is its Hindi meaning and
// `sub` its English one; for a Hindi word `main` is its Hindi meaning and
// `sub` the English word for it.
export type IgCard = {
  lang: IgLang;
  word: string;
  // "Adjective · विशेषण", "संज्ञा (पुल्लिंग) · तत्सम".
  pos: string;
  // How to say it: Devanagari for an English word, Roman for a Hindi one.
  say: string;
  // IPA, for English words.
  ipa: string;
  main: string;
  sub: string;
  // The sentence from today's paper, its Hindi (for English words) and
  // the paper's name.
  news: string;
  newsHi: string;
  paper: string;
  synonyms: string[];
  antonyms: string[];
  // One or two tips: root, memory trick, don't confuse, word family,
  // समास, शब्द-रचना, वर्तनी सावधान… **bold** and ~~struck~~ allowed.
  extras: { title: string; text: string }[];
};

export type IgDesign =
  | "paper"
  | "midnight"
  | "newspaper"
  | "bold"
  | "mint"
  | "sunset"
  | "notebook"
  | "chalkboard"
  | "broadsheet"
  | "tabloid"
  | "vintage"
  | "akhbar";

export const IG_DESIGNS: { key: IgDesign; name: string; note: string; dark: boolean }[] = [
  { key: "paper", name: "Paper", note: "Cream paper, purple ink", dark: false },
  { key: "midnight", name: "Midnight", note: "Deep purple with a glow", dark: true },
  { key: "newspaper", name: "Newspaper", note: "Newsprint with a clipping", dark: false },
  { key: "bold", name: "Bold", note: "One bright colour, white panels", dark: false },
  { key: "mint", name: "Mint", note: "Fresh green and white", dark: false },
  { key: "sunset", name: "Sunset", note: "Warm gradient, white panels", dark: true },
  { key: "notebook", name: "Notebook", note: "Ruled page, handwriting", dark: false },
  { key: "chalkboard", name: "Chalkboard", note: "Classroom board", dark: true },
  { key: "broadsheet", name: "Broadsheet", note: "Classic front page", dark: false },
  { key: "tabloid", name: "Tabloid", note: "Red masthead, loud headline", dark: false },
  { key: "vintage", name: "Vintage", note: "Old sepia paper", dark: false },
  { key: "akhbar", name: "Akhbar", note: "Hindi daily, blue and red", dark: false },
];
export const IG_DESIGN_KEYS = IG_DESIGNS.map((d) => d.key);
const MASTHEAD = new Set<IgDesign>(["broadsheet", "tabloid", "vintage", "akhbar"]);

export type IgRenderOpts = {
  design: IgDesign;
  // This card's place in the day's set.
  n: number;
  total: number;
  // "2026-10-28".
  date: string;
  // Shown in the footer: "t.me/flashgyan".
  channel: string;
  // Where the logo images are served from ("" for the same site).
  assetBase: string;
  // The watermark's strength, 0 (off) to 100; 7 is the default.
  watermark: number;
};

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Escaped text with **bold** and ~~struck~~.
export function igMarkup(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>");
}

const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_EN_FULL = [
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
];
const MONTHS_HI = [
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
];

// "28 Oct 2026", "28 October 2026" or "28 अक्टूबर 2026".
export function igDate(date: string, style: "short" | "long" | "hi" = "short"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const [y, mo, d] = [m[1], Number(m[2]) - 1, Number(m[3])];
  const names = style === "hi" ? MONTHS_HI : style === "long" ? MONTHS_EN_FULL : MONTHS_EN;
  return `${d} ${names[mo] ?? ""} ${y}`;
}

// The word, highlighted where it stands in the news line (any form of it:
// "eradicate" in "eradicated").
export function markWord(line: string, word: string): string {
  const text = esc(line);
  const w = word.trim();
  if (!w) return text;
  const stem = /^[A-Za-z]/.test(w) && w.length > 5 ? w.slice(0, -2) : w;
  const re = new RegExp(
    /^[A-Za-z]/.test(w)
      ? `(?<![A-Za-z])(${esc(stem).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[A-Za-z]*)`
      : `(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\u0900-\\u0963\\u0966-\\u097F]*)`,
    "i",
  );
  return text.replace(re, "<mark>$1</mark>");
}

const FONTS =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Noto+Sans+Devanagari:wght@400;600;800&family=Noto+Serif:wght@400;700&family=Tiro+Devanagari+Hindi&family=Playfair+Display:wght@700;900&family=Baloo+2:wght@500;800&family=Kalam:wght@400;700&display=block";

const BASE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; }
  body { font-family: Poppins, 'Noto Sans Devanagari', sans-serif; }
  .card { width: 1080px; height: 1920px; position: relative; overflow: hidden; padding: 70px 80px; display: flex; flex-direction: column; gap: 40px; }
  .card > *:not(.wmk) { position: relative; z-index: 1; }
  .fit { display: flex; flex-direction: column; gap: inherit; }
  header { display: flex; justify-content: space-between; align-items: center; }
  .logo { height: 76px; }
  .count { font-size: 34px; font-weight: 600; padding: 8px 26px; border-radius: 40px; }
  .title { display: flex; justify-content: space-between; align-items: baseline; font-size: 40px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .title .date { font-size: 32px; font-weight: 400; letter-spacing: 0; text-transform: none; }
  .pos { font-size: 34px; font-weight: 600; }
  .word { font-size: 150px; line-height: 1.05; font-weight: 800; margin: 6px 0 4px; overflow-wrap: anywhere; }
  html[lang=hi] .word { line-height: 1.3; }
  .say { font-size: 38px; }
  .ipa { opacity: .7; }
  .m-main { font-size: 54px; font-weight: 800; line-height: 1.3; }
  .m-sub { font-size: 38px; line-height: 1.35; margin-top: 8px; }
  .label { font-size: 30px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .src { font-weight: 400; text-transform: none; letter-spacing: 0; opacity: .8; }
  .quote { font-size: 40px; line-height: 1.4; }
  .quote-hi { font-size: 34px; line-height: 1.5; margin-top: 10px; opacity: .85; }
  mark { padding: 0 6px; border-radius: 6px; color: inherit; }
  .rows { display: flex; flex-direction: column; gap: 18px; }
  .row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .rl { font-size: 30px; font-weight: 800; text-transform: uppercase; width: 220px; }
  .chip { font-size: 34px; font-weight: 600; padding: 8px 24px; border-radius: 40px; }
  .extra { font-size: 36px; line-height: 1.45; display: flex; flex-direction: column; gap: 14px; }
  .extra + .extra { margin-top: 0; }
  footer { margin-top: auto; display: flex; align-items: center; gap: 18px; font-size: 30px; font-weight: 600; justify-content: center; }
  .wm { height: 54px; border-radius: 12px; }
  .wmk { position: absolute; left: 50%; top: 52%; height: 1150px; transform: translate(-50%, -50%) rotate(-12deg); pointer-events: none; z-index: 0; }
  .mast-top, .mast-bar { display: flex; justify-content: space-between; align-items: center; }
`;

const DESIGN_CSS: Record<IgDesign, string> = {
  paper: `
    .card { background: #fbf6ec radial-gradient(circle at 20% 10%, #fffdf7 0, #f6eedd 70%); color: #2b2440; }
    .count { background: #5b3fa0; color: #fff; }
    .title { color: #5b3fa0; border-bottom: 4px solid #5b3fa0; padding-bottom: 18px; }
    .word { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; color: #3d2a78; }
    .pos { color: #b4572a; }
    .meaning { border-left: 10px solid #b4572a; padding-left: 30px; }
    .news { background: #fff; border-radius: 26px; padding: 34px 38px; box-shadow: 0 8px 0 #e8dcc2; }
    .news .label { color: #b4572a; }
    mark { background: #ffe08a; }
    .rl { color: #5b3fa0; }
    .syn { background: #e6defa; color: #3d2a78; } .ant { background: #fbe0d4; color: #8c3a17; }
    .extra { background: #efe6d2; border-radius: 26px; padding: 30px 38px; }
    .extra .label { color: #5b3fa0; }
    footer { color: #5b3fa0; }
  `,
  midnight: `
    .card { gap: 32px; background: radial-gradient(circle at 80% 0%, #6d4bd1 0, transparent 45%), radial-gradient(circle at 0% 100%, #2c7a8c 0, transparent 40%), #1b1336; color: #f2eefc; }
    .logo { filter: brightness(0) invert(1); }
    .count { background: rgba(255,255,255,.12); border: 2px solid rgba(255,255,255,.3); }
    .title { color: #c9b8ff; }
    .word { background: linear-gradient(90deg, #ffffff, #c9b8ff); -webkit-background-clip: text; background-clip: text; color: transparent; padding-top: 34px; margin-top: -28px; line-height: 1.2; }
    .pos { color: #7ee0d0; }
    .meaning, .news, .extra { background: rgba(255,255,255,.07); border: 2px solid rgba(255,255,255,.12); border-radius: 28px; padding: 32px 38px; }
    .m-main { color: #ffd479; }
    .label { color: #7ee0d0; }
    mark { background: #ffd479; color: #1b1336; }
    .rl { color: #c9b8ff; }
    .syn { background: rgba(126,224,208,.18); color: #b9f3ea; } .ant { background: rgba(255,140,140,.18); color: #ffc2c2; }
    footer { color: #c9b8ff; }
  `,
  newspaper: `
    .card { background: #f1ede4 repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,.015) 3px 4px); color: #1d1d1d; }
    .count { border: 3px solid #1d1d1d; }
    .title { font-family: 'Playfair Display', 'Tiro Devanagari Hindi', serif; font-size: 58px; font-weight: 900; text-transform: none; border-top: 6px double #1d1d1d; border-bottom: 6px double #1d1d1d; padding: 14px 0; }
    .word { font-family: 'Playfair Display', 'Tiro Devanagari Hindi', serif; font-weight: 900; }
    .pos { font-style: italic; color: #8a1c1c; }
    .m-main { font-family: 'Tiro Devanagari Hindi', 'Noto Serif', serif; }
    .news { background: #fffdf6; padding: 36px 40px; transform: rotate(-1.2deg); box-shadow: 0 10px 24px rgba(0,0,0,.18); border: 1px dashed #aaa; }
    .news .label { color: #8a1c1c; }
    .quote { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; }
    mark { background: transparent; border-bottom: 6px solid #e2b33b; border-radius: 0; font-weight: 700; }
    .rl { color: #8a1c1c; }
    .chip { border: 2px solid #1d1d1d; background: transparent; }
    .ant { border-style: dashed; }
    .extra { border-top: 3px solid #1d1d1d; padding-top: 24px; }
    .extra .label { color: #8a1c1c; }
  `,
  bold: `
    .card { background: #ffb627; color: #241a05; }
    .count { background: #241a05; color: #ffb627; }
    .title { background: #241a05; color: #fff; padding: 18px 30px; border-radius: 20px; }
    .word { font-family: 'Baloo 2', Poppins, sans-serif; font-size: 170px; color: #241a05; }
    .pos { display: inline-block; background: #fff; padding: 6px 22px; border-radius: 30px; }
    .meaning, .news, .extra { background: #fff; border-radius: 34px; padding: 32px 40px; box-shadow: 0 10px 0 #d48a00; }
    .label { color: #c25400; }
    mark { background: #ffe1a1; }
    .rl { color: #241a05; }
    .syn { background: #241a05; color: #fff; } .ant { background: #fff; color: #241a05; border: 3px solid #241a05; }
    footer { color: #241a05; }
  `,
  mint: `
    .card { background: linear-gradient(180deg, #d9f5ea 0, #ffffff 34%); color: #12332b; }
    .count { background: #0f8a6a; color: #fff; }
    .title { color: #0f8a6a; }
    .word { color: #0b5e49; }
    .pos { color: #0f8a6a; }
    .meaning, .news, .extra { background: #fff; border: 3px solid #bfe9d9; border-radius: 30px; padding: 30px 38px; }
    .m-main { color: #0b5e49; }
    .label { color: #0f8a6a; }
    mark { background: #c8f2e1; }
    .rl { color: #0f8a6a; }
    .syn { background: #0f8a6a; color: #fff; } .ant { background: #fff; color: #c2410c; border: 3px solid #fdba74; }
    footer { color: #0f8a6a; }
  `,
  sunset: `
    .card { background: linear-gradient(160deg, #ff7a59 0, #ff4f81 55%, #a23cbf 100%); color: #fff; }
    .logo { filter: brightness(0) invert(1); }
    .count { background: rgba(255,255,255,.22); }
    .title { color: #fff; }
    .word { text-shadow: 0 6px 0 rgba(0,0,0,.12); }
    .meaning, .news, .extra { background: rgba(255,255,255,.95); color: #3b1430; border-radius: 30px; padding: 30px 38px; }
    .m-main { color: #c21d5a; }
    .label { color: #c21d5a; }
    mark { background: #ffe1ec; }
    .rl { color: #fff; }
    .syn { background: #fff; color: #c21d5a; } .ant { background: rgba(0,0,0,.18); color: #fff; }
    footer { color: #fff; }
  `,
  notebook: `
    .card { background: #fffef8 repeating-linear-gradient(180deg, transparent 0 63px, #cfe0f5 63px 65px); color: #1e2a4a; padding-left: 130px; }
    .card::before { content: ""; position: absolute; left: 100px; top: 0; bottom: 0; border-left: 4px solid #f2a1a1; }
    .count { background: #1e2a4a; color: #fff; }
    .title { font-family: 'Kalam', cursive; font-size: 46px; color: #c0392b; text-transform: none; }
    .word { font-family: 'Kalam', cursive; font-weight: 700; color: #1e2a4a; }
    .pos { font-family: 'Kalam', cursive; color: #c0392b; }
    .m-main { font-family: 'Kalam', cursive; color: #1a5fb4; }
    .news { background: #fff7c2; padding: 28px 34px; transform: rotate(-1deg); box-shadow: 0 8px 18px rgba(0,0,0,.12); }
    .label { font-family: 'Kalam', cursive; color: #c0392b; font-size: 36px; text-transform: none; }
    .quote { font-family: 'Kalam', cursive; }
    mark { background: none; border-bottom: 5px solid #f5c400; border-radius: 0; }
    .rl { font-family: 'Kalam', cursive; color: #c0392b; font-size: 34px; text-transform: none; }
    .chip { font-family: 'Kalam', cursive; background: none; border: 3px solid #1a5fb4; color: #1a5fb4; border-radius: 50px 40px 46px 38px; }
    .ant { border-color: #c0392b; color: #c0392b; }
    .extra { font-family: 'Kalam', cursive; border: 3px dashed #1a5fb4; border-radius: 20px; padding: 24px 30px; }
    footer { color: #1e2a4a; }
  `,
  chalkboard: `
    .card { background: radial-gradient(circle at 30% 20%, #3c5a48 0, #263d31 70%); color: #f4f4ee; border: 26px solid #8a5a2b; }
    .logo { filter: brightness(0) invert(1); }
    .count { border: 3px solid #f4f4ee; }
    .title { font-family: 'Kalam', cursive; font-size: 46px; color: #ffe08a; text-transform: none; }
    .word { font-family: 'Kalam', cursive; font-weight: 700; color: #fff; }
    .pos { font-family: 'Kalam', cursive; color: #9fe3ff; }
    .m-main { font-family: 'Kalam', cursive; color: #ffe08a; }
    .news, .extra { border: 3px dashed rgba(255,255,255,.55); border-radius: 22px; padding: 26px 32px; }
    .label { font-family: 'Kalam', cursive; color: #9fe3ff; font-size: 36px; text-transform: none; }
    .quote, .extra { font-family: 'Kalam', cursive; }
    mark { background: none; color: #ffb3c7; font-weight: 700; }
    .rl { font-family: 'Kalam', cursive; color: #ffe08a; font-size: 34px; text-transform: none; }
    .chip { font-family: 'Kalam', cursive; background: none; border: 3px solid #f4f4ee; }
    .ant { border-color: #ffb3c7; color: #ffb3c7; }
    footer { color: #f4f4ee; }
  `,
  broadsheet: `
    .card { background: #f4f1ea; color: #111; padding-top: 50px; gap: 34px; }
    .mast { border-bottom: 8px double #111; padding-bottom: 10px; }
    .mast-top { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-size: 26px; text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    .mast-top .logo { height: 60px; }
    .mast-name { font-family: 'Playfair Display', serif; font-weight: 900; font-size: 100px; text-align: center; line-height: 1.2; letter-spacing: -1px; }
    .mast-bar { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-size: 28px; font-style: italic; border-top: 2px solid #111; padding-top: 10px; }
    .word { font-family: 'Playfair Display', 'Tiro Devanagari Hindi', serif; font-weight: 900; }
    .word-block { text-align: center; }
    .pos { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-style: italic; }
    .meaning { text-align: center; border-top: 2px solid #111; border-bottom: 2px solid #111; padding: 22px 0; }
    .m-main { font-family: 'Tiro Devanagari Hindi', 'Noto Serif', serif; }
    .m-sub { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-style: italic; }
    .news .label, .extra .label { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; border-bottom: 1px solid #111; padding-bottom: 6px; }
    .quote { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-size: 42px; }
    mark { background: none; font-weight: 700; text-decoration: underline; text-decoration-thickness: 4px; }
    .chip { background: none; border-radius: 0; border: 2px solid #111; font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; }
    .ant { background: #111; color: #f4f1ea; }
    .extra { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; }
    footer { border-top: 2px solid #111; padding-top: 16px; }
  `,
  tabloid: `
    .card { background: #fff; color: #111; padding: 0 0 60px; gap: 34px; }
    .card > *:not(.mast):not(.wmk) { margin-left: 80px; margin-right: 80px; }
    html[lang] .word { line-height: 1.3; }
    .mast { background: #d7141a; color: #fff; padding: 40px 80px 28px; }
    .mast-top { font-size: 26px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .mast-top .logo { height: 64px; filter: brightness(0) invert(1); }
    .mast-name { font-weight: 800; font-size: 104px; line-height: 1.1; font-style: italic; letter-spacing: -2px; margin-top: 10px; }
    .mast-bar { font-size: 28px; font-weight: 800; background: #111; margin: 16px -80px -28px; padding: 12px 80px; text-transform: uppercase; }
    .pos { color: #d7141a; text-transform: uppercase; }
    .word { font-size: 160px; letter-spacing: -2px; }
    .m-main { background: #ffe600; display: inline; padding: 0 10px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
    .meaning .m-sub { margin-top: 18px; }
    .news { border-left: 14px solid #d7141a; padding-left: 30px; }
    .label { color: #d7141a; }
    mark { background: #ffe600; }
    .rl { color: #d7141a; }
    .syn { background: #111; color: #fff; border-radius: 6px; } .ant { background: #fff; border: 3px solid #d7141a; color: #d7141a; border-radius: 6px; }
    .extra { background: #f3f3f3; padding: 28px 34px; }
    footer { color: #111; }
  `,
  vintage: `
    .card { background: radial-gradient(ellipse at center, #efe0bd 0, #e2cb98 70%, #c9ab6e 100%); color: #3a2a12; padding-top: 50px; gap: 34px; box-shadow: inset 0 0 120px rgba(80,50,10,.45); }
    .mast { text-align: center; }
    .mast-top { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-size: 26px; letter-spacing: 3px; text-transform: uppercase; }
    .mast-top .logo { height: 60px; filter: sepia(1) saturate(1.4) brightness(.6); }
    .mast-name { font-family: 'Playfair Display', serif; font-weight: 900; font-size: 100px; line-height: 1.2; border-top: 3px solid #3a2a12; border-bottom: 3px solid #3a2a12; margin: 12px 0 8px; padding: 6px 0; }
    .mast-bar { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-size: 28px; font-style: italic; }
    .word-block, .meaning { text-align: center; }
    .word { font-family: 'Playfair Display', 'Tiro Devanagari Hindi', serif; font-weight: 700; }
    .pos, .say { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; font-style: italic; }
    .m-main { font-family: 'Tiro Devanagari Hindi', 'Noto Serif', serif; font-weight: 700; }
    .m-sub, .quote, .extra { font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; }
    .news { border: 3px double #3a2a12; padding: 28px 34px; }
    .label { text-align: center; letter-spacing: 3px; }
    mark { background: none; font-weight: 700; font-style: italic; }
    .chip { background: rgba(58,42,18,.1); border: 1px solid #3a2a12; border-radius: 4px; font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; }
    .extra { border-top: 1px solid #3a2a12; border-bottom: 1px solid #3a2a12; padding: 20px 0; text-align: center; }
    footer { color: #3a2a12; }
    .wm, .wmk { filter: sepia(1); }
  `,
  akhbar: `
    .card { background: #fbfbf8; color: #161616; padding: 0 0 60px; gap: 34px; }
    .card > *:not(.mast):not(.wmk) { margin-left: 80px; margin-right: 80px; }
    html[lang] .word { line-height: 1.3; }
    .mast { padding: 40px 80px 0; }
    .mast-top { font-size: 26px; color: #555; }
    .mast-top .logo { height: 64px; }
    .mast-name { font-family: 'Playfair Display', serif; font-weight: 900; font-size: 104px; color: #0b3d91; line-height: 1.15; margin-top: 6px; }
    .mast-bar { background: #0b3d91; color: #fff; font-size: 28px; font-weight: 600; margin: 10px -80px 0; padding: 12px 80px; border-bottom: 8px solid #d7141a; }
    .pos { color: #d7141a; }
    .word { color: #0b3d91; font-family: 'Noto Sans Devanagari', Poppins, sans-serif; font-weight: 800; }
    .meaning { border-left: 10px solid #d7141a; padding-left: 28px; }
    .news { background: #eef3fb; border-top: 6px solid #0b3d91; padding: 28px 34px; }
    .label { color: #0b3d91; }
    mark { background: #ffd8d9; }
    .rl { color: #0b3d91; }
    .syn { background: #0b3d91; color: #fff; border-radius: 6px; } .ant { background: #fff; color: #d7141a; border: 3px solid #d7141a; border-radius: 6px; }
    .extra { border: 2px solid #0b3d91; padding: 26px 32px; }
    footer { color: #0b3d91; }
  `,
};

// Shrinks the card's middle until everything fits above the footer.
const FIT_SCRIPT = `<script>
(function () {
  function fit() {
    var card = document.querySelector('.card'), box = document.querySelector('.fit');
    if (!card || !box) return;
    var z = 1;
    box.style.zoom = '1';
    while (card.scrollHeight > card.clientHeight + 1 && z > 0.6) {
      z -= 0.03;
      box.style.zoom = String(z);
    }
    document.body.setAttribute('data-fit', String(Math.round(z * 100)));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); else fit();
  window.addEventListener('load', fit);
})();
</script>`;

const LABELS = {
  en: { news: "📰 In today's news", syn: "Synonyms", ant: "Antonyms" },
  hi: { news: "📰 आज की ख़बर में", syn: "पर्यायवाची", ant: "विलोम" },
};

// A card's complete page.
export function igCardHtml(card: IgCard, o: IgRenderOpts): string {
  const lang = card.lang;
  const l = LABELS[lang];
  const a = (f: string) => esc(`${o.assetBase.replace(/\/$/, "")}/infographics/${f}`);
  const date = igDate(o.date, lang === "hi" ? "hi" : "short");
  const chips = (xs: string[], cls: string) =>
    xs
      .filter((x) => x.trim())
      .map((x) => `<span class="chip ${cls}">${esc(x)}</span>`)
      .join("");
  const top = MASTHEAD.has(o.design)
    ? `<div class="mast">
        <div class="mast-top"><span>${lang === "hi" ? "दैनिक शब्द संस्करण" : "Daily Vocabulary Edition"}</span><img class="logo" src="${a("wordmark.png")}" alt="FlashGyan"><span>${esc(date)}</span></div>
        <div class="mast-name">Words in the News</div>
        <div class="mast-bar"><span>FlashGyan</span><span>${lang === "hi" ? `शब्द ${o.n} / ${o.total}` : `Word ${o.n} of ${o.total}`}</span></div>
      </div>`
    : `<header><img class="logo" src="${a("wordmark.png")}" alt="FlashGyan"><div class="count">${o.n}/${o.total}</div></header>
      <div class="title"><span>Words in the News</span><span class="date">${esc(date)}</span></div>`;
  const syn = card.synonyms.filter((x) => x.trim());
  const ant = card.antonyms.filter((x) => x.trim());
  const extras = card.extras.filter((x) => x.text.trim()).slice(0, 2);
  const strength = Math.max(0, Math.min(100, o.watermark)) / 100;
  const dark = IG_DESIGNS.find((d) => d.key === o.design)?.dark;
  const wmk =
    strength > 0
      ? `<img class="wmk" src="${a("f-mark.png")}" alt="" style="opacity:${strength}${dark ? ";filter:brightness(0) invert(1)" : ""}">`
      : "";
  const body = `
    <div class="word-block">
      ${card.pos.trim() ? `<div class="pos">${esc(card.pos)}</div>` : ""}
      <h1 class="word">${esc(card.word)}</h1>
      ${card.say.trim() || card.ipa.trim() ? `<div class="say">${esc(card.say)}${card.ipa.trim() ? ` &nbsp;<span class="ipa">${esc(card.ipa)}</span>` : ""}</div>` : ""}
    </div>
    <div class="meaning">
      <div class="m-main">${igMarkup(card.main)}</div>
      ${card.sub.trim() ? `<div class="m-sub">${igMarkup(card.sub)}</div>` : ""}
    </div>
    ${
      card.news.trim()
        ? `<div class="news">
      <div class="label">${l.news}${card.paper.trim() ? ` <span class="src">· ${esc(card.paper)}</span>` : ""}</div>
      <div class="quote">“${markWord(card.news.trim(), card.word)}”</div>
      ${card.newsHi.trim() ? `<div class="quote-hi">${esc(card.newsHi)}</div>` : ""}
    </div>`
        : ""
    }
    ${
      syn.length || ant.length
        ? `<div class="rows">
      ${syn.length ? `<div class="row"><span class="rl">${l.syn}</span>${chips(syn.slice(0, 4), "syn")}</div>` : ""}
      ${ant.length ? `<div class="row"><span class="rl">${l.ant}</span>${chips(ant.slice(0, 3), "ant")}</div>` : ""}
    </div>`
        : ""
    }
    ${extras
      .map(
        (x) =>
          `<div class="extra"><div><div class="label">💡 ${esc(x.title)}</div><div>${igMarkup(x.text)}</div></div></div>`,
      )
      .join("")}`;
  const channel = o.channel.replace(/^https?:\/\//, "").trim();
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>${BASE}${DESIGN_CSS[o.design] ?? DESIGN_CSS.paper}</style></head>
<body><div class="card">${wmk}${top}<div class="fit">${body}</div>
<footer><img class="wm" src="${a("icon.png")}" alt="">${esc(channel ? `${channel} · FlashGyan app` : "FlashGyan app")}</footer></div>${FIT_SCRIPT}</body></html>`;
}

// A sample card per language, for the design gallery and previews.
export const IG_SAMPLES: Record<IgLang, IgCard> = {
  en: {
    lang: "en",
    word: "Belligerent",
    pos: "Adjective · विशेषण",
    say: "बि-लि-जरेंट",
    ipa: "/bəˈlɪdʒərənt/",
    main: "युद्धरत; झगड़ालू",
    sub: "at war; hostile and eager to fight",
    news: "Both belligerent nations agreed to a ceasefire on Monday.",
    newsHi: "दोनों युद्धरत देशों ने सोमवार को युद्धविराम पर सहमति जताई।",
    paper: "Sample",
    synonyms: ["Warring", "Hostile", "Combative"],
    antonyms: ["Peaceable", "Friendly"],
    extras: [
      {
        title: "Root",
        text: "Latin **bellum** = war → bellicose, rebellion. belligerence (N.) · belligerently (Adv.)",
      },
    ],
  },
  hi: {
    lang: "hi",
    word: "आत्मनिर्भर",
    pos: "विशेषण · तत्सम",
    say: "Aatmanirbhar",
    ipa: "",
    main: "जो अपनी ज़रूरतों के लिए दूसरों पर निर्भर न हो",
    sub: "Self-reliant",
    news: "राज्य सरकार ने किसानों को आत्मनिर्भर बनाने के लिए नई योजना की घोषणा की।",
    newsHi: "",
    paper: "Sample",
    synonyms: ["स्वावलंबी", "स्वाश्रयी"],
    antonyms: ["परावलंबी", "पराश्रित"],
    extras: [
      { title: "समास", text: "आत्म पर निर्भर → **तत्पुरुष समास** · संज्ञा रूप: **आत्मनिर्भरता**" },
    ],
  },
};
