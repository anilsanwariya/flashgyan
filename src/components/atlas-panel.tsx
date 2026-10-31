// The Rajasthan atlas in the admin panel: the master map imported (and
// re-imported as it grows), the background work (Hindi, the knowledge
// base) moved on, the 41 districts' overview pages, and every fact, place
// and layer checked, corrected, verified or hidden.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2, Pause, Play, Upload } from "lucide-react";
import {
  atlasChapters,
  atlasStatus,
  importMasterMap,
  listAtlasDistricts,
  listAtlasFacts,
  listAtlasLayers,
  listAtlasPlaces,
  resumeAtlasJobs,
  runAtlasStep,
  saveAtlasFact,
  saveAtlasLayer,
  saveAtlasPlace,
  type ImportResult,
} from "@/lib/atlas.functions";
import {
  ATLAS_CATS,
  FACT_KINDS,
  atlasCat,
  type AtlasFact,
  type AtlasPlace,
  type AtlasStatus,
} from "@/lib/atlas";
import { googleMapsUrl as googleMapsHref } from "@/lib/map-spec";
import { Badge, PageTabs, errorText, useUrlTab } from "@/components/ca-ui";
import { AtlasDistrictEditor } from "@/components/atlas-district-editor";
import { AtlasPractice } from "@/components/atlas-practice-panel";
import { AtlasSuggestions, TimeFields } from "@/components/atlas-themes-panel";
import { AtlasAcross } from "@/components/atlas-news-panel";
import { DistrictChecklist, GapsReport, HindiReview } from "@/components/atlas-review-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const TABS = [
  "overview",
  "districts",
  "facts",
  "places",
  "layers",
  "hindi",
  "gaps",
  "suggestions",
  "across",
  "practice",
] as const;
type Tab = (typeof TABS)[number];
const MIGRATION =
  "The atlas needs its database tables: run the migration 20261212090000_rajasthan_atlas.sql.";
const STATUS_NAME: Record<AtlasStatus, string> = {
  verified: "Verified",
  to_check: "To check",
  hidden: "Hidden",
};
const statusTone = (s: AtlasStatus) =>
  s === "verified" ? "good" : s === "to_check" ? "warn" : "muted";

export function AtlasPanel() {
  const [tab, setTab] = useUrlTab(TABS, "overview");
  return (
    <div className="space-y-4">
      <PageTabs<Tab>
        label="Rajasthan atlas"
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "districts", label: "District pages" },
          { id: "facts", label: "Facts" },
          { id: "places", label: "Places" },
          { id: "layers", label: "Layers" },
          { id: "hindi", label: "Hindi review" },
          { id: "gaps", label: "Gaps" },
          { id: "suggestions", label: "Suggestions" },
          { id: "across", label: "Across the site" },
          { id: "practice", label: "Practice" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "overview" && <Overview />}
      {tab === "districts" && <Districts />}
      {tab === "facts" && <Facts />}
      {tab === "places" && <Places />}
      {tab === "layers" && <Layers />}
      {tab === "hindi" && <HindiReview />}
      {tab === "gaps" && <GapsReport />}
      {tab === "suggestions" && <AtlasSuggestions />}
      {tab === "across" && <AtlasAcross />}
      {tab === "practice" && <AtlasPractice />}
    </div>
  );
}

// ====================== Overview: import and background work ======================

function Overview() {
  const statusFn = useServerFn(atlasStatus);
  const importFn = useServerFn(importMasterMap);
  const stepFn = useServerFn(runAtlasStep);
  const resumeFn = useServerFn(resumeAtlasJobs);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlasStatus"],
    queryFn: () => statusFn(),
    refetchOnMount: "always",
  });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["atlasStatus"] });

  // Runs the background work from this page, a step at a time, until it
  // is done or stopped (the minute tick does the same, more slowly).
  const run = async () => {
    setRunning(true);
    stop.current = false;
    try {
      for (let i = 0; i < 500 && !stop.current; i++) {
        const r = await stepFn();
        if (i % 3 === 0) await refresh();
        if (!r.did) break;
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't move on"));
    } finally {
      setRunning(false);
      await refresh();
    }
  };
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );

  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const s = q.data!;
  if (!s.ready) return <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION}</p>;
  const stat = (label: string, n: number, sub?: string) => (
    <div className="rounded-xl border border-border p-3">
      <p className="text-2xl font-bold">{n.toLocaleString("en-IN")}</p>
      <p className="text-sm">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Places", s.places, `${s.placesToCheck} to check · ${s.placesNoHindi} without Hindi`)}
        {stat(
          "Facts",
          s.facts,
          `${s.factsToCheck} to check · ${s.factsNoHindi} without Hindi · ${s.factsAiHindi} AI Hindi`,
        )}
        {stat("Layers", s.layers)}
        {stat("District pages", s.overviews, `${s.published} published`)}
      </div>
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Import the master map</h3>
        <p className="text-sm text-muted-foreground">
          Choose the master map's HTML file. New places and facts are added; changed ones are
          updated, except those you've edited here; ones no longer in the file are marked, not
          deleted. Then Hindi is filled in and the verified facts go to the knowledge base (subject
          "Rajasthan Atlas"), in the background.
        </p>
        <input
          ref={file}
          type="file"
          accept=".html,.htm,text/html"
          className="hidden"
          aria-label="Master map file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setImporting(true);
            try {
              const r = await importFn({ data: { html: await f.text() } });
              setResult(r);
              toast.success("Imported");
              await refresh();
            } catch (err) {
              toast.error(errorText(err, "Couldn't import it"));
            } finally {
              setImporting(false);
            }
          }}
        />
        <Button disabled={importing} onClick={() => file.current?.click()}>
          {importing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1 h-4 w-4" />
          )}
          {importing ? "Importing…" : "Choose the file"}
        </Button>
        {result && (
          <p className="text-sm" data-import-result>
            Places: {result.places.added} added, {result.places.updated} updated,{" "}
            {result.places.kept} kept as you edited them, {result.places.gone} no longer in the
            file. Facts: {result.facts.added} added, {result.facts.updated} updated,{" "}
            {result.facts.kept} kept, {result.facts.gone} no longer in the file. {result.layers}{" "}
            layers, {result.districts} districts, {result.chapters} chapters.
          </p>
        )}
      </section>
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Background work</h3>
        <ul className="space-y-1 text-sm">
          <li>
            Hindi translation:{" "}
            {s.jobs.translate ? (
              <Badge tone="primary">{s.factsNoHindi + s.placesNoHindi} left</Badge>
            ) : (
              <Badge tone="good">done</Badge>
            )}{" "}
            <span className="text-xs text-muted-foreground">
              AI Hindi stays marked until you check it (Facts tab).
            </span>
          </li>
          <li>
            Knowledge base:{" "}
            {s.jobs.kb.length ? (
              <Badge tone="primary">{s.jobs.kb.length} chapters left</Badge>
            ) : (
              <Badge tone="good">up to date</Badge>
            )}{" "}
            <span className="text-xs text-muted-foreground">{s.kbDocs} documents</span>
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button variant="outline" onClick={() => (stop.current = true)}>
              <Pause className="mr-1 h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button onClick={() => void run()}>
              <Play className="mr-1 h-4 w-4" /> Run it now
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await resumeFn({ data: { translate: true, kb: true } });
              await refresh();
            }}
          >
            Redo all (Hindi gaps, knowledge base)
          </Button>
          {running && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Working… (it also runs every minute on
              its own)
            </span>
          )}
        </div>
      </section>
      <a
        href="/atlas"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline"
      >
        Open the students' atlas <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

// ====================== District pages ======================

function Districts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <DistrictChecklist onOpen={setOpen} />
      {open && (
        <AtlasDistrictEditor
          district={open}
          onClose={() => {
            setOpen(null);
            void qc.invalidateQueries({ queryKey: ["atlasChecklist"] });
          }}
        />
      )}
    </>
  );
}

// ====================== Facts ======================

function Facts() {
  const listFn = useServerFn(listAtlasFacts);
  const chFn = useServerFn(atlasChapters);
  const saveFn = useServerFn(saveAtlasFact);
  const chapters = useQuery({ queryKey: ["atlasChapters"], queryFn: () => chFn() });
  const [f, setF] = useState<{
    chapter: string;
    status: AtlasStatus | "all";
    q: string;
    entity: string;
    kind: number;
    aiHindi: boolean;
    page: number;
  }>({
    chapter: "",
    status: "all",
    q: "",
    entity: "",
    kind: 0,
    aiHindi: false,
    page: 0,
  });
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, q: search, page: 0 })), 400);
    return () => clearTimeout(t);
  }, [search]);
  const qc = useQueryClient();
  const key = ["atlasFacts", f];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      listFn({
        data: {
          ...(f.chapter ? { chapter: f.chapter } : {}),
          status: f.status,
          ...(f.q ? { q: f.q } : {}),
          ...(f.entity ? { entity: f.entity } : {}),
          ...(f.kind ? { kind: f.kind } : {}),
          ...(f.aiHindi ? { aiHindi: true } : {}),
          page: f.page,
        },
      }),
    placeholderData: (p) => p,
  });
  const save = async (fact: AtlasFact, patch: Partial<AtlasFact>) => {
    try {
      await saveFn({ data: { id: fact.id, chapter_key: fact.chapter_key, ...patch } as never });
      await qc.invalidateQueries({ queryKey: ["atlasFacts"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Chapter"
          className={select}
          value={f.chapter}
          onChange={(e) => setF({ ...f, chapter: e.target.value, page: 0 })}
        >
          <option value="">All chapters</option>
          {(chapters.data ?? []).map((c) => (
            <option key={c.key} value={c.key}>
              {c.subject === "pol" ? "Polity" : "Geography"} · {c.title} ({c.facts})
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={select}
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value as AtlasStatus | "all", page: 0 })}
        >
          <option value="all">Any status</option>
          <option value="verified">Verified</option>
          <option value="to_check">To check</option>
          <option value="hidden">Hidden</option>
        </select>
        <select
          aria-label="Kind"
          className={select}
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: Number(e.target.value), page: 0 })}
        >
          <option value={0}>Any kind</option>
          {FACT_KINDS.map((k) => (
            <option key={k.key} value={k.bit}>
              {k.name.en}
            </option>
          ))}
        </select>
        <Input
          aria-label="Entity"
          placeholder="D:Bikaner, P:fort:…"
          value={f.entity}
          onChange={(e) => setF({ ...f, entity: e.target.value.trim(), page: 0 })}
          className="w-44"
        />
        <Input
          aria-label="Search facts"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={f.aiHindi}
            onChange={(e) => setF({ ...f, aiHindi: e.target.checked, page: 0 })}
          />{" "}
          AI Hindi
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {q.data?.total ?? "…"} facts. Students see verified facts only; "to check" ones (marked
        [verify] in your notes) wait for you.
      </p>
      <ul className="space-y-2">
        {(q.data?.rows ?? []).map((x) => (
          <FactRow key={x.id} fact={x} onSave={(p) => save(x, p)} />
        ))}
      </ul>
      <Pager page={f.page} total={q.data?.total ?? 0} onPage={(page) => setF({ ...f, page })} />
    </div>
  );
}

function FactRow({
  fact,
  onSave,
}: {
  fact: AtlasFact;
  onSave: (p: Partial<AtlasFact>) => Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const [en, setEn] = useState(fact.text_en);
  const [hi, setHi] = useState(fact.text_hi);
  const [note, setNote] = useState(fact.note);
  return (
    <li className="space-y-1.5 rounded-xl border border-border p-3 text-sm" data-fact-row={fact.id}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{fact.chapter}</span>·<span>{fact.heading}</span>
        {FACT_KINDS.filter((k) => fact.flags & k.bit).map((k) => (
          <Badge key={k.key}>{k.name.en}</Badge>
        ))}
        {fact.hi_ai && <Badge tone="warn">AI Hindi</Badge>}
        {fact.edited && <Badge tone="primary">Edited</Badge>}
        {!fact.in_file && <Badge tone="bad">Not in the file now</Badge>}
        <select
          aria-label="Fact status"
          value={fact.status}
          onChange={(e) => void onSave({ status: e.target.value as AtlasStatus })}
          className="ml-auto h-7 rounded-md border border-input bg-background px-1.5 text-xs"
        >
          {(["verified", "to_check", "hidden"] as const).map((s) => (
            <option key={s} value={s}>
              {STATUS_NAME[s]}
            </option>
          ))}
        </select>
      </div>
      {edit ? (
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
          <Input
            aria-label="Verification note"
            placeholder="Your verification note (not shown to students)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await onSave({ text_en: en, text_hi: hi, note });
                setEdit(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="block w-full space-y-1 text-left"
          onClick={() => setEdit(true)}
          title="Edit"
        >
          <p>{fact.text_en}</p>
          {fact.text_hi && <p className="text-muted-foreground">{fact.text_hi}</p>}
          {fact.note && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Note: {fact.note}</p>
          )}
        </button>
      )}
      {fact.entities.length > 0 && (
        <p className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          {fact.entities.slice(0, 12).map((e) => (
            <span key={e} className="rounded bg-muted px-1">
              {e}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / 100);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page + 1} of {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

// ====================== Places ======================

function Places() {
  const listFn = useServerFn(listAtlasPlaces);
  const saveFn = useServerFn(saveAtlasPlace);
  const districts = useServerFn(listAtlasDistricts);
  const dq = useQuery({ queryKey: ["atlasDistricts"], queryFn: () => districts() });
  const [f, setF] = useState<{
    district: string;
    cat: string;
    status: AtlasStatus | "all";
    q: string;
    page: number;
  }>({
    district: "",
    cat: "",
    status: "all",
    q: "",
    page: 0,
  });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, q: search, page: 0 })), 400);
    return () => clearTimeout(t);
  }, [search]);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlasPlaces", f],
    queryFn: () =>
      listFn({
        data: {
          ...(f.district ? { district: f.district } : {}),
          ...(f.cat ? { cat: f.cat } : {}),
          status: f.status,
          ...(f.q ? { q: f.q } : {}),
          page: f.page,
        },
      }),
    placeholderData: (p) => p,
  });
  const save = async (p: Partial<AtlasPlace> & { id?: string }) => {
    try {
      await saveFn({ data: p as never });
      await qc.invalidateQueries({ queryKey: ["atlasPlaces"] });
      toast.success("Saved");
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
      return false;
    }
  };
  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="District"
          className={select}
          value={f.district}
          onChange={(e) => setF({ ...f, district: e.target.value, page: 0 })}
        >
          <option value="">All districts</option>
          {(dq.data ?? []).map((d) => (
            <option key={d.district} value={d.district}>
              {d.district}
            </option>
          ))}
        </select>
        <select
          aria-label="Category"
          className={select}
          value={f.cat}
          onChange={(e) => setF({ ...f, cat: e.target.value, page: 0 })}
        >
          <option value="">All categories</option>
          {ATLAS_CATS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.icon} {c.name.en}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={select}
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value as AtlasStatus | "all", page: 0 })}
        >
          <option value="all">Any status</option>
          <option value="verified">Verified</option>
          <option value="to_check">To check</option>
          <option value="hidden">Hidden</option>
        </select>
        <Input
          aria-label="Search places"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
        <Button size="sm" className="ml-auto" onClick={() => setAdding(!adding)}>
          Add a place
        </Button>
      </div>
      {adding && <PlaceForm onSave={async (p) => (await save(p)) && setAdding(false)} />}
      <p className="text-xs text-muted-foreground">{q.data?.total ?? "…"} places</p>
      <ul className="space-y-1.5">
        {(q.data?.rows ?? []).map((p) => (
          <PlaceRow key={p.id} place={p} onSave={(patch) => save({ id: p.id, ...patch })} />
        ))}
      </ul>
      <Pager page={f.page} total={q.data?.total ?? 0} onPage={(page) => setF({ ...f, page })} />
    </div>
  );
}

function PlaceRow({
  place,
  onSave,
}: {
  place: AtlasPlace;
  onSave: (p: Partial<AtlasPlace>) => Promise<unknown>;
}) {
  const [edit, setEdit] = useState(false);
  const c = atlasCat(place.cat);
  if (edit)
    return (
      <li>
        <PlaceForm
          place={place}
          onSave={async (p) => {
            await onSave(p);
            setEdit(false);
          }}
          onCancel={() => setEdit(false)}
        />
      </li>
    );
  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
      data-place-row={place.key}
    >
      <span>{c.icon}</span>
      <button type="button" className="min-w-0 text-left" onClick={() => setEdit(true)}>
        <span className="font-medium">{place.label_en || place.name_en}</span>{" "}
        <span className="text-muted-foreground">{place.label_hi || place.name_hi}</span>
      </button>
      <span className="text-xs text-muted-foreground">
        {c.name.en} · {place.district || "outside"} {place.tehsil ? `· ${place.tehsil}` : ""}
      </span>
      {place.edited && <Badge tone="primary">Edited</Badge>}
      {!place.in_file && <Badge tone="bad">Not in the file now</Badge>}
      <a
        href={googleMapsHref(place.lat, place.lon)}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary underline"
      >
        {place.lat.toFixed(3)}, {place.lon.toFixed(3)}
      </a>
      <span className="ml-auto">
        <select
          aria-label="Place status"
          value={place.status}
          onChange={(e) => void onSave({ status: e.target.value as AtlasStatus })}
          className={`h-7 rounded-md border border-input bg-background px-1.5 text-xs`}
        >
          {(["verified", "to_check", "hidden"] as const).map((s) => (
            <option key={s} value={s}>
              {STATUS_NAME[s]}
            </option>
          ))}
        </select>
      </span>
      <span className="sr-only">
        <Badge tone={statusTone(place.status)}>{STATUS_NAME[place.status]}</Badge>
      </span>
    </li>
  );
}

function PlaceForm({
  place,
  onSave,
  onCancel,
}: {
  place?: AtlasPlace;
  onSave: (p: Partial<AtlasPlace>) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [p, setP] = useState<Partial<AtlasPlace>>(
    place ?? {
      name_en: "",
      name_hi: "",
      label_en: "",
      label_hi: "",
      cat: "town",
      lat: 26.9,
      lon: 75.8,
      note_en: "",
      note_hi: "",
    },
  );
  const set = (x: Partial<AtlasPlace>) => setP({ ...p, ...x });
  return (
    <div className="grid gap-2 rounded-xl border border-primary/40 p-3 text-sm sm:grid-cols-2">
      <Input
        aria-label="Name (English)"
        placeholder="Name (English)"
        value={p.name_en ?? ""}
        onChange={(e) => set({ name_en: e.target.value })}
      />
      <Input
        aria-label="Name (Hindi)"
        lang="hi"
        placeholder="नाम (हिंदी)"
        value={p.name_hi ?? ""}
        onChange={(e) => set({ name_hi: e.target.value })}
      />
      <Input
        aria-label="Label (English)"
        placeholder="Label on the map (English)"
        value={p.label_en ?? ""}
        onChange={(e) => set({ label_en: e.target.value })}
      />
      <Input
        aria-label="Label (Hindi)"
        lang="hi"
        placeholder="मानचित्र पर नाम (हिंदी)"
        value={p.label_hi ?? ""}
        onChange={(e) => set({ label_hi: e.target.value })}
      />
      <select
        aria-label="Category"
        value={p.cat}
        onChange={(e) => set({ cat: e.target.value })}
        className="h-9 rounded-md border border-input bg-background px-2"
      >
        {ATLAS_CATS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.icon} {c.name.en}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Input
          aria-label="Latitude"
          type="number"
          step="0.001"
          value={p.lat}
          onChange={(e) => set({ lat: Number(e.target.value) })}
        />
        <Input
          aria-label="Longitude"
          type="number"
          step="0.001"
          value={p.lon}
          onChange={(e) => set({ lon: Number(e.target.value) })}
        />
        <a
          href={googleMapsHref(p.lat ?? 0, p.lon ?? 0)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center text-xs text-primary underline"
        >
          Check
        </a>
      </div>
      <Textarea
        aria-label="Note (English)"
        rows={2}
        placeholder="Note (English)"
        value={p.note_en ?? ""}
        onChange={(e) => set({ note_en: e.target.value })}
      />
      <Textarea
        aria-label="Note (Hindi)"
        lang="hi"
        rows={2}
        placeholder="नोट (हिंदी)"
        value={p.note_hi ?? ""}
        onChange={(e) => set({ note_hi: e.target.value })}
      />
      <div className="sm:col-span-2">
        <TimeFields
          value={{ era_from: p.era_from ?? null, era_to: p.era_to ?? null, months: p.months ?? [] }}
          onChange={(t) => set(t)}
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button
          size="sm"
          onClick={() =>
            void onSave({
              name_en: p.name_en,
              name_hi: p.name_hi,
              label_en: p.label_en,
              label_hi: p.label_hi,
              cat: p.cat,
              lat: p.lat,
              lon: p.lon,
              note_en: p.note_en,
              note_hi: p.note_hi,
              era_from: p.era_from ?? null,
              era_to: p.era_to ?? null,
              months: p.months ?? [],
              ...(place && (place.lat !== p.lat || place.lon !== p.lon) ? { district: "" } : {}),
            })
          }
        >
          Save
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ====================== Layers ======================

function Layers() {
  const fn = useServerFn(listAtlasLayers);
  const saveFn = useServerFn(saveAtlasLayer);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["atlasLayers"], queryFn: () => fn() });
  const save = async (key: string, patch: Record<string, unknown>) => {
    try {
      await saveFn({ data: { key, ...patch } });
      await qc.invalidateQueries({ queryKey: ["atlasLayers"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        The thematic layers for the students' atlas and for maps in the notes, the magazine and GK
        cards. "Schematic" layers come from the notes' sketch maps, not surveyed boundaries;
        students see that.
      </p>
      <ul className="space-y-1.5">
        {(q.data ?? []).map((l) => (
          <li
            key={l.key}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <Input
              aria-label={`${l.key} name (English)`}
              defaultValue={l.name_en}
              className="h-8 w-56"
              onBlur={(e) =>
                e.target.value !== l.name_en && void save(l.key, { name_en: e.target.value })
              }
            />
            <Input
              aria-label={`${l.key} name (Hindi)`}
              lang="hi"
              defaultValue={l.name_hi}
              className="h-8 w-56"
              onBlur={(e) =>
                e.target.value !== l.name_hi && void save(l.key, { name_hi: e.target.value })
              }
            />
            <span className="text-xs text-muted-foreground">
              {l.grp} · {l.size} items
            </span>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={l.approx}
                onChange={(e) => void save(l.key, { approx: e.target.checked })}
              />{" "}
              Schematic
            </label>
            <select
              aria-label={`${l.key} status`}
              value={l.status}
              onChange={(e) => void save(l.key, { status: e.target.value })}
              className="ml-auto h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            >
              {(["verified", "to_check", "hidden"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_NAME[s]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
