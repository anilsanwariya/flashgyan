// Admin: automatic news collection from watched websites. The daily page shows
// the day's collection (what was found, what the AI picked) and can run it
// now; the settings page manages the websites.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Globe, Plus, RefreshCw, Trash2 } from "lucide-react";
import { clearCaCollectedDay } from "@/lib/current-affairs.functions";
import {
  deleteCaWatchSite,
  getCaCollection,
  listCaWatchSites,
  runCaCollectionTick,
  saveCaWatchSite,
  setCaArticleStatus,
  setCaArticlesStatus,
  startCaCollection,
  testCaWatchSite,
  type CaArticle,
  type WatchSite,
} from "@/lib/ca-collect.functions";
import { UPLOAD_SECTIONS, type UploadSection } from "@/lib/current-affairs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const TONES = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  bad: "bg-destructive/10 text-destructive",
};

function Pill({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const timeIst = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

const ARTICLE_STATUS: Record<CaArticle["status"], { label: string; tone: keyof typeof TONES }> = {
  found: { label: "Waiting for AI", tone: "muted" },
  selected: { label: "Picked", tone: "primary" },
  parsing: { label: "Reading PDF", tone: "warn" },
  fetched: { label: "Added", tone: "good" },
  failed: { label: "Couldn't read", tone: "bad" },
  skipped: { label: "Not picked", tone: "muted" },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ====================== Daily page ======================

export function CollectionBox({ date, onChanged }: { date: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaCollection);
  const startFn = useServerFn(startCaCollection);
  const tickFn = useServerFn(runCaCollectionTick);
  const statusFn = useServerFn(setCaArticleStatus);
  const bulkFn = useServerFn(setCaArticlesStatus);
  const clearFn = useServerFn(clearCaCollectedDay);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["caCollection", date],
    queryFn: () => getFn({ data: { date } }),
  });
  const [work, setWork] = useState<string | null>(null);
  const [show, setShow] = useState<"picked" | "other">("picked");
  // The websites picked for the next collection (null: picker closed).
  const [pick, setPick] = useState<Set<string> | null>(null);
  const stop = useRef(false);

  // A new day starts with nothing selected.
  useEffect(() => setChosen(new Set()), [date]);

  useEffect(() => {
    stop.current = false;
    return () => {
      stop.current = true;
    };
  }, []);

  const data = q.data;
  const run = data?.run ?? null;
  const reload = () => {
    qc.invalidateQueries({ queryKey: ["caCollection"] });
    onChanged();
  };

  // Runs ticks from this page until the collection is finished. The
  // once-a-minute schedule does the same when this page is closed.
  async function drive(start: boolean, sites?: string[]) {
    if (work) return;
    setWork("Starting…");
    try {
      if (start) await startFn({ data: { date, ...(sites ? { sites } : {}) } });
      for (let i = 0; i < 400 && !stop.current; i++) {
        const r = await tickFn({ data: { origin: window.location.origin } });
        if (r.error) toast.error(r.error);
        if (r.steps.length) setWork(r.steps[r.steps.length - 1]);
        reload();
        const fresh = await getFn({ data: { date } });
        if (!fresh.run || fresh.run.status !== "running") break;
        // Nothing claimed (another tick is working) or waiting for PDFs.
        if (!r.run || r.steps.includes("waiting for PDF parsing")) await sleep(8000);
      }
      toast.success("Collection finished");
    } catch (e) {
      toast.error(errorText(e, "Collection failed"));
    } finally {
      setWork(null);
      reload();
    }
  }

  async function setStatus(a: CaArticle, status: "selected" | "skipped") {
    try {
      await statusFn({ data: { id: a.id, status } });
      reload();
      if (status === "selected") toast.success("Added. Press “Continue” to fetch it now.");
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    }
  }

  async function setMany(status: "selected" | "skipped") {
    const ids = [...chosen];
    try {
      await bulkFn({ data: { ids, status } });
      setChosen(new Set());
      reload();
      toast.success(
        status === "selected"
          ? `${ids.length} added. Press “Continue” to fetch them now.`
          : `${ids.length} removed`,
      );
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    }
  }

  async function clearDay() {
    if (
      !confirm(
        "Clear everything collected from the websites for this day?\n\nThis deletes the articles found, the sources made from them and the news items written only from them. Sources you uploaded yourself stay. Then press “Collect now” to start fresh.",
      )
    )
      return;
    try {
      const r = await clearFn({ data: { date } });
      setChosen(new Set());
      reload();
      toast.success(`Cleared ${r.articles} articles and ${r.sources} sources`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't clear"));
    }
  }

  if (q.error) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h3 className="font-semibold">Automatic collection</h3>
        <p className="mt-1 text-destructive">
          {errorText(q.error, "Couldn't load")}. If this is new, run the news collector migration in
          the Supabase SQL editor.
        </p>
      </section>
    );
  }

  const articles = data?.articles ?? [];
  const siteName = new Map((data?.sites ?? []).map((s) => [s.id, s.name]));
  // Which websites this day's collection read.
  const readNames = (run?.sites ?? []).map((id) => siteName.get(id)).filter(Boolean);
  const readNote = readNames.length
    ? `Read ${readNames.length} of ${data?.sites.length ?? readNames.length} websites: ${readNames.join(", ")}`
    : "";
  const picked = articles.filter((a) => a.status !== "found" && a.status !== "skipped");
  const other = articles.filter((a) => a.status === "found" || a.status === "skipped");
  const count = (st: CaArticle["status"]) => articles.filter((a) => a.status === st).length;
  const list = show === "picked" ? picked : other;
  // Articles already fetched are managed as sources below.
  const canChoose = (a: CaArticle) => a.status !== "fetched" && a.status !== "parsing";
  const selectable = list.filter(canChoose);
  const allChosen = selectable.length > 0 && selectable.every((a) => chosen.has(a.id));
  const chosenRows = articles.filter((a) => chosen.has(a.id));
  const chosenToAdd = chosenRows.filter((a) => a.status !== "selected").length;
  const chosenToRemove = chosenRows.filter((a) => a.status === "selected").length;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Globe className="h-4 w-4" /> Automatic collection from websites
        </h3>
        {run?.started_by === "cleared" ? (
          <Pill>Cleared</Pill>
        ) : run ? (
          <Pill
            tone={run.status === "done" ? "good" : run.status === "failed" ? "bad" : "warn"}
            title={run.error ?? ""}
          >
            {run.status === "done" ? "Done" : run.status === "failed" ? "Failed" : "Running"}
          </Pill>
        ) : (
          <Pill>Not run yet</Pill>
        )}
        <div className="ml-auto flex gap-2">
          {run?.status === "running" && !work && (
            <Button size="sm" onClick={() => drive(false)}>
              <RefreshCw className="mr-1 h-4 w-4" /> Continue
            </Button>
          )}
          {!work && (run || articles.length > 0) && run?.started_by !== "cleared" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={clearDay}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Clear &amp; start fresh
            </Button>
          )}
          {!work && (
            <Button
              size="sm"
              variant={run && run.started_by !== "cleared" ? "outline" : "default"}
              onClick={() => {
                // The picker starts from the websites switched on in Settings.
                const sites = data?.sites ?? [];
                if (!sites.length) {
                  toast.error("Add websites in Magazine settings → Websites to watch first.");
                  return;
                }
                setPick(new Set(sites.filter((s) => s.enabled).map((s) => s.id)));
              }}
            >
              {run && run.started_by !== "cleared" ? "Collect again" : "Collect now"}
            </Button>
          )}
        </div>
      </div>
      {work ? (
        <p className="inline-flex items-center gap-2 text-sm text-primary">
          <RefreshCw className="h-4 w-4 animate-spin" /> {work}
          <span className="text-muted-foreground">
            (keep this page open, or let the schedule finish it)
          </span>
        </p>
      ) : run?.started_by === "cleared" ? (
        <p className="text-xs text-muted-foreground">
          Cleared {timeIst(run.finished_at ?? run.started_at)}. The schedule won't collect this day
          again by itself; press “Collect now” to start fresh.
        </p>
      ) : run ? (
        <p className="text-xs text-muted-foreground">
          Started {timeIst(run.started_at)} ({run.started_by === "admin" ? "by you" : "on schedule"}
          ){run.finished_at ? ` · finished ${timeIst(run.finished_at)}` : ""}
          {readNote ? ` · ${readNote}` : ""}
          {run.error ? ` · last error: ${run.error}` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Every evening SAATHI reads the websites in Settings, picks the exam-relevant news and
          writes it up here for your review. You can also run it now.
        </p>
      )}

      {articles.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Pill tone="good">{count("fetched")} added</Pill>
            {count("selected") + count("parsing") > 0 && (
              <Pill tone="primary">{count("selected") + count("parsing")} to fetch</Pill>
            )}
            {count("failed") > 0 && <Pill tone="bad">{count("failed")} couldn't be read</Pill>}
            <Pill>{count("skipped") + count("found")} not picked</Pill>
            <div className="ml-auto flex rounded-lg border border-border p-0.5">
              {(["picked", "other"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setShow(k);
                    setChosen(new Set());
                  }}
                  className={`rounded-md px-2.5 py-1 ${show === k ? "bg-muted font-medium" : "text-muted-foreground"}`}
                >
                  {k === "picked" ? `Picked (${picked.length})` : `Not picked (${other.length})`}
                </button>
              ))}
            </div>
          </div>
          {selectable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2">
                <Checkbox
                  checked={allChosen}
                  onCheckedChange={(v) =>
                    setChosen(v === true ? new Set(selectable.map((a) => a.id)) : new Set())
                  }
                  aria-label="Select all"
                />
                Select all
              </label>
              {chosen.size > 0 && (
                <>
                  <span className="text-muted-foreground">{chosen.size} selected</span>
                  {chosenToAdd > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => setMany("selected")}
                    >
                      Add {chosenToAdd}
                    </Button>
                  )}
                  {chosenToRemove > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => setMany("skipped")}
                    >
                      Remove {chosenToRemove}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
            {list.length === 0 && (
              <li className="p-3 text-center text-muted-foreground">Nothing here.</li>
            )}
            {list.map((a) => {
              const st = ARTICLE_STATUS[a.status];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 p-2.5">
                  {canChoose(a) ? (
                    <Checkbox
                      checked={chosen.has(a.id)}
                      onCheckedChange={(v) =>
                        setChosen((cur) => {
                          const next = new Set(cur);
                          if (v === true) next.add(a.id);
                          else next.delete(a.id);
                          return next;
                        })
                      }
                      aria-label="Select article"
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  <Pill tone={st.tone} title={a.reason ?? ""}>
                    {st.label}
                  </Pill>
                  <span className="min-w-0 flex-1">
                    <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {a.title}
                      <ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" />
                    </a>
                    <span className="block text-xs text-muted-foreground">
                      {siteName.get(a.site_id ?? "") ?? new URL(a.url).hostname}
                      {a.status === "failed" && a.reason ? ` · ${a.reason}` : ""}
                    </span>
                  </span>
                  {(a.status === "found" || a.status === "skipped" || a.status === "failed") && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(a, "selected")}>
                      {a.status === "failed" ? "Try again" : "Add"}
                    </Button>
                  )}
                  {a.status === "selected" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a, "skipped")}>
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Added articles appear under “Add the day's sources” below; deleting a source there
            removes its facts.
          </p>
        </>
      )}
      {pick && (
        <SitePicker
          sites={data?.sites ?? []}
          pick={pick}
          setPick={setPick}
          again={!!run && run.started_by !== "cleared"}
          onCollect={() => {
            const sites = [...pick];
            setPick(null);
            void drive(true, sites);
          }}
        />
      )}
    </section>
  );
}

// "Collect now": which websites to read this time. Starts from the websites
// switched on in Settings; the choice is for this collection only (Settings
// and the evening collection stay as they are).
function SitePicker({
  sites,
  pick,
  setPick,
  again,
  onCollect,
}: {
  sites: WatchSite[];
  pick: Set<string>;
  setPick: (p: Set<string> | null) => void;
  again: boolean;
  onCollect: () => void;
}) {
  const label = (id: UploadSection) => UPLOAD_SECTIONS.find((u) => u.id === id)?.label ?? id;
  return (
    <Dialog open onOpenChange={(o) => !o && setPick(null)}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect from websites</DialogTitle>
          <DialogDescription>
            {again
              ? "Read the websites again for this day. Articles already added stay; new ones are picked and added."
              : "Pick the websites to read this time. Settings and the evening collection don't change."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex-1 text-muted-foreground">
            {pick.size} of {sites.length} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPick(new Set(sites.map((s) => s.id)))}
          >
            All
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPick(new Set())}>
            None
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Websites">
          {sites.map((s) => {
            const on = pick.has(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                  <Switch
                    checked={on}
                    aria-label={s.name}
                    onCheckedChange={(v) => {
                      const next = new Set(pick);
                      if (v) next.add(s.id);
                      else next.delete(s.id);
                      setPick(next);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {label(s.section)} · {s.language}
                      {!s.enabled ? " · off in Settings" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPick(null)}>
            Cancel
          </Button>
          <Button disabled={!pick.size} onClick={onCollect}>
            Collect from {pick.size} website{pick.size === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ====================== Settings ======================

type SiteForm = {
  id?: string;
  url: string;
  name: string;
  section: UploadSection;
  language: WatchSite["language"];
  max_articles: number;
  enabled: boolean;
};

const EMPTY_SITE: SiteForm = {
  url: "",
  name: "",
  section: "news",
  language: "Hindi",
  max_articles: 10,
  enabled: true,
};

const METHOD_TEXT: Record<string, string> = {
  rss: "RSS feed",
  page: "news page",
  search: "web search",
};

export function WatchSitesSettings() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCaWatchSites);
  const q = useQuery({ queryKey: ["caWatchSites"], queryFn: () => listFn() });
  const [adding, setAdding] = useState(false);
  const [origin, setOrigin] = useState("https://your-site");
  useEffect(() => setOrigin(window.location.origin), []);
  const reload = () => qc.invalidateQueries({ queryKey: ["caWatchSites"] });

  const cronSql = `-- Runs the evening collection even when the admin page is closed.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('ca-collector', '* * * * *',
  $$select net.http_post(url := '${origin}/api/ca/tick', timeout_milliseconds := 120000)$$);`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="font-medium">Websites to watch</h4>
        {!adding && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add website
          </Button>
        )}
      </div>
      {q.error ? (
        <p className="text-sm text-destructive">
          {errorText(q.error, "Couldn't load")}. Run the news collector migration in the Supabase
          SQL editor.
        </p>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {adding && (
            <SiteEditor
              initial={EMPTY_SITE}
              onDone={() => {
                setAdding(false);
                reload();
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {(q.data ?? []).map((s) => (
            <SiteRow key={s.id} site={s} onChanged={reload} />
          ))}
          {!adding && !(q.data ?? []).length && (
            <p className="text-sm text-muted-foreground">No websites yet.</p>
          )}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Run it on schedule (one-time setup)
        </summary>
        <p className="mt-2 text-muted-foreground">
          Run this once in the Supabase SQL editor, from your published site (the address below must
          be the live site, not the preview). It checks every minute; the collection starts at the
          time above and takes 10–30 minutes.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{cronSql}</pre>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => {
            void navigator.clipboard.writeText(cronSql);
            toast.success("Copied");
          }}
        >
          Copy SQL
        </Button>
      </details>
    </div>
  );
}

function SiteRow({ site, onChanged }: { site: WatchSite; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const deleteFn = useServerFn(deleteCaWatchSite);
  const saveFn = useServerFn(saveCaWatchSite);
  if (editing) {
    return (
      <SiteEditor
        initial={{ ...site }}
        onDone={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  const section = UPLOAD_SECTIONS.find((s) => s.id === site.section)?.label ?? site.section;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
      <Switch
        checked={site.enabled}
        aria-label="Watch this website"
        onCheckedChange={async (v) => {
          try {
            await saveFn({ data: { ...site, enabled: v } });
            onChanged();
          } catch (e) {
            toast.error(errorText(e, "Couldn't save"));
          }
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {site.name} <Pill>{section}</Pill> <Pill>{site.language}</Pill>{" "}
          <Pill>up to {site.max_articles}</Pill>
        </div>
        <a
          href={site.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-muted-foreground hover:underline"
        >
          {site.url}
        </a>
        {site.last_run_at && (
          <div className="text-xs">
            {site.last_error ? (
              <span className="text-destructive">
                Last read {timeIst(site.last_run_at)}: {site.last_error}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Last read {timeIst(site.last_run_at)}: {site.last_found ?? 0} links via{" "}
                {METHOD_TEXT[site.last_method ?? ""] ?? site.last_method}
              </span>
            )}
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete website"
        onClick={async () => {
          if (!confirm(`Stop watching ${site.name}?`)) return;
          try {
            await deleteFn({ data: { id: site.id } });
            onChanged();
          } catch (e) {
            toast.error(errorText(e, "Couldn't delete"));
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SiteEditor({
  initial,
  onDone,
  onCancel,
}: {
  initial: SiteForm;
  onDone: () => void;
  onCancel: () => void;
}) {
  const saveFn = useServerFn(saveCaWatchSite);
  const testFn = useServerFn(testCaWatchSite);
  const [f, setF] = useState<SiteForm>(initial);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [test, setTest] = useState<Awaited<ReturnType<typeof testFn>> | null>(null);
  const set = <K extends keyof SiteForm>(k: K, v: SiteForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy("save");
    try {
      await saveFn({
        data: {
          id: f.id,
          url: f.url.trim(),
          name: f.name.trim(),
          section: f.section,
          language: f.language,
          max_articles: f.max_articles,
          enabled: f.enabled,
        },
      });
      toast.success("Saved");
      onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(null);
    }
  }

  async function runTest() {
    setBusy("test");
    setTest(null);
    try {
      setTest(
        await testFn({ data: { url: f.url.trim(), name: f.name.trim(), section: f.section } }),
      );
    } catch (e) {
      toast.error(errorText(e, "Test failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Address</Label>
          <Input
            value={f.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://… (a news page or its RSS feed)"
          />
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Rajasthan Patrika"
          />
        </div>
        <div className="space-y-1">
          <Label>Magazine source type</Label>
          <Select value={f.section} onValueChange={(v) => set("section", v as UploadSection)}>
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
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Language</Label>
            <Select
              value={f.language}
              onValueChange={(v) => set("language", v as SiteForm["language"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["Hindi", "English", "Bilingual"] as const).map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Most articles a day</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={f.max_articles}
              onChange={(e) =>
                set("max_articles", Math.min(50, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={save}
          disabled={busy !== null || !f.url.trim() || !f.name.trim()}
        >
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={runTest}
          disabled={busy !== null || !f.url.trim()}
        >
          {busy === "test" ? "Reading…" : "Test: show today's links"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {test && (
        <div className="space-y-1 text-sm">
          {test.count ? (
            <p>
              Found {test.count} recent article links via {METHOD_TEXT[test.method] ?? test.method}
              {test.error ? ` (the page itself failed: ${test.error})` : ""}:
            </p>
          ) : (
            <p className="text-destructive">
              No article links found{test.error ? `: ${test.error}` : ""}. Try the site's RSS feed
              or a section page instead.
            </p>
          )}
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {test.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {l.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
