import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Upload, Users, Loader2 } from "lucide-react";
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
  listBotMcqTests,
  listBotUsers,
} from "@/lib/bot-manager.functions";

export const Route = createFileRoute("/_authenticated/bot-manager")({
  head: () => ({
    meta: [{ title: "Bot Manager · FlashGyan Admin" }],
  }),
  component: BotManagerPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 space-y-3">
      <p className="text-destructive">{error.message}</p>
      <Button onClick={reset}>Retry</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function BotManagerPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🤖 Bot Manager</h1>
          <p className="text-sm text-muted-foreground">
            Broadcast to Telegram users and manage isolated bot content.
          </p>
        </div>
        <Link to="/admin" className="text-sm underline">
          ← Admin
        </Link>
      </header>

      <Tabs defaultValue="broadcast">
        <TabsList>
          <TabsTrigger value="broadcast">📢 Reminders & Broadcast</TabsTrigger>
          <TabsTrigger value="content">📚 Bot Content Upload</TabsTrigger>
        </TabsList>
        <TabsContent value="broadcast" className="mt-4">
          <BroadcastPanel />
        </TabsContent>
        <TabsContent value="content" className="mt-4 space-y-6">
          <FlashcardUploadPanel />
          <McqUploadPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Broadcast ----------
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

// ---------- Flashcard Upload ----------
type FcRow = {
  order_index?: number;
  prompt: string;
  question: string;
  answer: string;
  sections?: { title: string; body: string }[];
};

function FlashcardUploadPanel() {
  const upload = useServerFn(bulkImportBotFlashcards);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);

  const example = useMemo(
    () =>
      JSON.stringify(
        [
          {
            order_index: 1,
            prompt: "Optional context or source",
            question: "Capital of Rajasthan?",
            answer: "Jaipur",
            sections: [{ title: "Note", body: "Founded in 1727 by Sawai Jai Singh II." }],
          },
        ],
        null,
        2,
      ),
    [],
  );

  async function onUpload() {
    if (!subject.trim() || !topic.trim() || !json.trim()) {
      toast.error("Subject, topic and JSON are required");
      return;
    }
    let rows: FcRow[];
    try {
      rows = JSON.parse(json);
      if (!Array.isArray(rows)) throw new Error("JSON must be an array");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    setBusy(true);
    try {
      const res = await upload({
        data: {
          subject: subject.trim(),
          topic: topic.trim(),
          rows: rows.map((r, i) => ({
            order_index: r.order_index ?? i + 1,
            prompt: r.prompt ?? "",
            question: r.question,
            answer: r.answer,
            sections: r.sections ?? [],
          })),
        },
      });
      toast.success(`Inserted ${res.inserted} flashcards into bot_flashcards`);
      setJson("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold">🃏 Upload Bot Flashcards</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
        </div>
        <div>
          <Label className="text-xs">Topic</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={busy} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Rows (JSON array)</Label>
        <Textarea
          rows={10}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={example}
          disabled={busy}
          className="font-mono text-xs"
        />
      </div>
      <Button onClick={onUpload} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
        Import to bot_flashcards
      </Button>
    </section>
  );
}

// ---------- MCQ Upload ----------
function McqUploadPanel() {
  const listTests = useServerFn(listBotMcqTests);
  const createTest = useServerFn(createBotMcqTest);
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
      <h3 className="font-semibold">📝 Upload Bot MCQs</h3>

      <div className="space-y-3">
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

      <div className="space-y-3 border-t border-border pt-4">
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
