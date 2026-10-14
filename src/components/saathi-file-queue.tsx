// Drag-and-drop / multi-file upload queue for the SAATHI deck form. Files are read
// strictly one at a time, in the order they were added, and each one's text is
// handed back as soon as it is ready so it can be appended to the deck.
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RotateCcw, Upload, X, XCircle, Clock } from "lucide-react";
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

export function useFileQueue(opts: {
  medium: SaathiMedium;
  // Appends the text to the deck and returns the exact block that was added.
  onText: (file: File, text: string) => string;
  cleanup: PdfCleanup;
  // Changing this (e.g. switching to another deck) empties the queue and drops
  // the result of any file still being read.
  resetKey: unknown;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const onTextRef = useRef(opts.onText);
  onTextRef.current = opts.onText;
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

  // Start the next waiting file whenever nothing is being read.
  useEffect(() => {
    if (items.some((i) => i.status === "reading")) return;
    const next = items.find((i) => i.status === "waiting");
    if (!next) return;
    const gen = generation.current;
    patch(next.id, { status: "reading", error: undefined });
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
        const block = onTextRef.current(next.file, text);
        patch(next.id, { status: "done", chars: text.length, block, ...extra });
      } catch (err) {
        if (gen !== generation.current) return;
        patch(next.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "Could not read this file",
        });
      }
    })();
  }, [items]);

  const busy = items.some((i) => i.status === "waiting" || i.status === "reading");

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
    add,
    patch,
    retry: (id: string) => patch(id, { status: "waiting", error: undefined }),
    remove: (id: string) => setItems((cur) => cur.filter((i) => i.id !== id)),
    clearFinished: () => setItems((cur) => cur.filter((i) => i.status !== "done")),
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
  queue: Pick<ReturnType<typeof useFileQueue>, "items" | "retry" | "remove" | "clearFinished">;
  onUndoCleanup?: (item: QueueItem) => void;
}) {
  const [showRemoved, setShowRemoved] = useState<string | null>(null);
  if (queue.items.length === 0) return null;
  const done = queue.items.filter((i) => i.status === "done").length;
  const reading = queue.items.findIndex((i) => i.status === "reading");

  return (
    <div className="mb-2 rounded-xl border border-border bg-muted/30 p-2">
      <div className="mb-1 flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {reading >= 0
            ? `Reading file ${reading + 1} of ${queue.items.length}…`
            : `${done} of ${queue.items.length} files added`}
        </span>
        {done > 0 && (
          <button type="button" className="hover:text-foreground" onClick={queue.clearFinished}>
            Clear finished
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {queue.items.map((item) => {
          const removedLines = item.removed?.reduce((n, r) => n + r.count, 0) ?? 0;
          return (
            <li key={item.id} className="rounded-lg bg-background px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                {STATUS_ICON[item.status]}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{item.file.name}</div>
                  <div
                    className={`truncate text-xs ${
                      item.status === "failed" ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {item.status === "waiting" && "Waiting"}
                    {item.status === "reading" &&
                      (/\.pdf$/i.test(item.file.name)
                        ? "Reading PDF (can take a minute)…"
                        : "Reading…")}
                    {item.status === "done" && `Added ${item.chars?.toLocaleString()} characters`}
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
                    {item.status === "failed" && item.error}
                  </div>
                </div>
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
                    onClick={() => queue.remove(item.id)}
                    className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"
                    title={item.status === "done" ? "Hide (its text stays in the deck)" : "Remove"}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
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
