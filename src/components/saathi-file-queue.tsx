// Drag-and-drop / multi-file upload queue for the SAATHI deck form. Files are read
// strictly one at a time, in the order they were added. A file that fails is
// tried again a few times; if it still fails the queue stops there until it is
// retried or removed, so later files never jump ahead of it. Each file's text
// stays in its own editable box (or, for a single chunk, goes straight into
// the content).
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RotateCcw,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { extractPdfPages, extractTextFromFile } from "@/lib/saathi-parse";
import { cleanPdfPages, type CleanResult } from "@/lib/saathi-clean";
import type { SaathiMedium } from "@/lib/saathi.functions";

export type QueueStatus = "waiting" | "reading" | "done" | "failed";

export type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  chars?: number;
  error?: string;
  // Reading attempts so far, and when the next automatic one may start.
  attempts?: number;
  retryAt?: number;
  // The file's text as read (and cleaned), and as edited in its box.
  read?: string;
  text?: string;
  // PDF cleanup: what was removed, the uncleaned text, and the exact block that
  // was appended (so the cleanup can be undone while that block is unedited).
  removed?: CleanResult["removed"];
  raw?: string;
  block?: string;
  cleanupUndone?: boolean;
};

export type PdfCleanup = { enabled: boolean; phrases: string[] };

const ACCEPTED = /\.(pdf|docx|xlsx|xls|txt|md)$/i;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
// Reading a file is tried this many times in all, waiting this long before
// each new try. Errors that a retry can't fix are not retried.
export const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [3_000, 10_000];
const PERMANENT = /unsupported file type/i;

export function useFileQueue(opts: {
  medium: SaathiMedium;
  // When given, each file's text goes straight into the content: it is
  // appended and the exact block added is returned. Otherwise the text stays
  // in the file's own box until the deck is saved.
  onText?: (file: File, text: string) => string;
  // Called once for each file read.
  onRead?: (file: File) => void;
  cleanup: PdfCleanup;
  // Changing this (e.g. switching to another deck) empties the queue and drops
  // the result of any file still being read.
  resetKey: unknown;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const onTextRef = useRef(opts.onText);
  onTextRef.current = opts.onText;
  const onReadRef = useRef(opts.onRead);
  onReadRef.current = opts.onRead;
  const mediumRef = useRef(opts.medium);
  mediumRef.current = opts.medium;
  const cleanupRef = useRef(opts.cleanup);
  cleanupRef.current = opts.cleanup;
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setItems([]);
  }, [opts.resetKey]);

  const patch = (id: string, p: Partial<QueueItem>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  // Ticks when an automatic retry is due.
  const [clock, setClock] = useState(0);

  // Reads the first file not yet done, in order. A failed file stops the
  // queue; a file waiting for its retry holds it until then.
  useEffect(() => {
    const next = items.find((i) => i.status !== "done");
    if (!next || next.status !== "waiting") return;
    const wait = (next.retryAt ?? 0) - Date.now();
    if (wait > 0) {
      const t = setTimeout(() => setClock((c) => c + 1), wait);
      return () => clearTimeout(t);
    }
    const gen = generation.current;
    patch(next.id, { status: "reading", retryAt: undefined });
    (async () => {
      try {
        const isPdf = /\.pdf$/i.test(next.file.name);
        let text: string;
        let extra: Partial<QueueItem> = {};
        if (isPdf && cleanupRef.current.enabled) {
          const { markdown, pages } = await extractPdfPages(next.file, mediumRef.current);
          const cleaned = cleanPdfPages(pages, cleanupRef.current.phrases);
          text = cleaned.text.trim();
          extra = { removed: cleaned.removed, raw: markdown.trim() };
        } else {
          text = (await extractTextFromFile(next.file, mediumRef.current)).trim();
        }
        if (gen !== generation.current) return;
        if (!text) throw new Error("No text found in this file");
        const block = onTextRef.current?.(next.file, text);
        onReadRef.current?.(next.file);
        patch(next.id, {
          status: "done",
          chars: text.length,
          error: undefined,
          ...(block !== undefined ? { block } : { read: text, text }),
          ...extra,
        });
      } catch (err) {
        if (gen !== generation.current) return;
        const error = err instanceof Error ? err.message : "Could not read this file";
        const attempts = (next.attempts ?? 0) + 1;
        const again = attempts < MAX_ATTEMPTS && !PERMANENT.test(error);
        patch(next.id, {
          status: again ? "waiting" : "failed",
          attempts,
          retryAt: again ? Date.now() + RETRY_DELAYS_MS[attempts - 1] : undefined,
          error,
        });
      }
    })();
  }, [items, clock]);

  const busy = items.some((i) => i.status === "waiting" || i.status === "reading");
  // A file that still couldn't be read: retry or remove it before saving.
  const failed = items.find((i) => i.status === "failed");

  // Leaving the page would lose files that haven't been read yet.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function add(files: File[]) {
    const accepted: QueueItem[] = [];
    for (const file of files) {
      if (!ACCEPTED.test(file.name)) {
        toast.error(`${file.name}: use PDF, DOCX, XLSX, TXT or MD`);
      } else if (/\.pdf$/i.test(file.name) && file.size > MAX_PDF_BYTES) {
        toast.error(`${file.name}: PDF is over 20 MB`);
      } else {
        accepted.push({ id: crypto.randomUUID(), file, status: "waiting" });
      }
    }
    if (accepted.length) setItems((cur) => [...cur, ...accepted]);
  }

  return {
    items,
    busy,
    failed,
    add,
    patch,
    retry: (id: string) =>
      patch(id, { status: "waiting", attempts: 0, retryAt: undefined, error: undefined }),
    remove: (id: string) => setItems((cur) => cur.filter((i) => i.id !== id)),
    setText: (id: string, text: string) => patch(id, { text, chars: text.length }),
    clearFinished: () => setItems((cur) => cur.filter((i) => i.status !== "done")),
    // Empties the queue, e.g. once its files are saved.
    reset: () => {
      generation.current += 1;
      setItems([]);
    },
  };
}

export function FileDropZone({
  onFiles,
  disabled,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className="relative"
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-medium shadow">
            <Upload className="h-4 w-4" />
            Drop files to add them to this deck
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_ICON: Record<QueueStatus, ReactNode> = {
  waiting: <Clock className="h-4 w-4 text-muted-foreground" />,
  reading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
};

export function FileQueueList({
  queue,
  onUndoCleanup,
}: {
  queue: Pick<
    ReturnType<typeof useFileQueue>,
    "items" | "retry" | "remove" | "clearFinished" | "setText" | "failed"
  >;
  onUndoCleanup?: (item: QueueItem) => void;
}) {
  const [showRemoved, setShowRemoved] = useState<string | null>(null);
  // Text boxes the admin has folded away.
  const [folded, setFolded] = useState<Set<string>>(new Set());
  if (queue.items.length === 0) return null;
  const done = queue.items.filter((i) => i.status === "done").length;
  const reading = queue.items.findIndex((i) => i.status === "reading");
  // Files kept in their own boxes are only joined into the deck on save, so
  // clearing them would lose their text.
  const separate = queue.items.some((i) => i.text !== undefined);
  const failedAt = queue.failed ? queue.items.indexOf(queue.failed) : -1;
  const waitingAfter =
    failedAt >= 0 && queue.items.slice(failedAt + 1).some((i) => i.status !== "done");
  const toggle = (id: string) =>
    setFolded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mb-2 rounded-xl border border-border bg-muted/30 p-2">
      <div className="mb-1 flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span className={failedAt >= 0 ? "font-medium text-destructive" : ""}>
          {failedAt >= 0
            ? `Stopped at file ${failedAt + 1}: retry it or remove it${waitingAfter ? " to go on with the next files" : ""}.`
            : reading >= 0
              ? `Reading file ${reading + 1} of ${queue.items.length}…`
              : `${done} of ${queue.items.length} files read`}
        </span>
        {done > 0 && !separate && (
          <button type="button" className="hover:text-foreground" onClick={queue.clearFinished}>
            Clear finished
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {queue.items.map((item, n) => {
          const removedLines = item.removed?.reduce((c, r) => c + r.count, 0) ?? 0;
          const retrying = item.status === "waiting" && (item.attempts ?? 0) > 0;
          const hasBox = item.status === "done" && item.text !== undefined;
          const open = hasBox && !folded.has(item.id);
          return (
            <li key={item.id} className="rounded-lg bg-background px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                {retrying ? (
                  <RotateCcw className="h-4 w-4 animate-spin text-amber-600 [animation-duration:2s]" />
                ) : (
                  STATUS_ICON[item.status]
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="text-muted-foreground">{n + 1}.</span> {item.file.name}
                  </div>
                  <div
                    className={`text-xs ${item.status === "failed" || retrying ? "break-words" : "truncate"} ${
                      item.status === "failed"
                        ? "text-destructive"
                        : retrying
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {item.status === "waiting" &&
                      (retrying
                        ? `Couldn't read it (${item.error}). Trying again, attempt ${(item.attempts ?? 0) + 1} of ${MAX_ATTEMPTS}…`
                        : "Waiting")}
                    {item.status === "reading" &&
                      ((item.attempts ?? 0) > 0
                        ? `Trying again, attempt ${(item.attempts ?? 0) + 1} of ${MAX_ATTEMPTS}…`
                        : /\.pdf$/i.test(item.file.name)
                          ? "Reading PDF (can take a minute)…"
                          : "Reading…")}
                    {item.status === "done" &&
                      `${hasBox ? "" : "Added "}${item.chars?.toLocaleString()} characters`}
                    {item.status === "done" && removedLines > 0 && !item.cleanupUndone && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => setShowRemoved(showRemoved === item.id ? null : item.id)}
                        >
                          removed {removedLines} header/footer lines
                        </button>
                      </>
                    )}
                    {item.status === "done" && item.cleanupUndone && " · cleanup undone"}
                    {item.status === "done" && hasBox && item.text !== item.read && " · edited"}
                    {item.status === "failed" &&
                      `${item.error}${(item.attempts ?? 0) > 1 ? ` (tried ${item.attempts} times)` : ""}`}
                  </div>
                </div>
                {hasBox && (
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"
                    title={open ? "Fold the text" : "Show and edit the text"}
                    aria-label={`${open ? "Fold" : "Show"} the text of ${item.file.name}`}
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {item.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => queue.retry(item.id)}
                    className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"
                    title="Retry"
                    aria-label={`Retry ${item.file.name}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                {item.status !== "reading" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        hasBox &&
                        !confirm(`Remove ${item.file.name}? Its text won't be saved in the deck.`)
                      )
                        return;
                      queue.remove(item.id);
                    }}
                    className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"
                    title={
                      hasBox
                        ? "Remove this file and its text"
                        : item.status === "done"
                          ? "Hide (its text stays in the deck)"
                          : "Remove"
                    }
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {open && (
                <Textarea
                  value={item.text}
                  onChange={(e) => queue.setText(item.id, e.target.value)}
                  rows={8}
                  aria-label={`Text of ${item.file.name}`}
                  className="mt-1.5 font-mono text-xs"
                />
              )}
              {showRemoved === item.id && item.removed && (
                <div className="mt-1.5 rounded-md border border-border bg-muted/30 p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Removed from this PDF:</span>
                    {onUndoCleanup && (
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => {
                          onUndoCleanup(item);
                          setShowRemoved(null);
                        }}
                      >
                        Undo cleanup
                      </button>
                    )}
                  </div>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                    {item.removed.map((r) => (
                      <li key={r.line} className="truncate">
                        <span className="text-muted-foreground">{r.count}×</span>{" "}
                        {r.line || "(blank)"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
