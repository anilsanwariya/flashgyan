// Admin: the full source of a story, to highlight the facts it should have.
// Tap a sentence to highlight it (tap again to remove), or select words and
// press "Add selected words". Each highlight is a key point or only guides
// the summary and "why it matters". The story is then rewritten from the
// highlights, or the highlights become a new story (news the AI skipped).
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ExternalLink, Highlighter, Plus, X } from "lucide-react";
import {
  createCaFromHighlights,
  getCaReader,
  getCaReaderText,
  rewriteCaFromHighlights,
  type CaItem,
  type ReaderSource,
} from "@/lib/current-affairs.functions";
import {
  cleanQuote,
  findQuote,
  sentenceSpans,
  type Highlight,
  type Span,
} from "@/lib/ca-highlight";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Mode = "rewrite" | "new";
// What part of each source is loaded.
type Loaded = { text: string; start: number; total: number };

const overlaps = (a: Span, b: Span) => a[0] < b[1] && a[1] > b[0];

function storyHighlights(item: CaItem): Highlight[] {
  return [
    ...item.facts.map((f) => ({ source_id: f.source_id, quote: f.quote, point: true })),
    ...(item.content?.context_facts ?? []).map((f) => ({
      source_id: f.source_id,
      quote: f.quote,
      point: false,
    })),
  ];
}

export function SourceReader({
  item,
  open,
  onOpenChange,
  onChanged,
}: {
  item: CaItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const readerFn = useServerFn(getCaReader);
  const moreFn = useServerFn(getCaReaderText);
  const rewriteFn = useServerFn(rewriteCaFromHighlights);
  const createFn = useServerFn(createCaFromHighlights);
  const q = useQuery({
    queryKey: ["caReader", item.id],
    queryFn: () => readerFn({ data: { id: item.id } }),
    enabled: open,
    staleTime: 60_000,
  });

  const [mode, setMode] = useState<Mode>("rewrite");
  const [tab, setTab] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [highlights, setHighlights] = useState<Highlight[]>(() => storyHighlights(item));
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A fresh start each time the reader opens.
  useEffect(() => {
    if (!open) return;
    setMode("rewrite");
    setHighlights(storyHighlights(item));
    setNote("");
    setTab(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);
  useEffect(() => {
    if (!q.data) return;
    setLoaded(
      Object.fromEntries(
        q.data.map((s) => [s.id, { text: s.text, start: s.start, total: s.total }]),
      ),
    );
  }, [q.data]);

  // Words selected inside the text, for "Add selected words".
  useEffect(() => {
    if (!open) return;
    const onSelect = () => {
      const sel = window.getSelection();
      const inside = sel && !sel.isCollapsed && bodyRef.current?.contains(sel.anchorNode ?? null);
      const text = inside ? cleanQuote(sel!.toString()) : "";
      setSelected(text.length >= 8 ? text : "");
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [open]);

  const sources = q.data ?? [];
  const source: ReaderSource | undefined = sources[Math.min(tab, sources.length - 1)];
  const part = source ? loaded[source.id] : undefined;
  const storyQuotes = useMemo(() => storyHighlights(item), [item]);

  const ranges = useMemo(() => {
    if (!part || !source) return [];
    return highlights
      .map((h, i) => ({
        i,
        point: h.point,
        span: h.source_id === source.id ? findQuote(part.text, h.quote) : null,
      }))
      .filter((r): r is { i: number; point: boolean; span: Span } => !!r.span);
  }, [highlights, part, source]);
  // In "new story" mode the story's own facts are shown faintly.
  const taken = useMemo(() => {
    if (mode !== "new" || !part || !source) return [];
    return storyQuotes
      .filter((h) => h.source_id === source.id)
      .map((h) => findQuote(part.text, h.quote))
      .filter((s): s is Span => !!s);
  }, [mode, part, source, storyQuotes]);
  const sentences = useMemo(() => (part ? sentenceSpans(part.text) : []), [part]);

  function switchMode(next: Mode) {
    setMode(next);
    setHighlights(next === "new" ? [] : storyHighlights(item));
  }

  function toggleSentence(s: Span) {
    if (!part || !source) return;
    // A long press that selected words is not a tap.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const hit = ranges.filter((r) => overlaps(r.span, s)).map((r) => r.i);
    if (hit.length) {
      setHighlights((cur) => cur.filter((_, i) => !hit.includes(i)));
      return;
    }
    const quote = cleanQuote(part.text.slice(s[0], s[1]));
    if (quote.length < 8) return;
    setHighlights((cur) => [...cur, { source_id: source.id, quote, point: true }]);
  }

  function addSelection() {
    if (!source || !selected) return;
    setHighlights((cur) =>
      cur.some((h) => h.source_id === source.id && h.quote === selected)
        ? cur
        : [...cur, { source_id: source.id, quote: selected, point: true }],
    );
    window.getSelection()?.removeAllRanges();
    setSelected("");
  }

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

  async function submit() {
    if (!highlights.some((h) => h.point)) {
      toast.error("Mark at least one highlight as a key point.");
      return;
    }
    if (
      mode === "rewrite" &&
      item.content &&
      !confirm(
        "Rewrite this story from your highlights? Its text, MCQ, Mains question and visual are written again, replacing your edits. Your Static Connect picks stay.",
      )
    )
      return;
    setBusy(true);
    try {
      const data = { highlights, note: note.trim() || null };
      if (mode === "rewrite") await rewriteFn({ data: { id: item.id, ...data } });
      else await createFn({ data: { from_id: item.id, ...data } });
      toast.success(mode === "rewrite" ? "Story rewritten" : "New story added after this one");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write the story"));
    } finally {
      setBusy(false);
    }
  }

  const points = highlights.filter((h) => h.point).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex h-[92dvh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="space-y-2 border-b border-border p-3 text-left">
          <DialogTitle className="pr-8 text-base">Read the full article</DialogTitle>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mode">
            {(
              [
                ["rewrite", "Rewrite this story"],
                ["new", "New story from highlights"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                disabled={busy}
                onClick={() => switchMode(m)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${mode === m ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {sources.length > 1 && (
            <div className="flex gap-1 overflow-x-auto" role="tablist">
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
          <p className="text-xs text-muted-foreground">
            {mode === "rewrite"
              ? "Tap a sentence to highlight it, tap again to remove it. To take only some words, select them and press “Add selected words”."
              : "Highlight the facts of news this story leaves out; they become a new story placed after this one. Faint lines are already in this story."}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading the article…</p>}
          {q.isError && (
            <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>
          )}
          {source && part && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{source.title}</span>
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
                ref={bodyRef}
                data-testid="reader-text"
                className="whitespace-pre-wrap text-[15px] leading-relaxed sm:text-sm"
              >
                <ReaderText
                  text={part.text}
                  sentences={sentences}
                  ranges={ranges}
                  taken={taken}
                  onTap={toggleSentence}
                />
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
          {q.data && sources.length === 0 && (
            <p className="text-sm text-muted-foreground">This story has no source text to read.</p>
          )}
        </div>

        <div className="space-y-2 border-t border-border bg-muted/30 p-3">
          {selected && (
            <Button size="sm" className="w-full" onClick={addSelection}>
              <Plus className="mr-1 h-4 w-4" /> Add selected words
            </Button>
          )}
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="flex w-full items-center gap-1 text-sm font-medium"
            aria-expanded={listOpen}
          >
            <Highlighter className="h-4 w-4 text-amber-600" />
            Your highlights ({highlights.length}) · {points} key point{points === 1 ? "" : "s"}
            <ChevronDown
              className={`ml-auto h-4 w-4 transition-transform ${listOpen ? "rotate-180" : ""}`}
            />
          </button>
          {listOpen && (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto" data-testid="highlight-list">
              {highlights.map((h, i) => {
                const inText = part && source?.id === h.source_id;
                const missing = inText && !findQuote(part!.text, h.quote);
                return (
                  <li key={`${h.source_id}-${h.quote}`} className="flex items-start gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setHighlights((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, point: !x.point } : x)),
                        )
                      }
                      className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${h.point ? "bg-amber-500/20 text-amber-800 dark:text-amber-300" : "bg-sky-500/15 text-sky-800 dark:text-sky-300"}`}
                      title="Tap to switch"
                    >
                      {h.point ? "Key point" : "Summary only"}
                    </button>
                    <span className="line-clamp-2 min-w-0 flex-1">
                      {h.quote}
                      {missing && <span className="text-amber-700"> (not in the text shown)</span>}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove highlight"
                      onClick={() => setHighlights((cur) => cur.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
              {highlights.length === 0 && (
                <li className="text-xs text-muted-foreground">Nothing highlighted yet.</li>
              )}
            </ul>
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={1}
            placeholder="Note for SAATHI (optional), e.g. focus on the Rajasthan angle"
            className="min-h-[40px] resize-none text-sm"
          />
          <Button className="w-full" disabled={busy || points === 0} onClick={() => void submit()}>
            {busy
              ? "Writing…"
              : mode === "rewrite"
                ? `Rewrite story from ${highlights.length} highlight${highlights.length === 1 ? "" : "s"}`
                : `Create new story from ${highlights.length} highlight${highlights.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// The text as tappable sentences, with highlights marked: yellow for key
// points, blue for summary-only, faint for facts already in the story.
function ReaderText({
  text,
  sentences,
  ranges,
  taken,
  onTap,
}: {
  text: string;
  sentences: Span[];
  ranges: { point: boolean; span: Span }[];
  taken: Span[];
  onTap: (s: Span) => void;
}) {
  const out: React.ReactNode[] = [];
  let at = 0;
  sentences.forEach((s, n) => {
    if (s[0] > at) out.push(text.slice(at, s[0]));
    const inside = ranges.filter((r) => overlaps(r.span, s));
    const faint = taken.some((t) => overlaps(t, s));
    // Cut the sentence where highlights start and end.
    const cuts = [
      ...new Set([
        s[0],
        s[1],
        ...inside.flatMap((r) => r.span).filter((x) => x > s[0] && x < s[1]),
      ]),
    ].sort((a, b) => a - b);
    const pieces = cuts.slice(0, -1).map((a, k) => {
      const b = cuts[k + 1];
      const mark = inside.find((r) => r.span[0] <= a && r.span[1] >= b);
      return mark ? (
        <mark
          key={k}
          className={`rounded-sm px-0.5 text-inherit [box-decoration-break:clone] ${mark.point ? "bg-amber-300/60 dark:bg-amber-500/40" : "bg-sky-300/50 dark:bg-sky-500/30"}`}
        >
          {text.slice(a, b)}
        </mark>
      ) : (
        <span key={k}>{text.slice(a, b)}</span>
      );
    });
    out.push(
      <span
        key={`s${n}`}
        role="button"
        tabIndex={0}
        data-highlighted={inside.length > 0 || undefined}
        onClick={() => onTap(s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap(s);
          }
        }}
        className={`cursor-pointer rounded-sm hover:bg-muted/60 ${faint && !inside.length ? "text-muted-foreground/60 underline decoration-dotted" : ""}`}
      >
        {pieces}
      </span>,
    );
    at = s[1];
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}
