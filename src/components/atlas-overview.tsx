// A district's overview page, as students read it: the header, a chip for
// each section, the sections' blocks (key facts, chips, tables, timelines,
// tricks, borders), quick-revision cards and the verification notes.
// Shared by the students' district page and the admin's preview.
import { useState, type ReactNode } from "react";
import {
  boldHtml,
  pickBi,
  type AtlasLang,
  type DistrictOverview,
  type OverviewBlock,
} from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";

const T = (b: Bi | undefined, lang: AtlasLang) => pickBi(b, lang);
const Rich = ({ text, className = "" }: { text: string; className?: string }) => (
  <span className={className} dangerouslySetInnerHTML={{ __html: boldHtml(text) }} />
);

export function OverviewHero({
  ov,
  lang,
  children,
}: {
  ov: DistrictOverview;
  lang: AtlasLang;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b-2 border-[#1f2a5c] bg-[#f3e9d6] px-4 pb-6 pt-8 dark:border-indigo-300 dark:bg-[#2a2418] sm:px-8">
      <p className="text-xs text-[#6b5a3f] dark:text-amber-200/70">
        {lang === "hi" ? "जिला दर्शन, राजस्थान" : "District overview, Rajasthan"}
      </p>
      <h1 className="mt-1 font-serif text-5xl font-bold leading-tight text-[#1f2a5c] dark:text-indigo-200 sm:text-6xl">
        {T(ov.name, lang)}
      </h1>
      {T(ov.tagline, lang) && (
        <p className="mt-2 text-lg font-semibold text-[#9b2c1f] dark:text-rose-300">
          {T(ov.tagline, lang)}
        </p>
      )}
      {ov.badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ov.badges.map((b, i) => (
            <span
              key={i}
              className="rounded-full border border-[#1f2a5c]/40 bg-white/70 px-3 py-0.5 text-xs font-semibold text-[#1f2a5c] dark:bg-white/10 dark:text-indigo-100"
            >
              {T(b, lang)}
            </span>
          ))}
        </div>
      )}
      {children}
    </header>
  );
}

export function OverviewSections({
  ov,
  lang,
  before,
}: {
  ov: DistrictOverview;
  lang: AtlasLang;
  // Shown after the first section (the district's map).
  before?: ReactNode;
}) {
  return (
    <div className="space-y-10">
      {ov.sections.map((s, i) => (
        <div key={s.id} className="space-y-10">
          <section
            id={`sec-${s.id}`}
            className="scroll-mt-28 space-y-4"
            aria-label={T(s.title, lang)}
          >
            <div>
              <h2 className="font-serif text-3xl font-bold text-[#1f2a5c] dark:text-indigo-200">
                {T(s.title, lang)}
              </h2>
              {T(s.lede, lang) && (
                <p className="mt-1 text-sm text-muted-foreground">{T(s.lede, lang)}</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.blocks.map((b, j) => (
                <Block key={j} b={b} lang={lang} />
              ))}
            </div>
          </section>
          {i === 0 && before}
        </div>
      ))}
      {ov.revision.length > 0 && <Revision ov={ov} lang={lang} />}
      {(ov.notes.length > 0 || ov.source) && (
        <footer className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-700/50 dark:bg-amber-950/30">
          {ov.notes.length > 0 && (
            <>
              <p className="font-semibold">
                {lang === "hi" ? "सत्यापन हेतु नोट" : "Notes to verify"}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {ov.notes.map((n, i) => (
                  <li key={i}>{T(n, lang)}</li>
                ))}
              </ul>
            </>
          )}
          {ov.source && (
            <p className="text-xs text-muted-foreground">
              {lang === "hi" ? "स्रोत" : "Source"}: {ov.source}
            </p>
          )}
        </footer>
      )}
    </div>
  );
}

export function SectionChips({ ov, lang }: { ov: DistrictOverview; lang: AtlasLang }) {
  return (
    <nav
      aria-label={lang === "hi" ? "विषय" : "Sections"}
      className="flex gap-1.5 overflow-x-auto pb-1"
    >
      {ov.sections.map((s) => (
        <a
          key={s.id}
          href={`#sec-${s.id}`}
          className="shrink-0 rounded-full border border-[#1f2a5c]/30 bg-white/80 px-3 py-1 text-xs font-medium text-[#1f2a5c] hover:bg-[#1f2a5c] hover:text-white dark:bg-white/10 dark:text-indigo-100"
        >
          {T(s.title, lang)}
        </a>
      ))}
      {ov.revision.length > 0 && (
        <a
          href="#sec-revision"
          className="shrink-0 rounded-full border border-[#9b2c1f]/40 bg-white/80 px-3 py-1 text-xs font-medium text-[#9b2c1f] dark:bg-white/10 dark:text-rose-200"
        >
          {lang === "hi" ? "रिवीजन" : "Revision"}
        </a>
      )}
    </nav>
  );
}

const card =
  "rounded-xl border border-[#e5d7bd] bg-[#fffaf0] p-3.5 shadow-sm dark:border-white/10 dark:bg-white/5";
const wide = (b: OverviewBlock) =>
  b.type === "table" ||
  b.type === "timeline" ||
  b.type === "callout" ||
  b.type === "borders" ||
  b.type === "text";

function Block({ b, lang }: { b: OverviewBlock; lang: AtlasLang }) {
  const span = wide(b) ? "sm:col-span-2" : "";
  const title =
    "title" in b && T(b.title, lang) ? (
      <p className="mb-1.5 text-sm font-bold text-[#1f2a5c] dark:text-indigo-200">
        {T(b.title, lang)}
      </p>
    ) : null;
  switch (b.type) {
    case "big":
      return (
        <div className={`${card} ${span}`} data-block="big">
          {title}
          {T(b.value, lang) && (
            <p className="font-serif text-3xl font-bold text-[#9b2c1f] dark:text-rose-300">
              {T(b.value, lang)}
            </p>
          )}
          {T(b.text, lang) && (
            <Rich text={T(b.text, lang)} className="mt-1 block text-sm leading-relaxed" />
          )}
        </div>
      );
    case "chips":
      return (
        <div className={`${card} ${span}`} data-block="chips">
          {title}
          <div className="flex flex-wrap gap-1.5">
            {b.items.map((x, i) => (
              <span
                key={i}
                className={`rounded-full px-2.5 py-0.5 text-sm ${b.hot?.includes(i) ? "bg-[#c2410c] font-semibold text-white" : "border border-[#e5d7bd] bg-white dark:border-white/15 dark:bg-white/10"}`}
              >
                {T(x, lang)}
              </span>
            ))}
          </div>
        </div>
      );
    case "text":
      return (
        <div className={`${card} ${span}`} data-block="text">
          {title}
          <Rich text={T(b.text, lang)} className="block text-sm leading-relaxed" />
        </div>
      );
    case "list":
      return (
        <div className={`${card} ${span}`} data-block="list">
          {title}
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {b.items.map((x, i) => (
              <li key={i}>
                <Rich text={T(x, lang)} />
              </li>
            ))}
          </ul>
        </div>
      );
    case "table":
      return (
        <div
          className={`${span} overflow-hidden rounded-xl border border-[#e5d7bd] dark:border-white/10`}
          data-block="table"
        >
          {title && <div className="bg-[#fffaf0] px-3.5 pt-3 dark:bg-white/5">{title}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {b.cols.length > 0 && (
                <thead className="bg-[#1f2a5c] text-left text-white">
                  <tr>
                    {b.cols.map((c, i) => (
                      <th key={i} className="px-3 py-2 font-semibold">
                        {T(c, lang)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {b.rows.map((r, i) => (
                  <tr
                    key={i}
                    className="border-t border-[#efe4cf] bg-white odd:bg-[#fffdf8] dark:border-white/10 dark:bg-transparent"
                  >
                    {r.map((c, j) => {
                      const t = T(c, lang);
                      return (
                        <td
                          key={j}
                          className={`px-3 py-2 align-top ${j === 0 ? "font-semibold" : ""} ${t === "✓" ? "text-green-700" : ""}`}
                        >
                          <Rich text={t} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "callout": {
      const label =
        b.kind === "trick"
          ? lang === "hi"
            ? "ट्रिक"
            : "Trick"
          : b.kind === "remember"
            ? lang === "hi"
              ? "याद रखें"
              : "Remember"
            : lang === "hi"
              ? "नोट"
              : "Note";
      return (
        <div
          className={`${span} rounded-xl border-2 border-dashed px-3.5 py-2.5 text-sm ${b.kind === "note" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-teal-600/60 bg-teal-50 dark:bg-teal-950/30"}`}
          data-block="callout"
        >
          <span className="font-bold text-teal-800 dark:text-teal-300">{label}: </span>
          <Rich text={T(b.text, lang)} />
        </div>
      );
    }
    case "timeline":
      return (
        <div className={`${card} ${span}`} data-block="timeline">
          {title}
          <div className="space-y-4">
            {b.eras.map((e, i) => (
              <div key={i}>
                {T(e.title, lang) && (
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#9b2c1f] dark:text-rose-300">
                    {T(e.title, lang)}
                  </p>
                )}
                <ol className="relative space-y-2 border-l-2 border-[#d9c6a2] pl-4 dark:border-white/20">
                  {e.items.map((it, j) => (
                    <li key={j} className="relative text-sm">
                      <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#1f2a5c] dark:bg-indigo-300" />
                      <span className="mr-2 font-bold text-[#1f2a5c] dark:text-indigo-200">
                        {it.when}
                      </span>
                      <Rich text={T(it.text, lang)} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      );
    case "borders":
      return (
        <div className={`${card} ${span}`} data-block="borders">
          {title}
          <div className="flex flex-wrap gap-2">
            {T(b.intl, lang) && (
              <span className="rounded-lg border-2 border-red-500/70 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 dark:bg-red-950/30 dark:text-red-200">
                {T(b.intl, lang)}
              </span>
            )}
            {b.items.map((x, i) => (
              <span
                key={i}
                className="rounded-lg border border-[#e5d7bd] bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/10"
              >
                <b>{T(x.name, lang)}</b>
                {T(x.dir, lang) && (
                  <span className="ml-1 text-xs text-muted-foreground">{T(x.dir, lang)}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      );
  }
}

function Revision({ ov, lang }: { ov: DistrictOverview; lang: AtlasLang }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const all = open.size === ov.revision.length;
  return (
    <section
      id="sec-revision"
      className="scroll-mt-28 space-y-3"
      aria-label={lang === "hi" ? "झटपट रिवीजन" : "Quick revision"}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-3xl font-bold text-[#1f2a5c] dark:text-indigo-200">
            {lang === "hi" ? "झटपट रिवीजन" : "Quick revision"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {lang === "hi"
              ? "पहले मन में उत्तर सोचें, फिर कार्ड पर टैप करें।"
              : "Think of the answer, then tap the card."}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs"
          onClick={() => setOpen(all ? new Set() : new Set(ov.revision.map((_, i) => i)))}
        >
          {all
            ? lang === "hi"
              ? "सभी छिपाएँ"
              : "Hide all"
            : lang === "hi"
              ? "सभी उत्तर दिखाएँ"
              : "Show all answers"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ov.revision.map((r, i) => (
          <button
            key={i}
            type="button"
            aria-expanded={open.has(i)}
            onClick={() =>
              setOpen((s) => {
                const n = new Set(s);
                if (n.has(i)) n.delete(i);
                else n.add(i);
                return n;
              })
            }
            className={`${card} text-left`}
          >
            <p className="text-sm font-semibold">{T(r.q, lang)}</p>
            <p
              className={`mt-1.5 text-sm ${open.has(i) ? "text-[#9b2c1f] dark:text-rose-300" : "select-none blur-sm"}`}
            >
              {T(r.a, lang)}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
