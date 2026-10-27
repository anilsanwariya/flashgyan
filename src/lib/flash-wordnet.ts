// Hindi WordNet (IIT Bombay, CFILT): its database file (data_txt) read into
// synsets — the words of one meaning, the meaning (gloss) and an example,
// and the meanings opposite to it (antonyms). Pure: shared by the loader
// in the browser, the server and tests.
//
// A line: "<id> <pos> <n> <word:word:…> <relations> <relation…> | gloss:"example""
// where each relation is a 4-digit code XYZZ (X the target's part of
// speech, Y the kind: 1 semantic, 2 lexical, 3 gradation, 4 ontology; ZZ
// the relation) and its fields: 1 → target; 2 → word indices, target;
// 3 → indices, two targets; 4 → ontology node. Lexical relations 18–29
// are the antonyms (ANTO_ACTION … ANTO_MANNER).

export type WnSynset = {
  id: number;
  // 1 noun, 2 adjective, 3 verb, 4 adverb.
  pos: number;
  words: string[];
  gloss: string;
  example: string;
  antonyms: number[];
};

export const WN_POS: Record<number, string> = {
  1: "संज्ञा",
  2: "विशेषण",
  3: "क्रिया",
  4: "क्रियाविशेषण",
};

// A word as stored: spaces for its underscores, in one Unicode form.
export const wnWord = (w: string) => w.replace(/_/g, " ").normalize("NFC").trim();

export function parseWnLine(line: string): WnSynset | null {
  const bar = line.indexOf("|");
  if (bar < 0) return null;
  const t = line.slice(0, bar).trim().split(/\s+/);
  const id = Number(t[0]);
  const pos = Number(t[1]);
  if (!Number.isInteger(id) || !Number.isInteger(pos) || !t[3]) return null;
  const words = [...new Set(t[3].split(":").map(wnWord).filter(Boolean))];
  const antonyms = new Set<number>();
  const n = Number(t[4]) || 0;
  let k = 5;
  for (let i = 0; i < n && k < t.length; i++) {
    const code = t[k] ?? "";
    const kind = code[1];
    const sub = Number(code.slice(2));
    if (kind === "2") {
      if (sub >= 18 && sub <= 29) {
        const target = Number(t[k + 2]);
        if (Number.isInteger(target)) antonyms.add(target);
      }
      k += 3;
    } else if (kind === "3") k += 4;
    else k += 2;
  }
  // The gloss, then its examples in quotes (several split by " / ").
  const rest = line.slice(bar + 1).trim();
  const q = rest.indexOf(':"');
  const gloss = (q < 0 ? rest : rest.slice(0, q)).trim();
  const example =
    q < 0
      ? ""
      : rest
          .slice(q + 2)
          .replace(/"\s*$/, "")
          .split(" / ")[0]
          .trim();
  return { id, pos, words, gloss, example, antonyms: [...antonyms] };
}

export function parseWordnet(text: string): { synsets: WnSynset[]; skipped: number } {
  const synsets: WnSynset[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const s = parseWnLine(line);
    if (s) synsets.push(s);
    else skipped++;
  }
  return { synsets, skipped };
}

// A word's meanings, as the dictionary panel and the AI use them.
export type WnSense = {
  pos: string;
  gloss: string;
  example: string;
  synonyms: string[];
  antonyms: string[];
};

// The senses of `word` from its synsets (those spelling it exactly first)
// and their antonym synsets' words (the first few of each).
export function wnSenses(
  word: string,
  synsets: WnSynset[],
  byId: Map<number, WnSynset>,
): WnSense[] {
  const w = wnWord(word);
  return [...synsets]
    .sort((a, b) => Number(b.words.includes(w)) - Number(a.words.includes(w)) || a.id - b.id)
    .map((s) => ({
      pos: WN_POS[s.pos] ?? "",
      gloss: s.gloss,
      example: s.example,
      synonyms: s.words.filter((x) => x !== w),
      antonyms: [
        ...new Set(s.antonyms.flatMap((a) => byId.get(a)?.words.slice(0, 4) ?? [])),
      ].filter((x) => x !== w),
    }));
}
