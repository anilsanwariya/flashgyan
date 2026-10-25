// Admin: a notes book's notes. Each topic is written by the AI from its
// knowledge base passages (one topic a request), then edited here part by
// part beside its page, in Hindi or English. Lines written without a source
// passage carry ◇ and must be checked or replaced before the topic can be
// approved. The book prints as a student copy (approved topics, no marks) or
// a review copy.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  PenLine,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteBookNote,
  getBookNote,
  listBookNotes,
  previewBookNote,
  printNotesBook,
  saveBookNote,
  setBookNoteStatus,
  writeNotesStep,
} from "@/lib/notes-books.functions";
import {
  unchecked,
  type NoteContent,
  type NotePassage,
  type NotePoint,
  type NoteSourced,
} from "@/lib/notes-write";
import type { NotesStage } from "@/lib/notes-books";
import type { Bi } from "@/lib/current-affairs";
import { BiField, BiLines, LangToggle, PagesPreview, Step } from "@/components/notes-books";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Lang = "en" | "hi";
const EMPTY: Bi = { en: "", hi: "" };
const COVER_TONE = { full: "good", partial: "warn", none: "bad" } as const;
const COVER_NAME = { full: "Covered", partial: "Partly covered", none: "Not covered" } as const;

export function NotesWriter({ id, stage }: { id: string; stage: NotesStage }) {
  const [open, setOpen] = useState<string | null>(null);
  return open ? (
    <NoteEditor id={id} topic={open} stage={stage} onBack={() => setOpen(null)} />
  ) : (
    <NotesList id={id} onOpen={setOpen} />
  );
}

async function printView(html: string) {
  const w = window.open("", "_blank");
  if (!w) return toast.error("Allow pop-ups to open the print view");
  w.document.write(html);
  w.document.close();
  w.onload = () => setTimeout(() => w.print(), 500);
}

// ====================== The list ======================

function NotesList({ id, onOpen }: { id: string; onOpen: (topic: string) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBookNotes);
  const stepFn = useServerFn(writeNotesStep);
  const printFn = useServerFn(printNotesBook);
  const q = useQuery({
    queryKey: ["bookNotes", id],
    queryFn: () => listFn({ data: { id } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["bookNotes", id] });

  async function write(redo?: string[]) {
    stop.current = false;
    const skip: string[] = [];
    let done = 0;
    try {
      for (;;) {
        setBusy(
          redo
            ? "Writing it again…"
            : `Writing the notes… ${done} topic${done === 1 ? "" : "s"} written`,
        );
        const r = await stepFn({ data: { id, skip, ...(redo ? { redo } : {}) } });
        done += r.done;
        skip.push(...r.missed);
        await refresh();
        if (redo || r.left === 0 || stop.current) break;
      }
      if (skip.length)
        toast.error(
          `${skip.length} topic${skip.length === 1 ? "" : "s"} couldn't be written: try again`,
        );
      if (done) toast.success(`${done} topic${done === 1 ? "" : "s"} written`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write"));
    } finally {
      setBusy(null);
      await refresh();
    }
  }
  async function print(lang: Lang, review: boolean) {
    try {
      await printView((await printFn({ data: { id, lang, review } })).html);
    } catch (e) {
      toast.error(errorText(e, "Couldn't open it"));
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return (
      <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load the notes")}</p>
    );
  const { rows, chapters } = q.data!;
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        This subject's master outline has no topics yet.
      </p>
    );
  const written = rows.filter((r) => r.status).length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const toCheck = rows.reduce((n, r) => n + r.unchecked, 0);
  const thin = rows.filter((r) => !r.status && r.coverage === "none").length;
  return (
    <div className="space-y-4">
      <section
        aria-label="Notes"
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-semibold">Notes</h3>
          <span className="text-sm text-muted-foreground" data-testid="notes-counts">
            {written} of {rows.length} topics written · {approved} approved
            {toCheck ? ` · ${toCheck} lines to check` : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Each topic is written from its knowledge base passages, in Hindi and English, in the
          book's layout. Every line shows the passages it came from; lines written without one carry
          ◇ and must be checked or replaced before the topic is approved. Definitions are kept only
          when found word for word in a passage.
        </p>
        {thin > 0 && (
          <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-2.5 text-sm">
            {thin} topic{thin === 1 ? " is" : "s are"} not covered by the knowledge base (Planner):
            their notes would be written mostly without sources. Upload material first, or check
            every line.
          </p>
        )}
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-primary">
            <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
            <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={written === rows.length} onClick={() => void write()}>
              <Sparkles className="mr-1 h-4 w-4" />
              {written < rows.length ? `Write the notes (${rows.length - written})` : "All written"}
            </Button>
            {(["hi", "en"] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant="outline"
                disabled={!approved}
                onClick={() => void print(l, false)}
              >
                <Printer className="mr-1 h-4 w-4" /> Student copy (
                {l === "hi" ? "Hindi" : "English"})
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={!written}
              onClick={() => void print("hi", true)}
            >
              Review copy
            </Button>
          </div>
        )}
      </section>
      <ol className="space-y-1.5" data-testid="note-topics">
        {rows.map((r, i) => {
          const ch = chapters.find((c) => c.n === r.chapter);
          return (
            <li key={r.topic_id}>
              {(i === 0 || rows[i - 1].chapter !== r.chapter) && ch && (
                <h4 className="mb-1 mt-3 font-semibold">
                  {ch.n}. {ch.name.hi || ch.name.en}{" "}
                  {ch.name.hi && ch.name.en !== ch.name.hi && (
                    <span className="font-normal text-muted-foreground">{ch.name.en}</span>
                  )}
                </h4>
              )}
              <div
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5 text-sm"
                data-topic={r.name.en}
              >
                <span className="w-12 flex-none tabular-nums text-muted-foreground">
                  {r.number}
                </span>
                <span className="min-w-0 flex-1 basis-[12rem] font-medium">
                  <span lang="hi">{r.name.hi || r.name.en}</span>
                  {r.name.hi && r.name.en !== r.name.hi && (
                    <span className="ml-2 font-normal text-muted-foreground">{r.name.en}</span>
                  )}
                </span>
                {r.asked > 0 && <Badge tone="warn">Asked {r.asked}×</Badge>}
                {r.coverage && (
                  <Badge tone={COVER_TONE[r.coverage as keyof typeof COVER_TONE]}>
                    {COVER_NAME[r.coverage as keyof typeof COVER_NAME]}
                  </Badge>
                )}
                {r.status === "approved" ? (
                  <Badge tone="good">
                    <BadgeCheck className="h-3 w-3" /> Approved
                  </Badge>
                ) : r.status ? (
                  <Badge tone="primary">Draft</Badge>
                ) : (
                  <Badge tone="muted">Not written</Badge>
                )}
                {r.unchecked > 0 && <Badge tone="bad">◇ {r.unchecked} to check</Badge>}
                {r.status ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => onOpen(r.topic_id)}
                  >
                    <PenLine className="mr-1 h-3.5 w-3.5" /> Open
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={!!busy}
                    onClick={() => void write([r.topic_id])}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> Write
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ====================== One topic ======================

// A value that settles: the preview waits until typing stops.
function useSettled<T>(value: T, ms = 700): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function NoteEditor({
  id,
  topic,
  stage,
  onBack,
}: {
  id: string;
  topic: string;
  stage: NotesStage;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getBookNote);
  const saveFn = useServerFn(saveBookNote);
  const statusFn = useServerFn(setBookNoteStatus);
  const deleteFn = useServerFn(deleteBookNote);
  const stepFn = useServerFn(writeNotesStep);
  const previewFn = useServerFn(previewBookNote);
  const q = useQuery({
    queryKey: ["bookNote", id, topic],
    queryFn: () => getFn({ data: { id, topic } }),
    refetchOnMount: true,
  });
  const [c, setC] = useState<NoteContent | null>(null);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("hi");
  const note = q.data;
  useEffect(() => {
    if (note && !c) setC(note.content);
  }, [note, c]);
  const settled = useSettled({ c, lang });
  const preview = useQuery({
    queryKey: ["bookNotePreview", id, topic, settled],
    queryFn: () =>
      previewFn({ data: { id, topic, lang: settled.lang, content: settled.c as never } }),
    enabled: !!settled.c,
    placeholderData: (prev) => prev,
  });
  if (q.isLoading || (note && !c)) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !note || !c)
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All topics
        </Button>
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load it")}</p>
      </div>
    );
  const dirty = JSON.stringify(c) !== JSON.stringify(note.content);
  const left = unchecked(c);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["bookNote", id, topic] });
    await qc.invalidateQueries({ queryKey: ["bookNotes", id] });
  };
  const act = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    act(
      "Saving…",
      async () => {
        const saved = await saveFn({ data: { id, topic, content: c as never } });
        qc.setQueryData(["bookNote", id, topic], saved);
        setC(saved.content);
        await qc.invalidateQueries({ queryKey: ["bookNotes", id] });
      },
      "Saved",
    );
  const set = (p: Partial<NoteContent>) => setC({ ...c, ...p });
  const P = note.passages;

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (dirty && !confirm("Leave without saving your changes?")) return;
            onBack();
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> All topics
        </Button>
        {note.status === "approved" ? (
          <Badge tone="good">
            <BadgeCheck className="h-3 w-3" /> Approved
          </Badge>
        ) : (
          <Badge tone="primary">Draft</Badge>
        )}
        {left > 0 ? (
          <Badge tone="bad">◇ {left} to check</Badge>
        ) : (
          <Badge tone="good">Every line has a source or is checked</Badge>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {note.status === "approved" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void act(
                  "…",
                  () => statusFn({ data: { id, topic, approved: false } }).then(refresh),
                  "Back to a draft",
                )
              }
            >
              Back to draft
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!!busy || dirty || left > 0}
              title={dirty ? "Save first" : left ? "Check every ◇ line first" : undefined}
              onClick={() =>
                void act(
                  "Approving…",
                  () => statusFn({ data: { id, topic, approved: true } }).then(refresh),
                  "Approved",
                )
              }
            >
              <BadgeCheck className="mr-1 h-4 w-4" /> Approve
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => {
              if (
                !confirm(
                  "Write this topic again from the knowledge base? Your edits to it are replaced.",
                )
              )
                return;
              void act(
                "Writing it again…",
                async () => {
                  const r = await stepFn({ data: { id, redo: [topic] } });
                  if (!r.done) throw new Error("The AI's notes couldn't be read: try again.");
                  const fresh = await getFn({ data: { id, topic } });
                  qc.setQueryData(["bookNote", id, topic], fresh);
                  setC(fresh.content);
                  setKey((k) => k + 1);
                  await qc.invalidateQueries({ queryKey: ["bookNotes", id] });
                },
                "Written again",
              );
            }}
          >
            <Sparkles className="mr-1 h-4 w-4" /> Write again
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete the notes"
            disabled={!!busy}
            onClick={() => {
              if (!confirm("Delete this topic's notes?")) return;
              void act("…", () => deleteFn({ data: { id, topic } }), "Deleted").then(async (ok) => {
                if (!ok) return;
                await qc.invalidateQueries({ queryKey: ["bookNotes", id] });
                onBack();
              });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-primary">
          <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]" key={key}>
        <div className="min-w-0 space-y-3">
          <Step n={1} title="Opening and definitions">
            <PointRow
              label="Opening"
              point={c.intro}
              passages={P}
              rows={3}
              onChange={(intro) => set({ intro })}
            />
            <span className="text-sm font-medium">Definitions (word for word from a passage)</span>
            {c.definitions.map((d, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border p-2">
                <div className="flex items-center gap-2">
                  <SrcChips src={d.src} passages={P} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7"
                    aria-label={`Remove definition ${i + 1}`}
                    onClick={() => set({ definitions: c.definitions.filter((_, k) => k !== i) })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <BiField
                  label={`Term ${i + 1}`}
                  value={d.term}
                  onChange={(term) =>
                    set({
                      definitions: c.definitions.map((x, k) => (k === i ? { ...x, term } : x)),
                    })
                  }
                />
                <BiField
                  label={`Definition ${i + 1}`}
                  rows={2}
                  value={d.text}
                  onChange={(text) =>
                    set({
                      definitions: c.definitions.map((x, k) => (k === i ? { ...x, text } : x)),
                    })
                  }
                />
                <Input
                  aria-label={`Definition ${i + 1} source`}
                  placeholder="Source (book, class, chapter)"
                  value={d.source}
                  onChange={(e) =>
                    set({
                      definitions: c.definitions.map((x, k) =>
                        k === i ? { ...x, source: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </Step>
          <Step n={2} title={stage === "mains" ? "Key facts" : "Key points"}>
            <PointList
              label="Point"
              points={c.points}
              passages={P}
              onChange={(points) => set({ points })}
            />
          </Step>
          {stage === "mains" && (
            <Step
              n={3}
              title="Sections"
              hint="Parts such as features, significance, problems and way forward."
            >
              {c.sections.map((s, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Section {i + 1}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7"
                      aria-label={`Remove section ${i + 1}`}
                      onClick={() => set({ sections: c.sections.filter((_, k) => k !== i) })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <BiField
                    label={`Section ${i + 1} heading`}
                    value={s.heading}
                    onChange={(heading) =>
                      set({ sections: c.sections.map((x, k) => (k === i ? { ...x, heading } : x)) })
                    }
                  />
                  <PointList
                    label={`Section ${i + 1} point`}
                    points={s.points}
                    passages={P}
                    onChange={(points) =>
                      set({ sections: c.sections.map((x, k) => (k === i ? { ...x, points } : x)) })
                    }
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ sections: [...c.sections, { heading: EMPTY, points: [] }] })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add a section
              </Button>
              <BiLines
                label="Keywords"
                value={c.keywords}
                onChange={(keywords) => set({ keywords })}
              />
              <SourcedList
                label="Data"
                items={c.data}
                passages={P}
                onChange={(data) => set({ data })}
              />
              <SourcedList
                label="Official text"
                items={c.official}
                passages={P}
                onChange={(official) => set({ official })}
              />
            </Step>
          )}
          <Step n={stage === "mains" ? 4 : 3} title="Table">
            <TableEdit c={c} onChange={(table) => set({ table })} />
          </Step>
          {stage === "prelims" ? (
            <Step n={4} title="Exam trap and quick revision">
              <BiField
                label="Exam trap"
                rows={2}
                value={c.trap}
                onChange={(trap) => set({ trap })}
              />
              {c.oneliners.map((o, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 basis-[16rem]">
                    <BiField
                      label={`Revision ${i + 1}`}
                      value={o.q}
                      onChange={(qq) =>
                        set({
                          oneliners: c.oneliners.map((x, k) => (k === i ? { ...x, q: qq } : x)),
                        })
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1 basis-[12rem]">
                    <BiField
                      label={`Answer ${i + 1}`}
                      value={o.a}
                      onChange={(a) =>
                        set({ oneliners: c.oneliners.map((x, k) => (k === i ? { ...x, a } : x)) })
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove revision ${i + 1}`}
                    onClick={() => set({ oneliners: c.oneliners.filter((_, k) => k !== i) })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ oneliners: [...c.oneliners, { q: EMPTY, a: EMPTY }] })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add a one-liner
              </Button>
            </Step>
          ) : (
            <Step n={5} title="Answer plan and practice">
              {c.plan.map((p, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 basis-[16rem]">
                    <BiField
                      label={`Part ${i + 1}`}
                      value={p.part}
                      onChange={(part) =>
                        set({ plan: c.plan.map((x, k) => (k === i ? { ...x, part } : x)) })
                      }
                    />
                  </div>
                  <Input
                    aria-label={`Part ${i + 1} words`}
                    type="number"
                    className="w-20"
                    value={p.words}
                    onChange={(e) =>
                      set({
                        plan: c.plan.map((x, k) =>
                          k === i ? { ...x, words: Number(e.target.value) || 0 } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove part ${i + 1}`}
                    onClick={() => set({ plan: c.plan.filter((_, k) => k !== i) })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ plan: [...c.plan, { part: EMPTY, words: 20 }] })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add a part
              </Button>
              <BiField
                label="Practice question"
                rows={2}
                value={c.practice}
                onChange={(practice) => set({ practice })}
              />
            </Step>
          )}
          <Step
            n={stage === "mains" ? 6 : 5}
            title="Map"
            hint="Numbered places on the official outline; rivers from Natural Earth (smaller rivers aren't in it yet)."
          >
            <MapEdit c={c} onChange={(map) => set({ map })} />
          </Step>
          <PassageList passages={P} />
        </div>
        <div className="min-w-0 space-y-2 lg:sticky lg:top-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Page</span>
            {preview.isFetching && (
              <RefreshCw
                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-label="Updating"
              />
            )}
            <span className="ml-auto" />
            <LangToggle lang={lang} onChange={setLang} />
          </div>
          {preview.data ? (
            <PagesPreview html={preview.data.html} />
          ) : (
            <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
          )}
        </div>
      </div>
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur transition-transform ${dirty ? "translate-y-0" : "translate-y-full"}`}
        aria-hidden={!dirty}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>
          <Button
            size="sm"
            variant="ghost"
            tabIndex={dirty ? 0 : -1}
            onClick={() => {
              setC(note.content);
              setKey((k) => k + 1);
            }}
          >
            Discard
          </Button>
          <Button size="sm" tabIndex={dirty ? 0 : -1} disabled={!!busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// The passages a line came from, or ◇.
function SrcChips({ src, passages, ok }: { src: number[]; passages: NotePassage[]; ok?: boolean }) {
  if (!src.length)
    return ok ? (
      <Badge tone="good">Checked by you</Badge>
    ) : (
      <Badge tone="bad">◇ No source passage</Badge>
    );
  return (
    <span className="flex flex-wrap gap-1">
      {src.map((k) => (
        <a
          key={k}
          href={`#passage-${k}`}
          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:underline"
          title={passages.find((p) => p.k === k)?.title}
        >
          [{k}] {passages.find((p) => p.k === k)?.title.slice(0, 40)}
        </a>
      ))}
    </span>
  );
}

function PointRow({
  label,
  point,
  passages,
  rows = 2,
  onChange,
  onRemove,
}: {
  label: string;
  point: NotePoint;
  passages: NotePassage[];
  rows?: number;
  onChange: (p: NotePoint) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`space-y-1.5 rounded-xl border p-2 ${!point.src.length && !point.ok ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SrcChips src={point.src} passages={passages} ok={point.ok} />
        {!point.src.length && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={!!point.ok}
              onChange={(e) => onChange({ ...point, ok: e.target.checked })}
              aria-label={`${label}: checked, keep it`}
            />
            Checked, keep it
          </label>
        )}
        {onRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["hi", "en"] as const).map((l) => (
          <Textarea
            key={l}
            aria-label={`${label} (${l === "hi" ? "Hindi" : "English"})`}
            lang={l}
            rows={rows}
            value={point.text[l]}
            onChange={(e) => onChange({ ...point, text: { ...point.text, [l]: e.target.value } })}
          />
        ))}
      </div>
    </div>
  );
}

function PointList({
  label,
  points,
  passages,
  onChange,
}: {
  label: string;
  points: NotePoint[];
  passages: NotePassage[];
  onChange: (p: NotePoint[]) => void;
}) {
  return (
    <div className="space-y-2">
      {points.map((p, i) => (
        <PointRow
          key={i}
          label={`${label} ${i + 1}`}
          point={p}
          passages={passages}
          onChange={(x) => onChange(points.map((y, k) => (k === i ? x : y)))}
          onRemove={() => onChange(points.filter((_, k) => k !== i))}
        />
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...points, { text: EMPTY, src: [], ok: true }])}
      >
        <Plus className="mr-1 h-4 w-4" /> Add a point
      </Button>
      <p className="text-xs text-muted-foreground">
        Points you add yourself count as checked. Use **word** for bold.
      </p>
    </div>
  );
}

function SourcedList({
  label,
  items,
  passages,
  onChange,
}: {
  label: string;
  items: NoteSourced[];
  passages: NotePassage[];
  onChange: (x: NoteSourced[]) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {items.map((d, i) => (
        <div key={i} className="space-y-1.5">
          <PointRow
            label={`${label} ${i + 1}`}
            point={d}
            passages={passages}
            onChange={(x) => onChange(items.map((y, k) => (k === i ? { ...y, ...x } : y)))}
            onRemove={() => onChange(items.filter((_, k) => k !== i))}
          />
          <Input
            aria-label={`${label} ${i + 1} source`}
            placeholder="Source and year (e.g. Census 2011)"
            value={d.source}
            onChange={(e) =>
              onChange(items.map((y, k) => (k === i ? { ...y, source: e.target.value } : y)))
            }
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...items, { text: EMPTY, source: "", src: [], ok: true }])}
      >
        <Plus className="mr-1 h-4 w-4" /> Add
      </Button>
    </div>
  );
}

// A table, a row a line, cells parted by "|".
function TableEdit({
  c,
  onChange,
}: {
  c: NoteContent;
  onChange: (t: NoteContent["table"]) => void;
}) {
  const t = c.table;
  const text = (l: Lang) =>
    t
      ? [
          t.head.map((h) => h[l]).join(" | "),
          ...t.rows.map((r) => r.map((x) => x[l]).join(" | ")),
        ].join("\n")
      : "";
  const [hi, setHi] = useState(() => text("hi"));
  const [en, setEn] = useState(() => text("en"));
  const parse = (h: string, e: string) => {
    const lines = (s: string) => s.split("\n").map((x) => x.split("|").map((y) => y.trim()));
    const a = lines(h);
    const b = lines(e);
    const rows = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
      const n = Math.max(a[i]?.length ?? 0, b[i]?.length ?? 0);
      return Array.from({ length: n }, (_, j) => ({ hi: a[i]?.[j] ?? "", en: b[i]?.[j] ?? "" }));
    }).filter((r) => r.some((x) => x.hi || x.en));
    if (rows.length < 2) return null;
    const width = rows[0].length;
    return {
      caption: t?.caption ?? EMPTY,
      head: rows[0],
      rows: rows.slice(1).map((r) => Array.from({ length: width }, (_, j) => r[j] ?? EMPTY)),
      src: t?.src ?? [],
    };
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        The first line is the heading row; cells parted by “|”. Empty: no table.
      </p>
      {t && (
        <BiField
          label="Table caption"
          value={t.caption}
          onChange={(caption) => onChange({ ...t, caption })}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          aria-label="Table (Hindi)"
          lang="hi"
          rows={5}
          value={hi}
          onChange={(e) => {
            setHi(e.target.value);
            onChange(parse(e.target.value, en));
          }}
        />
        <Textarea
          aria-label="Table (English)"
          rows={5}
          value={en}
          onChange={(e) => {
            setEn(e.target.value);
            onChange(parse(hi, e.target.value));
          }}
        />
      </div>
    </div>
  );
}

function MapEdit({ c, onChange }: { c: NoteContent; onChange: (m: NoteContent["map"]) => void }) {
  const m = c.map;
  if (!m)
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ region: "rajasthan", rivers: true, title: EMPTY, places: [] })}
      >
        <Plus className="mr-1 h-4 w-4" /> Add a map
      </Button>
    );
  return (
    <div className="space-y-2">
      <BiField label="Map title" value={m.title} onChange={(title) => onChange({ ...m, title })} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label="Map region"
          value={m.region}
          onChange={(e) => onChange({ ...m, region: e.target.value as "rajasthan" | "india" })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="rajasthan">Rajasthan</option>
          <option value="india">India</option>
        </select>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={m.rivers}
            onChange={(e) => onChange({ ...m, rivers: e.target.checked })}
          />{" "}
          Show rivers
        </label>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onChange(null)}>
          Remove the map
        </Button>
      </div>
      {m.places.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <Input
            aria-label={`Place ${i + 1} (Hindi)`}
            lang="hi"
            className="h-8 w-36"
            value={p.name.hi}
            onChange={(e) =>
              onChange({
                ...m,
                places: m.places.map((x, k) =>
                  k === i ? { ...x, name: { ...x.name, hi: e.target.value } } : x,
                ),
              })
            }
          />
          <Input
            aria-label={`Place ${i + 1} (English)`}
            className="h-8 w-36"
            value={p.name.en}
            onChange={(e) =>
              onChange({
                ...m,
                places: m.places.map((x, k) =>
                  k === i ? { ...x, name: { ...x.name, en: e.target.value } } : x,
                ),
              })
            }
          />
          <Input
            aria-label={`Place ${i + 1} latitude`}
            type="number"
            step="0.01"
            className="h-8 w-24"
            value={p.lat}
            onChange={(e) =>
              onChange({
                ...m,
                places: m.places.map((x, k) =>
                  k === i ? { ...x, lat: Number(e.target.value) } : x,
                ),
              })
            }
          />
          <Input
            aria-label={`Place ${i + 1} longitude`}
            type="number"
            step="0.01"
            className="h-8 w-24"
            value={p.lon}
            onChange={(e) =>
              onChange({
                ...m,
                places: m.places.map((x, k) =>
                  k === i ? { ...x, lon: Number(e.target.value) } : x,
                ),
              })
            }
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove place ${i + 1}`}
            onClick={() => onChange({ ...m, places: m.places.filter((_, k) => k !== i) })}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onChange({ ...m, places: [...m.places, { name: EMPTY, lat: 26.9, lon: 75.8 }] })
        }
      >
        <Plus className="mr-1 h-4 w-4" /> Add a place
      </Button>
      <p className="text-xs text-muted-foreground">
        Check each place's position on the page; places off the map aren't drawn.
      </p>
    </div>
  );
}

function PassageList({ passages }: { passages: NotePassage[] }) {
  return (
    <section
      aria-label="Passages"
      className="space-y-2 rounded-2xl border border-border bg-card p-4"
    >
      <h3 className="font-semibold">The knowledge base passages used ({passages.length})</h3>
      {passages.length ? (
        <ol className="space-y-1.5 text-sm">
          {passages.map((p) => (
            <li key={p.k} id={`passage-${p.k}`} className="scroll-mt-20">
              <details>
                <summary className="cursor-pointer">
                  <b>[{p.k}]</b> {p.title}{" "}
                  <span className="text-xs text-muted-foreground">{p.subject}</span>
                </summary>
                <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/50 p-2 text-xs">
                  {p.content}
                </p>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          None were found: every line was written without a source.
        </p>
      )}
    </section>
  );
}
