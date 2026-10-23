// Admin: the scheme register. Every government scheme in the news, with its
// stories in order (launch, extension, outlay revised, progress). New stories
// on a scheme print the latest of these as "Earlier"; here the editor
// renames records, merges two records of one scheme, or takes a story out.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, RefreshCw, Search, Unlink } from "lucide-react";
import {
  getCaSchemeStories,
  listCaSchemes,
  mergeCaSchemes,
  renameCaScheme,
  stepCaSchemes,
  unlinkCaSchemeStory,
  type SchemeSummary,
} from "@/lib/ca-schemes.functions";
import { formatDate } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Level = "all" | "rajasthan" | "central";

export function SchemeRegister() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCaSchemes);
  const stepFn = useServerFn(stepCaSchemes);
  const q = useQuery({ queryKey: ["caSchemes"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const stop = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["caSchemes"] });

  async function linkNow() {
    setLinking(true);
    stop.current = false;
    try {
      for (let i = 0; i < 200 && !stop.current; i++) {
        const r = await stepFn();
        if (!r.step) break;
        if (i % 3 === 0) await refresh();
      }
      toast.success("Scheme stories linked");
    } catch (e) {
      toast.error(errorText(e, "Linking stopped"));
    } finally {
      setLinking(false);
      await refresh();
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const data = q.data!;
  if (!data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        The scheme register needs a database update: run the latest migration (ca_scheme_register)
        in Lovable or the SQL editor, then reload this page.
      </p>
    );
  const term = search.trim().toLowerCase();
  const shown = data.schemes.filter(
    (s) =>
      (level === "all" || s.level === level) &&
      (!term ||
        s.name.toLowerCase().includes(term) ||
        s.name_hi.includes(search.trim()) ||
        s.aliases.some((a) => a.toLowerCase().includes(term))),
  );

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Each scheme story is linked to its scheme here as it comes in. A new story on a scheme
          prints its latest earlier stories as “Earlier: …”, so students see the scheme's journey.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="primary">{data.schemes.length} schemes</Badge>
          {data.waiting > 0 && (
            <>
              <span className="text-primary">
                {data.waiting} scheme {data.waiting === 1 ? "story" : "stories"} waiting to be
                linked
              </span>
              <Button size="sm" variant="outline" disabled={linking} onClick={() => void linkNow()}>
                <RefreshCw className={`mr-1 h-4 w-4 ${linking ? "animate-spin" : ""}`} />
                {linking ? "Linking…" : "Link now"}
              </Button>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search schemes"
            placeholder="Search schemes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <div role="radiogroup" aria-label="Level" className="flex gap-1">
          {(
            [
              ["all", "All"],
              ["rajasthan", "Rajasthan"],
              ["central", "Central"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={level === k}
              onClick={() => setLevel(k)}
              className={`rounded-full border px-3 py-1 text-xs ${level === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul className="space-y-2" data-testid="schemes">
          {shown.map((s) => (
            <SchemeRow
              key={s.id}
              scheme={s}
              all={data.schemes}
              open={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {data.schemes.length
            ? "No scheme matches."
            : "No schemes yet: they appear as scheme stories come in."}
        </p>
      )}
    </div>
  );
}

function SchemeRow({
  scheme: s,
  all,
  open,
  onToggle,
  onChanged,
}: {
  scheme: SchemeSummary;
  all: SchemeSummary[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const storiesFn = useServerFn(getCaSchemeStories);
  const renameFn = useServerFn(renameCaScheme);
  const mergeFn = useServerFn(mergeCaSchemes);
  const unlinkFn = useServerFn(unlinkCaSchemeStory);
  const sq = useQuery({
    queryKey: ["caSchemeStories", s.id],
    queryFn: () => storiesFn({ data: { id: s.id } }),
    enabled: open,
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [nameHi, setNameHi] = useState(s.name_hi);
  const [lvl, setLvl] = useState(s.level);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await qc.invalidateQueries({ queryKey: ["caSchemeStories", s.id] });
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li data-scheme={s.name} className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 flex-wrap items-center gap-2 p-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium">{s.name}</span>
          {s.name_hi && <span className="block text-sm text-muted-foreground">{s.name_hi}</span>}
        </span>
        <Badge tone={s.level === "rajasthan" ? "warn" : "muted"}>
          {s.level === "rajasthan" ? "Rajasthan" : "Central"}
        </Badge>
        <Badge tone="primary">
          {s.stories} {s.stories === 1 ? "story" : "stories"}
        </Badge>
        {s.first && (
          <span className="w-full pl-6 text-xs text-muted-foreground sm:w-auto sm:pl-0">
            {s.first === s.last
              ? formatDate(s.first, "en")
              : `${formatDate(s.first, "en")} – ${formatDate(s.last!, "en")}`}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3 text-sm">
          {s.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Also matched as: {s.aliases.join(" · ")}
            </p>
          )}
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => renameFn({ data: { id: s.id, name, name_hi: nameHi, level: lvl } }),
                  "Scheme saved",
                ).then(() => setEditing(false));
              }}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label="Scheme name"
                  value={name}
                  maxLength={160}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  aria-label="Scheme name in Hindi"
                  value={nameHi}
                  maxLength={160}
                  onChange={(e) => setNameHi(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Scheme level"
                  value={lvl}
                  onChange={(e) => setLvl(e.target.value as typeof lvl)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="central">Central</option>
                  <option value="rajasthan">Rajasthan</option>
                </select>
                <Button size="sm" type="submit" disabled={busy || !name.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Rename
              </Button>
              {all.length > 1 && (
                <select
                  aria-label={`Merge ${s.name} into`}
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const into = all.find((x) => x.id === e.target.value);
                    if (
                      into &&
                      confirm(
                        `Merge “${s.name}” into “${into.name}”? Its stories move there and its names match that scheme from now on.`,
                      )
                    )
                      void run(
                        () => mergeFn({ data: { from: s.id, into: into.id } }),
                        "Schemes merged",
                      );
                  }}
                  className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Same scheme as… (merge)</option>
                  {all
                    .filter((x) => x.id !== s.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}
          {sq.isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <ol
              className="relative space-y-2 border-l-2 border-primary/30 pl-4"
              data-testid="scheme-stories"
            >
              {(sq.data ?? []).map((st) => (
                <li key={st.id} className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      {formatDate(st.issue_date, "en")}
                      {st.status === "dropped" && " · left out"}
                    </div>
                    <a
                      href={`/admin?section=ca.daily&date=${st.issue_date}`}
                      className="break-words hover:underline"
                    >
                      {st.headline}
                    </a>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Take out ${st.headline}`}
                    title="Not about this scheme: take it out"
                    disabled={busy}
                    onClick={() =>
                      void run(() => unlinkFn({ data: { item: st.id } }), "Story taken out")
                    }
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
