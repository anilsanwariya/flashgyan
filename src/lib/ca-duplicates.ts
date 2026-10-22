// Finding the same news printed as several stories: one PIB release about a
// scheme's allocation and another about its achievements are one story for a
// magazine. Two embeddings find likely pairs (the story's headline and facts,
// and its event key, "Rajasthan · scheme · launch", which stays the same
// whatever the angle); the AI confirms the doubtful ones, and once a day
// reads the whole list to group what the embeddings missed. Pure helpers, no
// network here.

// At or above this similarity two stories are merged without asking.
export const SURELY_SAME = 0.88;
// Between this and SURELY_SAME the AI decides.
export const MAYBE_SAME = 0.6;
// Stories compared with each new item as a source is read.
export const COMPARE_WITH = 8;
// Of those, the most the AI is asked about.
export const ASK_ABOUT = 5;
// Most doubtful pairs sent to the AI in one go.
export const MAX_PAIRS = 40;

type ChatMessage = { role: "system" | "user"; content: string };
export type StoryBrief = {
  headline: string;
  facts: { text: string }[];
  key?: string | null;
};

// Two stories' likeness: the closer of their story and event-key embeddings.
export function likeness(
  a: { vec: number[] | null; keyVec: number[] | null },
  b: { vec: number[] | null; keyVec: number[] | null },
): number {
  const story = a.vec && b.vec ? cosine(a.vec, b.vec) : 0;
  const key = a.keyVec && b.keyVec ? cosine(a.keyVec, b.keyVec) : 0;
  return Math.max(story, key);
}

// A pair of story ids in a fixed order, for remembering pairs kept apart.
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// A pgvector value as PostgREST returns it ("[0.1,0.2,…]") or a number array.
export function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.every((x) => typeof x === "number") ? (v as number[]) : null;
  if (typeof v !== "string") return null;
  try {
    const arr = JSON.parse(v) as unknown;
    return Array.isArray(arr) && arr.every((x) => typeof x === "number") ? (arr as number[]) : null;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type Pair = { a: number; b: number; similarity: number };

// Pairs of stories similar enough to be the same news, most similar first.
// Each story has its story embedding and, when known, its event-key one.
export function candidatePairs(
  vectors: (number[] | null | { vec: number[] | null; keyVec: number[] | null })[],
): Pair[] {
  const both = vectors.map((v) => (Array.isArray(v) || !v ? { vec: v, keyVec: null } : v));
  const out: Pair[] = [];
  for (let a = 0; a < both.length; a++) {
    for (let b = a + 1; b < both.length; b++) {
      const similarity = likeness(both[a], both[b]);
      if (similarity >= MAYBE_SAME) out.push({ a, b, similarity });
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

const brief = (s: StoryBrief) =>
  `${s.key ? `[${s.key}] ` : ""}${s.headline}\n${s.facts
    .slice(0, 6)
    .map((f) => `- ${f.text}`)
    .join("\n")}`;

export function sameStoryMessages(pairs: [StoryBrief, StoryBrief][]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You edit a daily current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). For each numbered pair of news items, decide whether the magazine should print them as ONE story because they are about the same event, scheme, programme, report, decision or person, even if they come from different sources or angles (for example a scheme's new allocation and the same scheme's achievements, or a fair being planned and the same fair opening). Two different schemes, events, reports or people are NOT the same, even in the same field (Khelo India and a separate national sports policy are different stories).
Reply with JSON only: an array of the numbers of the pairs that are the same story, e.g. [1, 3]. Reply [] if none.`,
    },
    {
      role: "user",
      content: pairs
        .map(([a, b], i) => `Pair ${i + 1}:\nA: ${brief(a)}\nB: ${brief(b)}`)
        .join("\n\n"),
    },
  ];
}

// The pair numbers (0-based) the AI called the same story.
export function parseSameStory(raw: string, count: number): Set<number> {
  const m = /\[[\s\S]*?\]/.exec(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const out = new Set<number>();
  if (!m) return out;
  try {
    const list = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(list)) return out;
    for (const x of list) {
      const i = Number(x) - 1;
      if (Number.isInteger(i) && i >= 0 && i < count) out.add(i);
    }
  } catch {
    /* unreadable: treat as no duplicates */
  }
  return out;
}

// The whole day's stories in one list, for the AI to group the ones that are
// the same news (what the embeddings missed).
export type DayStory = StoryBrief & { section: string; editorial: boolean };

export function dayGroupMessages(stories: DayStory[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You edit a daily current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). Below is the day's list of news stories, each with its event key in brackets, headline and first facts. They came from several newspapers and releases, so the same news may appear more than once with different headlines, angles or details (a scheme's launch and the same scheme's targets; a report's release and its findings; an appointment announced and the same person taking charge). Find every group of stories that the magazine should print as ONE story because they are about the same event, scheme, programme, report, decision or person.
RULES: Two different schemes, events, reports or people are NOT the same, even in the same field or place. A news story and an editorial are never the same. Mark a group "sure" only when the stories are plainly the same news; otherwise "sure": false. Use each story at most once.
Reply with JSON only: {"groups": [{"stories": [story numbers], "sure": true or false}]}. Reply {"groups": []} if every story is different.`,
    },
    {
      role: "user",
      content: stories
        .map(
          (s, i) =>
            `${i + 1}. (${s.editorial ? "editorial" : s.section}) ${s.key ? `[${s.key}] ` : ""}${s.headline}\n${s.facts
              .slice(0, 3)
              .map((f) => `   - ${f.text}`)
              .join("\n")}`,
        )
        .join("\n"),
    },
  ];
}

export type DayGroup = { stories: number[]; sure: boolean };

// The AI's groups as 0-based story indexes: two or more stories each, every
// story in one group at most, never a news story with an editorial.
export function parseDayGroups(raw: string, stories: { editorial: boolean }[]): DayGroup[] {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let o: { groups?: unknown } = {};
  for (const t of [text, /\{[\s\S]*\}/.exec(text)?.[0] ?? ""]) {
    try {
      o = JSON.parse(t) as { groups?: unknown };
      break;
    } catch {
      // try the next form
    }
  }
  const used = new Set<number>();
  const out: DayGroup[] = [];
  for (const g of Array.isArray(o.groups) ? o.groups : []) {
    const r = (g ?? {}) as Record<string, unknown>;
    const ids = (Array.isArray(r.stories) ? r.stories : [])
      .map((x) => Number(x) - 1)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < stories.length && !used.has(i));
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    if (new Set(unique.map((i) => stories[i].editorial)).size > 1) continue;
    unique.forEach((i) => used.add(i));
    out.push({ stories: unique, sure: r.sure === true });
  }
  return out;
}

// Groups of story indexes joined by confirmed pairs (only groups of 2 or more).
export function duplicateGroups(count: number, pairs: { a: number; b: number }[]): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const { a, b } of pairs) parent[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// The story a group is merged into: in the issue, most important, built from
// the most sources, then first in the issue's order.
export function pickKeeper<
  T extends { status: string; importance: number; position: number; source_ids: string[] },
>(items: T[]): number {
  const rank = (t: T) => [
    t.status === "included" ? 1 : 0,
    t.importance,
    t.source_ids.length,
    -t.position,
  ];
  let best = 0;
  for (let i = 1; i < items.length; i++) {
    const a = rank(items[i]);
    const b = rank(items[best]);
    const k = a.findIndex((x, j) => x !== b[j]);
    if (k >= 0 && a[k] > b[k]) best = i;
  }
  return best;
}
