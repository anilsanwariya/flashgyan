// The old syllabus an exam paper followed (set before the syllabus changed):
// chosen from the old syllabi kept for old papers, or uploaded with the
// paper and read like any syllabus. Kept out of the Syllabus feature; it
// helps read and sort the paper.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpenCheck, FileUp } from "lucide-react";
import { createSyllabus, listOldSyllabi } from "@/lib/syllabus.functions";
import { setExamPaperSyllabus } from "@/lib/exam-papers.functions";
import { examTitle, STAGES, type Stage } from "@/lib/syllabus";
import type { ExamPaper } from "@/lib/exam-papers";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queueSyllabusFiles, syllabusQueued, SyllabusView } from "@/components/syllabus-panel";

export type OldSyllabusChoice = {
  // "" the exam's latest syllabus, "new" an old one uploaded now, or an old
  // syllabus's id.
  pick: string;
  en: File | null;
  hi: File | null;
  stage: Stage;
};
export const NO_OLD_SYLLABUS: OldSyllabusChoice = {
  pick: "",
  en: null,
  hi: null,
  stage: "prelims",
};

function useOldSyllabi() {
  const fn = useServerFn(listOldSyllabi);
  return useQuery({ queryKey: ["oldSyllabi"], queryFn: () => fn(), staleTime: 60_000 });
}

// In the Add a paper form.
export function OldSyllabusPicker({
  value,
  onChange,
}: {
  value: OldSyllabusChoice;
  onChange: (v: OldSyllabusChoice) => void;
}) {
  const old = useOldSyllabi().data?.exams ?? [];
  return (
    <div className="space-y-2 text-sm" data-old-syllabus-picker>
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Syllabus it followed</span>
        <select
          aria-label="Syllabus it followed"
          value={value.pick}
          onChange={(e) => onChange({ ...value, pick: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">The exam's latest syllabus</option>
          {old.map((e) => (
            <option key={e.id} value={e.id}>
              Old: {examTitle(e)}
              {e.notified_on ? ` (${e.notified_on.slice(0, 4)})` : ""}
            </option>
          ))}
          <option value="new">An older syllabus: upload it…</option>
        </select>
      </label>
      {value.pick === "new" && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <p className="basis-full text-xs text-muted-foreground">
            The syllabus as it was when this paper was set. It's kept for old papers only: it helps
            read and sort them, and never shows in the Syllabus section (that follows the exam's
            latest syllabus).
          </p>
          <select
            aria-label="Old syllabus stage"
            value={value.stage}
            onChange={(e) => onChange({ ...value, stage: e.target.value as Stage })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Old syllabus, English PDF</span>
            <Input
              type="file"
              accept="application/pdf"
              aria-label="Old syllabus, English PDF"
              onChange={(e) => onChange({ ...value, en: e.target.files?.[0] ?? null })}
              className="h-9 w-60 text-xs"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block">Old syllabus, Hindi PDF</span>
            <Input
              type="file"
              accept="application/pdf"
              aria-label="Old syllabus, Hindi PDF"
              onChange={(e) => onChange({ ...value, hi: e.target.files?.[0] ?? null })}
              className="h-9 w-60 text-xs"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// After the paper is added: its old syllabus linked (a new one made, its
// PDFs queued to read when it opens).
export async function linkOldSyllabus(
  paper: { id: string; exam: string; conducted_by: string; written: boolean },
  choice: OldSyllabusChoice,
  fns: {
    create: ReturnType<typeof useServerFn<typeof createSyllabus>>;
    link: ReturnType<typeof useServerFn<typeof setExamPaperSyllabus>>;
  },
) {
  if (!choice.pick) return null;
  let syllabusId = choice.pick;
  if (choice.pick === "new") {
    const files = [choice.en, choice.hi].filter((x): x is File => !!x);
    if (!files.length) throw new Error("Choose the old syllabus PDF (English or Hindi).");
    const { pdfPageCount } = await import("@/lib/exam-pdf");
    const counts = await Promise.all(files.map(pdfPageCount));
    const e = await fns.create({
      data: {
        name: `${paper.exam} (old syllabus)`.slice(0, 120),
        body: paper.conducted_by.slice(0, 60),
        stage: choice.stage,
        notified_on: null,
        pages: Math.max(...counts),
        mode: paper.written ? "written" : "objective",
        archived: true,
      },
    });
    queueSyllabusFiles(e.id, { en: choice.en, hi: choice.hi, scheme: null });
    syllabusId = e.id;
  }
  await fns.link({ data: { id: paper.id, syllabus_id: syllabusId } });
  return syllabusId;
}

type Linked = {
  id: string;
  name: string;
  stage: string;
  notified_on: string | null;
  pages: number;
  pages_done: number;
  status: string;
  lines: number;
} | null;

// On the paper's page: the old syllabus it followed, to open, change or
// remove.
export function PaperSyllabus({
  paper,
  syllabus,
  locked,
  onChanged,
}: {
  paper: ExamPaper;
  syllabus: Linked;
  locked?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const linkFn = useServerFn(setExamPaperSyllabus);
  const createFn = useServerFn(createSyllabus);
  const old = useOldSyllabi();
  const [open, setOpen] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [choice, setChoice] = useState<OldSyllabusChoice>(NO_OLD_SYLLABUS);
  const [busy, setBusy] = useState(false);
  // Uploaded with the paper: opened at once to read it.
  useEffect(() => {
    if (syllabus && syllabusQueued(syllabus.id)) setOpen(syllabus.id);
  }, [syllabus?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try {
      if (!choice.pick) await linkFn({ data: { id: paper.id, syllabus_id: null } });
      else
        await linkOldSyllabus(
          {
            id: paper.id,
            exam: paper.exam,
            conducted_by: paper.conducted_by,
            written: paper.kind === "subjective",
          },
          choice,
          { create: createFn, link: linkFn },
        );
      toast.success(choice.pick ? "Old syllabus linked" : "Follows the exam's latest syllabus");
      setChanging(false);
      await qc.invalidateQueries({ queryKey: ["oldSyllabi"] });
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm" data-paper-syllabus>
      <div className="flex flex-wrap items-center gap-2">
        <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
        {syllabus ? (
          <>
            <span>
              Followed an old syllabus:{" "}
              <span className="font-medium">{examTitle(syllabus as never)}</span>
            </span>
            <Badge tone={syllabus.pages_done < syllabus.pages ? "warn" : "muted"}>
              {syllabus.pages_done < syllabus.pages
                ? `Read ${syllabus.pages_done} of ${syllabus.pages} pages`
                : `${syllabus.lines} points`}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setOpen(syllabus.id)}
            >
              Open
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">Follows the exam's latest syllabus.</span>
        )}
        {!locked && !changing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              setChoice({ ...NO_OLD_SYLLABUS, pick: syllabus?.id ?? "" });
              setChanging(true);
            }}
          >
            {syllabus ? "Change" : "It followed an older syllabus"}
          </Button>
        )}
      </div>
      {changing && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <OldSyllabusPicker value={choice} onChange={setChoice} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || old.isLoading} onClick={() => void save()}>
              <FileUp className="mr-1 h-4 w-4" /> {busy ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Old syllabus"
          className="fixed inset-0 z-50 overflow-y-auto bg-background p-4"
        >
          <SyllabusView
            id={open}
            backLabel="Back to the paper"
            onBack={() => {
              setOpen(null);
              void onChanged();
            }}
          />
        </div>
      )}
    </div>
  );
}
