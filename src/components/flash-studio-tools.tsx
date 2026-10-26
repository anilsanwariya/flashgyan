// The card studio's tools for many cards and for one: the bar of actions
// on the ticked cards, every AI fix in one list, a card's quick checks
// (problems found without the AI, with their safe fixes) and its history
// (earlier texts to restore).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, History, ScanSearch, Sparkles, Trash2, Wand2, X } from "lucide-react";
import {
  bulkFlashCards,
  checkFlashCards,
  getFlashCardHistory,
  resolveFlashAi,
} from "@/lib/flash-studio.functions";
import {
  aiStats,
  needsCheck,
  type AiFix,
  type FlashCard,
  type FlashTopic,
} from "@/lib/flash-studio";
import { LINT_LABELS, applyLints, lintCard, type Lint } from "@/lib/flash-lint";
import { runStudioJob, useStudioJob } from "@/lib/flash-jobs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Action = "verify" | "unverify" | "recheck" | "delete" | "apply_ai" | "fix_lint";

// The ticked cards' actions, in a bar at the bottom of the list.
export function BulkBar({
  topic,
  cards,
  lints,
  onCards,
  onChanged,
  onClear,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  lints: Map<string, Lint[]>;
  onCards: (c: FlashCard[]) => void;
  onChanged: () => void;
  onClear: () => void;
}) {
  const bulkFn = useServerFn(bulkFlashCards);
  const checkFn = useServerFn(checkFlashCards);
  const running = useStudioJob();
  const [busy, setBusy] = useState(false);
  const live = cards.filter((c) => !c.removed);
  const withAi = live.filter((c) => c.ai?.fixes.some((f) => f.to && f.field)).length;
  const withLint = live.filter((c) => lints.get(c.id)?.some((l) => l.fix !== undefined)).length;
  const toCheck = live.filter(needsCheck).map((c) => c.id);
  const run = async (action: Action, done: (r: Awaited<ReturnType<typeof bulkFn>>) => string) => {
    setBusy(true);
    try {
      const r = await bulkFn({ data: { topic_id: topic.id, ids: live.map((c) => c.id), action } });
      if (r.cards.length) onCards(r.cards);
      if (action === "delete") {
        onChanged();
        onClear();
      }
      toast.success(done(r));
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(false);
    }
  };
  const n = (k: number, what = "card") => `${k} ${what}${k === 1 ? "" : "s"}`;
  return (
    <div
      role="region"
      aria-label="Ticked cards"
      className="sticky bottom-2 z-20 flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/30 bg-background/95 p-2 text-sm shadow-lg backdrop-blur"
    >
      <span className="px-1 font-medium">{live.length} ticked</span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void run("verify", (r) => `${n(r.changed)} verified`)}
      >
        <BadgeCheck className="mr-1 h-4 w-4" /> Verify
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void run("unverify", (r) => `${n(r.changed)} marked not verified`)}
      >
        Not verified
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void run("recheck", (r) => `${n(r.changed)} marked to recheck`)}
      >
        To recheck
      </Button>
      {toCheck.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !!running}
          title="Only cards not verified and not checked as they are"
          onClick={() =>
            void runStudioJob({
              label: "AI check",
              topic: topic.name,
              ids: toCheck,
              size: 20,
              step: (ids) => checkFn({ data: { topic_id: topic.id, ids } }),
              each: (() => {
                let flagged = 0;
                return (r: { flagged: number; cards: FlashCard[] }) => {
                  flagged += r.flagged;
                  onCards(r.cards);
                  return flagged ? `${n(flagged)} to recheck` : "";
                };
              })(),
              end: (found, stopped) =>
                toast.success(
                  `${stopped ? "AI check stopped" : "AI check done"}: ${found || "no problems found"}`,
                ),
            })
          }
        >
          <ScanSearch className="mr-1 h-4 w-4" /> AI check ({toCheck.length})
        </Button>
      )}
      {withAi > 0 && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (
              !confirm(
                `Apply the AI's fixes on ${n(withAi)}? Each card keeps its old text in History.`,
              )
            )
              return;
            void run("apply_ai", (r) => `AI fixes applied on ${n(r.changed)}`);
          }}
        >
          <Sparkles className="mr-1 h-4 w-4" /> Apply AI fixes ({withAi})
        </Button>
      )}
      {withLint > 0 && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          title="Spaces, an item twice, hidden letter codes, numbering"
          onClick={() => void run("fix_lint", (r) => `Quick fixes made on ${n(r.changed)}`)}
        >
          <Wand2 className="mr-1 h-4 w-4" /> Quick fixes ({withLint})
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={busy}
        onClick={() => {
          const numbered = live.filter((c) => c.card_order !== null).length;
          if (
            !confirm(
              `Delete ${n(live.length)}?${numbered ? ` ${n(numbered, "numbered card")} will be removed instead (their numbers are never used again; delete them in the app too).` : ""}`,
            )
          )
            return;
          void run(
            "delete",
            (r) =>
              `${n(r.deleted)} deleted${r.removed ? `, ${n(r.removed, "numbered card")} removed` : ""}`,
          );
        }}
      >
        <Trash2 className="mr-1 h-4 w-4" /> Delete
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="ml-auto h-8 w-8"
        aria-label="Untick all"
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// A card's quick checks, worked out on its text as edited: each with Fix
// when the fix is safe, and Fix all.
export function QuickChecks({
  topic,
  card: c,
  ctx,
  onChange,
}: {
  topic: FlashTopic;
  card: FlashCard;
  ctx: Parameters<typeof lintCard>[2];
  onChange: (c: FlashCard) => void;
}) {
  const lints = lintCard(c, topic.columns, ctx);
  if (!lints.length) return null;
  const label = (field: string) =>
    field === "front" || field === "back"
      ? field
      : `explanation_${topic.columns.find((col) => `ex:${col.id}` === field)?.title ?? "?"}`;
  const fix = (ls: Lint[]) => onChange({ ...c, ...applyLints(c, ls) });
  const fixable = lints.filter((l) => l.fix !== undefined);
  return (
    <section
      aria-label="Quick checks"
      className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2 text-sm"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">⚑ Quick checks</span>
        <span className="text-xs text-muted-foreground">found without the AI</span>
        {fixable.length > 1 && (
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => fix(fixable)}>
            Fix all
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {lints.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs" data-lint={l.kind}>
            <Badge>{LINT_LABELS[l.kind]}</Badge>
            <span className="font-medium">{label(l.field)}</span>
            <span className="min-w-0 flex-1 text-muted-foreground" lang="hi">
              {l.note}
            </span>
            {l.fix !== undefined && (
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => fix([l])}>
                Fix
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// A card's earlier texts (every save keeps the one before, the last 20),
// to see and restore (then Save).
export function HistoryButton({
  card,
  onRestore,
}: {
  card: FlashCard;
  onRestore: (v: Pick<FlashCard, "front" | "back" | "ex">) => void;
}) {
  const historyFn = useServerFn(getFlashCardHistory);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof historyFn>> | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          try {
            setVersions(await historyFn({ data: { id: card.id } }));
          } catch (e) {
            toast.error(errorText(e, "Couldn't load the history"));
          }
        }}
      >
        <History className="mr-1 h-4 w-4" /> History
      </Button>
      {versions && (
        <Dialog open onOpenChange={(o) => !o && setVersions(null)}>
          <DialogContent
            className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-base">Earlier versions</DialogTitle>
            </DialogHeader>
            {!versions.length && (
              <p className="text-sm text-muted-foreground">
                No earlier versions: the text hasn&apos;t been changed since it was added.
              </p>
            )}
            <ul className="space-y-2">
              {versions.map((v, i) => {
                const same = (a: string, b: string) => a.trim() === b.trim();
                return (
                  <li key={i} className="space-y-1 rounded-lg border border-border p-2 text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      Before {v.at ? new Date(v.at).toLocaleString("en-IN") : "a save"}
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7"
                        onClick={() => {
                          onRestore({ front: v.front, back: v.back, ex: v.ex });
                          setVersions(null);
                          toast.success("Restored: Save to keep it");
                        }}
                      >
                        Restore
                      </Button>
                    </div>
                    <dl className="space-y-0.5" lang="hi">
                      {(
                        [
                          ["front", v.front, card.front],
                          ["back", v.back, card.back],
                          ...Object.entries(v.ex).map(([k, t]) => [k, t, card.ex[k] ?? ""]),
                        ] as [string, string, string][]
                      ).map(([k, t, now]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="w-16 shrink-0 truncate text-xs text-muted-foreground">
                            {k}
                          </dt>
                          <dd
                            className={`whitespace-pre-wrap ${same(t, now) ? "text-muted-foreground" : "font-medium"}`}
                          >
                            {t || "—"}
                            {!same(t, now) && (
                              <span className="ml-1 text-[11px] text-amber-700">changed since</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// Every AI fix in the topic in one list, to tick and apply or dismiss
// together; with how often the editor has taken the AI's fixes so far.
export function AiReview({
  topic,
  cards,
  onCards,
  onOpen,
  onClose,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  onCards: (c: FlashCard[]) => void;
  onOpen: (c: FlashCard) => void;
  onClose: () => void;
}) {
  const resolveFn = useServerFn(resolveFlashAi);
  const [type, setType] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(80);
  const key = (c: FlashCard, f: AiFix) => `${c.id}|${f.field}|${f.to}`;
  const rows = cards
    .filter((c) => !c.removed && c.ai?.fixes.length)
    .flatMap((c) => c.ai!.fixes.map((f) => ({ card: c, fix: f })))
    .filter((r) => !type || r.fix.type === type);
  const types = [...new Set(cards.flatMap((c) => c.ai?.fixes.map((f) => f.type) ?? []))].sort();
  const ticked = rows.filter((r) => !off.has(key(r.card, r.fix)));
  const stats = aiStats(cards);
  const total = stats.applied + stats.dismissed;
  const pct = (a: number, d: number) => (a + d ? Math.round((a / (a + d)) * 100) : 0);
  const label = (field: string) =>
    field === "front" || field === "back"
      ? field
      : field.startsWith("ex:")
        ? (topic.columns.find((col) => `ex:${col.id}` === field)?.title ?? "?")
        : "card";
  const run = async (apply: boolean) => {
    const picks = (apply ? ticked.filter((r) => r.fix.to && r.fix.field) : ticked).map((r) => ({
      id: r.card.id,
      field: r.fix.field,
      to: r.fix.to,
    }));
    if (!picks.length) return;
    setBusy(true);
    try {
      const r = await resolveFn({ data: { topic_id: topic.id, picks, apply } });
      onCards(r.cards);
      setOff(new Set());
      toast.success(
        `${picks.length} fix${picks.length === 1 ? "" : "es"} ${apply ? "applied" : "dismissed"} on ${r.changed} card${r.changed === 1 ? "" : "s"}`,
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(false);
    }
  };
  const canApply = ticked.filter((r) => r.fix.to && r.fix.field).length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-4xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2 border-b border-border px-5 pb-3 pr-12 pt-4 text-left">
          <DialogTitle className="text-base">AI suggestions ({rows.length})</DialogTitle>
          <div className="text-xs text-muted-foreground" aria-label="AI accuracy">
            {total ? (
              <>
                So far you applied <b>{stats.applied}</b> and dismissed <b>{stats.dismissed}</b> of
                the AI&apos;s fixes: <b>{pct(stats.applied, stats.dismissed)}%</b> taken.{" "}
                {[...stats.by]
                  .sort((a, b) => b[1].applied + b[1].dismissed - (a[1].applied + a[1].dismissed))
                  .map(
                    ([t, v]) =>
                      `${t} ${pct(v.applied, v.dismissed)}% of ${v.applied + v.dismissed}`,
                  )
                  .join(" · ")}
              </>
            ) : (
              "How often you take the AI's fixes shows here once you apply or dismiss some."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label="Kind"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2"
            >
              <option value="">Every kind</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={rows.length > 0 && ticked.length === rows.length}
                onChange={(e) =>
                  setOff(
                    e.target.checked ? new Set() : new Set(rows.map((r) => key(r.card, r.fix))),
                  )
                }
              />
              Tick all
            </label>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!rows.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No AI suggestions waiting.
            </p>
          )}
          <ul className="space-y-1.5">
            {rows.slice(0, shown).map(({ card: c, fix: f }) => {
              const k = key(c, f);
              return (
                <li
                  key={k}
                  data-fix={c.front}
                  className="grid grid-cols-[auto_1fr] gap-2 rounded-lg border border-border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    aria-label={`Tick the fix on ${c.front.split("\n")[0]}`}
                    className="mt-1 h-4 w-4"
                    checked={!off.has(k)}
                    onChange={(e) =>
                      setOff((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.delete(k);
                        else n.add(k);
                        return n;
                      })
                    }
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        className="font-medium underline-offset-2 hover:underline"
                        lang="hi"
                        onClick={() => onOpen(c)}
                      >
                        {c.front.split("\n")[0] || "—"}
                      </button>
                      <Badge tone="warn">{f.type}</Badge>
                      <span className="text-muted-foreground" lang="hi">
                        {label(f.field)} · {f.note}
                      </span>
                    </div>
                    {f.to ? (
                      <div className="grid gap-1 sm:grid-cols-2" lang="hi">
                        <div className="whitespace-pre-wrap rounded bg-red-500/10 px-2 py-0.5 text-red-800 line-through decoration-red-400/60 dark:text-red-300">
                          {f.from || "—"}
                        </div>
                        <div className="whitespace-pre-wrap rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-800 dark:text-emerald-300">
                          {f.to}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Only pointed out: no text to apply.
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > shown && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setShown(shown + 200)}
            >
              Show more ({rows.length - shown} left)
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5">
          <span className="text-xs text-muted-foreground">{ticked.length} ticked</span>
          <Button
            className="ml-auto bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || !canApply}
            onClick={() => void run(true)}
          >
            Apply ticked ({canApply})
          </Button>
          <Button
            variant="outline"
            disabled={busy || !ticked.length}
            onClick={() => void run(false)}
          >
            Dismiss ticked ({ticked.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
