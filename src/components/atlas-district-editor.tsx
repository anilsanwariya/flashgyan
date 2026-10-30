// A district's overview page in the admin panel, on a page of its own:
// made from the editor's notes (any language), drafted from the atlas's
// verified facts, translated, edited block by block, fact-checked against
// the atlas and the books, kept as versions, previewed as students see it,
// and published.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  atlasOverviewJob,
  getAtlasDistrict,
  publishAtlasDistrict,
  restoreAtlasOverview,
  runAtlasStep,
  saveAtlasOverview,
  setAtlasCheck,
} from "@/lib/atlas.functions";
import {
  BLOCK_TYPES,
  EMPTY_OVERVIEW,
  OVERVIEW_SECTIONS,
  type AtlasLang,
  type DistrictOverview,
  type OverviewBlock,
  type OverviewSection,
} from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";
import { OverviewHero, OverviewSections } from "@/components/atlas-overview";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type TabId = "preview" | "edit" | "make" | "check" | "history";
const TABS: { id: TabId; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "edit", label: "Edit" },
  { id: "make", label: "Make with AI" },
  { id: "check", label: "Fact check" },
  { id: "history", label: "History" },
];
const EMPTY: Bi = { en: "", hi: "" };
const JOB_NAME: Record<string, string> = {
  import: "Reading your notes",
  translate: "Translating",
  draft: "Drafting from the atlas facts",
  check: "Fact-checking",
};

export function AtlasDistrictEditor({
  district,
  onClose,
}: {
  district: string;
  onClose: () => void;
}) {
  const getFn = useServerFn(getAtlasDistrict);
  const saveFn = useServerFn(saveAtlasOverview);
  const stepFn = useServerFn(runAtlasStep);
  const pubFn = useServerFn(publishAtlasDistrict);
  const q = useQuery({
    queryKey: ["atlasDistrict", district],
    queryFn: () => getFn({ data: { district } }),
    refetchOnMount: "always",
  });
  const [tab, setTab] = useState<TabId>("preview");
  const [lang, setLang] = useState<AtlasLang>("hi");
  const [ov, setOv] = useState<DistrictOverview | null>(null);
  const [saving, setSaving] = useState(0);
  const sent = useRef("");
  const job = q.data?.meta.job;
  const working = !!job && !job.error && job.done < job.parts.length;

  // The overview from the server, unless the editor is typing.
  useEffect(() => {
    if (!q.data) return;
    const json = JSON.stringify(q.data.overview);
    if (json !== sent.current) {
      sent.current = json;
      setOv(q.data.overview);
    }
  }, [q.data]);
  // Saved once typing pauses.
  useEffect(() => {
    if (!ov || working) return;
    const json = JSON.stringify(ov);
    if (json === sent.current) return;
    const t = setTimeout(async () => {
      sent.current = json;
      setSaving((n) => n + 1);
      try {
        await saveFn({ data: { district, overview: ov as never } });
      } catch (e) {
        toast.error(errorText(e, "Couldn't save"));
        sent.current = "";
      } finally {
        setSaving((n) => n - 1);
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov]);
  // While a job runs, this page moves it on (the minute tick does too).
  const busy = useRef(false);
  useEffect(() => {
    if (!working) return;
    let stop = false;
    const go = async () => {
      if (busy.current || stop) return;
      busy.current = true;
      try {
        await stepFn();
      } catch (e) {
        toast.error(errorText(e, "Couldn't move on"));
        stop = true;
      } finally {
        busy.current = false;
        await q.refetch();
      }
    };
    void go();
    const t = setInterval(() => void go(), 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working]);

  const d = q.data;
  const openChecks = (d?.checks ?? []).filter((c) => c.state === "open").length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        <header className="space-y-2 border-b border-border p-2 pr-12 sm:pl-4">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base font-semibold">
              {district}{" "}
              {d?.name_hi ? <span className="text-muted-foreground">· {d.name_hi}</span> : null}
            </DialogTitle>
            {d?.status === "published" ? (
              <Badge tone="good">Published</Badge>
            ) : (
              <Badge tone="warn">Draft</Badge>
            )}
            {openChecks > 0 && <Badge tone="warn">{openChecks} fact-check notes</Badge>}
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {saving ? "Saving…" : ""}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div
                className="inline-flex rounded-full border border-border p-0.5 text-xs"
                role="radiogroup"
                aria-label="Language"
              >
                {(["hi", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={lang === l}
                    onClick={() => setLang(l)}
                    className={`rounded-full px-2.5 py-0.5 ${lang === l ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {l === "hi" ? "हिंदी" : "English"}
                  </button>
                ))}
              </div>
              {d?.status === "published" && (
                <a
                  href={`/atlas/${encodeURIComponent(district)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  Students' page <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <Button
                size="sm"
                variant={d?.status === "published" ? "outline" : "default"}
                disabled={!ov?.sections.length || working}
                onClick={async () => {
                  try {
                    await pubFn({ data: { district, on: d?.status !== "published" } });
                    await q.refetch();
                    toast.success(d?.status === "published" ? "Unpublished" : "Published");
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't do it"));
                  }
                }}
              >
                {d?.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto" aria-label="Parts of the editor">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-lg px-3 py-1 text-sm ${tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {t.label}
                {t.id === "check" && openChecks ? ` (${openChecks})` : ""}
              </button>
            ))}
          </nav>
          {working && (
            <div className="flex items-center gap-2 text-sm" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> {JOB_NAME[job!.kind]}: {job!.done} of{" "}
              {job!.parts.length}
              {job!.parts[job!.done]?.title ? ` · ${job!.parts[job!.done].title}` : ""}
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(job!.done / job!.parts.length) * 100}%` }}
                />
              </div>
            </div>
          )}
          {job?.error && (
            <p className="text-sm text-destructive">
              {JOB_NAME[job.kind]} stopped: {job.error}
            </p>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          {q.isLoading || !d ? (
            <p className="p-4 text-muted-foreground">Loading…</p>
          ) : tab === "preview" ? (
            ov?.sections.length ? (
              <div className="bg-[#f6efe2] dark:bg-[#17140f]">
                <OverviewHero ov={ov} lang={lang} />
                <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
                  <OverviewSections ov={ov} lang={lang} />
                </div>
              </div>
            ) : (
              <p className="p-6 text-muted-foreground">
                No overview yet: make one on "Make with AI", or start one on "Edit".
              </p>
            )
          ) : tab === "edit" ? (
            <EditTab ov={ov ?? EMPTY_OVERVIEW} onChange={setOv} disabled={working} />
          ) : tab === "make" ? (
            <MakeTab
              district={district}
              hasOverview={!!ov?.sections.length}
              working={working}
              onStarted={() => void q.refetch()}
            />
          ) : tab === "check" ? (
            <CheckTab
              district={district}
              checks={d.checks}
              ov={ov}
              working={working}
              onChange={() => void q.refetch()}
            />
          ) : (
            <HistoryTab
              district={district}
              versions={d.versions}
              onRestored={() => void q.refetch()}
            />
          )}
        </main>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Make with AI ----------

function MakeTab({
  district,
  hasOverview,
  working,
  onStarted,
}: {
  district: string;
  hasOverview: boolean;
  working: boolean;
  onStarted: () => void;
}) {
  const jobFn = useServerFn(atlasOverviewJob);
  const [text, setText] = useState("");
  const [srcLang, setSrcLang] = useState<AtlasLang>("hi");
  const file = useRef<HTMLInputElement>(null);
  type JobInput =
    | { kind: "import"; district: string; text: string; lang: AtlasLang }
    | { kind: "translate" | "draft"; district: string; lang: AtlasLang }
    | { kind: "cancel"; district: string };
  const start = async (data: JobInput, ok: string) => {
    if (
      hasOverview &&
      data.kind !== "translate" &&
      !confirm("This replaces the overview (the current one is kept in History). Go on?")
    )
      return;
    try {
      await jobFn({ data });
      toast.success(ok);
      onStarted();
    } catch (e) {
      toast.error(errorText(e, "Couldn't start"));
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">From your notes</h3>
        <p className="text-sm text-muted-foreground">
          Choose your district notes (an HTML page like the Bikaner one, or text), or paste them.
          Every fact, trick and date is kept as you wrote it, arranged into sections and blocks.
          Your notes' own verification remarks become the page's notes.
        </p>
        <input
          ref={file}
          type="file"
          accept=".html,.htm,.txt,.md,text/*"
          className="hidden"
          aria-label="Notes file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setText(await f.text());
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => file.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Choose a file
          </Button>
          <select
            aria-label="The notes' language"
            value={srcLang}
            onChange={(e) => setSrcLang(e.target.value as AtlasLang)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="hi">Notes in Hindi</option>
            <option value="en">Notes in English</option>
          </select>
          {text && (
            <span className="text-xs text-muted-foreground">
              {text.length.toLocaleString()} characters
            </span>
          )}
        </div>
        <Textarea
          aria-label="Notes"
          rows={6}
          placeholder="…or paste the notes here"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          disabled={working || text.trim().length < 200}
          onClick={() =>
            void start(
              { kind: "import", district, text, lang: srcLang },
              "Reading the notes, a section at a time",
            )
          }
        >
          Make the overview from the notes
        </Button>
      </section>
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Translate</h3>
        <p className="text-sm text-muted-foreground">
          Fills the other language, section by section, keeping every fact and the structure.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={working || !hasOverview}
            onClick={() =>
              void start({ kind: "translate", district, lang: "en" }, "Translating into English")
            }
          >
            Fill in English
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={working || !hasOverview}
            onClick={() =>
              void start({ kind: "translate", district, lang: "hi" }, "Translating into Hindi")
            }
          >
            Fill in Hindi
          </Button>
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Draft from the atlas</h3>
        <p className="text-sm text-muted-foreground">
          For a district without notes: a first draft from the atlas's verified facts on the
          district, its tehsils and its places only, in the standard sections. Check it before
          publishing.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={working}
            onClick={() => void start({ kind: "draft", district, lang: "hi" }, "Drafting in Hindi")}
          >
            Draft in Hindi
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={working}
            onClick={() =>
              void start({ kind: "draft", district, lang: "en" }, "Drafting in English")
            }
          >
            Draft in English
          </Button>
        </div>
      </section>
      {working && (
        <Button variant="ghost" onClick={() => void start({ kind: "cancel", district }, "Stopped")}>
          Stop the job
        </Button>
      )}
    </div>
  );
}

// ---------- Fact check ----------

function CheckTab({
  district,
  checks,
  ov,
  working,
  onChange,
}: {
  district: string;
  checks: { id: string; section: string; text: string; why: string; fix: string; state: string }[];
  ov: DistrictOverview | null;
  working: boolean;
  onChange: () => void;
}) {
  const jobFn = useServerFn(atlasOverviewJob);
  const setFn = useServerFn(setAtlasCheck);
  const act = async (f: () => Promise<unknown>) => {
    try {
      await f();
      onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Each section is checked against the atlas's verified facts on this district and the
        knowledge base's books. Fix a note on the Edit tab, then mark it; publishing waits until
        every note is decided.
      </p>
      <Button
        disabled={working || !ov?.sections.length}
        onClick={() => void act(() => jobFn({ data: { kind: "check", district } }))}
      >
        Check the facts
      </Button>
      {!checks.length ? (
        <p className="text-sm text-muted-foreground">No notes.</p>
      ) : (
        <ul className="space-y-2">
          {checks.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl border p-3 text-sm ${c.state === "open" ? "border-amber-500/60" : "border-border opacity-70"}`}
              data-check={c.state}
            >
              <p className="text-xs text-muted-foreground">
                {ov?.sections.find((s) => s.id === c.section)?.title.hi ||
                  ov?.sections.find((s) => s.id === c.section)?.title.en ||
                  c.section}
              </p>
              <p className="font-medium">{c.text}</p>
              <p className="mt-1">{c.why}</p>
              {c.fix && <p className="mt-1 text-green-800 dark:text-green-300">→ {c.fix}</p>}
              {c.state === "open" ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      void act(() => setFn({ data: { district, id: c.id, state: "fixed" } }))
                    }
                  >
                    I fixed it
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void act(() => setFn({ data: { district, id: c.id, state: "kept" } }))
                    }
                  >
                    It's right as it is
                  </Button>
                </div>
              ) : (
                <Badge>{c.state === "fixed" ? "Fixed" : "Kept"}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- History ----------

function HistoryTab({
  district,
  versions,
  onRestored,
}: {
  district: string;
  versions: { at: string; label: string }[];
  onRestored: () => void;
}) {
  const fn = useServerFn(restoreAtlasOverview);
  if (!versions.length)
    return <p className="p-4 text-muted-foreground">No earlier versions yet.</p>;
  return (
    <ul className="mx-auto max-w-2xl space-y-2 p-4">
      {versions.map((v) => (
        <li
          key={v.at}
          className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"
        >
          <span className="flex-1">
            {v.label} · {new Date(v.at).toLocaleString("en-IN")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await fn({ data: { district, at: v.at } });
                toast.success("Restored");
                onRestored();
              } catch (e) {
                toast.error(errorText(e, "Couldn't restore"));
              }
            }}
          >
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---------- Edit ----------

// Bi[] edited as lines, one textarea per language (line n is item n).
function LinesField({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: Bi[];
  onChange: (v: Bi[]) => void;
  rows?: number;
}) {
  const join = (l: "en" | "hi") => value.map((x) => x[l]).join("\n");
  const set = (l: "en" | "hi", text: string) => {
    const lines = text.split("\n");
    const n = Math.max(lines.length, value.length);
    const next: Bi[] = [];
    for (let i = 0; i < n; i++) {
      const cur = value[i] ?? EMPTY;
      next.push({ ...cur, [l]: lines[i] ?? "" });
    }
    onChange(next.filter((x, i) => x.en || x.hi || i < lines.length - 1));
  };
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label} (one a line)</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          aria-label={`${label} (Hindi)`}
          lang="hi"
          rows={rows}
          value={join("hi")}
          onChange={(e) => set("hi", e.target.value)}
          placeholder="हिंदी"
        />
        <Textarea
          aria-label={`${label} (English)`}
          rows={rows}
          value={join("en")}
          onChange={(e) => set("en", e.target.value)}
          placeholder="English"
        />
      </div>
    </div>
  );
}

function BiInput({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: Bi;
  onChange: (v: Bi) => void;
  rows?: number;
}) {
  const F = rows ? Textarea : Input;
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <F
          aria-label={`${label} (Hindi)`}
          lang="hi"
          rows={rows}
          value={value.hi}
          onChange={(e) => onChange({ ...value, hi: e.target.value })}
          placeholder="हिंदी"
        />
        <F
          aria-label={`${label} (English)`}
          rows={rows}
          value={value.en}
          onChange={(e) => onChange({ ...value, en: e.target.value })}
          placeholder="English"
        />
      </div>
    </div>
  );
}

// Table rows: one row a line, cells split by " | ".
const rowsToBi = (rows: Bi[][]): Bi[] =>
  rows.map((r) => ({ en: r.map((c) => c.en).join(" | "), hi: r.map((c) => c.hi).join(" | ") }));
const biToRows = (lines: Bi[]): Bi[][] =>
  lines.map((l) => {
    const en = l.en.split("|").map((x) => x.trim());
    const hi = l.hi.split("|").map((x) => x.trim());
    return Array.from({ length: Math.max(en.length, hi.length) }, (_, i) => ({
      en: en[i] ?? "",
      hi: hi[i] ?? "",
    }));
  });

function EditTab({
  ov,
  onChange,
  disabled,
}: {
  ov: DistrictOverview;
  onChange: (o: DistrictOverview) => void;
  disabled: boolean;
}) {
  const [at, setAt] = useState<number | "hero">("hero");
  const set = (p: Partial<DistrictOverview>) => onChange({ ...ov, ...p });
  const setSec = (i: number, s: OverviewSection) =>
    set({ sections: ov.sections.map((x, j) => (j === i ? s : x)) });
  const sec = typeof at === "number" ? ov.sections[at] : null;
  return (
    <div
      className={`flex min-h-full flex-col lg:flex-row ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <nav
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-2 lg:w-60 lg:flex-col lg:border-b-0 lg:border-r"
        aria-label="Sections"
      >
        <button
          type="button"
          onClick={() => setAt("hero")}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-left text-sm ${at === "hero" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Header & revision
        </button>
        {ov.sections.map((s, i) => (
          <button
            key={`${s.id}-${i}`}
            type="button"
            onClick={() => setAt(i)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-left text-sm ${at === i ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {s.title.hi || s.title.en || s.id} <span className="opacity-60">{s.blocks.length}</span>
          </button>
        ))}
        <select
          aria-label="Add a section"
          value=""
          onChange={(e) => {
            const def = OVERVIEW_SECTIONS.find((x) => x.id === e.target.value);
            const id = def?.id ?? `s${Date.now().toString(36)}`;
            set({
              sections: [
                ...ov.sections,
                {
                  id,
                  title: def?.title ?? { en: "New section", hi: "नया भाग" },
                  lede: EMPTY,
                  blocks: [],
                },
              ],
            });
            setAt(ov.sections.length);
          }}
          className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">+ Add a section…</option>
          {OVERVIEW_SECTIONS.filter((x) => !ov.sections.some((s) => s.id === x.id)).map((x) => (
            <option key={x.id} value={x.id}>
              {x.title.en}
            </option>
          ))}
          <option value="custom">Another section</option>
        </select>
      </nav>
      <div className="min-w-0 flex-1 space-y-4 p-4">
        {at === "hero" ? (
          <>
            <BiInput label="District name" value={ov.name} onChange={(name) => set({ name })} />
            <BiInput
              label="Tagline (nicknames)"
              value={ov.tagline}
              onChange={(tagline) => set({ tagline })}
            />
            <LinesField
              label="Badges"
              value={ov.badges}
              onChange={(badges) => set({ badges })}
              rows={3}
            />
            <LinesField
              label='Revision cards ("question | answer")'
              value={ov.revision.map((r) => ({
                en: r.q.en || r.a.en ? `${r.q.en} | ${r.a.en}` : "",
                hi: r.q.hi || r.a.hi ? `${r.q.hi} | ${r.a.hi}` : "",
              }))}
              onChange={(lines) =>
                set({
                  revision: lines.map((l) => {
                    const [qe = "", ae = ""] = l.en.split("|").map((x) => x.trim());
                    const [qh = "", ah = ""] = l.hi.split("|").map((x) => x.trim());
                    return { q: { en: qe, hi: qh }, a: { en: ae, hi: ah } };
                  }),
                })
              }
              rows={6}
            />
            <LinesField
              label="Notes to verify (shown to students)"
              value={ov.notes}
              onChange={(notes) => set({ notes })}
              rows={3}
            />
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Source</span>
              <Input
                aria-label="Source"
                value={ov.source}
                onChange={(e) => set({ source: e.target.value })}
              />
            </div>
          </>
        ) : sec ? (
          <SectionEditor
            sec={sec}
            onChange={(s) => setSec(at as number, s)}
            onMove={(by) => {
              const i = at as number;
              const j = i + by;
              if (j < 0 || j >= ov.sections.length) return;
              const next = [...ov.sections];
              [next[i], next[j]] = [next[j], next[i]];
              set({ sections: next });
              setAt(j);
            }}
            onDelete={() => {
              if (!confirm("Delete this section?")) return;
              set({ sections: ov.sections.filter((_, j) => j !== at) });
              setAt("hero");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function SectionEditor({
  sec,
  onChange,
  onMove,
  onDelete,
}: {
  sec: OverviewSection;
  onChange: (s: OverviewSection) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const setBlock = (i: number, b: OverviewBlock) =>
    onChange({ ...sec, blocks: sec.blocks.map((x, j) => (j === i ? b : x)) });
  const add = (type: OverviewBlock["type"]) => {
    const t = EMPTY;
    const b: OverviewBlock =
      type === "big"
        ? { type, title: t, value: t, text: t }
        : type === "chips"
          ? { type, title: t, items: [] }
          : type === "text"
            ? { type, title: t, text: t }
            : type === "list"
              ? { type, title: t, items: [] }
              : type === "table"
                ? { type, title: t, cols: [], rows: [] }
                : type === "callout"
                  ? { type, kind: "trick", text: t }
                  : type === "timeline"
                    ? { type, title: t, eras: [{ title: t, items: [] }] }
                    : { type: "borders", title: t, intl: t, items: [] };
    onChange({ ...sec, blocks: [...sec.blocks, b] });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Section id: {sec.id}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Move the section up"
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Move the section down"
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete the section
        </Button>
      </div>
      <BiInput
        label="Section title"
        value={sec.title}
        onChange={(title) => onChange({ ...sec, title })}
      />
      <BiInput
        label="One line under it"
        value={sec.lede}
        onChange={(lede) => onChange({ ...sec, lede })}
      />
      {sec.blocks.map((b, i) => (
        <div
          key={i}
          className="space-y-2 rounded-xl border border-border p-3"
          data-block-editor={b.type}
        >
          <div className="flex items-center gap-1">
            <Badge>{BLOCK_TYPES.find((t) => t.type === b.type)?.name}</Badge>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 w-7 p-0"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() =>
                onChange({
                  ...sec,
                  blocks: sec.blocks.map((x, j) =>
                    j === i - 1 ? b : j === i ? sec.blocks[i - 1] : x,
                  ),
                })
              }
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="Move down"
              disabled={i === sec.blocks.length - 1}
              onClick={() =>
                onChange({
                  ...sec,
                  blocks: sec.blocks.map((x, j) =>
                    j === i + 1 ? b : j === i ? sec.blocks[i + 1] : x,
                  ),
                })
              }
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="Delete the block"
              onClick={() => onChange({ ...sec, blocks: sec.blocks.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <BlockEditor b={b} onChange={(x) => setBlock(i, x)} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Add:</span>
        {BLOCK_TYPES.map((t) => (
          <Button
            key={t.type}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => add(t.type)}
          >
            <Plus className="mr-1 h-3 w-3" /> {t.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BlockEditor({ b, onChange }: { b: OverviewBlock; onChange: (b: OverviewBlock) => void }) {
  const title =
    "title" in b ? (
      <BiInput
        label="Title"
        value={b.title}
        onChange={(title) => onChange({ ...b, title } as OverviewBlock)}
      />
    ) : null;
  switch (b.type) {
    case "big":
      return (
        <>
          {title}
          <BiInput
            label="Big value (year, number, code)"
            value={b.value}
            onChange={(value) => onChange({ ...b, value })}
          />
          <BiInput
            label="Text (**bold** for key words)"
            value={b.text}
            onChange={(text) => onChange({ ...b, text })}
            rows={2}
          />
        </>
      );
    case "chips":
      return (
        <>
          {title}
          <LinesField
            label="Chips"
            value={b.items}
            onChange={(items) =>
              onChange({ ...b, items, hot: (b.hot ?? []).filter((n) => n < items.length) })
            }
          />
          <Input
            aria-label="Highlighted chips"
            placeholder="Highlighted chips: their numbers, e.g. 1, 3"
            value={(b.hot ?? []).map((n) => n + 1).join(", ")}
            onChange={(e) =>
              onChange({
                ...b,
                hot: e.target.value
                  .split(/[,\s]+/)
                  .map((x) => Number(x) - 1)
                  .filter((n) => Number.isInteger(n) && n >= 0),
              })
            }
          />
        </>
      );
    case "text":
      return (
        <>
          {title}
          <BiInput
            label="Text"
            value={b.text}
            onChange={(text) => onChange({ ...b, text })}
            rows={4}
          />
        </>
      );
    case "list":
      return (
        <>
          {title}
          <LinesField
            label="Points"
            value={b.items}
            onChange={(items) => onChange({ ...b, items })}
            rows={5}
          />
        </>
      );
    case "table":
      return (
        <>
          {title}
          <LinesField
            label="Column names"
            value={b.cols}
            onChange={(cols) => onChange({ ...b, cols })}
            rows={2}
          />
          <LinesField
            label='Rows ("cell | cell | cell")'
            value={rowsToBi(b.rows)}
            onChange={(lines) => onChange({ ...b, rows: biToRows(lines) })}
            rows={6}
          />
        </>
      );
    case "callout":
      return (
        <>
          <select
            aria-label="Callout kind"
            value={b.kind}
            onChange={(e) =>
              onChange({ ...b, kind: e.target.value as "trick" | "remember" | "note" })
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="trick">Trick</option>
            <option value="remember">Remember</option>
            <option value="note">Note</option>
          </select>
          <BiInput
            label="Text"
            value={b.text}
            onChange={(text) => onChange({ ...b, text })}
            rows={2}
          />
        </>
      );
    case "timeline":
      return (
        <>
          {title}
          {b.eras.map((e, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-muted/40 p-2">
              <BiInput
                label={`Period ${i + 1}`}
                value={e.title}
                onChange={(t) =>
                  onChange({ ...b, eras: b.eras.map((x, j) => (j === i ? { ...x, title: t } : x)) })
                }
              />
              <LinesField
                label='Events ("year | event")'
                value={e.items.map((it) => ({
                  en: it.when || it.text.en ? `${it.when} | ${it.text.en}` : "",
                  hi: it.when || it.text.hi ? `${it.when} | ${it.text.hi}` : "",
                }))}
                onChange={(lines) =>
                  onChange({
                    ...b,
                    eras: b.eras.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            items: lines.map((l) => {
                              const [we = "", te = ""] = l.en.split("|").map((y) => y.trim());
                              const [wh = "", th = ""] = l.hi.split("|").map((y) => y.trim());
                              return { when: we || wh, text: { en: te, hi: th } };
                            }),
                          }
                        : x,
                    ),
                  })
                }
                rows={6}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onChange({ ...b, eras: [...b.eras, { title: EMPTY, items: [] }] })}
          >
            <Plus className="mr-1 h-3 w-3" /> Another period
          </Button>
        </>
      );
    case "borders":
      return (
        <>
          {title}
          <BiInput
            label="International border (or empty)"
            value={b.intl}
            onChange={(intl) => onChange({ ...b, intl })}
          />
          <LinesField
            label='Neighbours ("district | direction")'
            value={b.items.map((x) => ({
              en: x.name.en ? `${x.name.en} | ${x.dir.en}` : "",
              hi: x.name.hi ? `${x.name.hi} | ${x.dir.hi}` : "",
            }))}
            onChange={(lines) =>
              onChange({
                ...b,
                items: lines.map((l) => {
                  const [ne = "", de = ""] = l.en.split("|").map((y) => y.trim());
                  const [nh = "", dh = ""] = l.hi.split("|").map((y) => y.trim());
                  return { name: { en: ne, hi: nh }, dir: { en: de, hi: dh } };
                }),
              })
            }
          />
        </>
      );
  }
}
