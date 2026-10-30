// The card editor for GK infographics: one card on a page of its own, like
// the Words in the News card editor. A tab for each part (the card as it
// will look in each language, its words, its visual or map, the book facts
// it comes from, the proofreading notes); the words, points, visual and map
// can be made again by the AI from the card's facts. Changes save as you go
// and earlier versions are kept.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  ListChecks,
  Map as MapIcon,
  PencilLine,
  Plus,
  RefreshCw,
  Shapes,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import {
  gkCardPreview,
  gkVersions,
  makeGkVisual,
  restoreGkVersion,
  rewriteGkPart,
  saveGkCard,
  setGkCheck,
  setGkChecked,
  suggestGkMap,
  type GkDayView,
} from "@/lib/gk.functions";
import { previewMap } from "@/lib/geo.functions";
import {
  GK_LOOKS,
  GK_POINTS_MAX,
  gkCardHtml,
  type GkCard,
  type GkCheck,
  type GkDesign,
  type GkLang,
  type GkLook,
} from "@/lib/gk";
import { VISUAL_LABELS, type Visual } from "@/lib/ca-visuals";
import { uncheckedPlaces, type MapSpec } from "@/lib/map-spec";
import { channelLabel } from "@/lib/ig-words";
import type { Bi } from "@/lib/current-affairs";
import { BiField } from "@/components/notes-books";
import { MapEdit } from "@/components/map-edit";
import { VisualEditor, VisualFrame, VisualPicker } from "@/components/ca-story-visuals";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const site = () => (typeof window === "undefined" ? "" : window.location.origin);

export const LOOK_NAMES: Record<GkLook, string> = {
  ...(VISUAL_LABELS as Record<string, string>),
  map: "Map",
  points: "Points only",
} as Record<GkLook, string>;

// A card's page (1080×1920) in a small frame.
export function GkFrame({
  html,
  title,
  width = "fill",
}: {
  html: string;
  title: string;
  width?: number | "fill";
}) {
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(170);
  useEffect(() => {
    const el = box.current;
    if (width !== "fill" || !el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width || 170));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const fill = width === "fill";
  const scale = (fill ? boxWidth : width) / 1080;
  return (
    <div
      ref={box}
      className={`overflow-hidden rounded-lg border border-border bg-muted shadow-sm ${fill ? "w-full" : "shrink-0"}`}
      style={fill ? { aspectRatio: "9 / 16" } : { width, height: 1920 * scale }}
    >
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-scripts"
        className="pointer-events-none origin-top-left border-0"
        style={{ width: 1080, height: 1920, transform: `scale(${scale})` }}
      />
    </div>
  );
}

// The card's page drawn in the browser (a map shows as a note: its
// outlines are drawn on the server, in the editor's Card tab).
export function gkQuickHtml(card: GkCard, view: GkDayView, lang: GkLang, n: number): string {
  const s = view.settings;
  return gkCardHtml(card, {
    lang,
    design: (lang === "en" ? s.design_en : s.design_hi) as GkDesign,
    n,
    total: view.cards.length,
    subject: { en: view.subject?.name_en ?? "", hi: view.subject?.name_hi ?? "" },
    dayNo: view.day?.day_no ?? 1,
    date: view.day?.day ?? "",
    channel: channelLabel(s.channel),
    assetBase: site(),
    watermark: s.watermark,
  });
}

type TabId = "preview" | "text" | "visual" | "map" | "facts" | "notes";
const TABS: { id: TabId; label: string; icon: typeof Type }[] = [
  { id: "preview", label: "Card", icon: Eye },
  { id: "text", label: "Words", icon: Type },
  { id: "visual", label: "Visual", icon: Shapes },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "facts", label: "Book facts", icon: BookOpen },
  { id: "notes", label: "Proofreading", icon: ListChecks },
];
const TAB_OF: Record<GkCheck["field"], TabId> = {
  title: "text",
  intro: "text",
  points: "text",
  visual: "visual",
  map: "map",
};
const EMPTY: Bi = { en: "", hi: "" };

export function GkCardEditor({
  view,
  startId,
  onClose,
  onChange,
}: {
  view: GkDayView;
  startId: string;
  onClose: () => void;
  onChange: () => Promise<unknown>;
}) {
  const saveFn = useServerFn(saveGkCard);
  const tickFn = useServerFn(setGkChecked);
  const checkFn = useServerFn(setGkCheck);
  const rewriteFn = useServerFn(rewriteGkPart);
  const visualFn = useServerFn(makeGkVisual);
  const mapFn = useServerFn(suggestGkMap);
  const [id, setId] = useState(startId);
  const [tab, setTab] = useState<TabId>("preview");
  const [card, setCard] = useState<GkCard | null>(null);
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const sent = useRef("");
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const cards = view.cards;
  const at = cards.findIndex((c) => c.id === id);
  const row = cards[at];
  const prev = cards[at - 1];
  const next = cards[at + 1];

  useEffect(() => {
    if (row?.card && (!card || sent.current === "")) {
      setCard(row.card);
      sent.current = JSON.stringify(row.card);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, row?.card]);

  // Saves the card (one save at a time, in order). A label keeps the card
  // as it was as a version first (before an AI change).
  const push = (c: GkCard, label?: string) => {
    const json = JSON.stringify(c);
    if (json === sent.current && !label) return chain.current;
    sent.current = json;
    setSaving((n) => n + 1);
    const cardId = id;
    chain.current = chain.current.then(async () => {
      try {
        await saveFn({ data: { id: cardId, card: c as never, ...(label ? { label } : {}) } });
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
  const set = (patch: Partial<GkCard>) => card && setCard({ ...card, ...patch });
  const keep = async (patch: Partial<GkCard>, label = "Before an AI change") => {
    if (!card) return;
    const c = { ...card, ...patch };
    setCard(c);
    await push(c, label);
  };
  const ai = async (what: string, f: () => Promise<void>) => {
    setBusy(what);
    try {
      await f();
    } catch (e) {
      toast.error(errorText(e, "Couldn't do it"));
    } finally {
      setBusy(null);
    }
  };

  const openChecks = (row?.checks ?? []).filter((c) => c.state === "open");
  const notesIn = (t: TabId) =>
    t === "notes" ? openChecks.length : openChecks.filter((c) => TAB_OF[c.field] === t).length;
  const status = saveError ? (
    <span className="text-destructive">{saveError}</span>
  ) : saving ? (
    "Saving…"
  ) : savedAt ? (
    "Saved"
  ) : (
    ""
  );

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
                Card {at + 1} of {cards.length} · {view.topic?.name_en ?? ""}
              </p>
              <DialogTitle className="truncate text-base font-semibold leading-snug">
                {card?.title.en || row?.idea.title.en}
              </DialogTitle>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!card}
              onClick={() => setHistory(true)}
              aria-label="Earlier versions"
            >
              <History className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 sm:px-4">
            {row?.checked ? (
              <Badge tone="good">Checked</Badge>
            ) : (
              <Badge tone="primary">To check</Badge>
            )}
            <Badge>{card ? LOOK_NAMES[card.look] : ""}</Badge>
            {row && !row.proofed ? (
              <span role="status" className="flex items-center gap-1.5 text-xs text-primary">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Proofreading…
              </span>
            ) : openChecks.length ? (
              <Badge tone="warn">{openChecks.length} notes to decide</Badge>
            ) : (
              <Badge tone="good">No open notes</Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {status}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav
            aria-label="Parts of the card"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1.5 lg:w-52 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-2"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              const n = notesIn(t.id);
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
          <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            {!card || !row ? (
              <p className="text-muted-foreground">The card is still being written…</p>
            ) : tab === "preview" ? (
              <PreviewTab id={id} card={card} view={view} n={at + 1} savedAt={savedAt} />
            ) : tab === "text" ? (
              <div className="max-w-3xl space-y-4">
                <BiField label="Title" value={card.title} onChange={(title) => set({ title })} />
                <BiField
                  label="Line under the title"
                  rows={2}
                  value={card.intro}
                  onChange={(intro) => set({ intro })}
                />
                <AskAi
                  label="Write the title and line again"
                  busy={busy === "words"}
                  onAsk={(note) =>
                    ai("words", async () => {
                      await keep(await rewriteFn({ data: { id, part: "words", note } }));
                      toast.success("Written again (the earlier words are in History)");
                    })
                  }
                />
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Points ({card.points.length}/{GK_POINTS_MAX}) · <b>**bold**</b> marks the key
                    words
                  </p>
                  {card.points.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1">
                        <BiField
                          label={`Point ${i + 1}`}
                          rows={2}
                          value={p}
                          onChange={(v) =>
                            set({ points: card.points.map((x, j) => (j === i ? v : x)) })
                          }
                        />
                      </div>
                      <div className="flex flex-col pt-6">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          aria-label={`Move point ${i + 1} up`}
                          disabled={i === 0}
                          onClick={() => {
                            const ps = [...card.points];
                            [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]];
                            set({ points: ps });
                          }}
                        >
                          <ChevronLeft className="h-4 w-4 rotate-90" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          aria-label={`Remove point ${i + 1}`}
                          onClick={() => set({ points: card.points.filter((_, j) => j !== i) })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={card.points.length >= GK_POINTS_MAX}
                    onClick={() => set({ points: [...card.points, EMPTY] })}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add a point
                  </Button>
                </div>
                <AskAi
                  label="Write the points again"
                  busy={busy === "points"}
                  onAsk={(note) =>
                    ai("points", async () => {
                      await keep(await rewriteFn({ data: { id, part: "points", note } }));
                      toast.success("Points written again");
                    })
                  }
                />
              </div>
            ) : tab === "visual" ? (
              <VisualTab
                card={card}
                onLook={(look) => set({ look })}
                onVisual={(visual, label) => keep({ visual, look: visual.type as GkLook }, label)}
                make={async (opts) =>
                  visualFn({
                    data: {
                      id,
                      ...(opts.type ? { type: opts.type } : {}),
                      ...(opts.note ? { note: opts.note } : {}),
                    },
                  })
                }
                id={id}
              />
            ) : tab === "map" ? (
              <MapTab
                id={id}
                card={card}
                onMap={(map) => set({ map, ...(map ? { look: "map" as GkLook } : {}) })}
                suggest={() => mapFn({ data: { id } })}
                accent={view.settings.design_en}
              />
            ) : tab === "facts" ? (
              <FactsTab card={card} onSources={(sources) => set({ sources })} />
            ) : (
              <NotesTab
                checks={row.checks}
                onDecide={(check, state) =>
                  ai(check.id, async () => {
                    await flush();
                    const r = await checkFn({ data: { id, check: check.id, state } });
                    if (r.card) {
                      sent.current = JSON.stringify(r.card);
                      setCard(r.card);
                    }
                    await onChange();
                  })
                }
              />
            )}
          </main>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-background p-2 sm:px-4">
          <Button
            size="sm"
            variant="outline"
            disabled={!prev}
            onClick={() => prev && go(prev.id)}
            aria-label="Previous card"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!next}
            onClick={() => next && go(next.id)}
            aria-label="Next card"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!row?.checked}
              disabled={!card || openChecks.length > 0}
              aria-label="Checked"
              onCheckedChange={async (on) => {
                try {
                  await flush();
                  await tickFn({ data: { id, checked: !!on } });
                  await onChange();
                  if (on && next) go(next.id);
                } catch (e) {
                  toast.error(errorText(e, "Couldn't tick it"));
                }
              }}
            />
            {openChecks.length ? "Decide the notes, then tick it as checked" : "Checked"}
          </label>
          <Button size="sm" onClick={leave}>
            Done
          </Button>
        </footer>
        {history && (
          <HistoryDialog
            id={id}
            onClose={() => setHistory(false)}
            onRestored={async (c) => {
              sent.current = JSON.stringify(c);
              setCard(c);
              setHistory(false);
              await onChange();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Tabs ----------

function PreviewTab({
  id,
  card,
  view,
  n,
  savedAt,
}: {
  id: string;
  card: GkCard;
  view: GkDayView;
  n: number;
  savedAt: Date | null;
}) {
  const previewFn = useServerFn(gkCardPreview);
  const [lang, setLang] = useState<GkLang>("hi");
  // A map is drawn on the server (from the saved card); anything else here.
  const server = card.look === "map" && !!card.map;
  const q = useQuery({
    queryKey: ["gkPreview", id, lang, savedAt?.getTime() ?? 0],
    queryFn: () => previewFn({ data: { id, lang } }),
    enabled: server,
    placeholderData: (p) => p,
  });
  const quick = useMemo(() => gkQuickHtml(card, view, lang, n), [card, view, lang, n]);
  const html = server ? q.data?.html : quick;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Preview language">
        {(["hi", "en"] as const).map((l) => (
          <Button
            key={l}
            size="sm"
            role="radio"
            aria-checked={lang === l}
            variant={lang === l ? "default" : "outline"}
            onClick={() => setLang(l)}
          >
            {l === "hi" ? "Hindi album" : "English album"}
          </Button>
        ))}
        {server && q.isFetching && <RefreshCw className="h-4 w-4 animate-spin" />}
      </div>
      <div className="mx-auto max-w-[360px]">
        {html ? (
          <GkFrame html={html} title={`Card ${n} (${lang === "hi" ? "Hindi" : "English"})`} />
        ) : (
          <div className="aspect-[9/16] w-full animate-pulse rounded-lg bg-muted" />
        )}
      </div>
    </div>
  );
}

function AskAi({
  label,
  busy,
  onAsk,
}: {
  label: string;
  busy: boolean;
  onAsk: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2 sm:flex-row sm:items-center">
      <input
        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        placeholder="A note for the AI (optional): shorter, simpler…"
        aria-label={`${label}: note`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onAsk(note.trim())}>
        {busy ? (
          <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-1 h-4 w-4" />
        )}
        {label}
      </Button>
    </div>
  );
}

function VisualTab({
  id,
  card,
  onLook,
  onVisual,
  make,
}: {
  id: string;
  card: GkCard;
  onLook: (look: GkLook) => void;
  onVisual: (visual: Visual, label: string) => Promise<void>;
  make: (opts: { type?: Visual["type"]; note?: string }) => Promise<{
    visual: Visual;
    covers: number[];
  }>;
}) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const subject = {
    id,
    headline: card.title.en,
    facts: card.facts.map((f) => ({ text: f.text })),
    make,
  };
  return (
    <div className="max-w-3xl space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">What the card shows</p>
        <Select value={card.look} onValueChange={(v) => onLook(v as GkLook)}>
          <SelectTrigger className="w-64" aria-label="What the card shows">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GK_LOOKS.map((l) => (
              <SelectItem key={l} value={l}>
                {LOOK_NAMES[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A map (Map tab), one of the magazine&apos;s visuals, or the points alone.
        </p>
      </div>
      {card.look === "map" ? (
        <p className="text-sm text-muted-foreground">
          This card shows a map: edit it on the Map tab.
        </p>
      ) : card.look === "points" ? (
        <p className="text-sm text-muted-foreground">This card shows its points only.</p>
      ) : (
        <>
          {card.visual ? (
            <VisualFrame visual={card.visual} />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No visual yet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPicking(true)}>
              <Sparkles className="mr-1 h-4 w-4" />
              {card.visual ? "Make it again" : "Make a visual"}
            </Button>
            {card.visual && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <PencilLine className="mr-1 h-4 w-4" /> Edit by hand
              </Button>
            )}
          </div>
        </>
      )}
      {picking && (
        <VisualPicker
          item={subject}
          slot={1}
          current={card.visual ?? null}
          onClose={() => setPicking(false)}
          onKeep={async (visual) => {
            await onVisual(visual, "Before an AI change");
            setPicking(false);
            toast.success("Visual saved");
          }}
        />
      )}
      {editing && card.visual && (
        <VisualEditor
          item={subject}
          visual={card.visual}
          covers={[]}
          onClose={() => setEditing(false)}
          onSave={async (visual) => {
            await onVisual(visual, "Before a hand edit");
            setEditing(false);
            toast.success("Visual saved");
          }}
        />
      )}
    </div>
  );
}

function MapTab({
  id,
  card,
  onMap,
  suggest,
}: {
  id: string;
  card: GkCard;
  onMap: (m: MapSpec | null) => void;
  suggest: () => Promise<MapSpec>;
  accent: string;
}) {
  const previewFn = useServerFn(previewMap);
  const [busy, setBusy] = useState(false);
  const m = card.map ?? null;
  const [shown, setShown] = useState(m);
  useEffect(() => {
    const t = setTimeout(() => setShown(m), 500);
    return () => clearTimeout(t);
  }, [m]);
  const preview = useQuery({
    queryKey: ["gkMapPreview", id, JSON.stringify(shown)],
    queryFn: () => previewFn({ data: { map: shown as never, lang: "hi", review: true } }),
    enabled: !!shown,
    placeholderData: (p) => p,
  });
  const left = uncheckedPlaces(m);
  return (
    <div className="max-w-3xl space-y-3">
      {card.look !== "map" && (
        <p className="rounded-lg bg-muted/50 p-2 text-sm text-muted-foreground">
          This card shows {LOOK_NAMES[card.look].toLowerCase()} now; a map made here takes its
          place.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={m ? "outline" : "default"}
          disabled={busy}
          onClick={async () => {
            if (m?.places.length && !confirm("Replace this map with SAATHI's suggestion?")) return;
            setBusy(true);
            try {
              onMap(await suggest());
              toast.success("Map suggested: check its places");
            } catch (e) {
              toast.error(errorText(e, "Couldn't suggest a map"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          {busy ? "Suggesting…" : m ? "Suggest again" : "Suggest a map"}
        </Button>
        {left > 0 && (
          <span className="text-xs text-red-700 dark:text-red-400">
            ◇ {left} place{left === 1 ? "" : "s"} not in the place list: check{" "}
            {left === 1 ? "it" : "them"}
          </span>
        )}
      </div>
      <MapEdit map={m} onChange={onMap} />
      {m && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            The map as drawn
            {preview.isFetching && <RefreshCw className="h-3 w-3 animate-spin" />}
          </div>
          {preview.data?.html ? (
            <iframe
              title="Map preview"
              srcDoc={preview.data.html}
              className="h-80 w-full rounded-lg border border-border bg-white"
            />
          ) : (
            <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />
          )}
        </div>
      )}
    </div>
  );
}

function FactsTab({ card, onSources }: { card: GkCard; onSources: (s: string[]) => void }) {
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        The facts this card was written from, each with the book&apos;s own words. A fact marked
        &quot;not found&quot; wasn&apos;t found word for word in the book: check it.
      </p>
      <ol className="space-y-2">
        {card.facts.map((f, i) => (
          <li key={i} className="rounded-lg border border-border p-2.5 text-sm" data-fact>
            <div className="flex items-start gap-2">
              <span className="font-medium">{i + 1}.</span>
              <span className="flex-1">{f.text}</span>
              {f.verified ? (
                <Badge tone="good">
                  <Check className="mr-0.5 inline h-3 w-3" />
                  in the book
                </Badge>
              ) : (
                <Badge tone="warn">not found</Badge>
              )}
            </div>
            {f.quote && (
              <blockquote className="mt-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                “{f.quote}” — {f.source}
              </blockquote>
            )}
          </li>
        ))}
      </ol>
      <div className="space-y-1">
        <p className="text-sm font-medium">Source line (one book a line)</p>
        <Textarea
          rows={3}
          aria-label="Sources"
          value={card.sources.join("\n")}
          onChange={(e) =>
            onSources(
              e.target.value
                .split("\n")
                .map((s) => s.trimStart())
                .slice(0, 10),
            )
          }
        />
      </div>
    </div>
  );
}

const FIELD_NAME: Record<GkCheck["field"], string> = {
  title: "Title",
  intro: "Line under the title",
  points: "Points",
  visual: "Visual",
  map: "Map",
};

function NotesTab({
  checks,
  onDecide,
}: {
  checks: GkCheck[];
  onDecide: (c: GkCheck, state: GkCheck["state"]) => void;
}) {
  if (!checks.length) return <p className="text-muted-foreground">No proofreading notes.</p>;
  return (
    <ul className="max-w-3xl space-y-2">
      {checks.map((c) => (
        <li
          key={c.id}
          className={`rounded-lg border p-3 text-sm ${c.state === "open" ? "border-amber-500/50" : "border-border opacity-70"}`}
          data-check={c.state}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={c.source === "book" ? "warn" : "primary"}>
              {c.source === "book" ? "Book check" : "AI proofreading"}
            </Badge>
            <span className="font-medium">{FIELD_NAME[c.field]}</span>
            {c.state !== "open" && <Badge>{c.state === "accepted" ? "Fixed" : "Kept as is"}</Badge>}
          </div>
          <p className="mt-1.5">{c.why}</p>
          {c.text && c.fix && (
            <p className="mt-1 text-xs">
              <span className="line-through opacity-70">{c.text}</span> →{" "}
              <span className="font-medium">{c.fix}</span>
            </p>
          )}
          {c.state === "open" && (
            <div className="mt-2 flex gap-2">
              {c.fix && (
                <Button size="sm" onClick={() => onDecide(c, "accepted")}>
                  Fix it
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDecide(c, c.fix ? "ignored" : "accepted")}
              >
                {c.fix ? "Keep as is" : "Done"}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function HistoryDialog({
  id,
  onClose,
  onRestored,
}: {
  id: string;
  onClose: () => void;
  onRestored: (c: GkCard) => Promise<void>;
}) {
  const listFn = useServerFn(gkVersions);
  const restoreFn = useServerFn(restoreGkVersion);
  const q = useQuery({ queryKey: ["gkVersions", id], queryFn: () => listFn({ data: { id } }) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Earlier versions</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !q.data?.length ? (
          <p className="text-muted-foreground">No earlier versions yet.</p>
        ) : (
          <ul className="space-y-2">
            {q.data.map((v) => (
              <li
                key={v.at}
                className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{v.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(v.at).toLocaleString("en-IN")} · {v.card.title.en}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await onRestored(await restoreFn({ data: { id, at: v.at } }));
                      toast.success("Restored");
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
        )}
      </DialogContent>
    </Dialog>
  );
}
