// English for the card studio: Open English WordNet (or Princeton WordNet)
// read from its database files (data.noun, data.verb, data.adj, data.adv),
// the British spelling list (SCOWL's en_GB Hunspell dictionary, every form
// of every word), English words in a card's text, and spelling
// suggestions. Pure: shared by the loader in the browser, the server and
// tests.
//
// A WordNet data line: "<offset> <lex_filenum> <ss_type> <w_cnt> <word> <lex_id>
// … <p_cnt> <ptr>… [frames] | <gloss>; "<example>"", where w_cnt is
// hexadecimal, each pointer is "<symbol> <offset> <pos> <source/target>"
// and "!" is an antonym.

import type { WnSense } from "@/lib/flash-wordnet";

export type EnSynset = {
  // Part of speech and offset: "n00001740".
  id: string;
  pos: "n" | "v" | "a" | "r";
  words: string[];
  gloss: string;
  example: string;
  // Synsets holding the words' antonyms.
  antonyms: string[];
};

const POS_NAME: Record<string, string> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  r: "adverb",
};

// One data line (null: a licence line or anything else).
export function parseEnLine(line: string): EnSynset | null {
  const bar = line.indexOf(" | ");
  const head = (bar < 0 ? line : line.slice(0, bar)).trim().split(/\s+/);
  if (head.length < 6 || !/^\d{8}$/.test(head[0])) return null;
  const type = head[2];
  const pos = (type === "s" ? "a" : type) as EnSynset["pos"];
  if (!POS_NAME[pos]) return null;
  const count = parseInt(head[3], 16);
  if (!Number.isFinite(count) || count < 1) return null;
  const words: string[] = [];
  let i = 4;
  for (let k = 0; k < count; k++, i += 2) {
    const w = (head[i] ?? "")
      .replace(/\((?:a|p|ip)\)$/, "")
      .replace(/_/g, " ")
      .trim();
    if (w && !words.includes(w)) words.push(w);
  }
  const pointers = parseInt(head[i] ?? "0", 10) || 0;
  i++;
  const antonyms: string[] = [];
  for (let k = 0; k < pointers; k++, i += 4) {
    if (head[i] !== "!") continue;
    const tp = head[i + 2] === "s" ? "a" : head[i + 2];
    const id = `${tp}${head[i + 1]}`;
    if (!antonyms.includes(id)) antonyms.push(id);
  }
  const text = bar < 0 ? "" : line.slice(bar + 3).trim();
  // The definition, then examples in quotes after "; ".
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  const gloss = text
    .replace(/;?\s*"[^"]*"/g, "")
    .replace(/\s*;\s*$/, "")
    .trim();
  return { id: `${pos}${head[0]}`, pos, words, gloss, example: quoted[0] ?? "", antonyms };
}

// Every synset of the data files' text (adjective satellites as adjectives).
export function parseEnWordnet(files: string[]): { synsets: EnSynset[]; skipped: number } {
  const synsets: EnSynset[] = [];
  let skipped = 0;
  for (const text of files)
    for (const line of text.split("\n")) {
      if (!line || line.startsWith(" ")) continue;
      const s = parseEnLine(line);
      if (s) synsets.push(s);
      else skipped++;
    }
  return { synsets, skipped };
}

// The index files' order of a word's meanings, most used first: by
// "lemma|pos", the synset ids. Line: "<lemma> <pos> <synset_cnt> <p_cnt>
// [ptr…] <sense_cnt> <tagsense_cnt> <offset>…".
export function parseEnIndex(files: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const text of files)
    for (const line of text.split("\n")) {
      if (!line || line.startsWith(" ")) continue;
      const p = line.trim().split(/\s+/);
      const n = parseInt(p[2] ?? "", 10);
      const ptrs = parseInt(p[3] ?? "", 10);
      if (!Number.isFinite(n) || !Number.isFinite(ptrs)) continue;
      const pos = p[1] === "s" ? "a" : p[1];
      const offsets = p.slice(4 + ptrs + 2, 4 + ptrs + 2 + n);
      out.set(
        `${p[0].replace(/_/g, " ").toLowerCase()}|${pos}`,
        offsets.map((o) => `${pos}${o}`),
      );
    }
  return out;
}

export type EnWordRow = { word: string; lower: string; synset_id: string; rank: number };

// Each synset's words for the word index, with the meaning's place among
// the word's meanings (0: the most used; 99: not in the index).
export function enWordRows(synsets: EnSynset[], index: Map<string, string[]>): EnWordRow[] {
  const rows: EnWordRow[] = [];
  for (const s of synsets)
    for (const word of s.words) {
      const lower = word.toLowerCase();
      const at = index.get(`${lower}|${s.pos}`)?.indexOf(s.id) ?? -1;
      rows.push({ word, lower, synset_id: s.id, rank: at < 0 ? 99 : Math.min(at, 98) });
    }
  return rows;
}

// A word's meanings, most used first (`rank`: their place for this word),
// with its synonyms and its antonym synsets' words (the first few of each).
export function enSenses(
  word: string,
  synsets: EnSynset[],
  byId: Map<string, EnSynset>,
  rank: Map<string, number> = new Map(),
): WnSense[] {
  const lower = word.toLowerCase();
  const same = (x: string) => x.toLowerCase() === lower;
  return [...synsets]
    .sort(
      (a, b) =>
        (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) ||
        Number(b.words.some(same)) - Number(a.words.some(same)),
    )
    .map((s) => ({
      pos: POS_NAME[s.pos] ?? "",
      gloss: s.gloss,
      example: s.example,
      synonyms: s.words.filter((x) => !same(x)),
      antonyms: [
        ...new Set(s.antonyms.flatMap((a) => byId.get(a)?.words.slice(0, 4) ?? [])),
      ].filter((x) => !same(x)),
    }));
}

// ---------- The British spelling list (Hunspell) ----------

type Affix = { strip: string; add: string; cond: RegExp; cross: boolean };

// Every word form of a Hunspell dictionary: each stem with the prefixes and
// suffixes its flags allow (and both, where both may combine). Words only
// for compounds (ordinal numbers) are left out.
export function expandHunspell(aff: string, dic: string): string[] {
  const pfx = new Map<string, Affix[]>();
  const sfx = new Map<string, Affix[]>();
  let skipFlag = "";
  const cross = new Map<string, boolean>();
  for (const raw of aff.split("\n")) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === "ONLYINCOMPOUND") skipFlag = p[1] ?? "";
    if (p[0] !== "PFX" && p[0] !== "SFX") continue;
    const [kind, flag] = p;
    // A rule's header: "SFX D Y 4" (Y: may combine with prefixes).
    if (p.length === 4 && /^\d+$/.test(p[3])) {
      cross.set(`${kind}${flag}`, p[2] === "Y");
      continue;
    }
    const strip = p[2] === "0" ? "" : p[2];
    const add = (p[3] ?? "").split("/")[0].replace(/^0$/, "");
    const c = p[4] ?? ".";
    const cond = new RegExp(kind === "SFX" ? `${c}$` : `^${c}`);
    const list = (kind === "PFX" ? pfx : sfx).get(flag) ?? [];
    list.push({ strip, add, cond, cross: cross.get(`${kind}${flag}`) ?? false });
    (kind === "PFX" ? pfx : sfx).set(flag, list);
  }
  const out = new Set<string>();
  const lines = dic.split("\n");
  for (const line of lines.slice(/^\d+\s*$/.test(lines[0] ?? "") ? 1 : 0)) {
    const t = line.trim();
    if (!t) continue;
    const slash = t.indexOf("/");
    const stem = slash < 0 ? t : t.slice(0, slash);
    const flags = slash < 0 ? "" : t.slice(slash + 1).split(/\s/)[0];
    if (skipFlag && flags.includes(skipFlag)) continue;
    out.add(stem);
    const suffixed: string[] = [];
    for (const f of flags)
      for (const a of sfx.get(f) ?? [])
        if (a.cond.test(stem) && stem.endsWith(a.strip)) {
          const w = stem.slice(0, stem.length - a.strip.length) + a.add;
          out.add(w);
          if (a.cross) suffixed.push(w);
        }
    for (const f of flags)
      for (const a of pfx.get(f) ?? [])
        if (a.cond.test(stem) && stem.startsWith(a.strip)) {
          out.add(a.add + stem.slice(a.strip.length));
          if (a.cross) for (const w of suffixed) out.add(a.add + w.slice(a.strip.length));
        }
  }
  return [...out].filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w) && w.length > 1);
}

// ---------- English words in a card ----------

// The English words of a text (an apostrophe's "'s" kept off: "India's"
// is "India"); words of one letter left out.
export function englishWordsIn(text: string): string[] {
  return (
    text
      .normalize("NFC")
      .replace(/’/g, "'")
      .match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
  )
    .map((w) => w.replace(/'s$/i, ""))
    .filter((w) => w.length > 1);
}

// The forms of a word to look for in the lists: as written, and in small
// letters when it starts a sentence or is in capitals.
export function enLookupForms(w: string): string[] {
  const lower = w.toLowerCase();
  return lower === w ? [w] : [w, lower];
}

// Spellings one edit away (a letter dropped, added, changed or two
// swapped): the candidates a misspelt word may have been meant as.
export function edits1(word: string): string[] {
  const w = word.toLowerCase();
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const out = new Set<string>();
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i);
    const b = w.slice(i);
    if (b) out.add(a + b.slice(1));
    if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
    for (const c of letters) {
      if (b) out.add(a + c + b.slice(1));
      out.add(a + c + b);
    }
  }
  out.delete(w);
  return [...out];
}

// The likeliest of the known spellings close to a word: the same first
// letter first, then the closest in length; an American spelling's British
// form (color → colour, center → centre, realize → realise) first of all.
export function rankNear(word: string, near: string[]): string[] {
  const w = word.toLowerCase();
  const british = new Set([
    w.replace(/or$/, "our").replace(/or(s|ed|ing)$/, "our$1"),
    w.replace(/er$/, "re").replace(/ers$/, "res"),
    w.replace(/iz(e|es|ed|ing|ation)$/, "is$1"),
    w.replace(/yz(e|es|ed|ing)$/, "ys$1"),
  ]);
  const score = (x: string) =>
    (british.has(x.toLowerCase()) ? 0 : 10) +
    (x[0]?.toLowerCase() === w[0] ? 0 : 5) +
    Math.abs(x.length - w.length);
  return [...new Set(near)].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

// A whole English word swapped in a text (not inside longer words).
export function replaceEnglishWord(text: string, from: string, to: string): string {
  const re = new RegExp(
    `(?<![A-Za-z])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`,
    "g",
  );
  return text.normalize("NFC").replace(re, to);
}

// What to look up in English WordNet for a card's front: the phrase
// itself when short ("give up", "Affect / Effect" as its parts), then its
// words; a few at most.
export function enLookupAsks(front: string, max = 6): string[] {
  const out: string[] = [];
  for (const part of front.split(/[\n/,;]|\s[-–—]\s/)) {
    const t = part
      .replace(/[^A-Za-z' -]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) continue;
    if (t.split(" ").length > 1 && t.split(" ").length <= 4) out.push(t);
    for (const w of englishWordsIn(t)) out.push(w);
  }
  return [...new Set(out)].slice(0, max);
}
