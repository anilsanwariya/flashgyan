// Admin: daily and monthly current affairs magazine. Upload the day's sources,
// review the news items SAATHI writes from them, approve the issue and it is
// posted to the Telegram channel as a bilingual PDF.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  BarChart3,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  addCaSource,
  buildCaIssue,
  checkAiServices,
  cancelCaIssue,
  decideCaCorrection,
  deleteCaItems,
  deleteCaSource,
  deleteCaSources,
  enrichCaItem,
  extractCaSourcePart,
  getCaDay,
  getCaMonth,
  getMagazineSettings,
  postCaIssueNow,
  previewCaIssue,
  redoCaVisual,
  saveMagazineSettings,
  sendCaIssueTest,
  updateCaItem,
  uploadMagazineLogo,
  type CaIssue,
  type CaItem,
  type CaSource,
  type DayData,
} from "@/lib/current-affairs.functions";
import {
  CATEGORIES,
  UPLOAD_SECTIONS,
  categoryLabel,
  dailyPostTime,
  formatDate,
  istDate,
  type Bi,
  type CaContent,
  type UploadSection,
} from "@/lib/current-affairs";
import { unitLabel } from "../../supabase/functions/_shared/ras-syllabus.ts";
import { VISUAL_LABELS } from "@/lib/ca-visuals";
import { visualPreviewHtml } from "@/lib/current-affairs-html";
import { CollectionBox, WatchSitesSettings } from "@/components/ca-collect-panel";
import { FileDropZone, FileQueueList, useFileQueue } from "@/components/saathi-file-queue";
import { SAATHI_ACCEPT } from "@/lib/saathi-parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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

export type CaSection = "daily" | "monthly" | "settings";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function Badge({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "warn" | "good" | "bad";
  title?: string;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    bad: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const timeIst = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

export function CurrentAffairsPanel({ section }: { section: CaSection }) {
  if (section === "monthly") return <MonthlyPanel />;
  if (section === "settings") return <SettingsPanel />;
  return <DailyPanel />;
}

// ====================== Issue status and actions ======================

const STATUS_TEXT: Record<
  CaIssue["status"],
  { label: string; tone: "muted" | "primary" | "warn" | "good" | "bad" }
> = {
  draft: { label: "PDF made, not approved", tone: "muted" },
  scheduled: { label: "Approved · scheduled", tone: "primary" },
  posting: { label: "Posting…", tone: "primary" },
  posted: { label: "Posted", tone: "good" },
  failed: { label: "Posting failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "warn" },
};

function IssueBar({
  kind,
  period,
  issue,
  blocking,
  onChanged,
}: {
  kind: "daily" | "monthly";
  period: string;
  issue: CaIssue | null;
  // Why the issue can't be approved yet, if anything.
  blocking: string | null;
  onChanged: () => void;
}) {
  const previewFn = useServerFn(previewCaIssue);
  const buildFn = useServerFn(buildCaIssue);
  const cancelFn = useServerFn(cancelCaIssue);
  const postFn = useServerFn(postCaIssueNow);
  const testFn = useServerFn(sendCaIssueTest);
  const settingsFn = useServerFn(getMagazineSettings);
  const settingsQ = useQuery({ queryKey: ["caSettings"], queryFn: () => settingsFn() });
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [when, setWhen] = useState("");

  const posted = issue?.status === "posted" || issue?.status === "posting";
  const postTime = settingsQ.data?.post_time ?? "10:00";
  const defaultWhen =
    kind === "daily"
      ? `Posts ${timeIst(dailyPostTime(period, postTime).toISOString())} (IST)`
      : "Posts as soon as you approve, or at the time you pick";

  async function run(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label);
    try {
      await fn();
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      setBusy(null);
    }
  }

  async function showPreview() {
    setBusy("preview");
    try {
      const { html, count } = await previewFn({ data: { kind, period } });
      if (!count) toast.warning("No written items yet; the preview shows only the cover.");
      setPreview(html);
    } catch (e) {
      toast.error(errorText(e, "Couldn't build the preview"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{kind === "daily" ? "Daily issue" : "Monthly issue"}</span>
        {issue ? (
          <Badge tone={STATUS_TEXT[issue.status].tone}>{STATUS_TEXT[issue.status].label}</Badge>
        ) : (
          <Badge>Not made yet</Badge>
        )}
        {issue?.status === "scheduled" && issue.scheduled_for && (
          <span className="text-xs text-muted-foreground">
            for {timeIst(issue.scheduled_for)} IST
          </span>
        )}
        {issue?.posted_at && (
          <span className="text-xs text-muted-foreground">on {timeIst(issue.posted_at)} IST</span>
        )}
        {issue?.pdf_url && (
          <a
            href={issue.pdf_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <FileText className="h-4 w-4" /> Open PDF
          </a>
        )}
      </div>
      {issue?.error && <p className="text-sm text-destructive">{issue.error}</p>}
      {settingsQ.data && !settingsQ.data.pdf_ready && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          PDF making is not set up yet: add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the
          project's secrets (see Magazine settings). You can still preview.
        </p>
      )}
      {settingsQ.data && !settingsQ.data.channel && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No Telegram channel set yet (Magazine settings).
        </p>
      )}
      {blocking && <p className="text-sm text-amber-700 dark:text-amber-400">{blocking}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={showPreview} disabled={!!busy}>
          <Eye className="mr-1 h-4 w-4" /> {busy === "preview" ? "Preparing…" : "Preview"}
        </Button>
        {!posted && issue?.status !== "scheduled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy || !!blocking}
            onClick={() =>
              run(
                "pdf",
                () => buildFn({ data: { kind, period, schedule: false } }),
                "PDF made. Open it to check, then approve.",
              )
            }
          >
            <FileText className="mr-1 h-4 w-4" /> {busy === "pdf" ? "Making PDF…" : "Make PDF"}
          </Button>
        )}
        {issue?.pdf_path && (
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy}
            onClick={() =>
              run("test", () => testFn({ data: { kind, period } }), "Sent to your test chat")
            }
          >
            <Send className="mr-1 h-4 w-4" /> Send test to me
          </Button>
        )}
        {!posted && (
          <>
            {kind === "monthly" && (
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="h-9 w-56"
                title="Post time (your local time); empty = as soon as approved"
              />
            )}
            <Button
              size="sm"
              disabled={!!busy || !!blocking}
              onClick={() =>
                run(
                  "approve",
                  () =>
                    buildFn({
                      data: {
                        kind,
                        period,
                        schedule: true,
                        when: when ? new Date(when).toISOString() : null,
                      },
                    }),
                  "Approved and scheduled",
                )
              }
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {busy === "approve" ? "Making PDF…" : "Approve & schedule"}
            </Button>
          </>
        )}
        {issue?.status === "scheduled" && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                run("now", () => postFn({ data: { kind, period } }), "Posting within a minute")
              }
            >
              Post now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() =>
                run("cancel", () => cancelFn({ data: { kind, period } }), "Schedule cancelled")
              }
            >
              Cancel schedule
            </Button>
          </>
        )}
        {(issue?.status === "failed" || issue?.status === "cancelled") && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              run("retry", () => postFn({ data: { kind, period } }), "Posting within a minute")
            }
          >
            <RefreshCw className="mr-1 h-4 w-4" /> Post now
          </Button>
        )}
      </div>
      {!posted && (
        <p className="text-xs text-muted-foreground">
          {defaultWhen}. Approving remakes the PDF with your latest edits.
        </p>
      )}

      {preview !== null && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="h-[90dvh] max-w-4xl p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>Magazine preview</DialogTitle>
            </DialogHeader>
            <iframe
              title="Magazine preview"
              srcDoc={preview}
              sandbox="allow-same-origin"
              className="h-full w-full rounded-lg border border-border bg-white"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ====================== Daily ======================

type PendingSource = {
  key: string;
  issue_date: string;
  section: UploadSection;
  source_name: string;
  title: string;
  content: string;
};

function DailyPanel() {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => istDate());
  const dayFn = useServerFn(getCaDay);
  const dayQ = useQuery({ queryKey: ["caDay", date], queryFn: () => dayFn({ data: { date } }) });
  const day = dayQ.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["caDay"] });

  const addFn = useServerFn(addCaSource);
  const extractFn = useServerFn(extractCaSourcePart);
  const enrichFn = useServerFn(enrichCaItem);
  const [section, setSection] = useState<UploadSection>("news");
  const [sourceName, setSourceName] = useState("");
  const [pasted, setPasted] = useState("");
  const [pending, setPending] = useState<PendingSource[]>([]);
  const [work, setWork] = useState<string | null>(null);
  const working = useRef(false);

  // Each uploaded or pasted source is saved, read into items and written up,
  // one at a time, in the order added.
  useEffect(() => {
    if (working.current || pending.length === 0) return;
    working.current = true;
    const next = pending[0];
    (async () => {
      try {
        setWork(`Saving “${next.title}”…`);
        const src = await addFn({ data: next });
        await readSource(src);
        await writeItems(next.issue_date);
      } catch (e) {
        toast.error(`${next.title}: ${errorText(e, "failed")}`);
      } finally {
        setPending((cur) => cur.filter((p) => p.key !== next.key));
        working.current = false;
        setWork(null);
        refresh();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  async function readSource(src: Pick<CaSource, "id" | "title" | "chunks" | "chunks_done">) {
    let created = 0;
    let merged = 0;
    for (let part = src.chunks_done; part < src.chunks; part++) {
      setWork(`Reading “${src.title}” (part ${part + 1} of ${src.chunks})…`);
      const r = await extractFn({ data: { id: src.id, part } });
      created += r.created;
      merged += r.merged;
    }
    toast.success(
      `“${src.title}”: ${created} new item${created === 1 ? "" : "s"}${merged ? `, ${merged} added to existing stories` : ""}`,
    );
  }

  async function writeItems(forDate: string) {
    const fresh = await dayFn({ data: { date: forDate } });
    const todo = fresh.items.filter((i) => i.needs_enrich && i.status === "included");
    for (const [n, item] of todo.entries()) {
      setWork(`Writing the magazine text ${n + 1} of ${todo.length}…`);
      try {
        await enrichFn({ data: { id: item.id } });
      } catch (e) {
        toast.error(`${item.headline.slice(0, 50)}: ${errorText(e, "failed")}`);
      }
    }
  }

  const sectionInfo = UPLOAD_SECTIONS.find((s) => s.id === section)!;
  const queue = useFileQueue({
    medium: "Bilingual",
    resetKey: date,
    cleanup: { enabled: true, phrases: [] },
    onText: (file, text) => {
      setPending((cur) => [
        ...cur,
        {
          key: crypto.randomUUID(),
          issue_date: date,
          section,
          source_name: sourceName.trim() || sectionInfo.source,
          title: file.name.replace(/\.[^.]+$/, ""),
          content: text,
        },
      ]);
      return text;
    },
  });

  function addPasted() {
    const text = pasted.trim();
    if (text.length < 20) return;
    const first = text
      .split("\n")[0]
      .replace(/^#+\s*/, "")
      .slice(0, 120);
    setPending((cur) => [
      ...cur,
      {
        key: crypto.randomUUID(),
        issue_date: date,
        section,
        source_name: sourceName.trim() || sectionInfo.source,
        title: first || `${sectionInfo.label} ${date}`,
        content: text,
      },
    ]);
    setPasted("");
  }

  async function retryAll() {
    if (!day || working.current) return;
    working.current = true;
    try {
      for (const s of day.sources.filter((x) => x.chunks_done < x.chunks)) await readSource(s);
      await writeItems(date);
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      working.current = false;
      setWork(null);
      refresh();
    }
  }

  const items = day?.items ?? [];
  const included = items.filter((i) => i.status === "included");
  const unwritten = included.filter((i) => i.needs_enrich || !i.content).length;
  const unfinished = (day?.sources ?? []).filter((s) => s.chunks_done < s.chunks).length;
  const blocking =
    unwritten || unfinished || work
      ? `${unfinished ? `${unfinished} source(s) not fully read. ` : ""}${unwritten ? `${unwritten} item(s) still need writing. ` : ""}${work ? "Work in progress…" : ""}`.trim()
      : included.length === 0
        ? "Upload the day's sources to make an issue."
        : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDate((d) => shiftDate(d, -1))}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="w-44"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {formatDate(date, "hi")} · {formatDate(date, "en")}
        </span>
      </div>

      <IssueBar
        kind="daily"
        period={date}
        issue={day?.issue ?? null}
        blocking={blocking}
        onChanged={refresh}
      />

      <CollectionBox date={date} onChanged={refresh} />

      {/* Upload */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">Add the day's sources</h3>
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
          <Select value={section} onValueChange={(v) => setSection(v as UploadSection)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UPLOAD_SECTIONS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder={
              sectionInfo.source
                ? `Source name (default: ${sectionInfo.source})`
                : "Source name, e.g. Rajasthan Patrika, The Hindu"
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {sectionInfo.hint}. PDFs are read with LlamaParse and cleaned of headers, footers and page
          numbers.
        </p>
        <FileDropZone onFiles={(files) => queue.add(files)}>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted/40">
            <Upload className="h-5 w-5" />
            Drop PDFs or Word files here, or click to choose
            <input
              type="file"
              multiple
              accept={SAATHI_ACCEPT}
              className="hidden"
              onChange={(e) => {
                queue.add(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        </FileDropZone>
        <FileQueueList queue={queue} />
        <Textarea
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="…or paste text (e.g. a PIB release or Sujas summary)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={addPasted}
            disabled={pasted.trim().length < 20}
          >
            Add pasted text
          </Button>
          {work && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <RefreshCw className="h-4 w-4 animate-spin" /> {work}
              {pending.length > 1 ? ` (${pending.length - 1} more waiting)` : ""}
            </span>
          )}
          {!work && (unwritten > 0 || unfinished > 0) && (
            <Button size="sm" onClick={retryAll}>
              <RefreshCw className="mr-1 h-4 w-4" /> Finish reading and writing
            </Button>
          )}
        </div>
        <SourcesList sources={day?.sources ?? []} onChanged={refresh} />
      </section>

      {day && day.corrections.length > 0 && (
        <CorrectionsBox corrections={day.corrections} onChanged={refresh} />
      )}

      {/* Items */}
      {dayQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : dayQ.error ? (
        <p className="text-sm text-destructive">
          {errorText(dayQ.error, "Couldn't load")}. If this is new, run the current affairs
          migration in the Supabase SQL editor.
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No news items for this day yet.
        </div>
      ) : (
        <ItemsList items={items} onChanged={refresh} />
      )}
    </div>
  );
}

// Ticks rows on and off, keeping only ids still in the list.
function useChosen(ids: string[]) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const key = ids.join(",");
  useEffect(() => {
    const live = new Set(ids);
    setChosen((cur) => {
      const next = new Set([...cur].filter((id) => live.has(id)));
      return next.size === cur.size ? cur : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const toggle = (id: string, on: boolean) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return { chosen, setChosen, toggle };
}

// "Select all", the number selected, and delete buttons for a list.
function BulkBar({
  ids,
  chosen,
  setChosen,
  noun,
  busy,
  onDelete,
}: {
  ids: string[];
  chosen: Set<string>;
  setChosen: (s: Set<string>) => void;
  noun: string;
  busy: boolean;
  onDelete: (ids: string[], all: boolean) => void;
}) {
  const all = ids.length > 0 && ids.every((id) => chosen.has(id));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="inline-flex items-center gap-2">
        <Checkbox
          checked={all}
          onCheckedChange={(v) => setChosen(v === true ? new Set(ids) : new Set())}
          aria-label={`Select all ${noun}`}
        />
        Select all
      </label>
      {chosen.size > 0 && (
        <>
          <span className="text-muted-foreground">{chosen.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete([...chosen], false)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete {chosen.size}
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7 text-destructive hover:text-destructive"
        disabled={busy || !ids.length}
        onClick={() => onDelete(ids, true)}
      >
        Delete all {noun}
      </Button>
    </div>
  );
}

function SourcesList({ sources, onChanged }: { sources: CaSource[]; onChanged: () => void }) {
  const deleteFn = useServerFn(deleteCaSource);
  const bulkFn = useServerFn(deleteCaSources);
  const ids = sources.map((s) => s.id);
  const { chosen, setChosen, toggle } = useChosen(ids);
  const [busy, setBusy] = useState(false);
  if (!sources.length) return null;

  async function deleteMany(list: string[], all: boolean) {
    if (
      !confirm(
        all
          ? `Delete all ${list.length} sources for this day, and the facts and news items that came only from them?`
          : `Delete ${list.length} selected source(s) and the facts that came only from them?`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await bulkFn({ data: { ids: list } });
      setChosen(new Set());
      toast.success(`Deleted ${r.deleted} source(s)`);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <BulkBar
        ids={ids}
        chosen={chosen}
        setChosen={setChosen}
        noun="sources"
        busy={busy}
        onDelete={deleteMany}
      />
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 p-2.5">
            <Checkbox
              checked={chosen.has(s.id)}
              onCheckedChange={(v) => toggle(s.id, v === true)}
              aria-label="Select source"
            />
            <Badge>{UPLOAD_SECTIONS.find((x) => x.id === s.section)?.label}</Badge>
            <span className="min-w-0 flex-1 truncate">
              {s.title}
              {s.source_name ? (
                <span className="text-muted-foreground"> · {s.source_name}</span>
              ) : null}
            </span>
            {s.status === "error" ? (
              <Badge tone="bad" title={s.error ?? ""}>
                Failed
              </Badge>
            ) : s.chunks_done >= s.chunks ? (
              <Badge tone="good">Read</Badge>
            ) : (
              <Badge tone="warn">
                {s.chunks_done}/{s.chunks} parts read
              </Badge>
            )}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete source"
              onClick={async () => {
                if (!confirm("Delete this source and the facts that came only from it?")) return;
                try {
                  await deleteFn({ data: { id: s.id } });
                  onChanged();
                } catch (e) {
                  toast.error(errorText(e, "Couldn't delete"));
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CorrectionsBox({
  corrections,
  onChanged,
}: {
  corrections: DayData["corrections"];
  onChanged: () => void;
}) {
  const decideFn = useServerFn(decideCaCorrection);
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(id: string, approve: boolean) {
    setBusy(id);
    try {
      await decideFn({ data: { id, approve } });
      toast.success(approve ? "Correction applied" : "Correction dismissed");
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> Possible corrections this month
      </h3>
      <p className="text-xs text-muted-foreground">
        A later source seems to change a fact in an earlier item. Approving updates that item; the
        monthly magazine uses the corrected version and lists the change.
      </p>
      <ul className="space-y-2">
        {corrections.map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="font-medium">
              {formatDate(c.item_date, "en")} · {c.headline}
            </div>
            <ul className="mt-1 list-disc pl-5">
              {c.changes.map((ch, i) => (
                <li key={i}>
                  {ch.old_value ? (
                    <>
                      <s className="text-muted-foreground">{ch.old_value}</s> →{" "}
                      <b>{ch.new_value}</b>:{" "}
                    </>
                  ) : null}
                  {ch.new_en}
                  {ch.note ? <span className="text-muted-foreground"> ({ch.note})</span> : null}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy === c.id} onClick={() => decide(c.id, true)}>
                Apply correction
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === c.id}
                onClick={() => decide(c.id, false)}
              >
                Not a change
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemsList({ items, onChanged }: { items: CaItem[]; onChanged: () => void }) {
  const groups = useMemo(() => {
    const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
    const sorted = [...items].sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
        Number(a.status === "dropped") - Number(b.status === "dropped") ||
        a.position - b.position,
    );
    const map = new Map<string, CaItem[]>();
    for (const it of sorted) map.set(it.category, [...(map.get(it.category) ?? []), it]);
    return [...map.entries()];
  }, [items]);
  const included = items.filter((i) => i.status === "included").length;
  const unverified = items.reduce((n, i) => n + i.facts.filter((f) => !f.verified).length, 0);
  const deleteFn = useServerFn(deleteCaItems);
  const ids = items.map((i) => i.id);
  const { chosen, setChosen, toggle } = useChosen(ids);
  const [busy, setBusy] = useState(false);

  async function deleteMany(list: string[], all: boolean) {
    if (
      !confirm(
        all
          ? `Delete all ${list.length} news items for this day? This can't be undone. The sources stay listed but are not read again; to start over, delete the sources too.`
          : `Delete ${list.length} selected news item(s)? This can't be undone. (To keep an item out of the issue without deleting it, use its ✕ button.)`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await deleteFn({ data: { ids: list } });
      setChosen(new Set());
      toast.success(`Deleted ${r.deleted} item(s)`);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <BulkBar
        ids={ids}
        chosen={chosen}
        setChosen={setChosen}
        noun="items"
        busy={busy}
        onDelete={deleteMany}
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="primary">{included} items in the issue</Badge>
        {items.length - included > 0 && <Badge>{items.length - included} dropped</Badge>}
        {unverified > 0 && (
          <Badge
            tone="warn"
            title="The AI's quote for these facts wasn't found word-for-word in the source"
          >
            {unverified} facts to check
          </Badge>
        )}
        <Badge tone="good">
          {items.filter((i) => i.content?.background).length} with background from your notes
        </Badge>
      </div>
      {groups.map(([cat, list]) => (
        <section key={cat} className="space-y-2">
          <h3 className="text-sm font-semibold">
            {categoryLabel(cat).hi} · {categoryLabel(cat).en}
          </h3>
          {list.map((it, i) => (
            <ItemCard
              key={it.id}
              item={it}
              selected={chosen.has(it.id)}
              onSelect={(on) => toggle(it.id, on)}
              above={list[i - 1]}
              below={list[i + 1]}
              onChanged={onChanged}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ItemCard({
  item,
  selected,
  onSelect,
  above,
  below,
  onChanged,
}: {
  item: CaItem;
  selected: boolean;
  onSelect: (on: boolean) => void;
  above?: CaItem;
  below?: CaItem;
  onChanged: () => void;
}) {
  const updateFn = useServerFn(updateCaItem);
  const enrichFn = useServerFn(enrichCaItem);
  const redoFn = useServerFn(redoCaVisual);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const c = item.content;
  const dropped = item.status === "dropped";

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(false);
    }
  }
  const swap = (other?: CaItem) =>
    other &&
    act(async () => {
      await updateFn({ data: { id: item.id, position: other.position } });
      await updateFn({
        data: {
          id: other.id,
          position: item.position === other.position ? item.position + 1 : item.position,
        },
      });
    });
  const unverified = item.facts.filter((f) => !f.verified).length;
  const inVisual = new Set(c?.visual ? (c.visual_covers ?? []) : []);

  return (
    <article
      className={`rounded-2xl border bg-card p-4 ${selected ? "border-primary ring-1 ring-primary/30" : "border-border"} ${dropped ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelect(v === true)}
          className="mt-1"
          aria-label="Select item"
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{c?.headline.hi || item.headline}</div>
          <div className="text-sm text-muted-foreground">{c?.headline.en || ""}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={busy || !above}
            onClick={() => swap(above)}
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy || !below}
            onClick={() => swap(below)}
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy || !c}
            onClick={() => setEditing(true)}
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={dropped ? "outline" : "ghost"}
            disabled={busy}
            onClick={() =>
              act(() =>
                updateFn({ data: { id: item.id, status: dropped ? "included" : "dropped" } }),
              )
            }
          >
            {dropped ? "Include" : <XCircle className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Select
          value={item.category}
          onValueChange={(v) => act(() => updateFn({ data: { id: item.id, category: v } }))}
        >
          <SelectTrigger className="h-7 w-auto gap-1 rounded-full px-2.5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(() => updateFn({ data: { id: item.id, importance: (item.importance % 3) + 1 } }))
          }
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          title="Exam importance (click to change)"
        >
          {"★".repeat(item.importance)}
          {"☆".repeat(3 - item.importance)}
        </button>
        {item.rajasthan && <Badge tone="warn">Rajasthan</Badge>}
        {item.unit && <Badge>{unitLabel(item.unit)}</Badge>}
        {c?.background ? (
          <Badge tone="good" title={item.context_sources.map((s) => s.title).join(", ")}>
            Background: {item.context_sources.map((s) => s.title).join(", ") || "your notes"}
          </Badge>
        ) : (
          c && <Badge>No related notes</Badge>
        )}
        {unverified > 0 ? (
          <Badge tone="warn">{unverified} fact(s) to check</Badge>
        ) : (
          <Badge tone="good">All facts found in source</Badge>
        )}
        {item.related_item_id && <Badge tone="primary">Follow-up of an earlier story</Badge>}
        {item.enrich_error && (
          <Badge tone="bad" title={item.enrich_error}>
            Writing failed
          </Badge>
        )}
        {(item.needs_enrich || !c) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={busy}
            onClick={() => act(() => enrichFn({ data: { id: item.id } }))}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Write text
          </Button>
        )}
      </div>

      {c && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div lang="hi">
            <p>{c.summary.hi}</p>
            <ul className="mt-1 list-disc pl-5">
              {c.points.map((p, i) => (
                <li
                  key={i}
                  className={inVisual.has(i) ? "opacity-40" : undefined}
                  title={
                    inVisual.has(i) ? "Shown in the visual, so not printed as a point" : undefined
                  }
                >
                  {p.hi}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-muted-foreground">
            <p>{c.summary.en}</p>
            <ul className="mt-1 list-disc pl-5">
              {c.points.map((p, i) => (
                <li
                  key={i}
                  className={inVisual.has(i) ? "opacity-40" : undefined}
                  title={
                    inVisual.has(i) ? "Shown in the visual, so not printed as a point" : undefined
                  }
                >
                  {p.en}
                </li>
              ))}
            </ul>
          </div>
          {c.background && (
            <div className="rounded-xl bg-emerald-500/5 p-2 sm:col-span-2">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                पृष्ठभूमि · Background
              </span>
              <p lang="hi">{c.background.hi}</p>
              <p className="text-muted-foreground">{c.background.en}</p>
            </div>
          )}
          {c.dyk && c.dyk.length > 0 && (
            <div className="rounded-xl bg-sky-500/5 p-2 sm:col-span-2">
              <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                क्या आप जानते हैं? · Did you know? (from the web)
              </span>
              <ul className="mt-1 space-y-1.5">
                {c.dyk.map((d, i) => (
                  <li key={d.url + i} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p lang="hi">{d.hi}</p>
                      <p className="text-muted-foreground">{d.en}</p>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline"
                        title={`“${d.quote}”`}
                      >
                        {d.site}
                      </a>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={busy}
                      aria-label="Remove this fact"
                      onClick={() =>
                        act(() =>
                          updateFn({
                            data: {
                              id: item.id,
                              content: { ...c, dyk: c.dyk!.filter((_, j) => j !== i) },
                            },
                          }),
                        )
                      }
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {c && !dropped && (
        <VisualBox
          content={c}
          busy={busy}
          onRemove={() =>
            act(() => updateFn({ data: { id: item.id, content: { ...c, visual: null } } }))
          }
          onRedo={() => act(() => redoFn({ data: { id: item.id } }))}
        />
      )}

      <button
        type="button"
        onClick={() => setShowFacts((v) => !v)}
        className="mt-2 text-xs text-primary hover:underline"
      >
        {showFacts ? "Hide" : "Show"} facts and source quotes ({item.facts.length})
      </button>
      {showFacts && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {item.facts.map((f, i) => (
            <li key={i} className="rounded-lg border border-border p-2">
              <div className="flex items-start gap-1.5">
                {f.verified ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                )}
                <span>
                  {f.text}
                  {f.corrected && <Badge tone="primary">corrected</Badge>}
                </span>
              </div>
              <div className="mt-1 pl-5 italic text-muted-foreground">“{f.quote}”</div>
              {!f.verified && (
                <div className="pl-5 text-amber-700 dark:text-amber-400">
                  This quote wasn't found word-for-word in the source. Check the fact before
                  approving.
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && c && (
        <EditItemDialog
          item={item}
          content={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </article>
  );
}

// The story's visual as it will print, with the revision line.
function VisualBox({
  content,
  busy,
  onRemove,
  onRedo,
}: {
  content: CaContent;
  busy: boolean;
  onRemove: () => void;
  onRedo: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const v = content.visual;
  const html = useMemo(() => (v ? visualPreviewHtml(v) : ""), [v]);
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(Math.min(900, doc.body.scrollHeight + 4));
  };
  return (
    <div className="mt-3 rounded-xl border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <BarChart3 className="h-3.5 w-3.5" />
          {v ? `Visual · ${VISUAL_LABELS[v.type]}` : "No visual"}
        </span>
        {v && (content.visual_covers?.length ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground">
            Shows {content.visual_covers!.length} fact(s), left out of the points
          </span>
        )}
        {!v && (
          <span className="text-xs text-muted-foreground">
            SAATHI found no visual whose numbers all match the facts.
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={onRedo}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> {v ? "Redo visual" : "Make visual"}
          </Button>
          {v && (
            <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {v && (
        <iframe
          ref={frame}
          title="Visual preview"
          srcDoc={html}
          onLoad={() => {
            fit();
            // Web fonts can change the height after load.
            setTimeout(fit, 600);
          }}
          className="mt-2 w-full rounded-lg bg-white"
          style={{ height }}
        />
      )}
      {content.oneliner && (content.oneliner.en || content.oneliner.hi) && (
        <p className="mt-2 text-xs">
          <span className="font-semibold text-muted-foreground">Revision line: </span>
          <span lang="hi">{content.oneliner.hi}</span>
          <span className="text-muted-foreground"> · {content.oneliner.en}</span>
        </p>
      )}
    </div>
  );
}

function BiFields({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: Bi;
  onChange: (v: Bi) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          rows={rows}
          lang="hi"
          value={value.hi}
          onChange={(e) => onChange({ ...value, hi: e.target.value })}
          placeholder="हिंदी"
        />
        <Textarea
          rows={rows}
          value={value.en}
          onChange={(e) => onChange({ ...value, en: e.target.value })}
          placeholder="English"
        />
      </div>
    </div>
  );
}

function EditItemDialog({
  item,
  content,
  onClose,
  onSaved,
}: {
  item: CaItem;
  content: CaContent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateCaItem);
  const [c, setC] = useState<CaContent>(() => JSON.parse(JSON.stringify(content)) as CaContent);
  const [pointsHi, setPointsHi] = useState(content.points.map((p) => p.hi).join("\n"));
  const [pointsEn, setPointsEn] = useState(content.points.map((p) => p.en).join("\n"));
  const [saving, setSaving] = useState(false);
  const empty: Bi = { en: "", hi: "" };

  async function save() {
    const hi = pointsHi
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const en = pointsEn
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const points = Array.from({ length: Math.max(hi.length, en.length) }, (_, i) => ({
      hi: hi[i] ?? "",
      en: en[i] ?? "",
    }));
    const clean = (b: Bi | null) => (b && (b.en.trim() || b.hi.trim()) ? b : null);
    setSaving(true);
    try {
      await updateFn({
        data: {
          id: item.id,
          content: { ...c, points, background: clean(c.background), mains: clean(c.mains) },
        },
      });
      toast.success("Saved");
      onSaved();
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
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <BiFields
            label="Headline"
            value={c.headline}
            onChange={(v) => setC({ ...c, headline: v })}
            rows={1}
          />
          <BiFields
            label="Summary"
            value={c.summary}
            onChange={(v) => setC({ ...c, summary: v })}
            rows={3}
          />
          <div className="space-y-1">
            <Label>Key points (one per line, same order in both)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Textarea
                rows={6}
                lang="hi"
                value={pointsHi}
                onChange={(e) => setPointsHi(e.target.value)}
              />
              <Textarea rows={6} value={pointsEn} onChange={(e) => setPointsEn(e.target.value)} />
            </div>
          </div>
          <BiFields
            label="Why it matters for RAS"
            value={c.why}
            onChange={(v) => setC({ ...c, why: v })}
          />
          <BiFields
            label="Background (empty to remove)"
            value={c.background ?? empty}
            onChange={(v) => setC({ ...c, background: v })}
            rows={3}
          />
          <BiFields
            label="Likely Mains question (empty to remove)"
            value={c.mains ?? empty}
            onChange={(v) => setC({ ...c, mains: v })}
          />
          {c.mcq && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>Practice MCQ</Label>
                <Button size="sm" variant="ghost" onClick={() => setC({ ...c, mcq: null })}>
                  Remove MCQ
                </Button>
              </div>
              <BiFields
                label="Question"
                value={c.mcq.question}
                onChange={(v) => setC({ ...c, mcq: { ...c.mcq!, question: v } })}
              />
              {c.mcq.options.map((o, i) => (
                <div key={i} className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-3"
                    checked={c.mcq!.answer === i}
                    onChange={() => setC({ ...c, mcq: { ...c.mcq!, answer: i } })}
                    aria-label={`Option ${"abcd"[i]} is correct`}
                  />
                  <div className="flex-1">
                    <BiFields
                      label={`Option ${"abcd"[i]}`}
                      value={o}
                      rows={1}
                      onChange={(v) =>
                        setC({
                          ...c,
                          mcq: {
                            ...c.mcq!,
                            options: c.mcq!.options.map((x, j) => (j === i ? v : x)),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              ))}
              <BiFields
                label="Explanation"
                value={c.mcq.explanation}
                onChange={(v) => setC({ ...c, mcq: { ...c.mcq!, explanation: v } })}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====================== Monthly ======================

function MonthlyPanel() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => `${istDate().slice(0, 7)}-01`);
  const monthFn = useServerFn(getCaMonth);
  const q = useQuery({ queryKey: ["caMonth", month], queryFn: () => monthFn({ data: { month } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["caMonth"] });
  const data = q.data;
  const pending = (data?.corrections ?? []).filter((c) => c.status === "pending");
  const applied = (data?.corrections ?? []).filter((c) => c.status === "approved");
  const items = (data?.days ?? []).reduce((n, d) => n + d.items, 0);
  const shiftMonth = (n: number) => {
    const d = new Date(`${month}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-40 text-center font-medium">
          {formatDate(month, "hi", false)} · {formatDate(month, "en", false)}
        </span>
        <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        The monthly magazine collects every included item of the month, grouped by section, using
        the corrected version of any item that changed later in the month, with an “Updates &amp;
        corrections” page and all practice MCQs.
      </div>

      <IssueBar
        kind="monthly"
        period={month}
        issue={data?.issue ?? null}
        blocking={
          items === 0
            ? "No items this month yet."
            : pending.length
              ? `${pending.length} possible correction(s) waiting for your decision (on the Daily page).`
              : null
        }
        onChanged={refresh}
      />

      {data && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="primary">{items} items</Badge>
            <Badge>{data.days.length} days</Badge>
            <Badge tone="good">{applied.length} corrections applied</Badge>
            {pending.length > 0 && <Badge tone="warn">{pending.length} corrections pending</Badge>}
          </div>
          <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {data.days.map((d) => (
              <li
                key={d.date}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5"
              >
                <span>{formatDate(d.date, "en")}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{d.items} items</span>
                  {d.status ? (
                    <Badge tone={STATUS_TEXT[d.status].tone}>{d.status}</Badge>
                  ) : (
                    <Badge tone="warn">not approved</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {applied.length > 0 && (
            <div className="pt-2">
              <div className="text-sm font-medium">Corrections in this month's magazine</div>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {applied.map((c) => (
                  <li key={c.id}>
                    {formatDate(c.item_date, "en")}: {c.summary_en}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ====================== Settings ======================

// Which AI service is failing, in the provider's own words.
function AiServicesBox() {
  const checkFn = useServerFn(checkAiServices);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof checkFn>> | null>(null);
  async function check() {
    setBusy(true);
    try {
      setRows(await checkFn());
    } catch (e) {
      toast.error(errorText(e, "Check failed"));
    } finally {
      setBusy(false);
    }
  }
  const hint = (r: NonNullable<typeof rows>[number]) => {
    if (r.ok) return "";
    if (r.provider.startsWith("Anthropic")) {
      if (r.status === 402 || /credit|billing/i.test(r.message))
        return "Add credits or a payment method at console.anthropic.com → Billing.";
      if (r.status === 401) return "The ANTHROPIC_API_KEY secret is wrong or revoked.";
      if (r.status === 404) return "The model name isn't available to this Anthropic account.";
    }
    if (r.provider.startsWith("Lovable") && (r.status === 402 || r.status === 429))
      return r.status === 402
        ? "Lovable AI credits are used up: add credits in Lovable (Settings → Plans & credits), or add a GEMINI_API_KEY secret so search uses Google directly."
        : "Lovable AI is rate-limiting; try again shortly.";
    return "";
  };
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">AI services</h3>
        <Button size="sm" variant="outline" className="ml-auto" onClick={check} disabled={busy}>
          <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Checking…" : "Check now"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        SAATHI writes with Claude and searches your notes with Gemini embeddings. If students see
        “SAATHI is unavailable”, check here which service refused and why.
      </p>
      {rows && (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.provider} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                {r.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span className="font-medium">{r.provider}</span>
                {r.status > 0 && <Badge tone={r.ok ? "good" : "bad"}>{r.status}</Badge>}
              </div>
              <div className="pl-6 text-xs text-muted-foreground">{r.message}</div>
              {hint(r) && (
                <div className="pl-6 text-xs text-amber-700 dark:text-amber-400">{hint(r)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMagazineSettings);
  const saveFn = useServerFn(saveMagazineSettings);
  const logoFn = useServerFn(uploadMagazineLogo);
  const q = useQuery({ queryKey: ["caSettings"], queryFn: () => getFn() });
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && !form) {
      setForm({ ...q.data, trusted_domains: q.data.trusted_domains.join("\n") });
    }
  }, [q.data, form]);

  if (q.isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const s = q.data!;
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f!, [k]: v }));
  const text = (k: string) => String(form[k] ?? "");

  async function save() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          channel: text("channel"),
          post_time: text("post_time"),
          title_en: text("title_en"),
          title_hi: text("title_hi"),
          brand_line: text("brand_line"),
          accent: text("accent"),
          test_chat_id: text("test_chat_id"),
          add_to_knowledge_base: Boolean(form!.add_to_knowledge_base),
          do_you_know: Boolean(form!.do_you_know),
          trusted_domains: text("trusted_domains")
            .split(/[\s,]+/)
            .filter(Boolean),
          auto_collect: Boolean(form!.auto_collect),
          collect_time: text("collect_time"),
          notify_when_ready: Boolean(form!.notify_when_ready),
          visuals: Boolean(form!.visuals),
        },
      });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["caSettings"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(kind: "main" | "partner", file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("Use a PNG, JPG or WebP image");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("Logos can be at most 2 MB");
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    try {
      await logoFn({ data: { kind, contentType: file.type as "image/png", base64: btoa(binary) } });
      toast.success("Logo uploaded");
      qc.invalidateQueries({ queryKey: ["caSettings"] });
    } catch (e) {
      toast.error(errorText(e, "Upload failed"));
    }
  }

  const field = (k: string, label: string, placeholder = "", hint = "") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={text(k)} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">Telegram channel</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {field(
            "channel",
            "Channel",
            "@yourchannel or -100…",
            "Add the bot to the channel as an admin with “Post messages”.",
          )}
          {field(
            "post_time",
            "Daily post time (IST)",
            "10:00",
            "A day's issue is posted the next day at this time.",
          )}
          {field(
            "test_chat_id",
            "Your chat id for tests",
            "123456789",
            "Send /start to the bot, then find your id in Bot users.",
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">Look of the magazine</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("title_hi", "Title (Hindi)")}
          {field("title_en", "Title (English)")}
          {field("brand_line", "Brand line", "FlashGyan by RASbandhu")}
          <div className="space-y-1">
            <Label>Accent colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={text("accent")}
                onChange={(e) => set("accent", e.target.value)}
                className="h-9 w-12 rounded border border-border"
              />
              <Input
                value={text("accent")}
                onChange={(e) => set("accent", e.target.value)}
                className="w-32"
              />
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["main", "partner"] as const).map((kind) => {
            const url = kind === "main" ? s.logo_main_url : s.logo_partner_url;
            return (
              <div key={kind} className="space-y-2 rounded-xl border border-border p-3">
                <Label>
                  {kind === "main" ? "Main logo (FlashGyan)" : "Partner logo (RASbandhu)"}
                </Label>
                <div className="flex h-16 items-center justify-center rounded-lg bg-muted/40">
                  {url ? (
                    <img src={url} alt="" className="max-h-14 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo yet</span>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload PNG / JPG
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLogo(kind, f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <AiServicesBox />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">SAATHI and PDF</h3>
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.add_to_knowledge_base)}
            onCheckedChange={(v) => set("add_to_knowledge_base", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Add approved issues to SAATHI's knowledge base</span>
            <span className="block text-muted-foreground">
              Each approved day becomes a “Current Affairs” document, so students can ask SAATHI
              about recent events.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <Switch checked={Boolean(form.visuals)} onCheckedChange={(v) => set("visuals", v)} />
          <span className="text-sm">
            <span className="font-medium">Add a visual to each story</span>
            <span className="block text-muted-foreground">
              SAATHI picks a chart, table, timeline, flow chart, key-number cards or a mind map for
              each story, built only from its facts. A visual with any number that isn't in the
              facts is rejected. Every issue also gets a 60-second revision page.
            </span>
          </span>
        </label>
        <div className="text-sm">
          PDF making (Cloudflare):{" "}
          {s.pdf_ready ? <Badge tone="good">Ready</Badge> : <Badge tone="warn">Not set up</Badge>}
          {!s.pdf_ready && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Copy your Account ID: it's the 32-character code in the address bar after
                dash.cloudflare.com/ (also shown under Workers &amp; Pages).
              </li>
              <li>
                Profile icon → My Profile → API Tokens → Create Token → Create Custom Token. Under
                Permissions choose Account → “Browser Run” (called “Browser Rendering” on older
                dashboards; type “Browser” in the search box) → Edit. Under Account Resources
                include your account.
              </li>
              <li>
                Add both to the project's secrets as CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
              </li>
            </ol>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">“Did you know?” facts from the web</h3>
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.do_you_know)}
            onCheckedChange={(v) => set("do_you_know", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Add a “क्या आप जानते हैं? / Did you know?” box</span>
            <span className="block text-muted-foreground">
              For each news item SAATHI searches the trusted websites below (Tavily) and adds up to
              3 related facts, each quoted word for word from its page and credited to the site.
              Facts whose quote isn't found on the page are dropped. Review them like everything
              else.
            </span>
          </span>
        </label>
        <div className="text-sm">
          Web search (Tavily):{" "}
          {s.web_search_ready ? (
            <Badge tone="good">Ready</Badge>
          ) : (
            <Badge tone="warn">Add TAVILY_API_KEY to the project's secrets</Badge>
          )}
        </div>
        <div className="space-y-1">
          <Label>Trusted websites (one per line; subdomains included)</Label>
          <Textarea
            rows={6}
            value={text("trusted_domains")}
            onChange={(e) => set("trusted_domains", e.target.value)}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            gov.in also covers pib.gov.in, rajasthan.gov.in and other government sites.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">Automatic news collection</h3>
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.auto_collect)}
            onCheckedChange={(v) => set("auto_collect", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Collect the day's news from the websites below</span>
            <span className="block text-muted-foreground">
              At the time below SAATHI reads each website's latest articles, picks the ones that
              matter for RAS, fetches their text and writes the day's draft. Nothing is posted until
              you approve it.
            </span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {field(
            "collect_time",
            "Collection time (IST)",
            "21:00",
            "Late evening catches the whole day's news.",
          )}
        </div>
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.notify_when_ready)}
            onCheckedChange={(v) => set("notify_when_ready", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Message me on Telegram when the draft is ready</span>
            <span className="block text-muted-foreground">
              Sent to your chat id for tests, with a link to review it.
            </span>
          </span>
        </label>
        <WatchSitesSettings />
      </section>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
