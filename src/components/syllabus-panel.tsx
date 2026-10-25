// Admin: the syllabus library. Each exam stage's official syllabus (RAS
// Prelims, RAS Mains…) read from its English and Hindi PDFs a page at a time
// into headings and points, Hindi and English side by side, each point in a
// subject section; the scheme of examination; then checked and corrected
// here. The notes and the other features follow it.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  addSyllabusNode,
  createSyllabus,
  deleteSyllabus,
  deleteSyllabusNode,
  getSyllabus,
  listSyllabi,
  readSyllabusPage,
  readSyllabusScheme,
  resetSyllabus,
  updateSyllabusExam,
  updateSyllabusNode,
  type SyllabusSummary,
} from "@/lib/syllabus.functions";
import {
  examTitle,
  KIND_DEPTH,
  KIND_LABEL,
  NODE_KINDS,
  readableText,
  STAGES,
  type NodeKind,
  type Scheme,
  type Stage,
  type SyllabusExam,
  type SyllabusNode,
} from "@/lib/syllabus";
import { SUBJECT_SECTIONS } from "@/lib/exam-papers";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// The PDFs chosen on this device, kept while the page is open so reading
// goes on after the exam is made.
type Files = { en: File | null; hi: File | null; scheme: File | null };
const chosen = new Map<string, Files>();

export function SyllabusPanel() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? (
    <SyllabusView id={open} onBack={() => setOpen(null)} />
  ) : (
    <SyllabusList onOpen={setOpen} />
  );
}

// ====================== The list ======================

function SyllabusList({ onOpen }: { onOpen: (id: string) => void }) {
  const listFn = useServerFn(listSyllabi);
  const q = useQuery({ queryKey: ["syllabi"], queryFn: () => listFn(), refetchOnMount: true });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (q.data && !q.data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        The syllabus library needs a database update: run the latest migration (syllabus) in Lovable
        or the SQL editor, then reload this page.
      </p>
    );
  const exams = q.data?.exams ?? [];
  return (
    <div className="space-y-4">
      <AddSyllabus onAdded={onOpen} />
      {exams.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Syllabi">
          {exams.map((e) => (
            <li key={e.id}>
              <SyllabusCard e={e} onOpen={() => onOpen(e.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SyllabusCard({ e, onOpen }: { e: SyllabusSummary; onOpen: () => void }) {
  const top = Object.entries(e.sections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-syllabus={examTitle(e)}
      className="w-full space-y-1.5 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex flex-wrap items-center gap-2">
        <BookOpenCheck className="h-4 w-4 text-primary" />
        <span className="font-semibold">{examTitle(e)}</span>
        {e.body && <span className="text-sm text-muted-foreground">{e.body}</span>}
        <Badge tone={e.status === "final" ? "good" : "muted"}>
          {e.status === "final" ? "Final" : "Draft"}
        </Badge>
        {e.pages_done < e.pages && (
          <Badge tone="warn">
            Read {e.pages_done} of {e.pages} pages
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {e.lines} points under {e.headings} headings
        {e.unsorted ? ` · ${e.unsorted} without a subject section` : ""}
        {e.scheme ? " · scheme of examination" : ""}
      </p>
      {top.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {top.map(([s, n]) => `${s} ${n}`).join(" · ")}
          {Object.keys(e.sections).length > top.length
            ? ` · ${Object.keys(e.sections).length - top.length} more`
            : ""}
        </p>
      )}
    </button>
  );
}

function AddSyllabus({ onAdded }: { onAdded: (id: string) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createSyllabus);
  const [f, setF] = useState({ name: "", body: "", stage: "prelims" as Stage, notified_on: "" });
  const [files, setFiles] = useState<Files>({ en: null, hi: null, scheme: null });
  const [busy, setBusy] = useState(false);
  const ok = f.name.trim().length >= 2 && (files.en || files.hi);
  async function add() {
    setBusy(true);
    try {
      const { pdfPageCount } = await import("@/lib/exam-pdf");
      const counts = await Promise.all(
        [files.en, files.hi].filter((x): x is File => !!x).map(pdfPageCount),
      );
      const e = await createFn({
        data: {
          name: f.name,
          body: f.body,
          stage: f.stage,
          notified_on: f.notified_on || null,
          pages: Math.max(...counts),
        },
      });
      chosen.set(e.id, files);
      await qc.invalidateQueries({ queryKey: ["syllabi"] });
      onAdded(e.id);
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
    } finally {
      setBusy(false);
    }
  }
  const file = (k: keyof Files, label: string) => (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span className="block">{label}</span>
      <Input
        type="file"
        accept="application/pdf"
        aria-label={label}
        onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] ?? null })}
        className="h-9 w-64 text-xs"
      />
    </label>
  );
  return (
    <section
      aria-label="Add a syllabus"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">Add an exam's syllabus</h3>
        <p className="text-sm text-muted-foreground">
          One stage at a time (RAS Prelims, then RAS Mains). Choose the official syllabus PDFs in
          English and Hindi, and for Mains the scheme of examination. SAATHI reads them a page at a
          time (one AI request a page), pairs the Hindi and English lines and puts each point in a
          subject section; then you check it.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          aria-label="Exam name"
          placeholder="Exam, e.g. RAS"
          value={f.name}
          maxLength={120}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-9 w-40"
        />
        <Input
          aria-label="Conducted by"
          placeholder="RPSC"
          value={f.body}
          maxLength={60}
          onChange={(e) => setF({ ...f, body: e.target.value })}
          className="h-9 w-28"
        />
        <select
          aria-label="Stage"
          value={f.stage}
          onChange={(e) => setF({ ...f, stage: e.target.value as Stage })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">Notified on</span>
          <Input
            type="date"
            aria-label="Notified on"
            value={f.notified_on}
            onChange={(e) => setF({ ...f, notified_on: e.target.value })}
            className="h-9 w-40"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {file("en", "English syllabus PDF")}
        {file("hi", "Hindi syllabus PDF")}
        {f.stage !== "prelims" && file("scheme", "Scheme of examination PDF (optional)")}
        <Button onClick={() => void add()} disabled={!ok || busy}>
          <FileUp className="mr-1 h-4 w-4" /> {busy ? "Adding…" : "Add and read"}
        </Button>
      </div>
    </section>
  );
}

// ====================== One syllabus ======================

type Lang = "both" | "hi" | "en";
const sectionNames = SUBJECT_SECTIONS.map((s) => s.en as string);

function SyllabusView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getSyllabus);
  const pageFn = useServerFn(readSyllabusPage);
  const schemeFn = useServerFn(readSyllabusScheme);
  const examFn = useServerFn(updateSyllabusExam);
  const resetFn = useServerFn(resetSyllabus);
  const deleteFn = useServerFn(deleteSyllabus);
  const q = useQuery({ queryKey: ["syllabus", id], queryFn: () => getFn({ data: { id } }) });
  const [files, setFiles] = useState<Files>(
    () => chosen.get(id) ?? { en: null, hi: null, scheme: null },
  );
  const [reading, setReading] = useState<string | null>(null);
  const stop = useRef(false);
  const [lang, setLang] = useState<Lang>("both");
  const [section, setSection] = useState("");
  const [term, setTerm] = useState("");
  const [onlyUnsorted, setOnlyUnsorted] = useState(false);
  const exam = q.data?.exam;
  const nodes = q.data?.nodes ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["syllabus", id] });

  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  // Off once every point has its section (the box goes away).
  const anyUnsorted = nodes.some((n) => n.kind === "line" && !n.section);
  useEffect(() => {
    if (!anyUnsorted) setOnlyUnsorted(false);
  }, [anyUnsorted]);

  // Reads the pages not read yet (and the scheme, once).
  async function read(fs: Files, from: number) {
    if (!exam) return;
    stop.current = false;
    try {
      const pdf = await import("@/lib/exam-pdf");
      if (fs.scheme && !exam.scheme) {
        setReading("Reading the scheme of examination…");
        const text = await pdf.pdfText(fs.scheme);
        if (text.trim().length >= 20) await schemeFn({ data: { id, text } });
      }
      const enTexts = fs.en ? await pdf.pdfPageTexts(fs.en) : [];
      const images = async (file: File | null) => {
        const out: Record<number, { media_type: "image/jpeg"; data: string }> = {};
        if (file)
          await pdf.eachPageImage(file, from, async (n, _p, img) => {
            out[n] = img;
          });
        return out;
      };
      setReading("Preparing the pages…");
      const enUseText = (n: number) => !!enTexts[n - 1] && readableText(enTexts[n - 1], "en");
      const enImages =
        fs.en && enTexts.some((_, i) => !enUseText(i + 1)) ? await images(fs.en) : {};
      const hiImages = await images(fs.hi);
      const pages = exam.pages;
      for (let n = from; n <= pages; n++) {
        if (stop.current) break;
        setReading(`Reading page ${n} of ${pages}…`);
        await pageFn({
          data: {
            id,
            page: n,
            pages,
            enText: enUseText(n) ? enTexts[n - 1] : null,
            enImage: !enUseText(n) ? (enImages[n] ?? null) : null,
            hiImage: hiImages[n] ?? null,
          },
        });
        await refresh();
      }
      if (!stop.current) toast.success("Syllabus read: check it below");
    } catch (e) {
      toast.error(errorText(e, "Couldn't read it"));
    } finally {
      setReading(null);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["syllabi"] });
    }
  }

  // Straight after adding: read at once.
  const started = useRef(false);
  useEffect(() => {
    if (!exam || started.current || !chosen.has(id)) return;
    started.current = true;
    chosen.delete(id);
    if (exam.pages_done < exam.pages || (files.scheme && !exam.scheme))
      void read(files, exam.pages_done + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.id]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !exam)
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All syllabi
        </Button>
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load it")}</p>
      </div>
    );

  const lines = nodes.filter((n) => n.kind === "line");
  const unsorted = lines.filter((n) => !n.section).length;
  const counts = lines.reduce(
    (m, n) => m.set(n.section || "—", (m.get(n.section || "—") ?? 0) + 1),
    new Map<string, number>(),
  );
  const t = term.trim().toLowerCase();
  const filtering = !!(section || t || onlyUnsorted);
  const match = (n: SyllabusNode) =>
    (!section || n.section === section) &&
    (!onlyUnsorted || !n.section) &&
    (!t || `${n.text_en} ${n.text_hi}`.toLowerCase().includes(t));
  // Filtered: the matching items with the headings they're under.
  const shown = filtering ? withHeads(nodes, match) : nodes;
  const unread = exam.pages_done < exam.pages;

  async function setStatus(status: SyllabusExam["status"]) {
    try {
      await examFn({ data: { id, patch: { status } } });
      toast.success(status === "final" ? "Marked final" : "Back to a draft");
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All syllabi
        </Button>
        <h2 className="text-lg font-semibold">{examTitle(exam)}</h2>
        {exam.body && <span className="text-sm text-muted-foreground">{exam.body}</span>}
        {exam.notified_on && (
          <span className="text-sm text-muted-foreground">· notified {exam.notified_on}</span>
        )}
        <Badge tone={exam.status === "final" ? "good" : "muted"}>
          {exam.status === "final" ? "Final" : "Draft"}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {exam.status === "draft" ? (
            <Button
              size="sm"
              disabled={!!reading || unread || !nodes.length}
              title={unread ? "Read every page first" : undefined}
              onClick={() => void setStatus("final")}
            >
              <Check className="mr-1 h-4 w-4" /> Mark final
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void setStatus("draft")}>
              Back to draft
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={!!reading}
            onClick={async () => {
              if (!confirm(`Delete the ${examTitle(exam)} syllabus?`)) return;
              try {
                await deleteFn({ data: { id } });
                await qc.invalidateQueries({ queryKey: ["syllabi"] });
                toast.success("Syllabus deleted");
                onBack();
              } catch (e) {
                toast.error(errorText(e, "Couldn't delete it"));
              }
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {reading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-primary">
          <RefreshCw className="h-4 w-4 animate-spin" /> {reading}
          <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
            Stop
          </Button>
        </p>
      ) : (
        (unread || !nodes.length) && (
          <ReadAgain
            files={files}
            onFiles={setFiles}
            label={
              nodes.length
                ? `Read ${exam.pages_done} of ${exam.pages} pages. Choose the PDFs again to go on.`
                : "Choose the syllabus PDFs to read them."
            }
            action={nodes.length ? "Go on reading" : "Read"}
            onRead={() => void read(files, exam.pages_done + 1)}
          />
        )
      )}

      {exam.scheme && <SchemeTable scheme={exam.scheme} />}

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-background/95 px-1 py-1.5 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search the syllabus"
            placeholder="Search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="h-8 w-48 pl-7 text-xs"
          />
        </div>
        <select
          aria-label="Subject section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">All subject sections ({lines.length})</option>
          {[...counts.entries()]
            .filter(([s]) => s !== "—")
            .sort((a, b) => sectionNames.indexOf(a[0]) - sectionNames.indexOf(b[0]))
            .map(([s, n]) => (
              <option key={s} value={s}>
                {s} ({n})
              </option>
            ))}
        </select>
        {unsorted > 0 && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={onlyUnsorted}
              onChange={(e) => setOnlyUnsorted(e.target.checked)}
            />
            No subject section ({unsorted})
          </label>
        )}
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
        <ol className="space-y-1" data-testid="syllabus">
          {shown.map((n) => (
            <NodeRow
              key={n.id}
              n={n}
              lang={lang}
              examId={id}
              dim={filtering && n.kind !== "line" && !match(n)}
              onChanged={refresh}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {nodes.length ? "Nothing here." : reading ? "Reading…" : "Nothing read yet."}
        </p>
      )}
      {!filtering && nodes.length > 0 && (
        <AddRow examId={id} after={nodes.at(-1)!.id} onChanged={refresh} />
      )}
      {exam.pages_done > 0 && !reading && (
        <p className="text-xs text-muted-foreground">
          Wrong from the start?{" "}
          <button
            type="button"
            className="underline"
            onClick={async () => {
              if (!confirm("Remove everything read and read the PDFs again?")) return;
              await resetFn({ data: { id } });
              await refresh();
            }}
          >
            Read it all again
          </button>
        </p>
      )}
    </div>
  );
}

// The matching items with the headings above them, in order.
function withHeads(nodes: SyllabusNode[], match: (n: SyllabusNode) => boolean) {
  const out: SyllabusNode[] = [];
  const heads: SyllabusNode[] = [];
  for (const n of nodes) {
    if (n.kind !== "line") {
      while (heads.length && KIND_DEPTH[heads[heads.length - 1].kind] >= KIND_DEPTH[n.kind])
        heads.pop();
      heads.push(n);
    }
    if (!match(n)) continue;
    for (const h of heads) if (!out.includes(h) && h !== n) out.push(h);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function ReadAgain({
  files,
  onFiles,
  label,
  action,
  onRead,
}: {
  files: Files;
  onFiles: (f: Files) => void;
  label: string;
  action: string;
  onRead: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
      <p className="w-full">{label}</p>
      {(["en", "hi", "scheme"] as const).map((k) => (
        <label key={k} className="space-y-1 text-xs font-medium text-muted-foreground">
          <span className="block">
            {k === "en" ? "English PDF" : k === "hi" ? "Hindi PDF" : "Scheme PDF (optional)"}
          </span>
          <Input
            type="file"
            accept="application/pdf"
            aria-label={k === "en" ? "English PDF" : k === "hi" ? "Hindi PDF" : "Scheme PDF"}
            onChange={(e) => onFiles({ ...files, [k]: e.target.files?.[0] ?? null })}
            className="h-9 w-56 text-xs"
          />
        </label>
      ))}
      <Button size="sm" disabled={!files.en && !files.hi} onClick={onRead}>
        {action}
      </Button>
    </div>
  );
}

function SchemeTable({ scheme }: { scheme: Scheme }) {
  return (
    <details className="rounded-2xl border border-border bg-card p-4 text-sm" open>
      <summary className="cursor-pointer font-semibold">Scheme of examination</summary>
      <div className="mt-2 grid gap-3 md:grid-cols-2" data-testid="scheme">
        {scheme.papers.map((p) => (
          <div key={p.name} className="rounded-xl bg-muted/40 p-3">
            <p className="font-medium">
              {p.name}
              <span className="font-normal text-muted-foreground">
                {p.marks ? ` · ${p.marks} marks` : ""}
                {p.minutes ? ` · ${p.minutes / 60} hours` : ""}
              </span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {p.units.map((u) => (
                <li key={u.name}>
                  <span className="font-medium">{u.name}</span>
                  {u.total ? ` (${u.total} marks)` : ""}
                  {u.rows.length > 0 && ": "}
                  {u.rows
                    .map(
                      (r) =>
                        `${r.questions ?? "?"} × ${r.marks_each ?? "?"} marks${r.words ? ` in ${r.words} words` : ""}`,
                    )
                    .join("; ")}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {scheme.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {scheme.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

const KIND_STYLE: Record<NodeKind, string> = {
  paper: "text-base font-bold text-primary",
  unit: "font-semibold",
  part: "font-semibold",
  heading: "font-semibold",
  subheading: "font-medium italic",
  line: "",
};

function NodeRow({
  n,
  lang,
  examId,
  dim,
  onChanged,
}: {
  n: SyllabusNode;
  lang: Lang;
  examId: string;
  dim: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const updateFn = useServerFn(updateSyllabusNode);
  const deleteFn = useServerFn(deleteSyllabusNode);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const show = (l: "en" | "hi") => lang === "both" || lang === l;
  const setSection = (section: string) =>
    void updateFn({ data: { id: n.id, patch: { section } } })
      .then(onChanged)
      .catch((e) => toast.error(errorText(e, "Couldn't save")));
  return (
    <li
      data-node={n.kind}
      className={`group rounded-lg px-2 py-1 hover:bg-muted/40 ${dim ? "opacity-60" : ""} ${n.kind === "paper" ? "mt-3 border-t border-border pt-2" : ""}`}
      style={{ paddingLeft: `calc(0.5rem + ${KIND_DEPTH[n.kind]} * min(1.1rem, 3vw))` }}
    >
      {editing ? (
        <NodeEditor n={n} onDone={() => setEditing(false)} onSaved={onChanged} />
      ) : (
        <div className="flex flex-wrap items-start gap-2 text-sm">
          {n.kind === "line" && <span className="mt-0.5 text-muted-foreground">•</span>}
          <div
            className={`min-w-0 flex-1 basis-[14rem] gap-x-4 ${lang === "both" ? "grid md:grid-cols-2" : ""} ${KIND_STYLE[n.kind]}`}
          >
            {show("hi") && (
              <p lang="hi" className="break-words">
                {n.text_hi || <span className="text-muted-foreground">—</span>}
              </p>
            )}
            {show("en") && (
              <p className="break-words">
                {n.text_en || <span className="text-muted-foreground">—</span>}
                {n.marks ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({n.marks} marks)
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <select
            aria-label={`Subject section of ${n.text_en || n.text_hi}`}
            value={n.section}
            onChange={(e) => setSection(e.target.value)}
            className={`h-7 max-w-[11rem] rounded-md border px-1 text-xs ${n.section ? "border-input bg-background text-muted-foreground" : "border-amber-400 bg-amber-500/10"}`}
          >
            <option value="">No section</option>
            {sectionNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="flex gap-0.5 opacity-60 group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Edit ${n.text_en || n.text_hi}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Add after ${n.text_en || n.text_hi}`}
              onClick={() => setAdding(!adding)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Delete ${n.text_en || n.text_hi}`}
              onClick={() => {
                if (!confirm("Delete this line?")) return;
                void deleteFn({ data: { id: n.id } })
                  .then(onChanged)
                  .catch((e) => toast.error(errorText(e, "Couldn't delete it")));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
      )}
      {adding && (
        <AddRow
          examId={examId}
          after={n.id}
          onChanged={onChanged}
          onDone={() => setAdding(false)}
        />
      )}
    </li>
  );
}

function NodeEditor({
  n,
  onDone,
  onSaved,
}: {
  n: SyllabusNode;
  onDone: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const fn = useServerFn(updateSyllabusNode);
  const [f, setF] = useState({
    kind: n.kind,
    text_hi: n.text_hi,
    text_en: n.text_en,
    section: n.section,
  });
  return (
    <form
      className="space-y-2"
      aria-label="Edit syllabus line"
      onSubmit={(e) => {
        e.preventDefault();
        void fn({ data: { id: n.id, patch: f } })
          .then(async () => {
            toast.success("Saved");
            await onSaved();
            onDone();
          })
          .catch((err) => toast.error(errorText(err, "Couldn't save")));
      }}
    >
      <NodeFields f={f} setF={setF} />
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Save
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Fields = { kind: NodeKind; text_hi: string; text_en: string; section: string };
function NodeFields({ f, setF }: { f: Fields; setF: (f: Fields) => void }) {
  return (
    <>
      <div className="grid gap-2 md:grid-cols-2">
        <Textarea
          aria-label="Hindi"
          lang="hi"
          rows={2}
          value={f.text_hi}
          onChange={(e) => setF({ ...f, text_hi: e.target.value })}
          placeholder="हिंदी"
        />
        <Textarea
          aria-label="English"
          rows={2}
          value={f.text_en}
          onChange={(e) => setF({ ...f, text_en: e.target.value })}
          placeholder="English"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Kind"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as NodeKind })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {NODE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          aria-label="Section"
          value={f.section}
          onChange={(e) => setF({ ...f, section: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">No section</option>
          {sectionNames.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function AddRow({
  examId,
  after,
  onChanged,
  onDone,
}: {
  examId: string;
  after: string;
  onChanged: () => Promise<unknown>;
  onDone?: () => void;
}) {
  const fn = useServerFn(addSyllabusNode);
  const [open, setOpen] = useState(!!onDone);
  const [f, setF] = useState<Fields>({ kind: "line", text_hi: "", text_en: "", section: "" });
  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add a line at the end
      </Button>
    );
  return (
    <form
      className="mt-1 space-y-2 rounded-xl border border-dashed border-border p-2"
      aria-label="New syllabus line"
      onSubmit={(e) => {
        e.preventDefault();
        void fn({ data: { exam: examId, after, patch: f } })
          .then(async () => {
            toast.success("Line added");
            setF({ kind: "line", text_hi: "", text_en: "", section: "" });
            await onChanged();
            if (onDone) onDone();
            else setOpen(false);
          })
          .catch((err) => toast.error(errorText(err, "Couldn't add it")));
      }}
    >
      <NodeFields f={f} setF={setF} />
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={!f.text_en.trim() && !f.text_hi.trim()}>
          Add
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => (onDone ? onDone() : setOpen(false))}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
