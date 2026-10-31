// Keeping the atlas complete (admin): every district's checklist of steps
// with notes for many districts imported at once, the queue of Hindi the AI
// wrote for the editor to check, and the report of what's thin or missing.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Circle, FileUp, Loader2 } from "lucide-react";
import {
  acceptAtlasHindi,
  atlasChecklist,
  atlasGapReport,
  atlasHindiCounts,
  atlasHindiQueue,
  atlasOverviewJob,
  matchAtlasNotes,
  runAtlasStep,
  type HindiItem,
  type NotesMatch,
} from "@/lib/atlas.functions";
import { STEPS, districtSteps, nextStep, type ChecklistRow } from "@/lib/atlas-review";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";

// ====================== District checklist ======================

export function DistrictChecklist({ onOpen }: { onOpen: (district: string) => void }) {
  const fn = useServerFn(atlasChecklist);
  const q = useQuery({
    queryKey: ["atlasChecklist"],
    queryFn: () => fn(),
    refetchOnMount: "always",
  });
  const [bulk, setBulk] = useState(false);
  const [only, setOnly] = useState<string>("");
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const rows = q.data ?? [];
  if (!rows.length)
    return (
      <p className="text-muted-foreground">
        Import the master map first: it adds the 41 districts.
      </p>
    );
  const done = (k: string) => rows.filter((r) => districtSteps(r)[k as never]).length;
  const shown = only ? rows.filter((r) => nextStep(r) === only) : rows;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          Each district's overview page, step by step: import your notes (like the Bikaner page),
          have both languages, fact-check against the atlas and the books, settle the notes, and
          publish. Open a district to work on it.
        </p>
        <Button variant="outline" onClick={() => setBulk(true)}>
          <FileUp className="mr-1.5 h-4 w-4" />
          Import notes for many districts
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Steps done">
        <button
          type="button"
          onClick={() => setOnly("")}
          className={`rounded-full border px-3 py-1 text-xs ${!only ? "border-primary bg-primary/10" : "border-border"}`}
        >
          All 41
        </button>
        {STEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            title={`Show the districts whose next step is this (${s.hint})`}
            onClick={() => setOnly(only === s.key ? "" : s.key)}
            className={`rounded-full border px-3 py-1 text-xs ${only === s.key ? "border-primary bg-primary/10" : "border-border"}`}
          >
            {s.name}: {done(s.key)}/{rows.length}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">District</th>
              {STEPS.map((s) => (
                <th key={s.key} className="px-1 py-2 text-center font-medium" title={s.hint}>
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <ChecklistLine key={r.district} r={r} onOpen={() => onOpen(r.district)} />
            ))}
          </tbody>
        </table>
      </div>
      {bulk && (
        <BulkImport
          onClose={() => {
            setBulk(false);
            void q.refetch();
          }}
        />
      )}
    </div>
  );
}

function ChecklistLine({ r, onOpen }: { r: ChecklistRow; onOpen: () => void }) {
  const steps = districtSteps(r);
  const next = nextStep(r);
  const why: Record<string, string> = {
    atlas: [
      !r.meta.division && "no division",
      !r.meta.zone && "no zone",
      !r.meta.neighbours && "no neighbours",
      r.places < 10 && `${r.places} places`,
    ]
      .filter(Boolean)
      .join(", "),
    notes: "",
    both: r.sections ? `English ${r.en}/${r.sections} · Hindi ${r.hi}/${r.sections}` : "",
    checked: "",
    "notes-done": r.openChecks ? `${r.openChecks} open` : "",
    published: "",
  };
  return (
    <tr
      className="cursor-pointer border-t border-border hover:bg-muted/40"
      onClick={onOpen}
      data-district={r.district}
    >
      <td className="px-3 py-2">
        <span className="font-medium">{r.district}</span>{" "}
        <span className="text-muted-foreground">{r.name_hi}</span>
        <p className="text-[11px] text-muted-foreground">
          {r.places} places · {r.facts} facts
          {r.factsToCheck ? ` · ${r.factsToCheck} to check` : ""}
          {r.factsAiHindi + r.placesAiHindi
            ? ` · ${r.factsAiHindi + r.placesAiHindi} AI Hindi`
            : ""}
        </p>
      </td>
      {STEPS.map((s) => (
        <td key={s.key} className="px-1 py-2 text-center" title={why[s.key] || s.hint}>
          {steps[s.key] ? (
            <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="done" />
          ) : (
            <Circle
              className={`mx-auto h-3.5 w-3.5 ${next === s.key ? "text-amber-500" : "text-muted-foreground/40"}`}
              aria-label="to do"
            />
          )}
        </td>
      ))}
      <td className="px-3 py-2 text-xs">
        {r.job ? (
          <span className={r.job.error ? "text-destructive" : "text-primary"}>
            {r.job.error
              ? `${r.job.kind} stopped: ${r.job.error}`
              : `${r.job.kind} ${r.job.done}/${r.job.total}…`}
          </span>
        ) : next ? (
          <span>
            {STEPS.find((s) => s.key === next)!.name}
            {why[next] && <span className="text-muted-foreground"> · {why[next]}</span>}
          </span>
        ) : (
          <Badge tone="good">Done</Badge>
        )}
      </td>
    </tr>
  );
}

// ====================== Notes for many districts ======================

type Picked = {
  name: string;
  text: string;
  match: NotesMatch | null;
  district: string;
  lang: "hi" | "en";
  on: boolean;
  result?: string;
  error?: boolean;
};

function BulkImport({ onClose }: { onClose: () => void }) {
  const matchFn = useServerFn(matchAtlasNotes);
  const jobFn = useServerFn(atlasOverviewJob);
  const stepFn = useServerFn(runAtlasStep);
  const listFn = useServerFn(atlasChecklist);
  const districts = useQuery({ queryKey: ["atlasChecklist"], queryFn: () => listFn() });
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState<"reading" | "importing" | "working" | null>(null);
  const [started, setStarted] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const names = (districts.data ?? []).map((d) => d.district);

  const read = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("reading");
    const out: Picked[] = [];
    for (const f of [...list]) {
      const text = await f.text();
      try {
        const match = await matchFn({ data: { name: f.name, text } });
        out.push({
          name: f.name,
          text,
          match,
          district: match.district ?? "",
          lang: match.lang,
          on: !!match.district && match.parts > 0 && !match.busy,
        });
      } catch (e) {
        out.push({
          name: f.name,
          text,
          match: null,
          district: "",
          lang: "hi",
          on: false,
          result: errorText(e, "Couldn't read"),
          error: true,
        });
      }
    }
    setFiles((x) => [...x, ...out]);
    setBusy(null);
  };
  const set = (i: number, p: Partial<Picked>) =>
    setFiles((x) => x.map((f, k) => (k === i ? { ...f, ...p } : f)));
  // Two files for one district: only the first is imported.
  const twice = (i: number) =>
    files.findIndex((f) => f.on && f.district && f.district === files[i].district) !== i;
  const chosen = files.filter((f, i) => f.on && f.district && !twice(i) && !f.result);

  const importAll = async () => {
    setBusy("importing");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.on || !f.district || twice(i) || f.result) continue;
      try {
        await jobFn({ data: { kind: "import", district: f.district, text: f.text, lang: f.lang } });
        set(i, { result: "Importing" });
      } catch (e) {
        set(i, { result: errorText(e, "Couldn't start"), error: true });
      }
    }
    setStarted(true);
    setBusy(null);
  };
  const workNow = async () => {
    setBusy("working");
    stop.current = false;
    try {
      for (let i = 0; i < 1000 && !stop.current; i++) {
        const r = await stepFn();
        if (!r.did) break;
      }
      toast.success("The imports are done");
    } catch (e) {
      toast.error(errorText(e, "Couldn't move on"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && busy !== "importing" && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import notes for many districts</DialogTitle>
          <DialogDescription>
            Choose your district notes files (HTML or text, like the Bikaner page). Each is matched
            to its district by its name and title; check the matches, then import. Each district's
            page is made from its notes a section at a time in the background; a page already there
            is replaced, its earlier version kept in the district's history.
          </DialogDescription>
        </DialogHeader>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-5 text-sm hover:border-primary">
          {busy === "reading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileUp className="h-4 w-4" />
          )}
          {busy === "reading" ? "Reading the files…" : "Choose notes files"}
          <input
            type="file"
            multiple
            accept=".html,.htm,.txt,.md,text/html,text/plain"
            className="sr-only"
            aria-label="Notes files"
            disabled={!!busy}
            onChange={(e) => {
              void read(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => {
              const m = f.match;
              const warn = [
                m && !m.parts && "too short to import",
                m?.busy && "a job is still running on this district",
                f.on && f.district && twice(i) && "another file is for the same district",
                f.district &&
                  m?.hasPage &&
                  f.district === m.district &&
                  "replaces its current page",
                m && !m.sure && m.district && "not sure of the district: check it",
                m && !m.district && "no district found: choose it",
              ].filter(Boolean) as string[];
              return (
                <li
                  key={`${f.name}-${i}`}
                  className="space-y-1.5 rounded-xl border border-border p-3 text-sm"
                  data-notes-file={f.name}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Import ${f.name}`}
                      checked={f.on}
                      disabled={!!f.result || !m?.parts}
                      onChange={(e) => set(i, { on: e.target.checked })}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                    <select
                      aria-label={`District for ${f.name}`}
                      className={select}
                      value={f.district}
                      disabled={!!f.result}
                      onChange={(e) => set(i, { district: e.target.value, on: !!e.target.value })}
                    >
                      <option value="">Choose the district…</option>
                      {names.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Language of ${f.name}`}
                      className={select}
                      value={f.lang}
                      disabled={!!f.result}
                      onChange={(e) => set(i, { lang: e.target.value as "hi" | "en" })}
                    >
                      <option value="hi">Hindi notes</option>
                      <option value="en">English notes</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m ? `${m.parts} parts · ${m.chars.toLocaleString("en-IN")} characters` : ""}
                    {m?.others.length ? ` · also mentions ${m.others.join(", ")}` : ""}
                  </p>
                  {warn.length > 0 && !f.result && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{warn.join(" · ")}</p>
                  )}
                  {f.result && (
                    <p className={`text-xs ${f.error ? "text-destructive" : "text-emerald-700"}`}>
                      {f.result}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {!started ? (
            <Button disabled={!!busy || !chosen.length} onClick={importAll}>
              {busy === "importing" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Import {chosen.length} {chosen.length === 1 ? "district" : "districts"}
            </Button>
          ) : busy === "working" ? (
            <Button variant="outline" onClick={() => (stop.current = true)}>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Stop
            </Button>
          ) : (
            <Button onClick={workNow}>Work on them now</Button>
          )}
          <Button variant="ghost" disabled={busy === "importing"} onClick={onClose}>
            Close
          </Button>
        </div>
        {started && (
          <p className="text-xs text-muted-foreground">
            The imports go on in the background (a section a minute) even if you close this; “Work
            on them now” does them while this stays open.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ====================== Hindi review ======================

export function HindiReview() {
  const countFn = useServerFn(atlasHindiCounts);
  const queueFn = useServerFn(atlasHindiQueue);
  const acceptFn = useServerFn(acceptAtlasHindi);
  const qc = useQueryClient();
  const [kind, setKind] = useState<"fact" | "place">("fact");
  const [skip, setSkip] = useState<string[]>([]);
  const counts = useQuery({
    queryKey: ["atlasHindiCounts"],
    queryFn: () => countFn(),
    refetchOnMount: "always",
  });
  const q = useQuery({
    queryKey: ["atlasHindiQueue", kind, skip],
    queryFn: () => queueFn({ data: { kind, skip } }),
    refetchOnMount: "always",
  });
  const [edits, setEdits] = useState<Record<string, { hi?: string; label_hi?: string }>>({});
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["atlasHindiCounts"] }),
      qc.invalidateQueries({ queryKey: ["atlasHindiQueue"] }),
    ]);
  const accept = async (items: HindiItem[]) => {
    if (!items.length) return;
    try {
      await acceptFn({
        data: {
          items: items.map((it) => ({ kind: it.kind, id: it.id, ...(edits[it.id] ?? {}) })),
        },
      });
      setEdits((e) => {
        const n = { ...e };
        for (const it of items) delete n[it.id];
        return n;
      });
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const c = counts.data;
  const rows = q.data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Hindi the AI wrote, for you to check: correct it where needed and mark it right. Checked
        Hindi is yours (a fresh import keeps it), and the knowledge base follows.
      </p>
      <div
        className="flex flex-wrap items-center gap-2"
        role="radiogroup"
        aria-label="What to check"
      >
        {(
          [
            ["fact", `Facts (${c?.facts ?? "…"})`],
            ["place", `Place names (${c ? (c.places ?? "—") : "…"})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setSkip([]);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${kind === k ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
          >
            {label}
          </button>
        ))}
        {rows.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => accept(rows.filter((r) => !edits[r.id]))}
          >
            <Check className="mr-1 h-4 w-4" />
            Mark the unchanged {rows.filter((r) => !edits[r.id]).length} right
          </Button>
        )}
      </div>
      {q.error ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm">
          {errorText(q.error, "Couldn't load")}
        </p>
      ) : q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="rounded-lg bg-emerald-500/10 p-3 text-sm">
          {skip.length ? "Only the ones you skipped are left." : "Nothing left to check here."}
          {skip.length > 0 && (
            <Button size="sm" variant="link" onClick={() => setSkip([])}>
              Show the skipped ones
            </Button>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((it) => {
            const e = edits[it.id] ?? {};
            const changed = e.hi !== undefined || e.label_hi !== undefined;
            return (
              <li
                key={it.id}
                className="space-y-2 rounded-xl border border-border p-3 text-sm"
                data-hindi-item={it.id}
              >
                <p className="text-xs text-muted-foreground">{it.where}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="rounded-md bg-muted/50 p-2">
                    {it.en}
                    {it.kind === "place" && it.label_en && it.label_en !== it.en && (
                      <span className="block text-xs text-muted-foreground">
                        Map label: {it.label_en}
                      </span>
                    )}
                  </p>
                  <div className="space-y-1.5">
                    {it.kind === "fact" ? (
                      <Textarea
                        aria-label="Hindi"
                        lang="hi"
                        rows={Math.min(6, Math.ceil(it.hi.length / 70) + 1)}
                        value={e.hi ?? it.hi}
                        onChange={(x) =>
                          setEdits({ ...edits, [it.id]: { ...e, hi: x.target.value } })
                        }
                      />
                    ) : (
                      <>
                        <Input
                          aria-label="Hindi name"
                          lang="hi"
                          value={e.hi ?? it.hi}
                          onChange={(x) =>
                            setEdits({ ...edits, [it.id]: { ...e, hi: x.target.value } })
                          }
                        />
                        <Input
                          aria-label="Hindi map label"
                          lang="hi"
                          value={e.label_hi ?? it.label_hi ?? ""}
                          onChange={(x) =>
                            setEdits({ ...edits, [it.id]: { ...e, label_hi: x.target.value } })
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => accept([it])}>
                    <Check className="mr-1 h-4 w-4" />
                    {changed ? "Save my Hindi" : "Right"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSkip((s) => [...s, it.id])}>
                    Skip for now
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ====================== Gaps ======================

export function GapsReport() {
  const fn = useServerFn(atlasGapReport);
  const q = useQuery({ queryKey: ["atlasGaps"], queryFn: () => fn(), refetchOnMount: "always" });
  if (q.isLoading) return <p className="text-muted-foreground">Working out the gaps…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const g = q.data!;
  const box = "space-y-2 rounded-xl border border-border p-4";
  const more = (total: number, shown: number) =>
    total > shown ? (
      <p className="text-xs text-muted-foreground">…and {total - shown} more</p>
    ) : null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        What the atlas is thin on, worked out from your verified places and facts: where to add
        notes next.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <section className={box}>
          <h3 className="font-semibold">Thin districts</h3>
          <p className="text-sm">
            <span className="text-muted-foreground">Fewer than half the usual places: </span>
            {g.thinPlaces.length
              ? g.thinPlaces.map((d) => `${d} (${g.placeCount[d]})`).join(", ")
              : "none"}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Fewer than half the usual facts: </span>
            {g.thinFacts.length
              ? g.thinFacts.map((d) => `${d} (${g.factCount[d]})`).join(", ")
              : "none"}
          </p>
          {g.missingMeta.length > 0 && (
            <p className="text-sm">
              <span className="text-muted-foreground">Missing district details: </span>
              {g.missingMeta.map((m) => `${m.district} (${m.missing.join(", ")})`).join("; ")}
            </p>
          )}
        </section>
        <section className={box}>
          <h3 className="font-semibold">Still to do</h3>
          <ul className="space-y-1 text-sm">
            <li>
              {g.toCheck.reduce((s, x) => s + x.n, 0)} facts marked [verify] in your notes
              {g.toCheck.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  (most in{" "}
                  {g.toCheck
                    .slice(0, 3)
                    .map((x) => `${x.chapter} ${x.n}`)
                    .join(", ")}
                  )
                </span>
              )}
            </li>
            <li>
              Without Hindi: {g.noHindi.facts} facts, {g.noHindi.places} place names
            </li>
            <li>{g.placesWithoutFacts.total} places no fact talks about</li>
            <li>{g.factsUnlinked.total} facts not linked to any district, place or topic</li>
            <li>{g.orphanAnswers.total} self-test answers with no question</li>
            {g.noDistrict.total > 0 && <li>{g.noDistrict.total} places outside every district</li>}
          </ul>
        </section>
      </div>
      <section className={box}>
        <h3 className="font-semibold">Places by district and kind</h3>
        <p className="text-xs text-muted-foreground">
          Empty cells are worth a look: a district with no water bodies, minerals or wildlife in the
          atlas may just be missing them.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs" data-gap-matrix>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">District</th>
                {g.groups.map((x) => (
                  <th key={x.key} className="px-1 py-1 text-center font-medium">
                    {x.name}
                  </th>
                ))}
                <th className="px-1 py-1 text-center font-medium">Facts</th>
              </tr>
            </thead>
            <tbody>
              {g.districts.map((d) => (
                <tr key={d} className="border-t border-border">
                  <td className="py-1 pr-2 font-medium">{d}</td>
                  {g.groups.map((x) => {
                    const n = g.matrix[d]?.[x.key] ?? 0;
                    return (
                      <td
                        key={x.key}
                        className={`px-1 py-1 text-center ${n ? "" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}
                      >
                        {n}
                      </td>
                    );
                  })}
                  <td
                    className={`px-1 py-1 text-center ${g.thinFacts.includes(d) ? "bg-amber-500/15" : ""}`}
                  >
                    {g.factCount[d]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className={box}>
        <summary className="cursor-pointer font-semibold">
          Places no fact talks about ({g.placesWithoutFacts.total})
        </summary>
        <ul className="grid gap-x-4 text-sm sm:grid-cols-2">
          {g.placesWithoutFacts.items.map((p) => (
            <li key={p.key}>
              {p.name}{" "}
              <span className="text-muted-foreground">
                · {p.cat} · {p.district}
              </span>
            </li>
          ))}
        </ul>
        {more(g.placesWithoutFacts.total, g.placesWithoutFacts.items.length)}
      </details>
      {g.noDistrict.total > 0 && (
        <details className={box}>
          <summary className="cursor-pointer font-semibold">
            Places outside every district ({g.noDistrict.total})
          </summary>
          <p className="text-xs text-muted-foreground">
            Their position falls outside Rajasthan's districts (a border point, or a position to
            correct in the Places tab).
          </p>
          <ul className="grid gap-x-4 text-sm sm:grid-cols-2">
            {g.noDistrict.items.map((p) => (
              <li key={p.key}>
                {p.name} <span className="text-muted-foreground">· {p.cat}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className={box}>
        <summary className="cursor-pointer font-semibold">
          Facts not linked to anything ({g.factsUnlinked.total})
        </summary>
        <ul className="space-y-1 text-sm">
          {g.factsUnlinked.items.map((f, i) => (
            <li key={i}>
              <span className="text-muted-foreground">{f.chapter} · </span>
              {f.text}
            </li>
          ))}
        </ul>
        {more(g.factsUnlinked.total, g.factsUnlinked.items.length)}
      </details>
      <details className={box}>
        <summary className="cursor-pointer font-semibold">
          Self-test answers with no question ({g.orphanAnswers.total})
        </summary>
        <ul className="space-y-1 text-sm">
          {g.orphanAnswers.items.map((f, i) => (
            <li key={i}>
              <span className="text-muted-foreground">{f.chapter} · </span>
              {f.text}
            </li>
          ))}
        </ul>
        {more(g.orphanAnswers.total, g.orphanAnswers.items.length)}
      </details>
    </div>
  );
}
