// A story's images: the editor uploads photos, maps or diagrams (the AI
// can't take images from the sources), any shape, several at once. They are
// shown in the rows the magazine prints them in, the same in the Hindi and
// English issues, each with an optional caption.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { uploadCaImage } from "@/lib/current-affairs.functions";
import { MAX_IMAGES, type CaContent, type CaImage } from "@/lib/current-affairs";
import { imageRows } from "@/lib/current-affairs-html";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { BiLine, type Lang } from "@/components/ca-story-review";

// Large photos are made smaller before upload: sharp in print, light to send.
const MAX_SIDE = 2000;
const KEEP_PNG_BYTES = 1_500_000;

async function prepare(file: File): Promise<{ type: string; bytes: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  // Small PNGs (maps, diagrams) stay as they are: sharp lines and text.
  if (file.type === "image/png" && scale === 1 && file.size <= KEEP_PNG_BYTES) {
    bitmap.close();
    return { type: "image/png", bytes: file, w, h };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("Couldn't read this image");
  return { type: "image/jpeg", bytes: blob, w, h };
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function StoryImages({
  itemId,
  content,
  lang,
  editing,
  onSave,
}: {
  itemId: string;
  content: CaContent;
  lang: Lang;
  editing: boolean;
  onSave: (patch: Partial<CaContent>) => Promise<void>;
}) {
  const uploadFn = useServerFn(uploadCaImage);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const images = content.images ?? [];
  const room = MAX_IMAGES - images.length;

  async function add(files: File[]) {
    const picked = files.filter((f) => /^image\//.test(f.type));
    if (!picked.length) return;
    if (picked.length > room) {
      toast.error(
        room > 0
          ? `A story can have ${MAX_IMAGES} images; only the first ${room} were added`
          : `A story can have at most ${MAX_IMAGES} images`,
      );
    }
    const list = picked.slice(0, Math.max(0, room));
    if (!list.length) return;
    setUploading(list.length);
    const added: CaImage[] = [];
    try {
      for (const file of list) {
        const img = await prepare(file);
        const { url, path } = await uploadFn({
          data: {
            item_id: itemId,
            contentType: img.type as "image/jpeg",
            base64: await toBase64(img.bytes),
          },
        });
        added.push({ url, path, w: img.w, h: img.h });
        setUploading((n) => n - 1);
      }
    } catch (e) {
      toast.error(errorText(e, "Upload failed"));
    }
    if (added.length) {
      try {
        await onSave({ images: [...images, ...added] });
        toast.success(added.length === 1 ? "Image added" : `${added.length} images added`);
      } catch (e) {
        toast.error(errorText(e, "Couldn't save"));
      }
    }
    setUploading(0);
  }

  async function change(next: CaImage[], ok: string) {
    setBusy(true);
    try {
      await onSave({ images: next });
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }
  const move = (i: number, by: number) => {
    const next = [...images];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void change(next, "Moved");
  };

  const picker = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        data-testid="story-image-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void add(files);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={uploading > 0 || busy || room <= 0}
        onClick={() => input.current?.click()}
      >
        <ImagePlus className="mr-1 h-3.5 w-3.5" />
        {uploading > 0 ? `Uploading ${uploading}…` : images.length ? "Add more" : "Add images"}
      </Button>
    </>
  );

  if (!images.length) return <div className="flex">{picker}</div>;

  // The rows as printed: equal heights, filling the width.
  let n = 0;
  const index = new Map(images.map((img, i) => [img, i]));
  return (
    <section className="space-y-2" aria-label="Images">
      {imageRows(images).map((row) => {
        const sum = row.reduce((s, i) => s + Math.min(6, Math.max(0.2, i.w / i.h)), 0);
        return (
          <div key={row.map((i) => i.path).join()} className="flex items-start gap-2">
            {row.map((img) => {
              const i = index.get(img)!;
              const r = Math.min(6, Math.max(0.2, img.w / img.h));
              n++;
              return (
                <figure
                  key={img.path}
                  className="min-w-0 space-y-1"
                  style={{ flex: `${((r / sum) * 100).toFixed(3)} 1 0` }}
                >
                  <img
                    src={img.url}
                    alt={img.caption?.en || `Image ${n}`}
                    className="block w-full rounded-lg bg-muted object-cover"
                    style={{ aspectRatio: r }}
                  />
                  {editing ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="Move earlier"
                          disabled={busy || i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="Move later"
                          disabled={busy || i === images.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Remove image"
                          disabled={busy}
                          onClick={() =>
                            change(
                              images.filter((_, j) => j !== i),
                              "Image removed",
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <BiLine
                          value={img.caption ?? { en: "", hi: "" }}
                          lang={lang}
                          editing
                          onSave={(caption) =>
                            onSave({
                              images: images.map((x, j) => (j === i ? { ...x, caption } : x)),
                            })
                          }
                        />
                        {!img.caption?.en && !img.caption?.hi && <p>No caption</p>}
                      </div>
                    </div>
                  ) : (
                    (img.caption?.en || img.caption?.hi) && (
                      <figcaption className="text-xs text-muted-foreground">
                        <BiLine value={img.caption} lang={lang} />
                      </figcaption>
                    )
                  )}
                </figure>
              );
            })}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        <span className="text-xs text-muted-foreground">
          Printed in these rows in both issues. {editing ? "" : "Edit the story to add captions."}
        </span>
      </div>
    </section>
  );
}
