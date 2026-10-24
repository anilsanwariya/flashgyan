// Admin: learnt from your picks. What the editor changed in the AI's picking
// (stories dropped or kept, importance, section) over the last weeks,
// picking rules SAATHI suggests from it, and the rules kept, which go into
// how stories are picked from every source. Saved on their own.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RefreshCw, Sparkles, Target, X } from "lucide-react";
import { getCaPicks, saveCaPickRules, suggestCaPicks } from "@/lib/ca-picks.functions";
import { PICK_RULES_MAX, type PickChange } from "@/lib/ca-picks";
import { CATEGORIES, normalizeForMatch } from "@/lib/current-affairs";
import { errorText, SavesInstantly } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const section = (id: string) => CATEGORIES.find((c) => c.id === id)?.en ?? id;
const changeText = (c: PickChange) =>
  c.kind === "dropped"
    ? "you dropped it"
    : c.kind === "kept"
      ? "you kept it"
      : c.kind === "importance"
        ? `importance ${c.ai.importance} → ${c.editor.importance}`
        : `${section(c.ai.category)} → ${section(c.editor.category)}`;

export function PickRules() {
  const getFn = useServerFn(getCaPicks);
  const suggestFn = useServerFn(suggestCaPicks);
  const saveFn = useServerFn(saveCaPickRules);
  const q = useQuery({ queryKey: ["caPicks"], queryFn: () => getFn(), refetchOnMount: true });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "suggest" | null>(null);
  const d = q.data;
  const rules = d?.rules ?? [];
  const have = new Set(rules.map(normalizeForMatch));
  const fresh = (d?.suggestions?.rules ?? []).filter((s) => !have.has(normalizeForMatch(s.rule)));
  const full = rules.length >= PICK_RULES_MAX;
  const n = d?.counts;
  const changed = n ? n.dropped + n.kept + n.importance + n.section : 0;

  async function save(next: string[], done: string) {
    setBusy("save");
    try {
      await saveFn({ data: { rules: next } });
      toast.success(done);
      await q.refetch();
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the rules"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("suggest");
    try {
      const r = await suggestFn();
      toast.success(
        r.rules.length
          ? `${r.rules.length} rule${r.rules.length === 1 ? "" : "s"} suggested from ${r.changes} changes`
          : "No clear pattern in your picks yet",
      );
      await q.refetch();
    } catch (e) {
      toast.error(errorText(e, "Couldn't suggest rules"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="Learnt from your picks"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Learnt from your picks</h3>
          <SavesInstantly />
        </div>
        <p className="text-sm text-muted-foreground">
          Your picking rules for SAATHI. They go into how it picks stories from every source: what
          to keep, its importance and its section. Up to {PICK_RULES_MAX}.
        </p>
      </div>

      {d && !d.ready && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Run the latest database update (ca_ai_pick) so SAATHI keeps its own decisions and can
          learn from your changes.
        </p>
      )}

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.length ? (
        <ol className="space-y-1.5" data-testid="pick-rules">
          {rules.map((r, i) => (
            <li key={r} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1">{r}</span>
              <button
                type="button"
                aria-label={`Remove picking rule ${i + 1}`}
                disabled={!!busy}
                onClick={() =>
                  void save(
                    rules.filter((_, j) => j !== i),
                    "Rule removed",
                  )
                }
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No picking rules yet.</p>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save([...rules, draft.trim()], "Rule added")) setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={240}
          placeholder="Add a rule, e.g. Leave out routine court hearings unless there is a verdict"
          aria-label="New picking rule"
          disabled={full}
        />
        <Button type="submit" disabled={!!busy || full || draft.trim().length < 3}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>

      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-[10rem] flex-1 text-sm font-medium">
            Suggested from your picks
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || !d?.ready}
            onClick={() => void suggest()}
          >
            {busy === "suggest" ? (
              <>
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Looking at your picks…
              </>
            ) : (
              "Suggest from my picks"
            )}
          </Button>
        </div>
        {n && d?.ready && (
          <p className="text-xs text-muted-foreground" data-testid="pick-counts">
            Last 30 days: {changed} of {n.stories} stories changed · {n.dropped} dropped · {n.kept}{" "}
            kept · {n.importance} importance · {n.section} section. SAATHI compares them (one AI
            request); it also does this with the Sunday report.
            {d.suggestions ? ` Last looked at ${when(d.suggestions.at)}.` : ""}
          </p>
        )}
        {fresh.map((s) => (
          <div
            key={s.rule}
            data-suggestion={s.rule}
            className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.rule}</p>
              {s.example && <p className="text-xs text-muted-foreground">e.g. {s.example}</p>}
            </div>
            <Button
              size="sm"
              disabled={!!busy || full}
              onClick={() => void save([...rules, s.rule], "Rule added")}
            >
              Add
            </Button>
          </div>
        ))}
        {d?.suggestions && !fresh.length && (
          <p className="text-xs text-muted-foreground">No new suggestions.</p>
        )}
        {!!d?.latest.length && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Your latest changes</summary>
            <ul className="mt-1 space-y-0.5">
              {d.latest.map((c, i) => (
                <li key={i}>
                  {c.date} · {c.headline}: {changeText(c)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
