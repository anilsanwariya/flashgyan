// Infographics, "Words in the News": settings, the key that keeps a word
// from being posted twice, finding a word's sentence in its article, the
// caption template, and the AI's prompts (suggest words, write cards,
// proofread them, choose the day's design) with their parsers. Pure:
// shared by the server, the editor's page and tests.
import { looseWord } from "@/lib/flash-spell";
import {
  IG_DESIGN_KEYS,
  IG_DESIGNS,
  type IgCard,
  type IgDesign,
  type IgLang,
} from "@/lib/ig-cards";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";
import type { ChatMessage } from "../../supabase/functions/_shared/saathi-core.ts";

// ---------- Settings ----------

export type IgSettings = {
  // Suggest words on their own after the evening collection.
  auto_suggest: boolean;
  // The channel: "@flashgyan", "-100…" or a t.me link.
  channel: string;
  // When the album is posted (IST), the day after the news.
  post_time: string;
  // Suggestions per language, and how many of each go in the album.
  suggest_en: number;
  suggest_hi: number;
  pick_en: number;
  pick_hi: number;
  // Designs the AI may choose from.
  designs: IgDesign[];
  // The watermark's strength, 0 (off) to 100.
  watermark: number;
  caption: string;
  // Message the admin chat when words are suggested and cards are ready.
  notify: boolean;
};

export const DEFAULT_IG_CAPTION = `📰 Words in the News | {date}

आज की ख़बरों से {count} ज़रूरी शब्द 👇
🔤 English: {english_words}
🔠 हिंदी: {hindi_words}

💾 Save करें और रोज़ दोहराएँ
📲 FlashGyan App: {app_link}

#WordsInTheNews #Vocabulary #RPSC #RSSB #SSC`;

export const DEFAULT_IG_SETTINGS: IgSettings = {
  auto_suggest: true,
  channel: "",
  post_time: "09:00",
  suggest_en: 10,
  suggest_hi: 10,
  pick_en: 5,
  pick_hi: 5,
  designs: [...IG_DESIGN_KEYS],
  watermark: 7,
  caption: DEFAULT_IG_CAPTION,
  notify: true,
};

export function igSettingsOf(value: unknown): IgSettings {
  const v = (value && typeof value === "object" ? value : {}) as Partial<IgSettings>;
  const s = { ...DEFAULT_IG_SETTINGS, ...v };
  const designs = (Array.isArray(s.designs) ? s.designs : []).filter((d): d is IgDesign =>
    IG_DESIGN_KEYS.includes(d as IgDesign),
  );
  return { ...s, designs: designs.length ? designs : [...IG_DESIGN_KEYS] };
}

// "@flashgyan" or "-100…" for the Telegram API, from what the editor pasted.
export function channelChatId(channel: string): string {
  const c = channel.trim();
  const link = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,})\/?$/i.exec(c);
  if (link) return `@${link[1]}`;
  if (/^-?\d{6,}$/.test(c)) return c;
  if (/^@?[A-Za-z0-9_]{4,}$/.test(c)) return c.startsWith("@") ? c : `@${c}`;
  return "";
}

// What the card's footer shows for the channel: "t.me/flashgyan".
export function channelLabel(channel: string): string {
  const id = channelChatId(channel);
  return id.startsWith("@") ? `t.me/${id.slice(1)}` : "";
}

// ---------- Words that may not repeat ----------

const EN_ENDINGS = [
  "ingly",
  "edly",
  "ments",
  "ment",
  "ness",
  "ions",
  "ion",
  "ing",
  "ies",
  "ied",
  "ed",
  "es",
  "ly",
  "s",
  "e",
];

// One key for every form of a word: "eradicate", "eradicated" and
// "eradication" share one; Hindi spellings that differ only by nukta,
// chandrabindu or a half nasal share one.
export function igWordKey(word: string, lang: IgLang): string {
  const w = word.normalize("NFC").trim();
  if (lang === "hi") return looseWord(w).replace(/\s+/g, " ");
  let k = w
    .toLowerCase()
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (k.includes(" ")) return k;
  // Two endings at most: "meticulously" → "meticulous" → "meticulou".
  for (let pass = 0; pass < 2; pass++) {
    const end = EN_ENDINGS.find((e) => k.length - e.length >= 4 && k.endsWith(e));
    if (!end) break;
    k = k.slice(0, -end.length);
  }
  return k;
}

// ---------- The word's sentence in its article ----------

const flat = (s: string) =>
  s.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// The sentences of an article (English full stops, Hindi purna viram).
export function sentencesOf(text: string): string[] {
  return flat(text.replace(/^#.*$/gm, " ").replace(/^Source: .*$/gm, " "))
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 400);
}

// The word's sentence as it stands in the article: the AI's sentence when
// the article has it, else the first sentence holding the word (or a form
// of it). Null when the article doesn't use the word at all.
export function findSentence(article: string, word: string, aiSentence: string): string | null {
  const all = sentencesOf(article);
  const said = flat(aiSentence).replace(/^"|"$/g, "");
  if (said.length > 20 && flat(article).includes(said)) return said;
  const w = word.trim();
  const stem = /^[A-Za-z]/.test(w) && w.length > 5 ? w.slice(0, -2) : w;
  const re = /^[A-Za-z]/.test(w)
    ? new RegExp(`(?<![A-Za-z])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
    : null;
  return all.find((s) => (re ? re.test(s) : s.includes(w))) ?? null;
}

// Whether a text is mostly Hindi.
export const isHindiText = (s: string) => {
  const dev = (s.match(/[ऀ-ॿ]/g) ?? []).length;
  const lat = (s.match(/[A-Za-z]/g) ?? []).length;
  return dev > lat;
};

// ---------- Caption ----------

export type CaptionParts = {
  date: string;
  english: string[];
  hindi: string[];
  appLink: string;
  channel: string;
};

export const CAPTION_FIELDS = [
  ["{date}", "the date: 28 October 2026"],
  ["{count}", "how many words"],
  ["{english_words}", "the English words, with •"],
  ["{hindi_words}", "the Hindi words, with •"],
  ["{app_link}", "the Play Store link"],
  ["{channel}", "the channel link"],
] as const;

export function fillCaption(template: string, p: CaptionParts): string {
  const count = p.english.length + p.hindi.length;
  return template
    .replace(/\{date\}/g, p.date)
    .replace(/\{count\}/g, String(count))
    .replace(/\{english_words\}/g, p.english.join(" • "))
    .replace(/\{hindi_words\}/g, p.hindi.join(" • "))
    .replace(/\{app_link\}/g, p.appLink)
    .replace(/\{channel\}/g, p.channel)
    .trim();
}

// Telegram's limit for a photo's caption.
export const CAPTION_MAX = 1024;

// ---------- Suggesting words ----------

export type IgArticle = { index: number; paper: string; title: string; text: string };

export type IgSuggestion = {
  word: string;
  base: string;
  pos: string;
  article: number;
  sentence: string;
  why: string;
};

const EXAMS =
  "Rajasthan and central government competitive exams (RPSC, RSSB, SSC, banking, railways)";

export function suggestMessages(
  lang: IgLang,
  articles: IgArticle[],
  count: number,
  avoid: string[],
): ChatMessage[] {
  const en = lang === "en";
  const system = en
    ? `You pick vocabulary for students preparing for ${EXAMS} from today's English newspapers. Choose words that exams ask (synonym, antonym, one-word, fill-in-the-blank questions): useful, a little advanced, not everyday words like "government" or "said", not names, places, brands, abbreviations or technical jargon. Prefer a mix of nouns, verbs, adjectives and adverbs, and words whose meaning the sentence shows.`
    : `You pick Hindi vocabulary for students preparing for ${EXAMS} from today's Hindi newspapers. Choose words that Hindi grammar and vocabulary questions ask (पर्यायवाची, विलोम, शुद्ध वर्तनी, उपसर्ग-प्रत्यय, संधि, समास, शब्द-भेद): mostly तत्सम and literary words that a student should know, not everyday words like "सरकार" or "कहा", not names, places, English words written in Devanagari or abbreviations.`;
  const user = `Today's articles (each starts with its number):

${articles.map((a) => `[${a.index}] ${a.paper} — ${a.title}\n${a.text}`).join("\n\n")}

Already posted or suggested; do not suggest these or any form of them: ${avoid.length ? avoid.join(", ") : "(none)"}

Suggest ${count} different words, best first. Each must be used in one of the articles above. Reply with JSON only:
{"words":[{"word":"the word as used in the sentence","base":"its dictionary form","pos":"${en ? "noun|verb|adjective|adverb" : "संज्ञा|सर्वनाम|विशेषण|क्रिया|क्रिया-विशेषण|अव्यय"}","article":<number>,"sentence":"the sentence it is used in, copied exactly from the article","why":"one short line on why students should know it"}]}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const jsonObject = (raw: string): unknown => {
  const t = raw.replace(/```(?:json)?/g, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
};
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, max = 6) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, 80))
    .filter(Boolean)
    .slice(0, max);

export function parseSuggestions(raw: string): IgSuggestion[] | null {
  const o = jsonObject(raw) as { words?: unknown } | null;
  if (!o || !Array.isArray(o.words)) return null;
  return o.words
    .map((x) => {
      const w = (x ?? {}) as Record<string, unknown>;
      return {
        word: str(w.word, 60),
        base: str(w.base, 60) || str(w.word, 60),
        pos: str(w.pos, 40),
        article: Number(w.article),
        sentence: str(w.sentence, 500),
        why: str(w.why, 200),
      };
    })
    .filter((w) => w.word && Number.isFinite(w.article));
}

// ---------- Writing the cards ----------

export type IgWriteInput = { n: number; word: string; sentence: string; paper: string };

export function writeMessages(
  lang: IgLang,
  words: IgWriteInput[],
  glossary: GlossaryEntry[] = [],
): ChatMessage[] {
  const en = lang === "en";
  const system = en
    ? `You write vocabulary cards for Hindi-medium students preparing for ${EXAMS}. Each card explains an English word from today's news so a student understands and remembers it. Use British spelling. Be exact: meanings, synonyms and antonyms must be ones a dictionary and exam books give; give the meaning in the sense the news sentence uses first. Hindi must be correct, standard and simple.`
    : `You write Hindi vocabulary cards for students preparing for ${EXAMS}. Each card explains a Hindi word from today's news so a student understands and remembers it. Be exact: अर्थ, पर्यायवाची and विलोम must be the standard ones from exam books and dictionaries; spelling must be शुद्ध; give the meaning in the sense the news sentence uses first.${hindiGuide(glossary)}`;
  const fields = en
    ? `"pos": part of speech in English and Hindi, as "Adjective · विशेषण";
"say": how to say it in Devanagari, syllables joined by hyphens ("बि-लि-जरेंट");
"ipa": British IPA between slashes;
"main": its Hindi meaning, 1-3 short meanings joined by "; " (the news sense first);
"sub": its English meaning in at most 12 words;
"newsHi": the news sentence in natural Hindi;
"synonyms": 3 English synonyms in this sense (single words or short phrases), capitalised;
"antonyms": 2 English antonyms in this sense, capitalised, or [] if none is natural;
"extras": 1 or 2 tips that best help remember or use it, each {"title","text"}; titles from: "Root", "Memory trick", "Don't confuse", "Word family", "Common phrases"; text at most 110 characters, key words in **bold** (e.g. {"title":"Root","text":"Latin **bellum** = war → bellicose, rebellion"}).`
    : `"pos": शब्द-भेद and origin, as "संज्ञा (पुल्लिंग) · तत्सम" or "विशेषण · तद्भव";
"say": the word in Roman letters ("Atikraman");
"ipa": "";
"main": its Hindi meaning in at most 14 words (the news sense first);
"sub": its English equivalent in 1-3 words;
"newsHi": "";
"synonyms": 2 or 3 standard पर्यायवाची, or [] if none;
"antonyms": 1 or 2 standard विलोम, or [] if none is standard;
"extras": 1 or 2 tips that best help, each {"title","text"}; titles from: "शब्द-रचना" (उपसर्ग/मूल/प्रत्यय), "संधि-विच्छेद", "समास", "वर्तनी सावधान" (a common wrong spelling struck as ~~wrong~~ ✗ beside the right one ✓), "संबंधित शब्द"; text at most 90 characters, key parts in **bold**.`;
  const user = `Words, each with its sentence from today's news:

${words.map((w) => `${w.n}. ${w.word} — "${w.sentence}" (${w.paper || "newspaper"})`).join("\n")}

For each word write these fields:
${fields}

Reply with JSON only: {"cards":[{"n":<number>,"word":"the word in its dictionary form",...the fields}]}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export type IgWritten = Omit<IgCard, "lang" | "news" | "paper"> & { n: number };

export function parseCards(raw: string): IgWritten[] | null {
  const o = jsonObject(raw) as { cards?: unknown } | null;
  if (!o || !Array.isArray(o.cards)) return null;
  return o.cards
    .map((x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const extras = (Array.isArray(c.extras) ? c.extras : [])
        .map((e) => {
          const r = (e ?? {}) as Record<string, unknown>;
          return { title: str(r.title, 40), text: str(r.text, 200) };
        })
        .filter((e) => e.title && e.text)
        .slice(0, 2);
      return {
        n: Number(c.n),
        word: str(c.word, 60),
        pos: str(c.pos, 60),
        say: str(c.say, 60),
        ipa: str(c.ipa, 60),
        main: str(c.main, 200),
        sub: str(c.sub, 160),
        newsHi: str(c.newsHi, 500),
        synonyms: strs(c.synonyms, 4),
        antonyms: strs(c.antonyms, 3),
        extras,
      };
    })
    .filter((c) => Number.isFinite(c.n) && c.main);
}

// ---------- Proofreading ----------

export const CARD_FIELDS = [
  "word",
  "pos",
  "say",
  "ipa",
  "main",
  "sub",
  "news",
  "newsHi",
  "synonyms",
  "antonyms",
  "extras",
] as const;
export type CardField = (typeof CARD_FIELDS)[number];

export const FIELD_NAMES: Record<CardField | "news", string> = {
  word: "Word",
  pos: "Part of speech",
  say: "Pronunciation",
  ipa: "IPA",
  main: "Main meaning",
  sub: "Second meaning",
  news: "News line",
  newsHi: "News line in Hindi",
  synonyms: "Synonyms",
  antonyms: "Antonyms",
  extras: "Tips",
};

// A problem found on a card: by the AI's proofreading or the dictionaries.
export type IgCheck = {
  id: string;
  source: "ai" | "dictionary";
  field: CardField | "news";
  // The wrong text, as it stands, and what it should be (if known).
  text: string;
  fix: string;
  why: string;
  state: "open" | "accepted" | "ignored";
};

export function proofMessages(lang: IgLang, cards: (IgCard & { n: number })[]): ChatMessage[] {
  const en = lang === "en";
  const system = `You proofread vocabulary cards for ${EXAMS} before they are posted to thousands of students. Find real mistakes only: a wrong or misleading meaning, a meaning that doesn't fit the news sentence's sense, a synonym or antonym that is wrong for this sense, a wrong part of speech, wrong pronunciation, a wrong or unnatural Hindi translation, wrong facts in a tip, ${en ? "spelling (British spelling is the house style) and grammar" : "अशुद्ध वर्तनी, wrong लिंग or शब्द-भेद, a non-standard पर्यायवाची or विलोम"}. Don't report matters of taste. Never change the news line ("news") of a card whose "rewritten" is false: it is quoted from the paper; a rewritten one is proofread like the rest.`;
  const user = `Cards:
${JSON.stringify(
  cards.map(
    ({
      n,
      word,
      pos,
      say,
      ipa,
      main,
      sub,
      news,
      newsHi,
      synonyms,
      antonyms,
      extras,
      rewritten,
    }) => ({
      n,
      rewritten: !!rewritten,
      word,
      pos,
      say,
      ipa,
      main,
      sub,
      news,
      newsHi,
      synonyms,
      antonyms,
      extras,
    }),
  ),
  null,
  1,
)}

Reply with JSON only: {"issues":[{"n":<card number>,"field":"${CARD_FIELDS.join("|")}","text":"the wrong text exactly as it stands (for synonyms/antonyms the one item)","fix":"the corrected text, or \\"\\" to remove the item","why":"short reason"}]}. Reply {"issues":[]} if a card has no mistakes.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function parseIssues(
  raw: string,
): { n: number; field: CardField; text: string; fix: string; why: string }[] | null {
  const o = jsonObject(raw) as { issues?: unknown } | null;
  if (!o || !Array.isArray(o.issues)) return null;
  return o.issues
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      return {
        n: Number(r.n),
        field: str(r.field, 20) as CardField,
        text: str(r.text, 300),
        fix: typeof r.fix === "string" ? r.fix.trim().slice(0, 300) : "",
        why: str(r.why, 300),
      };
    })
    .filter((i) => Number.isFinite(i.n) && CARD_FIELDS.includes(i.field) && (i.text || i.why));
}

// A fix put into the card: the wrong text replaced in its field (a list
// item replaced or, with an empty fix, removed).
export function applyFix(card: IgCard, field: CardField, text: string, fix: string): IgCard {
  const next: IgCard = {
    ...card,
    synonyms: [...card.synonyms],
    antonyms: [...card.antonyms],
    extras: card.extras.map((e) => ({ ...e })),
  };
  if (field === "synonyms" || field === "antonyms") {
    const list = next[field];
    const at = list.findIndex((x) => x.toLowerCase() === text.toLowerCase());
    if (at >= 0) {
      if (fix) list[at] = fix;
      else list.splice(at, 1);
    } else if (fix && !text) list.push(fix);
    return next;
  }
  if (field === "extras") {
    next.extras = next.extras.map((e) => ({
      title: e.title,
      text: text && e.text.includes(text) ? e.text.replace(text, fix) : e.text,
    }));
    return next;
  }
  const cur = String(next[field] ?? "");
  next[field] = (text && cur.includes(text) ? cur.replace(text, fix) : fix || cur) as never;
  return next;
}

// ---------- One part written again ----------

export type IgPart = "say" | "meaning" | "sentence" | "words" | "tips";

export const IG_PART_NAMES: Record<IgPart, string> = {
  say: "the word, part of speech and pronunciation",
  meaning: "the meanings",
  sentence: "the news line",
  words: "the synonyms and antonyms",
  tips: "the tips",
};

// A sentence written again: three to choose from.
export type IgSentence = { news: string; newsHi: string };

export function partMessages(
  part: IgPart,
  card: IgCard,
  opts: { article: string; note: string; glossary?: GlossaryEntry[] },
): ChatMessage[] {
  const en = card.lang === "en";
  const hindi = en ? "" : hindiGuide(opts.glossary ?? []);
  const system = `You improve one part of a vocabulary card for students preparing for ${EXAMS}. The card explains ${en ? "an English" : "a Hindi"} word from today's news. Be exact: meanings, synonyms and antonyms must be ones dictionaries and exam books give, in the sense the card uses.${en ? " Use British spelling; Hindi must be correct, standard and simple." : ""}${hindi}`;
  const fields: Record<IgPart, string> = {
    say: en
      ? `{"word":"the word, capitalised","pos":"part of speech in English and Hindi, as 'Adjective · विशेषण'","say":"how to say it in Devanagari, syllables joined by hyphens","ipa":"British IPA between slashes"}`
      : `{"word":"the word","pos":"शब्द-भेद and origin, as 'संज्ञा (पुल्लिंग) · तत्सम'","say":"the word in Roman letters"}`,
    meaning: en
      ? `{"main":"its Hindi meaning, 1-3 short meanings joined by '; ' (the card's sense first)","sub":"its English meaning in at most 12 words"}`
      : `{"main":"its Hindi meaning in at most 14 words (the card's sense first)","sub":"its English equivalent in 1-3 words"}`,
    sentence: `{"options":[{"news":"a sentence using the word","newsHi":"${en ? "the sentence in natural Hindi" : ""}"}, …3 options]}. Each sentence uses the word "${card.word}" (or a form of it) in the card's sense, says only what the article says (no names, numbers or claims it doesn't have), is at most 22 words and is clear to a student; the three differ`,
    words: en
      ? `{"synonyms":[3 English synonyms in the card's sense, capitalised],"antonyms":[2 English antonyms in the card's sense, capitalised, or [] if none is natural]}`
      : `{"synonyms":[2 or 3 standard पर्यायवाची],"antonyms":[1 or 2 standard विलोम, or []]}`,
    tips: en
      ? `{"extras":[1 or 2 tips that best help remember or use it, each {"title","text"}; titles from "Root", "Memory trick", "Don't confuse", "Word family", "Common phrases"; text at most 110 characters, key words in **bold**]}`
      : `{"extras":[1 or 2 tips, each {"title","text"}; titles from "शब्द-रचना", "संधि-विच्छेद", "समास", "वर्तनी सावधान" (a common wrong spelling struck as ~~wrong~~ ✗ beside the right one ✓), "संबंधित शब्द"; text at most 90 characters, key parts in **bold**]}`,
  };
  const user = `The card:
${JSON.stringify(
  {
    word: card.word,
    pos: card.pos,
    say: card.say,
    ipa: card.ipa,
    main: card.main,
    sub: card.sub,
    news: card.news,
    newsHi: card.newsHi,
    synonyms: card.synonyms,
    antonyms: card.antonyms,
    extras: card.extras,
  },
  null,
  1,
)}
${opts.article ? `\nThe article it is from:\n${opts.article}\n` : ""}
Write ${IG_PART_NAMES[part]} again.${opts.note.trim() ? ` The editor asks: ${opts.note.trim()}` : ""}

Reply with JSON only: ${fields[part]}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// What the AI wrote for a part, as a change to the card (or, for the news
// line, the options to choose from).
export function parsePart(
  part: IgPart,
  raw: string,
): { patch: Partial<IgCard> } | { options: IgSentence[] } | null {
  const o = jsonObject(raw) as Record<string, unknown> | null;
  if (!o) return null;
  if (part === "sentence") {
    const options = (Array.isArray(o.options) ? o.options : [])
      .map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        return { news: str(r.news, 400), newsHi: str(r.newsHi, 500) };
      })
      .filter((x) => x.news)
      .slice(0, 3);
    return options.length ? { options } : null;
  }
  if (part === "say") {
    const patch = {
      word: str(o.word, 60),
      pos: str(o.pos, 60),
      say: str(o.say, 60),
      ipa: str(o.ipa, 60),
    };
    return patch.pos || patch.say
      ? { patch: Object.fromEntries(Object.entries(patch).filter(([, v]) => v)) }
      : null;
  }
  if (part === "meaning") {
    const main = str(o.main, 200);
    return main ? { patch: { main, sub: str(o.sub, 160) } } : null;
  }
  if (part === "words") {
    const synonyms = strs(o.synonyms, 4);
    return synonyms.length ? { patch: { synonyms, antonyms: strs(o.antonyms, 3) } } : null;
  }
  const extras = (Array.isArray(o.extras) ? o.extras : [])
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      return { title: str(r.title, 40), text: str(r.text, 200) };
    })
    .filter((e) => e.title && e.text)
    .slice(0, 2);
  return extras.length ? { patch: { extras } } : null;
}

// The sentences of an article that use the word (or a form of it): the
// paper's own lines to choose from.
export function sentencesWith(article: string, word: string, max = 12): string[] {
  const w = word.trim();
  if (!w) return [];
  const stem = /^[A-Za-z]/.test(w) && w.length > 5 ? w.slice(0, -2) : w;
  const re = /^[A-Za-z]/.test(w)
    ? new RegExp(`(?<![A-Za-z])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
    : null;
  return [...new Set(sentencesOf(article).filter((s) => (re ? re.test(s) : s.includes(w))))].slice(
    0,
    max,
  );
}

// Which tab of the card editor a field is on.
export const PART_OF_FIELD: Record<CardField, IgPart> = {
  word: "say",
  pos: "say",
  say: "say",
  ipa: "say",
  main: "meaning",
  sub: "meaning",
  news: "sentence",
  newsHi: "sentence",
  synonyms: "words",
  antonyms: "words",
  extras: "tips",
};

// ---------- The day's design ----------

export function designMessages(
  words: string[],
  allowed: IgDesign[],
  yesterday: string | null,
): ChatMessage[] {
  const list = IG_DESIGNS.filter((d) => allowed.includes(d.key) && d.key !== yesterday);
  return [
    {
      role: "system",
      content:
        "You choose the look of today's set of vocabulary cards for a Telegram channel. Pick the design that suits today's words and keeps the channel varied.",
    },
    {
      role: "user",
      content: `Today's words: ${words.join(", ")}
Designs: ${list.map((d) => `${d.key} (${d.note})`).join("; ")}
Reply with JSON only: {"design":"<key>","reason":"one short line"}`,
    },
  ];
}

export function parseDesign(
  raw: string,
  allowed: IgDesign[],
): { design: IgDesign; reason: string } | null {
  const o = jsonObject(raw) as { design?: unknown; reason?: unknown } | null;
  const d = str(o?.design, 20) as IgDesign;
  return allowed.includes(d) ? { design: d, reason: str(o?.reason, 200) } : null;
}

// Without the AI: the next allowed design after yesterday's.
export function nextDesign(allowed: IgDesign[], yesterday: string | null): IgDesign {
  const list = allowed.length ? allowed : IG_DESIGN_KEYS;
  const at = list.indexOf(yesterday as IgDesign);
  return list[(at + 1) % list.length];
}

// A card made from what the AI wrote, with the word's news line.
export function cardFrom(
  lang: IgLang,
  w: IgWritten | undefined,
  word: string,
  sentence: string,
  paper: string,
): IgCard {
  return {
    lang,
    word: w?.word || word,
    pos: w?.pos ?? "",
    say: w?.say ?? "",
    ipa: lang === "en" ? (w?.ipa ?? "") : "",
    main: w?.main ?? "",
    sub: w?.sub ?? "",
    news: sentence,
    newsHi: lang === "en" ? (w?.newsHi ?? "") : "",
    paper,
    synonyms: w?.synonyms ?? [],
    antonyms: w?.antonyms ?? [],
    extras: w?.extras ?? [],
  };
}

// A card's texts, for the spelling lists: tips' **bold** parts left out
// (roots and other languages' words: "Latin **bellum**").
export const cardTexts = (c: IgCard) => [
  c.word,
  c.main,
  c.sub,
  c.newsHi,
  ...c.synonyms,
  ...c.antonyms,
  ...c.extras.map((e) => e.text.replace(/\*\*.+?\*\*/g, " ")),
];
