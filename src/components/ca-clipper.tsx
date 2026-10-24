// Admin: clipping a day's newspaper. The full PDF (a newspaper, or Sujas) is
// uploaded once; on its pages the editor drags a box around each article
// (more boxes for an article continued elsewhere). Every box saves at once
// and is read by the AI into its own source, then into stories, while the
// editor goes on clipping. Works with a mouse and on phones (one finger
// draws, two fingers move and zoom).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Hand,
  ListChecks,
  Minus,
  Newspaper as NewspaperIcon,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  SquareDashed,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  deleteCaClip,
  deleteCaNewspaper,
  dropCaClipSuggestion,
  getCaClipSuggestions,
  getCaNewspaper,
  listCaNewspapers,
  readCaClip,
  saveCaClip,
  startCaNewspaper,
  suggestCaClips,
  type NewspaperSummary,
} from "@/lib/ca-clips.functions";
import {
  enrichCaItem,
  extractCaSourcePart,
  getCaDay,
  mergeCaDuplicates,
} from "@/lib/current-affairs.functions";
import {
  MAX_PARTS,
  MAX_PDF_MB,
  cleanBox,
  clipPages,
  covered,
  type Clip,
  type ClipBox,
  type SuggestedClip,
} from "@/lib/ca-clips";
import type { OpenPdf } from "@/lib/exam-pdf";
import { supabase } from "@/integrations/supabase/client";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The newspaper just uploaded from this device: no need to download it again.
const localFiles = new Map<string, File>();

// ====================== In the day's sources ======================

export function NewspaperClipping({ date, onChanged }: { date: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCaNewspapers);
  const startFn = useServerFn(startCaNewspaper);
  const deleteFn = useServerFn(deleteCaNewspaper);
  const q = useQuery({
    queryKey: ["caNewspapers", date],
    queryFn: () => listFn({ data: { date } }),
    refetchOnMount: true,
  });
  const [name, setName] = useState("");
  const [official, setOfficial] = useState(false);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["caNewspapers", date] });

  async function upload(file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast.error("Choose the newspaper's PDF");
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      toast.error(`The PDF is over ${MAX_PDF_MB} MB`);
      return;
    }
    const sourceName = name.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 80);
    setBusy("Opening the PDF…");
    let id: string | null = null;
    try {
      const { pdfPageCount } = await import("@/lib/exam-pdf");
      const pages = await pdfPageCount(file);
      const r = await startFn({
        data: { issue_date: date, source_name: sourceName, official, pages, file_size: file.size },
      });
      id = r.newspaper.id;
      setBusy(`Uploading ${Math.max(1, Math.round(file.size / 1048576))} MB…`);
      const { error } = await supabase.storage
        .from("ca-clips")
        .uploadToSignedUrl(r.upload.path, r.upload.token, file, {
          contentType: "application/pdf",
        });
      if (error) throw new Error(error.message);
      localFiles.set(id, file);
      setName("");
      await refresh();
      setOpen(id);
    } catch (e) {
      // A newspaper whose PDF didn't arrive isn't kept.
      if (id) await deleteFn({ data: { id, with_sources: false } }).catch(() => undefined);
      toast.error(errorText(e, "Couldn't upload it"));
    } finally {
      setBusy("");
    }
  }

  const data = q.data;
  return (
    <section
      aria-label="Clip a newspaper"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-start gap-2">
        <Scissors className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="font-semibold">Clip a newspaper</h3>
          <p className="text-sm text-muted-foreground">
            Upload the whole newspaper or Sujas PDF, then drag a box around each article on its
            pages. Each article is read on its own, much more accurately than a whole page.
          </p>
        </div>
      </div>
      {data && !data.ready ? (
        <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
          Newspaper clipping needs a database update: run the latest migration (ca_clips) in Lovable
          or the SQL editor, then reload this page.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <Input
            aria-label="Newspaper name"
            placeholder="Newspaper, e.g. Rajasthan Patrika, Sujas"
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              if (/sujas|dipr/i.test(e.target.value)) setOfficial(true);
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={official}
              onChange={(e) => setOfficial(e.target.checked)}
            />
            Government paper (Sujas)
          </label>
          <label
            className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy || "Upload newspaper PDF"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              aria-label="Newspaper PDF"
              className="hidden"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
        </div>
      )}
      {!!data?.newspapers.length && (
        <ul className="space-y-2" data-testid="newspapers">
          {data.newspapers.map((n) => (
            <NewspaperRow
              key={n.id}
              n={n}
              onOpen={() => setOpen(n.id)}
              onDelete={async () => {
                if (
                  !confirm(
                    `Delete “${n.source_name}” and its ${n.clips} clipping${n.clips === 1 ? "" : "s"}? The articles already read from them stay in the day's sources.`,
                  )
                )
                  return;
                try {
                  await deleteFn({ data: { id: n.id, with_sources: false } });
                  localFiles.delete(n.id);
                  toast.success("Newspaper deleted");
                  await refresh();
                } catch (e) {
                  toast.error(errorText(e, "Couldn't delete it"));
                }
              }}
            />
          ))}
        </ul>
      )}
      {open && (
        <Clipper
          id={open}
          date={date}
          onClose={() => {
            setOpen(null);
            void refresh();
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function NewspaperRow({
  n,
  onOpen,
  onDelete,
}: {
  n: NewspaperSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
      <NewspaperIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 break-words font-medium">{n.source_name}</span>
      {n.official && <Badge tone="good">Official</Badge>}
      <span className="text-xs text-muted-foreground">{n.pages} pages</span>
      <Badge tone="primary">
        {n.clips} article{n.clips === 1 ? "" : "s"}
      </Badge>
      {n.waiting > 0 && <Badge tone="warn">{n.waiting} to read</Badge>}
      {n.failed > 0 && <Badge tone="bad">{n.failed} failed</Badge>}
      {n.file_deleted_at && <Badge tone="muted">PDF removed after 30 days</Badge>}
      <Button size="sm" onClick={onOpen}>
        <Scissors className="mr-1 h-4 w-4" /> {n.clips ? "Go on clipping" : "Clip articles"}
      </Button>
      <Button size="sm" variant="ghost" aria-label={`Delete ${n.source_name}`} onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

// ====================== The clipper ======================

type Gesture =
  | { kind: "draw"; start: { x: number; y: number }; px: { x: number; y: number } }
  | {
      kind: "edit";
      clipId: string;
      part: number;
      corner: "nw" | "ne" | "sw" | "se" | null;
      start: { x: number; y: number };
      box: ClipBox;
    }
  | { kind: "pan"; x: number; y: number; sl: number; st: number }
  | { kind: "pinch"; dist: number; zoom: number }
  | null;

// What undo puts back: a clipping made (delete it), changed (its boxes
// before) or deleted (make it again).
type Undo =
  | { kind: "made"; clipId: string }
  | { kind: "changed"; clipId: string; parts: ClipBox[] }
  | { kind: "deleted"; parts: ClipBox[] };

const PAGE_WIDTH = 2000;
const THUMB_WIDTH = 150;
const ZOOMS = [1, 1.5, 2, 3, 4, 6];
// A clipping still being drawn on (selected) is read after this long.
const SETTLE_MS = 15000;

const boxOf = ({ page, x, y, w, h }: ClipBox): ClipBox => ({ page, x, y, w, h });
const inside = (b: ClipBox, p: { x: number; y: number }) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

const STATUS: Record<Clip["status"], { text: string; tone: "muted" | "warn" | "good" | "bad" }> = {
  new: { text: "Waiting to be read", tone: "warn" },
  changed: { text: "Changed: read again soon", tone: "warn" },
  read: { text: "Read", tone: "good" },
  skipped: { text: "Not news: skipped", tone: "muted" },
  failed: { text: "Couldn't read", tone: "bad" },
};

function Clipper({ id, date, onClose }: { id: string; date: string; onClose: () => void }) {
  const getFn = useServerFn(getCaNewspaper);
  const saveFn = useServerFn(saveCaClip);
  const deleteFn = useServerFn(deleteCaClip);
  const readFn = useServerFn(readCaClip);
  const extractFn = useServerFn(extractCaSourcePart);
  const mergeFn = useServerFn(mergeCaDuplicates);
  const enrichFn = useServerFn(enrichCaItem);
  const dayFn = useServerFn(getCaDay);
  const q = useQuery({
    queryKey: ["caNewspaper", id],
    queryFn: () => getFn({ data: { id } }),
    refetchOnMount: true,
  });

  const [clips, setClips] = useState<Clip[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      setClips(q.data.clips);
      const first = q.data.clips.at(-1)?.parts[0]?.page;
      if (first) setPage(first);
    }
  }, [q.data]);
  const paper = q.data?.newspaper;

  // ---------- The PDF ----------
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  const [pdfState, setPdfState] = useState<string>("Opening the newspaper…");
  useEffect(() => {
    if (!q.data) return;
    const src = localFiles.get(id) ?? q.data.pdf_url;
    if (!src) {
      setPdfState("");
      return;
    }
    let gone = false;
    let doc: OpenPdf | null = null;
    setPdfState(localFiles.has(id) ? "Opening the newspaper…" : "Downloading the newspaper…");
    void import("@/lib/exam-pdf")
      .then((lib) => lib.openPdf(src))
      .then((d) => {
        doc = d;
        if (gone) void d.close();
        else {
          setPdf(d);
          setPdfState("");
        }
      })
      .catch((e) => !gone && setPdfState(errorText(e, "Couldn't open the newspaper")));
    return () => {
      gone = true;
      void doc?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!q.data]);
  const pages = pdf?.pages ?? paper?.pages ?? 0;

  const [page, setPage] = useState(1);
  const [images, setImages] = useState<Record<number, { url: string; w: number; h: number }>>({});
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  // The page shown and the next one, kept drawn; others let go.
  useEffect(() => {
    if (!pdf) return;
    let gone = false;
    const want = [page, page + 1].filter((n) => n >= 1 && n <= pdf.pages);
    void (async () => {
      for (const n of want) {
        if (gone) return;
        if (imagesRef.current[n]) continue;
        try {
          const img = await pdf.pageImage(n, PAGE_WIDTH);
          if (gone) URL.revokeObjectURL(img.url);
          else setImages((cur) => ({ ...cur, [n]: img }));
        } catch (e) {
          if (!gone) toast.error(errorText(e, `Couldn't draw page ${n}`));
        }
      }
    })();
    setImages((cur) => {
      const keep = new Set([page - 1, page, page + 1]);
      const next: typeof cur = {};
      for (const [k, v] of Object.entries(cur)) {
        if (keep.has(Number(k))) next[Number(k)] = v;
        else URL.revokeObjectURL(v.url);
      }
      return next;
    });
    return () => {
      gone = true;
    };
  }, [pdf, page]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => {
    if (!pdf) return;
    let gone = false;
    const made: string[] = [];
    void (async () => {
      for (let n = 1; n <= pdf.pages && !gone; n++) {
        try {
          const t = await pdf.pageImage(n, THUMB_WIDTH);
          made.push(t.url);
          if (!gone) setThumbs((cur) => ({ ...cur, [n]: t.url }));
        } catch {
          // A thumbnail is only a help.
        }
      }
    })();
    return () => {
      gone = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pdf]);

  // ---------- Selection, saving, undo ----------
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState<ClipBox[]>([]);
  const [undo, setUndo] = useState<Undo[]>([]);
  const [panel, setPanel] = useState(false);
  const number = useMemo(() => new Map(clips.map((c, i) => [c.id, i + 1])), [clips]);
  const sel = clips.find((c) => c.id === selected) ?? null;

  const render = useCallback(
    async (box: ClipBox) => {
      if (!pdf) throw new Error("The newspaper isn't open");
      return (await pdf.crop(box.page, box)).data;
    },
    [pdf],
  );
  const put = (c: Clip) =>
    setClips((cur) =>
      cur.some((x) => x.id === c.id) ? cur.map((x) => (x.id === c.id ? c : x)) : [...cur, c],
    );

  // A new clipping from a box, or a box added to the clipping `to`.
  async function addBox(box: ClipBox, to: string | null) {
    const target = to ? clips.find((c) => c.id === to) : null;
    if (target && target.parts.length >= MAX_PARTS) {
      toast.error(`An article can have at most ${MAX_PARTS} parts`);
      return;
    }
    setSaving((s) => [...s, box]);
    try {
      const image = await render(box);
      const parts = target ? [...target.parts.map(boxOf), { ...box, image }] : [{ ...box, image }];
      const c = await saveFn({
        data: { newspaper_id: id, ...(target ? { id: target.id } : {}), parts },
      });
      put(c);
      setUndo((u) => [
        ...u.slice(-30),
        target
          ? { kind: "changed", clipId: c.id, parts: target.parts.map(boxOf) }
          : { kind: "made", clipId: c.id },
      ]);
      setSelected(c.id);
      setAdding(null);
      if (target) toast.success(`Part ${parts.length} added to article ${number.get(c.id)}`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the clipping"));
    } finally {
      setSaving((s) => s.filter((b) => b !== box));
    }
  }

  // New boxes for a clipping: a box as it was keeps its image, a moved or
  // resized one gets a new image.
  // ---------- Suggested articles ----------
  const suggestFn = useServerFn(suggestCaClips);
  const suggestionsFn = useServerFn(getCaClipSuggestions);
  const dropFn = useServerFn(dropCaClipSuggestion);
  const [sugg, setSugg] = useState<Record<string, { at: string; items: SuggestedClip[] }>>({});
  const [suggesting, setSuggesting] = useState<number | null>(null);
  useEffect(() => {
    void suggestionsFn({ data: { newspaper_id: id } })
      .then((v) => setSugg(v ?? {}))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // A page's suggestions not clipped since.
  const suggestedOn = (n: number) =>
    (sugg[String(n)]?.items ?? []).filter(
      (s) =>
        !clips.some((c) => c.parts.some((p) => covered(s.box, p) > 0.5 || covered(p, s.box) > 0.5)),
    );
  async function suggest() {
    if (!pdf) return;
    const n = page;
    setSuggesting(n);
    try {
      const [image, lines] = await Promise.all([
        pdf.crop(n, { x: 0, y: 0, w: 1, h: 1 }, 1800),
        pdf.lines(n).catch(() => []),
      ]);
      const items = await suggestFn({
        data: { newspaper_id: id, page: n, image: image.data, lines },
      });
      setSugg((cur) => ({ ...cur, [String(n)]: { at: new Date().toISOString(), items } }));
      toast.success(
        items.length
          ? `${items.length} ${items.length === 1 ? "article" : "articles"} suggested on page ${n}`
          : `Nothing more worth clipping on page ${n}`,
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't suggest articles"));
    } finally {
      setSuggesting(null);
    }
  }
  async function dropSuggested(s: SuggestedClip) {
    setSugg((cur) => {
      const p = cur[String(s.box.page)];
      return p
        ? { ...cur, [String(s.box.page)]: { ...p, items: p.items.filter((x) => x !== s) } }
        : cur;
    });
    await dropFn({
      data: { newspaper_id: id, page: s.box.page, headline: s.headline },
    }).catch(() => undefined);
  }
  async function clipSuggested(s: SuggestedClip) {
    await addBox(s.box, null);
    await dropSuggested(s);
  }

  async function setParts(clip: Clip, next: ClipBox[], remember = true) {
    const same = (a: ClipBox, b: ClipBox) =>
      a.page === b.page && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    try {
      const parts = await Promise.all(
        next.map(async (b) =>
          clip.parts.some((p) => same(p, b)) ? boxOf(b) : { ...b, image: await render(b) },
        ),
      );
      const c = await saveFn({ data: { newspaper_id: id, id: clip.id, parts } });
      put(c);
      if (remember)
        setUndo((u) => [
          ...u.slice(-30),
          { kind: "changed", clipId: clip.id, parts: clip.parts.map(boxOf) },
        ]);
    } catch (e) {
      put(clip);
      toast.error(errorText(e, "Couldn't save the change"));
    }
  }

  async function remove(clip: Clip, remember = true) {
    if (
      clip.source_id &&
      remember &&
      !confirm(
        `Delete article ${number.get(clip.id)}? Its source and the facts that came only from it go too.`,
      )
    )
      return;
    try {
      await deleteFn({ data: { id: clip.id } });
      setClips((cur) => cur.filter((c) => c.id !== clip.id));
      if (selected === clip.id) setSelected(null);
      if (adding === clip.id) setAdding(null);
      if (remember)
        setUndo((u) => [...u.slice(-30), { kind: "deleted", parts: clip.parts.map(boxOf) }]);
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete it"));
    }
  }

  async function undoLast() {
    const last = undo.at(-1);
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    if (last.kind === "made") {
      const c = clips.find((x) => x.id === last.clipId);
      if (c) await remove(c, false);
    } else if (last.kind === "changed") {
      const c = clips.find((x) => x.id === last.clipId);
      if (c) await setParts(c, last.parts, false);
    } else {
      try {
        const parts = await Promise.all(
          last.parts.map(async (b) => ({ ...b, image: await render(b) })),
        );
        const c = await saveFn({ data: { newspaper_id: id, parts } });
        put(c);
        setSelected(c.id);
      } catch (e) {
        toast.error(errorText(e, "Couldn't undo"));
      }
    }
  }

  // ---------- Reading, in the background ----------
  const [readingId, setReadingId] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, number>>({});
  const readingRef = useRef(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, []);

  async function readOne(clip: Clip) {
    setReadingId(clip.id);
    try {
      const r = await readFn({ data: { id: clip.id } });
      put(r.clip);
      let stories = 0;
      if (r.source)
        for (let part = 0; part < r.source.chunks; part++) {
          const x = await extractFn({ data: { id: r.source.id, part } });
          stories += x.created + x.merged;
        }
      setMade((m) => ({ ...m, [clip.id]: stories }));
    } catch (e) {
      put({ ...clip, status: "failed", error: errorText(e, "Couldn't read it") });
    } finally {
      setReadingId(null);
    }
  }
  const waiting = (c: Clip) => c.status === "new" || c.status === "changed";
  useEffect(() => {
    if (readingRef.current || finishing) return;
    const next = clips.find(
      (c) =>
        waiting(c) &&
        c.id !== adding &&
        (c.id !== selected || Date.now() - Date.parse(c.updated_at) > SETTLE_MS),
    );
    if (!next) return;
    readingRef.current = true;
    void readOne(next).finally(() => {
      readingRef.current = false;
      setTick((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, selected, adding, tick]);

  // Done: every clipping read, the day's duplicates merged and the new
  // stories written.
  const [finishing, setFinishing] = useState<string | null>(null);
  async function finish() {
    setSelected(null);
    setAdding(null);
    setFinishing("Reading the last articles…");
    try {
      while (readingRef.current) await new Promise((r) => setTimeout(r, 300));
      readingRef.current = true;
      for (const c of clips.filter(waiting)) {
        setFinishing(`Reading article ${number.get(c.id)}…`);
        await readOne(c);
      }
      if (clips.some((c) => made[c.id] || c.status === "read")) {
        setFinishing("Looking for stories that are the same news…");
        await mergeFn({ data: { date } }).catch(() => undefined);
        const fresh = await dayFn({ data: { date } });
        const todo = fresh.items.filter((i) => i.needs_enrich && i.status === "included");
        for (const [n, item] of todo.entries()) {
          setFinishing(`Writing the stories ${n + 1} of ${todo.length}…`);
          await enrichFn({ data: { id: item.id } }).catch((e) =>
            toast.error(`${item.headline.slice(0, 50)}: ${errorText(e, "failed")}`),
          );
        }
      }
      toast.success("Clipping done");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't finish"));
    } finally {
      readingRef.current = false;
      setFinishing(null);
    }
  }

  // ---------- Zoom, pan and drawing ----------
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(1);
  const [mode, setMode] = useState<"draw" | "move">("draw");
  const anchor = useRef<{ fx: number; fy: number; ox: number; oy: number } | null>(null);
  const zoomAt = (z: number, clientX?: number, clientY?: number) => {
    const s = scroller.current;
    const el = sheet.current;
    const next = Math.min(6, Math.max(1, Math.round(z * 100) / 100));
    if (s && el) {
      const r = s.getBoundingClientRect();
      const ox = (clientX ?? r.left + r.width / 2) - r.left;
      const oy = (clientY ?? r.top + r.height / 2) - r.top;
      anchor.current = {
        fx: (s.scrollLeft + ox) / el.offsetWidth,
        fy: (s.scrollTop + oy) / el.offsetHeight,
        ox,
        oy,
      };
    }
    setZoomState(next);
  };
  useLayoutEffect(() => {
    const s = scroller.current;
    const el = sheet.current;
    const a = anchor.current;
    if (!s || !el || !a) return;
    s.scrollLeft = a.fx * el.offsetWidth - a.ox;
    s.scrollTop = a.fy * el.offsetHeight - a.oy;
    anchor.current = null;
  }, [zoom]);
  // Ctrl + wheel (and a touchpad pinch) zooms the page, not the browser.
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
    };
    s.addEventListener("wheel", onWheel, { passive: false });
    return () => s.removeEventListener("wheel", onWheel);
  });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(null);
  const [draft, setDraft] = useState<ClipBox | null>(null);
  const [live, setLive] = useState<{ clipId: string; part: number; box: ClipBox } | null>(null);
  const at = (e: { clientX: number; clientY: number }) => {
    const r = sheet.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };
  const canDraw = !!pdf && !finishing;

  function onDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      setDraft(null);
      setLive(null);
      gesture.current = { kind: "pinch", dist: pinchState().dist, zoom };
      return;
    }
    if (pointers.current.size > 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (mode === "move") {
      // A finger moves the page by itself (touch-action); a mouse drags it.
      if (e.pointerType === "mouse" && scroller.current)
        gesture.current = {
          kind: "pan",
          x: e.clientX,
          y: e.clientY,
          sl: scroller.current.scrollLeft,
          st: scroller.current.scrollTop,
        };
      return;
    }
    if (!canDraw) return;
    const p = at(e);
    const t = e.target as HTMLElement;
    const corner = t.dataset.corner as "nw" | "ne" | "sw" | "se" | undefined;
    const partAttr = t.closest<HTMLElement>("[data-part]")?.dataset.part;
    if (sel && partAttr !== undefined && t.closest(`[data-clip="${sel.id}"]`)) {
      const part = Number(partAttr);
      gesture.current = {
        kind: "edit",
        clipId: sel.id,
        part,
        corner: corner ?? null,
        start: p,
        box: boxOf(sel.parts[part]),
      };
      return;
    }
    gesture.current = { kind: "draw", start: p, px: { x: e.clientX, y: e.clientY } };
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size === 2) {
      const { dist, mid } = pinchState();
      zoomAt((g.zoom * dist) / Math.max(1, g.dist), mid.x, mid.y);
    } else if (g.kind === "pan" && scroller.current) {
      scroller.current.scrollLeft = g.sl - (e.clientX - g.x);
      scroller.current.scrollTop = g.st - (e.clientY - g.y);
    } else if (g.kind === "draw") {
      const p = at(e);
      setDraft({ page, x: g.start.x, y: g.start.y, w: p.x - g.start.x, h: p.y - g.start.y });
    } else if (g.kind === "edit") {
      const p = at(e);
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      const b = g.box;
      let box: ClipBox;
      if (!g.corner) box = { ...b, x: b.x + dx, y: b.y + dy };
      else {
        const l = g.corner.includes("w") ? b.x + dx : b.x;
        const r = g.corner.includes("e") ? b.x + b.w + dx : b.x + b.w;
        const t = g.corner.includes("n") ? b.y + dy : b.y;
        const bt = g.corner.includes("s") ? b.y + b.h + dy : b.y + b.h;
        box = { ...b, x: l, y: t, w: r - l, h: bt - t };
      }
      if (!g.corner) {
        box.x = Math.min(1 - box.w, Math.max(0, box.x));
        box.y = Math.min(1 - box.h, Math.max(0, box.y));
      }
      setLive({ clipId: g.clipId, part: g.part, box });
    }
  }

  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // One finger of a pinch lifted: nothing more until both are off.
      if (g?.kind === "pinch") gesture.current = null;
      return;
    }
    gesture.current = null;
    if (!g) return;
    if (g.kind === "draw") {
      setDraft(null);
      const moved = Math.hypot(e.clientX - g.px.x, e.clientY - g.px.y);
      const p = at(e);
      if (moved < 8) {
        // A tap: picks the clipping under it (or none).
        const hit = clips
          .flatMap((c) => c.parts.map((part) => ({ c, part })))
          .filter(({ part }) => part.page === page && inside(part, p))
          .sort((a, b) => a.part.w * a.part.h - b.part.w * b.part.h)[0];
        if (!adding) setSelected(hit?.c.id ?? null);
        return;
      }
      const box = cleanBox(
        { page, x: g.start.x, y: g.start.y, w: p.x - g.start.x, h: p.y - g.start.y },
        pages,
      );
      if (!box) {
        toast.error("That box is too small: drag around the whole article");
        return;
      }
      void addBox(box, adding);
    } else if (g.kind === "edit") {
      const l = live;
      setLive(null);
      const clip = clips.find((c) => c.id === g.clipId);
      if (!l || !clip) return;
      const box = cleanBox(l.box, pages);
      if (!box || JSON.stringify(box) === JSON.stringify(boxOf(clip.parts[l.part]))) return;
      const next = clip.parts.map((p, i) => (i === l.part ? box : boxOf(p)));
      // Shown at once; saved with its new image.
      put({ ...clip, parts: clip.parts.map((p, i) => (i === l.part ? { ...p, ...box } : p)) });
      void setParts(clip, next);
    }
  }

  // ---------- Keys ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undoLast();
      } else if (e.key === "ArrowRight" || e.key === "PageDown")
        setPage((p) => Math.min(pages, p + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setPage((p) => Math.max(1, p - 1));
      else if (e.key === "Escape") {
        if (adding) setAdding(null);
        else setSelected(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) void remove(sel);
      else if (e.key === "+" || e.key === "=") zoomAt(zoom * 1.25);
      else if (e.key === "-") zoomAt(zoom / 1.25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Showing it ----------
  const img = images[page];
  const onPage = clips
    .flatMap((c) =>
      c.parts.map((p, i) => ({
        c,
        i,
        p: live && live.clipId === c.id && live.part === i ? { ...p, ...live.box } : p,
      })),
    )
    .filter(({ p }) => p.page === page);
  const perPage = (n: number) => clips.filter((c) => c.parts.some((p) => p.page === n)).length;
  const toRead = clips.filter(waiting).length;
  const go = (n: number) => setPage(Math.min(Math.max(1, n), Math.max(1, pages)));

  if (q.isLoading || !paper)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        {q.error ? (
          <div className="space-y-2 text-center">
            <p className="text-sm text-destructive">{errorText(q.error, "Couldn't open it")}</p>
            <Button variant="outline" onClick={onClose}>
              Back
            </Button>
          </div>
        ) : (
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
        )}
      </div>
    );

  const sidePanel = (
    <ClipPanel
      clips={clips}
      number={number}
      selected={sel}
      adding={adding}
      readingId={readingId}
      made={made}
      onPick={(c) => {
        setSelected(c.id);
        if (c.parts[0]) go(c.parts[0].page);
        setPanel(false);
      }}
      onAddPart={(c) => {
        setAdding(c.id);
        setPanel(false);
      }}
      onCancelAdd={() => setAdding(null)}
      onRemovePart={(c, i) => void setParts(c, c.parts.filter((_, k) => k !== i).map(boxOf))}
      onRead={(c) => {
        if (readingRef.current) {
          toast.info("Another article is being read: this one is next");
          setSelected(null);
          return;
        }
        readingRef.current = true;
        void readOne(c).finally(() => {
          readingRef.current = false;
        });
      }}
      onDelete={(c) => void remove(c)}
      onGo={(n) => go(n)}
    />
  );

  return (
    <div
      role="dialog"
      aria-label={`Clip ${paper.source_name}`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5 sm:gap-2 sm:px-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close"
          disabled={!!finishing}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{paper.source_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {clips.length} article{clips.length === 1 ? "" : "s"}
            {toRead ? ` · ${toRead} to read` : ""}
            {readingId ? ` · reading article ${number.get(readingId)}…` : ""}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs tabular-nums" aria-live="polite">
            Page {page} / {pages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => go(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => zoomAt(ZOOMS.filter((z) => z < zoom).at(-1) ?? 1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="min-w-[3rem] text-xs tabular-nums text-muted-foreground"
            title="Fit the page"
            onClick={() => zoomAt(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Zoom in"
            disabled={zoom >= 6}
            onClick={() => zoomAt(ZOOMS.find((z) => z > zoom) ?? 6)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div
          className="inline-flex rounded-lg border border-border p-0.5"
          role="radiogroup"
          aria-label="Tool"
        >
          {(
            [
              ["draw", SquareDashed, "Clip"],
              ["move", Hand, "Move"],
            ] as const
          ).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          aria-label="Suggest articles on this page"
          title="Suggest articles worth clipping on this page"
          disabled={!pdf || suggesting !== null || !!finishing}
          onClick={() => void suggest()}
        >
          {suggesting !== null ? (
            <RefreshCw className="h-4 w-4 animate-spin sm:mr-1" />
          ) : (
            <Sparkles className="h-4 w-4 sm:mr-1" />
          )}
          <span className="hidden sm:inline">
            {suggesting !== null ? `Looking at page ${suggesting}…` : "Suggest"}
          </span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Undo"
          disabled={!undo.length}
          onClick={() => void undoLast()}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => void finish()} disabled={!!finishing}>
          {finishing ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ListChecks className="mr-1 h-4 w-4" />
          )}
          Done
        </Button>
      </div>

      {(finishing || adding || pdfState || (!q.data?.pdf_url && !localFiles.has(id))) && (
        <div
          role="status"
          className="border-b border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-sm"
        >
          {finishing ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> {finishing}
            </span>
          ) : adding ? (
            <span className="flex flex-wrap items-center gap-2">
              Draw the next part of article {number.get(adding)} (go to its page first if it
              continues on another page).
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </span>
          ) : pdfState ? (
            <span className="inline-flex items-center gap-2">
              {/…$/.test(pdfState) && <RefreshCw className="h-4 w-4 animate-spin" />} {pdfState}
            </span>
          ) : (
            "This newspaper's PDF was removed after 30 days: its clippings are below."
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Page thumbnails (laptops) */}
        <nav
          aria-label="Pages"
          className="hidden w-28 shrink-0 overflow-y-auto border-r border-border p-2 md:block"
        >
          <PageThumbs pages={pages} page={page} thumbs={thumbs} perPage={perPage} onGo={go} />
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Page strip (phones) */}
          <nav
            aria-label="Pages strip"
            className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border p-1.5 md:hidden"
          >
            <PageThumbs
              pages={pages}
              page={page}
              thumbs={thumbs}
              perPage={perPage}
              onGo={go}
              small
            />
          </nav>
          <div
            ref={scroller}
            data-testid="clip-scroller"
            className="relative min-h-0 flex-1 overflow-auto bg-muted/50"
          >
            {clips.length === 0 && !finishing && pdf && !suggestedOn(page).length && (
              <p className="pointer-events-none absolute left-1/2 top-3 z-10 w-[min(92%,30rem)] -translate-x-1/2 rounded-xl bg-background/95 p-3 text-center text-sm shadow">
                Drag a box around an article to clip it. Zoom with + / −, Ctrl + wheel or two
                fingers; two fingers (or the Move tool) move the page.
              </p>
            )}
            <div
              ref={sheet}
              data-testid="clip-page"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className={`relative mx-auto select-none bg-white shadow ${mode === "draw" && canDraw ? "cursor-crosshair" : "cursor-grab"}`}
              style={{
                width: `${zoom * 100}%`,
                maxWidth: zoom === 1 ? "min(100%, 900px)" : undefined,
                aspectRatio: img ? `${img.w} / ${img.h}` : "0.62",
                touchAction: mode === "draw" ? "none" : "pan-x pan-y",
              }}
            >
              {img ? (
                <img
                  src={img.url}
                  alt={`Page ${page}`}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              ) : (
                pdf && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )
              )}
              {onPage.map(({ c, i, p }) => {
                const isSel = c.id === selected;
                const isAdd = c.id === adding;
                return (
                  <div
                    key={`${c.id}-${i}`}
                    data-clip={c.id}
                    data-part={i}
                    aria-label={`Article ${number.get(c.id)}${c.parts.length > 1 ? `, part ${i + 1}` : ""}`}
                    className={`absolute border-2 ${isSel || isAdd ? "border-primary bg-primary/15" : c.status === "failed" ? "border-red-500 bg-red-500/10" : c.status === "skipped" ? "border-muted-foreground/60 bg-muted-foreground/10" : "border-emerald-600/80 bg-emerald-500/10"} ${isSel && mode === "draw" ? "cursor-move" : ""}`}
                    style={{
                      left: `${p.x * 100}%`,
                      top: `${p.y * 100}%`,
                      width: `${p.w * 100}%`,
                      height: `${p.h * 100}%`,
                    }}
                  >
                    <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-black/70 px-1.5 text-xs font-semibold text-white">
                      {number.get(c.id)}
                      {c.parts.length > 1 ? `.${i + 1}` : ""}
                      {readingId === c.id ? " …" : ""}
                    </span>
                    {isSel &&
                      mode === "draw" &&
                      (["nw", "ne", "sw", "se"] as const).map((k) => (
                        <span
                          key={k}
                          data-corner={k}
                          className={`absolute h-4 w-4 rounded-full border-2 border-white bg-primary shadow ${k.includes("n") ? "-top-2" : "-bottom-2"} ${k.includes("w") ? "-left-2" : "-right-2"} ${k === "nw" || k === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                        />
                      ))}
                  </div>
                );
              })}
              {suggestedOn(page).map((s) => (
                <div
                  key={`s-${s.headline}`}
                  data-suggested={s.headline}
                  className="pointer-events-none absolute border-2 border-dashed border-amber-500 bg-amber-400/10"
                  style={{
                    left: `${s.box.x * 100}%`,
                    top: `${s.box.y * 100}%`,
                    width: `${s.box.w * 100}%`,
                    height: `${s.box.h * 100}%`,
                  }}
                >
                  <div
                    className={`pointer-events-auto absolute left-0 flex max-w-full items-center gap-1 bg-amber-500 px-1 py-0.5 text-xs text-white shadow ${s.box.y > 0.03 ? "top-0 -translate-y-full rounded-t" : "top-0 rounded-br"}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    title={s.why}
                  >
                    <span className="truncate">
                      {"★".repeat(s.importance)} {s.headline}
                    </span>
                    <button
                      type="button"
                      aria-label={`Clip ${s.headline}`}
                      disabled={!canDraw}
                      onClick={() => void clipSuggested(s)}
                      className="shrink-0 rounded bg-white/90 px-1.5 font-semibold text-amber-700"
                    >
                      Clip
                    </button>
                    <button
                      type="button"
                      aria-label={`Not this: ${s.headline}`}
                      onClick={() => void dropSuggested(s)}
                      className="shrink-0 rounded px-0.5 hover:bg-white/20"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {[...saving.filter((b) => b.page === page), ...(draft ? [draft] : [])].map((b, k) => {
                const n = cleanBox(b, pages) ?? {
                  ...b,
                  w: Math.abs(b.w),
                  h: Math.abs(b.h),
                  x: Math.min(b.x, b.x + b.w),
                  y: Math.min(b.y, b.y + b.h),
                };
                return (
                  <div
                    key={`d${k}`}
                    className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                    style={{
                      left: `${n.x * 100}%`,
                      top: `${n.y * 100}%`,
                      width: `${n.w * 100}%`,
                      height: `${n.h * 100}%`,
                    }}
                  >
                    {draft !== b && (
                      <span className="absolute left-0 top-0 bg-primary px-1 text-xs text-primary-foreground">
                        Saving…
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Phones: the clippings in a sheet */}
          <div className="border-t border-border p-2 md:hidden">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setPanel(true)}>
              <ListChecks className="mr-1 h-4 w-4" />
              {sel
                ? `Article ${number.get(sel.id)}: ${STATUS[sel.status].text}`
                : `Articles (${clips.length})`}
            </Button>
          </div>
        </div>

        {/* Laptops: the clippings beside the page */}
        <aside
          aria-label="Articles"
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-border p-3 md:block"
        >
          {sidePanel}
        </aside>
      </div>

      {panel && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40 md:hidden"
          onClick={() => setPanel(false)}
        >
          <div
            role="dialog"
            aria-label="Articles list"
            className="max-h-[75vh] overflow-y-auto rounded-t-2xl bg-background p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Articles</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Close list"
                onClick={() => setPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidePanel}
          </div>
        </div>
      )}
    </div>
  );
}

function PageThumbs({
  pages,
  page,
  thumbs,
  perPage,
  onGo,
  small,
}: {
  pages: number;
  page: number;
  thumbs: Record<number, string>;
  perPage: (n: number) => number;
  onGo: (n: number) => void;
  small?: boolean;
}) {
  return (
    <>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => {
        const count = perPage(n);
        return (
          <button
            key={n}
            type="button"
            aria-label={`Page ${n}${count ? `, ${count} article${count === 1 ? "" : "s"}` : ""}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onGo(n)}
            className={`relative block shrink-0 overflow-hidden rounded border-2 bg-white ${n === page ? "border-primary" : "border-transparent"} ${small ? "h-14 w-10" : "mb-2 w-full"}`}
          >
            {thumbs[n] ? (
              <img src={thumbs[n]} alt="" className="block w-full" />
            ) : (
              <span className={`block bg-muted ${small ? "h-full" : "aspect-[0.62]"}`} />
            )}
            <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[10px] text-white">
              {n}
            </span>
            {count > 0 && (
              <span className="absolute right-0 top-0 rounded-bl bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function ClipPanel({
  clips,
  number,
  selected,
  adding,
  readingId,
  made,
  onPick,
  onAddPart,
  onCancelAdd,
  onRemovePart,
  onRead,
  onDelete,
  onGo,
}: {
  clips: Clip[];
  number: Map<string, number>;
  selected: Clip | null;
  adding: string | null;
  readingId: string | null;
  made: Record<string, number>;
  onPick: (c: Clip) => void;
  onAddPart: (c: Clip) => void;
  onCancelAdd: () => void;
  onRemovePart: (c: Clip, i: number) => void;
  onRead: (c: Clip) => void;
  onDelete: (c: Clip) => void;
  onGo: (page: number) => void;
}) {
  const state = (c: Clip) =>
    readingId === c.id
      ? { text: "Reading…", tone: "primary" as const }
      : c.status === "read" && made[c.id] !== undefined
        ? {
            text: `Read · ${made[c.id]} stor${made[c.id] === 1 ? "y" : "ies"}`,
            tone: "good" as const,
          }
        : STATUS[c.status];
  return (
    <div className="space-y-3">
      {selected && (
        <section
          aria-label="Selected article"
          className="space-y-2 rounded-xl border border-primary/50 bg-primary/5 p-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Article {number.get(selected.id)}</span>
            <span className="text-xs text-muted-foreground">{clipPages(selected.parts)}</span>
            <Badge tone={state(selected).tone}>{state(selected).text}</Badge>
          </div>
          {selected.headline && <p className="break-words font-medium">{selected.headline}</p>}
          {selected.status === "failed" && selected.error && (
            <p className="text-xs text-destructive">{selected.error}</p>
          )}
          <ol className="grid grid-cols-3 gap-1.5">
            {selected.parts.map((p, i) => (
              <li key={`${p.path}-${i}`} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => onGo(p.page)}
                  className="block w-full overflow-hidden rounded border border-border bg-white"
                  title={`Go to page ${p.page}`}
                >
                  {p.url ? (
                    <img
                      src={p.url}
                      alt={`Part ${i + 1}`}
                      className="block max-h-24 w-full object-contain"
                    />
                  ) : (
                    <span className="block h-12 bg-muted" />
                  )}
                </button>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>p. {p.page}</span>
                  {selected.parts.length > 1 && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => onRemovePart(selected, i)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5">
            {adding === selected.id ? (
              <Button size="sm" variant="outline" onClick={onCancelAdd}>
                Cancel adding
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={selected.parts.length >= MAX_PARTS}
                onClick={() => onAddPart(selected)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add a part
              </Button>
            )}
            {selected.status !== "read" &&
              selected.status !== "skipped" &&
              readingId !== selected.id && (
                <Button size="sm" variant="outline" onClick={() => onRead(selected)}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />{" "}
                  {selected.status === "failed" ? "Try again" : "Read now"}
                </Button>
              )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete article ${number.get(selected.id)}`}
              onClick={() => onDelete(selected)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag the box or its corners to change it. An article that continues on another page: Add
            a part, then draw it there.
          </p>
        </section>
      )}
      {clips.length ? (
        <ol className="space-y-1" data-testid="clips">
          {clips.map((c) => {
            const s = state(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted ${selected?.id === c.id ? "bg-muted" : ""}`}
                >
                  <span className="w-6 shrink-0 font-semibold tabular-nums">
                    {number.get(c.id)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {c.headline || (
                        <span className="text-muted-foreground">{clipPages(c.parts)}</span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      {c.headline && clipPages(c.parts)}
                      <Badge tone={s.tone}>{s.text}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No articles clipped yet.</p>
      )}
    </div>
  );
}
