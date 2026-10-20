// "Add material" on a story: a link, a PDF, Word, Excel or text file, an
// image or typed text. SAATHI reads it and lists what the story lacks, for
// the place the editor chose (new facts, Static Context or background), each
// with the material's own words; the editor ticks what goes in.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Link2, Paperclip, Type } from "lucide-react";
import {
  applyCaMaterial,
  discardCaMaterial,
  readCaMaterial,
  type CaItem,
} from "@/lib/current-affairs.functions";
import {
  MATERIAL_TARGETS,
  type MaterialFact,
  type MaterialStatic,
  type MaterialTarget,
} from "@/lib/ca-material";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FILE_ACCEPT = ".pdf,.docx,.xlsx,.xls,.txt,.md,image/png,image/jpeg,image/webp";
const IMAGE_SIDE = 1600;

type Kind = "link" | "file" | "text";
type Found = {
  source_id: string;
  title: string;
  facts: MaterialFact[];
  statics: MaterialStatic[];
  dropped: number;
};

// An image made small enough for SAATHI to read (about 1,600 px).
async function imageForReading(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't read this image");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: file.name, contentType: "image/jpeg" as const, base64: btoa(binary) };
}

export function StoryMaterial({ item, onChanged }: { item: CaItem; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={!item.content}>
        <Paperclip className="mr-1 h-4 w-4" /> Add material
      </Button>
      {open && (
        <MaterialPanel
          item={item}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

// The form and SAATHI's list: in a pop-up, or (inline) on the story editor's
// "Add material" tab, where it starts over after each use.
export function MaterialPanel({
  item,
  onClose,
  onDone,
  inline = false,
}: {
  item: CaItem;
  onClose: () => void;
  onDone: () => void;
  inline?: boolean;
}) {
  const readFn = useServerFn(readCaMaterial);
  const applyFn = useServerFn(applyCaMaterial);
  const discardFn = useServerFn(discardCaMaterial);
  const [target, setTarget] = useState<MaterialTarget>("facts");
  const [kind, setKind] = useState<Kind>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"idle" | "reading" | "applying">("idle");
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const ready =
    kind === "link"
      ? /^https?:\/\/\S+$/.test(url.trim())
      : kind === "file"
        ? !!file
        : text.trim().length >= 20;

  async function read() {
    setStep("reading");
    try {
      let material: {
        url?: string;
        text?: { title: string; content: string };
        image?: Awaited<ReturnType<typeof imageForReading>>;
      };
      if (kind === "link") material = { url: url.trim() };
      else if (kind === "text")
        material = { text: { title: title.trim() || "Editor's note", content: text.trim() } };
      else if (/^image\//.test(file!.type)) material = { image: await imageForReading(file!) };
      else {
        const { extractTextFromFile } = await import("@/lib/saathi-parse");
        const content = (await extractTextFromFile(file!, "Bilingual")).trim();
        if (content.length < 20) throw new Error("No readable text in this file.");
        material = { text: { title: file!.name, content } };
      }
      const r = await readFn({
        data: {
          id: item.id,
          target,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...material,
        },
      });
      setFound(r);
      const n = target === "static" ? r.statics.length : r.facts.length;
      setPicked(new Set(Array.from({ length: n }, (_, i) => i)));
    } catch (e) {
      toast.error(errorText(e, "Couldn't read the material"));
    } finally {
      setStep("idle");
    }
  }

  // Closing after reading, without adding anything, removes the material.
  // Inline, the form starts over instead of closing.
  const reset = () => {
    setFound(null);
    setUrl("");
    setFile(null);
    setTitle("");
    setText("");
    setNote("");
    setStep("idle");
  };
  const close = () => {
    if (found) void discardFn({ data: { source_id: found.source_id } }).catch(() => undefined);
    if (inline) reset();
    onClose();
  };

  async function apply() {
    if (!found) return;
    setStep("applying");
    try {
      const pick = <T,>(xs: T[]) => xs.filter((_, i) => picked.has(i));
      await applyFn({
        data: {
          id: item.id,
          source_id: found.source_id,
          target,
          ...(note.trim() ? { note: note.trim() } : {}),
          facts: target === "static" ? [] : pick(found.facts),
          statics: target === "static" ? pick(found.statics) : [],
        },
      });
      toast.success(
        target === "static"
          ? `Added to ${MATERIAL_TARGETS[1].label}`
          : "Story written again with the new material",
      );
      if (inline) reset();
      onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add the material"));
      setStep("idle");
    }
  }

  const rows = found ? (target === "static" ? found.statics : found.facts) : [];
  const busy = step !== "idle";
  const intro =
    "SAATHI reads it and lists what this story lacks, quoted from your material. You choose what goes in.";
  const body = (
    <>
      {!found ? (
        <>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Where should it go?</p>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Use it for">
              {MATERIAL_TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={target === t.id}
                  onClick={() => setTarget(t.id)}
                  className={`rounded-xl border p-2.5 text-left text-sm ${
                    target === t.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Material">
              {(
                [
                  ["link", "Link", Link2],
                  ["file", "File or image", FileText],
                  ["text", "Text", Type],
                ] as const
              ).map(([k, label, Icon]) => (
                <Button
                  key={k}
                  size="sm"
                  role="tab"
                  aria-selected={kind === k}
                  variant={kind === k ? "default" : "outline"}
                  onClick={() => setKind(k)}
                >
                  <Icon className="mr-1 h-3.5 w-3.5" /> {label}
                </Button>
              ))}
            </div>
            {kind === "link" && (
              <Input
                aria-label="Link"
                placeholder="https://… (a news page, press release or PDF)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
            {kind === "file" && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="hidden"
                  data-testid="material-file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  Choose a file
                </Button>
                <span className="text-sm text-muted-foreground">
                  {file ? file.name : "PDF, Word, Excel, text, or a photo of a page"}
                </span>
              </div>
            )}
            {kind === "text" && (
              <>
                <Input
                  aria-label="Title"
                  placeholder="Title (optional), e.g. Notes from the scheme guidelines"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  aria-label="Text"
                  placeholder="Paste or type the information"
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </>
            )}
          </div>
          <Textarea
            aria-label="Note for SAATHI"
            placeholder="Optional note for SAATHI, e.g. only the district-wise figures"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            {busy && (
              <span className="mr-auto text-xs text-muted-foreground">
                Reading… a PDF can take a minute.
              </span>
            )}
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void read()} disabled={!ready || busy}>
              {busy ? "Reading…" : "Read material"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            From <span className="font-medium">{found.title}</span>
            {rows.length
              ? `: ${rows.length} ${target === "static" ? "entr" + (rows.length === 1 ? "y" : "ies") : "item" + (rows.length === 1 ? "" : "s")} for ${MATERIAL_TARGETS.find((t) => t.id === target)!.label}.`
              : ": nothing this story lacks."}
          </p>
          {found.dropped > 0 && (
            <p className="text-xs text-muted-foreground">
              {found.dropped} more left out: their words aren't in the material.
            </p>
          )}
          <ul className="space-y-2" aria-label="Found in the material">
            {rows.map((r, i) => {
              const s = target === "static" ? (r as MaterialStatic) : null;
              const f = target === "static" ? null : (r as MaterialFact);
              return (
                <li key={i} className="flex gap-2.5 rounded-xl border border-border p-2.5">
                  <Checkbox
                    aria-label={`Use ${s ? s.keyword.en : f!.text}`}
                    checked={picked.has(i)}
                    onCheckedChange={(v) =>
                      setPicked((cur) => {
                        const next = new Set(cur);
                        if (v) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-1 text-sm">
                    {s ? (
                      <>
                        <p>
                          <b>{s.keyword.en}</b>
                          {s.keyword.hi !== s.keyword.en && (
                            <span className="text-muted-foreground"> · {s.keyword.hi}</span>
                          )}
                          : {s.text.en}
                        </p>
                        <p lang="hi" className="text-muted-foreground">
                          {s.text.hi}
                        </p>
                      </>
                    ) : (
                      <p>{f!.text}</p>
                    )}
                    <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                      “{r.quote}”
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step === "applying" && target !== "static" && (
              <span className="mr-auto text-xs text-muted-foreground">
                Writing the story again…
              </span>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void discardFn({ data: { source_id: found.source_id } }).catch(() => undefined);
                setFound(null);
              }}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void apply()} disabled={busy || picked.size === 0}>
              {step === "applying"
                ? "Adding…"
                : target === "static"
                  ? `Add ${picked.size} to Static Context`
                  : `Add ${picked.size} and rewrite the story`}
            </Button>
          </div>
        </>
      )}
    </>
  );
  if (inline) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{intro}</p>
        {body}
      </div>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add material to this story</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
