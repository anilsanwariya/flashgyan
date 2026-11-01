// Exam papers by type and section, tagged on the exam's syllabus: the type
// picker when adding a paper, the paper's sections (question ranges) and
// syllabus on its page, each question's section and tag, and the section
// list (a setting).
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListTree, Plus, RefreshCw, Tags, Trash2 } from "lucide-react";
import {
  getExamSections,
  reviewExamPaper,
  saveExamSections,
  updateExamPaper,
} from "@/lib/exam-papers.functions";
import { listSyllabi } from "@/lib/syllabus.functions";
import { examTitle } from "@/lib/syllabus";
import { SUBJECT_SECTIONS, type ExamPaper, type ExamQuestion } from "@/lib/exam-papers";
import {
  guessSyllabus,
  PAPER_TYPES,
  paperTypeLabel,
  rangeProblems,
  sectionOf,
  type PaperSection,
  type SectionRange,
  type Tag,
} from "@/lib/exam-sections";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// What a paper's page knows about tagging (from getExamPaper).
export type Tagging = {
  syllabus: { id: string; title: string; guessed: boolean } | null;
  syllabi: { id: string; title: string }[];
  lines: { n: number; id: string; text: string }[];
  tags: Record<string, Tag>;
  old: { name: string; heads: string[] } | null;
  sections: PaperSection[];
  ranges: SectionRange[];
};
const TaggingContext = createContext<Tagging | null>(null);
export const TaggingProvider = TaggingContext.Provider;
export const useTagging = () => useContext(TaggingContext);

function useSections() {
  const fn = useServerFn(getExamSections);
  return useQuery({ queryKey: ["examSections"], queryFn: () => fn(), staleTime: 60_000 });
}
function useCurrentSyllabi() {
  const fn = useServerFn(listSyllabi);
  return useQuery({ queryKey: ["syllabi"], queryFn: () => fn(), staleTime: 60_000 });
}

// ====================== Adding a paper ======================

export type TypeChoice = {
  paper_type: string;
  // For "One GK subject".
  subject: string;
  // For "Other sections…".
  custom: string[];
  // The exam's syllabus to tag on ("" guessed from the exam's name).
  exam_syllabus_id: string;
};
export const NEW_TYPE: TypeChoice = {
  paper_type: "gkgs",
  subject: "",
  custom: [],
  exam_syllabus_id: "",
};

// The paper's sections and subject from a choice (ranges set later).
export function typeToMeta(c: TypeChoice, guessed: string | null) {
  const t = PAPER_TYPES.find((x) => x.key === c.paper_type) ?? PAPER_TYPES[0];
  const keys: string[] = t.key === "custom" ? c.custom : [...t.sections];
  return {
    paper_type: t.key,
    sections: keys.map((key) => ({ key, from: null, to: null })),
    subject: t.key === "subject" ? c.subject : t.key === "custom" ? "" : t.label,
    exam_syllabus_id: c.exam_syllabus_id || guessed || null,
  };
}

export function PaperTypePicker({
  exam,
  value,
  onChange,
  onGuess,
}: {
  exam: string;
  value: TypeChoice;
  onChange: (v: TypeChoice) => void;
  // The syllabus guessed from the exam's name (when none is chosen).
  onGuess: (id: string | null) => void;
}) {
  const sections = useSections().data ?? [];
  const syllabi = useCurrentSyllabi().data?.exams ?? [];
  const guess = guessSyllabus(exam, syllabi);
  useEffect(() => onGuess(guess?.id ?? null), [guess?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-paper-type-picker>
      <div className="space-y-1">
        <select
          aria-label="Paper type"
          value={value.paper_type}
          onChange={(e) => onChange({ ...value, paper_type: e.target.value })}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {PAPER_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              Paper: {t.label}
            </option>
          ))}
        </select>
        {value.paper_type === "subject" && (
          <select
            aria-label="GK subject"
            value={value.subject}
            onChange={(e) => onChange({ ...value, subject: e.target.value })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Choose the subject…</option>
            {SUBJECT_SECTIONS.map((s) => (
              <option key={s.en} value={s.en}>
                {s.en}
              </option>
            ))}
          </select>
        )}
        {value.paper_type === "custom" && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Sections">
            {sections.map((s) => (
              <label key={s.key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  aria-label={`Section ${s.name_en}`}
                  checked={value.custom.includes(s.key)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      custom: e.target.checked
                        ? [...value.custom, s.key]
                        : value.custom.filter((k) => k !== s.key),
                    })
                  }
                />
                {s.name_en}
              </label>
            ))}
          </div>
        )}
      </div>
      <select
        aria-label="Tag on syllabus"
        value={value.exam_syllabus_id}
        onChange={(e) => onChange({ ...value, exam_syllabus_id: e.target.value })}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">
          {guess ? `Tag on: ${examTitle(guess)} (from the exam's name)` : "Tag on: no syllabus yet"}
        </option>
        {syllabi.map((s) => (
          <option key={s.id} value={s.id}>
            Tag on: {examTitle(s)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ====================== On the paper's page ======================

export function PaperSections({
  paper,
  questions,
  tagging,
  locked,
  onChanged,
}: {
  paper: ExamPaper;
  questions: ExamQuestion[];
  tagging: Tagging | null;
  locked?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const fn = useServerFn(updateExamPaper);
  const reviewFn = useServerFn(reviewExamPaper);
  const all = tagging?.sections ?? [];
  const [ranges, setRanges] = useState<SectionRange[]>(tagging?.ranges ?? []);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  const saved = JSON.stringify(tagging?.ranges ?? []);
  useEffect(() => setRanges(tagging?.ranges ?? []), [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tagging)
    return (
      <p className="text-xs text-muted-foreground" data-paper-sections>
        Paper types, sections and syllabus tags need a database update: run the latest migration
        (paper_sections).
      </p>
    );
  const name = (k: string) => all.find((s) => s.key === k)?.name_en ?? k;
  const changed = JSON.stringify(ranges) !== saved;
  const problems = rangeProblems(ranges);
  // Questions deleted by the key aren't tagged.
  const live = questions.filter((q) => !q.deleted).length;
  const untagged = questions.filter((q) => !q.syllabus_node_id && !q.deleted);
  const count = (k: string) => questions.filter((q) => sectionOf(ranges, q) === k).length;
  const unsorted = ranges.length > 1 ? questions.filter((q) => !sectionOf(ranges, q)).length : 0;

  async function save(
    patch: {
      exam_syllabus_id?: string | null;
      sections?: SectionRange[];
    },
    ok: string,
  ) {
    try {
      await fn({ data: { id: paper.id, meta: patch } });
      toast.success(ok);
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }
  async function tag() {
    stop.current = false;
    const ids = untagged.map((q) => q.id);
    let done = 0;
    try {
      for (let i = 0; i < ids.length && !stop.current; i += 8) {
        setBusy(`Tagging on the syllabus: ${done} of ${ids.length}…`);
        const r = await reviewFn({ data: { id: paper.id, redo: ids.slice(i, i + 8) } });
        done += r.done;
        await onChanged();
      }
      toast.success(`${done} questions checked and tagged`);
    } catch (e) {
      toast.error(errorText(e, "Tagging stopped"));
    } finally {
      setBusy(null);
      await onChanged();
    }
  }

  return (
    <div className="space-y-2 text-sm" data-paper-sections>
      <div className="flex flex-wrap items-center gap-2">
        <ListTree className="h-4 w-4 text-muted-foreground" />
        <span>
          {paper.paper_type ? (
            <>
              Paper: <span className="font-medium">{paperTypeLabel(paper.paper_type)}</span>
              {paper.paper_type === "subject" && paper.subject ? ` (${paper.subject})` : ""}
            </>
          ) : (
            <span className="text-muted-foreground">No paper type set.</span>
          )}
        </span>
        <select
          aria-label="Tag on syllabus"
          value={paper.exam_syllabus_id ?? ""}
          disabled={locked}
          onChange={(e) =>
            void save({ exam_syllabus_id: e.target.value || null }, "Syllabus to tag on saved")
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">
            {tagging.syllabus?.guessed
              ? `Tag on: ${tagging.syllabus.title} (from the exam's name)`
              : "Tag on: no syllabus found"}
          </option>
          {tagging.syllabi.map((s) => (
            <option key={s.id} value={s.id}>
              Tag on: {s.title}
            </option>
          ))}
        </select>
        {tagging.syllabus && (
          <Badge tone={untagged.length ? "warn" : "good"}>
            {live - untagged.length} of {live} tagged
          </Badge>
        )}
        {tagging.syllabus && untagged.length > 0 && !locked && !busy && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => void tag()}>
            <Tags className="mr-1 h-3.5 w-3.5" /> Tag {untagged.length} untagged
          </Button>
        )}
        {busy && (
          <span role="status" className="flex items-center gap-1 text-xs text-primary">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {busy}
            <Button size="sm" variant="ghost" className="h-6" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          </span>
        )}
      </div>
      {tagging.old && (
        <p className="text-xs text-muted-foreground">
          Tagged on the latest syllabus; the old one it followed ({tagging.old.name}) guides the AI.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2" aria-label="Paper sections">
        {ranges.map((r, i) => {
          const lang = all.find((s) => s.key === r.key)?.lang;
          return (
            <span
              key={r.key}
              className="inline-flex items-center gap-1 rounded-xl border border-border px-2 py-1 text-xs"
              data-section={r.key}
            >
              <span className="font-medium">{name(r.key)}</span>
              {lang && (
                <span className="text-muted-foreground">
                  ({lang === "hi" ? "Hindi" : "English"} only)
                </span>
              )}
              {ranges.length > 1 && (
                <>
                  <Input
                    aria-label={`${name(r.key)} from question`}
                    inputMode="numeric"
                    placeholder="from"
                    disabled={locked}
                    value={r.from ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) || null;
                      setRanges(ranges.map((x, k) => (k === i ? { ...x, from: v } : x)));
                    }}
                    className="h-6 w-14 px-1 text-xs"
                  />
                  –
                  <Input
                    aria-label={`${name(r.key)} to question`}
                    inputMode="numeric"
                    placeholder="to"
                    disabled={locked}
                    value={r.to ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) || null;
                      setRanges(ranges.map((x, k) => (k === i ? { ...x, to: v } : x)));
                    }}
                    className="h-6 w-14 px-1 text-xs"
                  />
                </>
              )}
              <span className="text-muted-foreground">· {count(r.key)}</span>
              {!locked && (
                <button
                  type="button"
                  aria-label={`Remove section ${name(r.key)}`}
                  onClick={() => setRanges(ranges.filter((_, k) => k !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        {!locked && (
          <select
            aria-label="Add a section"
            value={adding}
            onChange={(e) => {
              const k = e.target.value;
              setAdding("");
              if (k && !ranges.some((r) => r.key === k))
                setRanges([...ranges, { key: k, from: null, to: null }]);
            }}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">+ Section</option>
            {all
              .filter((s) => !ranges.some((r) => r.key === s.key))
              .map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name_en}
                </option>
              ))}
          </select>
        )}
        {changed && !locked && (
          <Button
            size="sm"
            className="h-7"
            disabled={problems.length > 0}
            onClick={() => void save({ sections: ranges }, "Sections saved")}
          >
            Save sections
          </Button>
        )}
      </div>
      {problems.length > 0 && (
        <p className="text-xs text-destructive" role="alert">
          {problems.join("; ")}
        </p>
      )}
      {unsorted > 0 && (
        <p className="text-xs text-muted-foreground">
          {unsorted} questions not in a section yet: give each section its questions (from–to), or
          the AI check sorts them.
        </p>
      )}
    </div>
  );
}

// A question's section and tag, on its card.
export function QuestionTag({ q, lang }: { q: ExamQuestion; lang: "both" | "hi" | "en" }) {
  const t = useTagging();
  if (!t) return null;
  const key = sectionOf(t.ranges, q);
  const section = t.ranges.length > 1 || t.sections.find((s) => s.key === key)?.lang;
  const tag = q.syllabus_node_id ? t.tags[q.syllabus_node_id] : null;
  const hi = lang === "hi";
  return (
    <>
      {section && key && (
        <span data-q-section={key}>
          <Badge tone="muted">
            {t.sections.find((s) => s.key === key)?.[hi ? "name_hi" : "name_en"] ?? key}
          </Badge>
        </span>
      )}
      {tag && (
        <span className="text-xs text-muted-foreground" data-q-tag>
          {[tag.subject, hi ? tag.topic_hi : tag.topic_en, hi ? tag.subtopic_hi : tag.subtopic_en]
            .filter(Boolean)
            .map((x) => x.slice(0, 60))
            .join(" › ")}
        </span>
      )}
    </>
  );
}

// In the question editor: its section and syllabus line.
export function TagFields({
  q,
  value,
  onChange,
}: {
  q: ExamQuestion;
  value: { paper_section: string; syllabus_node_id: string };
  onChange: (v: { paper_section: string; syllabus_node_id: string }) => void;
}) {
  const t = useTagging();
  if (!t) return null;
  const covered = t.ranges.some((r) => r.from && r.to && q.q_no >= r.from && q.q_no <= r.to);
  return (
    <>
      {t.ranges.length > 1 && (
        <select
          aria-label="Section"
          value={covered ? sectionOf(t.ranges, q) : value.paper_section}
          disabled={covered}
          title={covered ? "Set by the paper's question ranges" : undefined}
          onChange={(e) => onChange({ ...value, paper_section: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Section: not set</option>
          {t.ranges.map((r) => (
            <option key={r.key} value={r.key}>
              Section: {t.sections.find((s) => s.key === r.key)?.name_en ?? r.key}
            </option>
          ))}
        </select>
      )}
      {t.lines.length > 0 && (
        <select
          aria-label="Syllabus line"
          value={value.syllabus_node_id}
          onChange={(e) => onChange({ ...value, syllabus_node_id: e.target.value })}
          className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm sm:max-w-md"
        >
          <option value="">Syllabus line: not tagged</option>
          {t.lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.text.slice(0, 140)}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

// ====================== The section list (a setting) ======================

export function SectionsSettings() {
  const qc = useQueryClient();
  const q = useSections();
  const fn = useServerFn(saveExamSections);
  const [list, setList] = useState<PaperSection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = list ?? q.data ?? [];
  const set = (i: number, patch: Partial<PaperSection>) =>
    setList(rows.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <details className="rounded-2xl border border-border bg-card p-4" data-sections-settings>
      <summary className="cursor-pointer font-semibold">Paper sections</summary>
      <p className="mt-2 text-sm text-muted-foreground">
        The sections a paper is made of. A language section keeps its questions in that language
        only: they are never translated, explained in that language and not checked against a
        translation.
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((s, i) => (
          <li key={s.key || i} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Section ${i + 1} name`}
              value={s.name_en}
              onChange={(e) => set(i, { name_en: e.target.value })}
              className="h-8 w-56 text-sm"
            />
            <Input
              aria-label={`Section ${i + 1} Hindi name`}
              lang="hi"
              value={s.name_hi}
              onChange={(e) => set(i, { name_hi: e.target.value })}
              className="h-8 w-56 text-sm"
            />
            <select
              aria-label={`Section ${i + 1} language`}
              value={s.lang ?? ""}
              onChange={(e) => set(i, { lang: (e.target.value || null) as PaperSection["lang"] })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Both languages</option>
              <option value="hi">Hindi only (a language section)</option>
              <option value="en">English only (a language section)</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove section ${s.name_en}`}
              onClick={() => setList(rows.filter((_, k) => k !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setList([...rows, { key: "", name_en: "", name_hi: "", lang: null }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add a section
        </Button>
        {list && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await fn({ data: { sections: list } });
                setList(null);
                await qc.invalidateQueries({ queryKey: ["examSections"] });
                toast.success("Sections saved");
              } catch (e) {
                toast.error(errorText(e, "Couldn't save"));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save sections
          </Button>
        )}
      </div>
    </details>
  );
}
