// Finding the same news printed as several stories: one PIB release about a
// scheme's allocation and another about its achievements are one story for a
// magazine. Embeddings find likely pairs; the AI confirms the doubtful ones.
// Pure helpers, no network here.

// At or above this similarity two stories are merged without asking.
export const SURELY_SAME = 0.88;
// Between this and SURELY_SAME the AI decides.
export const MAYBE_SAME = 0.75;
// Most doubtful pairs sent to the AI in one go.
export const MAX_PAIRS = 40;

type ChatMessage = { role: "system" | "user"; content: string };
export type StoryBrief = { headline: string; facts: { text: string }[] };

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
export function candidatePairs(vectors: (number[] | null)[]): Pair[] {
  const out: Pair[] = [];
  for (let a = 0; a < vectors.length; a++) {
    for (let b = a + 1; b < vectors.length; b++) {
      const va = vectors[a];
      const vb = vectors[b];
      if (!va || !vb) continue;
      const similarity = cosine(va, vb);
      if (similarity >= MAYBE_SAME) out.push({ a, b, similarity });
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

const brief = (s: StoryBrief) =>
  `${s.headline}\n${s.facts
    .slice(0, 6)
    .map((f) => `- ${f.text}`)
    .join("\n")}`;

export function sameStoryMessages(pairs: [StoryBrief, StoryBrief][]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You edit a daily current affairs magazine for RAS exam aspirants. For each numbered pair of news items, decide whether the magazine should print them as ONE story because they are about the same event, scheme, programme, report, decision or person, even if they come from different sources or angles (for example a scheme's new allocation and the same scheme's achievements, or a fair being planned and the same fair opening). Two different schemes, events, reports or people are NOT the same, even in the same field (Khelo India and a separate national sports policy are different stories).
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
