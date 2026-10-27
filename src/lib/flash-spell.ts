// The house spelling list: for words that can be spelt more than one way
// (nukta, ँ / ं, ं or the half nasal: संपन्न / सम्पन्न), the spellings the editor accepts. A spelling is accepted
// when a verified card in any topic uses it, or the editor said so; the
// editor can also prefer one, or call one wrong. Words spelt both ways in
// verified cards (जरा / ज़रा are different words) are both accepted.
// Pure: shared by the server, the panel, the quick checks and tests.
import type { FlashCard } from "@/lib/flash-studio";

// The loose form of a word: without its nukta, with ं for ँ, and with ं for
// a half nasal before a consonant of its own group (पंचमाक्षर: सम्पन्न,
// हिन्दी, वसुन्धरा → संपन्न, हिंदी, वसुंधरा). जन्म, अन्न and सम्मान keep theirs.
export const looseWord = (w: string) =>
  w
    .normalize("NFC")
    .replace(/़/g, "")
    .replace(/ँ/g, "ं")
    .replace(/ङ्(?=[कखगघ])|ञ्(?=[चछजझ])|ण्(?=[टठडढ])|न्(?=[तथदध])|म्(?=[पफबभ])/g, "ं");

// Rules saved under an older loose form, met again under today's (and
// merged when two now meet).
export function mergeRules(rules: SpellRule[]): SpellRule[] {
  const by = new Map<string, SpellRule>();
  for (const r of rules) {
    const key = looseWord(r.key);
    const o = by.get(key);
    by.set(
      key,
      o
        ? {
            key,
            preferred: o.preferred ?? r.preferred,
            accepted: [...new Set([...o.accepted, ...r.accepted])],
            rejected: [...new Set([...o.rejected, ...r.rejected])],
          }
        : { ...r, key },
    );
  }
  return [...by.values()];
}

export const wordsIn = (t: string) => t.normalize("NFC").match(/[ऀ-ॿ]+/g) ?? [];

export type SpellRule = {
  key: string;
  preferred: string | null;
  accepted: string[];
  rejected: string[];
};

// A topic's cards as the house list reads them: a शुद्धि deck's fronts
// (wrong on purpose) left out.
export function forHouse<T extends { front: string }>(cards: T[], wrongFront: boolean): T[] {
  return wrongFront ? cards.map((c) => ({ ...c, front: "" })) : cards;
}

// By loose form, by spelling: cards using it, verified and in all.
export type SpellCounts = Map<string, Map<string, { verified: number; all: number }>>;

export function spellCounts(
  cards: Pick<FlashCard, "front" | "back" | "ex" | "removed" | "verified">[],
): SpellCounts {
  const by: SpellCounts = new Map();
  for (const c of cards) {
    if (c.removed) continue;
    const seen = new Set<string>();
    for (const w of [c.front, c.back, ...Object.values(c.ex)].flatMap(wordsIn)) {
      if (w.length < 2 || seen.has(w)) continue;
      seen.add(w);
      const k = looseWord(w);
      const m = by.get(k) ?? new Map<string, { verified: number; all: number }>();
      const n = m.get(w) ?? { verified: 0, all: 0 };
      n.all++;
      if (c.verified) n.verified++;
      m.set(w, n);
      by.set(k, m);
    }
  }
  return by;
}

// What the quick checks and the AI go by: for each loose form with an
// accepted spelling, the accepted ones and the one to use (when clear).
export type HouseEntry = { accepted: string[]; preferred: string | null };
export type House = Map<string, HouseEntry>;

export function buildHouse(counts: SpellCounts, rules: SpellRule[]): House {
  const ruleOf = new Map(rules.map((r) => [r.key, r]));
  const house: House = new Map();
  for (const key of new Set([...counts.keys(), ...ruleOf.keys()])) {
    const m = counts.get(key);
    const r = ruleOf.get(key);
    // Only words that are spelt more than one way, or have a rule.
    if (!r && (!m || m.size < 2)) continue;
    const accepted = new Set<string>();
    for (const [w, n] of m ?? []) if (n.verified > 0) accepted.add(w);
    for (const w of r?.accepted ?? []) accepted.add(w);
    if (r?.preferred) accepted.add(r.preferred);
    for (const w of r?.rejected ?? []) accepted.delete(w);
    if (!accepted.size) continue;
    const preferred =
      r?.preferred && accepted.has(r.preferred)
        ? r.preferred
        : accepted.size === 1
          ? [...accepted][0]
          : null;
    house.set(key, { accepted: [...accepted], preferred });
  }
  return house;
}

// A word against the house list: null when fine; else what to write
// (`to`: the house spelling, when there is one clear one).
export function houseCheck(
  house: House,
  w: string,
): { to: string | null; accepted: string[] } | null {
  const e = house.get(looseWord(w));
  if (!e || e.accepted.includes(w)) return null;
  return { to: e.preferred, accepted: e.accepted };
}

const DEVA = "[ऀ-ॿ]";
// Every whole-word `from` in the text made `to`.
export function swapWords(text: string, swaps: [string, string][]): string {
  let t = text.normalize("NFC");
  for (const [from, to] of swaps)
    t = t.replace(
      new RegExp(`(?<!${DEVA})${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!${DEVA})`, "gu"),
      to,
    );
  return t;
}

// The house spellings for the words of some cards, for the AI: one line
// per word, the accepted spellings (the one to use first).
export function houseLines(house: House, texts: string[], max = 60): string[] {
  const out = new Map<string, string>();
  for (const w of texts.flatMap(wordsIn)) {
    const k = looseWord(w);
    const e = house.get(k);
    if (!e || out.has(k)) continue;
    const list = e.preferred
      ? [e.preferred, ...e.accepted.filter((a) => a !== e.preferred)]
      : e.accepted;
    out.set(k, list.length > 1 ? `${list.join(" / ")} (all accepted)` : list[0]);
    if (out.size >= max) break;
  }
  return [...out.values()];
}

// The words to decide on, for the Spellings page: every word spelt more
// than one way across the topics, or with a rule.
export type SpellRow = {
  key: string;
  spellings: {
    word: string;
    verified: number;
    all: number;
    status: "accepted" | "rejected" | "open";
  }[];
  preferred: string | null;
  rule: boolean;
  // Cards using a spelling that isn't accepted.
  toFix: number;
};

export function spellRows(counts: SpellCounts, rules: SpellRule[]): SpellRow[] {
  const house = buildHouse(counts, rules);
  const ruleOf = new Map(rules.map((r) => [r.key, r]));
  const rows: SpellRow[] = [];
  for (const key of new Set([...counts.keys(), ...ruleOf.keys()])) {
    const m = counts.get(key) ?? new Map();
    const r = ruleOf.get(key);
    if (!r && m.size < 2) continue;
    const e = house.get(key);
    const words = new Set<string>([...m.keys(), ...(r?.accepted ?? []), ...(r?.rejected ?? [])]);
    if (r?.preferred) words.add(r.preferred);
    const spellings = [...words]
      .map((word) => {
        const n = m.get(word) ?? { verified: 0, all: 0 };
        const status: "accepted" | "rejected" | "open" = r?.rejected.includes(word)
          ? "rejected"
          : e?.accepted.includes(word)
            ? "accepted"
            : "open";
        return { word, verified: n.verified, all: n.all, status };
      })
      .sort((a, b) => b.all - a.all);
    rows.push({
      key,
      spellings,
      preferred: e?.preferred ?? null,
      rule: !!r,
      toFix: e
        ? spellings.filter((s) => s.status !== "accepted").reduce((n, s) => n + s.all, 0)
        : 0,
    });
  }
  return rows.sort((a, b) => b.toFix - a.toFix || a.key.localeCompare(b.key));
}

// The house as it travels to the browser.
export const houseToList = (h: House) => [...h].map(([key, e]) => ({ key, ...e }));
export const houseFromList = (l: ({ key: string } & HouseEntry)[]): House =>
  new Map(l.map(({ key, ...e }) => [key, e]));
