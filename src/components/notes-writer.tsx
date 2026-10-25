// Admin: a notes book's notes. Each topic is written by the AI from its
// knowledge base passages (one topic a request), then edited in the topic
// editor (a page of its own, like the magazine's story editor). Lines written without a source
// passage carry ◇ and must be checked or replaced before the topic can be
// approved. The book prints as a student copy (approved topics, no marks) or
// a review copy.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, PenLine, Printer, RefreshCw, Sparkles } from "lucide-react";
import { listBookNotes, printNotesBook, writeNotesStep } from "@/lib/notes-books.functions";
import type { NotesStage } from "@/lib/notes-books";
import { NotesTopicEditor } from "@/components/notes-topic-editor";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

type Lang = "en" | "hi";
const COVER_TONE = { full: "good", partial: "warn", none: "bad" } as const;
const COVER_NAME = { full: "Covered", partial: "Partly covered", none: "Not covered" } as const;

export function NotesWriter({ id, stage }: { id: string; stage: NotesStage }) {
  return <NotesList id={id} stage={stage} />;
}

async function printView(html: string) {
  const w = window.open("", "_blank");
  if (!w) return toast.error("Allow pop-ups to open the print view");
  w.document.write(html);
  w.document.close();
  w.onload = () => setTimeout(() => w.print(), 500);
}

// ====================== The list ======================

function NotesList({ id, stage }: { id: string; stage: NotesStage }) {
  const [open, setOpen] = useState<string | null>(null);
  const onOpen = setOpen;
  const qc = useQueryClient();
  const listFn = useServerFn(listBookNotes);
  const stepFn = useServerFn(writeNotesStep);
  const printFn = useServerFn(printNotesBook);
  const q = useQuery({
    queryKey: ["bookNotes", id],
    queryFn: () => listFn({ data: { id } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["bookNotes", id] });

  async function write(redo?: string[]) {
    stop.current = false;
    const skip: string[] = [];
    let done = 0;
    try {
      for (;;) {
        setBusy(
          redo
            ? "Writing it again…"
            : `Writing the notes… ${done} topic${done === 1 ? "" : "s"} written`,
        );
        const r = await stepFn({ data: { id, skip, ...(redo ? { redo } : {}) } });
        done += r.done;
        skip.push(...r.missed);
        await refresh();
        if (redo || r.left === 0 || stop.current) break;
      }
      if (skip.length)
        toast.error(
          `${skip.length} topic${skip.length === 1 ? "" : "s"} couldn't be written: try again`,
        );
      if (done) toast.success(`${done} topic${done === 1 ? "" : "s"} written`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write"));
    } finally {
      setBusy(null);
      await refresh();
    }
  }
  async function print(lang: Lang, review: boolean) {
    try {
      await printView((await printFn({ data: { id, lang, review } })).html);
    } catch (e) {
      toast.error(errorText(e, "Couldn't open it"));
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return (
      <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load the notes")}</p>
    );
  const { rows, chapters } = q.data!;
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        This subject's master outline has no topics yet.
      </p>
    );
  const written = rows.filter((r) => r.status).length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const toCheck = rows.reduce((n, r) => n + r.unchecked, 0);
  const thin = rows.filter((r) => !r.status && r.coverage === "none").length;
  return (
    <div className="space-y-4">
      <section
        aria-label="Notes"
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-semibold">Notes</h3>
          <span className="text-sm text-muted-foreground" data-testid="notes-counts">
            {written} of {rows.length} topics written · {approved} approved
            {toCheck ? ` · ${toCheck} lines to check` : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Each topic is written from its knowledge base passages, in Hindi and English, in the
          book's layout. Every line shows the passages it came from; lines written without one carry
          ◇ and must be checked or replaced before the topic is approved. Definitions are kept only
          when found word for word in a passage.
        </p>
        {thin > 0 && (
          <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-2.5 text-sm">
            {thin} topic{thin === 1 ? " is" : "s are"} not covered by the knowledge base (Planner):
            their notes would be written mostly without sources. Upload material first, or check
            every line.
          </p>
        )}
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-primary">
            <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
            <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={written === rows.length} onClick={() => void write()}>
              <Sparkles className="mr-1 h-4 w-4" />
              {written < rows.length ? `Write the notes (${rows.length - written})` : "All written"}
            </Button>
            {(["hi", "en"] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant="outline"
                disabled={!approved}
                onClick={() => void print(l, false)}
              >
                <Printer className="mr-1 h-4 w-4" /> Student copy (
                {l === "hi" ? "Hindi" : "English"})
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={!written}
              onClick={() => void print("hi", true)}
            >
              Review copy
            </Button>
          </div>
        )}
      </section>
      <ol className="space-y-1.5" data-testid="note-topics">
        {rows.map((r, i) => {
          const ch = chapters.find((c) => c.n === r.chapter);
          return (
            <li key={r.topic_id}>
              {(i === 0 || rows[i - 1].chapter !== r.chapter) && ch && (
                <h4 className="mb-1 mt-3 font-semibold">
                  {ch.n}. {ch.name.hi || ch.name.en}{" "}
                  {ch.name.hi && ch.name.en !== ch.name.hi && (
                    <span className="font-normal text-muted-foreground">{ch.name.en}</span>
                  )}
                </h4>
              )}
              <div
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5 text-sm"
                data-topic={r.name.en}
              >
                <span className="w-12 flex-none tabular-nums text-muted-foreground">
                  {r.number}
                </span>
                <span className="min-w-0 flex-1 basis-[12rem] font-medium">
                  <span lang="hi">{r.name.hi || r.name.en}</span>
                  {r.name.hi && r.name.en !== r.name.hi && (
                    <span className="ml-2 font-normal text-muted-foreground">{r.name.en}</span>
                  )}
                </span>
                {r.asked > 0 && <Badge tone="warn">Asked {r.asked}×</Badge>}
                {r.coverage && (
                  <Badge tone={COVER_TONE[r.coverage as keyof typeof COVER_TONE]}>
                    {COVER_NAME[r.coverage as keyof typeof COVER_NAME]}
                  </Badge>
                )}
                {r.status === "approved" ? (
                  <Badge tone="good">
                    <BadgeCheck className="h-3 w-3" /> Approved
                  </Badge>
                ) : r.status ? (
                  <Badge tone="primary">Draft</Badge>
                ) : (
                  <Badge tone="muted">Not written</Badge>
                )}
                {r.unchecked > 0 && <Badge tone="bad">◇ {r.unchecked} to check</Badge>}
                {r.status ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => onOpen(r.topic_id)}
                  >
                    <PenLine className="mr-1 h-3.5 w-3.5" /> Open
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={!!busy}
                    onClick={() => void write([r.topic_id])}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> Write
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {open && (
        <NotesTopicEditor
          key={open}
          id={id}
          stage={stage}
          topic={open}
          topics={rows.filter((r) => r.status)}
          onNavigate={setOpen}
          onClose={() => setOpen(null)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}
