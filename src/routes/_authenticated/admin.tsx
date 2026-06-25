import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  bulkImportCards,
  checkIsAdmin,
  createCard,
  createDeck,
  deleteCard,
  deleteDeck,
  getDeck,
  listDecks,
  setCardImage,
  updateCard,
  updateDeck,
  uploadFlashcardImage,
  type DeckSummary,
  type Flashcard,
} from "@/lib/flashcards.functions";
import {
  bulkImportMcq,
  createMcqTest,
  deleteMcqQuestion,
  deleteMcqTest,
  getMcqTest,
  listMcqTests,
  setMcqQuestionImage,
  updateMcqQuestion,
  updateMcqTest,
  uploadMcqImage,
  type McqQuestion,
  type McqTestSummary,
} from "@/lib/mcq.functions";
import {
  bulkImportMcqPractice,
  createMcqPracticeTest,
  deleteMcqPracticeQuestion,
  deleteMcqPracticeTest,
  getMcqPracticeTest,
  listMcqPracticeTests,
  setMcqPracticeQuestionImage,
  updateMcqPracticeQuestion,
  updateMcqPracticeTest,
  uploadMcqPracticeImage,
  type McqPracticeQuestion,
  type McqPracticeTestSummary,
} from "@/lib/mcq-practice.functions";
import { parseMcqWorkbook, type ParsedMcqRow } from "@/lib/mcq-parse";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  LogOut,
  Trash2,
  Upload,
  ArrowLeft,
  Plus,
  Pencil,
  ImagePlus,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Flashgyan web" }] }),
  component: Admin,
});

import { SaathiPanel } from "@/components/saathi-panel";
import { HomePanel } from "@/components/home-panel";

type Tab = "home" | "flashcards" | "mcq" | "mcqPractice" | "saathi";


// ---------- Flashcard Excel parsing ----------

const REQUIRED_FC = ["order", "prompt", "question", "answer"] as const;
type Section = { title: string; body: string };
type ParsedFcRow = {
  order_index: number;
  prompt: string;
  question: string;
  answer: string;
  sections: Section[];
};

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}
function titleCase(s: string) {
  return s
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseFcWorkbook(file: ArrayBuffer) {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (json.length === 0) return { rows: [] as ParsedFcRow[], invalid: 0, missingCols: [] as string[] };
  const originalKeys = Object.keys(json[0]);
  const headerMap: Record<string, string> = {};
  for (const k of originalKeys) headerMap[normalizeKey(k)] = k;
  const missingCols = REQUIRED_FC.filter((c) => !(c in headerMap));
  if (missingCols.length) return { rows: [], invalid: 0, missingCols };
  const explanationCols: { key: string; title: string }[] = [];
  for (const k of originalKeys) {
    const nk = normalizeKey(k);
    if (nk.startsWith("explanation_")) {
      const suffix = nk.slice("explanation_".length);
      if (suffix) explanationCols.push({ key: k, title: titleCase(suffix) });
    }
  }
  const pick = (row: Record<string, unknown>, name: string) => {
    const k = headerMap[name];
    return k ? String(row[k] ?? "").trim() : "";
  };
  const rows: ParsedFcRow[] = [];
  let invalid = 0;
  for (const row of json) {
    const orderRaw = pick(row, "order");
    const prompt = pick(row, "prompt");
    const question = pick(row, "question");
    const answer = pick(row, "answer");
    const orderNum = Number(orderRaw);
    if (
      !prompt || !question || !answer || !orderRaw ||
      !Number.isFinite(orderNum) || !Number.isInteger(orderNum)
    ) {
      invalid++;
      continue;
    }
    const sections: Section[] = [];
    for (const col of explanationCols) {
      const body = String(row[col.key] ?? "").trim();
      if (body) sections.push({ title: col.title, body });
    }
    rows.push({ order_index: orderNum, prompt, question, answer, sections });
  }
  return { rows, invalid, missingCols: [] };
}

// ---------- Top-level Admin ----------

function Admin() {
  const router = useRouter();
  const qc = useQueryClient();
  const checkIsAdminFn = useServerFn(checkIsAdmin);
  const adminQ = useQuery({ queryKey: ["isAdmin"], queryFn: () => checkIsAdminFn() });
  const [tab, setTab] = useState<Tab>("home");

  async function onSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (adminQ.isLoading) {
    return <div className="min-h-dvh grid place-items-center text-muted-foreground">Loading…</div>;
  }

  if (adminQ.data && !adminQ.data.isAdmin) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <Header onSignOut={onSignOut} />
        <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-10">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Not authorized</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account exists but isn't an admin yet. Ask your project owner to grant
              admin to user id:
            </p>
            <code className="mt-3 block break-all bg-muted rounded-lg p-3 text-xs">
              {adminQ.data.userId}
            </code>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Header onSignOut={onSignOut} />
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-6 space-y-6 pb-24">
        <div className="grid grid-cols-5 gap-2 rounded-xl bg-muted p-1">
          <TabButton active={tab === "home"} onClick={() => setTab("home")}>
            Home
          </TabButton>
          <TabButton active={tab === "flashcards"} onClick={() => setTab("flashcards")}>
            Flashcards
          </TabButton>
          <TabButton active={tab === "mcq"} onClick={() => setTab("mcq")}>
            MCQ Tests
          </TabButton>
          <TabButton active={tab === "mcqPractice"} onClick={() => setTab("mcqPractice")}>
            MCQ Practice
          </TabButton>
          <TabButton active={tab === "saathi"} onClick={() => setTab("saathi")}>
            SAATHI KB
          </TabButton>
        </div>
        {tab === "home" ? (
          <HomePanel />
        ) : tab === "flashcards" ? (
          <FlashcardsPanel />
        ) : tab === "mcq" ? (
          <McqPanel />
        ) : tab === "mcqPractice" ? (
          <McqPracticePanel />
        ) : (
          <SaathiPanel />
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "h-9 rounded-lg text-sm font-medium transition-colors " +
        (active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

// ====================== Flashcards Panel ======================

function FlashcardsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDecks);
  const deleteFn = useServerFn(deleteDeck);
  const decksQ = useQuery<DeckSummary[]>({
    queryKey: ["decksAdmin"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<DeckSummary | "new" | null>(null);
  const [viewingDeckId, setViewingDeckId] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [filterTopic, setFilterTopic] = useState<string | null>(null);

  const decks = decksQ.data ?? [];

  const subjects = useMemo(
    () => Array.from(new Set(decks.map((d) => d.subject))).sort(),
    [decks],
  );
  const topics = useMemo(
    () =>
      filterSubject
        ? Array.from(
            new Set(decks.filter((d) => d.subject === filterSubject).map((d) => d.topic)),
          ).sort()
        : [],
    [decks, filterSubject],
  );
  const filtered = useMemo(
    () =>
      decks.filter(
        (d) =>
          (!filterSubject || d.subject === filterSubject) &&
          (!filterTopic || d.topic === filterTopic),
      ),
    [decks, filterSubject, filterTopic],
  );

  if (viewingDeckId) {
    return (
      <DeckCardsView
        deckId={viewingDeckId}
        onBack={() => {
          setViewingDeckId(null);
          qc.invalidateQueries({ queryKey: ["decksAdmin"] });
        }}
      />
    );
  }

  async function onDelete(d: DeckSummary) {
    if (!confirm(`Delete deck "${d.name}"? This removes all its cards.`)) return;
    try {
      await deleteFn({ data: { id: d.id } });
      toast.success("Deck deleted");
      qc.invalidateQueries({ queryKey: ["decksAdmin"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Decks</h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add Deck
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FilterSelect
          label="Subject"
          placeholder="All subjects"
          options={subjects}
          value={filterSubject}
          onChange={(v) => {
            setFilterSubject(v);
            setFilterTopic(null);
          }}
        />
        <FilterSelect
          label="Topic"
          placeholder={filterSubject ? "All topics" : "Pick subject"}
          options={topics}
          value={filterTopic}
          onChange={setFilterTopic}
          disabled={!filterSubject}
        />
      </div>

      {decksQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length > 0 ? (
        <ul className="space-y-2">
          {filtered.map((d) => (
            <li key={d.id} className="rounded-xl bg-card border border-border p-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewingDeckId(d.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="text-xs text-muted-foreground">
                    Order {d.order_index} · {d.subject} · {d.topic}
                  </div>
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.count} card{d.count === 1 ? "" : "s"}
                    {d.description ? ` · ${d.description}` : ""}
                  </div>
                </button>
                <button
                  onClick={() => setEditing(d)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg hover:bg-accent"
                  aria-label="Edit deck"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(d)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  aria-label="Delete deck"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewingDeckId(d.id)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg hover:bg-accent"
                  aria-label="Open deck"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {decks.length === 0 ? "No decks yet. Add your first deck." : "No decks match the filters."}
        </p>
      )}

      {editing !== null && (
        <DeckFormDialog
          deck={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["decksAdmin"] });
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const ALL = "__all__";
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {label}
      </div>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DeckFormDialog({
  deck,
  onClose,
  onSaved,
}: {
  deck: DeckSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createFn = useServerFn(createDeck);
  const updateFn = useServerFn(updateDeck);
  const [name, setName] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [subject, setSubject] = useState(deck?.subject ?? "");
  const [topic, setTopic] = useState(deck?.topic ?? "");
  const [order, setOrder] = useState(String(deck?.order_index ?? 0));
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const ord = Number(order);
    if (!name.trim()) return toast.error("Name is required");
    if (!subject.trim()) return toast.error("Subject is required");
    if (!topic.trim()) return toast.error("Topic is required");
    if (!Number.isFinite(ord) || !Number.isInteger(ord))
      return toast.error("Order must be an integer");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        subject: subject.trim(),
        topic: topic.trim(),
        order_index: ord,
      };
      if (deck) {
        await updateFn({ data: { id: deck.id, ...payload } });
        toast.success("Deck updated");
      } else {
        await createFn({ data: payload });
        toast.success("Deck created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deck ? "Edit deck" : "Add deck"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="d-name">Name</Label>
            <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="d-desc">Short description</Label>
            <Textarea
              id="d-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="d-subj">Subject</Label>
              <Input id="d-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="d-topic">Topic</Label>
              <Input id="d-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="d-order">Order</Label>
            <Input
              id="d-order"
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeckCardsView({
  deckId,
  onBack,
}: {
  deckId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getDeck);
  const importFn = useServerFn(bulkImportCards);
  const delFn = useServerFn(deleteCard);

  const deckQ = useQuery({
    queryKey: ["deckAdmin", deckId],
    queryFn: () => getFn({ data: { id: deckId } }),
  });

  const [parsed, setParsed] = useState<ParsedFcRow[] | null>(null);
  const [invalid, setInvalid] = useState(0);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Flashcard | "new" | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const { rows, invalid, missingCols } = parseFcWorkbook(buf);
    if (missingCols.length) {
      toast.error("Missing required columns: " + missingCols.join(", "));
      setParsed(null);
      return;
    }
    if (rows.length === 0) {
      toast.error("No valid rows found.");
      setParsed(null);
      return;
    }
    setParsed(rows);
    setInvalid(invalid);
    toast.success(`Parsed ${rows.length} rows${invalid ? ` (${invalid} skipped)` : ""}`);
  }

  async function onImport() {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const res = await importFn({ data: { deck_id: deckId, rows: parsed, mode } });
      toast.success(`Imported ${res.inserted} cards`);
      setParsed(null);
      setFileName("");
      qc.invalidateQueries({ queryKey: ["deckAdmin", deckId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteCard(c: Flashcard) {
    if (!confirm("Delete this card?")) return;
    try {
      await delFn({ data: { id: c.id } });
      toast.success("Card deleted");
      qc.invalidateQueries({ queryKey: ["deckAdmin", deckId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All decks
      </button>

      {deckQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : deckQ.data ? (
        <>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {deckQ.data.deck.subject} · {deckQ.data.deck.topic}
            </div>
            <h2 className="text-xl font-semibold mt-1">{deckQ.data.deck.name}</h2>
            {deckQ.data.deck.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {deckQ.data.deck.description}
              </p>
            )}
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload cards Excel
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Columns: order, prompt, question, answer, optional
              explanation_&lt;title&gt; columns.
            </p>
            <label className="mt-4 flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-border cursor-pointer hover:bg-accent/40">
              <div className="text-center">
                <div className="text-sm font-medium">
                  {fileName || "Tap to choose .xlsx file"}
                </div>
                {parsed && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {parsed.length} valid rows{invalid ? ` · ${invalid} skipped` : ""}
                  </div>
                )}
              </div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
            </label>
            {parsed && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ModeButton active={mode === "append"} onClick={() => setMode("append")}>
                    Append
                  </ModeButton>
                  <ModeButton active={mode === "replace"} onClick={() => setMode("replace")}>
                    Replace all
                  </ModeButton>
                </div>
                <Button onClick={onImport} disabled={submitting} className="mt-4 w-full h-11">
                  {submitting ? "Importing…" : `Import ${parsed.length} cards`}
                </Button>
              </>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                Cards ({deckQ.data.cards.length})
              </h3>
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Add Card
              </Button>
            </div>
            {deckQ.data.cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cards yet. Add one or upload an Excel file above.
              </p>
            ) : (
              <ul className="space-y-3">
                {deckQ.data.cards.map((c) => (
                  <CardRow
                    key={c.id}
                    c={c}
                    onEdit={() => setEditing(c)}
                    onDelete={() => onDeleteCard(c)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {editing !== null && (
        <CardEditDialog
          deckId={deckId}
          card={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["deckAdmin", deckId] });
          }}
        />
      )}
    </div>
  );
}

function CardRow({
  c,
  onEdit,
  onDelete,
}: {
  c: Flashcard;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="text-xs text-muted-foreground tabular-nums shrink-0 mt-0.5">
          #{c.order_index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {c.prompt}
          </div>
          <div className="text-sm font-medium mt-0.5">{c.question}</div>
          {c.image_url && (
            <img
              src={c.image_url}
              alt=""
              className="mt-2 w-full max-w-xs aspect-[2/1] rounded-md border border-border object-cover"
            />
          )}
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 line-clamp-2">
            {c.answer}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-accent"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="h-8 w-8 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function CardEditDialog({
  deckId,
  card,
  onClose,
  onSaved,
}: {
  deckId: string;
  card: Flashcard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createFn = useServerFn(createCard);
  const updateFn = useServerFn(updateCard);
  const setImgFn = useServerFn(setCardImage);
  const uploadFn = useServerFn(uploadFlashcardImage);

  const [form, setForm] = useState(
    card
      ? { ...card }
      : ({
          id: "",
          deck_id: deckId,
          subject: "",
          topic: "",
          order_index: 0,
          prompt: "",
          question: "",
          answer: "",
          image_url: null as string | null,
          sections: [] as Section[],
        } as Flashcard),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Track storage path separately so we can re-sign without losing it.
  const [imagePath, setImagePath] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!card) {
      toast.error("Save the card first, then upload an image.");
      return;
    }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const dataBase64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const { path, url } = await uploadFn({
        data: {
          id: card.id,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64,
        },
      });
      setImagePath(path);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveImage() {
    if (!card) return;
    setUploading(true);
    try {
      await setImgFn({ data: { id: card.id, image_url: null } });
      setImagePath(null);
      setForm((f) => ({ ...f, image_url: null }));
      toast.success("Image removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (!form.prompt.trim() || !form.question.trim() || !form.answer.trim()) {
      toast.error("Prompt, question, and answer are required");
      return;
    }
    setSaving(true);
    try {
      if (card) {
        await updateFn({
          data: {
            id: card.id,
            order_index: Number(form.order_index),
            prompt: form.prompt.trim(),
            question: form.question.trim(),
            answer: form.answer.trim(),
            // Preserve storage path if we have one, otherwise keep existing value.
            image_url: imagePath ?? form.image_url,
            sections: form.sections,
          },
        });
        toast.success("Card updated");
      } else {
        await createFn({
          data: {
            deck_id: deckId,
            order_index: Number(form.order_index),
            prompt: form.prompt.trim(),
            question: form.question.trim(),
            answer: form.answer.trim(),
            sections: form.sections,
          },
        });
        toast.success("Card created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(i: number, field: "title" | "body", val: string) {
    setForm((f) => {
      const arr = [...f.sections];
      arr[i] = { ...arr[i], [field]: val };
      return { ...f, sections: arr };
    });
  }
  function addSection() {
    setForm((f) => ({ ...f, sections: [...f.sections, { title: "", body: "" }] }));
  }
  function removeSection(i: number) {
    setForm((f) => ({ ...f, sections: f.sections.filter((_, idx) => idx !== i) }));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card ? "Edit card" : "Add card"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Order</Label>
            <Input
              type="number"
              value={form.order_index}
              onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Prompt (small label above question)</Label>
            <Input
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          </div>
          <div>
            <Label>Question</Label>
            <Textarea
              rows={2}
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
            />
          </div>
          <div>
            <Label>Image (shown under question, 2:1)</Label>
            {form.image_url && (
              <img
                src={form.image_url}
                alt=""
                className="my-2 w-full aspect-[2/1] rounded-md border border-border object-cover"
              />
            )}
            <div className="flex gap-2">
              <label
                className={
                  "inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent " +
                  (card ? "cursor-pointer" : "opacity-50 cursor-not-allowed")
                }
              >
                <ImagePlus className="h-4 w-4" />
                {uploading ? "Uploading…" : form.image_url ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onUpload}
                  disabled={!card}
                />
              </label>
              {form.image_url && card && (
                <Button variant="outline" size="sm" onClick={onRemoveImage} disabled={uploading}>
                  Remove
                </Button>
              )}
            </div>
            {!card && (
              <p className="mt-1 text-xs text-muted-foreground">
                Save the card first, then upload an image.
              </p>
            )}
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea
              rows={3}
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Explanation sections</Label>
              <Button size="sm" variant="outline" onClick={addSection}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <div className="space-y-2 mt-2">
              {form.sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-border p-2 space-y-2">
                  <Input
                    placeholder="Section title"
                    value={s.title}
                    onChange={(e) => updateSection(i, "title", e.target.value)}
                  />
                  <Textarea
                    placeholder="Body"
                    rows={2}
                    value={s.body}
                    onChange={(e) => updateSection(i, "body", e.target.value)}
                  />
                  <button
                    onClick={() => removeSection(i)}
                    className="text-xs text-destructive"
                  >
                    Remove section
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====================== MCQ Panel ======================

function McqPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMcqTests);
  const deleteFn = useServerFn(deleteMcqTest);
  const testsQ = useQuery<McqTestSummary[]>({ queryKey: ["mcqTestsAdmin"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<McqTestSummary | "new" | null>(null);
  const [viewingTestId, setViewingTestId] = useState<string | null>(null);

  if (viewingTestId) {
    return (
      <McqQuestionsView
        testId={viewingTestId}
        onBack={() => {
          setViewingTestId(null);
          qc.invalidateQueries({ queryKey: ["mcqTestsAdmin"] });
        }}
      />
    );
  }

  async function onDelete(t: McqTestSummary) {
    if (!confirm(`Delete test "${t.name}"? This removes all its questions.`)) return;
    try {
      await deleteFn({ data: { id: t.id } });
      toast.success("Test deleted");
      qc.invalidateQueries({ queryKey: ["mcqTestsAdmin"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">MCQ Tests</h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add Test
        </Button>
      </div>

      {testsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : testsQ.data && testsQ.data.length > 0 ? (
        <ul className="space-y-2">
          {testsQ.data.map((t) => (
            <li key={t.id} className="rounded-xl bg-card border border-border p-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewingTestId(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="text-xs text-muted-foreground">
                    Order {t.order_index} · {Math.round(t.duration_seconds / 60)} min
                  </div>
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.question_count} question{t.question_count === 1 ? "" : "s"}
                    {t.description ? ` · ${t.description}` : ""}
                  </div>
                </button>
                <button
                  onClick={() => setEditing(t)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg hover:bg-accent"
                  aria-label="Edit test"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(t)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  aria-label="Delete test"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewingTestId(t.id)}
                  className="shrink-0 h-9 w-9 grid place-items-center rounded-lg hover:bg-accent"
                  aria-label="Open test"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tests yet. Add your first test.</p>
      )}

      {editing !== null && (
        <TestFormDialog
          test={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["mcqTestsAdmin"] });
          }}
        />
      )}
    </div>
  );
}

function TestFormDialog({
  test,
  onClose,
  onSaved,
}: {
  test: McqTestSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createFn = useServerFn(createMcqTest);
  const updateFn = useServerFn(updateMcqTest);
  const [name, setName] = useState(test?.name ?? "");
  const [description, setDescription] = useState(test?.description ?? "");
  const [order, setOrder] = useState(String(test?.order_index ?? 0));
  const [minutes, setMinutes] = useState(
    String(test ? Math.round(test.duration_seconds / 60) : 10),
  );
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const ord = Number(order);
    const mins = Number(minutes);
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!Number.isFinite(ord) || !Number.isInteger(ord)) {
      toast.error("Order must be an integer");
      return;
    }
    if (!Number.isFinite(mins) || mins < 1) {
      toast.error("Duration must be at least 1 minute");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        order_index: ord,
        duration_seconds: Math.round(mins * 60),
      };
      if (test) {
        await updateFn({ data: { id: test.id, ...payload } });
        toast.success("Test updated");
      } else {
        await createFn({ data: payload });
        toast.success("Test created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{test ? "Edit test" : "Add test"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-desc">Short description</Label>
            <Textarea
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-order">Order</Label>
              <Input
                id="t-order"
                type="number"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t-min">Duration (minutes)</Label>
              <Input
                id="t-min"
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function McqQuestionsView({
  testId,
  onBack,
}: {
  testId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMcqTest);
  const importFn = useServerFn(bulkImportMcq);
  const delQFn = useServerFn(deleteMcqQuestion);

  const testQ = useQuery({
    queryKey: ["mcqTest", testId],
    queryFn: () => getFn({ data: { id: testId } }),
  });

  const [parsed, setParsed] = useState<ParsedMcqRow[] | null>(null);
  const [invalid, setInvalid] = useState(0);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<McqQuestion | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const { rows, invalid, missingCols } = parseMcqWorkbook(buf);
    if (missingCols.length) {
      toast.error("Missing required columns: " + missingCols.join(", "));
      setParsed(null);
      return;
    }
    if (rows.length === 0) {
      toast.error("No valid rows found.");
      setParsed(null);
      return;
    }
    setParsed(rows);
    setInvalid(invalid);
    toast.success(`Parsed ${rows.length} rows${invalid ? ` (${invalid} skipped)` : ""}`);
  }

  async function onImport() {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const res = await importFn({ data: { test_id: testId, rows: parsed, mode } });
      toast.success(`Imported ${res.inserted} questions`);
      setParsed(null);
      setFileName("");
      qc.invalidateQueries({ queryKey: ["mcqTest", testId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteQ(q: McqQuestion) {
    if (!confirm("Delete this question?")) return;
    try {
      await delQFn({ data: { id: q.id } });
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["mcqTest", testId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All tests
      </button>

      {testQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : testQ.data ? (
        <>
          <div>
            <h2 className="text-xl font-semibold">{testQ.data.test.name}</h2>
            {testQ.data.test.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {testQ.data.test.description}
              </p>
            )}
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload questions Excel
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Columns: order, question, option_1, option_2, option_3, option_4, answer,
              optional hint, optional explanation_&lt;title&gt; columns. Answer accepts 1–4,
              A–D, option_1..option_4, or option text.
            </p>
            <label className="mt-4 flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-border cursor-pointer hover:bg-accent/40">
              <div className="text-center">
                <div className="text-sm font-medium">
                  {fileName || "Tap to choose .xlsx file"}
                </div>
                {parsed && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {parsed.length} valid rows{invalid ? ` · ${invalid} skipped` : ""}
                  </div>
                )}
              </div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
            </label>
            {parsed && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ModeButton active={mode === "append"} onClick={() => setMode("append")}>
                    Append
                  </ModeButton>
                  <ModeButton active={mode === "replace"} onClick={() => setMode("replace")}>
                    Replace all
                  </ModeButton>
                </div>
                <Button onClick={onImport} disabled={submitting} className="mt-4 w-full h-11">
                  {submitting ? "Importing…" : `Import ${parsed.length} questions`}
                </Button>
              </>
            )}
          </section>

          <section>
            <h3 className="font-semibold mb-3">
              Questions ({testQ.data.questions.length})
            </h3>
            {testQ.data.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions yet. Upload an Excel file above.
              </p>
            ) : (
              <ul className="space-y-3">
                {testQ.data.questions.map((q) => (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    onEdit={() => setEditing(q)}
                    onDelete={() => onDeleteQ(q)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {editing && (
        <QuestionEditDialog
          q={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["mcqTest", testId] });
          }}
        />
      )}
    </div>
  );
}

function QuestionRow({
  q,
  onEdit,
  onDelete,
}: {
  q: McqQuestion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const opts = [q.option_1, q.option_2, q.option_3, q.option_4];
  return (
    <li className="rounded-xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="text-xs text-muted-foreground tabular-nums shrink-0 mt-0.5">
          #{q.order_index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{q.question}</div>
          {q.image_url && (
            <img
              src={q.image_url}
              alt=""
              className="mt-2 max-h-32 rounded-md border border-border"
            />
          )}
          <ol className="mt-2 space-y-0.5 text-xs">
            {opts.map((o, i) => (
              <li
                key={i}
                className={
                  q.answer === i + 1
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground"
                }
              >
                {i + 1}. {o}
                {q.answer === i + 1 ? "  ✓" : ""}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-accent"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="h-8 w-8 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function QuestionEditDialog({
  q,
  onClose,
  onSaved,
}: {
  q: McqQuestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateMcqQuestion);
  const setImgFn = useServerFn(setMcqQuestionImage);
  const uploadFn = useServerFn(uploadMcqImage);
  const [form, setForm] = useState({ ...q });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const dataBase64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const { url } = await uploadFn({
        data: {
          id: q.id,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64,
        },
      });
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveImage() {
    setUploading(true);
    try {
      await setImgFn({ data: { id: q.id, image_url: null } });
      setForm((f) => ({ ...f, image_url: null }));
      toast.success("Image removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      await updateFn({
        data: {
          id: q.id,
          order_index: Number(form.order_index),
          question: form.question.trim(),
          hint: form.hint.trim(),
          image_url: form.image_url,
          option_1: form.option_1.trim(),
          option_2: form.option_2.trim(),
          option_3: form.option_3.trim(),
          option_4: form.option_4.trim(),
          answer: Number(form.answer),
          explanation_sections: form.explanation_sections,
        },
      });
      toast.success("Question updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(i: number, field: "title" | "body", val: string) {
    setForm((f) => {
      const arr = [...f.explanation_sections];
      arr[i] = { ...arr[i], [field]: val };
      return { ...f, explanation_sections: arr };
    });
  }
  function addSection() {
    setForm((f) => ({
      ...f,
      explanation_sections: [...f.explanation_sections, { title: "", body: "" }],
    }));
  }
  function removeSection(i: number) {
    setForm((f) => ({
      ...f,
      explanation_sections: f.explanation_sections.filter((_, idx) => idx !== i),
    }));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit question</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Order</Label>
            <Input
              type="number"
              value={form.order_index}
              onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Question</Label>
            <Textarea
              rows={2}
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
            />
          </div>
          <div>
            <Label>Image (shown between question and hint)</Label>
            {form.image_url && (
              <img
                src={form.image_url}
                alt=""
                className="my-2 max-h-32 rounded-md border border-border"
              />
            )}
            <div className="flex gap-2">
              <label className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm cursor-pointer hover:bg-accent">
                <ImagePlus className="h-4 w-4" />
                {uploading ? "Uploading…" : form.image_url ? "Replace" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
              </label>
              {form.image_url && (
                <Button variant="outline" size="sm" onClick={onRemoveImage} disabled={uploading}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label>Hint</Label>
            <Textarea
              rows={2}
              value={form.hint}
              onChange={(e) => setForm({ ...form, hint: e.target.value })}
            />
          </div>
          {[1, 2, 3, 4].map((n) => {
            const key = `option_${n}` as "option_1" | "option_2" | "option_3" | "option_4";
            return (
              <div key={n}>
                <Label>
                  Option {n}
                  {form.answer === n && (
                    <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ correct
                    </span>
                  )}
                </Label>
                <Input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            );
          })}
          <div>
            <Label>Correct answer (1–4)</Label>
            <Input
              type="number"
              min={1}
              max={4}
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: Number(e.target.value) })}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Explanation sections</Label>
              <Button size="sm" variant="outline" onClick={addSection}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <div className="space-y-2 mt-2">
              {form.explanation_sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-border p-2 space-y-2">
                  <Input
                    placeholder="Section title"
                    value={s.title}
                    onChange={(e) => updateSection(i, "title", e.target.value)}
                  />
                  <Textarea
                    placeholder="Body"
                    rows={2}
                    value={s.body}
                    onChange={(e) => updateSection(i, "body", e.target.value)}
                  />
                  <button
                    onClick={() => removeSection(i)}
                    className="text-xs text-destructive"
                  >
                    Remove section
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====================== Shared ======================

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="px-5 py-4 border-b border-border bg-background">
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="text-base font-semibold">Admin</h1>
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </header>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "h-10 rounded-lg text-sm font-medium border transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border bg-card text-foreground hover:bg-accent")
      }
    >
      {children}
    </button>
  );
}
