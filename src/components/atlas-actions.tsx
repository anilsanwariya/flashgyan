// The students' atlas buttons: save a place or district to revise later,
// share a link (the phone's share sheet, or the link copied), and keep the
// whole atlas on the device for offline use.
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, CloudDownload, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { offlineInfo, useAtlasSaved, type OfflineInfo, type SavedPlace } from "@/lib/atlas-device";
import { useSaveOffline } from "@/components/atlas-data";
import type { AtlasLang } from "@/lib/atlas";

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
const btn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted";

export function SaveButton({
  lang,
  place,
  district,
}: {
  lang: AtlasLang;
  place?: SavedPlace;
  district?: string;
}) {
  const s = useAtlasSaved();
  const on = place ? s.hasPlace(place.key) : district ? s.hasDistrict(district) : false;
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`${btn} ${on ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" : ""}`}
      onClick={() => {
        if (place) s.togglePlace(place);
        else if (district) s.toggleDistrict(district);
        toast.success(
          on
            ? L(lang, "सूची से हटाया", "Removed from your list")
            : L(lang, "दोहराने की सूची में जोड़ा", "Saved to revise later"),
        );
      }}
    >
      {on ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
      {on ? L(lang, "सहेजा गया", "Saved") : L(lang, "बाद में दोहराएँ", "Revise later")}
    </button>
  );
}

export function ShareButton({
  lang,
  path,
  title,
}: {
  lang: AtlasLang;
  path: string;
  title: string;
}) {
  return (
    <button
      type="button"
      className={btn}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (nav.share) {
          try {
            await nav.share({ title, url });
            return;
          } catch (e) {
            if ((e as Error).name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          toast.success(L(lang, "लिंक कॉपी हुआ", "Link copied"));
        } catch {
          window.prompt(L(lang, "यह लिंक कॉपी करें", "Copy this link"), url);
        }
      }}
    >
      <Share2 className="h-3.5 w-3.5" />
      {L(lang, "साझा करें", "Share")}
    </button>
  );
}

export function OfflineButton({ lang }: { lang: AtlasLang }) {
  const save = useSaveOffline();
  const [info, setInfo] = useState<OfflineInfo>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void offlineInfo().then(setInfo);
  }, []);
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const i = await save();
            setInfo(i);
            toast.success(
              L(
                lang,
                "एटलस इस डिवाइस पर सहेजा गया: अब बिना इंटरनेट भी खुलेगा",
                "The atlas is saved on this device: it opens without internet now",
              ),
            );
          } catch {
            toast.error(
              L(lang, "सहेज नहीं सके: इंटरनेट जाँचें", "Couldn't save: check the internet"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CloudDownload className="h-3.5 w-3.5" />
        )}
        {info
          ? L(lang, "ऑफ़लाइन प्रति ताज़ा करें", "Update offline copy")
          : L(lang, "ऑफ़लाइन के लिए सहेजें", "Save for offline")}
      </button>
      {info && (
        <p className="text-[11px] text-muted-foreground" data-offline-info>
          {L(lang, "ऑफ़लाइन प्रति", "Offline copy")}:{" "}
          {new Date(info.at).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN")} · {info.facts}{" "}
          {L(lang, "तथ्य", "facts")} · {info.districts} {L(lang, "जिला पृष्ठ", "district pages")}
        </p>
      )}
    </div>
  );
}
