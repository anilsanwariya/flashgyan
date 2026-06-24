import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteHomeBanner,
  getHomeData,
  reorderHomeBanners,
  updateHomeSettings,
  uploadHomeBanner,
  type HomeSettings,
} from "@/lib/home.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Trash2, Upload } from "lucide-react";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

export function HomePanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getHomeData);
  const uploadFn = useServerFn(uploadHomeBanner);
  const deleteFn = useServerFn(deleteHomeBanner);
  const reorderFn = useServerFn(reorderHomeBanners);
  const saveFn = useServerFn(updateHomeSettings);

  const homeQ = useQuery({ queryKey: ["homeData"], queryFn: () => getFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["homeData"] });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await fileToBase64(file);
      return uploadFn({
        data: { filename: file.name, contentType: file.type || "image/jpeg", dataBase64 },
      });
    },
    onSuccess: () => {
      toast.success("Banner uploaded");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Banner deleted");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { ids } }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const [settings, setSettings] = useState<HomeSettings | null>(null);
  useEffect(() => {
    if (homeQ.data && !settings) setSettings(homeQ.data.settings);
  }, [homeQ.data, settings]);

  const saveMut = useMutation({
    mutationFn: (s: HomeSettings) => saveFn({ data: s }),
    onSuccess: () => {
      toast.success("Home settings saved");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (homeQ.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (homeQ.error) {
    return <div className="text-sm text-destructive">{(homeQ.error as Error).message}</div>;
  }
  const banners = homeQ.data?.banners ?? [];

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= banners.length) return;
    const ids = banners.map((b) => b.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    reorderMut.mutate(ids);
  }

  return (
    <div className="space-y-8">
      {/* Banners */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Ad Banner Carousel</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              2:1 ratio recommended. Auto-rotates on the home page.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-input bg-background px-3 h-9 text-sm hover:bg-accent">
            {uploadMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadMut.mutate(f);
              }}
            />
          </label>
        </div>

        {banners.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No banners yet. Upload a 2:1 image to start.
          </div>
        ) : (
          <ul className="space-y-3">
            {banners.map((b, i) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-2"
              >
                <div className="w-32 aspect-[2/1] rounded-md overflow-hidden bg-muted shrink-0">
                  <img src={b.url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                  #{i + 1}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || reorderMut.isPending}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === banners.length - 1 || reorderMut.isPending}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this banner?")) deleteMut.mutate(b.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* External CTA Button */}
      {settings && (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div>
            <h2 className="font-semibold">External Link Button</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shown on the home page alongside other features. Leave URL blank to hide.
            </p>
          </div>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="cta-label">Button title</Label>
              <Input
                id="cta-label"
                value={settings.cta_label}
                onChange={(e) => setSettings({ ...settings, cta_label: e.target.value })}
                placeholder="e.g. Visit our website"
              />
            </div>
            <div>
              <Label htmlFor="cta-subtitle">Button subtitle</Label>
              <Input
                id="cta-subtitle"
                value={settings.cta_subtitle}
                onChange={(e) => setSettings({ ...settings, cta_subtitle: e.target.value })}
                placeholder="e.g. Explore more resources"
              />
            </div>
            <div>
              <Label htmlFor="cta-url">External URL</Label>
              <Input
                id="cta-url"
                value={settings.cta_url}
                onChange={(e) => setSettings({ ...settings, cta_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label htmlFor="cta-caption">Caption (shown below button)</Label>
              <Input
                id="cta-caption"
                value={settings.cta_caption}
                onChange={(e) => setSettings({ ...settings, cta_caption: e.target.value })}
                placeholder="e.g. Tap above to explore more."
              />
            </div>
          </div>
        </section>
      )}

      {/* Feature locks */}
      {settings && (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Feature Locks</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lock a feature to restrict user access. A lock icon will show in place of the arrow.
            </p>
          </div>
          <LockRow
            label="Flashcards"
            checked={settings.lock_flashcards}
            onChange={(v) => setSettings({ ...settings, lock_flashcards: v })}
          />
          <LockRow
            label="MCQ Tests"
            checked={settings.lock_mcq}
            onChange={(v) => setSettings({ ...settings, lock_mcq: v })}
          />
          <LockRow
            label="SAATHI"
            checked={settings.lock_saathi}
            onChange={(v) => setSettings({ ...settings, lock_saathi: v })}
          />
          <LockRow
            label="External Link Button"
            checked={settings.lock_cta}
            onChange={(v) => setSettings({ ...settings, lock_cta: v })}
          />
        </section>
      )}

      {settings && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={() => saveMut.mutate(settings)} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Home settings
          </Button>
        </div>
      )}
    </div>
  );
}

function LockRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {checked ? "Locked" : "Unlocked"}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
