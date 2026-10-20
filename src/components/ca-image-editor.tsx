// Editing a story image: crop (free or a fixed shape, with zoom), quarter
// turns, a mirror image and a small tilt to straighten it. The edit is made
// in the browser and uploaded as a new file; the original is kept, so the
// edit can be changed later or undone.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FlipHorizontal2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { uploadCaImage } from "@/lib/current-affairs.functions";
import type { CaImage, ImageEdit } from "@/lib/current-affairs";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Crop = ImageEdit["crop"];
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
const NO_EDIT: ImageEdit = { rotate: 0, flip: false, straighten: 0, crop: FULL };
const MAX_SIDE = 2000;
const MIN_CROP = 0.05;

const RATIOS: { label: string; value: number | "free" | "original" }[] = [
  { label: "Free", value: "free" },
  { label: "Original", value: "original" },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:4", value: 3 / 4 },
];

// The image turned, mirrored and tilted, as wide and tall as the turned
// image: a tilt zooms in just enough that no empty corners show.
function drawTurned(
  img: CanvasImageSource,
  w: number,
  h: number,
  e: Pick<ImageEdit, "rotate" | "flip" | "straighten">,
  scale = 1,
): HTMLCanvasElement {
  const quarter = e.rotate === 90 || e.rotate === 270;
  const W = Math.max(1, Math.round((quarter ? h : w) * scale));
  const H = Math.max(1, Math.round((quarter ? w : h) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const t = (Math.abs(e.straighten) * Math.PI) / 180;
  const fill = Math.cos(t) + Math.sin(t) * Math.max(W / H, H / W);
  ctx.translate(W / 2, H / 2);
  ctx.rotate((e.straighten * Math.PI) / 180);
  ctx.scale(fill, fill);
  ctx.rotate((e.rotate * Math.PI) / 180);
  ctx.scale(e.flip ? -1 : 1, 1);
  ctx.drawImage(img, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
  return canvas;
}

// The biggest crop of a shape (width ÷ height, in pixels) inside a W × H
// image, centred on a point, as fractions.
function fitCrop(ratio: number, W: number, H: number, zoom = 1, cx = 0.5, cy = 0.5): Crop {
  let w = 1;
  let h = W / ratio / H;
  if (h > 1) {
    h = 1;
    w = (H * ratio) / W;
  }
  w /= zoom;
  h /= zoom;
  const x = Math.min(1 - w, Math.max(0, cx - w / 2));
  const y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    // Storage serves images to other sites, so the edit can be read back.
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error("Couldn't load the image"));
    // A fresh request, so a copy cached without that permission isn't used.
    img.src = `${url}${url.includes("?") ? "&" : "?"}edit=1`;
  });

export function ImageEditor({
  image,
  itemId,
  onClose,
  onSave,
}: {
  image: CaImage;
  itemId: string;
  onClose: () => void;
  onSave: (next: CaImage) => Promise<void>;
}) {
  const uploadFn = useServerFn(uploadCaImage);
  const source = image.original ?? { url: image.url, path: image.path, w: image.w, h: image.h };
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [edit, setEdit] = useState<ImageEdit>(image.edit ?? NO_EDIT);
  const [ratio, setRatio] = useState<number | "free" | "original">("free");
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadImage(source.url).then(
      (i) => live && setImg(i),
      (e) => toast.error(errorText(e, "Couldn't load the image")),
    );
    return () => {
      live = false;
    };
  }, [source.url]);

  const quarter = edit.rotate === 90 || edit.rotate === 270;
  const W = quarter ? source.h : source.w;
  const H = quarter ? source.w : source.h;
  const shape = ratio === "free" ? null : ratio === "original" ? W / H : ratio;

  // The turned image, small enough to show.
  // (Cropping doesn't redraw it.)
  const { rotate, flip, straighten } = edit;
  const view = useMemo(() => {
    if (!img) return null;
    const scale = Math.min(1, 900 / Math.max(source.w, source.h));
    return drawTurned(img, source.w, source.h, { rotate, flip, straighten }, scale);
  }, [img, source.w, source.h, rotate, flip, straighten]);
  useEffect(() => {
    const host = canvasHost.current;
    if (!host || !view) return;
    view.style.width = "100%";
    view.style.height = "auto";
    view.style.display = "block";
    host.replaceChildren(view);
  }, [view]);

  const setCrop = (crop: Crop) => setEdit((e) => ({ ...e, crop }));
  const pickRatio = (r: (typeof RATIOS)[number]["value"]) => {
    setRatio(r);
    setZoom(1);
    if (r !== "free") setCrop(fitCrop(r === "original" ? W / H : r, W, H));
  };
  const turn = (by: 90 | -90) =>
    setEdit((e) => ({
      ...e,
      rotate: ((((e.rotate + by) % 360) + 360) % 360) as ImageEdit["rotate"],
      // A turned image has a new shape: start the crop again.
      crop: shape && ratio !== "original" ? fitCrop(shape, H, W) : FULL,
    }));

  // Dragging the crop (move) or a corner (resize), in fractions of the image.
  const drag = (mode: "move" | "nw" | "ne" | "sw" | "se") => (ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = box.current!.getBoundingClientRect();
    const start = { x: ev.clientX, y: ev.clientY, crop: edit.crop };
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - start.x) / rect.width;
      const dy = (e.clientY - start.y) / rect.height;
      const c = start.crop;
      if (mode === "move") {
        setCrop({
          ...c,
          x: Math.min(1 - c.w, Math.max(0, c.x + dx)),
          y: Math.min(1 - c.h, Math.max(0, c.y + dy)),
        });
        return;
      }
      const left = mode === "nw" || mode === "sw";
      const top = mode === "nw" || mode === "ne";
      let x0 = c.x;
      let y0 = c.y;
      let x1 = c.x + c.w;
      let y1 = c.y + c.h;
      if (left) x0 = Math.min(x1 - MIN_CROP, Math.max(0, x0 + dx));
      else x1 = Math.max(x0 + MIN_CROP, Math.min(1, x1 + dx));
      if (top) y0 = Math.min(y1 - MIN_CROP, Math.max(0, y0 + dy));
      else y1 = Math.max(y0 + MIN_CROP, Math.min(1, y1 + dy));
      if (shape) {
        // Keep the shape: the height follows the width, within the image.
        let w = x1 - x0;
        let h = (w * W) / shape / H;
        const room = top ? y1 : 1 - y0;
        if (h > room) {
          h = room;
          w = (h * H * shape) / W;
        }
        if (left) x0 = x1 - w;
        else x1 = x0 + w;
        if (top) y0 = y1 - h;
        else y1 = y0 + h;
      }
      setCrop({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const zoomTo = (z: number) => {
    setZoom(z);
    const c = edit.crop;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const r = shape ?? (c.w * W) / (c.h * H);
    setCrop(fitCrop(r, W, H, z, cx, cy));
  };

  const edited =
    edit.rotate !== 0 ||
    edit.flip ||
    edit.straighten !== 0 ||
    edit.crop.x > 0.001 ||
    edit.crop.y > 0.001 ||
    edit.crop.w < 0.999 ||
    edit.crop.h < 0.999;

  async function save() {
    if (!img) return;
    setSaving(true);
    try {
      if (!edited) {
        // Nothing changed from the original: use it again.
        await onSave({ ...image, ...source, original: undefined, edit: undefined });
        return;
      }
      const turned = drawTurned(img, source.w, source.h, edit);
      const c = edit.crop;
      const sw = Math.max(1, Math.round(c.w * turned.width));
      const sh = Math.max(1, Math.round(c.h * turned.height));
      const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(sw * scale));
      out.height = Math.max(1, Math.round(sh * scale));
      out
        .getContext("2d")!
        .drawImage(
          turned,
          Math.round(c.x * turned.width),
          Math.round(c.y * turned.height),
          sw,
          sh,
          0,
          0,
          out.width,
          out.height,
        );
      const png = /\.png$/i.test(source.path);
      const blob = await new Promise<Blob | null>((ok) =>
        out.toBlob(ok, png ? "image/png" : "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Couldn't make the image");
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i += 0x8000)
        binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const { url, path } = await uploadFn({
        data: {
          item_id: itemId,
          contentType: png ? "image/png" : "image/jpeg",
          base64: btoa(binary),
        },
      });
      await onSave({ ...image, url, path, w: out.width, h: out.height, original: source, edit });
    } catch (e) {
      // A canvas can't be read back when the image came without permission.
      toast.error(
        e instanceof DOMException && e.name === "SecurityError"
          ? "This image can't be edited in the browser. Upload it again and edit the new copy."
          : errorText(e, "Couldn't save the image"),
      );
    } finally {
      setSaving(false);
    }
  }

  const c = edit.crop;
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
  const handle = (pos: "nw" | "ne" | "sw" | "se") => (
    <span
      role="presentation"
      data-handle={pos}
      onPointerDown={drag(pos)}
      className="absolute h-5 w-5 touch-none rounded-full border-2 border-white bg-primary shadow"
      style={{
        left: pos.endsWith("w") ? -10 : undefined,
        right: pos.endsWith("e") ? -10 : undefined,
        top: pos.startsWith("n") ? -10 : undefined,
        bottom: pos.startsWith("s") ? -10 : undefined,
        cursor: `${pos}-resize`,
      }}
    />
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
          <DialogDescription>
            Drag the box or its corners to crop. The original is kept, so you can change this later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Crop shape">
          {RATIOS.map((r) => (
            <Button
              key={r.label}
              size="sm"
              variant={ratio === r.value ? "default" : "outline"}
              className="h-7 px-2.5"
              aria-pressed={ratio === r.value}
              onClick={() => pickRatio(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex justify-center rounded-lg bg-muted/60 p-3">
          <div
            ref={box}
            data-testid="crop-area"
            className="relative w-full select-none"
            style={{ maxWidth: `min(100%, ${(420 * W) / H}px)` }}
          >
            <div ref={canvasHost} />
            {!img && <div className="aspect-video w-full animate-pulse rounded bg-muted" />}
            {img && (
              <>
                {/* Shade outside the crop. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: "rgba(0,0,0,.45)",
                    clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(c.x)} ${pct(c.y)}, ${pct(c.x)} ${pct(c.y + c.h)}, ${pct(c.x + c.w)} ${pct(c.y + c.h)}, ${pct(c.x + c.w)} ${pct(c.y)}, ${pct(c.x)} ${pct(c.y)})`,
                  }}
                />
                <div
                  data-testid="crop-box"
                  onPointerDown={drag("move")}
                  className="absolute touch-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
                  style={{
                    left: pct(c.x),
                    top: pct(c.y),
                    width: pct(c.w),
                    height: pct(c.h),
                    cursor: "move",
                    backgroundImage:
                      "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
                    backgroundSize: "33.333% 33.333%",
                    backgroundPosition: "-1px -1px",
                  }}
                >
                  {handle("nw")}
                  {handle("ne")}
                  {handle("sw")}
                  {handle("se")}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="flex justify-between">
              <span>Zoom</span>
              <span className="text-muted-foreground">{zoom.toFixed(1)}×</span>
            </span>
            <input
              type="range"
              aria-label="Zoom"
              min={1}
              max={4}
              step={0.1}
              value={zoom}
              onChange={(e) => zoomTo(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="flex justify-between">
              <span>Straighten</span>
              <span className="text-muted-foreground">
                {edit.straighten > 0 ? "+" : ""}
                {edit.straighten.toFixed(1)}°
              </span>
            </span>
            <input
              type="range"
              aria-label="Straighten"
              min={-10}
              max={10}
              step={0.5}
              value={edit.straighten}
              onChange={(e) => setEdit((x) => ({ ...x, straighten: Number(e.target.value) }))}
              className="w-full accent-[var(--primary)]"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => turn(-90)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Turn left
          </Button>
          <Button size="sm" variant="outline" onClick={() => turn(90)}>
            <RotateCw className="mr-1 h-3.5 w-3.5" /> Turn right
          </Button>
          <Button
            size="sm"
            variant={edit.flip ? "default" : "outline"}
            aria-pressed={edit.flip}
            onClick={() =>
              setEdit((e) => ({
                ...e,
                flip: !e.flip,
                crop: { ...e.crop, x: 1 - e.crop.x - e.crop.w },
              }))
            }
          >
            <FlipHorizontal2 className="mr-1 h-3.5 w-3.5" /> Mirror
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!edited}
            onClick={() => {
              setEdit(NO_EDIT);
              setRatio("free");
              setZoom(1);
            }}
          >
            <Undo2 className="mr-1 h-3.5 w-3.5" /> Reset to original
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !img}>
            {saving ? "Saving…" : "Save image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
