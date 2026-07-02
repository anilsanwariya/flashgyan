import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, Send, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { askSaathi, listSaathiSubjects, type SaathiChatSource } from "@/lib/saathi.functions";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });

function SaathiChat() {
  const askFn = useServerFn(askSaathi);
  const subjectsFn = useServerFn(listSaathiSubjects);
  const subjectsQ = useQuery({ queryKey: ["saathiSubjects"], queryFn: () => subjectsFn() });

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const canSend = input.trim().length > 0 && selected.length > 0 && !sending;

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (selected.length === 0) {
      toast.error("Pick at least one subject first");
      return;
    }
    if (sending) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const res = await askFn({ data: { question: text, subjects: selected } });
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: res.answer, sources: res.sources },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${msg}` }]);
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
              <div className="text-xs text-muted-foreground leading-tight">Your study assistant</div>
            </div>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="mx-auto h-16 w-16 rounded-[24px] grad-lavender grid place-items-center mb-4 shadow-[0_8px_32px_rgba(var(--primary),0.2)]">
                <Sparkles className="h-7 w-7 text-foreground" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Ask SAATHI anything</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Pick one or more subjects below, then ask your question.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-2 rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-xl border border-border/30 w-fit">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              SAATHI is thinking…
            </div>
          )}
        </div>
      </div>

      <div
        className="relative z-10 border-t border-border/20 bg-white/50 dark:bg-black/40 backdrop-blur-2xl sticky bottom-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-3xl mx-auto px-5 pt-3 pb-3 space-y-2">
          <SubjectMultiSelect options={subjectsQ.data ?? []} selected={selected} onChange={setSelected} />
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={selected.length === 0 ? "Ask SAATHI" : "Ask SAATHI about your study material…"}
              rows={1}
              className="resize-none min-h-[48px] max-h-40 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-xl border-border/40"
            />
            <button
              onClick={send}
              disabled={!canSend}
              className="h-12 w-12 shrink-0 rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-xl grid place-items-center hover:bg-primary/20 active:scale-95 transition-all shadow-[0_4px_16px_rgba(var(--primary),0.15)] disabled:opacity-40 disabled:active:scale-100"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
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

  const label = useMemo(() => {
    if (selected.length === 0) return "Select subject(s)…";
    if (selected.length === 1) return selected[0];
    if (selected.length === options.length && options.length > 0) return "All subjects";
    return `${selected.length} subjects`;
  }, [selected, options]);

  const allSelected = options.length > 0 && selected.length === options.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full h-11 rounded-2xl border px-4 text-sm flex items-center justify-between gap-2 bg-white/60 dark:bg-black/40 backdrop-blur-xl transition-all active:scale-[0.99] ${
            selected.length === 0 ? "border-destructive/40 text-muted-foreground" : "border-border/40"
          }`}
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
              onClick={() => onChange(allSelected ? [] : options)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-muted/60 transition-colors"
            >
              <span className="h-4 w-4 grid place-items-center rounded-md border border-border/60">
                {allSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="font-medium">Select all</span>
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

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[24px] bg-primary/15 text-foreground px-4 py-2.5 whitespace-pre-wrap backdrop-blur-xl border border-primary/20 shadow-[0_4px_16px_rgba(var(--primary),0.08)]">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full grad-lavender grid place-items-center shrink-0 shadow-[0_4px_12px_rgba(var(--primary),0.15)]">
        <Sparkles className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-sm max-w-none text-foreground rounded-[24px] bg-white/50 dark:bg-black/30 backdrop-blur-xl border border-border/30 px-4 py-3 prose-headings:font-bold prose-table:text-sm prose-td:border prose-th:border prose-td:px-2 prose-th:px-2 prose-td:py-1 prose-th:py-1">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const { className, children } = props as {
                  className?: string;
                  children?: React.ReactNode;
                };
                const match = /language-(\w+)/.exec(className ?? "");
                const lang = match?.[1];
                const text = String(children ?? "").replace(/\n$/, "");
                if (lang === "mermaid") {
                  return <MermaidBlock chart={text} />;
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
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.map((s) => (
              <span
                key={s.id}
                className="text-[11px] rounded-full bg-white/50 dark:bg-black/30 backdrop-blur-xl border border-border/30 text-muted-foreground px-2.5 py-0.5"
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

function MermaidBlock({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg } = await mermaid.render(`m-${id}`, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Diagram error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return <pre className="bg-muted/60 rounded-xl p-3 overflow-x-auto text-xs text-destructive">{chart}</pre>;
  }
  return <div ref={ref} className="my-3 rounded-2xl bg-white/70 backdrop-blur-xl border border-border/30 p-3 overflow-x-auto" />;
}
