// The question bank: every objective paper's questions in one list, by
// exam, year, paper, subject, topic, subtopic and section, with their three
// proofreading checks; filtered, counted and broken down here. Pure helpers,
// shared by the server, the admin page and tests.

export type BankPaper = {
  id: string;
  exam: string; // the paper's own name ("RAS Pre 2023")
  examName: string; // the exam it belongs to ("RAS Prelims")
  year: string;
  published: boolean;
};

// One question, kept small.
export type BankRow = {
  id: string;
  paper: string;
  n: number;
  text: string;
  deleted: boolean;
  q: boolean; // ① question proofread
  a: boolean; // ② answer proofread
  e: boolean; // ③ explanation proofread
  x: boolean; // has an explanation
  done: boolean; // finished
  tagged: boolean;
  subject: string;
  topic: string;
  subtopic: string;
  section: string;
  difficulty: string;
};

export const DIMENSIONS = [
  { key: "exam", label: "Exam", all: "All exams" },
  { key: "year", label: "Year", all: "All years" },
  { key: "paper", label: "Paper", all: "All papers" },
  { key: "subject", label: "Subject", all: "All subjects" },
  { key: "topic", label: "Topic", all: "All topics" },
  { key: "subtopic", label: "Subtopic", all: "All subtopics" },
  { key: "section", label: "Section", all: "All sections" },
  { key: "difficulty", label: "Difficulty", all: "Any difficulty" },
] as const;
export type Dimension = (typeof DIMENSIONS)[number]["key"];

export const STATUSES = [
  { key: "", label: "Any state" },
  { key: "q", label: "① Question to proofread" },
  { key: "a", label: "② Answer to proofread" },
  { key: "e", label: "③ Explanation to proofread" },
  { key: "open", label: "Not finished" },
  { key: "done", label: "Finished" },
  { key: "noexpl", label: "Needs an explanation" },
  { key: "untagged", label: "Not tagged" },
] as const;
export type Status = (typeof STATUSES)[number]["key"];

export type BankFilter = Partial<Record<Dimension, string>> & { status?: Status; search?: string };

// A row's value on a dimension ("" when unknown).
export function valueOf(r: BankRow, papers: Map<string, BankPaper>, d: Dimension): string {
  const p = papers.get(r.paper);
  switch (d) {
    case "exam":
      return p?.examName ?? "";
    case "year":
      return p?.year ?? "";
    case "paper":
      return r.paper;
    default:
      return r[d];
  }
}

// Still to do at a check (the explanation only once written, after the
// answer).
export const openAt = (r: BankRow, level: "q" | "a" | "e") =>
  !r.deleted && (level === "e" ? r.x && r.a && !r.e : !r[level]);

export function matchStatus(r: BankRow, s: Status | undefined): boolean {
  switch (s) {
    case "q":
    case "a":
    case "e":
      return openAt(r, s);
    case "open":
      return !r.done;
    case "done":
      return r.done;
    case "noexpl":
      return r.done && !r.x && !r.deleted;
    case "untagged":
      return !r.tagged && !r.deleted;
    default:
      return true;
  }
}

export function filterRows(rows: BankRow[], papers: BankPaper[], f: BankFilter): BankRow[] {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const term = (f.search ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      DIMENSIONS.every((d) => !f[d.key] || valueOf(r, byId, d.key) === f[d.key]) &&
      matchStatus(r, f.status) &&
      (!term || r.text.toLowerCase().includes(term)),
  );
}

export type Report = {
  questions: number; // not deleted
  q: number;
  a: number;
  e: number; // ③ ticked
  explained: number; // with an explanation (③ applies)
  done: number;
  noexpl: number; // finished, no explanation yet
  tagged: number;
};

export function report(rows: BankRow[]): Report {
  const live = rows.filter((r) => !r.deleted);
  return {
    questions: live.length,
    q: live.filter((r) => r.q).length,
    a: live.filter((r) => r.a).length,
    e: live.filter((r) => r.x && r.e).length,
    explained: live.filter((r) => r.x).length,
    done: live.filter((r) => r.done).length,
    noexpl: live.filter((r) => r.done && !r.x).length,
    tagged: live.filter((r) => r.tagged).length,
  };
}
export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

// The rows grouped on a dimension, each with its report, largest first
// (years newest first).
export function breakdown(
  rows: BankRow[],
  papers: BankPaper[],
  d: Dimension,
): { value: string; report: Report }[] {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const groups = new Map<string, BankRow[]>();
  for (const r of rows) {
    const v = valueOf(r, byId, d);
    groups.set(v, [...(groups.get(v) ?? []), r]);
  }
  return (
    [...groups]
      .map(([value, rs]) => ({ value, report: report(rs) }))
      // Groups of deleted questions only are left out.
      .filter((g) => g.report.questions > 0)
      .sort((x, y) =>
        d === "year"
          ? y.value.localeCompare(x.value)
          : y.report.questions - x.report.questions || x.value.localeCompare(y.value),
      )
  );
}

// The next dimension to break a filter down by (subject → topic → subtopic).
export function nextDimension(f: BankFilter): Dimension {
  if (f.topic) return "subtopic";
  if (f.subject) return "topic";
  if (f.paper) return "subject";
  if (f.exam || f.year) return "subject";
  return "exam";
}

// The choices for each filter (within the other filters), with counts.
export function facets(
  rows: BankRow[],
  papers: BankPaper[],
  f: BankFilter,
): Record<Dimension, { value: string; n: number }[]> {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const out = {} as Record<Dimension, { value: string; n: number }[]>;
  for (const d of DIMENSIONS) {
    const others = { ...f, [d.key]: "" };
    const m = new Map<string, number>();
    for (const r of filterRows(rows, papers, others)) {
      const v = valueOf(r, byId, d.key);
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    out[d.key] = [...m]
      .map(([value, n]) => ({ value, n }))
      .sort((a, b) =>
        d.key === "year" ? b.value.localeCompare(a.value) : a.value.localeCompare(b.value),
      );
  }
  return out;
}

// A paper's year: from its date, else from its name.
export const yearOf = (date: string | null, name: string) =>
  date?.slice(0, 4) || /\b(19|20)\d{2}\b/.exec(name)?.[0] || "";
