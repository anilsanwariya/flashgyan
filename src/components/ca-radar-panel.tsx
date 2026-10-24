// Admin: the monthly's Exam Radar page on the Monthly page: the stories it
// would print (most likely to be asked, in revising order) with why, to pin,
// hide or put back, and the page turned off or on.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, EyeOff, Pin, PinOff, Radar } from "lucide-react";
import { getCaRadar, saveCaRadar } from "@/lib/ca-radar.functions";
import { reasonText, type RadarSettings } from "@/lib/ca-radar";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function RadarBox({ month }: { month: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaRadar);
  const saveFn = useServerFn(saveCaRadar);
  const key = ["caRadar", month.slice(0, 7)];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getFn({ data: { month } }),
    refetchOnMount: true,
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  if (!d) return null;
  const s = d.settings;

  async function save(next: RadarSettings, ok: string) {
    setBusy(true);
    try {
      qc.setQueryData(key, await saveFn({ data: { month, settings: next } }));
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }
  const pin = (id: string) =>
    save({ ...s, pinned: [...s.pinned.filter((x) => x !== id), id] }, "Pinned to Exam Radar");
  const unpin = (id: string) =>
    save({ ...s, pinned: s.pinned.filter((x) => x !== id) }, "Unpinned");
  const hide = (id: string) =>
    save(
      { ...s, pinned: s.pinned.filter((x) => x !== id), hidden: [...s.hidden, id] },
      "Left out of Exam Radar",
    );
  const unhide = (id: string) =>
    save({ ...s, hidden: s.hidden.filter((x) => x !== id) }, "Put back");

  return (
    <section
      aria-label="Exam Radar"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start gap-2">
        <Radar className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Exam Radar</h3>
          <p className="text-sm text-muted-foreground">
            A page after the cover: the month's {d.picked.length} stories most likely to be asked,
            in the order to revise them, each with why (importance, asked before, Rajasthan, what
            your exams ask). Pin or leave out stories; the rest are picked by score.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            aria-label="Print Exam Radar"
            checked={!s.off}
            disabled={busy}
            onCheckedChange={(v) =>
              void save({ ...s, off: !v }, v ? "Exam Radar on" : "Exam Radar off")
            }
          />
          Print it
        </label>
      </div>
      {!s.off && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-sm font-medium"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            See the list
          </button>
          {open && (
            <div className="mt-2 space-y-3">
              <ol className="divide-y divide-border rounded-lg border border-border text-sm">
                {d.picked.map((p, i) => (
                  <li
                    key={p.id}
                    data-radar={p.headline}
                    className="flex items-start gap-2 px-2 py-1.5"
                  >
                    <span className="w-5 shrink-0 font-semibold text-primary">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.headline}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.date} · score {p.score}
                        {p.reasons.length
                          ? ` · ${p.reasons.map((r) => reasonText(r, "en")).join(" · ")}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={busy}
                      aria-label={p.pinned ? `Unpin ${p.headline}` : `Pin ${p.headline}`}
                      onClick={() => void (p.pinned ? unpin(p.id) : pin(p.id))}
                    >
                      {p.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={busy}
                      aria-label={`Leave out ${p.headline}`}
                      onClick={() => void hide(p.id)}
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ol>
              {d.others.length > 0 && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  Add a story:
                  <select
                    aria-label="Pin another story"
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && void pin(e.target.value)}
                    className="h-8 min-w-0 max-w-full flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Pick a story to pin…</option>
                    {d.others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.date} · {o.headline}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {d.hidden.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">Left out</p>
                  {d.hidden.map((h) => (
                    <div key={h.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {h.headline}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={busy}
                        onClick={() => void unhide(h.id)}
                      >
                        Put back
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
