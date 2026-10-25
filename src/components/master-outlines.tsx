// Admin: master outlines, on the Syllabus page. For each subject section our
// own chapter > topic > subtopic outline (the notes follow it), made by the
// AI from every exam's official syllabus lines in that section, each line
// linked to the topics that cover it, so every topic shows the exams that
// ask it. Rename, add, move and delete topics; link lines by hand.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  addMasterTopic,
  deleteMasterTopic,
  fitOutlineLines,
  getOutline,
  listOutlines,
  makeOutline,
  moveMasterTopic,
  setSyllabusLink,
  updateMasterTopic,
} from "@/lib/syllabus.functions";
import {
  childLevel,
  childrenOf,
  numbering,
  topicExams,
  type MasterTopic,
  type OutlineLine,
} from "@/lib/outline";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MasterOutlines() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? (
    <OutlineView section={open} onBack={() => setOpen(null)} />
  ) : (
    <OutlineList onOpen={setOpen} />
  );
}

function OutlineList({ onOpen }: { onOpen: (s: string) => void }) {
  const listFn = useServerFn(listOutlines);
  const q = useQuery({ queryKey: ["outlines"], queryFn: () => listFn(), refetchOnMount: true });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (q.data && !q.data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        Master outlines need a database update: run the latest migration (master_outlines) in
        Lovable or the SQL editor, then reload this page.
      </p>
    );
  const sections = q.data?.sections ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        One outline per subject section, chapter › topic › subtopic, made from every exam's official
        syllabus lines in that section. The notes follow it, and each topic shows which exams ask
        it. Add the syllabi first (Official syllabi).
      </p>
      {sections.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Subject sections">
          {sections.map((s) => (
            <li key={s.section}>
              <button
                type="button"
                onClick={() => onOpen(s.section)}
                data-section={s.section}
                className="w-full space-y-1 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
              >
                <div className="flex items-center gap-2">
                  <ListTree className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{s.section}</span>
                  {s.topics ? (
                    <Badge tone={s.linked < s.lines ? "warn" : "good"}>
                      {s.linked < s.lines ? `${s.lines - s.linked} to link` : "Outline"}
                    </Badge>
                  ) : (
                    <Badge tone="muted">No outline yet</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.lines} syllabus {s.lines === 1 ? "line" : "lines"}
                  {s.topics ? ` · ${s.topics} topics` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No syllabus lines yet.
        </p>
      )}
    </div>
  );
}

// ====================== One section's outline ======================

function OutlineView({ section, onBack }: { section: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOutline);
  const makeFn = useServerFn(makeOutline);
  const fitFn = useServerFn(fitOutlineLines);
  const addFn = useServerFn(addMasterTopic);
  const q = useQuery({
    queryKey: ["outline", section],
    queryFn: () => getFn({ data: { section } }),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [newChapter, setNewChapter] = useState(false);
  const topics = q.data?.topics ?? [];
  const lines = q.data?.lines ?? [];
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["outline", section] });
    await qc.invalidateQueries({ queryKey: ["outlines"] });
  };
  const loose = lines.filter((l) => !l.topics.length);
  const exams = [...new Set(lines.map((l) => l.exam))].sort();

  async function make(replace: boolean) {
    if (replace && !confirm(`Make the ${section} outline again? Your changes to it are lost.`))
      return;
    setBusy("Planning the outline from the syllabus lines…");
    try {
      await makeFn({ data: { section, replace } });
      toast.success("Outline made: check it below");
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't make it"));
    } finally {
      setBusy(null);
    }
  }
  async function fit() {
    setBusy("Fitting the new lines into the outline…");
    try {
      const r = await fitFn({ data: { section } });
      toast.success(
        r.linked
          ? `${r.linked} ${r.linked === 1 ? "line" : "lines"} linked${r.added ? `, ${r.added} new ${r.added === 1 ? "topic" : "topics"}` : ""}`
          : "Nothing to link",
      );
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't link them"));
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const numbers = numbering(topics);
  const flat: MasterTopic[] = [];
  const walk = (parent: string | null) =>
    childrenOf(topics, parent).forEach((t) => {
      flat.push(t);
      walk(t.id);
    });
  walk(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All sections
        </Button>
        <h2 className="text-lg font-semibold">{section}</h2>
        <span className="text-sm text-muted-foreground">
          {lines.length} syllabus lines from {exams.join(", ") || "no exam"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {topics.length > 0 && loose.length > 0 && (
            <Button size="sm" disabled={!!busy} onClick={() => void fit()}>
              <Sparkles className="mr-1 h-4 w-4" /> Link new lines ({loose.length})
            </Button>
          )}
          <Button
            size="sm"
            variant={topics.length ? "outline" : "default"}
            disabled={!!busy || !lines.length}
            onClick={() => void make(topics.length > 0)}
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {topics.length ? "Make it again" : "Make the outline"}
          </Button>
        </div>
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-primary">
          <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
        </p>
      )}
      {!topics.length && !busy && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No outline yet. “Make the outline” plans the chapters, topics and subtopics from these{" "}
          {lines.length} lines (one AI request), linking every line to the topics that cover it.
        </p>
      )}

      {topics.length > 0 && (
        <ol className="space-y-1" data-testid="outline">
          {flat.map((t) => (
            <TopicRow
              key={t.id}
              t={t}
              number={numbers.get(t.id) ?? ""}
              topics={topics}
              lines={lines}
              first={childrenOf(topics, t.parent_id)[0]?.id === t.id}
              last={childrenOf(topics, t.parent_id).at(-1)?.id === t.id}
              onChanged={refresh}
            />
          ))}
        </ol>
      )}
      {topics.length > 0 &&
        (newChapter ? (
          <NameForm
            label="New chapter"
            onCancel={() => setNewChapter(false)}
            onSave={async (en, hi) => {
              await addFn({ data: { section, parent: null, name_en: en, name_hi: hi } });
              setNewChapter(false);
              await refresh();
            }}
          />
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setNewChapter(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add a chapter
          </Button>
        ))}

      {topics.length > 0 && loose.length > 0 && (
        <section
          aria-label="Lines not in the outline"
          className="space-y-2 rounded-2xl border border-amber-400/60 bg-amber-500/5 p-3"
        >
          <h3 className="text-sm font-semibold">
            Syllabus lines not in the outline ({loose.length})
          </h3>
          <ul className="space-y-1.5">
            {loose.map((l) => (
              <LooseLine key={l.id} l={l} flat={flat} numbers={numbers} onChanged={refresh} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const LEVEL_STYLE = {
  chapter: "text-base font-semibold",
  topic: "font-medium",
  subtopic: "text-sm",
} as const;

function TopicRow({
  t,
  number,
  topics,
  lines,
  first,
  last,
  onChanged,
}: {
  t: MasterTopic;
  number: string;
  topics: MasterTopic[];
  lines: OutlineLine[];
  first: boolean;
  last: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const updateFn = useServerFn(updateMasterTopic);
  const deleteFn = useServerFn(deleteMasterTopic);
  const moveFn = useServerFn(moveMasterTopic);
  const addFn = useServerFn(addMasterTopic);
  const linkFn = useServerFn(setSyllabusLink);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const own = lines.filter((l) => l.topics.includes(t.id));
  const exams = topicExams(topics, lines, t.id);
  const next = childLevel(t.level);
  const depth = t.level === "chapter" ? 0 : t.level === "topic" ? 1 : 2;
  const act = (p: Promise<unknown>, err: string) =>
    void p.then(onChanged).catch((e) => toast.error(errorText(e, err)));
  return (
    <li
      data-topic={t.name_en}
      data-level={t.level}
      className={`group rounded-lg px-2 py-1 hover:bg-muted/40 ${t.level === "chapter" ? "mt-2 border-t border-border pt-2" : ""}`}
      style={{ paddingLeft: `calc(0.5rem + ${depth} * min(1.4rem, 4vw))` }}
    >
      {editing ? (
        <NameForm
          label={`Rename ${t.name_en}`}
          en={t.name_en}
          hi={t.name_hi}
          onCancel={() => setEditing(false)}
          onSave={async (en, hi) => {
            await updateFn({ data: { id: t.id, patch: { name_en: en, name_hi: hi } } });
            setEditing(false);
            await onChanged();
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{number}</span>
          <div className={`min-w-0 flex-1 basis-[14rem] ${LEVEL_STYLE[t.level]}`}>
            <span lang="hi">{t.name_hi}</span>
            {t.name_hi !== t.name_en && (
              <span className="ml-2 text-muted-foreground">{t.name_en}</span>
            )}
          </div>
          <span className="flex flex-wrap gap-1" data-exams>
            {exams.map((e) => (
              <span
                key={e}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
              >
                {e}
              </span>
            ))}
          </span>
          {own.length > 0 && (
            <button
              type="button"
              className="flex items-center text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={showLines}
              onClick={() => setShowLines(!showLines)}
            >
              {showLines ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {own.length} {own.length === 1 ? "line" : "lines"}
            </button>
          )}
          <span className="flex gap-0.5 opacity-60 group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Move ${t.name_en} up`}
              disabled={first}
              onClick={() => act(moveFn({ data: { id: t.id, dir: -1 } }), "Couldn't move it")}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Move ${t.name_en} down`}
              disabled={last}
              onClick={() => act(moveFn({ data: { id: t.id, dir: 1 } }), "Couldn't move it")}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Rename ${t.name_en}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {next && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-1.5"
                aria-label={`Add a ${next} under ${t.name_en}`}
                onClick={() => setAdding(!adding)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              aria-label={`Delete ${t.name_en}`}
              onClick={() => {
                const under = topics.filter((x) => x.parent_id === t.id).length;
                if (
                  !confirm(
                    `Delete “${t.name_en}”${under ? ` and the ${under} under it` : ""}? Its lines are unlinked.`,
                  )
                )
                  return;
                act(deleteFn({ data: { id: t.id } }), "Couldn't delete it");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
      )}
      {showLines && (
        <ul className="ml-12 mt-1 space-y-0.5 text-xs" aria-label={`Lines of ${t.name_en}`}>
          {own.map((l) => (
            <li key={l.id} className="flex items-start gap-1.5">
              <Badge tone="muted">{l.exam}</Badge>
              <span className="min-w-0 flex-1 text-muted-foreground">{l.text_en || l.text_hi}</span>
              <button
                type="button"
                aria-label={`Unlink ${l.text_en || l.text_hi}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  act(
                    linkFn({ data: { node: l.id, topic: t.id, on: false } }),
                    "Couldn't unlink it",
                  )
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && next && (
        <div className="mt-1">
          <NameForm
            label={`New ${next}`}
            onCancel={() => setAdding(false)}
            onSave={async (en, hi) => {
              await addFn({ data: { section: t.section, parent: t.id, name_en: en, name_hi: hi } });
              setAdding(false);
              await onChanged();
            }}
          />
        </div>
      )}
    </li>
  );
}

function LooseLine({
  l,
  flat,
  numbers,
  onChanged,
}: {
  l: OutlineLine;
  flat: MasterTopic[];
  numbers: Map<string, string>;
  onChanged: () => Promise<unknown>;
}) {
  const linkFn = useServerFn(setSyllabusLink);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone="muted">{l.exam}</Badge>
      <span className="min-w-0 flex-1 basis-[14rem]">{l.text_en || l.text_hi}</span>
      <select
        aria-label={`Link ${l.text_en || l.text_hi} to`}
        value=""
        onChange={(e) =>
          void linkFn({ data: { node: l.id, topic: e.target.value, on: true } })
            .then(onChanged)
            .catch((err) => toast.error(errorText(err, "Couldn't link it")))
        }
        className="h-8 max-w-[16rem] rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">Link to…</option>
        {flat.map((t) => (
          <option key={t.id} value={t.id}>
            {numbers.get(t.id)} {t.name_en}
          </option>
        ))}
      </select>
    </li>
  );
}

function NameForm({
  label,
  en: en0 = "",
  hi: hi0 = "",
  onSave,
  onCancel,
}: {
  label: string;
  en?: string;
  hi?: string;
  onSave: (en: string, hi: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [en, setEn] = useState(en0);
  const [hi, setHi] = useState(hi0);
  const [busy, setBusy] = useState(false);
  return (
    <form
      aria-label={label}
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(en.trim() || hi.trim(), hi.trim() || en.trim());
        } catch (err) {
          toast.error(errorText(err, "Couldn't save"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        aria-label="Name in Hindi"
        lang="hi"
        placeholder="हिंदी नाम"
        value={hi}
        maxLength={160}
        onChange={(e) => setHi(e.target.value)}
        className="h-8 w-56"
      />
      <Input
        aria-label="Name in English"
        placeholder="English name"
        value={en}
        maxLength={160}
        onChange={(e) => setEn(e.target.value)}
        className="h-8 w-56"
      />
      <Button size="sm" type="submit" disabled={busy || (!en.trim() && !hi.trim())}>
        Save
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
