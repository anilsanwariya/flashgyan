// Admin: SAATHI answer writing for RAS Mains. Upload model answers, see the
// blueprints SAATHI learns from them, try questions and score held-out answers.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  History,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  activateBlueprint,
  adminListAnswerFormats,
  createBlueprint,
  deleteAnswerFormat,
  deleteModelAnswer,
  editBlueprintGuide,
  listBlueprintScores,
  listBlueprints,
  listModelAnswers,
  previewMainsAnswer,
  reanalyseModelAnswer,
  rebuildSaathiBlueprints,
  retireBlueprint,
  saveAnswerFormat,
  saveModelAnswer,
  scoreModelAnswer,
  setBlueprintLocked,
  type AnswerFormat,
  type BlueprintScore,
  type BlueprintWithScore,
  type ModelAnswer,
  type RebuildResult,
  type WrittenAnswer,
} from "@/lib/saathi-mains.functions";
import {
  DIRECTIVE_LABELS,
  MAINS_DIRECTIVES,
  blueprintConfidence,
  countWords,
  type BlueprintDirective,
  type MainsDirective,
} from "../../supabase/functions/_shared/saathi-mains.ts";
import {
  MODEL_ANSWER_TEMPLATE,
  parseModelAnswers,
  type ParsedModelAnswer,
} from "@/lib/saathi-mains-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Tab = "answers" | "blueprints" | "try" | "scores" | "limits";

const TABS: { id: Tab; label: string }[] = [
  { id: "answers", label: "Model answers" },
  { id: "blueprints", label: "Blueprints" },
  { id: "try", label: "Try a question" },
  { id: "scores", label: "Scores" },
  { id: "limits", label: "Word limits" },
];

const AUTO = "__auto__";
const ALL = "__all__";

// 10 marks is the most common RAS Mains band, so it is the default choice.
const preferredMarks = (formats: AnswerFormat[]) =>
  String(formats.find((f) => f.marks === 10)?.marks ?? formats[0]?.marks ?? 10);

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function rebuildSummary(results: RebuildResult[]): string | null {
  const created = results.filter((r) => r.outcome === "created");
  const drafts = results.filter((r) => r.outcome === "draft");
  const parts: string[] = [];
  if (created.length) {
    parts.push(
      `Updated ${created.map((r) => `${r.marks}-mark ${DIRECTIVE_LABELS[r.directive]}`).join(", ")}`,
    );
  }
  if (drafts.length) {
    parts.push(
      `${drafts.length} new draft${drafts.length > 1 ? "s" : ""} to review (locked blueprints)`,
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["saathiModelAnswers"] });
    qc.invalidateQueries({ queryKey: ["saathiBlueprints"] });
  };
}

export function SaathiAnswersPanel() {
  const [tab, setTab] = useState<Tab>("answers");
  const formatsFn = useServerFn(adminListAnswerFormats);
  const formatsQ = useQuery({ queryKey: ["saathiAnswerFormats"], queryFn: () => formatsFn() });
  const formats = formatsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Add RAS Mains questions with model answers. SAATHI studies how each answer is built
        (introduction, points, Rajasthan examples, conclusion, length) and combines them into a{" "}
        <b className="text-foreground">blueprint</b> for each marks band and question type. Students
        then get answers that follow the blueprint, with facts only from the knowledge base. Every
        answer you add improves the blueprint.
      </div>

      <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {formatsQ.error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Couldn't load answer writing: {errorText(formatsQ.error, "unknown error")}. If this is a
          new feature on your database, run the latest migration
          (20261016030000_saathi_answer_blueprints.sql) in the Supabase SQL editor.
        </div>
      ) : tab === "answers" ? (
        <ModelAnswersTab formats={formats} />
      ) : tab === "blueprints" ? (
        <BlueprintsTab formats={formats} />
      ) : tab === "try" ? (
        <TryTab formats={formats} />
      ) : tab === "scores" ? (
        <ScoresTab />
      ) : (
        <LimitsTab formats={formats} />
      )}
    </div>
  );
}

function MarksSelect({
  formats,
  value,
  onChange,
  allowAll,
  allowAuto,
}: {
  formats: AnswerFormat[];
  value: string;
  onChange: (v: string) => void;
  allowAll?: boolean;
  allowAuto?: boolean;
}) {
  const options = formats.map((f) => f.marks);
  if (value && /^\d+$/.test(value) && !options.includes(Number(value))) options.push(Number(value));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Marks" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>All marks</SelectItem>}
        {allowAuto && <SelectItem value={AUTO}>From the question</SelectItem>}
        {options
          .sort((a, b) => a - b)
          .map((m) => {
            const f = formats.find((x) => x.marks === m);
            return (
              <SelectItem key={m} value={String(m)}>
                {m} marks{f ? ` · ${f.word_limit} words` : ""}
              </SelectItem>
            );
          })}
      </SelectContent>
    </Select>
  );
}

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "warn" | "good";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ====================== Model answers ======================

type Draft = {
  id?: string;
  question: string;
  answer: string;
  marks: string;
  directive: string;
  year: string;
  paper: string;
  subject: string;
  source: string;
  holdout: boolean;
};

const emptyDraft = (marks = "10"): Draft => ({
  question: "",
  answer: "",
  marks,
  directive: AUTO,
  year: "",
  paper: "",
  subject: "",
  source: "",
  holdout: false,
});

function ModelAnswersTab({ formats }: { formats: AnswerFormat[] }) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const listFn = useServerFn(listModelAnswers);
  const deleteFn = useServerFn(deleteModelAnswer);
  const reanalyseFn = useServerFn(reanalyseModelAnswer);
  const answersQ = useQuery({ queryKey: ["saathiModelAnswers"], queryFn: () => listFn() });
  const [marksFilter, setMarksFilter] = useState(ALL);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => answersQ.data ?? [], [answersQ.data]);
  const shown = rows.filter(
    (r) =>
      (marksFilter === ALL || r.marks === Number(marksFilter)) &&
      (!search.trim() || r.question.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const byMarks = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) if (!r.holdout) m.set(r.marks, (m.get(r.marks) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);
  const failed = rows.filter((r) => !r.analysis).length;
  const heldOut = rows.filter((r) => r.holdout).length;

  async function remove(r: ModelAnswer) {
    if (!confirm("Delete this model answer? Its blueprint will be rebuilt without it.")) return;
    setBusyId(r.id);
    try {
      const res = await deleteFn({ data: { id: r.id } });
      qc.setQueryData<ModelAnswer[]>(["saathiModelAnswers"], (cur) =>
        (cur ?? []).filter((x) => x.id !== r.id),
      );
      const summary = rebuildSummary(res.rebuilt);
      toast.success(summary ? `Deleted. ${summary}` : "Deleted");
      invalidate();
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete"));
    } finally {
      setBusyId(null);
    }
  }

  async function retry(r: ModelAnswer) {
    setBusyId(r.id);
    try {
      const res = await reanalyseFn({ data: { id: r.id } });
      toast[res.answer.analysis ? "success" : "error"](
        res.answer.analysis ? "Answer analysed" : (res.answer.analysis_error ?? "Analysis failed"),
      );
      invalidate();
    } catch (e) {
      toast.error(errorText(e, "Couldn't analyse"));
    } finally {
      setBusyId(null);
    }
  }

  function edit(r: ModelAnswer) {
    setEditing({
      id: r.id,
      question: r.question,
      answer: r.answer,
      marks: String(r.marks),
      directive: r.directive,
      year: r.year ? String(r.year) : "",
      paper: r.paper ?? "",
      subject: r.subject ?? "",
      source: r.source ?? "",
      holdout: r.holdout,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing(emptyDraft(preferredMarks(formats)))}>
          <Plus className="mr-1 h-4 w-4" /> Add model answer
        </Button>
        <Button variant="outline" onClick={() => setImporting(true)}>
          <FileUp className="mr-1 h-4 w-4" /> Bulk import
        </Button>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <Badge>{rows.length} answers</Badge>
          {byMarks.map(([m, n]) => (
            <Badge key={m} tone="primary">
              {m} marks: {n}
            </Badge>
          ))}
          {heldOut > 0 && <Badge>{heldOut} kept for testing</Badge>}
          {failed > 0 && <Badge tone="warn">{failed} not analysed</Badge>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <Input
          placeholder="Search questions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <MarksSelect formats={formats} value={marksFilter} onChange={setMarksFilter} allowAll />
      </div>

      {answersQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : answersQ.error ? (
        <p className="text-sm text-destructive">{errorText(answersQ.error, "Couldn't load")}</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "No model answers yet. Add a few RAS Mains questions with good answers to start teaching SAATHI how answers are written."
            : "No answers match."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
              <button type="button" onClick={() => edit(r)} className="min-w-0 flex-1 text-left">
                <div className="line-clamp-2 text-sm font-medium">{r.question}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone="primary">{r.marks} marks</Badge>
                  <Badge>{DIRECTIVE_LABELS[r.directive]}</Badge>
                  {(r.year || r.paper) && (
                    <Badge>
                      {[r.year, r.paper ? `Paper ${r.paper}` : null].filter(Boolean).join(" · ")}
                    </Badge>
                  )}
                  {r.subject && <Badge>{r.subject}</Badge>}
                  <Badge>{r.word_count} words</Badge>
                  {r.holdout && <Badge tone="warn">Kept for testing</Badge>}
                  {r.analysis ? (
                    <Badge tone="good">
                      <CheckCircle2 className="h-3 w-3" /> Analysed
                    </Badge>
                  ) : (
                    <Badge tone="warn">
                      <AlertTriangle className="h-3 w-3" /> Not analysed
                    </Badge>
                  )}
                </div>
              </button>
              <div className="flex shrink-0 gap-1">
                {!r.analysis && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() => retry(r)}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Analyse
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => edit(r)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busyId === r.id}
                  onClick={() => remove(r)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ModelAnswerDialog
          draft={editing}
          formats={formats}
          existing={rows.find((r) => r.id === editing.id) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ImportDialog formats={formats} onClose={() => setImporting(false)} />}
    </div>
  );
}

function AnalysisSummary({ answer }: { answer: ModelAnswer }) {
  const a = answer.analysis;
  if (!a) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Not analysed yet{answer.analysis_error ? `: ${answer.analysis_error}` : ""}.
      </p>
    );
  }
  const features = Object.entries(a.features)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return (
    <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-xs">
      <div className="font-medium text-foreground">What SAATHI learned from this answer</div>
      <div>
        Intro: {a.intro.style.replace("_", " ")} ({a.intro.words} words) · Body: {a.body.points}{" "}
        points as {a.body.format} · Conclusion: {a.conclusion.style.replace("_", " ")} (
        {a.conclusion.words} words)
      </div>
      {a.body.headings.length > 0 && <div>Covers: {a.body.headings.join(", ")}</div>}
      <div>
        Uses: {features.length ? features.join(", ") : "—"}
        {a.diagram !== "none" ? ` · Diagram: ${a.diagram}` : ""}
      </div>
      {a.strengths.length > 0 && (
        <ul className="list-disc pl-4">
          {a.strengths.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModelAnswerDialog({
  draft: initial,
  formats,
  existing,
  onClose,
}: {
  draft: Draft;
  formats: AnswerFormat[];
  existing: ModelAnswer | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const saveFn = useServerFn(saveModelAnswer);
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const limit = formats.find((f) => f.marks === Number(d.marks))?.word_limit;
  const words = countWords(d.answer);

  async function save() {
    const marks = Number(d.marks);
    if (!d.question.trim() || !d.answer.trim() || !Number.isInteger(marks)) {
      toast.error("Question, answer and marks are required");
      return;
    }
    setSaving(true);
    try {
      const res = await saveFn({
        data: {
          id: d.id,
          question: d.question,
          answer: d.answer,
          marks,
          directive: d.directive === AUTO ? null : (d.directive as MainsDirective),
          year: d.year ? Number(d.year) : null,
          paper: d.paper || null,
          subject: d.subject || null,
          source: d.source || null,
          holdout: d.holdout,
        },
      });
      const summary = rebuildSummary(res.rebuilt);
      if (!res.answer.analysis) {
        toast.warning(
          `Saved, but the answer couldn't be analysed: ${res.answer.analysis_error ?? "unknown error"}. Use Analyse to retry.`,
        );
      } else {
        toast.success(summary ? `Saved. ${summary}` : "Saved");
      }
      invalidate();
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit model answer" : "Add model answer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Question</Label>
            <Textarea
              rows={2}
              value={d.question}
              onChange={(e) => set("question", e.target.value)}
              placeholder="e.g. Discuss the role of the Indira Gandhi Canal in the development of western Rajasthan."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Marks</Label>
              <MarksSelect formats={formats} value={d.marks} onChange={(v) => set("marks", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Question type</Label>
              <Select value={d.directive} onValueChange={(v) => set("directive", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Detect automatically</SelectItem>
                  {MAINS_DIRECTIVES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {DIRECTIVE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input
                inputMode="numeric"
                value={d.year}
                onChange={(e) => set("year", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="2018"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Paper</Label>
              <Input
                value={d.paper}
                onChange={(e) => set("paper", e.target.value)}
                placeholder="II"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Subject</Label>
              <Input
                value={d.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="Rajasthan Geography"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label>Model answer</Label>
              <span
                className={`text-xs ${limit && Math.abs(words - limit) > limit * 0.25 ? "text-amber-600" : "text-muted-foreground"}`}
              >
                {words} words{limit ? ` (limit ${limit})` : ""}
              </span>
            </div>
            <Textarea
              rows={12}
              value={d.answer}
              onChange={(e) => set("answer", e.target.value)}
              placeholder="Paste the answer exactly as it should be written, with its introduction, points and conclusion. Markdown (**bold**, - bullets, tables) is fine."
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Source (optional)</Label>
            <Input
              value={d.source}
              onChange={(e) => set("source", e.target.value)}
              placeholder="Written by our faculty"
            />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3">
            <Switch checked={d.holdout} onCheckedChange={(v) => set("holdout", v)} />
            <span className="text-sm">
              <span className="font-medium">Keep for testing</span>
              <span className="block text-muted-foreground">
                Not used to build blueprints or as an example. Use it on the Scores tab to check how
                close SAATHI gets to this answer.
              </span>
            </span>
          </label>
          {existing && <AnalysisSummary answer={existing} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving and analysing…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ formats, onClose }: { formats: AnswerFormat[]; onClose: () => void }) {
  const invalidate = useInvalidate();
  const saveFn = useServerFn(saveModelAnswer);
  const rebuildFn = useServerFn(rebuildSaathiBlueprints);
  const [text, setText] = useState("");
  const [defaultMarks, setDefaultMarks] = useState(preferredMarks(formats));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const parsed = useMemo(() => parseModelAnswers(text), [text]);
  const items = parsed.items.map((it) => ({ ...it, marks: it.marks ?? Number(defaultMarks) }));

  async function loadFile(file: File) {
    if (file.size > 2_000_000) {
      toast.error("File is too large (max 2 MB of text)");
      return;
    }
    setText(await file.text());
  }

  async function run() {
    if (items.length === 0) return;
    setProgress({ done: 0, total: items.length });
    const marksTouched = new Set<number>();
    let ok = 0;
    const failures: string[] = [];
    for (const [i, it] of items.entries()) {
      try {
        const res = await saveFn({
          data: {
            question: it.question,
            answer: it.answer,
            marks: it.marks,
            directive: it.directive,
            year: it.year,
            paper: it.paper,
            subject: it.subject,
            holdout: it.holdout,
            rebuild: false,
          },
        });
        marksTouched.add(it.marks);
        if (res.answer.analysis) ok++;
        else failures.push(it.question.slice(0, 50));
      } catch (e) {
        failures.push(`${it.question.slice(0, 50)}: ${errorText(e, "failed")}`);
      }
      setProgress({ done: i + 1, total: items.length });
    }
    try {
      const results = await rebuildFn({ data: { marks: [...marksTouched] } });
      const summary = rebuildSummary(results);
      if (summary) toast.success(summary);
    } catch (e) {
      toast.error(`Blueprints not rebuilt: ${errorText(e, "failed")}`);
    }
    setProgress(null);
    invalidate();
    if (failures.length) {
      toast.warning(
        `${ok} imported and analysed. ${failures.length} need attention: ${failures.slice(0, 3).join("; ")}`,
      );
    } else {
      toast.success(`${ok} model answers imported`);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !progress && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import model answers</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Paste answers or upload a .txt / .md file. Start each question with <code>Q:</code> and
            its answer with <code>A:</code>. <code>Marks</code>, <code>Year</code>,{" "}
            <code>Paper</code>, <code>Subject</code>, <code>Type</code> and{" "}
            <code>Test only: yes</code> lines are optional (Hindi labels प्रश्न / उत्तर / अंक / वर्ष
            work too).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setText(MODEL_ANSWER_TEMPLATE)}>
              Show an example
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              <FileUp className="h-4 w-4" /> Upload file
              <input
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Marks when not given</span>
              <div className="w-48">
                <MarksSelect formats={formats} value={defaultMarks} onChange={setDefaultMarks} />
              </div>
            </div>
          </div>
          <Textarea
            rows={14}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs"
            placeholder={MODEL_ANSWER_TEMPLATE}
          />
          {text.trim() && (
            <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-xs">
              <div className="font-medium">
                {items.length} answer{items.length === 1 ? "" : "s"} found
              </div>
              {items.slice(0, 8).map((it, i) => (
                <div key={i} className="truncate text-muted-foreground">
                  {it.marks} marks · {countWords(it.answer)} words · {it.question}
                </div>
              ))}
              {items.length > 8 && (
                <div className="text-muted-foreground">…and {items.length - 8} more</div>
              )}
              {parsed.errors.map((e) => (
                <div key={e} className="text-amber-700 dark:text-amber-400">
                  {e}
                </div>
              ))}
            </div>
          )}
          {progress && (
            <p className="text-sm">
              Saving and analysing {progress.done} / {progress.total}…
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={!!progress}>
            Cancel
          </Button>
          <Button onClick={run} disabled={!!progress || items.length === 0}>
            Import {items.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====================== Blueprints ======================

const CONFIDENCE_TEXT = {
  starting: { label: "Just started", tone: "warn" as const },
  growing: { label: "Growing", tone: "primary" as const },
  reliable: { label: "Reliable", tone: "good" as const },
};

function BlueprintsTab({ formats }: { formats: AnswerFormat[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBlueprints);
  const rebuildFn = useServerFn(rebuildSaathiBlueprints);
  const createFn = useServerFn(createBlueprint);
  const bpQ = useQuery({ queryKey: ["saathiBlueprints"], queryFn: () => listFn() });
  const [rebuilding, setRebuilding] = useState(false);
  const [newMarks, setNewMarks] = useState(preferredMarks(formats));
  const [newType, setNewType] = useState<BlueprintDirective>("any");

  const groups = useMemo(() => {
    const map = new Map<string, BlueprintWithScore[]>();
    for (const b of bpQ.data ?? []) {
      const key = `${b.marks}|${b.directive}`;
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return [...map.values()]
      .map((versions) => versions.sort((a, b) => b.version - a.version))
      .sort(
        (a, b) =>
          a[0].marks - b[0].marks ||
          (a[0].directive === "any" ? -1 : b[0].directive === "any" ? 1 : 0) ||
          a[0].directive.localeCompare(b[0].directive),
      );
  }, [bpQ.data]);
  const marksBands = [...new Set(groups.map((g) => g[0].marks))];

  async function rebuildAll() {
    setRebuilding(true);
    try {
      const results = await rebuildFn({ data: { force: true } });
      toast.success(rebuildSummary(results) ?? "Blueprints are up to date");
      qc.invalidateQueries({ queryKey: ["saathiBlueprints"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't rebuild"));
    } finally {
      setRebuilding(false);
    }
  }

  async function startByHand() {
    try {
      await createFn({ data: { marks: Number(newMarks), directive: newType } });
      toast.success("Blueprint created. Edit it to match how you want answers written.");
      qc.invalidateQueries({ queryKey: ["saathiBlueprints"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't create"));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={rebuildAll} disabled={rebuilding}>
          <RefreshCw className={`mr-1 h-4 w-4 ${rebuilding ? "animate-spin" : ""}`} />
          {rebuilding ? "Rebuilding…" : "Rebuild all"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Blueprints rebuild automatically when you add, edit or delete model answers. A blueprint
          needs at least 2 analysed answers; until then SAATHI uses a standard structure.
        </p>
      </div>

      {bpQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : bpQ.error ? (
        <p className="text-sm text-destructive">{errorText(bpQ.error, "Couldn't load")}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No blueprints yet. Add at least 2 model answers with the same marks.
        </div>
      ) : (
        marksBands.map((m) => (
          <section key={m} className="space-y-3">
            <h3 className="text-sm font-semibold">
              {m} marks
              {formats.find((f) => f.marks === m)
                ? ` · ${formats.find((f) => f.marks === m)!.word_limit} words`
                : ""}
            </h3>
            {groups
              .filter((g) => g[0].marks === m)
              .map((versions) => (
                <BlueprintCard key={`${m}-${versions[0].directive}`} versions={versions} />
              ))}
          </section>
        ))
      )}

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Write a blueprint by hand</h3>
        <p className="text-xs text-muted-foreground">
          For a marks band or question type without model answers yet. It starts from the standard
          structure; edit it afterwards.
        </p>
        <div className="grid gap-2 sm:grid-cols-[12rem_14rem_auto] sm:justify-start">
          <MarksSelect formats={formats} value={newMarks} onChange={setNewMarks} />
          <Select value={newType} onValueChange={(v) => setNewType(v as BlueprintDirective)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["any", ...MAINS_DIRECTIVES] as BlueprintDirective[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {DIRECTIVE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={startByHand}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>
      </section>
    </div>
  );
}

function BlueprintCard({ versions }: { versions: BlueprintWithScore[] }) {
  const qc = useQueryClient();
  const editFn = useServerFn(editBlueprintGuide);
  const activateFn = useServerFn(activateBlueprint);
  const lockFn = useServerFn(setBlueprintLocked);
  const retireFn = useServerFn(retireBlueprint);
  const active = versions.find((v) => v.status === "active");
  const draft = versions.find((v) => v.status === "draft");
  const shown = active ?? draft ?? versions[0];
  const [editing, setEditing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const confidence = CONFIDENCE_TEXT[blueprintConfidence(shown.sample_count)];
  const refresh = () => qc.invalidateQueries({ queryKey: ["saathiBlueprints"] });

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-medium">{DIRECTIVE_LABELS[shown.directive]}</div>
        <Badge>v{shown.version}</Badge>
        {shown.status === "active" ? (
          <Badge tone="good">In use</Badge>
        ) : (
          <Badge tone="warn">{shown.status === "draft" ? "Draft" : "Not in use"}</Badge>
        )}
        {shown.sample_count > 0 ? (
          <Badge tone={confidence.tone}>
            {confidence.label} · {shown.sample_count} answers
          </Badge>
        ) : (
          <Badge>Written by hand</Badge>
        )}
        {shown.locked && (
          <Badge>
            <Lock className="h-3 w-3" /> Edited
          </Badge>
        )}
        {shown.avg_score !== null && (
          <Badge tone="primary">
            Score {shown.avg_score}/100 ({shown.scored})
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(shown.guide)} disabled={busy}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(
                () => lockFn({ data: { id: shown.id, locked: !shown.locked } }),
                shown.locked
                  ? "Unlocked: new model answers will update it again"
                  : "Locked: new model answers create drafts for you to review",
              )
            }
          >
            {shown.locked ? (
              <Unlock className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Lock className="mr-1 h-3.5 w-3.5" />
            )}
            {shown.locked ? "Unlock" : "Lock"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="mr-1 h-3.5 w-3.5" /> History ({versions.length})
          </Button>
          {shown.status === "active" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (confirm("Stop using this blueprint? SAATHI falls back to the general one."))
                  void act(() => retireFn({ data: { id: shown.id } }), "Blueprint no longer used");
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Stop using
            </Button>
          )}
        </div>
      </div>

      {active && draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <span>
            New answers produced draft v{draft.version} ({draft.sample_count} answers). This
            blueprint is locked, so the draft waits for you.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              act(() => activateFn({ data: { id: draft.id } }), `Now using v${draft.version}`)
            }
          >
            Use draft v{draft.version}
          </Button>
        </div>
      )}

      <pre className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 font-sans text-sm leading-relaxed">
        {shown.guide}
      </pre>

      {showHistory && (
        <ul className="space-y-1 text-sm">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
            >
              <span className="font-medium">v{v.version}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(v.created_at).toLocaleDateString()} · {v.sample_count} answers
                {v.locked ? " · edited" : ""} · {v.status}
                {v.avg_score !== null ? ` · score ${v.avg_score}` : ""}
              </span>
              {v.status !== "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    act(() => activateFn({ data: { id: v.id } }), `Now using v${v.version}`)
                  }
                >
                  Use this version
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Edit blueprint · {shown.marks} marks · {DIRECTIVE_LABELS[shown.directive]}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              SAATHI follows this text when writing answers. Saving creates a new version and locks
              it, so new model answers create drafts instead of replacing your wording.
            </p>
            <Textarea
              rows={14}
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              className="text-sm"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy || editing.trim().length < 10}
                onClick={() =>
                  act(async () => {
                    await editFn({ data: { id: shown.id, guide: editing } });
                    setEditing(null);
                  }, "Saved as a new version")
                }
              >
                Save new version
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ====================== Try a question ======================

function MainsInfoBadges({ written }: { written: WrittenAnswer }) {
  const i = written.info;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone="primary">
        {i.marks} marks · limit {i.wordLimit} words
      </Badge>
      {i.words !== undefined && (
        <Badge tone={Math.abs(i.words - i.wordLimit) <= i.wordLimit * 0.1 ? "good" : "warn"}>
          {i.words} words written
        </Badge>
      )}
      <Badge>{DIRECTIVE_LABELS[i.directive]}</Badge>
      {i.blueprint ? (
        <Badge tone="good">
          Blueprint: {DIRECTIVE_LABELS[i.blueprint.directive]} v{i.blueprint.version} (
          {i.blueprint.samples} answers)
        </Badge>
      ) : (
        <Badge tone="warn">Standard structure (no blueprint yet)</Badge>
      )}
      <Badge>{i.exemplars} example answers</Badge>
      {i.pyq && (
        <Badge tone="primary">
          Asked in{" "}
          {[i.pyq.year ? `RAS ${i.pyq.year}` : null, i.pyq.paper ? `Paper ${i.pyq.paper}` : null]
            .filter(Boolean)
            .join(", ") || "a previous year"}
        </Badge>
      )}
    </div>
  );
}

function TryTab({ formats }: { formats: AnswerFormat[] }) {
  const previewFn = useServerFn(previewMainsAnswer);
  const [question, setQuestion] = useState("");
  const [marks, setMarks] = useState(preferredMarks(formats));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WrittenAnswer | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(
        await previewFn({
          data: { question: question.trim(), marks: marks === AUTO ? null : Number(marks) },
        }),
      );
    } catch (err) {
      toast.error(errorText(err, "Couldn't write the answer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <Label>Question</Label>
        <Textarea
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Critically examine the impact of the Indira Gandhi Canal on western Rajasthan."
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <MarksSelect formats={formats} value={marks} onChange={setMarks} allowAuto />
          </div>
          <Button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Writing…" : "Write answer"}
          </Button>
        </div>
      </form>

      {result && (
        <div className="space-y-3">
          <MainsInfoBadges written={result} />
          <div className="prose prose-sm max-w-none rounded-2xl border border-border bg-card p-4 dark:prose-invert prose-td:border prose-th:border prose-td:px-2 prose-th:px-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
          </div>
          <details className="rounded-xl border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Structure SAATHI followed</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{result.guide}</pre>
          </details>
          {result.exemplars.length > 0 && (
            <details className="rounded-xl border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Example answers shown to SAATHI ({result.exemplars.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.exemplars.map((e, i) => (
                  <li key={i}>
                    {e.question}
                    {e.year ? ` (RAS ${e.year}${e.paper ? `, Paper ${e.paper}` : ""})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.sources.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Facts from: {result.sources.map((s) => s.title).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ====================== Scores ======================

function ScoresTab() {
  const qc = useQueryClient();
  const answersFn = useServerFn(listModelAnswers);
  const scoresFn = useServerFn(listBlueprintScores);
  const scoreFn = useServerFn(scoreModelAnswer);
  const answersQ = useQuery({ queryKey: ["saathiModelAnswers"], queryFn: () => answersFn() });
  const scoresQ = useQuery({ queryKey: ["saathiBlueprintScores"], queryFn: () => scoresFn() });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<BlueprintScore | null>(null);

  const heldOut = (answersQ.data ?? []).filter((a) => a.holdout);
  const scoresByAnswer = useMemo(() => {
    const map = new Map<string, BlueprintScore[]>();
    for (const s of scoresQ.data ?? []) {
      const list = map.get(s.answer_id) ?? [];
      list.push(s);
      map.set(s.answer_id, list);
    }
    return map;
  }, [scoresQ.data]);
  const latest = heldOut
    .map((a) => scoresByAnswer.get(a.id)?.[0])
    .filter((s): s is BlueprintScore => !!s);
  const average = latest.length
    ? Math.round(latest.reduce((a, s) => a + Number(s.total), 0) / latest.length)
    : null;

  async function scoreAll(list: ModelAnswer[]) {
    if (!list.length) return;
    if (!confirm(`Score ${list.length} answer(s)? Each uses several AI calls.`)) return;
    setProgress({ done: 0, total: list.length });
    for (const [i, a] of list.entries()) {
      try {
        await scoreFn({ data: { answer_id: a.id } });
      } catch (e) {
        toast.error(`${a.question.slice(0, 40)}: ${errorText(e, "failed")}`);
      }
      setProgress({ done: i + 1, total: list.length });
      qc.invalidateQueries({ queryKey: ["saathiBlueprintScores"] });
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ["saathiBlueprints"] });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          Mark some model answers as <b>Keep for testing</b>. SAATHI writes its own answer to each
          of those questions (without seeing the model answer) and the AI marks it against the model
          answer on structure, coverage, specific content, presentation and length. Score again
          after adding answers or editing blueprints to see if answers got better.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => scoreAll(heldOut)} disabled={!!progress || heldOut.length === 0}>
            {progress
              ? `Scoring ${progress.done} / ${progress.total}…`
              : `Score all (${heldOut.length})`}
          </Button>
          {average !== null && <Badge tone="primary">Average latest score: {average}/100</Badge>}
        </div>
      </div>

      {heldOut.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No answers are kept for testing yet. Edit a model answer and turn on “Keep for testing”
          (about 1 in 5 answers is a good share).
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {heldOut.map((a) => {
            const history = scoresByAnswer.get(a.id) ?? [];
            const last = history[0];
            const prev = history[1];
            const diff = last && prev ? Math.round(Number(last.total) - Number(prev.total)) : null;
            return (
              <li key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm">{a.question}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="primary">{a.marks} marks</Badge>
                    {last ? (
                      <>
                        <Badge tone={Number(last.total) >= 70 ? "good" : "warn"}>
                          {Math.round(Number(last.total))}/100
                        </Badge>
                        {diff !== null && diff !== 0 && (
                          <Badge tone={diff > 0 ? "good" : "warn"}>
                            {diff > 0 ? "+" : ""}
                            {diff} since last time
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Badge>Not scored</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {last && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(last)}>
                      Details
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!progress}
                    onClick={() => scoreAll([a])}
                  >
                    Score
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Score {Math.round(Number(open.total))}/100</DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              {(["structure", "coverage", "specificity", "presentation", "length"] as const).map(
                (k) => (
                  <Badge key={k} tone="primary">
                    {k}: {open.scores[k]}/10
                  </Badge>
                ),
              )}
              <Badge>{open.word_count} words</Badge>
            </div>
            {open.scores.feedback && <p className="text-sm">{open.scores.feedback}</p>}
            <div className="prose prose-sm max-w-none rounded-xl border border-border p-3 dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{open.generated}</ReactMarkdown>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ====================== Word limits ======================

function LimitsTab({ formats }: { formats: AnswerFormat[] }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveAnswerFormat);
  const deleteFn = useServerFn(deleteAnswerFormat);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [newMarks, setNewMarks] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["saathiAnswerFormats"] });
    qc.invalidateQueries({ queryKey: ["saathiBlueprints"] });
  };

  async function save(f: AnswerFormat, patch: Partial<AnswerFormat>) {
    try {
      await saveFn({ data: { ...f, ...patch } });
      toast.success("Saved");
      setEdits((e) => {
        const next = { ...e };
        delete next[f.marks];
        return next;
      });
      refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const marks = Number(newMarks);
    const word_limit = Number(newLimit);
    if (!Number.isInteger(marks) || !Number.isInteger(word_limit)) return;
    try {
      await saveFn({ data: { marks, word_limit, enabled: true } });
      setNewMarks("");
      setNewLimit("");
      refresh();
    } catch (err) {
      toast.error(errorText(err, "Couldn't add"));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The word limit for each marks band, as in the current RAS Mains pattern. Students pick from
        the bands switched on here. Changing a limit rebuilds that band's blueprints.
      </p>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {formats.map((f) => (
          <li key={f.marks} className="flex flex-wrap items-center gap-3 p-3">
            <div className="w-24 font-medium">{f.marks} marks</div>
            <div className="flex items-center gap-2">
              <Input
                className="w-24"
                inputMode="numeric"
                value={edits[f.marks] ?? String(f.word_limit)}
                onChange={(e) =>
                  setEdits((cur) => ({ ...cur, [f.marks]: e.target.value.replace(/\D/g, "") }))
                }
              />
              <span className="text-sm text-muted-foreground">words</span>
              {edits[f.marks] !== undefined && Number(edits[f.marks]) !== f.word_limit && (
                <Button size="sm" onClick={() => save(f, { word_limit: Number(edits[f.marks]) })}>
                  Save
                </Button>
              )}
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Switch checked={f.enabled} onCheckedChange={(v) => save(f, { enabled: v })} />
              Students can pick
            </label>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete"
              onClick={async () => {
                if (!confirm(`Remove the ${f.marks}-mark band?`)) return;
                try {
                  await deleteFn({ data: { marks: f.marks } });
                  refresh();
                } catch (err) {
                  toast.error(errorText(err, "Couldn't delete"));
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>Marks</Label>
          <Input
            className="w-24"
            inputMode="numeric"
            value={newMarks}
            onChange={(e) => setNewMarks(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-1">
          <Label>Word limit</Label>
          <Input
            className="w-28"
            inputMode="numeric"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button type="submit" variant="outline" disabled={!newMarks || !newLimit}>
          <Plus className="mr-1 h-4 w-4" /> Add marks band
        </Button>
      </form>
    </div>
  );
}
