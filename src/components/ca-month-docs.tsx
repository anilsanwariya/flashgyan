// Admin: the monthly magazine's official documents (Monthly page →
// Documents). Government reports, gazettes and surveys are read into new
// stories under the date they are about, additions to the month's stories
// (approved here), corrections (on the Daily page's list) and, for a report,
// a page in "Schemes, Policies & Reports" → Reports & indices.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  addCaDocument,
  changeCaReport,
  decideCaDocAddition,
  deleteCaDocument,
  listCaDocuments,
  stepCaDocuments,
  writeCaReport,
  type DocAddition,
  type MonthDoc,
} from "@/lib/ca-docs.functions";
import { monthEnd } from "@/lib/ca-docs";
import { resortCaMonth } from "@/lib/current-affairs.functions";
import type { CaReport } from "@/lib/ca-docs";
import { formatDate } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The month's documents, additions waiting and report pages (shared with the
// Monthly page's tab dot and warnings).
export function useMonthDocs(month: string) {
  const fn = useServerFn(listCaDocuments);
  return useQuery({
    queryKey: ["caMonthDocs", month],
    queryFn: () => fn({ data: { month } }),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.work.parts || q.state.data.work.writing) ? 20_000 : false,
  });
}

export function MonthDocuments({ month }: { month: string }) {
  const qc = useQueryClient();
  const q = useMonthDocs(month);
  const stepFn = useServerFn(stepCaDocuments);
  const [driving, setDriving] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["caMonthDocs", month] }),
      qc.invalidateQueries({ queryKey: ["caMonth", month] }),
    ]);

  // Reads from this page while it's open (the schedule goes on more slowly
  // when it's closed).
  async function drive() {
    if (driving) return;
    setDriving(true);
    stop.current = false;
    try {
      for (let i = 0; i < 500 && !stop.current; i++) {
        const r = await stepFn();
        await refresh();
        if (!r.step) break;
        if (/^“[^”]*”: /.test(r.step)) toast.error(r.step);
        await sleep(200);
      }
    } catch (e) {
      toast.error(errorText(e, "Reading stopped"));
    } finally {
      setDriving(false);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const data = q.data!;
  if (!data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        Official documents need a database update: run the latest migration (ca_month_documents) in
        Lovable or the SQL editor, then reload this page.
      </p>
    );
  const { parts, writing } = data.work;
  const work = parts
    ? `Reading documents: ${parts} ${parts === 1 ? "part" : "parts"} to go`
    : writing
      ? `Writing stories from documents: ${writing} to write`
      : "";

  return (
    <div className="space-y-4">
      <AddDocument month={month} onAdded={refresh} onStart={() => void drive()} />
      {work && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-primary">
          <span>{work}</span>
          {!driving ? (
            <Button size="sm" variant="outline" onClick={() => void drive()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Speed up
            </Button>
          ) : (
            <RefreshCw className="h-4 w-4 animate-spin" />
          )}
        </div>
      )}
      <Suggestions additions={data.additions} onChanged={refresh} />
      <Reports month={month} reports={data.reports} docs={data.docs} onChanged={refresh} />
      <DocList docs={data.docs} reports={data.reports} onChanged={refresh} />
    </div>
  );
}

// ---------- Adding a document ----------

type Kind = "file" | "link" | "text";

function AddDocument({
  month,
  onAdded,
  onStart,
}: {
  month: string;
  onAdded: () => unknown;
  onStart: () => void;
}) {
  const addFn = useServerFn(addCaDocument);
  const last = monthEnd(month);
  const [kind, setKind] = useState<Kind>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [by, setBy] = useState("");
  const [date, setDate] = useState(last);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDate(monthEnd(month)), [month]);
  const dateOk = date >= month && date <= last;
  const ready =
    dateOk &&
    (kind === "file"
      ? !!file
      : kind === "link"
        ? /^https?:\/\/\S+$/.test(url.trim())
        : text.trim().length >= 40 && !!name.trim());

  async function add() {
    setBusy("Adding…");
    try {
      let content: string | undefined;
      let title = name.trim();
      if (kind === "file") {
        setBusy(`Reading ${file!.name}…`);
        const { extractTextFromFile } = await import("@/lib/saathi-parse");
        content = (await extractTextFromFile(file!, "Bilingual")).trim();
        if (content.length < 40) throw new Error("No readable text in this file.");
        title = title || file!.name.replace(/\.[a-z0-9]+$/i, "");
        setBusy("Adding…");
      } else if (kind === "text") content = text.trim();
      await addFn({
        data: {
          month,
          name: title,
          released_by: by.trim(),
          date,
          focus: focus.trim() || null,
          ...(content ? { content } : { url: url.trim() }),
        },
      });
      toast.success("Document added: reading it now");
      setFile(null);
      setUrl("");
      setText("");
      setName("");
      setBy("");
      setFocus("");
      if (input.current) input.current.value = "";
      await onAdded();
      onStart();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      aria-label="Add an official document"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <FileText className="h-4 w-4" /> Official documents
        </h3>
        <p className="text-sm text-muted-foreground">
          Government reports, gazettes, surveys and releases. The AI files their new stories under
          the date you give (marked “From official documents”), offers new facts for the month's
          stories below for you to approve, sends changed figures to the corrections list, and gives
          a report its own page in “Schemes, Policies &amp; Reports” → Reports &amp; indices.
        </p>
      </div>
      <div role="radiogroup" aria-label="Document kind" className="flex flex-wrap gap-1.5">
        {(
          [
            ["file", "File"],
            ["link", "Link (page or PDF)"],
            ["text", "Paste text"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-xs ${kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === "file" && (
        <Input
          ref={input}
          type="file"
          aria-label="Document file"
          accept=".pdf,.docx,.xlsx,.xls,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      )}
      {kind === "link" && (
        <Input
          aria-label="Document address"
          placeholder="https://… (a web page or a PDF)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      {kind === "text" && (
        <Textarea
          aria-label="Document text"
          rows={6}
          placeholder="Paste the document's text here"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Document name"
          placeholder={
            kind === "text" ? "Name, e.g. Economic Survey 2025-26" : "Name (optional: the file's)"
          }
          maxLength={300}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label="Released by"
          placeholder="Released by, e.g. Ministry of Finance"
          maxLength={120}
          value={by}
          onChange={(e) => setBy(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">Released on (or the date it's about)</span>
          <Input
            type="date"
            aria-label="Release date"
            min={month}
            max={last}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-44"
          />
        </label>
        <label className="w-full min-w-0 space-y-1 text-xs font-medium text-muted-foreground sm:w-auto sm:flex-1">
          <span className="block">Read only (optional, for long documents)</span>
          <Input
            aria-label="Parts to read"
            placeholder="e.g. chapters 3 and 5, the Rajasthan section"
            maxLength={300}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="h-9"
          />
        </label>
      </div>
      {!dateOk && (
        <p className="text-xs text-destructive">
          Pick a date in this month; stories file under it.
        </p>
      )}
      <Button disabled={!!busy || !ready} onClick={() => void add()}>
        <Plus className="mr-1 h-4 w-4" />
        {busy || "Add document"}
      </Button>
    </section>
  );
}

// ---------- Additions waiting for the editor ----------

// New facts and corrections that material offers for stories already
// written: approved one by one (or all), added as key points or applied
// without rewriting the story. A custom magazine's copy can update the daily
// story it came from too.
export function Suggestions({
  additions,
  onChanged,
  title = "New facts for the month's stories",
}: {
  additions: DocAddition[];
  onChanged: () => Promise<unknown>;
  title?: string;
}) {
  const fn = useServerFn(decideCaDocAddition);
  const [busy, setBusy] = useState<string | null>(null);
  const [daily, setDaily] = useState<Set<string>>(new Set());
  async function decide(list: DocAddition[], approve: boolean) {
    setBusy(list.length === 1 ? list[0].id : "all");
    let done = 0;
    try {
      for (const a of list) {
        await fn({ data: { id: a.id, approve, also_daily: approve && daily.has(a.id) } });
        done++;
      }
      const fixes = list.filter((a) => a.kind === "correction").length;
      toast.success(
        !approve
          ? "Left as it was"
          : list.length === 1
            ? fixes
              ? "Correction applied"
              : "Facts added as key points"
            : `${done} ${done === 1 ? "suggestion" : "suggestions"} applied`,
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't apply it"));
    } finally {
      setBusy(null);
      await onChanged();
    }
  }
  if (!additions.length) return null;
  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {title} <Badge tone="warn">{additions.length}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            New facts are added as key points and corrections change the figures, without rewriting
            the story (its earlier version is kept).
          </p>
        </div>
        {additions.length > 1 && (
          <Button size="sm" disabled={!!busy} onClick={() => void decide(additions, true)}>
            <Check className="mr-1 h-4 w-4" /> {busy === "all" ? "Applying…" : "Apply all"}
          </Button>
        )}
      </div>
      <ul className="space-y-2" data-testid="doc-additions">
        {additions.map((a) => (
          <li
            key={a.id}
            data-addition={a.headline}
            data-kind={a.kind}
            className="space-y-2 rounded-xl border border-border p-3 text-sm"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words font-medium">{a.headline}</span>
                <Badge tone={a.kind === "correction" ? "warn" : "primary"}>
                  {a.kind === "correction" ? "Correction" : "New facts"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {a.issue_date ? formatDate(a.issue_date, "en") : ""} · from {a.doc}
              </div>
            </div>
            {a.kind === "correction" ? (
              <ul className="space-y-0.5">
                {a.changes.map((c, i) => (
                  <li key={i} className="break-words">
                    {c.old_value || c.new_value ? (
                      <>
                        <s className="text-muted-foreground">{c.old_value}</s> →{" "}
                        <b>{c.new_value}</b>
                      </>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">{c.new_en}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="list-disc space-y-0.5 pl-5">
                {a.facts.map((f, i) => (
                  <li key={i} className="break-words">
                    {f.text}
                  </li>
                ))}
              </ul>
            )}
            {a.has_daily && (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  aria-label={`Update the daily story too: ${a.headline}`}
                  checked={daily.has(a.id)}
                  onCheckedChange={(v) => {
                    const next = new Set(daily);
                    if (v === true) next.add(a.id);
                    else next.delete(a.id);
                    setDaily(next);
                  }}
                />
                Update the daily story too
              </label>
            )}
            {a.error && <p className="text-xs text-destructive">{a.error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => void decide([a], true)}>
                <Check className="mr-1 h-4 w-4" />
                {busy === a.id
                  ? "Applying…"
                  : a.kind === "correction"
                    ? "Apply correction"
                    : "Add as key points"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() => void decide([a], false)}
              >
                <X className="mr-1 h-4 w-4" /> Not needed
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Report pages ----------

function Reports({
  month,
  reports,
  docs,
  onChanged,
}: {
  month: string;
  reports: CaReport[];
  docs: MonthDoc[];
  onChanged: () => Promise<unknown>;
}) {
  const changeFn = useServerFn(changeCaReport);
  const writeFn = useServerFn(writeCaReport);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      setBusy(null);
      await onChanged();
    }
  }
  const change = (source: string, action: "include" | "leave_out" | "remove" | "up" | "down") =>
    changeFn({ data: { month, source, action } });
  // Documents read with report findings but no page (its writing failed).
  const without = docs.filter(
    (d) => d.status === "done" && d.notes >= 3 && !reports.some((r) => r.source_id === d.id),
  );
  if (!reports.length && !without.length) return null;
  return (
    <section
      aria-label="Report pages"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">Report pages</h3>
        <p className="text-sm text-muted-foreground">
          Printed in “Schemes, Policies &amp; Reports” under Reports &amp; indices, in this order:
          what each report is, its key findings, Rajasthan's place and practice questions.
        </p>
      </div>
      <ul className="space-y-2" data-testid="doc-reports">
        {reports.map((r, i) => (
          <li
            key={r.source_id}
            data-report={r.name.en}
            className={`rounded-xl border border-border p-3 text-sm ${r.included ? "" : "opacity-70"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-expanded={open === r.source_id}
                onClick={() => setOpen(open === r.source_id ? null : r.source_id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium"
              >
                {open === r.source_id ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className="break-words">{r.name.en}</span>
              </button>
              <Badge tone={r.included ? "good" : "muted"}>
                {r.included ? "In the issue" : "Left out"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={`Move ${r.name.en} up`}
                disabled={!!busy || i === 0}
                onClick={() => void run(r.source_id, () => change(r.source_id, "up"), "Moved")}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={`Move ${r.name.en} down`}
                disabled={!!busy || i === reports.length - 1}
                onClick={() => void run(r.source_id, () => change(r.source_id, "down"), "Moved")}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {r.released_by.en ? `${r.released_by.en} · ` : ""}
              {formatDate(r.date, "en")} · {r.findings.length} findings · {r.mcqs.length}{" "}
              {r.mcqs.length === 1 ? "question" : "questions"}
            </div>
            {open === r.source_id && (
              <div className="mt-2 space-y-2">
                <p>{r.what.en}</p>
                <p className="text-muted-foreground">{r.what.hi}</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {r.findings.map((f, k) => (
                    <li key={k}>
                      {f.en}
                      <span className="block text-xs text-muted-foreground">{f.hi}</span>
                    </li>
                  ))}
                </ul>
                {r.rajasthan && (
                  <p className="rounded-lg border-l-2 border-primary bg-muted/50 px-2 py-1">
                    <b>Rajasthan:</b> {r.rajasthan.en}
                  </p>
                )}
                {r.mcqs.map((m, k) => (
                  <div key={k} className="text-xs">
                    <p className="font-medium">
                      Q{k + 1}. {m.question.en}
                    </p>
                    <p className="text-muted-foreground">
                      {m.options.map((o, j) => `(${"abcd"[j]}) ${o.en}`).join("  ")} · Answer: (
                      {"abcd"[m.answer]})
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    r.source_id,
                    () => change(r.source_id, r.included ? "leave_out" : "include"),
                    r.included ? "Left out of the issue" : "Back in the issue",
                  )
                }
              >
                {r.included ? "Leave out" : "Put back"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    r.source_id,
                    () => writeFn({ data: { source: r.source_id } }),
                    "Report page written again",
                  )
                }
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {busy === r.source_id ? "Working…" : "Write again"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove the page for ${r.name.en}`}
                disabled={!!busy}
                onClick={() => {
                  if (confirm(`Remove the page for “${r.name.en}”? The document stays.`))
                    void run(r.source_id, () => change(r.source_id, "remove"), "Page removed");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
        {without.map((d) => (
          <li key={d.id} className="rounded-xl border border-dashed border-border p-3 text-sm">
            <div className="break-words font-medium">{d.title}</div>
            <p className="text-xs text-muted-foreground">
              {d.notes} report findings, no page yet{d.error ? `: ${d.error}` : ""}.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!!busy}
              onClick={() =>
                void run(d.id, () => writeFn({ data: { source: d.id } }), "Report page written")
              }
            >
              {busy === d.id ? "Writing…" : "Write the report page"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- The month's documents ----------

function DocList({
  docs,
  reports,
  onChanged,
}: {
  docs: MonthDoc[];
  reports: CaReport[];
  onChanged: () => Promise<unknown>;
}) {
  const deleteFn = useServerFn(deleteCaDocument);
  async function remove(d: MonthDoc) {
    if (
      !confirm(
        `Remove “${d.title}”? Its new stories and report page go, and facts it added to other stories are taken out (those stories are written again).`,
      )
    )
      return;
    try {
      await deleteFn({ data: { id: d.id } });
      toast.success("Document removed");
    } catch (e) {
      toast.error(errorText(e, "Couldn't remove it"));
    } finally {
      await onChanged();
    }
  }
  return (
    <section
      aria-label="This month's documents"
      className="space-y-2 rounded-2xl border border-border bg-card p-4"
    >
      <h3 className="font-semibold">This month's documents</h3>
      {docs.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border" data-testid="docs">
          {docs.map((d) => {
            const reading = d.status === "new" || d.status === "extracting";
            const failed = d.status === "error";
            const page = reports.some((r) => r.source_id === d.id);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.source_name !== d.title ? `${d.source_name} · ` : ""}
                    {formatDate(d.doc_date, "en")}
                    {d.doc_focus ? ` · only: ${d.doc_focus}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.stories} new {d.stories === 1 ? "story" : "stories"} · {d.additions}{" "}
                    {d.additions === 1 ? "addition" : "additions"}
                    {page ? " · report page" : ""}
                  </div>
                  {d.error && <div className="text-xs text-destructive">{d.error}</div>}
                </div>
                {reading ? (
                  <Badge tone="primary">
                    Reading {d.chunks_done} of {d.chunks}
                  </Badge>
                ) : failed ? (
                  <Badge tone="bad">Problem</Badge>
                ) : (
                  <Badge tone="good">Read</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${d.title}`}
                  onClick={() => void remove(d)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No documents for this month yet.</p>
      )}
    </section>
  );
}

// Moves the month's earlier stories into the newer sections (Schemes,
// Policies & Reports; Persons in News; Places in News).
export function ResortMonth({ month }: { month: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(resortCaMonth);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ checked: number; moved: number } | null>(null);
  async function run() {
    setBusy(true);
    let checked = 0;
    let moved = 0;
    let after: string | null = null;
    try {
      for (let i = 0; i < 100; i++) {
        const r: { checked: number; moved: number; next: string | null } = await fn({
          data: { month, after },
        });
        checked += r.checked;
        moved += r.moved;
        setProgress({ checked, moved });
        if (!r.next) break;
        after = r.next;
      }
      toast.success(
        moved
          ? `${moved} ${moved === 1 ? "story" : "stories"} moved to the new sections`
          : "No stories needed moving",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["caMonth"] }),
        qc.invalidateQueries({ queryKey: ["caDay"] }),
      ]);
    } catch (e) {
      toast.error(errorText(e, "Re-sorting stopped"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="New sections"
      className="space-y-2 rounded-2xl border border-border bg-card p-4"
    >
      <h3 className="font-semibold">New sections</h3>
      <p className="text-sm text-muted-foreground">
        “Schemes, Policies &amp; Reports”, “Persons in News” and “Places in News” get new stories by
        themselves. This moves the month's earlier stories into them; daily issues already posted
        don't change.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
          <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Re-sorting…" : "Re-sort this month"}
        </Button>
        {progress && (
          <span className="text-xs text-muted-foreground" role="status">
            {progress.checked} checked · {progress.moved} moved
          </span>
        )}
      </div>
    </section>
  );
}
