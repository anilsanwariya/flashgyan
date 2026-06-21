import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Plus, Trash2 } from "lucide-react";
import {
  createSaathiDoc,
  deleteSaathiDoc,
  listSaathiDocs,
  type SaathiDoc,
  type SaathiMedium,
} from "@/lib/saathi.functions";
import { extractTextFromFile } from "@/lib/saathi-parse";
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

export function SaathiPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSaathiDocs);
  const createFn = useServerFn(createSaathiDoc);
  const deleteFn = useServerFn(deleteSaathiDoc);
  const fileRef = useRef<HTMLInputElement>(null);

  const docsQ = useQuery<SaathiDoc[]>({
    queryKey: ["saathiDocs"],
    queryFn: () => listFn(),
  });

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [medium, setMedium] = useState<SaathiMedium>("English");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [filter, setFilter] = useState<string>(ALL);

  const docs = docsQ.data ?? [];
  const subjects = useMemo(
    () => Array.from(new Set(docs.map((d) => d.subject))).sort(),
    [docs],
  );
  const filtered = useMemo(
    () => (filter === ALL ? docs : docs.filter((d) => d.subject === filter)),
    [docs, filter],
  );

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
      setContent((prev) => (prev ? prev + "\n\n" + text : text));
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success(`Extracted ${text.length.toLocaleString()} characters`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse file");
    } finally {
      setExtracting(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !content.trim()) {
      toast.error("Title, subject, and content are required");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          title: title.trim(),
          subject: subject.trim(),
          medium,
          content: content.trim(),
        },
      });
      toast.success("Saved to SAATHI");
      setTitle("");
      setContent("");
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

      <form
        onSubmit={onSave}
        className="rounded-2xl bg-card border border-border p-4 space-y-3"
      >
        <div>
          <Label htmlFor="s-title">Title</Label>
          <Input
            id="s-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fundamental Rights overview"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-subject">Subject</Label>
            <Input
              id="s-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
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
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="s-content">Content</Label>
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
                {extracting ? "Extracting…" : "Upload PDF / DOCX / XLSX"}
              </Button>
            </div>
          </div>
          <Textarea
            id="s-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="Paste notes, or upload a file to auto-fill…"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || extracting}>
            <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Save to SAATHI"}
          </Button>
        </div>
      </form>

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
          <ul className="space-y-2">
            {filtered.map((d) => (
              <li
                key={d.id}
                className="rounded-xl bg-card border border-border p-3 flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {d.subject} · {d.medium}
                  </div>
                  <div className="font-semibold truncate">{d.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {d.content}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(d)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
