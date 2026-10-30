// GK infographics: a subject (Rajasthan Geography) posted as a series, a
// topic a day, as image cards made only from the subject's books. Today:
// the day's topic chosen, the AI's card plan picked from, the written cards
// checked in the card editor, and the two albums (Hindi, English) scheduled.
// Subjects: the running subject, its topic list, its books and reference
// material. Posted: the days posted. Settings: each album's design and
// caption, the channel and the posting time.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  addGkReference,
  addGkTopics,
  advanceGkDay,
  approveGkDay,
  cancelGkDay,
  createGkSubject,
  deleteGkCard,
  deleteGkSubject,
  deleteGkTopic,
  getGkDay,
  getGkSettings,
  getGkSubject,
  gkHistory,
  listGkSubjects,
  listKbSubjects,
  moveGkCard,
  moveGkTopic,
  pickGkIdeas,
  postGkNow,
  replanGkDay,
  saveGkSettings,
  setGkSubjectStatus,
  startGkDay,
  suggestGkTopics,
  updateGkSubject,
  updateGkTopic,
  type GkDayView,
} from "@/lib/gk.functions";
import {
  DEFAULT_GK_CAPTION_EN,
  DEFAULT_GK_CAPTION_HI,
  GK_CAPTION_FIELDS,
  GK_DESIGNS,
  GK_SAMPLE,
  fillGkCaption,
  gkCardHtml,
  type GkDesign,
  type GkLang,
  type GkSettings,
} from "@/lib/gk";
import { igDate } from "@/lib/ig-cards";
import {
  CAPTION_MAX,
  captionHtml,
  captionText,
  channelChatId,
  channelLabel,
  fromIstInput,
  igPostDefault,
  istInput,
} from "@/lib/ig-words";
import { istDate, type Bi } from "@/lib/current-affairs";
import { playStoreUrl } from "@/lib/app-promo";
import { zipFiles } from "@/lib/zip";
import { Badge, PageTabs, errorText, useUrlTab } from "@/components/ca-ui";
import { GkCardEditor, GkFrame, LOOK_NAMES, gkQuickHtml } from "@/components/gk-card-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TABS = ["today", "subjects", "posted", "settings"] as const;
type Tab = (typeof TABS)[number];

const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const timeIst = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
const site = () => (typeof window === "undefined" ? "" : window.location.origin);
const LINK_HINT =
  "A link: [Click here to download FlashGyan]({app_link}) shows the words, tappable.";
const MIGRATION_NOTE =
  "GK infographics needs its database tables: run the migration 20261211090000_gk_infographics.sql.";

export function GkPanel() {
  const [tab, setTab] = useUrlTab(TABS, "today");
  return (
    <div className="space-y-4">
      <PageTabs<Tab>
        label="GK infographics"
        tabs={[
          { id: "today", label: "Day" },
          { id: "subjects", label: "Subjects" },
          { id: "posted", label: "Posted" },
          { id: "settings", label: "Settings" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "today" && <DayView onSubjects={() => setTab("subjects")} />}
      {tab === "subjects" && <Subjects />}
      {tab === "posted" && <Posted />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

// ====================== The day ======================

const WORKING: Record<string, string> = {
  planning: "The AI is reading the books on this topic and planning the cards…",
  writing: "The AI is writing the cards, making their maps and visuals, and proofreading…",
  rendering: "Making the card images (Hindi and English)…",
};

const STATUS: Record<
  string,
  { text: string; tone: "muted" | "primary" | "warn" | "good" | "bad" }
> = {
  planning: { text: "Planning", tone: "primary" },
  picking: { text: "Pick the cards", tone: "warn" },
  writing: { text: "Writing cards", tone: "primary" },
  review: { text: "Review the cards", tone: "warn" },
  rendering: { text: "Making images", tone: "primary" },
  scheduled: { text: "Scheduled", tone: "good" },
  posting: { text: "Posting", tone: "primary" },
  posted: { text: "Posted", tone: "good" },
  failed: { text: "Failed", tone: "bad" },
  cancelled: { text: "Cancelled", tone: "muted" },
};

function DayView({ onSubjects }: { onSubjects: () => void }) {
  const [date, setDate] = useState(() => {
    if (typeof window === "undefined") return istDate();
    const d = new URLSearchParams(window.location.search).get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : istDate();
  });
  const getFn = useServerFn(getGkDay);
  const advanceFn = useServerFn(advanceGkDay);
  const qc = useQueryClient();
  // Fresh each time the tab opens (a subject may have started meanwhile).
  const q = useQuery({
    queryKey: ["gkDay", date],
    queryFn: () => getFn({ data: { date } }),
    refetchOnMount: "always",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["gkDay", date] });
  const status = q.data?.day?.status;
  // While the page is open it moves the day's work along itself (the minute
  // tick does the same when it is closed).
  const busy = useRef(false);
  useEffect(() => {
    if (!status || !(status in WORKING)) return;
    let stop = false;
    const run = async () => {
      if (busy.current || stop) return;
      busy.current = true;
      try {
        await advanceFn({ data: { date } });
      } catch (e) {
        toast.error(errorText(e, "Couldn't move on"));
        stop = true;
      } finally {
        busy.current = false;
        await refresh();
      }
    };
    void run();
    const t = setInterval(() => void run(), 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, date]);
  const v = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label="Day before"
          onClick={() => setDate(shiftDate(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          aria-label="Day"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="w-44"
        />
        <Button
          size="icon"
          variant="outline"
          aria-label="Day after"
          onClick={() => setDate(shiftDate(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {v?.day && (
          <span className="text-sm text-muted-foreground">
            {v.subject?.name_en} · Day {v.day.day_no} · {v.topic?.name_en}
          </span>
        )}
        {v?.day && <Badge tone={STATUS[v.day.status]?.tone}>{STATUS[v.day.status]?.text}</Badge>}
      </div>
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load the day")}</p>
      ) : !v?.ready ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION_NOTE}</p>
      ) : !v.day || v.day.status === "cancelled" ? (
        <ChooseTopic view={v} date={date} onDone={refresh} onSubjects={onSubjects} />
      ) : (
        <>
          {v.day.error && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {v.day.error}
            </p>
          )}
          {v.day.status in WORKING && (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> {WORKING[v.day.status]}
            </p>
          )}
          {v.day.status === "planning" && v.day.error && (
            <ChooseTopic view={v} date={date} onDone={refresh} onSubjects={onSubjects} again />
          )}
          {v.day.status === "picking" && <Picking view={v} date={date} onDone={refresh} />}
          {(v.day.status === "review" ||
            (v.day.status === "writing" && v.cards.some((c) => c.card))) && (
            <Review view={v} date={date} onChange={refresh} />
          )}
          {["rendering", "scheduled", "posting", "posted", "failed"].includes(v.day.status) && (
            <Scheduled view={v} date={date} onChange={refresh} />
          )}
        </>
      )}
    </div>
  );
}

function ChooseTopic({
  view,
  date,
  onDone,
  onSubjects,
  again,
}: {
  view: GkDayView;
  date: string;
  onDone: () => Promise<unknown>;
  onSubjects: () => void;
  again?: boolean;
}) {
  const startFn = useServerFn(startGkDay);
  const todo = view.topics.filter((t) => t.status === "todo");
  // The next topic to do, unless another is chosen.
  const [chosen, setTopic] = useState("");
  const topic = chosen || todo[0]?.id || "";
  const [busy, setBusy] = useState(false);
  if (!view.active)
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-border p-6 text-center">
        <p>No subject is running.</p>
        <p className="text-sm text-muted-foreground">
          Add a subject with its topics and books, then start it.
        </p>
        <Button onClick={onSubjects}>Go to Subjects</Button>
      </div>
    );
  const start = async () => {
    setBusy(true);
    try {
      await startFn({ data: { date, topic } });
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't start"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-medium">
        {again ? "Pick another topic, or try again" : `Today's topic from ${view.active.name_en}`}
      </p>
      {view.topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The subject has no topics yet.{" "}
          <button type="button" className="underline" onClick={onSubjects}>
            Add them in Subjects
          </button>
          .
        </p>
      ) : (
        <>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="w-full sm:w-96" aria-label="Topic">
              <SelectValue placeholder="Pick a topic" />
            </SelectTrigger>
            <SelectContent>
              {view.topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.position}. {t.name_en}
                  {t.name_hi ? ` / ${t.name_hi}` : ""}
                  {t.status !== "todo" ? ` (${t.status})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The AI reads the subject&apos;s books on the topic and plans as many cards as they have
            material for.
          </p>
          <Button disabled={!topic || busy} onClick={() => void start()}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Plan the cards
          </Button>
        </>
      )}
    </div>
  );
}

function Picking({
  view,
  date,
  onDone,
}: {
  view: GkDayView;
  date: string;
  onDone: () => Promise<unknown>;
}) {
  const pickFn = useServerFn(pickGkIdeas);
  const replanFn = useServerFn(replanGkDay);
  const ideas = view.day?.ideas ?? [];
  const [picked, setPicked] = useState<number[]>(() => ideas.map((_, i) => i));
  const [busy, setBusy] = useState(false);
  const act = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {view.day?.material_note && (
        <p className="rounded-lg bg-muted/50 p-3 text-sm" data-material-note>
          {view.day.material_note}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        The AI planned {ideas.length} card{ideas.length === 1 ? "" : "s"} from the books. Keep the
        ones you want; they are written in this order.
      </p>
      <ul className="space-y-2">
        {ideas.map((idea, i) => {
          const on = picked.includes(i);
          const unverified = idea.facts.filter((f) => !f.verified).length;
          return (
            <li
              key={i}
              className={`rounded-lg border p-3 ${on ? "border-primary/60" : "border-border opacity-70"}`}
              data-idea
            >
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={on}
                  aria-label={`Keep ${idea.title.en}`}
                  onCheckedChange={(c) =>
                    setPicked((p) =>
                      c ? [...p, i].sort((a, b) => a - b) : p.filter((x) => x !== i),
                    )
                  }
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{idea.title.en}</span>
                    <span className="text-sm text-muted-foreground">{idea.title.hi}</span>
                    <Badge tone="primary">{LOOK_NAMES[idea.look]}</Badge>
                    <Badge>{idea.facts.length} facts</Badge>
                    {unverified > 0 && (
                      <Badge tone="warn">{unverified} not found in the book</Badge>
                    )}
                  </span>
                  {idea.why && (
                    <span className="mt-1 block text-sm text-muted-foreground">{idea.why}</span>
                  )}
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      The facts
                    </summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {idea.facts.map((f, j) => (
                        <li key={j}>
                          {f.text}{" "}
                          <span className="text-xs text-muted-foreground">({f.source})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
        <span className="text-sm">{picked.length} cards kept</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void act(() => replanFn({ data: { date } }))}
          >
            Plan again
          </Button>
          <Button
            disabled={busy || !picked.length}
            onClick={() => void act(() => pickFn({ data: { date, picks: picked } }))}
          >
            Write {picked.length} cards
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Review ----------

function captionsFor(view: GkDayView): { en: string; hi: string } {
  const s = view.settings;
  const base = {
    day: view.day?.day_no ?? 1,
    count: view.cards.length,
    channel: channelLabel(s.channel) ? `https://${channelLabel(s.channel)}` : "",
    appLink: playStoreUrl("gk_infographics", "telegram_channel"),
  };
  return {
    en: fillGkCaption(s.caption_en, {
      ...base,
      subject: view.subject?.name_en ?? "",
      topic: view.topic?.name_en ?? "",
      date: igDate(view.day?.day ?? istDate(), "long"),
    }),
    hi: fillGkCaption(s.caption_hi, {
      ...base,
      subject: view.subject?.name_hi || view.subject?.name_en || "",
      topic: view.topic?.name_hi || view.topic?.name_en || "",
      date: igDate(view.day?.day ?? istDate(), "hi"),
    }),
  };
}

function CaptionBox({
  lang,
  value,
  onChange,
}: {
  lang: GkLang;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = captionText(value).length;
  const name = lang === "hi" ? "Hindi" : "English";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={`gk-caption-${lang}`}>{name} album caption</Label>
        <span
          className={`text-xs ${n > CAPTION_MAX ? "text-destructive" : "text-muted-foreground"}`}
        >
          {n}/{CAPTION_MAX}
        </span>
      </div>
      <Textarea
        id={`gk-caption-${lang}`}
        rows={7}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        aria-label={`${name} caption preview`}
        className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm [overflow-wrap:anywhere] [&_a]:font-medium [&_a]:text-primary [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: captionHtml(value) }}
      />
    </div>
  );
}

function Review({
  view,
  date,
  onChange,
}: {
  view: GkDayView;
  date: string;
  onChange: () => Promise<unknown>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [lang, setLang] = useState<GkLang>("hi");
  const moveFn = useServerFn(moveGkCard);
  const deleteFn = useServerFn(deleteGkCard);
  const approveFn = useServerFn(approveGkDay);
  const [captions, setCaptions] = useState(() =>
    view.day?.caption_en || view.day?.caption_hi
      ? { en: view.day.caption_en, hi: view.day.caption_hi }
      : captionsFor(view),
  );
  const [busy, setBusy] = useState(false);
  const [postAt, setPostAt] = useState(() => istInput(igPostDefault(view.settings.post_time)));
  const at = fromIstInput(postAt);
  const atBad = !at || at.getTime() < Date.now() - 60_000;
  const unticked = view.cards.filter((c) => !c.checked);
  const writing = view.day?.status === "writing";
  const long = [captions.en, captions.hi].some((c) => captionText(c).length > CAPTION_MAX);
  const act = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    }
  };
  const approve = async (now: boolean) => {
    setBusy(true);
    try {
      await approveFn({
        data: {
          date,
          caption_en: captions.en,
          caption_hi: captions.hi,
          now,
          ...(!now && at ? { at: at.toISOString() } : {}),
        },
      });
      toast.success(
        now
          ? "Approved: posting once the images are made"
          : `Approved: posts ${timeIst(at!.toISOString())}`,
      );
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't approve"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <section aria-label="Cards" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">
            Open a card to check it. The same cards go in both albums, each in its own design.
          </p>
          <div className="flex gap-1" role="radiogroup" aria-label="Album shown">
            {(["hi", "en"] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                role="radio"
                aria-checked={lang === l}
                variant={lang === l ? "default" : "outline"}
                onClick={() => setLang(l)}
              >
                {l === "hi" ? "Hindi" : "English"}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
          {view.cards.map((c, i) => {
            const notes = c.checks.filter((x) => x.state === "open").length;
            const title = c.card?.title.en || c.idea.title.en;
            return (
              <div key={c.id} className="min-w-0 space-y-1.5 sm:w-[170px]" data-card={title}>
                <button
                  type="button"
                  className="block w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open card ${i + 1}: ${title}`}
                  onClick={() => setOpenId(c.id)}
                  disabled={!c.card}
                >
                  {c.card ? (
                    <GkFrame
                      html={gkQuickHtml(c.card, view, lang, i + 1)}
                      title={`Card ${i + 1}`}
                    />
                  ) : (
                    <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Writing…
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-1 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {i + 1}. {title}
                  </span>
                  {!c.card || !c.proofed ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                      aria-label="being written"
                    />
                  ) : c.checked ? (
                    <Badge tone="good">✓</Badge>
                  ) : notes ? (
                    <Badge tone="warn">{notes}</Badge>
                  ) : (
                    <Badge>to check</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    aria-label={`Move ${title} earlier`}
                    disabled={i === 0}
                    onClick={() => void act(() => moveFn({ data: { id: c.id, by: -1 } }))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    aria-label={`Move ${title} later`}
                    disabled={i === view.cards.length - 1}
                    onClick={() => void act(() => moveFn({ data: { id: c.id, by: 1 } }))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    aria-label={`Drop ${title}`}
                    disabled={writing || view.cards.length < 2}
                    onClick={() =>
                      confirm(`Drop the card "${title}"?`) &&
                      void act(() => deleteFn({ data: { id: c.id } }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    disabled={!c.card}
                    onClick={() => setOpenId(c.id)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section
        className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-2"
        aria-label="Captions"
      >
        <CaptionBox
          lang="hi"
          value={captions.hi}
          onChange={(hi) => setCaptions({ ...captions, hi })}
        />
        <CaptionBox
          lang="en"
          value={captions.en}
          onChange={(en) => setCaptions({ ...captions, en })}
        />
        <p className="text-xs text-muted-foreground lg:col-span-2">
          {LINK_HINT}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setCaptions(captionsFor(view))}
          >
            Fill both from the templates again
          </button>
        </p>
      </section>
      {openId && view.cards.some((c) => c.id === openId) && (
        <GkCardEditor
          view={view}
          startId={openId}
          onClose={() => setOpenId(null)}
          onChange={onChange}
        />
      )}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
        {writing ? (
          <span className="text-sm text-muted-foreground">
            Cards are still being written or proofread…
          </span>
        ) : unticked.length ? (
          <span className="text-sm text-muted-foreground">
            Tick every card as checked to approve ({unticked.length} left).
          </span>
        ) : !channelChatId(view.settings.channel) ? (
          <span className="text-sm text-destructive">Add the channel link in Settings.</span>
        ) : (
          <span className="text-sm">All cards checked.</span>
        )}
        <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
          <Button
            variant="outline"
            disabled={busy || writing || unticked.length > 0 || long}
            onClick={() => void approve(true)}
          >
            Approve & post now
          </Button>
          <Input
            type="datetime-local"
            aria-label="Posting time (India)"
            value={postAt}
            min={istInput(new Date())}
            onChange={(e) => setPostAt(e.target.value)}
            className={`order-first col-span-2 sm:order-none sm:w-52 ${atBad ? "border-destructive" : ""}`}
          />
          <Button
            disabled={busy || writing || atBad || unticked.length > 0 || long}
            onClick={() => void approve(false)}
          >
            Approve & schedule
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Scheduled and posted ----------

function Scheduled({
  view,
  date,
  onChange,
}: {
  view: GkDayView;
  date: string;
  onChange: () => Promise<unknown>;
}) {
  const nowFn = useServerFn(postGkNow);
  const cancelFn = useServerFn(cancelGkDay);
  const d = view.day!;
  const [zipping, setZipping] = useState(false);
  const ready = view.cards.length > 0 && view.cards.every((c) => c.image_en_url && c.image_hi_url);
  const act = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    }
  };
  const zip = async () => {
    setZipping(true);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (const [i, c] of view.cards.entries())
        for (const l of ["hi", "en"] as const) {
          const url = l === "hi" ? c.image_hi_url : c.image_en_url;
          if (!url) continue;
          const res = await fetch(url);
          files.push({
            name: `${l === "hi" ? "hindi" : "english"}/${String(i + 1).padStart(2, "0")}.png`,
            data: new Uint8Array(await res.arrayBuffer()),
          });
        }
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(zipFiles(files))], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `gk-infographics-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(errorText(e, "Couldn't download"));
    } finally {
      setZipping(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
        {d.status === "posted" ? (
          <span>Posted {d.posted_at ? timeIst(d.posted_at) : ""}: Hindi and English albums.</span>
        ) : d.status === "failed" ? (
          <span className="text-destructive">Posting failed: {d.error}</span>
        ) : (
          <span>Posts {d.scheduled_for ? timeIst(d.scheduled_for) : "soon"}.</span>
        )}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || zipping}
            onClick={() => void zip()}
          >
            <Download className="mr-1 h-4 w-4" /> {zipping ? "Zipping…" : "Download all"}
          </Button>
          {d.status === "scheduled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void act(() => nowFn({ data: { date } }))}
            >
              Post now
            </Button>
          )}
          {["rendering", "scheduled", "failed"].includes(d.status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void act(() => cancelFn({ data: { date } }))}
            >
              Back to review
            </Button>
          )}
        </div>
      </div>
      {(["hi", "en"] as const).map((l) => (
        <section
          key={l}
          className="space-y-2"
          aria-label={`${l === "hi" ? "Hindi" : "English"} album`}
        >
          <p className="text-sm font-medium">{l === "hi" ? "Hindi album" : "English album"}</p>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {view.cards.map((c, i) => {
              const url = l === "hi" ? c.image_hi_url : c.image_en_url;
              return url ? (
                <a key={c.id} href={url} target="_blank" rel="noreferrer" className="sm:w-32">
                  <img
                    src={url}
                    alt={`Card ${i + 1}`}
                    className="w-full rounded-lg border border-border"
                  />
                </a>
              ) : (
                <div
                  key={c.id}
                  className="flex aspect-[9/16] items-center justify-center rounded-lg border border-dashed border-border sm:w-32"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ====================== Subjects ======================

function Subjects() {
  const listFn = useServerFn(listGkSubjects);
  const createFn = useServerFn(createGkSubject);
  const kbFn = useServerFn(listKbSubjects);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gkSubjects"], queryFn: () => listFn() });
  const kb = useQuery({ queryKey: ["kbSubjects"], queryFn: () => kbFn() });
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState<Bi>({ en: "", hi: "" });
  const [kbs, setKbs] = useState<string[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["gkSubjects"] });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (!q.data?.ready)
    return <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION_NOTE}</p>;
  const subjects = q.data.subjects;
  const shown = subjects.find((s) => s.id === open);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          One subject runs at a time; each day you pick one of its topics.
        </p>
        <Button size="sm" onClick={() => setAdding((a) => !a)}>
          <Plus className="mr-1 h-4 w-4" /> Add a subject
        </Button>
      </div>
      {adding && (
        <form
          className="space-y-3 rounded-xl border border-border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const s = await createFn({
                data: { name_en: name.en, name_hi: name.hi, kb_subjects: kbs },
              });
              setAdding(false);
              setName({ en: "", hi: "" });
              setKbs([]);
              await refresh();
              setOpen(s.id);
            } catch (err) {
              toast.error(errorText(err, "Couldn't add it"));
            }
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Subject (English)"
              placeholder="Rajasthan Geography"
              value={name.en}
              onChange={(e) => setName({ ...name, en: e.target.value })}
            />
            <Input
              aria-label="Subject (Hindi)"
              lang="hi"
              placeholder="राजस्थान का भूगोल"
              value={name.hi}
              onChange={(e) => setName({ ...name, hi: e.target.value })}
            />
          </div>
          <KbPicker list={kb.data ?? []} value={kbs} onChange={setKbs} />
          <Button type="submit" disabled={!name.en.trim()}>
            Add
          </Button>
        </form>
      )}
      {subjects.length === 0 ? (
        <p className="text-muted-foreground">No subjects yet.</p>
      ) : (
        <ul className="space-y-2">
          {subjects.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className={`flex w-full flex-wrap items-center gap-2 rounded-lg border p-3 text-left ${open === s.id ? "border-primary" : "border-border"}`}
              >
                <span className="font-medium">{s.name_en}</span>
                <span className="text-sm text-muted-foreground">{s.name_hi}</span>
                {s.status === "active" ? (
                  <Badge tone="good">Running</Badge>
                ) : s.status === "done" ? (
                  <Badge>Done</Badge>
                ) : (
                  <Badge tone="muted">Paused</Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.posted}/{s.topics} topics posted
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown && (
        <SubjectDetail
          key={shown.id}
          id={shown.id}
          kb={kb.data ?? []}
          onChange={refresh}
          onGone={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function KbPicker({
  list,
  value,
  onChange,
}: {
  list: { subject: string; docs: number }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">
        Books: the knowledge base subjects its facts come from
      </legend>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          The knowledge base has no subjects yet: add reference material to the subject instead.
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {list.map((k) => (
            <label key={k.subject} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={value.includes(k.subject)}
                onCheckedChange={(c) =>
                  onChange(c ? [...value, k.subject] : value.filter((x) => x !== k.subject))
                }
              />
              {k.subject} <span className="text-xs text-muted-foreground">({k.docs})</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function SubjectDetail({
  id,
  kb,
  onChange,
  onGone,
}: {
  id: string;
  kb: { subject: string; docs: number }[];
  onChange: () => Promise<unknown>;
  onGone: () => void;
}) {
  const getFn = useServerFn(getGkSubject);
  const statusFn = useServerFn(setGkSubjectStatus);
  const updateFn = useServerFn(updateGkSubject);
  const deleteFn = useServerFn(deleteGkSubject);
  const addFn = useServerFn(addGkTopics);
  const suggestFn = useServerFn(suggestGkTopics);
  const topicFn = useServerFn(updateGkTopic);
  const moveFn = useServerFn(moveGkTopic);
  const dropFn = useServerFn(deleteGkTopic);
  const refFn = useServerFn(addGkReference);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gkSubject", id], queryFn: () => getFn({ data: { id } }) });
  // The day's page shows the running subject and its topics too.
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["gkSubject", id] });
    await qc.invalidateQueries({ queryKey: ["gkDay"] });
    await onChange();
  };
  const [lines, setLines] = useState("");
  const [suggested, setSuggested] = useState<Bi[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ref, setRef] = useState({
    title: "",
    text: "",
    medium: "Bilingual" as "Hindi" | "English" | "Bilingual",
    source: "",
  });
  const act = async (what: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(what);
    try {
      await f();
      await refresh();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(null);
    }
  };
  if (q.isLoading || !q.data) return <p className="text-muted-foreground">Loading…</p>;
  const { subject, topics, books } = q.data;
  const parseLines = (t: string): Bi[] =>
    t
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [en, hi = ""] = l.split("|").map((x) => x.trim());
        return { en, hi };
      });
  return (
    <div className="space-y-5 rounded-xl border border-border p-4" data-subject={subject.name_en}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-lg font-semibold">{subject.name_en}</h3>
        {subject.status === "active" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              void act("status", () => statusFn({ data: { id, status: "paused" } }), "Paused")
            }
          >
            <Pause className="mr-1 h-4 w-4" /> Pause
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!!busy}
            onClick={() =>
              void act(
                "status",
                () => statusFn({ data: { id, status: "active" } }),
                "Started: the other subjects are paused",
              )
            }
          >
            <Play className="mr-1 h-4 w-4" /> Start this subject
          </Button>
        )}
        {subject.status !== "done" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() =>
              void act("status", () => statusFn({ data: { id, status: "done" } }), "Marked done")
            }
          >
            Mark done
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete subject"
          onClick={() =>
            confirm(`Delete "${subject.name_en}" and its topics? Posted days stay in Posted.`) &&
            void act("delete", async () => {
              await deleteFn({ data: { id } });
              onGone();
            })
          }
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <section className="space-y-2">
        <KbPicker
          list={kb}
          value={subject.kb_subjects}
          onChange={(kb_subjects) =>
            void act("kb", () => updateFn({ data: { id, patch: { kb_subjects } } }))
          }
        />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {books.length} books and documents
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {books.map((b) => (
              <li key={b.id}>
                {b.title}{" "}
                <span className="text-xs text-muted-foreground">
                  ({b.subject}, {b.medium})
                </span>
              </li>
            ))}
          </ul>
        </details>
        <details className="rounded-lg border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Add reference material</summary>
          <div className="mt-2 space-y-2">
            <Input
              aria-label="Reference title"
              placeholder="Title (book and chapter)"
              value={ref.title}
              onChange={(e) => setRef({ ...ref, title: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Select
                value={ref.medium}
                onValueChange={(m) => setRef({ ...ref, medium: m as typeof ref.medium })}
              >
                <SelectTrigger className="w-40" aria-label="Language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Hindi", "English", "Bilingual"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Reference source"
                placeholder="Source (optional)"
                className="min-w-0 flex-1"
                value={ref.source}
                onChange={(e) => setRef({ ...ref, source: e.target.value })}
              />
            </div>
            <Textarea
              aria-label="Reference text"
              rows={6}
              placeholder="Paste the material's text"
              value={ref.text}
              onChange={(e) => setRef({ ...ref, text: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Kept in the knowledge base under {subject.kb_subjects[0] ?? subject.name_en}, and read
              like the books.
            </p>
            <Button
              size="sm"
              disabled={!!busy || !ref.title.trim() || ref.text.trim().length < 40}
              onClick={() =>
                void act(
                  "ref",
                  async () => {
                    await refFn({ data: { id, ...ref } });
                    setRef({ title: "", text: "", medium: ref.medium, source: "" });
                  },
                  "Reference added",
                )
              }
            >
              {busy === "ref" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Add the material
            </Button>
          </div>
        </details>
      </section>

      <section className="space-y-2" aria-label="Topics">
        <p className="text-sm font-medium">Topics ({topics.length})</p>
        <ol className="space-y-1.5">
          {topics.map((t, i) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm"
              data-topic={t.name_en}
            >
              <span className="w-6 text-right text-muted-foreground">{i + 1}.</span>
              <TopicField
                value={t.name_en}
                label="Topic (English)"
                onSave={(name_en) =>
                  act("t", () => topicFn({ data: { id: t.id, patch: { name_en } } }))
                }
              />
              <TopicField
                value={t.name_hi}
                label="Topic (Hindi)"
                onSave={(name_hi) =>
                  act("t", () => topicFn({ data: { id: t.id, patch: { name_hi } } }))
                }
              />
              <TopicField
                value={t.note}
                label="What to cover (optional)"
                wide
                onSave={(note) => act("t", () => topicFn({ data: { id: t.id, patch: { note } } }))}
              />
              {t.status === "posted" ? (
                <Badge tone="good">Posted {t.posted_on ? igDate(t.posted_on) : ""}</Badge>
              ) : t.status === "skipped" ? (
                <Badge>Skipped</Badge>
              ) : null}
              <div className="ml-auto flex">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label={`Move ${t.name_en} up`}
                  disabled={i === 0}
                  onClick={() => void act("m", () => moveFn({ data: { id: t.id, by: -1 } }))}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label={`Move ${t.name_en} down`}
                  disabled={i === topics.length - 1}
                  onClick={() => void act("m", () => moveFn({ data: { id: t.id, by: 1 } }))}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    void act("t", () =>
                      topicFn({
                        data: {
                          id: t.id,
                          patch: { status: t.status === "todo" ? "skipped" : "todo" },
                        },
                      }),
                    )
                  }
                >
                  {t.status === "todo" ? "Skip" : "To do"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label={`Delete ${t.name_en}`}
                  onClick={() =>
                    confirm(`Delete the topic "${t.name_en}"?`) &&
                    void act("d", () => dropFn({ data: { id: t.id } }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <Label htmlFor="gk-topic-lines">Add topics, one a line: English | Hindi</Label>
          <Textarea
            id="gk-topic-lines"
            rows={4}
            placeholder={
              "Rivers of Rajasthan | राजस्थान की नदियाँ\nForts of Rajasthan | राजस्थान के दुर्ग"
            }
            value={lines}
            onChange={(e) => setLines(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!!busy || !parseLines(lines).length}
              onClick={() =>
                void act("add", async () => {
                  const r = await addFn({ data: { subject: id, names: parseLines(lines) } });
                  setLines("");
                  toast.success(`${r.added} topics added`);
                })
              }
            >
              Add topics
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || !books.length}
              title={books.length ? undefined : "Link the subject to its books first"}
              onClick={async () => {
                setBusy("suggest");
                try {
                  setSuggested(await suggestFn({ data: { subject: id } }));
                } catch (e) {
                  toast.error(errorText(e, "Couldn't suggest topics"));
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "suggest" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              Suggest topics from the books
            </Button>
          </div>
          {suggested && (
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                SAATHI&apos;s list: add it to the box above to edit, then add.
              </p>
              <ul className="list-disc pl-5">
                {suggested.map((s, i) => (
                  <li key={i}>
                    {s.en} / {s.hi}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLines((l) =>
                    [l.trim(), ...suggested.map((s) => `${s.en} | ${s.hi}`)]
                      .filter(Boolean)
                      .join("\n"),
                  );
                  setSuggested(null);
                }}
              >
                Put them in the box
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// A text field saved when it loses focus.
function TopicField({
  value,
  label,
  wide,
  onSave,
}: {
  value: string;
  label: string;
  wide?: boolean;
  onSave: (v: string) => Promise<unknown>;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      aria-label={label}
      placeholder={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() =>
        v.trim() !== value && (v.trim() || !label.includes("English")) && void onSave(v.trim())
      }
      className={`h-8 ${wide ? "min-w-40 flex-[2]" : "min-w-32 flex-1"}`}
    />
  );
}

// ====================== Posted ======================

function Posted() {
  const fn = useServerFn(gkHistory);
  const q = useQuery({ queryKey: ["gkHistory"], queryFn: () => fn(), refetchOnMount: "always" });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (!q.data?.length) return <p className="text-muted-foreground">Nothing posted yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2">Date</th>
            <th className="p-2">Subject</th>
            <th className="p-2">Day</th>
            <th className="p-2">Topic</th>
            <th className="p-2">Cards</th>
            <th className="p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((r) => (
            <tr key={r.day} className="border-t border-border">
              <td className="p-2 whitespace-nowrap">{igDate(r.day)}</td>
              <td className="p-2">{r.subject}</td>
              <td className="p-2">{r.day_no}</td>
              <td className="p-2">{r.topic}</td>
              <td className="p-2">{r.cards}</td>
              <td className="p-2">
                <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.text ?? r.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ====================== Settings ======================

function DesignPicker({
  lang,
  value,
  onChange,
  settings,
}: {
  lang: GkLang;
  value: GkDesign;
  onChange: (d: GkDesign) => void;
  settings: GkSettings;
}) {
  const name = lang === "hi" ? "Hindi" : "English";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{name} album design</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {GK_DESIGNS.map((d) => (
          <DesignCard
            key={d.key}
            lang={lang}
            design={d}
            on={value === d.key}
            onPick={() => onChange(d.key)}
            settings={settings}
          />
        ))}
      </div>
    </fieldset>
  );
}

function DesignCard({
  lang,
  design,
  on,
  onPick,
  settings,
}: {
  lang: GkLang;
  design: (typeof GK_DESIGNS)[number];
  on: boolean;
  onPick: () => void;
  settings: GkSettings;
}) {
  const html = useMemo(
    () =>
      gkCardHtml(GK_SAMPLE, {
        lang,
        design: design.key,
        n: 1,
        total: 6,
        subject: { en: "Rajasthan Geography", hi: "राजस्थान का भूगोल" },
        dayNo: 4,
        date: istDate(),
        channel: channelLabel(settings.channel),
        assetBase: site(),
        watermark: settings.watermark,
      }),
    [lang, design.key, settings.channel, settings.watermark],
  );
  return (
    <label
      className={`block cursor-pointer space-y-1 rounded-lg p-1.5 ${on ? "ring-2 ring-primary" : ""}`}
    >
      <GkFrame html={html} title={`${design.name} (${lang})`} />
      <span className="flex items-center gap-1.5 text-sm">
        <input
          type="radio"
          name={`gk-design-${lang}`}
          checked={on}
          aria-label={`${lang === "hi" ? "Hindi" : "English"}: use ${design.name}`}
          onChange={onPick}
        />
        <span className="font-medium">{design.name}</span>
      </span>
      <span className="block text-xs text-muted-foreground">{design.note}</span>
    </label>
  );
}

function Settings() {
  const getFn = useServerFn(getGkSettings);
  const saveFn = useServerFn(saveGkSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gkSettings"], queryFn: () => getFn() });
  const [s, setS] = useState<GkSettings | null>(null);
  useEffect(() => {
    if (q.data && !s) setS(q.data);
  }, [q.data, s]);
  if (q.isLoading || !s) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const set = (patch: Partial<GkSettings>) => setS({ ...s, ...patch });
  const dirty = JSON.stringify(s) !== JSON.stringify(q.data);
  const save = async () => {
    try {
      const next = await saveFn({ data: s });
      qc.setQueryData(["gkSettings"], next);
      setS(next);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const sample = (lang: GkLang) =>
    fillGkCaption(lang === "hi" ? s.caption_hi : s.caption_en, {
      subject: lang === "hi" ? "राजस्थान का भूगोल" : "Rajasthan Geography",
      topic: lang === "hi" ? "राजस्थान के दुर्ग" : "Forts of Rajasthan",
      day: 4,
      date: igDate(istDate(), lang === "hi" ? "hi" : "long"),
      count: 6,
      channel: channelLabel(s.channel) ? `https://${channelLabel(s.channel)}` : "",
      appLink: playStoreUrl("gk_infographics", "telegram_channel"),
    });
  return (
    <div className="space-y-6 pb-20">
      <section className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Telegram channel</span>
          <Input
            value={s.channel}
            placeholder="t.me/yourchannel or @yourchannel"
            onChange={(e) => set({ channel: e.target.value })}
          />
          <span className="block text-xs text-muted-foreground">
            Both albums go here. The bot must be an admin of it.
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Posting time (India)</span>
          <Input
            type="time"
            value={s.post_time}
            onChange={(e) => set({ post_time: e.target.value })}
            className="w-32"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Watermark strength (0 for none)</span>
          <Input
            type="number"
            min={0}
            max={30}
            value={s.watermark}
            onChange={(e) =>
              set({ watermark: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })
            }
            className="w-24"
          />
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <Switch
            checked={s.notify}
            onCheckedChange={(notify) => set({ notify })}
            aria-label="Tell me on Telegram when the cards are ready"
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Tell me on Telegram when the cards are ready</span>
            <span className="block text-xs text-muted-foreground">
              In the magazine&apos;s test chat.
            </span>
          </span>
        </label>
      </section>
      <section className="space-y-4 rounded-xl border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Each album keeps its design every day, so students know it at a glance.
        </p>
        <DesignPicker
          lang="hi"
          value={s.design_hi}
          onChange={(design_hi) => set({ design_hi })}
          settings={s}
        />
        <DesignPicker
          lang="en"
          value={s.design_en}
          onChange={(design_en) => set({ design_en })}
          settings={s}
        />
      </section>
      <section className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-2">
        {(["hi", "en"] as const).map((l) => {
          const key = l === "hi" ? "caption_hi" : "caption_en";
          return (
            <div key={l} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`gk-template-${l}`}>
                  {l === "hi" ? "Hindi" : "English"} caption template
                </Label>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() =>
                    set({ [key]: l === "hi" ? DEFAULT_GK_CAPTION_HI : DEFAULT_GK_CAPTION_EN })
                  }
                >
                  Default
                </button>
              </div>
              <Textarea
                id={`gk-template-${l}`}
                rows={8}
                value={s[key]}
                onChange={(e) => set({ [key]: e.target.value })}
              />
              <div
                aria-label={`${l === "hi" ? "Hindi" : "English"} caption sample`}
                className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm [overflow-wrap:anywhere] [&_a]:font-medium [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: captionHtml(sample(l)) }}
              />
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground lg:col-span-2">
          Fill-ins: {GK_CAPTION_FIELDS.map(([k, v]) => `${k} ${v}`).join(", ")}. {LINK_HINT}
        </p>
      </section>
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-end gap-2 border-t border-border bg-background/95 p-3 backdrop-blur">
          <span className="mr-auto text-sm">Unsaved changes</span>
          <Button variant="ghost" onClick={() => setS(q.data ?? null)}>
            Discard
          </Button>
          <Button onClick={() => void save()}>Save settings</Button>
        </div>
      )}
    </div>
  );
}
