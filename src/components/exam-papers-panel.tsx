// Admin: exam papers (RPSC, RSSB…), saved exam by exam with their answer
// keys. A question paper is read from its PDF page by page (scans too) or
// imported from Excel; the key from a PDF, Excel or a photo. Papers export to
// Excel in the same columns, and are checked against the current affairs
// magazine: which questions it covered, rated low or missed, and lessons for
// picking stories.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Download,
  FileUp,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  applyExamKey,
  checkExamPaper,
  createExamPaper,
  deleteExamPaper,
  getExamPaper,
  importExamPapers,
  listExamPapers,
  readExamPaperPage,
  setExamLesson,
  updateExamPaper,
  updateExamQuestion,
  type PaperSummary,
} from "@/lib/exam-papers.functions";
import {
  EXCEL_COLUMNS,
  OPTION_COUNT,
  keyForSeries,
  keyFromRows,
  normSeries,
  parseKeySheet,
  questionGaps,
  questionsToRows,
  rowsToPapers,
  type ExamPaper,
  type KeySheet,
  type ExamQuestion,
} from "@/lib/exam-papers";
import { formatDate } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const BODIES = ["RPSC", "RSSB", "UPSC", "Other"];
const SERIES = ["A", "B", "C", "D"];
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const isExcel = (f: File) => /\.(xlsx|xls|csv)$/i.test(f.name);
const isImage = (f: File) => /^image\//.test(f.type);

// The paper open, kept in the address (?paper=…).
function useOpenPaper(): [string | null, (id: string | null) => void] {
  const navigate = useNavigate();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("paper"));
  }, []);
  const choose = (next: string | null) => {
    setId(next);
    void navigate({
      to: ".",
      search: (s: Record<string, unknown>) => {
        const { paper: _p, ...rest } = s;
        return next ? { ...rest, paper: next } : rest;
      },
      replace: true,
    } as never);
  };
  return [id, choose];
}

// A question paper's PDF waiting to be read from this page (kept while the
// page is open, so reading can go on after opening the paper).
const pending = new Map<string, File>();

export function ExamPapers() {
  const [open, setOpen] = useOpenPaper();
  return open ? (
    <PaperView id={open} onBack={() => setOpen(null)} />
  ) : (
    <PaperList onOpen={setOpen} />
  );
}

// A key for several series, and the paper's series isn't known (or isn't
// one of them): the editor picks it.
class NeedSeries extends Error {
  constructor(
    message: string,
    readonly series: string[],
  ) {
    super(message);
  }
}

type KeyRead =
  | { kind: "sheet"; sheet: KeySheet }
  | { kind: "image"; image: { media_type: "image/jpeg"; data: string } };

// Reads an answer key file: a PDF's own text (a table), else its first page
// as an image for the AI; an Excel sheet; or a photo.
async function readKeyFile(file: File): Promise<KeyRead> {
  const lib = await import("@/lib/exam-pdf");
  const checked = (sheet: KeySheet & { problems: string[] }) => {
    if (sheet.problems.length)
      throw new Error(`The key's table doesn't line up: ${sheet.problems.join("; ")}.`);
    return { kind: "sheet" as const, sheet };
  };
  if (isExcel(file)) {
    const sheets = await lib.workbookSheets(file);
    return checked(keyFromRows(sheets[0]?.rows ?? []));
  }
  if (isImage(file)) return { kind: "image", image: await lib.imageFile(file) };
  if (!isPdf(file)) throw new Error("Use a PDF, an Excel sheet or a photo of the key.");
  const sheet = parseKeySheet(await lib.pdfText(file));
  if (Object.values(sheet.answers).some((a) => a.length >= 10)) return checked(sheet);
  // A scanned key: its first page as an image.
  let image: { media_type: "image/jpeg"; data: string } | null = null;
  await lib.eachPageImage(file, 1, async (_n, _t, img) => {
    image = img;
    return false;
  });
  if (!image) throw new Error("Couldn't read this key.");
  return { kind: "image", image };
}

// Applies a key read to a paper of this series (a key for several series
// needs it; a series picked now is saved on the paper).
async function applyKeyRead(
  paperId: string,
  read: KeyRead,
  series: string,
  picked: boolean,
  fn: ReturnType<typeof useServerFn<typeof applyExamKey>>,
) {
  const s = normSeries(series);
  if (read.kind === "sheet") {
    const { sheet } = read;
    if (sheet.series.length && !sheet.answers[s])
      throw new NeedSeries(
        s
          ? `This key has series ${sheet.series.join(", ")}, not ${s}. Which series is your paper?`
          : `This key has answers for series ${sheet.series.join(", ")}. Which series is your paper?`,
        sheet.series,
      );
    const r = await fn({
      data: {
        id: paperId,
        entries: keyForSeries(sheet, s),
        ...(picked || sheet.series.length ? { series: s } : {}),
      },
    });
    return { ...r, series: sheet.series.length ? s : "" };
  }
  try {
    const r = await fn({
      data: { id: paperId, image: read.image, ...(picked ? { series: s } : {}) },
    });
    return {
      applied: r.applied,
      deleted: r.deleted,
      series: "series" in r ? String(r.series) : "",
    };
  } catch (e) {
    const m = /\[series:([A-H,]+)\]/.exec(errorText(e, ""));
    if (m)
      throw new NeedSeries(
        errorText(e, "")
          .replace(/\s*\[series:[^\]]*\]/, "")
          .replace("Choose your paper's series first.", "Which series is your paper?"),
        m[1].split(","),
      );
    throw e;
  }
}

const keyToast = (r: { applied: number; deleted: number; series: string }) =>
  toast.success(
    `Answer key${r.series ? ` (series ${r.series})` : ""}: ${r.applied} answers${r.deleted ? `, ${r.deleted} deleted` : ""}`,
  );

// A key waiting for its paper's series (asked on the paper's page).
const keyWaiting = new Map<string, { read: KeyRead; series: string[]; message: string }>();

// ====================== The list ======================

function PaperList({ onOpen }: { onOpen: (id: string) => void }) {
  const listFn = useServerFn(listExamPapers);
  const q = useQuery({
    queryKey: ["examPapers"],
    queryFn: () => listFn(),
    // Back from a paper: what changed there shows here.
    refetchOnMount: true,
  });
  const [search, setSearch] = useState("");
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const data = q.data!;
  if (!data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        Exam papers need a database update: run the latest migration (exam_papers) in Lovable or the
        SQL editor, then reload this page.
      </p>
    );
  const term = search.trim().toLowerCase();
  const shown = data.papers.filter(
    (p) =>
      !term ||
      `${p.exam} ${p.subject} ${p.conducted_by} ${p.paper_code}`.toLowerCase().includes(term),
  );
  return (
    <div className="space-y-4">
      <AddPaper onAdded={onOpen} />
      {data.lessons.length > 0 && (
        <section className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
          <h3 className="font-semibold">Lessons in use for picking stories</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {data.lessons.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      {data.papers.length > 3 && (
        <div className="relative sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search papers"
            placeholder="Search papers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      )}
      {shown.length ? (
        <ul className="space-y-2" data-testid="papers">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="w-full rounded-2xl border border-border bg-card p-3 text-left hover:border-primary/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words font-medium">
                    {p.exam}
                    {p.subject && <span className="text-muted-foreground"> · {p.subject}</span>}
                  </span>
                  {p.conducted_by && <Badge>{p.conducted_by}</Badge>}
                  {p.exam_date && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.exam_date, "en")}
                    </span>
                  )}
                </div>
                <PaperBadges p={p} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {data.papers.length ? "No paper matches." : "No papers yet."}
        </p>
      )}
    </div>
  );
}

function PaperBadges({ p }: { p: PaperSummary }) {
  const reading = p.source === "pdf" && p.pages > 0 && p.pages_done < p.pages;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
      <Badge tone="primary">
        {p.questions}
        {p.questions_total ? ` of ${p.questions_total}` : ""} questions
      </Badge>
      {reading && (
        <Badge tone="warn">
          Read {p.pages_done} of {p.pages} pages
        </Badge>
      )}
      {p.key_added ? (
        <Badge tone="good">
          Key: {p.answered} answers{p.deleted ? `, ${p.deleted} deleted` : ""}
        </Badge>
      ) : (
        <Badge tone="muted">No answer key</Badge>
      )}
      {p.incomplete > 0 && <Badge tone="warn">{p.incomplete} to check</Badge>}
      {p.checked_at && (
        <Badge tone="primary">
          Magazine: {p.covered} covered · {p.low} low · {p.missed} missed
        </Badge>
      )}
    </div>
  );
}

function AddPaper({ onAdded }: { onAdded: (id: string) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createExamPaper);
  const importFn = useServerFn(importExamPapers);
  const keyFn = useServerFn(applyExamKey);
  const [openForm, setOpenForm] = useState(false);
  const [exam, setExam] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("RPSC");
  const [date, setDate] = useState("");
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [series, setSeries] = useState("");
  // The series a key has, when it needs the paper's.
  const [keySeries, setKeySeries] = useState<string[] | null>(null);
  const [busy, setBusy] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!paperFile) return;
    setBusy("Adding…");
    try {
      // The key first: one for several series needs the paper's series.
      let keyRead: KeyRead | null = null;
      if (keyFile) {
        setBusy("Reading the answer key…");
        keyRead = await readKeyFile(keyFile);
        const sheet = keyRead.kind === "sheet" ? keyRead.sheet : null;
        if (sheet?.series.length && !sheet.answers[series]) {
          setKeySeries(sheet.series);
          throw new Error(
            series
              ? `This key has series ${sheet.series.join(", ")}, not ${series}.`
              : `This key has answers for series ${sheet.series.join(", ")}: choose your paper's series.`,
          );
        }
      }
      const meta = {
        exam: exam.trim(),
        subject: subject.trim(),
        conducted_by: body,
        exam_date: date || null,
        series,
      };
      let id: string;
      if (isExcel(paperFile)) {
        setBusy("Reading the sheet…");
        const { workbookSheets } = await import("@/lib/exam-pdf");
        const papers = rowsToPapers(await workbookSheets(paperFile), meta);
        const r = await importFn({
          data: { papers, conducted_by: body, exam_date: date || null },
        });
        id = r.papers[0];
        toast.success(
          `${r.questions} questions imported${r.papers.length > 1 ? ` into ${r.papers.length} papers` : ""}`,
        );
      } else if (isPdf(paperFile)) {
        if (!meta.exam) throw new Error("Give the exam's name.");
        const { pdfPageCount } = await import("@/lib/exam-pdf");
        const pages = await pdfPageCount(paperFile);
        const paper = await createFn({ data: { meta, pages } });
        id = paper.id;
        pending.set(id, paperFile);
        toast.success(`Paper added: reading its ${pages} pages`);
      } else throw new Error("Use the question paper's PDF or an Excel sheet.");
      if (keyRead) {
        setBusy("Adding the answer key…");
        try {
          keyToast(await applyKeyRead(id, keyRead, series, !!series, keyFn));
        } catch (err) {
          // Asked on the paper's page.
          if (err instanceof NeedSeries)
            keyWaiting.set(id, { read: keyRead, series: err.series, message: err.message });
          else toast.error(errorText(err, "Couldn't add the answer key"));
        }
      }
      await qc.invalidateQueries({ queryKey: ["examPapers"] });
      onAdded(id);
    } catch (err) {
      toast.error(errorText(err, "Couldn't add it"));
    } finally {
      setBusy("");
    }
  }

  if (!openForm)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Question papers with their answer keys, exam by exam. Export any paper to Excel, or import
          one in the same columns: {EXCEL_COLUMNS.join(", ")}.
        </p>
        <Button onClick={() => setOpenForm(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add a paper
        </Button>
      </div>
    );
  return (
    <form
      onSubmit={add}
      aria-label="Add a paper"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <h3 className="font-semibold">Add a paper</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Exam name"
          placeholder="Exam name, e.g. RAS Pre 2023"
          value={exam}
          maxLength={200}
          onChange={(e) => setExam(e.target.value)}
        />
        <Input
          aria-label="Subject"
          placeholder="Subject, e.g. G.K. & G.S."
          value={subject}
          maxLength={200}
          onChange={(e) => setSubject(e.target.value)}
        />
        <select
          aria-label="Conducted by"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {BODIES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <div className="space-y-1">
          <select
            aria-label="Series"
            value={series}
            onChange={(e) => {
              setSeries(e.target.value);
              setKeySeries(null);
            }}
            className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${keySeries ? "border-amber-500" : "border-input"}`}
          >
            <option value="">Series / set: not given</option>
            {SERIES.map((x) => (
              <option key={x} value={x}>
                Series {x}
              </option>
            ))}
          </select>
          {keySeries && (
            <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">
              The key has answers for series {keySeries.join(", ")}. Choose the series printed on
              your question paper.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Exam date
          <Input
            type="date"
            aria-label="Exam date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 flex-1"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Question paper</span>
          <Input
            type="file"
            aria-label="Question paper file"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={(e) => setPaperFile(e.target.files?.[0] ?? null)}
          />
          <span className="block text-xs text-muted-foreground">
            PDF (scanned is fine) or Excel. Excel can hold several papers: its own exam names are
            used.
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Answer key (optional)</span>
          <Input
            type="file"
            aria-label="Answer key file"
            accept=".pdf,.xlsx,.xls,.csv,image/*"
            onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
          />
          <span className="block text-xs text-muted-foreground">
            PDF, Excel or a photo, also a key for several series (A, B, C, D). You can add it later
            too.
          </span>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!!busy || !paperFile}>
          <FileUp className="mr-1 h-4 w-4" /> {busy || "Add paper"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpenForm(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ====================== One paper ======================

type Filter = "all" | "answer" | "deleted" | "check" | "ca";
type Lang = "both" | "hi" | "en";

function PaperView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getExamPaper);
  const readFn = useServerFn(readExamPaperPage);
  const keyFn = useServerFn(applyExamKey);
  const deleteFn = useServerFn(deleteExamPaper);
  const q = useQuery({
    queryKey: ["examPaper", id],
    queryFn: () => getFn({ data: { id } }),
    refetchOnMount: true,
  });
  const [reading, setReading] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [lang, setLang] = useState<Lang>("both");
  const [editing, setEditing] = useState(false);
  // A key for several series, waiting for the paper's series.
  const [askSeries, setAskSeries] = useState(() => keyWaiting.get(id) ?? null);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["examPaper", id] }),
      qc.invalidateQueries({ queryKey: ["examPapers"] }),
    ]);

  // Reads the PDF's pages from where it got to (the file chosen when the
  // paper was added, or again now).
  async function read(file: File, fromPage: number) {
    setReading(`Opening the PDF…`);
    stop.current = false;
    try {
      const { eachPageImage } = await import("@/lib/exam-pdf");
      const found = new Set<number>();
      await eachPageImage(file, fromPage, async (page, pages, image) => {
        if (stop.current) return false;
        setReading(`Reading page ${page} of ${pages}…`);
        let tries = 0;
        for (;;) {
          try {
            const r = await readFn({ data: { id, page, pages, image } });
            for (const n of r.questions) found.add(n);
            break;
          } catch (e) {
            // One more try: a long page can time out.
            if (++tries >= 2) throw e;
          }
        }
        if (page % 2 === 0) await refresh();
      });
      // Stopped (or this view closed): the file stays, to go on from there.
      if (!stop.current) {
        pending.delete(id);
        toast.success(`Paper read: ${found.size} questions found`);
      }
    } catch (e) {
      toast.error(errorText(e, "Reading stopped"));
    } finally {
      setReading(null);
      await refresh();
    }
  }

  const data = q.data;
  const paper = data?.paper;
  // A paper just added starts reading at once.
  useEffect(() => {
    const file = pending.get(id);
    if (paper && file && !reading && paper.pages_done < paper.pages)
      void read(file, paper.pages_done + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !paper)
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All papers
        </Button>
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load it")}</p>
      </div>
    );
  const questions = data!.questions;
  const unread = paper.source === "pdf" && paper.pages > 0 && paper.pages_done < paper.pages;
  const answered = questions.filter((x) => x.correct).length;
  const deleted = questions.filter((x) => x.deleted).length;
  const toCheck = questions.filter((x) => questionGaps(x).length);
  const shown = questions.filter((x) =>
    filter === "answer"
      ? !x.correct && !x.deleted
      : filter === "deleted"
        ? x.deleted
        : filter === "check"
          ? questionGaps(x).length > 0
          : filter === "ca"
            ? x.ca
            : true,
  );

  async function exportExcel() {
    try {
      const { saveWorkbook } = await import("@/lib/exam-pdf");
      const name = `${paper!.exam}${paper!.subject ? ` - ${paper!.subject}` : ""}`
        .replace(/[^\p{L}\p{N} .&-]+/gu, "")
        .slice(0, 80);
      await saveWorkbook(`${name}.xlsx`, [
        { name: "English", rows: questionsToRows(paper!, questions, "en") },
        { name: "Hindi", rows: questionsToRows(paper!, questions, "hi") },
      ]);
    } catch (e) {
      toast.error(errorText(e, "Couldn't export"));
    }
  }

  // A key read (from a file, or waiting for the series), for the paper's
  // series or the one just picked.
  async function addKey(read: KeyRead | File, picked?: string) {
    setReading("Reading the answer key…");
    try {
      const kr = read instanceof File ? await readKeyFile(read) : read;
      setAskSeries(null);
      keyWaiting.delete(id);
      try {
        keyToast(await applyKeyRead(id, kr, picked ?? paper!.series, picked !== undefined, keyFn));
      } catch (e) {
        if (!(e instanceof NeedSeries)) throw e;
        setAskSeries({ read: kr, series: e.series, message: e.message });
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't read the key"));
    } finally {
      setReading(null);
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> All papers
      </Button>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        {editing ? (
          <PaperDetails paper={paper} onDone={() => setEditing(false)} onSaved={refresh} />
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <h2 className="break-words text-lg font-semibold">{paper.exam}</h2>
              <p className="text-sm text-muted-foreground">
                {[
                  paper.subject,
                  paper.conducted_by,
                  paper.exam_date && formatDate(paper.exam_date, "en"),
                  paper.paper_code && `Paper code ${paper.paper_code}`,
                  paper.series && `Series ${paper.series}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Details
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportExcel()}
              disabled={!questions.length}
            >
              <Download className="mr-1 h-4 w-4" /> Export to Excel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete paper"
              onClick={() => {
                if (confirm(`Delete “${paper.exam}” and its ${questions.length} questions?`))
                  void deleteFn({ data: { id } })
                    .then(async () => {
                      toast.success("Paper deleted");
                      await qc.invalidateQueries({ queryKey: ["examPapers"] });
                      onBack();
                    })
                    .catch((e) => toast.error(errorText(e, "Couldn't delete it")));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge tone="primary">
            {questions.length}
            {paper.questions_total ? ` of ${paper.questions_total}` : ""} questions
          </Badge>
          {paper.key_added ? (
            <Badge tone="good">
              {answered} answers{deleted ? `, ${deleted} deleted` : ""}
            </Badge>
          ) : (
            <Badge tone="muted">No answer key</Badge>
          )}
          {toCheck.length > 0 && <Badge tone="warn">{toCheck.length} to check</Badge>}
        </div>
        {reading ? (
          <p className="flex items-center gap-2 text-sm text-primary" role="status">
            <RefreshCw className="h-4 w-4 animate-spin" /> {reading}
            {reading.startsWith("Reading page") && (
              <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
                Stop
              </Button>
            )}
          </p>
        ) : (
          unread && (
            <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
              <p>
                {paper.pages_done} of {paper.pages} pages read. Choose the question paper's PDF to
                go on from page {paper.pages_done + 1}.
              </p>
              <Input
                type="file"
                accept=".pdf"
                aria-label="Question paper PDF to go on"
                className="mt-2"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void read(f, paper.pages_done + 1);
                }}
              />
            </div>
          )
        )}
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4 text-primary" />
          <span className="font-medium">
            {paper.key_added ? "Answer key added" : "Add the answer key"}
          </span>
          <Input
            type="file"
            aria-label="Answer key"
            accept=".pdf,.xlsx,.xls,.csv,image/*"
            disabled={!!reading}
            className="h-9 max-w-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addKey(f);
              e.target.value = "";
            }}
          />
          {paper.key_added && (
            <span className="text-xs text-muted-foreground">A new key replaces its answers.</span>
          )}
        </label>
        {askSeries && (
          <div
            role="group"
            aria-label="Which series"
            className="space-y-2 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm"
          >
            <p>{askSeries.message}</p>
            <p className="text-xs text-muted-foreground">
              The series (set) is printed on the question paper's cover. The answers for it are
              picked from the key.
            </p>
            <div className="flex flex-wrap gap-2">
              {askSeries.series.map((x) => (
                <Button key={x} size="sm" onClick={() => void addKey(askSeries.read, x)}>
                  Series {x}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAskSeries(null);
                  keyWaiting.delete(id);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <MagazineCheck
        paper={paper}
        questions={questions}
        stories={data!.stories}
        lessonsInUse={data!.lessons}
        onChanged={refresh}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Show questions" className="flex flex-wrap gap-1">
          {(
            [
              ["all", `All (${questions.length})`],
              ["answer", `No answer (${questions.filter((x) => !x.correct && !x.deleted).length})`],
              ["deleted", `Deleted (${deleted})`],
              ["check", `To check (${toCheck.length})`],
              ...(questions.some((x) => x.ca)
                ? [["ca", `Current affairs (${questions.filter((x) => x.ca).length})`]]
                : []),
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={filter === k}
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["both", "hi", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={`rounded-md px-2.5 py-1 ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {l === "both" ? "Both" : l === "hi" ? "हिंदी" : "English"}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ol className="space-y-2" data-testid="questions">
          {shown.map((x) => (
            <QuestionCard
              key={x.id}
              q={x}
              lang={lang}
              story={x.matched_item ? data!.stories[x.matched_item] : undefined}
              onChanged={refresh}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {questions.length
            ? "No question here."
            : unread || reading
              ? "Reading the paper…"
              : "No questions yet."}
        </p>
      )}
    </div>
  );
}

function PaperDetails({
  paper,
  onDone,
  onSaved,
}: {
  paper: ExamPaper;
  onDone: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const fn = useServerFn(updateExamPaper);
  const [f, setF] = useState({
    exam: paper.exam,
    subject: paper.subject,
    conducted_by: paper.conducted_by,
    exam_date: paper.exam_date ?? "",
    paper_code: paper.paper_code,
    series: paper.series ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void fn({ data: { id: paper.id, meta: { ...f, exam_date: f.exam_date || null } } })
          .then(async () => {
            toast.success("Details saved");
            await onSaved();
            onDone();
          })
          .catch((err) => toast.error(errorText(err, "Couldn't save")))
          .finally(() => setBusy(false));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Exam name"
          value={f.exam}
          maxLength={200}
          onChange={(e) => setF({ ...f, exam: e.target.value })}
        />
        <Input
          aria-label="Subject"
          placeholder="Subject"
          value={f.subject}
          maxLength={200}
          onChange={(e) => setF({ ...f, subject: e.target.value })}
        />
        <Input
          aria-label="Conducted by"
          placeholder="Conducted by"
          value={f.conducted_by}
          maxLength={100}
          onChange={(e) => setF({ ...f, conducted_by: e.target.value })}
        />
        <Input
          type="date"
          aria-label="Exam date"
          value={f.exam_date}
          onChange={(e) => setF({ ...f, exam_date: e.target.value })}
        />
        <Input
          aria-label="Paper code"
          placeholder="Paper code"
          value={f.paper_code}
          maxLength={60}
          onChange={(e) => setF({ ...f, paper_code: e.target.value })}
        />
        <select
          aria-label="Series"
          value={f.series}
          onChange={(e) => setF({ ...f, series: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Series / set: not given</option>
          {SERIES.map((x) => (
            <option key={x} value={x}>
              Series {x}
            </option>
          ))}
        </select>
      </div>
      {paper.key_added && f.series !== (paper.series ?? "") && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The answers already added stay as they are: add the key again for this series.
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy || !f.exam.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const MATCH_TEXT = {
  covered: "Covered",
  low: "Had it, left out or rated low",
  missed: "Missed",
} as const;
const MATCH_TONE = { covered: "good", low: "warn", missed: "bad" } as const;

function QuestionCard({
  q,
  lang,
  story,
  onChanged,
}: {
  q: ExamQuestion;
  lang: Lang;
  story?: { date: string; headline: string; status: string };
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const gaps = questionGaps(q);
  const show = (l: "en" | "hi") => lang === "both" || lang === l;
  return (
    <li
      data-question={q.q_no}
      className={`space-y-2 rounded-2xl border bg-card p-3 text-sm ${q.deleted ? "border-dashed opacity-70" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Q{q.q_no}</span>
        {q.deleted && <Badge tone="bad">Deleted</Badge>}
        {!q.deleted && !q.correct && <Badge tone="muted">No answer</Badge>}
        {gaps.length > 0 && <Badge tone="warn">Check: {gaps.join(", ")}</Badge>}
        {q.ca !== null && <Badge>{q.ca ? "Current affairs" : "Static"}</Badge>}
        {q.match && <Badge tone={MATCH_TONE[q.match]}>{MATCH_TEXT[q.match]}</Badge>}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7"
          aria-label={`Edit question ${q.q_no}`}
          onClick={() => setEditing((e) => !e)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {editing ? (
        <QuestionEditor q={q} onDone={() => setEditing(false)} onSaved={onChanged} />
      ) : (
        <>
          {(["hi", "en"] as const).filter(show).map((l) => {
            const text = l === "hi" ? q.question_hi : q.question_en;
            const extra = l === "hi" ? q.extra_hi : q.extra_en;
            return (
              <div key={l} lang={l} className="space-y-1">
                <p className="break-words">
                  {text || <span className="text-muted-foreground">—</span>}
                </p>
                {extra && (
                  <p className="whitespace-pre-line break-words text-muted-foreground">{extra}</p>
                )}
                <ol className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {q.options.map((o, i) => (
                    <li
                      key={i}
                      className={`break-words ${q.correct === i + 1 ? "font-semibold text-green-700 dark:text-green-400" : ""}`}
                    >
                      ({i + 1}) {o[l] || "—"}{" "}
                      {q.correct === i + 1 && (
                        <Check className="inline h-3.5 w-3.5" aria-label="correct" />
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
          {q.match && (
            <p className="text-xs text-muted-foreground">
              {story ? (
                <>
                  Our story:{" "}
                  <a
                    className="text-primary underline"
                    href={`/admin?section=ca.daily&date=${story.date}`}
                  >
                    {formatDate(story.date, "en")} — {story.headline}
                  </a>
                  {story.status === "dropped" ? " (left out)" : ""}
                </>
              ) : null}
              {q.match_note && !q.match_note.startsWith("search:") ? ` · ${q.match_note}` : ""}
            </p>
          )}
        </>
      )}
    </li>
  );
}

function QuestionEditor({
  q,
  onDone,
  onSaved,
}: {
  q: ExamQuestion;
  onDone: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const fn = useServerFn(updateExamQuestion);
  const [f, setF] = useState({
    question_en: q.question_en,
    question_hi: q.question_hi,
    extra_en: q.extra_en,
    extra_hi: q.extra_hi,
    options: q.options.map((o) => ({ ...o })),
    answer: q.deleted ? "deleted" : q.correct ? String(q.correct) : "",
  });
  const [busy, setBusy] = useState(false);
  const setOption = (i: number, l: "en" | "hi", v: string) =>
    setF({ ...f, options: f.options.map((o, k) => (k === i ? { ...o, [l]: v } : o)) });
  return (
    <form
      className="space-y-2"
      aria-label={`Edit question ${q.q_no}`}
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void fn({
          data: {
            id: q.id,
            patch: {
              question_en: f.question_en,
              question_hi: f.question_hi,
              extra_en: f.extra_en,
              extra_hi: f.extra_hi,
              options: f.options,
              deleted: f.answer === "deleted",
              correct: /^[1-4]$/.test(f.answer) ? Number(f.answer) : null,
            },
          },
        })
          .then(async () => {
            toast.success(`Question ${q.q_no} saved`);
            await onSaved();
            onDone();
          })
          .catch((err) => toast.error(errorText(err, "Couldn't save")))
          .finally(() => setBusy(false));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          aria-label="Question (Hindi)"
          rows={3}
          value={f.question_hi}
          onChange={(e) => setF({ ...f, question_hi: e.target.value })}
          placeholder="प्रश्न"
        />
        <Textarea
          aria-label="Question (English)"
          rows={3}
          value={f.question_en}
          onChange={(e) => setF({ ...f, question_en: e.target.value })}
          placeholder="Question"
        />
        <Textarea
          aria-label="Other part (Hindi)"
          rows={2}
          value={f.extra_hi}
          onChange={(e) => setF({ ...f, extra_hi: e.target.value })}
          placeholder="कथन / सूची (यदि हो)"
        />
        <Textarea
          aria-label="Other part (English)"
          rows={2}
          value={f.extra_en}
          onChange={(e) => setF({ ...f, extra_en: e.target.value })}
          placeholder="Statements / lists (if any)"
        />
        {Array.from({ length: OPTION_COUNT }, (_, i) => (
          <div key={i} className="contents">
            <Input
              aria-label={`Option ${i + 1} (Hindi)`}
              value={f.options[i]?.hi ?? ""}
              onChange={(e) => setOption(i, "hi", e.target.value)}
              placeholder={`विकल्प ${i + 1}`}
            />
            <Input
              aria-label={`Option ${i + 1} (English)`}
              value={f.options[i]?.en ?? ""}
              onChange={(e) => setOption(i, "en", e.target.value)}
              placeholder={`Option ${i + 1}`}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Correct option"
          value={f.answer}
          onChange={(e) => setF({ ...f, answer: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">No answer</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={String(n)}>
              Correct: option {n}
            </option>
          ))}
          <option value="deleted">Deleted</option>
        </select>
        <Button size="sm" type="submit" disabled={busy}>
          Save
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ====================== Against the magazine ======================

function MagazineCheck({
  paper,
  questions,
  stories,
  lessonsInUse,
  onChanged,
}: {
  paper: ExamPaper;
  questions: ExamQuestion[];
  stories: Record<string, { date: string; headline: string; status: string }>;
  lessonsInUse: string[];
  onChanged: () => Promise<unknown>;
}) {
  const checkFn = useServerFn(checkExamPaper);
  const lessonFn = useServerFn(setExamLesson);
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const live = questions.filter((x) => !x.deleted && (x.question_en || x.question_hi));
  const ca = live.filter((x) => x.ca);
  const count = (m: "covered" | "low" | "missed") => ca.filter((x) => x.match === m).length;

  async function run(restart: boolean) {
    stop.current = false;
    setBusy("Starting…");
    try {
      for (let i = 0; i < 400 && !stop.current; i++) {
        const r = await checkFn({ data: { id: paper.id, restart: restart && i === 0 } });
        setBusy(
          `${r.sorted} of ${r.total} sorted · ${r.matched} current affairs questions matched`,
        );
        if (i % 3 === 0 || r.done) await onChanged();
        if (r.done) break;
      }
      toast.success("Checked against the magazine");
    } catch (e) {
      toast.error(errorText(e, "Checking stopped"));
    } finally {
      setBusy(null);
      await onChanged();
    }
  }

  async function toggle(lesson: string, on: boolean) {
    try {
      await lessonFn({ data: { lesson, on } });
      toast.success(on ? "Used in picking stories" : "No longer used");
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }

  const missedOrLow = ca.filter((x) => x.match === "missed" || x.match === "low");
  return (
    <section
      aria-label="Against the magazine"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Against the magazine</h3>
          <p className="text-sm text-muted-foreground">
            Sorts the questions into current affairs and static, then finds our story for each
            current affairs question (news of the 18 months before the exam).
          </p>
        </div>
        {busy ? (
          <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={!live.length} onClick={() => void run(!!paper.checked_at)}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {paper.checked_at ? "Check again" : "Check against our magazine"}
          </Button>
        )}
      </div>
      {busy && (
        <p className="flex items-center gap-2 text-sm text-primary" role="status">
          <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
        </p>
      )}
      {(paper.checked_at || ca.some((x) => x.match)) && (
        <div className="space-y-3" data-testid="magazine-report">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge>{live.length - ca.length} static</Badge>
            <Badge tone="primary">{ca.length} current affairs</Badge>
            <Badge tone="good">{count("covered")} covered</Badge>
            <Badge tone="warn">{count("low")} left out or rated low</Badge>
            <Badge tone="bad">{count("missed")} missed</Badge>
            {ca.length > 0 && (
              <Badge tone="primary">
                {Math.round((count("covered") / ca.length) * 100)}% covered
              </Badge>
            )}
          </div>
          {missedOrLow.length > 0 && (
            <ul className="space-y-1 text-sm">
              {missedOrLow.map((x) => (
                <li key={x.id} className="break-words">
                  <Badge tone={MATCH_TONE[x.match!]}>Q{x.q_no}</Badge>{" "}
                  {x.question_en || x.question_hi}
                  {x.matched_item && stories[x.matched_item] && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      — our story: {formatDate(stories[x.matched_item].date, "en")},{" "}
                      {stories[x.matched_item].headline}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {paper.lessons.length > 0 && (
            <div className="space-y-1.5" data-testid="lessons">
              <h4 className="text-sm font-semibold">Lessons for picking stories</h4>
              <ul className="space-y-1.5">
                {paper.lessons.map((l) => {
                  const on = lessonsInUse.includes(l);
                  return (
                    <li key={l} className="flex flex-wrap items-start gap-2 text-sm">
                      <span className="min-w-0 flex-1 break-words">{l}</span>
                      <Button
                        size="sm"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        onClick={() => void toggle(l, !on)}
                      >
                        {on ? "In use" : "Use in picking stories"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
