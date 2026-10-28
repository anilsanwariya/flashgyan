// Infographics, "Words in the News": the day's words picked from the AI's
// suggestions (and the reserve), the written cards proofread and ticked,
// the day's design and caption, and the album scheduled for the channel.
// Settings hold the designs, caption template, channel and posting time;
// History lists every word posted, which never comes back.
import { useEffect, useMemo, useRef, useState } from "react";
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
  pickIgWords,
  postIgNow,
  recheckIgCard,
  releaseIgWord,
  saveIgCard,
  saveIgSettings,
  setIgCheck,
  setIgChecked,
  setIgDesign,
  startIgDay,
  swapIgWord,
  type IgDayView,
  type IgWord,
} from "@/lib/ig.functions";
import {
  IG_DESIGNS,
  IG_SAMPLES,
  igCardHtml,
  igDate,
  markWord,
  type IgCard,
  type IgDesign,
  type IgLang,
} from "@/lib/ig-cards";
import {
  CAPTION_FIELDS,
  CAPTION_MAX,
  FIELD_NAMES,
  channelChatId,
  channelLabel,
  fillCaption,
  type IgCheck,
  type IgSettings,
} from "@/lib/ig-words";
import { istDate } from "@/lib/current-affairs";
import { playStoreUrl } from "@/lib/app-promo";
import { Badge, PageTabs, errorText, useUrlTab } from "@/components/ca-ui";
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

const TABS = ["today", "history", "settings"] as const;
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

const site = () => (typeof window === "undefined" ? "" : window.location.origin);

export function InfographicsPanel() {
  const [tab, setTab] = useUrlTab(TABS, "today");
  return (
    <div className="space-y-4">
      <PageTabs<Tab>
        label="Infographics"
        tabs={[
          { id: "today", label: "Day" },
          { id: "history", label: "Posted words" },
          { id: "settings", label: "Settings" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "today" && <DayView />}
      {tab === "history" && <History />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

// ====================== A card's picture ======================

export function CardPreview({
  card,
  design,
  n,
  total,
  date,
  settings,
  width = 270,
}: {
  card: IgCard;
  design: IgDesign;
  n: number;
  total: number;
  date: string;
  settings: Pick<IgSettings, "channel" | "watermark">;
  width?: number;
}) {
  const html = useMemo(
    () =>
      igCardHtml(card, {
        design,
        n,
        total,
        date,
        channel: channelLabel(settings.channel),
        assetBase: site(),
        watermark: settings.watermark,
      }),
    [card, design, n, total, date, settings.channel, settings.watermark],
  );
  const scale = width / 1080;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-border bg-muted shadow-sm"
      style={{ width, height: 1920 * scale }}
    >
      <iframe
        title={`Card ${n}: ${card.word}`}
        srcDoc={html}
        sandbox="allow-scripts"
        className="pointer-events-none origin-top-left border-0"
        style={{ width: 1080, height: 1920, transform: `scale(${scale})` }}
      />
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
  const [openId, setOpenId] = useState<string | null>(view.cards[0]?.id ?? null);
  const designFn = useServerFn(setIgDesign);
  const approveFn = useServerFn(approveIgDay);
  const [caption, setCaption] = useState(() => view.day?.caption || captionFor(view, date));
  const [busy, setBusy] = useState(false);
  const design = (view.day?.design ?? "paper") as IgDesign;
  const open = view.cards.find((c) => c.id === openId) ?? view.cards[0];
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
              className={`text-xs ${caption.length > CAPTION_MAX ? "text-destructive" : "text-muted-foreground"}`}
              data-caption-count
            >
              {caption.length}/{CAPTION_MAX}
            </span>
          </div>
          <Textarea
            id="ig-caption"
            rows={9}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <Button variant="ghost" size="sm" onClick={() => setCaption(captionFor(view, date))}>
            Fill from the template again
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <nav aria-label="Cards" className="flex gap-2 overflow-x-auto lg:w-56 lg:flex-col">
          {view.cards.map((c, i) => {
            const notes = c.checks.filter((x) => x.state === "open").length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenId(c.id)}
                aria-current={open?.id === c.id}
                className={`flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${open?.id === c.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <span>
                  {i + 1}. {c.card?.word || c.word}{" "}
                  <span className="text-xs text-muted-foreground">
                    {c.lang === "en" ? "EN" : "HI"}
                  </span>
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
              </button>
            );
          })}
        </nav>
        {open && (
          <CardEditor
            key={`${open.id}:${open.card ? "y" : "n"}:${open.proofed}`}
            w={open}
            n={view.cards.indexOf(open) + 1}
            view={view}
            date={date}
            design={design}
            onChange={onChange}
          />
        )}
      </div>
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
            disabled={busy || writing || unticked.length > 0 || caption.length > CAPTION_MAX}
            onClick={() => void approve(true)}
          >
            Approve & post now
          </Button>
          <Button
            disabled={busy || writing || unticked.length > 0 || caption.length > CAPTION_MAX}
            onClick={() => void approve(false)}
          >
            Approve & schedule for {view.settings.post_time} tomorrow
          </Button>
        </div>
      </div>
    </div>
  );
}

const csv = (xs: string[]) => xs.join(", ");
const fromCsv = (s: string) =>
  s
    .split(/[,،]/)
    .map((x) => x.trim())
    .filter(Boolean);

function CardEditor({
  w,
  n,
  view,
  date,
  design,
  onChange,
}: {
  w: IgWord;
  n: number;
  view: IgDayView;
  date: string;
  design: IgDesign;
  onChange: () => Promise<unknown>;
}) {
  const saveFn = useServerFn(saveIgCard);
  const checkFn = useServerFn(setIgCheck);
  const tickFn = useServerFn(setIgChecked);
  const recheckFn = useServerFn(recheckIgCard);
  const swapFn = useServerFn(swapIgWord);
  const [card, setCard] = useState<IgCard | null>(w.card);
  const [checks, setChecks] = useState<IgCheck[]>(w.checks);
  const [dirty, setDirty] = useState(false);
  if (!card)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> The card for “{w.word}” is being written…
      </p>
    );
  const set = (patch: Partial<IgCard>) => {
    setCard({ ...card, ...patch });
    setDirty(true);
  };
  const save = async () => {
    try {
      await saveFn({ data: { id: w.id, card } });
      setDirty(false);
      if (w.checked) await tickFn({ data: { id: w.id, checked: false } });
      await onChange();
      toast.success("Saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  const decide = async (c: IgCheck, state: IgCheck["state"]) => {
    try {
      if (dirty) await saveFn({ data: { id: w.id, card } });
      const next = await checkFn({ data: { id: w.id, check: c.id, state } });
      setCard(next.card);
      setChecks(next.checks);
      setDirty(false);
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    }
  };
  const open = checks.filter((c) => c.state === "open");
  const others = [...view.suggestions, ...view.reserve].filter((x) => x.lang === w.lang);
  const field = (label: string, key: keyof IgCard, multiline = false) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {multiline ? (
        <Textarea
          rows={2}
          value={String(card[key] ?? "")}
          onChange={(e) => set({ [key]: e.target.value } as Partial<IgCard>)}
        />
      ) : (
        <Input
          value={String(card[key] ?? "")}
          onChange={(e) => set({ [key]: e.target.value } as Partial<IgCard>)}
        />
      )}
    </label>
  );
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        {!w.proofed && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Proofreading…
          </p>
        )}
        {open.length > 0 && (
          <section
            className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
            aria-label="Notes"
          >
            <h3 className="text-sm font-semibold">Notes to decide ({open.length})</h3>
            {open.map((c) => (
              <div
                key={c.id}
                className="space-y-1 rounded-lg bg-background p-2 text-sm"
                data-check={c.source}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={c.source === "ai" ? "primary" : "muted"}>
                    {c.source === "ai" ? "AI" : "Dictionary"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{FIELD_NAMES[c.field]}</span>
                </div>
                {(c.text || c.fix) && (
                  <p>
                    {c.text && <span className="text-destructive line-through">{c.text}</span>}
                    {c.text && c.fix && " → "}
                    {c.fix && (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {c.fix}
                      </span>
                    )}
                    {c.text && !c.fix && <span className="text-muted-foreground"> (remove)</span>}
                  </p>
                )}
                <p className="text-muted-foreground">{c.why}</p>
                <div className="flex gap-2">
                  {c.field !== "news" && (c.fix || c.text) && (
                    <Button size="sm" onClick={() => void decide(c, "accepted")}>
                      Accept
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void decide(c, "ignored")}>
                    Ignore
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Word", "word")}
          {field(w.lang === "en" ? "Part of speech" : "शब्द-भेद", "pos")}
          {field(w.lang === "en" ? "Say it (Devanagari)" : "In Roman letters", "say")}
          {w.lang === "en" && field("IPA", "ipa")}
          {field(w.lang === "en" ? "Hindi meaning (big)" : "अर्थ (big)", "main", true)}
          {field(w.lang === "en" ? "English meaning" : "English word", "sub", true)}
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <span className="font-medium">From the news</span> ({card.paper || "paper"}): “{card.news}
          ”
        </div>
        {w.lang === "en" && field("News line in Hindi", "newsHi", true)}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">
              {w.lang === "en" ? "Synonyms" : "पर्यायवाची"} (commas)
            </span>
            <Input
              value={csv(card.synonyms)}
              onChange={(e) => set({ synonyms: fromCsv(e.target.value) })}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{w.lang === "en" ? "Antonyms" : "विलोम"} (commas)</span>
            <Input
              value={csv(card.antonyms)}
              onChange={(e) => set({ antonyms: fromCsv(e.target.value) })}
            />
          </label>
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <Input
              aria-label={`Tip ${i + 1} title`}
              placeholder="Tip title"
              value={card.extras[i]?.title ?? ""}
              onChange={(e) => {
                const extras = [...card.extras];
                extras[i] = { title: e.target.value, text: extras[i]?.text ?? "" };
                set({ extras });
              }}
            />
            <Input
              aria-label={`Tip ${i + 1}`}
              placeholder="Tip (**bold**, ~~struck~~)"
              value={card.extras[i]?.text ?? ""}
              onChange={(e) => {
                const extras = [...card.extras];
                extras[i] = { title: extras[i]?.title ?? "", text: e.target.value };
                set({ extras: extras.filter((x) => x.title || x.text) });
              }}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!dirty} onClick={() => void save()}>
            Save changes
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                if (dirty) await saveFn({ data: { id: w.id, card } });
                await recheckFn({ data: { date, id: w.id } });
                await onChange();
              } catch (e) {
                toast.error(errorText(e, "Couldn't do it"));
              }
            }}
          >
            Proofread again
          </Button>
          {others.length > 0 && (
            <Select
              onValueChange={async (to) => {
                try {
                  await swapFn({ data: { date, from: w.id, to } });
                  await onChange();
                } catch (e) {
                  toast.error(errorText(e, "Couldn't swap"));
                }
              }}
            >
              <SelectTrigger className="w-56" aria-label="Swap for another word">
                <SelectValue placeholder="Swap for another word…" />
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.word}
                    {o.status === "reserve" ? ` (reserve, ${igDate(o.day)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
          <Checkbox
            checked={w.checked}
            disabled={!w.proofed || open.length > 0 || dirty}
            aria-label="Checked"
            onCheckedChange={async (v) => {
              try {
                await tickFn({ data: { id: w.id, checked: v === true } });
                await onChange();
              } catch (e) {
                toast.error(errorText(e, "Couldn't tick it"));
              }
            }}
          />
          <span>
            <b>Checked</b> — I have read this card and it is ready to post
            {open.length > 0 && (
              <span className="text-muted-foreground"> (decide the notes first)</span>
            )}
            {dirty && <span className="text-muted-foreground"> (save first)</span>}
          </span>
        </label>
      </div>
      <CardPreview
        card={card}
        design={design}
        n={n}
        total={view.cards.length}
        date={date}
        settings={view.settings}
        width={300}
      />
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
      {d.caption && (
        <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm [overflow-wrap:anywhere]">
          {d.caption}
        </pre>
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
      const next = await saveFn({ data: s });
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
              <span className={sampleCaption.length > CAPTION_MAX ? "text-destructive" : ""}>
                {sampleCaption.length}/{CAPTION_MAX}
              </span>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm [overflow-wrap:anywhere]">
              {sampleCaption}
            </pre>
          </div>
        </div>
      </section>

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
