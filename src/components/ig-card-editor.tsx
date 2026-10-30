// The card editor for Words in the News: one card on a page of its own,
// like the magazine's story editor and the notes' topic editor. A tab for
// each part (the word, its meanings, the news line, synonyms and antonyms,
// tips, proofreading), each editable in place and written again by the AI
// on request; the news line can be swapped for another line of the same
// article or written again from it. The card beside it changes as you
// type, the previous or next card is a tap away, changes save as you go,
// and earlier versions are kept.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookA,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  History,
  Lightbulb,
  ListChecks,
  MoreHorizontal,
  Newspaper,
  Plus,
  RefreshCw,
  Repeat,
  Shapes,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import {
  igCardAids,
  recheckIgCard,
  restoreIgVersion,
  rewriteIgPart,
  saveIgCard,
  setIgCheck,
  setIgChecked,
  swapIgWord,
  type IgDayView,
  type IgWord,
} from "@/lib/ig.functions";
import {
  formPos,
  igDate,
  igMarkup,
  markWord,
  type IgCard,
  type IgDesign,
  type IgForm,
} from "@/lib/ig-cards";
import { FIELD_NAMES, PART_OF_FIELD, type IgCheck, type IgPart } from "@/lib/ig-words";
import { CardPreview } from "@/components/ig-card-preview";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TabId = IgPart | "notes" | "preview";

const TABS: { id: TabId; label: string; icon: typeof Type }[] = [
  { id: "preview", label: "Card", icon: Eye },
  { id: "say", label: "Word", icon: Type },
  { id: "meaning", label: "Meaning", icon: BookA },
  { id: "sentence", label: "News line", icon: Newspaper },
  { id: "words", label: "Synonyms & antonyms", icon: Repeat },
  { id: "forms", label: "Forms & phrases", icon: Shapes },
  { id: "tips", label: "Tips", icon: Lightbulb },
  { id: "notes", label: "Proofreading", icon: ListChecks },
];

const TIP_TITLES = {
  en: ["Root", "Memory trick", "Don't confuse"],
  hi: ["शब्द-रचना", "संधि-विच्छेद", "समास", "वर्तनी सावधान"],
};

const SENTENCE_ASKS = {
  en: ["Simpler", "Shorter", "More like an exam sentence", "Closer to the paper's words"],
  hi: ["सरल भाषा में", "छोटा", "परीक्षा जैसा वाक्य", "अख़बार के शब्दों के करीब"],
};

export function IgCardEditor({
  view,
  date,
  design,
  startId,
  onClose,
  onChange,
}: {
  view: IgDayView;
  date: string;
  design: IgDesign;
  startId: string;
  onClose: () => void;
  onChange: () => Promise<unknown>;
}) {
  const saveFn = useServerFn(saveIgCard);
  const aidsFn = useServerFn(igCardAids);
  const tickFn = useServerFn(setIgChecked);
  const recheckFn = useServerFn(recheckIgCard);
  const [id, setId] = useState(startId);
  const [tab, setTab] = useState<TabId>("preview");
  const [card, setCard] = useState<IgCard | null>(null);
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [swap, setSwap] = useState(false);
  const sent = useRef("");
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const main = useRef<HTMLElement>(null);

  const cards = view.cards;
  const at = cards.findIndex((c) => c.id === id);
  const w = cards[at];
  const prev = cards[at - 1];
  const next = cards[at + 1];
  const aids = useQuery({
    queryKey: ["igCardAids", id],
    queryFn: () => aidsFn({ data: { id } }),
  });

  // The card from the server when another card is opened (or it is written).
  useEffect(() => {
    if (w?.card && (!card || sent.current === "")) {
      setCard(w.card);
      sent.current = JSON.stringify(w.card);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, w?.card]);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab, id]);

  // Saves the card (one save at a time, in order). A label keeps the card
  // as it was as a version first (before an AI change).
  const push = (next: IgCard, label?: string) => {
    const json = JSON.stringify(next);
    if (json === sent.current && !label) return chain.current;
    sent.current = json;
    setSaving((n) => n + 1);
    const cardId = id;
    chain.current = chain.current.then(async () => {
      try {
        await saveFn({ data: { id: cardId, card: next, ...(label ? { label } : {}) } });
        setSavedAt(new Date());
        setSaveError(null);
        await onChange();
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
    if (!card) return;
    const t = setTimeout(() => void push(card), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);
  const flush = async () => {
    if (card) await push(card);
    await chain.current;
  };
  const go = (to: string) =>
    void flush().then(() => {
      sent.current = "";
      setCard(null);
      setId(to);
    });
  const leave = () => void flush().then(onClose);
  const set = (patch: Partial<IgCard>) => card && setCard({ ...card, ...patch });
  // A change from the AI or a restore: saved at once, the card before kept.
  const keep = async (patch: Partial<IgCard>, label: string) => {
    if (!card) return;
    const nextCard = { ...card, ...patch };
    setCard(nextCard);
    await push(nextCard, label);
    await aids.refetch();
  };
  // The card as the server has it now (after a note was accepted).
  const replace = (c: IgCard) => {
    setCard(c);
    sent.current = JSON.stringify(c);
  };

  // Alt+N / Alt+P: next or previous card; Alt+1…7: a tab.
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const digit = /^Digit(\d)$/.exec(e.code)?.[1];
    const t = digit ? TABS[Number(digit) - 1] : undefined;
    if (e.code === "KeyN" && next) go(next.id);
    else if (e.code === "KeyP" && prev) go(prev.id);
    else if (t) setTab(t.id);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const openChecks = (w?.checks ?? []).filter((c) => c.state === "open");
  const notesIn = (part: TabId) =>
    part === "notes"
      ? openChecks.length
      : openChecks.filter((c) => PART_OF_FIELD[c.field] === part).length;
  const lang = w?.lang ?? "en";

  return (
    <Dialog open onOpenChange={(o) => !o && leave()}>
      <DialogContent
        aria-describedby={undefined}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        <header className="border-b border-border bg-background">
          <div className="flex items-start gap-2 p-2 pr-12 sm:pl-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                Card {at + 1} of {cards.length} · {lang === "en" ? "English" : "Hindi"} · news of{" "}
                {igDate(date)}
              </p>
              <DialogTitle className="truncate text-base font-semibold leading-snug">
                {card?.word || w?.word}
              </DialogTitle>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={!card} onSelect={() => setHistory(true)}>
                  <History className="mr-2 h-4 w-4" /> Earlier versions
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!card}
                  onSelect={async () => {
                    try {
                      await flush();
                      await recheckFn({ data: { date, id } });
                      await onChange();
                      setTab("notes");
                    } catch (e) {
                      toast.error(errorText(e, "Couldn't do it"));
                    }
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Proofread again
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSwap(true)}>
                  <Repeat className="mr-2 h-4 w-4" /> Swap for another word…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 sm:px-4">
            {w?.checked ? (
              <Badge tone="good">Checked</Badge>
            ) : (
              <Badge tone="primary">To check</Badge>
            )}
            {w && !w.proofed ? (
              <span role="status" className="flex items-center gap-1.5 text-xs text-primary">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Proofreading…
              </span>
            ) : openChecks.length ? (
              <Badge tone="warn">{openChecks.length} notes to decide</Badge>
            ) : (
              <Badge tone="good">No open notes</Badge>
            )}
            {card?.rewritten ? (
              <Badge>News line rewritten</Badge>
            ) : (
              <Badge>News line quoted from {card?.paper || "the paper"}</Badge>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav
            aria-label="Parts of the card"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1.5 lg:w-56 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-2"
          >
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const on = tab === t.id;
              const n = notesIn(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={`${t.label} (Alt+${i + 1})`}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{t.label}</span>
                  {n > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[11px] ${on ? "bg-primary-foreground/20" : "bg-amber-500/20 text-amber-700 dark:text-amber-400"}`}
                      aria-label={`${n} notes`}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl space-y-4 p-3 pb-24 sm:p-5" key={id}>
              {!w ? (
                <p className="text-sm text-muted-foreground">This card is no longer in the set.</p>
              ) : !card ? (
                <p className="text-sm text-muted-foreground">The card is being written…</p>
              ) : tab === "preview" ? (
                <div className="space-y-3">
                  {/* As large as fits the screen without scrolling. */}
                  <div
                    className="mx-auto w-full"
                    style={{ maxWidth: "min(420px, calc((100dvh - 17rem) * 9 / 16))" }}
                  >
                    <CardPreview
                      card={card}
                      design={design}
                      n={at + 1}
                      total={cards.length}
                      date={date}
                      settings={view.settings}
                      width="fill"
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Open a part above to change it.
                    {openChecks.length > 0 && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => setTab("notes")}
                        >
                          Decide the {openChecks.length} note
                          {openChecks.length === 1 ? "" : "s"}
                        </button>
                      </>
                    )}
                  </p>
                </div>
              ) : tab === "notes" ? (
                <NotesTab w={w} onCard={replace} onChange={onChange} />
              ) : (
                <>
                  <NotesTab w={w} only={tab} onCard={replace} onChange={onChange} />
                  {["say", "meaning", "words", "forms"].includes(tab) && (
                    <WebCheck word={card.word || w.word} lang={lang} />
                  )}
                  {tab === "say" && <WordTab card={card} set={set} keep={keep} id={id} />}
                  {tab === "meaning" && (
                    <>
                      <MeaningTab card={card} set={set} keep={keep} id={id} />
                      <DictionaryBox card={card} dict={aids.data?.dictionary} />
                    </>
                  )}
                  {tab === "sentence" && (
                    <SentenceTab
                      card={card}
                      set={set}
                      keep={keep}
                      id={id}
                      sentences={aids.data?.sentences ?? []}
                      original={aids.data?.original ?? ""}
                    />
                  )}
                  {tab === "words" && (
                    <WordsTab
                      card={card}
                      set={set}
                      keep={keep}
                      id={id}
                      wordnet={aids.data?.wordnet}
                    />
                  )}
                  {tab === "words" && (
                    <DictionaryBox card={card} dict={aids.data?.dictionary} words />
                  )}
                  {tab === "forms" && (
                    <FormsTab
                      card={card}
                      set={set}
                      keep={keep}
                      id={id}
                      ideas={aids.data?.dictionary.forms ?? []}
                    />
                  )}
                  {tab === "tips" && <TipsTab card={card} set={set} keep={keep} id={id} />}
                </>
              )}
            </div>
          </main>
          {card && tab !== "preview" && (
            <aside
              aria-label="The card"
              className="hidden shrink-0 flex-col items-center gap-2 overflow-y-auto border-l border-border bg-muted/20 p-3 lg:flex"
            >
              <CardPreview
                card={card}
                design={design}
                n={at + 1}
                total={cards.length}
                date={date}
                settings={view.settings}
                width={340}
              />
            </aside>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-background px-2 py-2 sm:px-4">
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${w?.checked ? "border-current bg-muted/60 font-medium text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}`}
            title={openChecks.length ? "Decide the notes first" : undefined}
          >
            <Checkbox
              checked={!!w?.checked}
              disabled={!w?.proofed || openChecks.length > 0 || saving > 0}
              aria-label="Checked"
              onCheckedChange={async (v) => {
                try {
                  await flush();
                  await tickFn({ data: { id, checked: v === true } });
                  await onChange();
                } catch (e) {
                  toast.error(errorText(e, "Couldn't tick it"));
                }
              }}
            />
            <Check className="hidden h-3.5 w-3.5 sm:block" /> Checked
          </label>
          {openChecks.length > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Decide the {openChecks.length} note{openChecks.length === 1 ? "" : "s"} first
            </span>
          )}
          <span className="flex-1" />
          <div className="flex items-center gap-1" role="group" aria-label="Cards">
            {[
              { to: prev, label: "Previous card", key: "Alt+P", Icon: ChevronLeft },
              { to: next, label: "Next card", key: "Alt+N", Icon: ChevronRight },
            ].map(({ to, label, key: k, Icon }) => (
              <Button
                key={label}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={label}
                title={`${label}${to ? `: ${to.card?.word || to.word}` : ""} (${k})`}
                disabled={!to}
                onClick={() => to && go(to.id)}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <span
            role="status"
            className={`min-w-0 text-right text-xs ${saveError ? "text-destructive" : "hidden text-muted-foreground sm:inline"}`}
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
        {history && card && (
          <HistoryDialog
            id={id}
            versions={aids.data?.versions ?? []}
            onClose={() => setHistory(false)}
            flush={flush}
            onRestored={async (c) => {
              replace(c);
              setHistory(false);
              await aids.refetch();
              await onChange();
            }}
          />
        )}
        {swap && w && (
          <SwapDialog
            w={w}
            view={view}
            date={date}
            onClose={() => setSwap(false)}
            onSwapped={async () => {
              setSwap(false);
              await onChange();
              toast.success("Swapped: the new word's card is being written");
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type TabProps = {
  id: string;
  card: IgCard;
  set: (patch: Partial<IgCard>) => void;
  keep: (patch: Partial<IgCard>, label: string) => Promise<void>;
};

function Field({
  label,
  value,
  onChange,
  rows,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {rows ? (
        <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
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

// "Write again with AI" for one part: what the AI wrote is shown first and
// used only when the editor chooses.
function PartAI({
  id,
  part,
  keep,
  show,
}: {
  id: string;
  part: Exclude<IgPart, "sentence">;
  keep: TabProps["keep"];
  show: (patch: Partial<IgCard>) => React.ReactNode;
}) {
  const rewriteFn = useServerFn(rewriteIgPart);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<Partial<IgCard> | null>(null);
  const ask = async () => {
    setBusy(true);
    try {
      const out = await rewriteFn({ data: { id, part, note } });
      if ("patch" in out) setGot(out.patch);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write it"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="space-y-2 rounded-xl border border-dashed border-primary/40 p-3"
      aria-label="Write again with AI"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-0 flex-1"
          placeholder="What to change (optional)"
          aria-label="What to change"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void ask()}>
          {busy ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          Write again with AI
        </Button>
      </div>
      {got && (
        <div
          className="space-y-2 rounded-lg bg-primary/5 p-3 text-sm"
          aria-label="The AI's version"
        >
          {show(got)}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await keep(got, "Before the AI wrote a part again");
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

const line = (label: string, v: string | undefined) =>
  v ? (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      <span dangerouslySetInnerHTML={{ __html: igMarkup(v) }} />
    </p>
  ) : null;

function WordTab({ card, set, keep, id }: TabProps) {
  const en = card.lang === "en";
  return (
    <Section
      title="The word"
      hint="The word as it heads the card, its part of speech and how to say it."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Word" value={card.word} onChange={(v) => set({ word: v })} />
        <Field
          label={en ? "Part of speech" : "शब्द-भेद"}
          value={card.pos}
          onChange={(v) => set({ pos: v })}
          hint={en ? "As “Adjective · विशेषण”" : "As “संज्ञा (पुल्लिंग) · तत्सम”"}
        />
        <Field
          label={en ? "Say it (Devanagari)" : "In Roman letters"}
          value={card.say}
          onChange={(v) => set({ say: v })}
        />
        {en && <Field label="IPA" value={card.ipa} onChange={(v) => set({ ipa: v })} />}
      </div>
      <PartAI
        id={id}
        part="say"
        keep={keep}
        show={(p) => (
          <>
            {line("Word", p.word)}
            {line("Part of speech", p.pos)}
            {line("Say it", p.say)}
            {line("IPA", p.ipa)}
          </>
        )}
      />
    </Section>
  );
}

function MeaningTab({ card, set, keep, id }: TabProps) {
  const en = card.lang === "en";
  return (
    <Section
      title="Meaning"
      hint="The big line is what a student reads first: the meaning in the sense the news uses."
    >
      <Field
        label={en ? "Hindi meaning (big)" : "अर्थ (big)"}
        rows={2}
        value={card.main}
        onChange={(v) => set({ main: v })}
      />
      <Field
        label={en ? "English meaning" : "English word"}
        rows={2}
        value={card.sub}
        onChange={(v) => set({ sub: v })}
      />
      <PartAI
        id={id}
        part="meaning"
        keep={keep}
        show={(p) => (
          <>
            {line(en ? "Hindi meaning" : "अर्थ", p.main)}
            {line(en ? "English meaning" : "English word", p.sub)}
          </>
        )}
      />
    </Section>
  );
}

function SentenceTab({
  card,
  set,
  keep,
  id,
  sentences,
  original,
}: TabProps & { sentences: string[]; original: string }) {
  const rewriteFn = useServerFn(rewriteIgPart);
  const en = card.lang === "en";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [options, setOptions] = useState<{ news: string; newsHi: string }[]>([]);
  // A line of the paper is quoted; anything else is shown as based on it.
  const fromPaper = (s: string) => s === original || sentences.includes(s);
  const write = async (ask: string) => {
    setBusy("Writing three options…");
    try {
      const out = await rewriteFn({ data: { id, part: "sentence", note: ask } });
      if ("options" in out) setOptions(out.options);
    } catch (e) {
      toast.error(errorText(e, "Couldn't write it"));
    } finally {
      setBusy(null);
    }
  };
  // The Hindi of a line of the paper (for English words).
  const translate = async (news: string) => {
    if (!en) return;
    setBusy("Translating…");
    try {
      const out = await rewriteFn({
        data: {
          id,
          part: "sentence",
          note: `Keep this sentence exactly as it is and give only its Hindi: "${news}". Give one option.`,
        },
      });
      const hi = "options" in out ? out.options[0]?.newsHi : "";
      if (hi)
        await keep(
          { news, newsHi: hi, rewritten: false },
          "Before using another line of the paper",
        );
    } catch (e) {
      toast.error(errorText(e, "Couldn't translate it"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section
      title="News line"
      hint="The sentence that shows the word at work. A line of the paper is quoted as it is; a rewritten line shows on the card as “Based on today's news”."
    >
      <div className="space-y-1">
        <Field
          label="The line on the card"
          rows={3}
          value={card.news}
          onChange={(v) => set({ news: v, rewritten: !fromPaper(v) })}
        />
        <p className="text-xs text-muted-foreground">
          {card.rewritten
            ? "Rewritten: shown as based on today's news, without quotation marks."
            : `Quoted from ${card.paper || "the paper"}.`}
        </p>
        {card.news && (
          <p
            className="rounded-lg bg-muted/50 p-2 text-sm [&_mark]:rounded [&_mark]:bg-amber-200/70 [&_mark]:px-0.5 dark:[&_mark]:bg-amber-500/30"
            dangerouslySetInnerHTML={{ __html: markWord(card.news, card.word) }}
          />
        )}
      </div>
      {en && (
        <Field
          label="The line in Hindi"
          rows={2}
          value={card.newsHi}
          onChange={(v) => set({ newsHi: v })}
        />
      )}
      <Field label="Paper" value={card.paper} onChange={(v) => set({ paper: v })} />
      {card.rewritten && original && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void (en
              ? translate(original)
              : keep({ news: original, rewritten: false }, "Before going back to the paper's line"))
          }
        >
          Back to the paper&apos;s line
        </Button>
      )}

      <div
        className="space-y-2 rounded-xl border border-dashed border-primary/40 p-3"
        aria-label="Rewrite with AI"
      >
        <h3 className="text-sm font-semibold">Rewrite with AI</h3>
        <p className="text-xs text-muted-foreground">
          Three sentences from the same article, using the word in the same sense. Nothing the
          article doesn&apos;t say is added.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SENTENCE_ASKS[card.lang].map((a) => (
            <Button
              key={a}
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => void write(a)}
            >
              {a}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            placeholder="Or say what you want"
            aria-label="What you want"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="sm" disabled={!!busy} onClick={() => void write(note)}>
            <Sparkles className="mr-1 h-4 w-4" /> Write 3 options
          </Button>
        </div>
        {busy && (
          <p role="status" className="flex items-center gap-1.5 text-xs text-primary">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {busy}
          </p>
        )}
        {options.map((o, i) => (
          <div
            key={i}
            className="space-y-1 rounded-lg bg-primary/5 p-2 text-sm"
            aria-label={`Option ${i + 1}`}
          >
            <p
              className="[&_mark]:rounded [&_mark]:bg-amber-200/70 [&_mark]:px-0.5"
              dangerouslySetInnerHTML={{ __html: markWord(o.news, card.word) }}
            />
            {o.newsHi && <p className="text-muted-foreground">{o.newsHi}</p>}
            <Button
              size="sm"
              onClick={async () => {
                await keep(
                  { news: o.news, newsHi: o.newsHi, rewritten: true },
                  "Before the AI rewrote the news line",
                );
                setOptions([]);
                toast.success("Used");
              }}
            >
              Use this
            </Button>
          </div>
        ))}
      </div>

      {sentences.length > 0 && (
        <div className="space-y-2" aria-label="Other lines of the article">
          <h3 className="text-sm font-semibold">Other lines of the article with the word</h3>
          {sentences.map((s) => (
            <div
              key={s}
              className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm"
            >
              <p
                className="flex-1 [&_mark]:rounded [&_mark]:bg-amber-200/70 [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: markWord(s, card.word) }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void (en
                    ? translate(s)
                    : keep({ news: s, rewritten: false }, "Before using another line of the paper"))
                }
              >
                Use this
              </Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Chips({
  label,
  items,
  onChange,
  ideas,
}: {
  label: string;
  items: string[];
  onChange: (xs: string[]) => void;
  ideas: string[];
}) {
  const [add, setAdd] = useState("");
  const put = (x: string) => {
    const t = x.trim();
    if (t && !items.some((i) => i.toLowerCase() === t.toLowerCase())) onChange([...items, t]);
  };
  return (
    <div className="space-y-2" aria-label={label}>
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <span
            key={x}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm"
          >
            {x}
            <button
              type="button"
              aria-label={`Remove ${x}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((i) => i !== x))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <form
          className="inline-flex"
          onSubmit={(e) => {
            e.preventDefault();
            put(add);
            setAdd("");
          }}
        >
          <Input
            className="h-8 w-36"
            placeholder="Add…"
            aria-label={`Add to ${label}`}
            value={add}
            onChange={(e) => setAdd(e.target.value)}
          />
        </form>
      </div>
      {ideas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">WordNet has:</span>
          {ideas
            .filter((x) => !items.some((i) => i.toLowerCase() === x.toLowerCase()))
            .map((x) => (
              <button
                key={x}
                type="button"
                className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 hover:bg-muted"
                onClick={() => put(x)}
                aria-label={`Add ${x}`}
              >
                <Plus className="h-3 w-3" /> {x}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function WordsTab({
  card,
  set,
  keep,
  id,
  wordnet,
}: TabProps & { wordnet?: { synonyms: string[]; antonyms: string[] } }) {
  const en = card.lang === "en";
  return (
    <Section
      title={en ? "Synonyms and antonyms" : "पर्यायवाची और विलोम"}
      hint="Words that fit the card's sense. The card shows up to 4 synonyms and 3 antonyms."
    >
      <Chips
        label={en ? "Synonyms" : "पर्यायवाची"}
        items={card.synonyms}
        onChange={(synonyms) => set({ synonyms })}
        ideas={wordnet?.synonyms ?? []}
      />
      <Chips
        label={en ? "Antonyms" : "विलोम"}
        items={card.antonyms}
        onChange={(antonyms) => set({ antonyms })}
        ideas={wordnet?.antonyms ?? []}
      />
      <PartAI
        id={id}
        part="words"
        keep={keep}
        show={(p) => (
          <>
            {line(en ? "Synonyms" : "पर्यायवाची", p.synonyms?.join(", "))}
            {line(en ? "Antonyms" : "विलोम", p.antonyms?.join(", ") || "—")}
          </>
        )}
      />
    </Section>
  );
}

function TipsTab({ card, set, keep, id }: TabProps) {
  const titles = TIP_TITLES[card.lang];
  const put = (i: number, patch: Partial<{ title: string; text: string }>) => {
    const extras = [...card.extras];
    extras[i] = { title: extras[i]?.title ?? "", text: extras[i]?.text ?? "", ...patch };
    set({ extras: extras.filter((x) => x.title || x.text) });
  };
  return (
    <Section
      title="Tips"
      hint="One or two things that help a student remember or use the word. **bold** and ~~struck~~ work."
    >
      <datalist id="ig-tip-titles">
        {titles.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-2 rounded-lg border border-border p-3"
          aria-label={`Tip ${i + 1}`}
        >
          <Input
            list="ig-tip-titles"
            placeholder="Title"
            aria-label={`Tip ${i + 1} title`}
            value={card.extras[i]?.title ?? ""}
            onChange={(e) => put(i, { title: e.target.value })}
          />
          <Textarea
            rows={2}
            placeholder="Tip"
            aria-label={`Tip ${i + 1}`}
            value={card.extras[i]?.text ?? ""}
            onChange={(e) => put(i, { text: e.target.value })}
          />
        </div>
      ))}
      <PartAI
        id={id}
        part="tips"
        keep={keep}
        show={(p) => (
          <>
            {(p.extras ?? []).map((x, i) => (
              <div key={i}>{line(x.title, x.text)}</div>
            ))}
          </>
        )}
      />
    </Section>
  );
}

const FORM_POS = {
  en: ["noun", "verb", "adjective", "adverb"],
  hi: ["संज्ञा", "विशेषण", "क्रिया", "क्रिया-विशेषण"],
};

function FormsTab({ card, set, keep, id, ideas }: TabProps & { ideas: IgForm[] }) {
  const en = card.lang === "en";
  const forms = card.forms ?? [];
  const put = (next: IgForm[]) => set({ forms: next.slice(0, 3) });
  const have = (w: string) => forms.some((f) => f.word.toLowerCase() === w.toLowerCase());
  return (
    <Section
      title={en ? "Word forms and phrases" : "शब्द रूप और प्रयोग"}
      hint="Other forms of the word in other parts of speech (up to 3), and common phrases it is used in (up to 3). With both on the card, it shows one tip."
    >
      <datalist id="ig-form-pos">
        {FORM_POS[card.lang].map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="space-y-2" aria-label="Word forms">
        <h3 className="text-sm font-semibold">{en ? "Forms" : "शब्द रूप"}</h3>
        {forms.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="min-w-0 flex-1"
              aria-label={`Form ${i + 1}`}
              value={f.word}
              onChange={(e) =>
                put(forms.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)))
              }
            />
            <Input
              className="w-36"
              list="ig-form-pos"
              aria-label={`Form ${i + 1} part of speech`}
              value={f.pos}
              onChange={(e) =>
                put(forms.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)))
              }
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label={`Remove ${f.word || `form ${i + 1}`}`}
              onClick={() => put(forms.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {forms.length < 3 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => put([...forms, { word: "", pos: FORM_POS[card.lang][0] }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add a form
          </Button>
        )}
        {ideas.filter((f) => !have(f.word)).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">WordNet has:</span>
            {ideas
              .filter((f) => !have(f.word))
              .map((f) => (
                <button
                  key={f.word}
                  type="button"
                  disabled={forms.length >= 3}
                  className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
                  onClick={() => put([...forms, f])}
                  aria-label={`Add ${f.word}`}
                >
                  <Plus className="h-3 w-3" /> {f.word}{" "}
                  <span className="text-muted-foreground">({formPos(f.pos)})</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <Chips
        label={en ? "Common phrases" : "प्रयोग"}
        items={card.phrases ?? []}
        onChange={(phrases) => set({ phrases: phrases.slice(0, 3) })}
        ideas={[]}
      />
      <PartAI
        id={id}
        part="forms"
        keep={keep}
        show={(p) => (
          <>
            {line(
              en ? "Forms" : "शब्द रूप",
              (p.forms ?? []).map((f) => `${f.word} (${formPos(f.pos)})`).join(", ") || "—",
            )}
            {line(en ? "Phrases" : "प्रयोग", (p.phrases ?? []).join(", "))}
          </>
        )}
      />
    </Section>
  );
}

// Searches that open in a new tab, to check the card against the web.
function webChecks(word: string, lang: "en" | "hi"): { label: string; url: string }[] {
  const w = word.trim();
  const g = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const e = encodeURIComponent(w.toLowerCase());
  return lang === "en"
    ? [
        { label: "Google: define", url: g(`define ${w}`) },
        { label: "Google: synonyms & antonyms", url: g(`${w} synonyms and antonyms`) },
        { label: "Google: meaning in Hindi", url: g(`${w} meaning in Hindi`) },
        { label: "Cambridge", url: `https://dictionary.cambridge.org/dictionary/english/${e}` },
        { label: "Merriam-Webster", url: `https://www.merriam-webster.com/dictionary/${e}` },
      ]
    : [
        { label: "Google: अर्थ", url: g(`${w} का अर्थ`) },
        { label: "Google: पर्यायवाची, विलोम", url: g(`${w} पर्यायवाची शब्द विलोम शब्द`) },
        { label: "Google: meaning in English", url: g(`${w} meaning in English`) },
        {
          label: "Hindi Wiktionary",
          url: `https://hi.wiktionary.org/wiki/${encodeURIComponent(w)}`,
        },
      ];
}

function WebCheck({ word, lang }: { word: string; lang: "en" | "hi" }) {
  if (!word.trim()) return null;
  return (
    <nav
      aria-label="Check on the web"
      className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 p-2 text-xs"
    >
      <span className="font-medium text-muted-foreground">Check on the web:</span>
      {webChecks(word, lang).map((x) => (
        <a
          key={x.label}
          href={x.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 hover:bg-muted"
        >
          {x.label} <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </nav>
  );
}

type Dictionary = {
  senses: { pos: string; gloss: string }[];
  synonyms: string[];
  antonyms: string[];
};

// What WordNet says beside the card: its meanings, and (on the synonyms
// tab) which of the card's synonyms and antonyms it doesn't give.
function DictionaryBox({
  card,
  dict,
  words,
}: {
  card: IgCard;
  dict?: Dictionary;
  words?: boolean;
}) {
  if (!dict?.senses.length) return null;
  const low = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));
  const syn = low(dict.synonyms);
  const ant = low(dict.antonyms);
  const notSyn = card.synonyms.filter((x) => !syn.has(x.toLowerCase()));
  const notAnt = card.antonyms.filter((x) => !ant.has(x.toLowerCase()));
  return (
    <section
      aria-label="Dictionary says"
      className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm"
    >
      <h3 className="font-semibold">WordNet says</h3>
      <ol className="list-decimal space-y-1 pl-5">
        {dict.senses.map((s, i) => (
          <li key={i}>
            <span className="text-xs text-muted-foreground">{s.pos}</span> {s.gloss}
          </li>
        ))}
      </ol>
      {words && (
        <>
          {notSyn.length > 0 && (
            <p className="text-xs">
              <span className="text-muted-foreground">Synonyms WordNet doesn&apos;t give: </span>
              {notSyn.join(", ")}
            </p>
          )}
          {card.antonyms.length > 0 && notAnt.length > 0 && (
            <p className="text-xs">
              <span className="text-muted-foreground">Antonyms WordNet doesn&apos;t give: </span>
              {notAnt.join(", ")}
            </p>
          )}
          {!notSyn.length && !notAnt.length && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              WordNet gives every synonym and antonym on the card.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Not in WordNet isn&apos;t always wrong: check on the web above.
          </p>
        </>
      )}
    </section>
  );
}

// The card's notes (all, or those of one tab), each accepted or ignored.
function NotesTab({
  w,
  only,
  onCard,
  onChange,
}: {
  w: IgWord;
  only?: TabId;
  onCard: (c: IgCard) => void;
  onChange: () => Promise<unknown>;
}) {
  const checkFn = useServerFn(setIgCheck);
  const list = w.checks.filter((c) => !only || PART_OF_FIELD[c.field] === only);
  const open = list.filter((c) => c.state === "open");
  const done = list.filter((c) => c.state !== "open");
  if (only && !open.length) return null;
  const decide = async (c: IgCheck, state: IgCheck["state"]) => {
    try {
      const next = await checkFn({ data: { id: w.id, check: c.id, state } });
      if (next.card) onCard(next.card);
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    }
  };
  const fixable = (c: IgCheck) => (c.fix || c.text) && (c.field !== "news" || w.card?.rewritten);
  return (
    <section
      className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
      aria-label="Notes"
    >
      <h3 className="text-sm font-semibold">
        {open.length ? `Notes to decide (${open.length})` : "No notes left to decide"}
      </h3>
      {!w.proofed && (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Proofreading…
        </p>
      )}
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
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{c.fix}</span>
              )}
              {c.text && !c.fix && <span className="text-muted-foreground"> (remove)</span>}
            </p>
          )}
          <p className="text-muted-foreground">{c.why}</p>
          <div className="flex gap-2">
            {fixable(c) && (
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
      {!only && done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{done.length} decided</summary>
          <div className="mt-2 space-y-1">
            {done.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded bg-background p-1.5">
                <Badge tone={c.state === "accepted" ? "good" : "muted"}>
                  {c.state === "accepted" ? "Accepted" : "Ignored"}
                </Badge>
                <span className="min-w-0 flex-1 truncate">
                  {FIELD_NAMES[c.field]}: {c.why}
                </span>
                {c.state === "ignored" && (
                  <Button size="sm" variant="ghost" onClick={() => void decide(c, "open")}>
                    Open again
                  </Button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function HistoryDialog({
  id,
  versions,
  onClose,
  flush,
  onRestored,
}: {
  id: string;
  versions: { at: string; label: string; card: IgCard }[];
  onClose: () => void;
  flush: () => Promise<unknown>;
  onRestored: (c: IgCard) => Promise<void>;
}) {
  const restoreFn = useServerFn(restoreIgVersion);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Earlier versions</DialogTitle>
        </DialogHeader>
        {!versions.length ? (
          <p className="text-sm text-muted-foreground">
            None yet: a version is kept each time the AI writes a part again or a version is
            restored.
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.at} className="space-y-1 rounded-lg border border-border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{v.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {v.card.main} · {v.card.news.slice(0, 90)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await flush();
                      await onRestored(await restoreFn({ data: { id, at: v.at } }));
                      toast.success("Restored");
                    } catch (e) {
                      toast.error(errorText(e, "Couldn't restore it"));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({
  w,
  view,
  date,
  onClose,
  onSwapped,
}: {
  w: IgWord;
  view: IgDayView;
  date: string;
  onClose: () => void;
  onSwapped: () => Promise<void>;
}) {
  const swapFn = useServerFn(swapIgWord);
  const others = [...view.suggestions, ...view.reserve].filter((x) => x.lang === w.lang);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Swap “{w.card?.word || w.word}” for another word</DialogTitle>
        </DialogHeader>
        {!others.length ? (
          <p className="text-sm text-muted-foreground">
            No other {w.lang === "en" ? "English" : "Hindi"} words in the reserve.
          </p>
        ) : (
          <ul className="space-y-2">
            {others.map((o) => (
              <li
                key={o.id}
                className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.word}{" "}
                    {o.status === "reserve" && (
                      <span className="text-xs text-muted-foreground">
                        reserve · {igDate(o.day)}
                      </span>
                    )}
                  </p>
                  {o.sentence && <p className="text-muted-foreground">{o.sentence}</p>}
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await swapFn({ data: { date, from: w.id, to: o.id } });
                      await onSwapped();
                    } catch (e) {
                      toast.error(errorText(e, "Couldn't swap"));
                    }
                  }}
                >
                  Use this word
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
