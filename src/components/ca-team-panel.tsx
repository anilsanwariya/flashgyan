// Admin: the magazine's editorial team. Each AI step is a member with a
// notebook of lessons learnt from the editor; new lessons are suggested each
// Sunday (with the weekly report) and wait here to be kept or dropped. The
// scorecard shows, week by week, how often the editor left the member's work
// as it was; every notebook change can be undone.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  History,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Scale,
  SearchCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PickRules } from "@/components/ca-pick-rules";
import { HouseStyle } from "@/components/ca-house-style";
import {
  decideCaTeamSuggestion,
  getCaTeam,
  restoreCaTeamNotebook,
  saveCaTeamLessons,
  suggestCaTeamLessons,
} from "@/lib/ca-team.functions";
import type { Notebook } from "@/lib/ca-team.server";
import type { NotebookMember } from "@/lib/ca-team";
import type { NotebookVersion, TeamMember, WeekScore } from "@/lib/ca-team.server";

const MEMBERS: {
  id: TeamMember;
  name: string;
  role: string;
  score: string;
  icon: typeof Scale;
}[] = [
  {
    id: "chief",
    name: "Editor-in-chief",
    role: "Approves or rejects each collected story, sets its importance and section.",
    score: "stories whose pick you left as it was",
    icon: Scale,
  },
  {
    id: "writer",
    name: "Writer",
    role: "Writes each story in Hindi and English: headline, summary, points, visuals.",
    score: "written stories you didn't edit",
    icon: PenLine,
  },
  {
    id: "proofreader",
    name: "Proofreader",
    role: "Checks stories against your house style and that Hindi and English say the same; its notebook learns from the notes you wave through as fine.",
    score: "notes you acted on (not waved through)",
    icon: SearchCheck,
  },
  {
    id: "updater",
    name: "Updater",
    role: "Compares later reports with earlier stories and suggests corrections; its notebook learns from the corrections you approve or reject.",
    score: "corrections you approved",
    icon: Undo2,
  },
];

// The Proofreader's or the Updater's notebook: its lessons (removable, or
// written by hand) and the lessons it suggested, to keep or drop.
function LessonNotebook({ member, nb }: { member: NotebookMember; nb: Notebook }) {
  const saveFn = useServerFn(saveCaTeamLessons);
  const decideFn = useServerFn(decideCaTeamSuggestion);
  const suggestFn = useServerFn(suggestCaTeamLessons);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["caTeam"] });
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do it");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      {nb.rules.length ? (
        <ol className="list-decimal space-y-1 pl-5">
          {nb.rules.map((r, i) => (
            <li key={i}>
              <span className="flex items-start gap-2">
                <span className="flex-1">{r}</span>
                <button
                  type="button"
                  aria-label="Remove this lesson"
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    void act(
                      () =>
                        saveFn({
                          data: { member, rules: nb.rules.filter((_, j) => j !== i) },
                        }),
                      "Lesson removed",
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">No lessons yet.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (v.length < 3) return;
          void act(
            () => saveFn({ data: { member, rules: [...nb.rules, v] } }),
            "Lesson added",
          ).then(() => setDraft(""));
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a lesson yourself"
          aria-label="New lesson"
          maxLength={240}
        />
        <Button
          size="sm"
          type="submit"
          variant="outline"
          disabled={busy || draft.trim().length < 3}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>
      {nb.suggestions?.rules.length ? (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Suggested from {nb.suggestions.decisions}{" "}
            of your decisions
          </p>
          {nb.suggestions.rules.map((r) => (
            <div key={r} className="flex items-start gap-2" data-suggestion>
              <span className="flex-1">{r}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy}
                onClick={() =>
                  void act(() => decideFn({ data: { member, rule: r, keep: true } }), "Kept")
                }
              >
                <Check className="mr-1 h-4 w-4" /> Keep
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={busy}
                onClick={() => void act(() => decideFn({ data: { member, rule: r, keep: false } }))}
              >
                Drop
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void act(() => suggestFn({ data: { member } }), "Suggestions ready (or nothing new)")
        }
      >
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-1 h-4 w-4" />
        )}{" "}
        Suggest lessons now
      </Button>
    </div>
  );
}

const pct = (s: WeekScore) => (s.total ? Math.round((s.agreed / s.total) * 100) : null);
const weekLabel = (w: string) =>
  new Date(`${w}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Scorecard({ scores, what }: { scores: WeekScore[]; what: string }) {
  if (!scores.length)
    return <p className="text-sm text-muted-foreground">No settled stories in the last weeks.</p>;
  return (
    <div className="space-y-1.5" data-scorecard>
      <p className="text-xs text-muted-foreground">Each week (from Monday): {what}.</p>
      <div className="flex items-end gap-2">
        {scores.map((s) => {
          const p = pct(s);
          return (
            <div key={s.week} className="flex w-12 flex-col items-center gap-1 text-xs">
              <span className="font-semibold tabular-nums">{p === null ? "–" : `${p}%`}</span>
              <div className="flex h-16 w-6 items-end overflow-hidden rounded bg-muted">
                <div
                  className={`w-full ${p !== null && p >= 90 ? "bg-emerald-500" : p !== null && p >= 70 ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ height: `${p ?? 0}%` }}
                />
              </div>
              <span className="text-muted-foreground">{weekLabel(s.week)}</span>
              <span className="text-[10px] text-muted-foreground">
                {s.agreed}/{s.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function History_({ member, history }: { member: TeamMember; history: NotebookVersion[] }) {
  const restoreFn = useServerFn(restoreCaTeamNotebook);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!history.length) return null;
  return (
    <div className="space-y-2">
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
        <History className="mr-1 h-4 w-4" /> Earlier notebooks ({history.length})
      </Button>
      {open && (
        <ul className="space-y-2">
          {history.map((v) => (
            <li key={v.at} className="rounded-lg border border-border p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  Before{" "}
                  {new Date(v.at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span className="text-xs text-muted-foreground">{v.rules.length} lessons</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-8"
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Put the notebook back as it was then? The current one is kept here too.",
                      )
                    )
                      return;
                    setBusy(v.at);
                    try {
                      await restoreFn({ data: { member, at: v.at } });
                      await qc.invalidateQueries();
                      toast.success("Notebook put back");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Couldn't put it back");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === v.at ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use this"}
                </Button>
              </div>
              {v.rules.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                  {v.rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EditorialTeam() {
  const teamFn = useServerFn(getCaTeam);
  const q = useQuery({ queryKey: ["caTeam"], queryFn: () => teamFn() });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Each AI step of the magazine is a team member with a notebook of lessons learnt from your
        decisions. Every Sunday, with the weekly report, they suggest new lessons from the week's
        changes; nothing goes into a notebook until you keep it. The scorecard shows how often you
        left their work as it was.
      </p>
      {q.error && <p className="text-sm text-destructive">Couldn't load the team.</p>}
      {MEMBERS.map((m) => {
        const data = q.data?.[m.id];
        const Icon = m.icon;
        return (
          <section
            key={m.id}
            className="space-y-4 rounded-2xl border border-border p-4"
            aria-label={m.name}
            data-member={m.id}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">{m.name}</h2>
                <p className="text-sm text-muted-foreground">{m.role}</p>
              </div>
            </div>
            {q.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : (
              data && <Scorecard scores={data.scores} what={m.score} />
            )}
            <div className="rounded-xl bg-muted/30 p-3">
              <h3 className="mb-2 text-sm font-semibold">Notebook</h3>
              {m.id === "chief" ? (
                <PickRules />
              ) : m.id === "writer" ? (
                <HouseStyle />
              ) : data?.notebook ? (
                <LessonNotebook member={m.id} nb={data.notebook} />
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </div>
            {data && <History_ member={m.id} history={data.history} />}
          </section>
        );
      })}
    </div>
  );
}
