// Small pieces of the students' atlas: the language switch (remembered on
// the device) and a list of the notes' facts, grouped under their headings.
import { useEffect, useState } from "react";
import { factKinds, pickBi, type AtlasLang } from "@/lib/atlas";
import type { PublicFact } from "@/lib/atlas.functions";
import { useAtlasBase } from "@/components/atlas-data";
import { ReportButton } from "@/components/atlas-report";

const LANG_KEY = "atlas-lang";

export function useAtlasLang(): [AtlasLang, (l: AtlasLang) => void] {
  const [lang, setLang] = useState<AtlasLang>("hi");
  useEffect(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (v === "en" || v === "hi") setLang(v);
    } catch {
      // Storage blocked: Hindi.
    }
  }, []);
  return [
    lang,
    (l) => {
      setLang(l);
      try {
        localStorage.setItem(LANG_KEY, l);
      } catch {
        // Not remembered.
      }
    },
  ];
}

export function LangToggle({
  lang,
  onChange,
}: {
  lang: AtlasLang;
  onChange: (l: AtlasLang) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-border bg-background p-0.5 text-xs"
      role="radiogroup"
      aria-label="Language / भाषा"
    >
      {(["hi", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => onChange(l)}
          className={`rounded-full px-3 py-1 font-medium ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          {l === "hi" ? "हिंदी" : "English"}
        </button>
      ))}
    </div>
  );
}

export function FactsList({
  facts,
  lang,
  limit,
}: {
  facts: PublicFact[];
  lang: AtlasLang;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const names = useAtlasBase().data?.sources;
  const shown = limit && !all ? facts.slice(0, limit) : facts;
  const groups: { head: string; chapter: string; facts: PublicFact[] }[] = [];
  for (const f of shown) {
    const g = groups[groups.length - 1];
    if (g && g.head === f.heading) g.facts.push(f);
    else groups.push({ head: f.heading, chapter: f.chapter, facts: [f] });
  }
  if (!facts.length)
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "hi" ? "अभी कोई तथ्य नहीं।" : "No facts yet."}
      </p>
    );
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={i}>
          <p className="text-xs font-semibold text-muted-foreground">
            {g.chapter} · {g.head}
          </p>
          <ul className="mt-1 space-y-1.5">
            {g.facts.map((f) => (
              <li key={f.id} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm" data-fact>
                {factKinds(f.flags).length > 0 && (
                  <span className="mr-1.5 inline-flex flex-wrap gap-1 align-middle">
                    {factKinds(f.flags).map((k) => (
                      <span
                        key={k.key}
                        className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                      >
                        {pickBi(k.name, lang)}
                      </span>
                    ))}
                  </span>
                )}
                {f.head && <span className="text-xs text-muted-foreground">({f.head}) </span>}
                {pickBi(f.text, lang)}
                {lang === "hi" && f.hiAi && f.text.hi && (
                  <span className="ml-1 text-[10px] text-muted-foreground" title="AI translation">
                    · AI अनुवाद
                  </span>
                )}
                {(f.sources ?? []).length > 0 && (
                  <span
                    className="ml-1.5 inline-flex flex-wrap gap-1 align-middle"
                    data-fact-sources
                  >
                    {f.sources.map((c) => {
                      const n = names?.[c];
                      return (
                        <span
                          key={c}
                          title={n ? pickBi(n.name, lang) || c : c}
                          className="rounded border border-border px-1 text-[10px] text-muted-foreground"
                        >
                          {n && pickBi(n.name, lang) ? pickBi(n.name, lang) : c}
                        </span>
                      );
                    })}
                  </span>
                )}
                <ReportButton
                  lang={lang}
                  kind="fact"
                  refKey={f.id}
                  label={pickBi(f.text, lang)}
                  compact
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {limit && facts.length > limit && (
        <button
          type="button"
          className="text-sm font-medium text-primary underline"
          onClick={() => setAll(!all)}
        >
          {all
            ? lang === "hi"
              ? "कम दिखाएँ"
              : "Show fewer"
            : lang === "hi"
              ? `सभी ${facts.length} तथ्य दिखाएँ`
              : `Show all ${facts.length} facts`}
        </button>
      )}
    </div>
  );
}
