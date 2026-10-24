// Admin: a sports event's medal tally in the Events tab: India's medals
// (player, state, sport and event, medal), India's tally and rank as the
// stories report it, and the top of the medal table; made from the event's
// stories, edited here, printed under the event in the monthly.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Medal as MedalIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { getCaMedals, makeCaMedals, saveCaMedals } from "@/lib/ca-medals.functions";
import {
  MEDALS,
  countMedals,
  indiaTally,
  isRajasthan,
  type MedalKind,
  type MedalTally,
} from "@/lib/ca-medals";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LABEL: Record<MedalKind, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };
const blank = { en: "", hi: "" };
// A name typed in one language only is printed in both.
const both = (b: { en: string; hi: string }) => ({ en: b.en || b.hi, hi: b.hi || b.en });

export function MedalBox({ eventId, eventName }: { eventId: string; eventName: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaMedals);
  const makeFn = useServerFn(makeCaMedals);
  const saveFn = useServerFn(saveCaMedals);
  const q = useQuery({
    queryKey: ["caMedals", eventId],
    queryFn: () => getFn({ data: { event_id: eventId } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<MedalTally | null>(null);
  const [hindi, setHindi] = useState(false);
  const t = q.data ?? null;
  const run = async (label: string, fn: () => Promise<MedalTally | null>, ok: string) => {
    setBusy(label);
    try {
      qc.setQueryData(["caMedals", eventId], await fn());
      setDraft(null);
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy("");
    }
  };
  const lang = hindi ? "hi" : "en";

  if (draft) {
    const set = (next: Partial<MedalTally>) => setDraft({ ...draft, ...next });
    const rep = draft.reported;
    const counted = countMedals(draft.medals);
    return (
      <section aria-label="Medal tally" className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">Medal tally</h4>
          <Button size="sm" variant="ghost" onClick={() => setHindi(!hindi)}>
            {hindi ? "Show English" : "Show Hindi"}
          </Button>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            India's medals ({counted.gold} gold, {counted.silver} silver, {counted.bronze} bronze
            listed)
          </p>
          {draft.medals.map((m, i) => {
            const put = (patch: Partial<typeof m>) =>
              set({ medals: draft.medals.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div
                key={i}
                data-medal={i}
                className="grid grid-cols-2 gap-1.5 sm:grid-cols-[1.2fr_0.8fr_1.6fr_auto_auto]"
              >
                <Input
                  aria-label={`Player ${i + 1}`}
                  placeholder="Player or team"
                  value={m.who[lang]}
                  onChange={(e) => put({ who: { ...m.who, [lang]: e.target.value } })}
                />
                <Input
                  aria-label={`State ${i + 1}`}
                  placeholder="State"
                  value={m.state[lang]}
                  onChange={(e) => put({ state: { ...m.state, [lang]: e.target.value } })}
                />
                <Input
                  aria-label={`Sport and event ${i + 1}`}
                  placeholder="Sport, event"
                  value={m.what[lang]}
                  onChange={(e) => put({ what: { ...m.what, [lang]: e.target.value } })}
                />
                <select
                  aria-label={`Medal ${i + 1}`}
                  value={m.medal}
                  onChange={(e) => put({ medal: e.target.value as MedalKind })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {MEDALS.map((k) => (
                    <option key={k} value={k}>
                      {LABEL[k]}
                    </option>
                  ))}
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove medal ${i + 1}`}
                  onClick={() => set({ medals: draft.medals.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                medals: [...draft.medals, { who: blank, state: blank, what: blank, medal: "gold" }],
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add a medal
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            India's tally as reported (leave empty to count the medals listed)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(["gold", "silver", "bronze", "rank"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 text-sm">
                {k === "rank" ? "Rank" : LABEL[k]}
                <Input
                  type="number"
                  min={0}
                  aria-label={`Reported ${k}`}
                  className="h-8 w-20"
                  value={rep?.[k] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                    const next = { gold: 0, silver: 0, bronze: 0, rank: null, ...rep, [k]: v };
                    const none = !next.gold && !next.silver && !next.bronze && next.rank == null;
                    set({
                      reported: none
                        ? null
                        : {
                            gold: next.gold ?? 0,
                            silver: next.silver ?? 0,
                            bronze: next.bronze ?? 0,
                            rank: next.rank,
                          },
                    });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Medal table (top countries, optional)</p>
          {draft.table.map((r, i) => {
            const put = (patch: Partial<typeof r>) =>
              set({ table: draft.table.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="w-5 text-sm text-muted-foreground">{i + 1}.</span>
                <Input
                  aria-label={`Country ${i + 1}`}
                  placeholder="Country"
                  className="h-8 w-44"
                  value={r.country[lang]}
                  onChange={(e) => put({ country: { ...r.country, [lang]: e.target.value } })}
                />
                {MEDALS.map((k) => (
                  <Input
                    key={k}
                    type="number"
                    min={0}
                    aria-label={`Country ${i + 1} ${k}`}
                    className="h-8 w-16"
                    value={r[k]}
                    onChange={(e) => put({ [k]: Math.max(0, Number(e.target.value) || 0) })}
                  />
                ))}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove country ${i + 1}`}
                  onClick={() => set({ table: draft.table.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {draft.table.length < 10 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set({ table: [...draft.table, { country: blank, gold: 0, silver: 0, bronze: 0 }] })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add a country
            </Button>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            disabled={!!busy}
            onClick={() =>
              void run(
                "save",
                () =>
                  saveFn({
                    data: {
                      event_id: eventId,
                      tally: {
                        ...draft,
                        // Rows left empty are dropped.
                        medals: draft.medals
                          .filter((m) => m.who.en.trim() || m.who.hi.trim())
                          .map((m) => ({
                            who: both(m.who),
                            state: both(m.state),
                            what: both(m.what),
                            medal: m.medal,
                          })),
                        table: draft.table
                          .filter((r) => r.country.en.trim() || r.country.hi.trim())
                          .map((r) => ({ ...r, country: both(r.country) })),
                      },
                    },
                  }),
                "Medal tally saved",
              )
            }
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  const india = t ? indiaTally(t) : null;
  const raj = t ? t.medals.filter(isRajasthan).length : 0;
  return (
    <section aria-label="Medal tally" className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MedalIcon className="h-4 w-4 text-amber-600" />
        <h4 className="text-sm font-semibold">Medal tally</h4>
        {india && (
          <span className="text-sm" data-testid="india-tally">
            India: {india.gold} gold · {india.silver} silver · {india.bronze} bronze · total{" "}
            {india.total}
            {india.rank ? ` · rank ${india.rank}` : ""}
            {raj ? ` · ${raj} by Rajasthan's players` : ""}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t
          ? `Prints under ${eventName} in the monthly: India's ${t.medals.length} medals (Rajasthan's marked)${t.table.length ? " and the medal table" : ""}.`
          : "India's medals from this event's stories, as a table under the event in the monthly. Made with the summary, or now."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            void run("make", () => makeFn({ data: { event_id: eventId } }), "Medal tally made")
          }
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy === "make" ? "animate-spin" : ""}`} />
          {t ? "Make again" : "Make the tally"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            setDraft(
              t ?? { made_at: new Date().toISOString(), medals: [], reported: null, table: [] },
            )
          }
        >
          {t ? "Edit" : "Write by hand"}
        </Button>
        {t && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() =>
              void run(
                "clear",
                () => saveFn({ data: { event_id: eventId, tally: null } }),
                "Taken out of the issue",
              )
            }
          >
            Take out
          </Button>
        )}
      </div>
    </section>
  );
}
