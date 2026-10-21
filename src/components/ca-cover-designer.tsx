// Admin: magazine covers. The daily layout picker (in Settings) and the
// monthly cover designer (on the Monthly page): a design, colours, a blurred
// background photo, framed photos, words, saved presets, ad pages after
// sections and the back cover, with a live preview of the real cover.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Trash2, X } from "lucide-react";
import {
  getCaIssueDesign,
  getMagazineSettings,
  previewCaCover,
  saveCaCoverPresets,
  saveCaIssueDesign,
  uploadCaCoverPhoto,
} from "@/lib/current-affairs.functions";
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
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function useCoverPreview(args: {
  kind: "daily" | "monthly";
  period: string;
  lang: Lang;
  design?: IssueDesign;
  daily_cover?: string;
}) {
  const fn = useServerFn(previewCaCover);
  const settled = useSettled(args);
  return useQuery({
    queryKey: ["caCoverPreview", JSON.stringify(settled)],
    queryFn: () =>
      fn({
        data: {
          kind: settled.kind,
          period: settled.period,
          lang: settled.lang,
          design: settled.design as unknown as Record<string, unknown> | undefined,
          daily_cover: settled.daily_cover,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

function PreviewBox(props: {
  kind: "daily" | "monthly";
  period: string;
  design?: IssueDesign;
  daily_cover?: string;
}) {
  const [lang, setLang] = useState<Lang>("hi");
  const q = useCoverPreview({ ...props, lang });
  return (
    <div className="min-w-0 space-y-2" data-testid="cover-preview">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {q.isFetching ? "Updating preview…" : "Live preview"}
        </span>
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      {q.data ? (
        <CoverPreview html={q.data.html} label="Cover preview" />
      ) : q.error ? (
        <p className="text-sm text-destructive">{errorText(q.error, "Couldn't show the cover")}</p>
      ) : (
        <div className="aspect-[210/297] w-full animate-pulse rounded-lg bg-muted" />
      )}
    </div>
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label>Daily cover layout</Label>
          <div
            role="radiogroup"
            aria-label="Daily cover layout"
            className="grid gap-2 sm:grid-cols-2"
          >
            {DAILY_LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={layout === l.id}
                onClick={() => onChange("daily_cover", l.id)}
                className={`rounded-xl border p-3 text-left ${layout === l.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
              >
                <span className="block text-sm font-medium">{l.name}</span>
                <span className="block text-xs text-muted-foreground">{l.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="daily-back-cover">Daily back cover</Label>
          <select
            id="daily-back-cover"
            value={ads.some((a) => a.id === backCover) ? backCover : ""}
            onChange={(e) => onChange("daily_back_cover", e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-80"
          >
            <option value="">None</option>
            {ads.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            An ad from the list below, printed as the last page of every daily issue.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Printing the monthly issue</Label>
          <div role="radiogroup" aria-label="Binding" className="grid gap-2 sm:grid-cols-3">
            {BINDINGS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={binding === b.id}
                onClick={() => onChange("print_binding", b.id)}
                className={`rounded-xl border p-3 text-left ${binding === b.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
              >
                <span className="block text-sm font-medium">{b.name}</span>
                <span className="block text-xs text-muted-foreground">{b.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Ruled notes pages are added before the back cover so it lands on the outside of the
            printed issue.
          </p>
        </div>
      </div>
      <PreviewBox kind="daily" period={period} daily_cover={layout} />
    </div>
  );
}

// ---------- Monthly cover designer ----------

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

function Part({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3 first:border-0 first:pt-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function MonthlyCoverDesigner({ month }: { month: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaIssueDesign);
  const saveFn = useServerFn(saveCaIssueDesign);
  const settingsFn = useServerFn(getMagazineSettings);
  const presetsFn = useServerFn(saveCaCoverPresets);
  const upload = useCoverUpload();
  const q = useQuery({
    queryKey: ["caIssueDesign", month],
    queryFn: () => getFn({ data: { period: month } }),
  });
  const sq = useQuery({ queryKey: ["caSettings"], queryFn: () => settingsFn() });
  const ads = sq.data?.ads ?? [];
  const presets = sq.data?.cover_presets ?? [];
  const [design, setDesign] = useState<IssueDesign | null>(null);
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState<"save" | "upload" | "preset" | null>(null);
  const [presetName, setPresetName] = useState("");

  // A new month starts from what is saved for it.
  useEffect(() => {
    setDesign(null);
  }, [month]);
  useEffect(() => {
    if (q.data && !design) {
      setDesign(q.data);
      setBase(JSON.stringify(q.data));
    }
  }, [q.data, design]);
  const changed = !!design && JSON.stringify(design) !== base;
  const d = design ?? DEFAULT_ISSUE_DESIGN;
  const c = d.cover;
  const info = designInfo(c.design);
  const maxPhotos = info.frames[1];
  const setCover = (patch: Partial<MonthlyCover>) =>
    setDesign((x) => ({
      ...(x ?? DEFAULT_ISSUE_DESIGN),
      cover: { ...(x ?? DEFAULT_ISSUE_DESIGN).cover, ...patch },
    }));
  const setPhoto = (i: number, patch: Partial<CoverPhoto>) =>
    setCover({ photos: c.photos.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const movePhoto = (i: number, dir: -1 | 1) => {
    const list = [...c.photos];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setCover({ photos: list });
  };
  const sectionIds = useMemo(() => CATEGORIES.map((x) => x.id), []);

  async function save() {
    if (!design) return;
    setBusy("save");
    try {
      const saved = await saveFn({
        data: { period: month, design: design as unknown as Record<string, unknown> },
      });
      setDesign(saved);
      setBase(JSON.stringify(saved));
      toast.success("Cover and ads saved");
      qc.invalidateQueries({ queryKey: ["caIssueDesign", month] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the cover"));
    } finally {
      setBusy(null);
    }
  }

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
      setDesign((x) => {
        const cur = x ?? DEFAULT_ISSUE_DESIGN;
        return { ...cur, cover: { ...cur.cover, photos: [...cur.cover.photos, ...added] } };
      });
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

  // Ads after sections, one after another from the library.
  function fillAds() {
    if (!ads.length) return;
    const next: Record<string, string> = {};
    sectionIds.forEach((id, i) => (next[id] = ads[i % ads.length].id));
    setDesign({ ...d, section_ads: next });
  }

  if (q.isLoading || !design)
    return <p className="text-sm text-muted-foreground">Loading the cover…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;

  return (
    <section
      aria-label="Cover and ads"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Cover and ads</h3>
          <p className="text-sm text-muted-foreground">
            This month's cover, its photos and colours, and the ad pages. Both issues use the same
            design, each in its own language. Making the PDFs uses what is saved.
          </p>
        </div>
        <Button disabled={!changed || !!busy} onClick={() => void save()}>
          {busy === "save" ? "Saving…" : changed ? "Save cover and ads" : "Saved"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-3">
          <Part title="Design">
            <div role="radiogroup" aria-label="Cover design" className="grid gap-2 sm:grid-cols-2">
              {MONTHLY_DESIGNS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={c.design === x.id}
                  onClick={() => setCover({ design: x.id })}
                  className={`rounded-xl border p-2.5 text-left ${c.design === x.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="block text-sm font-medium">{x.name}</span>
                  <span className="block text-xs text-muted-foreground">{x.hint}</span>
                </button>
              ))}
            </div>
          </Part>

          <Part
            title="My covers"
            hint="Saved looks: design, colours, background darkness and ribbon. Photos are this month's own."
          >
            {presets.length > 0 && (
              <ul className="flex flex-wrap gap-2" data-testid="presets">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-1 rounded-full border border-border pl-3 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setDesign({ ...d, cover: applyPreset(c, p) });
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
            )}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
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
                const next = same
                  ? presets.map((p) => (p.id === same.id ? preset : p))
                  : [...presets, preset];
                if (await savePresets(next, same ? `“${name}” updated` : `“${name}” saved`))
                  setPresetName("");
              }}
            >
              <Input
                aria-label="Name for this cover"
                placeholder="Name, e.g. Budget month"
                maxLength={60}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="w-56"
              />
              <Button type="submit" variant="outline" disabled={!presetName.trim() || !!busy}>
                Save as my cover
              </Button>
            </form>
          </Part>

          <Part title="Colours">
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
              <div role="radiogroup" aria-label="Colour used for" className="flex gap-1">
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
            </div>
          </Part>

          <Part
            title="Background photo"
            hint="Blurred behind the cover. Darker makes the words easier to read."
          >
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
                {c.bg_dim}%
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
          </Part>

          {maxPhotos > 0 && (
            <Part
              title="Photos in frames"
              hint={`${info.name} shows ${info.frames[0] === info.frames[1] ? info.frames[0] : `${info.frames[0]}–${info.frames[1]}`} photo${maxPhotos === 1 ? "" : "s"}. An empty frame shows a story's headline.`}
            >
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
            </Part>
          )}

          <Part title="Words on the cover">
            <BiFields
              label="Cover story"
              value={c.cover_story}
              onChange={(v) => setCover({ cover_story: v })}
              placeholder={{ hi: "खाली: महीने की प्रमुख खबर", en: "Empty: the month's top story" }}
              max={160}
            />
            <BiFields
              label="Ribbon"
              value={c.ribbon}
              onChange={(v) => setCover({ ribbon: v })}
              placeholder={{ hi: "रिबन, जैसे बजट विशेषांक", en: "Ribbon, e.g. Budget Special" }}
              max={60}
            />
            <Input
              aria-label="Issue number"
              placeholder="Issue number, e.g. 12"
              maxLength={30}
              value={c.issue_no}
              onChange={(e) => setCover({ issue_no: e.target.value })}
              className="w-48"
            />
          </Part>

          <Part
            title="Ads"
            hint="Ad pages print after a section, without the page footer; page numbers still count them. Add ads in Settings."
          >
            {ads.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={fillAds}>
                    Fill automatically
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDesign({ ...d, section_ads: {} })}
                  >
                    No ads after sections
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2" data-testid="section-ads">
                  {sectionIds.map((id) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-40 shrink-0 truncate"
                        title={`After ${categoryLabel(id).en}`}
                      >
                        After {categoryLabel(id).en}
                      </span>
                      <select
                        aria-label={`Ad after ${categoryLabel(id).en}`}
                        value={d.section_ads[id] ?? ""}
                        onChange={(e) =>
                          setDesign({
                            ...d,
                            section_ads: { ...d.section_ads, [id]: e.target.value },
                          })
                        }
                        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">No ad</option>
                        {ads.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 font-medium">Back cover</span>
                  <select
                    aria-label="Monthly back cover"
                    value={d.back_cover}
                    onChange={(e) => setDesign({ ...d, back_cover: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm sm:max-w-xs"
                  >
                    <option value="">None</option>
                    {ads.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground">
                  For printing (
                  {BINDINGS.find((b) => b.id === (sq.data?.print_binding as Binding))?.name ??
                    "Stapled booklet"}
                  , set in Settings), ruled notes pages are added before the back cover so it lands
                  on the outside.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No ads yet: add them in Settings.</p>
            )}
          </Part>
        </div>
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <PreviewBox kind="monthly" period={month} design={d} />
        </div>
      </div>
    </section>
  );
}
