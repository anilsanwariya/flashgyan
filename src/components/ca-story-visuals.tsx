// A story's visuals (up to two). The editor picks a type from the list
// (types that the facts likely can't make are marked, with the reason), adds
// a note if they like, and sees SAATHI's visual before it replaces anything.
// Any visual's text and numbers can also be changed by hand.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BarChart3,
  Columns2,
  GitFork,
  LayoutList,
  ListOrdered,
  Network,
  PieChart,
  Plus,
  RefreshCw,
  Repeat,
  Sparkles,
  Table2,
  ThumbsUp,
  Timer,
  Trash2,
  TrendingUp,
  Workflow,
  Hash,
} from "lucide-react";
import { previewCaVisual, type CaItem } from "@/lib/current-affairs.functions";
import { VISUAL_SLOTS, type Bi, type CaContent } from "@/lib/current-affairs";
import {
  VISUAL_INFO,
  VISUAL_LABELS,
  coveredFacts,
  unverifiedNumbers,
  visualFit,
  type Visual,
  type VisualType,
} from "@/lib/ca-visuals";
import { visualPreviewHtml } from "@/lib/current-affairs-html";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Slot = 1 | 2;
const keysOf = (slot: Slot) => VISUAL_SLOTS[slot - 1];

const ICONS: Record<VisualType, typeof BarChart3> = {
  glance: LayoutList,
  stats: Hash,
  table: Table2,
  compare: Columns2,
  change: ArrowRightLeft,
  timeline: Timer,
  flow: Workflow,
  cycle: Repeat,
  bar: BarChart3,
  pie: PieChart,
  trend: TrendingUp,
  ranking: ListOrdered,
  proscons: ThumbsUp,
  hierarchy: Network,
  mindmap: GitFork,
};

// The visual as the magazine prints it, both languages, in a frame.
function VisualFrame({ visual }: { visual: Visual }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const html = useMemo(() => visualPreviewHtml(visual), [visual]);
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(Math.min(900, doc.body.scrollHeight + 4));
  };
  return (
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
  );
}

export function StoryVisuals({
  item,
  content,
  busy,
  onSave,
}: {
  item: CaItem;
  content: CaContent;
  busy: boolean;
  onSave: (patch: Partial<CaContent>) => Promise<void>;
}) {
  const [picking, setPicking] = useState<Slot | null>(null);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (patch: Partial<CaContent>, ok: string) => {
    setSaving(true);
    try {
      await onSave(patch);
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };
  // Removing the first visual moves the second up.
  const remove = (slot: Slot) =>
    run(
      slot === 1
        ? {
            visual: content.visual2 ?? null,
            visual_covers: content.visual2 ? (content.visual2_covers ?? []) : [],
            visual2: null,
            visual2_covers: [],
          }
        : { visual2: null, visual2_covers: [] },
      "Visual removed",
    );
  const slots: Slot[] = content.visual2 ? [1, 2] : [1];
  const off = busy || saving;
  return (
    <div className="space-y-2">
      {slots.map((slot) => {
        const [key, coversKey] = keysOf(slot);
        const v = content[key] ?? null;
        const covers = content[coversKey] ?? [];
        return (
          <div key={slot} className="rounded-xl border border-border p-2.5" data-visual-slot={slot}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <BarChart3 className="h-3.5 w-3.5" />
                {v
                  ? `${content.visual2 ? `Visual ${slot}` : "Visual"} · ${VISUAL_LABELS[v.type]}`
                  : "No visual"}
              </span>
              {v && covers.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Shows {covers.length} fact(s), left out of the points
                </span>
              )}
              <div className="ml-auto flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={off}
                  onClick={() => setPicking(slot)}
                >
                  {v ? (
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Plus className="mr-1 h-3.5 w-3.5" />
                  )}{" "}
                  {v ? "Rebuild" : "Make visual"}
                </Button>
                {v && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={off}
                    onClick={() => setEditingSlot(slot)}
                  >
                    Edit visual
                  </Button>
                )}
                {v && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={off}
                    onClick={() => void remove(slot)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {v && <VisualFrame visual={v} />}
          </div>
        );
      })}
      {content.visual && !content.visual2 && (
        <Button size="sm" variant="ghost" disabled={off} onClick={() => setPicking(2)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add a second visual
        </Button>
      )}
      {picking && (
        <VisualPicker
          item={item}
          slot={picking}
          current={content[keysOf(picking)[0]] ?? null}
          onClose={() => setPicking(null)}
          onKeep={async (visual, covers) => {
            const [key, coversKey] = keysOf(picking);
            await onSave({ [key]: visual, [coversKey]: covers });
            setPicking(null);
            toast.success("Visual saved");
          }}
        />
      )}
      {editingSlot && content[keysOf(editingSlot)[0]] && (
        <VisualEditor
          item={item}
          visual={content[keysOf(editingSlot)[0]]!}
          covers={content[keysOf(editingSlot)[1]] ?? []}
          onClose={() => setEditingSlot(null)}
          onSave={async (visual, covers) => {
            const [key, coversKey] = keysOf(editingSlot);
            await onSave({ [key]: visual, [coversKey]: covers });
            setEditingSlot(null);
            toast.success("Visual saved");
          }}
        />
      )}
    </div>
  );
}

// ---------- Choosing a type ----------

function VisualPicker({
  item,
  slot,
  current,
  onClose,
  onKeep,
}: {
  item: CaItem;
  slot: Slot;
  current: Visual | null;
  onClose: () => void;
  onKeep: (visual: Visual, covers: number[]) => Promise<void>;
}) {
  const previewFn = useServerFn(previewCaVisual);
  const [type, setType] = useState<VisualType | "auto">("auto");
  const [note, setNote] = useState("");
  const [making, setMaking] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [made, setMade] = useState<{ visual: Visual; covers: number[] } | null>(null);
  const make = async () => {
    setMaking(true);
    try {
      setMade(
        await previewFn({
          data: {
            id: item.id,
            slot,
            ...(type === "auto" ? {} : { type }),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        }),
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't make the visual"));
    } finally {
      setMaking(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {current ? "Rebuild the visual" : slot === 2 ? "Add a second visual" : "Make a visual"}
          </DialogTitle>
          <DialogDescription>
            Pick the kind of visual. SAATHI builds it from this story's facts only.
          </DialogDescription>
        </DialogHeader>
        {!made ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Visual type">
              <TypeCard
                selected={type === "auto"}
                onSelect={() => setType("auto")}
                icon={Sparkles}
                label="Let SAATHI choose"
                hint="The type that suits these facts best"
              />
              {VISUAL_INFO.map((info) => {
                const why = visualFit(info.type, item.facts);
                return (
                  <TypeCard
                    key={info.type}
                    selected={type === info.type}
                    onSelect={() => setType(info.type)}
                    icon={ICONS[info.type]}
                    label={info.label}
                    hint={info.hint}
                    warn={why}
                    current={current?.type === info.type}
                  />
                );
              })}
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for SAATHI, e.g. compare with the 2023 figures"
              rows={2}
              maxLength={300}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={making}>
                Cancel
              </Button>
              <Button onClick={() => void make()} disabled={making}>
                {making ? "Making…" : "Make visual"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{VISUAL_LABELS[made.visual.type]}</p>
            <VisualFrame visual={made.visual} />
            <p className="text-xs text-muted-foreground">
              {current
                ? "Nothing has changed yet: Keep replaces the current visual (it stays in the story's history)."
                : "Nothing is saved until you keep it."}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={keeping || making}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setMade(null);
                  void make();
                }}
                disabled={keeping || making}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> {making ? "Making…" : "Try again"}
              </Button>
              <Button variant="ghost" onClick={() => setMade(null)} disabled={keeping || making}>
                Another type
              </Button>
              <Button
                onClick={async () => {
                  setKeeping(true);
                  try {
                    await onKeep(made.visual, made.covers);
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't save"));
                  } finally {
                    setKeeping(false);
                  }
                }}
                disabled={keeping || making}
              >
                {keeping ? "Saving…" : "Keep"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TypeCard({
  selected,
  onSelect,
  icon: Icon,
  label,
  hint,
  warn,
  current,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof BarChart3;
  label: string;
  hint: string;
  warn?: string | null;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-muted/50"
      } ${warn && !selected ? "opacity-60" : ""}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {label}
          {current && (
            <span className="rounded bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">
              now
            </span>
          )}
          {!warn && label !== "Let SAATHI choose" && (
            <span className="rounded bg-emerald-500/10 px-1.5 text-[10px] font-normal text-emerald-700 dark:text-emerald-400">
              Fits
            </span>
          )}
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
        {warn && (
          <span className="block text-xs text-amber-700 dark:text-amber-400">
            May not fit: {warn}
          </span>
        )}
      </span>
    </button>
  );
}

// ---------- Editing by hand ----------

const blankBi = (): Bi => ({ en: "", hi: "" });

// A new, empty entry for a list in the visual.
function blankLike(sample: unknown): unknown {
  if (Array.isArray(sample)) return sample.map(blankLike);
  if (sample && typeof sample === "object") {
    const o = sample as Record<string, unknown>;
    if (typeof o.en === "string" && typeof o.hi === "string") return blankBi();
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, Array.isArray(v) && k === "items" ? [] : blankLike(v)]),
    );
  }
  if (typeof sample === "number") return 0;
  if (typeof sample === "boolean") return false;
  return "";
}

// Entries for lists that can be empty (a hierarchy part's items).
const EMPTY_LIST_ITEM: Record<string, () => unknown> = { items: blankBi };

const NAMES: Record<string, string> = {
  title: "Title",
  unit: "Unit",
  center: "Centre",
  root: "Head",
  a: "First",
  b: "Second",
  aspect: "Aspect",
  when: "When",
  text: "Text",
  value: "Value",
  label: "Label",
  from: "Before",
  to: "After",
  rank: "Rank",
  highlight: "The news is about this one",
  stats: "Numbers",
  bars: "Bars",
  slices: "Slices",
  events: "Events",
  steps: "Steps",
  columns: "Columns",
  rows: "Rows",
  branches: "Branches",
  changes: "Changes",
  points: "Points",
  items: "Entries",
  pros: "Benefits",
  cons: "Challenges",
  children: "Parts",
};

function BiInputs({ value, onChange }: { value: Bi; onChange: (b: Bi) => void }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      <Input
        lang="hi"
        value={value.hi}
        placeholder="हिंदी"
        onChange={(e) => onChange({ ...value, hi: e.target.value })}
      />
      <Input
        value={value.en}
        placeholder="English"
        onChange={(e) => onChange({ ...value, en: e.target.value })}
      />
    </div>
  );
}

function Field({
  name,
  value,
  onChange,
  onListChange,
}: {
  name: string;
  value: unknown;
  onChange: (v: unknown) => void;
  // A table's columns: adding or removing one changes every row too.
  onListChange?: (op: { add?: true; remove?: number; move?: [number, number] }) => void;
}) {
  const label = NAMES[name] ?? (/^\d+$/.test(name) ? `#${Number(name) + 1}` : name);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (typeof o.en === "string" && typeof o.hi === "string") {
      return (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <BiInputs value={o as Bi} onChange={onChange} />
        </label>
      );
    }
    return (
      <div className="space-y-2">
        {Object.entries(o).map(([k, v]) => (
          <Field key={k} name={k} value={v} onChange={(nv) => onChange({ ...o, [k]: nv })} />
        ))}
      </div>
    );
  }
  if (Array.isArray(value)) {
    const list = value;
    const change = (next: unknown[]) => onChange(next);
    const add = () => {
      if (onListChange) return onListChange({ add: true });
      const sample = list[0];
      change([
        ...list,
        sample !== undefined ? blankLike(sample) : (EMPTY_LIST_ITEM[name]?.() ?? blankBi()),
      ]);
    };
    return (
      <fieldset className="space-y-2 rounded-lg border border-border p-2">
        <legend className="px-1 text-xs font-semibold">{label}</legend>
        {list.map((x, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <Field
                name={String(i)}
                value={x}
                onChange={(nv) => change(list.map((y, j) => (j === i ? nv : y)))}
              />
            </div>
            <div className="flex shrink-0 flex-col">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => {
                  if (onListChange) return onListChange({ move: [i, i - 1] });
                  const next = [...list];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  change(next);
                }}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Move down"
                disabled={i === list.length - 1}
                onClick={() => {
                  if (onListChange) return onListChange({ move: [i, i + 1] });
                  const next = [...list];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  change(next);
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                aria-label="Delete"
                onClick={() =>
                  onListChange
                    ? onListChange({ remove: i })
                    : change(list.filter((_, j) => j !== i))
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </fieldset>
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Input
          type="number"
          step="any"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        />
      </label>
    );
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function VisualEditor({
  item,
  visual,
  covers,
  onClose,
  onSave,
}: {
  item: CaItem;
  visual: Visual;
  covers: number[];
  onClose: () => void;
  onSave: (visual: Visual, covers: number[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Visual>(() => JSON.parse(JSON.stringify(visual)));
  const [saving, setSaving] = useState(false);
  // The preview catches up once typing pauses (each update reloads it).
  const [shown, setShown] = useState(draft);
  useEffect(() => {
    const t = setTimeout(() => setShown(draft), 400);
    return () => clearTimeout(t);
  }, [draft]);
  const { type: _type, ...fields } = draft as Visual & Record<string, unknown>;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }) as Visual);
  // A table's columns and rows change together.
  const columnOp =
    draft.type === "table"
      ? (op: { add?: true; remove?: number; move?: [number, number] }) =>
          setDraft((d) => {
            if (d.type !== "table") return d;
            const each = <T,>(xs: T[], blank: T) =>
              op.add
                ? [...xs, blank]
                : op.remove !== undefined
                  ? xs.filter((_, j) => j !== op.remove)
                  : (() => {
                      const [a, b] = op.move!;
                      const next = [...xs];
                      [next[a], next[b]] = [next[b], next[a]];
                      return next;
                    })();
            return {
              ...d,
              columns: each(d.columns, blankBi()),
              rows: d.rows.map((r) => each(r, blankBi())),
            };
          })
      : undefined;
  const stray = unverifiedNumbers(draft, item.facts, item.headline);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit the {VISUAL_LABELS[draft.type].toLowerCase()}</DialogTitle>
          <DialogDescription>
            Change any text or number. Text you change in one language is written in the other when
            you save, unless you change both.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2.5">
            {Object.entries(fields).map(([k, v]) => (
              <Field
                key={k}
                name={k}
                value={v}
                onChange={(nv) => set(k, nv)}
                onListChange={k === "columns" ? columnOp : undefined}
              />
            ))}
          </div>
          <div className="lg:sticky lg:top-0 lg:self-start">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <VisualFrame visual={shown} />
          </div>
        </div>
        {stray.length > 0 && (
          <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
            Not in the story's facts: {stray.join(", ")}. Check them before saving; a correction to
            this story later removes a visual with numbers outside its facts.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(
                  draft,
                  coveredFacts(
                    draft,
                    covers.map((i) => i + 1),
                    item.facts,
                  ),
                );
              } catch (e) {
                toast.error(errorText(e, "Couldn't save"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save visual"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
