// Admin: house style. The editor's writing rules for SAATHI (added to the
// instructions for every story it writes), and rules SAATHI suggests from the
// week's edits, to add or leave. Saved on their own, not with the settings
// form above.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { getCaStyle, saveCaStyleRules, suggestCaStyle } from "@/lib/current-affairs.functions";
import { normalizeForMatch } from "@/lib/current-affairs";
import { STYLE_RULES_MAX } from "@/lib/ca-style";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function HouseStyle() {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaStyle);
  const suggestFn = useServerFn(suggestCaStyle);
  const saveFn = useServerFn(saveCaStyleRules);
  const q = useQuery({ queryKey: ["caStyle"], queryFn: () => getFn() });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "suggest" | null>(null);
  const rules = q.data?.rules ?? [];
  // Each rule's last 7 days in the style check before scheduling.
  const week = new Map((q.data?.week ?? []).map((w) => [w.rule, w]));
  const have = new Set(rules.map(normalizeForMatch));
  const suggested = q.data?.suggestions;
  const fresh = (suggested?.rules ?? []).filter((s) => !have.has(normalizeForMatch(s.rule)));
  const full = rules.length >= STYLE_RULES_MAX;

  async function save(next: string[], done: string) {
    setBusy("save");
    try {
      await saveFn({ data: { rules: next } });
      toast.success(done);
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ["caSettings"] });
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
          ? `${r.rules.length} rule${r.rules.length === 1 ? "" : "s"} suggested from ${r.edits} changes`
          : "No clear pattern in this week's edits",
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
      aria-label="House style"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">House style</h3>
        <p className="text-sm text-muted-foreground">
          Your writing rules for SAATHI. They go into the instructions for every story it writes
          (and points it adds), so you fix the same things less often. Up to {STYLE_RULES_MAX}.
          Saved as soon as you add or remove one.
        </p>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.length ? (
        <ol className="space-y-1.5" data-testid="style-rules">
          {rules.map((r, i) => (
            <li key={r} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                {r}
                {week.get(r)?.found ? (
                  <span className="block text-xs text-muted-foreground" data-rule-week>
                    Last 7 days: {week.get(r)!.found} {week.get(r)!.found === 1 ? "note" : "notes"}{" "}
                    · {week.get(r)!.fixed} fixed · {week.get(r)!.kept} kept
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={`Remove rule ${i + 1}`}
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
        <p className="text-sm text-muted-foreground">No rules yet.</p>
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
          maxLength={200}
          placeholder="Add a rule, e.g. Start headlines with the place or scheme name"
          aria-label="New rule"
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
            Suggested from your edits
          </span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void suggest()}>
            {busy === "suggest" ? (
              <>
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Looking at your edits…
              </>
            ) : (
              "Suggest from this week's edits"
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          SAATHI compares its drafts with what you changed this week (one AI request). It also does
          this with the Sunday report.
          {suggested ? ` Last looked at ${when(suggested.at)} (${suggested.edits} changes).` : ""}
        </p>
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
        {suggested && !fresh.length && (
          <p className="text-xs text-muted-foreground">No new suggestions.</p>
        )}
      </div>
    </section>
  );
}
