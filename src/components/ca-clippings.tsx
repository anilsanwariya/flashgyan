// A source's newspaper clipping, shown again: beside its text in the reader
// (to check a number against the printed page), and as the place to crop a
// photo, map or chart from for a story's images.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crop, Newspaper, X, ZoomIn, ZoomOut } from "lucide-react";
import { getCaSourceClips } from "@/lib/ca-clips.functions";
import type { ClipPart } from "@/lib/ca-clips";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ca-ui";

type SourceClip = { source_id: string; source_name: string; parts: ClipPart[] };

function useSourceClips(sourceIds: string[]) {
  const fn = useServerFn(getCaSourceClips);
  return useQuery({
    queryKey: ["caSourceClips", [...sourceIds].sort().join(",")],
    queryFn: () => fn({ data: { source_ids: sourceIds } }),
    enabled: sourceIds.length > 0,
    // Signed links last an hour.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

// "Original clipping" for a source read from a clipping (nothing otherwise).
export function ClippingButton({ sourceId }: { sourceId: string }) {
  const q = useSourceClips([sourceId]);
  const [open, setOpen] = useState(false);
  const clip = q.data?.[0];
  if (!clip) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-0.5 text-primary hover:underline"
      >
        <Newspaper className="h-3 w-3" /> Original clipping
      </button>
      {open && <ClipViewer clip={clip} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClipViewer({ clip, onClose }: { clip: SourceClip; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label="Original clipping"
      className="fixed inset-0 z-[70] flex flex-col bg-black/80"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 bg-background px-3 py-1.5 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <Newspaper className="h-4 w-4 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {clip.source_name} · {clip.parts.map((p) => `p. ${p.page}`).join(", ")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Zoom in"
          disabled={zoom >= 4}
          onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Close clipping" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
        <div
          className="mx-auto space-y-3"
          style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "min(100%, 800px)" : undefined }}
        >
          {clip.parts.map((p, i) =>
            p.url ? (
              <img
                key={i}
                src={p.url}
                alt={`Part ${i + 1}, page ${p.page}`}
                className="block w-full bg-white"
              />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- A story image cropped from a clipping ----------

type Box = { x: number; y: number; w: number; h: number };

// "From the clipping": pick one of the story's clippings, drag a box over
// the photo or chart, and it is added like an uploaded image (with the
// newspaper as its credit).
export function ClipImageButton({
  sourceIds,
  disabled,
  onPick,
}: {
  sourceIds: string[];
  disabled?: boolean;
  onPick: (file: File, credit: string) => Promise<void>;
}) {
  const q = useSourceClips(sourceIds);
  const [open, setOpen] = useState(false);
  const clips = q.data ?? [];
  if (!clips.length) return null;
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <Crop className="mr-1 h-3.5 w-3.5" /> From the clipping
      </Button>
      {open && (
        <ClipCropper
          clips={clips}
          onClose={() => setOpen(false)}
          onPick={async (file, credit) => {
            await onPick(file, credit);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ClipCropper({
  clips,
  onClose,
  onPick,
}: {
  clips: SourceClip[];
  onClose: () => void;
  onPick: (file: File, credit: string) => Promise<void>;
}) {
  const parts = clips.flatMap((c) =>
    c.parts.filter((p) => p.url).map((p) => ({ clip: c, part: p })),
  );
  const [at, setAt] = useState(0);
  const [src, setSrc] = useState<{ url: string; blob: Blob } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const imgEl = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cur = parts[at];

  // The image fetched as a file, so it can be cropped in the browser.
  useEffect(() => {
    if (!cur?.part.url) return;
    let gone = false;
    let url = "";
    setSrc(null);
    setBox(null);
    void fetch(cur.part.url)
      .then((r) => {
        if (!r.ok) throw new Error("Couldn't load the clipping");
        return r.blob();
      })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (gone) URL.revokeObjectURL(url);
        else setSrc({ url, blob });
      })
      .catch((e) => toast.error(errorText(e, "Couldn't load the clipping")));
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cur?.part.url]);

  const point = (e: React.PointerEvent) => {
    const r = imgEl.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  async function use() {
    if (!src || !box || !cur) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(src.blob);
      const sx = Math.round(box.x * bitmap.width);
      const sy = Math.round(box.y * bitmap.height);
      const sw = Math.max(1, Math.round(box.w * bitmap.width));
      const sh = Math.max(1, Math.round(box.h * bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      bitmap.close();
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.92));
      if (!blob) throw new Error("Couldn't crop it");
      await onPick(
        new File([blob], "clipping.jpg", { type: "image/jpeg" }),
        `Photo: ${cur.clip.source_name}`,
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Image from the clipping"
      className="fixed inset-0 z-[70] flex flex-col bg-background"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <Crop className="h-4 w-4 text-primary" />
        <span className="min-w-0 flex-1 font-medium">
          Drag a box over the photo, map or chart to use
        </span>
        <Button size="sm" disabled={!box || busy} onClick={() => void use()}>
          {busy ? "Adding…" : "Use this part"}
        </Button>
        <Button size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {parts.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-border p-1.5" role="tablist">
          {parts.map((p, i) => (
            <button
              key={`${p.part.path}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={`shrink-0 rounded-md border px-2 py-1 text-xs ${i === at ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {p.clip.source_name} · p. {p.part.page}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-3">
        {src ? (
          <div
            className="relative mx-auto w-fit max-w-full cursor-crosshair select-none"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              start.current = point(e);
              setBox(null);
            }}
            onPointerMove={(e) => {
              const s = start.current;
              if (!s) return;
              const p = point(e);
              setBox({
                x: Math.min(s.x, p.x),
                y: Math.min(s.y, p.y),
                w: Math.abs(p.x - s.x),
                h: Math.abs(p.y - s.y),
              });
            }}
            onPointerUp={() => {
              start.current = null;
              setBox((b) => (b && b.w > 0.02 && b.h > 0.02 ? b : null));
            }}
          >
            <img
              ref={imgEl}
              src={src.url}
              alt="Clipping"
              draggable={false}
              className="pointer-events-none block max-h-[75vh] max-w-full bg-white"
            />
            {box && (
              <div
                data-testid="clip-crop-box"
                className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Loading the clipping…</p>
        )}
      </div>
    </div>
  );
}
