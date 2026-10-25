// Admin: notes books. One book per subject section and stage (Prelims or
// Mains), following the subject's master outline. Each book's cover is
// designed here like the magazine's (six designs, colours, photos, text),
// and the front pages' text is edited here: the preamble, the edition page,
// how to use the notes and the sources. Hindi and English print separately;
// both previews are here.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, ImagePlus, Plus, Printer, RefreshCw, Trash2, X } from "lucide-react";
import {
  createNotesBook,
  deleteNotesBook,
  getNotesBook,
  listNotesBooks,
  previewNotesBook,
  saveNotesBook,
} from "@/lib/notes-books.functions";
import { uploadCaCoverPhoto } from "@/lib/current-affairs.functions";
import {
  DEFAULT_COLORS,
  DEFAULT_TEXT,
  defaultFront,
  MAX_FEATURES,
  NOTES_DESIGNS,
  NOTES_OUTLINES,
  type NotesCover,
  type NotesFront,
  type NotesStage,
} from "@/lib/notes-books";
import type { CoverPhoto } from "@/lib/ca-covers";
import type { Bi } from "@/lib/current-affairs";
import { subjectName } from "@/lib/exam-papers";
import { prepareImage, toBase64 } from "@/lib/ca-image-file";
import { CoverPreview } from "@/components/ca-cover-designer";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Lang = "en" | "hi";
const STAGE_NAME: Record<NotesStage, string> = { prelims: "Prelims", mains: "Mains" };

export function NotesBooks() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? <BookView id={open} onBack={() => setOpen(null)} /> : <BookList onOpen={setOpen} />;
}

// ====================== The list ======================

function BookList({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotesBooks);
  const createFn = useServerFn(createNotesBook);
  const q = useQuery({ queryKey: ["notesBooks"], queryFn: () => listFn() });
  const [section, setSection] = useState("");
  const [stage, setStage] = useState<NotesStage>("prelims");
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const data = q.data!;
  if (!data.ready)
    return (
      <p className="rounded-2xl border border-amber-400/60 bg-amber-500/10 p-4 text-sm">
        Notes books need a database update: run the latest migration (notes_books) in Lovable or the
        SQL editor.
      </p>
    );
  const taken = new Set(data.books.map((b) => `${b.section}|${b.stage}`));
  const free = data.sections.filter((s) => !taken.has(`${s.section}|${stage}`));
  async function create() {
    if (!section) return;
    setBusy(true);
    try {
      const b = await createFn({ data: { section, stage } });
      await qc.invalidateQueries({ queryKey: ["notesBooks"] });
      toast.success("Book made");
      onOpen(b.id);
    } catch (e) {
      toast.error(errorText(e, "Couldn't make it"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        One book per subject and stage, following the subject's master outline. Design each book's
        cover and edit its front pages here; the contents, syllabus coverage and “What the exam
        asks” pages are made from the outline and the linked past questions.
      </p>
      <section
        aria-label="New book"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4"
      >
        <label className="space-y-1 text-sm">
          <span className="font-medium">Subject</span>
          <select
            aria-label="Subject"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="block h-9 min-w-[14rem] rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Choose a subject…</option>
            {free.map((s) => (
              <option key={s.section} value={s.section}>
                {s.section} ({s.topics} topics)
              </option>
            ))}
          </select>
        </label>
        <div
          role="radiogroup"
          aria-label="Stage"
          className="inline-flex rounded-lg border border-border p-0.5 text-sm"
        >
          {(["prelims", "mains"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={stage === s}
              onClick={() => {
                setStage(s);
                setSection("");
              }}
              className={`rounded-md px-3 py-1.5 ${stage === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {STAGE_NAME[s]}
            </button>
          ))}
        </div>
        <Button onClick={() => void create()} disabled={!section || busy}>
          <Plus className="mr-1 h-4 w-4" /> Make the book
        </Button>
        {!data.sections.length && (
          <p className="basis-full text-xs text-muted-foreground">
            Make a subject's master outline first (Master outlines tab): a book follows it.
          </p>
        )}
      </section>
      {data.books.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="books">
          {data.books.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpen(b.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:bg-muted/50"
              >
                <span
                  className="flex h-14 w-10 flex-none items-end rounded-md p-1 text-[9px] font-bold text-white"
                  style={{ background: b.color }}
                  aria-hidden
                >
                  <BookOpen className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{b.section}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1 text-xs">
                    <Badge tone={b.stage === "mains" ? "muted" : "primary"}>
                      {STAGE_NAME[b.stage]}
                    </Badge>
                    <span className="text-muted-foreground">
                      {NOTES_DESIGNS.find((d) => d.id === b.design)?.name} cover
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No books yet.
        </p>
      )}
    </div>
  );
}

// ====================== One book ======================

// A value that settles: the preview waits until typing stops.
function useSettled<T>(value: T, ms = 600): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function BookView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getNotesBook);
  const saveFn = useServerFn(saveNotesBook);
  const deleteFn = useServerFn(deleteNotesBook);
  const q = useQuery({ queryKey: ["notesBook", id], queryFn: () => getFn({ data: { id } }) });
  const [cover, setCover] = useState<NotesCover | null>(null);
  const [front, setFront] = useState<NotesFront | null>(null);
  // Bumped to reset the text boxes (after Discard).
  const [resetKey, setResetKey] = useState(0);
  const [tab, setTab] = useState<"cover" | "front">("cover");
  const [saving, setSaving] = useState(false);
  const book = q.data;
  useEffect(() => {
    if (book && !cover) {
      setCover(book.cover);
      setFront(book.front);
    }
  }, [book, cover]);
  const dirty =
    !!book &&
    !!cover &&
    !!front &&
    (JSON.stringify(cover) !== JSON.stringify(book.cover) ||
      JSON.stringify(front) !== JSON.stringify(book.front));
  // A warning before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (q.isLoading || (book && !cover))
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !book || !cover || !front)
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All books
        </Button>
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load it")}</p>
      </div>
    );

  async function save() {
    setSaving(true);
    try {
      const saved = await saveFn({ data: { id, cover: cover!, front: front! } });
      qc.setQueryData(["notesBook", id], saved);
      setCover(saved.cover);
      setFront(saved.front);
      await qc.invalidateQueries({ queryKey: ["notesBooks"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }
  function discard() {
    setCover(book!.cover);
    setFront(book!.front);
    setResetKey((k) => k + 1);
  }
  const back = () => {
    if (dirty && !confirm("Leave without saving your changes?")) return;
    onBack();
  };

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All books
        </Button>
        <h2 className="text-lg font-semibold">
          {book.section} · {STAGE_NAME[book.stage]} notes
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          aria-label="Delete book"
          onClick={() => {
            if (
              !confirm(
                `Delete the ${STAGE_NAME[book.stage]} book of ${book.section}? Its cover and front pages' text are lost.`,
              )
            )
              return;
            void deleteFn({ data: { id } })
              .then(async () => {
                toast.success("Book deleted");
                await qc.invalidateQueries({ queryKey: ["notesBooks"] });
                onBack();
              })
              .catch((e) => toast.error(errorText(e, "Couldn't delete it")));
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div
        role="tablist"
        aria-label="Book"
        className="inline-flex rounded-lg border border-border p-0.5 text-sm"
      >
        {(
          [
            ["cover", "Cover"],
            ["front", "Front pages"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "cover" ? (
        <CoverEditor
          key={`c${resetKey}`}
          id={id}
          section={book.section}
          stage={book.stage}
          cover={cover}
          onChange={setCover}
        />
      ) : (
        <FrontEditor
          key={`f${resetKey}`}
          id={id}
          stage={book.stage}
          cover={cover}
          front={front}
          onChange={setFront}
        />
      )}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur transition-transform ${dirty ? "translate-y-0" : "translate-y-full"}`}
        aria-hidden={!dirty}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={discard}
            disabled={saving}
            tabIndex={dirty ? 0 : -1}
          >
            Discard
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving} tabIndex={dirty ? 0 : -1}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ====================== Shared fields ======================

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="radiogroup" aria-label="Preview language" className="flex gap-1">
      {(["hi", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => onChange(l)}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${lang === l ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          {l === "hi" ? "हिंदी" : "English"}
        </button>
      ))}
    </div>
  );
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4" aria-label={title}>
      <h3 className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          {n}
        </span>
        {title}
      </h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

// A Hindi and an English field side by side.
function BiField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: Bi;
  onChange: (v: Bi) => void;
  placeholder?: Bi;
  rows?: number;
}) {
  const Field = rows ? Textarea : Input;
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["hi", "en"] as const).map((l) => (
          <Field
            key={l}
            aria-label={`${label} (${l === "hi" ? "Hindi" : "English"})`}
            lang={l}
            rows={rows}
            value={value[l]}
            placeholder={placeholder?.[l] || (l === "hi" ? "हिंदी" : "English")}
            onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
              onChange({ ...value, [l]: e.target.value })
            }
          />
        ))}
      </div>
    </div>
  );
}

const toLines = (xs: Bi[], l: Lang) => xs.map((x) => x[l]).join("\n");
const fromLines = (hi: string, en: string): Bi[] => {
  const a = hi.split("\n");
  const b = en.split("\n");
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({
    hi: (a[i] ?? "").trim(),
    en: (b[i] ?? "").trim(),
  })).filter((x) => x.hi || x.en);
};

// A list, one item a line, the Hindi and English lines in the same order.
function BiLines({
  label,
  value,
  onChange,
  max,
  placeholder,
}: {
  label: string;
  value: Bi[];
  onChange: (v: Bi[]) => void;
  max?: number;
  placeholder?: Bi[];
}) {
  const [hi, setHi] = useState(() => toLines(value, "hi"));
  const [en, setEn] = useState(() => toLines(value, "en"));
  const set = (h: string, e: string) => {
    setHi(h);
    setEn(e);
    onChange(fromLines(h, e).slice(0, max ?? 99));
  };
  const n = fromLines(hi, en).length;
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <p className="text-xs text-muted-foreground">
        One a line; the Hindi and English lines in the same order.
        {max ? ` Up to ${max}.` : ""}
        {max && n > max ? (
          <span className="text-destructive"> Only the first {max} are used.</span>
        ) : null}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          aria-label={`${label} (Hindi)`}
          lang="hi"
          rows={Math.max(3, n + 1)}
          value={hi}
          placeholder={placeholder ? toLines(placeholder, "hi") : ""}
          onChange={(e) => set(e.target.value, en)}
        />
        <Textarea
          aria-label={`${label} (English)`}
          rows={Math.max(3, n + 1)}
          value={en}
          placeholder={placeholder ? toLines(placeholder, "en") : ""}
          onChange={(e) => set(hi, e.target.value)}
        />
      </div>
    </div>
  );
}

function useUpload() {
  const fn = useServerFn(uploadCaCoverPhoto);
  return async (file: File): Promise<CoverPhoto> => {
    const img = await prepareImage(file, 2400);
    const { url, path } = await fn({
      data: { contentType: img.type as "image/jpeg", base64: await toBase64(img.bytes) },
    });
    return { url, path };
  };
}

function PhotoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CoverPhoto | null;
  onChange: (p: CoverPhoto | null) => void;
}) {
  const upload = useUpload();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <img
          src={value.url}
          alt=""
          className="h-16 w-24 rounded-md border border-border object-cover"
        />
      ) : (
        <span className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          No photo
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label={label}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await upload(f));
          } catch (err) {
            toast.error(errorText(err, "Couldn't upload it"));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        <ImagePlus className="mr-1 h-4 w-4" />{" "}
        {busy ? "Uploading…" : value ? "Change photo" : label}
      </Button>
      {value && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange(null)}
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// The preview, kept beside the form on wide screens.
function Preview({
  id,
  parts,
  cover,
  front,
  tall,
}: {
  id: string;
  parts: string[];
  cover: NotesCover;
  front?: NotesFront;
  tall?: boolean;
}) {
  const fn = useServerFn(previewNotesBook);
  const [lang, setLang] = useState<Lang>("hi");
  const args = useSettled({ cover, front, lang });
  const q = useQuery({
    queryKey: ["notesPreview", id, parts.join(","), args],
    queryFn: () =>
      fn({
        data: {
          id,
          lang: args.lang,
          parts: parts as never,
          cover: args.cover as never,
          ...(args.front ? { front: args.front as never } : {}),
        },
      }),
    placeholderData: (prev) => prev,
  });
  async function print() {
    try {
      const { html } = await fn({
        data: { id, lang, cover: cover as never, ...(front ? { front: front as never } : {}) },
      });
      const w = window.open("", "_blank");
      if (!w) return toast.error("Allow pop-ups to open the print view");
      w.document.write(html);
      w.document.close();
      w.onload = () => setTimeout(() => w.print(), 400);
    } catch (e) {
      toast.error(errorText(e, "Couldn't open it"));
    }
  }
  return (
    <div className="min-w-0 space-y-2 lg:sticky lg:top-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Preview</span>
        {q.isFetching && (
          <RefreshCw
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-label="Updating"
          />
        )}
        <span className="ml-auto" />
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      {q.error ? (
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't show it")}</p>
      ) : q.data ? (
        tall ? (
          <PagesPreview html={q.data.html} />
        ) : (
          <CoverPreview
            html={q.data.html}
            label={`Cover preview (${lang === "hi" ? "Hindi" : "English"})`}
          />
        )
      ) : (
        <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
      )}
      <Button size="sm" variant="outline" onClick={() => void print()}>
        <Printer className="mr-1 h-4 w-4" /> Print view ({lang === "hi" ? "Hindi" : "English"} cover
        and front pages)
      </Button>
    </div>
  );
}

// Several pages, scaled to the box's width, scrolled inside a tall box.
function PagesPreview({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [w, setW] = useState(300);
  const [h, setH] = useState(3000);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = w / 830;
  return (
    <div
      ref={box}
      className="h-[75vh] w-full overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-[#e5e7eb]"
    >
      <div style={{ height: Math.round(h * scale) }}>
        <iframe
          ref={frame}
          title="Front pages preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={() => {
            const d = frame.current?.contentDocument;
            if (d) setH(d.documentElement.scrollHeight);
          }}
          style={{
            width: 830,
            height: h,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        />
      </div>
    </div>
  );
}

// ====================== The cover ======================

function CoverEditor({
  id,
  section,
  stage,
  cover,
  onChange,
}: {
  id: string;
  section: string;
  stage: NotesStage;
  cover: NotesCover;
  onChange: (c: NotesCover) => void;
}) {
  const listFn = useServerFn(listNotesBooks);
  const getFn = useServerFn(getNotesBook);
  const books = useQuery({ queryKey: ["notesBooks"], queryFn: () => listFn() });
  const set = (p: Partial<NotesCover>) => onChange({ ...cover, ...p });
  const subject: Bi = { en: section, hi: subjectName(section, "hi") };
  const others = (books.data?.books ?? []).filter((b) => b.id !== id);
  async function copyLook(from: string) {
    try {
      const b = await getFn({ data: { id: from } });
      const c = b.cover;
      onChange({
        ...cover,
        design: c.design,
        color: c.color,
        color2: c.color2,
        outline: c.outline,
        bg: c.bg,
        bg_dim: c.bg_dim,
        photo: c.photo,
        ribbon: c.ribbon,
      });
      toast.success("Look copied: save to keep it");
    } catch (e) {
      toast.error(errorText(e, "Couldn't copy it"));
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        <Step n={1} title="Design">
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Cover design"
          >
            {NOTES_DESIGNS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={cover.design === d.id}
                onClick={() => set({ design: d.id })}
                className={`rounded-xl border p-2 text-left text-sm ${cover.design === d.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-muted/50"}`}
              >
                <span className="block font-medium">{d.name}</span>
                <span className="block text-xs text-muted-foreground">{d.hint}</span>
              </button>
            ))}
          </div>
          {others.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Use the look of</span>
              <select
                aria-label="Use the look of"
                value=""
                onChange={(e) => e.target.value && void copyLook(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">another book…</option>
                {others.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.section} · {STAGE_NAME[b.stage]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Step>
        <Step n={2} title="Colours and outline">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Main colour
              <input
                type="color"
                aria-label="Main colour"
                value={cover.color}
                onChange={(e) => set({ color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
            <label className="flex items-center gap-2">
              Second colour
              <input
                type="color"
                aria-label="Second colour"
                value={cover.color2}
                onChange={(e) => set({ color2: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
            <Button size="sm" variant="ghost" onClick={() => set(DEFAULT_COLORS[stage])}>
              Default colours
            </Button>
          </div>
          <div
            className="flex flex-wrap items-center gap-2 text-sm"
            role="radiogroup"
            aria-label="Map outline"
          >
            <span className="text-muted-foreground">Map outline:</span>
            {NOTES_OUTLINES.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={cover.outline === o.id}
                onClick={() => set({ outline: o.id })}
                className={`rounded-full border px-3 py-1 text-xs ${cover.outline === o.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {o.name}
              </button>
            ))}
          </div>
        </Step>
        {(cover.design === "photo" || cover.design === "framed") && (
          <Step
            n={3}
            title="Photo"
            hint={
              cover.design === "photo"
                ? "A wide, sharp photo works best; it is darkened so the title reads clearly."
                : "Shown in a frame above the title (without one, the map outline is shown)."
            }
          >
            {cover.design === "photo" ? (
              <>
                <PhotoField
                  label="Add background photo"
                  value={cover.bg}
                  onChange={(bg) => set({ bg })}
                />
                <label className="flex items-center gap-3 text-sm">
                  Darken
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    aria-label="Darken the photo"
                    value={cover.bg_dim}
                    onChange={(e) => set({ bg_dim: Number(e.target.value) })}
                  />
                  <span className="w-10 tabular-nums text-muted-foreground">{cover.bg_dim}%</span>
                </label>
              </>
            ) : (
              <PhotoField
                label="Add framed photo"
                value={cover.photo}
                onChange={(photo) => set({ photo })}
              />
            )}
          </Step>
        )}
        <Step
          n={cover.design === "photo" || cover.design === "framed" ? 4 : 3}
          title="Text"
          hint="Empty fields use the defaults shown in grey."
        >
          <BiField
            label="Title"
            value={cover.title}
            onChange={(title) => set({ title })}
            placeholder={subject}
          />
          <BiField
            label="Line above the title"
            value={cover.kicker}
            onChange={(kicker) => set({ kicker })}
            placeholder={DEFAULT_TEXT.kicker}
          />
          <BiField
            label="Label"
            value={cover.label}
            onChange={(label) => set({ label })}
            placeholder={DEFAULT_TEXT.label[stage]}
          />
          <BiLines
            label="Features"
            value={cover.features}
            max={MAX_FEATURES}
            onChange={(features) => set({ features })}
            placeholder={DEFAULT_TEXT.features[stage]}
          />
          <BiField
            label="Sources line"
            value={cover.based_on}
            onChange={(based_on) => set({ based_on })}
            placeholder={DEFAULT_TEXT.based_on}
          />
          <div className="grid gap-3 xl:grid-cols-2">
            <BiField
              label="Edition"
              value={cover.edition}
              onChange={(edition) => set({ edition })}
              placeholder={{
                en: `Edition ${new Date().getFullYear()}`,
                hi: `संस्करण ${new Date().getFullYear()}`,
              }}
            />
            <BiField
              label="Updated till"
              value={cover.updated}
              onChange={(updated) => set({ updated })}
              placeholder={{ en: "Updated till October 2026", hi: "अक्टूबर 2026 तक अद्यतन" }}
            />
          </div>
          <BiField
            label="Corner ribbon (optional)"
            value={cover.ribbon}
            onChange={(ribbon) => set({ ribbon })}
            placeholder={{ en: "New edition", hi: "नया संस्करण" }}
          />
        </Step>
      </div>
      <Preview id={id} parts={["cover"]} cover={cover} />
    </div>
  );
}

// ====================== The front pages ======================

function FrontEditor({
  id,
  stage,
  cover,
  front,
  onChange,
}: {
  id: string;
  stage: NotesStage;
  cover: NotesCover;
  front: NotesFront;
  onChange: (f: NotesFront) => void;
}) {
  const set = (p: Partial<NotesFront>) => onChange({ ...front, ...p });
  const [resetKey, setResetKey] = useState(0);
  const d = defaultFront(stage);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]" key={resetKey}>
      <div className="min-w-0 space-y-3">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!confirm("Put back the default text of every front page?")) return;
              onChange(d);
              setResetKey((k) => k + 1);
            }}
          >
            Default text
          </Button>
        </div>
        <Step n={1} title="About these notes">
          <BiField
            label="Opening"
            rows={5}
            value={front.intro}
            onChange={(intro) => set({ intro })}
          />
          <span className="text-sm font-medium">How we made them</span>
          <ul className="space-y-2">
            {front.how.map((h, i) => (
              <li key={i} className="space-y-2 rounded-xl border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Point {i + 1}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7"
                    aria-label={`Remove point ${i + 1}`}
                    onClick={() => set({ how: front.how.filter((_, k) => k !== i) })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <BiField
                  label="Heading"
                  value={h.title}
                  onChange={(title) =>
                    set({ how: front.how.map((x, k) => (k === i ? { ...x, title } : x)) })
                  }
                />
                <BiField
                  label="Text"
                  rows={3}
                  value={h.text}
                  onChange={(text) =>
                    set({ how: front.how.map((x, k) => (k === i ? { ...x, text } : x)) })
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({ how: [...front.how, { title: { en: "", hi: "" }, text: { en: "", hi: "" } }] })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add a point
          </Button>
          <BiLines label="How they help" value={front.help} onChange={(help) => set({ help })} />
          <BiField label="Signed" value={front.sign} onChange={(sign) => set({ sign })} />
        </Step>
        <Step
          n={2}
          title="How to use"
          hint="The key to the boxes is made from the book's layout; edit the study steps here."
        >
          <BiLines
            label="A good way to study"
            value={front.study}
            onChange={(study) => set({ study })}
          />
        </Step>
        <Step n={3} title="Edition page">
          <BiField
            label="Updates and corrections"
            rows={2}
            value={front.updates}
            onChange={(updates) => set({ updates })}
          />
          <BiField
            label="If you find a mistake"
            rows={2}
            value={front.errors}
            onChange={(errors) => set({ errors })}
          />
          <BiField
            label="Disclaimer"
            rows={2}
            value={front.disclaimer}
            onChange={(disclaimer) => set({ disclaimer })}
          />
          <BiField
            label="Copyright"
            rows={3}
            value={front.copyright}
            onChange={(copyright) => set({ copyright })}
          />
        </Step>
        <Step
          n={4}
          title="Sources and acknowledgements"
          hint="Each chapter also ends with its own sources list."
        >
          <ul className="space-y-2">
            {front.sources.map((g, i) => (
              <li key={i} className="space-y-2 rounded-xl border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Group {i + 1}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7"
                    aria-label={`Remove group ${i + 1}`}
                    onClick={() => set({ sources: front.sources.filter((_, k) => k !== i) })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <BiField
                  label="Group heading"
                  value={g.title}
                  onChange={(title) =>
                    set({ sources: front.sources.map((x, k) => (k === i ? { ...x, title } : x)) })
                  }
                />
                <BiLines
                  label="Sources"
                  value={g.items}
                  onChange={(items) =>
                    set({ sources: front.sources.map((x, k) => (k === i ? { ...x, items } : x)) })
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({ sources: [...front.sources, { title: { en: "", hi: "" }, items: [] }] })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add a group
          </Button>
          <BiField
            label="Thanks"
            rows={2}
            value={front.thanks}
            onChange={(thanks) => set({ thanks })}
          />
        </Step>
      </div>
      <Preview
        id={id}
        parts={["imprint", "about", "howto", "contents", "coverage", "pyq", "sources"]}
        cover={cover}
        front={front}
        tall
      />
    </div>
  );
}
