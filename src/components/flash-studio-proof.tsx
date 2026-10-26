// The card studio's proofreading tools: the same word from several books
// merged (one group at a time or all at once), a card's other books'
// versions and its answer combined from them as chips, and the AI's help
// over many cards: empty explanations filled (its own knowledge marked)
// and the check (it only flags).
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronDown,
  Combine,
  Eye,
  ListChecks,
  Replace,
  ScanSearch,
  Sparkles,
  Split,
  Wand2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { kindOfTemplate, wordsOf } from "@/lib/flash-split";
import {
  checkFlashCards,
  fillFlashExplanations,
  listFlashTemplates,
  makeFlashSplitCards,
  mergeAllFlashCards,
  mergeFlashCards,
  splitFlashVariant,
  deleteFlashCard,
  setFlashExplanation,
} from "@/lib/flash-studio.functions";
import {
  backFromChips,
  combineItems,
  emptyColumns,
  exConflicts,
  filledCount,
  groupDuplicates,
  isList,
  mainOf,
  versionsOf,
  wordingGroups,
  type DupGroup,
} from "@/lib/flash-merge";
import { needsCheck, type FlashCard, type FlashSource, type FlashTopic } from "@/lib/flash-studio";
import { runStudioJob, useStudioJob } from "@/lib/flash-jobs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BookChip = ({ topic, book }: { topic: FlashTopic; book: string }) => (
  <span
    className="rounded px-1.5 text-[11px] text-slate-800"
    style={{ background: topic.books.find((b) => b.code === book)?.color ?? "#e5e7eb" }}
  >
    {book || "—"}
  </span>
);

// Which explanation columns a book's card (or version) has filled: ✓ or –.
function ExMarks({ topic, ex }: { topic: FlashTopic; ex: Record<string, string> }) {
  if (!topic.columns.length) return null;
  const n = filledCount({ ex });
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      title={`${n} of ${topic.columns.length} explanations`}
    >
      {n === 0 ? (
        <span className="text-[11px] text-muted-foreground">no explanations</span>
      ) : (
        topic.columns.map((col) => {
          const on = !!(ex[col.id] ?? "").trim();
          return (
            <span
              key={col.id}
              lang="hi"
              className={`rounded px-1 text-[11px] ${on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground line-through"}`}
            >
              {col.title} {on ? "✓" : "–"}
            </span>
          );
        })
      )}
    </span>
  );
}

// A book's card or version, all of it, to read.
type Peek = {
  book: string;
  front: string;
  back: string;
  ex: Record<string, string>;
  source?: FlashSource | null;
  card?: FlashCard;
};

function PeekButton({ topic, peek }: { topic: FlashTopic; peek: Peek }) {
  const [open, setOpen] = useState(false);
  const src = peek.source ?? peek.card?.sources[0];
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        aria-label={`See ${peek.book}'s card`}
        title="See the whole card"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent
            className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <BookChip topic={topic} book={peek.book} />
                {peek.card ? "Its own card" : "Merged version"}
              </DialogTitle>
            </DialogHeader>
            <dl className="space-y-3 text-sm" lang="hi">
              {[
                ["front", peek.front],
                ["back", peek.back],
                ...topic.columns.map((c) => [`explanation_${c.title}`, peek.ex[c.id] ?? ""]),
              ].map(([label, v]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={`whitespace-pre-wrap ${v ? "" : "text-muted-foreground"}`}>
                    {v || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground" lang="hi">
              {src && (
                <span>
                  {src.book}
                  {src.pos != null ? ` (${src.pos})` : ""}
                  {src.page ? ` · page ${src.page}` : ""}
                  {src.heading ? ` · ${src.heading}` : ""}
                </span>
              )}
              {peek.card?.verified && <Badge tone="good">Verified</Badge>}
              {peek.card?.error && <Badge tone="bad">{peek.card.error_type || "Recheck"}</Badge>}
              {(peek.card?.note || src?.note) && (
                <span className="text-amber-700 dark:text-amber-400">
                  {peek.card?.note || src?.note}
                </span>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// The topic's tools, in one menu: merging duplicates, filling explanations,
// the AI check, पृथक करें cards and one wording. A batch running shows its
// progress in the menu's place.
export function ProofTools({
  topic,
  cards,
  shownIds,
  merging,
  setMerging,
  onReview,
  onChanged,
  onCards,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  // The cards the list shows now (the AI works on those).
  shownIds: string[];
  // The merge dialog, open from here or from the topic's progress.
  merging: boolean;
  setMerging: (open: boolean) => void;
  // Every AI fix in the topic, in one list.
  onReview: () => void;
  onChanged: () => void;
  onCards: (c: FlashCard[]) => void;
}) {
  const fillFn = useServerFn(fillFlashExplanations);
  const checkFn = useServerFn(checkFlashCards);
  const splitFn = useServerFn(makeFlashSplitCards);
  const typesFn = useServerFn(listFlashTemplates);
  const types = useQuery({ queryKey: ["flashTemplates"], queryFn: () => typesFn() });
  const kind = kindOfTemplate(types.data?.find((t) => t.id === topic.template_id)?.key);
  const groups = useMemo(() => groupDuplicates(cards), [cards]);
  const [wording, setWording] = useState(false);
  const running = useStudioJob();
  const shown = new Set(shownIds);
  const live = cards.filter((c) => !c.removed && shown.has(c.id));
  const needFill = live.filter((c) => emptyColumns(c, topic.columns).length).map((c) => c.id);
  const needCheck = live.filter(needsCheck).map((c) => c.id);
  const withFixes = cards.reduce((n, c) => n + (c.removed ? 0 : (c.ai?.fixes.length ?? 0)), 0);
  const words = kind ? live.reduce((n, c) => n + wordsOf(c.back).length, 0) : 0;
  const fill = () =>
    runStudioJob({
      label: "Filling explanations",
      topic: topic.name,
      ids: needFill,
      size: 10,
      step: (ids) => fillFn({ data: { topic_id: topic.id, ids } }),
      each: (() => {
        let own = 0;
        let filled = 0;
        return (r: { own: number; filled: number; cards: FlashCard[] }) => {
          own += r.own;
          filled += r.filled;
          onCards(r.cards);
          return `${filled} filled${own ? `, ${own} not from your books` : ""}`;
        };
      })(),
      end: (found) =>
        toast.success(found ? `Explanations: ${found} (marked ◇)` : "Nothing to fill"),
    });
  const check = () =>
    runStudioJob({
      label: "AI check",
      topic: topic.name,
      ids: needCheck,
      size: 20,
      step: (ids) => checkFn({ data: { topic_id: topic.id, ids } }),
      each: (() => {
        let flagged = 0;
        return (r: { flagged: number; cards: FlashCard[] }) => {
          flagged += r.flagged;
          onCards(r.cards);
          return flagged ? `${flagged} card${flagged === 1 ? "" : "s"} to recheck` : "";
        };
      })(),
      end: (found, stopped) =>
        toast.success(
          `${stopped ? "AI check stopped" : "AI check done"}: ${found || "no problems found"}`,
        ),
    });
  const split = () => {
    if (
      !confirm(
        `Make “पृथक करें” cards from the ${words} words of the ${live.length} cards shown, in “${topic.name} – पृथक करें”? Words already there are skipped.`,
      )
    )
      return;
    let added = 0;
    let ai = 0;
    let name = "";
    return runStudioJob({
      label: "Making पृथक करें cards",
      topic: topic.name,
      ids: live.map((c) => c.id),
      size: 8,
      step: (ids) => splitFn({ data: { topic_id: topic.id, ids } }),
      each: (r) => {
        added += r.added;
        ai += r.ai;
        name = r.topic.name;
        return `${added} made`;
      },
      end: () =>
        toast.success(
          `${added} cards made in “${name}”${ai ? `; ${ai} split by the AI, marked to check` : ""}`,
        ),
    });
  };
  const item = (label: string, note: string) => (
    <span className="flex flex-col">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </span>
  );
  return (
    <>
      {
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Wand2 className="mr-1 h-4 w-4" /> Tools
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuItem disabled={!groups.length} onSelect={() => setMerging(true)}>
              <Combine className="mr-2 h-4 w-4 shrink-0" />
              {item(
                `Merge the same word (${groups.length})`,
                "Words in several books become one card",
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {running
                ? `AI: wait for “${running.label}” to finish`
                : `AI, on the ${live.length} cards shown (runs while you work)`}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!!running || !needFill.length || !topic.columns.length}
              onSelect={() => void fill()}
            >
              <Sparkles className="mr-2 h-4 w-4 shrink-0" />
              {item(
                `Fill explanations (${needFill.length})`,
                "From the books first; its own knowledge is marked",
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!!running || !needCheck.length}
              onSelect={() => void check()}
            >
              <ScanSearch className="mr-2 h-4 w-4 shrink-0" />
              {item(
                `AI check (${needCheck.length})`,
                "Front, back and explanations; fixes to apply or dismiss. Skips verified and already-checked cards",
              )}
            </DropdownMenuItem>
            {kind && words > 0 && (
              <DropdownMenuItem disabled={!!running} onSelect={() => void split()}>
                <Split className="mr-2 h-4 w-4 shrink-0" />
                {item(
                  `पृथक करें cards (${words} words)`,
                  kind === "upsarg" ? "उपसर्ग + मूल शब्द" : "मूल शब्द + प्रत्यय",
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={!withFixes} onSelect={onReview}>
              <ListChecks className="mr-2 h-4 w-4 shrink-0" />
              {item(
                `Review AI suggestions (${withFixes})`,
                "Every fix in the topic in one list: tick, apply or dismiss",
              )}
            </DropdownMenuItem>
            {topic.columns.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setWording(true)}>
                  <Replace className="mr-2 h-4 w-4 shrink-0" />
                  {item("One wording for an explanation", "The same thing said in different words")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
      {wording && (
        <WordingDialog
          topic={topic}
          cards={cards}
          onClose={() => setWording(false)}
          onChanged={onChanged}
        />
      )}
      {merging && (
        <MergeDialog
          topic={topic}
          groups={groups}
          onClose={() => setMerging(false)}
          onChanged={onChanged}
        />
      )}
    </>
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
          their answers, or split a version out again. The book with the most explanations is picked
          first (then the books&apos; order in Settings). Where books explain a column differently,
          the front card&apos;s wording is kept and the others stay in their versions.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            if (
              !confirm(
                `Merge all ${groups.length} words? Each keeps the book with the most explanations in front; the others' versions stay with it.`,
              )
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
                  {exConflicts(g.cards, topic.columns).length > 0 && (
                    <Badge
                      tone="warn"
                      title="Merged, the front card's wording is kept; the others stay in their versions"
                    >
                      explained differently:{" "}
                      {exConflicts(g.cards, topic.columns)
                        .map((c) => c.title)
                        .join(", ")}
                    </Badge>
                  )}
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
                    <li
                      key={c.id}
                      data-book={c.sources[0]?.book ?? ""}
                      className="flex items-start gap-1"
                    >
                      <label className="flex min-w-0 flex-1 items-start gap-2">
                        <input
                          type="radio"
                          name={`main-${g.key}`}
                          className="mt-1"
                          checked={main === c.id}
                          onChange={() => setMains({ ...mains, [g.key]: c.id })}
                        />
                        <BookChip topic={topic} book={c.sources[0]?.book ?? ""} />
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="block whitespace-pre-wrap" lang="hi">
                            {c.back}
                          </span>
                          <ExMarks topic={topic} ex={c.ex} />
                        </span>
                      </label>
                      <PeekButton
                        topic={topic}
                        peek={{
                          book: c.sources[0]?.book ?? "",
                          front: c.front,
                          back: c.back,
                          ex: c.ex,
                          card: c,
                        }}
                      />
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

// In a card: the same word from other books, both the cards not merged yet
// and the versions merged into this one. For each, every column with "Use"
// (copy into this card) and "Add" (append to it); a card not merged can be
// merged into this one or deleted, a merged version split out again. For
// list answers (synonyms…), every book's items as chips.
type Other =
  | {
      kind: "card";
      card: FlashCard;
      book: string;
      front: string;
      back: string;
      ex: Record<string, string>;
    }
  | {
      kind: "version";
      index: number;
      book: string;
      front: string;
      back: string;
      ex: Record<string, string>;
      source: FlashSource | null;
    };

export function Versions({
  topic,
  card,
  draft,
  others = [],
  onUse,
  onSplit,
  onMerged,
  onDeleted,
}: {
  topic: FlashTopic;
  card: FlashCard;
  // The card as being edited (what "Add" appends to).
  draft?: Pick<FlashCard, "front" | "back" | "ex">;
  // Cards of the same word not merged yet.
  others?: FlashCard[];
  onUse: (patch: Partial<Pick<FlashCard, "back" | "ex" | "front">>) => void;
  onSplit: (c: FlashCard) => void;
  onMerged?: (ids: string[]) => void;
  onDeleted?: (id: string) => void;
}) {
  const splitFn = useServerFn(splitFlashVariant);
  const mergeFn = useServerFn(mergeFlashCards);
  const deleteFn = useServerFn(deleteFlashCard);
  const now = draft ?? card;
  const list: Other[] = [
    ...others.map((o) => ({
      kind: "card" as const,
      card: o,
      book: o.sources[0]?.book ?? "",
      front: o.front,
      back: o.back,
      ex: o.ex,
    })),
    ...card.variants.map((v, index) => ({ kind: "version" as const, index, ...v })),
  ];
  const vs = [
    ...versionsOf(card),
    ...others.map((o) => ({
      book: o.sources[0]?.book ?? "",
      front: o.front,
      back: o.back,
      ex: o.ex,
    })),
  ];
  const chips = useMemo(() => combineItems(vs), [card, others]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  if (!list.length) return null;
  const ticked = picked ?? new Set(chips.map((c) => c.key));
  const books = new Set(vs.map((v) => v.book)).size;
  const fields: {
    key: string;
    label: string;
    get: (o: Other) => string;
    put: (v: string) => void;
    cur: string;
  }[] = [
    {
      key: "front",
      label: "front",
      get: (o) => o.front,
      cur: now.front,
      put: (v) => onUse({ front: v }),
    },
    {
      key: "back",
      label: "back",
      get: (o) => o.back,
      cur: now.back,
      put: (v) => onUse({ back: v }),
    },
    ...topic.columns.map((col) => ({
      key: col.id,
      label: col.title,
      get: (o: Other) => o.ex[col.id] ?? "",
      cur: now.ex[col.id] ?? "",
      put: (v: string) => onUse({ ex: { ...now.ex, [col.id]: v } }),
    })),
  ];
  const cardsChosen = [...chosen];
  return (
    <section
      aria-label="Other books"
      className="space-y-2 rounded-lg border border-border p-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          Same word in {books} book{books === 1 ? "" : "s"}
        </span>
        {others.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">{others.length} not merged yet</span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              disabled={!cardsChosen.length}
              onClick={async () => {
                try {
                  await mergeFn({ data: { main: card.id, others: cardsChosen } });
                  toast.success(`${cardsChosen.length} merged into this card`);
                  setChosen(new Set());
                  onMerged?.(cardsChosen);
                } catch (e) {
                  toast.error(errorText(e, "Couldn't merge"));
                }
              }}
            >
              <Combine className="mr-1 h-3.5 w-3.5" /> Merge the chosen into this card
            </Button>
          </>
        )}
      </div>
      {isList(vs) && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">
            Every book&apos;s answers (how many books give each). Tick the ones to keep.
          </div>
          <div className="flex flex-wrap gap-1.5" lang="hi">
            {chips.map((ch) => {
              const on = ticked.has(ch.key);
              return (
                <button
                  key={ch.key}
                  type="button"
                  aria-pressed={on}
                  title={`${ch.books.join(", ")}${ch.spellings.length > 1 ? ` · spellings: ${ch.spellings.join(" / ")}` : ""}`}
                  onClick={() => {
                    const next = new Set(ticked);
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
            onClick={() => onUse({ back: backFromChips(chips.filter((c) => ticked.has(c.key))) })}
          >
            Use the ticked answers
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {list.map((o) => (
          <li
            key={o.kind === "card" ? o.card.id : `v${o.index}`}
            data-other={o.book}
            className="rounded-md bg-muted/40 p-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {o.kind === "card" && (
                <input
                  type="checkbox"
                  aria-label={`Choose ${o.book}'s card`}
                  checked={chosen.has(o.card.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(o.card.id);
                    else next.delete(o.card.id);
                    setChosen(next);
                  }}
                />
              )}
              <BookChip topic={topic} book={o.book} />
              <span className="text-xs text-muted-foreground">
                {o.kind === "card" ? "its own card, not merged" : "merged into this card"}
              </span>
              <ExMarks topic={topic} ex={o.ex} />
              <PeekButton
                topic={topic}
                peek={{
                  book: o.book,
                  front: o.front,
                  back: o.back,
                  ex: o.ex,
                  ...(o.kind === "card" ? { card: o.card } : { source: o.source }),
                }}
              />
              <span className="ml-auto flex flex-wrap gap-1">
                {o.kind === "card" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive"
                    onClick={async () => {
                      const filled = topic.columns.filter((c) => (o.ex[c.id] ?? "").trim());
                      const lost = [
                        filled.length
                          ? `its ${filled.length} explanation${filled.length === 1 ? "" : "s"} (${filled.map((c) => c.title).join(", ")})`
                          : "",
                        o.card.verified ? "its verified mark" : "",
                      ].filter(Boolean);
                      if (
                        !confirm(
                          lost.length
                            ? `${o.book}'s card “${o.front.split("\n")[0]}” has ${lost.join(" and ")}, which will be lost.\n\nMerging it into this card keeps them as its version. Delete it anyway?`
                            : `Delete ${o.book}'s card “${o.front.split("\n")[0]}”? It has no explanations.`,
                        )
                      )
                        return;
                      try {
                        await deleteFn({ data: { id: o.card.id } });
                        onDeleted?.(o.card.id);
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't delete"));
                      }
                    }}
                  >
                    Delete it
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={async () => {
                      try {
                        await splitFn({ data: { id: card.id, index: o.index } });
                        onSplit(card);
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't split it out"));
                      }
                    }}
                  >
                    <Split className="mr-1 h-3.5 w-3.5" /> Own card
                  </Button>
                )}
              </span>
            </div>
            <dl className="mt-1 space-y-1" lang="hi">
              {fields
                .filter((f) => o.kind === "card" || f.get(o) || f.key === "back")
                .map((f) => {
                  const v = f.get(o);
                  const same = v.trim() === f.cur.trim();
                  return (
                    <div key={f.key} className="grid grid-cols-[6.5rem_1fr_auto] items-start gap-2">
                      <dt className="truncate text-xs text-muted-foreground">{f.label}</dt>
                      <dd className={`whitespace-pre-wrap ${v ? "" : "text-muted-foreground"}`}>
                        {v || "—"}
                      </dd>
                      <span className="flex gap-1">
                        {v && !same && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              title={`Put ${o.book}'s ${f.label} in this card`}
                              onClick={() => f.put(v)}
                            >
                              Use
                            </Button>
                            {f.cur.trim() && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                title={`Add ${o.book}'s ${f.label} after this card's`}
                                onClick={() => f.put(`${f.cur}\n${v}`)}
                              >
                                Add
                              </Button>
                            )}
                          </>
                        )}
                        {same && <span className="text-[11px] text-emerald-700">same</span>}
                      </span>
                    </div>
                  );
                })}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The same explanation written in different words (by different books):
// similar wordings of a column grouped, one picked (or edited) and given
// to every card that has any of them.
function WordingDialog({
  topic,
  cards,
  onClose,
  onChanged,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const setFn = useServerFn(setFlashExplanation);
  const [column, setColumn] = useState(topic.columns[0]?.id ?? "");
  const [alike, setAlike] = useState(0.5);
  const groups = useMemo(() => wordingGroups(cards, column, alike), [cards, column, alike]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>One wording for an explanation</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Books often say the same thing in different words. Similar wordings of a column are
          grouped below: pick the one to keep (or edit it), untick any that don&apos;t belong, and
          apply it to all their cards.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Column
            <select
              aria-label="Explanation column"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2"
            >
              {topic.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            How alike
            <select
              aria-label="How alike"
              value={alike}
              onChange={(e) => setAlike(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2"
            >
              <option value={0.7}>Very alike</option>
              <option value={0.5}>Alike</option>
              <option value={0.35}>Loosely alike</option>
            </select>
          </label>
          <span className="text-muted-foreground">{groups.length} groups</span>
        </div>
        {!groups.length && (
          <p className="text-sm text-muted-foreground">
            No differently worded groups in this column.
          </p>
        )}
        <ul className="space-y-3">
          {groups.slice(0, 50).map((g, i) => (
            <WordingGroupRow
              key={`${column}-${i}-${g.wordings[0].text.slice(0, 20)}`}
              group={g}
              onApply={async (from, to) => {
                try {
                  const r = await setFn({ data: { topic_id: topic.id, column, from, to } });
                  toast.success(`${r.changed} cards now say it this way`);
                  onChanged();
                } catch (e) {
                  toast.error(errorText(e, "Couldn't apply it"));
                }
              }}
            />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function WordingGroupRow({
  group,
  onApply,
}: {
  group: ReturnType<typeof wordingGroups>[number];
  onApply: (from: string[], to: string) => Promise<void>;
}) {
  const [pick, setPick] = useState(0);
  const [text, setText] = useState(group.wordings[0].text);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const on = group.wordings.filter((_, i) => !off.has(i));
  const count = on.reduce((n, w) => n + w.cards.length, 0);
  return (
    <li className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <ul className="space-y-1" lang="hi">
        {group.wordings.map((w, i) => (
          <li key={i} className="flex items-start gap-2">
            <input
              type="checkbox"
              aria-label="Include this wording"
              className="mt-1"
              checked={!off.has(i)}
              onChange={(e) => {
                const next = new Set(off);
                if (e.target.checked) next.delete(i);
                else next.add(i);
                setOff(next);
              }}
            />
            <input
              type="radio"
              aria-label="Keep this wording"
              className="mt-1"
              checked={pick === i}
              onChange={() => {
                setPick(i);
                setText(w.text);
              }}
            />
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{w.text}</span>
            <Badge>{w.cards.length}</Badge>
          </li>
        ))}
      </ul>
      <textarea
        aria-label="The wording to keep"
        lang="hi"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-input bg-background p-2"
      />
      <Button
        size="sm"
        disabled={busy || !text.trim() || on.length < 1}
        onClick={async () => {
          setBusy(true);
          await onApply(
            on.map((w) => w.text),
            text.trim(),
          );
          setBusy(false);
        }}
      >
        Apply to {count} cards
      </Button>
    </li>
  );
}
