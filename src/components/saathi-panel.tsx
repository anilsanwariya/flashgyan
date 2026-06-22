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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  createSaathiDoc,
  deleteSaathiDoc,
  listSaathiDocs,
  updateSaathiDoc,
  type SaathiDoc,
  type SaathiMedium,
} from "@/lib/saathi.functions";
import { extractTextFromFile, parseQnAExcel } from "@/lib/saathi-parse";
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

export function SaathiPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSaathiDocs);
  const createFn = useServerFn(createSaathiDoc);
  const updateFn = useServerFn(updateSaathiDoc);
  const deleteFn = useServerFn(deleteSaathiDoc);

  const docsQ = useQuery<SaathiDoc[]>({
    queryKey: ["saathiDocs"],
    queryFn: () => listFn(),
  });

  const [mode, setMode] = useState<Mode>("content");
  const [form, setForm] = useState<FormState>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const docs = docsQ.data ?? [];
  const subjects = useMemo(
    () => Array.from(new Set(docs.map((d) => d.subject))).sort(),
    [docs],
  );
  const filtered = useMemo(
    () => (filter === ALL ? docs : docs.filter((d) => d.subject === filter)),
    [docs, filter],
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(d: SaathiDoc) {
    setMode("content");
    setEditingId(d.id);
    setForm({ title: d.title, subject: d.subject, medium: d.medium, content: d.content });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(empty);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.subject.trim() || !form.content.trim()) {
      toast.error("Title, subject, and content are required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateFn({
          data: {
            id: editingId,
            title: form.title.trim(),
            subject: form.subject.trim(),
            medium: form.medium,
            content: form.content.trim(),
          },
        });
        toast.success("Entry updated");
      } else {
        await createFn({
          data: {
            title: form.title.trim(),
            subject: form.subject.trim(),
            medium: form.medium,
            content: form.content.trim(),
          },
        });
        toast.success("Saved to SAATHI");
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

  async function onDelete(doc: SaathiDoc) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteFn({ data: { id: doc.id } });
      toast.success("Deleted");
      if (editingId === doc.id) cancelEdit();
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

      {!editingId && (
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

      {mode === "content" || editingId ? (
        <EntryForm
          form={form}
          setForm={setForm}
          subjects={subjects}
          saving={saving}
          editingId={editingId}
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">
            Library{" "}
            <span className="text-muted-foreground text-sm font-normal">
              ({filtered.length})
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
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {docs.length === 0
                ? "No documents yet. Add your first one above."
                : "No documents in this subject."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((d) => {
              const isOpen = expanded.has(d.id);
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
                        {d.subject} · {d.medium}
                      </div>
                    </button>
                    <button
                      onClick={() => startEdit(d)}
                      className="h-8 w-8 grid place-items-center rounded-md text-foreground hover:bg-muted shrink-0"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(d)}
                      className="h-8 w-8 grid place-items-center rounded-md text-destructive hover:bg-destructive/10 shrink-0"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-border">
                      <div className="prose prose-sm max-w-none text-foreground/90 prose-headings:font-bold">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                        >
                          {d.content}
                        </ReactMarkdown>
                      </div>
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

function EntryForm({
  form,
  setForm,
  subjects,
  saving,
  editingId,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: (f: FormState | ((p: FormState) => FormState)) => void;
  subjects: string[];
  saving: boolean;
  editingId: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [extracting, setExtracting] = useState(false);

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

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl bg-card border border-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">
          {editingId ? "Edit entry" : "New entry"}
        </div>
        {editingId && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>

      <div>
        <Label htmlFor="s-title">Title</Label>
        <Input
          id="s-title"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="e.g. Fundamental Rights overview"
        />
      </div>

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

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="s-content">Content (Markdown)</Label>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.txt,.md"
              className="hidden"
              onChange={onFile}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={extracting}
            >
              <FileUp className="h-4 w-4" />
              {extracting ? "Extracting…" : "Import PDF / DOCX / XLSX"}
            </Button>
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
          placeholder="Use the toolbar above for **bold**, *italic*, # headings, or <mark>highlight</mark>. You can also import a file."
          className="font-mono text-sm"
        />
      </div>

      <div className="flex justify-end gap-2">
        {editingId && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving || extracting}>
          <Plus className="h-4 w-4" /> {saving ? "Saving…" : editingId ? "Update entry" : "Save to SAATHI"}
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
  createFn: ReturnType<typeof useServerFn<typeof createSaathiDoc>>;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [medium, setMedium] = useState<SaathiMedium>("English");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!subject.trim()) {
      toast.error("Enter a subject first");
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      const rows = await parseQnAExcel(file);
      if (rows.length === 0) {
        toast.error("No Q&A rows found. Need columns: question, answer (+ optional explanation_* columns)");
        return;
      }
      rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setProgress({ done: 0, total: rows.length });
      let saved = 0;
      let failed = 0;
      for (const r of rows) {
        const title = (r.order ? `Q${r.order}. ` : "") + r.question.slice(0, 240);
        try {
          await createFn({
            data: {
              title,
              subject: subject.trim(),
              medium,
              content: r.markdown,
            },
          });
          saved += 1;
        } catch (err) {
          failed += 1;
          console.error("Q&A row failed", err);
        }
        setProgress({ done: saved + failed, total: rows.length });
      }
      toast.success(
        failed > 0
          ? `Saved ${saved} of ${rows.length} (${failed} failed)`
          : `Saved ${saved} Q&A entries`,
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse file");
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
        row = one Q&amp;A entry in SAATHI.
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
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {busy && progress
            ? `Saving ${progress.done} / ${progress.total}…`
            : busy
              ? "Parsing…"
              : "Pick an Excel file to import."}
        </div>
        <Button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !subject.trim()}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {busy ? "Working…" : "Choose Excel file"}
        </Button>
      </div>
    </div>
  );
}
