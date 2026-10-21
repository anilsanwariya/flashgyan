// Admin: daily and monthly current affairs magazine. Upload the day's sources,
// review the news items SAATHI writes from them, approve the issue and it is
// posted to the Telegram channels as an English PDF and a Hindi PDF.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  FolderOpen,
  FileText,
  Layers,
  RefreshCw,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { DEFAULT_MIN_RAJASTHAN, rajasthanBalance, type RajasthanBalance } from "@/lib/ca-report";
import {
  addCaSource,
  buildCaIssue,
  checkAiServices,
  cancelCaIssue,
  decideCaCorrection,
  deleteCaSource,
  deleteCaSources,
  enrichCaItem,
  extractCaSourcePart,
  getCaDay,
  getCaSkippedSummary,
  getCaStyleCheck,
  getCaLangCheck,
  getCaMonth,
  sendCaWeeklyReport,
  getMagazineSettings,
  mergeCaDuplicates,
  postCaIssueNow,
  previewCaIssue,
  saveMagazineSettings,
  sendCaIssueTest,
  uploadMagazineLogo,
  type CaIssue,
  type CaSource,
  type DayData,
} from "@/lib/current-affairs.functions";
import {
  UPLOAD_SECTIONS,
  dailyPostTime,
  formatDate,
  istDate,
  type UploadSection,
  DEFAULT_SUMMARY_WORDS,
  MAX_SUMMARY_WORDS,
  MIN_SUMMARY_WORDS,
  clampSummaryWords,
} from "@/lib/current-affairs";
import { CollectionBox, WatchSitesSettings } from "@/components/ca-collect-panel";
import { StoryList } from "@/components/ca-story-review";
import { SkippedNews } from "@/components/ca-skipped-news";
import { DayChecklist } from "@/components/ca-day-checklist";
import { FactCheckDialog } from "@/components/ca-fact-check";
import { StyleCheckDialog } from "@/components/ca-style-check";
import { LangCheckDialog } from "@/components/ca-lang-check";
import { HouseStyle } from "@/components/ca-house-style";
import { Glossary } from "@/components/ca-glossary-panel";
import { dayChecklist, type CheckAction } from "@/lib/ca-checklist";
import { styleStatus } from "@/lib/ca-style";
import { langStatus } from "@/lib/ca-bilingual";
import { FeatureBox } from "@/components/ca-feature-box";
import { Badge, BulkBar, errorText, useChosen } from "@/components/ca-ui";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CaSection = "daily" | "monthly" | "settings";

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
  warnings = [],
  onChanged,
}: {
  kind: "daily" | "monthly";
  period: string;
  issue: CaIssue | null;
  // Why the issue can't be approved yet, if anything.
  blocking: string | null;
  // What the day's checklist still has open: approving asks first.
  warnings?: string[];
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

  async function showPreview(lang: "en" | "hi") {
    setBusy(`preview-${lang}`);
    try {
      const { html, count } = await previewFn({ data: { kind, period, lang } });
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
        {/* Set-up still missing: a quiet note that leads to the settings. */}
        {settingsQ.data && !settingsQ.data.pdf_ready && (
          <a
            href="/admin?section=ca.settings"
            title="Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the project's secrets. You can still preview."
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:underline dark:bg-amber-500/15 dark:text-amber-300"
          >
            PDF not set up
          </a>
        )}
        {settingsQ.data && !settingsQ.data.channel && (
          <a
            href="/admin?section=ca.settings"
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:underline dark:bg-amber-500/15 dark:text-amber-300"
          >
            No channel set
          </a>
        )}
        {issue?.pdf_url && (
          <span className="ml-auto flex flex-wrap gap-3">
            {/* The English issue, and the Hindi issue (none on older bilingual issues). */}
            <a
              href={issue.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" /> {issue.pdf_url_hi ? "English PDF" : "Open PDF"}
            </a>
            {issue.pdf_url_hi && (
              <a
                href={issue.pdf_url_hi}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <FileText className="h-4 w-4" /> Hindi PDF
              </a>
            )}
          </span>
        )}
      </div>
      {issue?.error && <p className="text-sm text-destructive">{issue.error}</p>}
      {blocking && <p className="text-sm text-amber-700 dark:text-amber-400">{blocking}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {(["en", "hi"] as const).map((lang) => (
          <Button
            key={lang}
            variant="outline"
            size="sm"
            onClick={() => void showPreview(lang)}
            disabled={!!busy}
          >
            <Eye className="mr-1 h-4 w-4" />{" "}
            {busy === `preview-${lang}`
              ? "Preparing…"
              : lang === "en"
                ? "Preview English"
                : "Preview Hindi"}
          </Button>
        ))}
        {!posted && issue?.status !== "scheduled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy || !!blocking}
            onClick={() =>
              run(
                "pdf",
                () => buildFn({ data: { kind, period, schedule: false } }),
                "PDFs made. Open them to check, then approve.",
              )
            }
          >
            <FileText className="mr-1 h-4 w-4" /> {busy === "pdf" ? "Making PDFs…" : "Make PDFs"}
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
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Post at
                <Input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="h-9 w-56"
                  aria-label="Post at"
                  title="Your local time; leave empty to post as soon as you approve"
                />
              </label>
            )}
            <Button
              size="sm"
              disabled={!!busy || !!blocking}
              onClick={() =>
                (!warnings.length ||
                  confirm(
                    `Still to do:\n${warnings.map((w) => `• ${w}`).join("\n")}\n\nApprove and schedule anyway?`,
                  )) &&
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
              {busy === "approve" ? "Making PDFs…" : "Approve & schedule"}
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
          {kind === "monthly" && when
            ? `Posts ${new Date(when).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
            : defaultWhen}
          . Approving remakes both PDFs with your latest edits.
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

// RPSC asks a lot about Rajasthan: flags a day with too few Rajasthan stories.
function RajasthanWarning({ balance }: { balance: RajasthanBalance }) {
  if (!balance.short) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-medium">
          Only {balance.rajasthan} Rajasthan {balance.rajasthan === 1 ? "story" : "stories"} of{" "}
          {balance.included} today (aim for at least {balance.min}).
        </p>
        <p className="text-muted-foreground">
          {balance.droppedRajasthan > 0
            ? `${balance.droppedRajasthan} Rajasthan ${balance.droppedRajasthan === 1 ? "story" : "stories"} arrived dropped: they are at the bottom of the list below; press “Include” to bring one back. `
            : ""}
          For more every day, add Rajasthan sources in Magazine settings → Websites to watch (DIPR
          district pages, Rajasthan Patrika or Bhaskar city pages) or upload a Sujas summary.
        </p>
      </div>
    </div>
  );
}

function DailyPanel() {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => istDate());
  const dayFn = useServerFn(getCaDay);
  const dayQ = useQuery({ queryKey: ["caDay", date], queryFn: () => dayFn({ data: { date } }) });
  const day = dayQ.data;
  const daySettingsFn = useServerFn(getMagazineSettings);
  const daySettingsQ = useQuery({ queryKey: ["caSettings"], queryFn: () => daySettingsFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["caDay"] });
  // The day's checklist: what the review list and the skipped news report,
  // and where its buttons go.
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [skippedStats, setSkippedStats] = useState<{ worth: number; unranked: number } | null>(
    null,
  );
  const [storyJump, setStoryJump] = useState<{ id: string; n: number } | null>(null);
  const [skippedSignal, setSkippedSignal] = useState(0);
  const [factsOpen, setFactsOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  // Sources & collection: open on its own while the day has no stories or
  // work is going on, until opened or closed by hand.
  const [sourcesOpen, setSourcesOpen] = useState<boolean | null>(null);
  useEffect(() => setSourcesOpen(null), [date]);
  // A link from the Telegram message: the day, and fact-check mode or the
  // house style check.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
    if (p.get("open") === "facts") setFactsOpen(true);
    if (p.get("open") === "style") setStyleOpen(true);
    if (p.get("open") === "lang") setLangOpen(true);
  }, []);
  // Until the skipped news list is opened, its last saved counts (kept up to
  // date by the evening collection's ranking).
  const skippedSummaryFn = useServerFn(getCaSkippedSummary);
  const skippedSummaryQ = useQuery({
    queryKey: ["caDay", date, "skippedSummary"],
    queryFn: () => skippedSummaryFn({ data: { date } }),
    enabled: (day?.sources.length ?? 0) > 0,
  });
  // The last house style check (when there are rules).
  const styleRules = daySettingsQ.data?.style_rules ?? [];
  const styleFn = useServerFn(getCaStyleCheck);
  const styleQ = useQuery({
    queryKey: ["caDay", date, "styleCheck"],
    queryFn: () => styleFn({ data: { date } }),
    enabled: styleRules.length > 0,
  });
  // SAATHI's last comparison of names in Hindi and English.
  const langFn = useServerFn(getCaLangCheck);
  const langQ = useQuery({
    queryKey: ["caDay", date, "langCheck"],
    queryFn: () => langFn({ data: { date } }),
  });

  const addFn = useServerFn(addCaSource);
  const extractFn = useServerFn(extractCaSourcePart);
  const enrichFn = useServerFn(enrichCaItem);
  const mergeFn = useServerFn(mergeCaDuplicates);
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

  // Same news printed as several stories becomes one story, written again.
  async function mergeDuplicates() {
    if (working.current) return;
    working.current = true;
    try {
      setWork("Looking for stories that are the same news…");
      const r = await mergeFn({ data: { date } });
      if (!r.removed) {
        toast.success("No duplicate stories found");
      } else {
        toast.success(
          `Merged ${r.removed + r.groups} stories into ${r.groups}. Writing the merged ${r.groups === 1 ? "story" : "stories"} again…`,
        );
        refresh();
        await writeItems(date);
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't merge duplicates"));
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
  const dayCorrections = (day?.corrections ?? []).filter((c) => c.item_date === date).length;
  const style = styleStatus(styleQ.data ?? null, items, styleRules);
  const lang = langQ.isSuccess
    ? langStatus(langQ.data ?? null, items, daySettingsQ.data?.glossary ?? [])
    : null;
  const checks = dayChecklist({
    items,
    reviewed,
    unfinishedSources: unfinished,
    corrections: dayCorrections,
    skipped:
      skippedStats ??
      (skippedSummaryQ.data
        ? { worth: skippedSummaryQ.data.worth, unranked: skippedSummaryQ.data.unranked }
        : null),
    minRajasthan: daySettingsQ.data?.min_rajasthan ?? DEFAULT_MIN_RAJASTHAN,
    target: daySettingsQ.data?.daily_stories ?? 0,
    style: styleQ.isSuccess ? style : null,
    lang,
  });
  const issueDone =
    day?.issue?.status === "posted" || day?.issue?.status === "posting" || !included.length;
  const showSources =
    sourcesOpen ?? (items.length === 0 || !!work || unfinished > 0 || pending.length > 0);
  const sourceCount = day?.sources.length ?? 0;
  const sourcesLine = [
    sourceCount ? `${sourceCount} source${sourceCount === 1 ? "" : "s"}` : "No sources yet",
    work ?? (unfinished ? `${unfinished} not fully read` : null),
    skippedStats?.worth ? `${skippedStats.worth} skipped worth a story` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  function onCheck(a: CheckAction) {
    if (a.kind === "story") setStoryJump({ id: a.id, n: Date.now() });
    else if (a.kind === "skipped") {
      setSourcesOpen(true);
      setSkippedSignal(Date.now());
    } else if (a.kind === "write") void retryAll();
    else if (a.kind === "facts") setFactsOpen(true);
    else if (a.kind === "style") setStyleOpen(true);
    else if (a.kind === "lang") setLangOpen(true);
    else document.getElementById("ca-corrections")?.scrollIntoView({ behavior: "smooth" });
  }

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
        warnings={issueDone ? [] : checks.filter((c) => c.state === "todo").map((c) => c.text)}
        onChanged={refresh}
      />

      {!issueDone && <DayChecklist checks={checks} onAction={onCheck} />}
      <FactCheckDialog
        date={date}
        open={factsOpen}
        onOpenChange={setFactsOpen}
        onChanged={refresh}
      />
      <StyleCheckDialog
        date={date}
        open={styleOpen}
        onOpenChange={setStyleOpen}
        status={style}
        checkedAt={styleQ.data?.at ?? null}
        rules={styleRules.length}
        items={included}
        onChanged={refresh}
        onOpenStory={(id) => setStoryJump({ id, n: Date.now() })}
      />
      <LangCheckDialog
        date={date}
        open={langOpen}
        onOpenChange={setLangOpen}
        status={lang}
        checkedAt={langQ.data?.at || null}
        items={included}
        onChanged={refresh}
        onOpenStory={(id) => setStoryJump({ id, n: Date.now() })}
      />

      {day && day.corrections.length > 0 && (
        <div id="ca-corrections" className="scroll-mt-20">
          <CorrectionsBox corrections={day.corrections} onChanged={refresh} />
        </div>
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
          No news items for this day yet. Add the day’s sources below, or collect them from the
          websites.
        </div>
      ) : (
        <>
          <RajasthanWarning
            balance={rajasthanBalance(
              items,
              daySettingsQ.data?.min_rajasthan ?? DEFAULT_MIN_RAJASTHAN,
            )}
          />
          <StoryList
            items={items}
            date={date}
            onChanged={refresh}
            jump={storyJump}
            onReviewed={setReviewed}
          />
        </>
      )}
      {/* Sources and collection: needed while the day is put together, then
          folded under the stories. Kept mounted so the skipped news still
          reports to the checklist. */}
      <section className="rounded-2xl border border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setSourcesOpen(!showSources)}
          aria-expanded={showSources}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Sources & collection</span>
            <span className="block text-xs text-muted-foreground">{sourcesLine}</span>
          </span>
          {showSources ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className={showSources ? "space-y-5 px-2 pb-2 sm:px-3 sm:pb-3" : "hidden"}>
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
              {sectionInfo.hint}. PDFs are read with LlamaParse and cleaned of headers, footers and
              page numbers.
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

          <SkippedNews
            date={date}
            sourceCount={day?.sources.length ?? 0}
            onChanged={refresh}
            openSignal={skippedSignal}
            onStats={setSkippedStats}
          />

          {items.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
              <Button size="sm" variant="outline" disabled={!!work} onClick={mergeDuplicates}>
                <Layers className="mr-1 h-4 w-4" /> Merge duplicates
              </Button>
              <span className="text-xs text-muted-foreground">
                Finds stories that are the same news (e.g. one scheme in several PIB releases) and
                combines their facts into one story. New sources are checked this way as they
                arrive.
              </span>
            </div>
          )}
        </div>
      </section>
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
      const r = await decideFn({ data: { id, approve } });
      toast.success(
        !approve
          ? "Correction dismissed"
          : r.noted
            ? "Correction applied and posted to the channel"
            : "Correction applied",
      );
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

      {items > 0 && <FeatureBox month={month} />}

      {data && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="primary">{items} items</Badge>
            <Badge>{data.days.length} days</Badge>
            <Badge tone="good">{applied.length} corrections applied</Badge>
            {pending.length > 0 && <Badge tone="warn">{pending.length} corrections pending</Badge>}
          </div>
          <MonthCalendar month={month} days={data.days} />
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

// The month's days at a glance: how many stories each had and whether its
// issue went out. A day opens on the Daily page.
const CELL_TONES = {
  muted: "border-border bg-muted/40",
  primary: "border-primary/40 bg-primary/10",
  warn: "border-amber-400/60 bg-amber-500/10",
  good: "border-emerald-500/40 bg-emerald-500/10",
  bad: "border-destructive/50 bg-destructive/10",
} as const;

function MonthCalendar({
  month,
  days,
}: {
  month: string;
  days: { date: string; items: number; status: CaIssue["status"] | null }[];
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = new Date(`${month}T00:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  // Weeks start on Monday.
  const lead = (first.getUTCDay() + 6) % 7;
  const today = istDate();
  const cells = Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(i + 1);
    return d.toISOString().slice(0, 10);
  });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label="Days of the month">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`x${i}`} aria-hidden />
        ))}
        {cells.map((date) => {
          const d = byDate.get(date);
          const future = date > today;
          const tone = d?.status ? STATUS_TEXT[d.status].tone : d?.items ? "warn" : "muted";
          const state = d?.status
            ? STATUS_TEXT[d.status].label
            : d?.items
              ? "Not approved"
              : future
                ? "Still to come"
                : "No issue";
          return (
            <li key={date}>
              <a
                href={`/admin?section=ca.daily&date=${date}`}
                title={`${formatDate(date, "en")}: ${d?.items ?? 0} stories · ${state}`}
                aria-label={`${formatDate(date, "en")}: ${d?.items ?? 0} stories, ${state}`}
                className={`flex min-h-14 flex-col rounded-lg border p-1 text-left text-xs hover:ring-2 hover:ring-primary/30 sm:p-1.5 ${future && !d ? "border-dashed border-border opacity-50" : CELL_TONES[tone]} ${date === today ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-semibold">{Number(date.slice(8))}</span>
                {!!d?.items && (
                  <span className="mt-auto text-[10px] text-muted-foreground sm:text-[11px]">
                    {d.items}
                    <span className="hidden sm:inline"> stories</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {(
          [
            ["good", "Posted"],
            ["primary", "Scheduled"],
            ["warn", "Not approved"],
            ["bad", "Failed"],
            ["muted", "No issue"],
          ] as const
        ).map(([t, label]) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={`h-3 w-3 rounded border ${CELL_TONES[t]}`} /> {label}
          </span>
        ))}
      </div>
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
    if (r.provider.startsWith("Google")) {
      if (r.status === 429)
        return "Google's free quota is used up for now; wait, or enable billing for the key at aistudio.google.com.";
      if (r.status === 400 || r.status === 403)
        return "The GEMINI_API_KEY secret is wrong, or the Gemini API isn't enabled for it (aistudio.google.com → API keys).";
    }
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
        SAATHI writes with Claude (ANTHROPIC_API_KEY) and searches your notes with Google Gemini
        embeddings (GEMINI_API_KEY). If students see “SAATHI is unavailable”, check here which
        service refused and why.
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

const SETTINGS_PARTS = [
  ["set-channel", "Channel"],
  ["set-look", "Look"],
  ["set-ai", "AI services"],
  ["set-saathi", "SAATHI & PDF"],
  ["set-factbite", "Fact Bite"],
  ["set-collect", "Collection"],
  ["set-style", "House style"],
  ["set-glossary", "Glossary"],
] as const;

function SettingsPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMagazineSettings);
  const reportFn = useServerFn(sendCaWeeklyReport);
  const [reporting, setReporting] = useState(false);
  async function sendReport() {
    setReporting(true);
    try {
      const r = await reportFn();
      if (r.sent) toast.success("Weekly report sent to your test chat");
      else toast.error("Set your chat id for tests (and TELEGRAM_BOT_TOKEN) first");
    } catch (e) {
      toast.error(errorText(e, "Couldn't send the report"));
    } finally {
      setReporting(false);
    }
  }
  const saveFn = useServerFn(saveMagazineSettings);
  const logoFn = useServerFn(uploadMagazineLogo);
  const q = useQuery({ queryKey: ["caSettings"], queryFn: () => getFn() });
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  // The form as last loaded or saved, to tell when something changed.
  const [base, setBase] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && !form) {
      // House style rules are edited (and saved) on their own, below.
      const { style_rules: _rules, glossary: _glossary, ...rest } = q.data;
      const loaded = {
        ...rest,
        trusted_domains: q.data.trusted_domains.join("\n"),
        daily_stories: String(q.data.daily_stories),
        daily_editorials: String(q.data.daily_editorials),
        summary_words: String(q.data.summary_words),
        channel_quiz_count: String(q.data.channel_quiz_count),
        min_rajasthan: String(q.data.min_rajasthan),
      };
      setForm(loaded);
      setBase(JSON.stringify(loaded));
    }
  }, [q.data, form]);
  const changed = !!form && JSON.stringify(form) !== base;
  // Leaving the page with changes not saved asks first.
  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

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
          tagline_en: text("tagline_en"),
          tagline_hi: text("tagline_hi"),
          box_static: text("box_static"),
          box_dyk: text("box_dyk"),
          box_why: text("box_why"),
          join_text: text("join_text"),
          join_url: text("join_url"),
          accent: text("accent"),
          test_chat_id: text("test_chat_id"),
          add_to_knowledge_base: Boolean(form!.add_to_knowledge_base),
          add_to_flashcards: Boolean(form!.add_to_flashcards),
          weekly_report: Boolean(form!.weekly_report),
          post_corrections: Boolean(form!.post_corrections),
          min_rajasthan: Math.min(
            20,
            Math.max(0, Math.round(Number(text("min_rajasthan") || "5") || 0)),
          ),
          channel_quiz: Boolean(form!.channel_quiz),
          channel_quiz_count: Math.min(
            10,
            Math.max(1, Math.round(Number(text("channel_quiz_count") || "5") || 5)),
          ),
          do_you_know: Boolean(form!.do_you_know),
          trusted_domains: text("trusted_domains")
            .split(/[\s,]+/)
            .filter(Boolean),
          auto_collect: Boolean(form!.auto_collect),
          collect_time: text("collect_time"),
          notify_when_ready: Boolean(form!.notify_when_ready),
          visuals: Boolean(form!.visuals),
          daily_stories: Number(text("daily_stories")) || 15,
          summary_words: clampSummaryWords(text("summary_words")),
          daily_editorials: Math.min(
            6,
            Math.max(0, Math.round(Number(text("daily_editorials") || "2") || 0)),
          ),
        },
      });
      toast.success("Saved");
      setBase(JSON.stringify(form));
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
      <Input
        aria-label={label}
        value={text(k)}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* The page is long: a link to each part. */}
      <nav aria-label="Parts of the settings" className="flex flex-wrap gap-1.5">
        {SETTINGS_PARTS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>
      <section
        id="set-channel"
        className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <h3 className="font-semibold">Telegram channel</h3>
        <p className="text-sm text-muted-foreground">
          Each day's stories become two issues, an English PDF and a Hindi PDF, both posted to this
          channel. Add the bot to the channel as an admin with “Post messages”.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("channel", "Channel", "@yourchannel or -100…")}
          {field(
            "join_url",
            "Join link",
            "https://t.me/RASbandhu",
            "Linked at the bottom of every page of both issues and on the cover.",
          )}
          {field("join_text", "Join link text", "Join us on Telegram", "English letters only.")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.channel_quiz)}
            onCheckedChange={(v) => set("channel_quiz", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Post a quiz after each daily issue</span>
            <span className="block text-muted-foreground">
              Right after each PDF, the issue's MCQs go to its channel as Telegram quiz polls in
              that issue's language, so readers can test themselves and share them. The same
              questions reach students who turned on the bot's daily quiz (/daily), in the language
              each student picks.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.post_corrections)}
            onCheckedChange={(v) => set("post_corrections", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Post corrections to the channel</span>
            <span className="block text-muted-foreground">
              When you approve a correction to a story whose issue is already posted, a short note
              goes to each channel as a reply under that day's PDF, in that issue's language.
            </span>
          </span>
        </label>
        {form.channel_quiz && (
          <div className="sm:max-w-xs">
            {field(
              "channel_quiz_count",
              "Questions in the channel quiz",
              "5",
              "1 to 10; they go out about 3 seconds apart.",
            )}
          </div>
        )}
      </section>

      <section
        id="set-look"
        className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <h3 className="font-semibold">Look of the magazine</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("title_hi", "Title (Hindi)")}
          {field("title_en", "Title (English)")}
          {field("brand_line", "Brand line", "FlashGyan by RASbandhu")}
          {field(
            "tagline_en",
            "Tagline (English)",
            "For all Rajasthan competitive exams · Special focus: RAS Mains",
            "On the cover and in the post captions.",
          )}
          {field(
            "tagline_hi",
            "Tagline (Hindi)",
            "",
            text("tagline_hi").trim()
              ? "On the Hindi issue's cover and post captions."
              : "Empty: the Hindi issue uses the English tagline.",
          )}
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
        <div className="space-y-1">
          <p className="text-sm font-medium">Story box names</p>
          <p className="text-xs text-muted-foreground">
            Printed the same in the Hindi and English issues.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("box_static", "Static Context box", "Static Context")}
          {field("box_dyk", "Fact Bite box", "Fact Bite")}
          {field("box_why", "Exam Angle box", "Exam Angle")}
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

      <div id="set-ai" className="scroll-mt-20">
        <AiServicesBox />
      </div>

      <section
        id="set-saathi"
        className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <h3 className="font-semibold">SAATHI and PDF</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field(
            "daily_stories",
            "Stories per day",
            "15",
            "Must-know stories always go in, and Rajasthan stories up to twice this number. Others beyond it, and unlikely ones, arrive already dropped; you can bring any back.",
          )}
          {field(
            "min_rajasthan",
            "Minimum Rajasthan stories",
            "5",
            "RPSC asks a lot about Rajasthan. A day with fewer is flagged on its page and in the “draft ready” message. 0 turns the warning off.",
          )}
          {field(
            "summary_words",
            "Summary length (words)",
            String(DEFAULT_SUMMARY_WORDS),
            `About this many words for each story's summary (${MIN_SUMMARY_WORDS} to ${MAX_SUMMARY_WORDS}): the whole news in context. Used for new stories and rewrites; “Write another” in a story can pick a different length.`,
          )}
        </div>
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
          <Switch
            checked={Boolean(form.add_to_flashcards)}
            onCheckedChange={(v) => set("add_to_flashcards", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Add approved issues to the app's flashcards</span>
            <span className="block text-muted-foreground">
              Each story's quick revision question becomes a card in the month's “Current Affairs”
              deck (e.g. “Current Affairs – October 2026”), so students revise current affairs like
              any other subject. Approving a day again updates its cards.
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

      <section
        id="set-factbite"
        className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <h3 className="font-semibold">Fact Bite: related recent developments</h3>
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.do_you_know)}
            onCheckedChange={(v) => set("do_you_know", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Add a “Fact Bite” box</span>
            <span className="block text-muted-foreground">
              For each news item SAATHI adds up to 3 developments of the same kind (other missiles
              tested, other amendments, other new Ramsar sites): first from this magazine's own
              stories of the last 12 months, credited to the issue's date, then from the trusted
              websites below (Tavily). Each line is quoted word for word from its story or page; any
              whose quote isn't found is dropped. You can add more (up to 5) in each story's Fact
              Bite tab. The static concept itself goes in the Static Context box, from your books.
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

      <section
        id="set-collect"
        className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-card p-4"
      >
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
              matter for Rajasthan exams, fetches their text and writes the day's draft. Nothing is
              posted until you approve it.
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
          {field(
            "daily_editorials",
            "Editorials per day",
            "2",
            "Picked from websites marked “Editorials”, on issues RPSC asks in Mains. 0 turns them off.",
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
        <label className="flex items-start gap-3">
          <Switch
            checked={Boolean(form.weekly_report)}
            onCheckedChange={(v) => set("weekly_report", v)}
          />
          <span className="text-sm">
            <span className="font-medium">Send me a weekly report on Telegram</span>
            <span className="block text-muted-foreground">
              Every Sunday from 9 AM, to your chat id for tests: issues posted, stories kept and
              dropped, Rajasthan share, facts not found in their source, stories without a book
              background (and the books needed), SAATHI's 👍/👎 and unanswered questions, and the
              daily quiz's students and streaks.
            </span>
          </span>
        </label>
        <div className="pl-12">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={reporting}
            onClick={sendReport}
          >
            {reporting ? "Sending…" : "Send this week's report now"}
          </Button>
        </div>
        <WatchSitesSettings />
      </section>

      {/* Saving stays in reach, and says when something is waiting. */}
      <div className="sticky bottom-0 z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-t-2xl border border-b-0 border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
        <span
          role="status"
          className={`flex-1 text-sm ${changed ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
        >
          {changed ? "You have changes that aren't saved" : "All settings saved"}
        </span>
        {changed && (
          <Button variant="ghost" disabled={saving} onClick={() => setForm(JSON.parse(base))}>
            Discard
          </Button>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <div id="set-style" className="scroll-mt-20">
        <HouseStyle />
      </div>
      <div id="set-glossary" className="scroll-mt-20">
        <Glossary />
      </div>
    </div>
  );
}
