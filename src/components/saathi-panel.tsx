import { useEffect, useMemo, useRef, useState } from "react";
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
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  appendSaathiDoc,
  createSaathiDoc,
  deleteKnowledgeGap,
  deleteSaathiDoc,
  deleteSaathiFeedback,
  getSaathiHealth,
  listUncoveredConcepts,
  listKnowledgeGaps,
  listSaathiFeedback,
  setSaathiSource,
  replaceSaathiDoc,
  testSaathiRetrieval,
  listSaathiChunks,
  listSaathiDocs,
  listSaathiEvals,
  addSaathiEval,
  deleteSaathiEval,
  runSaathiEval,
  type SaathiEvalQuestion,
  type SaathiRetrievalResult,
  updateSaathiDoc,
  type SaathiDeck,
  type SaathiDoc,
  type SaathiFeedback,
  type SaathiHealthRow,
  type SaathiKnowledgeGap,
  type SaathiMedium,
} from "@/lib/saathi.functions";
import { SAATHI_ACCEPT, parseQnAExcel, textBlockForFile } from "@/lib/saathi-parse";
import {
  FileDropZone,
  FileQueueList,
  useFileQueue,
  type QueueItem,
} from "@/components/saathi-file-queue";
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
const CLEANUP_KEY = "saathi.pdfCleanup.v1";

type FormState = {
  title: string;
  subject: string;
  topic: string;
  medium: SaathiMedium;
  content: string;
  // Who published the deck (NCERT, IGNOU…).
  source: string;
};

// New decks start with the last source used in this browser.
const SOURCE_KEY = "saathi.lastSource";
function lastSource(): string {
  try {
    return localStorage.getItem(SOURCE_KEY) ?? "NCERT";
  } catch {
    return "NCERT";
  }
}
const emptyForm = (): FormState => ({
  title: "",
  subject: "",
  topic: "",
  medium: "English",
  content: "",
  source: typeof window === "undefined" ? "NCERT" : lastSource(),
});

type Mode = "content" | "qna" | "gaps" | "test" | "evals" | "health";
type EditKind =
  | { kind: "create" }
  | { kind: "edit-parent"; id: string }
  | { kind: "edit-chunk"; id: string; parentTitle: string }
  | { kind: "append"; parentId: string; parentTitle: string }
  | { kind: "replace"; parentId: string; parentTitle: string };

export function SaathiPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSaathiDocs);
  const createFn = useServerFn(createSaathiDoc);
  const updateFn = useServerFn(updateSaathiDoc);
  const appendFn = useServerFn(appendSaathiDoc);
  const deleteFn = useServerFn(deleteSaathiDoc);
  const replaceFn = useServerFn(replaceSaathiDoc);
  const setSourceFn = useServerFn(setSaathiSource);
  const [rebuilding, setRebuilding] = useState<string | null>(null);

  const docsQ = useQuery<SaathiDeck[]>({
    queryKey: ["saathiDocs"],
    queryFn: () => listFn(),
  });

  const [mode, setMode] = useState<Mode>("content");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editKind, setEditKind] = useState<EditKind>({ kind: "create" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Decks only; a deck's chunks load when it is opened (DeckChunks).
  const parents = useMemo(() => docsQ.data ?? [], [docsQ.data]);

  const subjects = useMemo(
    () => Array.from(new Set(parents.map((d) => d.subject))).sort(),
    [parents],
  );
  const filteredParents = useMemo(
    () => (filter === ALL ? parents : parents.filter((d) => d.subject === filter)),
    [parents, filter],
  );
  // Publishers used so far, offered when typing a deck's source.
  const sources = useMemo(
    () =>
      Array.from(
        new Set([
          ...parents.map((d) => d.source ?? "").filter(Boolean),
          "NCERT",
          "IGNOU",
          "NIOS",
          "RBSE",
        ]),
      ).sort(),
    [parents],
  );
  const [bulkSource, setBulkSource] = useState("");
  const [settingSource, setSettingSource] = useState(false);

  async function applySource() {
    const ids = filteredParents.map((d) => d.id);
    const label = bulkSource.trim();
    if (
      !ids.length ||
      !confirm(
        label
          ? `Set the source of ${ids.length} deck${ids.length === 1 ? "" : "s"} to "${label}"?`
          : `Clear the source of ${ids.length} deck${ids.length === 1 ? "" : "s"}?`,
      )
    )
      return;
    setSettingSource(true);
    try {
      const res = await setSourceFn({ data: { ids, source: label } });
      toast.success(`Source updated on ${res.updated} deck${res.updated === 1 ? "" : "s"}`);
      setBulkSource("");
      qc.invalidateQueries({ queryKey: ["saathiDocs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't set the source");
    } finally {
      setSettingSource(false);
    }
  }

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
    setForm({
      title: d.title,
      subject: d.subject,
      topic: d.topic ?? "",
      medium: d.medium,
      source: d.source ?? "",
      content: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startReplace(d: SaathiDoc) {
    setMode("content");
    setEditKind({ kind: "replace", parentId: d.id, parentTitle: d.title });
    setForm({
      title: d.title,
      subject: d.subject,
      topic: d.topic ?? "",
      medium: d.medium,
      source: d.source ?? "",
      content: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function rebuild(d: SaathiDoc) {
    if (
      !confirm(
        `Rebuild "${d.title}" with the new chunking? Its chunks are re-split and re-embedded (uses AI credits). Documents uploaded after this update are rebuilt from their original text, so edits to single chunks are lost.`,
      )
    )
      return;
    setRebuilding(d.id);
    try {
      const res = await replaceFn({ data: { id: d.id } });
      toast.success(`Rebuilt: ${res.before} → ${res.after} chunks`);
      qc.invalidateQueries({ queryKey: ["saathiDocs"] });
      qc.invalidateQueries({ queryKey: ["saathiHealth"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setRebuilding(null);
    }
  }

  function startEditChunk(chunk: SaathiDoc, parentTitle: string) {
    setMode("content");
    setEditKind({ kind: "edit-chunk", id: chunk.id, parentTitle });
    setForm({
      title: chunk.title,
      subject: chunk.subject,
      topic: chunk.topic ?? "",
      medium: chunk.medium,
      source: "",
      content: chunk.content,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startAppend(parent: SaathiDoc) {
    setMode("content");
    setEditKind({ kind: "append", parentId: parent.id, parentTitle: parent.title });
    setForm({
      title: parent.title,
      subject: parent.subject,
      topic: parent.topic ?? "",
      medium: parent.medium,
      source: parent.source ?? "",
      content: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditKind({ kind: "create" });
    setForm(emptyForm());
  }

  // Saves the form. The deck form passes its content with each file's box
  // joined in; returns whether it saved.
  async function onSave(e: React.FormEvent, merged?: string): Promise<boolean> {
    e.preventDefault();
    const content = merged ?? form.content;
    setSaving(true);
    try {
      if (editKind.kind === "edit-chunk") {
        if (!form.title.trim() || !form.content.trim()) {
          toast.error("Title and content are required");
          return false;
        }
        await updateFn({
          data: {
            id: editKind.id,
            title: form.title.trim(),
            subject: form.subject.trim() || "-",
            topic: form.topic.trim() || null,
            medium: form.medium,
            content: form.content.trim(),
            is_chunk: true,
          },
        });
        toast.success("Chunk updated and re-embedded");
      } else if (editKind.kind === "edit-parent") {
        if (!form.title.trim() || !form.subject.trim()) {
          toast.error("Title and subject are required");
          return false;
        }
        await updateFn({
          data: {
            id: editKind.id,
            title: form.title.trim(),
            subject: form.subject.trim(),
            topic: form.topic.trim() || null,
            medium: form.medium,
            source: form.source.trim() || null,
            content: "-",
            is_chunk: false,
          },
        });
        toast.success("Deck updated");
      } else if (editKind.kind === "replace") {
        if (!content.trim()) {
          toast.error("Add the new content");
          return false;
        }
        const res = await replaceFn({
          data: { id: editKind.parentId, content: content.trim() },
        });
        toast.success(`Content replaced (${res.after} chunks)`);
      } else if (editKind.kind === "append") {
        if (!content.trim()) {
          toast.error("Add content to append");
          return false;
        }
        const res = await appendFn({
          data: { parent_id: editKind.parentId, content: content.trim() },
        });
        toast.success(`Appended ${res.added} chunk${res.added === 1 ? "" : "s"}`);
      } else {
        if (!form.title.trim() || !form.subject.trim() || !content.trim()) {
          toast.error("Title, subject, and content are required");
          return false;
        }
        const res = await createFn({
          data: {
            title: form.title.trim(),
            subject: form.subject.trim(),
            topic: form.topic.trim() || null,
            medium: form.medium,
            source: form.source.trim() || null,
            content: content.trim(),
          },
        });
        try {
          if (form.source.trim()) localStorage.setItem(SOURCE_KEY, form.source.trim());
        } catch {
          // storage unavailable
        }
        toast.success(
          res.subject !== form.subject.trim()
            ? `Saved ${res.chunks} chunks under existing subject "${res.subject}"`
            : `Saved ${res.chunks} chunks`,
        );
      }
      cancelEdit();
      qc.invalidateQueries({ queryKey: ["saathiDocs"] });
      qc.invalidateQueries({ queryKey: ["saathiHealth"] });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(doc: SaathiDoc, label: string) {
    if (
      !confirm(
        `Delete ${label} "${doc.title}"?${doc.parent_id == null ? " All its chunks will be deleted." : ""}`,
      )
    )
      return;
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
      {!isEditing && (
        <div className="flex w-fit max-w-full overflow-x-auto no-scrollbar rounded-lg border border-border p-0.5 bg-muted/40">
          <button
            type="button"
            onClick={() => setMode("content")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              mode === "content" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Upload content
          </button>
          <button
            type="button"
            onClick={() => setMode("qna")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              mode === "qna" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Upload Q&amp;A (Excel)
          </button>
          <button
            type="button"
            onClick={() => setMode("gaps")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              mode === "gaps" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Knowledge Gaps
          </button>
          <button
            type="button"
            onClick={() => setMode("test")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              mode === "test" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Test a question
          </button>
          <button
            type="button"
            onClick={() => setMode("evals")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              mode === "evals" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Test set
          </button>
          <button
            type="button"
            onClick={() => setMode("health")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              mode === "health" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            Health
          </button>
        </div>
      )}

      {isEditing || mode === "content" ? (
        <EntryForm
          form={form}
          setForm={setForm}
          subjects={subjects}
          sources={sources}
          saving={saving}
          editKind={editKind}
          onSubmit={onSave}
          onCancel={cancelEdit}
        />
      ) : mode === "qna" ? (
        <QnABulkUpload
          subjects={subjects}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["saathiDocs"] });
            qc.invalidateQueries({ queryKey: ["saathiHealth"] });
          }}
          createFn={createFn}
        />
      ) : mode === "test" ? (
        <RetrievalTester subjects={subjects} />
      ) : mode === "evals" ? (
        <EvalSetPanel documents={parents.map((d) => d.title)} />
      ) : mode === "health" ? (
        <HealthPanel onRebuilt={() => qc.invalidateQueries({ queryKey: ["saathiDocs"] })} />
      ) : (
        <KnowledgeGapsPanel />
      )}

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

        {filteredParents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-2 text-sm">
            <Label htmlFor="s-bulk-source" className="text-xs text-muted-foreground">
              Source for the {filteredParents.length} deck
              {filteredParents.length === 1 ? "" : "s"} shown
              {filter === ALL ? "" : ` in ${filter}`}
            </Label>
            <Input
              id="s-bulk-source"
              value={bulkSource}
              onChange={(e) => setBulkSource(e.target.value)}
              placeholder="e.g. NCERT"
              list="saathi-sources-bulk"
              className="h-8 w-44 text-sm"
            />
            <datalist id="saathi-sources-bulk">
              {sources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={settingSource}
              onClick={applySource}
            >
              {settingSource ? "Saving…" : "Set source"}
            </Button>
          </div>
        )}

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
              return (
                <li key={d.id} className="rounded-lg bg-card border border-border overflow-hidden">
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
                        {d.source ? `${d.source} · ` : ""}
                        {d.subject}
                        {d.topic ? ` › ${d.topic}` : ""} · {d.medium} · {d.chunk_count} chunk
                        {d.chunk_count === 1 ? "" : "s"}
                      </div>
                      {d.content.trim() && (
                        <div className="text-[11px] font-medium text-destructive">
                          Old format — not searchable until rebuilt
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => rebuild(d)}
                      disabled={rebuilding !== null}
                      className="h-8 w-8 grid place-items-center rounded-md text-foreground hover:bg-muted shrink-0 disabled:opacity-40"
                      title="Rebuild chunks"
                      aria-label="Rebuild chunks"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${rebuilding === d.id ? "animate-spin" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => startReplace(d)}
                      className="h-8 w-8 grid place-items-center rounded-md text-foreground hover:bg-muted shrink-0"
                      title="Replace content"
                      aria-label="Replace content"
                    >
                      <FileText className="h-4 w-4" />
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
                    <DeckChunks
                      deck={d}
                      onEdit={(c) => startEditChunk(c, d.title)}
                      onDelete={(c) => onDelete(c, "chunk")}
                    />
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

// A deck's chunks, fetched when the deck is opened. The query key starts with
// "saathiDocs", so every change that refreshes the deck list refreshes it too.
function DeckChunks({
  deck,
  onEdit,
  onDelete,
}: {
  deck: SaathiDeck;
  onEdit: (chunk: SaathiDoc) => void;
  onDelete: (chunk: SaathiDoc) => void;
}) {
  const chunksFn = useServerFn(listSaathiChunks);
  const q = useQuery({
    queryKey: ["saathiDocs", "chunks", deck.id],
    queryFn: () => chunksFn({ data: { parent_id: deck.id } }),
  });
  const chunks = q.data ?? [];
  return (
    <div className="border-t border-border bg-muted/20 px-2 py-2 space-y-1.5">
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground px-2 py-1">Loading chunks…</p>
      ) : q.error ? (
        <p className="text-xs text-destructive px-2 py-1">
          {q.error instanceof Error ? q.error.message : "Couldn't load the chunks"}
        </p>
      ) : chunks.length === 0 ? (
        <p className="text-xs text-muted-foreground px-2 py-1">
          No chunks in this deck yet. Use the Append button to add content.
        </p>
      ) : (
        chunks.map((c) => (
          <ChunkRow
            key={c.id}
            chunk={c}
            parentTitle={deck.title}
            onEdit={() => onEdit(c)}
            onDelete={() => onDelete(c)}
          />
        ))
      )}
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
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
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
  sources,
  saving,
  editKind,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: (f: FormState | ((p: FormState) => FormState)) => void;
  subjects: string[];
  sources: string[];
  saving: boolean;
  editKind: EditKind;
  onSubmit: (e: React.FormEvent, merged?: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const isChunk = editKind.kind === "edit-chunk";
  const isAppend = editKind.kind === "append";
  const isReplace = editKind.kind === "replace";
  const isEditParent = editKind.kind === "edit-parent";
  const isCreate = editKind.kind === "create";

  const heading = isChunk
    ? `Edit chunk`
    : isAppend
      ? `Append to "${editKind.parentTitle}"`
      : isReplace
        ? `Replace content of "${editKind.parentTitle}"`
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
      : isReplace
        ? saving
          ? "Replacing…"
          : "Replace Content"
        : isEditParent
          ? saving
            ? "Saving…"
            : "Update Deck"
          : saving
            ? "Saving…"
            : "Save to SAATHI";

  // PDF cleanup settings are remembered in this browser.
  const [cleanup, setCleanup] = useState<{ enabled: boolean; phrases: string }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CLEANUP_KEY) ?? "null");
      if (saved && typeof saved.enabled === "boolean") return saved;
    } catch {
      // storage unavailable
    }
    return { enabled: true, phrases: "" };
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLEANUP_KEY, JSON.stringify(cleanup));
    } catch {
      // storage unavailable
    }
  }, [cleanup]);

  const blockFor = (file: File, text: string) =>
    isChunk ? text : textBlockForFile(file.name, text);

  // Files are read in the order added. A chunk takes its file's text straight
  // into the content; a deck keeps each file's text in its own box, joined in
  // that order (after any text typed here) when it is saved.
  const queue = useFileQueue({
    medium: form.medium,
    resetKey: editKind,
    cleanup: {
      enabled: cleanup.enabled,
      phrases: cleanup.phrases
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    },
    onText: isChunk
      ? (file, text) => {
          const block = blockFor(file, text);
          setForm((prev) => ({
            ...prev,
            content: prev.content.trim() ? `${prev.content.trimEnd()}\n\n${block}` : block,
          }));
          return block;
        }
      : undefined,
    onRead: (file) =>
      setForm((prev) =>
        prev.title ? prev : { ...prev, title: file.name.replace(/\.[^.]+$/, "") },
      ),
  });
  const fileBlocks = queue.items
    .filter((i) => i.status === "done" && i.text !== undefined && i.text.trim())
    .map((i) => blockFor(i.file, i.text!.trim()));
  const merged = [form.content.trim(), ...fileBlocks].filter(Boolean).join("\n\n");

  // Puts the uncleaned text back in place of the cleaned text, if it hasn't
  // been edited since it was added (or the admin agrees to lose the edits).
  function undoCleanup(item: QueueItem) {
    if (!item.raw) return;
    if (item.text !== undefined) {
      if (
        item.text !== item.read &&
        !confirm("Restore the original text? Your edits to this file will be lost.")
      )
        return;
      queue.patch(item.id, {
        cleanupUndone: true,
        text: item.raw,
        read: item.raw,
        chars: item.raw.length,
      });
      toast.success("Original text restored");
      return;
    }
    if (!item.block) return;
    if (!form.content.includes(item.block)) {
      toast.error("This file's text was edited, so the cleanup can't be undone automatically.");
      return;
    }
    const rawBlock = blockFor(item.file, item.raw);
    setForm((prev) => ({ ...prev, content: prev.content.replace(item.block!, rawBlock) }));
    queue.patch(item.id, { cleanupUndone: true, block: rawBlock });
    toast.success("Original text restored");
  }
  const maxChars = isChunk ? 200_000 : 500_000;
  const tooLong = merged.length > maxChars;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    queue.add(files);
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
      onSubmit={(e) => {
        e.preventDefault();
        if (queue.busy || queue.failed || tooLong) {
          toast.error(
            queue.busy
              ? "Wait until all files are read"
              : queue.failed
                ? `${queue.failed.file.name} couldn't be read: retry it or remove it`
                : "Content is too long",
          );
          return;
        }
        void onSubmit(e, isChunk ? undefined : merged).then((ok) => {
          if (ok) queue.reset();
        });
      }}
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
          <div className="col-span-2">
            <Label htmlFor="s-topic">Topic (optional)</Label>
            <Input
              id="s-topic"
              value={form.topic}
              onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))}
              placeholder="e.g. Fundamental Rights — use the same topic as the matching flashcard deck"
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="s-source">Source (publisher)</Label>
            <Input
              id="s-source"
              value={form.source}
              onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
              placeholder="e.g. NCERT, IGNOU, RBSE"
              list="saathi-sources"
            />
            <datalist id="saathi-sources">
              {sources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-muted-foreground">
              Students see it with the title, e.g. “{form.source.trim() || "NCERT"} ·{" "}
              {form.title.trim() || "Indian Constitution at Work"}”, wherever SAATHI, the Telegram
              bot or the magazine cites this deck.
            </p>
          </div>
        </div>
      )}

      {showMetaFields && (
        <p className="text-xs text-muted-foreground">
          Pick the medium before parsing a PDF: Hindi and Bilingual use Hindi text recognition for
          scanned pages. Adding the same material in both languages? Choose Bilingual and drop both
          PDFs here; SAATHI tags each part by language and answers from the one matching the
          student's question.
        </p>
      )}

      {showContent && (
        <div>
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <Label htmlFor="s-content">
              {isChunk
                ? "Chunk content (Markdown)"
                : fileBlocks.length
                  ? "Your own text (Markdown, optional; saved before the files)"
                  : "Content (Markdown)"}
            </Label>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={SAATHI_ACCEPT}
                multiple={!isChunk}
                className="hidden"
                onChange={onPick}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                {isChunk ? "Import a file" : "Add PDFs / files"}
              </Button>
            </div>
          </div>
          {!isChunk && (
            <div className="mb-2 space-y-1.5 rounded-xl border border-border bg-muted/20 p-2 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cleanup.enabled}
                  onChange={(e) => setCleanup((c) => ({ ...c, enabled: e.target.checked }))}
                />
                Clean PDFs: remove running headers, footers, page numbers and watermarks
              </label>
              {cleanup.enabled && (
                <Input
                  value={cleanup.phrases}
                  onChange={(e) => setCleanup((c) => ({ ...c, phrases: e.target.value }))}
                  placeholder="Also remove lines containing… (comma-separated, e.g. Downloaded from, www.example.com)"
                  className="h-8 text-xs"
                />
              )}
            </div>
          )}
          <FileQueueList queue={queue} onUndoCleanup={undoCleanup} />
          <div className="flex flex-wrap items-center gap-1 mb-2">
            <button
              type="button"
              className={toolbarBtn}
              title="Heading 1"
              onClick={() => prefixLine("# ")}
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title="Heading 2"
              onClick={() => prefixLine("## ")}
            >
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
            <button
              type="button"
              className={toolbarBtn}
              title="Bullet list"
              onClick={() => prefixLine("- ")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <FileDropZone onFiles={(files) => queue.add(isChunk ? files.slice(0, 1) : files)}>
            <Textarea
              id="s-content"
              ref={taRef}
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              rows={!isChunk && queue.items.length ? 4 : 12}
              placeholder={
                isAppend
                  ? "Paste content or upload a PDF to add new chunks to this deck."
                  : isReplace
                    ? "Paste the new content or upload a PDF. It replaces all of this deck's chunks."
                    : "Paste text, drop PDFs here, or use the toolbar for **bold**, *italic*, # headings and <mark>highlight</mark>."
              }
              className="font-mono text-sm"
            />
          </FileDropZone>
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {isChunk
                ? "Drag a file onto the box to import it."
                : "Drag PDFs, DOCX, XLSX or TXT files onto the box. Files are read one by one, in order, and each file's text opens in its own box above to edit. A file that fails is tried again; if it still fails, reading stops there until you retry or remove it. Saving joins them into one deck in this order, each under its own heading."}
            </span>
            <span className={tooLong ? "font-medium text-destructive" : ""}>
              {merged.length.toLocaleString()} / {maxChars.toLocaleString()} characters
              {tooLong ? " — too long, split into two decks" : ""}
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!isCreate && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving || queue.busy || !!queue.failed || tooLong}>
          <Plus className="h-4 w-4" />{" "}
          {queue.failed
            ? "Retry or remove the failed file"
            : queue.busy
              ? "Reading files…"
              : submitLabel}
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
    data: {
      title: string;
      subject: string;
      topic: string | null;
      medium: SaathiMedium;
      content: string;
    };
  }) => Promise<unknown>;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
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
                topic: topic.trim() || null,
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
        <code className="font-mono">question</code>, <code className="font-mono">answer</code>, then
        one column per explanation section (the header text becomes the section title). One Excel
        file = one SAATHI entry; the file name becomes the entry title. Each row is saved as its own
        chunk, so explanations stay with their question. You can pick multiple files at once.
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
          <Select value={medium} onValueChange={(v) => setMedium(v as SaathiMedium)}>
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
        <div className="col-span-2">
          <Label htmlFor="qna-topic">Topic (optional)</Label>
          <Input
            id="qna-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Fundamental Rights"
          />
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

// Concepts behind recent magazine stories that no uploaded book explains, so
// the admin knows which books to add.
function UncoveredConceptsList() {
  const listFn = useServerFn(listUncoveredConcepts);
  const q = useQuery({ queryKey: ["saathiUncoveredConcepts"], queryFn: () => listFn() });
  const rows = q.data ?? [];
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold">Concepts your books don&apos;t cover yet</h3>
        <p className="text-sm text-muted-foreground">
          The static concept behind each magazine story (a missile type, a constitutional article, a
          convention) is looked up in your books for its Background box. These concepts had no
          matching passage in the last 6 months, so SAATHI wrote those backgrounds from its own
          knowledge. Upload a book that explains them; stories written after that get their
          background from the book.
        </p>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Failed to load"}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Every story's concept was found in your books.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Concept</th>
                <th className="px-3 py-2 w-20 text-right">Stories</th>
                <th className="px-3 py-2">Latest story</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.concept} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">{r.concept}</td>
                  <td className="px-3 py-2 text-right">{r.stories}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.example} · {r.last}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function KnowledgeGapsPanel() {
  const qc = useQueryClient();
  const listGapsFn = useServerFn(listKnowledgeGaps);
  const deleteGapFn = useServerFn(deleteKnowledgeGap);
  const gapsQ = useQuery<SaathiKnowledgeGap[]>({
    queryKey: ["saathiKnowledgeGaps"],
    queryFn: () => listGapsFn(),
  });

  const gaps = gapsQ.data ?? [];

  async function dismiss(id: string) {
    try {
      await deleteGapFn({ data: { id } });
      qc.setQueryData<SaathiKnowledgeGap[]>(["saathiKnowledgeGaps"], (cur) =>
        (cur ?? []).filter((g) => g.id !== id),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't dismiss");
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h3 className="font-semibold">Knowledge Gaps</h3>
          <p className="text-sm text-muted-foreground">
            Questions students asked that SAATHI couldn't answer. Upload matching study material,
            then dismiss the gap.
          </p>
        </div>

        {gapsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : gapsQ.error ? (
          <p className="text-sm text-destructive">
            {gapsQ.error instanceof Error ? gapsQ.error.message : "Failed to load gaps"}
          </p>
        ) : gaps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No knowledge gaps yet. 🎉</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Question</th>
                  <th className="px-3 py-2 w-24 text-right">Asked</th>
                  <th className="px-3 py-2 w-40">Last asked</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">{g.question}</td>
                    <td className="px-3 py-2 text-right font-medium">{g.ask_count}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(g.last_asked_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Dismiss gap"
                        title="Dismiss"
                        onClick={() => dismiss(g.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UncoveredConceptsList />

      <FeedbackPanel />
    </div>
  );
}

function FeedbackPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSaathiFeedback);
  const deleteFn = useServerFn(deleteSaathiFeedback);
  const feedbackQ = useQuery({ queryKey: ["saathiFeedback"], queryFn: () => listFn() });
  const data = feedbackQ.data;

  async function dismiss(id: string) {
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["saathiFeedback"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't dismiss");
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Answer Feedback</h3>
          <p className="text-sm text-muted-foreground">
            Answers students marked as not helpful. Fix or add the material behind them.
          </p>
        </div>
        {data && (
          <div className="shrink-0 text-sm text-muted-foreground">
            👍 {data.up} · 👎 {data.down}
          </div>
        )}
      </div>

      {feedbackQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : feedbackQ.error ? (
        <p className="text-sm text-destructive">
          {feedbackQ.error instanceof Error ? feedbackQ.error.message : "Failed to load feedback"}
        </p>
      ) : !data || data.recentDown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No negative feedback yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.recentDown.map((f: SaathiFeedback) => (
            <details key={f.id} className="rounded-lg border border-border p-3">
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-sm">
                <span className="font-medium">{f.question}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {new Date(f.created_at).toLocaleDateString()}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Dismiss feedback"
                    title="Dismiss"
                    onClick={(e) => {
                      e.preventDefault();
                      dismiss(f.id);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </span>
              </summary>
              <div className="prose prose-sm mt-2 max-w-none border-t border-border pt-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.answer}</ReactMarkdown>
              </div>
              {f.sources.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sources: {f.sources.join(", ")}
                </p>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function RetrievalTester({ subjects }: { subjects: string[] }) {
  const testFn = useServerFn(testSaathiRetrieval);
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState<string>(ALL);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaathiRetrievalResult | null>(null);
  const hits = result?.hits ?? null;
  const [open, setOpen] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    try {
      setResult(
        await testFn({
          data: { question: question.trim(), subjects: subject === ALL ? [] : [subject] },
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  const used = hits?.filter((h) => h.used_rank !== null).length ?? 0;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold">Test a question</h3>
        <p className="text-sm text-muted-foreground">
          Runs the same search students get. Hindi and Hinglish questions are also searched in
          English, then the AI picks the best chunks. Chunks below the cut-off are never used.
        </p>
      </div>
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What does Article 21 guarantee?"
          className="flex-1"
        />
        <div className="sm:w-44">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger>
              <SelectValue />
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
        <Button type="submit" disabled={busy || !question.trim()}>
          <Search className="h-4 w-4" />
          {busy ? "Searching…" : "Test"}
        </Button>
      </form>

      {hits &&
        (hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing matched. SAATHI would say this topic isn't in the study material.
          </p>
        ) : (
          <div className="space-y-2">
            {result && (result.english || result.standalone !== question.trim()) && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                {result.standalone !== question.trim() && (
                  <span className="block">Searched as: {result.standalone}</span>
                )}
                {result.english && (
                  <span className="block">Also searched in English: {result.english}</span>
                )}
              </p>
            )}
            <p className="text-sm">
              {used === 0
                ? "No chunk passes the cut-off, so SAATHI would answer that it has no material on this."
                : `${used} of ${hits.length} chunks would be sent to the AI, in this order.`}
            </p>
            {hits.map((h, i) => (
              <div
                key={h.id}
                className={`rounded-lg border p-3 text-sm ${
                  h.used_rank !== null ? "border-border" : "border-dashed border-border opacity-60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(open === h.id ? null : h.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{h.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {h.subject}
                      {h.topic ? ` › ${h.topic}` : ""}
                      {h.medium ? ` · ${h.medium}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-xs">
                    <span className="block">meaning {h.vector_score.toFixed(3)}</span>
                    <span className="block">keywords {h.keyword_score.toFixed(3)}</span>
                    <span className="block font-semibold">
                      {h.used_rank !== null
                        ? `✓ used #${h.used_rank}`
                        : h.relevant
                          ? "– not picked"
                          : "✗ below cut-off"}
                    </span>
                  </span>
                </button>
                {open === h.id ? (
                  <div className="prose prose-sm mt-2 max-w-none border-t border-border pt-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{h.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.content}</p>
                )}
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}

function HealthPanel({ onRebuilt }: { onRebuilt: () => void }) {
  const qc = useQueryClient();
  const healthFn = useServerFn(getSaathiHealth);
  const replaceFn = useServerFn(replaceSaathiDoc);
  const healthQ = useQuery({ queryKey: ["saathiHealth"], queryFn: () => healthFn() });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const rows = healthQ.data ?? [];
  // Documents saved before the new chunker have no stored original text.
  const outdated = rows.filter((r) => r.is_legacy || !r.has_source);
  const issues = (r: SaathiHealthRow) => {
    const list: string[] = [];
    if (r.is_legacy) list.push("old format, not searchable");
    else if (!r.has_source) list.push("old chunking");
    if (r.chunk_count === 0 && !r.is_legacy) list.push("no chunks");
    if (r.missing_embeddings) list.push(`${r.missing_embeddings} without embedding`);
    if (r.oversized_chunks) list.push(`${r.oversized_chunks} oversized`);
    if (r.tiny_chunks > 0 && r.tiny_chunks >= r.chunk_count / 3) list.push(`${r.tiny_chunks} tiny`);
    if (r.duplicate_chunks) list.push(`${r.duplicate_chunks} duplicated in other documents`);
    return list;
  };
  const withIssues = rows.filter((r) => issues(r).length > 0);
  const totalChunks = rows.reduce((n, r) => n + Number(r.chunk_count), 0);

  async function upgradeAll() {
    if (
      !confirm(
        `Rebuild ${outdated.length} document(s) with the new chunking? Each one is re-split and re-embedded, which uses AI credits.`,
      )
    )
      return;
    let failed = 0;
    setProgress({ done: 0, total: outdated.length });
    for (const [i, r] of outdated.entries()) {
      try {
        await replaceFn({ data: { id: r.id } });
      } catch (err) {
        failed += 1;
        toast.error(`${r.title}: ${err instanceof Error ? err.message : "failed"}`);
      }
      setProgress({ done: i + 1, total: outdated.length });
    }
    setProgress(null);
    toast.success(
      failed ? `Rebuilt ${outdated.length - failed}, ${failed} failed` : "All documents rebuilt",
    );
    qc.invalidateQueries({ queryKey: ["saathiHealth"] });
    onRebuilt();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Knowledge base health</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} documents · {totalChunks} chunks
          </p>
        </div>
        {outdated.length > 0 && (
          <Button onClick={upgradeAll} disabled={progress !== null}>
            <RefreshCw className={`h-4 w-4 ${progress ? "animate-spin" : ""}`} />
            {progress
              ? `Rebuilding ${progress.done} / ${progress.total}…`
              : `Rebuild ${outdated.length} outdated document${outdated.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      {healthQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : healthQ.error ? (
        <p className="text-sm text-destructive">
          {healthQ.error instanceof Error ? healthQ.error.message : "Failed to load health"}
        </p>
      ) : withIssues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No problems found. 🎉</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2 text-right">Chunks</th>
                <th className="px-3 py-2 text-right">Avg size</th>
                <th className="px-3 py-2">Issues</th>
              </tr>
            </thead>
            <tbody>
              {withIssues.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.subject}
                      {r.topic ? ` › ${r.topic}` : ""} · {r.medium}
                      {r.hindi_chunks || r.english_chunks
                        ? ` · ${[
                            r.hindi_chunks ? `${r.hindi_chunks} Hindi` : "",
                            r.english_chunks ? `${r.english_chunks} English` : "",
                          ]
                            .filter(Boolean)
                            .join(", ")}`
                        : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{r.chunk_count}</td>
                  <td className="px-3 py-2 text-right">{r.avg_chars}</td>
                  <td className="px-3 py-2 text-xs">{issues(r).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EvalSetPanel({ documents }: { documents: string[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSaathiEvals);
  const addFn = useServerFn(addSaathiEval);
  const deleteFn = useServerFn(deleteSaathiEval);
  const runFn = useServerFn(runSaathiEval);
  const listGapsFn = useServerFn(listKnowledgeGaps);
  const listFeedbackFn = useServerFn(listSaathiFeedback);
  const evalsQ = useQuery({ queryKey: ["saathiEvals"], queryFn: () => listFn() });
  // Unanswered and down-voted questions make good test questions.
  const gapsQ = useQuery({ queryKey: ["saathiKnowledgeGaps"], queryFn: () => listGapsFn() });
  const feedbackQ = useQuery({ queryKey: ["saathiFeedback"], queryFn: () => listFeedbackFn() });
  const suggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(feedbackQ.data?.recentDown ?? []).map((f) => f.question),
          ...(gapsQ.data ?? []).map((g) => g.question),
        ]),
      ).slice(0, 50),
    [gapsQ.data, feedbackQ.data],
  );

  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const rows = evalsQ.data ?? [];
  const ran = rows.filter((r) => r.last_passed !== null);
  const passed = ran.filter((r) => r.last_passed).length;

  const setRow = (row: SaathiEvalQuestion) =>
    qc.setQueryData<SaathiEvalQuestion[]>(["saathiEvals"], (cur) =>
      (cur ?? []).map((r) => (r.id === row.id ? row : r)),
    );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !expected) return;
    try {
      await addFn({ data: { question: question.trim(), expected_document: expected } });
      setQuestion("");
      qc.invalidateQueries({ queryKey: ["saathiEvals"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add");
    }
  }

  async function runAll() {
    if (!confirm(`Run ${rows.length} test question(s)? Each one uses a few AI calls.`)) return;
    setProgress({ done: 0, total: rows.length });
    for (const [i, r] of rows.entries()) {
      try {
        setRow(await runFn({ data: { id: r.id } }));
      } catch (err) {
        toast.error(`${r.question.slice(0, 40)}: ${err instanceof Error ? err.message : "failed"}`);
      }
      setProgress({ done: i + 1, total: rows.length });
    }
    setProgress(null);
  }

  async function remove(id: string) {
    try {
      await deleteFn({ data: { id } });
      qc.setQueryData<SaathiEvalQuestion[]>(["saathiEvals"], (cur) =>
        (cur ?? []).filter((r) => r.id !== id),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Test set</h3>
          <p className="text-sm text-muted-foreground">
            Save real questions (English, Hindi and Hinglish) with the document that should answer
            them, then run them after any change to see if search got better or worse.
          </p>
        </div>
        {rows.length > 0 && (
          <Button onClick={runAll} disabled={progress !== null}>
            <RefreshCw className={`h-4 w-4 ${progress ? "animate-spin" : ""}`} />
            {progress ? `Running ${progress.done} / ${progress.total}…` : "Run all"}
          </Button>
        )}
      </div>

      {ran.length > 0 && (
        <p className="text-sm font-medium">
          {passed} of {ran.length} passed ({Math.round((passed / ran.length) * 100)}%)
        </p>
      )}

      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question a student would ask"
          list="saathi-eval-suggestions"
        />
        <datalist id="saathi-eval-suggestions">
          {suggestions.map((q) => (
            <option key={q} value={q} />
          ))}
        </datalist>
        <Select value={expected} onValueChange={setExpected}>
          <SelectTrigger>
            <SelectValue placeholder="Document that answers it" />
          </SelectTrigger>
          <SelectContent>
            {Array.from(new Set(documents))
              .sort()
              .map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!question.trim() || !expected}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {evalsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : evalsQ.error ? (
        <p className="text-sm text-destructive">
          {evalsQ.error instanceof Error ? evalsQ.error.message : "Failed to load"}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No test questions yet. Unanswered and down-voted questions are suggested as you type.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2">Expected document</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    {r.question}
                    {r.last_english_query && (
                      <div className="text-xs text-muted-foreground">
                        English search: {r.last_english_query}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.expected_document}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {r.last_passed === null
                      ? "Not run"
                      : r.last_passed
                        ? `✓ found (#${r.last_rank})`
                        : "✗ not found"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Delete test question"
                      onClick={() => remove(r.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
