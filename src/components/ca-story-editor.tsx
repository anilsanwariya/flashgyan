// The story editor: one story on a page of its own, like the article reader.
// A tab for each part (summary, key points, images, visuals, Static Context,
// Fact Bite, questions, material, the full article and a preview), with
// every line editable in place, and the previous or next story a tap away.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  Eye,
  FileText,
  HelpCircle,
  History,
  Image as ImageIcon,
  Library,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  enrichCaItem,
  deleteCaPoint,
  getMagazineSettings,
  redoCaVisual,
  setCaFactChecked,
  suggestCaFactBites,
  updateCaItem,
  type CaItem,
} from "@/lib/current-affairs.functions";
import {
  CATEGORIES,
  DEFAULT_MAGAZINE_SETTINGS,
  STATIC_CONNECT,
  categoryLabel,
  type CaContent,
  type DykFact,
} from "@/lib/current-affairs";
import { storyPreviewHtml } from "@/lib/current-affairs-html";
import { unitLabel } from "../../supabase/functions/_shared/ras-syllabus.ts";
import { SourceReader } from "@/components/ca-source-reader";
import { StoryHistory } from "@/components/ca-story-history";
import { StoryImages } from "@/components/ca-story-images";
import { StoryVisuals } from "@/components/ca-story-visuals";
import { MaterialPanel } from "@/components/ca-story-material";
import { BiLine, IconButton, Part, StaticConnect, type Lang } from "@/components/ca-story-review";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabId =
  | "summary"
  | "points"
  | "images"
  | "visuals"
  | "static"
  | "factbite"
  | "questions"
  | "material"
  | "article"
  | "preview";

const UNDO_MS = 5000;
const MAX_DYK = 5;

type Ctx = {
  item: CaItem;
  c: CaContent;
  lang: Lang;
  busy: boolean;
  save: (patch: Partial<CaContent>) => Promise<void>;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  onChanged: () => void;
  goTo: (tab: TabId) => void;
};

export function StoryEditor({
  items,
  id,
  lang,
  setLang,
  onNavigate,
  onClose,
  onChanged,
}: {
  // The day's stories, in the order of the list.
  items: CaItem[];
  id: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const updateFn = useServerFn(updateCaItem);
  const enrichFn = useServerFn(enrichCaItem);
  const [tab, setTab] = useState<TabId>("preview");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  // Saving shows in the footer: how many saves are on their way, and when
  // the last one landed.
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showLive, setShowLive] = useLivePreview();
  const main = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const at = items.findIndex((i) => i.id === id);
  const item = items[at];
  const prev = items[at - 1];
  const next = items[at + 1];

  // Each story opens at the top of the same tab.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [id, tab]);
  useEffect(() => {
    setSavedAt(null);
  }, [id]);
  // The chosen tab stays in sight in the phone's strip of tabs.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const strip = nav.current;
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({
      left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [tab]);

  if (!item) return null;
  const c = item.content;
  const dropped = item.status === "dropped";
  const unverified = item.facts.filter((f) => !f.verified).length;
  // Same section, for moving within it.
  const siblings = items.filter((i) => i.category === item.category);
  const si = siblings.findIndex((i) => i.id === item.id);

  // Runs one save, counted for the footer's "Saving…" and "Saved".
  async function tracked<T>(fn: () => Promise<T>): Promise<T> {
    setSaving((n) => n + 1);
    try {
      const r = await fn();
      setSavedAt(new Date());
      return r;
    } finally {
      setSaving((n) => n - 1);
    }
  }
  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await tracked(fn);
      if (ok) toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(false);
    }
  }
  // Saves one changed part of the story.
  const save = async (patch: Partial<CaContent>) => {
    if (!item.content) return;
    await tracked(() =>
      updateFn({ data: { id: item.id, content: { ...item.content!, ...patch } } }),
    );
    onChanged();
  };
  // Leaving the story with a line still open asks first.
  const leave = (go: () => void) => {
    const open = shell.current?.querySelector('[data-unsaved="true"]');
    if (open && !confirm("A line you changed isn't saved yet. Leave without saving it?")) {
      open.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    go();
  };
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

  const tabs: {
    id: TabId;
    label: string;
    icon: typeof FileText;
    count?: number;
    warn?: boolean;
  }[] = [
    { id: "preview", label: "Preview", icon: Eye },
    { id: "summary", label: "Summary", icon: FileText },
    {
      id: "points",
      label: "Key points",
      icon: ListChecks,
      count: c?.points.length,
      warn: unverified > 0,
    },
    { id: "images", label: "Images", icon: ImageIcon, count: c?.images?.length },
    {
      id: "visuals",
      label: "Visuals",
      icon: BarChart3,
      count: (c?.visual ? 1 : 0) + (c?.visual2 ? 1 : 0),
    },
    {
      id: "static",
      label: STATIC_CONNECT.en,
      icon: Library,
      count: (c?.statics?.length ?? 0) + (c?.background ? 1 : 0),
    },
    { id: "factbite", label: "Fact Bite", icon: Sparkles, count: c?.dyk?.length },
    {
      id: "questions",
      label: "Questions",
      icon: HelpCircle,
      count: (c?.mcq ? 1 : 0) + (c?.mains ? 1 : 0) + (c?.quick ? 1 : 0),
    },
    { id: "material", label: "Add material", icon: Paperclip },
    { id: "article", label: "Full article", icon: BookOpen },
  ];

  const ctx: Ctx | null = c ? { item, c, lang, busy, save, act, onChanged, goTo: setTab } : null;

  return (
    <Dialog open onOpenChange={(o) => !o && leave(onClose)}>
      <DialogContent
        ref={shell}
        aria-describedby={undefined}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        {/* Which story, its language and its menu. */}
        <header className="border-b border-border bg-background">
          <div className="flex items-start gap-2 p-2 pr-12 sm:pl-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                Story {at + 1} of {items.length} · {categoryLabel(item.category).en}
              </p>
              <DialogTitle className="truncate text-base font-semibold leading-snug">
                {lang === "en"
                  ? c?.headline.en || item.headline
                  : c?.headline.hi || c?.headline.en || item.headline}
              </DialogTitle>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div
                className="hidden rounded-lg border border-border p-0.5 text-xs sm:flex"
                role="group"
              >
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
                    className={`rounded-md px-2.5 py-1 ${lang === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="flex gap-1 p-1 sm:hidden" role="group" aria-label="Language">
                    {(
                      [
                        ["hi", "हिंदी"],
                        ["en", "English"],
                        ["both", "Both"],
                      ] as const
                    ).map(([k, label]) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={lang === k ? "default" : "ghost"}
                        className="h-7 flex-1 px-2 text-xs"
                        onClick={() => setLang(k)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <DropdownMenuSeparator className="sm:hidden" />
                  {c && (
                    <DropdownMenuItem onSelect={() => setHistory(true)}>
                      <History className="mr-2 h-4 w-4" /> History
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() => {
                      if (
                        !c ||
                        confirm(
                          "Write the whole story again from its facts? Your hand edits to the text are replaced (they stay in History).",
                        )
                      )
                        void act(() => enrichFn({ data: { id: item.id } }), "Story written again");
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />{" "}
                    {c ? "Write again from the facts" : "Write text"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy || si <= 0}
                    onSelect={() => void swap(siblings[si - 1])}
                  >
                    <ArrowUp className="mr-2 h-4 w-4" /> Move up in the section
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy || si >= siblings.length - 1}
                    onSelect={() => void swap(siblings[si + 1])}
                  >
                    <ArrowDown className="mr-2 h-4 w-4" /> Move down in the section
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() =>
                      void act(
                        async () => {
                          await updateFn({
                            data: { id: item.id, status: dropped ? "included" : "dropped" },
                          });
                          // Stories that arrived dropped were never written.
                          if (dropped && item.needs_enrich)
                            await enrichFn({ data: { id: item.id } });
                        },
                        dropped ? "Back in the issue" : "Dropped from the issue",
                      )
                    }
                  >
                    <XCircle className="mr-2 h-4 w-4" />{" "}
                    {dropped ? "Include in the issue" : "Drop from the issue"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* Section, importance and the story's state. */}
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 sm:px-4">
            <Select
              value={item.category}
              onValueChange={(v) => act(() => updateFn({ data: { id: item.id, category: v } }))}
            >
              <SelectTrigger
                className="h-7 w-auto gap-1 rounded-full px-3 text-xs"
                aria-label="Section"
              >
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
                act(() =>
                  updateFn({ data: { id: item.id, importance: (item.importance % 3) + 1 } }),
                )
              }
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              title="Exam importance (tap to change)"
              aria-label="Exam importance"
            >
              {"★".repeat(item.importance)}
              {"☆".repeat(3 - item.importance)}
            </button>
            {dropped && <Badge tone="bad">Dropped</Badge>}
            {item.rajasthan && item.category !== "rajasthan" && (
              <Badge tone="warn">Rajasthan</Badge>
            )}
            {item.unit && <Badge>{unitLabel(item.unit)}</Badge>}
            {item.related_item_id && <Badge tone="primary">Follow-up</Badge>}
            {unverified > 0 && (
              <Badge tone="warn">
                <AlertTriangle className="h-3 w-3" /> {unverified} to check
              </Badge>
            )}
            {item.enrich_error && <Badge tone="bad">Writing failed</Badge>}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* The parts: a strip on phones, a column on laptops. */}
          <nav
            ref={nav}
            aria-label="Parts of the story"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1.5 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] lg:w-52 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-2 lg:[mask-image:none]"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
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
                      aria-label="needs checking"
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

          {ctx && tab === "article" ? (
            // The reader and its toolbar fill the tab.
            <main className="min-h-0 flex-1 overflow-hidden">
              <ArticleTab {...ctx} />
            </main>
          ) : (
            <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl space-y-4 p-3 text-[15px] leading-relaxed sm:p-5 sm:text-sm">
                {!ctx ? (
                  <NotWritten item={item} busy={busy} act={act} />
                ) : tab === "summary" ? (
                  <SummaryTab {...ctx} />
                ) : tab === "points" ? (
                  <PointsTab key={item.id} {...ctx} />
                ) : tab === "images" ? (
                  <Section
                    title="Images"
                    hint="Photos, maps or diagrams for this story. Crop, turn, caption and place each one."
                  >
                    <StoryImages itemId={item.id} content={c!} lang={lang} editing onSave={save} />
                  </Section>
                ) : tab === "visuals" ? (
                  <Section
                    title="Visuals"
                    hint="Up to two per story. Rebuild one as the type you pick, or edit its text and numbers."
                  >
                    <StoryVisuals item={item} content={c!} busy={busy} onSave={save} />
                  </Section>
                ) : tab === "static" ? (
                  <Section
                    title={STATIC_CONNECT.en}
                    hint="Textbook background on the concepts behind the news, from your books or SAATHI's own knowledge."
                  >
                    <StaticConnect
                      item={item}
                      content={c!}
                      lang={lang}
                      editing
                      busy={busy}
                      save={save}
                      act={act}
                    />
                  </Section>
                ) : tab === "factbite" ? (
                  <FactBiteTab key={item.id} {...ctx} />
                ) : tab === "questions" ? (
                  <QuestionsTab {...ctx} />
                ) : tab === "material" ? (
                  <Section
                    title="Add material"
                    hint="A link, PDF, Word or text file, a photo of a page, or your own text."
                  >
                    <MaterialPanel
                      key={item.id}
                      item={item}
                      inline
                      onClose={() => undefined}
                      onDone={onChanged}
                    />
                  </Section>
                ) : (
                  <PreviewTab {...ctx} />
                )}
              </div>
            </main>
          )}
          {ctx && tab !== "preview" && tab !== "article" && (
            <LivePreview {...ctx} open={showLive} onOpenChange={setShowLive} />
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-background p-2 sm:px-4">
          <Button
            size="sm"
            variant="ghost"
            disabled={!prev}
            onClick={() => prev && leave(() => onNavigate(prev.id))}
          >
            <ChevronLeft className="mr-0.5 h-4 w-4" /> Previous
          </Button>
          <div className="mx-auto flex items-center gap-2">
            <span
              role="status"
              className="hidden min-w-[6.5rem] text-right text-xs text-muted-foreground sm:inline"
            >
              {saving > 0
                ? "Saving…"
                : savedAt
                  ? `Saved · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Changes save as you go"}
            </span>
            <Button size="sm" variant="outline" onClick={() => leave(onClose)}>
              <Check className="mr-1 h-4 w-4" /> Done
            </Button>
          </div>
          <Button
            size="sm"
            disabled={!next}
            onClick={() => next && leave(() => onNavigate(next.id))}
          >
            Next story <ChevronRight className="ml-0.5 h-4 w-4" />
          </Button>
        </footer>
        <StoryHistory
          item={item}
          lang={lang}
          open={history}
          onOpenChange={setHistory}
          onChanged={onChanged}
        />
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-lg font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function NotWritten({
  item,
  busy,
  act,
}: {
  item: CaItem;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const enrichFn = useServerFn(enrichCaItem);
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {item.enrich_error ?? "This story hasn't been written yet."}
      </p>
      <Button
        disabled={busy}
        onClick={() => act(() => enrichFn({ data: { id: item.id } }), "Story written")}
      >
        <RefreshCw className="mr-1 h-4 w-4" /> Write text
      </Button>
    </div>
  );
}

// ---------- Summary ----------

function SummaryTab({ c, lang, save }: Ctx) {
  return (
    <Section
      title="Summary"
      hint="Tap the pencil on a line to change it. The other language follows when you save."
    >
      <Part title="Headline · शीर्षक">
        <BiLine
          value={c.headline}
          lang={lang}
          editing
          strong
          onSave={(v) => save({ headline: v })}
        />
      </Part>
      <Part title="Summary · सारांश">
        <BiLine value={c.summary} lang={lang} editing onSave={(v) => save({ summary: v })} />
      </Part>
      <Part title="Exam Angle" tone="why">
        <BiLine value={c.why} lang={lang} editing onSave={(v) => save({ why: v })} />
      </Part>
      {c.oneliner && (c.oneliner.en || c.oneliner.hi) && (
        <Part title="Revision line · एक पंक्ति">
          <BiLine value={c.oneliner} lang={lang} editing onSave={(v) => save({ oneliner: v })} />
        </Part>
      )}
    </Section>
  );
}

// ---------- Key points and their facts ----------

function PointsTab({ item, c, lang, busy, save, act, onChanged, goTo }: Ctx) {
  const deletePointFn = useServerFn(deleteCaPoint);
  const redoFn = useServerFn(redoCaVisual);
  const checkFn = useServerFn(setCaFactChecked);
  const inVisual = new Set([
    ...(c.visual ? (c.visual_covers ?? []) : []),
    ...(c.visual2 ? (c.visual2_covers ?? []) : []),
  ]);
  // A deleted key point is hidden at once and removed (with its fact) after a
  // few seconds, unless undone. Pending deletes are sent when the tab closes.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef({ deletePointFn, id: item.id, onChanged, redoFn });
  latest.current = { deletePointFn, id: item.id, onChanged, redoFn };
  const commitDelete = async (text: string) => {
    clearTimeout(timers.current.get(text));
    timers.current.delete(text);
    const { deletePointFn: del, id, onChanged: changed, redoFn: redo } = latest.current;
    try {
      const r = await del({ data: { id, text } });
      changed();
      if (r.visualShowsIt) {
        toast("The visual still shows the deleted point", {
          duration: 10_000,
          action: {
            label: "Redo visual",
            onClick: () => void redo({ data: { id } }).then(changed, () => undefined),
          },
        });
      }
    } catch (e) {
      setHidden((cur) => {
        const next = new Set(cur);
        next.delete(text);
        return next;
      });
      toast.error(errorText(e, "Couldn't delete the point"));
    }
  };
  const deletePoint = (text: string) => {
    setHidden((cur) => new Set(cur).add(text));
    timers.current.set(
      text,
      setTimeout(() => void commitDelete(text), UNDO_MS),
    );
    toast("Key point deleted", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timers.current.get(text));
          timers.current.delete(text);
          setHidden((cur) => {
            const next = new Set(cur);
            next.delete(text);
            return next;
          });
        },
      },
    });
  };
  useEffect(() => {
    const flush = () => {
      for (const text of [...timers.current.keys()]) void commitDelete(text);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const unverified = item.facts.filter((f) => !f.verified).length;
  // Facts the story keeps without a point of their own (older stories).
  const extraFacts = item.facts.slice(c.points.length);
  const markChecked = (text: string) =>
    act(() => checkFn({ data: { id: item.id, text, checked: true } }), "Marked checked");

  return (
    <Section
      title="Key points"
      hint={
        unverified
          ? `One point for each fact, with the source's words under it. ${unverified} to check: the quote wasn't found word for word in the source, or you marked it with the pink pen.`
          : "One point for each fact, with the source's words under it. Points shown in a visual are faded: they print only if the visual goes."
      }
      action={
        <Button size="sm" variant="outline" onClick={() => goTo("article")}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add from the article
        </Button>
      }
    >
      <ul className="space-y-2">
        {c.points.map((p, i) => {
          const f = item.facts[i];
          if (f && hidden.has(f.text)) return null;
          return (
            <li
              key={`${i}-${f?.text ?? ""}`}
              className={`rounded-xl border p-2 ${f && !f.verified ? "border-amber-500/50 bg-amber-500/5" : "border-border"}`}
            >
              <BiLine
                value={p}
                lang={lang}
                editing
                faded={inVisual.has(i)}
                onSave={(v) => save({ points: c.points.map((x, j) => (j === i ? v : x)) })}
                onDelete={f ? () => deletePoint(f.text) : undefined}
              />
              {f && <FactQuote fact={f} busy={busy} onCheck={() => markChecked(f.text)} />}
            </li>
          );
        })}
      </ul>
      {extraFacts.length > 0 && (
        <Part title="Facts without a point">
          <ul className="space-y-2">
            {extraFacts.map((f, i) => (
              <li
                key={i}
                className={`rounded-xl border p-2 text-sm ${f.verified ? "border-border" : "border-amber-500/50 bg-amber-500/5"}`}
              >
                {f.text}
                <FactQuote fact={f} busy={busy} onCheck={() => markChecked(f.text)} />
              </li>
            ))}
          </ul>
        </Part>
      )}
    </Section>
  );
}

// A fact's quote from the source, and whether it was found there.
function FactQuote({
  fact,
  busy,
  onCheck,
}: {
  fact: CaItem["facts"][number];
  busy: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="mt-1 flex items-start gap-1.5 border-t border-border/60 pt-1.5 text-xs">
      {fact.verified ? (
        <CheckCircle2
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
          aria-label="Found in the source"
        />
      ) : (
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
          aria-label="needs checking"
        />
      )}
      <span className="min-w-0 flex-1 italic text-muted-foreground">
        “{fact.quote}”{fact.corrected && <Badge tone="primary">corrected</Badge>}
      </span>
      {!fact.verified && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={busy}
          onClick={onCheck}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Mark checked
        </Button>
      )}
    </div>
  );
}

// ---------- Fact Bite ----------

function FactBiteTab({ item, c, lang, busy, save, act }: Ctx) {
  const suggestFn = useServerFn(suggestCaFactBites);
  const dyk = c.dyk ?? [];
  const room = MAX_DYK - dyk.length;
  const [search, setSearch] = useState("");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<DykFact[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [own, setOwn] = useState({ hi: "", en: "", site: "", url: "" });
  const setDyk = (next: DykFact[], ok: string) => act(() => save({ dyk: next }), ok);
  const find = async () => {
    setFinding(true);
    try {
      const r = await suggestFn({
        data: { id: item.id, ...(search.trim() ? { search: search.trim() } : {}) },
      });
      setFound(r);
      setPicked(new Set(r.slice(0, room).map((_, i) => i)));
    } catch (e) {
      toast.error(errorText(e, "Couldn't search"));
    } finally {
      setFinding(false);
    }
  };
  const move = (i: number, by: number) => {
    const next = [...dyk];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void setDyk(next, "Moved");
  };
  const ownOk =
    (own.hi.trim() || own.en.trim()) &&
    (!own.url.trim() || /^https?:\/\/\S+$/.test(own.url.trim()));

  return (
    <>
      <Section
        title="Fact Bite"
        hint={`Related recent developments an examiner could link to this news. Up to ${MAX_DYK}.`}
      >
        {dyk.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No Fact Bite yet. Find some below, or add your own.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Fact Bite entries">
            {dyk.map((d, i) => (
              <li
                key={`${i}-${d.en}`}
                className="flex items-start gap-2 rounded-xl border border-dashed border-sky-400/50 bg-sky-500/5 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <BiLine
                    value={d}
                    lang={lang}
                    editing
                    onSave={(v) => save({ dyk: dyk.map((x, j) => (j === i ? { ...x, ...v } : x)) })}
                  />
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                      title={`“${d.quote}”`}
                    >
                      {d.site}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground" title={`“${d.quote}”`}>
                      {d.site}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col">
                  <IconButton
                    label="Move up"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={busy || i === dyk.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Remove this fact"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() =>
                      void setDyk(
                        dyk.filter((_, j) => j !== i),
                        "Removed",
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Find more"
        hint="SAATHI looks through your earlier issues and the trusted websites (Magazine settings). Type words to search for something specific."
      >
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Search for"
            className="min-w-0 flex-1"
            placeholder="Optional, e.g. other Ramsar sites in India"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !finding && room > 0 && void find()}
          />
          <Button onClick={() => void find()} disabled={finding || room <= 0}>
            <Search className="mr-1 h-4 w-4" /> {finding ? "Searching…" : "Find more"}
          </Button>
        </div>
        {room <= 0 && (
          <p className="text-xs text-muted-foreground">
            The box is full: remove one to add another.
          </p>
        )}
        {found &&
          (found.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing new found. Try other words.</p>
          ) : (
            <div className="space-y-2">
              <ul className="space-y-2" aria-label="Suggestions">
                {found.map((d, i) => (
                  <li key={i} className="flex gap-2.5 rounded-xl border border-border p-2.5">
                    <Checkbox
                      aria-label={`Use ${d.en || d.hi}`}
                      checked={picked.has(i)}
                      onCheckedChange={(v) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (v && next.size < room) next.add(i);
                          else next.delete(i);
                          return next;
                        })
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0 text-sm">
                      <BiLine value={d} lang={lang} />
                      <span className="text-xs text-muted-foreground" title={`“${d.quote}”`}>
                        {d.site}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setFound(null)}>
                  Clear
                </Button>
                <Button
                  disabled={busy || picked.size === 0}
                  onClick={async () => {
                    await setDyk(
                      [...dyk, ...found.filter((_, i) => picked.has(i))].slice(0, MAX_DYK),
                      picked.size === 1
                        ? "Added to Fact Bite"
                        : `${picked.size} added to Fact Bite`,
                    );
                    setFound(null);
                  }}
                >
                  Add {picked.size}
                </Button>
              </div>
            </div>
          ))}
      </Section>

      <Section
        title="Add your own"
        hint="Write it in one language; the other is written when you add it."
      >
        <div className="space-y-2">
          <Textarea
            lang="hi"
            aria-label="Hindi"
            rows={2}
            placeholder="हिंदी"
            value={own.hi}
            onChange={(e) => setOwn({ ...own, hi: e.target.value })}
          />
          <Textarea
            aria-label="English"
            rows={2}
            placeholder="English"
            value={own.en}
            onChange={(e) => setOwn({ ...own, en: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Source"
              placeholder="Source, e.g. PIB, 12 March 2026"
              value={own.site}
              onChange={(e) => setOwn({ ...own, site: e.target.value })}
            />
            <Input
              aria-label="Link"
              placeholder="Link (optional)"
              value={own.url}
              onChange={(e) => setOwn({ ...own, url: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={busy || room <= 0 || !ownOk}
              onClick={async () => {
                const entry: DykFact = {
                  en: own.en.trim(),
                  hi: own.hi.trim(),
                  url: own.url.trim(),
                  site: own.site.trim() || "Editor",
                  quote: own.en.trim() || own.hi.trim(),
                };
                await setDyk([...dyk, entry], "Added to Fact Bite");
                setOwn({ hi: "", en: "", site: "", url: "" });
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add to Fact Bite
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

// ---------- Questions ----------

function QuestionsTab({ c, lang, busy, save, act }: Ctx) {
  const none = !c.quick && !c.mcq && !c.mains;
  return (
    <Section
      title="Questions"
      hint="The revision question, the practice MCQ and the Mains question."
    >
      {none && (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No questions for this story. Writing it again from its facts (menu ⋯) makes them.
        </p>
      )}
      {c.quick && (
        <Part title="Quick revision question · त्वरित प्रश्न">
          <BiLine
            value={c.quick.q}
            lang={lang}
            editing
            onSave={(v) => save({ quick: { ...c.quick!, q: v } })}
            onDelete={() => act(() => save({ quick: null }), "Question removed")}
          />
          <div className="mt-1 flex gap-2">
            <span className="mt-0.5 shrink-0 text-sm font-semibold text-primary">→</span>
            <div className="min-w-0 flex-1">
              <BiLine
                value={c.quick.a}
                lang={lang}
                editing
                strong
                onSave={(v) => save({ quick: { ...c.quick!, a: v } })}
              />
            </div>
          </div>
        </Part>
      )}
      {c.mcq && (
        <Part title="Practice MCQ · अभ्यास प्रश्न">
          <div className="space-y-2">
            <BiLine
              value={c.mcq.question}
              lang={lang}
              editing
              preLine
              onSave={(v) => save({ mcq: { ...c.mcq!, question: v } })}
            />
            <ol className="space-y-1.5">
              {c.mcq.options.map((o, i) => {
                const right = c.mcq!.answer === i;
                return (
                  <li
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1 ${right ? "bg-emerald-500/10" : ""}`}
                  >
                    <span
                      className={`mt-0.5 font-semibold ${right ? "text-emerald-700 dark:text-emerald-400" : "text-primary"}`}
                    >
                      ({"abcd"[i]})
                    </span>
                    <div className="min-w-0 flex-1">
                      <BiLine
                        value={o}
                        lang={lang}
                        editing
                        onSave={(v) =>
                          save({
                            mcq: {
                              ...c.mcq!,
                              options: c.mcq!.options.map((x, j) => (j === i ? v : x)),
                            },
                          })
                        }
                        extra={
                          right ? (
                            <span
                              className="flex h-8 w-8 items-center justify-center"
                              title="The correct answer"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </span>
                          ) : (
                            <IconButton
                              label="Mark correct"
                              disabled={busy}
                              onClick={() =>
                                act(() => save({ mcq: { ...c.mcq!, answer: i } }), "Answer changed")
                              }
                            >
                              <Circle className="h-4 w-4" />
                            </IconButton>
                          )
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="rounded-lg bg-muted/50 p-2 text-sm">
              <span className="text-xs font-semibold text-muted-foreground">
                Explanation · व्याख्या
              </span>
              <BiLine
                value={c.mcq.explanation}
                lang={lang}
                editing
                onSave={(v) => save({ mcq: { ...c.mcq!, explanation: v } })}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                if (confirm("Remove this MCQ from the story?"))
                  void act(() => save({ mcq: null }), "MCQ removed");
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Remove MCQ
            </Button>
          </div>
        </Part>
      )}
      {c.mains && (
        <Part title="Mains question · मुख्य परीक्षा प्रश्न">
          <BiLine
            value={c.mains}
            lang={lang}
            editing
            onSave={(v) => save({ mains: v })}
            onDelete={() => act(() => save({ mains: null }), "Mains question removed")}
          />
        </Part>
      )}
    </Section>
  );
}

// ---------- The full article ----------

function ArticleTab({ item, onChanged, goTo }: Ctx) {
  if (!item.source_ids.length)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        This story has no source to read.
      </p>
    );
  // After a rewrite or new points, the story is shown as it now prints.
  return (
    <SourceReader
      item={item}
      inline
      open
      onOpenChange={(o) => !o && goTo("preview")}
      onChanged={onChanged}
    />
  );
}

// ---------- Preview ----------

// The story as one issue prints it.
function usePreviewHtml({ item, c }: Pick<Ctx, "item" | "c">) {
  const settingsFn = useServerFn(getMagazineSettings);
  const settings = useQuery({ queryKey: ["caSettings"], queryFn: () => settingsFn() });
  const s = settings.data ?? DEFAULT_MAGAZINE_SETTINGS;
  return (l: "hi" | "en") =>
    storyPreviewHtml(
      {
        id: item.id,
        issue_date: item.issue_date,
        category: item.category,
        importance: item.importance,
        rajasthan: item.rajasthan,
        content: c,
        facts: item.facts,
        context_sources: item.context_sources,
        source_names: [],
      },
      l,
      s,
    );
}

function PreviewTab({ item, c, lang }: Ctx) {
  const html = usePreviewHtml({ item, c });
  const langs: ("hi" | "en")[] = lang === "both" ? ["hi", "en"] : [lang];
  return (
    <Section title="Preview" hint="This story as the issue prints it.">
      <div className={`grid gap-3 ${langs.length === 2 ? "xl:grid-cols-2" : ""}`}>
        {langs.map((l) => (
          <PreviewFrame
            key={l}
            html={html(l)}
            label={l === "hi" ? "Hindi issue" : "English issue"}
          />
        ))}
      </div>
    </Section>
  );
}

// Wide screens keep the printed story beside the part being edited, so each
// change shows as it will print. It can be folded away; the choice is kept.
const LIVE_KEY = "ca-editor-live-preview";
function useLivePreview(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LIVE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(LIVE_KEY, v ? "on" : "off");
    } catch {
      // the choice lasts for this visit only
    }
  };
  return [open, set];
}

function LivePreview({
  item,
  c,
  lang,
  open,
  onOpenChange,
}: Ctx & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const html = usePreviewHtml({ item, c });
  const [pick, setPick] = useState<"hi" | "en">(lang === "en" ? "en" : "hi");
  useEffect(() => {
    if (lang !== "both") setPick(lang);
  }, [lang]);
  if (!open)
    return (
      <aside className="hidden border-l border-border bg-muted/20 p-1.5 xl:block">
        <IconButton label="Show the live preview" onClick={() => onOpenChange(true)}>
          <PanelRightOpen className="h-4 w-4" />
        </IconButton>
      </aside>
    );
  return (
    <aside
      aria-label="Live preview"
      className="hidden w-[26rem] shrink-0 flex-col border-l border-border bg-muted/20 xl:flex"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="flex-1 text-xs font-medium text-muted-foreground">As it prints</span>
        <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group">
          {(
            [
              ["hi", "हिंदी"],
              ["en", "English"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={pick === k}
              onClick={() => setPick(k)}
              className={`rounded-md px-2 py-0.5 ${pick === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <IconButton label="Hide the live preview" onClick={() => onOpenChange(false)}>
          <PanelRightClose className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <PreviewFrame
          html={html(pick)}
          label={pick === "hi" ? "Hindi issue" : "English issue"}
          quiet
        />
      </div>
    </aside>
  );
}

function PreviewFrame({ html, label, quiet }: { html: string; label: string; quiet?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(doc.body.scrollHeight + 8);
  };
  const srcDoc = useMemo(() => html, [html]);
  return (
    <div className="space-y-1">
      {!quiet && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <iframe
        ref={frame}
        title={quiet ? `Live preview: ${label}` : `Preview: ${label}`}
        srcDoc={srcDoc}
        onLoad={() => {
          fit();
          setTimeout(fit, 700);
        }}
        className="w-full rounded-xl border border-border bg-white"
        style={{ height }}
      />
    </div>
  );
}
