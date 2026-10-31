// The atlas on the syllabus (admin): each Rajasthan section's master outline
// with how many atlas facts each topic has, the topics with none, and the
// chapter headings filed under each (by SAATHI, or changed by the editor).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import {
  atlasSyllabusCoverage,
  runAtlasStep,
  setAtlasGroupTopics,
  startAtlasSyllabusLinks,
} from "@/lib/atlas.functions";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

type Coverage = Extract<Awaited<ReturnType<typeof atlasSyllabusCoverage>>, { ready: true }>;
type Topic = Coverage["topics"][number];
type Group = Coverage["groups"][number];

const DEPTH = { chapter: 0, topic: 1, subtopic: 2 } as const;

export function AtlasSyllabus() {
  const fn = useServerFn(atlasSyllabusCoverage);
  const startFn = useServerFn(startAtlasSyllabusLinks);
  const stepFn = useServerFn(runAtlasStep);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlasSyllabus"],
    queryFn: () => fn(),
    refetchOnMount: "always",
  });
  const [section, setSection] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["atlasSyllabus"] });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const d = q.data!;
  if (!d.ready || !d.sections.length)
    return (
      <p className="rounded-lg bg-amber-500/10 p-3 text-sm">
        The atlas is filed under the master outlines of the Rajasthan sections (Geography, History,
        Art &amp; Culture, Polity, Economy). Make them first in Syllabus → Master outlines.
      </p>
    );
  const sec = section && d.sections.includes(section) ? section : d.sections[0];
  const filed = d.groups.filter((g) => g.topics !== null).length;
  const unfiled = d.groups.filter((g) => g.topics?.length === 0);
  const own = d.topics.filter((t) => t.section === sec);
  const empty = own.filter((t) => t.total === 0).length;
  const file = async (again: boolean) => {
    setBusy(again ? "again" : "new");
    try {
      const r = await startFn({ data: { again } });
      if (!r.pending) toast.success("Every heading is filed already");
      for (let i = 0; i < 400; i++) {
        const s = await stepFn();
        if (!s.did) break;
        if (i % 3 === 2) await refresh();
      }
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't file"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4" data-atlas-syllabus>
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">The atlas on the syllabus</h3>
        <p className="text-sm text-muted-foreground">
          SAATHI files each chapter heading of the atlas under the topics of the master outlines, so
          you can see which syllabus topics have few or no facts. Change a heading's topics where it
          got them wrong: your filing is kept when SAATHI files again.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {filed} of {d.groups.length} headings filed
            {d.pending ? ` · ${d.pending} waiting` : ""}
          </span>
          <Button size="sm" disabled={!!busy} onClick={() => file(false)}>
            {busy === "new" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            File new headings
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => file(true)}>
            {busy === "again" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            File all again
          </Button>
        </div>
        {d.error && <p className="text-sm text-destructive">Last time: {d.error}</p>}
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap gap-1">
          {d.sections.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === sec}
              onClick={() => setSection(s)}
              className={`rounded-full border px-3 py-1 text-xs ${s === sec ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)}
          />
          Only topics with no facts ({empty})
        </label>
        <ul className="divide-y divide-border text-sm">
          {ordered(own)
            .filter((t) => !onlyEmpty || t.total === 0)
            .map((t) => (
              <TopicRow key={t.id} t={t} d={d} onDone={refresh} />
            ))}
        </ul>
      </section>

      {unfiled.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border p-4">
          <h3 className="font-semibold">Headings under no topic ({unfiled.length})</h3>
          <p className="text-sm text-muted-foreground">
            SAATHI found nothing in the outlines for these. File them yourself, or add the topic to
            the outline.
          </p>
          <ul className="space-y-1.5 text-sm">
            {unfiled.map((g) => (
              <GroupRow key={g.key} g={g} d={d} onDone={refresh} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// The outline in reading order (each topic after its parent).
function ordered(topics: Topic[]): Topic[] {
  const out: Topic[] = [];
  const walk = (parent: string | null) => {
    for (const t of topics
      .filter((x) => x.parent_id === parent)
      .sort((a, b) => a.position - b.position || a.name_en.localeCompare(b.name_en))) {
      out.push(t);
      walk(t.id);
    }
  };
  walk(null);
  return out;
}

function TopicRow({ t, d, onDone }: { t: Topic; d: Coverage; onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const groups = d.groups.filter((g) => t.groups.includes(g.key));
  return (
    <li className="py-1.5" data-topic={t.id} style={{ paddingLeft: DEPTH[t.level] * 20 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        disabled={!groups.length}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={t.level === "chapter" ? "font-semibold" : ""}>{t.name_en}</span>
        {t.total === 0 ? (
          <span className="ml-auto">
            <Badge tone="warn">no facts</Badge>
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            {t.total} fact{t.total === 1 ? "" : "s"}
          </span>
        )}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {groups.map((g) => (
            <GroupRow key={g.key} g={g} d={d} onDone={onDone} />
          ))}
        </ul>
      )}
    </li>
  );
}

function GroupRow({ g, d, onDone }: { g: Group; d: Coverage; onDone: () => Promise<unknown> }) {
  const setFn = useServerFn(setAtlasGroupTopics);
  const [edit, setEdit] = useState(false);
  const name = (id: string) => d.topics.find((t) => t.id === id)?.name_en ?? "?";
  const save = async (topics: string[]) => {
    try {
      await setFn({ data: { key: g.key, topics } });
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  return (
    <li className="rounded-lg bg-muted/40 p-2" data-group={g.key}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {g.chapter}
          {g.heading ? ` › ${g.heading}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">{g.facts} facts</span>
        {g.manual && <Badge>filed by you</Badge>}
        <button
          type="button"
          onClick={() => setEdit(!edit)}
          className="ml-auto text-xs text-primary underline"
        >
          {edit ? "Done" : "Change topics"}
        </button>
      </div>
      {g.sample[0] && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.sample[0]}</p>
      )}
      {edit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {(g.topics ?? []).map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
            >
              {name(id)}
              <button
                type="button"
                aria-label={`Remove ${name(id)}`}
                onClick={() => save((g.topics ?? []).filter((x) => x !== id))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <select
            aria-label="Add a topic"
            value=""
            onChange={(e) => e.target.value && save([...(g.topics ?? []), e.target.value])}
            className="h-7 max-w-64 rounded-md border border-input bg-background px-1 text-xs"
          >
            <option value="">Add a topic…</option>
            {d.sections.map((s) => (
              <optgroup key={s} label={s}>
                {ordered(d.topics.filter((t) => t.section === s)).map((t) => (
                  <option key={t.id} value={t.id}>
                    {"  ".repeat(DEPTH[t.level])}
                    {t.name_en}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}
