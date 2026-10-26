// Find and replace across a topic's cards: the text to find (optionally
// with its spelling variants — nukta, ँ / ं — and as a whole word), every
// match by card and field with the field before and after. Pure: shared by
// the panel (the preview) and the server (which re-checks each field).
import type { FlashCard, FlashColumn } from "@/lib/flash-studio";

export type FindOptions = {
  find: string;
  replace: string;
  // "all", "front", "back", "ex" (every explanation) or "ex:<column id>".
  where: string;
  // Spelling variants too: with or without nukta, ँ or ं.
  variants: boolean;
  wholeWord: boolean;
};

export type FindMatch = {
  id: string;
  field: string;
  count: number;
  before: string;
  after: string;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUKTA = "़";
const LETTER = "[\\p{L}\\p{M}\\p{N}]";

// The pattern for the text to find.
export function findPattern(
  o: Pick<FindOptions, "find" | "variants" | "wholeWord">,
): RegExp | null {
  const text = o.find.normalize("NFC").trim();
  if (!text) return null;
  let body = "";
  if (o.variants)
    for (const ch of text.replace(new RegExp(NUKTA, "g"), "")) {
      if (ch === "ँ" || ch === "ं") body += "[ँं]";
      else if (/[क-ह]/.test(ch)) body += `${escape(ch)}${NUKTA}?`;
      else body += escape(ch);
    }
  else body = escape(text);
  if (o.wholeWord) body = `(?<!${LETTER})${body}(?!${LETTER})`;
  return new RegExp(body, "gu");
}

const fieldsOf = (c: FlashCard, columns: FlashColumn[], where: string): [string, string][] => {
  const all: [string, string][] = [
    ["front", c.front],
    ["back", c.back],
    ...columns.map((col): [string, string] => [`ex:${col.id}`, c.ex[col.id] ?? ""]),
  ];
  if (where === "all") return all;
  if (where === "ex") return all.filter(([f]) => f.startsWith("ex:"));
  return all.filter(([f]) => f === where);
};

// Every field the text is found in, with what replacing makes of it.
export function findMatches(
  cards: FlashCard[],
  columns: FlashColumn[],
  o: FindOptions,
): FindMatch[] {
  const re = findPattern(o);
  if (!re) return [];
  const out: FindMatch[] = [];
  for (const c of cards) {
    if (c.removed) continue;
    for (const [field, text] of fieldsOf(c, columns, o.where)) {
      if (!text) continue;
      const nfc = text.normalize("NFC");
      const count = (nfc.match(re) ?? []).length;
      if (!count) continue;
      const after = nfc.replace(re, () => o.replace);
      if (after !== text) out.push({ id: c.id, field, count, before: text, after });
    }
  }
  return out;
}

// The text with its matches marked, for the preview: [text, matched?] parts.
export function markMatches(text: string, re: RegExp | null): [string, boolean][] {
  if (!re) return [[text, false]];
  const nfc = text.normalize("NFC");
  const out: [string, boolean][] = [];
  let last = 0;
  for (const m of nfc.matchAll(new RegExp(re.source, re.flags))) {
    if (m.index! > last) out.push([nfc.slice(last, m.index), false]);
    out.push([m[0], true]);
    last = m.index! + m[0].length;
  }
  if (last < nfc.length) out.push([nfc.slice(last), false]);
  return out;
}
