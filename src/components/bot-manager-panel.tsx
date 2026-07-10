import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Send, Upload, Users, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseMcqWorkbook } from "@/lib/mcq-parse";
import {
  broadcastBotMessage,
  bulkImportBotFlashcards,
  bulkImportBotMcq,
  createBotMcqTest,
  deleteBotFlashcardDeck,
  deleteBotMcqTest,
  listBotFlashcardDecks,
  listBotMcqTests,
  listBotUsers,
} from "@/lib/bot-manager.functions";

// ---------- Flashcard XLSX parser (same shape as admin flashcard parser) ----------
type Section = { title: string; body: string };
type ParsedFcRow = {
  order_index: number;
  prompt: string;
  question: string;
  answer: string;
  sections: Section[];
};
const REQUIRED_FC = ["order", "question", "answer"] as const;

function normKey(k: string) {
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
  for (const k of originalKeys) headerMap[normKey(k)] = k;
  const missingCols = REQUIRED_FC.filter((c) => !(c in headerMap));
  if (missingCols.length) return { rows: [], invalid: 0, missingCols };
  const explanationCols: { key: string; title: string }[] = [];
  for (const k of originalKeys) {
    const nk = normKey(k);
    if (nk.startsWith("explanation_")) {
      const suf = nk.slice("explanation_".length);
      if (suf) explanationCols.push({ key: k, title: titleCase(suf) });
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
    if (!question || !answer || !orderRaw || !Number.isFinite(orderNum) || !Number.isInteger(orderNum)) {
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

export function BotManagerPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">🤖 Telegram Bot Manager</h2>
        <p className="text-sm text-muted-foreground">
          Broadcast to Telegram users and manage isolated bot content.
        </p>
      </div>
      <Tabs defaultValue="broadcast">
        <TabsList>
          <TabsTrigger value="broadcast">📢 Broadcast</TabsTrigger>
          <TabsTrigger value="flashcards">🃏 Bot Flashcards</TabsTrigger>
          <TabsTrigger value="mcq">📝 Bot MCQs</TabsTrigger>
        </TabsList>
        <TabsContent value="broadcast" className="mt-4">
          <BroadcastPanel />
        </TabsContent>
        <TabsContent value="flashcards" className="mt-4">
          <FlashcardUploadPanel />
        </TabsContent>
        <TabsContent value="mcq" className="mt-4">
          <McqUploadPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BroadcastPanel() {
  const list = useServerFn(listBotUsers);
  const broadcast = useServerFn(broadcastBotMessage);
  const { data: users } = useQuery({ queryKey: ["bot-users"], queryFn: () => list() });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSend() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await broadcast({ data: { text: text.trim() } });
      toast.success(`Sent to ${res.sent}/${res.total} (${res.failed} failed)`);
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        {users?.length ?? 0} bot users tracked
      </div>
      <div>
        <Label htmlFor="broadcast-text" className="text-xs">
          Message (HTML allowed: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;)
        </Label>
        <Textarea
          id="broadcast-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="🎯 Daily reminder: 5 new questions await you! Send /study to begin."
          disabled={busy}
        />
      </div>
      <Button onClick={onSend} disabled={busy || !text.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
        Send to All
      </Button>
    </section>
  );
}

// ---------- Bot Flashcards ----------
function FlashcardUploadPanel() {
  const listDecks = useServerFn(listBotFlashcardDecks);
  const delDeck = useServerFn(deleteBotFlashcardDeck);
  const upload = useServerFn(bulkImportBotFlashcards);
  const { data: decks, refetch } = useQuery({
    queryKey: ["bot-fc-decks"],
    queryFn: () => listDecks(),
  });

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [deckReady, setDeckReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFcRow[] | null>(null);
  const [invalid, setInvalid] = useState(0);
  const [busy, setBusy] = useState(false);

  function onCreateDeck() {
    if (!subject.trim() || !topic.trim()) {
      toast.error("Subject and topic are required");
      return;
    }
    setDeckReady(true);
    toast.success("Deck ready — upload flashcards below");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const buf = await f.arrayBuffer();
    const { rows, invalid, missingCols } = parseFcWorkbook(buf);
    if (missingCols.length) {
      toast.error("Missing columns: " + missingCols.join(", "));
      setParsed(null);
      return;
    }
    if (!rows.length) {
      toast.error("No valid rows parsed");
      setParsed(null);
      return;
    }
    setParsed(rows);
    setInvalid(invalid);
    toast.success(`Parsed ${rows.length} rows${invalid ? ` (${invalid} skipped)` : ""}`);
  }

  async function onImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await upload({
        data: { subject: subject.trim(), topic: topic.trim(), rows: parsed },
      });
      toast.success(`Inserted ${res.inserted} into bot_flashcards`);
      setParsed(null);
      setFile(null);
      setSubject("");
      setTopic("");
      setDeckReady(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteDeck(subj: string, top: string) {
    if (!confirm(`Delete all bot flashcards for "${subj} · ${top}"?`)) return;
    try {
      await delDeck({ data: { subject: subj, topic: top } });
      toast.success("Deck deleted");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="font-semibold">🃏 Bot Flashcard Decks</h3>
        <p className="text-xs text-muted-foreground mt-1">
          A deck is identified by Subject + Topic. Create one, then upload an Excel file.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Existing decks</p>
        {(decks ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No bot flashcard decks yet.</p>
        ) : (
          <ul className="space-y-2">
            {decks!.map((d) => (
              <li
                key={`${d.subject}-${d.topic}`}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {d.subject} · {d.topic}
                  </div>
                  <div className="text-xs text-muted-foreground">{d.count} cards</div>
                </div>
                <button
                  onClick={() => onDeleteDeck(d.subject, d.topic)}
                  className="h-8 w-8 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  aria-label="Delete deck"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">1. Create a bot deck</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy || deckReady} />
          </div>
          <div>
            <Label className="text-xs">Topic</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={busy || deckReady} />
          </div>
        </div>
        {!deckReady ? (
          <Button variant="secondary" onClick={onCreateDeck} disabled={busy}>
            Create bot deck
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeckReady(false);
              setParsed(null);
              setFile(null);
            }}
            disabled={busy}
          >
            ← Change deck
          </Button>
        )}
      </div>

      {deckReady && (
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            2. Upload Excel (columns: order, prompt, question, answer, explanation_*)
          </p>
          <Input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} />
          {parsed && (
            <div className="text-xs text-muted-foreground">
              {parsed.length} valid rows{invalid ? ` · ${invalid} skipped` : ""}{file ? ` · ${file.name}` : ""}
            </div>
          )}
          <Button onClick={onImport} disabled={busy || !parsed}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Import to bot_flashcards
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------- Bot MCQs ----------
function McqUploadPanel() {
  const listTests = useServerFn(listBotMcqTests);
  const createTest = useServerFn(createBotMcqTest);
  const delTest = useServerFn(deleteBotMcqTest);
  const importRows = useServerFn(bulkImportBotMcq);
  const { data: tests, refetch } = useQuery({
    queryKey: ["bot-mcq-tests"],
    queryFn: () => listTests(),
  });

  const [testId, setTestId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreateTest() {
    if (!newName.trim() || !newSubject.trim()) {
      toast.error("Name and subject required");
      return;
    }
    setBusy(true);
    try {
      const { id } = await createTest({
        data: {
          name: newName.trim(),
          subject: newSubject.trim(),
          topic: newTopic.trim(),
          description: "",
        },
      });
      toast.success("Test created");
      setNewName("");
      setNewSubject("");
      setNewTopic("");
      await refetch();
      setTestId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteTest(id: string, name: string) {
    if (!confirm(`Delete test "${name}" and all its questions?`)) return;
    try {
      await delTest({ data: { id } });
      toast.success("Test deleted");
      if (testId === id) setTestId("");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function onUpload() {
    if (!testId) return toast.error("Pick a test");
    if (!file) return toast.error("Pick an .xlsx file");
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const { rows, missingCols } = parseMcqWorkbook(buf);
      if (missingCols.length) {
        toast.error(`Missing columns: ${missingCols.join(", ")}`);
        return;
      }
      if (!rows.length) {
        toast.error("No rows parsed");
        return;
      }
      const res = await importRows({ data: { test_id: testId, rows } });
      toast.success(`Inserted ${res.inserted} MCQs into bot_mcq_questions`);
      setFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <h3 className="font-semibold">📝 Bot MCQ Tests</h3>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Existing tests</p>
        {(tests ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No bot MCQ tests yet.</p>
        ) : (
          <ul className="space-y-2">
            {tests!.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.subject}
                    {t.topic ? ` · ${t.topic}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => onDeleteTest(t.id, t.name)}
                  className="h-8 w-8 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  aria-label="Delete test"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">1. Create a bot test</p>
        <div className="grid grid-cols-3 gap-3">
          <Input placeholder="Test name" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy} />
          <Input placeholder="Subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} disabled={busy} />
          <Input placeholder="Topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} disabled={busy} />
        </div>
        <Button variant="secondary" onClick={onCreateTest} disabled={busy}>
          Create bot_mcq_test
        </Button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">2. Upload questions (.xlsx)</p>
        <div>
          <Label className="text-xs">Target test</Label>
          <Select value={testId} onValueChange={setTestId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a bot test" />
            </SelectTrigger>
            <SelectContent>
              {(tests ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} — {t.subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <Button onClick={onUpload} disabled={busy || !file || !testId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          Import to bot_mcq_questions
        </Button>
      </div>
    </section>
  );
}
