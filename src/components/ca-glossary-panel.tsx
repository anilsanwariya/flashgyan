// Admin: the glossary. English terms and the Hindi SAATHI must always use for
// them, or terms kept in English; every prompt that writes Hindi gets them,
// and the Hindi–English check flags a story that uses another word. SAATHI
// can suggest entries from the Hindi the editor keeps correcting. Saved on
// its own, not with the settings form above.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RefreshCw, Sparkles, X } from "lucide-react";
import {
  getMagazineSettings,
  saveCaGlossary,
  suggestCaGlossary,
} from "@/lib/current-affairs.functions";
import { GLOSSARY_MAX, type GlossaryEntry, type GlossarySuggestion } from "@/lib/ca-glossary";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function Glossary() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMagazineSettings);
  const saveFn = useServerFn(saveCaGlossary);
  const suggestFn = useServerFn(suggestCaGlossary);
  const q = useQuery({ queryKey: ["caSettings"], queryFn: () => getFn() });
  const entries = q.data?.glossary ?? [];
  const [draft, setDraft] = useState<GlossaryEntry>({ en: "", hi: "" });
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"save" | "suggest" | null>(null);
  const [suggested, setSuggested] = useState<GlossarySuggestion[] | null>(null);
  const have = new Set(entries.map((e) => e.en.toLowerCase()));
  const fresh = (suggested ?? []).filter((s) => !have.has(s.en.toLowerCase()));
  const full = entries.length >= GLOSSARY_MAX;
  const shown = filter.trim()
    ? entries.filter((e) => `${e.en} ${e.hi}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : entries;

  async function save(next: GlossaryEntry[], done: string) {
    setBusy("save");
    try {
      await saveFn({ data: { entries: next } });
      toast.success(done);
      await qc.invalidateQueries({ queryKey: ["caSettings"] });
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the glossary"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("suggest");
    try {
      const r = await suggestFn();
      setSuggested(r);
      toast.success(
        r.length
          ? `${r.length} term${r.length === 1 ? "" : "s"} suggested from your Hindi edits`
          : "No clear pattern in your Hindi edits",
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't suggest terms"));
    } finally {
      setBusy(null);
    }
  }

  const draftOk = draft.en.trim().length > 1 && (draft.keep || draft.hi.trim().length > 0);

  return (
    <section
      aria-label="Glossary"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">Glossary</h3>
        <p className="text-sm text-muted-foreground">
          The Hindi SAATHI always uses for an English term, or terms kept in English. Every story,
          summary, point and translation follows it, and the Hindi–English check flags a story that
          uses another word. Up to {GLOSSARY_MAX}. Saved as soon as you add, change or remove one.
        </p>
      </div>

      {entries.length > 8 && (
        <Input
          aria-label="Search the glossary"
          placeholder="Search the glossary"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length ? (
        <ul className="max-h-96 space-y-1 overflow-y-auto" data-testid="glossary">
          {shown.map((g) => (
            <li
              key={g.en}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm"
            >
              <span className="truncate">{g.en}</span>
              <span lang="hi" className="truncate">
                {g.keep ? <span className="text-muted-foreground">kept in English</span> : g.hi}
              </span>
              <button
                type="button"
                aria-label={`Remove ${g.en}`}
                disabled={!!busy}
                onClick={() =>
                  void save(
                    entries.filter((x) => x.en !== g.en),
                    "Term removed",
                  )
                }
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No terms yet.</p>
      )}

      {/* A term with the same English replaces the old one. */}
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center"
        onSubmit={async (e) => {
          e.preventDefault();
          const was = have.has(draft.en.trim().toLowerCase());
          if (await save([...entries, draft], was ? "Term changed" : "Term added"))
            setDraft({ en: "", hi: "" });
        }}
      >
        <Input
          aria-label="English term"
          placeholder="English, e.g. Repo rate"
          maxLength={80}
          value={draft.en}
          onChange={(e) => setDraft({ ...draft, en: e.target.value })}
          disabled={full}
        />
        <Input
          lang="hi"
          aria-label="Hindi term"
          placeholder="हिंदी, e.g. रेपो दर"
          maxLength={120}
          value={draft.keep ? "" : draft.hi}
          onChange={(e) => setDraft({ ...draft, hi: e.target.value })}
          disabled={full || draft.keep}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={!!draft.keep}
            onCheckedChange={(v) => setDraft({ ...draft, keep: v === true })}
            aria-label="Keep in English"
          />
          Keep in English
        </label>
        <Button type="submit" disabled={!!busy || full || !draftOk}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>

      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-[10rem] flex-1 text-sm font-medium">Suggested from my edits</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void suggest()}>
            {busy === "suggest" ? (
              <>
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Looking at your edits…
              </>
            ) : (
              "Suggest from my edits"
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          SAATHI looks at the Hindi you corrected in the last 30 days and suggests the terms you
          keep changing (one AI request).
        </p>
        {fresh.map((s) => (
          <div
            key={s.en}
            data-suggestion={s.en}
            className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {s.en} → <span lang="hi">{s.keep ? "keep in English" : s.hi}</span>
              </p>
              {s.example && <p className="text-xs text-muted-foreground">e.g. {s.example}</p>}
            </div>
            <Button
              size="sm"
              disabled={!!busy || full}
              onClick={() =>
                void save(
                  [...entries, { en: s.en, hi: s.hi, ...(s.keep ? { keep: true } : {}) }],
                  "Term added",
                )
              }
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
