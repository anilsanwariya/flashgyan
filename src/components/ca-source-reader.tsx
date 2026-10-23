// Admin: the full source of a story, to highlight the facts it should have,
// like marking up a printout. The article opens full screen in a clean view
// (headings, paragraphs, lists and tables; website clutter hidden), with a
// toolbar of pens at the bottom:
//   yellow = key point, blue = summary only, pink = key point to check,
//   green = Static Context keyword, and an eraser.
// In Highlight mode a tap marks the whole sentence; press and hold (or drag
// with a mouse) to paint just some words. Holding a highlight (or tapping it
// in Read mode, or right-clicking it) opens its actions: change the pen, add
// a margin note for SAATHI ("use this in the headline"), remove it. Read mode
// leaves taps alone and allows normal text selection. A find bar and
// previous / next highlight buttons move around the article. A newspaper page
// (a PDF) is split into its articles and opens on the story's own article,
// with the page's other articles listed and marked by their stories ("No
// story yet" is news the AI skipped). "What's missing?" asks SAATHI which
// exam facts the highlights don't cover and where the article says them. On
// a laptop another of the day's sources (the same news in another paper) can
// be read and highlighted beside it. Highlights are kept as a draft on the
// device until the story is rewritten or a new story is made from them.
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClippingButton } from "@/components/ca-clippings";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Columns2,
  Eraser,
  ExternalLink,
  Highlighter,
  ListTree,
  Minus,
  Newspaper,
  Plus,
  Pencil,
  Redo2,
  Search,
  Link2,
  Scissors,
  Sparkles,
  StickyNote,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  addCaPenKeywords,
  addCaPoints,
  checkCaMissing,
  createCaFromHighlights,
  deleteCaItems,
  getCaCompareSources,
  previewCaPoints,
  suggestCaMarks,
  getCaReader,
  getCaReaderText,
  getCaSourceReader,
  restoreCaVersion,
  rewriteCaFromHighlights,
  type CaItem,
  type ReaderSource,
} from "@/lib/current-affairs.functions";
import {
  QUOTE_JOIN,
  clauseAt,
  cleanQuote,
  findAll,
  findQuote,
  findQuoteParts,
  quoteParts,
  sentenceSpans,
  wordsIn,
  type Span,
} from "@/lib/ca-highlight";
import { type MissingCheck, type MissingFact } from "@/lib/ca-missing";
import { ADD_POINTS_MAX } from "@/lib/ca-points";
import { normalizeForMatch, type Bi } from "@/lib/current-affairs";
import {
  isPaged,
  parseBlocks,
  splitArticles,
  type Article,
  plainText,
  snapToWords,
  type Block,
  type OutlineEntry,
  type Run,
} from "@/lib/ca-reader-format";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Mode = "rewrite" | "new";
type Pen = "point" | "summary" | "check" | "keyword";
type Tool = Pen | "eraser";
// A highlight: words from one source and the pen they were marked with.
type Mark = { source_id: string; quote: string; pen: Pen; note?: string };
// What part of each source is loaded (offsets are in the whole source).
type Loaded = { text: string; start: number; total: number };
// idx: the highlight's index in marks; joined: one part of a highlight
// joined from several places.
type Range = {
  span: Span;
  pen: Pen;
  preview?: boolean;
  note?: string;
  idx?: number;
  joined?: boolean;
};
// What a tap marks: the sentence (a double tap: its clause), the clause, or
// the words between two taps.
type TapMode = "sentence" | "clause" | "words";
const TAP_MODES: { mode: TapMode; label: string; hint: string }[] = [
  {
    mode: "sentence",
    label: "Sentence",
    hint: "A tap marks the sentence; a double tap only its clause",
  },
  {
    mode: "clause",
    label: "Clause",
    hint: "A tap marks the clause (between commas, “and”, “और”…)",
  },
  { mode: "words", label: "Words", hint: "Tap the first word, then the last word" },
];
// A find-bar match; "current" is the one jumped to.
type Found = { span: Span; current: boolean };

const PENS: { pen: Pen; label: string; dot: string; mark: string }[] = [
  {
    pen: "point",
    label: "Key point",
    dot: "bg-amber-400",
    mark: "bg-amber-300/60 dark:bg-amber-500/40",
  },
  {
    pen: "summary",
    label: "Summary only",
    dot: "bg-sky-400",
    mark: "bg-sky-300/50 dark:bg-sky-500/35",
  },
  {
    pen: "check",
    label: "Key point to check",
    dot: "bg-pink-400",
    mark: "bg-pink-300/60 dark:bg-pink-500/40",
  },
  {
    pen: "keyword",
    label: "Static Context keyword",
    dot: "bg-emerald-400",
    mark: "bg-emerald-300/55 dark:bg-emerald-500/35",
  },
];
const PEN = Object.fromEntries(PENS.map((p) => [p.pen, p])) as Record<Pen, (typeof PENS)[number]>;
const CYCLE: Pen[] = ["point", "summary", "check", "keyword"];
const isPoint = (p: Pen) => p === "point" || p === "check";

const overlaps = (a: Span, b: Span) => a[0] < b[1] && a[1] > b[0];
const HOLD_MS = 300;
const MOVE_PX = 8;
const SIZE_KEY = "ca-reader-size";
const TAP_KEY = "ca-reader-tap";
const COMFORT_KEY = "ca-reader-comfort";
const DOUBLE_TAP_MS = 350;

// Reading comfort, kept on this device: line spacing, a Hindi font, numbers
// underlined, and dimming all but the paragraph being read.
type Comfort = {
  spacing: "normal" | "relaxed" | "loose";
  font: "default" | "noto-sans" | "noto-serif" | "mukta";
  numbers: boolean;
  focus: boolean;
};
const COMFORT_DEFAULT: Comfort = {
  spacing: "normal",
  font: "default",
  numbers: true,
  focus: false,
};
const SPACING = { normal: 1.75, relaxed: 2, loose: 2.3 };
const FONTS: Record<Comfort["font"], { label: string; family?: string; css?: string }> = {
  default: { label: "Default" },
  "noto-sans": {
    label: "Noto Sans",
    family: '"Noto Sans Devanagari", "Noto Sans", sans-serif',
    css: "Noto+Sans+Devanagari:wght@400;600",
  },
  "noto-serif": {
    label: "Noto Serif",
    family: '"Noto Serif Devanagari", "Noto Serif", serif',
    css: "Noto+Serif+Devanagari:wght@400;600",
  },
  mukta: { label: "Mukta", family: '"Mukta", sans-serif', css: "Mukta:wght@400;600" },
};
// Loads a Hindi font from Google Fonts once, when it is picked.
function useFont(font: Comfort["font"]) {
  useEffect(() => {
    const css = FONTS[font].css;
    if (!css || document.querySelector(`link[data-reader-font="${font}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${css}&display=swap`;
    link.dataset.readerFont = font;
    document.head.appendChild(link);
  }, [font]);
}
const VIEW_KEY = "ca-reader-view";
const draftKey = (id: string, mode: Mode) => `ca-reader-draft:${id}:${mode}`;
const posKey = (sourceId: string) => `ca-reader-pos:${sourceId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

// The story's own facts as marks: points (pink when they still need
// checking) and summary-only context.
function storyMarks(item: CaItem): Mark[] {
  return [
    ...item.facts.map((f) => ({
      source_id: f.source_id,
      quote: f.quote,
      pen: (f.verified ? "point" : "check") as Pen,
      ...(f.note ? { note: f.note } : {}),
    })),
    ...(item.content?.context_facts ?? []).map((f) => ({
      source_id: f.source_id,
      quote: f.quote,
      pen: "summary" as Pen,
      ...(f.note ? { note: f.note } : {}),
    })),
  ];
}

// Identifies the story's facts, so a saved draft is only restored onto the
// story it was made for.
const factsKey = (item: CaItem) =>
  [...item.facts.map((f) => f.quote), ...(item.content?.context_facts ?? []).map((f) => f.quote)]
    .join("|")
    .slice(0, 4000);

// The raw offset under a screen point, from the piece of text there (only
// inside root, when given).
function offsetAt(x: number, y: number, root?: HTMLElement | null): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    const r = document.caretRangeFromPoint?.(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  const el = (
    node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null)
  )?.closest?.("[data-raw]") as HTMLElement | null;
  if (!el || (root && !root.contains(el))) return null;
  return Number(el.dataset.raw) + (node?.nodeType === Node.TEXT_NODE ? offset : 0);
}

// ---------- Highlights in a source's loaded text (both reading panes) ----------

// The highlight (its index in marks) at an offset of the text, or -1.
function markIndexIn(marks: Mark[], sourceId: string, text: string, offset: number): number {
  // The latest highlight wins where two overlap, as they are drawn.
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.source_id !== sourceId) continue;
    if (findQuoteParts(text, m.quote).some((s) => s[0] <= offset && offset < s[1])) return i;
  }
  return -1;
}

// The words a highlight quotes for [a, b) of the text.
const quoteOf = (text: string, span: Span) => cleanQuote(plainText(text, span[0], span[1]));

const markable = (text: string, span: Span, pen: Pen) =>
  cleanQuote(plainText(text, span[0], span[1])).length >= (pen === "keyword" ? 2 : 8);

// The marks with [a, b) of the text highlighted; marks inside it are replaced.
function withMark(marks: Mark[], sourceId: string, text: string, span: Span, pen: Pen): Mark[] {
  const quote = quoteOf(text, span);
  return [
    ...marks.filter((m) => {
      if (m.source_id !== sourceId) return true;
      const s = findQuote(text, m.quote);
      return !(s && s[0] >= span[0] && s[1] <= span[1]);
    }),
    { source_id: sourceId, quote, pen },
  ];
}

function withoutSpan(marks: Mark[], sourceId: string, text: string, span: Span): Mark[] {
  return marks.filter((m) => {
    if (m.source_id !== sourceId) return true;
    return !findQuoteParts(text, m.quote).some((s) => overlaps(s, span));
  });
}

// One highlight given new ends (its pen and note kept); highlights inside the
// new stretch are replaced by it.
function withSpanOf(marks: Mark[], i: number, text: string, span: Span): Mark[] {
  const m = marks[i];
  const quote = quoteOf(text, span);
  return marks.flatMap((x, j) => {
    if (j === i) return [{ ...x, quote }];
    if (x.source_id !== m.source_id) return [x];
    const s = findQuote(text, x.quote);
    return s && s[0] >= span[0] && s[1] <= span[1] && !x.quote.includes(QUOTE_JOIN) ? [] : [x];
  });
}

// The stretch a tap marks: the sentence, or the clause.
function unitAt(text: string, sentences: Span[], offset: number, clause: boolean): Span | null {
  const s = clause
    ? clauseAt(text, sentences, offset)
    : (sentences.find(([a, b]) => a <= offset && offset < b) ?? null);
  return s && snapToWords(text, s[0], s[1]);
}

// A tap: on a highlight it removes it (or recolours it with another pen);
// elsewhere it highlights the sentence (or clause). Null when nothing changes.
function tapped(
  marks: Mark[],
  sourceId: string,
  text: string,
  sentences: Span[],
  offset: number,
  tool: Tool,
  clause = false,
): Mark[] | "short" | null {
  const hit = markIndexIn(marks, sourceId, text, offset);
  if (hit >= 0) {
    if (tool === "eraser" || marks[hit].pen === tool) return marks.filter((_, i) => i !== hit);
    const pen = tool;
    return marks.map((m, i) => (i === hit ? { ...m, pen } : m));
  }
  if (tool === "eraser") return null;
  const s = unitAt(text, sentences, offset, clause);
  if (!s) return null;
  return markable(text, s, tool) ? withMark(marks, sourceId, text, s, tool) : "short";
}

// The raw offset of a DOM selection end.
function offsetOfNode(node: Node | null, offset: number): number | null {
  const el = (
    node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null)
  )?.closest?.("[data-raw]") as HTMLElement | null;
  if (!el) return null;
  return Number(el.dataset.raw) + (node?.nodeType === Node.TEXT_NODE ? offset : 0);
}

export function SourceReader({
  item,
  origin = null,
  open,
  onOpenChange,
  onChanged,
  inline = false,
}: {
  // The story whose sources are read; null when reading a source no story
  // uses yet (skipped news), which can only make new stories.
  item: CaItem | null;
  // That source, and the article it opens on (an offset in the whole source).
  origin?: { source_id: string; at: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  // On the story editor's "Full article" tab, filling it, instead of a
  // full-screen page of its own.
  inline?: boolean;
}) {
  // Drafts and the loaded text are kept per story, or per source.
  const key = item ? item.id : `src:${origin?.source_id ?? ""}`;
  const own = useMemo(() => (item ? storyMarks(item) : []), [item]);
  const ownKey = item ? factsKey(item) : "";
  const readerFn = useServerFn(getCaReader);
  const sourceFn = useServerFn(getCaSourceReader);
  const moreFn = useServerFn(getCaReaderText);
  const rewriteFn = useServerFn(rewriteCaFromHighlights);
  const createFn = useServerFn(createCaFromHighlights);
  const keywordsFn = useServerFn(addCaPenKeywords);
  const missingFn = useServerFn(checkCaMissing);
  const restoreFn = useServerFn(restoreCaVersion);
  const deleteFn = useServerFn(deleteCaItems);
  const compareFn = useServerFn(getCaCompareSources);
  const addPointsFn = useServerFn(addCaPoints);
  const previewFn = useServerFn(previewCaPoints);
  const suggestFn = useServerFn(suggestCaMarks);
  const q = useQuery({
    queryKey: ["caReader", key, item ? null : origin?.at],
    queryFn: () =>
      item
        ? readerFn({ data: { id: item.id } })
        : sourceFn({ data: { source_id: origin!.source_id, at: origin!.at } }),
    enabled: open && (!!item || !!origin),
    staleTime: 60_000,
  });

  const [mode, setMode] = useState<Mode>(item ? "rewrite" : "new");
  const [tab, setTab] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [marks, setMarks] = useState<Mark[]>(own);
  const [past, setPast] = useState<Mark[][]>([]);
  const [future, setFuture] = useState<Mark[][]>([]);
  const [tool, setTool] = useState<Tool>("point");
  const [painting, setPainting] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [size, setSize] = useState(() => read<number>(SIZE_KEY, 16));
  const [view, setView] = useState<"clean" | "original">(() =>
    read<"clean" | "original">(VIEW_KEY, "clean"),
  );
  const [selection, setSelection] = useState<Span | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  // The highlight whose actions are open (its index in marks).
  const [sheet, setSheet] = useState<number | null>(null);
  // The article shown alone (index in articles), on newspaper pages.
  const [focus, setFocus] = useState<number | null>(null);
  const [articlesOpen, setArticlesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Laptops: a second source read beside this one (where it opens, or a
  // highlight to open it at), and the list of the day's sources to pick from.
  const [compare, setCompare] = useState<{ source_id: string; at: number; quote?: string } | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paneJump, setPaneJump] = useState<{ quote: string; n: number } | null>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const focusInit = useRef<Set<string>>(new Set());
  const [missing, setMissing] = useState<MissingCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<Span | null>(null);
  // What a tap marks (kept on this device), and in Words mode the first word
  // tapped.
  const [tapMode, setTapMode] = useState<TapMode>(() => read<TapMode>(TAP_KEY, "sentence"));
  const [anchor, setAnchor] = useState<number | null>(null);
  const lastTap = useRef<{ t: number; offset: number; before: Mark[] } | null>(null);
  // The highlight just made or picked: its ends can be dragged, or moved a
  // word at a time with Shift + arrows. While a handle is dragged, its new
  // stretch.
  const [active, setActive] = useState<{ source_id: string; quote: string } | null>(null);
  const [edit, setEdit] = useState<{ idx: number; span: Span } | null>(null);
  // "Suggest facts": SAATHI's picks, shown dotted until tapped.
  const [suggested, setSuggested] = useState<{ source_id: string; quote: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [comfort, setComfort] = useState<Comfort>(() => ({
    ...COMFORT_DEFAULT,
    ...read<Partial<Comfort>>(COMFORT_KEY, {}),
  }));
  const [comfortOpen, setComfortOpen] = useState(false);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const pendingJump = useRef<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const wide = useWide();
  const restoredPos = useRef<Set<string>>(new Set());

  const sources = useMemo(() => q.data ?? [], [q.data]);
  const source: ReaderSource | undefined = sources[Math.min(tab, sources.length - 1)];
  const part = source ? loaded[source.id] : undefined;

  // ---------- Opening: a fresh start, or the draft left on this device ----------
  useEffect(() => {
    if (!open) return;
    const start: Mode = item ? "rewrite" : "new";
    setMode(start);
    setTab(0);
    setPast([]);
    setFuture([]);
    setTrayOpen(false);
    restoredPos.current = new Set();
    focusInit.current = new Set();
    setFocus(null);
    setMissing(null);
    setCompare(null);
    setPickerOpen(false);
    restoreDraft(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  function restoreDraft(m: Mode) {
    const base = m === "new" ? [] : own;
    const draft = read<{ marks: Mark[]; note: string; facts: string } | null>(
      draftKey(key, m),
      null,
    );
    if (draft && draft.facts === ownKey && draft.marks.length) {
      setMarks(draft.marks);
      setNote(draft.note ?? "");
      toast("Restored the highlights you hadn't used yet", {
        // Once, however often the reader opens on it.
        id: `draft:${key}`,
        action: {
          label: "Discard",
          onClick: () => {
            write(draftKey(key, m), null);
            setMarks(base);
            setNote("");
          },
        },
      });
    } else {
      setMarks(base);
      setNote("");
    }
  }

  useEffect(() => {
    if (!q.data) return;
    setLoaded(
      Object.fromEntries(
        q.data.map((s) => [s.id, { text: s.text, start: s.start, total: s.total }]),
      ),
    );
  }, [q.data]);

  // Keeps the draft on the device while it differs from the story.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const base = mode === "new" ? [] : own;
      const same = JSON.stringify(marks) === JSON.stringify(base) && !note.trim();
      write(draftKey(key, mode), same ? null : { marks, note, facts: ownKey });
    }, 400);
    return () => clearTimeout(t);
  }, [open, mode, marks, note, own, ownKey, key]);

  useEffect(() => write(SIZE_KEY, size), [size]);
  useEffect(() => write(TAP_KEY, tapMode), [tapMode]);
  useFont(comfort.font);
  useEffect(() => write(COMFORT_KEY, comfort), [comfort]);
  useEffect(() => {
    setAnchor(null);
    setPreview(null);
  }, [tapMode]);
  // A different tab is a different source: its own articles.
  useEffect(() => {
    setFocus(null);
    setMissing(null);
    setActive(null);
    setAnchor(null);
  }, [tab]);
  useEffect(() => write(VIEW_KEY, view), [view]);

  // ---------- History ----------
  const commit = useCallback((next: Mark[] | ((cur: Mark[]) => Mark[])) => {
    setMarks((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      if (value === cur) return cur;
      setPast((p) => [...p.slice(-49), cur]);
      setFuture([]);
      return value;
    });
  }, []);
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [marks, ...f]);
    setMarks(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, marks]);
    setMarks(future[0]);
    setFuture((f) => f.slice(1));
  };

  function switchMode(next: Mode) {
    setMode(next);
    setPast([]);
    setFuture([]);
    restoreDraft(next);
  }

  // ---------- Where the marks are in the loaded text ----------
  const ranges = useMemo<Range[]>(() => {
    if (!part || !source) return [];
    const out: Range[] = [];
    marks.forEach((m, idx) => {
      if (m.source_id !== source.id) return;
      // A handle being dragged: the highlight's new stretch.
      if (edit?.idx === idx) {
        out.push({ span: edit.span, pen: m.pen, note: m.note, idx });
        return;
      }
      const parts = findQuoteParts(part.text, m.quote);
      for (const span of parts)
        out.push({ span, pen: m.pen, note: m.note, idx, joined: parts.length > 1 });
    });
    if (preview && tool !== "eraser") out.push({ span: preview, pen: tool, preview: true });
    return out;
  }, [marks, part, source, preview, tool, edit]);
  // SAATHI's suggestions in this source, not yet marked.
  const suggestSpans = useMemo<Span[]>(() => {
    if (!part || !source) return [];
    return suggested
      .filter((x) => x.source_id === source.id)
      .map((x) => findQuote(part.text, x.quote))
      .filter((x): x is Span => !!x)
      .filter((x) => !ranges.some((r) => !r.preview && overlaps(r.span, x)));
  }, [suggested, part, source, ranges]);
  const activeIdx = active
    ? marks.findIndex((m) => m.source_id === active.source_id && m.quote === active.quote)
    : -1;
  // In "new story" mode the story's own facts show faintly.
  const taken = useMemo<Span[]>(() => {
    if (mode !== "new" || !part || !source) return [];
    return own
      .filter((m) => m.source_id === source.id)
      .map((m) => findQuote(part.text, m.quote))
      .filter((s): s is Span => !!s);
  }, [mode, part, source, own]);
  const sentences = useMemo(() => (part ? sentenceSpans(part.text) : []), [part]);
  const blocks = useMemo(() => {
    if (!part || !source) return [];
    // Pages before the loaded part, so page numbers match the whole source.
    const firstPage =
      source.outline.filter((e) => e.level === 0 && e.at > 0 && e.at < part.start).length + 1;
    return parseBlocks(part.text, isPaged(source.url), firstPage);
  }, [part, source]);
  const hidden = blocks.filter((b) => b.clutter).length;

  // ---------- A newspaper page's articles ----------
  // A paged source (a PDF) is split into its articles; the reader opens on
  // the story's own article and lists the others, with their stories.
  const articles = useMemo<Article[]>(() => {
    if (!part || !source || !isPaged(source.url)) return [];
    const firstPage =
      source.outline.filter((e) => e.level === 0 && e.at > 0 && e.at < part.start).length + 1;
    const list = splitArticles(blocks, firstPage);
    return list.length >= 2 ? list : [];
  }, [blocks, part, source]);
  const articleInfo = useMemo(() => {
    if (!part || !source) return [];
    const mine = own.filter((m) => m.source_id === source.id);
    return articles.map((a) => {
      const inside = (q: string) => {
        const sp = findQuote(part.text, q);
        return !!sp && sp[0] >= a.at && sp[0] < a.end;
      };
      return {
        mine: mine.some((m) => inside(m.quote)),
        marked: marks.some((m) => m.source_id === source.id && inside(m.quote)),
        others: (source.stories ?? [])
          .filter((o) => o.quotes.some(inside))
          .map((o) => ({ headline: o.headline, dropped: o.dropped })),
      };
    });
  }, [articles, part, source, own, marks]);
  const art = focus !== null ? articles[focus] : undefined;
  const inFocus = (at: number) => !art || (at >= art.at && at < art.end);
  // Opening a newspaper page: straight to the story's article.
  useEffect(() => {
    if (!source || !articles.length || focusInit.current.has(source.id)) return;
    focusInit.current.add(source.id);
    // Skipped news opens on the article picked from the list.
    const at = !item && origin?.source_id === source.id && part ? origin.at - part.start : null;
    const i =
      at !== null
        ? articles.findIndex((a) => at >= a.at && at < a.end)
        : articleInfo.findIndex((x) => x.mine);
    setFocus(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, articles, articleInfo]);
  function pickArticle(i: number | null) {
    setFocus(i);
    setArticlesOpen(false);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }

  // ---------- A second source beside this one (laptops) ----------
  const paneQ = useQuery({
    queryKey: ["caReader", "beside", compare?.source_id, compare?.at, compare?.quote],
    queryFn: () =>
      sourceFn({
        data: {
          source_id: compare!.source_id,
          at: compare!.at,
          ...(compare!.quote ? { quote: compare!.quote } : {}),
        },
      }),
    enabled: open && wide && !!compare,
    staleTime: 60_000,
  });
  const pane = compare && paneQ.data?.[0]?.id === compare.source_id ? paneQ.data[0] : undefined;
  // What is being read, to find the same news in the other sources.
  const compareQuery = useMemo(() => {
    if (!pickerOpen || !part) return "";
    if (art) return `${art.title} ${plainText(part.text, art.at, art.end)}`.slice(0, 4000);
    if (item) return [item.headline, ...item.facts.map((f) => f.text)].join(" ").slice(0, 4000);
    return plainText(part.text, 0, Math.min(part.text.length, 8000)).slice(0, 4000);
  }, [pickerOpen, part, art, item]);
  const candQ = useQuery({
    queryKey: ["caCompare", source?.id, compareQuery],
    queryFn: () => compareFn({ data: { source_id: source!.id, query: compareQuery } }),
    enabled: open && pickerOpen && !!source && !!compareQuery,
    staleTime: 60_000,
  });
  function openBeside(sourceId: string, at: number, quote?: string) {
    setCompare({ source_id: sourceId, at, ...(quote ? { quote } : {}) });
    setPaneJump(quote ? { quote, n: Date.now() } : null);
    setPickerOpen(false);
  }
  const sourceName = (id: string) =>
    sources.find((x) => x.id === id)?.source_name ||
    (pane?.id === id ? pane.source_name : "") ||
    candQ.data?.find((c) => c.id === id)?.source_name ||
    "another source";

  // Find bar: every match in the loaded part, and the current one.
  const matches = useMemo<Span[]>(
    () =>
      findOpen && part && query.trim().length >= 2
        ? findAll(part.text, query).filter(([x]) => inFocus(x))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findOpen, part, query, art],
  );
  const found = useMemo<Found[]>(
    () => matches.map((span, i) => ({ span, current: i === findIdx })),
    [matches, findIdx],
  );
  useEffect(() => {
    if (!matches.length) return;
    requestAnimationFrame(() =>
      textRef.current
        ?.querySelector("[data-find-current]")
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, [matches, findIdx]);
  const stepFind = (d: 1 | -1) =>
    matches.length && setFindIdx((i) => (i + d + matches.length) % matches.length);

  // Jumping from highlight to highlight, in reading order.
  const ordered = useMemo(
    () =>
      ranges
        .filter((r) => !r.preview && inFocus(r.span[0]))
        .map((r) => r.span[0])
        .sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranges, art],
  );
  const hlCursor = useRef(-1);
  function stepHighlight(d: 1 | -1) {
    if (!ordered.length) return;
    hlCursor.current = (hlCursor.current + d + ordered.length) % ordered.length;
    const at = ordered[hlCursor.current];
    setTrayOpen(false);
    setFlash(at);
    setTimeout(() => setFlash((f) => (f === at ? null : f)), 1200);
    requestAnimationFrame(() =>
      textRef.current
        ?.querySelector(`[data-mark-start="${at}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }

  // ---------- Keyboard (laptops) ----------
  // 1-4 pens, E eraser, R read / highlight, Ctrl+Z / Ctrl+Y undo and redo,
  // F or / find, J / K next and previous highlight, N / P next and previous
  // article, ? the list of shortcuts. Typing in a box is left alone.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && (k === "f" || (k === "z" && !typing) || (k === "y" && !typing))) {
      e.preventDefault();
      if (k === "f") {
        setFindOpen(true);
        requestAnimationFrame(() => findRef.current?.focus());
      } else if (k === "y" || e.shiftKey) redo();
      else undo();
      return;
    }
    if (typing || mod || sheet !== null) return;
    // Shift + arrows move the active highlight's end a word (with Alt, its
    // start); Enter marks the words selected in Read mode.
    if (e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && activeSpan) {
      e.preventDefault();
      if (e.altKey) nudge("start", e.key === "ArrowLeft" ? 1 : -1);
      else nudge("end", e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (e.key === "Enter" && selection && !painting) {
      e.preventDefault();
      markSelection();
      return;
    }
    if (e.altKey) return;
    const pen = PENS[Number(e.key) - 1];
    if (pen) {
      setTool(pen.pen);
      setPainting(true);
    } else if (k === "e") {
      setTool("eraser");
      setPainting(true);
    } else if (k === "r") setPainting((v) => !v);
    else if (k === "f" || k === "/") {
      e.preventDefault();
      setFindOpen(true);
      requestAnimationFrame(() => findRef.current?.focus());
    } else if (k === "j") stepHighlight(1);
    else if (k === "k") stepHighlight(-1);
    else if (k === "n" && focus !== null && focus < articles.length - 1) pickArticle(focus + 1);
    else if (k === "p" && focus !== null && focus > 0) pickArticle(focus - 1);
    else if (k === "c" && wide) setPickerOpen((v) => !v);
    else if (e.key === "?") setHelpOpen((v) => !v);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);
  // Inline, Escape reaches the reader before the editor page (which would
  // close): the reader's own panels close first.
  const escape = useRef<(e: KeyboardEvent) => void>(() => undefined);
  escape.current = (e) => onEscape(e);
  useEffect(() => {
    if (!open || !inline) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      escape.current(e);
      if (e.defaultPrevented) e.stopPropagation();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [open, inline]);
  // Escape closes the innermost thing first: the sheet, the shortcuts, find,
  // the list of sources.
  function onEscape(e: KeyboardEvent) {
    if (anchor !== null) {
      setAnchor(null);
      setPreview(null);
      toast.dismiss("reader-words");
    } else if (comfortOpen) setComfortOpen(false);
    else if (sheet !== null) setSheet(null);
    else if (helpOpen) setHelpOpen(false);
    else if (findOpen) {
      setFindOpen(false);
      setQuery("");
    } else if (pickerOpen) setPickerOpen(false);
    else return;
    e.preventDefault();
  }

  // ---------- Marking ----------
  const markIndexAt = (offset: number) =>
    part && source ? markIndexIn(marks, source.id, part.text, offset) : -1;

  function addMark(span: Span, pen: Pen) {
    if (!part || !source) return;
    const id = source.id;
    const text = part.text;
    if (!markable(text, span, pen)) {
      toast("Mark a little more text");
      return;
    }
    commit((cur) => withMark(cur, id, text, span, pen));
    setActive({ source_id: id, quote: quoteOf(text, span) });
    dropSuggestion(span);
  }

  // A highlight's new ends (from a handle, Shift + arrows, or Trim).
  function reshape(i: number, span: Span) {
    if (!part || !source || !marks[i]) return;
    const text = part.text;
    if (!markable(text, span, marks[i].pen)) {
      toast("Mark a little more text");
      return;
    }
    commit((cur) => withSpanOf(cur, i, text, span));
    setActive({ source_id: marks[i].source_id, quote: quoteOf(text, span) });
  }

  // One highlight made into two at a word (Split).
  function split(i: number, at: number) {
    if (!part || !marks[i]) return;
    const text = part.text;
    const span = findQuote(text, marks[i].quote);
    if (!span) return;
    // The first part ends before the word the second starts with.
    const a = snapToWords(text, span[0], Math.max(span[0], at - 1));
    const b = snapToWords(text, at, span[1]);
    const m = marks[i];
    if (!markable(text, a, m.pen) || !markable(text, b, m.pen)) {
      toast("Each part needs a little more text");
      return;
    }
    commit((cur) => [
      ...cur.slice(0, i),
      { ...m, quote: quoteOf(text, a) },
      { source_id: m.source_id, quote: quoteOf(text, b), pen: m.pen },
      ...cur.slice(i + 1),
    ]);
    setActive(null);
    toast.success("Split into two highlights");
  }

  // Highlights from one source joined into one fact, in reading order.
  function join(ids: number[]) {
    const picked = ids.map((i) => marks[i]).filter(Boolean);
    if (picked.length < 2 || new Set(picked.map((m) => m.source_id)).size > 1) {
      toast.error("Pick two or more highlights from the same source");
      return;
    }
    const text = loaded[picked[0].source_id]?.text ?? "";
    const parts = picked
      .flatMap((m) => quoteParts(m.quote))
      .map((q) => ({ q, at: findQuote(text, q)?.[0] ?? Number.MAX_SAFE_INTEGER }))
      .sort((x, y) => x.at - y.at)
      .map((x) => x.q);
    const pen: Pen = picked.some((m) => m.pen === "point")
      ? "point"
      : picked.some((m) => m.pen === "check")
        ? "check"
        : picked[0].pen;
    const note = picked
      .map((m) => m.note)
      .filter(Boolean)
      .join("; ")
      .slice(0, 200);
    const joined: Mark = {
      source_id: picked[0].source_id,
      quote: parts.join(QUOTE_JOIN),
      pen,
      ...(note ? { note } : {}),
    };
    const first = Math.min(...ids);
    commit((cur) => {
      const rest = cur.filter((_, j) => !ids.includes(j));
      const at = cur.slice(0, first).filter((_, j) => !ids.includes(j)).length;
      return [...rest.slice(0, at), joined, ...rest.slice(at)];
    });
    toast.success(`Joined ${picked.length} highlights into one fact`);
  }

  // A joined highlight back into its parts.
  function unjoin(i: number) {
    const m = marks[i];
    if (!m) return;
    commit((cur) => [
      ...cur.slice(0, i),
      ...quoteParts(m.quote).map((quote, k) => ({
        source_id: m.source_id,
        quote,
        pen: m.pen,
        ...(k === 0 && m.note ? { note: m.note } : {}),
      })),
      ...cur.slice(i + 1),
    ]);
  }

  function dropSuggestion(span: Span) {
    if (!part || !source) return;
    const id = source.id;
    const text = part.text;
    setSuggested((cur) =>
      cur.filter((x) => {
        if (x.source_id !== id) return true;
        const s2 = findQuote(text, x.quote);
        return !(s2 && overlaps(s2, span));
      }),
    );
  }

  function erase(span: Span) {
    if (!part || !source) return;
    const id = source.id;
    const text = part.text;
    commit((cur) => withoutSpan(cur, id, text, span));
  }

  function tapAt(offset: number) {
    if (!part || !source) return;
    const id = source.id;
    const text = part.text;
    const now = Date.now();
    const prev = lastTap.current;
    lastTap.current = null;
    // A suggestion from SAATHI: one tap keeps it with the pen in hand.
    const sug = suggestSpans.find(([a, b]) => a <= offset && offset < b);
    if (sug && tool !== "eraser" && markIndexAt(offset) < 0) {
      addMark(sug, tool);
      return;
    }
    // Words: the first tap picks the first word, the second the last.
    if (tapMode === "words" && tool !== "eraser") {
      if (anchor === null) {
        if (markIndexAt(offset) >= 0) {
          const next = tapped(marks, id, text, sentences, offset, tool);
          if (next && next !== "short") commit(next);
          return;
        }
        setAnchor(offset);
        setPreview(snapToWords(text, offset, offset + 1));
        toast("Now tap the last word", { id: "reader-words", duration: 2500 });
        return;
      }
      const span = snapToWords(text, Math.min(anchor, offset), Math.max(anchor, offset) + 1);
      setAnchor(null);
      setPreview(null);
      toast.dismiss("reader-words");
      addMark(span, tool);
      return;
    }
    // Sentence mode: a second tap at once on the same place marks only the
    // clause, in place of the sentence the first tap marked.
    if (
      tapMode === "sentence" &&
      tool !== "eraser" &&
      prev &&
      now - prev.t < DOUBLE_TAP_MS &&
      Math.abs(prev.offset - offset) < 40
    ) {
      const cl = unitAt(text, sentences, offset, true);
      if (cl && markable(text, cl, tool)) {
        setMarks(withMark(prev.before, id, text, cl, tool));
        setActive({ source_id: id, quote: quoteOf(text, cl) });
        return;
      }
    }
    const next = tapped(marks, id, text, sentences, offset, tool, tapMode === "clause");
    if (next === "short") toast("Mark a little more text");
    else if (next) {
      commit(next);
      lastTap.current = { t: now, offset, before: marks };
      // The highlight just made is the one to adjust.
      const made = next.length > marks.length ? next[next.length - 1] : null;
      setActive(made ? { source_id: made.source_id, quote: made.quote } : null);
      if (made) {
        const sp = findQuote(text, made.quote);
        if (sp) dropSuggestion(sp);
      }
    }
  }

  // ---------- Pointer: tap, press-and-hold to paint, drag to paint with a mouse ----------
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    at: number | null;
    mouse: boolean;
    moved: boolean;
    paint: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const paintRef = useRef<{ anchor: number; focus: number } | null>(null);

  const startPaint = (anchor: number) => {
    paintRef.current = { anchor, focus: anchor };
    setPreview(snapToWords(part!.text, anchor, anchor + 1));
    try {
      navigator.vibrate?.(8);
    } catch {
      // no vibration
    }
  };

  function onPointerDown(e: React.PointerEvent) {
    if (!painting || e.button !== 0 || !part) return;
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    const g = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      at,
      mouse: e.pointerType === "mouse",
      moved: false,
      paint: false,
    } as NonNullable<typeof gesture.current>;
    gesture.current = g;
    if (!g.mouse && at !== null) {
      g.timer = setTimeout(() => {
        if (gesture.current !== g || g.moved) return;
        // Holding a highlight opens its actions; elsewhere it starts painting.
        const hit = markIndexAt(at);
        if (hit >= 0) {
          gesture.current = null;
          openSheet(hit);
          return;
        }
        g.paint = true;
        startPaint(at);
        textRef.current?.setPointerCapture?.(g.id);
      }, HOLD_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || !part) return;
    const far = Math.hypot(e.clientX - g.x, e.clientY - g.y) > (g.mouse ? 4 : MOVE_PX);
    if (!g.paint) {
      if (!far) return;
      g.moved = true;
      clearTimeout(g.timer);
      // A mouse drag paints; a finger that moves before the hold scrolls.
      if (g.mouse && g.at !== null) {
        g.paint = true;
        startPaint(g.at);
        textRef.current?.setPointerCapture?.(g.id);
      } else return;
    }
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    if (at === null || !paintRef.current) return;
    paintRef.current.focus = at;
    setPreview(snapToWords(part.text, paintRef.current.anchor, at));
    // Scroll along when painting near the top or bottom edge.
    const box = scrollRef.current?.getBoundingClientRect();
    if (box && scrollRef.current) {
      if (e.clientY > box.bottom - 40) scrollRef.current.scrollTop += 12;
      else if (e.clientY < box.top + 40) scrollRef.current.scrollTop -= 12;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || !part) return;
    clearTimeout(g.timer);
    if (g.paint && paintRef.current) {
      const span = snapToWords(part.text, paintRef.current.anchor, paintRef.current.focus + 1);
      paintRef.current = null;
      setPreview(null);
      if (span[1] > span[0]) {
        if (tool === "eraser") erase(span);
        else addMark(span, tool);
      }
      return;
    }
    if (!g.moved && g.at !== null) tapAt(g.at);
  }

  function openSheet(i: number) {
    try {
      navigator.vibrate?.(8);
    } catch {
      // no vibration
    }
    window.getSelection()?.removeAllRanges();
    setSheet(i);
    // Its ends can be dragged once the actions close.
    if (marks[i]) setActive({ source_id: marks[i].source_id, quote: marks[i].quote });
  }

  // Read mode: a tap on a highlight opens its actions. With a mouse in
  // Highlight mode, a right-click does.
  function onTextClick(e: React.MouseEvent) {
    if (painting) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    const hit = at === null ? -1 : markIndexAt(at);
    if (hit >= 0) openSheet(hit);
  }
  function onTextMenu(e: React.MouseEvent) {
    if (!painting) return;
    e.preventDefault();
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    const hit = at === null ? -1 : markIndexAt(at);
    if (hit >= 0) openSheet(hit);
  }

  // ---------- Handles on the active highlight: drag an end, a word at a time ----------
  const activeMark = activeIdx >= 0 ? marks[activeIdx] : undefined;
  const activeSpan: Span | null =
    activeMark && part && source && activeMark.source_id === source.id
      ? activeMark.quote.includes(QUOTE_JOIN)
        ? null
        : edit?.idx === activeIdx
          ? edit.span
          : findQuote(part.text, activeMark.quote)
      : null;
  const [handles, setHandles] = useState<{
    start: { x: number; y: number; h: number };
    end: { x: number; y: number; h: number };
  } | null>(null);
  useLayoutEffect(() => {
    const root = textRef.current;
    if (!root || !activeSpan) {
      setHandles(null);
      return;
    }
    const a = root.querySelector<HTMLElement>(`[data-mark-start="${activeSpan[0]}"]`);
    const b = root.querySelector<HTMLElement>(`[data-mark-end="${activeSpan[1]}"]`);
    if (!a || !b) {
      setHandles(null);
      return;
    }
    const box = root.getBoundingClientRect();
    const first = a.getClientRects()[0];
    const lasts = b.getClientRects();
    const last = lasts[lasts.length - 1];
    if (!first || !last) {
      setHandles(null);
      return;
    }
    setHandles({
      start: { x: first.left - box.left, y: first.top - box.top, h: first.height },
      end: { x: last.right - box.left, y: last.top - box.top, h: last.height },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpan?.[0], activeSpan?.[1], size, view, focus, comfort, ranges, wide]);

  useNumberUnderline(textRef.current, comfort.numbers && !!part, [
    part,
    ranges,
    view,
    focus,
    found,
    suggestSpans,
    size,
  ]);

  const handleDrag = useRef<{ which: "start" | "end"; dy: number; span: Span } | null>(null);
  function onHandleDown(which: "start" | "end", e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!activeSpan || !handles) return;
    const h = handles[which];
    const box = textRef.current!.getBoundingClientRect();
    // Where the finger is against the line it moves: the knob sits above
    // the first line or below the last one.
    const lineY = box.top + h.y + h.h / 2;
    handleDrag.current = { which, dy: lineY - e.clientY, span: activeSpan };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onHandleMove(e: React.PointerEvent) {
    e.stopPropagation();
    const d = handleDrag.current;
    if (!d || !part) return;
    const at = offsetAt(e.clientX, e.clientY + d.dy, textRef.current);
    if (at === null) return;
    const [a, b] = d.span;
    const next =
      d.which === "start"
        ? snapToWords(part.text, Math.min(at, b - 1), b)
        : snapToWords(part.text, a, Math.max(at + 1, a + 1));
    if (next[1] > next[0]) setEdit({ idx: activeIdx, span: next });
    // Scroll along near the top or bottom edge.
    const box = scrollRef.current?.getBoundingClientRect();
    if (box && scrollRef.current) {
      if (e.clientY > box.bottom - 40) scrollRef.current.scrollTop += 12;
      else if (e.clientY < box.top + 40) scrollRef.current.scrollTop -= 12;
    }
  }
  function onHandleUp(e: React.PointerEvent) {
    e.stopPropagation();
    const d = handleDrag.current;
    handleDrag.current = null;
    const span = edit?.idx === activeIdx ? edit.span : null;
    setEdit(null);
    if (!d || !span || (span[0] === d.span[0] && span[1] === d.span[1])) return;
    reshape(activeIdx, span);
  }

  // Shift + arrows: the active highlight's end (with Alt, its start) a word
  // further or back.
  function nudge(which: "start" | "end", dir: 1 | -1) {
    if (!part || !activeSpan) return;
    const text = part.text;
    const words = wordsIn(text, [
      Math.max(0, activeSpan[0] - 400),
      Math.min(text.length, activeSpan[1] + 400),
    ]);
    const [a, b] = activeSpan;
    let next: Span = [a, b];
    if (which === "end") {
      const after = words.find((w) => w[1] > b);
      const inside = words.filter((w) => w[0] >= a && w[1] <= b);
      if (dir > 0 && after) next = [a, after[1]];
      else if (dir < 0 && inside.length > 1) next = [a, inside[inside.length - 2][1]];
    } else {
      const before = [...words].reverse().find((w) => w[0] < a);
      const inside = words.filter((w) => w[0] >= a && w[1] <= b);
      if (dir > 0 && before) next = [before[0], b];
      else if (dir < 0 && inside.length > 1) next = [inside[1][0], b];
    }
    if (next[0] !== a || next[1] !== b) reshape(activeIdx, next);
  }

  function onPointerCancel() {
    if (gesture.current) clearTimeout(gesture.current.timer);
    gesture.current = null;
    paintRef.current = null;
    setPreview(null);
  }

  // A finger painting (or moving a handle) must not scroll the page. Caught
  // on the document: the word under the finger is redrawn as the highlight
  // grows, and touches keep going to the node that was there.
  useEffect(() => {
    if (!open) return;
    const stop = (e: TouchEvent) => {
      if (gesture.current?.paint || handleDrag.current) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false, capture: true });
    return () => document.removeEventListener("touchmove", stop, { capture: true });
  }, [open]);

  // Read mode: words selected the usual way can be highlighted with the pen.
  useEffect(() => {
    if (!open) return;
    const onSelect = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !textRef.current?.contains(sel.anchorNode)) {
        setSelection(null);
        return;
      }
      const a = offsetOfNode(sel.anchorNode, sel.anchorOffset);
      const b = offsetOfNode(sel.focusNode, sel.focusOffset);
      setSelection(a !== null && b !== null && a !== b ? [Math.min(a, b), Math.max(a, b)] : null);
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [open]);

  function markSelection() {
    if (!selection || !part) return;
    const span = snapToWords(part.text, selection[0], selection[1]);
    if (tool === "eraser") erase(span);
    else addMark(span, tool);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  // ---------- Loading more, jumping, remembering the place ----------
  async function loadMore(dir: "up" | "down") {
    if (!source || !part) return;
    const end = part.start + part.text.length;
    try {
      const r = await moreFn({
        data:
          dir === "up"
            ? { source_id: source.id, start: Math.max(0, part.start - 8000), end: part.start }
            : { source_id: source.id, start: end, end: end + 8000 },
      });
      setLoaded((cur) => {
        const p = cur[source.id];
        if (!p) return cur;
        const pEnd = p.start + p.text.length;
        const next =
          dir === "up"
            ? { text: r.text + p.text.slice(Math.max(0, r.end - p.start)), start: r.start }
            : { text: p.text + r.text.slice(Math.max(0, pEnd - r.start)), start: p.start };
        return { ...cur, [source.id]: { ...next, total: r.total } };
      });
    } catch (e) {
      toast.error(errorText(e, "Couldn't load more of the article"));
    }
  }

  function scrollToOffset(abs: number) {
    if (!part) return false;
    const rel = abs - part.start;
    if (rel < 0 || rel > part.text.length) return false;
    // Outside the article shown alone: show the article it is in first.
    if (art && (rel < art.at || rel >= art.end)) {
      const i = articles.findIndex((x) => rel >= x.at && rel < x.end);
      pendingJump.current = abs;
      setFocus(i >= 0 ? i : null);
      return true;
    }
    const els = [...(textRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])];
    const el = els.filter((x) => Number(x.dataset.at) <= rel).pop() ?? els[0];
    el?.scrollIntoView({ block: "start" });
    return true;
  }

  async function jumpTo(entry: OutlineEntry) {
    setContentsOpen(false);
    if (scrollToOffset(entry.at) || !source) return;
    try {
      const r = await moreFn({
        data: { source_id: source.id, start: Math.max(0, entry.at - 400), end: entry.at + 24_000 },
      });
      pendingJump.current = entry.at;
      setLoaded((cur) => ({
        ...cur,
        [source.id]: { text: r.text, start: r.start, total: r.total },
      }));
    } catch (e) {
      toast.error(errorText(e, "Couldn't open that part"));
    }
  }

  useEffect(() => {
    if (!part || !source) return;
    if (pendingJump.current !== null) {
      const at = pendingJump.current;
      pendingJump.current = null;
      requestAnimationFrame(() => scrollToOffset(at));
      return;
    }
    // Back to where reading stopped, once per opening (newspaper pages
    // open on the story's article instead).
    if (!restoredPos.current.has(source.id) && !articles.length) {
      restoredPos.current.add(source.id);
      const at = read<number | null>(posKey(source.id), null);
      if (at !== null) requestAnimationFrame(() => scrollToOffset(at));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, source, view, focus]);

  const lastTop = useRef(0);
  const posTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    if (top > lastTop.current + 8 && top > 60 && !findOpen) setHeaderHidden(true);
    else if (top < lastTop.current - 8 || top < 20) setHeaderHidden(false);
    lastTop.current = top;
    // Reading focus: the paragraph across the middle of the screen.
    if (comfort.focus) {
      const box = el.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      const at = [...(textRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])].find(
        (x) => {
          const r = x.getBoundingClientRect();
          return r.top <= mid && r.bottom >= mid;
        },
      );
      if (at) setFocusAt(Number(at.dataset.at));
    }
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => {
      if (!source || !part) return;
      const box = el.getBoundingClientRect();
      const first = [...(textRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])].find(
        (x) => x.getBoundingClientRect().bottom > box.top + 8,
      );
      if (first) write(posKey(source.id), part.start + Number(first.dataset.at));
    }, 300);
  }

  // ---------- Sending ----------
  const points = marks.filter((m) => isPoint(m.pen)).length;
  const keywordMarks = marks.filter((m) => m.pen === "keyword");

  async function submit() {
    if (!points) {
      toast.error("Mark at least one key point (yellow or pink).");
      return;
    }
    if (
      mode === "rewrite" &&
      item?.content &&
      !confirm(
        "Rewrite this story from your highlights? Its text, MCQ, Mains question and visual are written again, replacing your edits. Your Static Context picks stay, and the old version is kept in the story's History.",
      )
    )
      return;
    setBusy(true);
    try {
      const data = {
        highlights: marks
          .filter((m) => m.pen !== "keyword")
          .map((m) => ({
            source_id: m.source_id,
            quote: m.quote,
            point: isPoint(m.pen),
            check: m.pen === "check",
            ...(m.note ? { note: m.note } : {}),
          })),
        keywords: keywordMarks.map((m) => m.quote),
        note: note.trim() || null,
      };
      // Undo: the story's previous version back, or the new story removed.
      let undo: (() => Promise<unknown>) | null = null;
      if (mode === "rewrite" && item) {
        await rewriteFn({ data: { id: item.id, ...data } });
        if (item.content) undo = () => restoreFn({ data: { id: item.id } });
      } else {
        const created = await createFn({
          data: item ? { from_id: item.id, ...data } : { source_id: origin!.source_id, ...data },
        });
        undo = () => deleteFn({ data: { ids: [created.id] } });
      }
      write(draftKey(key, mode), null);
      const done =
        mode === "rewrite"
          ? "Story rewritten"
          : item
            ? "New story added after this one"
            : "New story added at the end of the day";
      toast.success(done, {
        duration: 10_000,
        ...(undo
          ? {
              action: {
                label: "Undo",
                onClick: () =>
                  void undo().then(
                    () => {
                      toast.success(mode === "rewrite" ? "Rewrite undone" : "New story removed");
                      onChanged();
                    },
                    (e) => toast.error(errorText(e, "Couldn't undo")),
                  ),
              },
            }
          : {}),
      });
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write the story"));
    } finally {
      setBusy(false);
    }
  }

  async function checkWhatsMissing() {
    if (!source) return;
    setChecking(true);
    try {
      const r = await missingFn({
        data: {
          id: item?.id ?? null,
          source_id: source.id,
          highlights: marks
            .filter((m) => m.source_id === source.id && m.pen !== "keyword")
            .map((m) => m.quote),
          // On a newspaper page, the article being read.
          ...(art && part ? { article: [part.start + art.at, part.start + art.end] } : {}),
        },
      });
      setMissing(r);
    } catch (e) {
      toast.error(errorText(e, "Couldn't check what's missing"));
    } finally {
      setChecking(false);
    }
  }

  function addMissing(f: MissingFact) {
    if (!source || !f.quote) return;
    const quote = f.quote;
    commit((cur) => [...cur, { source_id: source.id, quote, pen: "point" }]);
    setMissing((m) => m && { ...m, missing: m.missing.filter((x) => x !== f) });
    toast.success(`Added: ${f.label}`);
  }

  // Key points the story doesn't have yet: added as points without a rewrite.
  const factKeys = useMemo(
    () => new Set((item?.facts ?? []).map((f) => normalizeForMatch(f.quote))),
    [item],
  );
  const newPoints = marks.filter(
    (m) => isPoint(m.pen) && !factKeys.has(normalizeForMatch(cleanQuote(m.quote))),
  );

  // "Only add new key points": SAATHI's points are shown first, to change
  // or add as they are.
  const [pointsPreview, setPointsPreview] = useState<{ quote: string; point: Bi }[] | null>(null);
  const newHighlights = () =>
    newPoints.map((m) => ({
      source_id: m.source_id,
      quote: m.quote,
      point: true,
      check: m.pen === "check",
      ...(m.note ? { note: m.note } : {}),
    }));
  async function previewPointsOnly() {
    if (!item) return;
    setBusy(true);
    try {
      const r = await previewFn({ data: { id: item.id, highlights: newHighlights() } });
      setPointsPreview(r.facts.map((f, i) => ({ quote: f.quote, point: r.points[i] })));
      setTrayOpen(true);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write the points"));
    } finally {
      setBusy(false);
    }
  }

  async function suggestFacts() {
    if (!source) return;
    setSuggesting(true);
    try {
      const r = await suggestFn({
        data: {
          id: item?.id ?? null,
          source_id: source.id,
          marked: marks
            .filter((m) => m.source_id === source.id)
            .flatMap((m) => quoteParts(m.quote))
            .slice(0, 60),
          ...(art && part ? { article: [part.start + art.at, part.start + art.end] } : {}),
        },
      });
      setSuggested(r.map((x) => ({ source_id: source.id, quote: x.quote })));
      toast.success(
        r.length
          ? `${r.length} fact${r.length === 1 ? "" : "s"} suggested: tap one to keep it`
          : "No more exam facts found in this article",
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't suggest facts"));
    } finally {
      setSuggesting(false);
    }
  }
  function acceptAllSuggested() {
    if (!part || !source) return;
    const id = source.id;
    const text = part.text;
    const pen: Pen = tool === "eraser" ? "point" : tool;
    commit((cur) =>
      suggestSpans.reduce(
        (acc, span) => (markable(text, span, pen) ? withMark(acc, id, text, span, pen) : acc),
        cur,
      ),
    );
    setSuggested((cur) => cur.filter((x) => x.source_id !== id));
  }

  async function addPointsOnly() {
    if (!item) return;
    const id = item.id;
    setBusy(true);
    try {
      const before = item.facts.length;
      const saved = await addPointsFn({
        data: {
          id,
          highlights: newHighlights(),
          keywords: keywordMarks.map((m) => m.quote),
          ...(pointsPreview ? { points: pointsPreview.map((x) => x.point) } : {}),
        },
      });
      setPointsPreview(null);
      const added = saved.facts.length - before;
      write(draftKey(key, mode), null);
      toast.success(`Added ${added} key point${added === 1 ? "" : "s"}`, {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () =>
            void restoreFn({ data: { id } }).then(
              () => {
                toast.success("Points removed");
                onChanged();
              },
              (e) => toast.error(errorText(e, "Couldn't undo")),
            ),
        },
      });
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorText(e, "Couldn't add the points"));
    } finally {
      setBusy(false);
    }
  }

  async function addKeywordsOnly() {
    setBusy(true);
    try {
      if (!item) return;
      await keywordsFn({ data: { id: item.id, keywords: keywordMarks.map((m) => m.quote) } });
      commit((cur) => cur.filter((m) => m.pen !== "keyword"));
      toast.success("Added to Static Context");
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add the keywords"));
    } finally {
      setBusy(false);
    }
  }

  // The words of the highlight whose actions are open, for Trim and Split
  // (a highlight in the source being read, not a joined one).
  const sheetWords = useMemo(() => {
    const m = sheet !== null ? marks[sheet] : undefined;
    if (!m || !part || !source || m.source_id !== source.id || m.quote.includes(QUOTE_JOIN))
      return null;
    const span = findQuote(part.text, m.quote);
    return span ? wordsIn(part.text, span) : null;
  }, [sheet, marks, part, source]);

  const tray = (
    <Tray
      marks={marks}
      mode={mode}
      note={note}
      busy={busy}
      points={points}
      keywords={keywordMarks.length}
      canAddKeywords={mode === "rewrite" && !!item?.content}
      newPoints={newPoints.length}
      onAddPoints={mode === "rewrite" && item?.content ? () => void previewPointsOnly() : undefined}
      pointsPreview={pointsPreview}
      onPreviewChange={setPointsPreview}
      onConfirmPoints={() => void addPointsOnly()}
      onMove={(i, d) =>
        commit((cur) => {
          const j = i + d;
          if (j < 0 || j >= cur.length) return cur;
          const next = [...cur];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        })
      }
      onJoin={join}
      canJoin={(ids) =>
        ids.length > 1 &&
        new Set(ids.map((i) => marks[i]?.source_id)).size === 1 &&
        ids.every((i) => marks[i] && marks[i].pen !== "keyword")
      }
      suggestCount={suggestSpans.length}
      suggesting={suggesting}
      onSuggest={source ? () => void suggestFacts() : undefined}
      onAcceptSuggested={acceptAllSuggested}
      onClearSuggested={() => setSuggested([])}
      story={wide && mode === "rewrite" ? item : null}
      onNote={setNote}
      onCycle={(i) =>
        commit((cur) =>
          cur.map((m, j) =>
            j === i ? { ...m, pen: CYCLE[(CYCLE.indexOf(m.pen) + 1) % CYCLE.length] } : m,
          ),
        )
      }
      onRemove={(i) => commit((cur) => cur.filter((_, j) => j !== i))}
      onShow={(m) => {
        if (!part || !source) return;
        const i = sources.findIndex((s) => s.id === m.source_id);
        // A highlight in a source read beside this one: shown there.
        if (i < 0 && wide) {
          if (pane?.id === m.source_id) setPaneJump({ quote: m.quote, n: Date.now() });
          else openBeside(m.source_id, 0, m.quote);
          return;
        }
        if (i >= 0 && i !== tab) setTab(i);
        const s = m.source_id === source.id ? findQuote(part.text, m.quote) : null;
        if (s) scrollToOffset(part.start + s[0]);
        setTrayOpen(false);
      }}
      onSubmit={() => void submit()}
      onAddKeywords={() => void addKeywordsOnly()}
      onEdit={(i) => openSheet(i)}
      sourceName={(id) => (id === source?.id ? null : sourceName(id))}
      missing={(mode === "rewrite" || !item) && source ? missing : undefined}
      checking={checking}
      onCheckMissing={() => void checkWhatsMissing()}
      onAddMissing={addMissing}
      jump={wide && ordered.length > 1 ? <HighlightJump onStep={stepHighlight} /> : null}
    />
  );

  const page = (
    <>
      <style>{NUMBER_CSS}</style>
      {/* Top bar: hides while scrolling down. */}
      <header
        className={`overflow-hidden border-b border-border bg-background transition-all duration-200 ${headerHidden ? "max-h-0 border-b-0 opacity-0" : "max-h-72"}`}
      >
        <div className={`flex items-center gap-1.5 p-2 ${inline ? "" : "pr-11"}`}>
          {inline ? (
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {source?.title ?? "Full article"}
            </h2>
          ) : (
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
              {source?.title ?? "Full article"}
            </DialogTitle>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            aria-label="Find in article"
            aria-expanded={findOpen}
            onClick={() => {
              setFindOpen((v) => !v);
              setFindIdx(0);
            }}
          >
            <Search className="h-4 w-4" />
          </Button>
          {articles.length > 0 && view === "clean" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              aria-label="Articles on this page"
              aria-expanded={articlesOpen}
              onClick={() => setArticlesOpen((v) => !v)}
            >
              <Newspaper className="h-4 w-4" />
            </Button>
          )}
          {wide && source && (
            <Button
              size="sm"
              variant={compare ? "secondary" : "ghost"}
              className="h-8 px-2"
              aria-label="Read another source beside this"
              title="Read another source beside this (C)"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((v) => !v)}
            >
              <Columns2 className="h-4 w-4" />
            </Button>
          )}
          {source && source.outline.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              aria-label="Contents"
              aria-expanded={contentsOpen}
              onClick={() => setContentsOpen((v) => !v)}
            >
              <ListTree className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Smaller text"
            disabled={size <= 13}
            onClick={() => setSize((s) => s - 1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Larger text"
            disabled={size >= 24}
            onClick={() => setSize((s) => s + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Reading settings"
            aria-expanded={comfortOpen}
            onClick={() => setComfortOpen((v) => !v)}
          >
            <Type className="h-4 w-4" />
          </Button>
        </div>
        {comfortOpen && <ComfortPanel value={comfort} onChange={setComfort} />}
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
          {item ? (
            (
              [
                ["rewrite", "Rewrite this story"],
                ["new", "New story"],
              ] as const
            ).map(([m, label]) => (
              <Chip key={m} on={mode === m} disabled={busy} onClick={() => switchMode(m)}>
                {label}
              </Chip>
            ))
          ) : (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              New story from skipped news
            </span>
          )}
          <span className="mx-1 h-4 w-px bg-border" />
          <Chip on={view === "clean"} onClick={() => setView("clean")}>
            Clean
          </Chip>
          <Chip on={view === "original"} onClick={() => setView("original")}>
            Original text
          </Chip>
        </div>
        {sources.length > 1 && (
          <div className="flex gap-1 overflow-x-auto px-2 pb-2" role="tablist">
            {sources.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={`shrink-0 rounded-md px-2 py-1 text-xs ${i === tab ? "bg-muted font-semibold" : "text-muted-foreground"}`}
              >
                {s.source_name || s.section.toUpperCase()} · {s.title.slice(0, 40)}
              </button>
            ))}
          </div>
        )}
        {findOpen && (
          <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
            <Input
              ref={findRef}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFindIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  stepFind(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Find a word, name or number…"
              aria-label="Find"
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <span
              className="w-14 shrink-0 text-center text-xs text-muted-foreground"
              aria-live="polite"
            >
              {query.trim().length < 2
                ? ""
                : matches.length
                  ? `${findIdx + 1} of ${matches.length}`
                  : "None"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label="Previous match"
              disabled={!matches.length}
              onClick={() => stepFind(-1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label="Next match"
              disabled={!matches.length}
              onClick={() => stepFind(1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label="Close find"
              onClick={() => {
                setFindOpen(false);
                setQuery("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {findOpen && part && (part.start > 0 || part.start + part.text.length < part.total) && (
          <p className="px-3 pb-1.5 text-[11px] text-muted-foreground">
            Searching the part shown; use “Show more” to search further.
          </p>
        )}
        {articlesOpen && articles.length > 0 && (
          <nav
            aria-label="Articles on this page"
            className="max-h-[45dvh] overflow-y-auto border-t border-border px-2 py-1"
          >
            <button
              type="button"
              onClick={() => pickArticle(null)}
              className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${focus === null ? "font-semibold text-primary" : ""}`}
            >
              Whole page
            </button>
            {articles.map((a, i) => (
              <ArticleRow
                key={a.at}
                article={a}
                info={articleInfo[i]}
                on={focus === i}
                onClick={() => pickArticle(i)}
              />
            ))}
          </nav>
        )}
        {pickerOpen && wide && (
          <nav
            aria-label="Sources to read beside this"
            className="max-h-[45dvh] overflow-y-auto border-t border-border px-2 py-1"
          >
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Read another of the day's sources beside this one, to take facts from both. Each opens
              on its article most like the one you are reading, in Hindi or English.
            </p>
            {candQ.isLoading ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Finding the same news in other sources…
              </p>
            ) : candQ.isError ? (
              <p className="px-2 py-2 text-sm text-destructive">
                {errorText(candQ.error, "Couldn't list the sources")}
              </p>
            ) : candQ.data?.length ? (
              candQ.data.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-compare={c.source_name || c.title}
                  onClick={() => openBeside(c.id, c.match?.at ?? 0)}
                  className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${pane?.id === c.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {c.source_name || c.section.toUpperCase()} · {c.title}
                    </span>
                    {c.match?.meaning && (
                      <Badge tone="primary" title="Same news in other words or another language">
                        by meaning
                      </Badge>
                    )}
                    {c.match && (
                      <Badge tone={c.match.score >= 0.3 ? "good" : "muted"}>
                        {Math.round(c.match.score * 100)}% match
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.match
                      ? `${c.match.page !== null ? `Page ${c.match.page} · ` : ""}${c.match.title}`
                      : "No matching article: opens at the start"}
                  </div>
                </button>
              ))
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                No other sources for this day.
              </p>
            )}
          </nav>
        )}
        {contentsOpen && source && (
          <nav
            aria-label="Contents"
            className="max-h-[40dvh] overflow-y-auto border-t border-border px-2 py-1"
          >
            {source.outline.map((e, i) => (
              <button
                key={`${e.at}-${i}`}
                type="button"
                onClick={() => void jumpTo(e)}
                className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${e.level === 0 ? "font-semibold text-primary" : e.level > 1 ? "pl-5 text-muted-foreground" : ""}`}
              >
                {e.title}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-3">
            {q.isLoading && <p className="text-sm text-muted-foreground">Loading the article…</p>}
            {q.isError && (
              <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>
            )}
            {q.data && sources.length === 0 && (
              <p className="text-sm text-muted-foreground">
                This story has no source text to read.
              </p>
            )}
            {source && part && (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{source.source_name || source.section.toUpperCase()}</span>
                  <ClippingButton sourceId={source.id} />
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      Open page <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {view === "clean" && hidden > 0 && (
                    <span>· {hidden} menu or ad lines hidden</span>
                  )}
                </div>
                {part.start > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mb-2 w-full"
                    onClick={() => void loadMore("up")}
                  >
                    <ChevronUp className="mr-1 h-4 w-4" /> Show more above
                  </Button>
                )}
                <div
                  ref={textRef}
                  data-testid="reader-text"
                  data-mode={painting ? "highlight" : "read"}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onContextMenu={onTextMenu}
                  onClick={onTextClick}
                  style={{
                    fontSize: size,
                    lineHeight: SPACING[comfort.spacing],
                    ...(FONTS[comfort.font].family
                      ? { fontFamily: FONTS[comfort.font].family }
                      : {}),
                  }}
                  className={`relative ${painting ? "cursor-text select-none [-webkit-touch-callout:none]" : ""}`}
                >
                  {handles && (
                    <>
                      {(["start", "end"] as const).map((which) => {
                        const h = handles[which];
                        const pen = activeMark ? PEN[activeMark.pen].dot : "bg-primary";
                        return (
                          <span
                            key={which}
                            data-handle={which}
                            className="pointer-events-none absolute z-10 flex w-7 -translate-x-1/2 select-none flex-col items-center"
                            style={{
                              left: h.x,
                              top: which === "start" ? h.y - 16 : h.y,
                              height: h.h + 16,
                              flexDirection: which === "start" ? "column" : "column-reverse",
                            }}
                          >
                            {/* Only the knob, above the first line or below the last,
                                takes a finger: the words under the bar stay tappable. */}
                            <span
                              role="slider"
                              aria-label={
                                which === "start" ? "Start of highlight" : "End of highlight"
                              }
                              aria-valuenow={which === "start" ? activeSpan?.[0] : activeSpan?.[1]}
                              onPointerDown={(e) => onHandleDown(which, e)}
                              onPointerMove={onHandleMove}
                              onPointerUp={onHandleUp}
                              onPointerCancel={() => {
                                handleDrag.current = null;
                                setEdit(null);
                              }}
                              className="pointer-events-auto grid h-4 w-7 shrink-0 cursor-grab touch-none place-items-center"
                            >
                              <span
                                className={`h-3.5 w-3.5 rounded-full border-2 border-background shadow ${pen}`}
                              />
                            </span>
                            <span className="w-0.5 flex-1 bg-foreground/60" />
                          </span>
                        );
                      })}
                    </>
                  )}
                  {view === "clean" ? (
                    <>
                      {art && (
                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            Page {art.page} · article {focus! + 1} of {articles.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => pickArticle(null)}
                            className="ml-auto rounded-full border border-border px-2.5 py-0.5"
                          >
                            Whole page
                          </button>
                        </div>
                      )}
                      {blocks.map((b) =>
                        b.clutter || !inFocus(b.at) ? null : (
                          <BlockView
                            key={b.at}
                            block={b}
                            {...rangesFor(b, ranges, taken, found, flash, suggestSpans)}
                            dim={comfort.focus && focusAt !== null && b.at !== focusAt}
                          />
                        ),
                      )}
                      {art && (
                        <ArticleFoot
                          articles={articles}
                          info={articleInfo}
                          focus={focus!}
                          onPick={pickArticle}
                        />
                      )}
                    </>
                  ) : (
                    <div data-at={0} className="whitespace-pre-wrap">
                      <Pieces
                        run={{ text: part.text, at: 0 }}
                        ranges={ranges}
                        taken={taken}
                        found={found}
                        flash={flash}
                        suggest={suggestSpans}
                      />
                    </div>
                  )}
                </div>
                {part.start + part.text.length < part.total && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 w-full"
                    onClick={() => void loadMore("down")}
                  >
                    <ChevronDown className="mr-1 h-4 w-4" /> Show more below
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        {wide &&
          compare &&
          (pane ? (
            <ComparePane
              source={pane}
              at={compare.at}
              jump={paneJump}
              marks={marks}
              tool={tool}
              painting={painting}
              size={size}
              numbers={comfort.numbers}
              clause={tapMode === "clause"}
              commit={commit}
              onSheet={openSheet}
              onClose={() => setCompare(null)}
            />
          ) : (
            <section className="w-[44%] max-w-2xl shrink-0 border-l border-border p-4 text-sm text-muted-foreground">
              {paneQ.isError ? (
                <span className="text-destructive">
                  {errorText(paneQ.error, "Couldn't load the source")}
                </span>
              ) : (
                "Loading the second source…"
              )}
            </section>
          ))}
        {/* Wide screens: highlights beside the article. */}
        {wide && (
          <aside
            className={`flex shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20 ${compare ? "w-80" : "w-96"}`}
          >
            {tray}
          </aside>
        )}
      </div>

      <footer className="border-t border-border bg-background">
        {selection && !painting && (
          <div className="px-2 pt-2">
            <Button size="sm" className="w-full" onClick={markSelection}>
              {tool === "eraser"
                ? "Erase selected words"
                : `Mark selected words · ${PEN[tool].label}`}
            </Button>
          </div>
        )}
        {/* Phones: the highlights tray, opened from its handle. */}
        <div className={wide ? "hidden" : ""}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-3 pt-2 text-sm font-medium"
            aria-expanded={trayOpen}
            onClick={() => setTrayOpen((v) => !v)}
            onPointerDown={(e) => (dragFrom.current = e.clientY)}
            onPointerUp={(e) => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from === null) return;
              if (from - e.clientY > 30) setTrayOpen(true);
              else if (e.clientY - from > 30) setTrayOpen(false);
            }}
          >
            <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-muted-foreground/30" />
          </button>
          <div className="flex items-center gap-1 px-3 pb-1">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium"
              onClick={() => setTrayOpen((v) => !v)}
            >
              <Highlighter className="h-4 w-4 shrink-0 text-amber-600" />
              Highlights ({marks.length}) · {points} key point{points === 1 ? "" : "s"}
            </button>
            {ordered.length > 1 && <HighlightJump onStep={stepHighlight} />}
            <button
              type="button"
              aria-label={trayOpen ? "Close highlights" : "Open highlights"}
              onClick={() => setTrayOpen((v) => !v)}
              className="grid h-7 w-7 place-items-center"
            >
              <ChevronUp
                className={`h-4 w-4 transition-transform ${trayOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {trayOpen && !wide && <div className="max-h-[55dvh] overflow-y-auto">{tray}</div>}
        </div>
        {painting && tool !== "eraser" && (
          <div
            className="flex items-center gap-1.5 px-3 pt-1.5 text-xs"
            role="radiogroup"
            aria-label="A tap marks"
          >
            <span className="text-muted-foreground">A tap marks</span>
            {TAP_MODES.map((t) => (
              <button
                key={t.mode}
                type="button"
                role="radio"
                aria-checked={tapMode === t.mode}
                title={t.hint}
                onClick={() => setTapMode(t.mode)}
                className={`rounded-full border px-2.5 py-0.5 ${tapMode === t.mode ? "border-primary/50 bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground"}`}
              >
                {t.label}
              </button>
            ))}
            {anchor !== null && (
              <span className="ml-auto text-primary" aria-live="polite">
                Now tap the last word
              </span>
            )}
          </div>
        )}
        <Toolbar
          painting={painting}
          keepMode={!!selection}
          tool={tool}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onPainting={setPainting}
          onTool={setTool}
          onUndo={undo}
          onRedo={redo}
          onHelp={wide ? () => setHelpOpen((v) => !v) : undefined}
        />
      </footer>
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      {sheet !== null && marks[sheet] && (
        <MarkSheet
          key={sheet}
          mark={marks[sheet]}
          words={sheetWords}
          text={part?.text ?? ""}
          onTrim={(span) => {
            reshape(sheet, span);
            setSheet(null);
          }}
          onSplit={(at) => {
            split(sheet, at);
            setSheet(null);
          }}
          onUnjoin={() => {
            unjoin(sheet);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
          onPen={(pen) => {
            const i = sheet;
            commit((cur) => cur.map((m, j) => (j === i ? { ...m, pen } : m)));
          }}
          onNote={(text) => {
            const i = sheet;
            commit((cur) =>
              cur.map((m, j) => {
                if (j !== i) return m;
                const { note: _old, ...rest } = m;
                return text ? { ...rest, note: text } : rest;
              }),
            );
            setSheet(null);
          }}
          onRemove={() => {
            const i = sheet;
            commit((cur) => cur.filter((_, j) => j !== i));
            setSheet(null);
          }}
        />
      )}
    </>
  );
  if (inline) return open ? <div className="flex h-full min-h-0 flex-col">{page}</div> : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        onEscapeKeyDown={onEscape}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        {page}
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

// Wide screens (laptops) show the highlights beside the article.
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

// Reading settings: line spacing, a Hindi font, numbers underlined, and
// dimming all but the paragraph being read.
function ComfortPanel({ value, onChange }: { value: Comfort; onChange: (c: Comfort) => void }) {
  const row = "flex flex-wrap items-center gap-1.5";
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-primary/50 bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground"}`;
  return (
    <div
      role="group"
      aria-label="Reading settings"
      className="space-y-2 border-t border-border px-3 py-2 text-xs"
    >
      <div className={row}>
        <span className="w-24 text-muted-foreground">Line spacing</span>
        {(
          [
            ["normal", "Normal"],
            ["relaxed", "Relaxed"],
            ["loose", "Loose"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.spacing === k}
            onClick={() => onChange({ ...value, spacing: k })}
            className={chip(value.spacing === k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={row}>
        <span className="w-24 text-muted-foreground">Hindi font</span>
        {(Object.keys(FONTS) as Comfort["font"][]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.font === k}
            onClick={() => onChange({ ...value, font: k })}
            className={chip(value.font === k)}
            style={FONTS[k].family ? { fontFamily: FONTS[k].family } : undefined}
          >
            {FONTS[k].label} · हिंदी
          </button>
        ))}
      </div>
      <div className={row}>
        <button
          type="button"
          aria-pressed={value.numbers}
          onClick={() => onChange({ ...value, numbers: !value.numbers })}
          className={chip(value.numbers)}
        >
          Underline numbers and dates
        </button>
        <button
          type="button"
          aria-pressed={value.focus}
          onClick={() => onChange({ ...value, focus: !value.focus })}
          className={chip(value.focus)}
        >
          Focus on the paragraph I'm reading
        </button>
      </div>
    </div>
  );
}

// The bottom toolbar: Read / Highlight, the pens, the eraser, undo and redo.
function Toolbar({
  painting,
  keepMode,
  tool,
  canUndo,
  canRedo,
  onPainting,
  onTool,
  onUndo,
  onRedo,
  onHelp,
}: {
  painting: boolean;
  // Words are selected in Read mode: a pen only picks the colour for them.
  keepMode: boolean;
  tool: Tool;
  canUndo: boolean;
  canRedo: boolean;
  onPainting: (v: boolean) => void;
  onTool: (t: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  // Laptops: the keyboard shortcuts.
  onHelp?: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const pick = (t: Tool) => {
    onTool(t);
    if (!keepMode) onPainting(true);
    setHint(t === "eraser" ? "Eraser" : PEN[t].label);
    setTimeout(() => setHint(null), 1200);
  };
  return (
    <div className="relative flex items-center gap-1 px-2 py-2" role="toolbar" aria-label="Pens">
      {hint && (
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-2.5 py-0.5 text-xs text-background">
          {hint}
        </span>
      )}
      <div className="flex rounded-full border border-border p-0.5">
        <button
          type="button"
          aria-pressed={!painting}
          aria-label="Read"
          title="Read: taps do nothing, select text as usual"
          onClick={() => onPainting(false)}
          className={`grid h-9 w-9 place-items-center rounded-full ${!painting ? "bg-muted" : ""}`}
        >
          <BookOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-pressed={painting}
          aria-label="Highlight"
          title="Highlight: tap a sentence, or press and hold then drag over words"
          onClick={() => onPainting(true)}
          className={`grid h-9 w-9 place-items-center rounded-full ${painting ? "bg-muted" : ""}`}
        >
          <Highlighter className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center gap-1.5">
        {PENS.map((p) => (
          <button
            key={p.pen}
            type="button"
            aria-label={p.label}
            aria-pressed={tool === p.pen}
            title={p.label}
            onClick={() => pick(p.pen)}
            className={`grid h-9 w-9 place-items-center rounded-full ${tool === p.pen ? "ring-2 ring-foreground/60 ring-offset-1 ring-offset-background" : ""}`}
          >
            <span className={`h-6 w-6 rounded-full ${p.dot}`} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Eraser"
          aria-pressed={tool === "eraser"}
          title="Eraser"
          onClick={() => pick("eraser")}
          className={`grid h-9 w-9 place-items-center rounded-full ${tool === "eraser" ? "bg-muted ring-2 ring-foreground/60" : ""}`}
        >
          <Eraser className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
        className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
        className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"
      >
        <Redo2 className="h-4 w-4" />
      </button>
      {onHelp && (
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={onHelp}
          className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-muted-foreground"
        >
          ?
        </button>
      )}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["1 2 3 4", "Pens: key point, summary only, to check, Static Context"],
  ["E", "Eraser"],
  ["R", "Switch Read / Highlight"],
  ["Ctrl+Z / Ctrl+Y", "Undo / redo"],
  ["F or /", "Find in article"],
  ["J / K", "Next / previous highlight"],
  ["N / P", "Next / previous article"],
  ["C", "Read another source beside this one"],
  ["Shift+→ / Shift+←", "The highlight just made: a word longer / shorter at its end"],
  ["Alt+Shift+← / →", "The same at its start"],
  ["Enter", "Read mode: mark the selected words with the pen"],
  ["Esc", "Close find, a highlight's actions, or this list"],
  ["?", "Show or hide this list"],
];

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="absolute bottom-20 right-4 z-50 w-80 rounded-2xl border border-border bg-background p-4 shadow-2xl"
    >
      <div className="mb-2 flex items-center">
        <span className="flex-1 text-sm font-semibold">Keyboard shortcuts</span>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="space-y-1.5 text-xs">
        {SHORTCUTS.map(([k, what]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-28 shrink-0 font-mono font-semibold">{k}</dt>
            <dd className="text-muted-foreground">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type ArticleInfo = {
  mine: boolean;
  marked: boolean;
  others: { headline: string; dropped: boolean }[];
};

function ArticleBadge({ info }: { info?: ArticleInfo }) {
  if (!info) return null;
  if (info.mine) return <Badge tone="primary">This story</Badge>;
  const kept = info.others.find((o) => !o.dropped);
  if (kept) return <Badge tone="good">Story: {kept.headline.slice(0, 40)}</Badge>;
  // A story was made but dropped from the issue: include it rather than make another.
  if (info.others.length) return <Badge>Dropped: {info.others[0].headline.slice(0, 36)}</Badge>;
  if (info.marked) return <Badge tone="warn">Highlighted</Badge>;
  return <Badge tone="warn">No story yet</Badge>;
}

function ArticleRow({
  article: a,
  info,
  on,
  onClick,
}: {
  article: Article;
  info?: ArticleInfo;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on || undefined}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${on ? "bg-muted font-semibold" : ""}`}
    >
      <span className="w-10 shrink-0 text-[11px] text-muted-foreground">p. {a.page}</span>
      <span className="min-w-0 flex-1 truncate">{a.title}</span>
      <ArticleBadge info={info} />
    </button>
  );
}

// Under an article shown alone: the previous and next article, and the
// other articles of its page with their stories.
function ArticleFoot({
  articles,
  info,
  focus,
  onPick,
}: {
  articles: Article[];
  info: ArticleInfo[];
  focus: number;
  onPick: (i: number | null) => void;
}) {
  const page = articles[focus].page;
  const samePage = articles.some((a, i) => a.page === page && i !== focus);
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-3" data-testid="article-foot">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={focus === 0}
          onClick={() => onPick(focus - 1)}
        >
          ← Previous article
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={focus === articles.length - 1}
          onClick={() => onPick(focus + 1)}
        >
          Next article →
        </Button>
      </div>
      {samePage && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other articles on page {page}
          </div>
          {articles.map((a, i) =>
            a.page !== page || i === focus ? null : (
              <ArticleRow
                key={a.at}
                article={a}
                info={info[i]}
                on={false}
                onClick={() => onPick(i)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// Laptops: another of the day's sources beside the one being read (the same
// news in another paper), opened on its article most like it. Highlights
// made here join the same list and can go into the story.
function ComparePane({
  source,
  at,
  jump,
  marks,
  tool,
  painting,
  size,
  numbers,
  clause,
  commit,
  onSheet,
  onClose,
}: {
  numbers: boolean;
  // A click marks the clause rather than the sentence.
  clause: boolean;
  source: ReaderSource;
  // Where it opened, in the whole source.
  at: number;
  // A highlight to show (from the list), with a counter so it can repeat.
  jump: { quote: string; n: number } | null;
  marks: Mark[];
  tool: Tool;
  painting: boolean;
  size: number;
  commit: (next: Mark[] | ((cur: Mark[]) => Mark[])) => void;
  onSheet: (i: number) => void;
  onClose: () => void;
}) {
  const text = source.text;
  const paged = isPaged(source.url);
  const firstPage =
    source.outline.filter((e) => e.level === 0 && e.at > 0 && e.at < source.start).length + 1;
  const blocks = useMemo(() => parseBlocks(text, paged, firstPage), [text, paged, firstPage]);
  const articles = useMemo<Article[]>(() => {
    if (!paged) return [];
    const list = splitArticles(blocks, firstPage);
    return list.length >= 2 ? list : [];
  }, [blocks, paged, firstPage]);
  const sentences = useMemo(() => sentenceSpans(text), [text]);
  const [focus, setFocus] = useState<number | null>(null);
  const [preview, setPreview] = useState<Span | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);

  // Opens on the matching article; a highlight picked in the list wins.
  useEffect(() => {
    const rel = at - source.start;
    const i = articles.findIndex((a) => rel >= a.at && rel < a.end);
    start.current = articles.length ? Math.max(0, i) : null;
    setFocus(start.current);
    if (boxRef.current) boxRef.current.scrollTop = 0;
  }, [source.id, source.start, at, articles]);
  useEffect(() => {
    if (!jump) return;
    const s = findQuote(text, jump.quote);
    if (!s) return;
    if (articles.length) {
      const i = articles.findIndex((a) => s[0] >= a.at && s[0] < a.end);
      setFocus(i >= 0 ? i : null);
    }
    requestAnimationFrame(() =>
      textRef.current
        ?.querySelector(`[data-mark-start="${s[0]}"]`)
        ?.scrollIntoView({ block: "center" }),
    );
  }, [jump, text, articles]);

  const art = focus !== null ? articles[focus] : undefined;
  const inFocus = (x: number) => !art || (x >= art.at && x < art.end);
  const ranges = useMemo<Range[]>(() => {
    const out: Range[] = [];
    for (const m of marks) {
      if (m.source_id !== source.id) continue;
      const span = findQuote(text, m.quote);
      if (span) out.push({ span, pen: m.pen, note: m.note });
    }
    if (preview && tool !== "eraser") out.push({ span: preview, pen: tool, preview: true });
    return out;
  }, [marks, text, source.id, preview, tool]);

  useNumberUnderline(textRef.current, numbers, [ranges, focus, text]);

  // A click marks the sentence (or changes the highlight there); a drag
  // paints words; a right-click on a highlight opens its actions.
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    at: number;
    to: number;
    paint: boolean;
  } | null>(null);
  function onDown(e: React.PointerEvent) {
    if (!painting || e.button !== 0) return;
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    drag.current =
      at === null
        ? null
        : { id: e.pointerId, x: e.clientX, y: e.clientY, at, to: at, paint: false };
  }
  function onMove(e: React.PointerEvent) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.paint) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) <= 4) return;
      g.paint = true;
      textRef.current?.setPointerCapture?.(g.id);
    }
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    if (at === null) return;
    g.to = at;
    setPreview(snapToWords(text, g.at, at));
  }
  function onUp(e: React.PointerEvent) {
    const g = drag.current;
    drag.current = null;
    if (!g || g.id !== e.pointerId) return;
    if (g.paint) {
      setPreview(null);
      const span = snapToWords(text, Math.min(g.at, g.to), Math.max(g.at, g.to) + 1);
      if (span[1] <= span[0]) return;
      if (tool === "eraser") commit((cur) => withoutSpan(cur, source.id, text, span));
      else if (markable(text, span, tool)) {
        const pen = tool;
        commit((cur) => withMark(cur, source.id, text, span, pen));
      } else toast("Mark a little more text");
      return;
    }
    const next = tapped(marks, source.id, text, sentences, g.at, tool, clause);
    if (next === "short") toast("Mark a little more text");
    else if (next) commit(next);
  }
  function onMenu(e: React.MouseEvent) {
    const at = offsetAt(e.clientX, e.clientY, textRef.current);
    const hit = at === null ? -1 : markIndexIn(marks, source.id, text, at);
    if (hit < 0) return;
    e.preventDefault();
    onSheet(hit);
  }

  return (
    <section
      aria-label="Second source"
      className="flex min-h-0 w-[44%] max-w-2xl shrink-0 flex-col border-l border-border"
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-1.5 text-xs">
        <Columns2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {source.source_name || source.section.toUpperCase()} · {source.title}
        </span>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 text-primary hover:underline"
          >
            Open page <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          type="button"
          aria-label="Close second source"
          onClick={onClose}
          className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {articles.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1 text-xs text-muted-foreground">
          {art ? (
            <>
              <span className="min-w-0 flex-1 truncate">
                Page {art.page} · article {focus! + 1} of {articles.length}
              </span>
              <button
                type="button"
                aria-label="Previous article in second source"
                disabled={focus === 0}
                onClick={() => setFocus(focus! - 1)}
                className="rounded px-1.5 disabled:opacity-30"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next article in second source"
                disabled={focus === articles.length - 1}
                onClick={() => setFocus(focus! + 1)}
                className="rounded px-1.5 disabled:opacity-30"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => setFocus(null)}
                className="rounded-full border border-border px-2 py-0.5"
              >
                Whole page
              </button>
            </>
          ) : (
            <>
              <span className="flex-1">Whole page</span>
              <button
                type="button"
                onClick={() => setFocus(start.current ?? 0)}
                className="rounded-full border border-border px-2 py-0.5"
              >
                One article
              </button>
            </>
          )}
        </div>
      )}
      <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div
          ref={textRef}
          data-testid="compare-text"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            drag.current = null;
            setPreview(null);
          }}
          onContextMenu={onMenu}
          onClick={(e) => {
            const sel = window.getSelection();
            if (!painting && (!sel || sel.isCollapsed)) onMenu(e);
          }}
          style={{ fontSize: size }}
          className={`leading-[1.75] ${painting ? "cursor-text select-none" : ""}`}
        >
          {blocks.map((b) =>
            b.clutter || !inFocus(b.at) ? null : (
              <BlockView key={b.at} block={b} {...rangesFor(b, ranges, NONE, NONE, null, NONE)} />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
const NONE: never[] = [];

// "What's missing?": the exam facts the highlights don't cover yet, each with
// the article's words for it, one tap from being a key point.
function MissingBox({
  missing,
  checking,
  onCheck,
  onAdd,
}: {
  missing: MissingCheck | null;
  checking: boolean;
  onCheck: () => void;
  onAdd: (f: MissingFact) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2" data-testid="missing-box">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-semibold">What's missing?</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={checking}
          onClick={onCheck}
        >
          {checking ? "Checking…" : missing ? "Check again" : "Check"}
        </Button>
      </div>
      {!missing && !checking && (
        <p className="mt-1 text-xs text-muted-foreground">
          SAATHI lists the facts an examiner asks for that your highlights don't cover, and where
          the article says them. One AI check.
        </p>
      )}
      {missing && (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">Story type: {missing.typeLabel}</p>
          {missing.missing.length === 0 ? (
            <p className="mt-1 text-xs">Nothing important is missing.</p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {missing.missing.map((f) => (
                <li key={f.slot} className="text-xs">
                  <div className="font-medium first-letter:uppercase">{f.label}</div>
                  {f.quote ? (
                    <div className="mt-0.5 flex items-start gap-2">
                      <span className="min-w-0 flex-1 italic text-muted-foreground">
                        “{f.quote}”
                      </span>
                      <Button
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => onAdd(f)}
                      >
                        Add
                      </Button>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Not in this article</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function HighlightJump({ onStep }: { onStep: (d: 1 | -1) => void }) {
  const cls = "grid h-7 w-7 place-items-center rounded-full border border-border bg-background";
  return (
    <>
      <button
        type="button"
        aria-label="Previous highlight"
        className={cls}
        onClick={() => onStep(-1)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Next highlight" className={cls} onClick={() => onStep(1)}>
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

// Margin notes the editor often writes, one tap away.
const QUICK_NOTES = [
  "Use this in the headline",
  "Make the MCQ on this",
  "Ask the Mains question on this",
  "Keep the exact words",
  "Use in “Exam Angle”",
];

// A highlight's actions: its pen, a margin note for SAATHI, removing it.
function MarkSheet({
  mark,
  words,
  text: source,
  onTrim,
  onSplit,
  onUnjoin,
  onClose,
  onPen,
  onNote,
  onRemove,
}: {
  mark: Mark;
  // The highlight's words in the source, for Trim and Split (null when not
  // possible here).
  words: Span[] | null;
  text: string;
  onTrim: (span: Span) => void;
  onSplit: (at: number) => void;
  onUnjoin: () => void;
  onClose: () => void;
  onPen: (pen: Pen) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(mark.note ?? "");
  const [shape, setShape] = useState<"trim" | "split" | null>(null);
  const [range, setRange] = useState<[number, number]>([0, (words?.length ?? 1) - 1]);
  const [cut, setCut] = useState<number | null>(null);
  const joined = mark.quote.includes(QUOTE_JOIN);
  const word = (i: number) => (words ? source.slice(words[i][0], words[i][1]) : "");
  // The word tapped becomes the nearer end of the kept words (outside them,
  // the end moves out to it; inside, in to it).
  const pickTrim = (i: number) =>
    setRange(([a, b]) => (i < a ? [i, b] : i > b ? [a, i] : i - a <= b - i ? [i, b] : [a, i]));
  // Lifting the finger after a long press clicks where it was; that click
  // must not land on the backdrop and close the sheet at once.
  const openedAt = useRef(Date.now());
  return (
    <>
      <div
        className="absolute inset-0 z-40 bg-black/30"
        onClick={() => Date.now() - openedAt.current > 500 && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Highlight actions"
        className="absolute inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-background p-4 shadow-2xl lg:bottom-20 lg:left-auto lg:right-4 lg:w-96 lg:rounded-2xl lg:border"
      >
        <div className="mb-3 flex items-start gap-2">
          <p className="line-clamp-3 min-w-0 flex-1 text-sm">“{mark.quote}”</p>
          <button type="button" aria-label="Close" onClick={onClose} className="shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Pen">
          {PENS.map((p) => (
            <button
              key={p.pen}
              type="button"
              aria-pressed={mark.pen === p.pen}
              onClick={() => onPen(p.pen)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${mark.pen === p.pen ? "border-foreground/50 bg-muted" : "border-border"}`}
            >
              <span className={`h-3 w-3 rounded-full ${p.dot}`} />
              {p.label}
            </button>
          ))}
        </div>
        {joined ? (
          <Button variant="outline" className="mb-3 w-full" onClick={onUnjoin}>
            <Link2 className="mr-1 h-4 w-4" /> Separate the joined parts
          </Button>
        ) : (
          words &&
          words.length > 1 && (
            <div className="mb-3 space-y-2">
              <div className="flex gap-1.5" role="group" aria-label="Change the words">
                <Button
                  size="sm"
                  variant={shape === "trim" ? "secondary" : "outline"}
                  onClick={() => setShape(shape === "trim" ? null : "trim")}
                >
                  <Scissors className="mr-1 h-3.5 w-3.5" /> Trim
                </Button>
                <Button
                  size="sm"
                  variant={shape === "split" ? "secondary" : "outline"}
                  onClick={() => setShape(shape === "split" ? null : "split")}
                >
                  Split in two
                </Button>
              </div>
              {shape && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    {shape === "trim"
                      ? "Tap a word to move the nearer end to it; grey words are left out."
                      : "Tap the word the second highlight starts with."}
                  </p>
                  <div className="flex flex-wrap gap-1" data-testid="mark-words">
                    {words.map((_, i) => {
                      const kept = shape === "trim" ? i >= range[0] && i <= range[1] : true;
                      const second = shape === "split" && cut !== null && i >= cut;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            shape === "trim" ? pickTrim(i) : setCut(i === 0 ? null : i)
                          }
                          className={`rounded-md border px-1.5 py-0.5 text-sm ${kept ? "border-border bg-background" : "border-dashed border-border bg-muted/40 text-muted-foreground line-through"} ${second ? "border-primary bg-primary/10" : ""}`}
                        >
                          {word(i)}
                        </button>
                      );
                    })}
                  </div>
                  {shape === "trim" ? (
                    <Button
                      className="w-full"
                      disabled={range[0] === 0 && range[1] === words.length - 1}
                      onClick={() => onTrim([words[range[0]][0], words[range[1]][1]])}
                    >
                      Keep {range[1] - range[0] + 1} of {words.length} words
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={cut === null}
                      onClick={() => cut !== null && onSplit(words[cut][0])}
                    >
                      {cut === null ? "Pick where to split" : `Split before “${word(cut)}”`}
                    </Button>
                  )}
                </>
              )}
            </div>
          )
        )}
        {mark.pen !== "keyword" && (
          <>
            <label htmlFor="mark-note" className="text-xs font-semibold text-muted-foreground">
              Note for SAATHI
            </label>
            <div className="my-1.5 flex flex-wrap gap-1.5">
              {QUICK_NOTES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setText(q)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${text === q ? "border-primary/50 bg-primary/10 text-primary" : "border-border"}`}
                >
                  {q}
                </button>
              ))}
            </div>
            <Textarea
              id="mark-note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="How should SAATHI use this?"
              className="text-sm"
            />
            <Button className="mt-2 w-full" onClick={() => onNote(text.trim())}>
              {mark.note && !text.trim() ? "Remove note" : "Save note"}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          className="mt-2 w-full text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Eraser className="mr-1 h-4 w-4" /> Remove highlight
        </Button>
      </div>
    </>
  );
}

// The highlights: each with its pen (tap to switch), the note, and the actions.
function Tray({
  marks,
  mode,
  note,
  busy,
  points,
  keywords,
  canAddKeywords,
  newPoints,
  onAddPoints,
  story,
  onNote,
  onCycle,
  onRemove,
  onShow,
  onSubmit,
  onAddKeywords,
  onEdit,
  sourceName,
  jump,
  missing,
  checking,
  onCheckMissing,
  onAddMissing,
  pointsPreview,
  onPreviewChange,
  onConfirmPoints,
  onMove,
  onJoin,
  canJoin,
  suggestCount,
  suggesting,
  onSuggest,
  onAcceptSuggested,
  onClearSuggested,
}: {
  // The new key points SAATHI wrote, shown before they are added.
  pointsPreview: { quote: string; point: Bi }[] | null;
  onPreviewChange: (p: { quote: string; point: Bi }[] | null) => void;
  onConfirmPoints: () => void;
  // Points are written in the list's order.
  onMove: (i: number, d: 1 | -1) => void;
  onJoin: (ids: number[]) => void;
  canJoin: (ids: number[]) => boolean;
  // "Suggest facts": SAATHI's picks in the article, dotted until tapped.
  suggestCount: number;
  suggesting: boolean;
  onSuggest?: () => void;
  onAcceptSuggested: () => void;
  onClearSuggested: () => void;
  marks: Mark[];
  mode: Mode;
  note: string;
  busy: boolean;
  points: number;
  keywords: number;
  canAddKeywords: boolean;
  // Key points not yet in the story, which can be added without a rewrite.
  newPoints: number;
  onAddPoints?: () => void;
  story: CaItem | null;
  onNote: (v: string) => void;
  onCycle: (i: number) => void;
  onRemove: (i: number) => void;
  onShow: (m: Mark) => void;
  onSubmit: () => void;
  onAddKeywords: () => void;
  onEdit: (i: number) => void;
  // The source a highlight is from, when it isn't the one being read.
  sourceName: (id: string) => string | null;
  // Previous / next highlight buttons, on wide screens.
  jump: React.ReactNode;
  // "What's missing?": undefined when not offered (new story mode).
  missing: MissingCheck | null | undefined;
  checking: boolean;
  onCheckMissing: () => void;
  onAddMissing: (f: MissingFact) => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const pickedIds = [...picked].filter((i) => i < marks.length);
  useEffect(() => setPicked(new Set()), [marks.length]);
  if (pointsPreview)
    return (
      <div className="space-y-3 p-3" data-testid="points-preview">
        <div>
          <div className="text-sm font-semibold">New key points</div>
          <p className="text-xs text-muted-foreground">
            What SAATHI wrote from your highlights. Change any line, then add them.
          </p>
        </div>
        {pointsPreview.map((x, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border border-border bg-background p-2">
            <p className="line-clamp-2 text-[11px] italic text-muted-foreground">“{x.quote}”</p>
            <Textarea
              lang="hi"
              aria-label={`Point ${i + 1} in Hindi`}
              rows={2}
              value={x.point.hi}
              onChange={(e) =>
                onPreviewChange(
                  pointsPreview.map((y, j) =>
                    j === i ? { ...y, point: { ...y.point, hi: e.target.value } } : y,
                  ),
                )
              }
              className="min-h-0 text-sm"
            />
            <Textarea
              aria-label={`Point ${i + 1} in English`}
              rows={2}
              value={x.point.en}
              onChange={(e) =>
                onPreviewChange(
                  pointsPreview.map((y, j) =>
                    j === i ? { ...y, point: { ...y.point, en: e.target.value } } : y,
                  ),
                )
              }
              className="min-h-0 text-sm"
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            disabled={busy}
            onClick={() => onPreviewChange(null)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={busy || pointsPreview.some((x) => !x.point.en.trim() || !x.point.hi.trim())}
            onClick={onConfirmPoints}
          >
            {busy
              ? "Adding…"
              : `Add ${pointsPreview.length} point${pointsPreview.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="space-y-3 p-3">
      {jump && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="flex-1">Jump between highlights</span>
          {jump}
        </div>
      )}
      {missing !== undefined && (
        <MissingBox
          missing={missing}
          checking={checking}
          onCheck={onCheckMissing}
          onAdd={onAddMissing}
        />
      )}
      {onSuggest && (
        <div
          className="rounded-lg border border-border bg-background p-2"
          data-testid="suggest-box"
        >
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm font-semibold">Suggest facts</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={suggesting}
              onClick={onSuggest}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {suggesting ? "Looking…" : suggestCount ? "Again" : "Suggest"}
            </Button>
          </div>
          {suggestCount > 0 ? (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="flex-1 text-muted-foreground">
                {suggestCount} dotted in the article: tap one to keep it
              </span>
              <button
                type="button"
                className="font-medium text-primary"
                onClick={onAcceptSuggested}
              >
                Keep all
              </button>
              <button type="button" className="text-muted-foreground" onClick={onClearSuggested}>
                Clear
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              SAATHI dots the exam facts in this article (numbers, dates, names, firsts). One AI
              request.
            </p>
          )}
        </div>
      )}
      {marks.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Key points are written in this order. Tick two or more to join them into one fact.
        </p>
      )}
      {pickedIds.length > 1 && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!canJoin(pickedIds)}
          title={canJoin(pickedIds) ? undefined : "Pick highlights from the same source"}
          onClick={() => {
            onJoin(pickedIds);
            setPicked(new Set());
          }}
        >
          <Link2 className="mr-1 h-4 w-4" /> Join {pickedIds.length} into one fact
        </Button>
      )}
      <ul className="space-y-1.5" data-testid="highlight-list">
        {marks.map((m, i) => (
          <li key={`${m.source_id}-${m.quote}-${i}`} className="flex items-start gap-2 text-xs">
            {marks.length > 1 && (
              <input
                type="checkbox"
                aria-label={`Pick highlight ${i + 1} to join`}
                checked={picked.has(i)}
                onChange={(e) =>
                  setPicked((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-primary"
              />
            )}
            <button
              type="button"
              onClick={() => onCycle(i)}
              title="Tap to switch pen"
              className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${PEN[m.pen].dot}`} />
              {PEN[m.pen].label}
            </button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onShow(m)} className="line-clamp-2 text-left">
                {m.quote.includes(QUOTE_JOIN) && <Link2 className="mr-1 inline h-3 w-3" />}
                {m.quote}
              </button>
              {sourceName(m.source_id) && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  from {sourceName(m.source_id)}
                </div>
              )}
              {m.note && (
                <div className="mt-0.5 flex items-start gap-1 italic text-primary">
                  <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> {m.note}
                </div>
              )}
            </div>
            {marks.length > 1 && (
              <span className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label={`Move highlight ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Move highlight ${i + 1} down`}
                  disabled={i === marks.length - 1}
                  onClick={() => onMove(i, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            <button
              type="button"
              aria-label="Edit highlight"
              onClick={() => onEdit(i)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Remove highlight"
              onClick={() => onRemove(i)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {marks.length === 0 && (
          <li className="text-xs text-muted-foreground">
            Nothing highlighted yet. Pick a pen below and tap a sentence.
          </li>
        )}
      </ul>
      <Textarea
        value={note}
        onChange={(e) => onNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Note for SAATHI (optional), e.g. focus on the Rajasthan angle"
        className="min-h-[44px] resize-none text-sm"
      />
      <Button className="w-full" disabled={busy || points === 0} onClick={onSubmit}>
        {busy
          ? "Writing…"
          : mode === "rewrite"
            ? `Rewrite story from ${points} key point${points === 1 ? "" : "s"}`
            : `Create new story from ${points} key point${points === 1 ? "" : "s"}`}
      </Button>
      {newPoints > 0 && onAddPoints && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={onAddPoints}>
          <Plus className="mr-1 h-4 w-4" />
          {busy ? (
            "Writing…"
          ) : (
            <>
              Only add {Math.min(newPoints, ADD_POINTS_MAX)} new key point
              {Math.min(newPoints, ADD_POINTS_MAX) === 1 ? "" : "s"} · see them first
            </>
          )}
        </Button>
      )}
      {keywords > 0 && canAddKeywords && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={onAddKeywords}>
          Only add {keywords} keyword{keywords === 1 ? "" : "s"} to Static Context
        </Button>
      )}
      {story?.content && (
        <div className="rounded-lg border border-border bg-background p-2 text-xs">
          <div className="mb-1 font-semibold text-muted-foreground">This story now</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {story.content.points.map((p, i) => (
              <li key={i}>{p.en || p.hi}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The marks that fall in a block, with a key so unchanged blocks skip
// re-rendering while a highlight is painted elsewhere.
function rangesFor(
  b: Block,
  ranges: Range[],
  taken: Span[],
  found: Found[],
  flash: number | null,
  suggest: Span[] = [],
) {
  const span: Span = [b.at, b.end];
  const mine = ranges.filter((r) => overlaps(r.span, span));
  const faint = taken.filter((t) => overlaps(t, span));
  const finds = found.filter((f) => overlaps(f.span, span));
  const sugg = suggest.filter((t) => overlaps(t, span));
  const lit = flash !== null && mine.some((r) => r.span[0] === flash) ? flash : null;
  return {
    ranges: mine,
    taken: faint,
    found: finds,
    flash: lit,
    suggest: sugg,
    marksKey: [
      ...mine.map(
        (r) => `${r.pen}${r.preview ? "~" : ""}${r.note ? "n" : ""}${r.joined ? "j" : ""}${r.span}`,
      ),
      ...faint,
      ...finds.map((f) => `${f.current ? "!" : "?"}${f.span}`),
      ...sugg.map((x) => `s${x}`),
      lit ?? "",
    ].join("|"),
  };
}

const BlockView = memo(
  function BlockView({
    block: b,
    ranges,
    taken,
    found,
    flash,
    suggest,
    dim,
  }: {
    block: Block;
    ranges: Range[];
    taken: Span[];
    found: Found[];
    flash: number | null;
    suggest: Span[];
    // Reading focus: paragraphs other than the one being read are dimmed.
    dim?: boolean;
    marksKey: string;
  }) {
    const runs = (rs: Run[]) =>
      rs.map((r, i) =>
        r.at < 0 ? (
          <span key={i}> </span>
        ) : (
          <Pieces
            key={i}
            run={r}
            ranges={ranges}
            taken={taken}
            found={found}
            flash={flash}
            suggest={suggest}
          />
        ),
      );
    const body = render();
    return dim ? <div className="opacity-35 transition-opacity">{body}</div> : body;
    function render() {
      switch (b.kind) {
        case "heading":
          return (
            <div
              data-at={b.at}
              role="heading"
              aria-level={b.level + 1}
              className={
                b.level === 1
                  ? "mb-2 mt-4 text-[1.3em] font-bold leading-snug"
                  : b.level === 2
                    ? "mb-1.5 mt-4 text-[1.15em] font-semibold leading-snug"
                    : "mb-1 mt-3 font-semibold"
              }
            >
              {runs(b.runs)}
            </div>
          );
        case "para":
          return (
            <p data-at={b.at} className="my-3">
              {runs(b.runs)}
            </p>
          );
        case "item":
          return (
            <div data-at={b.at} className="my-1.5 flex gap-2">
              <span className="shrink-0 text-muted-foreground">{b.marker}</span>
              <div className="min-w-0">{runs(b.runs)}</div>
            </div>
          );
        case "quote":
          return (
            <blockquote
              data-at={b.at}
              className="my-3 border-l-4 border-border pl-3 italic text-muted-foreground"
            >
              {runs(b.runs)}
            </blockquote>
          );
        case "table":
          return (
            <div data-at={b.at} className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[0.9em]">
                <tbody>
                  {b.rows.map((row, i) => (
                    <tr key={i} className={i === 0 ? "bg-muted/60 font-semibold" : ""}>
                      {row.map((cell, j) => (
                        <td key={j} className="border border-border px-2 py-1 align-top">
                          {runs(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        case "page":
          return (
            <div
              data-at={b.at}
              className="my-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <span className="h-px flex-1 bg-border" /> Page {b.n}{" "}
              <span className="h-px flex-1 bg-border" />
            </div>
          );
        default:
          return <hr data-at={b.at} className="my-4 border-border" />;
      }
    }
  },
  (a, b) => a.block === b.block && a.marksKey === b.marksKey && a.dim === b.dim,
);

// Numbers, amounts, percentages and dates, faintly underlined so the exam
// details stand out.
const NUMBER_RE =
  /(?:₹|Rs\.?|रु\.?)\s?\d[\d,.]*(?:\s?(?:crore|lakh|million|billion|करोड़|लाख))?|\d[\d,.]*\s?(?:%|per cent|percent|प्रतिशत|crore|lakh|million|billion|करोड़|लाख|km|किमी|MW|GW|hectares?|हेक्टेयर)?|[०-९][०-९,.]*/giu;

// Numbers underlined without touching the article's markup (a finger on a
// word must stay on the same node while a highlight is painted): the CSS
// Custom Highlight API marks their text ranges. Browsers without it show no
// underline.
function useNumberUnderline(root: HTMLElement | null, on: boolean, deps: unknown[]) {
  useLayoutEffect(() => {
    if (typeof Highlight === "undefined" || typeof CSS === "undefined" || !CSS.highlights) return;
    const reg = CSS.highlights;
    const name = "reader-num";
    if (!on || !root) {
      reg.delete(name);
      return;
    }
    const ranges: globalThis.Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent ?? "";
      for (const m of t.matchAll(NUMBER_RE)) {
        const w = m[0].trimEnd();
        if (!/\d|[०-९]/.test(w)) continue;
        const r = document.createRange();
        r.setStart(n, m.index!);
        r.setEnd(n, m.index! + w.length);
        ranges.push(r);
      }
    }
    reg.set(name, new Highlight(...ranges));
    return () => {
      reg.delete(name);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, on, ...deps]);
}
const NUMBER_CSS =
  "::highlight(reader-num){text-decoration:underline dotted 2px;text-decoration-color:rgb(124 58 237 / .5);text-underline-offset:5px}";

// One run of text cut where highlights start and end. Every piece carries
// its raw offset, so a touch can be turned back into a position.
function Pieces({
  run,
  ranges,
  taken,
  found = [],
  flash = null,
  suggest = [],
}: {
  run: Run;
  ranges: Range[];
  taken: Span[];
  found?: Found[];
  flash?: number | null;
  // SAATHI's suggested facts, dotted until tapped.
  suggest?: Span[];
}) {
  const span: Span = [run.at, run.at + run.text.length];
  const inside = ranges.filter((r) => overlaps(r.span, span));
  const faint = taken.filter((t) => overlaps(t, span));
  const finds = found.filter((f) => overlaps(f.span, span));
  const sugg = suggest.filter((t) => overlaps(t, span));
  const cuts = [
    ...new Set([
      span[0],
      span[1],
      ...[...inside.map((r) => r.span), ...faint, ...finds.map((f) => f.span), ...sugg]
        .flat()
        .filter((x) => x > span[0] && x < span[1]),
    ]),
  ].sort((a, b) => a - b);
  const cls = run.bold ? "font-semibold" : "";
  return (
    <>
      {cuts.slice(0, -1).map((a, k) => {
        const b = cuts[k + 1];
        const text = run.text.slice(a - run.at, b - run.at);
        // The latest mark wins where two overlap; a painting preview on top.
        const mark = [...inside].reverse().find((r) => r.span[0] <= a && r.span[1] >= b);
        const dim = !mark && faint.some((t) => t[0] <= a && t[1] >= b);
        const hit = finds.find((f) => f.span[0] <= a && f.span[1] >= b);
        const sug = !mark && sugg.some((t) => t[0] <= a && t[1] >= b);
        const findCls = hit
          ? hit.current
            ? "rounded-sm bg-orange-300/80 outline outline-2 outline-orange-500 dark:bg-orange-500/50"
            : "underline decoration-orange-500 decoration-2 underline-offset-4"
          : "";
        const findAttr = hit?.current && hit.span[0] === a ? { "data-find-current": "" } : {};
        if (!mark) {
          return (
            <span
              key={k}
              data-raw={a}
              {...findAttr}
              {...(sug ? { "data-suggest": "" } : {})}
              className={`${cls} ${findCls} ${dim ? "text-muted-foreground/60 underline decoration-dotted" : ""} ${sug ? "rounded-sm outline-dotted outline-2 outline-offset-1 outline-primary/70" : ""}`}
            >
              {text}
            </span>
          );
        }
        const first = mark.span[0] === a;
        const last = mark.span[1] === b;
        return (
          <Fragment key={k}>
            <mark
              data-raw={a}
              data-pen={mark.pen}
              {...(first && !mark.preview ? { "data-mark-start": a } : {})}
              {...(last && !mark.preview ? { "data-mark-end": b } : {})}
              {...findAttr}
              className={`text-inherit [box-decoration-break:clone] ${first ? "rounded-l-sm pl-0.5" : ""} ${last ? "rounded-r-sm pr-0.5" : ""} ${PEN[mark.pen].mark} ${mark.preview ? "outline-dashed outline-1 outline-foreground/40" : ""} ${mark.joined ? "underline decoration-foreground/40 decoration-wavy underline-offset-4" : ""} ${flash === mark.span[0] ? "ring-2 ring-primary" : ""} ${findCls} ${cls}`}
            >
              {text}
            </mark>
            {last && mark.joined && (
              <sup
                className="ml-0.5 select-none text-[0.7em] text-muted-foreground"
                title="Part of one fact joined from several places"
              >
                ⛓
              </sup>
            )}
            {last && mark.note && (
              <sup
                className="ml-0.5 select-none text-[0.7em] text-primary"
                title={mark.note}
                aria-label={`Note: ${mark.note}`}
              >
                ✎
              </sup>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
