// A topic's word list: every word its cards use, those Hindi WordNet, the
// house spellings and the editor's own list don't know shown first (rarest
// first: a typo used once or twice hides there). Each one is marked
// correct (for every topic), replaced on its cards, or its cards opened.
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Eye, Replace, Search } from "lucide-react";
import { markFlashWords, replaceFlashText } from "@/lib/flash-studio.functions";
import { frontIsWrong, type FlashCard, type FlashTopic } from "@/lib/flash-studio";
import { replaceWordIn, type TopicWord, type WordStatus } from "@/lib/flash-words";
import { useUndo } from "@/lib/flash-undo";
import { useTopicWords } from "@/lib/flash-topic-words";
import { listFlashTemplates } from "@/lib/flash-studio.functions";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const VIEWS: { id: WordStatus; label: string }[] = [
  { id: "unknown", label: "Not known" },
  { id: "form", label: "Forms of known words" },
  { id: "known", label: "Known" },
];

export function WordsTab({
  topic,
  cards,
  onCards,
  onProof,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  onCards: (c: FlashCard[]) => void;
  // These cards opened one after another in the Cards tab.
  onProof: (ids: string[]) => void;
}) {
  const q = useTopicWords(topic);
  const qc = useQueryClient();
  const markFn = useServerFn(markFlashWords);
  const replaceFn = useServerFn(replaceFlashText);
  const typesFn = useServerFn(listFlashTemplates);
  const types = useQuery({ queryKey: ["flashTemplates"], queryFn: () => typesFn() });
  const wrongFront = frontIsWrong(topic, types.data);
  const undo = useUndo(topic.id, onCards, () => void reread());
  const [view, setView] = useState<WordStatus>("unknown");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(150);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // The word being replaced, and what with.
  const [fixing, setFixing] = useState<{ word: string; to: string } | null>(null);
  const reread = () => qc.invalidateQueries({ queryKey: ["flashTopicWords", topic.id] });
  const words = useMemo(() => q.data?.words ?? [], [q.data]);
  const counts = useMemo(() => {
    const m = { unknown: 0, form: 0, known: 0 } as Record<WordStatus, number>;
    for (const w of words) m[w.status]++;
    return m;
  }, [words]);
  const list = useMemo(() => {
    const t = query.trim();
    return words.filter((w) => w.status === view && (!t || w.word.includes(t)));
  }, [words, view, query]);
  const mark = async (ws: string[]) => {
    setBusy(true);
    try {
      await markFn({ data: { words: ws, ok: true } });
      toast.success(
        ws.length === 1
          ? `“${ws[0]}” marked correct (for every topic)`
          : `${ws.length} words marked correct (for every topic)`,
        {
          action: {
            label: "Undo",
            onClick: async () => {
              await markFn({ data: { words: ws, ok: false } });
              await reread();
            },
          },
        },
      );
      setTicked(new Set());
      await reread();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  const replace = async (w: TopicWord, to: string) => {
    const target = to.normalize("NFC").trim();
    if (!target || target === w.word) return;
    const ids = new Set(w.ids);
    const edits = cards
      .filter((c) => ids.has(c.id) && !c.removed)
      .flatMap((c) =>
        replaceWordIn(c, w.word, target, wrongFront).map((e) => ({ id: c.id, ...e })),
      );
    if (!edits.length) return toast("Nothing to replace: the cards have changed");
    setBusy(true);
    try {
      const r = await replaceFn({ data: { topic_id: topic.id, reverify: false, edits } });
      const changed = new Set(r.cards.map((c) => c.id));
      const before = cards.filter((c) => changed.has(c.id));
      onCards(r.cards);
      setFixing(null);
      undo(
        `“${w.word}” → “${target}” on ${r.changed} card${r.changed === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} skipped: changed meanwhile)` : ""}`,
        { before },
      );
      await reread();
    } catch (e) {
      toast.error(errorText(e, "Couldn't replace it"));
    } finally {
      setBusy(false);
    }
  };
  const tickedHere = list.filter((w) => ticked.has(w.word)).map((w) => w.word);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every word the cards use{wrongFront ? " (not the fronts: they are wrong on purpose)" : ""}.
        A word Hindi WordNet, the house spellings and your own list don&apos;t know is worth a look:
        a typo used once or twice hides there. Mark the right ones correct (for every topic),
        replace the wrong ones, or open their cards.
      </p>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Reading the words…</p>
      ) : q.error ? (
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't read the words")}</p>
      ) : (
        <>
          {!q.data?.wordnet && (
            <p className="rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/20">
              Hindi WordNet isn&apos;t loaded, so most words show as not known: load it on the
              studio&apos;s Dictionary tab first.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Words shown">
              {VIEWS.map((v) => (
                <Button
                  key={v.id}
                  size="sm"
                  variant={view === v.id ? "default" : "outline"}
                  className="h-8"
                  onClick={() => {
                    setView(v.id);
                    setShown(150);
                  }}
                >
                  {v.label} {counts[v.id]}
                </Button>
              ))}
            </div>
            <label className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Find a word"
                lang="hi"
                className="h-8 w-48 pl-7"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a word"
              />
            </label>
          </div>
          {view === "unknown" && list.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  aria-label="Tick all shown"
                  checked={
                    tickedHere.length > 0 && tickedHere.length === list.slice(0, shown).length
                  }
                  onChange={(e) =>
                    setTicked(
                      new Set(e.target.checked ? list.slice(0, shown).map((w) => w.word) : []),
                    )
                  }
                />
                Tick all shown
              </label>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy || !tickedHere.length}
                onClick={() => void mark(tickedHere)}
              >
                <Check className="mr-1 h-4 w-4" /> Mark correct ({tickedHere.length})
              </Button>
            </div>
          )}
          {!list.length ? (
            <p className="text-sm text-muted-foreground">
              {view === "unknown" ? "Every word is known." : "None."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {list.slice(0, shown).map((w) => (
                <li
                  key={w.word}
                  data-word={w.word}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  {w.status === "unknown" && (
                    <input
                      type="checkbox"
                      aria-label={`Tick ${w.word}`}
                      checked={ticked.has(w.word)}
                      onChange={(e) => {
                        const n = new Set(ticked);
                        if (e.target.checked) n.add(w.word);
                        else n.delete(w.word);
                        setTicked(n);
                      }}
                    />
                  )}
                  <span className="font-medium" lang="hi">
                    {w.word}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {w.count} card{w.count === 1 ? "" : "s"}
                    {w.why ? ` · ${w.why}` : ""}
                  </span>
                  {w.near.map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant="outline"
                      className="h-7 border-amber-300 text-xs"
                      lang="hi"
                      disabled={busy}
                      title={`Replace “${w.word}” with “${n}” on its cards`}
                      onClick={() => void replace(w, n)}
                    >
                      → {n}
                    </Button>
                  ))}
                  {w.status === "unknown" && (
                    <span className="ml-auto flex flex-wrap items-center gap-1">
                      {fixing?.word === w.word ? (
                        <>
                          <Input
                            aria-label={`Replace ${w.word} with`}
                            lang="hi"
                            className="h-7 w-36"
                            autoFocus
                            value={fixing.to}
                            onChange={(e) => setFixing({ word: w.word, to: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void replace(w, fixing.to);
                              if (e.key === "Escape") setFixing(null);
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-7"
                            disabled={busy || !fixing.to.trim()}
                            onClick={() => void replace(w, fixing.to)}
                          >
                            Replace
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => setFixing({ word: w.word, to: w.near[0] ?? w.word })}
                        >
                          <Replace className="mr-1 h-3.5 w-3.5" /> Replace…
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={busy}
                        onClick={() => void mark([w.word])}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Correct
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => onProof(w.ids)}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" /> Cards
                      </Button>
                    </span>
                  )}
                  {w.status !== "unknown" && w.why === "your list" && (
                    <span className="ml-auto">
                      <Badge tone="good">your list</Badge>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {list.length > shown && (
            <Button variant="outline" size="sm" onClick={() => setShown(shown + 300)}>
              Show more ({list.length - shown} left)
            </Button>
          )}
        </>
      )}
    </div>
  );
}
