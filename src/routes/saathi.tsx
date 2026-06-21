import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Send, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askSaathi, listSaathiSubjects, type SaathiChatSource } from "@/lib/saathi.functions";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/saathi")({
  ssr: false,
  head: () => ({ meta: [{ title: "SAATHI — Ask the knowledge base" }] }),
  component: SaathiChat,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SaathiChatSource[];
};

const ALL = "__all__";

function SaathiChat() {
  const askFn = useServerFn(askSaathi);
  const subjectsFn = useServerFn(listSaathiSubjects);
  const subjectsQ = useQuery({ queryKey: ["saathiSubjects"], queryFn: () => subjectsFn() });

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState<string>(ALL);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const res = await askFn({
        data: {
          question: text,
          subject: subject === ALL ? null : subject,
        },
      });
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.answer,
          sources: res.sources,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${msg}` },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-8 w-8 rounded-full grad-lavender grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-bold leading-tight">SAATHI</div>
              <div className="text-xs text-muted-foreground leading-tight">
                Your study assistant
              </div>
            </div>
          </div>
          <div className="w-44">
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger>
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Subjects</SelectItem>
                {(subjectsQ.data ?? []).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Link
            to="/saathi-admin"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Admin"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="mx-auto h-14 w-14 rounded-full grad-lavender grid place-items-center mb-4">
                <Sparkles className="h-6 w-6 text-foreground" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Ask SAATHI anything</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Answers come only from the knowledge base. Pick a subject to narrow the search,
                or leave it on All Subjects.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-foreground/40 animate-pulse" />
              SAATHI is thinking…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask SAATHI about your study material…"
            rows={1}
            className="resize-none min-h-[44px] max-h-40"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="h-11 w-11 shrink-0 rounded-full bg-foreground text-background grid place-items-center disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full grad-lavender grid place-items-center shrink-0">
        <Sparkles className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">
          {msg.content}
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.map((s) => (
              <span
                key={s.id}
                className="text-[11px] rounded-full bg-muted text-muted-foreground px-2 py-0.5"
                title={`${s.subject} · similarity ${s.similarity.toFixed(2)}`}
              >
                {s.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
