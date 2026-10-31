// The atlas in the rest of the site: current affairs stories about a place
// ("In the news"), and the Rajasthan places and districts a SAATHI answer
// names, with a small map and links into the atlas.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Map as MapIcon, Newspaper } from "lucide-react";
import { atlasInNewsFn, atlasMentionsFn, type NewsItem } from "@/lib/atlas.functions";
import { atlasCat, pickBi, placePath, type AtlasLang } from "@/lib/atlas";
import { withOffline } from "@/lib/atlas-device";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase } from "@/components/atlas-data";

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
const day = (d: string, lang: AtlasLang) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Stories about a place, newest first.
export function NewsList({ items, lang }: { items: NewsItem[]; lang: AtlasLang }) {
  if (!items.length) return null;
  return (
    <div data-place-news>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
        <Newspaper className="h-4 w-4" /> {L(lang, "समाचारों में", "In the news")}
      </p>
      <ul className="space-y-1.5">
        {items.map((n) => (
          <li
            key={n.item}
            className="rounded-lg border border-border bg-amber-50/60 p-2 text-sm dark:bg-amber-500/10"
          >
            <p className="text-[11px] text-muted-foreground">{day(n.date, lang)}</p>
            <p className="font-medium">{pickBi(n.headline, lang)}</p>
            {pickBi(n.summary, lang) && (
              <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                {pickBi(n.summary, lang)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The atlas page's "In the news" strip: the places in recent stories.
export function InTheNews({ lang, onPlace }: { lang: AtlasLang; onPlace: (key: string) => void }) {
  const fn = useServerFn(atlasInNewsFn);
  const q = useQuery({
    queryKey: ["atlasInNews"],
    queryFn: () => withOffline("in-news", () => fn()),
    staleTime: 10 * 60_000,
  });
  const items = (q.data ?? []).filter((n) => n.place);
  if (!items.length) return null;
  return (
    <section data-in-news>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Newspaper className="h-3.5 w-3.5" />{" "}
        {L(lang, "हाल ही में समाचारों में", "In the news lately")}
      </p>
      <div className="flex flex-wrap gap-1">
        {items.map((n) => (
          <button
            key={n.place!.key}
            type="button"
            title={pickBi(n.headline, lang)}
            onClick={() => onPlace(n.place!.key)}
            className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs hover:bg-amber-100 dark:bg-amber-500/10"
          >
            {pickBi(n.place!.name, lang)}
          </button>
        ))}
      </div>
    </section>
  );
}

// Under a SAATHI answer: the places and districts it names, on the map.
export function AtlasMentions({ text }: { text: string }) {
  const lang: AtlasLang =
    (text.match(/[ऀ-ॿ]/g) ?? []).length > (text.match(/[A-Za-z]/g) ?? []).length ? "hi" : "en";
  const fn = useServerFn(atlasMentionsFn);
  const q = useQuery({
    queryKey: ["atlasMentions", text],
    queryFn: () => fn({ data: { text: text.slice(0, 20_000) } }),
    staleTime: Infinity,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const m = q.data;
  if (!m || (!m.places.length && !m.districts.length)) return null;
  return (
    <div
      className="mt-2 rounded-2xl border border-border/40 bg-white/50 p-2.5 text-sm backdrop-blur-xl dark:bg-black/30"
      data-atlas-mentions
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[13px] font-medium"
      >
        <MapIcon className="h-3.5 w-3.5 text-primary" />
        {L(lang, "राजस्थान के मानचित्र पर", "On the Rajasthan map")}
        <span className="text-muted-foreground">· {m.places.length + m.districts.length}</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {m.districts.map((d) => (
          <Link
            key={d.en}
            to="/atlas/$district"
            params={{ district: d.en }}
            className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
          >
            🗺️ {pickBi(d, lang)} {L(lang, "जिला", "district")}
          </Link>
        ))}
        {m.places.map((p) => (
          <a
            key={p[0]}
            href={placePath(p[0])}
            className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
          >
            {atlasCat(p[3]).icon} {lang === "hi" ? p[2] || p[1] : p[1]}
          </a>
        ))}
      </div>
      {open && (
        <MentionsMap places={m.places} districts={m.districts.map((d) => d.en)} lang={lang} />
      )}
    </div>
  );
}

function MentionsMap({
  places,
  districts,
  lang,
}: {
  places: NonNullable<Awaited<ReturnType<typeof atlasMentionsFn>>>["places"];
  districts: string[];
  lang: AtlasLang;
}) {
  const base = useAtlasBase();
  if (!base.data) return <p className="mt-2 text-xs text-muted-foreground">…</p>;
  return (
    <AtlasMap
      base={base.data}
      places={places}
      lang={lang}
      colour={null}
      overlays={[]}
      marks={Object.fromEntries(districts.map((d) => [d, "#fde68a"]))}
      onPlace={(k) => window.open(placePath(k), "_self")}
      className="mt-2 h-64"
    />
  );
}
