// Admin: the full source of a story, to highlight the facts it should have,
// like marking up a printout. The article opens full screen in a clean view
// (headings, paragraphs, lists and tables; website clutter hidden), with a
// toolbar of pens at the bottom:
//   yellow = key point, blue = summary only, pink = key point to check,
//   green = Static Connect keyword, and an eraser.
// In Highlight mode a tap marks the whole sentence; press and hold (or drag
// with a mouse) to paint just some words. Holding a highlight (or tapping it
// in Read mode, or right-clicking it) opens its actions: change the pen, add
// a margin note for SAATHI ("use this in the headline"), remove it. Read mode
// leaves taps alone and allows normal text selection. A find bar and
// previous / next highlight buttons move around the article. A newspaper page
// (a PDF) is split into its articles and opens on the story's own article,
// with the page's other articles listed and marked by their stories ("No
// story yet" is news the AI skipped). "What's missing?" asks SAATHI which
// exam facts the highlights don't cover and where the article says them.
// Highlights are
// kept as a draft on the device until the story is rewritten or a new story
// is made from them.
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
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
  StickyNote,
  Undo2,
  X,
} from "lucide-react";
import {
  addCaPenKeywords,
  checkCaMissing,
  createCaFromHighlights,
  deleteCaItems,
  getCaReader,
  getCaReaderText,
  getCaSourceReader,
  restoreCaVersion,
  rewriteCaFromHighlights,
  type CaItem,
  type ReaderSource,
} from "@/lib/current-affairs.functions";
import { cleanQuote, findAll, findQuote, sentenceSpans, type Span } from "@/lib/ca-highlight";
import { type MissingCheck, type MissingFact } from "@/lib/ca-missing";
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
type Range = { span: Span; pen: Pen; preview?: boolean; note?: string };
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
    label: "Static Connect keyword",
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

// The raw offset under a screen point, from the piece of text there.
function offsetAt(x: number, y: number): number | null {
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
  if (!el) return null;
  return Number(el.dataset.raw) + (node?.nodeType === Node.TEXT_NODE ? offset : 0);
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
}: {
  // The story whose sources are read; null when reading a source no story
  // uses yet (skipped news), which can only make new stories.
  item: CaItem | null;
  // That source, and the article it opens on (an offset in the whole source).
  origin?: { source_id: string; at: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
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
  const findRef = useRef<HTMLInputElement>(null);
  const focusInit = useRef<Set<string>>(new Set());
  const [missing, setMissing] = useState<MissingCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<Span | null>(null);
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
  // A different tab is a different source: its own articles.
  useEffect(() => {
    setFocus(null);
    setMissing(null);
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
    for (const m of marks) {
      if (m.source_id !== source.id) continue;
      const span = findQuote(part.text, m.quote);
      if (span) out.push({ span, pen: m.pen, note: m.note });
    }
    if (preview && tool !== "eraser") out.push({ span: preview, pen: tool, preview: true });
    return out;
  }, [marks, part, source, preview, tool]);
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
    if (typing || mod || e.altKey || sheet !== null) return;
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
  // Escape closes the innermost thing first: the sheet, the shortcuts, find.
  function onEscape(e: KeyboardEvent) {
    if (sheet !== null) setSheet(null);
    else if (helpOpen) setHelpOpen(false);
    else if (findOpen) {
      setFindOpen(false);
      setQuery("");
    } else return;
    e.preventDefault();
  }

  // ---------- Marking ----------
  const markIndexAt = (offset: number) =>
    marks.findIndex((m) => {
      if (!part || !source || m.source_id !== source.id) return false;
      const s = findQuote(part.text, m.quote);
      return !!s && s[0] <= offset && offset < s[1];
    });

  function addMark(span: Span, pen: Pen) {
    if (!part || !source) return;
    const quote = cleanQuote(plainText(part.text, span[0], span[1]));
    if (quote.length < (pen === "keyword" ? 2 : 8)) {
      toast("Mark a little more text");
      return;
    }
    commit((cur) => [
      // Marks inside the new one are replaced by it.
      ...cur.filter((m) => {
        if (m.source_id !== source.id) return true;
        const s = findQuote(part.text, m.quote);
        return !(s && s[0] >= span[0] && s[1] <= span[1]);
      }),
      { source_id: source.id, quote, pen },
    ]);
  }

  function erase(span: Span) {
    if (!part || !source) return;
    commit((cur) =>
      cur.filter((m) => {
        if (m.source_id !== source.id) return true;
        const s = findQuote(part.text, m.quote);
        return !(s && overlaps(s, span));
      }),
    );
  }

  // A tap: on a highlight it removes it (or recolours it with another pen);
  // elsewhere it highlights the sentence.
  function tapAt(offset: number) {
    if (!part) return;
    const hit = markIndexAt(offset);
    if (hit >= 0) {
      if (tool === "eraser" || marks[hit].pen === tool) {
        commit((cur) => cur.filter((_, i) => i !== hit));
      } else {
        const pen = tool;
        commit((cur) => cur.map((m, i) => (i === hit ? { ...m, pen } : m)));
      }
      return;
    }
    if (tool === "eraser") return;
    const s = sentences.find(([a, b]) => a <= offset && offset < b);
    if (s) addMark(s, tool);
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
    const at = offsetAt(e.clientX, e.clientY);
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
    const at = offsetAt(e.clientX, e.clientY);
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
  }

  // Read mode: a tap on a highlight opens its actions. With a mouse in
  // Highlight mode, a right-click does.
  function onTextClick(e: React.MouseEvent) {
    if (painting) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const at = offsetAt(e.clientX, e.clientY);
    const hit = at === null ? -1 : markIndexAt(at);
    if (hit >= 0) openSheet(hit);
  }
  function onTextMenu(e: React.MouseEvent) {
    if (!painting) return;
    e.preventDefault();
    const at = offsetAt(e.clientX, e.clientY);
    const hit = at === null ? -1 : markIndexAt(at);
    if (hit >= 0) openSheet(hit);
  }

  function onPointerCancel() {
    if (gesture.current) clearTimeout(gesture.current.timer);
    gesture.current = null;
    paintRef.current = null;
    setPreview(null);
  }

  // A finger painting must not scroll the page.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (gesture.current?.paint) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  });

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
        "Rewrite this story from your highlights? Its text, MCQ, Mains question and visual are written again, replacing your edits. Your Static Connect picks stay, and the old version is kept in the story's History.",
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

  async function addKeywordsOnly() {
    setBusy(true);
    try {
      if (!item) return;
      await keywordsFn({ data: { id: item.id, keywords: keywordMarks.map((m) => m.quote) } });
      commit((cur) => cur.filter((m) => m.pen !== "keyword"));
      toast.success("Added to Static Connect");
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add the keywords"));
    } finally {
      setBusy(false);
    }
  }

  const tray = (
    <Tray
      marks={marks}
      mode={mode}
      note={note}
      busy={busy}
      points={points}
      keywords={keywordMarks.length}
      canAddKeywords={mode === "rewrite" && !!item?.content}
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
        if (i >= 0 && i !== tab) setTab(i);
        const s = m.source_id === source.id ? findQuote(part.text, m.quote) : null;
        if (s) scrollToOffset(part.start + s[0]);
        setTrayOpen(false);
      }}
      onSubmit={() => void submit()}
      onAddKeywords={() => void addKeywordsOnly()}
      onEdit={(i) => openSheet(i)}
      missing={(mode === "rewrite" || !item) && source ? missing : undefined}
      checking={checking}
      onCheckMissing={() => void checkWhatsMissing()}
      onAddMissing={addMissing}
      jump={wide && ordered.length > 1 ? <HighlightJump onStep={stepHighlight} /> : null}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        onEscapeKeyDown={onEscape}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        {/* Top bar: hides while scrolling down. */}
        <header
          className={`overflow-hidden border-b border-border bg-background transition-all duration-200 ${headerHidden ? "max-h-0 border-b-0 opacity-0" : "max-h-72"}`}
        >
          <div className="flex items-center gap-1.5 p-2 pr-11">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
              {source?.title ?? "Full article"}
            </DialogTitle>
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
          </div>
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
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          >
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
                    style={{ fontSize: size }}
                    className={`leading-[1.75] ${painting ? "cursor-text select-none [-webkit-touch-callout:none]" : ""}`}
                  >
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
                              {...rangesFor(b, ranges, taken, found, flash)}
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
          {/* Wide screens: highlights beside the article. */}
          {wide && (
            <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20">
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
            mark={marks[sheet]}
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
  ["1 2 3 4", "Pens: key point, summary only, to check, Static Connect"],
  ["E", "Eraser"],
  ["R", "Switch Read / Highlight"],
  ["Ctrl+Z / Ctrl+Y", "Undo / redo"],
  ["F or /", "Find in article"],
  ["J / K", "Next / previous highlight"],
  ["N / P", "Next / previous article"],
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
  "Use in “Why it matters”",
];

// A highlight's actions: its pen, a margin note for SAATHI, removing it.
function MarkSheet({
  mark,
  onClose,
  onPen,
  onNote,
  onRemove,
}: {
  mark: Mark;
  onClose: () => void;
  onPen: (pen: Pen) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(mark.note ?? "");
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
  story,
  onNote,
  onCycle,
  onRemove,
  onShow,
  onSubmit,
  onAddKeywords,
  onEdit,
  jump,
  missing,
  checking,
  onCheckMissing,
  onAddMissing,
}: {
  marks: Mark[];
  mode: Mode;
  note: string;
  busy: boolean;
  points: number;
  keywords: number;
  canAddKeywords: boolean;
  story: CaItem | null;
  onNote: (v: string) => void;
  onCycle: (i: number) => void;
  onRemove: (i: number) => void;
  onShow: (m: Mark) => void;
  onSubmit: () => void;
  onAddKeywords: () => void;
  onEdit: (i: number) => void;
  // Previous / next highlight buttons, on wide screens.
  jump: React.ReactNode;
  // "What's missing?": undefined when not offered (new story mode).
  missing: MissingCheck | null | undefined;
  checking: boolean;
  onCheckMissing: () => void;
  onAddMissing: (f: MissingFact) => void;
}) {
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
      <ul className="space-y-1.5" data-testid="highlight-list">
        {marks.map((m, i) => (
          <li key={`${m.source_id}-${m.quote}-${i}`} className="flex items-start gap-2 text-xs">
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
                {m.quote}
              </button>
              {m.note && (
                <div className="mt-0.5 flex items-start gap-1 italic text-primary">
                  <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> {m.note}
                </div>
              )}
            </div>
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
      {keywords > 0 && canAddKeywords && (
        <Button variant="outline" className="w-full" disabled={busy} onClick={onAddKeywords}>
          Only add {keywords} keyword{keywords === 1 ? "" : "s"} to Static Connect
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
function rangesFor(b: Block, ranges: Range[], taken: Span[], found: Found[], flash: number | null) {
  const span: Span = [b.at, b.end];
  const mine = ranges.filter((r) => overlaps(r.span, span));
  const faint = taken.filter((t) => overlaps(t, span));
  const finds = found.filter((f) => overlaps(f.span, span));
  const lit = flash !== null && mine.some((r) => r.span[0] === flash) ? flash : null;
  return {
    ranges: mine,
    taken: faint,
    found: finds,
    flash: lit,
    marksKey: [
      ...mine.map((r) => `${r.pen}${r.preview ? "~" : ""}${r.note ? "n" : ""}${r.span}`),
      ...faint,
      ...finds.map((f) => `${f.current ? "!" : "?"}${f.span}`),
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
  }: {
    block: Block;
    ranges: Range[];
    taken: Span[];
    found: Found[];
    flash: number | null;
    marksKey: string;
  }) {
    const runs = (rs: Run[]) =>
      rs.map((r, i) =>
        r.at < 0 ? (
          <span key={i}> </span>
        ) : (
          <Pieces key={i} run={r} ranges={ranges} taken={taken} found={found} flash={flash} />
        ),
      );
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
  },
  (a, b) => a.block === b.block && a.marksKey === b.marksKey,
);

// One run of text cut where highlights start and end. Every piece carries
// its raw offset, so a touch can be turned back into a position.
function Pieces({
  run,
  ranges,
  taken,
  found = [],
  flash = null,
}: {
  run: Run;
  ranges: Range[];
  taken: Span[];
  found?: Found[];
  flash?: number | null;
}) {
  const span: Span = [run.at, run.at + run.text.length];
  const inside = ranges.filter((r) => overlaps(r.span, span));
  const faint = taken.filter((t) => overlaps(t, span));
  const finds = found.filter((f) => overlaps(f.span, span));
  const cuts = [
    ...new Set([
      span[0],
      span[1],
      ...[...inside.map((r) => r.span), ...faint, ...finds.map((f) => f.span)]
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
              className={`${cls} ${findCls} ${dim ? "text-muted-foreground/60 underline decoration-dotted" : ""}`}
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
              {...findAttr}
              className={`text-inherit [box-decoration-break:clone] ${first ? "rounded-l-sm pl-0.5" : ""} ${last ? "rounded-r-sm pr-0.5" : ""} ${PEN[mark.pen].mark} ${mark.preview ? "outline-dashed outline-1 outline-foreground/40" : ""} ${flash === mark.span[0] ? "ring-2 ring-primary" : ""} ${findCls} ${cls}`}
            >
              {text}
            </mark>
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
