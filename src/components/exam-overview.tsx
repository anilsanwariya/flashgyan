// The exam papers overview: how far proofreading has got, in all and by
// year, exam and subject. Each table's cell is a completion % (coloured), and
// clicking one opens the question bank on those questions.
import { useMemo, useState } from "react";
import {
  band,
  cellKey,
  DIMENSIONS,
  matrix,
  pct,
  report,
  type BankFilter,
  type BankPaper,
  type Dimension,
  type Report,
} from "@/lib/exam-bank";
import { errorText } from "@/components/ca-ui";
import { useBank } from "@/components/exam-bank";

const BAND: Record<string, string> = {
  none: "text-muted-foreground",
  zero: "bg-red-500/10 text-red-800 dark:text-red-300",
  some: "bg-amber-500/15 text-amber-900 dark:text-amber-300",
  half: "bg-sky-500/15 text-sky-900 dark:text-sky-300",
  done: "bg-emerald-500/20 text-emerald-900 dark:text-emerald-300",
};

export function ExamOverview({ onFilter }: { onFilter: (f: BankFilter) => void }) {
  const q = useBank();
  const [exam, setExam] = useState("");
  const papers = useMemo(() => q.data?.papers ?? [], [q.data]);
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const all = useMemo(() => report(rows), [rows]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No questions yet: add a paper first.
      </p>
    );
  const exams = [...new Set(papers.map((p) => p.examName))].sort();
  const examRows = exam
    ? rows.filter((r) => papers.find((p) => p.id === r.paper)?.examName === exam)
    : rows;
  const published = papers.filter((p) => p.published).length;
  const names = q.data?.sectionNames ?? {};
  return (
    <div className="space-y-4" data-exam-overview>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="In all">
        <Tile label="Papers" value={`${papers.length}`} note={`${published} published`} />
        <Tile
          label="Questions finished"
          value={`${pct(all.done, all.questions)}%`}
          note={`${all.done} of ${all.questions}`}
          bar={pct(all.done, all.questions)}
        />
        <Tile
          label="Checks"
          value={`① ${pct(all.q, all.questions)}% · ② ${pct(all.a, all.questions)}%`}
          note={`③ ${all.e} of ${all.explained} explained`}
        />
        <Tile
          label="Tagged on the syllabus"
          value={`${pct(all.tagged, all.questions)}%`}
          note={all.noexpl ? `${all.noexpl} finished, need an explanation` : "—"}
        />
      </section>
      <Legend />
      <Table
        title="By exam and year"
        m={matrix(rows, papers, "exam", "year")}
        rowDim="exam"
        colDim="year"
        papers={papers}
        names={names}
        onFilter={onFilter}
      />
      <Table
        title="By exam and subject"
        m={matrix(rows, papers, "exam", "subject")}
        rowDim="exam"
        colDim="subject"
        papers={papers}
        names={names}
        onFilter={onFilter}
      />
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">By subject and topic</h3>
          <select
            aria-label="Exam for subjects and topics"
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All exams</option>
            {exams.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <Table
          m={matrix(examRows, papers, "subject", "topic", 10)}
          rowDim="subject"
          colDim="topic"
          papers={papers}
          names={names}
          base={exam ? { exam } : {}}
          onFilter={onFilter}
        />
      </section>
      <Table
        title="By paper"
        m={matrix(rows, papers, "paper", "section", 6)}
        rowDim="paper"
        colDim="section"
        papers={papers}
        names={names}
        onFilter={onFilter}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  bar,
}: {
  label: string;
  value: string;
  note: string;
  bar?: number;
}) {
  return (
    <div className="space-y-1 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {bar !== undefined && (
        <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full bg-primary" style={{ width: `${bar}%` }} />
        </span>
      )}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-2 text-xs" aria-label="Colours">
      {(
        [
          ["zero", "Nothing finished"],
          ["some", "Under half"],
          ["half", "Half or more"],
          ["done", "All finished"],
        ] as const
      ).map(([b, label]) => (
        <span key={b} className={`rounded px-1.5 py-0.5 ${BAND[b]}`}>
          {label}
        </span>
      ))}
      <span className="text-muted-foreground">
        Each cell: finished % (questions). Click it to open those questions in the bank.
      </span>
    </p>
  );
}

function Table({
  title,
  m,
  rowDim,
  colDim,
  papers,
  names = {},
  base = {},
  onFilter,
}: {
  title?: string;
  m: ReturnType<typeof matrix>;
  rowDim: Dimension;
  colDim: Dimension;
  papers: BankPaper[];
  names?: Record<string, string>;
  base?: BankFilter;
  onFilter: (f: BankFilter) => void;
}) {
  const name = (d: Dimension, v: string) =>
    !v
      ? "(not set)"
      : d === "paper"
        ? (papers.find((p) => p.id === v)?.exam ?? v)
        : d === "section"
          ? (names[v] ?? v)
          : v;
  const label = (d: Dimension) => DIMENSIONS.find((x) => x.key === d)?.label ?? d;
  const open = (row: string, col: string) =>
    onFilter({ ...base, ...(row ? { [rowDim]: row } : {}), ...(col ? { [colDim]: col } : {}) });
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      {title && <h3 className="font-semibold">{title}</h3>}
      <div className="overflow-x-auto">
        <table
          className="w-full border-separate border-spacing-1 text-xs"
          data-matrix={`${rowDim}-${colDim}`}
        >
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-1 font-medium">{label(rowDim)}</th>
              {m.cols.map((c) => (
                <th
                  key={c}
                  className="max-w-[9rem] truncate px-1 font-medium"
                  title={name(colDim, c)}
                >
                  {name(colDim, c)}
                </th>
              ))}
              <th className="px-1 font-medium">All</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r}>
                <th
                  className="max-w-[14rem] truncate px-1 text-left font-medium"
                  title={name(rowDim, r)}
                >
                  {name(rowDim, r)}
                </th>
                {m.cols.map((c) => (
                  <Cell
                    key={c}
                    r={m.cells.get(cellKey(r, c))}
                    label={`${name(rowDim, r)} · ${name(colDim, c)}`}
                    onClick={() => open(r, c)}
                  />
                ))}
                <Cell
                  r={m.cells.get(cellKey(r, ""))}
                  label={`${name(rowDim, r)} · all`}
                  strong
                  onClick={() => open(r, "")}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({
  r,
  label,
  strong,
  onClick,
}: {
  r: Report | undefined;
  label: string;
  strong?: boolean;
  onClick: () => void;
}) {
  if (!r?.questions) return <td className="px-1 text-center text-muted-foreground">·</td>;
  return (
    <td className="p-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}: ${pct(r.done, r.questions)}% finished of ${r.questions}`}
        title={`① ${r.q} · ② ${r.a} · ③ ${r.e}/${r.explained} · finished ${r.done} of ${r.questions}`}
        className={`w-full rounded px-1.5 py-1 text-center tabular-nums ${BAND[band(r)]} ${strong ? "font-semibold" : ""}`}
        data-band={band(r)}
      >
        {pct(r.done, r.questions)}% <span className="text-[10px] opacity-70">({r.questions})</span>
      </button>
    </td>
  );
}
