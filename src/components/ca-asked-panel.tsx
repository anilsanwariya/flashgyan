// Admin: past exam questions on a story ("Asked before", in the story editor,
// where a wrong one is taken off) and the month's coverage meter (stories per
// section against how often exams ask each section).
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, RefreshCw, X } from "lucide-react";
import {
  getCaAsked,
  getCaCoverage,
  hideCaAsked,
  recheckCaAsked,
  sortCaQuestionSections,
  stepCaAsked,
} from "@/lib/ca-asked.functions";
import { askedLine, COVERAGE_MIN_QUESTIONS } from "@/lib/ca-asked";
import { CATEGORIES } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

// ---------- In the story editor ----------

export function AskedChip({ itemId, disabled }: { itemId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaAsked);
  const hideFn = useServerFn(hideCaAsked);
  const q = useQuery({
    queryKey: ["caAsked", itemId],
    queryFn: () => getFn({ data: { item_id: itemId } }),
    refetchOnMount: true,
  });
  const [open, setOpen] = useState(false);
  const asked = q.data ?? [];
  if (!asked.length) return null;
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300"
      >
        <History className="h-3 w-3" /> Asked before ×{asked.length}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Asked before"
          className="absolute left-0 top-full z-30 mt-1 w-[min(90vw,26rem)] space-y-2 rounded-xl border border-border bg-popover p-3 text-sm shadow-lg"
        >
          <p className="text-xs text-muted-foreground">
            Past exam questions on this story's topic. The first two print under the story. Take off
            one that isn't really about it.
          </p>
          <ul className="space-y-1.5">
            {asked.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span className="min-w-0 flex-1 break-words">{askedLine(a, "en")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 p-0"
                  aria-label={`Not about this story: ${a.exam} Q ${a.q_no}`}
                  disabled={disabled}
                  onClick={() =>
                    void hideFn({ data: { item_id: itemId, question_id: a.id } })
                      .then((next) => {
                        qc.setQueryData(["caAsked", itemId], next);
                        toast.success("Taken off this story");
                      })
                      .catch((e) => toast.error(errorText(e, "Couldn't take it off")))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

// ---------- On the Monthly page ----------

const SECTION_NAME = new Map<string, string>(CATEGORIES.map((c) => [c.id, c.en]));
const TONE = { low: "bad", ok: "good", high: "warn" } as const;
const STATUS_TEXT = { low: "Too few", ok: "Fine", high: "Many" } as const;

export function CoverageMeter({ month }: { month: string }) {
  const qc = useQueryClient();
  const coverFn = useServerFn(getCaCoverage);
  const sortFn = useServerFn(sortCaQuestionSections);
  const stepFn = useServerFn(stepCaAsked);
  const recheckFn = useServerFn(recheckCaAsked);
  const [body, setBody] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["caCoverage", month, body],
    queryFn: () => coverFn({ data: { month, body } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["caCoverage", month] });

  async function sortAll() {
    stop.current = false;
    setBusy("Sorting the questions into sections…");
    try {
      for (let i = 0; i < 100 && !stop.current; i++) {
        const r = await sortFn();
        if (!r.sorted) break;
      }
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Sorting stopped"));
    } finally {
      setBusy(null);
    }
  }

  async function link(again: boolean) {
    stop.current = false;
    setBusy("Finding past questions for the month's stories…");
    let linked = 0;
    try {
      if (again) await recheckFn({ data: { month } });
      for (let i = 0; i < 200 && !stop.current; i++) {
        const r = await stepFn({ data: { month } });
        linked += r.linked;
        setBusy(`Finding past questions… ${r.left} stories left`);
        if (!r.left || !r.checked) break;
      }
      toast.success(
        linked
          ? `${linked} stor${linked === 1 ? "y" : "ies"} linked to past questions`
          : "No new links found",
      );
      await qc.invalidateQueries({ queryKey: ["caAsked"] });
    } catch (e) {
      toast.error(errorText(e, "Linking stopped"));
    } finally {
      setBusy(null);
    }
  }

  const data = q.data;
  return (
    <section
      aria-label="Exam coverage"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Exam coverage</h3>
          <p className="text-sm text-muted-foreground">
            This month's stories per section against how often the saved exam papers ask current
            affairs from it. Stories also show past questions on their topic (“Asked before”).
          </p>
        </div>
        {!!data?.bodies.length && (
          <select
            aria-label="Exams"
            value={body ?? ""}
            onChange={(e) => setBody(e.target.value || null)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All exams</option>
            <option value="__weighted">Weighted by your exams</option>
            {data.bodies.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>
      ) : !data?.ready ? (
        <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
          Exam coverage needs a database update: run the latest migration (ca_asked_before) in
          Lovable or the SQL editor, then reload this page.
        </p>
      ) : !data.papers ? (
        <p className="text-sm text-muted-foreground">
          Add exam papers (Current affairs → Exam papers) and check them against the magazine to see
          coverage.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="primary">
              {data.papers} paper{data.papers === 1 ? "" : "s"}
            </Badge>
            <Badge>{data.questions} current affairs questions</Badge>
            {data.unsorted > 0 && (
              <>
                <Badge tone="warn">{data.unsorted} not sorted into sections</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void sortAll()}
                >
                  Sort them
                </Button>
              </>
            )}
          </div>
          {data.questions < COVERAGE_MIN_QUESTIONS && (
            <p className="text-xs text-muted-foreground">
              With fewer than {COVERAGE_MIN_QUESTIONS} current affairs questions the shares are only
              a rough guide: add more papers.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="coverage">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Section</th>
                  <th className="py-1 pr-2 text-right font-medium">Our stories</th>
                  <th className="py-1 pr-2 text-right font-medium">Asked in exams</th>
                  <th className="py-1 pr-2 text-right font-medium">At that share</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.section} className="border-t border-border" data-section={r.section}>
                    <td className="py-1.5 pr-2">{SECTION_NAME.get(r.section) ?? r.section}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.stories}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {r.share}% <span className="text-xs text-muted-foreground">({r.asked})</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.expected}</td>
                    <td className="py-1.5">
                      <Badge tone={TONE[r.status]}>{STATUS_TEXT[r.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm text-primary" role="status">
              <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
            </span>
            <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => void link(false)}>
              <History className="mr-1 h-4 w-4" /> Find past questions for this month
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void link(true)}>
              Check again (after adding papers)
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
