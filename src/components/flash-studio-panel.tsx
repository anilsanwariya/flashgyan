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
  BookOpen,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Eye,
  Smartphone,
  BookA,
  Download,
  FileUp,
  GitCompare,
  ListChecks,
  Keyboard,
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
  getFlashHouse,
  getFlashTopic,
  importFlashSheet,
  listFlashTemplates,
  listFlashTopics,
  numberFlashCards,
  otherFlashTopicWords,
  flashWordnetSenses,
  resetFlashChunks,
  saveFlashAppIds,
  markFlashDownloaded,
  nameFlashChunk,
  flashChunkChanges,
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
  cardSig,
  doneOf,
  fieldText,
  type AiFix,
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
import { ServerJobsBar, StudioJobBar } from "@/components/flash-studio-jobs";
import {
  AiReview,
  BulkBar,
  BookText,
  FindReplace,
  RecentlyDeleted,
  HistoryButton,
  QuickChecks,
} from "@/components/flash-studio-tools";
import {
  applyLints,
  lintCard,
  lintTopic,
  numberingOf,
  spellingVariants,
  type Lint,
} from "@/lib/flash-lint";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReplaceDialog, SheetsTab, WorkingDialog } from "@/components/flash-studio-sheets";
import { changeSheet, parseWorking, workingRows, type WorkingRow } from "@/lib/flash-sheets";
import { ProofTools, Versions } from "@/components/flash-studio-proof";
import {
  booksOf,
  dupKey,
  disagreement,
  emptyColumns,
  groupDuplicates,
  sortCards,
  versionFor,
  type SortKey,
} from "@/lib/flash-merge";
import { BOOK_FILE_TYPES, isBookFile } from "@/lib/flash-read";
import { StudentPreview } from "@/components/flash-studio-preview";
import { AppImportDialog, CompareWithApp } from "@/components/flash-studio-import";
import { SpellingList } from "@/components/flash-studio-spellings";
import {
  DictionaryPanel,
  WordnetDraftDialog,
  WordnetSettings,
} from "@/components/flash-studio-dict";
import { wnGap, wnKind, type WnGap } from "@/lib/flash-dict";
import { houseFromList } from "@/lib/flash-spell";
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

function useOpenTopic(): [string | null, (id: string | null, show?: string) => void] {
  const navigate = useNavigate();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    opening = q.get("show") ?? "";
    setId(q.get("topic"));
  }, []);
  // `show`: a filter of the cards list, or "chunks", to open the topic on.
  const choose = (next: string | null, show?: string) => {
    opening = show ?? "";
    setId(next);
    void navigate({
      to: ".",
      search: (s: Record<string, unknown>) => {
        const { topic: _t, show: _s, ...rest } = s;
        return next ? { ...rest, topic: next, ...(show ? { show } : {}) } : rest;
      },
      replace: true,
    } as never);
  };
  return [id, choose];
}

export function FlashStudio() {
  const [open, setOpen] = useOpenTopic();
  const [tab, setTab] = useState<"topics" | "types" | "spellings" | "dictionary">("topics");
  if (open)
    return (
      <div className="space-y-3">
        <StudioJobBar />
        <TopicView id={open} onBack={() => setOpen(null)} />
      </div>
    );
  return (
    <div className="space-y-4">
      <StudioJobBar />
      <PageTabs
        label="Card studio"
        tabs={[
          { id: "topics", label: "Topics" },
          { id: "types", label: "Deck types" },
          { id: "spellings", label: "Spellings" },
          { id: "dictionary", label: "Dictionary" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "topics" ? (
        <TopicList onOpen={setOpen} />
      ) : tab === "types" ? (
        <TemplateList />
      ) : tab === "spellings" ? (
        <SpellingList />
      ) : (
        <WordnetSettings />
      )}
    </div>
  );
}

// ---------- Topics ----------

// What the topic was opened on (a filter of its cards, or "chunks"): set
// when it opens, read once by its view.
let opening = "";
const openedOn = () => opening;

function TopicList({ onOpen }: { onOpen: (id: string, show?: string) => void }) {
  const listFn = useServerFn(listFlashTopics);
  const typesFn = useServerFn(listFlashTemplates);
  const createFn = useServerFn(createFlashTopic);
  const deleteFn = useServerFn(deleteFlashTopic);
  const qc = useQueryClient();
  const topics = useQuery({
    queryKey: ["flashTopics"],
    queryFn: () => listFn(),
    // What is waiting changes in the topics: read again on every visit.
    refetchOnMount: "always",
  });
  const types = useQuery({ queryKey: ["flashTemplates"], queryFn: () => typesFn() });
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [fromApp, setFromApp] = useState(false);
  const [order, setOrder] = useState<"todo" | "edited">("todo");
  const todo = (t: TopicSummary) => t.total - t.verified + t.errors + t.ai + t.lint + t.missing;
  const list = [...(topics.data ?? [])].sort((a, b) =>
    order === "todo" ? todo(b) - todo(a) : b.updated_at.localeCompare(a.updated_at),
  );
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
        <Button
          type="button"
          variant="outline"
          title="A topic uploaded to the app before: its master sheet and the app's chunks"
          onClick={() => setFromApp(true)}
        >
          <FileUp className="mr-1 h-4 w-4" /> Bring in from the app
        </Button>
      </form>
      {fromApp && (
        <AppImportDialog
          types={types.data ?? []}
          onClose={() => setFromApp(false)}
          onDone={async (id) => {
            setFromApp(false);
            await qc.invalidateQueries({ queryKey: ["flashTopics"] });
            onOpen(id);
          }}
        />
      )}
      {topics.error && <p className="text-sm text-destructive">{errorText(topics.error, "")}</p>}
      {topics.data && !topics.data.length && (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No topics yet</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Make a topic above, with its deck type.</li>
            <li>
              Add each book&apos;s Excel sheet, and merge the words that are in several books.
            </li>
            <li>Fill the explanations and proofread the cards one by one.</li>
            <li>
              Shuffle and number them into chunks (numbered 1, 2, 3… across the chunks, never to
              change), then download the chunks for the app.
            </li>
          </ol>
        </div>
      )}
      {list.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{list.length} topics</span>
          <select
            aria-label="Order of the topics"
            value={order}
            onChange={(e) => setOrder(e.target.value as "todo" | "edited")}
            className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="todo">Most to do first</option>
            <option value="edited">Last edited first</option>
          </select>
        </div>
      )}
      <ul className="space-y-2">
        {list.map((t: TopicSummary) => {
          // Each count opens the topic on its filter.
          const waiting: {
            n: number;
            label: string;
            show: string;
            tone: "bad" | "warn" | "muted";
          }[] = [
            { n: t.errors, label: "to recheck", show: "errors", tone: "bad" },
            { n: t.ai, label: "with AI suggestions", show: "ai", tone: "warn" },
            { n: t.lint, label: "with quick-check problems", show: "lint", tone: "warn" },
            { n: t.missing, label: "missing explanations", show: "missing", tone: "muted" },
            { n: t.total - t.verified, label: "not verified", show: "unverified", tone: "muted" },
          ];
          return (
            <li
              key={t.id}
              data-topic={t.name}
              className="space-y-2 rounded-xl border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(t.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                    <span
                      className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block"
                      title={`${t.verified} of ${t.total} verified`}
                    >
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${t.total ? (t.verified / t.total) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {t.total ? Math.round((t.verified / t.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {typeName(t.template_id) && <span>{typeName(t.template_id)} ·</span>}
                    <span>
                      {t.total} cards · {t.verified} verified
                    </span>
                    {t.chunks.length ? (
                      <Badge tone="primary">
                        <Lock className="h-3 w-3" /> {t.chunks.length} chunks · {t.withId}/
                        {t.numbered} with app ids
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
                    <span>· edited {new Date(t.updated_at).toLocaleDateString()}</span>
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
              </div>
              {(waiting.some((w) => w.n > 0) ||
                t.unchecked > 0 ||
                t.changedChunks.length > 0 ||
                t.jobs > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Waiting">
                  {waiting
                    .filter((w) => w.n > 0)
                    .map((w) => (
                      <button
                        key={w.show}
                        type="button"
                        onClick={() => onOpen(t.id, w.show)}
                        className={`rounded-full border px-2 py-0.5 hover:bg-muted ${w.tone === "bad" ? "border-red-300 text-destructive" : w.tone === "warn" ? "border-amber-300 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground"}`}
                      >
                        {w.n} {w.label}
                      </button>
                    ))}
                  {t.unchecked > 0 && (
                    <span className="px-1 text-muted-foreground">
                      {t.unchecked} not read by the AI yet
                    </span>
                  )}
                  {t.changedChunks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpen(t.id, "chunks")}
                      className="rounded-full border border-primary/40 px-2 py-0.5 text-primary hover:bg-muted"
                    >
                      Chunk{t.changedChunks.length === 1 ? "" : "s"} {t.changedChunks.join(", ")}{" "}
                      changed since download
                    </button>
                  )}
                  {t.jobs > 0 && (
                    <span className="flex items-center gap-1 px-1 text-primary">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> AI job
                      running on the server
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
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

type TopicTab = "cards" | "sheets" | "chunks" | "settings";

function TopicView({ id, onBack }: { id: string; onBack: () => void }) {
  const getFn = useServerFn(getFlashTopic);
  const q = useQuery({
    queryKey: ["flashTopic", id],
    queryFn: () => getFn({ data: { id } }),
    refetchOnMount: true,
  });
  const qc = useQueryClient();
  const [tab, setTab] = useState<TopicTab>(() => (openedOn() === "chunks" ? "chunks" : "cards"));
  // A sheet being added (or replacing one already added).
  const [importing, setImporting] = useState<{
    file: string;
    sheet: ParsedSheet;
    replace?: FlashSourceRow;
  } | null>(null);
  // A working sheet coming back (whole topic, with card ids).
  const [working, setWorking] = useState<{
    file: string;
    rows: WorkingRow[];
    unknown: string[];
  } | null>(null);
  const pickSheet = async (file: File, replace?: FlashSourceRow) => {
    try {
      const rows = await readRows(file);
      const back = q.data && parseWorking(rows, q.data.topic.columns);
      if (back) {
        if (!back.rows.length) throw new Error("No cards found in the working sheet");
        return setWorking({ file: file.name, rows: back.rows, unknown: back.unknown });
      }
      const sheet = parseSheet(rows);
      if (!sheet.cards.length) throw new Error("No cards found in the sheet");
      setImporting({ file: file.name, sheet, replace });
    } catch (err) {
      toast.error(errorText(err, "Couldn't read the sheet"));
    }
  };
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
        <span
          className={`basis-full text-sm text-muted-foreground sm:basis-auto ${tab === "cards" ? "hidden" : ""}`}
        >
          {live.length} cards · {live.filter((c) => c.verified).length} verified
          {topic.chunks.length
            ? ` · ${topic.chunks.length} chunk${topic.chunks.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
      <ServerJobsBar topicId={topic.id} onProgress={() => void reload()} />
      <PageTabs
        label="Topic"
        tabs={[
          { id: "cards", label: "Cards" },
          { id: "sheets", label: "Sheets" },
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
          onSheet={(f) => void pickSheet(f)}
          onTab={setTab}
        />
      )}
      {tab === "sheets" && (
        <SheetsTab
          topic={topic}
          cards={cards}
          sources={sources}
          onAdd={(f, replace) => void pickSheet(f, replace)}
          onDownloadWorking={async () =>
            saveBytes(
              `${topic.name} - working.xlsx`,
              await xlsxBytes(workingRows(cards, topic.columns)),
              XLSX_TYPE,
            )
          }
          onChanged={reload}
        />
      )}
      {tab === "chunks" && <ChunksTab topic={topic} cards={cards} onChanged={reload} />}
      {tab === "settings" && <SettingsTab topic={topic} onChanged={reload} />}
      {importing?.replace?.kind === "sheet" && (
        <ReplaceDialog
          topic={topic}
          cards={cards}
          file={importing.file}
          sheet={importing.sheet}
          replace={importing.replace}
          onClose={() => setImporting(null)}
          onDone={() => {
            setImporting(null);
            void reload();
          }}
        />
      )}
      {working && (
        <WorkingDialog
          topic={topic}
          cards={cards}
          file={working.file}
          rows={working.rows}
          unknownCols={working.unknown}
          onClose={() => setWorking(null)}
          onDone={() => {
            setWorking(null);
            void reload();
          }}
        />
      )}
      {importing && importing.replace?.kind !== "sheet" && (
        <ImportDialog
          topic={topic}
          hasNumbers={cards.some((c) => c.card_order !== null) || topic.chunks.length > 0}
          file={importing.file}
          sheet={importing.sheet}
          replace={importing.replace}
          onClose={() => setImporting(null)}
          onDone={() => {
            setImporting(null);
            void reload();
          }}
        />
      )}
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
  | "ai"
  | "lint"
  | "other"
  | "unnumbered"
  | "wnMissing"
  | "wnUnlisted"
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
  { id: "ai", label: "AI suggestions" },
  { id: "lint", label: "Quick checks" },
  { id: "other", label: "In other topics" },
  { id: "notes", label: "Notes" },
  { id: "unnumbered", label: "Not numbered" },
  { id: "wnMissing", label: "WordNet: more words" },
  { id: "wnUnlisted", label: "WordNet: not listed" },
  { id: "removed", label: "Removed" },
];

// Whether a card is in one of the list's filters.
function passes(
  c: FlashCard,
  f: Filter,
  columns: FlashColumn[],
  lints?: Map<string, Lint[]>,
  other?: Map<string, unknown>,
  wn?: Map<string, WnGap>,
): boolean {
  if (f === "wnMissing") return !c.removed && !!wn?.get(c.id)?.missing.length;
  if (f === "wnUnlisted") return !c.removed && !!wn?.get(c.id)?.unlisted.length;
  if (f === "lint") return !c.removed && !!lints?.get(c.id)?.length;
  if (f === "other") return !c.removed && !!other?.has(dupKey(c.front));
  if (f === "removed") return c.removed;
  if (c.removed) return false;
  if (f === "errors") return c.error;
  if (f === "unverified") return !c.verified;
  if (f === "verified") return c.verified;
  if (f === "unnumbered") return c.card_order === null;
  if (f === "several") return booksOf(c).length > 1;
  if (f === "single") return booksOf(c).length <= 1;
  if (f === "differ") {
    const d = disagreement(c);
    return d.answer || d.spelling;
  }
  if (f === "own") return c.own.length > 0;
  if (f === "missing") return emptyColumns(c, columns).length > 0;
  if (f === "notes") return !!c.note || c.sources.some((s) => s.note);
  if (f === "ai") return !!c.ai?.fixes.length;
  return true;
}

function CardsTab({
  topic,
  cards,
  sources,
  onChanged,
  onCard,
  onSheet,
  onTab,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  sources: FlashSourceRow[];
  onChanged: () => void;
  onCard: (c: FlashCard | FlashCard[]) => void;
  onSheet: (file: File) => void;
  onTab: (t: TopicTab) => void;
}) {
  const addFn = useServerFn(addFlashCard);
  const [filter, setFilter] = useState<Filter>(
    () => FILTERS.find((f) => f.id === openedOn())?.id ?? "all",
  );
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(60);
  const [editing, setEditing] = useState<FlashCard | null>(null);
  // Proofreading: the cards shown, one after another.
  const [proof, setProof] = useState<{ ids: string[]; i: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [pasting, setPasting] = useState(false);
  // One book's cards in its own words, or every book's merged.
  const [book, setBook] = useState("");
  const [sort, setSort] = useState<SortKey>("order");
  const [desc, setDesc] = useState(false);
  const [view, setView] = useState<"list" | "table">("list");
  const [merging, setMerging] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [trash, setTrash] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const books = new Map(topic.books.map((b) => [b.code, b]));
  const bookCodes = useMemo(
    () => [...new Set([...topic.books.map((b) => b.code), ...cards.flatMap((c) => booksOf(c))])],
    [cards, topic.books],
  );
  // Cards of the same word not merged into one yet.
  const othersOf = useMemo(() => {
    const m = new Map<string, FlashCard[]>();
    for (const g of groupDuplicates(cards))
      for (const c of g.cards)
        m.set(
          c.id,
          g.cards.filter((o) => o.id !== c.id),
        );
    return m;
  }, [cards]);
  // The quick checks over the whole topic (as saved).
  // The house spelling list (every topic's verified cards and the rules).
  const houseFn = useServerFn(getFlashHouse);
  const houseQ = useQuery({
    queryKey: ["flashHouse"],
    queryFn: () => houseFn(),
    staleTime: 60_000,
  });
  const house = useMemo(() => houseFromList(houseQ.data ?? []), [houseQ.data]);
  const lintCtx = useMemo(() => {
    const live = cards.filter((c) => !c.removed);
    return { numbering: numberingOf(live), variants: spellingVariants(live), house };
  }, [cards, house]);
  const lints = useMemo(
    () => lintTopic(cards, topic.columns, house),
    [cards, topic.columns, house],
  );
  // This topic's words that other topics have too.
  const otherFn = useServerFn(otherFlashTopicWords);
  const otherQ = useQuery({
    queryKey: ["flashOther", topic.id],
    queryFn: () => otherFn({ data: { topic_id: topic.id } }),
    staleTime: 60_000,
  });
  const inOther = useMemo(
    () => new Map((otherQ.data ?? []).map((o) => [o.key, o.topics])),
    [otherQ.data],
  );
  // A पर्यायवाची or विलोम deck against Hindi WordNet (when it is loaded).
  const typesFn = useServerFn(listFlashTemplates);
  const typesQ = useQuery({ queryKey: ["flashTemplates"], queryFn: () => typesFn() });
  const kind = wnKind(typesQ.data?.find((t) => t.id === topic.template_id)?.key, topic.prompt);
  const wnWords = useMemo(
    () =>
      kind ? [...new Set(cards.map((c) => c.front.trim()).filter((w) => w && w.length <= 80))] : [],
    [cards, kind],
  );
  const wnFn = useServerFn(flashWordnetSenses);
  const wnQ = useQuery({
    queryKey: ["flashWnSenses", topic.id, wnWords],
    queryFn: () => wnFn({ data: { words: wnWords.slice(0, 3000) } }),
    enabled: wnWords.length > 0,
    staleTime: 5 * 60_000,
  });
  const wnGaps = useMemo(() => {
    const m = new Map<string, WnGap>();
    if (!kind || !wnQ.data) return m;
    for (const c of cards) {
      const g = wnGap(c.back, wnQ.data[c.front.trim()] ?? [], kind);
      if (g) m.set(c.id, g);
    }
    return m;
  }, [cards, kind, wnQ.data]);
  // Cards ticked for an action on them all.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickOne = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  // The book picked (in its own words), before the filter and search.
  const inBook = useMemo(
    () =>
      cards
        .filter((c) => !book || booksOf(c).includes(book))
        .map((c) => {
          const v = book ? versionFor(c, book) : null;
          return v ? { ...c, front: v.front, back: v.back, ex: v.ex } : c;
        }),
    [cards, book],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.id,
          inBook.filter((c) => passes(c, f.id, topic.columns, lints, inOther, wnGaps)).length,
        ]),
      ) as Record<Filter, number>,
    [inBook, topic.columns, lints, inOther, wnGaps],
  );
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const picked = inBook
      .filter((c) => passes(c, filter, topic.columns, lints, inOther, wnGaps))
      .filter(
        (c) =>
          !q ||
          `${c.front}\n${c.back}\n${Object.values(c.ex).join("\n")}`.toLowerCase().includes(q) ||
          String(c.card_order) === q,
      );
    return sortCards(picked, sort, desc);
  }, [inBook, filter, query, topic.columns, sort, desc, lints, inOther, wnGaps]);
  const startProof = (from: FlashCard[]) => {
    if (!from.length) return;
    const first = from.findIndex((c) => !c.verified);
    setProof({ ids: from.map((c) => c.id), i: Math.max(0, first) });
  };
  const pick = (f: Filter) => {
    setFilter(f);
    setShown(60);
  };
  // A card opened from the list: the list, one card at a time, from it.
  const open = (shown: FlashCard) =>
    setProof({
      ids: list.map((c) => c.id),
      i: Math.max(
        0,
        list.findIndex((c) => c.id === shown.id),
      ),
    });
  const notVerified = list.filter((c) => !c.verified).length;
  const dropFromProof = (ids: string[]) => {
    // Merged or deleted cards leave the list; the one open stays, or the
    // next takes its place.
    setProof((p) => {
      if (!p) return p;
      const cur = p.ids[p.i];
      const left = p.ids.filter((id) => !ids.includes(id));
      if (!left.length) return null;
      const i = ids.includes(cur)
        ? p.ids.slice(0, p.i).filter((id) => !ids.includes(id)).length
        : left.indexOf(cur);
      return { ids: left, i: Math.min(i, left.length - 1) };
    });
    onChanged();
  };
  return (
    <div className="space-y-3">
      <TopicProgress
        topic={topic}
        cards={cards}
        sheets={sources.length}
        onFilter={pick}
        onMerge={() => setMerging(true)}
        onReview={() => setReviewing(true)}
        onProof={() =>
          startProof(
            sortCards(
              cards.filter((c) => !c.removed),
              "order",
            ),
          )
        }
        onAdd={() => onTab("sheets")}
        onTab={onTab}
      />
      {drafting && kind && (
        <WordnetDraftDialog
          topic={topic}
          kind={kind}
          fronts={cards.filter((c) => !c.removed).map((c) => c.front.trim())}
          onClose={() => setDrafting(false)}
          onAdded={onChanged}
        />
      )}
      <BooksPanel
        topic={topic}
        sources={sources.filter((s) => s.kind !== "sheet")}
        onChanged={onChanged}
        openFile={bookFile}
        onOpened={() => setBookFile(null)}
        pasting={pasting}
        setPasting={setPasting}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!notVerified}
          title="Open the first card shown that isn't verified; swipe or Alt+→ for the next"
          onClick={() => startProof(list)}
        >
          <BadgeCheck className="mr-1 h-4 w-4" /> Next not verified ({notVerified})
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-4 w-4" /> Add
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" /> A book&apos;s sheet or file…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  setEditing(await addFn({ data: { topic_id: topic.id } }));
                  onChanged();
                } catch (err) {
                  toast.error(errorText(err, "Couldn't add a card"));
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> An empty card
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPasting(true)}>
              <ClipboardPaste className="mr-2 h-4 w-4" /> Pasted text (AI reads it)
            </DropdownMenuItem>
            {kind && (
              <DropdownMenuItem onSelect={() => setDrafting(true)}>
                <BookOpen className="mr-2 h-4 w-4" /> Drafts from Hindi WordNet…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
            onSheet(file);
          }}
        />
        <ProofTools
          topic={topic}
          cards={cards}
          shownIds={list.map((c) => c.id)}
          merging={merging}
          setMerging={setMerging}
          onReview={() => setReviewing(true)}
          onFind={() => setFinding(true)}
          onTrash={() => setTrash(true)}
          onChanged={onChanged}
          onCards={onCard}
        />
        <div className="relative ml-auto min-w-0 flex-1 basis-48 sm:max-w-xs">
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label="Book"
          value={book}
          onChange={(e) => {
            setBook(e.target.value);
            setShown(60);
          }}
          className="h-8 rounded-md border border-input bg-background px-2"
        >
          <option value="">All books (merged)</option>
          {bookCodes.map((b) => (
            <option key={b} value={b}>
              {b}
              {books.get(b)?.name ? ` · ${books.get(b)!.name}` : ""} only
            </option>
          ))}
        </select>
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 rounded-md border border-input bg-background px-2"
        >
          <option value="order">Order (numbers, then as added)</option>
          <option value="front">front A–Z</option>
          <option value="back">back A–Z</option>
          <option value="book">Book</option>
          {topic.columns.map((col) => (
            <option key={col.id} value={`ex:${col.id}`}>
              explanation_{col.title} A–Z
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          aria-label={desc ? "Descending" : "Ascending"}
          title={desc ? "Descending (Z–A)" : "Ascending (A–Z)"}
          onClick={() => setDesc(!desc)}
        >
          {desc ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </Button>
        <div
          className="ml-auto flex overflow-hidden rounded-md border border-input"
          role="group"
          aria-label="View"
        >
          {(["list", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs ${view === v ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {v === "list" ? "List" : "Table"}
            </button>
          ))}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{list.length} cards</span>
      </div>
      <div
        role="group"
        aria-label="Show"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible"
      >
        {FILTERS.filter((f) => f.id === "all" || f.id === filter || counts[f.id] > 0).map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => pick(f.id)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs ${filter === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {(query || filter !== "all") && (
        <div className="text-xs text-muted-foreground">
          {list.length} of {counts.all} cards shown{" "}
          <button
            type="button"
            className="ml-1 underline"
            onClick={() => {
              pick("all");
              setQuery("");
            }}
          >
            Show all
          </button>
        </div>
      )}
      {!cards.length && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Add each book&apos;s Excel sheet with the columns <code>order</code>, <code>prompt</code>,{" "}
          <code>front</code>, <code>back</code> and any <code>explanation_…</code> columns (a{" "}
          <code>Book</code> column is optional; otherwise you name the book when adding it). A
          finished sheet with sheet and order columns keeps its chunks and numbers. Word files, PDFs
          and pasted text can also be read by the AI.
        </p>
      )}
      {list.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={list.every((c) => picked.has(c.id))}
            onChange={(e) =>
              setPicked((p) => {
                const n = new Set(p);
                for (const c of list) {
                  if (e.target.checked) n.add(c.id);
                  else n.delete(c.id);
                }
                return n;
              })
            }
          />
          Tick all {list.length} shown
        </label>
      )}
      {view === "table" && list.length > 0 && (
        <CardTable
          topic={topic}
          cards={list.slice(0, shown)}
          onOpen={open}
          picked={picked}
          onPick={pickOne}
          // One book's view shows its version: edit those in the card.
          onEdit={book ? undefined : onCard}
        />
      )}
      <ul className={`space-y-2 ${view === "table" ? "hidden" : ""}`}>
        {(view === "list" ? list.slice(0, shown) : []).map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              aria-label={`Tick ${c.front.split("\n")[0]}`}
              className="mt-4 h-4 w-4 shrink-0"
              checked={picked.has(c.id)}
              onChange={(e) => pickOne(c.id, e.target.checked)}
            />
            <button
              type="button"
              onClick={() => open(c)}
              className={`min-w-0 flex-1 rounded-xl border border-l-4 p-3 text-left hover:bg-muted/40 ${picked.has(c.id) ? "ring-2 ring-primary/40 " : ""}${c.error ? "border-red-300 border-l-red-500" : c.verified ? "border-border border-l-emerald-500" : "border-border"}`}
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
                {!c.removed && !!wnGaps.get(c.id)?.missing.length && (
                  <Badge
                    tone="primary"
                    title={`WordNet also has: ${wnGaps.get(c.id)!.missing.join(", ")}`}
                  >
                    WordNet +{wnGaps.get(c.id)!.missing.length}
                  </Badge>
                )}
                {!c.removed && !!wnGaps.get(c.id)?.unlisted.length && (
                  <Badge
                    tone="warn"
                    title={`Not in WordNet for this word: ${wnGaps.get(c.id)!.unlisted.join(", ")}`}
                  >
                    not in WordNet: {wnGaps.get(c.id)!.unlisted.length}
                  </Badge>
                )}
                {inOther.get(dupKey(c.front)) && (
                  <Badge
                    tone="primary"
                    title={inOther
                      .get(dupKey(c.front))!
                      .map((o) => `${o.name}: ${o.front}`)
                      .join("\n")}
                  >
                    also in {inOther.get(dupKey(c.front))![0].name}
                    {inOther.get(dupKey(c.front))!.length > 1
                      ? ` +${inOther.get(dupKey(c.front))!.length - 1}`
                      : ""}
                  </Badge>
                )}
                {!!lints.get(c.id)?.length && (
                  <Badge
                    title={lints
                      .get(c.id)!
                      .map((l) => l.note)
                      .join("\n")}
                  >
                    ⚑ {lints.get(c.id)!.length} quick check
                    {lints.get(c.id)!.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" lang="hi">
                <div className="whitespace-pre-wrap font-medium">{c.front || "—"}</div>
                <div className="whitespace-pre-wrap text-sm">{c.back || "—"}</div>
              </div>
              {topic.columns.some((col) => c.ex[col.id]) && (
                <dl
                  className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5 text-xs"
                  lang="hi"
                >
                  {topic.columns.map((col) =>
                    c.ex[col.id] ? (
                      <div key={col.id} className="flex gap-1.5">
                        <dt className="shrink-0 text-muted-foreground">{col.title}:</dt>
                        <dd className="min-w-0 whitespace-pre-wrap">
                          {c.own.includes(col.id) ? "◇ " : ""}
                          {c.ex[col.id]}
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              )}
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
      {trash && (
        <RecentlyDeleted topic={topic} onChanged={onChanged} onClose={() => setTrash(false)} />
      )}
      {finding && (
        <FindReplace
          topic={topic}
          cards={cards}
          onCards={onCard}
          onClose={() => setFinding(false)}
        />
      )}
      {reviewing && (
        <AiReview
          topic={topic}
          cards={cards}
          onCards={onCard}
          onOpen={(c) => {
            const withFixes = cards.filter((x) => !x.removed && x.ai?.fixes.length);
            setReviewing(false);
            setProof({
              ids: withFixes.map((x) => x.id),
              i: Math.max(
                0,
                withFixes.findIndex((x) => x.id === c.id),
              ),
            });
          }}
          onClose={() => setReviewing(false)}
        />
      )}
      {picked.size > 0 && (
        <BulkBar
          topic={topic}
          cards={cards.filter((c) => picked.has(c.id))}
          lints={lints}
          onCards={onCard}
          onChanged={onChanged}
          onClear={() => setPicked(new Set())}
        />
      )}
      {editing && !proof && (
        <CardDialog
          topic={topic}
          card={cards.find((c) => c.id === editing.id) ?? editing}
          others={othersOf.get(editing.id)}
          lintCtx={lintCtx}
          onOthersGone={() => onChanged()}
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
          others={othersOf.get(proof.ids[proof.i])}
          lintCtx={lintCtx}
          onOthersGone={(ids) => dropFromProof(ids)}
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
          onGone={() => dropFromProof([proof.ids[proof.i]])}
        />
      )}
    </div>
  );
}

// Where the topic stands and the next step: sheets added, the same word to
// merge, explanations to fill, cards proofread, chunks. Each figure opens
// what it counts.
function TopicProgress({
  topic,
  cards,
  sheets,
  onFilter,
  onMerge,
  onReview,
  onProof,
  onAdd,
  onTab,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  sheets: number;
  onFilter: (f: Filter) => void;
  onMerge: () => void;
  onReview: () => void;
  onProof: () => void;
  onAdd: () => void;
  onTab: (t: TopicTab) => void;
}) {
  const live = cards.filter((c) => !c.removed);
  const verified = live.filter((c) => c.verified).length;
  const errors = live.filter((c) => c.error).length;
  const missing = topic.columns.length
    ? live.filter((c) => emptyColumns(c, topic.columns).length).length
    : 0;
  const dups = useMemo(() => groupDuplicates(cards).length, [cards]);
  const fixes = live.reduce((n, c) => n + (c.ai?.fixes.length ?? 0), 0);
  const pct = live.length ? Math.round((verified / live.length) * 100) : 0;
  const next: { text: string; action: string; go: () => void } | null = !live.length
    ? { text: "Add each book's Excel sheet.", action: "Add a sheet", go: onAdd }
    : dups
      ? {
          text: `${dups} words are in several books as separate cards.`,
          action: "Merge them",
          go: onMerge,
        }
      : missing
        ? {
            text: `${missing} cards have empty explanations.`,
            action: "Show them",
            go: () => onFilter("missing"),
          }
        : verified < live.length
          ? {
              text: `${live.length - verified} cards to proofread.`,
              action: verified ? "Continue proofreading" : "Start proofreading",
              go: onProof,
            }
          : !topic.chunks.length
            ? {
                text: "Every card is verified.",
                action: "Shuffle and number",
                go: () => onTab("chunks"),
              }
            : null;
  const stat = (label: string, n: number, go: () => void, tone = "") => (
    <button
      type="button"
      onClick={go}
      className={`rounded-lg px-2 py-1 text-left text-xs hover:bg-muted ${tone}`}
    >
      <span className="block text-base font-semibold tabular-nums">{n}</span>
      {label}
    </button>
  );
  return (
    <section
      aria-label="Progress"
      className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          {verified} of {live.length} verified
        </span>
        <div
          className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Verified"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="-mx-1 flex flex-wrap gap-1">
        {stat("sheets", sheets, () => onTab("sheets"))}
        {dups > 0 && stat("words to merge", dups, onMerge, "text-amber-700 dark:text-amber-400")}
        {fixes > 0 && stat("AI suggestions", fixes, onReview, "text-amber-700 dark:text-amber-400")}
        {topic.columns.length > 0 && stat("empty explanations", missing, () => onFilter("missing"))}
        {errors > 0 && stat("to recheck", errors, () => onFilter("errors"), "text-destructive")}
        {stat("not verified", live.length - verified, () => onFilter("unverified"))}
        {stat(topic.chunks.length ? "chunks" : "chunks (not finalised)", topic.chunks.length, () =>
          onTab("chunks"),
        )}
      </div>
      {next && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">Next:</span>
          <span className="min-w-0 flex-1">{next.text}</span>
          <Button size="sm" onClick={next.go}>
            {next.action} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
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
      {!!c.ai?.fixes.length && (
        <Badge tone="warn" title="The AI check suggests changes: open the card to apply or dismiss">
          ✦ {c.ai.fixes.length} AI suggestion{c.ai.fixes.length === 1 ? "" : "s"}
        </Badge>
      )}
      {missing > 0 && topic.columns.length > 0 && (
        <Badge>
          {missing} explanation{missing === 1 ? "" : "s"} empty
        </Badge>
      )}
    </>
  );
}

function ImportDialog({
  topic,
  hasNumbers,
  file,
  sheet,
  replace,
  onClose,
  onDone,
}: {
  topic: FlashTopic;
  hasNumbers: boolean;
  file: string;
  sheet: ParsedSheet;
  // The sheet this one replaces: its cards go first.
  replace?: FlashSourceRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const importFn = useServerFn(importFlashSheet);
  const qc = useQueryClient();
  const needsBook = sheet.cards.some((c) => !c.book);
  const [book, setBook] = useState(replace?.kind === "sheet" ? replace.book : "");
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
          <DialogTitle>
            {replace ? `Replace “${replace.name || replace.book}” with “${file}”` : `Add “${file}”`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            <b>{sheet.cards.length}</b> cards
            {books.length ? ` from ${books.join(", ")}` : ""}
            {sheet.columns.length ? ` · explanations: ${sheet.columns.join(", ")}` : ""}.
          </p>
          {replace && (
            <p className="rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              The old sheet&apos;s cards are deleted first, with its versions merged into other
              books&apos; cards. Its numbered cards stay (their numbers are in the app). Merges and
              edits made to its cards here are lost.
            </p>
          )}
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
                    name: file,
                    replace: replace?.id,
                    keep_numbers: keep && !hasNumbers,
                  },
                });
                toast.success(
                  `${r.added} cards ${replace ? "now in place of the old sheet's" : "added"}${r.numbered ? " with their chunks and numbers" : ""}`,
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
            {busy
              ? "Adding…"
              : replace
                ? `Replace with ${sheet.cards.length} cards`
                : `Add ${sheet.cards.length} cards`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A table cell: double-click to edit it in place; Ctrl+Enter or leaving it
// saves, Escape puts it back.
function EditCell({
  label,
  value,
  className,
  prefix,
  onSave,
}: {
  label: string;
  value: string;
  className: string;
  prefix: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Closed by a key: the blur that follows isn't a save.
  const done = useRef(false);
  if (draft === null)
    return (
      <td
        className={`cursor-text whitespace-pre-wrap p-2 ${className}`}
        title="Double-click to edit"
        data-cell={label}
        onDoubleClick={() => {
          done.current = false;
          setDraft(value);
        }}
      >
        {value ? prefix : ""}
        {value}
      </td>
    );
  return (
    <td className={`p-1 ${className}`} data-cell={label}>
      <GrowingText
        autoFocus
        aria-label={label}
        lang="hi"
        value={draft}
        onFocus={(e) => e.currentTarget.setSelectionRange(draft.length, draft.length)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done.current = true;
            setDraft(null);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            done.current = true;
            onSave(draft);
            setDraft(null);
          }
        }}
        onBlur={() => {
          if (done.current) return;
          done.current = true;
          onSave(draft);
          setDraft(null);
        }}
        className="min-w-40 text-sm"
      />
    </td>
  );
}

// Every column of the cards, one row each: the number or book opens the
// card; a text cell is edited in place with a double-click.
function CardTable({
  topic,
  cards,
  onOpen,
  picked,
  onPick,
  onEdit,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  onOpen: (c: FlashCard) => void;
  picked: Set<string>;
  onPick: (id: string, on: boolean) => void;
  // A cell edited in place and saved (no editing without it).
  onEdit?: (c: FlashCard) => void;
}) {
  const saveFn = useServerFn(saveFlashCard);
  const save = async (c: FlashCard, field: string, v: string) => {
    if (fieldText(c, field) === v) return;
    const patch =
      field === "front" || field === "back"
        ? { [field]: v }
        : {
            ex: { ...c.ex, [field.slice(3)]: v },
            own: c.own.filter((o) => `ex:${o}` !== field),
          };
    try {
      onEdit?.(await saveFn({ data: { id: c.id, patch: patch as never } }));
      toast.success("Saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const cell = (c: FlashCard, field: string, className: string) =>
    onEdit ? (
      <EditCell
        key={field}
        label={`${field === "front" || field === "back" ? field : `explanation_${topic.columns.find((col) => `ex:${col.id}` === field)?.title}`} of ${c.front.split("\n")[0]}`}
        value={fieldText(c, field)}
        className={className}
        prefix={field.startsWith("ex:") && c.own.includes(field.slice(3)) ? "◇ " : ""}
        onSave={(v) => void save(c, field, v)}
      />
    ) : (
      <td key={field} className={`whitespace-pre-wrap p-2 ${className}`} onClick={() => onOpen(c)}>
        {field.startsWith("ex:") && c.own.includes(field.slice(3)) && fieldText(c, field)
          ? "◇ "
          : ""}
        {fieldText(c, field)}
      </td>
    );
  return (
    <div className="max-h-[75dvh] overflow-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm" lang="hi">
        <thead className="sticky top-0 z-10 bg-muted text-left text-xs">
          <tr>
            <th className="w-8 p-2" />
            <th className="p-2 font-medium">#</th>
            <th className="p-2 font-medium">Book</th>
            <th className="p-2 font-medium">front</th>
            <th className="p-2 font-medium">back</th>
            {topic.columns.map((col) => (
              <th key={col.id} className="p-2 font-medium">
                explanation_{col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr
              key={c.id}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen(c)}
              className={`border-t border-border align-top hover:bg-muted/40 ${picked.has(c.id) ? "bg-primary/5" : c.error ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}
            >
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`Tick ${c.front.split("\n")[0]}`}
                  className="h-4 w-4"
                  checked={picked.has(c.id)}
                  onChange={(e) => onPick(c.id, e.target.checked)}
                />
              </td>
              <td
                className="cursor-pointer whitespace-nowrap p-2 text-xs text-muted-foreground"
                onClick={() => onOpen(c)}
              >
                <button
                  type="button"
                  aria-label={`Open ${c.front.split("\n")[0]}`}
                  className="mr-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                {c.card_order ?? ""}
                {c.verified && <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />}
              </td>
              <td
                className="cursor-pointer whitespace-nowrap p-2 text-xs"
                onClick={() => onOpen(c)}
              >
                {booksOf(c).join(", ")}
              </td>
              {cell(c, "front", "font-medium")}
              {cell(c, "back", "")}
              {topic.columns.map((col) => cell(c, `ex:${col.id}`, "text-xs"))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Nav = { index: number; total: number; prev: () => void; next: () => void };

function CardDialog({
  topic,
  card,
  others,
  lintCtx,
  nav,
  onClose,
  onSaved,
  onGone,
  onOthersGone,
}: {
  topic: FlashTopic;
  card: FlashCard;
  // What the quick checks need from the whole topic.
  lintCtx: Parameters<typeof lintCard>[2];
  // Other books' cards of the same word, not merged into this one yet.
  others?: FlashCard[];
  // Proofreading: this card's place in the list, and moving along it.
  nav?: Nav;
  // Some of `others` merged into this card or deleted.
  onOthersGone: (ids: string[]) => void;
  onClose: () => void;
  onSaved: (c: FlashCard) => void;
  onGone: () => void;
}) {
  const saveFn = useServerFn(saveFlashCard);
  const deleteFn = useServerFn(deleteFlashCard);
  const fillFn = useServerFn(fillFlashExplanations);
  const [c, setC] = useState(card);
  const [busy, setBusy] = useState(false);
  const [student, setStudent] = useState(false);
  const [dict, setDict] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  // The card changed outside (saved, or the AI check ran in the
  // background): edits not saved yet stay, the check's findings come in.
  const shown = useRef(card);
  useEffect(() => {
    setC((prev) => {
      const edited = prev.id === card.id && JSON.stringify(prev) !== JSON.stringify(shown.current);
      shown.current = card;
      return edited
        ? { ...prev, ai: card.ai, error: card.error, error_type: card.error_type, note: card.note }
        : card;
    });
  }, [card]);
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
  // Ctrl+S save; Alt+A the AI's fixes, Alt+Q the quick fixes, Alt+R to
  // recheck, Alt+D the dictionary, Alt+P the student view. Letters by
  // their key (on a Mac, Alt turns them into other characters).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (busy) return;
    const mod = e.ctrlKey || e.metaKey;
    const alt = e.altKey && !mod && !e.shiftKey;
    const letter = alt && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : "";
    if (letter === "A") {
      const b = document.querySelector<HTMLButtonElement>('[data-key="apply-ai"]');
      e.preventDefault();
      if (b) b.click();
      else toast("No AI fixes to apply on this card");
    } else if (letter === "Q") {
      e.preventDefault();
      const fixable = lintCard(c, topic.columns, lintCtx).filter((l) => l.fix !== undefined);
      if (fixable.length) setC({ ...c, ...applyLints(c, fixable) });
      else toast("No quick fixes on this card");
    } else if (letter === "R") {
      e.preventDefault();
      setC({ ...c, error: !c.error });
    } else if (letter === "D") {
      e.preventDefault();
      setDict((d) => !d);
    } else if (letter === "P") {
      e.preventDefault();
      setStudent((v) => !v);
    } else if (mod && e.key === "Enter") {
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
  // Swipe left / right for the next and previous card (not while in a box
  // being typed in, where a drag selects text).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      const el = e.target as HTMLElement;
      touch.current = el.closest("textarea, input, select")
        ? null
        : { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const t = touch.current;
      touch.current = null;
      if (!t || !nav || busy) return;
      const dx = e.changedTouches[0].clientX - t.x;
      const dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) / 2) return;
      if (dx < 0) void go(nav.next);
      else if (nav.index > 0) void go(nav.prev);
    },
  };
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
    // Sent only when changed (applied or dismissed).
    ...(JSON.stringify(c.ai) !== JSON.stringify(card.ai) ? { ai: c.ai } : {}),
  };
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    big = false,
    placeholder?: string,
  ) => (
    <EditField
      key={`${card.id}-${label}`}
      label={label}
      value={value}
      onChange={set}
      big={big}
      placeholder={placeholder}
    />
  );
  const remove = async () => {
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
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Opened to read: no box takes the cursor (and a phone's keyboard).
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-2xl max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0"
        {...swipe}
      >
        <DialogHeader className="space-y-2 border-b border-border px-5 pb-3 pr-12 pt-4 text-left">
          <DialogTitle className="text-base">
            {nav ? `Card ${nav.index + 1} of ${nav.total}` : "Card"}
            {c.card_order !== null && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                #{c.card_order} · chunk {c.chunk}
              </span>
            )}
          </DialogTitle>
          {nav && (
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((nav.index + 1) / nav.total) * 100}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {card.verified ? (
              <Badge tone="good">
                <BadgeCheck className="h-3 w-3" /> Verified
              </Badge>
            ) : (
              <Badge>Not verified</Badge>
            )}
            {card.error && (
              <Badge tone="bad">
                <AlertTriangle className="h-3 w-3" /> {card.error_type || "Recheck"}
              </Badge>
            )}
            <span>
              {c.sources.length
                ? `From ${c.sources.map((s) => `${s.book}${s.pos != null ? ` (${s.pos})` : ""}`).join(", ")}`
                : "Added by hand"}
              {c.app_id ? ` · app id ${c.app_id}` : ""}
            </span>
          </div>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {c.ai && c.ai.fixes.length > 0 && (
            <AiSuggestions topic={topic} card={c} onChange={setC} />
          )}
          <QuickChecks topic={topic} card={c} ctx={lintCtx} onChange={setC} />
          {field("front", c.front, (front) => setC({ ...c, front }), true)}
          {field("back", c.back, (back) => setC({ ...c, back }))}
          <Versions
            topic={topic}
            card={card}
            draft={c}
            others={others}
            onMerged={onOthersGone}
            onDeleted={(id) => onOthersGone([id])}
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
              {field(`explanation_${col.title}`, c.ex[col.id] ?? "", (v) =>
                setC({
                  ...c,
                  ex: { ...c.ex, [col.id]: v },
                  // Edited by hand: the editor's now.
                  own: c.own.filter((o) => o !== col.id),
                }),
              )}
              {c.own.includes(col.id) && (
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  ◇ Not from your books: written by the AI from its own knowledge. Check it in a
                  book; editing it makes it yours.
                </p>
              )}
              {c.own.includes(col.id) && <BookText topicId={topic.id} card={card} />}
              {col.hint && <p className="mt-0.5 text-xs text-muted-foreground">{col.hint}</p>}
            </div>
          ))}
          <details className="rounded-lg border border-border p-2 text-sm">
            <summary className="cursor-pointer font-medium">
              More: prompt, backHint, isRevealed, wordKey
            </summary>
            <div className="mt-2 space-y-2">
              {field(
                "prompt",
                c.prompt ?? "",
                (v) => setC({ ...c, prompt: v || null }),
                false,
                `The topic's: ${topic.prompt}`,
              )}
              {field("backHint", c.back_hint, (back_hint) => setC({ ...c, back_hint }))}
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
          <HistoryButton card={c} onRestore={(v) => setC({ ...c, ...v })} />
          <Button
            variant="ghost"
            size="sm"
            title="The card as students see it in the app (with your edits)"
            onClick={() => setStudent(true)}
          >
            <Smartphone className="mr-1 h-4 w-4" /> Student view
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={dict}
            title="The front's words in Wiktionary: meanings, synonyms, antonyms, other spellings"
            onClick={() => setDict(!dict)}
          >
            <BookA className="mr-1 h-4 w-4" /> Dictionary
          </Button>
          {dict && (
            <DictionaryPanel
              front={c.front}
              back={c.back}
              onAdd={(w) => setC({ ...c, back: c.back.trim() ? `${c.back.trimEnd()}, ${w}` : w })}
              onClose={() => setDict(false)}
            />
          )}
          {student && (
            <StudentPreview
              topic={topic}
              cards={[c]}
              title="Student view"
              onClose={() => setStudent(false)}
            />
          )}
          {!c.removed && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {c.card_order !== null ? "Remove this card" : "Delete this card"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-background px-3 py-2.5 sm:px-5">
          {nav && (
            <Button
              size="icon"
              variant="outline"
              aria-label="Previous"
              title="Previous (Alt+←)"
              disabled={busy || nav.index === 0}
              onClick={() => void go(nav.prev)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            title="Save (Ctrl+S)"
            disabled={busy}
            onClick={() => void save(textPatch)}
          >
            Save
          </Button>
          <Button
            disabled={busy}
            variant={c.verified ? "outline" : "default"}
            title={c.verified ? undefined : "Ctrl+Enter"}
            className={`min-w-0 ${c.verified ? "" : "flex-1 bg-emerald-600 hover:bg-emerald-700 sm:flex-none"}`}
            onClick={() =>
              c.verified ? void save({ ...textPatch, verified: false }) : void saveAndVerify()
            }
          >
            <BadgeCheck className="mr-1 h-4 w-4 shrink-0" />
            {c.verified ? (
              "Not verified"
            ) : nav ? (
              <>
                <span className="sm:hidden">Verify, next</span>
                <span className="hidden sm:inline">Save, verify and next</span>
              </>
            ) : (
              "Save and verify"
            )}
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground md:inline">
            {changed ? (
              <span className="text-amber-700 dark:text-amber-400">● Unsaved</span>
            ) : nav ? (
              "Swipe or Alt+← →"
            ) : (
              ""
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="hidden h-7 px-2 text-xs md:inline-flex"
            aria-pressed={showKeys}
            onClick={() => setShowKeys(!showKeys)}
          >
            <Keyboard className="mr-1 h-3.5 w-3.5" /> Keys
          </Button>
          {changed && <span className="ml-auto h-2 w-2 rounded-full bg-amber-500 md:hidden" />}
          {nav && (
            <Button
              size="icon"
              variant="outline"
              aria-label="Next"
              title="Next (Alt+→)"
              className={changed ? "" : "ml-auto md:ml-0"}
              disabled={busy}
              onClick={() => void go(nav.next)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        {showKeys && (
          <div
            aria-label="Keys"
            className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground"
          >
            {[
              ["Ctrl+Enter", "save, verify and next"],
              ["Ctrl+S", "save"],
              ["Alt+← →", "previous / next"],
              ["Alt+A", "apply the AI's fixes"],
              ["Alt+Q", "quick fixes"],
              ["Alt+R", "to recheck"],
              ["Alt+D", "dictionary"],
              ["Alt+P", "student view"],
            ].map(([k, what]) => (
              <span key={k}>
                <kbd className="rounded border border-border bg-background px-1 font-mono text-[11px]">
                  {k}
                </kbd>{" "}
                {what}
              </span>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// The AI check's suggested fixes for a card: each field's text now and as
// the AI would have it, to apply (fills the field; Save to keep it) or
// dismiss. When none are left, the AI's note and recheck mark go too.
function AiSuggestions({
  topic,
  card: c,
  onChange,
}: {
  topic: FlashTopic;
  card: FlashCard;
  onChange: (c: FlashCard) => void;
}) {
  const fixes = c.ai?.fixes ?? [];
  const label = (field: string) =>
    field === "front" || field === "back"
      ? field
      : field.startsWith("ex:")
        ? `explanation_${topic.columns.find((col) => col.id === field.slice(3))?.title ?? "?"}`
        : "the card";
  // `took`: the fixes taken (applied, or a pointer marked done); `not`:
  // those dismissed. Both kept in the card's record.
  const settle = (next: FlashCard, left: AiFix[], took: AiFix[], not: AiFix[]): FlashCard => {
    const done = !left.length && next.note.startsWith("AI:");
    return {
      ...next,
      // The card as it now reads counts as checked.
      ai: next.ai
        ? {
            ...next.ai,
            fixes: left,
            sig: cardSig(next),
            done: [...next.ai.done, ...doneOf(took, true), ...doneOf(not, false)].slice(-100),
          }
        : null,
      ...(done ? { note: "", error: false, error_type: "" } : {}),
    };
  };
  const put = (card: FlashCard, f: AiFix): FlashCard =>
    f.field === "front"
      ? { ...card, front: f.to }
      : f.field === "back"
        ? { ...card, back: f.to }
        : {
            ...card,
            ex: { ...card.ex, [f.field.slice(3)]: f.to },
            own: card.own.filter((o) => `ex:${o}` !== f.field),
          };
  const canApply = (f: AiFix) => !!f.to && !!f.field;
  const apply = (i: number) =>
    onChange(
      settle(
        put(c, fixes[i]),
        fixes.filter((_, k) => k !== i),
        [fixes[i]],
        [],
      ),
    );
  // A pointer (no text to apply) marked done counts as taken.
  const dismiss = (i: number) =>
    onChange(
      settle(
        c,
        fixes.filter((_, k) => k !== i),
        canApply(fixes[i]) ? [] : [fixes[i]],
        canApply(fixes[i]) ? [fixes[i]] : [],
      ),
    );
  return (
    <section
      aria-label="AI suggestions"
      className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/20"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">✦ AI suggests</span>
        <span className="text-xs text-muted-foreground">
          Apply fills the field; Save or verify to keep it.
        </span>
        <span className="ml-auto flex gap-1">
          {fixes.some(canApply) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              data-key="apply-ai"
              title="Apply all (Alt+A)"
              onClick={() => {
                let next = c;
                for (const f of fixes) if (canApply(f)) next = put(next, f);
                onChange(
                  settle(
                    next,
                    fixes.filter((f) => !canApply(f)),
                    fixes.filter(canApply),
                    [],
                  ),
                );
              }}
            >
              Apply all
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => onChange(settle(c, [], [], fixes))}
          >
            Dismiss all
          </Button>
        </span>
      </div>
      <ul className="space-y-2">
        {fixes.map((f, i) => {
          const stale = !!f.field && fieldText(c, f.field).trim() !== f.from.trim();
          return (
            <li key={i} data-fix={f.field} className="space-y-1 rounded-md bg-background/80 p-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone="warn">{f.type}</Badge>
                <span className="font-medium">{label(f.field)}</span>
                <span className="text-muted-foreground" lang="hi">
                  {f.note}
                </span>
              </div>
              {canApply(f) && (
                <div className="grid gap-1 text-sm sm:grid-cols-2" lang="hi">
                  <div className="whitespace-pre-wrap rounded bg-red-500/10 px-2 py-1 text-red-800 line-through decoration-red-400/60 dark:text-red-300">
                    {f.from || "—"}
                  </div>
                  <div className="whitespace-pre-wrap rounded bg-emerald-500/10 px-2 py-1 text-emerald-800 dark:text-emerald-300">
                    {f.to}
                  </div>
                </div>
              )}
              {stale && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  The field has changed since the check; applying replaces it.
                </p>
              )}
              <div className="flex gap-1">
                {canApply(f) && (
                  <Button size="sm" className="h-7" onClick={() => apply(i)}>
                    Apply
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7" onClick={() => dismiss(i)}>
                  {canApply(f) ? "Dismiss" : "Done"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// A card's text to read, with copy and edit (pencil, or a double click):
// editing makes it a text box with the cursor at the end.
function EditField({
  label,
  value,
  onChange,
  big,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  big?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-1 text-sm" data-field={label}>
      <div className="flex items-center gap-1">
        <span className="font-medium">{label}</span>
        <span className="ml-auto flex gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Copy ${label}`}
            title="Copy"
            disabled={!value}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                toast.success(`${label} copied`);
              } catch {
                toast.error("Couldn't copy");
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant={editing ? "secondary" : "ghost"}
            className="h-7 w-7"
            aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
            title={editing ? "Done" : "Edit"}
            // Keeps the box from losing focus (and closing) before the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(!editing)}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
        </span>
      </div>
      {editing ? (
        <GrowingText
          autoFocus
          aria-label={label}
          lang="hi"
          className={big ? "text-base" : ""}
          value={value}
          placeholder={placeholder}
          onFocus={(e) => e.currentTarget.setSelectionRange(value.length, value.length)}
          onBlur={() => setEditing(false)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div
          lang="hi"
          data-value
          title="Double-click to edit"
          onDoubleClick={() => setEditing(true)}
          className={`min-h-[2.5rem] whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 ${big ? "text-base font-medium" : ""}`}
        >
          {value || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
        </div>
      )}
    </div>
  );
}

// A textarea as tall as its text.
function GrowingText(props: React.ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return (
    <Textarea
      ref={ref}
      rows={1}
      {...props}
      className={`min-h-[2.5rem] resize-none overflow-hidden ${props.className ?? ""}`}
    />
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
  const [chunkPreview, setChunkPreview] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
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
  // What changed in these chunks since their download (read before the
  // download resets it), as a sheet: null when no text changed.
  const changesFn = useServerFn(flashChunkChanges);
  const changeList = async (ns: number[]) => {
    const withChanges = ns.filter((n) => {
      const x = changes.get(n);
      return x && !x.never && x.changed.length + x.removed.length > 0;
    });
    if (!withChanges.length) return null;
    const r = await changesFn({ data: { topic_id: topic.id, chunks: withChanges } });
    return {
      ...r,
      bytes: r.rows.length ? await xlsxBytes(changeSheet(r.rows)) : null,
    };
  };
  const listName = (ns: number[]) =>
    `${ns.length === 1 ? chunkFileName(topic.name, ns[0], topic.chunks) : chunkFileName(topic.name, null)} - changes.xlsx`;
  const saveChanges = async (ns: number[]) => {
    try {
      const l = await changeList(ns);
      if (l?.bytes) saveBytes(listName(ns), l.bytes, XLSX_TYPE);
      else
        toast(
          l?.marksOnly
            ? `Only marks changed (verified, notes, AI checks) on ${l.marksOnly} card${l.marksOnly === 1 ? "" : "s"}: nothing new for the app`
            : "Nothing changed since the download",
        );
      if (l?.older)
        toast.warning(
          `${l.older} card${l.older === 1 ? "" : "s"} changed more than 20 times: their "before" is the oldest kept`,
        );
    } catch (e) {
      toast.error(errorText(e, "Couldn't list the changes"));
    }
  };
  const download = async (chunk: number, work = false) => {
    // The change list first: the download marks the chunk unchanged.
    const list = work ? null : await changeList([chunk]).catch(() => null);
    const rows = chunkRows(topic, cards, chunk, work);
    saveBytes(
      `${chunkFileName(topic.name, chunk, topic.chunks)}${work ? " (working)" : ""}.xlsx`,
      await xlsxBytes(rows),
      XLSX_TYPE,
    );
    if (!work) await downloaded([chunk]);
    if (list?.bytes)
      toast.success(
        `Chunk ${chunk}: ${list.rows.length} change${list.rows.length === 1 ? "" : "s"} since the last download`,
        {
          duration: 30_000,
          action: {
            label: "Change list",
            onClick: () => saveBytes(listName([chunk]), list.bytes!, XLSX_TYPE),
          },
        },
      );
  };
  const zipOf = async (ns: number[], name: string) => {
    const list = await changeList(ns).catch(() => null);
    // Two chunks given the same name: the second gets its number too.
    const used = new Set<string>();
    const files = await Promise.all(
      ns.map(async (n) => {
        let base = chunkFileName(topic.name, n, topic.chunks);
        if (used.has(base.toLowerCase())) base = `${base} (${n})`;
        used.add(base.toLowerCase());
        return { name: `${base}.xlsx`, data: await xlsxBytes(chunkRows(topic, cards, n)) };
      }),
    );
    // The change list goes in too, to check what is being uploaded.
    if (list?.bytes) files.push({ name: listName(ns.length === 1 ? ns : []), data: list.bytes });
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
            <Button
              size="sm"
              variant="outline"
              title="See which cards differ between the studio and the app before uploading"
              onClick={() => setComparing(true)}
            >
              <GitCompare className="mr-1 h-4 w-4" /> Compare with the app
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
                  <ChunkName topic={topic} n={ch.n} onSaved={onChanged} />
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
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Preview chunk ${ch.n}`}
                      disabled={!inChunk.length}
                      onClick={() => setChunkPreview(ch.n)}
                    >
                      <Smartphone className="mr-1 h-4 w-4" /> Preview
                    </Button>
                    {edited > 0 && !x?.never && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Every change since the last download, field by field (before → after)"
                        onClick={() => void saveChanges([ch.n])}
                      >
                        <ListChecks className="mr-1 h-4 w-4" /> What changed
                      </Button>
                    )}
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
          {comparing && (
            <CompareWithApp
              topic={topic}
              cards={cards}
              onChanged={onChanged}
              onClose={() => setComparing(false)}
            />
          )}
          {chunkPreview !== null && (
            <StudentPreview
              topic={topic}
              cards={live
                .filter((c) => c.chunk === chunkPreview)
                .sort((a, b) => (a.card_order ?? 0) - (b.card_order ?? 0))}
              title={`Chunk ${chunkPreview} as students see it`}
              onClose={() => setChunkPreview(null)}
            />
          )}
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

// A chunk's name, its file's name when downloaded: typed in place, saved
// on Enter or on leaving the box (empty: the topic's name and number).
function ChunkName({ topic, n, onSaved }: { topic: FlashTopic; n: number; onSaved: () => void }) {
  const nameFn = useServerFn(nameFlashChunk);
  const saved = topic.chunks.find((c) => c.n === n)?.name ?? "";
  const [v, setV] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(saved), [saved]);
  const save = async () => {
    if (v.trim() === saved.trim()) return;
    setBusy(true);
    try {
      await nameFn({ data: { topic_id: topic.id, n, name: v } });
      onSaved();
      toast.success(v.trim() ? `Chunk ${n} is “${v.trim()}”` : `Chunk ${n} named after the topic`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't name it"));
      setV(saved);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Input
      aria-label={`Name of chunk ${n}`}
      title="Its file's name when downloaded"
      className="h-8 w-56 min-w-0 text-sm"
      placeholder={chunkFileName(topic.name, n)}
      value={v}
      disabled={busy}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(saved);
      }}
    />
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
  const dirty =
    JSON.stringify(t) !==
    JSON.stringify({
      name: topic.name,
      prompt: topic.prompt,
      word_key: topic.word_key,
      columns: topic.columns,
      books: topic.books,
    });
  const setBook = (i: number, patch: Partial<FlashBook>) =>
    setT({ ...t, books: t.books.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  return (
    <div className="max-w-2xl space-y-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Topic name</span>
        <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        <span className="text-xs text-muted-foreground">
          Chunk files are named “{chunkFileName(t.name, 1)}.xlsx” unless you name a chunk on the
          Chunks tab.
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
      <div
        className={`sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur ${dirty ? "" : "hidden"}`}
      >
        <span className="text-sm text-amber-700 dark:text-amber-400">Unsaved changes</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setT({
              name: topic.name,
              prompt: topic.prompt,
              word_key: topic.word_key,
              columns: topic.columns,
              books: topic.books,
            })
          }
        >
          Undo
        </Button>
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
      <ResetChunks topic={topic} onChanged={onChanged} />
    </div>
  );
}

// Undoing the chunks, for a topic chunked only to try it out.
function ResetChunks({ topic, onChanged }: { topic: FlashTopic; onChanged: () => void }) {
  const resetFn = useServerFn(resetFlashChunks);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!topic.chunks.length && !topic.locked_at) return null;
  return (
    <section
      aria-label="Reset the chunks"
      className="space-y-2 rounded-xl border border-red-300 p-3 text-sm dark:border-red-900"
    >
      <div className="font-medium text-red-700 dark:text-red-400">Reset the chunks</div>
      <p>
        Undoes the shuffle: the {topic.chunks.length} chunks, every card&apos;s number and its app
        id are cleared, and cards removed after numbering are deleted. The cards and their edits
        stay. Do this only if the chunks were made to try it out:{" "}
        <b>chunks already uploaded to the app won&apos;t match this topic any more</b>, and the
        numbers start again from 1.
      </p>
      <label className="block space-y-1">
        <span>
          Type the topic&apos;s name, <b>{topic.name}</b>, to reset
        </span>
        <Input
          aria-label="Topic name to reset"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy || typed.trim() !== topic.name.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await resetFn({ data: { topic_id: topic.id } });
            toast.success(
              `Chunks reset: ${r.cards} cards unnumbered${r.removed ? `, ${r.removed} removed cards deleted` : ""}`,
            );
            setTyped("");
            onChanged();
          } catch (e) {
            toast.error(errorText(e, "Couldn't reset the chunks"));
          } finally {
            setBusy(false);
          }
        }}
      >
        Reset the chunks
      </Button>
    </section>
  );
}
