// The atlas across the site (admin): current affairs stories linked to
// atlas places ("In the news", a wrong link hidden, linking again from a
// day), and the GK infographics "District of the day" series.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  atlasDistrictSeries,
  atlasNewsLinks,
  editAtlasNews,
  runAtlasStep,
  setUpAtlasDistrictSeries,
} from "@/lib/atlas.functions";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MIGRATION = "News links need the migration 20261216090000_atlas_news.sql.";

export function AtlasAcross() {
  return (
    <div className="space-y-5">
      <DistrictSeries />
      <NewsLinks />
    </div>
  );
}

function DistrictSeries() {
  const fn = useServerFn(atlasDistrictSeries);
  const setUpFn = useServerFn(setUpAtlasDistrictSeries);
  const q = useQuery({ queryKey: ["atlasSeries"], queryFn: () => fn(), refetchOnMount: "always" });
  const [busy, setBusy] = useState(false);
  const s = q.data;
  return (
    <section className="space-y-2 rounded-xl border border-border p-4" data-district-series>
      <h3 className="font-semibold">GK infographics: District of the day</h3>
      <p className="text-sm text-muted-foreground">
        A GK infographics series with one topic a district (published district pages first, then
        those your notes say most about). Its cards are written from the atlas's facts in the
        knowledge base, like any GK subject, and checked by you before they are posted.
      </p>
      {!s ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !s.ready ? (
        <p className="text-sm">GK infographics need their migration first.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {s.id ? (
            <p className="text-sm">
              {s.topics} districts · {s.posted} posted ·{" "}
              <Badge tone={s.status === "active" ? "good" : "muted"}>{s.status}</Badge>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not set up yet.</p>
          )}
          <Button
            size="sm"
            variant={s.id ? "outline" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await setUpFn();
                toast.success(
                  r.added
                    ? `${r.added} districts added to the series`
                    : "Every district is in the series already",
                );
                await q.refetch();
              } catch (e) {
                toast.error(errorText(e, "Couldn't set it up"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {s.id ? "Add missing districts" : "Set up the series"}
          </Button>
          {s.id && (
            <a href="/admin?section=ca.gk" className="text-sm text-primary underline">
              Start or plan it in GK infographics
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function NewsLinks() {
  const fn = useServerFn(atlasNewsLinks);
  const editFn = useServerFn(editAtlasNews);
  const stepFn = useServerFn(runAtlasStep);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["atlasNews"], queryFn: () => fn(), refetchOnMount: "always" });
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["atlasNews"] });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const d = q.data!;
  if (!d.ready) return <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION}</p>;
  const link = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < 400; i++) {
        const r = await stepFn();
        if (!r.did) break;
      }
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't link"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-semibold">In the news</h3>
      <p className="text-sm text-muted-foreground">
        Stories from posted daily issues are linked to the atlas places they are about (a pin of the
        story's map, or the place named in it), and shown as “In the news” on the place's card and
        on the atlas. Hide a wrong link here.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Linked up to {d.scannedTo === "1900-01-01" ? "— (not yet)" : d.scannedTo}
        </span>
        <Button size="sm" variant="outline" disabled={busy} onClick={link}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Link new issues now
        </Button>
        <Input
          type="date"
          aria-label="Link again from"
          className="h-8 w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={!from || busy}
          onClick={async () => {
            await editFn({ data: { op: "rescan", from } });
            await link();
          }}
        >
          Link again from this day
        </Button>
      </div>
      {!d.links.length ? (
        <p className="text-sm text-muted-foreground">No stories linked yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {d.links.map((l) => (
            <li
              key={l.id}
              className={`flex flex-wrap items-center gap-2 py-1.5 ${l.hidden ? "opacity-50" : ""}`}
              data-news-link={l.id}
            >
              <span className="w-24 text-xs text-muted-foreground">{l.date}</span>
              <span className="font-medium">{l.place.name.en}</span>
              <Badge>{l.how === "map" ? "story map" : "named"}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {l.headline.en || l.headline.hi}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={async () => {
                  await editFn({ data: { op: "hide", id: l.id, hidden: !l.hidden } });
                  await refresh();
                }}
              >
                {l.hidden ? "Show" : "Hide"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
