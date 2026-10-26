// The card studio's Sheets tab: every sheet (and book) added to a topic with
// where its cards stand (in the topic, verified, to recheck, without an
// explanation, merged, deleted, numbered), to replace with a new version
// of the sheet or remove with its cards.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, RefreshCw, Trash2 } from "lucide-react";
import { deleteFlashSource } from "@/lib/flash-studio.functions";
import { sheetStatus } from "@/lib/flash-merge";
import type { FlashCard, FlashSourceRow, FlashTopic } from "@/lib/flash-studio";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

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
  onChanged,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  sources: FlashSourceRow[];
  // A file chosen: a new sheet, or the new version of `replace`.
  onAdd: (file: File, replace?: FlashSourceRow) => void;
  onChanged: () => void;
}) {
  const deleteFn = useServerFn(deleteFlashSource);
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
                  <Button
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
