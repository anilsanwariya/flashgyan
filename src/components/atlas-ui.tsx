// Small pieces of the students' atlas: the language switch (remembered on
// the device) and a list of the notes' facts, grouped under their headings.
import { createContext, useContext, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ATLAS_CATS,
  ATLAS_GROUPS,
  atlasCat,
  factKinds,
  pickBi,
  shownFacts,
  type AtlasLang,
  type FactsOutline,
} from "@/lib/atlas";
import type { PublicFact } from "@/lib/atlas.functions";
import { useAtlasBase, useAtlasDistrictPart } from "@/components/atlas-data";
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

// Reading text size on the atlas's pages (A− / A+), remembered on the
// device. It scales the page's root size, so every rem-sized thing grows
// with it; the map's names are sized on their own.
const TEXT_KEY = "atlas-text";
const TEXT_SIZES = [90, 100, 112, 125, 140];
function useTextSize(): [number, (n: number) => void] {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(TEXT_KEY));
      if (TEXT_SIZES.includes(v)) setPct(v);
    } catch {
      /* not remembered */
    }
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    const before = el.style.fontSize;
    el.style.fontSize = pct === 100 ? "" : `${pct}%`;
    return () => {
      el.style.fontSize = before === `${pct}%` ? "" : before;
    };
  }, [pct]);
  return [
    pct,
    (n) => {
      setPct(n);
      try {
        localStorage.setItem(TEXT_KEY, String(n));
      } catch {
        /* not remembered */
      }
    },
  ];
}

function TextSize({ lang }: { lang: AtlasLang }) {
  const [pct, setPct] = useTextSize();
  const i = TEXT_SIZES.indexOf(pct);
  const btn =
    "grid h-7 w-7 place-items-center rounded-full font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40";
  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-xs"
      role="group"
      aria-label={lang === "hi" ? "अक्षरों का आकार" : "Text size"}
      data-text-size={pct}
    >
      <button
        type="button"
        className={btn}
        disabled={i <= 0}
        onClick={() => setPct(TEXT_SIZES[i - 1])}
        aria-label={lang === "hi" ? "अक्षर छोटे करें" : "Smaller text"}
      >
        A−
      </button>
      <button
        type="button"
        className={`${btn} text-sm`}
        disabled={i >= TEXT_SIZES.length - 1}
        onClick={() => setPct(TEXT_SIZES[i + 1])}
        aria-label={lang === "hi" ? "अक्षर बड़े करें" : "Bigger text"}
      >
        A+
      </button>
    </div>
  );
}

export function LangToggle({
  lang,
  onChange,
}: {
  lang: AtlasLang;
  onChange: (l: AtlasLang) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <TextSize lang={lang} />
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
    </span>
  );
}

// ---------- Loading, empty and failed states ----------

// Grey lines while something loads.
export function Loading({ lines = 3, label }: { lines?: number; label?: string }) {
  const w = ["w-2/3", "w-5/6", "w-1/2", "w-3/4"];
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-label={label} data-loading>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`h-4 animate-pulse rounded bg-muted ${w[i % w.length]}`} />
      ))}
    </div>
  );
}

// Something that couldn't load: why (offline or not) and a way to try again.
export function LoadFailed({ lang, onRetry }: { lang: AtlasLang; onRetry?: () => void }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-sm"
      role="status"
      data-load-failed
    >
      <p className="font-medium">
        {offline
          ? lang === "hi"
            ? "आप ऑफ़लाइन हैं।"
            : "You're offline."
          : lang === "hi"
            ? "यह अभी नहीं खुल सका।"
            : "This couldn't open just now."}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {offline
          ? lang === "hi"
            ? '"ऑफ़लाइन के लिए सहेजें" से सहेजे गए स्थान और जिले फिर भी खुलते हैं।'
            : 'Places and districts kept with "Save for offline" still open.'
          : lang === "hi"
            ? "कुछ देर बाद फिर कोशिश करें।"
            : "Check your connection and try again."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
        >
          {lang === "hi" ? "फिर कोशिश करें" : "Try again"}
        </button>
      )}
    </div>
  );
}

// ---------- Place names in facts, tappable ----------
//
// A page that knows the atlas's places gives their names (and how to open
// one: the card beside the map, else the place's page); a fact names the
// places it is linked to, and those names in its text become links.

export type PlaceLinkSet = {
  names: Map<string, { en: string; hi: string }>;
  open?: (key: string) => void;
  // The place being shown (not linked to itself).
  self?: string;
};
const PlaceLinkCtx = createContext<PlaceLinkSet | null>(null);
export const PlaceLinks = PlaceLinkCtx.Provider;
const FactPlacesCtx = createContext<string[]>([]);

// The names a place goes by in a fact: "Junagarh fort, Bikaner" →
// "Junagarh fort", "Junagarh"; its Hindi name likewise.
const TYPE_WORDS =
  /(^|\s)(fort|temple|palace|lake|dam|sanctuary|fair|festival|mahal|mandir|dargah|baori|ji|किला|दुर्ग|मंदिर|महल|झील|बांध|मेला|दरगाह|बावड़ी|जी)(?=\s|$)/giu;
export function placeLinkWords(name: { en: string; hi: string }): string[] {
  const out = new Set<string>();
  for (const x of [name.en, name.hi]) {
    const first = (x.split(",")[0] ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (first.length >= 3) out.add(first);
    const bare = first.replace(TYPE_WORDS, " ").replace(/\s+/g, " ").trim();
    if (bare.length >= 4) out.add(bare);
  }
  return [...out];
}

function PlaceLink({ k, children }: { k: string; children: React.ReactNode }) {
  const ctx = useContext(PlaceLinkCtx);
  const cls =
    "rounded-sm font-medium text-primary underline decoration-dotted decoration-1 underline-offset-2 hover:decoration-solid";
  if (ctx?.open)
    return (
      <button
        type="button"
        className={cls}
        data-place-link={k}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.open!(k);
        }}
      >
        {children}
      </button>
    );
  return (
    <Link to="/atlas/place/$key" params={{ key: k }} className={cls} data-place-link={k}>
      {children}
    </Link>
  );
}

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT_LETTER = "[\\p{L}\\p{M}\\p{N}]";

// Words picked out in a fact (the district a list is about), and the names
// of the places it is linked to as links.
function Marked({ text, mark }: { text: string; mark?: string[] }) {
  const links = useContext(PlaceLinkCtx);
  const factPlaces = useContext(FactPlacesCtx);
  const words = (mark ?? []).filter((w) => w.length >= 2);
  const terms = new Map<string, string>();
  if (links)
    for (const k of factPlaces) {
      if (k === links.self) continue;
      const n = links.names.get(k);
      if (n) for (const w of placeLinkWords(n)) terms.set(w.toLowerCase(), k);
    }
  if (!words.length && !terms.size) return <>{text}</>;
  const longFirst = (a: string[]) => [...a].sort((x, y) => y.length - x.length).map(esc);
  // Links match whole words only; marks anywhere (as before).
  const parts = [
    terms.size
      ? `(?<!${NOT_LETTER})(${longFirst([...terms.keys()]).join("|")})(?!${NOT_LETTER})`
      : "",
    words.length ? `(${longFirst(words).join("|")})` : "",
  ].filter(Boolean);
  const re = new RegExp(parts.join("|"), "giu");
  const linkGroup = terms.size ? 1 : 0;
  const out: React.ReactNode[] = [];
  const used = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const hit = m[0];
    const key = linkGroup && m[1] ? terms.get(m[1].toLowerCase()) : undefined;
    if (key && !used.has(key)) {
      used.add(key);
      out.push(
        <PlaceLink key={at} k={key}>
          {hit}
        </PlaceLink>,
      );
    } else if (words.some((w) => w.toLowerCase() === hit.toLowerCase()) || !key)
      out.push(
        <mark
          key={at}
          className="rounded bg-amber-200/70 px-0.5 font-medium text-inherit dark:bg-amber-500/30"
        >
          {hit}
        </mark>,
      );
    else out.push(hit);
    last = at + hit.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
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
function DistrictFact(props: { f: PublicFact; lang: AtlasLang; mark: string[] }) {
  return (
    <FactPlacesCtx.Provider value={props.f.places}>
      <DistrictFactText {...props} />
    </FactPlacesCtx.Provider>
  );
}
function DistrictFactText({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark: string[] }) {
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

function FactText(props: { f: PublicFact; lang: AtlasLang; mark?: string[] }) {
  return (
    <FactPlacesCtx.Provider value={props.f.places}>
      <FactTextInner {...props} />
    </FactPlacesCtx.Provider>
  );
}
function FactTextInner({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark?: string[] }) {
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
  const topics = new Map<string, Topic>();
  for (const f of shownFacts(facts, mark)) {
    const parts = f.heading.split(" › ").filter(Boolean);
    const hiParts = (f.headingHi || "").split(" › ");
    const show = (i: number, j = i + 1) =>
      lang === "hi" && f.headingHi
        ? parts
            .map((p, k) => hiParts[k] || p)
            .slice(i, j)
            .join(" › ")
        : parts.slice(i, j).join(" › ");
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

// Revise mode: a topic's facts hidden until tapped, to test oneself.
const ReviseCtx = createContext(false);

function Bullet({ f, lang, mark }: { f: PublicFact; lang: AtlasLang; mark: string[] }) {
  const kinds = factKinds(f.flags);
  const trick = kinds.some((k) => k.key === "mnemonic" || k.key === "why");
  const revise = useContext(ReviseCtx);
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [revise]);
  const hide = revise && !shown;
  return (
    <li
      className={`${
        trick
          ? "group list-none rounded-lg border-l-4 border-amber-400 bg-amber-50 px-2.5 py-1.5 dark:bg-amber-500/10"
          : "group ml-4 list-disc marker:text-muted-foreground"
      } ${hide ? "cursor-pointer" : ""}`}
      data-fact
      data-hidden={hide || undefined}
      onClick={hide ? () => setShown(true) : undefined}
      title={hide ? (lang === "hi" ? "देखने के लिए टैप करें" : "Tap to see") : undefined}
    >
      <span className={hide ? "pointer-events-none select-none blur-[5px]" : ""} aria-hidden={hide}>
        {kinds.length > 0 && !trick && (
          <span className="mr-1 rounded bg-muted px-1 text-[10px] font-semibold">
            {pickBi(kinds[0].name, lang)}
          </span>
        )}
        <DistrictFact f={f} lang={lang} mark={mark} />
      </span>
      {hide && (
        <span className="sr-only">
          {lang === "hi" ? "छिपा तथ्य, देखने के लिए टैप करें" : "Hidden fact, tap to see"}
        </span>
      )}
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
  icon,
  subtitle,
  limit = 6,
}: {
  e: Entity;
  lang: AtlasLang;
  mark: string[];
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
  icon?: string;
  subtitle?: string;
  limit?: number;
}) {
  const placeKey = [e.name, ...e.places].map((n) => placeOf?.(n) ?? null).find(Boolean) ?? null;
  const [all, setAll] = useState(false);
  const facts = e.blocks.flatMap((b) => b.facts);
  const keyFacts = facts.filter((f) => KEY_FACT.test(f.text.en) && !f.head);
  const rest = e.blocks
    .map((b) => ({ ...b, facts: b.facts.filter((f) => !keyFacts.includes(f)) }))
    .filter((b) => b.facts.length);
  const total = rest.reduce((n, b) => n + b.facts.length, 0);
  let left = all ? Infinity : limit;
  const revise = useContext(ReviseCtx);
  const links = useContext(PlaceLinkCtx);
  // Its own name isn't a link inside its own card.
  const article = (
    <article
      className="rounded-xl border border-border bg-card p-3 shadow-sm"
      data-fact-entity={e.name}
    >
      <header className="mb-1.5 flex items-start gap-2">
        {icon && <span className="mt-0.5 text-lg leading-none">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h4 className="font-serif text-base font-bold leading-snug text-[#1f2a5c] dark:text-indigo-200">
            {e.title}
          </h4>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
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
                <dd className={`min-w-0 ${revise ? "select-none blur-[5px]" : ""}`}>
                  <FactPlacesCtx.Provider value={f.places}>
                    <Marked text={t.slice(i + 1).trim()} mark={mark} />
                  </FactPlacesCtx.Provider>
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
      {total > limit && (
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
  return links && placeKey ? (
    <PlaceLinks value={{ ...links, self: placeKey }}>{article}</PlaceLinks>
  ) : (
    article
  );
}

export function DistrictTopics({
  facts,
  lang,
  mark,
  placeOf,
  onPlace,
  openFirst = true,
}: {
  facts: PublicFact[];
  lang: AtlasLang;
  mark: string[];
  // A heading's place on the map (its key), if it is one; and opening it.
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
  // The first topic open (else all closed).
  openFirst?: boolean;
}) {
  const topics = districtTopics(facts, mark, lang);
  if (!topics.length) return <NoFacts lang={lang} />;
  return (
    <div className="space-y-2" data-fact-sections>
      {topics.map((t, i) => (
        <TopicSection
          key={t.key}
          name={t.name}
          title={t.title}
          count={t.count}
          lang={lang}
          open={openFirst && i === 0}
        >
          <TopicBody t={t} lang={lang} mark={mark} placeOf={placeOf} onPlace={onPlace} />
        </TopicSection>
      ))}
    </div>
  );
}

const NoFacts = ({ lang }: { lang: AtlasLang }) => (
  <div className="rounded-xl border border-dashed border-border p-3 text-sm" data-no-facts>
    <p className="font-medium">
      {lang === "hi" ? "इसके तथ्य अभी एटलस में नहीं हैं।" : "Its facts aren't in the atlas yet."}
    </p>
    <p className="mt-0.5 text-xs text-muted-foreground">
      {lang === "hi"
        ? 'पास के स्थान और इसका जिला देखें, या "गलती बताएँ" से हमें बताएँ क्या जोड़ें।'
        : 'Look at the places near it and its district, or use "Report a mistake" to tell us what to add.'}
    </p>
  </div>
);

// Told the name of a topic when it is opened (to come back to it later).
const TopicOpenCtx = createContext<((name: string) => void) | null>(null);

// A topic, folded; its body is drawn only once it has been opened.
function TopicSection({
  name,
  title,
  count,
  lang,
  open: openAtFirst,
  children,
}: {
  name: string;
  title: string;
  count: number;
  lang: AtlasLang;
  open: boolean;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(openAtFirst);
  const onOpen = useContext(TopicOpenCtx);
  return (
    <details
      open={openAtFirst}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          setOpened(true);
          onOpen?.(name);
        }
      }}
      className="group/s rounded-xl border border-border bg-background"
      data-fact-section={name}
    >
      <summary className="top-[var(--atlas-sticky,0px)] z-[5] flex cursor-pointer list-none items-center gap-2 rounded-xl bg-background px-3 py-2.5 group-open/s:sticky group-open/s:rounded-b-none group-open/s:shadow-[0_1px_0_hsl(var(--border))] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">
          {title || (lang === "hi" ? "अन्य" : "Other")}
        </span>
        <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
          {count}
        </span>
        <span className="text-muted-foreground transition-transform group-open/s:rotate-90">›</span>
      </summary>
      {opened && <div className="space-y-4 border-t border-border p-2.5">{children}</div>}
    </details>
  );
}

function TopicBody({
  t,
  lang,
  mark,
  placeOf,
  onPlace,
}: {
  t: Topic;
  lang: AtlasLang;
  mark: string[];
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
}) {
  const [more, setMore] = useState<string[]>([]);
  const [revise, setRevise] = useState(false);
  return (
    <ReviseCtx.Provider value={revise}>
      <div className="flex items-center justify-end gap-2">
        {revise && (
          <span className="text-xs text-muted-foreground">
            {lang === "hi" ? "याद करें, फिर तथ्य पर टैप करें" : "Recall it, then tap a fact"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setRevise(!revise)}
          aria-pressed={revise}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            revise
              ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
              : "border-border hover:bg-muted"
          }`}
          data-revise-toggle
        >
          {revise
            ? lang === "hi"
              ? "सब दिखाएँ"
              : "Show all"
            : lang === "hi"
              ? "🧠 दोहराएँ"
              : "🧠 Revise"}
        </button>
      </div>
      {t.subtopics.map((s) => {
        const open = more.includes(s.name);
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
                onClick={() => setMore([...more, s.name])}
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
    </ReviseCtx.Provider>
  );
}

// A district's topics as on DistrictTopics, from its outline: a topic's facts
// are fetched when it is first opened.
export function LazyDistrictTopics({
  district,
  outline,
  lang,
  mark,
  placeOf,
  onPlace,
  first,
  onTopic,
}: {
  district: string;
  outline: FactsOutline;
  lang: AtlasLang;
  mark: string[];
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
  // The topic open at first (its key; else the first one), and told of
  // each topic opened.
  first?: string;
  onTopic?: (t: FactsOutline["topics"][number]) => void;
}) {
  if (!outline.topics.length) return <NoFacts lang={lang} />;
  const firstKey = outline.topics.some((t) => t.key === first) ? first : outline.topics[0].key;
  return (
    <TopicOpenCtx.Provider
      value={(name) => {
        const t = outline.topics.find((x) => x.title.en === name);
        if (t) onTopic?.(t);
      }}
    >
      <div className="space-y-2" data-fact-sections>
        {outline.topics.map((t) => (
          <TopicSection
            key={t.key}
            name={t.title.en}
            title={(lang === "hi" && t.title.hi) || t.title.en}
            count={t.count}
            lang={lang}
            open={t.key === firstKey}
          >
            <LazyTopic
              district={district}
              topic={t.key}
              lang={lang}
              mark={mark}
              placeOf={placeOf}
              onPlace={onPlace}
            />
          </TopicSection>
        ))}
      </div>
    </TopicOpenCtx.Provider>
  );
}

function LazyTopic({
  district,
  topic,
  lang,
  mark,
  placeOf,
  onPlace,
}: {
  district: string;
  topic: string;
  lang: AtlasLang;
  mark: string[];
  placeOf?: (name: string) => string | null;
  onPlace?: (key: string) => void;
}) {
  const q = useAtlasDistrictPart(district, topic, mark);
  if (q.isError) return <LoadFailed lang={lang} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div data-topic-loading>
        <Loading />
      </div>
    );
  const t = districtTopics(q.data, mark, lang)[0];
  return t ? (
    <TopicBody t={t} lang={lang} mark={mark} placeOf={placeOf} onPlace={onPlace} />
  ) : (
    <NoFacts lang={lang} />
  );
}

// ====================== A district's places ======================
//
// Kind (the map's groups) → category (forts, temples, lakes…) → a card per
// place with its facts (key facts, its main points, on the map); places
// with no facts yet as compact chips.

export type DistrictPlace = { key: string; name: string; title: string; cat: string };

function placeEntity(p: DistrictPlace, facts: PublicFact[], lang: AtlasLang): Entity {
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const f of facts) {
    if (!f.places.includes(p.key)) continue;
    const sig = f.text.en.trim().toLowerCase();
    if (seen.has(sig)) continue;
    seen.add(sig);
    const parts = f.heading.split(" › ").filter(Boolean);
    const hiParts = (f.headingHi || "").split(" › ");
    const pick = (from: number) =>
      (lang === "hi" && f.headingHi ? parts.map((x, k) => hiParts[k] || x) : parts)
        .slice(from)
        .join(" › ");
    // The notes' place block: its own labels ("About", "Architecture");
    // elsewhere the heading it sits under.
    const own = /^(places|स्थान)$/i.test(parts[0] ?? "") && parts.length >= 2;
    const label = own ? parts.slice(2).join(" › ") : f.heading;
    let b = blocks.find((x) => x.label === label);
    if (!b) blocks.push((b = { label, title: own ? pick(2) : pick(0), facts: [] }));
    b.facts.push(f);
  }
  // Its own block first.
  blocks.sort((a, b) => Number(b.label === "") - Number(a.label === ""));
  return { name: p.name, title: p.title, blocks, places: [] };
}

export function DistrictPlaces({
  places,
  facts,
  lang,
  mark,
  onPlace,
  open: openFirst,
}: {
  places: DistrictPlace[];
  facts: PublicFact[];
  lang: AtlasLang;
  mark: string[];
  onPlace: (key: string) => void;
  // The kind to open first (from the Overview's "What's here").
  open?: string | null;
}) {
  const [more, setMore] = useState<string[]>([]);
  const groups = ATLAS_GROUPS.map((g) => {
    const mine = places.filter((p) => atlasCat(p.cat).group === g.key);
    const cats = ATLAS_CATS.filter((c) => c.group === g.key)
      .map((c) => {
        const all = mine
          .filter((p) => p.cat === c.key)
          .map((p) => ({ p, e: placeEntity(p, facts, lang) }))
          .map((x) => ({ ...x, n: x.e.blocks.reduce((k, b) => k + b.facts.length, 0) }))
          .sort((a, b) => b.n - a.n || a.p.title.localeCompare(b.p.title));
        // The same place twice (the master map's "Karni Mata, Deshnok" and
        // the notes' "Karni Mata temple, Deshnok"): one card, the facts of
        // both, the fuller one's pin.
        const list: typeof all = [];
        for (const x of all) {
          const k = baseName(x.p.name);
          const host = k.length >= 3 ? list.find((y) => baseName(y.p.name) === k) : undefined;
          if (!host) {
            list.push(x);
            continue;
          }
          const seen = new Set(
            host.e.blocks.flatMap((b) => b.facts.map((f) => f.text.en.trim().toLowerCase())),
          );
          for (const b of x.e.blocks) {
            const fs = b.facts.filter((f) => !seen.has(f.text.en.trim().toLowerCase()));
            if (!fs.length) continue;
            const into = host.e.blocks.find((y) => y.label === b.label);
            if (into) into.facts.push(...fs);
            else host.e.blocks.push({ ...b, facts: fs });
          }
          host.n = host.e.blocks.reduce((k2, b) => k2 + b.facts.length, 0);
        }
        return { c, list };
      })
      .filter((x) => x.list.length);
    // Places whose category isn't in the list (old ones): under "other".
    return { g, cats, count: mine.length };
  }).filter((x) => x.count);
  if (!groups.length)
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "hi" ? "अभी कोई स्थान नहीं।" : "No places yet."}
      </p>
    );
  const first =
    openFirst && groups.some((x) => x.g.key === openFirst) ? openFirst : groups[0].g.key;
  return (
    <div className="space-y-2" data-district-places>
      {groups.map(({ g, cats, count }) => (
        <details
          key={g.key}
          open={g.key === first}
          className="group/s rounded-xl border border-border bg-background"
          data-place-group={g.key}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <i
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: g.color }}
            />
            <span className="min-w-0 flex-1 text-sm font-semibold">{pickBi(g.name, lang)}</span>
            <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
              {count}
            </span>
            <span className="text-muted-foreground transition-transform group-open/s:rotate-90">
              ›
            </span>
          </summary>
          <div className="space-y-4 border-t border-border p-2.5">
            {cats.map(({ c, list }) => {
              const rich = list.filter((x) => x.n > 0);
              const bare = list.filter((x) => x.n === 0);
              const id = `${g.key}|${c.key}`;
              const shown = more.includes(id) ? rich : rich.slice(0, 4);
              return (
                <section key={c.key} data-place-cat={c.key}>
                  <h3
                    className="mb-2 flex items-center gap-1.5 border-l-4 pl-2 text-xs font-bold uppercase tracking-wide"
                    style={{ borderColor: c.color, color: c.color }}
                  >
                    <span className="text-sm normal-case">{c.icon}</span>
                    {pickBi(c.name, lang)}
                    <span className="font-medium text-muted-foreground">· {list.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {shown.map(({ p, e }) => (
                      <EntityCard
                        key={p.key}
                        e={e}
                        lang={lang}
                        mark={mark}
                        placeOf={() => p.key}
                        onPlace={onPlace}
                        limit={3}
                      />
                    ))}
                  </div>
                  {rich.length > shown.length && (
                    <button
                      type="button"
                      onClick={() => setMore([...more, id])}
                      className="mt-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      {lang === "hi"
                        ? `${rich.length - shown.length} और`
                        : `${rich.length - shown.length} more`}
                    </button>
                  )}
                  {bare.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5" data-place-chips>
                      {bare.map(({ p }) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => onPlace(p.key)}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted"
                        >
                          <span>{c.icon}</span>
                          {p.title}
                        </button>
                      ))}
                    </div>
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

// ====================== A place's facts ======================
//
// The place's own block in the notes ("Places › Kumbhalgarh": also
// called, where, built, about…) as one card; its other facts by topic →
// subtopic → heading, as on a district; facts that only name it below,
// folded.

const isPlaceBlock = (f: PublicFact) => /^(places|स्थान)$/i.test(f.heading.split(" › ")[0] ?? "");

export function PlaceFacts({
  facts,
  mentions,
  lang,
  title,
  mark,
  limit = 8,
}: {
  facts: PublicFact[];
  mentions: PublicFact[];
  lang: AtlasLang;
  title: string;
  // Its names, picked out in the facts.
  mark: string[];
  // Points shown on the own card before "All N facts".
  limit?: number;
}) {
  const own = facts.filter(isPlaceBlock);
  const rest = facts.filter((f) => !isPlaceBlock(f));
  const blocks: Block[] = [];
  const seen = new Set<string>();
  for (const f of own) {
    const sig = f.text.en.trim().toLowerCase();
    if (seen.has(sig)) continue;
    seen.add(sig);
    const parts = f.heading.split(" › ");
    const hiParts = (f.headingHi || "").split(" › ");
    const label = parts.slice(2).join(" › ");
    const shown = (lang === "hi" && f.headingHi ? parts.map((x, k) => hiParts[k] || x) : parts)
      .slice(2)
      .join(" › ");
    let b = blocks.find((x) => x.label === label);
    if (!b) blocks.push((b = { label, title: shown, facts: [] }));
    b.facts.push(f);
  }
  blocks.sort((a, b) => Number(b.label === "") - Number(a.label === ""));
  const heading = (en: string, hi: string, n?: number) => (
    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {lang === "hi" ? hi : en}
      {n !== undefined && <span className="font-medium">· {n}</span>}
    </p>
  );
  if (!facts.length && !mentions.length)
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "hi" ? "अभी कोई तथ्य नहीं।" : "No facts yet."}
      </p>
    );
  return (
    <div className="space-y-4" data-place-facts>
      {blocks.length > 0 && (
        <EntityCard
          e={{ name: title, title: lang === "hi" ? "परिचय" : "About", blocks, places: [] }}
          lang={lang}
          mark={mark}
          limit={limit}
        />
      )}
      {rest.length > 0 && (
        <section>
          {heading("From the notes", "नोट्स से", rest.length)}
          <DistrictTopics facts={rest} lang={lang} mark={mark} />
        </section>
      )}
      {mentions.length > 0 && (
        <section>
          {heading("Mentioned in the notes", "नोट्स में उल्लेख", mentions.length)}
          <DistrictTopics facts={mentions} lang={lang} mark={mark} openFirst={false} />
        </section>
      )}
    </div>
  );
}

// A place's names to pick out in its facts: "Kumbhalgarh fort (UNESCO)" →
// "Kumbhalgarh", with its Hindi name.
export function placeMarks(name: { en: string; hi: string }): string[] {
  const clean = (x: string) =>
    (x.split(",")[0] ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(fort|temple|palace|lake|dam|sanctuary|fair|festival)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  return [clean(name.en), clean(name.hi)].filter((x) => x.length >= 3);
}

// ---------- A place's photo ----------

export type PhotoCredit = {
  thumb: string;
  w: number;
  h: number;
  page: string;
  author: string;
  license: string;
  licenseUrl: string;
};

// A place's photo from Wikimedia Commons with its credit (author, licence,
// a link to the file), as the licence asks.
export function PlacePhoto({
  photo,
  alt,
  lang,
}: {
  photo: PhotoCredit | null | undefined;
  alt: string;
  lang: AtlasLang;
}) {
  const [broken, setBroken] = useState(false);
  if (!photo || broken) return null;
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-muted" data-place-photo>
      <img
        src={photo.thumb}
        alt={alt}
        width={photo.w}
        height={photo.h}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="aspect-[3/2] w-full object-cover"
      />
      <figcaption className="truncate px-2 py-1 text-[10px] text-muted-foreground">
        {lang === "hi" ? "फ़ोटो: " : "Photo: "}
        <a href={photo.page} target="_blank" rel="noreferrer noopener" className="underline">
          {photo.author}
        </a>
        {" · "}
        {photo.licenseUrl ? (
          <a
            href={photo.licenseUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            {photo.license}
          </a>
        ) : (
          photo.license
        )}
        {lang === "hi" ? " · विकिमीडिया कॉमन्स से" : " · via Wikimedia Commons"}
      </figcaption>
    </figure>
  );
}
