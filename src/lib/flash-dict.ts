// Word references from Wiktionary, for the card studio: a Hindi word's
// meanings (English Wiktionary's definitions, Hindi Wiktionary's अर्थ), its
// synonyms, antonyms and other spellings. Pure: the server fetches the
// pages; this reads them (shared with tests).

import type { WnSense } from "@/lib/flash-wordnet";

export type DictSense = { pos: string; text: string; examples: string[] };

export type DictEntry = {
  word: string;
  found: boolean;
  // English Wiktionary (meanings in English) and Hindi Wiktionary (in Hindi).
  en: DictSense[];
  hi: DictSense[];
  synonyms: string[];
  antonyms: string[];
  // Other spellings (alternative forms).
  forms: string[];
  // Hindi WordNet's meanings (when it is loaded): each with its words.
  wn?: WnSense[];
};

export const emptyEntry = (word: string): DictEntry => ({
  word,
  found: false,
  en: [],
  hi: [],
  synonyms: [],
  antonyms: [],
  forms: [],
});

const DEVA = /[ऀ-ॿ]/;

// The words of a card's front worth looking up: each line's first word
// group ("असार - " → असार; "राम + अवतार" → राम, अवतार), at most `max`.
export function lookupWords(front: string, max = 4): string[] {
  const out: string[] = [];
  for (const line of front.normalize("NFC").split("\n")) {
    const head = line.split(/\s[-–—:=]\s|\s[-–—]$|[-–—]\s*$|\(/)[0];
    for (const part of head.split(/[+,/;।]/)) {
      const w = part.replace(/[^ऀ-ॿ\s]/g, "").trim();
      if (w && DEVA.test(w) && !out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, max);
}

// HTML as plain text.
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// English Wiktionary's REST definitions (/api/rest_v1/page/definition/…):
// the Hindi senses ("hi"), in English.
export function readEnDefinitions(json: unknown): DictSense[] {
  const o = (json ?? {}) as Record<string, unknown>;
  const list = Array.isArray(o.hi) ? (o.hi as Record<string, unknown>[]) : [];
  const out: DictSense[] = [];
  for (const p of list) {
    const pos = String(p.partOfSpeech ?? "");
    for (const d of Array.isArray(p.definitions)
      ? (p.definitions as Record<string, unknown>[])
      : []) {
      const text = stripHtml(String(d.definition ?? ""));
      if (!text) continue;
      const examples = (Array.isArray(d.examples) ? (d.examples as unknown[]) : [])
        .map((e) => stripHtml(String(e)))
        .filter(Boolean)
        .slice(0, 2);
      out.push({ pos, text, examples });
    }
  }
  return out.slice(0, 12);
}

// A template's plain arguments ({{syn|hi|a|b<q:x>|c}} → a, b, c).
function templateArgs(t: string, skip: number): string[] {
  return t
    .split("|")
    .slice(skip)
    .filter((a) => !a.includes("="))
    .map((a) =>
      a
        .replace(/<[^>]*>/g, "")
        .replace(/^w:/, "")
        .trim(),
    )
    .filter((a) => a && !a.startsWith("Thesaurus:") && DEVA.test(a));
}

const templates = (text: string) => text.match(/\{\{[^{}]*\}\}/g) ?? [];

// Wiki markup as plain text: [[a|b]] → b, templates dropped (or their
// words kept for links), bold/italic marks gone.
export function wikiText(s: string): string {
  return s
    .replace(/\{\{(?:l|m|link|mention)\|[a-z-]+\|([^|}]+)[^}]*\}\}/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The page's sections: heading (without its =) and its lines.
function sections(wikitext: string): { level: number; title: string; lines: string[] }[] {
  const out: { level: number; title: string; lines: string[] }[] = [
    { level: 0, title: "", lines: [] },
  ];
  for (const line of wikitext.split("\n")) {
    const m = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (m) out.push({ level: m[1].length, title: wikiText(m[2]), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

// One language's part of a page (from its level-2 heading to the next).
function languagePart(wikitext: string, names: RegExp) {
  const all = sections(wikitext);
  const at = all.findIndex((s) => s.level === 2 && names.test(s.title));
  if (at < 0) return null;
  const end = all.findIndex((s, i) => i > at && s.level === 2);
  return all.slice(at, end < 0 ? undefined : end);
}

const uniq = (l: string[], not: string) =>
  [...new Set(l.map((w) => w.normalize("NFC").trim()))].filter((w) => w && w !== not);

// Words listed in a section: its links and l-templates, or (plain text)
// comma-separated words.
function listedWords(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const links = [...line.matchAll(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g)].map((m) => m[1]);
    const tpl = templates(line).flatMap((t) => {
      const name = t.slice(2).split("|")[0].trim();
      if (/^(l|link|syn|synonyms|ant|antonyms|alt|alter|col\d?|der\d?)$/.test(name))
        return templateArgs(t.slice(2, -2), 2);
      return [];
    });
    if (links.length || tpl.length) out.push(...links, ...tpl);
    else if (/^[*#:]/.test(line.trim()))
      out.push(
        ...wikiText(line.replace(/^[*#:\s]+/, ""))
          .split(/[,،;।]/)
          .map((w) => w.trim()),
      );
  }
  return out.filter((w) => DEVA.test(w) && w.length < 40);
}

// Senses: the "#" lines (not "#:" examples), with the "#:" lines after
// them as examples.
function senses(lines: string[], pos: string): DictSense[] {
  const out: DictSense[] = [];
  for (const line of lines) {
    if (/^#\s*[^*:]/.test(line)) {
      const text = wikiText(line.replace(/^#+\s*/, ""));
      if (text) out.push({ pos, text, examples: [] });
    } else if (/^#[*:]/.test(line) && out.length) {
      const ex = wikiText(line.replace(/^#[*:]+\s*/, ""));
      if (ex && out[out.length - 1].examples.length < 2) out[out.length - 1].examples.push(ex);
    }
  }
  return out;
}

const POS_EN =
  /^(Noun|Verb|Adjective|Adverb|Pronoun|Postposition|Conjunction|Interjection|Particle|Numeral|Proper noun|Phrase|Idiom|Proverb|Prefix|Suffix)$/i;

// English Wiktionary's page source: the Hindi part's synonyms, antonyms
// and alternative forms (its senses come from the REST definitions).
export function readEnWikitext(
  wikitext: string,
  word: string,
): Pick<DictEntry, "synonyms" | "antonyms" | "forms"> & { senses: DictSense[] } {
  const part = languagePart(wikitext, /^Hindi$/i);
  if (!part) return { synonyms: [], antonyms: [], forms: [], senses: [] };
  const synonyms: string[] = [];
  const antonyms: string[] = [];
  const forms: string[] = [];
  const out: DictSense[] = [];
  for (const s of part) {
    const body = s.lines.join("\n");
    // Inline templates under a sense: {{syn|hi|…}}, {{ant|hi|…}}.
    for (const t of templates(body)) {
      const name = t.slice(2).split("|")[0].trim();
      if (/^(syn|synonyms)$/.test(name)) synonyms.push(...templateArgs(t.slice(2, -2), 2));
      if (/^(ant|antonyms)$/.test(name)) antonyms.push(...templateArgs(t.slice(2, -2), 2));
      if (/^(alt|alter|alternative forms)$/.test(name))
        forms.push(...templateArgs(t.slice(2, -2), 2));
    }
    if (/^Synonyms$/i.test(s.title)) synonyms.push(...listedWords(s.lines));
    else if (/^Antonyms$/i.test(s.title)) antonyms.push(...listedWords(s.lines));
    else if (/^Alternative (forms|spellings)$/i.test(s.title)) forms.push(...listedWords(s.lines));
    else if (POS_EN.test(s.title)) out.push(...senses(s.lines, s.title));
  }
  return {
    synonyms: uniq(synonyms, word),
    antonyms: uniq(antonyms, word),
    forms: uniq(forms, word),
    senses: out.slice(0, 12),
  };
}

const POS_HI =
  /^(संज्ञा|क्रिया|विशेषण|क्रियाविशेषण|क्रिया-विशेषण|सर्वनाम|अव्यय|प्रत्यय|उपसर्ग|मुहावरा|लोकोक्ति|संख्यावाचक|.*शब्द)$/;

// Hindi Wiktionary's page source: the Hindi part (or the whole page when
// it has no language heading); meanings from its "#" lines (or its
// "अर्थ" sections), synonyms from पर्यायवाची / समानार्थी sections,
// antonyms from विलोम / विपरीतार्थक.
export function readHiWikitext(
  wikitext: string,
  word: string,
): Pick<DictEntry, "synonyms" | "antonyms" | "forms" | "hi"> {
  const part = languagePart(wikitext, /^(हिन्दी|हिंदी|Hindi)$/i) ?? sections(wikitext);
  const synonyms: string[] = [];
  const antonyms: string[] = [];
  const forms: string[] = [];
  const hi: DictSense[] = [];
  for (const s of part) {
    // Bot-made pages put "पर्यायवाची: a, b" inline.
    for (const line of s.lines) {
      const m = line.match(/^\W*(पर्यायवाची|समानार्थी(?:\s*शब्द)?)\W*[:：-]\s*(.+)$/);
      if (m) synonyms.push(...listedWords([`* ${m[2]}`]));
      const a = line.match(/^\W*(विलोम|विपरीतार्थक(?:\s*शब्द)?|विलोम शब्द)\W*[:：-]\s*(.+)$/);
      if (a) antonyms.push(...listedWords([`* ${a[2]}`]));
    }
    if (/पर्याय|समानार्थ/.test(s.title)) synonyms.push(...listedWords(s.lines));
    else if (/विलोम|विपरीत/.test(s.title)) antonyms.push(...listedWords(s.lines));
    else if (/वैकल्पिक|अन्य रूप|वर्तनी/.test(s.title)) forms.push(...listedWords(s.lines));
    else hi.push(...senses(s.lines, POS_HI.test(s.title) || /अर्थ/.test(s.title) ? s.title : ""));
  }
  // Older pages (from dictionaries) number their meanings "१." / "1.", or
  // give them as plain text.
  if (!hi.length) {
    const lines = part.flatMap((x) => x.lines);
    for (const line of lines) {
      const m = line.match(/^\s*(?:[०-९]+|\d+)[.)]\s*(.+)$/);
      if (m) {
        const text = wikiText(m[1]);
        if (text) hi.push({ pos: "", text, examples: [] });
      }
    }
    if (!hi.length) {
      const plain = lines
        .filter((l) => l.trim() && !/^[{|}!*#:=]/.test(l.trim()))
        .map(wikiText)
        .filter((t) => DEVA.test(t))
        .join(" ")
        .slice(0, 300);
      if (plain) hi.push({ pos: "", text: plain, examples: [] });
    }
  }
  return {
    synonyms: uniq(synonyms, word),
    antonyms: uniq(antonyms, word),
    forms: uniq(forms, word),
    hi: hi.filter((x) => DEVA.test(x.text) || x.text.length > 2).slice(0, 12),
  };
}

// The entry from what was fetched (null: the page isn't there).
export function buildEntry(
  word: string,
  got: { enDefs: unknown | null; enWiki: string | null; hiWiki: string | null },
): DictEntry {
  const e = emptyEntry(word);
  const enW = got.enWiki ? readEnWikitext(got.enWiki, word) : null;
  const hiW = got.hiWiki ? readHiWikitext(got.hiWiki, word) : null;
  e.en = got.enDefs ? readEnDefinitions(got.enDefs) : [];
  if (!e.en.length && enW) e.en = enW.senses;
  e.hi = hiW?.hi ?? [];
  e.synonyms = uniq([...(enW?.synonyms ?? []), ...(hiW?.synonyms ?? [])], word);
  e.antonyms = uniq([...(enW?.antonyms ?? []), ...(hiW?.antonyms ?? [])], word);
  e.forms = uniq([...(enW?.forms ?? []), ...(hiW?.forms ?? [])], word);
  e.found = !!(
    e.en.length ||
    e.hi.length ||
    e.synonyms.length ||
    e.antonyms.length ||
    e.forms.length
  );
  return e;
}

// A short reference for the AI (one line per word): what the dictionary
// gives, to weigh the card against (it is not always complete).
// The entry with Hindi WordNet's meanings added: theirs first among the
// synonyms and antonyms (WordNet is curated; Wiktionary often thin).
export function withWordnet(e: DictEntry, wn: WnSense[]): DictEntry {
  if (!wn.length) return e;
  const syn = wn.flatMap((s) => s.synonyms);
  const ant = wn.flatMap((s) => s.antonyms);
  return {
    ...e,
    wn,
    found: true,
    synonyms: uniq([...syn, ...e.synonyms], e.word),
    antonyms: uniq([...ant, ...e.antonyms], e.word),
  };
}

export function dictLine(e: DictEntry): string {
  if (!e.found) return "";
  const parts = [
    e.wn?.length
      ? `WordNet: ${e.wn
          .slice(0, 3)
          .map((s) => `${s.pos ? `(${s.pos}) ` : ""}${s.gloss}`)
          .join("; ")}`
      : "",
    e.hi.length
      ? `अर्थ: ${e.hi
          .slice(0, 2)
          .map((s) => s.text)
          .join("; ")}`
      : "",
    e.en.length
      ? `meaning: ${e.en
          .slice(0, 2)
          .map((s) => s.text)
          .join("; ")}`
      : "",
    e.synonyms.length ? `synonyms: ${e.synonyms.slice(0, 12).join(", ")}` : "",
    e.antonyms.length ? `antonyms: ${e.antonyms.slice(0, 6).join(", ")}` : "",
    e.forms.length ? `other spellings: ${e.forms.join(", ")}` : "",
  ].filter(Boolean);
  return `${e.word} — ${parts.join(" · ")}`.slice(0, 600);
}

// The words a card's back lists (its comma / line separated items), to
// tick the dictionary's synonyms the card already has.
export function backItems(back: string): string[] {
  return back
    .normalize("NFC")
    .split(/[,،;\n।]/)
    .map((w) =>
      w
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(/\(.*?\)/g, "")
        .trim(),
    )
    .filter(Boolean);
}

export const wiktionaryUrl = (word: string, lang: "en" | "hi") =>
  `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}${lang === "en" ? "#Hindi" : ""}`;
