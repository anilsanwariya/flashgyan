import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Layers,
  Lock,
  Send,
  Sparkles,
  Square,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { listSaathiTopics, submitSaathiFeedback, type SaathiTopic } from "@/lib/saathi.functions";
import { getHomeData } from "@/lib/home.functions";
import type {
  SaathiSource,
  SaathiStreamEvent,
} from "../../supabase/functions/_shared/saathi-core.ts";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/saathi")({
  ssr: false,
  head: () => ({ meta: [{ title: "SAATHI — Ask the knowledge base" }] }),
  component: SaathiChat,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "done" | "error";
  noAnswer?: boolean;
  sources?: SaathiSource[];
  question?: string;
  rating?: 1 | -1;
};

const CHAT_KEY = "saathi.chat.v1";
const SUBJECTS_KEY = "saathi.subjects.v1";
const MAX_STORED = 40;
const HISTORY_TURNS = 6;

const homeQO = queryOptions({ queryKey: ["homeData"], queryFn: () => getHomeData() });

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, Telegram webview restrictions)
  }
}

// Only completed question/answer pairs go back to the server as conversation memory.
function historyFrom(messages: Msg[]) {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const q = messages[i];
    const a = messages[i + 1];
    if (
      q.role === "user" &&
      a.role === "assistant" &&
      a.status === "done" &&
      !a.noAnswer &&
      a.content
    ) {
      turns.push({ role: "user", content: q.content }, { role: "assistant", content: a.content });
    }
  }
  return turns.slice(-HISTORY_TURNS);
}

function pickStarters(topics: SaathiTopic[], selected: string[]): string[] {
  const pool = topics.filter((t) => selected.length === 0 || selected.includes(t.subject));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).map((t) => `Explain the key points of "${t.title}"`);
}

function SaathiChat() {
  const topicsFn = useServerFn(listSaathiTopics);
  const topicsQ = useQuery({ queryKey: ["saathiTopics"], queryFn: () => topicsFn() });
  const homeQ = useQuery(homeQO);
  const locked = homeQ.data?.settings.lock_saathi ?? false;

  const [messages, setMessages] = useState<Msg[]>(() =>
    readStored<Msg[]>(CHAT_KEY, []).filter((m) => m.status !== "streaming"),
  );
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string[]>(() => readStored<string[]>(SUBJECTS_KEY, []));
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const subjects = topicsQ.data?.subjects ?? [];

  // Drop remembered subjects that no longer exist.
  useEffect(() => {
    if (!topicsQ.data) return;
    setSelected((cur) => cur.filter((s) => topicsQ.data.subjects.includes(s)));
  }, [topicsQ.data]);

  useEffect(() => writeStored(SUBJECTS_KEY, selected), [selected]);

  useEffect(() => {
    if (sending) return;
    writeStored(CHAT_KEY, messages.slice(-MAX_STORED));
  }, [messages, sending]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = containerRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.body.style.overflow = prevOverflow;
      el.style.height = "";
      el.style.transform = "";
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: sending ? "auto" : "smooth" });
  }, [messages, sending]);

  const starters = useMemo(
    () => pickStarters(topicsQ.data?.topics ?? [], selected),
    [topicsQ.data, selected],
  );

  const canSend = input.trim().length > 0 && !sending && !locked;

  function patchMessage(id: string, patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) {
    setMessages((all) =>
      all.map((m) =>
        m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m,
      ),
    );
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || sending || locked) return;

    const history = historyFrom(messages);
    const answerId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: text, status: "done" },
      { id: answerId, role: "assistant", content: "", status: "streaming", question: text },
    ]);
    setInput("");
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/saathi/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, subjects: selected, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as SaathiStreamEvent;
          if (event.type === "delta") {
            patchMessage(answerId, (m) => ({ content: m.content + event.text }));
          } else if (event.type === "done") {
            finished = true;
            patchMessage(answerId, {
              status: "done",
              noAnswer: event.noAnswer,
              sources: event.sources,
            });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      if (!finished) throw new Error("SAATHI stopped unexpectedly. Please try again.");
    } catch (err) {
      if (controller.signal.aborted) {
        patchMessage(answerId, (m) => ({
          status: "done",
          noAnswer: !m.content,
          content: m.content || "Stopped.",
        }));
      } else {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        toast.error(msg);
        patchMessage(answerId, (m) => ({
          status: "error",
          content: m.content ? `${m.content}\n\n⚠️ ${msg}` : `⚠️ ${msg}`,
        }));
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newChat() {
    if (sending) stop();
    setMessages([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col bg-gradient-to-br from-primary/10 via-background to-secondary/10 overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[480px] w-[480px] rounded-full bg-secondary/30 blur-[120px]" />

      <header className="relative z-10 border-b border-border/20 bg-white/40 dark:bg-black/40 backdrop-blur-2xl sticky top-0">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/50 dark:bg-black/40 border border-border/30 backdrop-blur-xl text-foreground/70 hover:text-foreground transition-all active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-full grad-lavender grid place-items-center shrink-0 shadow-[0_4px_16px_rgba(var(--primary),0.15)]">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-bold leading-tight tracking-tight">SAATHI</div>
              <div className="text-xs text-muted-foreground leading-tight">
                Your study assistant
              </div>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newChat}
              className="inline-flex items-center gap-1.5 h-10 rounded-full px-3.5 text-sm font-medium bg-white/50 dark:bg-black/40 border border-border/30 backdrop-blur-xl text-foreground/80 hover:text-foreground transition-all active:scale-95"
            >
              <SquarePen className="h-4 w-4" />
              New chat
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {locked ? (
            <div className="text-center py-16">
              <div className="mx-auto h-16 w-16 rounded-[24px] grad-lavender grid place-items-center mb-4">
                <Lock className="h-7 w-7 text-foreground" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">SAATHI is coming soon</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Our AI study assistant isn't open yet. Check back soon!
              </p>
            </div>
          ) : (
            messages.length === 0 && (
              <div className="text-center py-12">
                <div className="mx-auto h-16 w-16 rounded-[24px] grad-lavender grid place-items-center mb-4 shadow-[0_8px_32px_rgba(var(--primary),0.2)]">
                  <Sparkles className="h-7 w-7 text-foreground" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight">Ask SAATHI anything</h1>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  Ask in English or हिंदी. Answers come from our study material.
                </p>
                {starters.length > 0 && (
                  <div className="mt-6 grid gap-2 sm:grid-cols-2 max-w-xl mx-auto text-left">
                    {starters.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-2xl border border-border/40 bg-white/60 dark:bg-black/40 backdrop-blur-xl px-4 py-3 text-sm hover:bg-white/80 dark:hover:bg-black/60 transition-all active:scale-[0.99]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onRate={(rating) => patchMessage(m.id, { rating })} />
          ))}
        </div>
      </div>

      <div
        className="relative z-10 border-t border-border/20 bg-white/50 dark:bg-black/40 backdrop-blur-2xl sticky bottom-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-3xl mx-auto px-5 pt-3 pb-3 space-y-2">
          <SubjectMultiSelect options={subjects} selected={selected} onChange={setSelected} />
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={locked}
              placeholder="Ask in English or हिंदी…"
              rows={1}
              className="resize-none min-h-[48px] max-h-40 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-xl border-border/40"
            />
            {sending ? (
              <button
                onClick={stop}
                className="h-12 w-12 shrink-0 rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-xl grid place-items-center hover:bg-primary/20 active:scale-95 transition-all"
                aria-label="Stop"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!canSend}
                className="h-12 w-12 shrink-0 rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-xl grid place-items-center hover:bg-primary/20 active:scale-95 transition-all shadow-[0_4px_16px_rgba(var(--primary),0.15)] disabled:opacity-40 disabled:active:scale-100"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubjectMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  }

  // No selection means every subject is searched.
  const label = useMemo(() => {
    if (selected.length === 0 || (selected.length === options.length && options.length > 0)) {
      return "All subjects";
    }
    if (selected.length === 1) return selected[0];
    return `${selected.length} subjects`;
  }, [selected, options]);

  const allSelected = selected.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-11 rounded-2xl border border-border/40 px-4 text-sm flex items-center justify-between gap-2 bg-white/60 dark:bg-black/40 backdrop-blur-xl transition-all active:scale-[0.99]"
        >
          <span className="truncate text-left font-medium">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-1.5 max-h-72 overflow-y-auto rounded-2xl bg-white/80 dark:bg-black/70 backdrop-blur-3xl border-border/40"
      >
        {options.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No subjects yet.</div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-muted/60 transition-colors"
            >
              <span className="h-4 w-4 grid place-items-center rounded-md border border-border/60">
                {allSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="font-medium">All subjects</span>
            </button>
            <div className="h-px bg-border/40 my-1" />
            {options.map((s) => {
              const on = selected.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-muted/60 transition-colors"
                >
                  <span className="h-4 w-4 grid place-items-center rounded-md border border-border/60">
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{s}</span>
                </button>
              );
            })}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function markdownComponents(streaming: boolean): Components {
  return {
    code(props) {
      const { className, children } = props as {
        className?: string;
        children?: React.ReactNode;
      };
      const match = /language-(\w+)/.exec(className ?? "");
      const lang = match?.[1];
      const text = String(children ?? "").replace(/\n$/, "");
      if (lang === "mermaid") {
        // Half-written diagrams can't be parsed, so wait for the full answer.
        return streaming ? (
          <span className="block my-3 text-xs text-muted-foreground">Drawing diagram…</span>
        ) : (
          <MermaidBlock chart={text} />
        );
      }
      if (lang) {
        return (
          <pre className="bg-muted/60 rounded-xl p-3 overflow-x-auto text-xs">
            <code>{text}</code>
          </pre>
        );
      }
      return <code className="bg-muted/60 rounded px-1 py-0.5 text-xs">{children}</code>;
    },
    table(props) {
      return (
        <div className="overflow-x-auto my-2">
          <table className="border-collapse border border-border/60">{props.children}</table>
        </div>
      );
    },
    th(props) {
      return (
        <th className="border border-border/60 px-2 py-1 text-left font-semibold">
          {props.children}
        </th>
      );
    },
    td(props) {
      return <td className="border border-border/60 px-2 py-1">{props.children}</td>;
    },
    img(props) {
      const { src, alt } = props;
      return (
        <img
          src={src}
          alt={alt || "SAATHI Study Diagram"}
          className="max-w-full h-auto rounded-2xl my-3 border border-border/40 bg-white/60 dark:bg-black/20 shadow-sm max-h-[350px] object-contain block mx-auto"
          loading="lazy"
        />
      );
    },
  };
}

function MessageBubble({ msg, onRate }: { msg: Msg; onRate: (rating: 1 | -1) => void }) {
  const feedbackFn = useServerFn(submitSaathiFeedback);
  const [openSource, setOpenSource] = useState<SaathiSource | null>(null);

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[24px] bg-primary/15 text-foreground px-4 py-2.5 whitespace-pre-wrap backdrop-blur-xl border border-primary/20 shadow-[0_4px_16px_rgba(var(--primary),0.08)]">
          {msg.content}
        </div>
      </div>
    );
  }

  const streaming = msg.status === "streaming";
  const answered = msg.status === "done" && !msg.noAnswer && msg.content.length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.content);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  async function rate(rating: 1 | -1) {
    if (msg.rating || !msg.question) return;
    onRate(rating);
    try {
      await feedbackFn({
        data: {
          question: msg.question,
          answer: msg.content,
          rating,
          sources: (msg.sources ?? []).map((s) => s.title),
        },
      });
      toast.success(
        rating === 1 ? "Thanks for the feedback!" : "Thanks — we'll improve this answer.",
      );
    } catch {
      // feedback is best-effort
    }
  }

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full grad-lavender grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(var(--primary),0.15)]">
        <Sparkles className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground rounded-[24px] bg-white/50 dark:bg-black/30 backdrop-blur-xl border border-border/30 px-4 py-3 prose-headings:font-bold prose-table:text-sm prose-td:border prose-th:border prose-td:px-2 prose-th:px-2 prose-td:py-1 prose-th:py-1">
          {streaming && !msg.content ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground not-prose">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              SAATHI is thinking…
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(streaming)}>
              {msg.content}
            </ReactMarkdown>
          )}
        </div>

        {answered && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {msg.sources?.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setOpenSource(s)}
                className="text-[11px] rounded-full bg-white/50 dark:bg-black/30 backdrop-blur-xl border border-border/30 text-muted-foreground hover:text-foreground px-2.5 py-0.5 transition-colors"
                title={`${s.subject} — tap to read the source`}
              >
                📚 {s.title}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-0.5">
              <IconButton label="Copy answer" onClick={copy}>
                <Copy className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Helpful"
                active={msg.rating === 1}
                disabled={!!msg.rating}
                onClick={() => rate(1)}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Not helpful"
                active={msg.rating === -1}
                disabled={!!msg.rating}
                onClick={() => rate(-1)}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
        )}

        {answered && msg.sources && msg.sources.length > 0 && (
          <Link
            to="/flashcards"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Layers className="h-3.5 w-3.5" />
            Practise this with flashcards
          </Link>
        )}

        <Dialog open={!!openSource} onOpenChange={(o) => !o && setOpenSource(null)}>
          <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>{openSource?.title}</DialogTitle>
              <p className="text-xs text-muted-foreground">{openSource?.subject}</p>
            </DialogHeader>
            <div className="space-y-4">
              {openSource?.passages.map((p, i) => (
                <div
                  key={i}
                  className="prose prose-sm dark:prose-invert max-w-none rounded-xl border border-border/40 bg-muted/30 p-3"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{p}</ReactMarkdown>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`h-7 w-7 grid place-items-center rounded-full transition-colors ${
        active
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      } disabled:cursor-default`}
    >
      {children}
    </button>
  );
}

type Mermaid = (typeof import("mermaid"))["default"];
let mermaidLoader: Promise<Mermaid> | null = null;

// Mermaid is large, so it is only downloaded once an answer contains a diagram.
function loadMermaid(): Promise<Mermaid> {
  mermaidLoader ??= import("mermaid").then(({ default: mermaid }) => {
    const dark = document.documentElement.classList.contains("dark");
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "default",
      securityLevel: "strict",
    });
    return mermaid;
  });
  return mermaidLoader;
}

function MermaidBlock({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(`m-${id}`, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  // A broken diagram is dropped rather than shown as raw code.
  if (failed) return null;
  return (
    <div
      ref={ref}
      className="my-3 rounded-2xl bg-white/70 dark:bg-black/30 backdrop-blur-xl border border-border/30 p-3 overflow-x-auto"
    />
  );
}
