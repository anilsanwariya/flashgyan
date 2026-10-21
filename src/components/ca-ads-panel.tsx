// Admin: the ad library. Full-page A4 images (JPG or PNG) for the daily back
// cover and, in the monthly issue, the pages after sections and the back
// cover. An ad can have a Hindi version for the Hindi issue and a link that
// is clickable in the PDF. Saved as soon as something changes.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { getMagazineSettings, saveCaAds, uploadCaAdImage } from "@/lib/current-affairs.functions";
import { MAX_ADS, a4Off, type MagazineAd } from "@/lib/ca-covers";
import { prepareImage, toBase64 } from "@/lib/ca-image-file";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// An A4 page at 300 dpi.
const AD_MAX_SIDE = 3508;

// Picks an image file and uploads it as an ad image.
function useAdUpload() {
  const uploadFn = useServerFn(uploadCaAdImage);
  return async (file: File) => {
    const img = await prepareImage(file, AD_MAX_SIDE);
    const r = await uploadFn({
      data: { contentType: img.type as "image/jpeg", base64: await toBase64(img.bytes) },
    });
    if (a4Off(img.w, img.h))
      toast.warning(
        "This image isn't A4-shaped. Choose “Fill the page” (edges cropped) or “Fit whole image” (white bars).",
      );
    return r;
  };
}

function FilePick({
  label,
  disabled,
  onFile,
}: {
  label: string;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <ImagePlus className="h-4 w-4" /> {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function AdLibrary() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMagazineSettings);
  const saveFn = useServerFn(saveCaAds);
  const upload = useAdUpload();
  const q = useQuery({ queryKey: ["caSettings"], queryFn: () => getFn() });
  const ads = q.data?.ads ?? [];
  const [busy, setBusy] = useState(false);

  async function save(next: MagazineAd[], done: string) {
    setBusy(true);
    try {
      await saveFn({ data: { ads: next } });
      if (done) toast.success(done);
      await qc.invalidateQueries({ queryKey: ["caSettings"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the ads"));
    } finally {
      setBusy(false);
    }
  }
  const change = (id: string, patch: Partial<MagazineAd>, done = "") =>
    save(
      ads.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      done,
    );

  async function add(file: File) {
    setBusy(true);
    try {
      const { url, path } = await upload(file);
      const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Ad";
      await save([...ads, { id: crypto.randomUUID(), name, url, path, fit: "fill" }], "Ad added");
    } catch (e) {
      toast.error(errorText(e, "Upload failed"));
      setBusy(false);
    }
  }

  async function addHindi(ad: MagazineAd, file: File) {
    setBusy(true);
    try {
      const { url, path } = await upload(file);
      await change(ad.id, { url_hi: url, path_hi: path }, "Hindi version added");
    } catch (e) {
      toast.error(errorText(e, "Upload failed"));
      setBusy(false);
    }
  }

  return (
    <section aria-label="Ads" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold">Ads</h3>
        <p className="text-sm text-muted-foreground">
          Full-page A4 images (2480 × 3508 px is ideal) for the daily back cover and the monthly
          issue's ad pages and back cover. Ad pages print without the page footer. Saved as soon as
          you change something.
        </p>
      </div>
      {ads.length ? (
        <ul className="space-y-2" data-testid="ads">
          {ads.map((ad) => (
            <li
              key={ad.id}
              data-ad={ad.name}
              className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3"
            >
              <div className="flex gap-2">
                {[ad.url, ad.url_hi].map((u, i) =>
                  u ? (
                    <div key={i} className="text-center">
                      <img
                        src={u}
                        alt=""
                        className={`h-[85px] w-[60px] rounded border border-border bg-white ${ad.fit === "fit" ? "object-contain" : "object-cover"}`}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {i ? "Hindi" : ad.url_hi ? "English" : "Both"}
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="grid min-w-[14rem] flex-1 gap-2 sm:grid-cols-2">
                <Input
                  aria-label={`Name of ${ad.name}`}
                  defaultValue={ad.name}
                  maxLength={60}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== ad.name) void change(ad.id, { name: v }, "Ad renamed");
                  }}
                />
                <Input
                  aria-label={`Link of ${ad.name}`}
                  placeholder="Link (optional), https://…"
                  defaultValue={ad.link ?? ""}
                  maxLength={300}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (ad.link ?? "")) return;
                    if (v && !/^https:\/\/\S+$/.test(v)) {
                      toast.error("Use a link starting with https://");
                      return;
                    }
                    void change(ad.id, { link: v || undefined }, v ? "Link saved" : "Link removed");
                  }}
                />
                <select
                  aria-label={`How ${ad.name} fills the page`}
                  value={ad.fit}
                  disabled={busy}
                  onChange={(e) => void change(ad.id, { fit: e.target.value as "fill" | "fit" })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="fill">Fill the page (edges cropped)</option>
                  <option value="fit">Fit whole image (white bars)</option>
                </select>
                <div className="flex flex-wrap items-center gap-2">
                  {ad.url_hi ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void change(
                          ad.id,
                          { url_hi: undefined, path_hi: undefined },
                          "Hindi version removed",
                        )
                      }
                    >
                      Remove Hindi version
                    </Button>
                  ) : (
                    <FilePick
                      label="Hindi version"
                      disabled={busy}
                      onFile={(f) => void addHindi(ad, f)}
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${ad.name}`}
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Remove “${ad.name}” from the ads?`))
                        void save(
                          ads.filter((a) => a.id !== ad.id),
                          "Ad removed",
                        );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No ads yet.</p>
      )}
      <FilePick
        label={busy ? "Uploading…" : "Add an ad"}
        disabled={busy || ads.length >= MAX_ADS}
        onFile={(f) => void add(f)}
      />
    </section>
  );
}
