// Keeping the atlas right (admin): dated facts due for a recheck, students'
// reports of mistakes (fixed
// here or dismissed), the notes' source codes and their names (shown under
// every fact), and places whose position disagrees with the surveyed place
// list or their district.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, X } from "lucide-react";
import {
  atlasPositionChecks,
  atlasRecheckList,
  confirmAtlasRecheck,
  editAtlasRecheck,
  setAtlasRecheckMonths,
  type RecheckFact,
  atlasReports,
  atlasSourcesOverview,
  decideAtlasPosition,
  saveAtlasFact,
  saveAtlasSources,
  setAtlasReport,
  type AtlasReport,
  type PositionCheck,
} from "@/lib/atlas.functions";
import { atlasCat, placePath, type SourceNames } from "@/lib/atlas";
import { googleMapsUrl } from "@/lib/map-spec";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MIGRATION = "Reports need the migration 20261217090000_atlas_reports.sql.";

export function AtlasQuality() {
  return (
    <div className="space-y-6">
      <Recheck />
      <Reports />
      <Sources />
      <Positions />
    </div>
  );
}

// ====================== Recheck ======================

const EVERY = [3, 6, 12] as const;
type Every = (typeof EVERY)[number];
const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

function Recheck() {
  const fn = useServerFn(atlasRecheckList);
  const monthsFn = useServerFn(setAtlasRecheckMonths);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["atlasRecheck"], queryFn: () => fn(), refetchOnMount: "always" });
  const [all, setAll] = useState(false);
  const [shown, setShown] = useState(30);
  const refresh = () => qc.invalidateQueries({ queryKey: ["atlasRecheck"] });
  const d = q.data;
  const list = d ? d.facts.filter((f) => all || f.isDue) : [];
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" data-recheck>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">
          Dated facts to recheck{d ? ` (${d.due} due of ${d.facts.length})` : ""}
        </h3>
        <div className="ml-auto flex gap-1">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={all === v}
              onClick={() => setAll(v)}
              className={`rounded-full border px-3 py-1 text-xs ${all === v ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
            >
              {v ? "All dated facts" : "Due now"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Facts your notes mark as changing (🔄, “as of …”). Students see only “(as of Sep 2026)”, so
        they come back here a few months after that date or your last recheck. “Still true” moves a
        month date (“Sep 2026”) to this month; a year alone (“as of 2024”) is usually the data's
        year and stays. The weekly report on Telegram says how many are due.
      </p>
      {d && (
        <label className="flex items-center gap-2 text-sm">
          Recheck every
          <select
            aria-label="Recheck every"
            value={d.months}
            onChange={async (e) => {
              await monthsFn({ data: { months: Number(e.target.value) as Every } });
              await refresh();
            }}
            className="h-8 rounded-md border border-input bg-background px-2"
          >
            {EVERY.map((m) => (
              <option key={m} value={m}>
                {m} months
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">(unless set for a fact)</span>
        </label>
      )}
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>
      ) : !list.length ? (
        <p className="text-sm text-muted-foreground">
          {all ? "No dated facts." : "Nothing due: every dated fact has been checked recently."}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.slice(0, shown).map((f) => (
              <RecheckRow key={f.id} f={f} usual={d!.months} onDone={refresh} />
            ))}
          </ul>
          {list.length > shown && (
            <Button size="sm" variant="outline" onClick={() => setShown(shown + 30)}>
              Show more ({list.length - shown})
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function RecheckRow({
  f,
  usual,
  onDone,
}: {
  f: RecheckFact;
  usual: number;
  onDone: () => Promise<unknown>;
}) {
  const okFn = useServerFn(confirmAtlasRecheck);
  const editFn = useServerFn(editAtlasRecheck);
  const [edit, setEdit] = useState(false);
  const [en, setEn] = useState(f.text_en);
  const [hi, setHi] = useState(f.text_hi);
  const [every, setEvery] = useState<Every>(f.every as Every);
  const [busy, setBusy] = useState(false);
  const run = async (go: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await go();
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li
      className="space-y-1.5 rounded-xl border border-border p-3 text-sm"
      data-recheck-fact={f.id}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {f.chapter}
          {f.heading ? ` › ${f.heading}` : ""}
        </span>
        {f.district && <Badge>{f.district}</Badge>}
        <Badge tone={f.isDue ? "warn" : "muted"}>
          {f.isDue ? "due" : `next ${monthName(f.due)}`}
        </Badge>
        <span>
          {f.label ? `as of ${f.label}` : "no date"}
          {f.checkedOn
            ? ` · checked ${new Date(f.checkedOn).toLocaleDateString("en-IN")}`
            : " · never rechecked"}
        </span>
      </div>
      <p>{f.shown}</p>
      {edit && (
        <div className="space-y-2">
          <Textarea
            aria-label="Fact (English)"
            rows={3}
            value={en}
            onChange={(e) => setEn(e.target.value)}
          />
          <Textarea
            aria-label="Fact (Hindi)"
            lang="hi"
            rows={3}
            value={hi}
            onChange={(e) => setHi(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Keep a marker like “(as of Oct 2026 — check)” so the fact stays on this list.
          </p>
          <Button
            size="sm"
            disabled={busy || !en.trim()}
            onClick={() =>
              run(async () => {
                await editFn({
                  data: { id: f.id, text_en: en, text_hi: hi, chapter_key: f.chapter_key, every },
                });
                toast.success("Fact saved and marked rechecked");
                setEdit(false);
              })
            }
          >
            Save and mark rechecked
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await okFn({ data: { id: f.id, bump: true, every } });
              toast.success(
                r.moved ? "Still true: its date is now this month" : "Still true: marked rechecked",
              );
            })
          }
        >
          <Check className="mr-1 h-4 w-4" /> Still true
        </Button>
        {!edit && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit(true)}>
            Edit
          </Button>
        )}
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          Recheck every
          <select
            aria-label="Recheck this fact every"
            value={every}
            onChange={(e) => setEvery(Number(e.target.value) as Every)}
            className="h-7 rounded-md border border-input bg-background px-1"
          >
            {EVERY.map((m) => (
              <option key={m} value={m}>
                {m} months{m === usual ? " (usual)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </li>
  );
}

// ====================== Reports ======================

function Reports() {
  const fn = useServerFn(atlasReports);
  const qc = useQueryClient();
  const [status, setStatus] = useState<AtlasReport["status"]>("open");
  const q = useQuery({
    queryKey: ["atlasReports", status],
    queryFn: () => fn({ data: { status } }),
    refetchOnMount: "always",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["atlasReports"] });
  const d = q.data;
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">
          Reports from students{d?.ready && d.open ? ` (${d.open} open)` : ""}
        </h3>
        <div className="ml-auto flex gap-1">
          {(["open", "fixed", "dismissed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs ${status === s ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
            >
              {s === "open" ? "Open" : s === "fixed" ? "Fixed" : "Dismissed"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        “Report a mistake” on a fact, a place or a district page. Fix the fact here, or the place in
        the Places tab, then mark the report fixed.
      </p>
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>
      ) : !d?.ready ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION}</p>
      ) : !d.reports.length ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-2">
          {d.reports.map((r) => (
            <ReportRow key={r.id} r={r} onDone={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportRow({ r, onDone }: { r: AtlasReport; onDone: () => Promise<unknown> }) {
  const setFn = useServerFn(setAtlasReport);
  const factFn = useServerFn(saveAtlasFact);
  const [edit, setEdit] = useState(false);
  const [en, setEn] = useState(r.now?.text_en ?? "");
  const [hi, setHi] = useState(r.now?.text_hi ?? "");
  const mark = async (status: AtlasReport["status"]) => {
    try {
      await setFn({ data: { ids: [r.id], status } });
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  return (
    <li className="space-y-1.5 rounded-xl border border-border p-3 text-sm" data-report={r.id}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge>{r.kind}</Badge>
        <span>{new Date(r.created_at).toLocaleString("en-IN")}</span>
        {r.page && (
          <a
            href={r.page}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline"
          >
            page <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {r.kind === "place" && (
          <a href={placePath(r.ref)} target="_blank" rel="noreferrer" className="underline">
            the place
          </a>
        )}
      </div>
      <p className="rounded-md bg-muted/50 p-2">{r.now?.text_en || r.now?.name || r.label}</p>
      <p>
        <span className="font-medium">What's wrong: </span>
        {r.message}
      </p>
      {r.correction && (
        <p>
          <span className="font-medium">What's right: </span>
          {r.correction}
        </p>
      )}
      {edit && r.kind === "fact" && (
        <div className="space-y-2">
          <Textarea
            aria-label="Fact (English)"
            rows={3}
            value={en}
            onChange={(e) => setEn(e.target.value)}
          />
          <Textarea
            aria-label="Fact (Hindi)"
            lang="hi"
            rows={3}
            value={hi}
            onChange={(e) => setHi(e.target.value)}
          />
          <Button
            size="sm"
            onClick={async () => {
              try {
                await factFn({
                  data: { id: r.ref, text_en: en, text_hi: hi, chapter_key: r.now?.chapter_key },
                });
                await setFn({ data: { ids: [r.id], status: "fixed" } });
                toast.success("Fact corrected; the report is marked fixed");
                await onDone();
              } catch (e) {
                toast.error(errorText(e, "Couldn't save"));
              }
            }}
          >
            Save the fact and mark fixed
          </Button>
        </div>
      )}
      {r.status === "open" ? (
        <div className="flex flex-wrap gap-2">
          {r.kind === "fact" && r.now && !edit && (
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
              Correct the fact
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => mark("fixed")}>
            <Check className="mr-1 h-4 w-4" /> Fixed
          </Button>
          <Button size="sm" variant="ghost" onClick={() => mark("dismissed")}>
            <X className="mr-1 h-4 w-4" /> Dismiss
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => mark("open")}>
          Open again
        </Button>
      )}
    </li>
  );
}

// ====================== Sources ======================

function Sources() {
  const fn = useServerFn(atlasSourcesOverview);
  const saveFn = useServerFn(saveAtlasSources);
  const q = useQuery({ queryKey: ["atlasSources"], queryFn: () => fn(), refetchOnMount: "always" });
  const [names, setNames] = useState<SourceNames>({});
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!q.data) return;
    setNames(
      Object.fromEntries(
        q.data.sources.map((s) => [s.code, { name: s.name, ...(s.url ? { url: s.url } : {}) }]),
      ),
    );
  }, [q.data]);
  if (!q.data) return null;
  const rows = [...new Set([...q.data.sources.map((s) => s.code), ...Object.keys(names)])];
  const count = new Map(q.data.sources.map((s) => [s.code, s.facts]));
  const set = (c: string, p: Partial<SourceNames[string]>) =>
    setNames({ ...names, [c]: { ...(names[c] ?? { name: { en: "", hi: "" } }), ...p } });
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" data-sources>
      <h3 className="font-semibold">Sources</h3>
      <p className="text-sm text-muted-foreground">
        Your notes cite their sources by code (“[PW]” in a fact, “CC PW UPD” after a heading).
        Students see them under each fact, by the name you give here (the code when there is none).{" "}
        {q.data.unsourced} of {q.data.facts} facts cite no source; they show as from your notes.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">Code</th>
              <th className="py-1 pr-2 font-medium">Facts</th>
              <th className="py-1 pr-2 font-medium">Name (English)</th>
              <th className="py-1 pr-2 font-medium">Name (Hindi)</th>
              <th className="py-1 font-medium">Link (optional)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c} className="border-t border-border" data-source={c}>
                <td className="py-1 pr-2 font-mono">{c}</td>
                <td className="py-1 pr-2">{count.get(c) ?? 0}</td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`${c} name (English)`}
                    value={names[c]?.name.en ?? ""}
                    onChange={(e) =>
                      set(c, {
                        name: { ...(names[c]?.name ?? { en: "", hi: "" }), en: e.target.value },
                      })
                    }
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`${c} name (Hindi)`}
                    lang="hi"
                    value={names[c]?.name.hi ?? ""}
                    onChange={(e) =>
                      set(c, {
                        name: { ...(names[c]?.name ?? { en: "", hi: "" }), hi: e.target.value },
                      })
                    }
                  />
                </td>
                <td className="py-1">
                  <Input
                    aria-label={`${c} link`}
                    value={names[c]?.url ?? ""}
                    onChange={(e) => set(c, { url: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="New source code"
          placeholder="Another code (e.g. RBSE)"
          className="w-48"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10))}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={code.length < 2 || rows.includes(code)}
          onClick={() => {
            set(code, {});
            setCode("");
          }}
        >
          Add code
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={async () => {
            try {
              await saveFn({ data: names });
              toast.success("Sources saved");
              await q.refetch();
            } catch (e) {
              toast.error(errorText(e, "Couldn't save"));
            }
          }}
        >
          Save sources
        </Button>
      </div>
    </section>
  );
}

// ====================== Positions ======================

const PROBLEM: Record<PositionCheck["problems"][number], string> = {
  far: "far from the place list's",
  district: "in another district",
  outside: "outside Rajasthan",
};

function Positions() {
  const fn = useServerFn(atlasPositionChecks);
  const decideFn = useServerFn(decideAtlasPosition);
  const [run, setRun] = useState(false);
  const q = useQuery({
    queryKey: ["atlasPositions"],
    queryFn: () => fn(),
    enabled: run,
  });
  const decide = async (
    key: string,
    decision: { use: "list"; lat: number; lon: number } | { use: "district" } | { use: "keep" },
  ) => {
    try {
      await decideFn({ data: { key, decision } });
      await q.refetch();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const d = q.data;
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" data-positions>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Position checks</h3>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => (run ? q.refetch() : setRun(true))}
        >
          {q.isFetching ? "Checking…" : run ? "Check again" : "Check the positions"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Each place is compared with the surveyed place list: a place of exactly the same name there
        5–60 km away, a position in another district than the one given, or outside Rajasthan. Use
        the list's position, take the district its position is in, or keep it as it is (it isn't
        shown again unless it moves).
      </p>
      {d && (
        <p className="text-sm">
          {d.checks.length} to look at, of {d.checked} places
          {d.kept ? ` (${d.kept} kept as they are)` : ""}.
        </p>
      )}
      {d && d.checks.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {d.checks.slice(0, 150).map((c) => (
            <li key={c.key} className="space-y-1 py-2" data-position={c.key}>
              <div className="flex flex-wrap items-center gap-2">
                <span>{atlasCat(c.cat).icon}</span>
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.district || "no district"}</span>
                {c.problems.map((p) => (
                  <Badge key={p} tone="warn">
                    {PROBLEM[p]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <a
                  href={googleMapsUrl(c.lat, c.lon)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Atlas: {c.lat.toFixed(3)}, {c.lon.toFixed(3)}
                </a>
                {c.inDistrict && ` (in ${c.inDistrict})`}
                {c.list && (
                  <>
                    {" · "}
                    <a
                      href={googleMapsUrl(c.list.lat, c.list.lon)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Place list “{c.list.name}”: {c.list.lat.toFixed(3)}, {c.list.lon.toFixed(3)}
                    </a>{" "}
                    ({c.list.km} km away{c.list.district ? `, in ${c.list.district}` : ""})
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {c.list && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() =>
                      decide(c.key, { use: "list", lat: c.list!.lat, lon: c.list!.lon })
                    }
                  >
                    Use the list's position
                  </Button>
                )}
                {c.problems.includes("district") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => decide(c.key, { use: "district" })}
                  >
                    Make it {c.inDistrict}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => decide(c.key, { use: "keep" })}
                >
                  Keep as it is
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
