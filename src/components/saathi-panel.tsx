import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileUp,
  Plus,
  Trash2,
  Pencil,
  X,
  Bold,
  Italic,
  Highlighter,
  Heading1,
  Heading2,
  List,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FilePlus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  appendSaathiDoc,
  createSaathiDoc,
  deleteSaathiDoc,
  listKnowledgeGaps,
  listSaathiDocs,
  updateSaathiDoc,
  type SaathiDoc,
  type SaathiKnowledgeGap,
  type SaathiMedium,
} from "@/lib/saathi.functions";
import { parsePdfWithLlama } from "@/lib/saathi-pdf.functions";
import { extractTextFromFile, parseQnAExcel } from "@/lib/saathi-parse";
import { SaathiKnowledgePanel } from "@/components/ai-generate-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MEDIUMS: SaathiMedium[] = ["Hindi", "English", "Bilingual"];
const ALL = "__all__";

type FormState = {
  title: string;
  subject: string;
  medium: SaathiMedium;
  content: string;
};

const empty: FormState = { title: "", subject: "", medium: "English", content: "" };

type Mode = "content" | "qna";
type EditKind =
  | { kind: "create" }
  | { kind: "edit-parent"; id: string }
  | { kind: "edit-chunk"; id: string; parentTitle: string }
  | { kind: "append"; parentId: string; parentTitle: string };

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function SaathiPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSaathiDocs);
  const createFn = useServerFn(createSaathiDoc);
  const updateFn = useServerFn(updateSaathiDoc);
  const appendFn = useServerFn(appendSaathiDoc);
  const deleteFn = useServerFn(deleteSaathiDoc);

  const docsQ = useQuery<SaathiDoc[]>({
    queryKey: ["saathiDocs"],
    queryFn: () => listFn(),
  });

  const [mode, setMode] = useState<Mode>("content");
  const [form, setForm] = useState<FormState>(empty);
  const [editKind, setEditKind] = useState<EditKind>({ kind: "create" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const docs = docsQ.data ?? [];
  const parents = useMemo(() => docs.filter((d) => d.parent_id == null), [docs]);
  const childrenByParent = useMemo(() => {
    const m = new Map<string, SaathiDoc[]>();
    for (const d of docs) {
      if (d.parent_id) {
        const arr = m.get(d.parent_id) ?? [];
        arr.push(d);
        m.set(d.parent_id, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
    }
    return m;
  }, [docs]);

  const subjects = useMemo(
    () => Array.from(new Set(parents.map((d) => d.subject))).sort(),
    [parents],
  );
  const filteredParents = useMemo(
    () => (filter === ALL ? parents : parents.filter((d) => d.subject === filter)),
    [parents, filter],
  );

  const isEditing = editKind.kind !== "create";

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEditParent(d: SaathiDoc) {
    setMode("content");
    setEditKind({ kind: "edit-parent", id: d.id });
    setForm({ title: d.title, subject: d.subject, medium: d.medium, content: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditChunk(chunk: SaathiDoc, parentTitle: string) {
    setMode("content");
    setEditKind({ kind: "edit-chunk", id: chunk.id, parentTitle });
    setForm({
      title: chunk.title,
      subject: chunk.subject,
      medium: chunk.medium,
      content: chunk.content,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startAppend(parent: SaathiDoc) {
    setMode("content");
    setEditKind({ kind: "append", parentId: parent.id, parentTitle: parent.title });
    setForm({ title: parent.title, subject: parent.subject, medium: parent.medium, content: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditKind({ kind: "create" });
    setForm(empty);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editKind.kind === "edit-chunk") {
        if (!form.title.trim() || !form.content.trim()) {
          toast.error("Title and content are required");
          return;
        }
        await updateFn({
          data: {
            id: editKind.id,
            title: form.title.trim(),
            subject: form.subject.trim() || "-",
            medium: form.medium,
            content: form.content.trim(),
            is_chunk: true,
          },
        });
        toast.success("Chunk updated and re-embedded");
      } else if (editKind.kind === "edit-parent") {
        if (!form.title.trim() || !form.subject.trim()) {
          toast.error("Title and subject are required");
          return;
        }
        await updateFn({
          data: {
            id: editKind.id,
            title: form.title.trim(),
            subject: form.subject.trim(),
            medium: form.medium,
            content: "-",
            is_chunk: false,
          },
        });
        toast.success("Deck updated");
      } else if (editKind.kind === "append") {
        if (!form.content.trim()) {
          toast.error("Add content to append");
          return;
        }
        await appendFn({
          data: { parent_id: editKind.parentId, content: form.content.trim() },
        });
        toast.success("Appended to deck");
      } else {
        if (!form.title.trim() || !form.subject.trim() || !form.content.trim()) {
          toast.error("Title, subject, and content are required");
          return;
        }
        await createFn({
          data: {
            title: form.title.trim(),
            subject: form.subject.trim(),
            medium: form.medium,
            content: form.content.trim(),
          },
        });
        toast.success("Deck created");
      }
      cancelEdit();
      qc.invalidateQueries({ queryKey: ["saathiDocs"] });
      qc.invalidateQueries({ queryKey: ["saathiSubjects"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(doc: SaathiDoc, label: string) {
    if (!confirm(`Delete ${label} "${doc.title}"?${doc.parent_id == null ? " All its chunks will be deleted." : ""}`)) return;
    try {
      await deleteFn({ data: { id: doc.id } });
      toast.success("Deleted");
      if (isEditing && "id" in editKind && editKind.id === doc.id) cancelEdit();
      qc.invalidateQueries({ queryKey: ["saathiDocs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold">SAATHI Knowledge Base</h2>
        <p className="text-sm text-muted-foreground">
          Upload study material. SAATHI answers only from what you save here.
        </p>
      </div>

      {!isEditing && (
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
          <button
            type="button"
            onClick={() => setMode("content")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              mode === "content" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Upload content
          </button>
          <button
            type="button"
            onClick={() => setMode("qna")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              mode === "qna" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Upload Q&amp;A (Excel)
          </button>
        </div>
      )}

      {mode === "content" || isEditing ? (
        <EntryForm
          form={form}
          setForm={setForm}
          subjects={subjects}
          saving={saving}
          editKind={editKind}
          onSubmit={onSave}
          onCancel={cancelEdit}
        />
      ) : (
        <QnABulkUpload
          subjects={subjects}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["saathiDocs"] });
            qc.invalidateQueries({ queryKey: ["saathiSubjects"] });
          }}
          createFn={createFn}
        />
      )}

      <SaathiKnowledgePanel subjectFilter={filter === ALL ? "" : filter} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">
            Library{" "}
            <span className="text-muted-foreground text-sm font-normal">
              ({filteredParents.length} deck{filteredParents.length === 1 ? "" : "s"})
            </span>
          </h3>
          <div className="w-48">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All subjects</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {docsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filteredParents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {parents.length === 0
                ? "No decks yet. Create your first one above."
                : "No decks in this subject."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filteredParents.map((d) => {
              const isOpen = expanded.has(d.id);
              const chunks = childrenByParent.get(d.id) ?? [];
              return (
                <li
                  key={d.id}
                  className="rounded-lg bg-card border border-border overflow-hidden"
                >
                  <div className="flex items-center gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(d.id)}
                      className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted shrink-0"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(d.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-medium text-sm truncate">{d.title}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                        {d.subject} · {d.medium} · {chunks.length} chunk{chunks.length === 1 ? "" : "s"}
                      </div>
                    </button>
                    <button
                      onClick={() => startAppend(d)}
                      className="h-8 px-2 grid place-items-center rounded-md text-foreground hover:bg-muted shrink-0"
                      title="Append PDF / text"
                    >
                      <FilePlus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => startEditParent(d)}
                      className="h-8 w-8 grid place-items-center rounded-md text-foreground hover:bg-muted shrink-0"
                      aria-label="Edit deck"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(d, "deck")}
                      className="h-8 w-8 grid place-items-center rounded-md text-destructive hover:bg-destructive/10 shrink-0"
                      aria-label="Delete deck"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 px-2 py-2 space-y-1.5">
                      {chunks.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-1">
                          No chunks in this deck yet. Use the Append button to add content.
                        </p>
                      ) : (
                        chunks.map((c) => (
                          <ChunkRow
                            key={c.id}
                            chunk={c}
                            parentTitle={d.title}
                            onEdit={() => startEditChunk(c, d.title)}
                            onDelete={() => onDelete(c, "chunk")}
                          />
                        ))
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChunkRow({
  chunk,
  onEdit,
  onDelete,
}: {
  chunk: SaathiDoc;
  parentTitle: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-background border border-border">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-6 w-6 grid place-items-center rounded hover:bg-muted shrink-0"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-sm font-medium truncate">
            <span className="text-muted-foreground mr-1">#{chunk.chunk_index ?? "-"}</span>
            {chunk.title}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {chunk.content.slice(0, 80)}
          </div>
        </button>
        <button
          onClick={onEdit}
          className="h-7 px-2 text-xs rounded-md border border-border hover:bg-muted shrink-0"
        >
          Edit Chunk
        </button>
        <button
          onClick={onDelete}
          className="h-7 w-7 grid place-items-center rounded-md text-destructive hover:bg-destructive/10 shrink-0"
          aria-label="Delete chunk"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          <div className="prose prose-sm max-w-none text-foreground/90 prose-headings:font-bold">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {chunk.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryForm({
  form,
  setForm,
  subjects,
  saving,
  editKind,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: (f: FormState | ((p: FormState) => FormState)) => void;
  subjects: string[];
  saving: boolean;
  editKind: EditKind;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const parsePdf = useServerFn(parsePdfWithLlama);

  const isChunk = editKind.kind === "edit-chunk";
  const isAppend = editKind.kind === "append";
  const isEditParent = editKind.kind === "edit-parent";
  const isCreate = editKind.kind === "create";

  const heading = isChunk
    ? `Edit chunk`
    : isAppend
      ? `Append to "${editKind.parentTitle}"`
      : isEditParent
        ? "Edit deck metadata"
        : "New deck";

  const submitLabel = isChunk
    ? saving
      ? "Re-embedding…"
      : "Save Chunk"
    : isAppend
      ? saving
        ? "Appending…"
        : "Append to Deck"
      : isEditParent
        ? saving
          ? "Saving…"
          : "Update Deck"
        : saving
          ? "Saving…"
          : "Save to SAATHI";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      if (!text) {
        toast.error("No text found in file");
        return;
      }
      setForm((prev) => ({
        ...prev,
        title: prev.title || file.name.replace(/\.[^.]+$/, ""),
        content: prev.content ? prev.content + "\n\n" + text : text,
      }));
      toast.success(`Extracted ${text.length.toLocaleString()} characters`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse file");
    } finally {
      setExtracting(false);
    }
  }

  async function onPdfLlama(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      toast.error("Please select a PDF file");
      return;
    }
    setParsingPdf(true);
    try {
      const base64 = await fileToBase64(file);
      const { markdown } = await parsePdf({ data: { filename: file.name, base64 } });
      setForm((prev) => ({
        ...prev,
        content: prev.content ? prev.content + "\n\n" + markdown : markdown,
      }));
      toast.success(`Parsed ${markdown.length.toLocaleString()} characters via LlamaParse`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF parse failed");
    } finally {
      setParsingPdf(false);
    }
  }

  function wrap(before: string, after = before, placeholder = "text") {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = form.content;
    const sel = val.slice(start, end) || placeholder;
    const next = val.slice(0, start) + before + sel + after + val.slice(end);
    setForm((p) => ({ ...p, content: next }));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + before.length;
      ta.setSelectionRange(pos, pos + sel.length);
    });
  }

  function prefixLine(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const val = form.content;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const next = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    setForm((p) => ({ ...p, content: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  const toolbarBtn =
    "h-8 w-8 grid place-items-center rounded-md border border-border bg-background hover:bg-muted";

  const showMetaFields = isCreate || isEditParent;
  const showContent = !isEditParent;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl bg-card border border-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">{heading}</div>
        {!isCreate && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>

      {(showMetaFields || isChunk) && (
        <div>
          <Label htmlFor="s-title">Title</Label>
          <Input
            id="s-title"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Fundamental Rights overview"
          />
        </div>
      )}

      {showMetaFields && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-subject">Subject</Label>
            <Input
              id="s-subject"
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="e.g. Polity"
              list="saathi-subjects"
            />
            <datalist id="saathi-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Medium</Label>
            <Select
              value={form.medium}
              onValueChange={(v) => setForm((p) => ({ ...p, medium: v as SaathiMedium }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIUMS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showContent && (
        <div>
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <Label htmlFor="s-content">
              {isChunk ? "Chunk content (Markdown)" : "Content (Markdown)"}
            </Label>
            <div className="flex gap-2">
              <input
                ref={pdfRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={onPdfLlama}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => pdfRef.current?.click()}
                disabled={parsingPdf || extracting}
              >
                <FileUp className="h-4 w-4" />
                {parsingPdf ? "Parsing PDF…" : "PDF via LlamaParse"}
              </Button>
              {!isChunk && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".docx,.xlsx,.xls,.txt,.md"
                    className="hidden"
                    onChange={onFile}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={extracting || parsingPdf}
                  >
                    <FileUp className="h-4 w-4" />
                    {extracting ? "Extracting…" : "Import DOCX / XLSX"}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-2">
            <button type="button" className={toolbarBtn} title="Heading 1" onClick={() => prefixLine("# ")}>
              <Heading1 className="h-4 w-4" />
            </button>
            <button type="button" className={toolbarBtn} title="Heading 2" onClick={() => prefixLine("## ")}>
              <Heading2 className="h-4 w-4" />
            </button>
            <button type="button" className={toolbarBtn} title="Bold" onClick={() => wrap("**")}>
              <Bold className="h-4 w-4" />
            </button>
            <button type="button" className={toolbarBtn} title="Italic" onClick={() => wrap("*")}>
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title="Highlight"
              onClick={() => wrap("<mark>", "</mark>", "keyword")}
            >
              <Highlighter className="h-4 w-4" />
            </button>
            <button type="button" className={toolbarBtn} title="Bullet list" onClick={() => prefixLine("- ")}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <Textarea
            id="s-content"
            ref={taRef}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            rows={12}
            placeholder={
              isAppend
                ? "Paste content or upload a PDF to add new chunks to this deck."
                : "Use the toolbar above for **bold**, *italic*, # headings, or <mark>highlight</mark>. You can also import a file."
            }
            className="font-mono text-sm"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!isCreate && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving || extracting || parsingPdf}>
          <Plus className="h-4 w-4" /> {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function QnABulkUpload({
  subjects,
  createFn,
  onDone,
}: {
  subjects: string[];
  createFn: (args: {
    data: { title: string; subject: string; medium: SaathiMedium; content: string };
  }) => Promise<unknown>;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [medium, setMedium] = useState<SaathiMedium>("English");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (!subject.trim()) {
      toast.error("Enter a subject first");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    let saved = 0;
    let failed = 0;
    try {
      for (const file of files) {
        const title = file.name.replace(/\.(xlsx|xls|csv)$/i, "").trim() || file.name;
        try {
          const rows = await parseQnAExcel(file);
          if (rows.length === 0) {
            failed += 1;
            toast.error(`${file.name}: no Q&A rows found`);
          } else {
            rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const content = rows.map((r) => r.markdown).join("\n\n---\n\n");
            await createFn({
              data: {
                title: title.slice(0, 300),
                subject: subject.trim(),
                medium,
                content,
              },
            });
            saved += 1;
          }
        } catch (err) {
          failed += 1;
          console.error("Q&A file failed", file.name, err);
          toast.error(`${file.name}: ${err instanceof Error ? err.message : "failed"}`);
        }
        setProgress({ done: saved + failed, total: files.length });
      }
      if (saved > 0) {
        toast.success(
          failed > 0
            ? `Saved ${saved} of ${files.length} entries (${failed} failed)`
            : `Saved ${saved} Q&A ${saved === 1 ? "entry" : "entries"}`,
        );
        onDone();
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="font-semibold">Bulk Q&amp;A upload</div>
      <p className="text-xs text-muted-foreground">
        Excel columns: <code className="font-mono">order</code>,{" "}
        <code className="font-mono">question</code>,{" "}
        <code className="font-mono">answer</code>, then one column per
        explanation section (the header text becomes the section title). One
        Excel file = one SAATHI entry; the file name becomes the entry title.
        You can pick multiple files at once.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="qna-subject">Subject</Label>
          <Input
            id="qna-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Polity"
            list="saathi-subjects-qna"
          />
          <datalist id="saathi-subjects-qna">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Medium</Label>
          <Select
            value={medium}
            onValueChange={(v) => setMedium(v as SaathiMedium)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIUMS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {busy && progress
            ? `Saving ${progress.done} / ${progress.total}…`
            : busy
              ? "Parsing…"
              : "Pick one or more Excel files to import."}
        </div>
        <Button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !subject.trim()}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {busy ? "Working…" : "Choose Excel files"}
        </Button>
      </div>
    </div>
  );
}
