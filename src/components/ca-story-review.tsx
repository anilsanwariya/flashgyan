// Admin: reading and correcting the day's written news. Every story is a
// collapsed card; opened, it reads like the magazine (Hindi, English or both),
// and in edit mode each line has its own pencil, so the keyboard only opens
// for the line being changed.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Pencil,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  deleteCaItems,
  deleteCaPoint,
  enrichCaItem,
  redoCaVisual,
  updateCaItem,
  type CaItem,
} from "@/lib/current-affairs.functions";
import { CATEGORIES, categoryLabel, type Bi, type CaContent } from "@/lib/current-affairs";
import { VISUAL_LABELS } from "@/lib/ca-visuals";
import { visualPreviewHtml } from "@/lib/current-affairs-html";
import { unitLabel } from "../../supabase/functions/_shared/ras-syllabus.ts";
import { Badge, BulkBar, errorText, useChosen } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Lang = "hi" | "en" | "both";

const LANG_KEY = "ca-review-lang";
const reviewedKey = (date: string) => `ca-reviewed:${date}`;

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, Telegram webview restrictions)
  }
}

// ====================== The list ======================

export function StoryList({
  items,
  date,
  onChanged,
}: {
  items: CaItem[];
  date: string;
  onChanged: () => void;
}) {
  const groups = useMemo(() => {
    const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
    const sorted = [...items].sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
        Number(a.status === "dropped") - Number(b.status === "dropped") ||
        a.position - b.position,
    );
    const map = new Map<string, CaItem[]>();
    for (const it of sorted) map.set(it.category, [...(map.get(it.category) ?? []), it]);
    return [...map.entries()];
  }, [items]);
  const ordered = useMemo(() => groups.flatMap(([, list]) => list), [groups]);
  const number = useMemo(() => new Map(ordered.map((it, i) => [it.id, i + 1])), [ordered]);

  // Hindi on phones, both side by side on wider screens, unless chosen before.
  const [lang, setLangState] = useState<Lang>("both");
  useEffect(() => {
    const saved = readStore<Lang | null>(LANG_KEY, null);
    setLangState(saved ?? (window.matchMedia("(min-width: 640px)").matches ? "both" : "hi"));
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    writeStore(LANG_KEY, l);
  };

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpen(new Set());
    setReviewed(new Set(readStore<string[]>(reviewedKey(date), [])));
  }, [date]);
  const markReviewed = (id: string) =>
    setReviewed((cur) => {
      if (cur.has(id)) return cur;
      const next = new Set(cur).add(id);
      writeStore(reviewedKey(date), [...next]);
      return next;
    });

  const cards = useRef(new Map<string, HTMLElement>());
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        markReviewed(id);
      }
      return next;
    });
  const goNext = (id: string) => {
    const i = ordered.findIndex((it) => it.id === id);
    const next = ordered[i + 1];
    setOpen((cur) => {
      const s = new Set(cur);
      s.delete(id);
      if (next) s.add(next.id);
      return s;
    });
    if (!next) return;
    markReviewed(next.id);
    requestAnimationFrame(() =>
      cards.current.get(next.id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const included = items.filter((i) => i.status === "included").length;
  const unverified = items.reduce((n, i) => n + i.facts.filter((f) => !f.verified).length, 0);
  const done = ordered.filter((it) => reviewed.has(it.id)).length;

  const deleteFn = useServerFn(deleteCaItems);
  const ids = items.map((i) => i.id);
  const { chosen, setChosen, toggle: choose } = useChosen(ids);
  const [busy, setBusy] = useState(false);
  async function deleteMany(list: string[], all: boolean) {
    if (
      !confirm(
        all
          ? `Delete all ${list.length} news items for this day? This can't be undone. The sources stay listed but are not read again; to start over, delete the sources too.`
          : `Delete ${list.length} selected news item(s)? This can't be undone. (To keep an item out of the issue without deleting it, use “Drop”.)`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await deleteFn({ data: { ids: list } });
      setChosen(new Set());
      toast.success(`Deleted ${r.deleted} item(s)`);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="primary">{included} items in the issue</Badge>
        {items.length - included > 0 && <Badge>{items.length - included} dropped</Badge>}
        {unverified > 0 && (
          <Badge
            tone="warn"
            title="The AI's quote for these facts wasn't found word-for-word in the source"
          >
            {unverified} facts to check
          </Badge>
        )}
        <Badge tone="good">
          {items.filter((i) => i.content?.background).length} with background from your notes
        </Badge>
      </div>
      {items.length - included > 0 && (
        <p className="text-xs text-muted-foreground">
          Stories unlikely in the exam, and less important ones beyond your stories-per-day limit
          (Magazine settings), arrive dropped at the bottom. Press “Include” on one to add it and
          write it.
        </p>
      )}

      {/* Reading controls stay in reach while scrolling. */}
      <div className="sticky top-[3.75rem] z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-2 lg:px-2">
        <div className="flex rounded-lg border border-border p-0.5 text-sm" role="group">
          {(
            [
              ["hi", "हिंदी"],
              ["en", "English"],
              ["both", "Both"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setLang(k)}
              aria-pressed={lang === k}
              className={`rounded-md px-3 py-1 ${lang === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          Reviewed{" "}
          <b className={done === ordered.length ? "text-emerald-600" : "text-foreground"}>
            {done} of {ordered.length}
          </b>
        </span>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setOpen(new Set(ordered.map((it) => it.id)));
              ordered.forEach((it) => markReviewed(it.id));
            }}
          >
            Expand all
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(new Set())}>
            Collapse all
          </Button>
        </div>
      </div>

      <BulkBar
        ids={ids}
        chosen={chosen}
        setChosen={setChosen}
        noun="items"
        busy={busy}
        onDelete={deleteMany}
      />

      {groups.map(([cat, list]) => (
        <section key={cat} className="space-y-2">
          <h3 className="pt-2 text-sm font-semibold">
            {categoryLabel(cat).hi} · {categoryLabel(cat).en}
          </h3>
          {list.map((it, i) => (
            <StoryCard
              key={it.id}
              ref={(el) => {
                if (el) cards.current.set(it.id, el);
                else cards.current.delete(it.id);
              }}
              item={it}
              number={number.get(it.id) ?? 0}
              lang={lang}
              open={open.has(it.id)}
              reviewed={reviewed.has(it.id)}
              onToggle={() => toggle(it.id)}
              onNext={number.get(it.id) === ordered.length ? undefined : () => goNext(it.id)}
              selected={chosen.has(it.id)}
              onSelect={(on) => choose(it.id, on)}
              above={list[i - 1]}
              below={list[i + 1]}
              onChanged={onChanged}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

// ====================== One story ======================

type CardProps = {
  item: CaItem;
  number: number;
  lang: Lang;
  open: boolean;
  reviewed: boolean;
  onToggle: () => void;
  onNext?: () => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
  above?: CaItem;
  below?: CaItem;
  onChanged: () => void;
  ref?: React.Ref<HTMLElement>;
};

const UNDO_MS = 5000;

function StoryCard({
  item,
  number,
  lang,
  open,
  reviewed,
  onToggle,
  onNext,
  selected,
  onSelect,
  above,
  below,
  onChanged,
  ref,
}: CardProps) {
  const updateFn = useServerFn(updateCaItem);
  const enrichFn = useServerFn(enrichCaItem);
  const redoFn = useServerFn(redoCaVisual);
  const deletePointFn = useServerFn(deleteCaPoint);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const c = item.content;
  const dropped = item.status === "dropped";
  const unverified = item.facts.filter((f) => !f.verified).length;
  const inVisual = new Set(c?.visual ? (c.visual_covers ?? []) : []);

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(false);
    }
  }
  // Saves one changed part of the text.
  const save = async (patch: Partial<CaContent>) => {
    if (!c) return;
    await updateFn({ data: { id: item.id, content: { ...c, ...patch } } });
    onChanged();
  };
  const swap = (other?: CaItem) =>
    other &&
    act(async () => {
      await updateFn({ data: { id: item.id, position: other.position } });
      await updateFn({
        data: {
          id: other.id,
          position: item.position === other.position ? item.position + 1 : item.position,
        },
      });
    });

  // A deleted key point is hidden at once and removed (with its fact) after a
  // few seconds, unless undone. Pending deletes are sent if the card goes away.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef({ deletePointFn, id: item.id, onChanged, redoFn });
  latest.current = { deletePointFn, id: item.id, onChanged, redoFn };
  const commitDelete = async (text: string) => {
    clearTimeout(timers.current.get(text));
    timers.current.delete(text);
    const { deletePointFn: del, id, onChanged: changed, redoFn: redo } = latest.current;
    try {
      const r = await del({ data: { id, text } });
      changed();
      if (r.visualShowsIt) {
        toast("The visual still shows the deleted point", {
          duration: 10_000,
          action: {
            label: "Redo visual",
            onClick: () => void redo({ data: { id } }).then(changed, () => undefined),
          },
        });
      }
    } catch (e) {
      setHidden((cur) => {
        const next = new Set(cur);
        next.delete(text);
        return next;
      });
      toast.error(errorText(e, "Couldn't delete the point"));
    }
  };
  const deletePoint = (text: string) => {
    setHidden((cur) => new Set(cur).add(text));
    timers.current.set(
      text,
      setTimeout(() => void commitDelete(text), UNDO_MS),
    );
    toast("Key point deleted", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timers.current.get(text));
          timers.current.delete(text);
          setHidden((cur) => {
            const next = new Set(cur);
            next.delete(text);
            return next;
          });
        },
      },
    });
  };
  useEffect(() => {
    const flush = () => {
      for (const text of [...timers.current.keys()]) void commitDelete(text);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  // Forget hidden points once the server copy no longer has them.
  useEffect(() => {
    setHidden((cur) => {
      const live = new Set(item.facts.map((f) => f.text));
      const next = new Set([...cur].filter((t) => live.has(t) && timers.current.has(t)));
      return next.size === cur.size ? cur : next;
    });
  }, [item.facts]);

  const headHi = c?.headline.hi || item.headline;
  const headEn = c?.headline.en || "";

  return (
    <article
      ref={ref}
      className={`scroll-mt-32 overflow-hidden rounded-2xl border bg-card transition-shadow lg:scroll-mt-20 ${selected ? "border-primary ring-1 ring-primary/30" : "border-border"} ${open ? "shadow-sm" : ""} ${dropped ? "opacity-60" : ""}`}
    >
      {/* Collapsed header: tap to open or close. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer items-start gap-3 p-3 sm:p-4"
      >
        <span onClick={(e) => e.stopPropagation()} className="pt-1">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelect(v === true)}
            aria-label="Select item"
          />
        </span>
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${reviewed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-primary/10 text-primary"}`}
          title={reviewed ? "Reviewed" : "Not opened yet"}
        >
          {reviewed ? <Check className="h-3.5 w-3.5" /> : number}
        </span>
        <div className="min-w-0 flex-1">
          {lang !== "en" && (
            <div lang="hi" className="font-semibold leading-snug">
              {headHi}
            </div>
          )}
          {lang !== "hi" && headEn && (
            <div
              className={
                lang === "en" ? "font-semibold leading-snug" : "text-sm text-muted-foreground"
              }
            >
              {headEn}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge>{categoryLabel(item.category).en}</Badge>
            <Badge title="Exam importance">
              {"★".repeat(item.importance)}
              {"☆".repeat(3 - item.importance)}
            </Badge>
            {unverified > 0 && (
              <Badge tone="warn">
                <AlertTriangle className="h-3 w-3" /> {unverified} to check
              </Badge>
            )}
            {c?.visual && (
              <Badge tone="primary">
                <BarChart3 className="h-3 w-3" /> {VISUAL_LABELS[c.visual.type]}
              </Badge>
            )}
            {item.related_item_id && <Badge tone="primary">Follow-up</Badge>}
            {dropped && <Badge tone="bad">Dropped</Badge>}
            {item.enrich_error && <Badge tone="bad">Writing failed</Badge>}
            {(item.needs_enrich || !c) && !item.enrich_error && (
              <Badge tone="warn">Not written</Badge>
            )}
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-3 text-[15px] leading-relaxed sm:p-4 sm:text-sm">
          {/* Section, importance and notes */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={item.category}
              onValueChange={(v) => act(() => updateFn({ data: { id: item.id, category: v } }))}
            >
              <SelectTrigger className="h-8 w-auto gap-1 rounded-full px-3 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(() =>
                  updateFn({ data: { id: item.id, importance: (item.importance % 3) + 1 } }),
                )
              }
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              title="Exam importance (tap to change)"
            >
              {"★".repeat(item.importance)}
              {"☆".repeat(3 - item.importance)}
            </button>
            {item.rajasthan && <Badge tone="warn">Rajasthan</Badge>}
            {item.unit && <Badge>{unitLabel(item.unit)}</Badge>}
            {c?.background ? (
              <Badge tone="good">
                Background: {item.context_sources.map((s) => s.title).join(", ") || "your notes"}
              </Badge>
            ) : (
              c && <Badge>No related notes</Badge>
            )}
            {item.enrich_error && (
              <span className="w-full text-xs text-destructive">{item.enrich_error}</span>
            )}
            {(item.needs_enrich || !c) && (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy}
                onClick={() => act(() => enrichFn({ data: { id: item.id } }))}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Write text
              </Button>
            )}
          </div>

          {c ? (
            <>
              {editing && (
                <Part title="Headline · शीर्षक">
                  <BiLine
                    value={c.headline}
                    lang={lang}
                    editing
                    strong
                    onSave={(v) => save({ headline: v })}
                  />
                </Part>
              )}

              <BiLine
                value={c.summary}
                lang={lang}
                editing={editing}
                onSave={(v) => save({ summary: v })}
              />

              <VisualBox
                content={c}
                busy={busy}
                onRemove={() => act(() => save({ visual: null }), "Visual removed")}
                onRedo={() => act(() => redoFn({ data: { id: item.id } }), "New visual made")}
              />

              <Part title="Key points · मुख्य बिंदु">
                <ul className="space-y-2">
                  {c.points.map((p, i) => {
                    const factText = item.facts[i]?.text ?? "";
                    if (hidden.has(factText)) return null;
                    return (
                      <li key={`${i}-${factText}`} className="flex gap-2">
                        <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <BiLine
                            value={p}
                            lang={lang}
                            editing={editing}
                            faded={inVisual.has(i)}
                            onSave={(v) =>
                              save({ points: c.points.map((x, j) => (j === i ? v : x)) })
                            }
                            onDelete={
                              item.facts[i] ? () => deletePoint(item.facts[i].text) : undefined
                            }
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Part>

              {(c.why.en || c.why.hi || editing) && (
                <Part title="Why it matters · महत्व" tone="why">
                  <BiLine
                    value={c.why}
                    lang={lang}
                    editing={editing}
                    onSave={(v) => save({ why: v })}
                  />
                </Part>
              )}

              {c.background && (
                <Part title="Background · पृष्ठभूमि" tone="background">
                  <BiLine
                    value={c.background}
                    lang={lang}
                    editing={editing}
                    onSave={(v) => save({ background: v })}
                    onDelete={() => act(() => save({ background: null }), "Background removed")}
                  />
                </Part>
              )}

              {c.dyk && c.dyk.length > 0 && (
                <Part title="Did you know? · क्या आप जानते हैं?" tone="dyk">
                  <ul className="space-y-2">
                    {c.dyk.map((d, i) => (
                      <li key={d.url + i} className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <BiLine value={d} lang={lang} />
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                            title={`“${d.quote}”`}
                          >
                            {d.site}
                          </a>
                        </div>
                        <IconButton
                          label="Remove this fact"
                          disabled={busy}
                          onClick={() => act(() => save({ dyk: c.dyk!.filter((_, j) => j !== i) }))}
                        >
                          <X className="h-4 w-4" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </Part>
              )}

              {c.mcq && (
                <Part title="Practice MCQ · अभ्यास प्रश्न">
                  <div className="space-y-2">
                    <BiLine
                      value={c.mcq.question}
                      lang={lang}
                      editing={editing}
                      preLine
                      onSave={(v) => save({ mcq: { ...c.mcq!, question: v } })}
                    />
                    <ol className="space-y-1.5">
                      {c.mcq.options.map((o, i) => {
                        const right = c.mcq!.answer === i;
                        return (
                          <li
                            key={i}
                            className={`flex items-start gap-2 rounded-lg px-2 py-1 ${right ? "bg-emerald-500/10" : ""}`}
                          >
                            <span
                              className={`mt-0.5 font-semibold ${right ? "text-emerald-700 dark:text-emerald-400" : "text-primary"}`}
                            >
                              ({"abcd"[i]})
                            </span>
                            <div className="min-w-0 flex-1">
                              <BiLine
                                value={o}
                                lang={lang}
                                editing={editing}
                                onSave={(v) =>
                                  save({
                                    mcq: {
                                      ...c.mcq!,
                                      options: c.mcq!.options.map((x, j) => (j === i ? v : x)),
                                    },
                                  })
                                }
                              />
                            </div>
                            {right ? (
                              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              editing && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 shrink-0 px-2 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      () => save({ mcq: { ...c.mcq!, answer: i } }),
                                      "Answer changed",
                                    )
                                  }
                                >
                                  Mark correct
                                </Button>
                              )
                            )}
                          </li>
                        );
                      })}
                    </ol>
                    <div className="rounded-lg bg-muted/50 p-2 text-sm">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Explanation · व्याख्या
                      </span>
                      <BiLine
                        value={c.mcq.explanation}
                        lang={lang}
                        editing={editing}
                        onSave={(v) => save({ mcq: { ...c.mcq!, explanation: v } })}
                      />
                    </div>
                    {editing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Remove this MCQ from the story?"))
                            void act(() => save({ mcq: null }), "MCQ removed");
                        }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Remove MCQ
                      </Button>
                    )}
                  </div>
                </Part>
              )}

              {c.mains && (
                <Part title="Mains question · मुख्य परीक्षा प्रश्न">
                  <BiLine
                    value={c.mains}
                    lang={lang}
                    editing={editing}
                    onSave={(v) => save({ mains: v })}
                    onDelete={() => act(() => save({ mains: null }), "Mains question removed")}
                  />
                </Part>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This story hasn't been written yet. Press “Write text”.
            </p>
          )}

          {/* Facts and the source quotes behind them */}
          <div>
            <button
              type="button"
              onClick={() => setShowFacts((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${showFacts ? "rotate-90" : ""}`}
              />
              Facts and source quotes ({item.facts.length})
              {unverified > 0 && <span className="text-amber-600"> · {unverified} to check</span>}
            </button>
            {showFacts && (
              <ul className="mt-2 space-y-1.5 text-xs">
                {item.facts.map((f, i) => (
                  <li
                    key={i}
                    className={`rounded-lg border p-2 ${f.verified ? "border-border" : "border-amber-500/50 bg-amber-500/5"}`}
                  >
                    <div className="flex items-start gap-1.5">
                      {f.verified ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <span>
                        {f.text}
                        {f.corrected && <Badge tone="primary">corrected</Badge>}
                      </span>
                    </div>
                    <div className="mt-1 pl-5 italic text-muted-foreground">“{f.quote}”</div>
                    {!f.verified && (
                      <div className="pl-5 text-amber-700 dark:text-amber-400">
                        This quote wasn't found word-for-word in the source. Check the fact before
                        approving.
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions, in thumb reach at the end of the story */}
          <div className="-mx-3 -mb-3 flex flex-wrap items-center gap-1.5 border-t border-border bg-muted/30 p-2 sm:-mx-4 sm:-mb-4 sm:px-4">
            {c && (
              <Button
                size="sm"
                variant={editing ? "default" : "outline"}
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? (
                  <>
                    <Check className="mr-1 h-4 w-4" /> Done editing
                  </>
                ) : (
                  <>
                    <Pencil className="mr-1 h-4 w-4" /> Edit
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                act(
                  async () => {
                    await updateFn({
                      data: { id: item.id, status: dropped ? "included" : "dropped" },
                    });
                    // Stories that arrived dropped were never written.
                    if (dropped && item.needs_enrich) await enrichFn({ data: { id: item.id } });
                  },
                  dropped ? "Back in the issue" : "Dropped from the issue",
                )
              }
            >
              {dropped ? (
                "Include"
              ) : (
                <>
                  <XCircle className="mr-1 h-4 w-4" /> Drop
                </>
              )}
            </Button>
            <IconButton label="Move up" disabled={busy || !above} onClick={() => swap(above)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label="Move down" disabled={busy || !below} onClick={() => swap(below)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <div className="ml-auto">
              {onNext ? (
                <Button size="sm" onClick={onNext}>
                  Next story <ChevronRight className="ml-0.5 h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={onToggle}>
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// ====================== Pieces ======================

function IconButton({
  label,
  children,
  onClick,
  disabled,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={`h-8 w-8 shrink-0 ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const PART_TONES = {
  plain: "",
  why: "rounded-xl bg-primary/5 p-2.5",
  background: "rounded-xl bg-emerald-500/5 p-2.5",
  dyk: "rounded-xl border border-dashed border-sky-400/50 bg-sky-500/5 p-2.5",
};

function Part({
  title,
  tone = "plain",
  children,
}: {
  title: string;
  tone?: keyof typeof PART_TONES;
  children: React.ReactNode;
}) {
  return (
    <section className={PART_TONES[tone]}>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

// A bilingual line shown as plain text. In edit mode it gets a pencil (and a
// bin when it can be deleted); only the pencil opens text boxes for it.
function BiLine({
  value,
  lang,
  editing = false,
  strong = false,
  preLine = false,
  faded = false,
  onSave,
  onDelete,
}: {
  value: Bi;
  lang: Lang;
  editing?: boolean;
  strong?: boolean;
  preLine?: boolean;
  // Shown in the visual, so not printed as a point.
  faded?: boolean;
  onSave?: (v: Bi) => Promise<void>;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Bi | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(null);
  }, [editing]);

  if (draft) {
    return (
      <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-2">
        <GrowText
          lang="hi"
          value={draft.hi}
          placeholder="हिंदी"
          autoFocus
          onChange={(hi) => setDraft({ ...draft, hi })}
        />
        <GrowText
          value={draft.en}
          placeholder="English"
          onChange={(en) => setDraft({ ...draft, en })}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving || !(draft.hi.trim() || draft.en.trim())}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave?.({ hi: draft.hi.trim(), en: draft.en.trim() });
                setDraft(null);
                toast.success("Saved");
              } catch (e) {
                toast.error(errorText(e, "Couldn't save"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const cls = `${strong ? "font-semibold" : ""} ${preLine ? "whitespace-pre-line" : ""}`;
  const hi = value.hi.trim();
  const en = value.en.trim();
  const same = hi === en;
  const text =
    lang === "hi" ? (
      <p lang="hi" className={cls}>
        {hi || en}
      </p>
    ) : lang === "en" ? (
      <p className={cls}>{en || hi}</p>
    ) : same || !hi || !en ? (
      <p className={cls}>{hi || en}</p>
    ) : (
      <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
        <p lang="hi" className={cls}>
          {hi}
        </p>
        <p className={`${cls} text-muted-foreground`}>{en}</p>
      </div>
    );

  const shown = faded ? (
    <div className="opacity-50" title="Shown in the visual, so not printed as a point">
      {text}
    </div>
  ) : (
    text
  );
  if (!editing || !onSave) return shown;
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">{shown}</div>
      <IconButton label="Edit this line" onClick={() => setDraft({ ...value })}>
        <Pencil className="h-4 w-4" />
      </IconButton>
      {onDelete && (
        <IconButton
          label="Delete (both languages)"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
}

// A text box that grows with its text, so it never scrolls on its own.
function GrowText({
  value,
  onChange,
  placeholder,
  lang,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  lang?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      lang={lang}
      rows={1}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-0 resize-none overflow-hidden bg-background text-base leading-relaxed"
    />
  );
}

// The story's visual as it will print, with the revision line.
function VisualBox({
  content,
  busy,
  onRemove,
  onRedo,
}: {
  content: CaContent;
  busy: boolean;
  onRemove: () => void;
  onRedo: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const v = content.visual;
  const html = useMemo(() => (v ? visualPreviewHtml(v) : ""), [v]);
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(Math.min(900, doc.body.scrollHeight + 4));
  };
  return (
    <div className="rounded-xl border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <BarChart3 className="h-3.5 w-3.5" />
          {v ? `Visual · ${VISUAL_LABELS[v.type]}` : "No visual"}
        </span>
        {v && (content.visual_covers?.length ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground">
            Shows {content.visual_covers!.length} fact(s), left out of the points
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={onRedo}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> {v ? "Redo" : "Make visual"}
          </Button>
          {v && (
            <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {v && (
        <iframe
          ref={frame}
          title="Visual preview"
          srcDoc={html}
          onLoad={() => {
            fit();
            // Web fonts can change the height after load.
            setTimeout(fit, 600);
          }}
          className="mt-2 w-full rounded-lg bg-white"
          style={{ height }}
        />
      )}
      {content.oneliner && (content.oneliner.en || content.oneliner.hi) && (
        <p className="mt-2 text-xs">
          <span className="font-semibold text-muted-foreground">Revision line: </span>
          <span lang="hi">{content.oneliner.hi}</span>
          <span className="text-muted-foreground"> · {content.oneliner.en}</span>
        </p>
      )}
    </div>
  );
}
