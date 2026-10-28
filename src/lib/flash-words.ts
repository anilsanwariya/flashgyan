// A topic's word list: every word its cards use (the back and explanations,
// and the front unless it is wrong on purpose), each found or not in Hindi
// WordNet, the house spellings and the editor's own list of correct words.
// A word none of them has is worth a look: a typo used once or twice hides
// there. And a chunk's readiness to go to the app. Pure: shared by the
// server, the panel and tests.
import type { FlashCard } from "@/lib/flash-studio";
import { looseWord, wordsIn, type House } from "@/lib/flash-spell";
import { vowelVariants } from "@/lib/flash-dict";
import { edits1, englishWordsIn, rankNear } from "@/lib/flash-english";

export type WordStatus = "known" | "form" | "unknown";

export type TopicWord = {
  word: string;
  // Cards using it.
  count: number;
  status: WordStatus;
  // Why it is known ("WordNet", "house", "your list", the WordNet word it
  // is a form of), or close spellings WordNet or the editor's list have.
  why: string;
  near: string[];
  // The cards using it (kept for unknown words only).
  ids: string[];
};

// Devanagari that isn't part of a word: the danda and the digits.
const NOT_LETTER = /[\u0964-\u096F\u0970]/g;
// A Devanagari letter or sign (a word's edge is where these stop).
const LETTER = "[\\u0900-\\u0963\\u0971-\\u097F]";

// Everyday grammar words WordNet doesn't list (postpositions, pronouns,
// auxiliaries, conjunctions, particles): known without it.
export const COMMON_WORDS = new Set(
  (
    "का के की को से में पर तक ने लिए द्वारा साथ बिना बाद पहले ऊपर नीचे अंदर बाहर पास दूर " +
    "तरह तरफ ओर प्रति हेतु सहित रहित समान भाँति भांति बारे विषय " +
    "मैं मैंने मुझे मुझको मेरा मेरी मेरे हम हमने हमें हमको हमारा हमारी हमारे तू तुम तुमने तुम्हें " +
    "तुम्हारा तुम्हारी तुम्हारे आप आपने आपको आपका आपकी आपके वह वे उस उसने उसे उसको उसका उसकी " +
    "उसके उन उन्होंने उन्हें उनका उनकी उनके यह ये इस इसने इसे इसको इसका इसकी इसके इन इन्होंने " +
    "इन्हें इनका इनकी इनके जो जिस जिसने जिसे जिसका जिसकी जिसके जिन जिन्होंने जिन्हें जिनका " +
    "जिनकी जिनके कौन किस किसने किसे किसका किसकी किसके किन कोई कुछ सब सभी सबका अपना अपनी अपने " +
    "स्वयं खुद क्या कब कहाँ कहां कैसे क्यों कितना कितनी कितने जब तब जहाँ जहां वहाँ वहां यहाँ " +
    "यहां ऐसा ऐसी ऐसे वैसा वैसी वैसे जैसा जैसी जैसे " +
    "है हैं हूँ हूं हो था थी थे थीं होता होती होते होना होगा होगी होंगे हुआ हुई हुए रहा रही " +
    "रहे गया गई गए गयी गये सकता सकती सकते चाहिए " +
    "और एवं तथा या अथवा किंतु किन्तु परंतु परन्तु लेकिन बल्कि क्योंकि इसलिए अतः यदि तो कि " +
    "भी ही न नहीं मत ना जी हाँ हां बहुत अधिक कम केवल सिर्फ लगभग प्रायः अब फिर भी साथ-साथ " +
    "एक दो तीन चार पाँच पांच छह सात आठ नौ दस पहला पहली दूसरा दूसरी तीसरा " +
    "इन्हीं उन्हीं इसी उसी यही वही इनमें उनमें इसमें उसमें जिसमें आपस आओ जाओ"
  ).split(/\s+/),
);

// Each word the cards use, with the cards using it.
export function wordCards(
  cards: Pick<FlashCard, "id" | "front" | "back" | "ex" | "removed">[],
  wrongFront = false,
): Map<string, Set<string>> {
  const by = new Map<string, Set<string>>();
  for (const c of cards) {
    if (c.removed) continue;
    for (const raw of [wrongFront ? "" : c.front, c.back, ...Object.values(c.ex)].flatMap(
      wordsIn,
    )) {
      // Without a danda or digits stuck to it.
      const w = raw.replace(NOT_LETTER, "");
      if ([...w].length < 2) continue;
      const s = by.get(w) ?? new Set<string>();
      s.add(c.id);
      by.set(w, s);
    }
  }
  return by;
}

// Endings of inflected forms, and what the word may be without them
// (करती → करना, लड़कों → लड़का, लड़कियों → लड़की, बातें → बात).
const ENDINGS: [string, string[]][] = [
  // The second part of a compound (आदरपूर्वक, अमृततुल्य, कर्तव्यनिष्ठ).
  ...[
    "पूर्वक",
    "पूर्ण",
    "तुल्य",
    "युक्त",
    "रहित",
    "विहीन",
    "हीन",
    "वाला",
    "वाली",
    "वाले",
    "मान",
    "वान",
    "निष्ठ",
    "प्रद",
    "स्थल",
    "मय",
    "कारी",
    "शील",
    "जनक",
    "पुरुष",
  ].map((e): [string, string[]] => [e, [""]]),
  ["ाइयों", ["ाई"]],
  ["ुओं", ["ु"]],
  ["ूओं", ["ू"]],
  ["ओं", ["", "ा"]],
  ["ोगे", ["ना"]],
  ["ोगी", ["ना"]],
  ["ियों", ["ी", "ि"]],
  ["ियाँ", ["ी", "ि"]],
  ["ियां", ["ी", "ि"]],
  ["ाओं", ["ा"]],
  ["ाएँ", ["ा"]],
  ["ाएं", ["ा"]],
  ["ेंगे", ["ना"]],
  ["ेंगी", ["ना"]],
  ["ेगा", ["ना"]],
  ["ेगी", ["ना"]],
  ["ूँगा", ["ना"]],
  ["ूंगा", ["ना"]],
  ["ाया", ["ाना"]],
  ["ायी", ["ाना"]],
  ["ाये", ["ाना"]],
  ["ों", ["", "ा"]],
  ["ें", ["", "ा"]],
  ["एँ", ["", "ा"]],
  ["एं", ["", "ा"]],
  ["ता", ["ना"]],
  ["ती", ["ना"]],
  ["ते", ["ना"]],
  ["कर", ["ना", ""]],
  ["ने", ["ना"]],
  ["नी", ["ना"]],
  ["या", ["ना"]],
  ["ई", ["ना"]],
  ["े", ["ा", ""]],
  ["ी", ["ा"]],
];

// What an inflected word may be in a dictionary, longest ending first.
export function stemCandidates(w: string): string[] {
  const out: string[] = [];
  for (const [end, adds] of ENDINGS) {
    if (!w.endsWith(end)) continue;
    const base = w.slice(0, -end.length);
    if ([...base].length < 2) continue;
    for (const a of adds) if (!out.includes(base + a)) out.push(base + a);
  }
  return out.filter((x) => x !== w);
}

// The strings to look up in WordNet for these words: the words, their stems
// (as written), and their and their vowel variants' loose forms.
export function lookupKeys(words: string[]): { words: string[]; loose: string[] } {
  const exact = new Set<string>();
  const loose = new Set<string>();
  for (const w of words) {
    exact.add(w);
    for (const s of stemCandidates(w)) exact.add(s);
    for (const v of [w, ...vowelVariants(w)]) loose.add(looseWord(v));
  }
  return { words: [...exact], loose: [...loose] };
}

// The words sorted into known (WordNet, house, the editor's list), forms of
// a WordNet word, and unknown (with the close spellings that are known):
// unknown first (those with a close spelling, then the rarest), then forms
// and known by use.
export function classifyWords(
  used: Map<string, Set<string>>,
  // WordNet's words found by the lookup, as written.
  wn: Set<string>,
  house: House | undefined,
  // The editor's own list of correct words.
  ok: Set<string>,
): TopicWord[] {
  // Known spellings by loose form: WordNet's and the editor's.
  const byLoose = new Map<string, string[]>();
  for (const w of [...wn, ...ok]) {
    const k = looseWord(w);
    const l = byLoose.get(k) ?? [];
    if (!l.includes(w)) l.push(w);
    byLoose.set(k, l);
  }
  const out: TopicWord[] = [];
  for (const [word, ids] of used) {
    const count = ids.size;
    const base = { word, count, near: [] as string[], ids: [] as string[] };
    if (wn.has(word)) {
      out.push({ ...base, status: "known", why: "WordNet" });
      continue;
    }
    if (COMMON_WORDS.has(word)) {
      out.push({ ...base, status: "known", why: "common word" });
      continue;
    }
    if (ok.has(word)) {
      out.push({ ...base, status: "known", why: "your list" });
      continue;
    }
    if (house?.get(looseWord(word))?.accepted.includes(word)) {
      out.push({ ...base, status: "known", why: "house spelling" });
      continue;
    }
    // WordNet spells it with or without a nukta, ँ / ं or a half nasal:
    // a second spelling, not a typo (the house spellings keep them even).
    const variant = (byLoose.get(looseWord(word)) ?? []).find((x) => wn.has(x));
    if (variant) {
      out.push({ ...base, status: "form", why: `WordNet writes ${variant}` });
      continue;
    }
    const stem = stemCandidates(word).find((s) => wn.has(s));
    if (stem) {
      out.push({ ...base, status: "form", why: `form of ${stem}` });
      continue;
    }
    const near = [
      ...new Set([
        ...(byLoose.get(looseWord(word)) ?? []),
        ...vowelVariants(word).flatMap((v) => byLoose.get(looseWord(v)) ?? []),
      ]),
    ]
      .filter((x) => x !== word)
      .slice(0, 3);
    out.push({ ...base, status: "unknown", why: "", near, ids: [...ids] });
  }
  const rank = (w: TopicWord) => (w.status === "unknown" ? (w.near.length ? 0 : 1) : 2);
  return out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.status === "unknown" ? a.count - b.count : b.count - a.count) ||
      a.word.localeCompare(b.word),
  );
}

// A word swapped for another on a card's fields, as whole words only: the
// fields that change, with their text before and after.
export function replaceWordIn(
  c: Pick<FlashCard, "front" | "back" | "ex">,
  from: string,
  to: string,
  wrongFront = false,
): { field: string; before: string; after: string }[] {
  // An English word's edges are where Latin letters stop.
  const edge = /[A-Za-z]/.test(from) ? "[A-Za-z]" : LETTER;
  const re = new RegExp(
    `(?<!${edge})${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!${edge})`,
    "gu",
  );
  const fields: [string, string][] = [
    ...(wrongFront ? [] : [["front", c.front] as [string, string]]),
    ["back", c.back],
    ...Object.entries(c.ex).map(([k, v]): [string, string] => [`ex:${k}`, v]),
  ];
  return fields
    .map(([field, before]) => ({ field, before, after: before.normalize("NFC").replace(re, to) }))
    .filter((e) => e.after !== e.before.normalize("NFC") && e.after !== e.before);
}

// ---------- A chunk's readiness for the app ----------

export type ChunkIssue = {
  key: "unverified" | "ai" | "lint" | "recheck" | "words";
  label: string;
  ids: string[];
};

// What is still open in these cards before they go to the app: not
// verified, AI suggestions waiting, quick-check problems, marked to
// recheck, words no dictionary or list knows.
export function chunkIssues(
  cards: Pick<FlashCard, "id" | "verified" | "error" | "ai" | "removed">[],
  lintIds: Set<string>,
  unknownWordIds: Set<string> | null,
): ChunkIssue[] {
  const live = cards.filter((c) => !c.removed);
  const pick = (f: (c: (typeof live)[number]) => boolean) => live.filter(f).map((c) => c.id);
  const all: ChunkIssue[] = [
    { key: "unverified", label: "not verified", ids: pick((c) => !c.verified) },
    { key: "ai", label: "with AI suggestions", ids: pick((c) => !!c.ai?.fixes.length) },
    { key: "lint", label: "with quick-check problems", ids: pick((c) => lintIds.has(c.id)) },
    { key: "recheck", label: "marked to recheck", ids: pick((c) => c.error) },
    {
      key: "words",
      label: "with words no dictionary or list knows",
      ids: unknownWordIds ? pick((c) => unknownWordIds.has(c.id)) : [],
    },
  ];
  return all.filter((i) => i.ids.length);
}

// ---------- English words ----------

// Each English word the cards use (as written), with the cards using it.
export function enWordCards(
  cards: Pick<FlashCard, "id" | "front" | "back" | "ex" | "removed">[],
  wrongFront = false,
): Map<string, Set<string>> {
  const by = new Map<string, Set<string>>();
  for (const c of cards) {
    if (c.removed) continue;
    for (const w of [wrongFront ? "" : c.front, c.back, ...Object.values(c.ex)].flatMap(
      englishWordsIn,
    )) {
      const s = by.get(w) ?? new Set<string>();
      s.add(c.id);
      by.set(w, s);
    }
  }
  return by;
}

// What the English lists say of some words: the British spelling list's
// forms and WordNet's, both by their small-letter form.
export type EnFound = { spell: Map<string, string[]>; wn: Map<string, string[]> };

// Whether a list has a word as written (or in small letters, for a word
// written with a capital or in capitals; a name in the list keeps its
// capital, so "london" isn't "London").
function listed(found: Map<string, string[]>, w: string): boolean {
  const forms = found.get(w.toLowerCase()) ?? [];
  return forms.includes(w) || (w !== w.toLowerCase() && forms.includes(w.toLowerCase()));
}

// The English words sorted like the Hindi ones: known (the British spelling
// list, the editor's list, WordNet for words the British list doesn't
// spell otherwise), and not known with the British spellings close to them
// (an American spelling with its British one first: color → colour).
export function classifyEnglish(
  used: Map<string, Set<string>>,
  found: EnFound,
  // The editor's own list (as written, and in small letters).
  ok: Set<string>,
  // British spellings one edit away, by small-letter word (looked up for
  // the words not known).
  near: Map<string, string[]> = new Map(),
): TopicWord[] {
  const out: TopicWord[] = [];
  for (const [word, ids] of used) {
    const base = { word, count: ids.size, near: [] as string[], ids: [] as string[] };
    if (listed(found.spell, word)) {
      out.push({ ...base, status: "known", why: "British spelling" });
      continue;
    }
    if (ok.has(word) || ok.has(word.toLowerCase())) {
      out.push({ ...base, status: "known", why: "your list" });
      continue;
    }
    // Close spellings once each, whatever their capitals (colon / Colon).
    const close = rankNear(word, near.get(word.toLowerCase()) ?? [])
      .filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
      .slice(0, 3);
    // WordNet knows it and the British list has nothing close: a word the
    // list leaves out (a rare or technical word), not a misspelling.
    if (listed(found.wn, word) && !close.length) {
      out.push({ ...base, status: "known", why: "WordNet" });
      continue;
    }
    out.push({ ...base, status: "unknown", why: "", near: close, ids: [...ids] });
  }
  return out;
}

// The words to look up for spellings close to the unknown ones.
export function nearKeys(words: string[]): string[] {
  return [...new Set(words.flatMap((w) => edits1(w)))];
}

// Every sorted word list's order: not known first (with a close spelling,
// then the rarest), then forms and known by use.
export function sortWords(words: TopicWord[]): TopicWord[] {
  const rank = (w: TopicWord) => (w.status === "unknown" ? (w.near.length ? 0 : 1) : 2);
  return [...words].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.status === "unknown" ? a.count - b.count : b.count - a.count) ||
      a.word.localeCompare(b.word),
  );
}
