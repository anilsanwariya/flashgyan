// The scheme register: one record per government scheme, linking every story
// about it, so a new story prints what came before ("Earlier: launched May
// 2026 with ₹500 crore…"). Pure helpers: name matching and the AI prompt.

type ChatMessage = { role: "system" | "user"; content: string };
type Bi = { en: string; hi: string };

export type SchemeLevel = "rajasthan" | "central";

export type CaScheme = {
  id: string;
  name: string;
  name_hi: string;
  level: SchemeLevel;
  aliases: string[];
  created_at: string;
  updated_at: string;
};

// A story before this one about the same scheme, as printed.
export type Earlier = { date: string; headline: Bi };

// How many earlier stories a story prints.
export const EARLIER_SHOWN = 2;

// Words every scheme name has, and spellings of the same word.
const GENERIC = new Set([
  "scheme",
  "schemes",
  "yojana",
  "yojna",
  "abhiyan",
  "abhiyaan",
  "mission",
  "programme",
  "program",
  "campaign",
  "the",
  "of",
  "for",
  "and",
  "phase",
  "new",
  "national",
  "rashtriya",
]);
const SAME_WORD: [RegExp, string][] = [
  [/\bpradhan\s*mantri\b|\bprime minister'?s?\b/g, "pm"],
  [/\bmukhya\s*mantri\b|\bchief minister'?s?\b/g, "cm"],
  [/\brajasthan\b/g, "raj"],
];

// A scheme's name for matching: lower case, no punctuation, phases and
// generic words left out ("Mukhyamantri Jal Swavlamban Abhiyan 3.0" and
// "CM Jal Swavlamban Abhiyan" match).
export function normName(name: string): string {
  let s = name.toLowerCase().replace(/[‘’'`]/g, "");
  for (const [re, to] of SAME_WORD) s = s.replace(re, to);
  return s
    .replace(/\b\d+(\.\d+)?\b|\b(i{1,3}|iv|v)\b/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !GENERIC.has(w))
    .join(" ")
    .trim();
}

// The scheme a story is about: its "name" fact (none when it has no name).
export function schemeNameOf(facts: { text: string; slot?: string }[]): string | null {
  const f = facts.find((x) => x.slot === "name");
  const name = f?.text.replace(/\s+/g, " ").trim().slice(0, 160) ?? "";
  return normName(name) ? name : null;
}

// Does the AI see the new scheme as one of the candidates (closest names)?
export function sameSchemeMessages(
  name: string,
  facts: string[],
  candidates: { name: string; aliases: string[] }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You keep a register of Indian and Rajasthan government schemes. Is the scheme in the news story the same scheme as one in the list (the same scheme under another name, short form, phase or edition counts as the same; a different scheme of the same ministry or a similar name does not)?
Reply with JSON only: {"same": the number of the matching scheme, or 0 if none}`,
    },
    {
      role: "user",
      content: `Story's scheme: ${name}${facts.length ? `\nIts facts: ${facts.slice(0, 4).join("; ")}` : ""}\n\nRegister:\n${candidates
        .map(
          (c, i) =>
            `${i + 1}. ${c.name}${c.aliases.length ? ` (also: ${c.aliases.slice(0, 4).join(", ")})` : ""}`,
        )
        .join("\n")}`,
    },
  ];
}

// The matching candidate's index, or -1.
export function parseSame(raw: string, count: number): number {
  const m = /"same"\s*:\s*(\d+)/.exec(raw);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= count ? n - 1 : -1;
}
