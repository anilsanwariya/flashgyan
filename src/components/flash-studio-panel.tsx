// Admin: the flashcard studio. Deck types (prompt and explanation columns),
// topics made from several books' sheets, their cards proofread here, and
// the topic finalised once: shuffled, split into chunks and numbered 1, 2,
// 3… across the chunks. Chunks download in the app uploader's exact columns;
// the app's export comes back here to keep each card's id, so a fixed card's
// chunk can be downloaded again and uploaded to the same place.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  ClipboardPaste,
  Download,
  FileUp,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  addFlashCard,
  createFlashTopic,
  deleteFlashCard,
  fillFlashExplanations,
  deleteFlashTemplate,
  deleteFlashTopic,
  getFlashTopic,
  importFlashSheet,
  listFlashTemplates,
  listFlashTopics,
  numberFlashCards,
  saveFlashAppIds,
  markFlashDownloaded,
  saveFlashCard,
  saveFlashTemplate,
  updateFlashTopic,
  type ImportResult,
  type TopicSummary,
} from "@/lib/flash-studio.functions";
import {
  BOOK_COLORS,
  ERROR_TYPES,
  chunkChanges,
  chunkFileName,
  inLetters,
  lettersOf,
  chunkRows,
  lastNumbers,
  newColumnId,
  parseSheet,
  suggestSizes,
  type FlashBook,
  type FlashCard,
  type FlashColumn,
  type FlashSourceRow,
  type FlashTemplate,
  type FlashTopic,
  type IdMatch,
  type ParsedSheet,
  type WordKey,
} from "@/lib/flash-studio";
import { zipFiles } from "@/lib/zip";
import { BooksPanel } from "@/components/flash-studio-books";
import { ProofTools, Versions } from "@/components/flash-studio-proof";
import { booksOf, disagreement, emptyColumns } from "@/lib/flash-merge";
import { BOOK_FILE_TYPES, isBookFile } from "@/lib/flash-read";
import { Badge, PageTabs, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------- Files ----------

async function readRows(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

async function xlsxBytes(rows: (string | number)[][]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  // Empty cells stay empty, as in the finished sheets.
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((v) => (v === "" ? null : v))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function saveBytes(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------- The page ----------

function useOpenTopic(): [string | null, (id: string | null) => void] {
  const navigate = useNavigate();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("topic"));
  }, []);
  const choose = (next: string | null) => {
    setId(next);
    void navigate({
      to: ".",
      search: (s: Record<string, unknown>) => {
        const { topic: _t, ...rest } = s;
        return next ? { ...rest, topic: next } : rest;
      },
      replace: true,
    } as never);
  };
  return [id, choose];
}

export function FlashStudio() {
  const [open, setOpen] = useOpenTopic();
  const [tab, setTab] = useState<"topics" | "types">("topics");
  if (open) return <TopicView id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bring in each book&apos;s sheet, proofread the cards, then finalise the topic: the cards are
        shuffled, split into chunks and numbered 1, 2, 3… across them, never to change.
      </p>
      <PageTabs
        label="Card studio"
        tabs={[
          { id: "topics", label: "Topics" },
          { id: "types", label: "Deck types" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "topics" ? <TopicList onOpen={setOpen} /> : <TemplateList />}
    </div>
  );
}

// ---------- Topics ----------

function TopicList({ onOpen }: { onOpen: (id: string) => void }) {
  const listFn = useServerFn(listFlashTopics);
  const typesFn = useServerFn(listFlashTemplates);
  const createFn = useServerFn(createFlashTopic);
  const deleteFn = useServerFn(deleteFlashTopic);
  const qc = useQueryClient();
  const topics = useQuery({
    queryKey: ["flashTopics"],
    queryFn: () => listFn(),
    refetchOnMount: true,
  });
  const types = useQuery({ queryKey: ["flashTemplates"], queryFn: () => typesFn() });
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const typeName = (id: string | null) => types.data?.find((t) => t.id === id)?.name ?? "";
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            const t = await createFn({ data: { name, template_id: type || null } });
            await qc.invalidateQueries({ queryKey: ["flashTopics"] });
            setName("");
            onOpen(t.id);
          } catch (err) {
            toast.error(errorText(err, "Couldn't make the topic"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="min-w-0 flex-1 basis-56 space-y-1 text-sm">
          <span className="font-medium">New topic</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. पारिभाषिक शब्दावली A–E"
          />
        </label>
        <label className="basis-56 space-y-1 text-sm">
          <span className="font-medium">Deck type</span>
          <select
            aria-label="Deck type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">None (set the columns yourself)</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Make topic
        </Button>
      </form>
      {topics.error && <p className="text-sm text-destructive">{errorText(topics.error, "")}</p>}
      {topics.data && !topics.data.length && (
        <p className="text-sm text-muted-foreground">No topics yet.</p>
      )}
      <ul className="space-y-2">
        {topics.data?.map((t: TopicSummary) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-3"
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t.id)}>
              <div className="font-medium">{t.name}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {typeName(t.template_id) && <span>{typeName(t.template_id)} ·</span>}
                <span>{t.total} cards</span>
                <Badge tone={t.verified === t.total && t.total ? "good" : "muted"}>
                  {t.verified} verified
                </Badge>
                {t.errors > 0 && <Badge tone="bad">{t.errors} to recheck</Badge>}
                {t.chunks.length ? (
                  <Badge tone="primary">
                    <Lock className="h-3 w-3" /> {t.chunks.length} chunks · {t.withId}/{t.numbered}{" "}
                    with app ids
                  </Badge>
                ) : (
                  <Badge>Not finalised</Badge>
                )}
                {t.books.map((b) => (
                  <span
                    key={b.code}
                    className="rounded px-1.5 text-[11px] text-slate-800"
                    style={{ background: b.color }}
                  >
                    {b.code}
                  </span>
                ))}
              </div>
            </button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${t.name}`}
              onClick={async () => {
                if (!confirm(`Delete “${t.name}” and its ${t.total} cards?`)) return;
                try {
                  await deleteFn({ data: { id: t.id } });
                  await qc.invalidateQueries({ queryKey: ["flashTopics"] });
                } catch (err) {
                  toast.error(errorText(err, "Couldn't delete"));
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Deck types ----------

function TemplateList() {
  const typesFn = useServerFn(listFlashTemplates);
  const saveFn = useServerFn(saveFlashTemplate);
  const deleteFn = useServerFn(deleteFlashTemplate);
  const qc = useQueryClient();
  const types = useQuery({
    queryKey: ["flashTemplates"],
    queryFn: () => typesFn(),
    refetchOnMount: true,
  });
  const [editing, setEditing] = useState<FlashTemplate | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          A new topic copies its deck type&apos;s prompt and columns; change them for one topic in
          its Settings.
        </p>
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" /> New deck type
        </Button>
      </div>
      {types.error && <p className="text-sm text-destructive">{errorText(types.error, "")}</p>}
      <ul className="grid gap-2 md:grid-cols-2">
        {types.data?.map((t) => (
          <li key={t.id} className="space-y-1 rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-sm" lang="hi">
                  {t.prompt}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Edit ${t.name}`}
                onClick={() => setEditing(t)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {t.columns.map((c) => (
                <Badge key={c.id} title={c.hint}>
                  {c.title}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (t) => {
            await saveFn({ data: { ...(editing !== "new" ? { id: editing.id } : {}), ...t } });
            await qc.invalidateQueries({ queryKey: ["flashTemplates"] });
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : async () => {
                  if (
                    !confirm(`Delete the deck type “${editing.name}”? Topics keep their columns.`)
                  )
                    return;
                  await deleteFn({ data: { id: editing.id } });
                  await qc.invalidateQueries({ queryKey: ["flashTemplates"] });
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

type TemplateDraft = { name: string; prompt: string; columns: FlashColumn[]; word_key: WordKey };

function TemplateDialog({
  template,
  onClose,
  onSave,
  onDelete,
}: {
  template: FlashTemplate | null;
  onClose: () => void;
  onSave: (t: TemplateDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [t, setT] = useState<TemplateDraft>({
    name: template?.name ?? "",
    prompt: template?.prompt ?? "",
    columns: template?.columns ?? [],
    word_key: template?.word_key ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit deck type" : "New deck type"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          </label>
          <PromptField value={t.prompt} onChange={(prompt) => setT({ ...t, prompt })} />
          <WordKeyField value={t.word_key} onChange={(word_key) => setT({ ...t, word_key })} />
          <ColumnsEditor columns={t.columns} onChange={(columns) => setT({ ...t, columns })} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(t);
                } catch (e) {
                  toast.error(errorText(e, "Couldn't save"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
            {onDelete && (
              <Button
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => void onDelete()}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PromptField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">Prompt</span>
      <Input lang="hi" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="text-xs text-muted-foreground">
        Kept exactly, spaces included{/\s$/.test(value) ? " (ends with a space)" : ""}.
      </span>
    </label>
  );
}

function WordKeyField({ value, onChange }: { value: WordKey; onChange: (v: WordKey) => void }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">wordKey</span>
      <select
        aria-label="wordKey"
        value={value}
        onChange={(e) => onChange(e.target.value as WordKey)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Empty</option>
        <option value="front">front (the front's word links across topics)</option>
        <option value="back">back (the back's word links across topics)</option>
      </select>
    </label>
  );
}

function ColumnsEditor({
  columns,
  onChange,
}: {
  columns: FlashColumn[];
  onChange: (c: FlashColumn[]) => void;
}) {
  const set = (i: number, patch: Partial<FlashColumn>) =>
    onChange(columns.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Explanation columns</div>
      <p className="text-xs text-muted-foreground">
        Each becomes <code>explanation_&lt;title&gt;</code>; the title is what students see. The
        note says what goes in it.
      </p>
      <ol className="space-y-2">
        {columns.map((c, i) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
          >
            <Input
              aria-label={`Column ${i + 1} title`}
              lang="hi"
              className="h-8 basis-40"
              value={c.title}
              onChange={(e) => set(i, { title: e.target.value })}
            />
            <Input
              aria-label={`Column ${i + 1} note`}
              className="h-8 min-w-0 flex-1 basis-56"
              value={c.hint}
              placeholder="What goes in it"
              onChange={(e) => set(i, { hint: e.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label="Move up"
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label="Move down"
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label={`Remove column ${c.title}`}
              onClick={() => onChange(columns.filter((_, k) => k !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...columns, { id: newColumnId(columns), title: "", hint: "" }])}
      >
        <Plus className="mr-1 h-4 w-4" /> Add column
      </Button>
    </div>
  );
}

// ---------- One topic ----------

type TopicTab = "cards" | "chunks" | "settings";

function TopicView({ id, onBack }: { id: string; onBack: () => void }) {
  const getFn = useServerFn(getFlashTopic);
  const q = useQuery({
    queryKey: ["flashTopic", id],
    queryFn: () => getFn({ data: { id } }),
    refetchOnMount: true,
  });
  const qc = useQueryClient();
  const [tab, setTab] = useState<TopicTab>("cards");
  const reload = () => qc.invalidateQueries({ queryKey: ["flashTopic", id] });
  // A card saved: put into the list without reloading every card.
  const putCard = (card: FlashCard | FlashCard[]) => {
    const next = new Map((Array.isArray(card) ? card : [card]).map((c) => [c.id, c]));
    qc.setQueryData(["flashTopic", id], (old: typeof q.data) =>
      old ? { ...old, cards: old.cards.map((c) => next.get(c.id) ?? c) } : old,
    );
  };
  if (q.error)
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Topics
        </Button>
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't open the topic")}</p>
      </div>
    );
  if (!q.data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const { topic, cards, sources } = q.data;
  const live = cards.filter((c) => !c.removed);
  const unnumbered = live.filter((c) => c.card_order === null).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Topics
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{topic.name}</h1>
        <span className="basis-full text-sm text-muted-foreground sm:basis-auto">
          {live.length} cards · {live.filter((c) => c.verified).length} verified
          {topic.chunks.length
            ? ` · ${topic.chunks.length} chunk${topic.chunks.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
      <PageTabs
        label="Topic"
        tabs={[
          { id: "cards", label: "Cards" },
          { id: "chunks", label: "Chunks", dot: topic.chunks.length > 0 && unnumbered > 0 },
          { id: "settings", label: "Settings" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "cards" && (
        <CardsTab
          topic={topic}
          cards={cards}
          sources={sources}
          onChanged={reload}
          onCard={putCard}
        />
      )}
      {tab === "chunks" && <ChunksTab topic={topic} cards={cards} onChanged={reload} />}
      {tab === "settings" && <SettingsTab topic={topic} onChanged={reload} />}
    </div>
  );
}

// ---------- Cards ----------

type Filter =
  | "all"
  | "errors"
  | "unverified"
  | "verified"
  | "several"
  | "single"
  | "differ"
  | "own"
  | "missing"
  | "notes"
  | "unnumbered"
  | "removed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unverified", label: "Not verified" },
  { id: "errors", label: "To recheck" },
  { id: "verified", label: "Verified" },
  { id: "several", label: "In several books" },
  { id: "single", label: "One book only" },
  { id: "differ", label: "Books differ" },
  { id: "own", label: "Not from your books" },
  { id: "missing", label: "Missing explanations" },
  { id: "notes", label: "Notes" },
  { id: "unnumbered", label: "Not numbered" },
  { id: "removed", label: "Removed" },
];

function CardsTab({
  topic,
  cards,
  sources,
  onChanged,
  onCard,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  sources: FlashSourceRow[];
  onChanged: () => void;
  onCard: (c: FlashCard | FlashCard[]) => void;
}) {
  const addFn = useServerFn(addFlashCard);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(60);
  const [editing, setEditing] = useState<FlashCard | null>(null);
  // Proofreading: the cards shown, one after another.
  const [proof, setProof] = useState<{ ids: string[]; i: number } | null>(null);
  const [importing, setImporting] = useState<{ file: string; sheet: ParsedSheet } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [pasting, setPasting] = useState(false);
  const books = new Map(topic.books.map((b) => [b.code, b]));
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter((c) => {
        if (filter === "removed") return c.removed;
        if (c.removed) return false;
        if (filter === "errors") return c.error;
        if (filter === "unverified") return !c.verified;
        if (filter === "verified") return c.verified;
        if (filter === "unnumbered") return c.card_order === null;
        if (filter === "several") return booksOf(c).length > 1;
        if (filter === "single") return booksOf(c).length <= 1;
        if (filter === "differ") {
          const d = disagreement(c);
          return d.answer || d.spelling;
        }
        if (filter === "own") return c.own.length > 0;
        if (filter === "missing") return emptyColumns(c, topic.columns).length > 0;
        if (filter === "notes") return !!c.note || c.sources.some((s) => s.note);
        return true;
      })
      .filter(
        (c) =>
          !q ||
          `${c.front}\n${c.back}\n${Object.values(c.ex).join("\n")}`.toLowerCase().includes(q) ||
          String(c.card_order) === q,
      )
      .sort((a, b) => (a.card_order ?? Infinity) - (b.card_order ?? Infinity) || a.pos - b.pos);
  }, [cards, filter, query, topic.columns]);
  return (
    <div className="space-y-3">
      <BooksPanel
        topic={topic}
        sources={sources}
        onChanged={onChanged}
        openFile={bookFile}
        onOpened={() => setBookFile(null)}
        pasting={pasting}
        setPasting={setPasting}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <FileUp className="mr-1 h-4 w-4" /> Add a book or sheet
        </Button>
        <input
          ref={fileRef}
          type="file"
          aria-label="Book or sheet file"
          accept={`.xlsx,.xls,.csv,${BOOK_FILE_TYPES}`}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (isBookFile(file)) return setBookFile(file);
            try {
              const sheet = parseSheet(await readRows(file));
              if (!sheet.cards.length) throw new Error("No cards found in the sheet");
              setImporting({ file: file.name, sheet });
            } catch (err) {
              toast.error(errorText(err, "Couldn't read the sheet"));
            }
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              setEditing(await addFn({ data: { topic_id: topic.id } }));
              onChanged();
            } catch (err) {
              toast.error(errorText(err, "Couldn't add a card"));
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add card
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPasting(true)}>
          <ClipboardPaste className="mr-1 h-4 w-4" /> Paste text
        </Button>
        <div className="relative ml-auto min-w-0 basis-56">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search cards"
            className="h-9 pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, or a card number"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!list.length}
          onClick={() => {
            const ids = list.map((c) => c.id);
            const first = list.findIndex((c) => !c.verified);
            setProof({ ids, i: Math.max(0, first) });
          }}
        >
          <BadgeCheck className="mr-1 h-4 w-4" /> Proofread ({list.length})
        </Button>
        <ProofTools
          topic={topic}
          cards={cards}
          shownIds={list.map((c) => c.id)}
          onChanged={onChanged}
          onCards={onCard}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setShown(60);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {list.length} cards
        </span>
      </div>
      {!cards.length && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Add each book&apos;s Excel sheet with the columns <code>order</code>, <code>prompt</code>,{" "}
          <code>front</code>, <code>back</code> and any <code>explanation_…</code> columns (a{" "}
          <code>Book</code> column is optional; otherwise you name the book when adding it). A
          finished sheet with sheet and order columns keeps its chunks and numbers. Word files, PDFs
          and pasted text can also be read by the AI.
        </p>
      )}
      <ul className="space-y-2">
        {list.slice(0, shown).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setEditing(c)}
              className={`w-full rounded-xl border p-3 text-left hover:bg-muted/40 ${c.error ? "border-red-300" : "border-border"}`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                {c.card_order !== null && (
                  <Badge tone="primary">
                    #{c.card_order} · chunk {c.chunk}
                  </Badge>
                )}
                {c.sources.map((s, i) => (
                  <span
                    key={i}
                    className="rounded px-1.5 text-[11px] text-slate-800"
                    style={{ background: books.get(s.book)?.color ?? "#e5e7eb" }}
                  >
                    {s.book}
                    {s.pos !== null && s.pos !== undefined ? ` ${s.pos}` : ""}
                  </span>
                ))}
                {c.verified && (
                  <Badge tone="good">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </Badge>
                )}
                {c.error && (
                  <Badge tone="bad">
                    <AlertTriangle className="h-3 w-3" /> {c.error_type || "Recheck"}
                  </Badge>
                )}
                {c.app_id && <Badge title={`App id ${c.app_id}`}>app id</Badge>}
                {c.removed && <Badge tone="warn">Removed</Badge>}
                <CardFlags topic={topic} card={c} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2" lang="hi">
                <div className="whitespace-pre-wrap font-medium">{c.front || "—"}</div>
                <div className="whitespace-pre-wrap text-sm">{c.back || "—"}</div>
              </div>
              {(c.sources[0]?.heading || c.sources[0]?.rule || c.sources[0]?.note) && (
                <div className="mt-1 text-xs text-muted-foreground" lang="hi">
                  {[c.sources[0].heading, c.sources[0].rule].filter(Boolean).join(" · ")}
                  {c.sources[0].note && (
                    <span className="ml-1 text-amber-700 dark:text-amber-400">
                      Book&apos;s note: {c.sources[0].note}
                    </span>
                  )}
                </div>
              )}
              {c.note && (
                <div className="mt-1 text-xs text-red-700 dark:text-red-400" lang="hi">
                  {c.note}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
      {list.length > shown && (
        <Button variant="outline" size="sm" onClick={() => setShown(shown + 120)}>
          Show more ({list.length - shown} left)
        </Button>
      )}
      {editing && !proof && (
        <CardDialog
          topic={topic}
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            onCard(c);
            setEditing(c);
          }}
          onGone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {proof && cards.find((c) => c.id === proof.ids[proof.i]) && (
        <CardDialog
          topic={topic}
          card={cards.find((c) => c.id === proof.ids[proof.i])!}
          nav={{
            index: proof.i,
            total: proof.ids.length,
            prev: () => setProof((p) => (p && p.i > 0 ? { ...p, i: p.i - 1 } : p)),
            next: () =>
              setProof((p) => {
                if (!p) return p;
                if (p.i + 1 >= p.ids.length) {
                  toast.success("End of the list");
                  return null;
                }
                return { ...p, i: p.i + 1 };
              }),
          }}
          onClose={() => setProof(null)}
          onSaved={(c) => onCard(c)}
          onGone={() => {
            setProof((p) => (p ? { ids: p.ids.filter((id) => id !== p.ids[p.i]), i: p.i } : p));
            onChanged();
          }}
        />
      )}
      {importing && (
        <ImportDialog
          topic={topic}
          hasNumbers={cards.some((c) => c.card_order !== null) || topic.chunks.length > 0}
          file={importing.file}
          sheet={importing.sheet}
          onClose={() => setImporting(null)}
          onDone={() => {
            setImporting(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// A card's merge and explanation state, as small badges.
function CardFlags({ topic, card: c }: { topic: FlashTopic; card: FlashCard }) {
  const books = booksOf(c).length;
  const d = disagreement(c);
  const missing = emptyColumns(c, topic.columns).length;
  return (
    <>
      {books > 1 && <Badge tone="primary">{books} books</Badge>}
      {d.answer && !c.verified && <Badge tone="warn">Books differ</Badge>}
      {d.spelling && !c.verified && <Badge tone="warn">Spellings differ</Badge>}
      {c.own.length > 0 && (
        <Badge tone="warn" title="Written by the AI from its own knowledge: check against a book">
          ◇ {c.own.length} not from your books
        </Badge>
      )}
      {missing > 0 && topic.columns.length > 0 && <Badge>{missing} empty</Badge>}
    </>
  );
}

function ImportDialog({
  topic,
  hasNumbers,
  file,
  sheet,
  onClose,
  onDone,
}: {
  topic: FlashTopic;
  hasNumbers: boolean;
  file: string;
  sheet: ParsedSheet;
  onClose: () => void;
  onDone: () => void;
}) {
  const importFn = useServerFn(importFlashSheet);
  const qc = useQueryClient();
  const needsBook = sheet.cards.some((c) => !c.book);
  const [book, setBook] = useState("");
  const [keep, setKeep] = useState(sheet.numbered && !hasNumbers);
  const [busy, setBusy] = useState(false);
  const known = new Set(topic.columns.map((c) => c.title.trim()));
  const newCols = sheet.columns.filter((c) => !known.has(c.trim()));
  const books = [...new Set(sheet.cards.map((c) => c.book).filter(Boolean))];
  const promptDiffers = !!topic.prompt && !!sheet.prompt && sheet.prompt !== topic.prompt;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add “{file}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            <b>{sheet.cards.length}</b> cards
            {books.length ? ` from ${books.join(", ")}` : ""}
            {sheet.columns.length ? ` · explanations: ${sheet.columns.join(", ")}` : ""}.
          </p>
          {sheet.problems.map((p) => (
            <p key={p} className="text-amber-700 dark:text-amber-400">
              {p}
            </p>
          ))}
          {newCols.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400">
              New explanation columns for this topic: {newCols.join(", ")}.
            </p>
          )}
          {promptDiffers && (
            <p className="text-amber-700 dark:text-amber-400" lang="hi">
              Its prompt differs from the topic&apos;s: “{sheet.prompt}”. Those cards keep their own
              prompt.
            </p>
          )}
          {needsBook && (
            <label className="block space-y-1">
              <span className="font-medium">Book (short name, for cards without one)</span>
              <Input value={book} onChange={(e) => setBook(e.target.value)} placeholder="e.g. RP" />
            </label>
          )}
          {sheet.numbered && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={keep}
                disabled={hasNumbers}
                onChange={(e) => setKeep(e.target.checked)}
              />
              <span>
                Keep its chunks and numbers (the sheet&apos;s <code>sheet</code> and{" "}
                <code>order</code>): for a topic already uploaded to the app.
                {hasNumbers &&
                  " This topic already has numbers, so these cards are added without theirs."}
              </span>
            </label>
          )}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r: ImportResult = await importFn({
                  data: {
                    topic_id: topic.id,
                    cards: sheet.cards,
                    columns: sheet.columns,
                    prompt: sheet.prompt,
                    book: book.trim(),
                    keep_numbers: keep && !hasNumbers,
                  },
                });
                toast.success(
                  `${r.added} cards added${r.numbered ? " with their chunks and numbers" : ""}`,
                );
                await qc.invalidateQueries({ queryKey: ["flashTopics"] });
                onDone();
              } catch (e) {
                toast.error(errorText(e, "Couldn't add the sheet"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Adding…" : `Add ${sheet.cards.length} cards`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Nav = { index: number; total: number; prev: () => void; next: () => void };

function CardDialog({
  topic,
  card,
  nav,
  onClose,
  onSaved,
  onGone,
}: {
  topic: FlashTopic;
  card: FlashCard;
  // Proofreading: this card's place in the list, and moving along it.
  nav?: Nav;
  onClose: () => void;
  onSaved: (c: FlashCard) => void;
  onGone: () => void;
}) {
  const saveFn = useServerFn(saveFlashCard);
  const deleteFn = useServerFn(deleteFlashCard);
  const fillFn = useServerFn(fillFlashExplanations);
  const [c, setC] = useState(card);
  const [busy, setBusy] = useState(false);
  useEffect(() => setC(card), [card]);
  const save = async (patch: Partial<FlashCard>) => {
    setBusy(true);
    try {
      onSaved(await saveFn({ data: { id: card.id, patch: patch as never } }));
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the card"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const changed = JSON.stringify(c) !== JSON.stringify(card);
  const saveAndVerify = async () => {
    const ok = await save({ ...textPatch, verified: true });
    if (ok && nav) nav.next();
  };
  const go = async (move: () => void) => {
    // Edits aren't lost moving on: saved first.
    if (changed && !(await save(textPatch))) return;
    move();
  };
  // Keys: Alt+→ / Alt+← next and previous, Ctrl+Enter save and verify,
  // Ctrl+S save.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (busy) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      void saveAndVerify();
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save(textPatch);
    } else if (nav && e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      void go(nav.next);
    } else if (nav && e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      void go(nav.prev);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const textPatch = {
    front: c.front,
    back: c.back,
    back_hint: c.back_hint,
    prompt: c.prompt,
    is_revealed: c.is_revealed,
    word_key: c.word_key,
    ex: c.ex,
    own: c.own,
    note: c.note,
    error: c.error,
    error_type: c.error_type,
  };
  const field = (label: string, value: string, set: (v: string) => void, rows = 2) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Textarea
        aria-label={label}
        lang="hi"
        rows={rows}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {nav ? `Proofreading ${nav.index + 1} of ${nav.total} · ` : ""}
            {c.card_order !== null ? `Card #${c.card_order} · chunk ${c.chunk}` : "Card"}
          </DialogTitle>
        </DialogHeader>
        {nav && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={busy || nav.index === 0}
              onClick={() => void go(nav.prev)}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={busy}
              onClick={() => void go(nav.next)}
            >
              Next <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
            <span>
              Keys: Alt+← / Alt+→ previous / next · Ctrl+Enter save, verify and next · Ctrl+S save
            </span>
          </div>
        )}
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {c.sources.length
              ? `From ${c.sources.map((s) => `${s.book}${s.pos != null ? ` (${s.pos})` : ""}`).join(", ")}`
              : "Added by hand"}
            {c.app_id ? ` · app id ${c.app_id}` : ""}
          </p>
          {field("front", c.front, (front) => setC({ ...c, front }), 3)}
          {field("back", c.back, (back) => setC({ ...c, back }), 3)}
          <Versions
            topic={topic}
            card={card}
            onUse={(patch) => setC({ ...c, ...patch })}
            onSplit={() => {
              toast.success("That book's version is its own card again");
              onGone();
            }}
          />
          {c.note && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-2 text-sm dark:bg-red-950/20">
              <span className="min-w-0 flex-1" lang="hi">
                {c.note}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setC({ ...c, note: "" })}
              >
                Clear note
              </Button>
            </div>
          )}
          {topic.columns.length > 0 && emptyColumns(c, topic.columns).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (JSON.stringify(c) !== JSON.stringify(card))
                    await saveFn({ data: { id: card.id, patch: textPatch as never } });
                  const r = await fillFn({ data: { topic_id: topic.id, ids: [card.id] } });
                  if (r.cards[0]) onSaved(r.cards[0]);
                  else toast("Nothing to fill");
                } catch (e) {
                  toast.error(errorText(e, "The AI couldn't fill this card"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Sparkles className="mr-1 h-4 w-4" /> Fill the empty explanations
            </Button>
          )}
          {topic.columns.map((col) => (
            <div key={col.id}>
              {field(
                `explanation_${col.title}`,
                c.ex[col.id] ?? "",
                (v) =>
                  setC({
                    ...c,
                    ex: { ...c.ex, [col.id]: v },
                    // Edited by hand: the editor's now.
                    own: c.own.filter((o) => o !== col.id),
                  }),
                3,
              )}
              {c.own.includes(col.id) && (
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  ◇ Not from your books: written by the AI from its own knowledge. Check it in a
                  book; editing it makes it yours.
                </p>
              )}
              {col.hint && <p className="mt-0.5 text-xs text-muted-foreground">{col.hint}</p>}
            </div>
          ))}
          <details className="rounded-lg border border-border p-2 text-sm">
            <summary className="cursor-pointer font-medium">
              More: prompt, backHint, isRevealed, wordKey
            </summary>
            <div className="mt-2 space-y-2">
              <label className="block space-y-1">
                <span>Prompt (empty: the topic&apos;s)</span>
                <Input
                  lang="hi"
                  value={c.prompt ?? ""}
                  placeholder={topic.prompt}
                  onChange={(e) => setC({ ...c, prompt: e.target.value || null })}
                />
              </label>
              {field("backHint", c.back_hint, (back_hint) => setC({ ...c, back_hint }), 1)}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.is_revealed}
                  onChange={(e) => setC({ ...c, is_revealed: e.target.checked })}
                />
                Shown already revealed (isRevealed = 1)
              </label>
              <label className="block space-y-1">
                <span>wordKey</span>
                <select
                  aria-label="Card wordKey"
                  value={c.word_key ?? "topic"}
                  onChange={(e) =>
                    setC({
                      ...c,
                      word_key: e.target.value === "topic" ? null : (e.target.value as WordKey),
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2"
                >
                  <option value="topic">The topic&apos;s ({topic.word_key || "empty"})</option>
                  <option value="">Empty</option>
                  <option value="front">front</option>
                  <option value="back">back</option>
                </select>
              </label>
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.error}
                onChange={(e) => setC({ ...c, error: e.target.checked })}
              />
              To recheck
            </label>
            {c.error && (
              <select
                aria-label="Error type"
                value={c.error_type}
                onChange={(e) => setC({ ...c, error_type: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-2"
              >
                <option value="">Kind of error…</option>
                {[...new Set([...ERROR_TYPES, ...(c.error_type ? [c.error_type] : [])])].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ),
                )}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void save(textPatch)}>
              Save
            </Button>
            <Button
              disabled={busy}
              variant={c.verified ? "outline" : "default"}
              className={c.verified ? "" : "bg-emerald-600 hover:bg-emerald-700"}
              onClick={() =>
                c.verified ? void save({ ...textPatch, verified: false }) : void saveAndVerify()
              }
            >
              <BadgeCheck className="mr-1 h-4 w-4" />
              {c.verified ? "Not verified" : nav ? "Save, verify and next" : "Save and verify"}
            </Button>
            {!c.removed && (
              <Button
                variant="ghost"
                className="ml-auto text-destructive"
                disabled={busy}
                onClick={async () => {
                  const numbered = c.card_order !== null;
                  if (
                    !confirm(
                      numbered
                        ? `Remove card #${c.card_order}? Its number is never used again; delete it in the app too.`
                        : "Delete this card?",
                    )
                  )
                    return;
                  try {
                    await deleteFn({ data: { id: c.id } });
                    onGone();
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't delete"));
                  }
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {c.card_order !== null ? "Remove" : "Delete"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Chunks ----------

function ChunksTab({
  topic,
  cards,
  onChanged,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  onChanged: () => void;
}) {
  const numberFn = useServerFn(numberFlashCards);
  const idsFn = useServerFn(saveFlashAppIds);
  const markFn = useServerFn(markFlashDownloaded);
  const qc = useQueryClient();
  const live = cards.filter((c) => !c.removed);
  const unnumbered = live.filter((c) => c.card_order === null);
  // An alphabetical range (a chapter like A–E) numbered now, the rest later.
  const letters = useMemo(() => lettersOf(unnumbered), [unnumbered]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const waiting = range
    ? unnumbered.filter((c) => inLetters(c.front, range.from, range.to))
    : unnumbered;
  const changes = useMemo(() => chunkChanges(topic, cards), [topic, cards]);
  const [target, setTarget] = useState(100);
  const [sizes, setSizes] = useState(() => suggestSizes(waiting.length, 100).join(", "));
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<IdMatch | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => setSizes(suggestSizes(waiting.length, target).join(", ")),
    [waiting.length, target],
  );
  const parsed = sizes
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const sum = parsed.reduce((a, b) => a + b, 0);
  const valid =
    parsed.length > 0 &&
    parsed.every((n) => Number.isInteger(n) && n > 0) &&
    sum === waiting.length;
  const after = lastNumbers(topic, cards);
  const preview = valid
    ? parsed.map((n, i) => {
        const from = after.order + parsed.slice(0, i).reduce((a, b) => a + b, 0) + 1;
        return { n: after.chunk + i + 1, from, to: from + n - 1 };
      })
    : [];
  const removed = cards.filter((c) => c.removed && c.card_order !== null);
  const unverified = waiting.filter((c) => !c.verified).length;
  const flagged = waiting.filter((c) => c.error).length;
  // Chunks downloaded for the app: their time kept, so later edits show.
  const downloaded = async (ns: number[]) => {
    try {
      await markFn({ data: { topic_id: topic.id, chunks: ns } });
      onChanged();
    } catch {
      // The file is saved; only the "changed since" mark is missed.
    }
  };
  const download = async (chunk: number, work = false) => {
    const rows = chunkRows(topic, cards, chunk, work);
    saveBytes(
      `${chunkFileName(topic.name, chunk)}${work ? " (working)" : ""}.xlsx`,
      await xlsxBytes(rows),
      XLSX_TYPE,
    );
    if (!work) await downloaded([chunk]);
  };
  const zipOf = async (ns: number[], name: string) => {
    const files = await Promise.all(
      ns.map(async (n) => ({
        name: `${chunkFileName(topic.name, n)}.xlsx`,
        data: await xlsxBytes(chunkRows(topic, cards, n)),
      })),
    );
    saveBytes(name, zipFiles(files), "application/zip");
    await downloaded(ns);
  };
  const changedChunks = topic.chunks
    .filter((ch) => {
      const x = changes.get(ch.n);
      return x && !x.never && (x.changed.length || x.removed.length);
    })
    .map((ch) => ch.n);
  return (
    <div className="space-y-4">
      {unnumbered.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border p-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Shuffle className="h-4 w-4" />
            {topic.chunks.length
              ? `Number the ${waiting.length} new cards`
              : `Finalise: shuffle, split and number ${waiting.length} cards`}
          </h2>
          <p className="text-sm text-muted-foreground">
            The cards are shuffled, then split into chunks of these sizes and numbered from{" "}
            {after.order + 1}. After this a card&apos;s number and chunk never change.
            {topic.chunks.length > 0 && " Chunks already made stay as they are."}
          </p>
          {letters.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!range}
                  onChange={(e) =>
                    setRange(
                      e.target.checked
                        ? { from: letters[0].letter, to: letters[letters.length - 1].letter }
                        : null,
                    )
                  }
                />
                Only the cards starting with
              </label>
              {range && (
                <>
                  <select
                    aria-label="From letter"
                    value={range.from}
                    onChange={(e) => setRange({ ...range, from: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2"
                  >
                    {letters.map((l) => (
                      <option key={l.letter} value={l.letter}>
                        {l.letter} ({l.count})
                      </option>
                    ))}
                  </select>
                  to
                  <select
                    aria-label="To letter"
                    value={range.to}
                    onChange={(e) => setRange({ ...range, to: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2"
                  >
                    {letters.map((l) => (
                      <option key={l.letter} value={l.letter}>
                        {l.letter} ({l.count})
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">
                    {waiting.length} of {unnumbered.length} cards; the rest wait for their own
                    range.
                  </span>
                </>
              )}
            </div>
          )}
          {(unverified > 0 || flagged > 0) && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {unverified > 0 && `${unverified} not verified. `}
              {flagged > 0 && `${flagged} marked to recheck.`} You can still fix them after
              numbering.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1">
              <span className="block">About</span>
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                value={target}
                onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <span className="pb-2">cards a chunk →</span>
            <label className="min-w-0 flex-1 basis-56 space-y-1">
              <span className="block">Chunk sizes</span>
              <Input
                aria-label="Chunk sizes"
                className="h-9"
                value={sizes}
                onChange={(e) => setSizes(e.target.value)}
              />
            </label>
          </div>
          <p className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
            {valid
              ? preview.map((p) => `Chunk ${p.n}: ${p.from}–${p.to}`).join(" · ")
              : `The sizes add up to ${sum}; they need to add up to ${waiting.length}.`}
          </p>
          <Button
            disabled={!valid || busy || !waiting.length}
            onClick={async () => {
              if (
                !confirm(
                  `Shuffle and number ${waiting.length} cards into ${parsed.length} chunk(s)? This can't be changed later.`,
                )
              )
                return;
              setBusy(true);
              try {
                const seed = Math.floor(Math.random() * 2 ** 31);
                await numberFn({
                  data: {
                    topic_id: topic.id,
                    sizes: parsed,
                    seed,
                    ...(range ? { only: waiting.map((c) => c.id) } : {}),
                  },
                });
                toast.success("Numbered");
                setRange(null);
                await qc.invalidateQueries({ queryKey: ["flashTopics"] });
                onChanged();
              } catch (e) {
                toast.error(errorText(e, "Couldn't number the cards"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Lock className="mr-1 h-4 w-4" /> {busy ? "Numbering…" : "Shuffle and number"}
          </Button>
        </section>
      )}
      {topic.chunks.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Chunks</h2>
            {changedChunks.length > 0 && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() =>
                  void zipOf(changedChunks, `${chunkFileName(topic.name, null)} (changed).zip`)
                }
              >
                <Download className="mr-1 h-4 w-4" /> Changed chunks ({changedChunks.join(", ")})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className={changedChunks.length ? "" : "ml-auto"}
              onClick={() =>
                void zipOf(
                  topic.chunks.map((ch) => ch.n),
                  `${chunkFileName(topic.name, null)}.zip`,
                )
              }
            >
              <Download className="mr-1 h-4 w-4" /> All chunks (.zip)
            </Button>
            <Button size="sm" variant="outline" onClick={() => idRef.current?.click()}>
              <KeyRound className="mr-1 h-4 w-4" /> Add the app&apos;s ids
            </Button>
            <input
              ref={idRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const sheet = parseSheet(await readRows(file));
                  const r = await idsFn({
                    data: {
                      topic_id: topic.id,
                      rows: sheet.cards.map((c) => ({
                        order: c.order,
                        front: c.front,
                        app_id: c.app_id,
                      })),
                    },
                  });
                  setReport(r);
                  if (r.saved.length) toast.success(`${r.saved.length} ids kept`);
                  await qc.invalidateQueries({ queryKey: ["flashTopics"] });
                  onChanged();
                } catch (err) {
                  toast.error(errorText(err, "Couldn't read the app's export"));
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            After uploading chunks to the app, export them from the app and add that file here: each
            card keeps the app&apos;s id (matched by order, checked by front). A chunk downloaded
            later carries the ids, so it updates the same cards in the app.
          </p>
          {report && <IdReport report={report} onClose={() => setReport(null)} />}
          <ul className="divide-y divide-border rounded-xl border border-border">
            {topic.chunks.map((ch) => {
              const inChunk = live.filter((c) => c.chunk === ch.n);
              const withId = inChunk.filter((c) => c.app_id).length;
              const x = changes.get(ch.n);
              const edited = (x?.changed.length ?? 0) + (x?.removed.length ?? 0);
              return (
                <li
                  key={ch.n}
                  data-chunk={ch.n}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
                >
                  <span className="font-medium">Chunk {ch.n}</span>
                  <span className="text-muted-foreground">
                    {ch.from}–{ch.to} · {inChunk.length} cards
                  </span>
                  <Badge tone={withId === inChunk.length && inChunk.length ? "good" : "muted"}>
                    {withId}/{inChunk.length} app ids
                  </Badge>
                  {inChunk.some((c) => c.error) && <Badge tone="bad">has cards to recheck</Badge>}
                  {x?.never ? (
                    <Badge>not downloaded yet</Badge>
                  ) : edited ? (
                    <Badge
                      tone="warn"
                      title={[
                        ...(x?.changed ?? []).map(
                          (c) => `#${c.card_order} ${c.front.split("\n")[0]}`,
                        ),
                        ...(x?.removed ?? []).map((c) => `#${c.card_order} removed`),
                      ].join("\n")}
                    >
                      {edited} changed since download:{" "}
                      {[...(x?.changed ?? []), ...(x?.removed ?? [])]
                        .slice(0, 6)
                        .map((c) => `#${c.card_order}`)
                        .join(", ")}
                      {edited > 6 ? "…" : ""}
                    </Badge>
                  ) : (
                    <Badge tone="good">no changes since download</Badge>
                  )}
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void download(ch.n)}>
                      <Download className="mr-1 h-4 w-4" /> .xlsx
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void download(ch.n, true)}>
                      Working copy
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          {removed.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
              <div className="font-medium">Removed here: delete these in the app too</div>
              <ul className="mt-1 space-y-0.5" lang="hi">
                {removed.map((c) => (
                  <li key={c.id}>
                    #{c.card_order} (chunk {c.chunk}): {c.front.split("\n")[0]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {!topic.chunks.length && !waiting.length && (
        <p className="text-sm text-muted-foreground">Add cards first.</p>
      )}
    </div>
  );
}

function IdReport({ report, onClose }: { report: IdMatch; onClose: () => void }) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        <b>{report.saved.length} ids kept</b>
        {report.changed > 0 && <span>({report.changed} replaced an earlier id)</span>}
        <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {report.mismatched.length > 0 && (
        <div className="text-destructive">
          {report.mismatched.length} rows didn&apos;t match their card&apos;s front (not saved),
          e.g. #{report.mismatched[0].order}: “{report.mismatched[0].front.split("\n")[0]}” here is
          “{report.mismatched[0].card.split("\n")[0]}”. Is it this topic&apos;s export?
        </div>
      )}
      {report.unknown.length > 0 && (
        <div className="text-amber-700 dark:text-amber-400">
          Numbers this topic doesn&apos;t have: {report.unknown.slice(0, 12).join(", ")}
          {report.unknown.length > 12 ? "…" : ""}
        </div>
      )}
      {report.noId.length > 0 && (
        <div className="text-muted-foreground">{report.noId.length} rows had no id.</div>
      )}
    </div>
  );
}

// ---------- Settings ----------

function SettingsTab({ topic, onChanged }: { topic: FlashTopic; onChanged: () => void }) {
  const updateFn = useServerFn(updateFlashTopic);
  const qc = useQueryClient();
  const [t, setT] = useState({
    name: topic.name,
    prompt: topic.prompt,
    word_key: topic.word_key,
    columns: topic.columns,
    books: topic.books,
  });
  const [busy, setBusy] = useState(false);
  const setBook = (i: number, patch: Partial<FlashBook>) =>
    setT({ ...t, books: t.books.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  return (
    <div className="max-w-2xl space-y-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Topic name</span>
        <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        <span className="text-xs text-muted-foreground">
          Chunk files are named “{chunkFileName(t.name, 1)}.xlsx”.
        </span>
      </label>
      <PromptField value={t.prompt} onChange={(prompt) => setT({ ...t, prompt })} />
      <WordKeyField value={t.word_key} onChange={(word_key) => setT({ ...t, word_key })} />
      <ColumnsEditor columns={t.columns} onChange={(columns) => setT({ ...t, columns })} />
      <div className="space-y-2">
        <div className="text-sm font-medium">Books</div>
        <ul className="space-y-2">
          {t.books.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Book code"
                className="h-8 w-24"
                value={b.code}
                onChange={(e) => setBook(i, { code: e.target.value })}
              />
              <Input
                aria-label="Book name"
                className="h-8 min-w-0 flex-1 basis-48"
                value={b.name}
                placeholder="Full name"
                onChange={(e) => setBook(i, { name: e.target.value })}
              />
              <input
                type="color"
                aria-label="Book colour"
                value={b.color}
                onChange={(e) => setBook(i, { color: e.target.value })}
                className="h-8 w-10 rounded border border-input"
              />
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setT({
              ...t,
              books: [
                ...t.books,
                { code: "", name: "", color: BOOK_COLORS[t.books.length % BOOK_COLORS.length] },
              ],
            })
          }
        >
          <Plus className="mr-1 h-4 w-4" /> Add book
        </Button>
      </div>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await updateFn({ data: { id: topic.id, ...t } });
            toast.success("Saved");
            await qc.invalidateQueries({ queryKey: ["flashTopics"] });
            onChanged();
          } catch (e) {
            toast.error(errorText(e, "Couldn't save"));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save settings
      </Button>
    </div>
  );
}
