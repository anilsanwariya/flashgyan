// A story's images: the editor uploads photos, maps or diagrams (the AI
// can't take images from the sources), any shape, several at once. They are
// shown in the rows the magazine prints them in, the same in the Hindi and
// English issues, each with an optional caption.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Crop, ImagePlus, Trash2 } from "lucide-react";
import { uploadCaImage } from "@/lib/current-affairs.functions";
import { MAX_IMAGES, type CaContent, type CaImage, type ImageLayout } from "@/lib/current-affairs";
import { imageRows, isSideImage } from "@/lib/current-affairs-html";
import { ImageEditor } from "@/components/ca-image-editor";
import { ClipImageButton } from "@/components/ca-clippings";
import { Input } from "@/components/ui/input";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { BiLine, type Lang } from "@/components/ca-story-review";
import { prepareImage, toBase64 } from "@/lib/ca-image-file";

const LAYOUTS: { value: ImageLayout; label: string }[] = [
  { value: "row", label: "In the rows" },
  { value: "own", label: "Own row" },
  { value: "right", label: "Right of text" },
  { value: "left", label: "Left of text" },
];

export function StoryImages({
  itemId,
  sourceIds = [],
  content,
  lang,
  editing,
  onSave,
}: {
  itemId: string;
  // The story's sources: a newspaper clipping among them gives images too.
  sourceIds?: string[];
  content: CaContent;
  lang: Lang;
  editing: boolean;
  onSave: (patch: Partial<CaContent>) => Promise<void>;
}) {
  const uploadFn = useServerFn(uploadCaImage);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editingImage, setEditingImage] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const images = content.images ?? [];
  const room = MAX_IMAGES - images.length;
  // A screenshot pasted (Ctrl+V) while editing is added like a chosen file.
  const addRef = useRef<(files: File[]) => Promise<void>>(async () => undefined);
  useEffect(() => {
    if (!editing) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      e.preventDefault();
      void addRef.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [editing]);
  // Files dropped anywhere on the images are added too.
  const dropProps = editing
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          void add([...e.dataTransfer.files]);
        },
      }
    : {};

  async function add(files: File[], credit?: string) {
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
        const img = await prepareImage(file);
        const { url, path } = await uploadFn({
          data: {
            item_id: itemId,
            contentType: img.type as "image/jpeg",
            base64: await toBase64(img.bytes),
          },
        });
        added.push({ url, path, w: img.w, h: img.h, ...(credit ? { credit } : {}) });
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
  addRef.current = add;

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
      <ClipImageButton
        sourceIds={sourceIds}
        disabled={uploading > 0 || busy || room <= 0}
        onPick={(file, credit) => add([file], credit)}
      />
    </>
  );

  if (!images.length)
    return editing ? (
      <div
        {...dropProps}
        data-testid="story-image-drop"
        className={`flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground ${over ? "border-primary bg-primary/5" : "border-border"}`}
      >
        {picker}
        <span>Or drop images here, or paste a screenshot (Ctrl+V).</span>
        <span className="text-xs">
          Wide images print in rows across the page; square or tall ones save room placed right or
          left of the text.
        </span>
      </div>
    ) : (
      <div className="flex">{picker}</div>
    );

  // The rows as printed: equal heights, filling the width; images beside
  // the text after them.
  let n = 0;
  const index = new Map(images.map((img, i) => [img, i]));
  const update = (i: number, patch: Partial<CaImage>, ok: string) =>
    change(
      images.map((x, j) => (j === i ? { ...x, ...patch } : x)),
      ok,
    );
  const controls = (img: CaImage, i: number) => (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-0.5">
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
          className="h-7 w-7"
          aria-label="Crop and turn"
          disabled={busy}
          onClick={() => setEditingImage(i)}
        >
          <Crop className="h-3.5 w-3.5" />
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
        <select
          aria-label="Place"
          className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
          value={img.layout ?? "row"}
          disabled={busy}
          onChange={(e) => update(i, { layout: e.target.value as ImageLayout }, "Image placed")}
        >
          {LAYOUTS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        aria-label="Photo credit"
        className="h-7 text-xs"
        placeholder="Photo credit, e.g. Photo: PIB"
        defaultValue={img.credit ?? ""}
        maxLength={80}
        disabled={busy}
        onBlur={(e) => {
          const credit = e.target.value.trim();
          if (credit !== (img.credit ?? "")) void update(i, { credit }, "Credit saved");
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
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
  );
  const shown = (img: CaImage) => (
    <>
      {(img.caption?.en || img.caption?.hi) && (
        <figcaption className="text-xs text-muted-foreground">
          <BiLine value={img.caption} lang={lang} />
        </figcaption>
      )}
      {img.credit && <p className="text-right text-[10px] text-muted-foreground">{img.credit}</p>}
    </>
  );
  const side = images.filter(isSideImage);
  return (
    <section
      {...dropProps}
      data-testid="story-image-drop"
      className={`space-y-2 rounded-xl ${over ? "outline-dashed outline-2 outline-offset-4 outline-primary" : ""}`}
      aria-label="Images"
    >
      {editingImage !== null && images[editingImage] && (
        <ImageEditor
          image={images[editingImage]}
          itemId={itemId}
          onClose={() => setEditingImage(null)}
          onSave={async (next) => {
            await onSave({
              images: images.map((x, j) => (j === editingImage ? next : x)),
            });
            setEditingImage(null);
            toast.success("Image saved");
          }}
        />
      )}
      {imageRows(images.filter((i) => !isSideImage(i))).map((row) => {
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
                  {editing ? controls(img, i) : shown(img)}
                </figure>
              );
            })}
          </div>
        );
      })}
      {side.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {side.map((img) => {
            const i = index.get(img)!;
            return (
              <figure key={img.path} className="w-36 space-y-1">
                <img
                  src={img.url}
                  alt={img.caption?.en || "Image beside the text"}
                  className="block w-full rounded-lg bg-muted"
                />
                <p className="text-[11px] font-medium text-primary">
                  {img.layout === "left" ? "Left of the text" : "Right of the text"}
                </p>
                {editing ? controls(img, i) : shown(img)}
              </figure>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {picker}
        <span className="text-xs text-muted-foreground">
          Printed in these rows in both issues.{" "}
          {editing
            ? "Drop or paste (Ctrl+V) more here. Square or tall images save room beside the text."
            : "Edit the story to add captions."}
        </span>
      </div>
    </section>
  );
}
