// Exam paper types and sections, and tagging questions on the exam's
// syllabus. Pure helpers, shared by the server, the admin page and tests.
//
// A paper is made of sections (GK & GS, Hindi, English…); a language section
// (Hindi, English) keeps its questions in that language only, never
// translated. A paper's type is a preset of sections; its sections can
// cover question ranges ("1–100 GK & GS, 101–150 Hindi"), else the AI sorts
// each question. Questions are tagged on a line of the exam's latest
// syllabus: its subject section, the heading above it (topic) and the line
// (subtopic).
import type { SyllabusNode } from "@/lib/syllabus";
import { KIND_DEPTH } from "@/lib/syllabus";

export type Lang = "en" | "hi";
export type PaperSection = {
  key: string;
  name_en: string;
  name_hi: string;
  // A language section: its questions are in this language only.
  lang: Lang | null;
};

export const DEFAULT_SECTIONS: PaperSection[] = [
  { key: "gkgs", name_en: "GK & GS", name_hi: "सामान्य ज्ञान एवं सामान्य अध्ययन", lang: null },
  { key: "hindi", name_en: "Hindi", name_hi: "हिंदी", lang: "hi" },
  { key: "english", name_en: "English", name_hi: "अंग्रेज़ी", lang: "en" },
  { key: "maths", name_en: "Mathematics", name_hi: "गणित", lang: null },
  {
    key: "reasoning",
    name_en: "Reasoning / Mental Ability",
    name_hi: "तर्कशक्ति / मानसिक योग्यता",
    lang: null,
  },
  { key: "computer", name_en: "Computer", name_hi: "कंप्यूटर", lang: null },
  { key: "science", name_en: "Science", name_hi: "विज्ञान", lang: null },
  {
    key: "pedagogy",
    name_en: "Teaching methods / Psychology",
    name_hi: "शिक्षण विधियाँ / मनोविज्ञान",
    lang: null,
  },
  { key: "rajasthani", name_en: "Rajasthani language", name_hi: "राजस्थानी भाषा", lang: "hi" },
];

// The sections as saved (the editor's list), cleaned: unique keys, names
// given, the defaults when empty.
export function cleanSections(v: unknown): PaperSection[] {
  const out: PaperSection[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name_en = String(o.name_en ?? "")
      .trim()
      .slice(0, 60);
    const name_hi = String(o.name_hi ?? "")
      .trim()
      .slice(0, 60);
    if (!name_en && !name_hi) continue;
    const key =
      String(o.key ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 30) ||
      (name_en || name_hi)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 30) ||
      `s${out.length + 1}`;
    if (out.some((s) => s.key === key)) continue;
    out.push({
      key,
      name_en: name_en || name_hi,
      name_hi: name_hi || name_en,
      lang: o.lang === "en" || o.lang === "hi" ? o.lang : null,
    });
  }
  return out.length ? out : DEFAULT_SECTIONS;
}

// Paper types: presets of sections ("subject": one GK subject, chosen).
export const PAPER_TYPES = [
  { key: "gkgs", label: "GK & GS", sections: ["gkgs"] },
  { key: "hindi-english", label: "Hindi + English", sections: ["hindi", "english"] },
  { key: "hindi", label: "Only Hindi", sections: ["hindi"] },
  { key: "english", label: "Only English", sections: ["english"] },
  {
    key: "gkgs-hindi-english",
    label: "GK & GS + Hindi + English",
    sections: ["gkgs", "hindi", "english"],
  },
  { key: "subject", label: "One GK subject", sections: ["gkgs"] },
  { key: "custom", label: "Other sections…", sections: [] },
] as const;
export type PaperTypeKey = (typeof PAPER_TYPES)[number]["key"];
export const paperTypeLabel = (k: string | null | undefined) =>
  PAPER_TYPES.find((t) => t.key === k)?.label ?? "";

// A paper's section, with the questions it covers (from–to, both kept), when
// known.
export type SectionRange = { key: string; from: number | null; to: number | null };

export function cleanRanges(v: unknown, known: PaperSection[]): SectionRange[] {
  const out: SectionRange[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const key = String(o.key ?? "");
    if (!known.some((s) => s.key === key) || out.some((r) => r.key === key)) continue;
    const n = (y: unknown) => {
      const i = Number(y);
      return Number.isInteger(i) && i >= 1 && i <= 1000 ? i : null;
    };
    let from = n(o.from);
    let to = n(o.to);
    if (from && to && from > to) [from, to] = [to, from];
    out.push({ key, from, to });
  }
  return out.slice(0, 12);
}

// Ranges that overlap (a question in two sections).
export function rangeProblems(ranges: SectionRange[]): string[] {
  const set = ranges.filter((r) => r.from && r.to);
  const out: string[] = [];
  for (let i = 0; i < set.length; i++)
    for (let j = i + 1; j < set.length; j++)
      if (set[i].from! <= set[j].to! && set[j].from! <= set[i].to!)
        out.push(`${set[i].key} and ${set[j].key} overlap`);
  return out;
}

// A question's section: by the paper's ranges, else the one the AI (or the
// editor) set, else the paper's only section.
export function sectionOf(
  ranges: SectionRange[],
  q: { q_no: number; paper_section?: string | null },
): string {
  const hit = ranges.find((r) => r.from && r.to && q.q_no >= r.from && q.q_no <= r.to);
  if (hit) return hit.key;
  if (q.paper_section && ranges.some((r) => r.key === q.paper_section)) return q.paper_section;
  return ranges.length === 1 ? ranges[0].key : "";
}
export const langOf = (sections: PaperSection[], key: string): Lang | null =>
  sections.find((s) => s.key === key)?.lang ?? null;
// Sections whose questions the AI must sort (no range covers them yet).
export const needsSorting = (ranges: SectionRange[]) =>
  ranges.length > 1 && ranges.some((r) => !r.from || !r.to);

// ---------- Tagging on the syllabus ----------

export type Tag = {
  subject: string;
  topic_en: string;
  topic_hi: string;
  subtopic_en: string;
  subtopic_hi: string;
};

// Each line's tag: its subject section, the deepest heading above it in its
// paper, and the line itself.
export function syllabusTags(
  nodes: Pick<SyllabusNode, "id" | "kind" | "text_en" | "text_hi" | "section">[],
): Map<string, Tag> {
  const out = new Map<string, Tag>();
  let path: typeof nodes = [];
  for (const n of nodes) {
    if (n.kind !== "line") {
      path = path.filter((p) => KIND_DEPTH[p.kind] < KIND_DEPTH[n.kind]);
      path.push(n);
      continue;
    }
    // The topic: a heading or subheading (not the paper or unit).
    const head = [...path].reverse().find((p) => p.kind === "heading" || p.kind === "subheading");
    out.set(n.id, {
      subject: n.section,
      topic_en: head?.text_en || head?.text_hi || n.text_en || n.text_hi,
      topic_hi: head?.text_hi || head?.text_en || n.text_hi || n.text_en,
      subtopic_en: head ? n.text_en || n.text_hi : "",
      subtopic_hi: head ? n.text_hi || n.text_en : "",
    });
  }
  return out;
}

// The lines offered to the AI, numbered L1, L2…, each with its heading.
export function tagLines(
  nodes: Pick<SyllabusNode, "id" | "kind" | "text_en" | "text_hi" | "section">[],
  max = 500,
): { n: number; id: string; text: string }[] {
  const tags = syllabusTags(nodes);
  return nodes
    .filter((n) => n.kind === "line")
    .slice(0, max)
    .map((n, i) => {
      const t = tags.get(n.id)!;
      const line = (n.text_en || n.text_hi).slice(0, 220);
      return {
        n: i + 1,
        id: n.id,
        text: `[${t.subject || "?"}] ${t.subtopic_en ? `${t.topic_en.slice(0, 80)} › ${line}` : line}`,
      };
    });
}

// The second system message of the AI check: the paper's sections and the
// syllabus lines to tag on (kept out of the first, so it stays the same on
// every call).
export function tagContext(opts: {
  syllabus: string;
  lines: { n: number; text: string }[];
  oldSyllabus?: { name: string; heads: string[] } | null;
  sections?: PaperSection[] | null;
}): string {
  const parts = [
    `Tag every question on the syllabus below (${opts.syllabus}): give "line", the number of the one syllabus line it asks about (L1, L2…), or null if none fits. Its subject is that line's section.`,
    opts.lines.map((l) => `L${l.n} ${l.text}`).join("\n"),
  ];
  if (opts.oldSyllabus?.heads.length)
    parts.push(
      `This paper was set on an older syllabus (${opts.oldSyllabus.name}), with these headings: ${opts.oldSyllabus.heads.slice(0, 120).join("; ")}. Use it to understand what the question was meant to test, but tag it on the syllabus above (the latest).`,
    );
  if (opts.sections?.length)
    parts.push(
      `The paper has these sections: ${opts.sections.map((s) => `"${s.key}" (${s.name_en}${s.lang ? `, questions in ${s.lang === "hi" ? "Hindi" : "English"} only` : ""})`).join(", ")}. Give each question's "section".`,
    );
  parts.push(
    `Also give "difficulty": "easy", "medium" or "hard" for a well-prepared candidate. Add these keys to each question's object.`,
  );
  return parts.join("\n\n");
}

// The tag keys from the AI's reply for one question.
export function readTag(
  o: Record<string, unknown>,
  lines: { n: number; id: string }[],
  sectionKeys: string[],
): { node: string | null; section: string | null; difficulty: "easy" | "medium" | "hard" | null } {
  const ln = Number(String(o.line ?? "").replace(/^L/i, ""));
  const node = lines.find((l) => l.n === ln)?.id ?? null;
  const section =
    typeof o.section === "string" && sectionKeys.includes(o.section) ? o.section : null;
  const d = String(o.difficulty ?? "").toLowerCase();
  return {
    node,
    section,
    difficulty: d === "easy" || d === "medium" || d === "hard" ? d : null,
  };
}

// The exam's current syllabus for a paper, by its name and stage ("RAS Pre
// 2023" → RAS Prelims): the latest one notified.
export function guessSyllabus<
  T extends { id: string; name: string; stage: string; notified_on: string | null },
>(exam: string, list: T[]): T | null {
  const e = exam.toLowerCase();
  const stage = /\bmains?\b|मुख्य/.test(e)
    ? "mains"
    : /\bpre(lims?)?\b|\bprelim|प्रारंभिक/.test(e)
      ? "prelims"
      : /\bstage[\s-]*([123])\b/.exec(e)?.[1]
        ? `stage${/\bstage[\s-]*([123])\b/.exec(e)![1]}`
        : null;
  const fits = list.filter((s) => {
    const name = s.name.toLowerCase().trim();
    return name && (e.startsWith(name + " ") || e === name || e.includes(` ${name} `));
  });
  const ranked = fits
    .filter((s) => !stage || s.stage === stage || (s.stage === "single" && !stage))
    .sort(
      (a, b) =>
        b.name.length - a.name.length || (b.notified_on ?? "").localeCompare(a.notified_on ?? ""),
    );
  return ranked[0] ?? (stage ? null : (fits[0] ?? null));
}
