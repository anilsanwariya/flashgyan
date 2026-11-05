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

// Words picked out in a fact (the district a list is about).
function Marked({ text, mark }: { text: string; mark?: string[] }) {
  const words = (mark ?? []).filter((w) => w.length >= 2);
  if (!words.length) return <>{text}</>;
  const re = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  const parts = text.split(re);
  return (
    <>
      {parts.map((x, i) =>
        i % 2 ? (
          <mark
            key={i}
            className="rounded bg-amber-200/70 px-0.5 font-medium text-inherit dark:bg-amber-500/30"
          >
            {x}
          </mark>
        ) : (
          x
        ),
      )}
    </>
  );
}

// A fact's text. A table row ("III · Sanyukt Rajasthan · 18 Apr 1948" under
// "Phase · Union · Date") reads as its header's pairs; when the cells don't
// line up, the header sits above the row.
function FactText({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark?: string[] }) {
  const text = pickBi(f.text, lang);
  if (f.head) {
    const heads = f.head.split(" · ");
    const cells = text.split(" · ");
    if (heads.length > 1 && heads.length === cells.length)
      return (
        <span data-fact-row>
          {cells.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <span className="text-xs text-muted-foreground">{heads[i]}: </span>
              <Marked text={c} mark={mark} />
            </span>
          ))}
        </span>
      );
    return (
      <>
        <span className="block text-[11px] text-muted-foreground">{f.head}</span>
        <Marked text={text} mark={mark} />
      </>
    );
  }
  return <Marked text={text} mark={mark} />;
}

export function FactsList({
  facts,
  lang,
  limit,
  hideChapter = false,
  mark,
}: {
  facts: PublicFact[];
  lang: AtlasLang;
  limit?: number;
  // Names picked out in the facts (the district they're listed under).
  mark?: string[];
  // Inside a chapter's own section: only the topic as each group's title.
  hideChapter?: boolean;
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
          {(g.head || !hideChapter) && (
            <p className="text-xs font-semibold text-muted-foreground">
              {hideChapter ? g.head : [g.chapter, g.head].filter(Boolean).join(" · ")}
            </p>
          )}
          <ul className="mt-1 space-y-1.5">
            {g.facts.map((f) => (
              <li
                key={f.id}
                className="group rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm leading-relaxed"
                data-fact
              >
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
                <FactText f={f} lang={lang} mark={mark} />
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
                {/* Out of the way until the fact is pointed at or focused. */}
                <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-50">
                  <ReportButton
                    lang={lang}
                    kind="fact"
                    refKey={f.id}
                    label={pickBi(f.text, lang)}
                    compact
                  />
                </span>
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

// Facts in sections by chapter (the notes' chapters, biggest first), each
// opening to its facts by topic; the first is open.
export function FactSections({
  facts,
  lang,
  per = 8,
  mark,
}: {
  facts: PublicFact[];
  lang: AtlasLang;
  per?: number;
  mark?: string[];
}) {
  const chapters = new Map<string, PublicFact[]>();
  for (const f of facts) chapters.set(f.chapter, [...(chapters.get(f.chapter) ?? []), f]);
  const list = [...chapters.entries()].sort((a, b) => b[1].length - a[1].length);
  if (!facts.length)
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "hi" ? "अभी कोई तथ्य नहीं।" : "No facts yet."}
      </p>
    );
  return (
    <div className="space-y-2" data-fact-sections>
      {list.map(([chapter, fs], i) => (
        <details
          key={chapter}
          open={i === 0}
          className="group/s rounded-xl border border-border"
          data-fact-section={chapter}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">{chapter || (lang === "hi" ? "अन्य" : "Other")}</span>
            <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
              {fs.length}
            </span>
            <span className="text-muted-foreground transition-transform group-open/s:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-border p-2.5">
            <FactsList facts={fs} lang={lang} limit={per} hideChapter mark={mark} />
          </div>
        </details>
      ))}
    </div>
  );
}
