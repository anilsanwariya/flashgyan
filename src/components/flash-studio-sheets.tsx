// The card studio's Sheets tab: every sheet (and book) added to a topic with
// where its cards stand (in the topic, verified, to recheck, without an
// explanation, merged, deleted, numbered), to replace with a new version
// of the sheet (card by card, previewed first) or remove with its cards;
// and the working sheet: the whole topic to edit in Excel and upload back.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileUp, RefreshCw, Trash2 } from "lucide-react";
import {
  applyFlashWorking,
  deleteFlashSource,
  replaceFlashSheet,
  setFlashSheetProofread,
} from "@/lib/flash-studio.functions";
import { ProofreadBox } from "@/components/flash-proofread";
import { sheetStatus } from "@/lib/flash-merge";
import type { FlashCard, FlashSourceRow, FlashTopic, ParsedSheet } from "@/lib/flash-studio";
import { planReplace, planWorking, type WorkingRow } from "@/lib/flash-sheets";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KIND: Record<FlashSourceRow["kind"], string> = {
  sheet: "Excel sheet",
  word: "Word file (AI)",
  pdf: "PDF (AI)",
  text: "Pasted text (AI)",
};

export function SheetsTab({
  topic,
  cards,
  sources,
  onAdd,
  onDownloadWorking,
  onChanged,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  sources: FlashSourceRow[];
  // A file chosen: a new sheet, the new version of `replace`, or a working
  // sheet coming back.
  onAdd: (file: File, replace?: FlashSourceRow) => void;
  onDownloadWorking: () => void;
  onChanged: () => void;
}) {
  const deleteFn = useServerFn(deleteFlashSource);
  const proofFn = useServerFn(setFlashSheetProofread);
  const fileRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<FlashSourceRow | null>(null);
  const color = (book: string) =>
    topic.books.find((b) => b.code === book.split(",")[0].trim())?.color ?? "#e5e7eb";
  // Cards added before sheets were kept, by book.
  const untracked = new Map<string, number>();
  for (const c of cards)
    if (!c.removed && !c.sources[0]?.src)
      untracked.set(c.sources[0]?.book || "—", (untracked.get(c.sources[0]?.book || "—") ?? 0) + 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReplacing(null);
            fileRef.current?.click();
          }}
        >
          <FileUp className="mr-1 h-4 w-4" /> Add a sheet
        </Button>
        <span className="text-xs text-muted-foreground">
          Excel with <code>order</code>, <code>prompt</code>, <code>front</code>, <code>back</code>{" "}
          and <code>explanation_…</code> columns.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
        <span className="font-medium">Working sheet</span>
        <span className="min-w-0 flex-1 basis-60 text-xs text-muted-foreground">
          The whole topic in Excel with each card&apos;s <code>card_id</code>: edit it offline, then
          upload it with Add a sheet to update the same cards (rows without a card_id are added).
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!cards.some((c) => !c.removed)}
          onClick={onDownloadWorking}
        >
          <Download className="mr-1 h-4 w-4" /> Download working sheet
        </Button>
        <input
          ref={fileRef}
          type="file"
          aria-label="Sheet file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onAdd(file, replacing ?? undefined);
            setReplacing(null);
          }}
        />
      </div>
      {!sources.length && !untracked.size && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No sheets yet.
        </p>
      )}
      <ul className="space-y-2">
        {sources.map((s) => {
          const st = sheetStatus(s.id, cards, topic.columns);
          const reading = s.kind !== "sheet" && s.done < s.total;
          return (
            <li
              key={s.id}
              data-sheet={s.name}
              className="space-y-2 rounded-xl border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-1.5 text-xs text-slate-800"
                  style={{ background: color(s.book) }}
                >
                  {s.book}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s.name || KIND[s.kind]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {KIND[s.kind]} · added {new Date(s.created_at).toLocaleDateString("en-IN")}
                </span>
                {s.kind === "sheet" && (
                  <ProofToggle
                    source={s}
                    onSave={async (on) => {
                      try {
                        await proofFn({ data: { id: s.id, on } });
                        onChanged();
                      } catch (err) {
                        toast.error(errorText(err, "Couldn't save"));
                        return false;
                      }
                      return true;
                    }}
                  />
                )}
                {s.kind === "sheet" && (
                  <Button
                    aria-label={`Replace ${s.name || s.book}`}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplacing(s);
                      fileRef.current?.click();
                    }}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" /> Replace
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={`Remove ${s.name || s.book}`}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Remove “${s.name || s.book}”? Its ${st.cards} cards go (numbered ones stay, their numbers being in the app), and its versions merged into other books' cards are taken out of them.`,
                      )
                    )
                      return;
                    try {
                      const r = await deleteFn({ data: { id: s.id } });
                      toast.success(
                        `${r.deleted} cards removed${r.kept ? `; ${r.kept} numbered cards kept` : ""}`,
                      );
                      onChanged();
                    } catch (e) {
                      toast.error(errorText(e, "Couldn't remove it"));
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Remove
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.kind === "sheet" ? (
                  <Badge>{s.rows} rows in the sheet</Badge>
                ) : (
                  <Badge tone={reading ? "warn" : "muted"}>
                    {s.kind === "pdf" ? "Pages" : "Parts"} read {s.done}/{s.total}
                  </Badge>
                )}
                <Badge tone="primary">{st.cards} cards in the topic</Badge>
                <Badge tone={st.verified === st.cards && st.cards ? "good" : "muted"}>
                  {st.verified} verified
                </Badge>
                {st.errors > 0 && <Badge tone="bad">{st.errors} to recheck</Badge>}
                {st.noExplanation > 0 && (
                  <Badge tone="warn">{st.noExplanation} without explanation</Badge>
                )}
                {s.merged > 0 && (
                  <Badge title="Merged into another book's card (kept there as a version)">
                    {s.merged} merged into other books&apos; cards
                  </Badge>
                )}
                {st.mergedIn > 0 && s.merged === 0 && (
                  <Badge>{st.mergedIn} kept in other books&apos; cards</Badge>
                )}
                {s.deleted > 0 && <Badge tone="bad">{s.deleted} deleted</Badge>}
                {st.numbered > 0 && <Badge tone="primary">{st.numbered} numbered</Badge>}
                {st.removed > 0 && <Badge tone="warn">{st.removed} removed after numbering</Badge>}
                {s.todos.length > 0 && <Badge tone="warn">{s.todos.length} lines to check</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
      {untracked.size > 0 && (
        <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          Added before sheets were kept here:{" "}
          {[...untracked].map(([book, n]) => `${book} (${n} cards)`).join(", ")}. They stay in the
          topic; they can&apos;t be replaced as a sheet.
        </div>
      )}
    </div>
  );
}

// A sheet's "Proofread" mark, switched at any time.
function ProofToggle({
  source,
  onSave,
}: {
  source: FlashSourceRow;
  onSave: (on: boolean) => Promise<boolean>;
}) {
  const [on, setOn] = useState(source.proofread);
  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${on ? "border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}`}
      title="Its words get a green ✓ when books are compared; words only from sheets not proofread get a red ✗"
      data-proofread={on ? "yes" : "no"}
    >
      <input
        type="checkbox"
        aria-label={`${source.name || source.book} is proofread`}
        checked={on}
        onChange={async (e) => {
          const next = e.target.checked;
          setOn(next);
          if (!(await onSave(next))) setOn(!next);
        }}
      />
      {on ? "✓ Proofread" : "Not proofread"}
    </label>
  );
}

const n = (k: number, what = "card") => `${k} ${what}${k === 1 ? "" : "s"}`;
const firstLine = (t: string) => t.split("\n")[0] || "—";

// A sheet replacing the one added before, previewed: which cards stay as
// they are (with their merges, edits and verified marks), which get new
// text, which rows are new, and which cards go.
export function ReplaceDialog({
  topic,
  cards,
  file,
  sheet,
  replace,
  onClose,
  onDone,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  file: string;
  sheet: ParsedSheet;
  replace: FlashSourceRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const replaceFn = useServerFn(replaceFlashSheet);
  const [busy, setBusy] = useState(false);
  // Asked again for the new version.
  const [proofread, setProofread] = useState(false);
  const idOf = new Map(topic.columns.map((c) => [c.title.trim(), c.id]));
  const plan = planReplace(cards, replace.id, sheet.cards, idOf);
  const known = new Set(topic.columns.map((c) => c.title.trim()));
  const newCols = sheet.columns.filter((c) => !known.has(c.trim()));
  const keptNumbered = plan.gone.filter((g) => g.numbered);
  const goneNow = plan.gone.filter((g) => !g.numbered);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Replace “{replace.name || replace.book}” with “{file}”
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Rows are matched to the old sheet&apos;s cards by their word. Unchanged cards keep their
            merges, edits and verified marks.
          </p>
          <div className="flex flex-wrap gap-1.5" aria-label="What changes">
            <Badge tone="good">{n(plan.same)} the same</Badge>
            <Badge tone="warn">{n(plan.changed.length)} changed</Badge>
            <Badge tone="primary">{n(plan.added.length, "new row")}</Badge>
            <Badge tone="bad">{n(goneNow.length)} gone</Badge>
            {keptNumbered.length > 0 && (
              <Badge>{n(keptNumbered.length, "numbered card")} kept</Badge>
            )}
          </div>
          {plan.changed.length > 0 && (
            <details open className="rounded-lg border border-border p-2">
              <summary className="cursor-pointer font-medium">
                Changed: new text, to verify again
              </summary>
              <ul className="mt-2 space-y-1.5" lang="hi">
                {plan.changed.slice(0, 12).map((ch, i) => (
                  <li key={i} className="grid gap-1 text-xs sm:grid-cols-[8rem_1fr_1fr]">
                    <span className="font-medium">{firstLine(ch.before.front)}</span>
                    <span className="whitespace-pre-wrap rounded bg-red-500/10 px-1.5 line-through decoration-red-400/60">
                      {ch.before.back || "—"}
                    </span>
                    <span className="whitespace-pre-wrap rounded bg-emerald-500/10 px-1.5">
                      {ch.after.back || "—"}
                    </span>
                  </li>
                ))}
              </ul>
              {plan.changed.length > 12 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  and {plan.changed.length - 12} more
                </p>
              )}
            </details>
          )}
          {goneNow.length > 0 && (
            <details className="rounded-lg border border-border p-2">
              <summary className="cursor-pointer font-medium">
                Gone from the new sheet: taken out
              </summary>
              <p className="mt-1 text-xs text-muted-foreground" lang="hi">
                {goneNow.map((g) => firstLine(g.before.front)).join(", ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A card holding other books&apos; versions goes to the next book&apos;s version.
              </p>
            </details>
          )}
          {keptNumbered.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400" lang="hi">
              Not in the new sheet but numbered (in the app), so kept:{" "}
              {keptNumbered.map((g) => firstLine(g.before.front)).join(", ")}.
            </p>
          )}
          {newCols.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              New explanation columns for this topic: {newCols.join(", ")}.
            </p>
          )}
          <ProofreadBox checked={proofread} onChange={setProofread} before={replace.proofread} />
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await replaceFn({
                  data: {
                    topic_id: topic.id,
                    source_id: replace.id,
                    cards: sheet.cards,
                    columns: sheet.columns,
                    book: replace.book,
                    name: file,
                    proofread,
                  },
                });
                toast.success(
                  `Replaced: ${r.same} the same, ${r.changed} changed, ${r.added} new, ${r.gone} gone${r.kept ? `, ${r.kept} numbered kept` : ""}`,
                );
                onDone();
              } catch (e) {
                toast.error(errorText(e, "Couldn't replace the sheet"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Replacing…" : "Replace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A working sheet coming back, previewed: the cards it changes (text,
// verified mark, note), new rows, and ids that aren't this topic's.
export function WorkingDialog({
  topic,
  cards,
  file,
  rows,
  unknownCols,
  onClose,
  onDone,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  file: string;
  rows: WorkingRow[];
  unknownCols: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const applyFn = useServerFn(applyFlashWorking);
  const [busy, setBusy] = useState(false);
  const plan = planWorking(cards, rows);
  const nothing = !plan.changed.length && !plan.added.length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Update the cards from “{file}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5" aria-label="What changes">
            <Badge tone="good">{n(plan.same)} the same</Badge>
            <Badge tone="warn">{n(plan.changed.length)} changed</Badge>
            <Badge tone="primary">{n(plan.added.length, "new row")}</Badge>
            {plan.unknown.length > 0 && (
              <Badge tone="bad">{n(plan.unknown.length, "row")} with an id not in this topic</Badge>
            )}
          </div>
          {plan.changed.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border border-border p-2" lang="hi">
              {plan.changed.slice(0, 12).map((ch) => (
                <li key={ch.id} className="grid gap-1 text-xs sm:grid-cols-[8rem_1fr_1fr]">
                  <span className="font-medium">{firstLine(ch.before.front)}</span>
                  <span className="whitespace-pre-wrap rounded bg-red-500/10 px-1.5">
                    {ch.before.back || "—"}
                  </span>
                  <span className="whitespace-pre-wrap rounded bg-emerald-500/10 px-1.5">
                    {ch.after.back || "—"}
                    {ch.after.verified !== null && ch.after.verified !== ch.before.verified && (
                      <span className="ml-1 text-[11px] text-emerald-700">
                        {ch.after.verified ? "· verified" : "· not verified"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {plan.changed.length > 12 && (
                <li className="text-xs text-muted-foreground">
                  and {plan.changed.length - 12} more
                </li>
              )}
            </ul>
          )}
          {plan.unknown.length > 0 && (
            <p className="text-xs text-destructive">
              Rows whose card_id isn&apos;t a card of this topic are left out (from another topic,
              or deleted since).
            </p>
          )}
          {unknownCols.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Columns this topic doesn&apos;t have are left out: {unknownCols.join(", ")}. Add them
              in Settings first to bring them in.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Changed text needs verifying again unless you changed its verified mark in the sheet;
            each card keeps its old text in its History.
          </p>
          <Button
            disabled={busy || nothing}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await applyFn({ data: { topic_id: topic.id, rows } });
                toast.success(`${n(r.changed)} updated, ${n(r.added)} added`);
                onDone();
              } catch (e) {
                toast.error(errorText(e, "Couldn't update the cards"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {nothing
              ? "Nothing to change"
              : busy
                ? "Updating…"
                : `Update ${n(plan.changed.length)}${plan.added.length ? ` and add ${plan.added.length}` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
