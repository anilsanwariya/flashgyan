// Admin: the monthly's practice set (25 questions in RPSC/RSSB styles) and
// "Month in One-liners", made from the month's stories, checked and edited
// before the monthly issue prints them.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ListChecks, Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  getCaPractice,
  replaceCaPracticeQ,
  saveCaOneliners,
  saveCaPractice,
  stepCaOneliners,
  stepCaPractice,
} from "@/lib/ca-practice.functions";
import {
  PRACTICE_PARTS,
  PRACTICE_SIZE,
  STYLE_LABEL,
  type OneLiner,
  type PracticeQ,
} from "@/lib/ca-practice";
import { CATEGORIES } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SECTION_NAME = new Map<string, string>(CATEGORIES.map((c) => [c.id, c.en]));

export function PracticeBox({ month }: { month: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaPractice);
  const stepFn = useServerFn(stepCaPractice);
  const replaceFn = useServerFn(replaceCaPracticeQ);
  const saveFn = useServerFn(saveCaPractice);
  const lineFn = useServerFn(stepCaOneliners);
  const saveLinesFn = useServerFn(saveCaOneliners);
  const key = ["caPractice", month.slice(0, 7)];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getFn({ data: { month } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<"set" | "lines" | null>(null);
  const stop = useRef(false);
  const set = q.data?.practice ?? null;
  const lines = q.data?.oneliners ?? null;
  const put = (patch: Partial<NonNullable<typeof q.data>>) =>
    qc.setQueryData(key, { ...(q.data ?? { practice: null, oneliners: null }), ...patch });

  async function makeSet() {
    stop.current = false;
    try {
      let last = set;
      for (let part = 0; part < PRACTICE_PARTS.length && !stop.current; part++) {
        setBusy(`Writing the practice set: part ${part + 1} of ${PRACTICE_PARTS.length}…`);
        last = await stepFn({ data: { month, part } });
        put({ practice: last });
      }
      toast.success(`Practice set ready: ${last?.questions.length ?? 0} questions`);
      setOpen("set");
    } catch (e) {
      toast.error(errorText(e, "Couldn't write the practice set"));
    } finally {
      setBusy(null);
    }
  }

  async function makeLines() {
    stop.current = false;
    try {
      let offset: number | null = 0;
      let total = 0;
      while (offset !== null && !stop.current) {
        setBusy(
          `Writing one-liners… ${total ? `${Math.min(offset, total)} of ${total} stories` : ""}`,
        );
        const r: Awaited<ReturnType<typeof lineFn>> = await lineFn({ data: { month, offset } });
        put({ oneliners: r.list });
        total = r.total;
        offset = r.next;
      }
      toast.success("One-liners ready");
      setOpen("lines");
    } catch (e) {
      toast.error(errorText(e, "Couldn't write the one-liners"));
    } finally {
      setBusy(null);
    }
  }

  async function saveSet(questions: PracticeQ[] | null, ok: string) {
    try {
      const saved = await saveFn({
        data: { month, set: questions ? { made_at: set?.made_at, questions } : null },
      });
      put({ practice: saved });
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }

  async function saveLines(list: OneLiner[] | null, ok: string) {
    try {
      const saved = await saveLinesFn({
        data: { month, list: list ? { made_at: lines?.made_at, lines: list } : null },
      });
      put({ oneliners: saved });
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }

  return (
    <section
      aria-label="Practice set and one-liners"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">Practice set &amp; one-liners</h3>
        <p className="text-sm text-muted-foreground">
          For the monthly issue: {PRACTICE_SIZE} questions in RPSC/RSSB styles (statements, match
          the following, assertion–reason, chronology, odd one out, direct) with an answer key, and
          “Month in One-liners” to revise from. Made only from this month's stories; check them
          before making the PDF.
        </p>
      </div>
      {busy && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-primary" role="status">
          <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
          <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
            Stop
          </Button>
        </p>
      )}

      {/* Practice set */}
      <div className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            aria-expanded={open === "set"}
            disabled={!set}
            onClick={() => setOpen(open === "set" ? null : "set")}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
          >
            {open === "set" ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Practice set
            {set ? (
              <Badge tone={set.questions.length >= PRACTICE_SIZE - 3 ? "good" : "warn"}>
                {set.questions.length} questions
              </Badge>
            ) : (
              <Badge tone="muted">Not made</Badge>
            )}
          </button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void makeSet()}>
            <ListChecks className="mr-1 h-4 w-4" /> {set ? "Make again" : "Make practice set"}
          </Button>
          {set && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              aria-label="Take the practice set out"
              onClick={() =>
                confirm("Take the practice set out of this month's issue?") &&
                void saveSet(null, "Practice set taken out")
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {open === "set" && set && (
          <ol className="space-y-2 border-t border-border p-3" data-testid="practice-set">
            {set.questions.map((qn, i) => (
              <PracticeCard
                key={`${i}-${qn.question.en.slice(0, 20)}`}
                n={i + 1}
                q={qn}
                busy={!!busy}
                onDelete={() =>
                  void saveSet(
                    set.questions.filter((_, k) => k !== i),
                    `Question ${i + 1} taken out`,
                  )
                }
                onSave={(next) =>
                  saveSet(
                    set.questions.map((x, k) => (k === i ? next : x)),
                    `Question ${i + 1} saved`,
                  )
                }
                onReplace={async () => {
                  setBusy(`Writing another ${STYLE_LABEL[qn.style].toLowerCase()} question…`);
                  try {
                    put({ practice: await replaceFn({ data: { month, index: i } }) });
                    toast.success(`Question ${i + 1} replaced`);
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't replace it"));
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            ))}
          </ol>
        )}
      </div>

      {/* One-liners */}
      <div className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            aria-expanded={open === "lines"}
            disabled={!lines}
            onClick={() => setOpen(open === "lines" ? null : "lines")}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
          >
            {open === "lines" ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Month in One-liners
            {lines ? (
              <Badge tone="good">
                {lines.lines.length} line{lines.lines.length === 1 ? "" : "s"}
              </Badge>
            ) : (
              <Badge tone="muted">Not made</Badge>
            )}
          </button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void makeLines()}>
            <ListChecks className="mr-1 h-4 w-4" /> {lines ? "Make again" : "Make one-liners"}
          </Button>
          {lines && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              aria-label="Take the one-liners out"
              onClick={() =>
                confirm("Take the one-liners out of this month's issue?") &&
                void saveLines(null, "One-liners taken out")
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {open === "lines" && lines && (
          <div className="space-y-3 border-t border-border p-3" data-testid="oneliners">
            {[...new Set(lines.lines.map((l) => l.section))].map((sec) => (
              <div key={sec} className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                  {SECTION_NAME.get(sec) ?? sec}
                </h4>
                <ul className="space-y-1">
                  {lines.lines.map((l, i) =>
                    l.section === sec ? (
                      <LineRow
                        key={i}
                        line={l}
                        busy={!!busy}
                        onSave={(text) =>
                          saveLines(
                            lines.lines.map((x, k) => (k === i ? { ...x, text } : x)),
                            "Saved",
                          )
                        }
                        onDelete={() =>
                          void saveLines(
                            lines.lines.filter((_, k) => k !== i),
                            "Line taken out",
                          )
                        }
                      />
                    ) : null,
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PracticeCard({
  n,
  q,
  busy,
  onDelete,
  onSave,
  onReplace,
}: {
  n: number;
  q: PracticeQ;
  busy: boolean;
  onDelete: () => void;
  onSave: (q: PracticeQ) => Promise<void>;
  onReplace: () => Promise<void>;
}) {
  const [edit, setEdit] = useState<PracticeQ | null>(null);
  if (edit) {
    const text = (k: "question" | "extra" | "explanation", l: "en" | "hi", rows = 2) => (
      <Textarea
        aria-label={`${k} (${l === "en" ? "English" : "Hindi"})`}
        rows={rows}
        value={edit[k][l]}
        onChange={(e) => setEdit({ ...edit, [k]: { ...edit[k], [l]: e.target.value } })}
      />
    );
    return (
      <li
        className="space-y-2 rounded-xl border border-primary/50 p-3 text-sm"
        aria-label={`Edit question ${n}`}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {text("question", "en")}
          {text("question", "hi")}
          {text("extra", "en", 3)}
          {text("extra", "hi", 3)}
          {edit.options.map((o, i) => (
            <div key={i} className="contents">
              <Input
                aria-label={`Option ${i + 1} (English)`}
                value={o.en}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    options: edit.options.map((x, k) =>
                      k === i ? { ...x, en: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label={`Option ${i + 1} (Hindi)`}
                value={o.hi}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    options: edit.options.map((x, k) =>
                      k === i ? { ...x, hi: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
          {text("explanation", "en")}
          {text("explanation", "hi")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Correct option"
            value={edit.answer}
            onChange={(e) => setEdit({ ...edit, answer: Number(e.target.value) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={i}>
                Correct: option {i + 1}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void onSave(edit).then(() => setEdit(null))}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="space-y-1.5 rounded-xl border border-border p-3 text-sm" data-question={n}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{n}.</span>
        <Badge tone="primary">{STYLE_LABEL[q.style]}</Badge>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            aria-label={`Edit question ${n}`}
            disabled={busy}
            onClick={() => setEdit(q)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            aria-label={`Another question instead of ${n}`}
            disabled={busy}
            onClick={() => void onReplace()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            aria-label={`Take out question ${n}`}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="break-words">{q.question.en}</p>
      {q.extra.en && (
        <p className="whitespace-pre-line break-words rounded-md bg-muted/50 px-2 py-1 text-muted-foreground">
          {q.extra.en}
        </p>
      )}
      <ol className="grid gap-x-4 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <li
            key={i}
            className={i === q.answer ? "font-semibold text-green-700 dark:text-green-400" : ""}
          >
            ({i + 1}) {o.en}
          </li>
        ))}
      </ol>
      {q.explanation.en && <p className="text-xs text-muted-foreground">{q.explanation.en}</p>}
    </li>
  );
}

function LineRow({
  line,
  busy,
  onSave,
  onDelete,
}: {
  line: OneLiner;
  busy: boolean;
  onSave: (text: OneLiner["text"]) => Promise<void>;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState<OneLiner["text"] | null>(null);
  if (edit)
    return (
      <li className="space-y-1.5 rounded-lg border border-primary/50 p-2">
        <Input
          aria-label="One-liner (English)"
          value={edit.en}
          onChange={(e) => setEdit({ ...edit, en: e.target.value })}
        />
        <Input
          aria-label="One-liner (Hindi)"
          value={edit.hi}
          onChange={(e) => setEdit({ ...edit, hi: e.target.value })}
        />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            disabled={busy || !edit.en.trim()}
            onClick={() => void onSave(edit).then(() => setEdit(null))}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="min-w-0 flex-1 break-words">
        {line.text.en}
        <span className="block text-xs text-muted-foreground" lang="hi">
          {line.text.hi}
        </span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Edit: ${line.text.en}`}
        disabled={busy}
        onClick={() => setEdit(line.text)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Take out: ${line.text.en}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
