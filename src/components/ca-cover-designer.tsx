// Admin: magazine covers. The daily layout picker (Settings → Covers & ads)
// and the monthly issue's cover and ads (Monthly page → Cover, Ads &
// printing): a design, colours, a blurred background photo, framed photos,
// words, saved covers, ad pages after sections and the back cover, with a
// live preview of the real cover.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  ImagePlus,
  Maximize2,
  Trash2,
  X,
} from "lucide-react";
import {
  getCaIssueDesign,
  getMagazineSettings,
  previewCaCover,
  saveCaCoverPresets,
  saveCaIssueDesign,
  uploadCaCoverPhoto,
} from "@/lib/current-affairs.functions";
import { getCaMagDesign, saveCaMagDesign } from "@/lib/ca-mags.functions";
import {
  BINDINGS,
  DAILY_LAYOUTS,
  DEFAULT_ISSUE_DESIGN,
  MONTHLY_DESIGNS,
  applyPreset,
  designInfo,
  type Binding,
  type CoverPhoto,
  type CoverPreset,
  type IssueDesign,
  type MagazineAd,
  type MonthlyCover,
} from "@/lib/ca-covers";
import { CATEGORIES, categoryLabel, type Bi } from "@/lib/current-affairs";
import { prepareImage, toBase64 } from "@/lib/ca-image-file";
import { SketchPicker } from "@/components/ca-cover-sketch";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Lang = "en" | "hi";

// ---------- Live preview ----------

// The cover at A4 size (794 × 1123 CSS px), scaled to the box's width.
export function CoverPreview({ html, label }: { html: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = w / 794;
  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-lg border border-border bg-white shadow-sm"
      style={{ height: Math.round(1123 * scale) }}
    >
      <iframe
        title={label}
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{
          width: 794,
          height: 1123,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      />
    </div>
  );
}

// A value that settles: the preview waits until typing stops.
function useSettled<T>(value: T, ms = 600): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="radiogroup" aria-label="Preview language" className="flex gap-1">
      {(["hi", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => onChange(l)}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${lang === l ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          {l === "hi" ? "हिंदी" : "English"}
        </button>
      ))}
    </div>
  );
}

type PreviewArgs = {
  kind: "daily" | "monthly";
  period: string;
  design?: IssueDesign;
  daily_cover?: string;
  // A custom magazine's cover.
  mag?: string;
};

function PreviewBox(props: PreviewArgs) {
  const fn = useServerFn(previewCaCover);
  const [lang, setLang] = useState<Lang>("hi");
  const [big, setBig] = useState(false);
  const settled = useSettled({ ...props, lang });
  const q = useQuery({
    queryKey: ["caCoverPreview", JSON.stringify(settled)],
    queryFn: () =>
      fn({
        data: {
          kind: settled.kind,
          period: settled.period,
          lang: settled.lang,
          design: settled.design as unknown as Record<string, unknown> | undefined,
          daily_cover: settled.daily_cover,
          mag: settled.mag,
        },
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="min-w-0 space-y-2" data-testid="cover-preview">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {q.isFetching ? "Updating…" : "Live preview"}
        </span>
        <div className="flex items-center gap-1">
          <LangToggle lang={lang} onChange={setLang} />
          <button
            type="button"
            aria-label="Open full size"
            title="Open full size"
            disabled={!q.data}
            onClick={() => setBig(true)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {q.data ? (
        <CoverPreview html={q.data.html} label="Cover preview" />
      ) : q.error ? (
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't show the cover")}</p>
      ) : (
        <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
      )}
      {big && q.data && (
        <Dialog open onOpenChange={(o) => !o && setBig(false)}>
          <DialogContent className="max-h-[94dvh] max-w-2xl overflow-y-auto p-3">
            <DialogHeader className="sr-only">
              <DialogTitle>Cover, full size</DialogTitle>
            </DialogHeader>
            <CoverPreview html={q.data.html} label="Cover, full size" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Laptops: the preview beside the form, staying in view. Phones: a button
// that opens it.
function PreviewAside(props: PreviewArgs) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden min-w-0 lg:sticky lg:top-20 lg:block lg:self-start">
        <PreviewBox {...props} />
      </aside>
      <div className="lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Eye className="mr-1 h-4 w-4" /> Preview the cover
        </Button>
        {open && (
          <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
            <DialogContent className="max-h-[94dvh] overflow-y-auto p-3">
              <DialogHeader className="sr-only">
                <DialogTitle>Cover preview</DialogTitle>
              </DialogHeader>
              <PreviewBox {...props} />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );
}

// ---------- Small parts ----------

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; name: string; hint?: string }[];
  value: string;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-xl border px-3 py-2 text-left ${value === o.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
        >
          <span className="block text-sm font-medium">{o.name}</span>
          {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function AdSelect({
  label,
  value,
  ads,
  onChange,
  none = "No ad",
}: {
  label: string;
  value: string;
  ads: MagazineAd[];
  onChange: (v: string) => void;
  none?: string;
}) {
  return (
    <select
      aria-label={label}
      value={ads.some((a) => a.id === value) ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">{none}</option>
      {ads.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

function PhotoPick({
  label,
  multiple,
  disabled,
  onFiles,
}: {
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (f: File[]) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <ImagePlus className="h-4 w-4" /> {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiple}
        className="hidden"
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function BiFields({
  label,
  value,
  onChange,
  placeholder,
  max,
}: {
  label: string;
  value: Bi;
  onChange: (v: Bi) => void;
  placeholder?: Bi;
  max: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input
        lang="hi"
        aria-label={`${label} (Hindi)`}
        placeholder={placeholder?.hi ?? `${label} (हिंदी)`}
        maxLength={max}
        value={value.hi}
        onChange={(e) => onChange({ ...value, hi: e.target.value })}
      />
      <Input
        aria-label={`${label} (English)`}
        placeholder={placeholder?.en ?? `${label} (English)`}
        maxLength={max}
        value={value.en}
        onChange={(e) => onChange({ ...value, en: e.target.value })}
      />
    </div>
  );
}

// A step of the designer: folds open and shut, and says what is chosen.
function Step({
  n,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card" aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {!open && <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>}
    </section>
  );
}

// ---------- Daily: layout, back cover, print ----------

export function DailyCoverSettings({
  layout,
  backCover,
  binding,
  ads,
  period,
  onChange,
}: {
  layout: string;
  backCover: string;
  binding: string;
  ads: MagazineAd[];
  period: string;
  onChange: (key: "daily_cover" | "daily_back_cover" | "print_binding", v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label>Daily cover layout</Label>
          <SketchPicker
            kind="daily"
            label="Daily cover layout"
            options={DAILY_LAYOUTS}
            value={layout}
            onChange={(id) => onChange("daily_cover", id)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="daily-back-cover">Daily back cover</Label>
          <div className="sm:w-80">
            <AdSelect
              label="Daily back cover"
              value={backCover}
              ads={ads}
              none="None"
              onChange={(v) => onChange("daily_back_cover", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            An ad from the ad library below, printed as the last page of every daily issue.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Printing the monthly issue</Label>
          <Choice
            label="Binding"
            options={BINDINGS.map((b) => ({ id: b.id, name: b.name, hint: b.hint }))}
            value={binding}
            onChange={(v) => onChange("print_binding", v)}
          />
          <p className="text-xs text-muted-foreground">
            Ruled notes pages are added before the back cover so it lands on the outside.
          </p>
        </div>
      </div>
      <PreviewAside kind="daily" period={period} daily_cover={layout} />
    </div>
  );
}

// ---------- Monthly: the issue's cover and ads ----------

// The month's cover and ads as edited, before they are saved; shared by the
// Cover and Ads & printing tabs and their save bar. With `mag`, a custom
// magazine's own (month is then its first date, for the preview's period).
export function useIssueDesign(month: string, mag?: string) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaIssueDesign);
  const saveFn = useServerFn(saveCaIssueDesign);
  const getMagFn = useServerFn(getCaMagDesign);
  const saveMagFn = useServerFn(saveCaMagDesign);
  const key = mag ? ["caMagDesign", mag] : ["caIssueDesign", month];
  const q = useQuery({
    queryKey: key,
    queryFn: () => (mag ? getMagFn({ data: { id: mag } }) : getFn({ data: { period: month } })),
  });
  const [design, setDesign] = useState<IssueDesign | null>(null);
  const [base, setBase] = useState("");
  const [saving, setSaving] = useState(false);
  // A new month starts from what is saved for it.
  useEffect(() => setDesign(null), [month, mag]);
  useEffect(() => {
    if (q.data && !design) {
      setDesign(q.data);
      setBase(JSON.stringify(q.data));
    }
  }, [q.data, design]);
  const changed = !!design && JSON.stringify(design) !== base;
  const d = design ?? DEFAULT_ISSUE_DESIGN;
  const update = (fn: (x: IssueDesign) => IssueDesign) =>
    setDesign((x) => fn(x ?? DEFAULT_ISSUE_DESIGN));
  async function save() {
    if (!design) return false;
    setSaving(true);
    try {
      const raw = design as unknown as Record<string, unknown>;
      const saved = mag
        ? await saveMagFn({ data: { id: mag, design: raw } })
        : await saveFn({ data: { period: month, design: raw } });
      setDesign(saved);
      setBase(JSON.stringify(saved));
      toast.success("Cover and ads saved");
      qc.invalidateQueries({ queryKey: key });
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the cover"));
      return false;
    } finally {
      setSaving(false);
    }
  }
  const discard = () => setDesign(JSON.parse(base) as IssueDesign);
  return {
    month,
    mag,
    design: d,
    ready: !!design,
    loading: q.isLoading,
    error: q.error,
    changed,
    saving,
    update,
    save,
    discard,
  };
}
export type IssueDesignState = ReturnType<typeof useIssueDesign>;

// Saving stays in reach on the Cover and Ads tabs.
export function DesignSaveBar({ state }: { state: IssueDesignState }) {
  if (!state.changed) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-t-2xl border border-b-0 border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
      <span role="status" className="flex-1 text-sm font-medium text-amber-700 dark:text-amber-400">
        The cover or ads have changes that aren't saved
      </span>
      <Button variant="ghost" disabled={state.saving} onClick={state.discard}>
        Discard
      </Button>
      <Button disabled={state.saving} onClick={() => void state.save()}>
        {state.saving ? "Saving…" : "Save cover and ads"}
      </Button>
    </div>
  );
}

function useCoverUpload() {
  const fn = useServerFn(uploadCaCoverPhoto);
  return async (file: File): Promise<CoverPhoto> => {
    const img = await prepareImage(file, 2400);
    const { url, path } = await fn({
      data: { contentType: img.type as "image/jpeg", base64: await toBase64(img.bytes) },
    });
    return { url, path };
  };
}

function useCoverSettings() {
  const fn = useServerFn(getMagazineSettings);
  return useQuery({ queryKey: ["caSettings"], queryFn: () => fn() });
}

const bothOr = (b: Bi, empty: string) => b.hi || b.en || empty;

// The Cover tab: steps on the left, the live preview on the right.
export function MonthlyCoverEditor({ state }: { state: IssueDesignState }) {
  const qc = useQueryClient();
  const presetsFn = useServerFn(saveCaCoverPresets);
  const upload = useCoverUpload();
  const sq = useCoverSettings();
  const presets = sq.data?.cover_presets ?? [];
  const [busy, setBusy] = useState<"upload" | "preset" | null>(null);
  const [presetName, setPresetName] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ design: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const d = state.design;
  const c = d.cover;
  const info = designInfo(c.design);
  const maxPhotos = info.frames[1];
  const setCover = (patch: Partial<MonthlyCover>) =>
    state.update((x) => ({ ...x, cover: { ...x.cover, ...patch } }));
  const setPhoto = (i: number, patch: Partial<CoverPhoto>) =>
    setCover({ photos: c.photos.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const movePhoto = (i: number, dir: -1 | 1) => {
    const list = [...c.photos];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setCover({ photos: list });
  };

  async function addPhotos(files: File[]) {
    const room = Math.max(0, maxPhotos - c.photos.length);
    const list = files.slice(0, room);
    if (files.length > room)
      toast.error(`${info.name} shows at most ${maxPhotos} photo${maxPhotos === 1 ? "" : "s"}`);
    if (!list.length) return;
    setBusy("upload");
    try {
      const added: CoverPhoto[] = [];
      for (const f of list) added.push(await upload(f));
      state.update((x) => ({
        ...x,
        cover: { ...x.cover, photos: [...x.cover.photos, ...added] },
      }));
    } catch (e) {
      toast.error(errorText(e, "Upload failed"));
    } finally {
      setBusy(null);
    }
  }

  async function setBackground(file: File) {
    setBusy("upload");
    try {
      const bg = await upload(file);
      setCover({ bg });
    } catch (e) {
      toast.error(errorText(e, "Upload failed"));
    } finally {
      setBusy(null);
    }
  }

  async function savePresets(next: CoverPreset[], done: string) {
    setBusy("preset");
    try {
      await presetsFn({ data: { presets: next } });
      toast.success(done);
      await qc.invalidateQueries({ queryKey: ["caSettings"] });
      return true;
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveAsPreset(e: React.FormEvent) {
    e.preventDefault();
    const name = presetName.trim();
    if (!name) return;
    const same = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const preset: CoverPreset = {
      id: same?.id ?? crypto.randomUUID(),
      name,
      design: c.design,
      color: c.color,
      color2: c.color2,
      color_scope: c.color_scope,
      bg_dim: c.bg_dim,
      bg_blur: c.bg_blur,
      ribbon: c.ribbon,
    };
    const next = same ? presets.map((p) => (p.id === same.id ? preset : p)) : [...presets, preset];
    if (await savePresets(next, same ? `“${name}” updated` : `“${name}” saved`)) setPresetName("");
  }

  if (state.loading || !state.ready)
    return <p className="text-sm text-muted-foreground">Loading the cover…</p>;
  if (state.error)
    return <p className="text-sm text-destructive">{errorText(state.error, "Couldn't load")}</p>;

  const framed = c.photos.slice(0, maxPhotos).length;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3" aria-label="Cover designer" role="region">
        {/* Start from a saved cover, or save this one. */}
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-sm font-medium">My covers</p>
          {presets.length > 0 ? (
            <ul className="flex flex-wrap gap-2" data-testid="presets">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-1 rounded-full border border-border pl-3 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      state.update((x) => ({ ...x, cover: applyPreset(x.cover, p) }));
                      toast.success(`“${p.name}” applied`);
                    }}
                    className="py-1 hover:underline"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    disabled={!!busy}
                    onClick={() => {
                      if (confirm(`Delete the saved cover “${p.name}”?`))
                        void savePresets(
                          presets.filter((x) => x.id !== p.id),
                          "Saved cover deleted",
                        );
                    }}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Save a look you like to start from it next month. Photos and words stay with each
              month.
            </p>
          )}
          <form className="flex flex-wrap gap-2" onSubmit={saveAsPreset}>
            <Input
              aria-label="Name for this cover"
              placeholder="Name, e.g. Budget month"
              maxLength={60}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-56"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!presetName.trim() || !!busy}
            >
              Save as my cover
            </Button>
          </form>
        </div>

        <Step
          n={1}
          title="Design"
          summary={info.name}
          open={!!open.design}
          onToggle={() => toggle("design")}
        >
          <SketchPicker
            kind="monthly"
            label="Cover design"
            options={MONTHLY_DESIGNS}
            value={c.design}
            onChange={(id) => setCover({ design: id })}
          />
        </Step>

        <Step
          n={2}
          title="Colours"
          summary={`${c.color || "Settings colour"} · ${c.color_scope === "cover" ? "cover only" : "whole issue"}`}
          open={!!open.colours}
          onToggle={() => toggle("colours")}
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Main colour</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Main colour"
                  value={c.color || sq.data?.accent || "#6d28d9"}
                  onChange={(e) => setCover({ color: e.target.value })}
                  className="h-9 w-12 rounded border border-border"
                />
                {c.color ? (
                  <Button size="sm" variant="ghost" onClick={() => setCover({ color: "" })}>
                    Use the Settings colour
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">The Settings colour</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Second colour</Label>
              <input
                type="color"
                aria-label="Second colour"
                value={c.color2}
                onChange={(e) => setCover({ color2: e.target.value })}
                className="h-9 w-12 rounded border border-border"
              />
            </div>
          </div>
          <div role="radiogroup" aria-label="Colour used for" className="flex flex-wrap gap-1">
            {(
              [
                ["issue", "Whole issue"],
                ["cover", "Cover only"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={c.color_scope === v}
                onClick={() => setCover({ color_scope: v })}
                className={`rounded-full border px-3 py-1 text-xs ${c.color_scope === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Step>

        <Step
          n={3}
          title="Photos"
          summary={`${c.bg ? "Background photo" : "No background"}${maxPhotos ? ` · ${framed} of ${maxPhotos} framed` : ""}`}
          open={!!open.photos}
          onToggle={() => toggle("photos")}
        >
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Background: blurred behind the cover
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {c.bg ? (
                <>
                  <img
                    src={c.bg.url}
                    alt="Background"
                    className="h-16 w-12 rounded border border-border object-cover"
                  />
                  <Button size="sm" variant="outline" onClick={() => setCover({ bg: null })}>
                    Remove background
                  </Button>
                </>
              ) : (
                <PhotoPick
                  label={busy === "upload" ? "Uploading…" : "Add background photo"}
                  disabled={!!busy}
                  onFiles={(f) => void setBackground(f[0])}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Darkness
                <input
                  type="range"
                  aria-label="Background darkness"
                  min={0}
                  max={80}
                  value={c.bg_dim}
                  onChange={(e) => setCover({ bg_dim: Number(e.target.value) })}
                />
                <span className="w-8">{c.bg_dim}%</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Blur
                <input
                  type="range"
                  aria-label="Background blur"
                  min={0}
                  max={40}
                  value={c.bg_blur}
                  onChange={(e) => setCover({ bg_blur: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
          {maxPhotos > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                In frames: {info.name} shows{" "}
                {info.frames[0] === info.frames[1]
                  ? info.frames[0]
                  : `${info.frames[0]}–${info.frames[1]}`}{" "}
                photo{maxPhotos === 1 ? "" : "s"}. An empty frame shows a story's headline.
              </p>
              <ul className="space-y-2" data-testid="cover-photos">
                {c.photos.map((p, i) => (
                  <li
                    key={`${p.url}-${i}`}
                    className={`flex flex-wrap items-start gap-2 rounded-lg border p-2 ${i >= maxPhotos ? "border-dashed opacity-60" : "border-border"}`}
                  >
                    <img
                      src={p.url}
                      alt={`Photo ${i + 1}`}
                      className="h-16 w-16 rounded object-cover"
                    />
                    <div className="min-w-[12rem] flex-1 space-y-1.5">
                      <BiFields
                        label={`Caption ${i + 1}`}
                        value={p.caption ?? { en: "", hi: "" }}
                        onChange={(v) => setPhoto(i, { caption: v })}
                        max={120}
                      />
                      <Input
                        aria-label={`Credit ${i + 1}`}
                        placeholder="Photo credit, e.g. PIB"
                        maxLength={80}
                        value={p.credit ?? ""}
                        onChange={(e) => setPhoto(i, { credit: e.target.value })}
                      />
                      {i >= maxPhotos && (
                        <p className="text-xs text-muted-foreground">Not shown in this design.</p>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Move photo ${i + 1} up`}
                        onClick={() => movePhoto(i, -1)}
                        className="rounded p-1 hover:bg-muted"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move photo ${i + 1} down`}
                        onClick={() => movePhoto(i, 1)}
                        className="rounded p-1 hover:bg-muted"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() => setCover({ photos: c.photos.filter((_, k) => k !== i) })}
                        className="rounded p-1 hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <PhotoPick
                label={busy === "upload" ? "Uploading…" : "Add photos"}
                multiple
                disabled={!!busy || c.photos.length >= maxPhotos}
                onFiles={(f) => void addPhotos(f)}
              />
            </div>
          ) : (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              {info.name} has no photo frames.
            </p>
          )}
        </Step>

        <Step
          n={4}
          title="Words on the cover"
          summary={[
            `Cover story: ${bothOr(c.cover_story, "the month's top story")}`,
            c.ribbon.hi || c.ribbon.en ? `Ribbon: ${bothOr(c.ribbon, "")}` : "",
            c.issue_no ? `Issue ${c.issue_no}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          open={!!open.words}
          onToggle={() => toggle("words")}
        >
          <div className="space-y-1">
            <Label>Cover story</Label>
            <BiFields
              label="Cover story"
              value={c.cover_story}
              onChange={(v) => setCover({ cover_story: v })}
              placeholder={{ hi: "खाली: महीने की प्रमुख खबर", en: "Empty: the month's top story" }}
              max={160}
            />
          </div>
          <div className="space-y-1">
            <Label>Ribbon</Label>
            <BiFields
              label="Ribbon"
              value={c.ribbon}
              onChange={(v) => setCover({ ribbon: v })}
              placeholder={{ hi: "जैसे बजट विशेषांक", en: "e.g. Budget Special" }}
              max={60}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="issue-no">Issue number</Label>
            <Input
              id="issue-no"
              aria-label="Issue number"
              placeholder="e.g. 12"
              maxLength={30}
              value={c.issue_no}
              onChange={(e) => setCover({ issue_no: e.target.value })}
              className="w-40"
            />
          </div>
        </Step>
      </div>
      <PreviewAside kind="monthly" period={state.month} design={d} mag={state.mag} />
    </div>
  );
}

// The Ads & printing tab: an ad after any section, the back cover, and how
// the issue is padded for printing.
export function MonthlyAdsEditor({
  state,
  sections,
  names,
}: {
  state: IssueDesignState;
  // Stories this month in each section.
  sections: Record<string, number>;
  // A custom magazine's own sections, in order (default: the categories).
  names?: { id: string; name: string }[];
}) {
  const sq = useCoverSettings();
  const ads = sq.data?.ads ?? [];
  const [showAll, setShowAll] = useState(false);
  const d = state.design;
  const all = names ?? CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id).en }));
  const withStories = all.filter((c) => (sections[c.id] ?? 0) > 0);
  const without = all.filter((c) => !(sections[c.id] ?? 0));
  const shown = showAll || !withStories.length ? all : withStories;
  const binding = BINDINGS.find((b) => b.id === (sq.data?.print_binding as Binding));
  const setAd = (id: string, ad: string) =>
    state.update((x) => ({ ...x, section_ads: { ...x.section_ads, [id]: ad } }));

  if (state.loading || !state.ready || sq.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!ads.length)
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="font-medium">No ads yet</p>
        <p className="mt-1 text-muted-foreground">
          Add A4 ad images in{" "}
          <a href="/admin?section=ca.settings&tab=covers" className="text-primary underline">
            Settings → Covers &amp; ads
          </a>
          , then pick them here.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <section
        aria-label="Ads after sections"
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Ads after sections</h3>
            <p className="text-sm text-muted-foreground">
              A full-page ad after a section, without the page footer. Page numbers still count it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next: Record<string, string> = {};
                shown.forEach((c, i) => (next[c.id] = ads[i % ads.length].id));
                state.update((x) => ({ ...x, section_ads: next }));
              }}
            >
              Fill automatically
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => state.update((x) => ({ ...x, section_ads: {} }))}
            >
              Clear all
            </Button>
          </div>
        </div>
        <div
          className="divide-y divide-border rounded-xl border border-border"
          data-testid="section-ads"
        >
          {shown.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                After <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {sections[c.id] ?? 0} {(sections[c.id] ?? 0) === 1 ? "story" : "stories"}
                </span>
              </span>
              <div className="w-full sm:w-56">
                <AdSelect
                  label={`Ad after ${c.name}`}
                  value={d.section_ads[c.id] ?? ""}
                  ads={ads}
                  onChange={(v) => setAd(c.id, v)}
                />
              </div>
            </div>
          ))}
        </div>
        {withStories.length > 0 && without.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showAll
              ? `Show only sections with stories${names ? "" : " this month"}`
              : `Show ${without.length} section${without.length === 1 ? "" : "s"} without stories`}
          </button>
        )}
      </section>

      <section
        aria-label="Back cover and printing"
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <h3 className="font-semibold">Back cover and printing</h3>
        <div className="flex flex-col gap-1 sm:w-80">
          <Label>Back cover</Label>
          <AdSelect
            label={names ? "Back cover" : "Monthly back cover"}
            value={d.back_cover}
            ads={ads}
            none="None"
            onChange={(v) => state.update((x) => ({ ...x, back_cover: v }))}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Printing:{" "}
          <span className="font-medium text-foreground">{binding?.name ?? "Stapled booklet"}</span>{" "}
          · {binding?.hint ?? "Pages in fours (folded A3 sheets)"}. Ruled notes pages are added
          before the back cover so it lands on the outside.{" "}
          <a href="/admin?section=ca.settings&tab=covers" className="text-primary underline">
            Change
          </a>
        </p>
      </section>
    </div>
  );
}
