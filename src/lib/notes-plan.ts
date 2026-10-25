// The notes planner: for each topic of a notes book, the AI judges from the
// knowledge base passages found for it whether there is enough authentic
// material to write its notes (for Prelims or Mains), what is missing,
// whether the notes need a map, and what to upload next. Topics asked more
// often in past papers come first. Pure helpers, shared by the server, the
// admin panel and tests.
import type { Bi } from "@/lib/current-affairs";
import type { NotesStage } from "@/lib/notes-books";

type ChatMessage = { role: "system" | "user"; content: string };

export type Coverage = "full" | "partial" | "none";
export const COVERAGE_NAME: Record<Coverage, string> = {
  full: "Covered",
  partial: "Partly covered",
  none: "Not covered",
};

export const MAP_KINDS = [
  "rivers",
  "lakes",
  "physical",
  "climate",
  "soils",
  "minerals",
  "protected areas",
  "places",
  "districts",
  "routes",
  "other",
] as const;
export type MapKind = (typeof MAP_KINDS)[number];
export type MapNeed = { kind: MapKind; what: string };

export type PlanSource = { title: string; subject: string };

export type TopicPlan = {
  topic_id: string;
  coverage: Coverage;
  missing: string;
  sources: PlanSource[];
  map: MapNeed | null;
  upload: string[];
  sig: string;
  checked_at: string;
};

// Topics planned a batch at a time (one AI request).
export const PLAN_BATCH = 5;

// A topic as the planner sees it.
export type PlanItem = {
  topic_id: string;
  number: string;
  name: Bi;
  // "Drainage system › Rivers › Chambal"
  path: string;
  chapter: number;
  asked: number;
  lines: string[];
};

// What a topic's check depends on: its place in the outline and its lines.
export function planSig(path: string, lines: string[]): string {
  const s = [path, ...lines].join("\n");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// More often asked and more syllabus lines: more important; not covered
// matters more than partly covered.
export function priority(asked: number, lines: number, coverage: Coverage | null): number {
  const gap = coverage === "none" ? 1 : coverage === "partial" ? 0.5 : 0;
  return (1 + 2 * asked + lines) * gap;
}

const STAGE_NEEDS: Record<NotesStage, string> = {
  prelims:
    "Prelims notes need precise facts: definitions, names, places, dates, figures, lists and classifications.",
  mains:
    "Mains notes need depth for written answers: concepts, causes and effects, significance, problems, analysis, data with sources, official text (Constitution, Acts, policies) and examples.",
};

export function planMessages(
  stage: NotesStage,
  section: string,
  items: {
    n: number;
    title: string;
    lines: string[];
    asked: number;
    questions: string[];
    passages: { k: number; title: string; content: string }[];
  }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan the ${stage === "mains" ? "Mains" : "Prelims"} study notes book of "${section}" for Rajasthan's competitive exams (RPSC, RSSB). For each topic you get its place in the outline, the official syllabus lines it covers, how often it was asked in past papers (with examples), and passages found for it in our knowledge base of books and documents. ${STAGE_NEEDS[stage]}
Judge whether the passages hold enough authentic material to write this topic's notes:
- "full": the passages cover the topic and what was asked on it well;
- "partial": they cover some of it, with clear gaps;
- "none": nothing useful (the passages are about something else, or there are none).
"missing": one short line on what is missing (empty when full).
"map": when this topic's notes need a map (rivers, lakes, physical regions, climate, soils, minerals, protected areas, places, districts, routes), {"kind": one of ${MAP_KINDS.map((k) => `"${k}"`).join(", ")}, "what": "what the map shows, in a few words"}; otherwise null.
"upload": up to 3 authentic sources to add to the knowledge base to fill the gap, most useful first: NCERT, NIOS, IGNOU or Rajasthan board (RBSE) books with class and chapter, government reports, policies, Acts or official websites. Name only works you are sure exist. Empty when full.
Reply with JSON only: [{"n": 1, "coverage": "partial", "missing": "...", "map": null, "upload": ["..."]}]`,
    },
    {
      role: "user",
      content: items
        .map((t) =>
          [
            `T${t.n}. ${t.title}`,
            t.lines.length ? `Syllabus: ${t.lines.join(" | ")}` : "",
            t.asked
              ? `Asked ${t.asked} time${t.asked === 1 ? "" : "s"}${t.questions.length ? `, e.g. ${t.questions.map((q) => `"${q}"`).join("; ")}` : ""}`
              : "Not asked in the linked past papers.",
            t.passages.length
              ? `Passages:\n${t.passages.map((p) => `[${p.k}] ${p.title}: ${p.content}`).join("\n")}`
              : "Passages: none found.",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n"),
    },
  ];
}

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

export function parsePlan(
  raw: string,
  nums: number[],
): Map<number, { coverage: Coverage; missing: string; map: MapNeed | null; upload: string[] }> {
  const list = parseJson<unknown>(raw);
  const out = new Map<
    number,
    { coverage: Coverage; missing: string; map: MapNeed | null; upload: string[] }
  >();
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(String(o.n).replace(/^T/i, ""));
    if (!nums.includes(n)) continue;
    const coverage = (["full", "partial", "none"] as const).find(
      (c) => c === String(o.coverage).toLowerCase(),
    );
    if (!coverage) continue;
    const m = (o.map ?? null) as Record<string, unknown> | null;
    const kind = m ? (MAP_KINDS.find((k) => k === String(m.kind).toLowerCase()) ?? "other") : null;
    const what = m ? str(m.what, 160) : "";
    out.set(n, {
      coverage,
      missing: coverage === "full" ? "" : str(o.missing, 300),
      map: kind && what ? { kind, what } : null,
      upload:
        coverage === "full"
          ? []
          : (Array.isArray(o.upload) ? o.upload : [])
              .map((u) => str(u, 200))
              .filter(Boolean)
              .slice(0, 3),
    });
  }
  return out;
}

// "Upload next": the suggested sources, the ones that fill the most important
// gaps first, with the topics each would fill.
export function uploadList(
  rows: { number: string; priority: number; upload: string[] }[],
): { source: string; priority: number; topics: string[] }[] {
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const by = new Map<string, { source: string; priority: number; topics: string[] }>();
  for (const r of rows)
    for (const u of r.upload) {
      const k = key(u);
      if (!k) continue;
      const e = by.get(k) ?? { source: u, priority: 0, topics: [] };
      e.priority += r.priority;
      if (!e.topics.includes(r.number)) e.topics.push(r.number);
      by.set(k, e);
    }
  return [...by.values()].sort(
    (a, b) => b.priority - a.priority || b.topics.length - a.topics.length,
  );
}
