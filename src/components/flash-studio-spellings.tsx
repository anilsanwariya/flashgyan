// The house spelling list: every word spelt more than one way across the
// topics (nukta, ँ / ं), with the spellings verified cards use (accepted)
// and the others. The editor prefers one, accepts another as also right,
// or calls one wrong; the quick checks and the AI go by the list.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listFlashSpellings, saveFlashSpellRule } from "@/lib/flash-studio.functions";
import type { SpellRow } from "@/lib/flash-spell";
import { wiktionaryUrl } from "@/lib/flash-dict";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SpellingList() {
  const listFn = useServerFn(listFlashSpellings);
  const saveFn = useServerFn(saveFlashSpellRule);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["flashSpellings"],
    queryFn: () => listFn(),
    refetchOnMount: "always",
  });
  const [find, setFind] = useState("");
  const [show, setShow] = useState<"todo" | "all">("todo");
  const [shown, setShown] = useState(80);
  const [busy, setBusy] = useState("");
  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (r) =>
          (show === "all" || r.toFix > 0 || r.spellings.every((s) => s.status === "open")) &&
          (!find.trim() || r.spellings.some((s) => s.word.includes(find.trim()))),
      ),
    [q.data, show, find],
  );
  const save = async (r: SpellRow, change: (rule: Rule) => Rule) => {
    const rule = change({
      key: r.key,
      preferred: r.rule ? r.preferred : null,
      accepted: r.rule
        ? r.spellings.filter((s) => s.status === "accepted" && s.verified === 0).map((s) => s.word)
        : [],
      rejected: r.spellings.filter((s) => s.status === "rejected").map((s) => s.word),
    });
    setBusy(r.key);
    try {
      qc.setQueryData(["flashSpellings"], await saveFn({ data: rule }));
      await qc.invalidateQueries({ queryKey: ["flashHouse"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't save it"));
    } finally {
      setBusy("");
    }
  };
  const todo = (q.data ?? []).filter((r) => r.toFix > 0).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Words spelt more than one way (nukta, ँ / ं) across all topics. A spelling is accepted when
        a verified card uses it; the quick checks flag the others (with a fix when one spelling is
        clear) and the AI is told the accepted ones. Words verified both ways (जरा / ज़रा) are both
        right.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Find a word"
          aria-label="Find a word"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
        <div className="flex gap-1" role="group" aria-label="Words shown">
          <Button
            size="sm"
            variant={show === "todo" ? "default" : "outline"}
            aria-pressed={show === "todo"}
            onClick={() => setShow("todo")}
          >
            To decide ({todo})
          </Button>
          <Button
            size="sm"
            variant={show === "all" ? "default" : "outline"}
            aria-pressed={show === "all"}
            onClick={() => setShow("all")}
          >
            All ({q.data?.length ?? 0})
          </Button>
        </div>
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Reading every topic…</p>}
      {q.error && <p className="text-sm text-destructive">{errorText(q.error, "")}</p>}
      {q.data && !rows.length && (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {show === "todo"
            ? "Nothing to decide: every card uses an accepted spelling."
            : "No words."}
        </p>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border" lang="hi">
        {rows.slice(0, shown).map((r) => (
          <li key={r.key} data-word={r.key} className="space-y-1.5 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {r.toFix > 0 && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  {r.toFix} card{r.toFix === 1 ? "" : "s"} to fix
                </span>
              )}
              {r.spellings.every((s) => s.status === "open") && (
                <span className="text-xs text-muted-foreground">
                  no verified card yet: pick the right one
                </span>
              )}
              {r.rule && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 text-xs"
                  disabled={busy === r.key}
                  onClick={() =>
                    void save(r, (x) => ({ ...x, preferred: null, accepted: [], rejected: [] }))
                  }
                >
                  Back to the cards&apos; own
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {r.spellings.map((s) => (
                <div
                  key={s.word}
                  data-spelling={s.word}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
                    s.status === "accepted"
                      ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20"
                      : s.status === "rejected"
                        ? "border-red-300 bg-red-50/50 line-through dark:bg-red-950/20"
                        : "border-border"
                  }`}
                >
                  <a
                    href={wiktionaryUrl(s.word, "hi")}
                    target="_blank"
                    rel="noreferrer"
                    title="Look it up in Wiktionary"
                    className="text-base font-medium hover:underline"
                  >
                    {s.word}
                  </a>
                  {r.preferred === s.word && (
                    <span className="rounded bg-emerald-600 px-1 text-[10px] text-white">
                      house
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground" title="Cards: verified / all">
                    {s.verified}/{s.all}
                  </span>
                  <span className="flex gap-0.5">
                    {r.preferred !== s.word && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs"
                        disabled={busy === r.key}
                        title="The house spelling: the others are fixed to it"
                        onClick={() =>
                          void save(r, (x) => ({
                            ...x,
                            preferred: s.word,
                            rejected: x.rejected.filter((w) => w !== s.word),
                          }))
                        }
                      >
                        Use this
                      </Button>
                    )}
                    {s.status !== "accepted" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs"
                        disabled={busy === r.key}
                        title="Right too (a different word, or both are used)"
                        onClick={() =>
                          void save(r, (x) => ({
                            ...x,
                            accepted: [...x.accepted, s.word],
                            rejected: x.rejected.filter((w) => w !== s.word),
                          }))
                        }
                      >
                        Also right
                      </Button>
                    )}
                    {s.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs text-destructive"
                        disabled={busy === r.key}
                        title="Never right: flagged in every card, even verified ones"
                        onClick={() =>
                          void save(r, (x) => ({
                            ...x,
                            preferred: x.preferred === s.word ? null : x.preferred,
                            accepted: x.accepted.filter((w) => w !== s.word),
                            rejected: [...x.rejected, s.word],
                          }))
                        }
                      >
                        Wrong
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > shown && (
        <Button variant="outline" size="sm" onClick={() => setShown(shown + 200)}>
          Show more ({rows.length - shown} left)
        </Button>
      )}
    </div>
  );
}

type Rule = { key: string; preferred: string | null; accepted: string[]; rejected: string[] };
