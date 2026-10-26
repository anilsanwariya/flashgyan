// The card studio's quick checks: problems found without the AI, from the
// text alone, each with the field's fixed text when the fix is safe
// (spaces, the same item twice, hidden letter codes, numbering written the
// topic's other way). Pure: shared by the server, the panel and tests.
import type { FlashCard, FlashColumn } from "@/lib/flash-studio";
import { houseCheck, looseWord, swapWords, type House } from "@/lib/flash-spell";

export type Lint = {
  kind:
    | "spaces"
    | "repeat"
    | "code"
    | "numbering"
    | "empty"
    | "same"
    | "latin"
    | "spelling"
    | "house";
  // "front", "back" or "ex:<column id>".
  field: string;
  note: string;
  // The whole field fixed, when the fix is safe.
  fix?: string;
  // Numbering: the topic's way.
  style?: "." | ")";
  // House spellings: each word to write the house's way.
  swaps?: [string, string][];
};

export const LINT_LABELS: Record<Lint["kind"], string> = {
  spaces: "Extra spaces",
  repeat: "Same item twice",
  code: "Hidden letter codes",
  numbering: "Numbering",
  empty: "Empty back",
  same: "Front and back the same",
  latin: "English letters in Hindi",
  spelling: "Spelt two ways",
  house: "Not the house spelling",
};

const DEVA = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

// Spaces: doubled, at the ends of lines, before a comma or danda.
export function fixSpaces(t: string): string {
  return t
    .split("\n")
    .map((l) =>
      l
        .replace(/[ \t\u00A0]+/g, " ")
        .replace(/ +([,।;:!?)])/g, "$1")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A list line's items ("a, b, c"), and the line with any repeat taken out.
function dropRepeats(line: string): string {
  const m = /^(\s*\d+[.)]\s*)?(.*)$/.exec(line)!;
  const items = m[2].split(/\s*,\s*/);
  if (items.length < 2) return line;
  const seen = new Set<string>();
  const kept = items.filter((it) => {
    const k = it.trim().normalize("NFC");
    if (!k || seen.has(k)) return !k;
    seen.add(k);
    return true;
  });
  return (m[1] ?? "") + kept.join(", ");
}

export const fixRepeats = (t: string) => t.split("\n").map(dropRepeats).join("\n");

// The topic's way of numbering ("1." or "1)"), from most of its cards.
export function numberingOf(cards: Pick<FlashCard, "back">[]): "." | ")" | null {
  let dot = 0;
  let par = 0;
  for (const c of cards)
    for (const l of c.back.split("\n")) {
      if (/^\s*\d+\.\s/.test(l)) dot++;
      else if (/^\s*\d+\)\s/.test(l)) par++;
    }
  if (!dot && !par) return null;
  return dot >= par ? "." : ")";
}

const fixNumbering = (t: string, style: "." | ")") =>
  t.replace(/^(\s*\d+)[.)](\s)/gm, `$1${style}$2`);

// A word written without its nukta and with ं for ँ: the same word spelt
// two ways meets here.
const loose = looseWord;

const wordsOf = (t: string) => t.normalize("NFC").match(/[ऀ-ॿ]+/g) ?? [];

// Words spelt more than one way across the topic (nukta, ँ / ं): for each
// loose form, its spellings and how many cards use each.
export function spellingVariants(
  cards: Pick<FlashCard, "front" | "back" | "ex" | "removed">[],
): Map<string, Map<string, number>> {
  const by = new Map<string, Map<string, number>>();
  for (const c of cards) {
    if (c.removed) continue;
    const seen = new Set<string>();
    for (const w of [c.front, c.back, ...Object.values(c.ex)].flatMap(wordsOf)) {
      if (w.length < 2 || seen.has(w)) continue;
      seen.add(w);
      const k = loose(w);
      const m = by.get(k) ?? new Map<string, number>();
      m.set(w, (m.get(w) ?? 0) + 1);
      by.set(k, m);
    }
  }
  for (const [k, m] of by) if (m.size < 2) by.delete(k);
  return by;
}

// A card's quick-check problems. `topic` gives what's found across the
// topic: its numbering and the words spelt two ways.
export function lintCard(
  c: Pick<FlashCard, "front" | "back" | "ex" | "removed">,
  columns: FlashColumn[],
  topic: {
    numbering: "." | ")" | null;
    variants: Map<string, Map<string, number>>;
    // The house spelling list (all topics' verified cards and the editor's
    // rules): words spelt another way are flagged, with the fix.
    house?: House;
  },
): Lint[] {
  if (c.removed) return [];
  const out: Lint[] = [];
  const fields: [string, string][] = [
    ["front", c.front],
    ["back", c.back],
    ...columns.map((col): [string, string] => [`ex:${col.id}`, c.ex[col.id] ?? ""]),
  ];
  for (const [field, text] of fields) {
    if (!text) continue;
    const nfc = text.normalize("NFC");
    if (nfc !== text)
      out.push({
        kind: "code",
        field,
        note: "Some letters are stored in another code (looks the same, but search and matching miss it)",
        fix: nfc,
      });
    const spaced = fixSpaces(nfc);
    // Spaces only at line ends don't show (the app's own cards have them,
    // e.g. "असार - " before the next line): not flagged on their own.
    const lineEnds = nfc.replace(/[ \t]+$/gm, "");
    if (spaced !== nfc && spaced !== lineEnds)
      out.push({ kind: "spaces", field, note: "Extra spaces", fix: spaced });
    if (field !== "front") {
      const once = fixRepeats(nfc);
      if (once !== nfc) out.push({ kind: "repeat", field, note: "The same item twice", fix: once });
    }
    if (field === "back" && topic.numbering) {
      const other = topic.numbering === "." ? /^\s*\d+\)\s/m : /^\s*\d+\.\s/m;
      if (other.test(nfc))
        out.push({
          kind: "numbering",
          field,
          note: `Numbered “1${topic.numbering === "." ? ")" : "."}”; the topic uses “1${topic.numbering}”`,
          fix: fixNumbering(nfc, topic.numbering),
          style: topic.numbering,
        });
    }
    if (DEVA.test(nfc) && LATIN.test(nfc) && field !== "front")
      out.push({
        kind: "latin",
        field,
        note: `English letters in Hindi text: “${(nfc.match(/[A-Za-z][A-Za-z\s]*/g) ?? []).slice(0, 3).join(", ")}”`,
      });
    const houseOdd = new Map<string, { to: string | null; accepted: string[] }>();
    if (topic.house)
      for (const w of wordsOf(nfc)) {
        const h = houseCheck(topic.house, w);
        if (h) houseOdd.set(w, h);
      }
    if (houseOdd.size) {
      const swaps = [...houseOdd]
        .filter(([, h]) => h.to)
        .map(([w, h]): [string, string] => [w, h.to!]);
      out.push({
        kind: "house",
        field,
        note: `Not the house spelling: ${[...houseOdd]
          .slice(0, 3)
          .map(([w, h]) => `${w} → ${h.to ?? h.accepted.join(" / ")}`)
          .join(", ")}`,
        ...(swaps.length === houseOdd.size ? { fix: swapWords(nfc, swaps), swaps } : {}),
      });
    }
    const odd = wordsOf(nfc)
      .filter((w) => !topic.house?.has(loose(w)))
      .map((w) => {
        const m = topic.variants.get(loose(w));
        if (!m) return null;
        const best = [...m].sort((a, b) => b[1] - a[1])[0];
        return best[0] !== w && best[1] > (m.get(w) ?? 0) ? `${w} (elsewhere ${best[0]})` : null;
      })
      .filter(Boolean);
    if (odd.length)
      out.push({
        kind: "spelling",
        field,
        note: `Spelt another way in most cards: ${[...new Set(odd)].slice(0, 3).join(", ")}`,
      });
  }
  if (!c.back.trim()) out.push({ kind: "empty", field: "back", note: "The back is empty" });
  else if (c.front.trim() && c.front.trim() === c.back.trim())
    out.push({ kind: "same", field: "back", note: "The back is the same as the front" });
  return out;
}

// Every live card's problems, by card id (cards with none left out).
export function lintTopic(
  cards: FlashCard[],
  columns: FlashColumn[],
  house?: House,
): Map<string, Lint[]> {
  const live = cards.filter((c) => !c.removed);
  const topic = { numbering: numberingOf(live), variants: spellingVariants(live), house };
  const out = new Map<string, Lint[]>();
  for (const c of live) {
    const l = lintCard(c, columns, topic);
    if (l.length) out.set(c.id, l);
  }
  return out;
}

// A card's text with every safe fix made, each redone on the text as the
// fixes before it left it.
export function applyLints(
  c: Pick<FlashCard, "front" | "back" | "ex">,
  lints: Lint[],
): Pick<FlashCard, "front" | "back" | "ex"> {
  const next = { front: c.front, back: c.back, ex: { ...c.ex } };
  const get = (f: string) =>
    f === "front" ? next.front : f === "back" ? next.back : (next.ex[f.slice(3)] ?? "");
  const set = (f: string, v: string) => {
    if (f === "front") next.front = v;
    else if (f === "back") next.back = v;
    else next.ex[f.slice(3)] = v;
  };
  for (const kind of ["code", "house", "spaces", "repeat", "numbering"] as const)
    for (const l of lints)
      if (l.kind === kind && l.fix !== undefined) {
        const t = get(l.field).normalize("NFC");
        set(
          l.field,
          kind === "code"
            ? t
            : kind === "house"
              ? swapWords(t, l.swaps ?? [])
              : kind === "spaces"
                ? fixSpaces(t)
                : kind === "repeat"
                  ? fixRepeats(t)
                  : fixNumbering(t, l.style ?? "."),
        );
      }
  return next;
}
