// The question bank: every objective paper's questions together, filtered
// by exam, year, paper, subject, topic, subtopic, section, difficulty and
// proofreading state, with a progress report for whatever is filtered and a
// breakdown (subject → topic → subtopic), so a subject, topic, year or
// paper can be finished first. "Proofread these" opens the one-by-one cards
// on the filtered questions across papers.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Search, X } from "lucide-react";
import {
  examBankQuestions,
  examQuestionBank,
  explainExamPaper,
  reviewExamPaper,
} from "@/lib/exam-papers.functions";
import {
  breakdown,
  DIMENSIONS,
  facets,
  filterRows,
  nextDimension,
  pct,
  report,
  STATUSES,
  type BankFilter,
  type BankPaper,
  type BankRow,
  type Dimension,
  type Report,
  type Status,
} from "@/lib/exam-bank";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProofCards } from "@/components/exam-papers-panel";

const LIST_SIZE = 60;

export function useBank() {
  const fn = useServerFn(examQuestionBank);
  return useQuery({ queryKey: ["examBank"], queryFn: () => fn(), refetchOnMount: true });
}
// At most this many questions in one proofreading run.
const CARDS_MAX = 300;

export function QuestionBank({
  onOpen,
  filter: f,
  onFilter: setF,
}: {
  onOpen: (paperId: string) => void;
  // Kept by the page, so the overview can open the bank filtered.
  filter: BankFilter;
  onFilter: (f: BankFilter) => void;
}) {
  const qc = useQueryClient();
  const q = useBank();
  const [group, setGroup] = useState<Dimension | "">("");
  const [cards, setCards] = useState<string[] | null>(null);
  const papers = useMemo(() => q.data?.papers ?? [], [q.data]);
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);
  const shown = useMemo(() => filterRows(rows, papers, f), [rows, papers, f]);
  const choices = useMemo(() => facets(rows, papers, f), [rows, papers, f]);
  const by = group || nextDimension(f);
  const groups = useMemo(() => breakdown(shown, papers, by), [shown, papers, by]);
  const r = report(shown);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (q.data && !q.data.ready)
    return <p className="text-sm text-muted-foreground">Exam papers need the database update.</p>;

  const names = q.data?.sectionNames ?? {};
  const label = (d: Dimension, v: string) =>
    !v
      ? "(not set)"
      : d === "paper"
        ? (byId.get(v)?.exam ?? v)
        : d === "section"
          ? (names[v] ?? v)
          : v;
  const set = (patch: BankFilter) => setF({ ...f, ...patch });
  const any = Object.values(f).some(Boolean);
  // To proofread: the filtered questions not finished, from draft papers.
  const todo = shown.filter((x) => !x.deleted && !x.done && !byId.get(x.paper)?.published);

  return (
    <div className="space-y-4" data-question-bank>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2" aria-label="Filters">
          {DIMENSIONS.map((d) => (
            <select
              key={d.key}
              aria-label={`Filter by ${d.label.toLowerCase()}`}
              value={f[d.key] ?? ""}
              onChange={(e) => set({ [d.key]: e.target.value })}
              className={`h-8 max-w-[14rem] rounded-md border bg-background px-2 text-xs ${f[d.key] ? "border-primary" : "border-input"}`}
            >
              <option value="">{d.all}</option>
              {choices[d.key].map((c) => (
                <option key={c.value} value={c.value}>
                  {label(d.key, c.value).slice(0, 60)} ({c.n})
                </option>
              ))}
            </select>
          ))}
          <select
            aria-label="Filter by state"
            value={f.status ?? ""}
            onChange={(e) => set({ status: e.target.value as Status })}
            className={`h-8 rounded-md border bg-background px-2 text-xs ${f.status ? "border-primary" : "border-input"}`}
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Search questions"
              placeholder="Search"
              value={f.search ?? ""}
              onChange={(e) => set({ search: e.target.value })}
              className="h-8 w-40 pl-7 text-xs"
            />
          </div>
          {any && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setF({});
                setGroup("");
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        <ReportLine r={r} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!todo.length}
            onClick={() => setCards(todo.slice(0, CARDS_MAX).map((x) => x.id))}
          >
            <BadgeCheck className="mr-1 h-4 w-4" /> Proofread these ({todo.length})
          </Button>
          {todo.length > CARDS_MAX && (
            <span className="text-xs text-muted-foreground">The first {CARDS_MAX} at a time.</span>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Progress by</h3>
          <select
            aria-label="Progress by"
            value={by}
            onChange={(e) => setGroup(e.target.value as Dimension)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {DIMENSIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">Click a row to filter by it.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-breakdown={by}>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">{DIMENSIONS.find((d) => d.key === by)?.label}</th>
                <th className="px-2">Questions</th>
                <th className="px-2">① Question</th>
                <th className="px-2">② Answer</th>
                <th className="px-2">③ Explanation</th>
                <th className="w-48 px-2">Finished</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr
                  key={g.value}
                  data-row={g.value}
                  className="cursor-pointer border-t border-border hover:bg-muted/50"
                  onClick={() => {
                    if (g.value) set({ [by]: g.value });
                    setGroup("");
                  }}
                >
                  <td className="max-w-[20rem] truncate py-1.5 pr-2">{label(by, g.value)}</td>
                  <td className="px-2 tabular-nums">{g.report.questions}</td>
                  <td className="px-2 tabular-nums">{pct(g.report.q, g.report.questions)}%</td>
                  <td className="px-2 tabular-nums">{pct(g.report.a, g.report.questions)}%</td>
                  <td className="px-2 tabular-nums">
                    {g.report.explained ? `${pct(g.report.e, g.report.explained)}%` : "—"}
                  </td>
                  <td className="px-2">
                    <Bar n={g.report.done} of={g.report.questions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">
          Questions{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {shown.length > LIST_SIZE ? `first ${LIST_SIZE} of ${shown.length}` : shown.length}
          </span>
        </h3>
        <ul className="divide-y divide-border text-sm" data-bank-list>
          {shown.slice(0, LIST_SIZE).map((x) => (
            <BankItem key={x.id} r={x} p={byId.get(x.paper)} onOpen={() => onOpen(x.paper)} />
          ))}
        </ul>
      </section>

      {cards && (
        <BankCards
          ids={cards}
          rows={rows}
          onClose={() => {
            setCards(null);
            void qc.invalidateQueries({ queryKey: ["examBank"] });
          }}
        />
      )}
    </div>
  );
}

function ReportLine({ r }: { r: Report }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-report>
      <span className="font-semibold">{r.questions} questions</span>
      <span>
        ① {r.q} ({pct(r.q, r.questions)}%)
      </span>
      <span>
        ② {r.a} ({pct(r.a, r.questions)}%)
      </span>
      <span>
        ③ {r.e} of {r.explained} explained
      </span>
      <span className="font-medium text-emerald-700 dark:text-emerald-300">
        Finished {r.done} ({pct(r.done, r.questions)}%)
      </span>
      {r.noexpl > 0 && (
        <span className="text-amber-700 dark:text-amber-400">{r.noexpl} need an explanation</span>
      )}
      <span className="text-muted-foreground">
        Tagged {r.tagged} ({pct(r.tagged, r.questions)}%)
      </span>
      <span className="w-48">
        <Bar n={r.done} of={r.questions} />
      </span>
    </div>
  );
}

function Bar({ n, of }: { n: number; of: number }) {
  const p = pct(n, of);
  return (
    <span className="flex items-center gap-2" title={`${n} of ${of}`}>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full ${p === 100 ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${p}%` }}
        />
      </span>
      <span className="w-9 text-right text-xs tabular-nums">{p}%</span>
    </span>
  );
}

function BankItem({ r, p, onOpen }: { r: BankRow; p?: BankPaper; onOpen: () => void }) {
  const mark = (on: boolean, applies = true) => (!applies ? "–" : on ? "✓" : "·");
  return (
    <li className={`flex flex-wrap items-baseline gap-2 py-1.5 ${r.deleted ? "opacity-60" : ""}`}>
      <button type="button" onClick={onOpen} className="shrink-0 text-xs text-primary underline">
        {p?.exam ?? "?"} · Q{r.n}
      </button>
      <span className="min-w-0 flex-1 truncate">{r.text || "—"}</span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground" title="① ② ③">
        {mark(r.q)}
        {mark(r.a)}
        {mark(r.e, r.x)}
      </span>
      {r.done && (
        <span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-300">Finished</span>
      )}
      {(r.subject || r.topic) && (
        <span className="basis-full truncate text-xs text-muted-foreground">
          {[r.subject, r.topic, r.subtopic].filter(Boolean).join(" › ")}
        </span>
      )}
    </li>
  );
}

// The one-by-one cards over questions from several papers.
function BankCards({
  ids,
  rows,
  onClose,
}: {
  ids: string[];
  rows: BankRow[];
  onClose: () => void;
}) {
  const fn = useServerFn(examBankQuestions);
  const explainFn = useServerFn(explainExamPaper);
  const reviewFn = useServerFn(reviewExamPaper);
  const q = useQuery({ queryKey: ["examBankCards", ids], queryFn: () => fn({ data: { ids } }) });
  const [busy, setBusy] = useState(false);
  const paperOf = (id: string) => rows.find((r) => r.id === id)?.paper ?? "";
  const run = async (what: "explain" | "check", id: string) => {
    setBusy(true);
    try {
      const data = { id: paperOf(id), redo: [id] };
      await (what === "explain" ? explainFn({ data }) : reviewFn({ data }));
      toast.success(what === "explain" ? "Explanation written again" : "Checked again");
      await q.refetch();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(false);
    }
  };
  if (!q.data)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 text-sm">
        {q.error ? errorText(q.error, "Couldn't load") : "Loading the questions…"}
      </div>
    );
  return (
    <ProofCards
      questions={q.data}
      lang="both"
      locked={false}
      busy={busy}
      onRedo={(id) => run("explain", id)}
      onRecheck={(id) => run("check", id)}
      onClose={onClose}
      onChanged={() => q.refetch()}
    />
  );
}
