// The card studio's proofreading tools: the same word from several books
// merged (one group at a time or all at once), a card's other books'
// versions and its answer combined from them as chips, and the AI's help
// over many cards: empty explanations filled (its own knowledge marked)
// and the check (it only flags).
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Combine, Pause, ScanSearch, Sparkles, Split } from "lucide-react";
import {
  checkFlashCards,
  fillFlashExplanations,
  mergeAllFlashCards,
  mergeFlashCards,
  splitFlashVariant,
} from "@/lib/flash-studio.functions";
import {
  backFromChips,
  combineItems,
  emptyColumns,
  groupDuplicates,
  isList,
  mainOf,
  versionsOf,
  type DupGroup,
} from "@/lib/flash-merge";
import type { FlashCard, FlashTopic } from "@/lib/flash-studio";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BookChip = ({ topic, book }: { topic: FlashTopic; book: string }) => (
  <span
    className="rounded px-1.5 text-[11px] text-slate-800"
    style={{ background: topic.books.find((b) => b.code === book)?.color ?? "#e5e7eb" }}
  >
    {book || "—"}
  </span>
);

// Runs the AI over cards in batches, with progress and a stop button.
function useBatches() {
  const [state, setState] = useState<{ label: string; done: number; total: number } | null>(null);
  const stop = useRef(false);
  const run = async <T,>(
    label: string,
    ids: string[],
    size: number,
    step: (batch: string[]) => Promise<T>,
    each: (r: T) => void,
  ) => {
    stop.current = false;
    setState({ label, done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length && !stop.current; i += size) {
        each(await step(ids.slice(i, i + size)));
        setState({ label, done: Math.min(ids.length, i + size), total: ids.length });
      }
    } finally {
      setState(null);
    }
  };
  return { state, run, stop: () => (stop.current = true) };
}

// The topic's toolbar: merging duplicates, filling explanations, the check.
export function ProofTools({
  topic,
  cards,
  shownIds,
  onChanged,
  onCards,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  // The cards the list shows now (the AI works on those).
  shownIds: string[];
  onChanged: () => void;
  onCards: (c: FlashCard[]) => void;
}) {
  const fillFn = useServerFn(fillFlashExplanations);
  const checkFn = useServerFn(checkFlashCards);
  const groups = useMemo(() => groupDuplicates(cards), [cards]);
  const [merging, setMerging] = useState(false);
  const batches = useBatches();
  const shown = new Set(shownIds);
  const live = cards.filter((c) => !c.removed && shown.has(c.id));
  const needFill = live.filter((c) => emptyColumns(c, topic.columns).length).map((c) => c.id);
  const needCheck = live.filter((c) => !c.verified).map((c) => c.id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => setMerging(true)}>
          <Combine className="mr-1 h-4 w-4" /> Same word in several books: {groups.length}
        </Button>
      )}
      {batches.state ? (
        <span className="flex items-center gap-2 text-sm">
          {batches.state.label}: {batches.state.done}/{batches.state.total}
          <Button size="sm" variant="outline" onClick={batches.stop}>
            <Pause className="mr-1 h-4 w-4" /> Stop
          </Button>
        </span>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={!needFill.length || !topic.columns.length}
            title="Empty explanations of the cards shown: from the books first; the AI's own knowledge is marked"
            onClick={async () => {
              let own = 0;
              let filled = 0;
              try {
                await batches.run(
                  "Filling explanations",
                  needFill,
                  10,
                  (ids) => fillFn({ data: { topic_id: topic.id, ids } }),
                  (r) => {
                    own += r.own;
                    filled += r.filled;
                    onCards(r.cards);
                  },
                );
                toast.success(
                  `${filled} card${filled === 1 ? "" : "s"} filled${own ? `; ${own} explanations not from your books (marked)` : ""}`,
                );
              } catch (e) {
                toast.error(errorText(e, "The AI couldn't fill these; try again"));
              }
            }}
          >
            <Sparkles className="mr-1 h-4 w-4" /> Fill explanations ({needFill.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!needCheck.length}
            title="The AI reads the cards shown that aren't verified and marks problems to recheck; it changes nothing"
            onClick={async () => {
              let flagged = 0;
              try {
                await batches.run(
                  "Checking",
                  needCheck,
                  20,
                  (ids) => checkFn({ data: { topic_id: topic.id, ids } }),
                  (r) => {
                    flagged += r.flagged;
                    onCards(r.cards);
                  },
                );
                toast.success(
                  flagged
                    ? `${flagged} card${flagged === 1 ? "" : "s"} to recheck`
                    : "No problems found",
                );
              } catch (e) {
                toast.error(errorText(e, "The AI couldn't check these; try again"));
              }
            }}
          >
            <ScanSearch className="mr-1 h-4 w-4" /> AI check ({needCheck.length})
          </Button>
        </>
      )}
      {merging && (
        <MergeDialog
          topic={topic}
          groups={groups}
          onClose={() => setMerging(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function MergeDialog({
  topic,
  groups,
  onClose,
  onChanged,
}: {
  topic: FlashTopic;
  groups: DupGroup[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const mergeFn = useServerFn(mergeFlashCards);
  const allFn = useServerFn(mergeAllFlashCards);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(30);
  const [mains, setMains] = useState<Record<string, string>>({});
  const order = topic.books.map((b) => b.code);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Same word in several books ({groups.length})</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Merging keeps one card (the chosen book&apos;s version in front) and keeps the other
          books&apos; versions with it: you can take any of their answers or explanations, combine
          their answers, or split a version out again. Books earlier in the topic&apos;s Settings
          come first.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            if (
              !confirm(`Merge all ${groups.length} groups, keeping each one's first book in front?`)
            )
              return;
            setBusy(true);
            try {
              const r = await allFn({ data: { topic_id: topic.id } });
              toast.success(
                `${r.merged} words merged (${r.cards} cards folded in)${r.skipped ? `; ${r.skipped} left: more than one already numbered` : ""}`,
              );
              onChanged();
              onClose();
            } catch (e) {
              toast.error(errorText(e, "Couldn't merge"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Combine className="mr-1 h-4 w-4" /> Merge all {groups.length}
        </Button>
        <ul className="space-y-2">
          {groups.slice(0, shown).map((g) => {
            const main = mains[g.key] ?? mainOf(g.cards, order).id;
            return (
              <li key={g.key} className="space-y-2 rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b lang="hi">{g.cards[0].front.split("\n").join(" / ")}</b>
                  <Badge tone="primary">{g.books.length} books</Badge>
                  {g.sameBook && <Badge tone="warn">twice in one book</Badge>}
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await mergeFn({
                          data: {
                            main,
                            others: g.cards.filter((c) => c.id !== main).map((c) => c.id),
                          },
                        });
                        onChanged();
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't merge"));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Merge
                  </Button>
                </div>
                <ul className="space-y-1">
                  {g.cards.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`main-${g.key}`}
                          className="mt-1"
                          checked={main === c.id}
                          onChange={() => setMains({ ...mains, [g.key]: c.id })}
                        />
                        <BookChip topic={topic} book={c.sources[0]?.book ?? ""} />
                        <span className="min-w-0 flex-1 whitespace-pre-wrap" lang="hi">
                          {c.back}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        {groups.length > shown && (
          <Button variant="outline" size="sm" onClick={() => setShown(shown + 60)}>
            Show more ({groups.length - shown} left)
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// In a card: the other books' versions, to take an answer or explanations
// from or split out; and for list answers, every book's items as chips.
export function Versions({
  topic,
  card,
  onUse,
  onSplit,
}: {
  topic: FlashTopic;
  card: FlashCard;
  onUse: (patch: Partial<Pick<FlashCard, "back" | "ex" | "front">>) => void;
  onSplit: (c: FlashCard) => void;
}) {
  const splitFn = useServerFn(splitFlashVariant);
  const vs = versionsOf(card);
  const chips = useMemo(() => combineItems(vs), [card]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<Set<string> | null>(null);
  if (vs.length < 2) return null;
  const chosen = picked ?? new Set(chips.filter((c) => c.books.length > 0).map((c) => c.key));
  const books = new Set(vs.map((v) => v.book)).size;
  return (
    <section
      aria-label="Other books"
      className="space-y-2 rounded-lg border border-border p-2 text-sm"
    >
      <div className="font-medium">
        In {books} books ({vs.length} versions)
      </div>
      {isList(vs) && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">
            Every book&apos;s answers (how many books give each). Tick the ones to keep.
          </div>
          <div className="flex flex-wrap gap-1.5" lang="hi">
            {chips.map((ch) => {
              const on = chosen.has(ch.key);
              return (
                <button
                  key={ch.key}
                  type="button"
                  aria-pressed={on}
                  title={`${ch.books.join(", ")}${ch.spellings.length > 1 ? ` · spellings: ${ch.spellings.join(" / ")}` : ""}`}
                  onClick={() => {
                    const next = new Set(chosen);
                    if (on) next.delete(ch.key);
                    else next.add(ch.key);
                    setPicked(next);
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-sm ${on ? "border-primary bg-primary/10" : "border-border text-muted-foreground line-through"}`}
                >
                  {ch.meaning ? `${ch.meaning}. ` : ""}
                  {ch.text} <sup>{ch.books.length}</sup>
                  {ch.spellings.length > 1 && <sup className="text-amber-600">*</sup>}
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUse({ back: backFromChips(chips.filter((c) => chosen.has(c.key))) })}
          >
            Use the ticked answers
          </Button>
        </div>
      )}
      <ul className="space-y-1.5">
        {vs.map((v, i) => (
          <li key={i} className="rounded-md bg-muted/40 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <BookChip topic={topic} book={v.book} />
              {i === 0 && <span className="text-xs text-muted-foreground">this card</span>}
              {i > 0 && (
                <span className="ml-auto flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => onUse({ back: v.back })}
                  >
                    Use answer
                  </Button>
                  {Object.keys(v.ex).length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => onUse({ ex: { ...card.ex, ...v.ex } })}
                    >
                      Use explanations
                    </Button>
                  )}
                  {v.front !== card.front && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => onUse({ front: v.front })}
                    >
                      Use spelling
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={async () => {
                      try {
                        await splitFn({ data: { id: card.id, index: i - 1 } });
                        onSplit(card);
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't split it out"));
                      }
                    }}
                  >
                    <Split className="mr-1 h-3.5 w-3.5" /> Own card
                  </Button>
                </span>
              )}
            </div>
            <div className="mt-1 grid gap-1 sm:grid-cols-2" lang="hi">
              <div className="whitespace-pre-wrap">{v.front}</div>
              <div className="whitespace-pre-wrap">{v.back}</div>
            </div>
            {Object.keys(v.ex).length > 0 && i > 0 && (
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground" lang="hi">
                {topic.columns
                  .filter((c) => v.ex[c.id])
                  .map((c) => (
                    <div key={c.id} className="whitespace-pre-wrap">
                      <b>{c.title}:</b> {v.ex[c.id]}
                    </div>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
