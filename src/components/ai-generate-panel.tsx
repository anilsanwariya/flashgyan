// Admin helper: upload a PDF, parse via LlamaParse, then ask Gemini to
// synthesize flashcards / MCQs shaped like the Excel importer's rows.
// The generated rows are handed back via `onGenerated` so they flow into
// the same append/replace import UI used by the Excel path.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePdfWithLlama } from "@/lib/saathi-pdf.functions";
import { createSaathiDoc } from "@/lib/saathi.functions";
import {
  generateFlashcardsFromMarkdown,
  generateMcqsFromMarkdown,
  type GeneratedFcRow,
  type GeneratedMcqRow,
} from "@/lib/ai-generate.functions";


async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type Props<T> = {
  startOrder: number;
  onGenerated: (rows: T[]) => void;
  defaultCount?: number;
};

function useAiPanelState(defaultCount: number) {
  const parsePdf = useServerFn(parsePdfWithLlama);
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(defaultCount);
  const [status, setStatus] = useState<"idle" | "parsing" | "generating">("idle");
  const busy = status !== "idle";
  return { parsePdf, file, setFile, count, setCount, status, setStatus, busy };
}

function Shell({
  title,
  hint,
  file,
  setFile,
  count,
  setCount,
  status,
  busy,
  onRun,
  countMin = 5,
  countMax = 60,
}: {
  title: string;
  hint: string;
  file: File | null;
  setFile: (f: File | null) => void;
  count: number;
  setCount: (n: number) => void;
  status: "idle" | "parsing" | "generating";
  busy: boolean;
  onRun: () => void;
  countMin?: number;
  countMax?: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold flex items-center gap-2">
        <Sparkles className="h-4 w-4" /> {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <label className="mt-4 flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-border cursor-pointer hover:bg-accent/40">
        <div className="text-center px-4">
          <div className="text-sm font-medium">
            {file?.name || "Tap to choose a .pdf file (max 20 MB)"}
          </div>
          {file && (
            <div className="text-xs text-muted-foreground mt-1">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </div>
          )}
        </div>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </label>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <Label className="text-xs">Target count</Label>
          <Input
            type="number"
            min={countMin}
            max={countMax}
            value={count}
            onChange={(e) => setCount(Math.max(countMin, Math.min(countMax, Number(e.target.value) || countMin)))}
            disabled={busy}
          />
        </div>
        <Button onClick={onRun} disabled={busy || !file} className="h-10">
          {status === "parsing"
            ? "Parsing PDF…"
            : status === "generating"
              ? "Generating…"
              : "Generate"}
        </Button>
      </div>
    </section>
  );
}

export function FlashcardsAiPanel({
  startOrder,
  onGenerated,
  defaultCount = 25,
}: Props<GeneratedFcRow>) {
  const { parsePdf, file, setFile, count, setCount, status, setStatus, busy } =
    useAiPanelState(defaultCount);
  const generate = useServerFn(generateFlashcardsFromMarkdown);

  async function onRun() {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF is over 20 MB");
      return;
    }
    try {
      setStatus("parsing");
      const base64 = await fileToBase64(file);
      const { markdown } = await parsePdf({ data: { filename: file.name, base64 } });
      setStatus("generating");
      const { rows } = await generate({ data: { markdown, count, startOrder } });
      toast.success(`Generated ${rows.length} cards — review and import below`);
      onGenerated(rows);
      setFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <Shell
      title="Generate with AI (via PDF)"
      hint="We parse your PDF with LlamaParse, then Gemini writes flashcards tailored for RAS/REET/PSI/Patwari, preserving Hindi grammar and श्रुतिसम भिन्नार्थक pairs. Review before importing."
      file={file}
      setFile={setFile}
      count={count}
      setCount={setCount}
      status={status}
      busy={busy}
      onRun={onRun}
    />
  );
}

export function McqAiPanel({
  startOrder,
  onGenerated,
  defaultCount = 20,
}: Props<GeneratedMcqRow>) {
  const { parsePdf, file, setFile, count, setCount, status, setStatus, busy } =
    useAiPanelState(defaultCount);
  const generate = useServerFn(generateMcqsFromMarkdown);

  async function onRun() {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF is over 20 MB");
      return;
    }
    try {
      setStatus("parsing");
      const base64 = await fileToBase64(file);
      const { markdown } = await parsePdf({ data: { filename: file.name, base64 } });
      setStatus("generating");
      const { rows } = await generate({ data: { markdown, count, startOrder } });
      toast.success(`Generated ${rows.length} questions — review and import below`);
      onGenerated(rows);
      setFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <Shell
      title="Generate with AI (via PDF)"
      hint="We parse your PDF with LlamaParse, then Gemini writes 4-option MCQs tailored for RAS/REET/PSI/Patwari, preserving Hindi grammar and श्रुतिसम भिन्नार्थक pairs. Review before importing."
      file={file}
      setFile={setFile}
      count={count}
      setCount={setCount}
      status={status}
      busy={busy}
      onRun={onRun}
    />
  );
}
