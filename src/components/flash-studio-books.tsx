// The card studio's books: a Word file, a PDF or pasted text read by the AI
// into the topic's cards, piece by piece (or page by page), with progress,
// stopping and going on later, and the lines the editor must check.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Pause, Play, Trash2 } from "lucide-react";
import { addFlashSource, deleteFlashSource, readFlashSource } from "@/lib/flash-studio.functions";
import { isPdf, isWord, splitPieces, type Piece, type Todo } from "@/lib/flash-read";
import type { FlashSourceRow, FlashTopic } from "@/lib/flash-studio";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// A PDF being read stays here while the page is open (its pages go to the
// AI one at a time); after a reload it is chosen again to go on.
const pdfFiles = new Map<string, File>();

type Pending =
  | { kind: "word" | "text"; name: string; pieces: Piece[]; todos: Todo[]; chars: number }
  | { kind: "pdf"; name: string; file: File; pages: number };

async function prepare(file: File): Promise<Pending> {
  if (isPdf(file)) {
    const { pdfPageCount } = await import("@/lib/exam-pdf");
    return { kind: "pdf", name: file.name, file, pages: await pdfPageCount(file) };
  }
  let md: string;
  if (isWord(file)) {
    const { extractTextFromFile } = await import("@/lib/saathi-parse");
    md = await extractTextFromFile(file);
  } else md = await file.text();
  const { pieces, todos } = splitPieces(md);
  return { kind: isWord(file) ? "word" : "text", name: file.name, pieces, todos, chars: md.length };
}

export function BooksPanel({
  topic,
  sources,
  onChanged,
  openFile,
  onOpened,
  pasting,
  setPasting,
}: {
  topic: FlashTopic;
  sources: FlashSourceRow[];
  onChanged: () => void;
  // A Word/PDF/text file chosen from the topic's "Add" button.
  openFile: File | null;
  onOpened: () => void;
  // The topic's "Paste text" button.
  pasting: boolean;
  setPasting: (on: boolean) => void;
}) {
  const addFn = useServerFn(addFlashSource);
  const readFn = useServerFn(readFlashSource);
  const deleteFn = useServerFn(deleteFlashSource);
  const [pending, setPending] = useState<Pending | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, { done: number; cards: number }>>({});
  const stop = useRef(false);
  const resumeRef = useRef<HTMLInputElement>(null);
  const [resumeFor, setResumeFor] = useState<string | null>(null);
  const [openTodos, setOpenTodos] = useState<string | null>(null);

  // A file handed over by the topic's "Add" button.
  useEffect(() => {
    if (!openFile) return;
    onOpened();
    prepare(openFile)
      .then((p) => {
        if (p.kind !== "pdf" && !p.pieces.length) throw new Error("No text found in this file");
        setPending(p);
      })
      .catch((e) => toast.error(errorText(e, "Couldn't open the file")));
    // Only a new file starts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile]);

  const run = async (src: FlashSourceRow) => {
    if (running) return;
    stop.current = false;
    setRunning(src.id);
    let done = src.done;
    let cards = src.cards;
    try {
      if (src.kind === "pdf") {
        const file = pdfFiles.get(src.id);
        if (!file) {
          setResumeFor(src.id);
          resumeRef.current?.click();
          return;
        }
        const { eachPageImage } = await import("@/lib/exam-pdf");
        await eachPageImage(file, done + 1, async (_page, _pages, image) => {
          if (stop.current) return false;
          const r = await readFn({ data: { id: src.id, image } });
          done = r.done;
          cards = r.cards;
          setProgress((p) => ({ ...p, [src.id]: { done, cards } }));
          onChanged();
        });
      } else {
        while (done < src.total && !stop.current) {
          const r = await readFn({ data: { id: src.id } });
          done = r.done;
          cards = r.cards;
          setProgress((p) => ({ ...p, [src.id]: { done, cards } }));
          onChanged();
        }
      }
      if (done >= src.total) toast.success(`${src.book}: ${cards} cards read`);
    } catch (e) {
      toast.error(errorText(e, "The AI couldn't read this part; go on to try it again"));
    } finally {
      setRunning(null);
      onChanged();
    }
  };

  if (!sources.length && !pasting && !pending) return null;
  return (
    <section aria-label="Books" className="space-y-2">
      {sources.length > 0 && (
        <ul className="space-y-2">
          {sources.map((s) => {
            const live = progress[s.id];
            const done = Math.max(s.done, live?.done ?? 0);
            const cards = Math.max(s.cards, live?.cards ?? 0);
            const color = topic.books.find((b) => b.code === s.book)?.color ?? "#e5e7eb";
            const finished = done >= s.total;
            return (
              <li key={s.id} className="space-y-1.5 rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded px-1.5 text-xs text-slate-800"
                    style={{ background: color }}
                  >
                    {s.book}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.name || s.kind}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.kind === "pdf" ? "Page" : "Part"} {done}/{s.total} · {cards} cards
                  </span>
                  {s.todos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenTodos(openTodos === s.id ? null : s.id)}
                    >
                      <Badge tone="warn">{s.todos.length} to check</Badge>
                    </button>
                  )}
                  {s.error && !running && (
                    <Badge tone="bad" title={s.error}>
                      Stopped
                    </Badge>
                  )}
                  {!finished &&
                    (running === s.id ? (
                      <Button size="sm" variant="outline" onClick={() => (stop.current = true)}>
                        <Pause className="mr-1 h-4 w-4" /> Stop
                      </Button>
                    ) : (
                      <Button size="sm" disabled={!!running} onClick={() => void run(s)}>
                        <Play className="mr-1 h-4 w-4" /> {done ? "Go on" : "Read"}
                      </Button>
                    ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Take out ${s.book} ${s.name}`}
                    disabled={running === s.id}
                    onClick={async () => {
                      if (
                        !confirm(
                          `Take out ${s.book} (${s.name}) and the cards read from it that aren't numbered yet?`,
                        )
                      )
                        return;
                      try {
                        const r = await deleteFn({ data: { id: s.id } });
                        toast.success(
                          `${r.deleted} cards taken out${r.kept ? `; ${r.kept} numbered cards kept` : ""}`,
                        );
                        onChanged();
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't take it out"));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${s.total ? Math.round((done / s.total) * 100) : 0}%` }}
                  />
                </div>
                {openTodos === s.id && (
                  <ul
                    className="space-y-1 rounded-lg bg-amber-50/60 p-2 text-xs dark:bg-amber-950/20"
                    lang="hi"
                  >
                    {s.todos.map((t, i) => (
                      <li key={i}>
                        <b>{t.where}:</b> {t.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={resumeRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const src = sources.find((s) => s.id === resumeFor);
          if (!file || !src) return;
          pdfFiles.set(src.id, file);
          void run(src);
        }}
      />
      {pasting && (
        <PasteDialog
          onClose={() => setPasting(false)}
          onText={(text) => {
            setPasting(false);
            const { pieces, todos } = splitPieces(text);
            if (!pieces.length) return toast.error("Paste some text first");
            setPending({ kind: "text", name: "Pasted text", pieces, todos, chars: text.length });
          }}
        />
      )}
      {pending && (
        <SourceDialog
          topic={topic}
          pending={pending}
          onClose={() => setPending(null)}
          onStart={async (book, name) => {
            const src = await addFn({
              data: {
                topic_id: topic.id,
                book,
                name,
                kind: pending.kind,
                pieces:
                  pending.kind === "pdf"
                    ? []
                    : pending.pieces.map((p) => (p.heading ? `[${p.heading}]\n${p.text}` : p.text)),
                pages: pending.kind === "pdf" ? pending.pages : 0,
                todos: pending.kind === "pdf" ? [] : pending.todos,
              },
            });
            if (pending.kind === "pdf") pdfFiles.set(src.id, pending.file);
            setPending(null);
            onChanged();
            void run(src);
          }}
        />
      )}
    </section>
  );
}

function PasteDialog({ onClose, onText }: { onClose: () => void; onText: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste a book&apos;s text</DialogTitle>
        </DialogHeader>
        <Textarea
          aria-label="Book text"
          lang="hi"
          rows={14}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Headings, rules and examples as the book has them"
        />
        <Button disabled={!text.trim()} onClick={() => onText(text)}>
          Next
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SourceDialog({
  topic,
  pending,
  onClose,
  onStart,
}: {
  topic: FlashTopic;
  pending: Pending;
  onClose: () => void;
  onStart: (book: string, name: string) => Promise<void>;
}) {
  const guess = topic.books.find((b) => pending.name.includes(b.code))?.code ?? "";
  const [book, setBook] = useState(guess);
  const [name, setName] = useState(pending.name);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <BookOpen className="mr-1 inline h-5 w-5" /> Read “{pending.name}”
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            {pending.kind === "pdf"
              ? `${pending.pages} pages. The AI reads each page as an image, so scans and PDFs whose Hindi copies out garbled both work.`
              : `${pending.chars.toLocaleString("en-IN")} characters in ${pending.pieces.length} parts. The AI reads one part at a time, keeping the heading and rule each example sits under.`}
          </p>
          <p className="text-muted-foreground">
            Every example becomes a card in the {topic.columns.length ? "deck type's" : "topic's"}{" "}
            columns. Explanations come only from the book; empty ones are filled later, marked as
            not from your books.
          </p>
          {pending.kind !== "pdf" && pending.todos.length > 0 && (
            <div className="rounded-lg bg-amber-50/60 p-2 text-xs dark:bg-amber-950/20">
              <div className="font-medium">
                {pending.todos.length} lines to check (kept with the book):
              </div>
              <ul className="mt-1 space-y-0.5" lang="hi">
                {pending.todos.slice(0, 6).map((t, i) => (
                  <li key={i}>
                    {t.where}: {t.text}
                  </li>
                ))}
                {pending.todos.length > 6 && <li>…</li>}
              </ul>
            </div>
          )}
          <label className="block space-y-1">
            <span className="font-medium">Book (short name)</span>
            <Input
              list="flash-books"
              value={book}
              onChange={(e) => setBook(e.target.value)}
              placeholder="e.g. RP, Manas, IA"
            />
            <datalist id="flash-books">
              {topic.books.map((b) => (
                <option key={b.code} value={b.code} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button
            disabled={busy || !book.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onStart(book.trim(), name.trim());
              } catch (e) {
                toast.error(errorText(e, "Couldn't start reading"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Starting…" : "Read with AI"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
