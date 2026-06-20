import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Plus, Trash2 } from "lucide-react";
import {
  createSaathiDoc,
  deleteSaathiDoc,
  listSaathiDocs,
  type SaathiDoc,
} from "@/lib/saathi.functions";
import { checkIsAdmin } from "@/lib/flashcards.functions";
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

export const Route = createFileRoute("/_authenticated/saathi-admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "SAATHI Admin — Knowledge Manager" }] }),
  component: SaathiAdmin,
});

function SaathiAdmin() {
  const router = useRouter();
  const qc = useQueryClient();
  const checkIsAdminFn = useServerFn(checkIsAdmin);
  const listFn = useServerFn(listSaathiDocs);
  const createFn = useServerFn(createSaathiDoc);
  const deleteFn = useServerFn(deleteSaathiDoc);

  const adminQ = useQuery({ queryKey: ["isAdmin"], queryFn: () => checkIsAdminFn() });
  const docsQ = useQuery<SaathiDoc[]>({
    queryKey: ["saathiDocs"],
    queryFn: () => listFn(),
    enabled: !!adminQ.data?.isAdmin,
  });

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("__all__");

  const docs = docsQ.data ?? [];
  const subjects = useMemo(
    () => Array.from(new Set(docs.map((d) => d.subject))).sort(),
    [docs],
  );
  const filtered = useMemo(
    () => (filter === "__all__" ? docs : docs.filter((d) => d.subject === filter)),
    [docs, filter],
  );

  if (adminQ.isLoading) {
    return (
      <div className="min-h-dvh grid place-items-center text-muted-foreground">Loading…</div>
    );
  }

  if (adminQ.data && !adminQ.data.isAdmin) {
    return (
      <div className="min-h-dvh bg-background p-6 max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-muted-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">Not authorized</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SAATHI admin requires the admin role. Your user id:
          </p>
          <code className="mt-3 block break-all bg-muted rounded-lg p-3 text-xs">
            {adminQ.data.userId}
          </code>
        </div>
      </div>
    );
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
        data: { title: title.trim(), subject: subject.trim(), content: content.trim() },
      });
      toast.success("Saved to SAATHI");
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["saathiDocs"] });
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
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-8 pb-4 max-w-3xl mx-auto flex items-center justify-between">
        <button
          onClick={() => router.navigate({ to: "/" })}
          className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </button>
        <Link
          to="/saathi"
          className="text-sm text-foreground inline-flex items-center gap-1 hover:opacity-80"
        >
          <MessageCircle className="h-4 w-4" /> Open chat
        </Link>
      </header>

      <main className="px-5 max-w-3xl mx-auto pb-24 space-y-8">
        <section>
          <h1 className="text-3xl font-extrabold tracking-tight">SAATHI Knowledge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload study material. SAATHI answers only from what you save here.
          </p>
        </section>

        <form
          onSubmit={onSave}
          className="rounded-3xl bg-card border border-border p-5 space-y-4 shadow-soft"
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
          <div>
            <Label htmlFor="s-subject">Subject</Label>
            <Input
              id="s-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Polity, History, Geography, General Science"
              list="saathi-subjects"
            />
            <datalist id="saathi-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="s-content">Content</Label>
            <Textarea
              id="s-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="Paste notes, facts, definitions…"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Save to SAATHI"}
            </Button>
          </div>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              Library{" "}
              <span className="text-muted-foreground text-sm font-normal">
                ({filtered.length})
              </span>
            </h2>
            <div className="w-48">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All subjects</SelectItem>
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
                  className="rounded-2xl bg-card border border-border p-4 flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {d.subject}
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
      </main>
    </div>
  );
}
