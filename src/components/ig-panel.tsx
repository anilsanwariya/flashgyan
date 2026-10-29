// Infographics, "Words in the News": the day's words picked from the AI's
// suggestions (and the reserve), the written cards proofread and ticked,
// the day's design and caption, and the album scheduled for the channel.
// Settings hold the designs, caption template, channel and posting time;
// History lists every word posted, which never comes back.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import {
  addOwnIgWord,
  advanceIgDay,
  approveIgDay,
  cancelIgDay,
  getIgDay,
  getIgSettings,
  igHistory,
  igPickStats,
  igWeekPreview,
  listIgWeeks,
  postIgWeek,
  suggestIgPickRules,
  moveIgCard,
  pickIgWords,
  postIgNow,
  releaseIgWord,
  saveIgSettings,
  setIgDesign,
  startIgDay,
  type IgDayView,
  type IgWord,
} from "@/lib/ig.functions";
import {
  IG_DESIGNS,
  IG_SAMPLES,
  igDate,
  markWord,
  type IgDesign,
  type IgLang,
} from "@/lib/ig-cards";
import {
  CAPTION_FIELDS,
  CAPTION_MAX,
  captionHtml,
  captionText,
  channelChatId,
  channelLabel,
  fillCaption,
  fillWeeklyCaption,
  PICK_RULES_MAX,
  WEEKDAYS,
  type IgSettings,
} from "@/lib/ig-words";
import { istDate } from "@/lib/current-affairs";
import { playStoreUrl } from "@/lib/app-promo";
import { Badge, PageTabs, errorText, useUrlTab } from "@/components/ca-ui";
import { CardPreview } from "@/components/ig-card-preview";
import { IgCardEditor } from "@/components/ig-card-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TABS = ["today", "roundups", "history", "settings"] as const;
type Tab = (typeof TABS)[number];

const LANG_NAME: Record<IgLang, string> = { en: "English", hi: "Hindi" };

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

export function InfographicsPanel() {
  const [tab, setTab] = useUrlTab(TABS, "today");
  return (
    <div className="space-y-4">
      <PageTabs<Tab>
        label="Infographics"
        tabs={[
          { id: "today", label: "Day" },
          { id: "roundups", label: "Round-ups" },
          { id: "history", label: "Posted words" },
          { id: "settings", label: "Settings" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "today" && <DayView />}
      {tab === "roundups" && <Roundups />}
      {tab === "history" && <History />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

// ====================== The day ======================

const WORKING: Record<string, string> = {
  suggesting: "The AI is reading the day's papers and suggesting words…",
  writing: "The AI is writing and proofreading the cards…",
  rendering: "Making the card images…",
};

function DayView() {
  const [date, setDate] = useState(() => {
    if (typeof window === "undefined") return istDate();
    const d = new URLSearchParams(window.location.search).get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : istDate();
  });
  const getFn = useServerFn(getIgDay);
  const advanceFn = useServerFn(advanceIgDay);
  const startFn = useServerFn(startIgDay);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["igDay", date], queryFn: () => getFn({ data: { date } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["igDay", date] });
  const status = q.data?.day?.status;
  // While the page is open it moves the day's work along itself, a step
  // at a time (the minute tick does the same when it is closed).
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
  const start = async () => {
    try {
      await startFn({ data: { date } });
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't start"));
    }
  };
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
        <span className="text-sm text-muted-foreground">News of {igDate(date, "long")}</span>
        {v?.day && <StatusBadge status={v.day.status} />}
      </div>
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load the day")}</p>
      ) : !v?.day ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-6 text-center">
          <p>No words for this day yet.</p>
          <p className="text-sm text-muted-foreground">
            {v?.settings.auto_suggest
              ? "They are suggested on their own once the evening collection is done."
              : "Automatic suggestions are off in Settings."}
          </p>
          <Button onClick={() => void start()}>Suggest words now</Button>
        </div>
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
          {v.day.status === "picking" && (
            <Picking view={v} date={date} onDone={refresh} onRestart={start} />
          )}
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

const STATUS: Record<
  string,
  { text: string; tone: "muted" | "primary" | "warn" | "good" | "bad" }
> = {
  suggesting: { text: "Suggesting words", tone: "primary" },
  picking: { text: "Pick the words", tone: "warn" },
  writing: { text: "Writing cards", tone: "primary" },
  review: { text: "Review the cards", tone: "warn" },
  rendering: { text: "Making images", tone: "primary" },
  scheduled: { text: "Scheduled", tone: "good" },
  posting: { text: "Posting", tone: "primary" },
  posted: { text: "Posted", tone: "good" },
  failed: { text: "Failed", tone: "bad" },
  cancelled: { text: "Cancelled", tone: "muted" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { text: status, tone: "muted" as const };
  return <Badge tone={s.tone}>{s.text}</Badge>;
}

// ---------- Picking ----------

function Picking({
  view,
  date,
  onDone,
  onRestart,
}: {
  view: IgDayView;
  date: string;
  onDone: () => Promise<unknown>;
  onRestart: () => Promise<unknown>;
}) {
  const pickFn = useServerFn(pickIgWords);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const s = view.settings;
  const all = [...view.suggestions, ...view.reserve];
  const count = (lang: IgLang) =>
    chosen.filter((id) => all.find((w) => w.id === id)?.lang === lang).length;
  const need: Record<IgLang, number> = { en: s.pick_en, hi: s.pick_hi };
  const toggle = (w: IgWord) =>
    setChosen((c) =>
      c.includes(w.id)
        ? c.filter((x) => x !== w.id)
        : count(w.lang) >= need[w.lang]
          ? c
          : [...c, w.id],
    );
  const ready = count("en") === need.en && count("hi") === need.hi;
  const write = async () => {
    setSaving(true);
    try {
      await pickFn({ data: { date, ids: chosen } });
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the picks"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
        <span className="text-sm">
          English <b data-pick-count="en">{count("en")}</b>/{need.en} · Hindi{" "}
          <b data-pick-count="hi">{count("hi")}</b>/{need.hi}
        </span>
        <Button disabled={!ready || saving} onClick={() => void write()}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Write the cards
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void onRestart()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Suggest again
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["en", "hi"] as IgLang[]).map((lang) => (
          <section key={lang} className="space-y-2" aria-label={`${LANG_NAME[lang]} suggestions`}>
            <h2 className="font-semibold">{LANG_NAME[lang]} words</h2>
            {view.suggestions.filter((w) => w.lang === lang).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No {LANG_NAME[lang]} suggestions: the day may have no {LANG_NAME[lang]} articles.
              </p>
            )}
            {view.suggestions
              .filter((w) => w.lang === lang)
              .map((w) => (
                <WordChoice
                  key={w.id}
                  w={w}
                  on={chosen.includes(w.id)}
                  onToggle={() => toggle(w)}
                />
              ))}
            <OwnWord date={date} lang={lang} onAdded={onDone} />
            {view.reserve.some((w) => w.lang === lang) && (
              <details className="rounded-lg border border-border p-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Reserve: {view.reserve.filter((w) => w.lang === lang).length} words from earlier
                  days
                </summary>
                <div className="mt-2 space-y-2">
                  {view.reserve
                    .filter((w) => w.lang === lang)
                    .map((w) => (
                      <WordChoice
                        key={w.id}
                        w={w}
                        on={chosen.includes(w.id)}
                        onToggle={() => toggle(w)}
                      />
                    ))}
                </div>
              </details>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function WordChoice({ w, on, onToggle }: { w: IgWord; on: boolean; onToggle: () => void }) {
  return (
    <label
      data-word={w.word}
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${on ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <Checkbox
        checked={on}
        onCheckedChange={onToggle}
        aria-label={`Pick ${w.word}`}
        className="mt-1"
      />
      <div className="min-w-0 space-y-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-semibold">{w.word}</span>
          {w.pos_hint && <span className="text-muted-foreground">{w.pos_hint}</span>}
          {w.own && <Badge>Your word</Badge>}
          {w.status === "reserve" && <Badge>{igDate(w.day)}</Badge>}
        </div>
        {w.why && <p className="text-muted-foreground">{w.why}</p>}
        {w.sentence && (
          <p className="[&_mark]:rounded [&_mark]:bg-amber-200/70 [&_mark]:px-0.5 dark:[&_mark]:bg-amber-500/30">
            <span dangerouslySetInnerHTML={{ __html: `“${markWord(w.sentence, w.word)}”` }} />
            {w.paper && <span className="text-muted-foreground"> — {w.paper}</span>}
          </p>
        )}
      </div>
    </label>
  );
}

function OwnWord({
  date,
  lang,
  onAdded,
}: {
  date: string;
  lang: IgLang;
  onAdded: () => Promise<unknown>;
}) {
  const addFn = useServerFn(addOwnIgWord);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [sentence, setSentence] = useState("");
  const [paper, setPaper] = useState("");
  const add = async () => {
    try {
      await addFn({ data: { day: date, lang, word, sentence, paper } });
      setWord("");
      setSentence("");
      setPaper("");
      setOpen(false);
      await onAdded();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
    }
  };
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add your own {LANG_NAME[lang]} word
      </Button>
    );
  return (
    <div
      className="space-y-2 rounded-lg border border-border p-3"
      aria-label={`Your ${LANG_NAME[lang]} word`}
    >
      <Input
        placeholder="Word"
        aria-label="Your word"
        value={word}
        onChange={(e) => setWord(e.target.value)}
      />
      <Textarea
        placeholder="Its sentence from the news"
        aria-label="Its sentence"
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
      />
      <Input
        placeholder="Paper's name"
        aria-label="Paper"
        value={paper}
        onChange={(e) => setPaper(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={!word.trim()} onClick={() => void add()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------- Review ----------

function captionFor(view: IgDayView, date: string) {
  return fillCaption(view.settings.caption, {
    date: igDate(date, "long"),
    english: view.cards.filter((c) => c.lang === "en").map((c) => c.card?.word || c.word),
    hindi: view.cards.filter((c) => c.lang === "hi").map((c) => c.card?.word || c.word),
    appLink: playStoreUrl("words_in_news", "telegram_channel"),
    channel: channelLabel(view.settings.channel)
      ? `https://${channelLabel(view.settings.channel)}`
      : "",
  });
}

function Review({
  view,
  date,
  onChange,
}: {
  view: IgDayView;
  date: string;
  onChange: () => Promise<unknown>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const moveFn = useServerFn(moveIgCard);
  const move = async (id: string, by: -1 | 1) => {
    try {
      await moveFn({ data: { date, id, by } });
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't move it"));
    }
  };
  const designFn = useServerFn(setIgDesign);
  const approveFn = useServerFn(approveIgDay);
  const [caption, setCaption] = useState(() => view.day?.caption || captionFor(view, date));
  const [busy, setBusy] = useState(false);
  const design = (view.day?.design ?? "paper") as IgDesign;
  const unticked = view.cards.filter((c) => !c.checked);
  const writing = view.day?.status === "writing";
  const approve = async (now: boolean) => {
    setBusy(true);
    try {
      await approveFn({ data: { date, caption, now } });
      toast.success(
        now ? "Approved: posting as soon as the images are made" : "Approved and scheduled",
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
      <div className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ig-design">Today&apos;s design (all cards)</Label>
          <Select
            value={design}
            onValueChange={async (d) => {
              try {
                await designFn({ data: { date, design: d as IgDesign } });
                await onChange();
              } catch (e) {
                toast.error(errorText(e, "Couldn't change it"));
              }
            }}
          >
            <SelectTrigger id="ig-design" aria-label="Design">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IG_DESIGNS.map((d) => (
                <SelectItem key={d.key} value={d.key} disabled={d.key === view.yesterdayDesign}>
                  {d.name} — {d.note}
                  {d.key === view.yesterdayDesign ? " (yesterday)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {view.day?.design_reason && (
            <p className="text-xs text-muted-foreground">{view.day.design_reason}</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ig-caption">Caption</Label>
            <span
              className={`text-xs ${captionText(caption).length > CAPTION_MAX ? "text-destructive" : "text-muted-foreground"}`}
              data-caption-count
            >
              {captionText(caption).length}/{CAPTION_MAX}
            </span>
          </div>
          <Textarea
            id="ig-caption"
            rows={9}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{LINK_HINT}</p>
          <CaptionPreview caption={caption} />
          <Button variant="ghost" size="sm" onClick={() => setCaption(captionFor(view, date))}>
            Fill from the template again
          </Button>
        </div>
      </div>
      <section aria-label="Cards" className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Open a card to check it: each part on its own tab, the AI&apos;s notes beside it, and the
          card as it will look. The arrows change the order.
        </p>
        <div className="flex flex-wrap gap-4">
          {view.cards.map((c, i) => {
            const notes = c.checks.filter((x) => x.state === "open").length;
            const same = view.cards.filter((x) => x.lang === c.lang);
            const at = same.indexOf(c);
            return (
              <div key={c.id} className="w-[170px] space-y-1.5" data-card={c.word}>
                <button
                  type="button"
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open card ${i + 1}: ${c.card?.word || c.word}`}
                  onClick={() => setOpenId(c.id)}
                  disabled={!c.card}
                >
                  {c.card ? (
                    <CardPreview
                      card={c.card}
                      design={design}
                      n={i + 1}
                      total={view.cards.length}
                      date={date}
                      settings={view.settings}
                      width={170}
                    />
                  ) : (
                    <div className="flex h-[302px] w-[170px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Writing…
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-1 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {i + 1}. {c.card?.word || c.word}
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
                    aria-label={`Move ${c.word} earlier`}
                    disabled={at === 0}
                    onClick={() => void move(c.id, -1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    aria-label={`Move ${c.word} later`}
                    disabled={at === same.length - 1}
                    onClick={() => void move(c.id, 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
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
      {openId && view.cards.some((c) => c.id === openId) && (
        <IgCardEditor
          view={view}
          date={date}
          design={design}
          startId={openId}
          onClose={() => setOpenId(null)}
          onChange={onChange}
        />
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            disabled={
              busy || writing || unticked.length > 0 || captionText(caption).length > CAPTION_MAX
            }
            onClick={() => void approve(true)}
          >
            Approve & post now
          </Button>
          <Button
            disabled={
              busy || writing || unticked.length > 0 || captionText(caption).length > CAPTION_MAX
            }
            onClick={() => void approve(false)}
          >
            Approve & schedule for {view.settings.post_time} tomorrow
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
  view: IgDayView;
  date: string;
  onChange: () => Promise<unknown>;
}) {
  const nowFn = useServerFn(postIgNow);
  const cancelFn = useServerFn(cancelIgDay);
  const approveFn = useServerFn(approveIgDay);
  const d = view.day!;
  const act = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
        {d.status === "posted" ? (
          <span>Posted {d.posted_at ? timeIst(d.posted_at) : ""}.</span>
        ) : d.status === "failed" ? (
          <span className="text-destructive">Posting failed: {d.error}</span>
        ) : (
          <span>Posts {d.scheduled_for ? timeIst(d.scheduled_for) : "soon"}.</span>
        )}
        <div className="ml-auto flex gap-2">
          {d.status === "scheduled" && (
            <Button size="sm" onClick={() => void act(() => nowFn({ data: { date } }))}>
              Post now
            </Button>
          )}
          {d.status === "failed" && (
            <Button
              size="sm"
              onClick={() =>
                void act(() => approveFn({ data: { date, caption: d.caption, now: true } }))
              }
            >
              Try again
            </Button>
          )}
          {["scheduled", "rendering", "failed"].includes(d.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void act(() => cancelFn({ data: { date } }))}
            >
              Back to review
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {view.cards.map((c, i) =>
          c.image_url ? (
            <a key={c.id} href={c.image_url} target="_blank" rel="noreferrer">
              <img
                src={c.image_url}
                alt={`Card ${i + 1}: ${c.word}`}
                className="h-80 w-[180px] rounded-lg border border-border object-cover"
              />
            </a>
          ) : (
            c.card && (
              <CardPreview
                key={c.id}
                card={c.card}
                design={(d.design ?? "paper") as IgDesign}
                n={i + 1}
                total={view.cards.length}
                date={date}
                settings={view.settings}
                width={180}
              />
            )
          ),
        )}
      </div>
      {d.caption && <CaptionPreview caption={d.caption} />}
    </div>
  );
}

// A caption as Telegram shows it: its links as tappable words.
function CaptionPreview({
  caption,
  label = "Caption preview",
}: {
  caption: string;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm [overflow-wrap:anywhere] [&_a]:font-medium [&_a]:text-primary [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: captionHtml(caption) }}
    />
  );
}

const LINK_HINT =
  "A link: [Click here to download FlashGyan]({app_link}) shows the words, tappable.";

// ====================== Round-ups ======================

function Roundups() {
  const listFn = useServerFn(listIgWeeks);
  const previewFn = useServerFn(igWeekPreview);
  const postFn = useServerFn(postIgWeek);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["igWeeks"], queryFn: () => listFn() });
  const [preview, setPreview] = useState<{ to: string; html: string; caption: string } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const post = async (to: string) => {
    if (!confirm("Post this week's round-up PDF to the channel now?")) return;
    setBusy(to);
    try {
      await postFn({ data: { to } });
      toast.success("Posted");
      await qc.invalidateQueries({ queryKey: ["igWeeks"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't post it"));
      await qc.invalidateQueries({ queryKey: ["igWeeks"] });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every week the posted words go to the channel as one PDF to save and revise, on the day and
        at the time set in Settings. The monthly magazine has a “Words of the month” page with all
        of the month&apos;s words.
      </p>
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>
      ) : (
        <ul className="max-w-3xl space-y-2" aria-label="Weekly round-ups">
          {q.data!.map((w) => (
            <li
              key={w.to}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm"
              data-week={w.to}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {igDate(w.from, "long")} – {igDate(w.to, "long")}
                  {w.to >= istDate() && !w.status && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {w.to === istDate() ? "posts today" : "this week, still to come"}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {w.count} word{w.count === 1 ? "" : "s"}
                  {w.status === "posted" && w.at ? ` · posted ${timeIst(w.at)}` : ""}
                  {w.status === "failed" ? ` · failed: ${w.error ?? ""}` : ""}
                </p>
              </div>
              {w.status === "posted" ? (
                <Badge tone="good">Posted</Badge>
              ) : w.status === "failed" ? (
                <Badge tone="bad">Failed</Badge>
              ) : w.status === "posting" ? (
                <Badge tone="primary">Posting</Badge>
              ) : null}
              {w.url && (
                <a className="text-primary underline" href={w.url} target="_blank" rel="noreferrer">
                  PDF
                </a>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!w.count}
                onClick={async () => {
                  try {
                    const p = await previewFn({ data: { to: w.to } });
                    setPreview({ to: w.to, html: p.html, caption: p.caption });
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't make the preview"));
                  }
                }}
              >
                Preview
              </Button>
              <Button
                size="sm"
                disabled={!w.count || busy === w.to}
                onClick={() => void post(w.to)}
              >
                {busy === w.to && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {w.status === "posted" ? "Post again" : "Post now"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Round-up to {igDate(preview.to, "long")}</DialogTitle>
            </DialogHeader>
            <iframe
              title="The round-up PDF"
              srcDoc={preview.html.replace(
                "</style>",
                "body{padding:12mm 11mm;background:#fff;max-width:210mm;margin:auto}</style>",
              )}
              sandbox=""
              className="h-[60vh] w-full rounded-lg border border-border bg-white"
            />
            <CaptionPreview caption={preview.caption} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ====================== Posted words ======================

function History() {
  const listFn = useServerFn(igHistory);
  const releaseFn = useServerFn(releaseIgWord);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["igHistory", search],
    queryFn: () => listFn({ data: { search } }),
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every word posted. A posted word (in any of its forms) is never suggested again unless you
        allow it again here.
      </p>
      <Input
        placeholder="Search a word"
        aria-label="Search posted words"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>
      ) : !q.data?.length ? (
        <p className="text-muted-foreground">No words posted yet.</p>
      ) : (
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Word</th>
              <th>Language</th>
              <th>Posted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1.5 font-medium">{r.word}</td>
                <td>{LANG_NAME[r.lang]}</td>
                <td>{r.posted_on ? igDate(r.posted_on) : ""}</td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await releaseFn({ data: { id: r.id, release: r.status === "posted" } });
                        await qc.invalidateQueries({ queryKey: ["igHistory"] });
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't change it"));
                      }
                    }}
                  >
                    {r.status === "posted" ? "Allow again" : "Block again"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ====================== Settings ======================

function RoundupSettings({ s, set }: { s: IgSettings; set: (p: Partial<IgSettings>) => void }) {
  const sample = fillWeeklyCaption(s.weekly_caption, {
    from: igDate(shiftDate(istDate(), -6), "long"),
    to: igDate(istDate(), "long"),
    count: 7 * (s.pick_en + s.pick_hi),
    appLink: playStoreUrl("words_in_news_weekly", "telegram_channel"),
    channel: channelLabel(s.channel) ? `https://${channelLabel(s.channel)}` : "",
  });
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Round-ups">
      <h2 className="font-semibold">Round-ups</h2>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={s.weekly}
          onCheckedChange={(v) => set({ weekly: v })}
          aria-label="Weekly round-up"
        />
        Post the week&apos;s words as one PDF every week
      </label>
      {s.weekly && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Day</span>
            <Select
              value={String(s.weekly_day)}
              onValueChange={(v) => set({ weekly_day: Number(v) })}
            >
              <SelectTrigger className="w-40" aria-label="Round-up day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Time (India)</span>
            <Input
              type="time"
              aria-label="Round-up time"
              value={s.weekly_time}
              onChange={(e) => set({ weekly_time: e.target.value })}
              className="w-32"
            />
          </label>
        </div>
      )}
      {s.weekly && (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">
              Caption (fill-ins: <code>{"{from}"}</code> <code>{"{to}"}</code>{" "}
              <code>{"{count}"}</code> <code>{"{app_link}"}</code> <code>{"{channel}"}</code>)
            </span>
            <Textarea
              rows={8}
              aria-label="Round-up caption"
              value={s.weekly_caption}
              onChange={(e) => set({ weekly_caption: e.target.value })}
            />
            <span className="block text-xs text-muted-foreground">{LINK_HINT}</span>
          </label>
          <CaptionPreview caption={sample} label="Round-up caption preview" />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={s.monthly_page}
          onCheckedChange={(v) => set({ monthly_page: v })}
          aria-label="Words of the month page"
        />
        A “Words of the month” page in the monthly magazine
      </label>
    </section>
  );
}

function LearnSettings({ s, set }: { s: IgSettings; set: (p: Partial<IgSettings>) => void }) {
  const statsFn = useServerFn(igPickStats);
  const suggestFn = useServerFn(suggestIgPickRules);
  const stats = useQuery({ queryKey: ["igPickStats"], queryFn: () => statsFn() });
  const [ideas, setIdeas] = useState<Record<IgLang, { rule: string; example: string }[]>>({
    en: [],
    hi: [],
  });
  const [busy, setBusy] = useState<IgLang | null>(null);
  const [own, setOwn] = useState<Record<IgLang, string>>({ en: "", hi: "" });
  const rules = (lang: IgLang, list: string[]) =>
    set({ pick_rules: { ...s.pick_rules, [lang]: list.slice(0, PICK_RULES_MAX) } });
  return (
    <section
      className="space-y-3 rounded-xl border border-border p-4"
      aria-label="Learn from my picks"
    >
      <h2 className="font-semibold">Learn from my picks</h2>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={s.learn_from_picks}
          onCheckedChange={(v) => set({ learn_from_picks: v })}
          aria-label="Learn from my picks"
        />
        Show the AI the words I picked and passed over lately, so it suggests words like the ones I
        pick
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["en", "hi"] as IgLang[]).map((lang) => {
          const st = stats.data?.[lang];
          return (
            <div key={lang} className="space-y-2" aria-label={`${LANG_NAME[lang]} picking rules`}>
              <h3 className="text-sm font-semibold">{LANG_NAME[lang]} words</h3>
              {st && (
                <p className="text-xs text-muted-foreground">
                  Last 45 days: {st.chosen} picked and {st.passed} passed over on {st.days} day
                  {st.days === 1 ? "" : "s"}
                  {st.own ? `, ${st.own} added by you` : ""}.
                </p>
              )}
              <ul className="space-y-1">
                {s.pick_rules[lang].map((r) => (
                  <li key={r} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2 text-sm">
                    <span className="flex-1">{r}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove rule: ${r}`}
                      onClick={() =>
                        rules(
                          lang,
                          s.pick_rules[lang].filter((x) => x !== r),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (own[lang].trim().length >= 3) {
                    rules(lang, [...s.pick_rules[lang], own[lang].trim()]);
                    setOwn({ ...own, [lang]: "" });
                  }
                }}
              >
                <Input
                  placeholder="Your own rule, e.g. Prefer tatsam words with a clear viloma"
                  aria-label={`New ${LANG_NAME[lang]} rule`}
                  value={own[lang]}
                  onChange={(e) => setOwn({ ...own, [lang]: e.target.value })}
                />
                <Button type="submit" size="sm" variant="outline">
                  Add
                </Button>
              </form>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === lang}
                onClick={async () => {
                  setBusy(lang);
                  try {
                    const got = await suggestFn({ data: { lang } });
                    setIdeas({ ...ideas, [lang]: got });
                    if (!got.length) toast.info("No clear pattern in your picks yet");
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't suggest rules"));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === lang ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Suggest rules from my picks
              </Button>
              {ideas[lang].map((x) => (
                <div
                  key={x.rule}
                  className="space-y-1 rounded-lg border border-dashed border-primary/40 p-2 text-sm"
                  aria-label="Suggested rule"
                >
                  <p>{x.rule}</p>
                  {x.example && <p className="text-xs text-muted-foreground">e.g. {x.example}</p>}
                  <Button
                    size="sm"
                    onClick={() => {
                      rules(lang, [...s.pick_rules[lang], x.rule]);
                      setIdeas({ ...ideas, [lang]: ideas[lang].filter((y) => y.rule !== x.rule) });
                    }}
                  >
                    Add this rule
                  </Button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Rules are used from the next suggestions on, after you save.
      </p>
    </section>
  );
}

function Settings() {
  const getFn = useServerFn(getIgSettings);
  const saveFn = useServerFn(saveIgSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["igSettings"], queryFn: () => getFn() });
  const [s, setS] = useState<IgSettings | null>(null);
  const [lang, setLang] = useState<IgLang>("en");
  useEffect(() => {
    if (q.data && !s) setS(q.data);
  }, [q.data, s]);
  if (q.isLoading || !s) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const set = (patch: Partial<IgSettings>) => setS({ ...s, ...patch });
  const dirty = JSON.stringify(s) !== JSON.stringify(q.data);
  const save = async () => {
    try {
      const next = await saveFn({
        data: { ...s, weekly_app_link: playStoreUrl("words_in_news_weekly", "telegram_channel") },
      });
      qc.setQueryData(["igSettings"], next);
      setS(next);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const sampleCaption = fillCaption(s.caption, {
    date: igDate(istDate(), "long"),
    english: ["Belligerent", "Eradicate", "Apprehend", "Meticulously", "Conviction"].slice(
      0,
      s.pick_en,
    ),
    hindi: ["अतिक्रमण", "आत्मनिर्भर", "प्रत्यर्पण", "संकल्प", "उन्मूलन"].slice(0, s.pick_hi),
    appLink: playStoreUrl("words_in_news", "telegram_channel"),
    channel: channelLabel(s.channel) ? `https://${channelLabel(s.channel)}` : "",
  });
  const num = (label: string, key: keyof IgSettings, min: number, max: number) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={Number(s[key])}
        onChange={(e) =>
          set({
            [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)),
          } as Partial<IgSettings>)
        }
        className="w-24"
      />
    </label>
  );
  return (
    <div className="space-y-6 pb-20">
      <section
        className="space-y-3 rounded-xl border border-border p-4"
        aria-label="Channel and timing"
      >
        <h2 className="font-semibold">Channel and timing</h2>
        <label className="block max-w-md space-y-1 text-sm">
          <span className="font-medium">Telegram channel link</span>
          <Input
            placeholder="https://t.me/yourchannel or @yourchannel"
            aria-label="Channel link"
            value={s.channel}
            onChange={(e) => set({ channel: e.target.value })}
          />
          <span
            className={`text-xs ${s.channel && !channelChatId(s.channel) ? "text-destructive" : "text-muted-foreground"}`}
          >
            {s.channel && !channelChatId(s.channel)
              ? "That doesn't look like a channel link."
              : "The bot must be an admin of the channel. The card footer shows this link."}
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Posting time (India), the day after the news</span>
          <Input
            type="time"
            aria-label="Posting time"
            value={s.post_time}
            onChange={(e) => set({ post_time: e.target.value })}
            className="w-32"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          {num("English suggestions", "suggest_en", 1, 20)}
          {num("Hindi suggestions", "suggest_hi", 1, 20)}
          {num("English cards", "pick_en", 0, 10)}
          {num("Hindi cards", "pick_hi", 0, 10)}
        </div>
        {s.pick_en + s.pick_hi > 10 && (
          <p className="text-sm text-destructive">A Telegram album holds at most 10 cards.</p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={s.auto_suggest}
            onCheckedChange={(v) => set({ auto_suggest: v })}
            aria-label="Suggest automatically"
          />
          Suggest words on their own after the evening collection
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={s.notify}
            onCheckedChange={(v) => set({ notify: v })}
            aria-label="Telegram messages"
          />
          Message me on Telegram when words are suggested and when cards are ready (the admin chat
          in Magazine settings)
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Caption">
        <h2 className="font-semibold">Caption</h2>
        <p className="text-sm text-muted-foreground">
          Sent with the album. Fill-ins:{" "}
          {CAPTION_FIELDS.map(([k, what]) => (
            <span key={k} className="mr-2 whitespace-nowrap">
              <code className="rounded bg-muted px-1">{k}</code> {what}
            </span>
          ))}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Textarea
            rows={12}
            aria-label="Caption template"
            value={s.caption}
            onChange={(e) => set({ caption: e.target.value })}
          />
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Preview</span>
              <span
                className={
                  captionText(sampleCaption).length > CAPTION_MAX ? "text-destructive" : ""
                }
              >
                {captionText(sampleCaption).length}/{CAPTION_MAX}
              </span>
            </div>
            <CaptionPreview caption={sampleCaption} />
          </div>
        </div>
      </section>

      <RoundupSettings s={s} set={set} />
      <LearnSettings s={s} set={set} />

      <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Designs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Designs</h2>
          <div className="flex gap-1">
            {(["en", "hi"] as IgLang[]).map((l) => (
              <Button
                key={l}
                size="sm"
                variant={lang === l ? "default" : "outline"}
                onClick={() => setLang(l)}
              >
                {LANG_NAME[l]} sample
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The AI chooses one design a day for all the cards, never yesterday&apos;s, from the ones
          switched on.
        </p>
        <label className="block max-w-sm space-y-1 text-sm">
          <span className="font-medium">Watermark strength: {s.watermark}%</span>
          <input
            type="range"
            min={0}
            max={30}
            value={s.watermark}
            aria-label="Watermark strength"
            onChange={(e) => set({ watermark: Number(e.target.value) })}
            className="w-full"
          />
          <span className="text-xs text-muted-foreground">0 turns the large faint “F” off.</span>
        </label>
        <div className="flex flex-wrap gap-4">
          {IG_DESIGNS.map((d) => {
            const on = s.designs.includes(d.key);
            return (
              <div
                key={d.key}
                className={`space-y-2 ${on ? "" : "opacity-50"}`}
                data-design={d.key}
              >
                <CardPreview
                  card={IG_SAMPLES[lang]}
                  design={d.key}
                  n={1}
                  total={10}
                  date={istDate()}
                  settings={s}
                  width={170}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={on}
                    aria-label={`Use ${d.name}`}
                    onCheckedChange={(v) =>
                      set({
                        designs: v
                          ? [...s.designs, d.key]
                          : s.designs.length > 1
                            ? s.designs.filter((x) => x !== d.key)
                            : s.designs,
                      })
                    }
                  />
                  <span>
                    <b>{d.name}</b>
                    <span className="block text-xs text-muted-foreground">{d.note}</span>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-end gap-2 border-t border-border bg-background/95 p-3 backdrop-blur lg:left-64">
        {dirty && (
          <span className="self-center text-sm text-muted-foreground">Unsaved changes</span>
        )}
        <Button disabled={!dirty} onClick={() => void save()}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
