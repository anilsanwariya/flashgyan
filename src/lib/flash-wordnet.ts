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

// ---------- Word questions (पर्यायवाची, विलोम, अर्थ) ----------

// Words of a question that say what it asks, not the word asked about.
const QUESTION_WORDS = new Set(
  (
    "का के की को है हैं नहीं शब्द शब्दों पर्यायवाची समानार्थी समानार्थक विलोम विलोमार्थी " +
    "विपरीत विपरीतार्थक विपरीतार्थी अर्थ अर्थों कौन कौनसा कौनसी कौन-सा कौन-सी सा सी से में " +
    "निम्न निम्नलिखित एक उचित सही गलत असंगत युग्म चुनिए चुनें बताइए बताइये क्या होगा होता " +
    "होती है। रूप लिए दिए गए गये गई वाला वाली वाले और या भी इनमें इसका इसके इस उस यह वह शुद्ध " +
    "अशुद्ध उपयुक्त सर्वाधिक सबसे सटीक प्रयुक्त अन्य अलग ऐसा ऐसी जो जिस"
  ).split(" "),
);

// What a question asks of a word: synonyms, opposites or a meaning (null:
// not a word question).
export function wordQuestion(text: string): "syn" | "ant" | "meaning" | null {
  if (/पर्यायवाची|समानार्थ|synonym/i.test(text)) return "syn";
  if (/विलोम|विपरीतार्थ|antonym|opposite/i.test(text)) return "ant";
  if (/(का|के|की)\s+(सही\s+|उचित\s+)?अर्थ|अर्थ\s+(क्या|है|बताइ)|meaning of/i.test(text))
    return "meaning";
  return null;
}

// The Hindi words to look up for a word question: the quoted word(s) in it
// (else its other Hindi words) and each option's words.
export function wordQuestionWords(question: string, options: string[] = [], max = 14): string[] {
  const out: string[] = [];
  const add = (w: string) => {
    const t = w
      .replace(/[।?!.:\-–—()[\]{}0-9]+$/g, "")
      .replace(/^[-–—([{]+/, "")
      .trim();
    if (!t || !/[ऀ-ॿ]/.test(t) || QUESTION_WORDS.has(t) || out.includes(t)) return;
    out.push(t);
  };
  const quoted = [...question.matchAll(/['‘’"“”']([^'‘’"“”']{1,40})['‘’"“”']/g)].map((m) => m[1]);
  if (quoted.length) quoted.forEach((q) => add(q.trim()));
  else
    question
      .split(/[\s,;/]+/)
      .filter((w) => /^[ऀ-ॿ-]+[।?]?$/.test(w))
      .forEach(add);
  for (const o of options)
    for (const part of o.split(/[,;/]+/)) {
      const words = part
        .trim()
        .split(/\s+/)
        .filter((w) => /[ऀ-ॿ]/.test(w));
      // An option of a word or two (a phrase is a meaning, not a word).
      if (words.length && words.length <= 2) add(words.join(" "));
    }
  return out.slice(0, max);
}

// The words' WordNet meanings as a reference passage (a few lines a word).
export function wnPassage(found: Record<string, WnSense[]>, chars = 1500): string {
  const lines: string[] = [];
  for (const [w, senses] of Object.entries(found)) {
    if (!senses.length) continue;
    lines.push(
      `${w}: ` +
        senses
          .slice(0, 3)
          .map(
            (s) =>
              `(${s.pos}) ${s.gloss}` +
              (s.synonyms.length ? ` — पर्याय: ${s.synonyms.slice(0, 8).join(", ")}` : "") +
              (s.antonyms.length ? ` — विलोम: ${s.antonyms.slice(0, 4).join(", ")}` : ""),
          )
          .join(" | "),
    );
  }
  return lines.join("\n").slice(0, chars);
}

export const WN_CREDIT = "Hindi WordNet (CFILT, IIT Bombay)";
