// Admin: reading and correcting the day's written news. Every story is a
// collapsed card; opened, it reads like the magazine (Hindi, English or both),
// and in edit mode each line has its own pencil, so the keyboard only opens
// for the line being changed.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Plus,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Image as ImageIcon,
  Library,
  Pencil,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  addCaStaticFacts,
  deleteCaItems,
  enrichCaItem,
  getCaKeywordBooks,
  getCaReview,
  setCaReview,
  updateCaItem,
  type CaItem,
} from "@/lib/current-affairs.functions";
import { JobBar, useStoryJobs, type StoryJob } from "@/components/ca-story-jobs";
import {
  CATEGORIES,
  MAX_STATICS,
  STATIC_CONNECT,
  categoryLabel,
  normalizeForMatch,
  type Bi,
  type CaContent,
  type StaticFact,
} from "@/lib/current-affairs";
import { StoryEditor } from "@/components/ca-story-editor";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { VISUAL_LABELS } from "@/lib/ca-visuals";
import { Badge, BulkBar, errorText, useChosen } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

export type Lang = "hi" | "en" | "both";

const LANG_KEY = "ca-review-lang";

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, Telegram webview restrictions)
  }
}

// ====================== The list ======================

// What the editor decided about each story: approved, kept to read later or
// dropped; "to do" until then.
export type ReviewState = "approved" | "later";
type Filter = "all" | "todo" | "approved" | "later" | "dropped";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "todo", label: "To do" },
  { id: "approved", label: "Approved" },
  { id: "later", label: "Read later" },
  { id: "dropped", label: "Dropped" },
];
const FILTER_KEY = "ca-review-filter";
const FOLDED_KEY = "ca-folded-sections";

function storyState(it: CaItem, review: Record<string, ReviewState>): Exclude<Filter, "all"> {
  if (it.status === "dropped") return "dropped";
  return review[it.id] ?? "todo";
}

export function StoryList({
  items,
  date,
  onChanged,
  jump = null,
  onReviewed,
}: {
  items: CaItem[];
  date: string;
  onChanged: () => void;
  // A story to open and scroll to (from the day's checklist).
  jump?: { id: string; n: number } | null;
  // The stories approved so far, for the day's checklist.
  onReviewed?: (ids: Set<string>) => void;
}) {
  const ordered = useMemo(() => {
    const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
    return [...items].sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
        Number(a.status === "dropped") - Number(b.status === "dropped") ||
        a.position - b.position,
    );
  }, [items]);
  const number = useMemo(() => new Map(ordered.map((it, i) => [it.id, i + 1])), [ordered]);
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  // Hindi on phones, both side by side on wider screens, unless chosen before.
  const [lang, setLangState] = useState<Lang>("both");
  useEffect(() => {
    const saved = readStore<Lang | null>(LANG_KEY, null);
    setLangState(saved ?? (window.matchMedia("(min-width: 640px)").matches ? "both" : "hi"));
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    writeStore(LANG_KEY, l);
  };

  // Approved and read-later stories, kept on the server (the same on every
  // device); changes show at once.
  const reviewFn = useServerFn(getCaReview);
  const setReviewFn = useServerFn(setCaReview);
  const reviewQ = useQuery({
    queryKey: ["caReview", date],
    queryFn: () => reviewFn({ data: { date } }),
  });
  const [review, setReviewState] = useState<Record<string, ReviewState>>({});
  useEffect(() => {
    if (reviewQ.data) setReviewState(reviewQ.data);
  }, [reviewQ.data]);
  useEffect(() => setReviewState({}), [date]);
  async function setReview(ids: string[], state: ReviewState | null) {
    setReviewState((cur) => {
      const next = { ...cur };
      for (const id of ids) {
        if (state) next[id] = state;
        else delete next[id];
      }
      return next;
    });
    try {
      setReviewState(await setReviewFn({ data: { date, ids, state } }));
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
      void reviewQ.refetch();
    }
  }

  const jobs = useStoryJobs(onChanged);
  const updateFn = useServerFn(updateCaItem);
  const enrichFn = useServerFn(enrichCaItem);
  // Dropping or bringing back a story runs on while the editor moves on;
  // one that arrived dropped is written when it comes back.
  const setDropped = (it: CaItem, drop: boolean) => {
    if (drop) void setReview([it.id], null);
    void jobs.run(
      it.id,
      drop ? "drop" : "include",
      async () => {
        await updateFn({ data: { id: it.id, status: drop ? "dropped" : "included" } });
        if (!drop && it.needs_enrich) await enrichFn({ data: { id: it.id } });
      },
      drop ? "Dropped from the issue" : "Back in the issue",
    );
  };
  const writeStory = (it: CaItem) =>
    jobs.run(
      it.id,
      "write",
      () => enrichFn({ data: { id: it.id } }),
      it.content ? "Story written again" : "Story written",
    );

  const [filter, setFilterState] = useState<Filter>("all");
  useEffect(() => setFilterState(readStore<Filter>(FILTER_KEY, "all")), []);
  const setFilter = (f: Filter) => {
    setFilterState(f);
    writeStore(FILTER_KEY, f);
  };
  // A story keeps its place while its state is changing.
  const stateOf = (it: CaItem) => {
    const job = jobs.jobs.get(it.id);
    if (job?.kind === "drop") return "dropped";
    if (job?.kind === "include") return review[it.id] ?? "todo";
    return storyState(it, review);
  };
  const counts = useMemo(() => {
    const n: Record<Filter, number> = {
      all: ordered.length,
      todo: 0,
      approved: 0,
      later: 0,
      dropped: 0,
    };
    for (const it of ordered) n[stateOf(it)]++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, review, jobs.jobs]);
  const shown = filter === "all" ? ordered : ordered.filter((it) => stateOf(it) === filter);
  const groups = useMemo(() => {
    const map = new Map<string, CaItem[]>();
    for (const it of shown) map.set(it.category, [...(map.get(it.category) ?? []), it]);
    return [...map.entries()];
  }, [shown]);

  // Sections fold into a stack; remembered on this device.
  const [folded, setFolded] = useState<Set<string>>(new Set());
  useEffect(() => setFolded(new Set(readStore<string[]>(FOLDED_KEY, []))), []);
  const fold = (next: Set<string>) => {
    setFolded(next);
    writeStore(FOLDED_KEY, [...next]);
  };
  const allFolded = groups.length > 0 && groups.every(([cat]) => folded.has(cat));

  // The story open in the editor, and the stories its arrows go through:
  // those shown when it opened, so approving one doesn't lose the place.
  const [editing, setEditing] = useState<string | null>(null);
  const [navIds, setNavIds] = useState<string[]>([]);
  useEffect(() => setEditing(null), [date]);
  const cards = useRef(new Map<string, HTMLElement>());
  const openStory = (id: string) => {
    if (!editing) {
      const list = shown.some((it) => it.id === id) ? shown : ordered;
      setNavIds(list.map((it) => it.id));
    }
    setEditing(id);
  };
  // Back in the list at the story last open.
  const closeEditor = () => {
    const id = editing;
    setEditing(null);
    if (id) {
      const it = byId.get(id);
      if (it && folded.has(it.category)) {
        const next = new Set(folded);
        next.delete(it.category);
        fold(next);
      }
      requestAnimationFrame(() =>
        cards.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
  };
  const approvedKey = Object.entries(review)
    .filter(([, v]) => v === "approved")
    .map(([k]) => k)
    .sort()
    .join(",");
  useEffect(() => {
    onReviewed?.(new Set(approvedKey ? approvedKey.split(",") : []));
  }, [approvedKey, onReviewed]);
  useEffect(() => {
    if (jump) {
      setNavIds(ordered.map((it) => it.id));
      setEditing(jump.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump]);

  const deleteFn = useServerFn(deleteCaItems);
  const ids = items.map((i) => i.id);
  const { chosen, setChosen, toggle: choose } = useChosen(ids);
  const [busy, setBusy] = useState(false);
  async function deleteMany(list: string[], all: boolean) {
    if (
      !confirm(
        all
          ? `Delete all ${list.length} news items for this day? This can't be undone. The sources stay listed but are not read again; to start over, delete the sources too.`
          : `Delete ${list.length} selected news item(s)? This can't be undone. (To keep an item out of the issue without deleting it, use “Drop”.)`,
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
  const firstTodo = ordered.find((it) => stateOf(it) === "todo");
  const navItems = navIds.map((id) => byId.get(id)).filter((it): it is CaItem => !!it);

  return (
    <div className="space-y-4">
      {counts.dropped > 0 && (
        <p className="text-xs text-muted-foreground">
          Stories unlikely in the exam, and less important ones beyond your stories-per-day limit
          (Magazine settings), arrive dropped. Tick “Drop” off on one to add it and write it.
        </p>
      )}

      {/* Reading controls stay in reach while scrolling. */}
      <div className="sticky top-[3.75rem] z-20 -mx-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-2 lg:px-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5 text-sm" role="group">
            {(
              [
                ["hi", "हिंदी"],
                ["en", "English"],
                ["both", "Both"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLang(k)}
                aria-pressed={lang === k}
                className={`rounded-md px-3 py-1 ${lang === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {groups.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => fold(allFolded ? new Set() : new Set(groups.map(([cat]) => cat)))}
            >
              {allFolded ? (
                <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
              ) : (
                <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
              )}
              {allFolded ? "Open all sections" : "Fold all sections"}
            </Button>
          )}
          {ordered.length > 0 && (
            <Button
              size="sm"
              className="ml-auto h-8"
              onClick={() => openStory((firstTodo ?? shown[0] ?? ordered[0]).id)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {firstTodo
                ? counts.todo === counts.all - counts.dropped
                  ? "Start reviewing"
                  : "Continue"
                : "Open first story"}
            </Button>
          )}
        </div>
        <div
          role="radiogroup"
          aria-label="Show stories"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 tabular-nums ${filter === f.id ? "bg-primary-foreground/20" : "bg-muted"}`}
              >
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <BulkBar
        ids={ids}
        chosen={chosen}
        setChosen={setChosen}
        noun="items"
        busy={busy}
        onDelete={deleteMany}
      />

      {!shown.length && ordered.length > 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} stories.
        </p>
      )}

      {groups.map(([cat, list]) => {
        const isFolded = folded.has(cat);
        const approved = list.filter((it) => stateOf(it) === "approved").length;
        return (
          <section key={cat} className="space-y-2" aria-label={categoryLabel(cat).en}>
            <button
              type="button"
              aria-expanded={!isFolded}
              onClick={() => {
                const next = new Set(folded);
                if (isFolded) next.delete(cat);
                else next.add(cat);
                fold(next);
              }}
              className="flex w-full items-center gap-2 rounded-lg pt-2 text-left"
            >
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isFolded ? "-rotate-90" : ""}`}
              />
              <span className="text-sm font-semibold">
                {categoryLabel(cat).hi} · {categoryLabel(cat).en}
              </span>
              <span className="text-xs text-muted-foreground">
                {list.length} {list.length === 1 ? "story" : "stories"}
                {approved > 0 && filter !== "approved" ? ` · ${approved} approved` : ""}
              </span>
            </button>
            {isFolded ? (
              // A stack: the section's first story with the others behind it.
              <button
                type="button"
                aria-label={`Open the ${categoryLabel(cat).en} section`}
                onClick={() => {
                  const next = new Set(folded);
                  next.delete(cat);
                  fold(next);
                }}
                className="relative block w-full pb-2 text-left"
              >
                {list.length > 2 && (
                  <span className="absolute inset-x-6 bottom-0 h-4 rounded-b-2xl border border-t-0 border-border bg-card/60" />
                )}
                {list.length > 1 && (
                  <span className="absolute inset-x-3 bottom-1 h-4 rounded-b-2xl border border-t-0 border-border bg-card/80" />
                )}
                <span className="relative block rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                  <span lang="hi" className="line-clamp-1 font-medium">
                    {list[0].content?.headline.hi || list[0].headline}
                  </span>
                  {list.length > 1 && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      and {list.length - 1} more
                    </span>
                  )}
                </span>
              </button>
            ) : (
              list.map((it) => (
                <StoryCard
                  key={it.id}
                  ref={(el) => {
                    if (el) cards.current.set(it.id, el);
                    else cards.current.delete(it.id);
                  }}
                  item={it}
                  number={number.get(it.id) ?? 0}
                  lang={lang}
                  state={stateOf(it)}
                  job={jobs.jobs.get(it.id)}
                  onOpen={() => openStory(it.id)}
                  onDrop={(drop) => setDropped(it, drop)}
                  selected={chosen.has(it.id)}
                  onSelect={(on) => choose(it.id, on)}
                  onChanged={onChanged}
                />
              ))
            )}
          </section>
        );
      })}
      {editing && byId.has(editing) && (
        <StoryEditor
          items={navItems.length ? navItems : ordered}
          id={editing}
          lang={lang}
          setLang={setLang}
          onNavigate={openStory}
          onClose={closeEditor}
          onChanged={onChanged}
          review={{
            state: (it) => stateOf(it),
            set: (it, state) => {
              if (it.status === "dropped" && state) setDropped(it, false);
              void setReview([it.id], state);
            },
            drop: setDropped,
            write: writeStory,
            job: (it) => jobs.jobs.get(it.id),
          }}
        />
      )}
    </div>
  );
}

// ====================== One story ======================

type CardProps = {
  item: CaItem;
  number: number;
  lang: Lang;
  state: Exclude<Filter, "all">;
  // Writing, dropping or bringing back, running on in the background.
  job?: StoryJob;
  onOpen: () => void;
  onDrop: (drop: boolean) => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onChanged: () => void;
  ref?: React.Ref<HTMLElement>;
};

// A story in the day's list: its headline, state and summary. Tapping it
// opens the story editor.
function StoryCard({
  item,
  number,
  lang,
  state,
  job,
  onOpen,
  onDrop,
  selected,
  onSelect,
  ref,
}: CardProps) {
  const c = item.content;
  const dropped = state === "dropped";
  const approved = state === "approved";
  const unverified = item.facts.filter((f) => !f.verified).length;
  const headHi = c?.headline.hi || item.headline;
  const headEn = c?.headline.en || "";
  const summary = c
    ? lang === "en"
      ? c.summary.en || c.summary.hi
      : c.summary.hi || c.summary.en
    : "";

  return (
    <article
      ref={ref}
      className={`scroll-mt-32 overflow-hidden rounded-2xl border bg-card lg:scroll-mt-20 ${selected ? "border-primary ring-1 ring-primary/30" : "border-border"} ${dropped ? "opacity-60" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open story ${number}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex cursor-pointer flex-wrap items-start gap-x-3 gap-y-2 p-3 hover:bg-muted/30 sm:flex-nowrap sm:p-4"
      >
        <span onClick={(e) => e.stopPropagation()} className="pt-1">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelect(v === true)}
            aria-label="Select item"
          />
        </span>
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${approved ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : state === "later" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"}`}
          title={approved ? "Approved" : state === "later" ? "Read later" : "To do"}
        >
          {approved ? (
            <Check className="h-3.5 w-3.5" />
          ) : state === "later" ? (
            <Clock className="h-3.5 w-3.5" />
          ) : (
            number
          )}
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-4.5rem)] sm:basis-auto">
          {lang !== "en" && (
            <div lang="hi" className="font-semibold leading-snug">
              {headHi}
            </div>
          )}
          {lang !== "hi" && headEn && (
            <div
              className={
                lang === "en" ? "font-semibold leading-snug" : "text-sm text-muted-foreground"
              }
            >
              {headEn}
            </div>
          )}
          {summary && (
            <p
              lang={lang === "en" ? "en" : "hi"}
              className="mt-1 line-clamp-2 text-sm text-muted-foreground"
            >
              {summary}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge title="Exam importance">
              {"★".repeat(item.importance)}
              {"☆".repeat(3 - item.importance)}
            </Badge>
            {unverified > 0 && (
              <Badge tone="warn">
                <AlertTriangle className="h-3 w-3" /> {unverified} to check
              </Badge>
            )}
            {[c?.visual, c?.visual2].map(
              (v, i) =>
                v && (
                  <Badge key={i} tone="primary">
                    <BarChart3 className="h-3 w-3" /> {VISUAL_LABELS[v.type]}
                  </Badge>
                ),
            )}
            {(c?.images?.length ?? 0) > 0 && (
              <Badge title="Images">
                <ImageIcon className="h-3 w-3" /> {c!.images!.length}
              </Badge>
            )}
            {/* The boxes the story has, and Static Context when it's missing. */}
            {c &&
              ((c.statics?.length ?? 0) + (c.background ? 1 : 0) > 0 ? (
                <Badge tone="good" title={STATIC_CONNECT.en}>
                  <Library className="h-3 w-3" />{" "}
                  {(c.statics?.length ?? 0) + (c.background ? 1 : 0)}
                </Badge>
              ) : (
                !dropped && (
                  <Badge title={`No ${STATIC_CONNECT.en} yet`}>
                    <Library className="h-3 w-3 opacity-50" /> 0
                  </Badge>
                )
              ))}
            {(c?.dyk?.length ?? 0) > 0 && (
              <Badge title="Fact Bite">
                <Sparkles className="h-3 w-3" /> {c!.dyk!.length}
              </Badge>
            )}
            {item.related_item_id && <Badge tone="primary">Follow-up</Badge>}
            {dropped && <Badge tone="bad">Dropped</Badge>}
            {approved && <Badge tone="good">Approved</Badge>}
            {state === "later" && <Badge tone="warn">Read later</Badge>}
            {c?.hide_summary && (
              <Badge title="The summary is left out of the issue">No summary</Badge>
            )}
            {item.enrich_error && <Badge tone="bad">Writing failed</Badge>}
            {(item.needs_enrich || !c) && !item.enrich_error && !job && (
              <Badge tone="warn">Not written</Badge>
            )}
          </div>
          {job && <JobBar job={job} className="mt-2" />}
        </div>
        {/* Beside the story on wider screens, a row under it on phones. */}
        <div
          className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto sm:flex-col sm:items-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="outline" className="h-8" onClick={onOpen}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Open
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={!!job}
            onClick={() => onDrop(!dropped)}
          >
            {dropped ? (
              "Include"
            ) : (
              <>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Drop
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}

// ====================== Pieces ======================

const keyOf = (k: Bi) => normalizeForMatch(k.en || k.hi);
const swapAt = <T,>(list: T[], a: number, b: number): T[] => {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};
const keywordLabel = (k: Bi, lang: Lang) =>
  lang === "en"
    ? k.en || k.hi
    : lang === "hi"
      ? k.hi || k.en
      : [k.hi, k.en].filter(Boolean).join(" · ");

// Static Context: textbook facts on the concepts the news links to. Each fact
// can be edited or removed; more are written for keywords the admin picks
// from SAATHI's suggestions or types in.
export function StaticConnect({
  item,
  content: c,
  lang,
  editing,
  busy,
  save,
  act,
}: {
  item: CaItem;
  content: CaContent;
  lang: Lang;
  editing: boolean;
  busy: boolean;
  save: (patch: Partial<CaContent>) => Promise<void>;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const addFn = useServerFn(addCaStaticFacts);
  const booksFn = useServerFn(getCaKeywordBooks);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Bi[]>([]);
  const [own, setOwn] = useState("");
  const statics = c.statics ?? [];
  const used = new Set(statics.map((f) => keyOf(f.keyword)));
  const offered = (c.keywords ?? []).filter((k) => !used.has(keyOf(k)));
  const room = MAX_STATICS - statics.length;
  const books = useQuery({
    queryKey: ["caKeywordBooks", item.id, offered.map(keyOf).join("|")],
    queryFn: () => booksFn({ data: { id: item.id } }),
    enabled: picking && offered.length > 0,
    staleTime: 5 * 60_000,
  });
  const bookFor = (k: Bi) => books.data?.find((b) => keyOf(b.keyword) === keyOf(k))?.book;
  const isChosen = (k: Bi) => chosen.some((x) => keyOf(x) === keyOf(k));
  const toggle = (k: Bi) =>
    setChosen((cur) =>
      cur.some((x) => keyOf(x) === keyOf(k))
        ? cur.filter((x) => keyOf(x) !== keyOf(k))
        : cur.length < room
          ? [...cur, k]
          : cur,
    );
  const setStatics = (next: StaticFact[]) => save({ statics: next, statics_edited: true });
  const addOwn = () => {
    const t = own.trim();
    if (!t) return;
    const k = /[\u0900-\u097F]/.test(t) ? { en: "", hi: t } : { en: t, hi: "" };
    if (!isChosen(k)) toggle(k);
    setOwn("");
  };
  const custom = chosen.filter((k) => !offered.some((o) => keyOf(o) === keyOf(k)));

  return (
    <Part tone="background">
      {c.background && (
        <BiLine
          value={c.background}
          lang={lang}
          editing={editing}
          onSave={(v) => save({ background: v })}
          onDelete={() => act(() => save({ background: null }), "Removed")}
        />
      )}
      {statics.length > 0 && (
        <ul className="space-y-2" data-testid="static-facts">
          {statics.map((f, i) => (
            <li key={`${keyOf(f.keyword)}-${i}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {keywordLabel(f.keyword, lang)}
                </div>
                <BiLine
                  value={f.text}
                  lang={lang}
                  editing={editing}
                  onSave={(v) =>
                    setStatics(statics.map((x, j) => (j === i ? { ...x, text: v } : x)))
                  }
                />
                <div className="text-[11px] text-muted-foreground">
                  {f.source
                    ? `📚 ${f.source.split(" | ").join(", ")}`
                    : "💡 SAATHI's own knowledge"}
                </div>
              </div>
              {/* Printed in this order. */}
              <div className="flex shrink-0 flex-col">
                {editing && statics.length > 1 && (
                  <>
                    <IconButton
                      label="Move up"
                      disabled={busy || i === 0}
                      onClick={() => act(() => setStatics(swapAt(statics, i, i - 1)), "Moved")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={busy || i === statics.length - 1}
                      onClick={() => act(() => setStatics(swapAt(statics, i, i + 1)), "Moved")}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                  </>
                )}
                <IconButton
                  label="Remove this fact"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() =>
                    act(() => setStatics(statics.filter((_, j) => j !== i)), "Fact removed")
                  }
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!statics.length && !c.background && (
        <p className="text-xs text-muted-foreground">No facts yet. Add them from the keywords.</p>
      )}

      {!picking ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-8 px-2 text-xs"
          disabled={busy || room <= 0}
          onClick={() => setPicking(true)}
          title={room <= 0 ? `Up to ${MAX_STATICS} facts; remove one to add another` : undefined}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add facts from keywords
        </Button>
      ) : (
        <div className="mt-2 space-y-2 rounded-lg border border-emerald-500/30 bg-background/70 p-2">
          <p className="text-xs text-muted-foreground">
            Pick up to {room}. 📚 your books explain it · 💡 SAATHI writes it from its own
            knowledge.
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Keywords">
            {[...offered, ...custom].map((k) => {
              const on = isChosen(k);
              const mark = custom.includes(k)
                ? "＋"
                : books.isLoading
                  ? "…"
                  : bookFor(k)
                    ? "📚"
                    : "💡";
              return (
                <button
                  key={keyOf(k)}
                  type="button"
                  aria-pressed={on}
                  title={bookFor(k) ?? undefined}
                  onClick={() => toggle(k)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background"}`}
                >
                  {mark} {keywordLabel(k, lang)}
                </button>
              );
            })}
            {offered.length === 0 && custom.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No more suggestions; type a keyword below.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOwn();
                }
              }}
              maxLength={80}
              placeholder="Your own keyword, e.g. Article 21"
              className="h-8 text-sm"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={addOwn}>
              Add
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || chosen.length === 0}
              onClick={() =>
                act(async () => {
                  await addFn({ data: { id: item.id, keywords: chosen } });
                  setChosen([]);
                  setPicking(false);
                }, `${STATIC_CONNECT.en} updated`)
              }
            >
              {busy
                ? "Writing…"
                : `Write ${chosen.length || ""} fact${chosen.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPicking(false);
                setChosen([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Part>
  );
}

export function IconButton({
  label,
  children,
  onClick,
  disabled,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={`h-8 w-8 shrink-0 ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const PART_TONES = {
  plain: "",
  why: "rounded-xl bg-primary/5 p-2.5",
  background: "rounded-xl bg-emerald-500/5 p-2.5",
  dyk: "rounded-xl border border-dashed border-sky-400/50 bg-sky-500/5 p-2.5",
};

export function Part({
  title,
  tone = "plain",
  children,
}: {
  // Left out where the page already names the part.
  title?: string;
  tone?: keyof typeof PART_TONES;
  children: React.ReactNode;
}) {
  return (
    <section className={PART_TONES[tone]}>
      {title && (
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
      )}
      {children}
    </section>
  );
}

// A bilingual line shown as plain text. In edit mode it gets a pencil (and a
// bin when it can be deleted); only the pencil opens text boxes for it.
export function BiLine({
  value,
  lang,
  editing = false,
  strong = false,
  preLine = false,
  faded = false,
  onSave,
  onDelete,
  extra,
}: {
  value: Bi;
  lang: Lang;
  editing?: boolean;
  strong?: boolean;
  preLine?: boolean;
  // Shown in the visual, so not printed as a point.
  faded?: boolean;
  onSave?: (v: Bi) => Promise<void>;
  onDelete?: () => void;
  // One more small button beside the pencil, in place of the bin.
  extra?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Bi | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(null);
  }, [editing]);

  if (draft) {
    // Marked while it differs from the saved text, so closing the editor can
    // warn about it.
    const dirty = draft.hi !== (value.hi ?? "") || draft.en !== (value.en ?? "");
    return (
      <div
        data-unsaved={dirty ? "true" : undefined}
        className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-2"
      >
        <GrowText
          lang="hi"
          value={draft.hi}
          placeholder="हिंदी"
          autoFocus
          onChange={(hi) => setDraft({ ...draft, hi })}
        />
        <GrowText
          value={draft.en}
          placeholder="English"
          onChange={(en) => setDraft({ ...draft, en })}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving || !(draft.hi.trim() || draft.en.trim())}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave?.({ hi: draft.hi.trim(), en: draft.en.trim() });
                setDraft(null);
                toast.success("Saved");
              } catch (e) {
                toast.error(errorText(e, "Couldn't save"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const cls = `${strong ? "font-semibold" : ""} ${preLine ? "whitespace-pre-line" : ""}`;
  const hi = (value.hi ?? "").trim();
  const en = (value.en ?? "").trim();
  const same = hi === en;
  const text =
    lang === "hi" ? (
      <p lang="hi" className={cls}>
        {hi || en}
      </p>
    ) : lang === "en" ? (
      <p className={cls}>{en || hi}</p>
    ) : same || !hi || !en ? (
      <p className={cls}>{hi || en}</p>
    ) : (
      <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
        <p lang="hi" className={cls}>
          {hi}
        </p>
        <p className={`${cls} text-muted-foreground`}>{en}</p>
      </div>
    );

  const shown = faded ? (
    <div className="opacity-50" title="Shown in the visual, so not printed as a point">
      {text}
    </div>
  ) : (
    text
  );
  if (!editing || !onSave) return shown;
  // The buttons take the same room on every line, so the Hindi and English
  // columns line up down the page.
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">{shown}</div>
      <div className="flex w-[4.5rem] shrink-0 justify-end gap-1">
        <IconButton label="Edit this line" onClick={() => setDraft({ ...value })}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        {onDelete ? (
          <IconButton
            label="Delete (both languages)"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        ) : (
          (extra ?? <span className="w-8" aria-hidden />)
        )}
      </div>
    </div>
  );
}

// A text box that grows with its text, so it never scrolls on its own.
function GrowText({
  value,
  onChange,
  placeholder,
  lang,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  lang?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      lang={lang}
      rows={1}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-0 resize-none overflow-hidden bg-background text-base leading-relaxed"
    />
  );
}

// The story's visual as it will print, with the revision line.
