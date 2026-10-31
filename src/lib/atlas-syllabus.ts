// The atlas on the syllabus: each group of facts (a chapter's heading) is
// filed under the topics of the master outlines of the Rajasthan subject
// sections, so the editor sees which syllabus topics the atlas covers and
// which have few or no facts. Pure.
import type { ChatMessage } from "../../supabase/functions/_shared/saathi-core.ts";
import { childrenOf, type MasterTopic } from "@/lib/outline";

// The sections the atlas's facts belong to.
export const ATLAS_SECTIONS = [
  "Rajasthan Geography",
  "Rajasthan History",
  "Rajasthan Art & Culture",
  "Rajasthan Polity",
  "Rajasthan Economy",
];

// Groups filed per AI call.
export const SYLLABUS_BATCH = 25;

export const groupKey = (chapterKey: string, heading: string) => `${chapterKey}|${heading}`;

// The outlines as numbered topics (T1…), section by section.
export function sectionsOutline(topics: MasterTopic[]): { text: string; ids: string[] } {
  const ids: string[] = [];
  const out: string[] = [];
  for (const section of ATLAS_SECTIONS) {
    const own = topics.filter((t) => t.section === section);
    if (!own.length) continue;
    out.push(`# ${section}`);
    const walk = (parent: string | null, depth: number) => {
      for (const t of childrenOf(own, parent)) {
        ids.push(t.id);
        out.push(`${"  ".repeat(depth)}T${ids.length} ${t.level}: ${t.name_en}`);
        walk(t.id, depth + 1);
      }
    };
    walk(null, 0);
  }
  return { text: out.join("\n"), ids };
}

// Kept the same on every call (the outline and groups go in the user
// message) so the prompt is cached.
const SYSTEM = `You file the sections of a Rajasthan atlas (study notes for RPSC and RSSB exams) under the master outline of the exam syllabus, so the editor can see which syllabus topics the atlas covers. For each group (a chapter's heading, with a few of its facts) give the outline items (T numbers) it is about: one to three, at the most specific level that fits (a subtopic when one fits, else its topic, else the chapter). Give an empty list only if nothing in the outline is about it.
Reply with JSON only: [{"n": group number, "topics": [12, 15]}]`;

export function syllabusLinkMessages(
  outline: string,
  groups: { n: number; chapter: string; heading: string; facts: string[] }[],
): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Outline:\n${outline}\n\nGroups:\n${groups
        .map(
          (g) =>
            `G${g.n}. ${g.chapter}${g.heading ? ` › ${g.heading}` : ""}\n${g.facts
              .map((f) => `   - ${f}`)
              .join("\n")}`,
        )
        .join("\n")}`,
    },
  ];
}

// The T numbers for each group (by its number); a group missing from the
// reply is left out (filed again next time).
export function parseSyllabusLinks(
  raw: string,
  nums: number[],
  topicCount: number,
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const t = raw.replace(/```(?:json)?/g, "");
  let list: unknown;
  try {
    list = JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));
  } catch {
    return out;
  }
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(String(o.n).replace(/^G/i, ""));
    if (!nums.includes(n)) continue;
    const topics = (Array.isArray(o.topics) ? o.topics : [])
      .map((v) => Number(String(v).replace(/^T/i, "")))
      .filter((v) => Number.isInteger(v) && v >= 1 && v <= topicCount);
    out.set(n, [...new Set(topics)].slice(0, 3));
  }
  return out;
}

// Facts per topic: its own groups' facts, and with its subtopics' (a group
// filed under a topic and its subtopic counted once).
export function topicCounts(
  topics: MasterTopic[],
  links: Record<string, string[]>,
  facts: Record<string, number>,
): Map<string, { own: number; total: number; groups: string[] }> {
  const out = new Map(topics.map((t) => [t.id, { own: 0, total: 0, groups: [] as string[] }]));
  for (const [g, ids] of Object.entries(links))
    for (const id of new Set(ids)) {
      const c = out.get(id);
      if (!c) continue;
      c.own += facts[g] ?? 0;
      c.groups.push(g);
    }
  const under = (id: string): Set<string> => {
    const c = out.get(id)!;
    const all = new Set(c.groups);
    for (const t of childrenOf(topics, id)) for (const g of under(t.id)) all.add(g);
    c.total = [...all].reduce((s, g) => s + (facts[g] ?? 0), 0);
    return all;
  };
  for (const t of topics.filter((x) => !x.parent_id)) under(t.id);
  return out;
}
