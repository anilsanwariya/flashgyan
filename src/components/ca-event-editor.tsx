// The editor for a concluded event's complete summary: on a page of its
// own, like the daily story editor. A tab for each part (headline and
// summary, points, Exam Angle, questions, visuals, images, versions and a
// preview), each editable in both languages and written again by the AI on
// request. Visuals are made from all the event's facts, or taken from its
// daily stories, and so are images. Changes save as you go, and the summary
// before an AI change, a restore or a run of edits is kept as a version.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Eye,
  FileText,
  HelpCircle,
  History,
  Image as ImageIcon,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import {
  getCaEventEditor,
  getMagazineSettings,
  previewCaEventVisual,
  restoreCaEventVersion,
  rewriteCaEventPart,
  saveCaEventSummary,
} from "@/lib/current-affairs.functions";
import {
  DEFAULT_MAGAZINE_SETTINGS,
  MAX_IMAGES,
  MAX_VISUALS,
  storyVisuals,
  visualsPatch,
  type Bi,
  type CaContent,
} from "@/lib/current-affairs";
import { storyPreviewHtml } from "@/lib/current-affairs-html";
import { EVENT_POINTS_MAX, type CaEvent, type EventPart } from "@/lib/ca-events";
import { StoryVisuals } from "@/components/ca-story-visuals";
import { StoryImages } from "@/components/ca-story-images";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type TabId = "text" | "points" | "why" | "questions" | "visuals" | "images" | "history" | "preview";

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: "text", label: "Headline & summary", icon: FileText },
  { id: "points", label: "Points", icon: ListChecks },
  { id: "why", label: "Exam Angle", icon: Target },
  { id: "questions", label: "Questions", icon: HelpCircle },
  { id: "visuals", label: "Visuals", icon: BarChart3 },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "history", label: "Versions", icon: History },
  { id: "preview", label: "Preview", icon: Eye },
];

const LANGS = [
  { id: "hi", label: "हिंदी" },
  { id: "en", label: "English" },
] as const;

const REASONS: Record<string, string> = {
  write: "Before the AI wrote it again",
  ai: "Before an AI change",
  restore: "Before a restore",
  edit: "Your edits",
};

export function EventSummaryEditor({
  event,
  onClose,
  onChanged,
}: {
  event: CaEvent;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const getFn = useServerFn(getCaEventEditor);
  const saveFn = useServerFn(saveCaEventSummary);
  const settingsFn = useServerFn(getMagazineSettings);
  const q = useQuery({
    queryKey: ["caEventEditor", event.id],
    queryFn: () => getFn({ data: { id: event.id } }),
  });
  const settingsQ = useQuery({ queryKey: ["caMagSettings"], queryFn: () => settingsFn() });
  const [tab, setTab] = useState<TabId>("text");
  const [previewLang, setPreviewLang] = useState<"hi" | "en">("hi");
  const [c, setC] = useState<CaContent | null>(event.summary);
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sent = useRef(JSON.stringify(event.summary));
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab]);

  // One save at a time, in order; an AI change keeps the summary before it.
  const push = (next: CaContent, reason?: "ai") => {
    const json = JSON.stringify(next);
    if (json === sent.current && !reason) return chain.current;
    sent.current = json;
    setSaving((n) => n + 1);
    chain.current = chain.current.then(async () => {
      try {
        await saveFn({ data: { id: event.id, summary: next, ...(reason ? { reason } : {}) } });
        setSavedAt(new Date());
        setSaveError(null);
        await onChanged();
      } catch (e) {
        setSaveError(errorText(e, "Couldn't save"));
        sent.current = "";
      } finally {
        setSaving((n) => n - 1);
      }
    });
    return chain.current;
  };
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => void push(c), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  const set = (patch: Partial<CaContent>) => c && setC({ ...c, ...patch });
  // Saved at once (visuals, images, AI changes, restores).
  const now = async (patch: Partial<CaContent>, reason?: "ai") => {
    if (!c) return;
    const next = { ...c, ...patch };
    setC(next);
    await push(next, reason);
    await q.refetch();
  };
  const replace = (next: CaContent) => {
    setC(next);
    sent.current = JSON.stringify(next);
  };
  const leave = () => void chain.current.then(onClose);

  const data = q.data;
  const previewHtml = useMemo(() => {
    if (!c) return "";
    return storyPreviewHtml(
      {
        id: `event-${event.id}`,
        issue_date: event.ends_on ?? event.starts_on ?? "",
        category: data?.category ?? "misc",
        importance: 5,
        rajasthan: false,
        content: c,
        facts: [],
        context_sources: [],
        source_names: [],
      },
      previewLang,
      settingsQ.data ?? DEFAULT_MAGAZINE_SETTINGS,
    );
  }, [c, data?.category, event, settingsQ.data, previewLang]);

  return (
    <Dialog open onOpenChange={(o) => !o && leave()}>
      <DialogContent
        aria-describedby={undefined}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        <header className="border-b border-border bg-background p-2 pr-12 sm:pl-4">
          <p className="text-xs text-muted-foreground">Complete summary · monthly magazine</p>
          <DialogTitle className="truncate text-base font-semibold leading-snug">
            {event.name}
          </DialogTitle>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge>{data ? `${data.stories.length} daily stories` : "…"}</Badge>
            <Badge>{data ? `${data.facts.length} facts` : "…"}</Badge>
            <Badge>
              {storyVisuals(c).length} visual{storyVisuals(c).length === 1 ? "" : "s"}
            </Badge>
            <Badge>
              {(c?.images ?? []).length} image{(c?.images ?? []).length === 1 ? "" : "s"}
            </Badge>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav
            aria-label="Parts of the summary"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1.5 lg:w-56 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-2"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:p-5">
              {!c ? (
                <p className="text-sm text-muted-foreground">
                  Write the summary first (Events tab).
                </p>
              ) : tab === "text" ? (
                <Section title="Headline and summary">
                  <BiField
                    label="Headline"
                    value={c.headline}
                    onChange={(headline) => set({ headline })}
                  />
                  <BiField
                    label="Summary"
                    rows={6}
                    value={c.summary}
                    onChange={(summary) => set({ summary })}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!c.hide_summary}
                      onCheckedChange={(v) => set({ hide_summary: !v })}
                      aria-label="Print the summary"
                    />
                    Print the summary text
                  </label>
                  <PartAI eventId={event.id} part="headline" label="headline" onUse={now} />
                  <PartAI eventId={event.id} part="summary" label="summary" onUse={now} />
                </Section>
              ) : tab === "points" ? (
                <Section
                  title="Points"
                  hint={`Up to ${EVENT_POINTS_MAX} short points, each starting with the key term, name or number.`}
                >
                  <PointsEditor points={c.points} onChange={(points) => set({ points })} />
                  <PartAI eventId={event.id} part="points" label="points" onUse={now} />
                </Section>
              ) : tab === "why" ? (
                <Section title="Exam Angle" hint="The RAS syllabus label and why it matters.">
                  <BiField
                    label="Exam Angle"
                    rows={3}
                    value={c.why}
                    onChange={(why) => set({ why })}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!c.hide_why}
                      onCheckedChange={(v) => set({ hide_why: !v })}
                      aria-label="Print the Exam Angle"
                    />
                    Print the Exam Angle
                  </label>
                  <PartAI eventId={event.id} part="why" label="Exam Angle" onUse={now} />
                </Section>
              ) : tab === "questions" ? (
                <Section title="Questions" hint="The MCQ prints in the practice set too.">
                  <McqEditor content={c} onChange={set} />
                  <PartAI
                    eventId={event.id}
                    part="questions"
                    label="MCQ and Mains question"
                    onUse={now}
                  />
                </Section>
              ) : tab === "visuals" ? (
                <Section
                  title="Visuals"
                  hint="Made from all the event's facts (results table, timeline, medal list…), or taken from its daily stories."
                >
                  <EventVisuals
                    eventId={event.id}
                    content={c}
                    facts={data?.facts ?? []}
                    onSave={now}
                  />
                  <FromStories
                    kind="visuals"
                    stories={data?.stories ?? []}
                    content={c}
                    onSave={now}
                  />
                </Section>
              ) : tab === "images" ? (
                <Section title="Images">
                  <StoryImages
                    itemId={event.id}
                    content={c}
                    lang="hi"
                    editing
                    onSave={(p) => now(p)}
                  />
                  <FromStories
                    kind="images"
                    stories={data?.stories ?? []}
                    content={c}
                    onSave={now}
                  />
                </Section>
              ) : tab === "history" ? (
                <Versions
                  eventId={event.id}
                  versions={data?.versions ?? []}
                  onRestored={async (s) => {
                    replace(s);
                    await q.refetch();
                    await onChanged();
                  }}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-1" role="group" aria-label="Preview language">
                    {LANGS.map((l) => (
                      <Button
                        key={l.id}
                        size="sm"
                        variant={previewLang === l.id ? "default" : "outline"}
                        onClick={() => setPreviewLang(l.id)}
                      >
                        {l.label}
                      </Button>
                    ))}
                  </div>
                  <iframe
                    title="Preview of the summary"
                    srcDoc={previewHtml}
                    className="h-[70vh] w-full rounded-lg border border-border bg-white"
                  />
                </div>
              )}
            </div>
          </main>
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-background px-2 py-2 sm:px-4">
          <span
            role="status"
            className={`min-w-0 flex-1 text-xs ${saveError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {saveError
              ? saveError
              : saving > 0
                ? "Saving…"
                : savedAt
                  ? `Saved · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Changes save as you go"}
          </span>
          <Button size="sm" variant="outline" onClick={leave}>
            <Check className="mr-1 h-4 w-4" /> Done
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// One text in both languages, side by side on wide screens.
function BiField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: Bi | null | undefined;
  onChange: (v: Bi) => void;
  rows?: number;
}) {
  const v = value ?? { en: "", hi: "" };
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {LANGS.map((l) => (
        <label key={l.id} className="block space-y-1 text-sm">
          <span className="font-medium">
            {label} · {l.label}
          </span>
          {rows ? (
            <Textarea
              lang={l.id}
              rows={rows}
              aria-label={`${label} (${l.id === "hi" ? "Hindi" : "English"})`}
              value={v[l.id]}
              onChange={(e) => onChange({ ...v, [l.id]: e.target.value })}
            />
          ) : (
            <Input
              lang={l.id}
              aria-label={`${label} (${l.id === "hi" ? "Hindi" : "English"})`}
              value={v[l.id]}
              onChange={(e) => onChange({ ...v, [l.id]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}

function PointsEditor({ points, onChange }: { points: Bi[]; onChange: (p: Bi[]) => void }) {
  const put = (i: number, p: Bi) => onChange(points.map((x, j) => (j === i ? p : x)));
  const move = (i: number, by: number) => {
    const next = [...points];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  return (
    <ol className="space-y-3">
      {points.map((p, i) => (
        <li
          key={i}
          className="space-y-2 rounded-lg border border-border p-2"
          aria-label={`Point ${i + 1}`}
        >
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="flex-1">Point {i + 1}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label={`Move point ${i + 1} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label={`Move point ${i + 1} down`}
              disabled={i === points.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-destructive"
              aria-label={`Remove point ${i + 1}`}
              onClick={() => onChange(points.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {LANGS.map((l) => (
              <Textarea
                key={l.id}
                lang={l.id}
                rows={2}
                aria-label={`Point ${i + 1} (${l.id === "hi" ? "Hindi" : "English"})`}
                value={p[l.id]}
                onChange={(e) => put(i, { ...p, [l.id]: e.target.value })}
              />
            ))}
          </div>
        </li>
      ))}
      {points.length < EVENT_POINTS_MAX && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...points, { en: "", hi: "" }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add a point
        </Button>
      )}
    </ol>
  );
}

function McqEditor({
  content: c,
  onChange,
}: {
  content: CaContent;
  onChange: (p: Partial<CaContent>) => void;
}) {
  const blank = { en: "", hi: "" };
  const mcq = c.mcq ?? {
    question: blank,
    options: [blank, blank, blank, blank],
    answer: 0,
    explanation: blank,
  };
  const put = (p: Partial<NonNullable<CaContent["mcq"]>>) => onChange({ mcq: { ...mcq, ...p } });
  return (
    <div className="space-y-3">
      <BiField
        label="MCQ question"
        rows={2}
        value={mcq.question}
        onChange={(question) => put({ question })}
      />
      {mcq.options.map((o, i) => (
        <div key={i} className="flex items-start gap-2">
          <label className="mt-7 flex items-center gap-1 text-xs">
            <input
              type="radio"
              name="mcq-answer"
              aria-label={`Option ${i + 1} is the answer`}
              checked={mcq.answer === i}
              onChange={() => put({ answer: i })}
            />
            {String.fromCharCode(65 + i)}
          </label>
          <div className="min-w-0 flex-1">
            <BiField
              label={`Option ${String.fromCharCode(65 + i)}`}
              value={o}
              onChange={(v) => put({ options: mcq.options.map((x, j) => (j === i ? v : x)) })}
            />
          </div>
        </div>
      ))}
      <BiField
        label="Explanation"
        rows={2}
        value={mcq.explanation}
        onChange={(explanation) => put({ explanation })}
      />
      <BiField
        label="Mains question"
        rows={2}
        value={c.mains}
        onChange={(mains) => onChange({ mains: mains.en || mains.hi ? mains : null })}
      />
    </div>
  );
}

// "Write again with AI" for one part: shown first, used only when chosen.
function PartAI({
  eventId,
  part,
  label,
  onUse,
}: {
  eventId: string;
  part: EventPart;
  label: string;
  onUse: (patch: Partial<CaContent>, reason?: "ai") => Promise<void>;
}) {
  const rewriteFn = useServerFn(rewriteCaEventPart);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<Partial<CaContent> | null>(null);
  const ask = async () => {
    setBusy(true);
    try {
      setGot(await rewriteFn({ data: { id: eventId, part, note } }));
    } catch (e) {
      toast.error(errorText(e, "Couldn't write it"));
    } finally {
      setBusy(false);
    }
  };
  const bi = (b: Bi | null | undefined) =>
    b ? (
      <div className="grid gap-1 md:grid-cols-2">
        <p lang="hi">{b.hi}</p>
        <p lang="en">{b.en}</p>
      </div>
    ) : null;
  return (
    <div
      className="space-y-2 rounded-xl border border-dashed border-primary/40 p-3"
      aria-label={`Write the ${label} again with AI`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-0 flex-1"
          placeholder={`What to change in the ${label} (optional)`}
          aria-label={`What to change in the ${label}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void ask()}>
          {busy ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          Write the {label} again
        </Button>
      </div>
      {got && (
        <div
          className="space-y-2 rounded-lg bg-primary/5 p-3 text-sm"
          aria-label="The AI's version"
        >
          {bi(got.headline)}
          {bi(got.summary)}
          {got.points && (
            <ol className="list-decimal space-y-1 pl-5">
              {got.points.map((p, i) => (
                <li key={i}>{bi(p)}</li>
              ))}
            </ol>
          )}
          {bi(got.why)}
          {got.mcq !== undefined && (got.mcq ? bi(got.mcq.question) : <p>No MCQ</p>)}
          {got.mains !== undefined && bi(got.mains)}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await onUse(got, "ai");
                setGot(null);
                toast.success("Used");
              }}
            >
              Use this
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setGot(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The summary's visuals, made from all the event's facts.
function EventVisuals({
  eventId,
  content,
  facts,
  onSave,
}: {
  eventId: string;
  content: CaContent;
  facts: { text: string }[];
  onSave: (patch: Partial<CaContent>) => Promise<void>;
}) {
  const makeFn = useServerFn(previewCaEventVisual);
  return (
    <StoryVisuals
      item={{
        id: eventId,
        headline: content.headline.en,
        facts,
        make: (opts) => makeFn({ data: { id: eventId, ...opts } }),
      }}
      content={content}
      busy={false}
      onSave={onSave}
    />
  );
}

// The daily stories' visuals or images, to add to the summary.
function FromStories({
  kind,
  stories,
  content,
  onSave,
}: {
  kind: "visuals" | "images";
  stories: {
    id: string;
    issue_date: string;
    headline: string;
    visuals: ReturnType<typeof storyVisuals>;
    images: NonNullable<CaContent["images"]>;
  }[];
  content: CaContent;
  onSave: (patch: Partial<CaContent>) => Promise<void>;
}) {
  const have = storyVisuals(content);
  const images = content.images ?? [];
  const list = stories.filter((s) => (kind === "visuals" ? s.visuals.length : s.images.length));
  if (!list.length) return null;
  const full = kind === "visuals" ? have.length >= MAX_VISUALS : images.length >= MAX_IMAGES;
  return (
    <section
      aria-label={`From the daily stories (${kind})`}
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <h3 className="text-sm font-semibold">From the daily stories</h3>
      <p className="text-xs text-muted-foreground">
        {full
          ? `The summary has all the ${kind} it can hold; remove one first.`
          : `Add a daily story's ${kind === "visuals" ? "visual" : "image"} to the summary.`}
      </p>
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="text-sm">
            <p className="font-medium">
              {s.issue_date} · {s.headline}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {kind === "visuals"
                ? s.visuals.map((v, i) => {
                    const added = have.some(
                      (h) => JSON.stringify(h.visual) === JSON.stringify(v.visual),
                    );
                    return (
                      <Button
                        key={i}
                        size="sm"
                        variant="outline"
                        disabled={full || added}
                        onClick={() => void onSave(visualsPatch([...have, { ...v, covers: [] }]))}
                      >
                        {added ? (
                          <Check className="mr-1 h-4 w-4" />
                        ) : (
                          <Plus className="mr-1 h-4 w-4" />
                        )}
                        {v.visual.type} {added ? "added" : ""}
                      </Button>
                    );
                  })
                : s.images.map((img, i) => {
                    const added = images.some((h) => h.path === img.path);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={full || added}
                        aria-label={`Add image ${i + 1} of ${s.headline}`}
                        className="relative h-16 w-24 overflow-hidden rounded border border-border disabled:opacity-50"
                        onClick={() => void onSave({ images: [...images, img] })}
                      >
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                        {added && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                            <Check className="h-5 w-5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Versions({
  eventId,
  versions,
  onRestored,
}: {
  eventId: string;
  versions: { at: string; reason: string; summary: CaContent }[];
  onRestored: (s: CaContent) => Promise<void>;
}) {
  const restoreFn = useServerFn(restoreCaEventVersion);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section
      title="Earlier versions"
      hint="Kept before the AI writes it again, before an AI change or a restore, and every 15 minutes of your own edits."
    >
      {!versions.length ? (
        <p className="text-sm text-muted-foreground">No earlier versions yet.</p>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.at} className="rounded-lg border border-border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{REASONS[v.reason] ?? v.reason}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(v.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <span className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(open === v.at ? null : v.at)}
                >
                  {open === v.at ? "Hide" : "Show"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const e = await restoreFn({ data: { id: eventId, at: v.at } });
                      if (e.summary) await onRestored(e.summary);
                      toast.success("Restored");
                    } catch (err) {
                      toast.error(errorText(err, "Couldn't restore"));
                    }
                  }}
                >
                  Restore
                </Button>
              </div>
              {open === v.at && (
                <div className="mt-2 space-y-1">
                  <p className="font-medium">{v.summary.headline.hi}</p>
                  <p>{v.summary.summary.hi}</p>
                  <ul className="list-disc pl-5">
                    {v.summary.points.map((p, i) => (
                      <li key={i}>{p.hi || p.en}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
