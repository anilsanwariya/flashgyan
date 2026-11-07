// Many exam papers at once: their PDFs are uploaded and queued, and the
// server reads them in the background (a few pages at a time, with the
// browser closed). While this page is open it also reads, to go faster.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Layers, Play, RefreshCw, RotateCcw, Square, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listPaperQueue,
  markQueuedUploaded,
  removeQueuedPaper,
  retryQueuedPaper,
  startQueuedPaper,
  stepPaperQueue,
} from "@/lib/exam-papers.functions";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NEW_TYPE,
  PaperTypePicker,
  typeToMeta,
  type TypeChoice,
} from "@/components/exam-paper-sections";

type Row = { file: File; exam: string; date: string; kind: "objective" | "subjective" };
const BODIES = ["RPSC", "RSSB", "Other"];
// A paper's name from its file ("RAS_Pre_2023 (1).pdf" → "RAS Pre 2023").
export const nameFromFile = (name: string) =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/\(\d+\)$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STATUS: Record<
  string,
  { label: string; tone: "muted" | "warn" | "good" | "bad" | "primary" }
> = {
  uploading: { label: "Uploading", tone: "muted" },
  waiting: { label: "Waiting", tone: "muted" },
  reading: { label: "Reading", tone: "primary" },
  done: { label: "Done", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
};

export function PaperQueue({
  onOpen,
  showForm = true,
  onClose,
}: {
  onOpen: (paperId: string) => void;
  // The upload form (opened from the papers toolbar); the queue shows
  // whenever it has papers.
  showForm?: boolean;
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPaperQueue);
  const startFn = useServerFn(startQueuedPaper);
  const uploadedFn = useServerFn(markQueuedUploaded);
  const stepFn = useServerFn(stepPaperQueue);
  const retryFn = useServerFn(retryQueuedPaper);
  const removeFn = useServerFn(removeQueuedPaper);
  const [rows, setRows] = useState<Row[]>([]);
  const [body, setBody] = useState("RPSC");
  const [type, setType] = useState<TypeChoice>(NEW_TYPE);
  const [guessed, setGuessed] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [reading, setReading] = useState(false);
  const stop = useRef(false);
  const q = useQuery({
    queryKey: ["examQueue"],
    queryFn: () => listFn(),
    // While anything is waiting or being read, the list follows it.
    refetchInterval: (query) =>
      query.state.data?.items.some((i) => ["waiting", "reading", "uploading"].includes(i.status))
        ? 8000
        : false,
  });
  const items = q.data?.items ?? [];
  const active = items.filter((i) => ["waiting", "reading"].includes(i.status)).length;
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["examQueue"] }),
      qc.invalidateQueries({ queryKey: ["examPapers"] }),
    ]);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );

  async function add() {
    if (!rows.length) return;
    setBusy("Adding…");
    let added = 0;
    try {
      const { pdfPageCount } = await import("@/lib/exam-pdf");
      for (const [i, r] of rows.entries()) {
        if (!r.exam.trim()) throw new Error(`Give a name for ${r.file.name}.`);
        setBusy(`Uploading ${i + 1} of ${rows.length}: ${r.file.name}…`);
        const pages = await pdfPageCount(r.file);
        const t = typeToMeta(type, guessed);
        const res = await startFn({
          data: {
            meta: {
              exam: r.exam.trim(),
              subject: t.subject,
              conducted_by: body,
              exam_date: r.date || null,
              paper_type: t.paper_type,
              sections: t.sections,
              exam_syllabus_id: t.exam_syllabus_id,
            },
            kind: r.kind,
            file_name: r.file.name,
            pages,
          },
        });
        const { error } = await supabase.storage
          .from("exam-papers")
          .uploadToSignedUrl(res.upload.path, res.upload.token, r.file, {
            contentType: "application/pdf",
          });
        if (error) throw new Error(`${r.file.name}: ${error.message}`);
        await uploadedFn({ data: { id: res.item.id } });
        added++;
      }
      toast.success(`${added} paper${added === 1 ? "" : "s"} queued: read in the background`);
      setRows([]);
    } catch (e) {
      toast.error(errorText(e, "Couldn't queue it"));
      setRows(rows.slice(added));
    } finally {
      setBusy("");
      await refresh();
    }
  }

  // Reads here too while the page is open (the server reads anyway).
  async function readHere() {
    stop.current = false;
    setReading(true);
    try {
      for (;;) {
        if (stop.current) break;
        const r = await stepFn({ data: {} });
        await refresh();
        if (!r.did) break;
      }
    } catch (e) {
      toast.error(errorText(e, "Reading stopped"));
    } finally {
      setReading(false);
    }
  }

  if (q.data && !q.data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        The upload queue needs a database update: run the latest migration (exam_paper_queue).
      </p>
    );

  // Shown when opened, or while it holds papers.
  const form = showForm || rows.length > 0;
  if (!form && !items.length) return null;
  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      aria-label="Upload many papers"
      data-paper-queue
    >
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">
          {form ? "Upload many papers" : "Reading in the background"}
        </h3>
        {form && (
          <span className="text-sm text-muted-foreground">
            Read on the server a few pages at a time: you can close the browser. Add answer keys on
            each paper afterwards.
          </span>
        )}
        {form && onClose && !rows.length && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      <div className={`flex flex-wrap items-end gap-2 ${form ? "" : "hidden"}`}>
        <Input
          type="file"
          multiple
          accept="application/pdf"
          aria-label="Question paper PDFs"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].filter((f) => /\.pdf$/i.test(f.name));
            setRows([
              ...rows,
              ...files.map((file) => ({
                file,
                exam: nameFromFile(file.name),
                date: "",
                kind: (/mains?/i.test(file.name) ? "subjective" : "objective") as Row["kind"],
              })),
            ]);
            e.target.value = "";
          }}
          className="h-9 w-72 text-xs"
        />
        <select
          aria-label="Conducted by (all)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {BODIES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      {rows.length > 0 && (
        <div className="space-y-2">
          <PaperTypePicker
            exam={rows[0]?.exam ?? ""}
            value={type}
            onChange={setType}
            onGuess={setGuessed}
          />
          <ul className="space-y-1.5" aria-label="Papers to queue">
            {rows.map((r, i) => (
              <li key={`${r.file.name}${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                <Input
                  aria-label={`Name for ${r.file.name}`}
                  value={r.exam}
                  onChange={(e) =>
                    setRows(rows.map((x, k) => (k === i ? { ...x, exam: e.target.value } : x)))
                  }
                  className="h-8 w-64"
                />
                <Input
                  type="date"
                  aria-label={`Exam date for ${r.file.name}`}
                  value={r.date}
                  onChange={(e) =>
                    setRows(rows.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)))
                  }
                  className="h-8 w-40"
                />
                <select
                  aria-label={`Kind of ${r.file.name}`}
                  value={r.kind}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, k) =>
                        k === i ? { ...x, kind: e.target.value as Row["kind"] } : x,
                      ),
                    )
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="objective">Objective</option>
                  <option value="subjective">Written</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  {r.file.name} · {Math.max(1, Math.round(r.file.size / 1048576))} MB
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Leave out ${r.file.name}`}
                  onClick={() => setRows(rows.filter((_, k) => k !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button onClick={() => void add()} disabled={!!busy}>
            <FileUp className="mr-1 h-4 w-4" />{" "}
            {busy || `Queue ${rows.length} paper${rows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {form && <span className="font-medium">Queue</span>}
            {active > 0 && <span className="text-muted-foreground">{active} to read</span>}
            {active > 0 &&
              (reading ? (
                <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
                  <Square className="mr-1 h-3.5 w-3.5" /> Stop reading here
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void readHere()}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Read here now
                </Button>
              ))}
            {reading && <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
          </div>
          <ul className="divide-y divide-border text-sm" aria-label="Queue">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-2 py-1.5"
                data-queue-item={i.file_name}
              >
                <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                {i.paper_id ? (
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => onOpen(i.paper_id!)}
                  >
                    {i.exam}
                  </button>
                ) : (
                  <span>{i.exam}</span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {i.pages_done} of {i.pages} pages
                </span>
                {i.batch && (
                  <span className="text-xs text-muted-foreground" data-queue-batch>
                    {i.batch.pages} pages sent at half price{" "}
                    {new Date(i.batch.at).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    : read within hours
                  </span>
                )}
                {i.error && (
                  <span className="basis-full text-xs text-destructive sm:basis-auto">
                    {i.error}
                  </span>
                )}
                <span className="ml-auto flex gap-1">
                  {i.status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() =>
                        void retryFn({ data: { id: i.id } })
                          .then(refresh)
                          .catch((e) => toast.error(errorText(e, "Couldn't")))
                      }
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Try again
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    aria-label={`Remove ${i.exam} from the queue`}
                    onClick={() => {
                      if (
                        i.status !== "done" &&
                        !confirm("Stop reading this paper? What was read stays on the paper.")
                      )
                        return;
                      void removeFn({ data: { id: i.id } })
                        .then(refresh)
                        .catch((e) => toast.error(errorText(e, "Couldn't")));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
