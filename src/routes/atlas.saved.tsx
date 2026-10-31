import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Gamepad2, Trash2 } from "lucide-react";
import { atlasCat, pickBi, type AtlasLang } from "@/lib/atlas";
import { useAtlasSaved, type SavedPlace } from "@/lib/atlas-device";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasPlace, useAtlasPlaces } from "@/components/atlas-data";
import { OfflineButton } from "@/components/atlas-actions";
import { FactsList, LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/saved")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Saved to revise — Rajasthan Atlas · FlashGyan" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SavedPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);

// The places and districts saved on this device to revise later.
function SavedPage() {
  const [lang, setLang] = useAtlasLang();
  const { saved, togglePlace, toggleDistrict, clear } = useAtlasSaved();
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const [open, setOpen] = useState<string | null>(null);
  const onMap = useMemo(() => {
    const keys = new Set(saved.places.map((p) => p.key));
    return (places.data ?? []).filter((p) => keys.has(p[0]));
  }, [places.data, saved.places]);
  const dname = (d: string) =>
    lang === "hi" ? (base.data?.districts.find((x) => x.en === d)?.hi ?? d) : d;
  const empty = !saved.places.length && !saved.districts.length;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          to="/atlas"
          aria-label={L(lang, "एटलस", "Atlas")}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#1f2a5c] dark:text-indigo-200">
          {L(lang, "दोहराने के लिए सहेजे", "Saved to revise")}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-3">
        <p className="text-sm text-muted-foreground">
          {L(
            lang,
            "ये इसी डिवाइस पर सहेजे हैं। एटलस में किसी स्थान या जिले पर “बाद में दोहराएँ” दबाएँ।",
            "These are kept on this device. Press “Revise later” on any place or district in the atlas.",
          )}
        </p>
        {empty ? (
          <Link to="/atlas" className="inline-block text-sm text-primary underline">
            {L(lang, "एटलस खोलें", "Open the atlas")}
          </Link>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-2">
              {saved.places.length >= 4 && (
                <Link
                  to="/atlas/quiz"
                  search={{ saved: 1 }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  {L(lang, "इन पर क्विज़", "Quiz me on these")}
                </Link>
              )}
              <OfflineButton lang={lang} />
              <button
                type="button"
                className="ml-auto text-xs text-muted-foreground underline"
                onClick={() => {
                  if (window.confirm(L(lang, "पूरी सूची हटाएँ?", "Clear the whole list?"))) clear();
                }}
              >
                {L(lang, "सूची खाली करें", "Clear the list")}
              </button>
            </div>
            {saved.districts.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {L(lang, "जिले", "Districts")} ({saved.districts.length})
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {saved.districts.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-full border border-border pl-3 text-sm"
                      data-saved-district={d}
                    >
                      <Link
                        to="/atlas/$district"
                        params={{ district: d }}
                        className="hover:underline"
                      >
                        {dname(d)}
                      </Link>
                      <button
                        type="button"
                        aria-label={L(lang, `${dname(d)} हटाएँ`, `Remove ${d}`)}
                        className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted"
                        onClick={() => toggleDistrict(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}
            {saved.places.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-[1fr_420px]">
                {base.data && (
                  <AtlasMap
                    base={base.data}
                    places={onMap}
                    lang={lang}
                    colour={null}
                    overlays={[]}
                    selected={open}
                    onPlace={(k) => setOpen(k)}
                    cluster
                    className="h-[45vh] lg:h-[70vh]"
                  />
                )}
                <section>
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {L(lang, "स्थान", "Places")} ({saved.places.length})
                  </h2>
                  <ul>
                    {saved.places.map((p) => (
                      <SavedItem
                        key={p.key}
                        p={p}
                        lang={lang}
                        open={open === p.key}
                        onOpen={() => setOpen(open === p.key ? null : p.key)}
                        onRemove={() => togglePlace(p)}
                      />
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SavedItem({
  p,
  lang,
  open,
  onOpen,
  onRemove,
}: {
  p: SavedPlace;
  lang: AtlasLang;
  open: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const q = useAtlasPlace(p.key, open);
  const c = atlasCat(p.cat);
  return (
    <li className="border-b border-border/60" data-saved-place={p.key}>
      <div className="flex items-center gap-2 py-2 text-sm">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span>{c.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{lang === "hi" ? p.name_hi || p.name : p.name}</span>
            <span className="block text-xs text-muted-foreground">
              {[p.district, pickBi(c.name, lang)].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          aria-label={L(lang, "हटाएँ", "Remove")}
          className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 pb-3 pl-6">
          {q.isLoading ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : q.data ? (
            <FactsList facts={[...q.data.facts, ...q.data.mentions]} lang={lang} limit={8} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {L(lang, "यह स्थान अब एटलस में नहीं है।", "This place is no longer in the atlas.")}
            </p>
          )}
          <Link to="/atlas" search={{ place: p.key }} className="text-xs text-primary underline">
            {L(lang, "मानचित्र पर देखें", "See it on the map")}
          </Link>
        </div>
      )}
    </li>
  );
}
