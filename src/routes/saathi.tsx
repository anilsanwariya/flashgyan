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

  // Pin layout to the visual viewport so the input/subject dropdown stay
  // visible above the on-screen keyboard on mobile devices.
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
    // Prevent body from scrolling behind a fixed-height chat surface.
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
    <div ref={containerRef} className="fixed inset-0 flex flex-col bg-background" style={{ height: "100dvh" }}>
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-8 w-8 rounded-full grad-lavender grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-bold leading-tight">SAATHI</div>
              <div className="text-xs text-muted-foreground leading-tight">Your study assistant</div>
            </div>
          </div>
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
                Pick one or more subjects below, then ask your question.
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

      <div
        className="border-t border-border bg-background sticky bottom-0"
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
              className="resize-none min-h-[44px] max-h-40"
            />
            <button
              onClick={send}
              disabled={!canSend}
              className="h-11 w-11 shrink-0 rounded-full bg-foreground text-background grid place-items-center disabled:opacity-40"
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
          className={`w-full h-10 rounded-lg border px-3 text-sm flex items-center justify-between gap-2 bg-background ${
            selected.length === 0 ? "border-destructive/60 text-muted-foreground" : "border-border"
          }`}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1 max-h-72 overflow-y-auto">
        {options.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No subjects yet.</div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onChange(allSelected ? [] : options)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted"
            >
              <span className="h-4 w-4 grid place-items-center rounded border border-border">
                {allSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="font-medium">Select all</span>
            </button>
            <div className="h-px bg-border my-1" />
            {options.map((s) => {
              const on = selected.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted"
                >
                  <span className="h-4 w-4 grid place-items-center rounded border border-border">
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
        <div className="prose prose-sm max-w-none text-foreground prose-headings:font-bold prose-table:text-sm prose-td:border prose-th:border prose-td:px-2 prose-th:px-2 prose-td:py-1 prose-th:py-1">
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
                    <pre className="bg-muted rounded-lg p-3 overflow-x-auto text-xs">
                      <code>{text}</code>
                    </pre>
                  );
                }
                return <code className="bg-muted rounded px-1 py-0.5 text-xs">{children}</code>;
              },
              table(props) {
                return (
                  <div className="overflow-x-auto my-2">
                    <table className="border-collapse border border-border">{props.children}</table>
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
    return <pre className="bg-muted rounded-lg p-3 overflow-x-auto text-xs text-destructive">{chart}</pre>;
  }
  return <div ref={ref} className="my-3 rounded-lg bg-white p-3 overflow-x-auto" />;
}
