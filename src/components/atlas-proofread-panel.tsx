// Admin: the atlas's proofreading desk. Choose a subject, then a topic and
// subtopic (each with how far it is checked); read its facts, correct them
// in English and Hindi, verify, send back to check, hide or delete them —
// one by one or many at once — and tag each with the places and districts it
// is about (or a new place made on the spot). Keys on a focused fact: V
// verify, C to check, H hide, E edit, X select, J/K next/previous.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronRight, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  atlasProofDelete,
  atlasProofList,
  atlasProofNewPlace,
  atlasProofOutline,
  atlasProofPlaces,
  atlasProofStatus,
  atlasProofTag,
  precheckAtlasFact,
  saveAtlasFact,
} from "@/lib/atlas.functions";
import { ATLAS_CATS, ATLAS_SUBJECTS, atlasCat, type AtlasStatus } from "@/lib/atlas";
import { useAtlasBase } from "@/components/atlas-data";
import { errorText } from "@/components/ca-ui";

type Outline = Awaited<ReturnType<typeof atlasProofOutline>>;
type Topic = Outline[number];
type Counts = Topic["counts"];
type Fact = Awaited<ReturnType<typeof atlasProofList>>["rows"][number];
type StatusFilter = AtlasStatus | "all";

const STATUS: { key: AtlasStatus; label: string; on: string }[] = [
  { key: "verified", label: "Verified", on: "bg-emerald-600 text-white border-emerald-600" },
  { key: "to_check", label: "To check", on: "bg-amber-500 text-white border-amber-500" },
  { key: "hidden", label: "Hidden", on: "bg-slate-500 text-white border-slate-500" },
];

function Progress({ c, thin = false }: { c: Counts; thin?: boolean }) {
  const w = (n: number) => `${c.total ? (n / c.total) * 100 : 0}%`;
  return (
    <div
      className={`flex w-full overflow-hidden rounded-full bg-muted ${thin ? "h-1" : "h-1.5"}`}
      aria-label={`${c.verified} of ${c.total} verified`}
    >
      <i className="bg-emerald-500" style={{ width: w(c.verified) }} />
      <i className="bg-amber-400" style={{ width: w(c.to_check) }} />
      <i className="bg-slate-400" style={{ width: w(c.hidden) }} />
    </div>
  );
}

export function AtlasProofread() {
  const outlineFn = useServerFn(atlasProofOutline);
  const outline = useQuery({ queryKey: ["atlasProofOutline"], queryFn: () => outlineFn() });
  const [subject, setSubject] = useState<string>("art");
  const [topic, setTopic] = useState<string | null>(null);
  const [subtopic, setSubtopic] = useState<string | undefined>(undefined);
  const topics = (outline.data ?? []).filter((t) => !subject || t.subject === subject);
  const t = topics.find((x) => x.key === topic) ?? null;
  useEffect(() => {
    if (!topic && topics[0]) setTopic(topics[0].key);
  }, [topic, topics]);
  const subjects = ATLAS_SUBJECTS.filter((s) =>
    (outline.data ?? []).some((x) => x.subject === s.key),
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]" data-proofread>
      <aside className="space-y-2 lg:sticky lg:top-2 lg:max-h-[calc(100dvh-1rem)] lg:overflow-y-auto">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Subject">
          {[{ key: "", name: { en: "All", hi: "" } }, ...subjects].map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={subject === s.key}
              onClick={() => {
                setSubject(s.key);
                setTopic(null);
                setSubtopic(undefined);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                subject === s.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {s.name.en}
            </button>
          ))}
        </div>
        {outline.isLoading && <p className="text-sm text-muted-foreground">Loading topics…</p>}
        <ul className="space-y-1" data-proof-topics>
          {topics.map((x) => {
            const open = x.key === topic;
            return (
              <li
                key={x.key}
                className={`rounded-lg border ${open ? "border-primary/50 bg-primary/5" : "border-border"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setTopic(x.key);
                    setSubtopic(undefined);
                  }}
                  className="w-full space-y-1 px-2.5 py-2 text-left"
                  data-proof-topic={x.key}
                >
                  <span className="flex items-start gap-1.5 text-sm font-medium leading-snug">
                    <ChevronRight
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                    <span className="min-w-0 flex-1">{x.title}</span>
                  </span>
                  <Progress c={x.counts} />
                  <span className="block text-[11px] text-muted-foreground">
                    {x.counts.verified}/{x.counts.total} verified
                    {x.counts.to_check > 0 && ` · ${x.counts.to_check} to check`}
                    {x.counts.hidden > 0 && ` · ${x.counts.hidden} hidden`}
                  </span>
                </button>
                {open && (
                  <ul className="space-y-0.5 border-t border-border p-1.5">
                    <li>
                      <button
                        type="button"
                        onClick={() => setSubtopic(undefined)}
                        className={`w-full rounded px-2 py-1 text-left text-xs ${subtopic === undefined ? "bg-primary/10 font-semibold" : "hover:bg-muted"}`}
                      >
                        All of this topic
                      </button>
                    </li>
                    {x.subtopics.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          onClick={() => setSubtopic(s.name)}
                          className={`w-full space-y-0.5 rounded px-2 py-1 text-left text-xs ${subtopic === s.name ? "bg-primary/10 font-semibold" : "hover:bg-muted"}`}
                          data-proof-subtopic={s.name}
                        >
                          <span className="flex gap-1">
                            <span className="min-w-0 flex-1 truncate">
                              {s.name || "(no heading)"}
                            </span>
                            <span className="text-muted-foreground">
                              {s.counts.verified}/{s.counts.total}
                            </span>
                          </span>
                          <Progress c={s.counts} thin />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="min-w-0">
        {t ? (
          <FactDesk key={`${t.key}|${subtopic ?? ""}`} topic={t} subtopic={subtopic} />
        ) : (
          <p className="text-sm text-muted-foreground">Choose a topic.</p>
        )}
      </section>
    </div>
  );
}

function FactDesk({ topic, subtopic }: { topic: Topic; subtopic?: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(atlasProofList);
  const statusFn = useServerFn(atlasProofStatus);
  const deleteFn = useServerFn(atlasProofDelete);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => {
    const id = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    setPage(0);
    setSel([]);
  }, [status, search]);
  const key = ["atlasProofList", topic.key, subtopic, status, search, page];
  const list = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { chapter: topic.key, subtopic, status, q: search, page } }),
    placeholderData: (p) => p,
  });
  const counts =
    subtopic !== undefined
      ? topic.subtopics.find((s) => s.name === subtopic)?.counts
      : topic.counts;
  const rows = list.data?.rows ?? [];
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["atlasProofList"] }),
      qc.invalidateQueries({ queryKey: ["atlasProofOutline"] }),
      qc.invalidateQueries({ queryKey: ["atlasFacts"] }),
    ]);
  };
  const bulk = async (s: AtlasStatus | "delete", ids = sel) => {
    if (!ids.length) return;
    if (
      s === "delete" &&
      !window.confirm(
        `Delete ${ids.length} fact${ids.length > 1 ? "s" : ""} for good? Importing the files again won't bring them back.`,
      )
    )
      return;
    try {
      if (s === "delete") await deleteFn({ data: { ids } });
      else await statusFn({ data: { ids, status: s } });
      toast.success(
        s === "delete"
          ? `Deleted ${ids.length}`
          : `${ids.length} marked ${STATUS.find((x) => x.key === s)!.label.toLowerCase()}`,
      );
      setSel((x) => x.filter((i) => !ids.includes(i)));
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  // Keyboard: the focused fact.
  const cards = useRef<Map<string, HTMLElement>>(new Map());
  const focusAt = (i: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (r) cards.current.get(r.id)?.focus();
  };
  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  return (
    <div className="space-y-3" data-fact-desk>
      <header className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground">{topic.title}</p>
          <h3 className="text-lg font-semibold leading-snug">{subtopic ?? "All subtopics"}</h3>
        </div>
        {counts && (
          <div className="space-y-1">
            <Progress c={counts} />
            <p className="text-xs text-muted-foreground">
              {counts.verified} of {counts.total} verified · {counts.to_check} to check ·{" "}
              {counts.hidden} hidden
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-border p-0.5 text-xs"
            role="tablist"
            aria-label="Status"
          >
            {(["all", "to_check", "verified", "hidden"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                onClick={() => setStatus(s)}
                className={`rounded-md px-2.5 py-1 ${status === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {s === "all" ? "All" : STATUS.find((x) => x.key === s)!.label}
                {counts && s !== "all" && <span className="ml-1 opacity-70">{counts[s]}</span>}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              aria-label="Search these facts"
              placeholder="Search text, heading, note…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 w-56 pl-7 text-sm"
            />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            Keys: V verify · C to check · H hide · E edit · X select · J/K move
          </span>
        </div>
        <div
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-2 text-sm shadow-sm backdrop-blur"
          data-bulk-bar
        >
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={allOn}
              onChange={() => setSel(allOn ? [] : rows.map((r) => r.id))}
              aria-label="Select all on this page"
            />
            {sel.length ? `${sel.length} selected` : "Select all"}
          </label>
          {sel.length > 0 && (
            <>
              <Button
                size="sm"
                className="h-7 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => bulk("verified")}
              >
                <Check className="mr-1 h-3.5 w-3.5" /> Verify
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => bulk("to_check")}>
                To check
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => bulk("hidden")}>
                Hide
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-destructive"
                onClick={() => bulk("delete")}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {list.data ? `${list.data.total} facts` : "…"}
          </span>
        </div>
      </header>
      {list.isLoading && <p className="text-sm text-muted-foreground">Loading facts…</p>}
      {list.data && !rows.length && <p className="text-sm text-muted-foreground">No facts here.</p>}
      <ol className="space-y-2">
        {rows.map((f, i) => (
          <ProofCard
            key={f.id}
            f={f}
            subtopic={subtopic}
            selected={sel.includes(f.id)}
            onSelect={() =>
              setSel((x) => (x.includes(f.id) ? x.filter((y) => y !== f.id) : [...x, f.id]))
            }
            onStatus={(s) => bulk(s, [f.id])}
            onDelete={() => bulk("delete", [f.id])}
            onSaved={refresh}
            onMove={(d) => focusAt(i + d)}
            cardRef={(el) => {
              if (el) cards.current.set(f.id, el);
              else cards.current.delete(f.id);
            }}
          />
        ))}
      </ol>
      {list.data && list.data.total > 50 && (
        <div className="flex items-center gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            {page * 50 + 1}–{Math.min((page + 1) * 50, list.data.total)} of {list.data.total}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * 50 >= list.data.total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ProofCard({
  f,
  subtopic,
  selected,
  onSelect,
  onStatus,
  onDelete,
  onSaved,
  onMove,
  cardRef,
}: {
  f: Fact;
  subtopic?: string;
  selected: boolean;
  onSelect: () => void;
  onStatus: (s: AtlasStatus) => void;
  onDelete: () => void;
  onSaved: () => Promise<void>;
  onMove: (d: number) => void;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const saveFn = useServerFn(saveAtlasFact);
  const precheckFn = useServerFn(precheckAtlasFact);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({
    text_en: f.text_en,
    text_hi: f.text_hi,
    note: f.note,
    heading: f.heading,
  });
  const [busy, setBusy] = useState(false);
  const [tagging, setTagging] = useState(false);
  useEffect(() => {
    if (!edit)
      setDraft({ text_en: f.text_en, text_hi: f.text_hi, note: f.note, heading: f.heading });
  }, [f, edit]);
  const save = async (verify = false) => {
    setBusy(true);
    try {
      await saveFn({
        data: {
          id: f.id,
          chapter_key: f.chapter_key,
          text_en: draft.text_en,
          text_hi: draft.text_hi,
          note: draft.note,
          heading: draft.heading,
          ...(verify ? { status: "verified" as const } : {}),
        },
      });
      toast.success(verify ? "Saved and verified" : "Saved");
      setEdit(false);
      await onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  const precheck = async () => {
    setBusy(true);
    try {
      const r = await precheckFn({ data: { id: f.id } });
      toast.success(`AI pre-check: ${r.verdict}`);
      await onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't pre-check"));
    } finally {
      setBusy(false);
    }
  };
  const rest = subtopic !== undefined ? f.heading.split(" › ").slice(1).join(" › ") : f.heading;
  const onKey = (e: React.KeyboardEvent) => {
    if (edit || tagging || (e.target as HTMLElement) !== e.currentTarget) return;
    const k = e.key.toLowerCase();
    const map: Record<string, () => void> = {
      v: () => onStatus("verified"),
      c: () => onStatus("to_check"),
      h: () => onStatus("hidden"),
      e: () => setEdit(true),
      x: onSelect,
      j: () => onMove(1),
      k: () => onMove(-1),
      arrowdown: () => onMove(1),
      arrowup: () => onMove(-1),
    };
    if (map[k]) {
      e.preventDefault();
      map[k]();
    }
  };
  return (
    <li
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onKey}
      className={`rounded-xl border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-primary ${
        selected ? "border-primary" : f.status === "to_check" ? "border-amber-300" : "border-border"
      } ${f.status === "hidden" ? "opacity-70" : ""}`}
      data-proof-fact={f.id}
    >
      <div className="flex flex-wrap items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="mt-1"
          aria-label="Select this fact"
        />
        <div className="min-w-0 flex-1">
          {rest && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {rest}
            </p>
          )}
          {f.table_head && <p className="text-[11px] text-muted-foreground">{f.table_head}</p>}
        </div>
        <div
          className="flex rounded-lg border border-border p-0.5 text-[11px]"
          role="group"
          aria-label="Status"
        >
          {STATUS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={f.status === s.key}
              onClick={() => f.status !== s.key && onStatus(s.key)}
              className={`rounded-md border px-2 py-0.5 ${f.status === s.key ? s.on : "border-transparent hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {edit ? (
        <div className="mt-2 space-y-2" data-proof-edit>
          <label className="block text-xs font-medium">
            English
            <textarea
              aria-label="English"
              value={draft.text_en}
              onChange={(e) => setDraft({ ...draft, text_en: e.target.value })}
              rows={Math.min(8, Math.max(2, Math.ceil(draft.text_en.length / 90)))}
              className="mt-0.5 w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Hindi
            <textarea
              aria-label="Hindi"
              value={draft.text_hi}
              onChange={(e) => setDraft({ ...draft, text_hi: e.target.value })}
              rows={Math.min(8, Math.max(2, Math.ceil(draft.text_hi.length / 90)))}
              className="mt-0.5 w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Heading (Subtopic › Heading › …)
            <Input
              aria-label="Heading"
              value={draft.heading}
              onChange={(e) => setDraft({ ...draft, heading: e.target.value })}
              className="mt-0.5 h-8 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Note (for you, not shown to students)
            <textarea
              aria-label="Note"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => save(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Save and verify
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => save(false)}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 space-y-1">
          <p className="leading-relaxed" data-proof-en>
            {f.text_en || <em className="text-muted-foreground">No English</em>}
          </p>
          <p className="leading-relaxed text-muted-foreground" data-proof-hi>
            {f.text_hi || <em>No Hindi</em>}
            {f.hi_ai && f.text_hi && (
              <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-900">
                AI Hindi
              </span>
            )}
          </p>
          {f.note && (
            <div className="space-y-0.5 text-xs">
              {f.note.split("\n").map((l, i) => (
                <p
                  key={i}
                  className={
                    l.startsWith("AI pre-check:")
                      ? "rounded bg-sky-50 px-1.5 py-0.5 text-sky-900 dark:bg-sky-500/10 dark:text-sky-200"
                      : "text-amber-800 dark:text-amber-300"
                  }
                >
                  {l}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <Tags f={f} tagging={tagging} setTagging={setTagging} onChanged={onSaved} />
      {!edit && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7" onClick={() => setEdit(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={precheck}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> {busy ? "Checking…" : "AI pre-check"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}
    </li>
  );
}

function Tags({
  f,
  tagging,
  setTagging,
  onChanged,
}: {
  f: Fact;
  tagging: boolean;
  setTagging: (b: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const tagFn = useServerFn(atlasProofTag);
  const [busy, setBusy] = useState(false);
  const tag = async (entity: string, on: boolean) => {
    setBusy(true);
    try {
      await tagFn({ data: { id: f.id, entity, on } });
      toast.success(on ? "Tagged" : "Tag removed");
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  const places = f.entities.filter((e) => e.startsWith("P:"));
  const districts = f.entities.filter((e) => e.startsWith("D:"));
  const other = f.entities.filter((e) => !e.startsWith("P:") && !e.startsWith("D:"));
  return (
    <div className="mt-2 space-y-1.5" data-proof-tags>
      <div className="flex flex-wrap items-center gap-1">
        {districts.map((e) => (
          <span
            key={e}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-100"
            data-tag={e}
          >
            🗺️ {e.slice(2)}
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${e}`}
              onClick={() => tag(e, false)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {places.map((e) => {
          const p = f.placeNames[e.slice(2)];
          return (
            <span
              key={e}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]"
              data-tag={e}
            >
              {p ? atlasCat(p.cat).icon : "📍"} {p ? `${p.name}` : e.slice(2)}
              {p?.district && <span className="text-muted-foreground">· {p.district}</span>}
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${e}`}
                onClick={() => tag(e, false)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {other.map((e) => (
          <span
            key={e}
            className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {e}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setTagging(!tagging)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-primary/60 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/5"
          data-add-tag
        >
          <Plus className="h-3 w-3" /> Tag a place or district
        </button>
      </div>
      {tagging && (
        <TagPicker
          has={f.entities}
          onPick={async (e) => {
            await tag(e, true);
          }}
          factId={f.id}
          onCreated={async () => {
            toast.success("New place made and tagged");
            await onChanged();
          }}
          onClose={() => setTagging(false)}
        />
      )}
    </div>
  );
}

function TagPicker({
  has,
  onPick,
  factId,
  onCreated,
  onClose,
}: {
  has: string[];
  onPick: (entity: string) => Promise<void>;
  factId: string;
  onCreated: () => Promise<void>;
  onClose: () => void;
}) {
  const placesFn = useServerFn(atlasProofPlaces);
  const newFn = useServerFn(atlasProofNewPlace);
  const base = useAtlasBase();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [making, setMaking] = useState(false);
  const [np, setNp] = useState({ name_en: "", name_hi: "", cat: "town", district: "" });
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const found = useQuery({
    queryKey: ["atlasProofPlaces", term],
    queryFn: () => placesFn({ data: { q: term } }),
    enabled: term.length >= 2,
  });
  const districts = useMemo(
    () =>
      term.length >= 2
        ? (base.data?.districts ?? []).filter(
            (d) => d.en.toLowerCase().includes(term.toLowerCase()) || d.hi.includes(term),
          )
        : [],
    [term, base.data],
  );
  const make = async () => {
    try {
      await newFn({ data: { id: factId, ...np } });
      setMaking(false);
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(errorText(e, "Couldn't make the place"));
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2" data-tag-picker>
      <div className="flex gap-2">
        <Input
          autoFocus
          aria-label="Find a place or district"
          placeholder="Find a place or district (English or Hindi)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="ghost" className="h-8" onClick={onClose}>
          Done
        </Button>
      </div>
      {/* Only results for what's typed now (not the last search's). */}
      {term === q.trim() && (districts.length > 0 || (found.data?.length ?? 0) > 0) && (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto">
          {districts.map((d) => {
            const e = `D:${d.en}`;
            const on = has.includes(e);
            return (
              <li key={e}>
                <button
                  type="button"
                  disabled={on}
                  onClick={() => onPick(e)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-background disabled:opacity-50"
                  data-pick={e}
                >
                  🗺️ <span className="flex-1">{d.en} district</span>
                  <span className="text-xs text-muted-foreground">{on ? "tagged" : d.hi}</span>
                </button>
              </li>
            );
          })}
          {(found.data ?? []).map((p) => {
            const e = `P:${p.key}`;
            const on = has.includes(e);
            return (
              <li key={e}>
                <button
                  type="button"
                  disabled={on}
                  onClick={() => onPick(e)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-background disabled:opacity-50"
                  data-pick={e}
                >
                  {atlasCat(p.cat).icon}
                  <span className="min-w-0 flex-1 truncate">
                    {p.name} <span className="text-muted-foreground">{p.nameHi}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {on ? "tagged" : `${p.district}${p.status === "to_check" ? " · to check" : ""}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {term.length >= 2 && found.data && !found.data.length && !districts.length && (
        <p className="text-xs text-muted-foreground">No place called that in the atlas.</p>
      )}
      {!making ? (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => {
            setNp({ ...np, name_en: q.trim() });
            setMaking(true);
          }}
          data-new-place
        >
          + Make a new place{q.trim() ? ` “${q.trim()}”` : ""} and tag it
        </button>
      ) : (
        <div
          className="grid gap-2 rounded-md border border-border bg-background p-2 sm:grid-cols-2"
          data-new-place-form
        >
          <Input
            aria-label="Name (English)"
            placeholder="Name (English)"
            value={np.name_en}
            onChange={(e) => setNp({ ...np, name_en: e.target.value })}
            className="h-8 text-sm"
          />
          <Input
            aria-label="Name (Hindi)"
            placeholder="नाम (हिंदी)"
            value={np.name_hi}
            onChange={(e) => setNp({ ...np, name_hi: e.target.value })}
            className="h-8 text-sm"
          />
          <select
            aria-label="Kind of place"
            value={np.cat}
            onChange={(e) => setNp({ ...np, cat: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {ATLAS_CATS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.icon} {c.name.en}
              </option>
            ))}
          </select>
          <select
            aria-label="District"
            value={np.district}
            onChange={(e) => setNp({ ...np, district: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">District…</option>
            {(base.data?.districts ?? []).map((d) => (
              <option key={d.en} value={d.en}>
                {d.en}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            It's pinned at the district's centre and listed under Quality → position checks until
            you set its position in Places.
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={np.name_en.trim().length < 2 || !np.district}
              onClick={make}
            >
              Make and tag
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMaking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
