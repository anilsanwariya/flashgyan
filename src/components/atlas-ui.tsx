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
// A long state-wide list seen from one district: "Copper · Jhunjhunu: Khetri
// · … · Udaipur: Anjani · Sirohi: …" → "Copper" and "Anjani". Null when the
// row isn't a list of districts with this one inside it.
function focusRow(text: string, names: string[]): { subject: string; parts: string[] } | null {
  const words = names.filter((w) => w.length >= 2).map((w) => w.toLowerCase());
  if (!words.length) return null;
  const cells = text.split(" · ");
  if (cells.length < 4) return null;
  const hits = cells
    .map((c, i) => [c, i] as const)
    .filter(([c]) => words.some((w) => c.toLowerCase().includes(w)));
  if (!hits.length || hits.some(([, i]) => i === 0) || hits.length >= cells.length - 1) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = hits
    .map(([c]) => {
      for (const w of names) {
        const m = new RegExp(`^${esc(w)}\\s*[:–-]\\s*`, "i").exec(c);
        if (m) return c.slice(m[0].length).trim();
      }
      return words.includes(c.trim().toLowerCase()) ? "" : c.trim();
    })
    .filter(Boolean);
  return { subject: cells[0].trim(), parts };
}

// In a district's facts: a state-wide list row shown for this district only
// (the whole row a tap away), and a long paragraph folded to three lines.
function DistrictFact({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark: string[] }) {
  const [open, setOpen] = useState(false);
  const text = pickBi(f.text, lang);
  // Only table rows: a mnemonic or answer with "·" in it isn't a list.
  const focus = f.head ? focusRow(text, mark) : null;
  const toggle = (label: string) => (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className="ml-1.5 text-xs font-medium text-primary hover:underline"
      aria-expanded={open}
    >
      {open ? (lang === "hi" ? "कम" : "Less") : label}
    </button>
  );
  if (focus && !open)
    return (
      <span data-fact-focus>
        <span className="font-semibold">{focus.subject}</span>
        <span className="text-muted-foreground"> — </span>
        {focus.parts.length ? (
          focus.parts.map((p, i) => (
            <span key={i}>
              {i > 0 && "; "}
              <Marked text={p} mark={mark} />
            </span>
          ))
        ) : (
          <Marked text={mark[0]} mark={mark} />
        )}
        {toggle(lang === "hi" ? "सभी जिले" : "All districts")}
      </span>
    );
  if (focus)
    return (
      <>
        <FactText f={f} lang={lang} mark={mark} />
        {toggle("")}
      </>
    );
  if (text.length > 260 && !f.head)
    return (
      <span>
        <span className={open ? "" : "line-clamp-3"}>
          <Marked text={text} mark={mark} />
        </span>
        {toggle(lang === "hi" ? "पूरा पढ़ें" : "Read more")}
      </span>
    );
  return <FactText f={f} lang={lang} mark={mark} />;
}

function FactText({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark?: string[] }) {
  const text = pickBi(f.text, lang);
  if (f.head) {
    const heads = (lang === "hi" && f.headHi ? f.headHi : f.head).split(" · ");
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
        <span className="block text-[11px] text-muted-foreground">
          {lang === "hi" && f.headHi ? f.headHi : f.head}
        </span>
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
              {(() => {
                const f0 = g.facts[0];
                const head = (lang === "hi" && f0.headingHi) || g.head;
                const chapter = (lang === "hi" && f0.chapterHi) || g.chapter;
                return hideChapter ? head : [chapter, head].filter(Boolean).join(" · ");
              })()}
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
                {mark?.length ? (
                  <DistrictFact f={f} lang={lang} mark={mark} />
                ) : (
                  <FactText f={f} lang={lang} />
                )}
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

// ====================== A district's facts, as the notes have them ======================
//
// Topic (the chapter) → subtopic ("Folk deities of Rajasthan") → heading
// ("Biggaji") with all its facts. A place block from the chapter's "Places"
// list joins the heading it is about ("Karni Mata temple, Deshnok" → "Karni
// Mata"), and the same fact twice is shown once.

// `name` / `label`: the English heading (what groups them); `title`: what
// is shown, in the reader's language.
type Block = { label: string; title: string; facts: PublicFact[] };
type Entity = { name: string; title: string; blocks: Block[]; places: string[] };
type Subtopic = { name: string; title: string; entities: Entity[]; loose: PublicFact[] };
type Topic = { key: string; name: string; title: string; subtopics: Subtopic[]; count: number };

const KEY_FACT =
  /^(also called|other names?|where|built \/ founded \/ established|propagator|distribution|उपनाम|अन्य नाम|कहाँ|स्थान)\s*:/i;
const baseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(",")[0]
    .replace(/\b(temple|fort|palace|mahal|mandir|dargah|fair|ji)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function districtTopics(facts: PublicFact[], mark: string[], lang: AtlasLang): Topic[] {
  const seen = new Set<string>();
  const names = mark.filter((w) => w.length >= 2).map((w) => w.toLowerCase());
  const mine = (f: PublicFact) =>
    names.some((w) => `${f.text.en} ${f.text.hi}`.toLowerCase().includes(w));
  const topics = new Map<string, Topic>();
  for (const f of facts) {
    const sig = `${f.chapterKey}|${f.text.en.trim().toLowerCase()}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const parts = f.heading.split(" › ").filter(Boolean);
    const hiParts = (f.headingHi || "").split(" › ");
    const show = (i: number, j = i + 1) =>
      lang === "hi" && f.headingHi
        ? parts
            .map((p, k) => hiParts[k] || p)
            .slice(i, j)
            .join(" › ")
        : parts.slice(i, j).join(" › ");
    // A table under a heading is a list of separate records ("Other folk
    // deities"): only the district's rows.
    if (f.head && parts.length >= 2 && !mine(f)) continue;
    const key = f.chapterKey || f.chapter;
    let t = topics.get(key);
    if (!t)
      topics.set(
        key,
        (t = {
          key,
          name: f.chapter,
          title: (lang === "hi" && f.chapterHi) || f.chapter,
          subtopics: [],
          count: 0,
        }),
      );
    t.count++;
    const subName = parts[0] ?? "";
    let sub = t.subtopics.find((x) => x.name === subName);
    if (!sub) t.subtopics.push((sub = { name: subName, title: show(0), entities: [], loose: [] }));
    if (parts.length < 2) {
      sub.loose.push(f);
      continue;
    }
    let e = sub.entities.find((x) => x.name === parts[1]);
    if (!e) sub.entities.push((e = { name: parts[1], title: show(1), blocks: [], places: [] }));
    const label = parts.slice(2).join(" › ");
    let b = e.blocks.find((x) => x.label === label);
    if (!b) e.blocks.push((b = { label, title: show(2, parts.length), facts: [] }));
    b.facts.push(f);
  }
  // Place blocks join the heading they are about, in the same topic.
  for (const t of topics.values()) {
    const places = t.subtopics.find((s) => /^(places|स्थान)$/i.test(s.name));
    if (!places) continue;
    const others = t.subtopics.filter((s) => s !== places).flatMap((s) => s.entities);
    places.entities = places.entities.filter((pe) => {
      const n = baseName(pe.name);
      const host = others.find((e) => {
        const m = baseName(e.name);
        return m.length >= 3 && (m === n || n.startsWith(`${m} `) || m.startsWith(`${n} `));
      });
      if (!host) return true;
      host.places.push(pe.name);
      for (const b of pe.blocks)
        host.blocks.push({
          label: `📍 ${pe.name}${b.label ? ` › ${b.label}` : ""}`,
          title: `📍 ${pe.title}${b.title ? ` › ${b.title}` : ""}`,
          facts: b.facts,
        });
      return false;
    });
    t.subtopics = t.subtopics.filter((s) => s.entities.length || s.loose.length);
  }
  return [...topics.values()];
}

function Bullet({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark: string[] }) {
  const kinds = factKinds(f.flags);
  const trick = kinds.some((k) => k.key === "mnemonic" || k.key === "why");
  return (
    <li
      className={
        trick
          ? "group list-none rounded-lg border-l-4 border-amber-400 bg-amber-50 px-2.5 py-1.5 dark:bg-amber-500/10"
          : "group ml-4 list-disc marker:text-muted-foreground"
      }
      data-fact
    >
      {kinds.length > 0 && !trick && (
        <span className="mr-1 rounded bg-muted px-1 text-[10px] font-semibold">
          {pickBi(kinds[0].name, lang)}
        </span>
      )}
      <DistrictFact f={f} lang={lang} mark={mark} />
      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-50">
        <ReportButton lang={lang} kind="fact" refKey={f.id} label={pickBi(f.text, lang)} compact />
      </span>
    </li>
  );
}

function EntityCard({
  e,
  lang,
  mark,
  placeOf,
  onPlace,
}: {
  e: Entity;
  lang: AtlasLang;
  mark: string[];
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
}) {
  const placeKey = [e.name, ...e.places].map((n) => placeOf?.(n) ?? null).find(Boolean) ?? null;
  const [all, setAll] = useState(false);
  const facts = e.blocks.flatMap((b) => b.facts);
  const keyFacts = facts.filter((f) => KEY_FACT.test(f.text.en) && !f.head);
  const rest = e.blocks
    .map((b) => ({ ...b, facts: b.facts.filter((f) => !keyFacts.includes(f)) }))
    .filter((b) => b.facts.length);
  const total = rest.reduce((n, b) => n + b.facts.length, 0);
  let left = all ? Infinity : 6;
  return (
    <article
      className="rounded-xl border border-border bg-card p-3 shadow-sm"
      data-fact-entity={e.name}
    >
      <header className="mb-1.5 flex items-start gap-2">
        <h4 className="min-w-0 flex-1 font-serif text-base font-bold leading-snug text-[#1f2a5c] dark:text-indigo-200">
          {e.title}
        </h4>
        {placeKey && onPlace && (
          <button
            type="button"
            onClick={() => onPlace(placeKey)}
            className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
          >
            📍 {lang === "hi" ? "मानचित्र पर" : "On the map"}
          </button>
        )}
      </header>
      {keyFacts.length > 0 && (
        <dl className="mb-2 grid gap-1 rounded-lg bg-muted/50 p-2 text-sm">
          {keyFacts.map((f) => {
            const t = pickBi(f.text, lang);
            const i = t.indexOf(":");
            return (
              <div key={f.id} className="flex gap-2">
                <dt className="w-24 shrink-0 text-xs text-muted-foreground">{t.slice(0, i)}</dt>
                <dd className="min-w-0">
                  <Marked text={t.slice(i + 1).trim()} mark={mark} />
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <div className="space-y-2 text-sm leading-relaxed">
        {rest.map((b, bi) => {
          if (left <= 0) return null;
          const shown = b.facts.slice(0, left);
          left -= shown.length;
          return (
            <div key={bi}>
              {b.title && (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {b.title}
                </p>
              )}
              <ul className="space-y-1">
                {shown.map((f) => (
                  <Bullet key={f.id} f={f} lang={lang} mark={mark} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {total > 6 && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="mt-1.5 text-xs font-medium text-primary hover:underline"
        >
          {all
            ? lang === "hi"
              ? "कम दिखाएँ"
              : "Show fewer"
            : lang === "hi"
              ? `सभी ${total} तथ्य`
              : `All ${total} facts`}
        </button>
      )}
    </article>
  );
}

export function DistrictTopics({
  facts,
  lang,
  mark,
  placeOf,
  onPlace,
}: {
  facts: PublicFact[];
  lang: AtlasLang;
  mark: string[];
  // A heading's place on the map (its key), if it is one; and opening it.
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
}) {
  const topics = districtTopics(facts, mark, lang);
  const [more, setMore] = useState<string[]>([]);
  if (!topics.length)
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "hi" ? "अभी कोई तथ्य नहीं।" : "No facts yet."}
      </p>
    );
  return (
    <div className="space-y-2" data-fact-sections>
      {topics.map((t, i) => (
        <details
          key={t.key}
          open={i === 0}
          className="group/s rounded-xl border border-border bg-background"
          data-fact-section={t.name}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">
              {t.title || (lang === "hi" ? "अन्य" : "Other")}
            </span>
            <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
              {t.count}
            </span>
            <span className="text-muted-foreground transition-transform group-open/s:rotate-90">
              ›
            </span>
          </summary>
          <div className="space-y-4 border-t border-border p-2.5">
            {t.subtopics.map((s) => {
              const id = `${t.key}|${s.name}`;
              const open = more.includes(id);
              const ents = open ? s.entities : s.entities.slice(0, 5);
              return (
                <section key={s.name} data-fact-subtopic={s.name}>
                  {s.name && (
                    <h3 className="mb-2 border-l-4 border-[#1f2a5c] pl-2 text-xs font-bold uppercase tracking-wide text-[#1f2a5c] dark:border-indigo-300 dark:text-indigo-200">
                      {s.title}
                    </h3>
                  )}
                  <div className="space-y-2">
                    {ents.map((e) => (
                      <EntityCard
                        key={e.name}
                        e={e}
                        lang={lang}
                        mark={mark}
                        placeOf={placeOf}
                        onPlace={onPlace}
                      />
                    ))}
                  </div>
                  {s.entities.length > ents.length && (
                    <button
                      type="button"
                      onClick={() => setMore([...more, id])}
                      className="mt-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      {lang === "hi"
                        ? `${s.entities.length - ents.length} और`
                        : `${s.entities.length - ents.length} more`}
                    </button>
                  )}
                  {s.loose.length > 0 && (
                    <ul className="mt-1 space-y-1.5 text-sm leading-relaxed">
                      {s.loose.map((f) => (
                        <Bullet key={f.id} f={f} lang={lang} mark={mark} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
