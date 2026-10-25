// The topic editor: one topic of a notes book on a page of its own, like the
// magazine's story editor. A tab for each part (opening, key points,
// sections, table, images, visuals, map, revision, the Mains answer parts,
// past questions, sources), every part editable in place and written again
// by the AI on request, the page beside it, and the previous or next topic a
// tap away. Changes save as you go; earlier versions are kept.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  HelpCircle,
  History,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  addNotePassages,
  deleteBookNote,
  findNotePassages,
  getBookNote,
  getNoteVersion,
  previewBookNote,
  previewNoteVisual,
  restoreBookNote,
  rewriteBookNote,
  rewriteNotePart,
  saveBookNote,
  setBookNoteStatus,
} from "@/lib/notes-books.functions";
import {
  MAX_DYK,
  MAX_PYQS,
  NOTE_PARTS,
  noteFacts,
  unchecked,
  type NoteContent,
  type NotePart,
  type NotePassage,
  type NotePoint,
  type NoteSourced,
} from "@/lib/notes-write";
import type { NotesStage } from "@/lib/notes-books";
import { uncheckedPlaces } from "@/lib/map-spec";
import { MAX_VISUALS, VISUAL_SLOTS, type Bi, type CaContent } from "@/lib/current-affairs";
import { BiField, BiLines, LangToggle, PagesPreview } from "@/components/notes-books";
import { StoryImages } from "@/components/ca-story-images";
import { MapEdit } from "@/components/map-edit";
import {
  PickedPointsVisual,
  StoryVisuals,
  type VisualSubject,
} from "@/components/ca-story-visuals";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Lang = "en" | "hi";
const EMPTY: Bi = { en: "", hi: "" };

type TabId =
  | "preview"
  | "opening"
  | "points"
  | "sections"
  | "table"
  | "images"
  | "visuals"
  | "map"
  | "revision"
  | "answer"
  | "pyqs"
  | "sources";

type Note = Awaited<ReturnType<typeof getBookNote>>;

export type TopicNav = { topic_id: string; number: string; name: Bi };

type Ctx = {
  id: string;
  topic: string;
  stage: NotesStage;
  c: NoteContent;
  note: Note;
  lang: Lang;
  set: (patch: Partial<NoteContent>) => void;
  // A change made by the AI: saved at once, with the notes as they were
  // kept as a version first.
  keep: (patch: Partial<NoteContent>, label: string) => void;
  setNote: (n: Note) => void;
};

// The notes in the magazine's shape, for its images and visuals editors
// (which read the key points and the visual and image fields).
const asStory = (c: NoteContent) =>
  ({ ...c, points: c.points.map((p) => p.text.en || p.text.hi) }) as unknown as CaContent;

// Key points moved, added or removed: the visuals keep standing in for the
// same points. `from[i]` is the old place of point i (-1: a new point).
function withPoints(c: NoteContent, points: NotePoint[], from: number[]): Partial<NoteContent> {
  const patch: Partial<NoteContent> = { points };
  for (const [, coversKey] of VISUAL_SLOTS)
    patch[coversKey] = (c[coversKey] ?? []).map((old) => from.indexOf(old)).filter((i) => i >= 0);
  return patch;
}

// What a part says, as lines (to show what the AI wrote before keeping it).
function partLines(v: unknown, lang: Lang): string[] {
  if (v == null) return [];
  if (typeof v === "string") return v.trim() ? [v] : [];
  if (Array.isArray(v)) return v.flatMap((x) => partLines(x, lang));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.en === "string" || typeof o.hi === "string") {
      const t = String((lang === "hi" ? o.hi || o.en : o.en || o.hi) ?? "").trim();
      return t ? [t.replace(/\*\*/g, "")] : [];
    }
    return Object.entries(o)
      .filter(([k]) => !["src", "ok", "lat", "lon", "words", "region", "rivers"].includes(k))
      .flatMap(([, x]) => partLines(x, lang));
  }
  return [];
}

// A value that settles: the page waits until typing stops.
function useSettled<T>(value: T, ms = 700): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const LIVE_KEY = "notes-editor-live-preview";
function useLivePreview(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LIVE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  return [
    open,
    (v) => {
      setOpen(v);
      try {
        localStorage.setItem(LIVE_KEY, v ? "1" : "0");
      } catch {
        // Not kept: it opens again next time.
      }
    },
  ];
}

export function NotesTopicEditor({
  id,
  stage,
  topics,
  topic,
  onNavigate,
  onClose,
  onChanged,
}: {
  id: string;
  stage: NotesStage;
  // The written topics the arrows go through, in the book's order.
  topics: TopicNav[];
  topic: string;
  onNavigate: (topic: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getBookNote);
  const saveFn = useServerFn(saveBookNote);
  const statusFn = useServerFn(setBookNoteStatus);
  const deleteFn = useServerFn(deleteBookNote);
  const previewFn = useServerFn(previewBookNote);
  const key = ["bookNote", id, topic];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getFn({ data: { id, topic } }),
    refetchOnMount: true,
  });
  const note = q.data;
  const [tab, setTab] = useState<TabId>("preview");
  const [lang, setLang] = useState<Lang>("hi");
  const [c, setC] = useState<NoteContent | null>(null);
  // Remounts the forms when the notes change under them (AI, restore).
  const [gen, setGen] = useState(0);
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [rewrite, setRewrite] = useState(false);
  const [showLive, setShowLive] = useLivePreview();
  const sent = useRef("");
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const main = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

  const at = topics.findIndex((t) => t.topic_id === topic);
  const prev = topics[at - 1];
  const next = topics[at + 1];

  useEffect(() => {
    if (note && !c) {
      setC(note.content);
      sent.current = JSON.stringify(note.content);
    }
  }, [note, c]);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab]);
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const strip = nav.current;
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({
      left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [tab]);

  // Saves the notes (one save at a time, in order).
  const push = (content: NoteContent, label?: string) => {
    const json = JSON.stringify(content);
    if (json === sent.current && !label) return chain.current;
    sent.current = json;
    setSaving((n) => n + 1);
    chain.current = chain.current.then(async () => {
      try {
        const saved = await saveFn({
          data: { id, topic, content: content as never, ...(label ? { label } : {}) },
        });
        qc.setQueryData(key, saved);
        setSavedAt(new Date());
        setSaveError(null);
        onChanged();
      } catch (e) {
        setSaveError(errorText(e, "Couldn't save"));
        // Tried again with the next change.
        sent.current = "";
      } finally {
        setSaving((n) => n - 1);
      }
    });
    return chain.current;
  };
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => void push(c), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  const flush = async () => {
    if (c) await push(c);
    await chain.current;
  };
  const leave = (go: () => void) => {
    setBusy("Saving…");
    void flush().finally(() => {
      setBusy(null);
      go();
    });
  };

  const settled = useSettled({ c, lang });
  const preview = useQuery({
    queryKey: ["bookNotePreview", id, topic, JSON.stringify(settled.c), settled.lang],
    queryFn: () =>
      previewFn({ data: { id, topic, lang: settled.lang, content: settled.c as never } }),
    enabled: !!settled.c,
    placeholderData: (p) => p,
  });

  // Alt+N / Alt+P: next or previous topic; Alt+1…9, Alt+0: a tab.
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const left = c ? unchecked(c) : 0;
  const ctx: Ctx | null =
    c && note
      ? {
          id,
          topic,
          stage,
          c,
          note,
          lang,
          set: (patch) => setC((x) => (x ? { ...x, ...patch } : x)),
          keep: (patch, label) => {
            const nextC = { ...c, ...patch };
            setC(nextC);
            setGen((g) => g + 1);
            void push(nextC, label);
          },
          setNote: (n) => qc.setQueryData(key, n),
        }
      : null;
  const reset = (n: Note) => {
    qc.setQueryData(key, n);
    sent.current = JSON.stringify(n.content);
    setC(n.content);
    setGen((g) => g + 1);
    onChanged();
  };

  const count = (xs: { src: number[]; ok?: boolean }[]) =>
    xs.filter((x) => !x.src.length && !x.ok).length;
  const warn = (n: number): string | false => (n ? `${n} to check` : false);
  const tabs: {
    id: TabId;
    label: string;
    icon: typeof FileText;
    count?: number;
    warn?: string | false;
  }[] = c
    ? [
        { id: "preview", label: "Preview", icon: Eye },
        {
          id: "opening",
          label: "Opening",
          icon: FileText,
          count: c.definitions.length || undefined,
          warn: warn(count([c.intro].filter((x) => x.text.en || x.text.hi)) + count(c.definitions)),
        },
        {
          id: "points",
          label: stage === "mains" ? "Key facts" : "Key points",
          icon: ListChecks,
          count: c.points.length,
          warn: warn(count(c.points)),
        },
        {
          id: "sections",
          label: "Sections",
          icon: BookOpen,
          count: c.sections.length,
          warn: warn(count(c.sections.flatMap((s) => s.points))),
        },
        { id: "table", label: "Table", icon: Table2, count: c.table ? 1 : undefined },
        { id: "images", label: "Images", icon: ImageIcon, count: c.images.length },
        {
          id: "visuals",
          label: "Visuals",
          icon: BarChart3,
          count: VISUAL_SLOTS.filter(([k]) => c[k]).length,
        },
        {
          id: "map",
          label: "Map",
          icon: MapIcon,
          count: c.map?.places.length,
          warn: warn(uncheckedPlaces(c.map)),
        },
        {
          id: "revision",
          label: stage === "prelims" ? "Trap and revision" : "Did you know",
          icon: Lightbulb,
          count: (stage === "prelims" ? c.oneliners.length : 0) + c.dyk.length,
          warn: warn(count(c.dyk)),
        },
        ...(stage === "mains"
          ? [
              {
                id: "answer" as const,
                label: "Answer writing",
                icon: PenLine,
                count: c.data.length + c.official.length,
                warn: warn(count(c.data) + count(c.official)),
              },
            ]
          : []),
        {
          id: "pyqs",
          label: "Past questions",
          icon: HelpCircle,
          count: note?.questions.length,
        },
        {
          id: "sources",
          label: "Sources",
          icon: Search,
          count: note?.passages.length,
          warn: note && !note.passages.length && "No passages",
        },
      ]
    : [];
  keys.current = (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const digit = /^Digit(\d)$/.exec(e.code)?.[1];
    const t = digit ? tabs[digit === "0" ? 9 : Number(digit) - 1] : undefined;
    if (e.code === "KeyN" && next) leave(() => onNavigate(next.topic_id));
    else if (e.code === "KeyP" && prev) leave(() => onNavigate(prev.topic_id));
    else if (t) setTab(t.id);
    else return;
    e.preventDefault();
  };

  const name = note?.topic?.name ?? topics[at]?.name ?? EMPTY;
  const number = note?.topic?.number ?? topics[at]?.number ?? "";
  const approved = note?.status === "approved";

  async function setApproved(on: boolean) {
    setBusy(on ? "Approving…" : "…");
    try {
      await flush();
      await statusFn({ data: { id, topic, approved: on } });
      await q.refetch();
      onChanged();
      toast.success(on ? "Approved" : "Back to a draft");
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && leave(onClose)}>
      <DialogContent
        aria-describedby={undefined}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        {/* Which topic, the page's language and the menu. */}
        <header className="border-b border-border bg-background">
          <div className="flex items-start gap-2 p-2 pr-12 sm:pl-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                Topic {at + 1} of {topics.length}
                {note?.topic?.path ? ` · ${note.topic.path}` : ""}
              </p>
              <DialogTitle className="truncate text-base font-semibold leading-snug">
                {number} {lang === "hi" ? name.hi || name.en : name.en || name.hi}
              </DialogTitle>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <LangToggle lang={lang} onChange={setLang} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!ctx} onSelect={() => setHistory(true)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!ctx} onSelect={() => setRewrite(true)}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Write the topic again…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={async () => {
                      if (!confirm("Delete this topic's notes? It can be written again later."))
                        return;
                      try {
                        await chain.current;
                        await deleteFn({ data: { id, topic } });
                        onChanged();
                        toast.success("Deleted");
                        onClose();
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't delete"));
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete the notes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 sm:px-4">
            {approved ? <Badge tone="good">Approved</Badge> : <Badge tone="primary">Draft</Badge>}
            {c &&
              (left > 0 ? (
                <Badge tone="bad">◇ {left} to check</Badge>
              ) : (
                <Badge tone="good">Every line has a source or is checked</Badge>
              ))}
            {note && note.questions.length > 0 && (
              <Badge tone="warn">Asked {note.questions.length}×</Badge>
            )}
            {busy && (
              <span role="status" className="flex items-center gap-1.5 text-xs text-primary">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {busy}
              </span>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* The parts: a strip on phones, a column on laptops. */}
          <nav
            ref={nav}
            aria-label="Parts of the topic"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1.5 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] lg:w-52 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-2 lg:[mask-image:none]"
          >
            {tabs.map((t, i) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={`${t.label} (Alt+${(i + 1) % 10})`}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{t.label}</span>
                  {t.warn && (
                    <span
                      className={`h-2 w-2 rounded-full ${on ? "bg-primary-foreground" : "bg-amber-500"}`}
                      role="img"
                      aria-label={`needs checking: ${t.warn}`}
                      title={t.warn}
                    />
                  )}
                  {!!t.count && (
                    <span
                      className={`rounded-full px-1.5 text-[11px] ${on ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="mx-auto max-w-3xl space-y-4 p-3 pb-24 text-[15px] leading-relaxed sm:p-5 sm:text-sm"
              key={`${topic}-${gen}`}
            >
              {q.error ? (
                <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load it")}</p>
              ) : !ctx ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : tab === "preview" ? (
                <section aria-label="Preview" className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    The page as the review copy prints it: ◇ marks lines written without a source
                    passage (the student copy has no marks).
                  </p>
                  {preview.data ? (
                    <PagesPreview html={preview.data.html} />
                  ) : (
                    <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
                  )}
                </section>
              ) : tab === "opening" ? (
                <OpeningTab {...ctx} />
              ) : tab === "points" ? (
                <PointsTab {...ctx} />
              ) : tab === "sections" ? (
                <SectionsTab {...ctx} />
              ) : tab === "table" ? (
                <Section
                  title="Table"
                  hint="Facts that compare well side by side: dams, places, years…"
                  ai={<PartAI ctx={ctx} part="table" />}
                >
                  <TableEdit c={ctx.c} onChange={(table) => ctx.set({ table })} />
                </Section>
              ) : tab === "images" ? (
                <Section
                  title="Images"
                  hint="Photos, maps or diagrams for this topic. Crop, turn, caption and place each one, as in the magazine."
                >
                  <StoryImages
                    itemId={topic}
                    content={asStory(ctx.c)}
                    lang={lang}
                    editing
                    onSave={async (patch) => ctx.set({ images: patch.images ?? ctx.c.images })}
                  />
                </Section>
              ) : tab === "visuals" ? (
                <VisualsTab {...ctx} />
              ) : tab === "map" ? (
                <Section
                  title="Map"
                  hint="Numbered places on the official outline, with the layers you choose. Places are checked against the place list; check the rest on Google Maps."
                  ai={<PartAI ctx={ctx} part="map" />}
                >
                  <MapEdit map={ctx.c.map} onChange={(map) => ctx.set({ map })} />
                </Section>
              ) : tab === "revision" ? (
                <RevisionTab {...ctx} />
              ) : tab === "answer" ? (
                <AnswerTab {...ctx} />
              ) : tab === "pyqs" ? (
                <PyqTab {...ctx} />
              ) : (
                <SourcesTab {...ctx} onRewrite={() => setRewrite(true)} />
              )}
            </div>
          </main>
          {ctx && tab !== "preview" && (
            <aside
              aria-label="Page"
              className={`hidden shrink-0 border-l border-border bg-muted/20 lg:flex lg:flex-col ${showLive ? "lg:w-[420px] xl:w-[480px]" : "lg:w-11"}`}
            >
              <div className="flex items-center gap-2 p-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label={showLive ? "Hide the page" : "Show the page"}
                  onClick={() => setShowLive(!showLive)}
                >
                  {showLive ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                </Button>
                {showLive && (
                  <>
                    <span className="text-sm font-medium">Page</span>
                    {preview.isFetching && (
                      <RefreshCw
                        className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                        aria-label="Updating"
                      />
                    )}
                  </>
                )}
              </div>
              {showLive && (
                <div className="min-h-0 flex-1 px-2 pb-2">
                  {preview.data ? (
                    <PagesPreview html={preview.data.html} />
                  ) : (
                    <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
                  )}
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Approval and Done. */}
        <footer className="flex items-center gap-2 border-t border-border bg-background px-2 py-2 sm:px-4">
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${approved ? "border-current bg-muted/60 font-medium text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}`}
            title={left && !approved ? "Check every ◇ line first" : undefined}
          >
            <Checkbox
              checked={approved}
              disabled={!ctx || !!busy || (!approved && left > 0)}
              onCheckedChange={(v) => void setApproved(v === true)}
              aria-label="Approve"
            />
            <Check className="hidden h-3.5 w-3.5 sm:block" /> Approve
          </label>
          {!approved && left > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Check the {left} ◇ line{left === 1 ? "" : "s"} first
            </span>
          )}
          <span className="flex-1" />
          <div className="flex items-center gap-1" role="group" aria-label="Topics">
            {[
              { to: prev, label: "Previous topic", key: "Alt+P", Icon: ChevronLeft },
              { to: next, label: "Next topic", key: "Alt+N", Icon: ChevronRight },
            ].map(({ to, label, key: k, Icon }) => (
              <Button
                key={label}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={label}
                title={`${label}${to ? `: ${to.number}` : ""} (${k})`}
                disabled={!to}
                onClick={() => to && leave(() => onNavigate(to.topic_id))}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <span
            role="status"
            className={`min-w-0 text-right text-xs ${saveError ? "text-destructive" : "hidden text-muted-foreground sm:inline"}`}
          >
            {saveError
              ? saveError
              : saving > 0
                ? "Saving…"
                : savedAt
                  ? `Saved · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Changes save as you go"}
          </span>
          <Button size="sm" variant="outline" onClick={() => leave(onClose)}>
            <Check className="mr-1 h-4 w-4" /> Done
          </Button>
        </footer>
        {ctx && history && (
          <HistoryDialog
            ctx={ctx}
            onClose={() => setHistory(false)}
            onRestored={(n) => {
              reset(n);
              setHistory(false);
            }}
            flush={flush}
          />
        )}
        {ctx && rewrite && (
          <RewriteDialog
            ctx={ctx}
            onClose={() => setRewrite(false)}
            flush={flush}
            onDone={(n) => {
              reset(n);
              setRewrite(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ====================== Parts ======================

function Section({
  title,
  hint,
  ai,
  children,
}: {
  title: string;
  hint?: string;
  ai?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {ai}
      </div>
      {children}
    </section>
  );
}

// "Write again with AI" for one part: the editor's note, the AI's version
// beside it, and Keep (the notes as they were stay in History).
function PartAI({ ctx, part, label }: { ctx: Ctx; part: NotePart; label?: string }) {
  const rewriteFn = useServerFn(rewriteNotePart);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<Partial<NoteContent> | null>(null);
  const name = label ?? NOTE_PARTS[part].label;
  const make = async () => {
    setMaking(true);
    try {
      setMade(
        await rewriteFn({
          data: { id: ctx.id, topic: ctx.topic, part, note, content: ctx.c as never },
        }),
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't write it"));
    } finally {
      setMaking(false);
    }
  };
  const lines = made ? partLines(made[part], ctx.lang) : [];
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="mr-1 h-3.5 w-3.5" /> Write again with AI
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Write the {name.toLowerCase()} again</DialogTitle>
              <DialogDescription>
                SAATHI writes this part again from the topic's passages, in Hindi and English.
                Nothing changes until you keep it; the notes as they are now stay in History.
              </DialogDescription>
            </DialogHeader>
            {!made ? (
              <>
                <Textarea
                  aria-label="Note for SAATHI"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note, e.g. add the dams on the Chambal; keep it shorter"
                  rows={3}
                  maxLength={500}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={making}>
                    Cancel
                  </Button>
                  <Button onClick={() => void make()} disabled={making}>
                    {making ? "Writing…" : "Write it"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div
                  className="rounded-xl border border-border bg-muted/30 p-3"
                  data-testid="part-ai-result"
                >
                  {lines.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      SAATHI left this part empty: keeping it removes the part.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={making}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    disabled={making}
                    onClick={() => {
                      setMade(null);
                      void make();
                    }}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> {making ? "Writing…" : "Try again"}
                  </Button>
                  <Button variant="ghost" disabled={making} onClick={() => setMade(null)}>
                    Change the note
                  </Button>
                  <Button
                    disabled={making}
                    onClick={() => {
                      ctx.keep(made, `Before the ${name.toLowerCase()} was written again`);
                      setOpen(false);
                      setMade(null);
                      toast.success(`${name} written again`);
                    }}
                  >
                    Keep
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function OpeningTab(ctx: Ctx) {
  const { c, note, set } = ctx;
  const P = note.passages;
  return (
    <>
      <Section
        title="Opening"
        hint={
          ctx.stage === "mains"
            ? "Context that can open an answer, in 2–3 sentences."
            : "2–3 sentences placing the topic."
        }
        ai={<PartAI ctx={ctx} part="intro" />}
      >
        <PointRow
          label="Opening"
          point={c.intro}
          passages={P}
          rows={3}
          onChange={(intro) => set({ intro })}
        />
      </Section>
      <Section
        title="Definitions"
        hint="Word for word from a passage: a definition not found in the passage it cites must be checked."
        ai={<PartAI ctx={ctx} part="definitions" />}
      >
        {c.definitions.map((d, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-2">
            <div className="flex items-center gap-2">
              <SrcChips src={d.src} passages={P} />
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                aria-label={`Remove definition ${i + 1}`}
                onClick={() => set({ definitions: c.definitions.filter((_, k) => k !== i) })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <BiField
              label={`Term ${i + 1}`}
              value={d.term}
              onChange={(term) =>
                set({ definitions: c.definitions.map((x, k) => (k === i ? { ...x, term } : x)) })
              }
            />
            <BiField
              label={`Definition ${i + 1}`}
              rows={2}
              value={d.text}
              onChange={(text) =>
                set({ definitions: c.definitions.map((x, k) => (k === i ? { ...x, text } : x)) })
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Definition ${i + 1} source`}
                placeholder="Source (book, class, chapter)"
                className="min-w-0 flex-1"
                value={d.source}
                onChange={(e) =>
                  set({
                    definitions: c.definitions.map((x, k) =>
                      k === i ? { ...x, source: e.target.value } : x,
                    ),
                  })
                }
              />
              <LinkPassages
                label={`Definition ${i + 1}`}
                src={d.src}
                passages={P}
                onChange={(src) =>
                  set({ definitions: c.definitions.map((x, k) => (k === i ? { ...x, src } : x)) })
                }
              />
            </div>
          </div>
        ))}
        {c.definitions.length < 4 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                definitions: [...c.definitions, { term: EMPTY, text: EMPTY, source: "", src: [] }],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add a definition
          </Button>
        )}
      </Section>
    </>
  );
}

function PointsTab(ctx: Ctx) {
  const { c, note, set } = ctx;
  const [picked, setPicked] = useState<number[]>([]);
  const [making, setMaking] = useState(false);
  const covered = new Map<number, number>();
  VISUAL_SLOTS.forEach(([key, coversKey], v) => {
    if (c[key]) for (const i of c[coversKey] ?? []) covered.set(i, v + 1);
  });
  const subject = useSubject(ctx);
  const change = (points: NotePoint[], from: number[]) => {
    set(withPoints(c, points, from));
    setPicked([]);
  };
  const idx = c.points.map((_, i) => i);
  return (
    <Section
      title={ctx.stage === "mains" ? "Key facts" : "Key points"}
      hint="One fact a line, the key word in **bold**. Tick points to show them as a visual instead (they leave the text)."
      ai={<PartAI ctx={ctx} part="points" />}
    >
      {c.points.map((p, i) => (
        <PointRow
          key={i}
          label={`Point ${i + 1}`}
          point={p}
          passages={note.passages}
          onChange={(x) => set({ points: c.points.map((y, k) => (k === i ? x : y)) })}
          onRemove={() =>
            change(
              c.points.filter((_, k) => k !== i),
              idx.filter((k) => k !== i),
            )
          }
          onMove={(by) => {
            const j = i + by;
            if (j < 0 || j >= c.points.length) return;
            const order = [...idx];
            [order[i], order[j]] = [order[j], order[i]];
            change(
              order.map((k) => c.points[k]),
              order,
            );
          }}
          first={i === 0}
          last={i === c.points.length - 1}
          extra={
            <>
              {covered.has(i) && (
                <Badge tone="primary" title="Shown in the visual instead of the text">
                  In visual {covered.get(i)}
                </Badge>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={picked.includes(i)}
                  onChange={(e) =>
                    setPicked((xs) => (e.target.checked ? [...xs, i] : xs.filter((x) => x !== i)))
                  }
                  aria-label={`Point ${i + 1}: show in a visual`}
                />
                For a visual
              </label>
            </>
          }
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => change([...c.points, { text: EMPTY, src: [], ok: true }], [...idx, -1])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add a point
        </Button>
        {picked.length > 0 && (
          <Button size="sm" disabled={picked.length < 2} onClick={() => setMaking(true)}>
            <BarChart3 className="mr-1 h-4 w-4" />
            {picked.length < 2
              ? "Tick one more point for a visual"
              : `Make a visual from ${picked.length} points`}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Points you add yourself count as checked. Use **word** for bold.
      </p>
      {making && (
        <PickedPointsVisual
          item={subject}
          content={asStory(c)}
          facts={[...picked].sort((a, b) => a - b)}
          onClose={() => {
            setMaking(false);
            setPicked([]);
          }}
          onSave={async (patch) => set(patch as Partial<NoteContent>)}
        />
      )}
    </Section>
  );
}

// What the visuals are made from: the notes as they are now.
function useSubject(ctx: Ctx): VisualSubject {
  const visualFn = useServerFn(previewNoteVisual);
  const { c } = ctx;
  return useMemo(
    () => ({
      id: ctx.topic,
      headline: ctx.note.topic?.name.en || ctx.note.topic?.name.hi || "",
      facts: noteFacts(c),
      make: (opts) =>
        visualFn({ data: { id: ctx.id, topic: ctx.topic, ...opts, content: c as never } }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, ctx.id, ctx.topic],
  );
}

function VisualsTab(ctx: Ctx) {
  const subject = useSubject(ctx);
  return (
    <Section
      title="Visuals"
      hint={`Up to ${MAX_VISUALS}, each above, beside or below the key points, made from this topic's notes. Rebuild one as the type you pick, or edit its text and numbers.`}
    >
      {ctx.c.points.length + ctx.c.sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">Write some key points first.</p>
      ) : (
        <StoryVisuals
          item={subject}
          content={asStory(ctx.c)}
          busy={false}
          onSave={async (patch) => ctx.set(patch as Partial<NoteContent>)}
        />
      )}
    </Section>
  );
}

function SectionsTab(ctx: Ctx) {
  const { c, note, set } = ctx;
  return (
    <Section
      title="Sections"
      hint={
        ctx.stage === "mains"
          ? "Parts such as features, significance, problems and way forward, each with its points."
          : "Sub-headings with their own points, when the topic has parts."
      }
      ai={<PartAI ctx={ctx} part="sections" />}
    >
      {c.sections.map((s, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border p-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Section {i + 1}</span>
            <span className="flex-1" />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={`Move section ${i + 1} up`}
              disabled={i === 0}
              onClick={() => {
                const xs = [...c.sections];
                [xs[i - 1], xs[i]] = [xs[i], xs[i - 1]];
                set({ sections: xs });
              }}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={`Move section ${i + 1} down`}
              disabled={i === c.sections.length - 1}
              onClick={() => {
                const xs = [...c.sections];
                [xs[i + 1], xs[i]] = [xs[i], xs[i + 1]];
                set({ sections: xs });
              }}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              aria-label={`Remove section ${i + 1}`}
              onClick={() => set({ sections: c.sections.filter((_, k) => k !== i) })}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <BiField
            label={`Section ${i + 1} heading`}
            value={s.heading}
            onChange={(heading) =>
              set({ sections: c.sections.map((x, k) => (k === i ? { ...x, heading } : x)) })
            }
          />
          <PointList
            label={`Section ${i + 1} point`}
            points={s.points}
            passages={note.passages}
            onChange={(points) =>
              set({ sections: c.sections.map((x, k) => (k === i ? { ...x, points } : x)) })
            }
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => set({ sections: [...c.sections, { heading: EMPTY, points: [] }] })}
      >
        <Plus className="mr-1 h-4 w-4" /> Add a section
      </Button>
    </Section>
  );
}

function RevisionTab(ctx: Ctx) {
  const { c, note, set } = ctx;
  return (
    <>
      {ctx.stage === "prelims" && (
        <>
          <Section
            title="Exam trap"
            hint="One fact students often confuse."
            ai={<PartAI ctx={ctx} part="trap" />}
          >
            <BiField label="Exam trap" rows={2} value={c.trap} onChange={(trap) => set({ trap })} />
          </Section>
          <Section
            title="Quick revision"
            hint="Short question and answer pairs, printed as one-liners."
            ai={<PartAI ctx={ctx} part="oneliners" />}
          >
            {c.oneliners.map((o, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-[16rem]">
                  <BiField
                    label={`Revision ${i + 1}`}
                    value={o.q}
                    onChange={(qq) =>
                      set({
                        oneliners: c.oneliners.map((x, k) => (k === i ? { ...x, q: qq } : x)),
                      })
                    }
                  />
                </div>
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <BiField
                    label={`Answer ${i + 1}`}
                    value={o.a}
                    onChange={(a) =>
                      set({ oneliners: c.oneliners.map((x, k) => (k === i ? { ...x, a } : x)) })
                    }
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove revision ${i + 1}`}
                  onClick={() => set({ oneliners: c.oneliners.filter((_, k) => k !== i) })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => set({ oneliners: [...c.oneliners, { q: EMPTY, a: EMPTY }] })}
            >
              <Plus className="mr-1 h-4 w-4" /> Add a one-liner
            </Button>
          </Section>
        </>
      )}
      <Section
        title="Did you know?"
        hint={`Up to ${MAX_DYK} surprising, memorable facts, in a box on the page.`}
        ai={<PartAI ctx={ctx} part="dyk" />}
      >
        <PointList
          label="Did you know"
          points={c.dyk}
          passages={note.passages}
          max={MAX_DYK}
          onChange={(dyk) => set({ dyk })}
        />
      </Section>
    </>
  );
}

function AnswerTab(ctx: Ctx) {
  const { c, note, set } = ctx;
  const P = note.passages;
  return (
    <>
      <Section
        title="Keywords"
        hint="Terms to use in answers."
        ai={<PartAI ctx={ctx} part="keywords" />}
      >
        <BiLines
          label="Keywords"
          value={c.keywords}
          max={8}
          onChange={(keywords) => set({ keywords })}
        />
      </Section>
      <Section
        title="Data"
        hint="Figures with their year and source (Census 2011…)."
        ai={<PartAI ctx={ctx} part="data" />}
      >
        <SourcedList label="Data" items={c.data} passages={P} onChange={(data) => set({ data })} />
      </Section>
      <Section
        title="Official text"
        hint="From the Constitution, an Act or a policy, with its source."
        ai={<PartAI ctx={ctx} part="official" />}
      >
        <SourcedList
          label="Official text"
          items={c.official}
          passages={P}
          onChange={(official) => set({ official })}
        />
      </Section>
      <Section
        title="Answer plan"
        hint="How a 150-word answer splits across its parts."
        ai={<PartAI ctx={ctx} part="plan" />}
      >
        {c.plan.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-[16rem]">
              <BiField
                label={`Part ${i + 1}`}
                value={p.part}
                onChange={(part) =>
                  set({ plan: c.plan.map((x, k) => (k === i ? { ...x, part } : x)) })
                }
              />
            </div>
            <Input
              aria-label={`Part ${i + 1} words`}
              type="number"
              className="w-20"
              value={p.words}
              onChange={(e) =>
                set({
                  plan: c.plan.map((x, k) =>
                    k === i ? { ...x, words: Number(e.target.value) || 0 } : x,
                  ),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove part ${i + 1}`}
              onClick={() => set({ plan: c.plan.filter((_, k) => k !== i) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => set({ plan: [...c.plan, { part: EMPTY, words: 20 }] })}
        >
          <Plus className="mr-1 h-4 w-4" /> Add a part
        </Button>
      </Section>
      <Section
        title="Practice question"
        hint="One Mains-style question with marks and word limit."
        ai={<PartAI ctx={ctx} part="practice" />}
      >
        <BiField
          label="Practice question"
          rows={2}
          value={c.practice}
          onChange={(practice) => set({ practice })}
        />
      </Section>
    </>
  );
}

function PyqTab(ctx: Ctx) {
  const { c, note, set } = ctx;
  const chosen = c.pyq_ids;
  const qs = note.questions;
  return (
    <Section
      title="Past questions"
      hint={`The questions filed under this topic in the exam papers. Choose up to ${MAX_PYQS} to print with the notes, in the order you tick them; none chosen: the first one prints.`}
    >
      {!qs.length ? (
        <p className="text-sm text-muted-foreground">
          No past questions are filed under this topic yet (Exam papers: tag questions to the master
          outline).
        </p>
      ) : (
        <ol className="space-y-2">
          {qs.map((q) => {
            const n = chosen.indexOf(q.id);
            return (
              <li key={q.id}>
                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-sm ${n >= 0 ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={n >= 0}
                    disabled={n < 0 && chosen.length >= MAX_PYQS}
                    onChange={(e) =>
                      set({
                        pyq_ids: e.target.checked
                          ? [...chosen, q.id]
                          : chosen.filter((x) => x !== q.id),
                      })
                    }
                    aria-label={`Print: ${q.q.en || q.q.hi}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 inline-flex gap-1">
                      <Badge tone="warn">
                        {q.exam}
                        {q.marks ? ` · ${q.marks} marks` : ""}
                      </Badge>
                      {n >= 0 && <Badge tone="primary">Prints {n + 1}</Badge>}
                    </span>
                    <span lang="hi">{q.q.hi || q.q.en}</span>
                    {q.q.hi && q.q.en && (
                      <span className="block text-muted-foreground">{q.q.en}</span>
                    )}
                    {q.options.length > 0 && (
                      <span className="mt-1 grid gap-x-3 text-xs text-muted-foreground sm:grid-cols-2">
                        {q.options.map((o, i) => (
                          <span
                            key={i}
                            className={
                              q.correct === i + 1
                                ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                : ""
                            }
                          >
                            ({"abcd"[i]}) {o.hi || o.en}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function SourcesTab(ctx: Ctx & { onRewrite: () => void }) {
  const { c, note } = ctx;
  const findFn = useServerFn(findNotePassages);
  const addFn = useServerFn(addNotePassages);
  const [query, setQuery] = useState(note.topic?.path ?? "");
  const [found, setFound] = useState<{ title: string; subject: string; content: string }[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  // How many lines each passage is behind.
  const used = new Map<number, number>();
  const all = [
    c.intro,
    ...c.points,
    ...c.sections.flatMap((s) => s.points),
    ...c.definitions,
    ...c.data,
    ...c.official,
    ...c.dyk,
  ];
  for (const x of all) for (const k of x.src) used.set(k, (used.get(k) ?? 0) + 1);
  const add = async (items: { title: string; subject: string; content: string }[], ok: string) => {
    setBusy(true);
    try {
      const n = await addFn({ data: { id: ctx.id, topic: ctx.topic, items } });
      ctx.setNote(n);
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Section
        title="Sources"
        hint="The knowledge base passages the notes were written from. Every line shows the ones it came from; add more below, then write a part or the whole topic again to use them."
      >
        {note.passages.length ? (
          <ol className="space-y-1.5 text-sm" data-testid="passages">
            {note.passages.map((p) => (
              <li key={p.k} id={`passage-${p.k}`} className="scroll-mt-20">
                <details className="rounded-xl border border-border p-2">
                  <summary className="cursor-pointer">
                    <b>[{p.k}]</b> {p.title}{" "}
                    <span className="text-xs text-muted-foreground">
                      {p.subject}
                      {used.get(p.k) ? ` · behind ${used.get(p.k)} line(s)` : " · not used yet"}
                    </span>
                  </summary>
                  <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/50 p-2 text-xs">
                    {p.content}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            None were found: every line was written without a source. Search again or add your own
            material.
          </p>
        )}
        <Button size="sm" variant="outline" onClick={ctx.onRewrite}>
          <RefreshCw className="mr-1 h-4 w-4" /> Write the topic again…
        </Button>
      </Section>
      <Section
        title="Search the knowledge base"
        hint="In your own words: a book, a term, a place. Add the passages that fit."
      >
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              setFound(await findFn({ data: { id: ctx.id, topic: ctx.topic, query } }));
            } catch (err) {
              toast.error(errorText(err, "Couldn't search"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            aria-label="Search the knowledge base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Chambal river dams Gandhi Sagar"
          />
          <Button type="submit" size="sm" disabled={busy || query.trim().length < 3}>
            <Search className="mr-1 h-4 w-4" /> Search
          </Button>
        </form>
        {found &&
          (found.length ? (
            <ul className="space-y-1.5 text-sm" data-testid="found-passages">
              {found.map((m, i) => (
                <li key={i} className="rounded-xl border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-medium">
                      {m.title} <span className="text-xs text-muted-foreground">{m.subject}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={busy}
                      onClick={async () => {
                        if (await add([m], "Passage added"))
                          setFound((xs) => (xs ?? []).filter((_, k) => k !== i));
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{m.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing new found.</p>
          ))}
      </Section>
      <Section
        title="Your own material"
        hint="Paste text from a book, an Act or official data. It is added as a passage the AI writes from."
      >
        <Input
          aria-label="Material title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Where it is from (e.g. RBSE Class 10 Geography, ch. 3)"
        />
        <Textarea
          aria-label="Material text"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The text"
        />
        <Button
          size="sm"
          disabled={busy || text.trim().length < 20}
          onClick={async () => {
            if (
              await add(
                [{ title: title || "Your material", subject: "Your material", content: text }],
                "Material added as a passage",
              )
            ) {
              setTitle("");
              setText("");
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add as a passage
        </Button>
      </Section>
    </>
  );
}

// ====================== Dialogs ======================

function RewriteDialog({
  ctx,
  onClose,
  onDone,
  flush,
}: {
  ctx: Ctx;
  onClose: () => void;
  onDone: (n: Note) => void;
  flush: () => Promise<void>;
}) {
  const rewriteFn = useServerFn(rewriteBookNote);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Write the topic again</DialogTitle>
          <DialogDescription>
            Every written part is replaced; your images, visuals and chosen past questions stay. The
            notes as they are now are kept in History.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm" role="radiogroup" aria-label="Write it from">
          {[
            [false, `From its ${ctx.note.passages.length} passages (with any you added)`],
            [true, "From a new search of the knowledge base"],
          ].map(([v, label]) => (
            <label key={String(v)} className="flex items-center gap-2">
              <input
                type="radio"
                name="rewrite-from"
                checked={fresh === v}
                onChange={() => setFresh(v as boolean)}
              />
              {label as string}
            </label>
          ))}
        </div>
        <Textarea
          aria-label="Note for SAATHI"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Optional note, e.g. give more on irrigation projects; use simpler Hindi"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await flush();
                onDone(await rewriteFn({ data: { id: ctx.id, topic: ctx.topic, fresh, note } }));
                toast.success("Written again");
              } catch (e) {
                toast.error(errorText(e, "Couldn't write it"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkles className="mr-1 h-4 w-4" /> {busy ? "Writing…" : "Write it again"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  ctx,
  onClose,
  onRestored,
  flush,
}: {
  ctx: Ctx;
  onClose: () => void;
  onRestored: (n: Note) => void;
  flush: () => Promise<void>;
}) {
  const versionFn = useServerFn(getNoteVersion);
  const restoreFn = useServerFn(restoreBookNote);
  const previewFn = useServerFn(previewBookNote);
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const version = useQuery({
    queryKey: ["noteVersion", ctx.id, ctx.topic, at, ctx.lang],
    queryFn: async () => {
      const v = await versionFn({ data: { id: ctx.id, topic: ctx.topic, at: at! } });
      const { html } = await previewFn({
        data: { id: ctx.id, topic: ctx.topic, lang: ctx.lang, content: v.content as never },
      });
      return { ...v, html };
    },
    enabled: !!at,
  });
  const list = ctx.note.versions;
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Versions kept before the AI wrote anything, and now and then while you edit. Going back
            keeps the notes as they are now as a version too.
          </DialogDescription>
        </DialogHeader>
        {list === null ? (
          <p className="text-sm text-muted-foreground">
            History needs a database update: run the latest migration (notes_versions).
          </p>
        ) : !list.length ? (
          <p className="text-sm text-muted-foreground">No earlier versions yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
            <ol className="space-y-1" aria-label="Versions">
              {list.map((v) => (
                <li key={v.at}>
                  <button
                    type="button"
                    onClick={() => setAt(v.at)}
                    aria-pressed={at === v.at}
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-sm ${at === v.at ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <span className="block font-medium">
                      {new Date(v.at).toLocaleString([], {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="block text-xs text-muted-foreground">{v.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="min-w-0 space-y-2">
              {!at ? (
                <p className="text-sm text-muted-foreground">Pick a version to see it.</p>
              ) : version.data ? (
                <>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await flush();
                          onRestored(
                            await restoreFn({ data: { id: ctx.id, topic: ctx.topic, at } }),
                          );
                          toast.success("Back to the earlier version");
                        } catch (e) {
                          toast.error(errorText(e, "Couldn't go back"));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <History className="mr-1 h-4 w-4" /> Go back to this version
                    </Button>
                  </div>
                  <PagesPreview html={version.data.html} />
                </>
              ) : version.error ? (
                <p className="text-sm text-destructive">
                  {errorText(version.error, "Couldn't load it")}
                </p>
              ) : (
                <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ====================== Fields ======================

// The passages a line came from, or ◇.
function SrcChips({ src, passages, ok }: { src: number[]; passages: NotePassage[]; ok?: boolean }) {
  if (!src.length)
    return ok ? (
      <Badge tone="good">Checked by you</Badge>
    ) : (
      <Badge tone="bad">◇ No source passage</Badge>
    );
  return (
    <span className="flex flex-wrap gap-1">
      {src.map((k) => (
        <span
          key={k}
          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
          title={passages.find((p) => p.k === k)?.title}
        >
          [{k}] {passages.find((p) => p.k === k)?.title.slice(0, 40)}
        </span>
      ))}
    </span>
  );
}

// Links a line to the passages it comes from (a line with one isn't ◇).
function LinkPassages({
  label,
  src,
  passages,
  onChange,
}: {
  label: string;
  src: number[];
  passages: NotePassage[];
  onChange: (src: number[]) => void;
}) {
  if (!passages.length) return null;
  return (
    <details className="relative text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        Sources
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-72 space-y-1 rounded-xl border border-border bg-popover p-2 shadow-lg">
        {passages.map((p) => (
          <label key={p.k} className="flex items-start gap-1.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={src.includes(p.k)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...src, p.k].sort((a, b) => a - b)
                    : src.filter((k) => k !== p.k),
                )
              }
              aria-label={`${label}: from passage ${p.k}`}
            />
            <span>
              [{p.k}] {p.title}
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

function PointRow({
  label,
  point,
  passages,
  rows = 2,
  onChange,
  onRemove,
  onMove,
  first,
  last,
  extra,
}: {
  label: string;
  point: NotePoint;
  passages: NotePassage[];
  rows?: number;
  onChange: (p: NotePoint) => void;
  onRemove?: () => void;
  onMove?: (by: number) => void;
  first?: boolean;
  last?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={`space-y-1.5 rounded-xl border p-2 ${!point.src.length && !point.ok ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SrcChips src={point.src} passages={passages} ok={point.ok} />
        {!point.src.length && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={!!point.ok}
              onChange={(e) => onChange({ ...point, ok: e.target.checked })}
              aria-label={`${label}: checked, keep it`}
            />
            Checked, keep it
          </label>
        )}
        {extra}
        <span className="ml-auto flex items-center gap-1">
          <LinkPassages
            label={label}
            src={point.src}
            passages={passages}
            onChange={(src) => onChange({ ...point, src })}
          />
          {onMove && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={`Move ${label.toLowerCase()} up`}
                disabled={first}
                onClick={() => onMove(-1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={`Move ${label.toLowerCase()} down`}
                disabled={last}
                onClick={() => onMove(1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {onRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={onRemove}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["hi", "en"] as const).map((l) => (
          <Textarea
            key={l}
            aria-label={`${label} (${l === "hi" ? "Hindi" : "English"})`}
            lang={l}
            rows={rows}
            value={point.text[l]}
            onChange={(e) => onChange({ ...point, text: { ...point.text, [l]: e.target.value } })}
          />
        ))}
      </div>
    </div>
  );
}

function PointList({
  label,
  points,
  passages,
  max,
  onChange,
}: {
  label: string;
  points: NotePoint[];
  passages: NotePassage[];
  max?: number;
  onChange: (p: NotePoint[]) => void;
}) {
  return (
    <div className="space-y-2">
      {points.map((p, i) => (
        <PointRow
          key={i}
          label={`${label} ${i + 1}`}
          point={p}
          passages={passages}
          onChange={(x) => onChange(points.map((y, k) => (k === i ? x : y)))}
          onRemove={() => onChange(points.filter((_, k) => k !== i))}
          onMove={(by) => {
            const j = i + by;
            const xs = [...points];
            [xs[i], xs[j]] = [xs[j], xs[i]];
            onChange(xs);
          }}
          first={i === 0}
          last={i === points.length - 1}
        />
      ))}
      {(!max || points.length < max) && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...points, { text: EMPTY, src: [], ok: true }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add {label === "Did you know" ? "a fact" : "a point"}
        </Button>
      )}
    </div>
  );
}

function SourcedList({
  label,
  items,
  passages,
  onChange,
}: {
  label: string;
  items: NoteSourced[];
  passages: NotePassage[];
  onChange: (x: NoteSourced[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((d, i) => (
        <div key={i} className="space-y-1.5">
          <PointRow
            label={`${label} ${i + 1}`}
            point={d}
            passages={passages}
            onChange={(x) => onChange(items.map((y, k) => (k === i ? { ...y, ...x } : y)))}
            onRemove={() => onChange(items.filter((_, k) => k !== i))}
          />
          <Input
            aria-label={`${label} ${i + 1} source`}
            placeholder="Source and year (e.g. Census 2011)"
            value={d.source}
            onChange={(e) =>
              onChange(items.map((y, k) => (k === i ? { ...y, source: e.target.value } : y)))
            }
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...items, { text: EMPTY, source: "", src: [], ok: true }])}
      >
        <Plus className="mr-1 h-4 w-4" /> Add
      </Button>
    </div>
  );
}

// A table, a row a line, cells parted by "|".
function TableEdit({
  c,
  onChange,
}: {
  c: NoteContent;
  onChange: (t: NoteContent["table"]) => void;
}) {
  const t = c.table;
  const text = (l: Lang) =>
    t
      ? [
          t.head.map((h) => h[l]).join(" | "),
          ...t.rows.map((r) => r.map((x) => x[l]).join(" | ")),
        ].join("\n")
      : "";
  const [hi, setHi] = useState(() => text("hi"));
  const [en, setEn] = useState(() => text("en"));
  const parse = (h: string, e: string) => {
    const lines = (s: string) => s.split("\n").map((x) => x.split("|").map((y) => y.trim()));
    const a = lines(h);
    const b = lines(e);
    const rows = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
      const n = Math.max(a[i]?.length ?? 0, b[i]?.length ?? 0);
      return Array.from({ length: n }, (_, j) => ({ hi: a[i]?.[j] ?? "", en: b[i]?.[j] ?? "" }));
    }).filter((r) => r.some((x) => x.hi || x.en));
    if (rows.length < 2) return null;
    const width = rows[0].length;
    return {
      caption: t?.caption ?? EMPTY,
      head: rows[0],
      rows: rows.slice(1).map((r) => Array.from({ length: width }, (_, j) => r[j] ?? EMPTY)),
      src: t?.src ?? [],
    };
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        The first line is the heading row; cells parted by “|”. Empty: no table.
      </p>
      {t && (
        <BiField
          label="Table caption"
          value={t.caption}
          onChange={(caption) => onChange({ ...t, caption })}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          aria-label="Table (Hindi)"
          lang="hi"
          rows={6}
          value={hi}
          onChange={(e) => {
            setHi(e.target.value);
            onChange(parse(e.target.value, en));
          }}
        />
        <Textarea
          aria-label="Table (English)"
          rows={6}
          value={en}
          onChange={(e) => {
            setEn(e.target.value);
            onChange(parse(hi, e.target.value));
          }}
        />
      </div>
    </div>
  );
}
