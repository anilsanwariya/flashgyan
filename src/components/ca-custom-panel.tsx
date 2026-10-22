// Admin: custom magazines. A theme over any dates (six months of Science &
// Technology, July's sports…): the AI plans the sections, fills them from
// the daily stories with subsections as topics recur, and keeps adding
// stories until the magazine is marked final. Its stories are copies, edited
// on the same story page as the daily ones without changing the archive.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Library,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  buildCaMagPdf,
  createCaMag,
  deleteCaMag,
  fillCaMag,
  getCaMag,
  joinCaMagStories,
  listCaMags,
  placeCaMagStories,
  previewCaMag,
  saveCaMagSections,
  setCaMagStatus,
  splitCaMagTopic,
  takeOutCaMagStory,
  updateCaMag,
  updateCaMagFromDaily,
  writeCaMagTopic,
  type MagItem,
} from "@/lib/ca-mags.functions";
import { enrichCaItem, updateCaItem, type CaItem } from "@/lib/current-affairs.functions";
import { OTHER_SECTION, magPeriod, type CustomMag, type MagSection } from "@/lib/ca-mags";
import { formatDate, istDate } from "@/lib/current-affairs";
import { StoryEditor } from "@/components/ca-story-editor";
import { JobBar, useStoryJobs, type StoryJob } from "@/components/ca-story-jobs";
import type { Lang } from "@/components/ca-story-review";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The magazine open, kept in the address (?mag=…).
function useOpenMag(): [string | null, (id: string | null) => void] {
  const navigate = useNavigate();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("mag"));
  }, []);
  const choose = (next: string | null) => {
    setId(next);
    void navigate({
      to: ".",
      search: (s: Record<string, unknown>) => {
        const { mag: _m, ...rest } = s;
        return next ? { ...rest, mag: next } : rest;
      },
      replace: true,
    } as never);
  };
  return [id, choose];
}

export function CustomMagazines() {
  const [open, setOpen] = useOpenMag();
  return open ? (
    <MagazineView id={open} onBack={() => setOpen(null)} />
  ) : (
    <MagazineList onOpen={setOpen} />
  );
}

// What a magazine still has to do, in words (empty when nothing).
function workLeft(d: { mag: CustomMag; items: MagItem[]; checked: number; total: number }): string {
  if (d.mag.status !== "growing") return "";
  if (d.checked < d.total) return `Sorting stories in: ${d.checked} of ${d.total} checked`;
  const toJoin = d.items.filter(
    (i) => i.mag_grouped === false && !i.mag_parent && !i.mag_combined && i.status === "included",
  ).length;
  if (toJoin) return `Looking for stories on the same topic: ${toJoin} to check`;
  const toWrite = d.items.filter((i) => i.mag_combined && i.needs_enrich && !i.enrich_error).length;
  if (toWrite) return `Writing combined articles: ${toWrite} to write`;
  return "";
}

// The combined articles' actions, for the story rows.
type TopicActions = {
  joined: Map<string, MagItem[]>;
  job: (id: string) => StoryJob | undefined;
  write: (id: string, done: string) => Promise<boolean>;
  split: (id: string) => Promise<void>;
  takeOut: (id: string) => Promise<void>;
  update: (id: string) => Promise<void>;
};
const TopicCtx = createContext<TopicActions | null>(null);

// ====================== The list ======================

function MagazineList({ onOpen }: { onOpen: (id: string) => void }) {
  const listFn = useServerFn(listCaMags);
  const q = useQuery({
    queryKey: ["caMags"],
    queryFn: () => listFn(),
    refetchInterval: (query) =>
      query.state.data?.mags.some((m) => m.status === "growing" && m.checked < m.total)
        ? 30_000
        : false,
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (q.data && !q.data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        Custom magazines need a database update: run the latest migration (ca_custom_magazines) in
        Lovable or the SQL editor, then reload this page.
      </p>
    );
  const mags = q.data?.mags ?? [];
  return (
    <div className="space-y-4">
      <NewMagazine onMade={onOpen} />
      {mags.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Custom magazines">
          {mags.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onOpen(m.id)}
                data-mag={m.title_en}
                className="w-full space-y-1.5 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Library className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{m.title_en}</span>
                  {m.title_hi && (
                    <span className="text-sm text-muted-foreground">{m.title_hi}</span>
                  )}
                  <Badge tone={m.status === "final" ? "good" : "primary"}>
                    {m.status === "final" ? "Final" : "Growing"}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{m.theme}</p>
                <p className="text-xs text-muted-foreground">
                  {magPeriod(m.date_from, m.date_to, "en")} · {m.stories}{" "}
                  {m.stories === 1 ? "story" : "stories"}
                  {m.status === "growing" && m.checked < m.total
                    ? ` · sorting: ${m.checked} of ${m.total} checked`
                    : ""}
                </p>
                {m.error && <p className="text-xs text-destructive">{m.error}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewMagazine({ onMade }: { onMade: (id: string) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createCaMag);
  const today = istDate();
  const [form, setForm] = useState({
    title_en: "",
    title_hi: "",
    theme: "",
    date_from: `${today.slice(0, 4)}-01-01`,
    date_to: today,
  });
  const [busy, setBusy] = useState(false);
  const ok =
    form.title_en.trim().length >= 3 &&
    form.theme.trim().length >= 3 &&
    form.date_from &&
    form.date_to &&
    form.date_from <= form.date_to;
  async function create() {
    setBusy(true);
    try {
      const m = await createFn({ data: form });
      toast.success("Magazine made: SAATHI is sorting the stories into it");
      await qc.invalidateQueries({ queryKey: ["caMags"] });
      onMade(m.id);
    } catch (e) {
      toast.error(errorText(e, "Couldn't make it"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="New magazine"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">New custom magazine</h3>
        <p className="text-sm text-muted-foreground">
          Say what it covers and the dates. SAATHI plans its sections, then fills them from the
          daily stories of those dates (collect past dates on the Monthly page first if they're
          missing), adding subsections as topics recur. It keeps adding new stories until you mark
          it final.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Title (English)"
          placeholder="Title, e.g. Science & Technology Special"
          value={form.title_en}
          maxLength={120}
          onChange={(e) => setForm({ ...form, title_en: e.target.value })}
        />
        <Input
          aria-label="Title (Hindi)"
          placeholder="हिंदी शीर्षक (optional)"
          lang="hi"
          value={form.title_hi}
          maxLength={120}
          onChange={(e) => setForm({ ...form, title_hi: e.target.value })}
        />
      </div>
      <Textarea
        aria-label="What it covers"
        placeholder="What it covers, e.g. Science and technology for RAS: space, defence, health, IT and AI, energy"
        rows={2}
        maxLength={600}
        value={form.theme}
        onChange={(e) => setForm({ ...form, theme: e.target.value })}
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">From</span>
          <Input
            type="date"
            aria-label="From"
            value={form.date_from}
            onChange={(e) => setForm({ ...form, date_from: e.target.value })}
            className="h-9 w-40"
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">To</span>
          <Input
            type="date"
            aria-label="To"
            value={form.date_to}
            onChange={(e) => setForm({ ...form, date_to: e.target.value })}
            className="h-9 w-40"
          />
        </label>
        <Button onClick={() => void create()} disabled={!ok || busy}>
          <Plus className="mr-1 h-4 w-4" />
          {busy ? "Planning the sections…" : "Make magazine"}
        </Button>
      </div>
    </section>
  );
}

// ====================== One magazine ======================

type Group = { section: MagSection; loose: MagItem[]; subs: { id: string; items: MagItem[] }[] };

function MagazineView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaMag);
  const fillFn = useServerFn(fillCaMag);
  const statusFn = useServerFn(setCaMagStatus);
  const pdfFn = useServerFn(buildCaMagPdf);
  const deleteFn = useServerFn(deleteCaMag);
  const placeFn = useServerFn(placeCaMagStories);
  const updateFn = useServerFn(updateCaItem);
  const enrichFn = useServerFn(enrichCaItem);
  const q = useQuery({
    queryKey: ["caMag", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.mag.status === "growing" && workLeft(d) ? 20_000 : false;
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["caMag", id] }),
      qc.invalidateQueries({ queryKey: ["caMags"] }),
    ]);
  const jobs = useStoryJobs(() => void refresh());
  const joinFn = useServerFn(joinCaMagStories);
  const writeTopicFn = useServerFn(writeCaMagTopic);
  const splitFn = useServerFn(splitCaMagTopic);
  const takeOutFn = useServerFn(takeOutCaMagStory);
  const syncFn = useServerFn(updateCaMagFromDaily);
  const once = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      await refresh();
    }
  };
  const topic: TopicActions = {
    joined: new Map(),
    job: (itemId) => jobs.jobs.get(itemId),
    write: (itemId, done) =>
      jobs.run(itemId, "write", () => writeTopicFn({ data: { id: itemId } }), done),
    split: (itemId) => once(() => splitFn({ data: { id: itemId } }), "Taken apart"),
    takeOut: (itemId) => once(() => takeOutFn({ data: { id: itemId } }), "Taken out"),
    update: (itemId) =>
      once(() => syncFn({ data: { id: itemId } }), "Updated from the daily story"),
  };
  const [busy, setBusy] = useState("");
  const [driving, setDriving] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("both");
  const [preview, setPreview] = useState<"en" | "hi" | null>(null);
  const [details, setDetails] = useState(false);

  const data = q.data;
  const mag = data?.mag;
  const items = useMemo(() => data?.items ?? [], [data]);
  const sections = useMemo<MagSection[]>(() => {
    const list = mag?.sections ?? [];
    return items.some((i) => i.mag_section === OTHER_SECTION.id) &&
      !list.some((s) => s.id === OTHER_SECTION.id)
      ? [...list, OTHER_SECTION]
      : list;
  }, [mag, items]);
  // Stories joined into a combined article show under it, not on their own.
  const top = useMemo(() => items.filter((i) => !i.mag_parent), [items]);
  const joined = useMemo(() => {
    const m = new Map<string, MagItem[]>();
    for (const i of items)
      if (i.mag_parent) m.set(i.mag_parent, [...(m.get(i.mag_parent) ?? []), i]);
    return m;
  }, [items]);
  const groups = useMemo<Group[]>(
    () =>
      sections.map((section) => {
        const own = top.filter((i) => i.mag_section === section.id);
        return {
          section,
          loose: own.filter((i) => !i.mag_sub || !section.subs.some((x) => x.id === i.mag_sub)),
          subs: section.subs.map((x) => ({
            id: x.id,
            items: own.filter((i) => i.mag_sub === x.id),
          })),
        };
      }),
    [sections, top],
  );
  // The story page's arrows go through the stories in print order.
  const ordered = useMemo(
    () => groups.flatMap((g) => [...g.loose, ...g.subs.flatMap((s) => s.items)]),
    [groups],
  );

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label);
    try {
      await fn();
      if (done) toast.success(done);
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      setBusy("");
    }
  }

  // Sorts stories in from this page while it's open (the schedule goes on
  // more slowly when it's closed).
  async function drive() {
    if (driving) return;
    setDriving(true);
    stop.current = false;
    try {
      for (let i = 0; i < 500 && !stop.current; i++) {
        const r = await fillFn({ data: { id } });
        await refresh();
        if (r.done) break;
      }
    } catch (e) {
      toast.error(errorText(e, "Sorting stopped"));
    } finally {
      setDriving(false);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !mag)
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All custom magazines
        </Button>
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load it")}</p>
      </div>
    );

  // As printed: a combined article once, not the stories in it.
  const included = top.filter((i) => i.status === "included").length;
  const sorting = mag.status === "growing" && data!.checked < data!.total;
  const work = workLeft(data!);
  const target = (value: string) => {
    const [section, sub] = value.split("|");
    return { section, sub: sub || null };
  };
  const chosenRows = items.filter((i) => chosen.has(i.id));
  const setStatus = (rows: MagItem[], status: "included" | "dropped") =>
    act(
      "status",
      () => Promise.all(rows.map((r) => updateFn({ data: { id: r.id, status } }))),
      status === "dropped"
        ? `${rows.length === 1 ? "Story" : `${rows.length} stories`} left out`
        : `${rows.length === 1 ? "Story" : `${rows.length} stories`} back in`,
    ).then(() => setChosen(new Set()));

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> All custom magazines
      </Button>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {mag.title_en}
              <Badge tone={mag.status === "final" ? "good" : "primary"}>
                {mag.status === "final" ? "Final" : "Growing"}
              </Badge>
            </h2>
            {mag.title_hi && <p className="text-sm">{mag.title_hi}</p>}
            <p className="text-sm text-muted-foreground">
              {magPeriod(mag.date_from, mag.date_to, "en")} · {included}{" "}
              {included === 1 ? "story" : "stories"} · {mag.theme}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setPreview("en")}>
              <Eye className="mr-1 h-4 w-4" /> Preview
            </Button>
            <Button
              size="sm"
              onClick={() =>
                void act("pdf", () => pdfFn({ data: { id } }), "English and Hindi PDFs made")
              }
              disabled={!!busy || !included}
            >
              <FileText className="mr-1 h-4 w-4" />
              {busy === "pdf" ? "Making PDFs…" : "Make PDFs"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDetails(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Details
            </Button>
            {mag.status === "growing" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void act(
                    "status",
                    () => statusFn({ data: { id, status: "final" } }),
                    "Marked final: no more stories are added",
                  )
                }
              >
                <Lock className="mr-1 h-4 w-4" /> Mark final
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void act(
                    "status",
                    () => statusFn({ data: { id, status: "growing" } }),
                    "Growing again",
                  )
                }
              >
                <Unlock className="mr-1 h-4 w-4" /> Keep growing
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete magazine"
              disabled={!!busy}
              onClick={() => {
                if (
                  confirm(
                    `Delete “${mag.title_en}”? Its copies of the stories and your edits to them go; the daily stories stay.`,
                  )
                )
                  void act("delete", () => deleteFn({ data: { id } }), "Magazine deleted").then(
                    onBack,
                  );
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {(mag.pdf_url_en || mag.pdf_url_hi) && (
          <p className="flex flex-wrap gap-3 text-sm">
            {mag.pdf_url_en && (
              <a
                className="text-primary underline"
                href={mag.pdf_url_en}
                target="_blank"
                rel="noreferrer"
              >
                English PDF
              </a>
            )}
            {mag.pdf_url_hi && (
              <a
                className="text-primary underline"
                href={mag.pdf_url_hi}
                target="_blank"
                rel="noreferrer"
              >
                Hindi PDF
              </a>
            )}
            {mag.pdf_at && (
              <span className="text-xs text-muted-foreground">
                made {new Date(mag.pdf_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </span>
            )}
          </p>
        )}
        {mag.status === "growing" && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={work ? "text-primary" : "text-muted-foreground"}>
                {sorting
                  ? `Sorting stories in: ${data!.checked} of ${data!.total} checked`
                  : work
                    ? work
                    : `All ${data!.total} stories of the period checked; new ones are added as they come.`}
              </span>
              {!!work && !driving && (
                <Button size="sm" variant="outline" onClick={() => void drive()}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Speed up
                </Button>
              )}
              {driving && <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
            </div>
            {sorting && (
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Stories checked"
                aria-valuemin={0}
                aria-valuemax={data!.total}
                aria-valuenow={data!.checked}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(data!.checked / Math.max(1, data!.total)) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}
        {mag.error && <p className="text-xs text-destructive">Last problem: {mag.error}</p>}
      </section>

      {chosen.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-background/95 p-2 text-sm shadow-lg backdrop-blur">
          <span className="font-medium">{chosen.size} selected</span>
          <select
            aria-label="Move to"
            value=""
            disabled={!!busy}
            onChange={(e) => {
              if (!e.target.value) return;
              const t = target(e.target.value);
              void act(
                "move",
                () => placeFn({ data: { id, ids: [...chosen], ...t } }),
                "Moved",
              ).then(() => setChosen(new Set()));
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Move to…</option>
            {sections.map((s) => (
              <optgroup key={s.id} label={s.en}>
                <option value={`${s.id}|`}>{s.en}</option>
                {s.subs.map((x) => (
                  <option key={x.id} value={`${s.id}|${x.id}`}>
                    {s.en} › {x.en}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {chosenRows.some((r) => r.status !== "dropped") && (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void setStatus(
                  chosenRows.filter((r) => r.status !== "dropped"),
                  "dropped",
                )
              }
            >
              Leave out
            </Button>
          )}
          {chosenRows.some((r) => r.status === "dropped") && (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void setStatus(
                  chosenRows.filter((r) => r.status === "dropped"),
                  "included",
                )
              }
            >
              Put back
            </Button>
          )}
          {chosenRows.filter((r) => !r.mag_parent).length >= 2 && (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void (async () => {
                  setBusy("join");
                  try {
                    const r = await joinFn({
                      data: { id, ids: chosenRows.filter((x) => !x.mag_parent).map((x) => x.id) },
                    });
                    setChosen(new Set());
                    toast.success("Joined into one article: writing it");
                    await refresh();
                    void topic.write(r.combined, "Combined article written");
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't join them"));
                  } finally {
                    setBusy("");
                  }
                })()
              }
            >
              Join into one
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {!items.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {sorting
            ? "Sorting the period's stories in…"
            : "No stories fit yet. Collect past dates on the Monthly page, or widen the dates in Details."}
        </p>
      ) : (
        groups.map((g) => (
          <TopicCtx.Provider key={g.section.id} value={{ ...topic, joined }}>
            <SectionCard
              key={g.section.id}
              mag={mag}
              group={g}
              folded={folded.has(g.section.id)}
              onFold={() => {
                const next = new Set(folded);
                if (next.has(g.section.id)) next.delete(g.section.id);
                else next.add(g.section.id);
                setFolded(next);
              }}
              chosen={chosen}
              onChoose={(itemId, on) => {
                const next = new Set(chosen);
                if (on) next.add(itemId);
                else next.delete(itemId);
                setChosen(next);
              }}
              onOpen={setEditing}
              onChanged={refresh}
            />
          </TopicCtx.Provider>
        ))
      )}

      {editing && ordered.some((i) => i.id === editing) && (
        <StoryEditor
          items={ordered as CaItem[]}
          id={editing}
          lang={lang}
          setLang={setLang}
          onNavigate={setEditing}
          onClose={() => setEditing(null)}
          onChanged={() => void refresh()}
          review={{
            state: (it) => (it.status === "dropped" ? "dropped" : "approved"),
            set: (it, state) => {
              if (state === "approved" && it.status === "dropped")
                void jobs.run(
                  it.id,
                  "include",
                  () => updateFn({ data: { id: it.id, status: "included" } }),
                  "Back in the magazine",
                );
            },
            drop: (it, drop) =>
              void jobs.run(
                it.id,
                drop ? "drop" : "include",
                () => updateFn({ data: { id: it.id, status: drop ? "dropped" : "included" } }),
                drop ? "Left out of the magazine" : "Back in the magazine",
              ),
            write: (it) =>
              jobs.run(
                it.id,
                "write",
                () =>
                  (it as MagItem).mag_combined
                    ? writeTopicFn({ data: { id: it.id } })
                    : enrichFn({ data: { id: it.id } }),
                "Story written again",
              ),
            job: (it) => jobs.jobs.get(it.id),
            choices: [
              { state: "approved", label: "In the magazine" },
              { state: "dropped", label: "Leave out" },
            ],
          }}
        />
      )}

      {preview && <PreviewDialog id={id} lang={preview} setLang={setPreview} />}
      {details && <DetailsDialog mag={mag} onClose={() => setDetails(false)} onSaved={refresh} />}
    </div>
  );
}

function SectionCard({
  mag,
  group,
  folded,
  onFold,
  chosen,
  onChoose,
  onOpen,
  onChanged,
}: {
  mag: CustomMag;
  group: Group;
  folded: boolean;
  onFold: () => void;
  chosen: Set<string>;
  onChoose: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const saveFn = useServerFn(saveCaMagSections);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { section } = group;
  const count =
    group.loose.filter((i) => i.status === "included").length +
    group.subs.reduce((n, s) => n + s.items.filter((i) => i.status === "included").length, 0);
  const editable = mag.sections.some((s) => s.id === section.id);

  async function rename(target: string, en: string, hi: string) {
    const next = mag.sections.map((s) =>
      s.id === section.id
        ? target === section.id
          ? { ...s, en, hi }
          : { ...s, subs: s.subs.map((x) => (x.id === target ? { ...x, en, hi } : x)) }
        : s,
    );
    try {
      await saveFn({ data: { id: mag.id, sections: next } });
      toast.success("Renamed");
      setRenaming(null);
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't rename"));
    }
  }

  async function removeSub(subId: string) {
    const next = mag.sections.map((s) =>
      s.id === section.id ? { ...s, subs: s.subs.filter((x) => x.id !== subId) } : s,
    );
    try {
      await saveFn({ data: { id: mag.id, sections: next } });
      toast.success("Subsection removed; its stories stay in the section");
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't remove it"));
    }
  }

  const name = (n: { en: string; hi: string }, target: string) =>
    renaming === target ? (
      <RenameForm
        en={n.en}
        hi={n.hi}
        onCancel={() => setRenaming(null)}
        onSave={(en, hi) => void rename(target, en, hi)}
      />
    ) : null;

  return (
    <section
      aria-label={section.en}
      data-section={section.id}
      className="rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          onClick={onFold}
          aria-expanded={!folded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {folded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="font-semibold">{section.en}</span>
          <span className="text-sm text-muted-foreground">{section.hi}</span>
          <Badge>{count}</Badge>
        </button>
        {editable && renaming !== section.id && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Rename ${section.en}`}
            onClick={() => setRenaming(section.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>
      {name(section, section.id)}
      {!folded && (
        <div className="space-y-3 border-t border-border p-3">
          {group.loose.length > 0 && (
            <StoryRows items={group.loose} chosen={chosen} onChoose={onChoose} onOpen={onOpen} />
          )}
          {group.subs.map((s) => {
            const sub = section.subs.find((x) => x.id === s.id)!;
            return (
              <div key={s.id} data-sub={s.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 border-l-2 border-primary pl-2">
                  <span className="text-sm font-semibold text-primary">{sub.en}</span>
                  <span className="text-xs text-muted-foreground">{sub.hi}</span>
                  <Badge>{s.items.length}</Badge>
                  {editable && renaming !== s.id && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        aria-label={`Rename ${sub.en}`}
                        onClick={() => setRenaming(s.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        aria-label={`Remove subsection ${sub.en}`}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove the subsection “${sub.en}”? Its stories stay in ${section.en}.`,
                            )
                          )
                            void removeSub(s.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
                {name(sub, s.id)}
                {s.items.length ? (
                  <StoryRows items={s.items} chosen={chosen} onChoose={onChoose} onOpen={onOpen} />
                ) : (
                  <p className="pl-3 text-xs text-muted-foreground">No stories yet.</p>
                )}
              </div>
            );
          })}
          {!group.loose.length && !group.subs.length && (
            <p className="text-xs text-muted-foreground">No stories yet.</p>
          )}
        </div>
      )}
    </section>
  );
}

function RenameForm({
  en,
  hi,
  onSave,
  onCancel,
}: {
  en: string;
  hi: string;
  onSave: (en: string, hi: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState({ en, hi });
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
      <Input
        aria-label="Name (English)"
        value={v.en}
        maxLength={60}
        onChange={(e) => setV({ ...v, en: e.target.value })}
        className="h-8 w-56"
      />
      <Input
        aria-label="Name (Hindi)"
        lang="hi"
        value={v.hi}
        maxLength={60}
        onChange={(e) => setV({ ...v, hi: e.target.value })}
        className="h-8 w-56"
      />
      <Button size="sm" disabled={!v.en.trim()} onClick={() => onSave(v.en.trim(), v.hi.trim())}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function StoryRows({
  items,
  chosen,
  onChoose,
  onOpen,
}: {
  items: MagItem[];
  chosen: Set<string>;
  onChoose: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const t = useContext(TopicCtx)!;
  const [open, setOpen] = useState<Set<string>>(new Set());
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {items.map((i) => {
        const out = i.status === "dropped";
        const members = t.joined.get(i.id) ?? [];
        const dates = members.map((m) => m.mag_date).sort();
        const changedMembers = members.filter((m) => m.changed).length;
        const job = t.job(i.id);
        const shown = open.has(i.id);
        return (
          <li
            key={i.id}
            data-story={i.content?.headline.en || i.headline}
            className={out ? "opacity-60" : ""}
          >
            <div className="flex flex-wrap items-start gap-2 px-2.5 py-2 sm:flex-nowrap">
              <Checkbox
                className="mt-1"
                checked={chosen.has(i.id)}
                onCheckedChange={(on) => onChoose(i.id, on === true)}
                aria-label={`Select ${i.content?.headline.en || i.headline}`}
              />
              <button
                type="button"
                onClick={() => onOpen(i.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block text-sm font-medium" lang="hi">
                  {i.content?.headline.hi || i.headline}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {i.content?.headline.en ? `${i.content.headline.en} · ` : ""}
                  {i.mag_combined && dates.length
                    ? `${formatDate(dates[0], "en")} – ${formatDate(dates[dates.length - 1], "en")}`
                    : formatDate(i.mag_date, "en")}
                </span>
              </button>
              <div className="flex w-full flex-wrap items-center gap-1 pl-6 sm:w-auto sm:max-w-[55%] sm:shrink-0 sm:justify-end sm:pl-0">
                {i.mag_combined && (
                  <Badge tone="primary" title="One article written from these daily stories">
                    Combined · {members.length} stories
                  </Badge>
                )}
                {i.mag_combined && !i.content && !job && (
                  <Badge tone="warn">Waiting to be written</Badge>
                )}
                {out && <Badge tone="bad">Left out</Badge>}
                {i.mag_pinned && (
                  <Badge title="You placed it; the AI won't move it">Placed by you</Badge>
                )}
                {!!i.mag_pending && !job && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => void t.write(i.id, "New stories added")}
                    title="Your text is kept in the story's history"
                  >
                    {i.mag_pending} new {i.mag_pending === 1 ? "story" : "stories"}: add
                  </Button>
                )}
                {changedMembers > 0 && !job && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => void t.write(i.id, "Written again from the changed stories")}
                  >
                    {changedMembers} daily {changedMembers === 1 ? "story" : "stories"} changed:
                    write again
                  </Button>
                )}
                {i.changed && !i.mag_combined && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => void t.update(i.id)}
                    title="Its text here is kept in the story's history"
                  >
                    Daily story changed: update
                  </Button>
                )}
                {i.mag_combined && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    aria-expanded={shown}
                    onClick={() => {
                      const next = new Set(open);
                      if (shown) next.delete(i.id);
                      else next.add(i.id);
                      setOpen(next);
                    }}
                  >
                    {shown ? "Hide stories" : "Show stories"}
                  </Button>
                )}
              </div>
            </div>
            {job && <JobBar job={job} className="mx-2.5 mb-2" />}
            {i.mag_combined && shown && (
              <div
                className="mx-2.5 mb-2 space-y-1 rounded-lg bg-muted/40 p-2"
                aria-label="Joined stories"
              >
                {members.map((m) => (
                  <div
                    key={m.id}
                    data-joined={m.headline}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {formatDate(m.mag_date, "en")}
                    </span>
                    <span className="min-w-0 flex-1">{m.content?.headline.en || m.headline}</span>
                    {m.changed && <Badge tone="warn">Changed</Badge>}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => void t.takeOut(m.id)}
                    >
                      Take out
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (
                      confirm(
                        "Take this combined article apart? Its stories print on their own again.",
                      )
                    )
                      void t.split(i.id);
                  }}
                >
                  Take apart
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PreviewDialog({
  id,
  lang,
  setLang,
}: {
  id: string;
  lang: "en" | "hi";
  setLang: (l: "en" | "hi" | null) => void;
}) {
  const previewFn = useServerFn(previewCaMag);
  const q = useQuery({
    queryKey: ["caMagPreview", id, lang],
    queryFn: () => previewFn({ data: { id, lang } }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && setLang(null)}>
      <DialogContent className="flex h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>The magazine as it prints, before making the PDFs.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1">
          {(["en", "hi"] as const).map((l) => (
            <Button
              key={l}
              size="sm"
              variant={lang === l ? "default" : "outline"}
              onClick={() => setLang(l)}
            >
              {l === "en" ? "English" : "हिंदी"}
            </Button>
          ))}
        </div>
        {q.data ? (
          <iframe
            title="Magazine preview"
            srcDoc={q.data.html}
            className="min-h-0 w-full flex-1 rounded-lg border border-border bg-white"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {q.error ? errorText(q.error, "Couldn't make the preview") : "Making the preview…"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailsDialog({
  mag,
  onClose,
  onSaved,
}: {
  mag: CustomMag;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const updateFn = useServerFn(updateCaMag);
  const [form, setForm] = useState({
    title_en: mag.title_en,
    title_hi: mag.title_hi,
    theme: mag.theme,
    date_from: mag.date_from,
    date_to: mag.date_to,
  });
  const [saving, setSaving] = useState(false);
  const shorter = form.date_from > mag.date_from || form.date_to < mag.date_to;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Magazine details</DialogTitle>
          <DialogDescription>
            The dates can only be widened: stories of the new days are sorted in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            aria-label="Title (English)"
            value={form.title_en}
            maxLength={120}
            onChange={(e) => setForm({ ...form, title_en: e.target.value })}
          />
          <Input
            aria-label="Title (Hindi)"
            lang="hi"
            value={form.title_hi}
            maxLength={120}
            onChange={(e) => setForm({ ...form, title_hi: e.target.value })}
          />
          <Textarea
            aria-label="What it covers"
            rows={3}
            maxLength={600}
            value={form.theme}
            onChange={(e) => setForm({ ...form, theme: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              aria-label="From"
              value={form.date_from}
              max={mag.date_from}
              onChange={(e) => setForm({ ...form, date_from: e.target.value })}
              className="w-40"
            />
            <Input
              type="date"
              aria-label="To"
              value={form.date_to}
              min={mag.date_to}
              onChange={(e) => setForm({ ...form, date_to: e.target.value })}
              className="w-40"
            />
          </div>
          {shorter && <p className="text-xs text-destructive">The dates can only be made wider.</p>}
          <p className="text-xs text-muted-foreground">
            A new theme applies to the stories sorted from now on.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={
              saving || shorter || form.title_en.trim().length < 3 || form.theme.trim().length < 3
            }
            onClick={async () => {
              setSaving(true);
              try {
                await updateFn({ data: { id: mag.id, patch: form } });
                toast.success("Saved");
                await onSaved();
                onClose();
              } catch (e) {
                toast.error(errorText(e, "Couldn't save"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
