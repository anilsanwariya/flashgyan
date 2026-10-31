// The atlas's Practice tab (admin): MCQs made from the atlas and the notes,
// checked here (approve, reject, correct), the approved ones published as
// MCQ Practice sets; and the notes' revision cards sent to the Card studio.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import {
  atlasPracticeStatus,
  generateAtlasMcqs,
  listAtlasMcqs,
  publishAtlasMcqs,
  resumeAtlasMcqOptions,
  runAtlasStep,
  saveAtlasMcq,
  sendAtlasCards,
  setAtlasMcqStatus,
  type AtlasMcqRow,
} from "@/lib/atlas.functions";
import type { Bi } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MIGRATION =
  "Practice needs its database table: run the migration 20261213090000_atlas_practice.sql.";
const KINDS: { key: AtlasMcqRow["kind"]; name: string }[] = [
  { key: "place-district", name: "Place → district" },
  { key: "district-division", name: "District → division" },
  { key: "district-zone", name: "District → agro zone" },
  { key: "notes", name: "Notes questions" },
];
type Status = "draft" | "approved" | "rejected" | "waiting";
const STATUS: { key: Status; name: string }[] = [
  { key: "draft", name: "To check" },
  { key: "approved", name: "Approved" },
  { key: "rejected", name: "Rejected" },
  { key: "waiting", name: "Waiting for AI options" },
];
const PAGE = 100;

export function AtlasPractice() {
  const statusFn = useServerFn(atlasPracticeStatus);
  const generateFn = useServerFn(generateAtlasMcqs);
  const stepFn = useServerFn(runAtlasStep);
  const resumeFn = useServerFn(resumeAtlasMcqOptions);
  const publishFn = useServerFn(publishAtlasMcqs);
  const cardsFn = useServerFn(sendAtlasCards);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlasPractice"],
    queryFn: () => statusFn(),
    refetchOnMount: "always",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["atlasPractice"] }),
      qc.invalidateQueries({ queryKey: ["atlasMcqs"] }),
    ]);
  const act = async (what: string, f: () => Promise<string>) => {
    setBusy(what);
    try {
      toast.success(await f());
    } catch (e) {
      toast.error(errorText(e, "Couldn't do that"));
    } finally {
      setBusy(null);
      await refresh();
    }
  };
  // The AI's wrong options, written from this page a batch at a time (the
  // minute tick does the same, more slowly).
  const writeOptions = async () => {
    setBusy("options");
    stop.current = false;
    try {
      await resumeFn();
      for (let i = 0; i < 200 && !stop.current; i++) {
        const r = await stepFn();
        if (i % 2 === 0) await refresh();
        if (!r.did) break;
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't write the options"));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const s = q.data!;
  if (!s.ready) return <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION}</p>;
  const stat = (label: string, n: number) => (
    <div className="rounded-xl border border-border p-3">
      <p className="text-2xl font-bold">{n.toLocaleString("en-IN")}</p>
      <p className="text-sm">{label}</p>
    </div>
  );
  const spin = (what: string) =>
    busy === what ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null;
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">MCQs from the atlas</h3>
        <p className="text-sm text-muted-foreground">
          Questions are made from verified places and facts only: which district a place is in (the
          wrong options are its neighbouring districts), each district's division and agro-climatic
          zone, and the questions in your notes (the AI checks that the answer after each one in the
          notes really answers it, then writes three wrong options). Students see them only after
          you approve them and publish.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stat("Questions", s.total)}
          {stat("To check", s.draft)}
          {stat("Approved", s.approved)}
          {stat("Rejected", s.rejected)}
          {stat("Waiting for AI options", s.waiting)}
        </div>
        {s.job.error && (
          <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
            The AI's options stopped: {s.job.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!!busy}
            onClick={() =>
              act("generate", async () => {
                const r = await generateFn();
                return `${r.added} new, ${r.changed} changed, ${r.removed} removed · ${r.waiting} waiting for AI options`;
              })
            }
          >
            {spin("generate")}Make questions from the atlas
          </Button>
          {busy === "options" ? (
            <Button variant="outline" onClick={() => (stop.current = true)}>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Stop writing options
            </Button>
          ) : (
            <Button variant="outline" disabled={!!busy || !s.waiting} onClick={writeOptions}>
              Write wrong options now ({s.waiting})
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!!busy || !s.approved}
            onClick={() =>
              act("publish", async () => {
                const r = await publishFn();
                return `${r.questions} questions published in ${r.sets} MCQ Practice sets`;
              })
            }
          >
            {spin("publish")}Publish approved to MCQ Practice
          </Button>
        </div>
        {s.orphans.length > 0 && (
          <details className="rounded-lg bg-amber-500/10 p-3 text-sm">
            <summary className="cursor-pointer">
              {s.orphans.length} self-test answers in your notes have no question before them, so
              they can't become questions yet
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              In the Facts tab, search for the answer and put its question first, in one fact, for
              example “Which divisions were cancelled? Pali, Sikar, Banswara.” Then make the
              questions again.
            </p>
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs">
              {s.orphans.map((o, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">{o.chapter} · </span>
                  {o.text}
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-xs text-muted-foreground">
          {s.publishedSets
            ? `${s.publishedSets} atlas sets are in MCQ Practice now. Publishing again replaces them with the approved questions.`
            : "No atlas sets in MCQ Practice yet."}{" "}
          Your corrections are kept when you make the questions again.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Flashcards for the Card studio</h3>
        <p className="text-sm text-muted-foreground">
          Your notes' revision lines ("Bajra: …" → front "Bajra", back the rest), from verified
          facts, and the notes' questions you have approved above go to the Card studio topic
          “Rajasthan Atlas · revision cards”. Cards sent before are left as you have them there;
          only new ones are added.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              act("cards", async () => {
                const r = await cardsFn();
                return `${r.added} new cards sent to the Card studio (${r.kept} were there already)`;
              })
            }
          >
            {spin("cards")}Send cards to the Card studio
          </Button>
          {s.studio.topic && (
            <a
              className="text-sm text-primary underline"
              href={`/admin?section=cardStudio&topic=${s.studio.topic}`}
            >
              Open the topic ({s.studio.cards} cards sent)
            </a>
          )}
        </div>
      </section>

      <McqList sets={[...s.sets]} />
    </div>
  );
}

function McqList({ sets }: { sets: string[] }) {
  const listFn = useServerFn(listAtlasMcqs);
  const statusFn = useServerFn(setAtlasMcqStatus);
  const qc = useQueryClient();
  const [f, setF] = useState<{
    status: Status | "";
    kind: AtlasMcqRow["kind"] | "";
    set: string;
    q: string;
    page: number;
  }>({ status: "draft", kind: "", set: "", q: "", page: 0 });
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, q: search, page: 0 })), 400);
    return () => clearTimeout(t);
  }, [search]);
  const q = useQuery({
    queryKey: ["atlasMcqs", f],
    queryFn: () =>
      listFn({
        data: {
          ...(f.status ? { status: f.status } : {}),
          ...(f.kind ? { kind: f.kind } : {}),
          ...(f.set ? { set: f.set } : {}),
          ...(f.q ? { q: f.q } : {}),
          page: f.page,
        },
      }),
    placeholderData: (p) => p,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["atlasMcqs"] }),
      qc.invalidateQueries({ queryKey: ["atlasPractice"] }),
    ]);
  const mark = async (ids: string[], status: "draft" | "approved" | "rejected") => {
    if (!ids.length) return;
    try {
      await statusFn({ data: { ids, status } });
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const rows = q.data?.rows ?? [];
  const ready = rows.filter((r) => !r.pending).map((r) => r.id);
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const pages = Math.ceil((q.data?.total ?? 0) / PAGE);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Question status"
          className={select}
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value as Status | "", page: 0 })}
        >
          <option value="">Any status</option>
          {STATUS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Question kind"
          className={select}
          value={f.kind}
          onChange={(e) =>
            setF({ ...f, kind: e.target.value as AtlasMcqRow["kind"] | "", page: 0 })
          }
        >
          <option value="">Any kind</option>
          {KINDS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Set"
          className={`${select} max-w-72`}
          value={f.set}
          onChange={(e) => setF({ ...f, set: e.target.value, page: 0 })}
        >
          <option value="">Every set</option>
          {sets.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <Input
          aria-label="Search questions"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{q.data?.total ?? "…"} questions</span>
        {ready.length > 0 && f.status !== "approved" && (
          <Button size="sm" variant="outline" onClick={() => mark(ready, "approved")}>
            <Check className="mr-1 h-4 w-4" />
            Approve these {ready.length}
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {rows.map((m) => (
          <McqRow key={m.id} mcq={m} onMark={(s) => mark([m.id], s)} onSaved={refresh} />
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={f.page === 0}
            onClick={() => setF({ ...f, page: f.page - 1 })}
          >
            Previous
          </Button>
          <span>
            Page {f.page + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={f.page >= pages - 1}
            onClick={() => setF({ ...f, page: f.page + 1 })}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}

function McqRow({
  mcq,
  onMark,
  onSaved,
}: {
  mcq: AtlasMcqRow;
  onMark: (s: "draft" | "approved" | "rejected") => Promise<void>;
  onSaved: () => Promise<unknown>;
}) {
  const saveFn = useServerFn(saveAtlasMcq);
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState(() => draftOf(mcq));
  const kind = KINDS.find((k) => k.key === mcq.kind)?.name ?? mcq.kind;
  const save = async () => {
    try {
      await saveFn({ data: { id: mcq.id, ...d } });
      setEdit(false);
      toast.success("Saved");
      await onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const biInput = (label: string, v: Bi, set: (b: Bi) => void, rows = 1) =>
    rows > 1 ? (
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          aria-label={`${label} (English)`}
          rows={rows}
          value={v.en}
          onChange={(e) => set({ ...v, en: e.target.value })}
        />
        <Textarea
          aria-label={`${label} (Hindi)`}
          lang="hi"
          rows={rows}
          value={v.hi}
          onChange={(e) => set({ ...v, hi: e.target.value })}
        />
      </div>
    ) : (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label={`${label} (English)`}
          value={v.en}
          onChange={(e) => set({ ...v, en: e.target.value })}
        />
        <Input
          aria-label={`${label} (Hindi)`}
          lang="hi"
          value={v.hi}
          onChange={(e) => set({ ...v, hi: e.target.value })}
        />
      </div>
    );
  return (
    <li className="space-y-2 rounded-xl border border-border p-3 text-sm" data-mcq-row={mcq.key}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge>{kind}</Badge>
        <span className="truncate">{mcq.set_name}</span>
        {mcq.pending && <Badge tone="warn">Waiting for AI options</Badge>}
        {mcq.edited && <Badge tone="primary">Edited</Badge>}
        {mcq.status === "approved" && <Badge tone="good">Approved</Badge>}
        {mcq.status === "rejected" && <Badge tone="bad">Rejected</Badge>}
        {!mcq.pending && !edit && (
          <span className="ml-auto flex gap-1">
            {mcq.status !== "approved" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => onMark("approved")}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>
            )}
            {mcq.status !== "rejected" && (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => onMark("rejected")}>
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setD(draftOf(mcq));
                setEdit(true);
              }}
            >
              Edit
            </Button>
          </span>
        )}
      </div>
      {mcq.note && (
        <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          {mcq.note}
        </p>
      )}
      {edit ? (
        <div className="space-y-2">
          {biInput("Question", d.question, (question) => setD({ ...d, question }), 2)}
          {d.options.map((o, i) => (
            <div key={i} className="flex items-start gap-2">
              <label className="mt-2 flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name={`answer-${mcq.id}`}
                  aria-label={`Option ${i + 1} is the answer`}
                  checked={d.answer === i + 1}
                  onChange={() => setD({ ...d, answer: i + 1 })}
                />
                {i + 1}
              </label>
              <div className="flex-1">
                {biInput(`Option ${i + 1}`, o, (b) =>
                  setD({ ...d, options: d.options.map((x, k) => (k === i ? b : x)) }),
                )}
              </div>
            </div>
          ))}
          {biInput("Explanation", d.explanation, (explanation) => setD({ ...d, explanation }), 2)}
          <Input
            aria-label="Set name"
            value={d.set_name}
            onChange={(e) => setD({ ...d, set_name: e.target.value })}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="font-medium">{mcq.question.en}</p>
          {mcq.question.hi && <p className="text-muted-foreground">{mcq.question.hi}</p>}
          {mcq.pending ? (
            <p className="text-xs text-muted-foreground">Answer: {mcq.explanation.en}</p>
          ) : (
            <ol className="grid gap-1 sm:grid-cols-2">
              {mcq.options.map((o, i) => (
                <li
                  key={i}
                  className={`rounded-md border px-2 py-1 ${
                    mcq.answer === i + 1 ? "border-emerald-500 bg-emerald-500/10" : "border-border"
                  }`}
                >
                  {i + 1}. {o.en}
                  {o.hi && o.hi !== o.en && (
                    <span className="text-muted-foreground"> · {o.hi}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

function draftOf(m: AtlasMcqRow) {
  const options = [0, 1, 2, 3].map((i) => m.options[i] ?? { en: "", hi: "" });
  return {
    question: m.question,
    options,
    answer: m.answer,
    explanation: m.explanation,
    set_name: m.set_name,
  };
}
