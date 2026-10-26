// "पृथक करें" cards made from a finished उपसर्ग or प्रत्यय topic: every word
// of its "योग से शब्द बनायें" cards becomes a card asking to separate the
// उपसर्ग/प्रत्यय and the root (उपसंहार → उप + संहार), with the source card's
// explanations. A word that plainly starts (or ends) with its affix is split
// here; the rest (with a sandhi or a vowel change: अन्वेषण, सैनिक) by the AI,
// marked for the editor to check. Pure: shared by the server and tests.
import type { ChatMessage } from "../../supabase/functions/_shared/saathi-core.ts";
import { parseJsonLoose } from "../../supabase/functions/_shared/saathi-core.ts";
import { listItems } from "@/lib/flash-merge";

export type AffixKind = "upsarg" | "pratyay";

// The deck types made from each other.
export const SPLIT_OF: Record<AffixKind, string> = {
  upsarg: "upsarg-split",
  pratyay: "pratyay-split",
};
export const kindOfTemplate = (key: string | null | undefined): AffixKind | null =>
  key === "upsarg" ? "upsarg" : key === "pratyay" ? "pratyay" : null;

// The affix as written on the card's front (without "-" marks or notes).
export const cleanAffix = (front: string) =>
  front
    .split("\n")[0]
    .replace(/\([^)]*\)/g, "")
    .replace(/[-–‣◆•]/g, "")
    .trim();

// The words of a "योग से शब्द बनायें" card's answer.
export const wordsOf = (back: string) =>
  [...new Set(listItems(back).map((i) => i.text.replace(/\([^)]*\)/g, "").trim()))].filter(
    (w) => w.length > 1,
  );

// A plain split: the word starts with the उपसर्ग (or ends with the प्रत्यय)
// and what is left is a word of two letters or more. Null otherwise.
export function plainSplit(kind: AffixKind, affix: string, word: string): string | null {
  const a = affix.replace(/\s+/g, "");
  const w = word.replace(/\s+/g, "");
  if (!a || a.length >= w.length) return null;
  if (kind === "upsarg" && w.startsWith(a)) {
    const rest = w.slice(a.length);
    // A rest starting with a vowel sign or halant means the split cuts a letter.
    return rest.length > 1 && !/^[ा-्ंः]/.test(rest) ? `${a} + ${rest}` : null;
  }
  if (kind === "pratyay" && w.endsWith(a)) {
    const rest = w.slice(0, w.length - a.length);
    // A प्रत्यय starting with a vowel changes the root's ending: the AI's job.
    return rest.length > 1 && !/^[अ-औ]/.test(a) ? `${rest} + ${a}` : null;
  }
  return null;
}

export type SplitItem = { n: number; affix: string; word: string };

export function splitMessages(kind: AffixKind, items: SplitItem[]): ChatMessage[] {
  const what =
    kind === "upsarg"
      ? "उपसर्ग + मूल शब्द (e.g. उपसंहार → उप + संहार, अन्वेषण → अनु + एषण)"
      : "मूल शब्द + प्रत्यय (e.g. चतुराई → चतुर + आई, सैनिक → सेना + इक, लेखक → लिख + अक)";
  return [
    {
      role: "system",
      content: `You separate Hindi words into ${what}, as Hindi grammar books for Rajasthan's competitive exams (RPSC, RSSB) teach it. Each word is given with the ${kind === "upsarg" ? "उपसर्ग" : "प्रत्यय"} it was made with. Write the parts in their full original form (undo any sandhi or vowel change), joined by " + ". If the word isn't really made with that ${kind === "upsarg" ? "उपसर्ग" : "प्रत्यय"}, leave it out.
Reply with JSON only: {"words": [{"n": 1, "split": "उप + संहार"}]}`,
    },
    {
      role: "user",
      content: items.map((i) => `${i.n}. ${i.word} (${i.affix})`).join("\n"),
    },
  ];
}

export function parseSplit(raw: string, items: SplitItem[]): Map<number, string> {
  const o = parseJsonLoose<{ words?: unknown }>(raw);
  if (!o || !Array.isArray(o.words)) throw new Error("The AI's reply couldn't be read");
  const out = new Map<number, string>();
  for (const w of o.words as Record<string, unknown>[]) {
    const n = Number(w?.n);
    const split = typeof w?.split === "string" ? w.split.replace(/\s*\+\s*/g, " + ").trim() : "";
    if (items.some((i) => i.n === n) && /\S \+ \S/.test(split)) out.set(n, split.slice(0, 200));
  }
  return out;
}
