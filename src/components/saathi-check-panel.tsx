import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardCheck, ImagePlus, RotateCcw, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { CheckStreamEvent } from "@/lib/saathi-check.server";
import type { CheckCriterion, CheckResult } from "../../supabase/functions/_shared/saathi-check.ts";

const MAX_PHOTOS = 3;
// Claude reads images best up to about 1568 px on the long side.
const MAX_EDGE = 1568;

const CRITERIA: { key: CheckCriterion; en: string; hi: string }[] = [
  { key: "content", en: "Content", hi: "विषय-वस्तु" },
  { key: "structure", en: "Structure", hi: "संरचना" },
  { key: "specificity", en: "Facts & examples", hi: "तथ्य व उदाहरण" },
  { key: "presentation", en: "Presentation", hi: "प्रस्तुति" },
];

type Photo = { id: string; url: string; media_type: "image/jpeg"; data: string };

type Done = Extract<CheckStreamEvent, { type: "done" }>;

type State =
  | { status: "idle" }
  | { status: "checking"; stage: "sending" | "reading" | "checking" }
  | { status: "error"; message: string; transcript?: string | null }
  | { status: "done"; done: Done };

// Shrinks a photo to what Claude reads and returns it as base64 JPEG.
async function preparePhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return {
      id: crypto.randomUUID(),
      url: dataUrl,
      media_type: "image/jpeg",
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SaathiCheckPanel({ marks, locked }: { marks: number; locked: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [state, setState] = useState<State>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = state.status === "checking";
  const canCheck =
    !busy &&
    !locked &&
    question.trim().length >= 5 &&
    (answer.trim().length > 0 || photos.length > 0);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room);
    try {
      const ready = await Promise.all(picked.map(preparePhoto));
      setPhotos((cur) => [...cur, ...ready].slice(0, MAX_PHOTOS));
    } catch {
      setState({ status: "error", message: "Couldn't open that photo. Try a JPG or PNG." });
    }
  }

  async function check() {
    if (!canCheck) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "checking", stage: "sending" });
    try {
      const res = await fetch("/api/saathi/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: question.trim(),
          marks,
          answer: answer.trim(),
          images: photos.map((p) => ({ media_type: p.media_type, data: p.data })),
          initData: window.Telegram?.WebApp?.initData || undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setState({
          status: "error",
          message: body?.error ?? "SAATHI is having trouble right now. Please try again.",
        });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as CheckStreamEvent;
          if (ev.type === "stage") setState({ status: "checking", stage: ev.stage });
          else if (ev.type === "done") {
            finished = true;
            setState({ status: "done", done: ev });
          } else if (ev.type === "error") {
            finished = true;
            setState({ status: "error", message: ev.message, transcript: ev.transcript });
          }
        }
      }
      if (!finished) {
        setState({ status: "error", message: "The check stopped unexpectedly. Please try again." });
      }
    } catch (e) {
      if (controller.signal.aborted) setState({ status: "idle" });
      else setState({ status: "error", message: "Couldn't reach SAATHI. Check your connection." });
    } finally {
      abortRef.current = null;
    }
  }

  function another() {
    setAnswer("");
    setPhotos([]);
    setQuestion("");
    setState({ status: "idle" });
  }

  if (state.status === "done") return <CheckResultCard done={state.done} onAgain={another} />;

  const stageText =
    state.status === "checking"
      ? state.stage === "reading"
        ? "Reading your handwriting…"
        : state.stage === "checking"
          ? "Marking like an RPSC examiner…"
          : photos.length
            ? "Uploading your pages…"
            : "Starting the check…"
      : "";

  return (
    <div className="space-y-4">
      <div className="text-center pt-4">
        <div className="mx-auto h-16 w-16 rounded-[24px] grad-lavender grid place-items-center mb-4 shadow-[0_8px_32px_rgba(var(--primary),0.2)]">
          <ClipboardCheck className="h-7 w-7 text-foreground" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Check my Mains answer</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Paste the question, then type your answer or add photos of your handwritten pages. SAATHI
          marks it out of {marks} like an RPSC examiner and shows what to improve. 3 checks a day.
        </p>
      </div>

      <div className="rounded-[24px] bg-white/50 dark:bg-black/30 backdrop-blur-xl border border-border/30 p-4 space-y-3">
        <label className="block text-sm font-medium" htmlFor="check-question">
          Question ({marks} marks)
        </label>
        <Textarea
          id="check-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy || locked}
          rows={2}
          maxLength={2000}
          placeholder="e.g. राजस्थान में जल संरक्षण की पारंपरिक विधियों की विवेचना कीजिए।"
          className="resize-none rounded-2xl bg-white/60 dark:bg-black/40 border-border/40"
        />
        <label className="block text-sm font-medium" htmlFor="check-answer">
          Your answer
        </label>
        <Textarea
          id="check-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={busy || locked}
          rows={photos.length ? 2 : 7}
          maxLength={12_000}
          placeholder={
            photos.length
              ? "Photos added. You can leave this empty."
              : "Type your answer here, or add photos below…"
          }
          className="resize-y rounded-2xl bg-white/60 dark:bg-black/40 border-border/40"
        />
        <div className="flex flex-wrap items-center gap-2">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className="relative h-20 w-16 rounded-xl overflow-hidden border border-border/40"
            >
              <img src={p.url} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                disabled={busy}
                onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                className="absolute top-0.5 right-0.5 h-6 w-6 rounded-full bg-black/60 text-white grid place-items-center"
                aria-label={`Remove page ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              disabled={busy || locked}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 h-10 rounded-full px-3.5 text-sm font-medium bg-white/60 dark:bg-black/40 border border-border/40 hover:text-foreground text-foreground/80 disabled:opacity-50"
            >
              {photos.length ? <ImagePlus className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {photos.length ? "Add page" : "Add photos of your answer"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">
            Up to {MAX_PHOTOS} pages, one page per photo
          </span>
        </div>
        {state.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
          >
            {state.message}
            {state.transcript && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs">What we read</summary>
                <p className="whitespace-pre-wrap text-xs mt-1">{state.transcript}</p>
              </details>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={busy ? () => abortRef.current?.abort() : check}
            disabled={!busy && !canCheck}
            className="inline-flex items-center gap-2 h-11 rounded-full px-5 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            <ClipboardCheck className="h-4 w-4" />
            {busy ? "Stop" : "Check answer"}
          </button>
          {busy && (
            <span
              className="flex items-center gap-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {stageText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-1 list-disc pl-5 space-y-0.5 text-sm">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function CheckResultCard({ done, onAgain }: { done: Done; onAgain: () => void }) {
  const r: CheckResult = done.result;
  const hi = r.language === "Hindi";
  return (
    <div className="space-y-3 pt-2">
      <div className="rounded-[24px] bg-white/50 dark:bg-black/30 backdrop-blur-xl border border-border/30 p-5 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight" data-testid="check-marks">
            {r.awarded}
          </span>
          <span className="text-lg text-muted-foreground">/ {r.outOf}</span>
          <span className="ml-auto text-xs text-muted-foreground">{done.length}</span>
        </div>
        {r.verdict && <p className="text-sm italic">{r.verdict}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {CRITERIA.map((c) => (
            <div key={c.key}>
              <div className="flex justify-between text-xs">
                <span>{hi ? c.hi : c.en}</span>
                <span className="text-muted-foreground">{r.scores[c.key]}/10</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-primary/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${r.scores[c.key] * 10}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <List title={hi ? "✅ अच्छा है" : "✅ Good"} items={r.strengths} />
        <List title={hi ? "📚 छूटे हुए बिंदु" : "📚 Missing points"} items={r.missing} />
        <List title={hi ? "🎯 सुधार कैसे करें" : "🎯 How to improve"} items={r.improve} />
        {r.noMaterial && (
          <p className="text-xs text-muted-foreground">
            {hi
              ? "यह विषय अभी आपकी अध्ययन सामग्री में नहीं है; जाँच SAATHI के अपने ज्ञान से की गई है।"
              : "This topic isn't in your study material yet, so SAATHI checked it with its own knowledge."}
          </p>
        )}
        {done.transcript && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {hi ? "आपके पन्नों से पढ़ा गया उत्तर" : "What we read from your pages"}
            </summary>
            <p className="whitespace-pre-wrap mt-2 text-sm">{done.transcript}</p>
          </details>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAgain}
          disabled={done.left === 0}
          className="inline-flex items-center gap-2 h-11 rounded-full px-5 text-sm font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Check another answer
        </button>
        <span className="text-xs text-muted-foreground">
          {done.left === 0
            ? "That was today's last check. Come back tomorrow!"
            : `${done.left} check${done.left === 1 ? "" : "s"} left today`}
        </span>
      </div>
    </div>
  );
}
