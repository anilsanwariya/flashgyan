// "Asked in exams": questions from published past papers that name a place
// or district, on its card and page, with the answer a tap away.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, GraduationCap } from "lucide-react";
import { atlasAskedCountsFn, atlasAskedFn, type AskedQ } from "@/lib/atlas.functions";
import { pickBi, type AtlasLang } from "@/lib/atlas";
import { withOffline } from "@/lib/atlas-device";

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);

// How many questions each place and district has (for the map's filter).
export function useAtlasAskedCounts() {
  const fn = useServerFn(atlasAskedCountsFn);
  return useQuery({
    queryKey: ["atlasAskedCounts"],
    queryFn: () => withOffline("asked-counts", () => fn()),
    staleTime: 30 * 60_000,
  });
}

export function AskedInExams({
  lang,
  place,
  district,
}: {
  lang: AtlasLang;
  place?: string;
  district?: string;
}) {
  const fn = useServerFn(atlasAskedFn);
  const q = useQuery({
    queryKey: ["atlasAsked", place ?? null, district ?? null],
    queryFn: () =>
      withOffline(`asked:${place ?? ""}:${district ?? ""}`, () =>
        fn({ data: { place, district } }),
      ),
    staleTime: 30 * 60_000,
  });
  const [open, setOpen] = useState(false);
  const list = q.data ?? [];
  if (!list.length) return null;
  const shown = open ? list : list.slice(0, 2);
  return (
    <div data-asked>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
        <GraduationCap className="h-4 w-4" /> {L(lang, "परीक्षाओं में पूछा गया", "Asked in exams")}{" "}
        ({list.length})
      </p>
      <ul className="space-y-1.5">
        {shown.map((x) => (
          <AskedItem key={x.id} x={x} lang={lang} />
        ))}
      </ul>
      {list.length > 2 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 text-xs text-primary underline"
        >
          {open
            ? L(lang, "कम दिखाएँ", "Show fewer")
            : L(lang, `सभी ${list.length} देखें`, `See all ${list.length}`)}
        </button>
      )}
    </div>
  );
}

function AskedItem({ x, lang }: { x: AskedQ; lang: AtlasLang }) {
  const [show, setShow] = useState(false);
  const has = x.kind === "objective" && x.options.length > 0;
  return (
    <li className="rounded-lg border border-border bg-indigo-50/50 p-2 text-sm dark:bg-indigo-500/10">
      <p className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
        {x.paper}
        {x.kind === "subjective" && x.marks ? ` · ${x.marks} ${L(lang, "अंक", "marks")}` : ""}
      </p>
      <p className="whitespace-pre-line">{pickBi(x.question, lang)}</p>
      {pickBi(x.extra, lang) && (
        <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
          {pickBi(x.extra, lang)}
        </p>
      )}
      {has && (
        <>
          <ol className="mt-1 space-y-0.5 text-xs">
            {x.options.map((o, i) => (
              <li
                key={i}
                className={
                  show && x.correct === i + 1
                    ? "font-semibold text-emerald-700 dark:text-emerald-400"
                    : ""
                }
              >
                ({i + 1}) {pickBi(o, lang)}
                {show && x.correct === i + 1 ? " ✓" : ""}
              </li>
            ))}
          </ol>
          {x.correct != null && (
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-expanded={show}
              className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary"
            >
              {show
                ? L(lang, "उत्तर छिपाएँ", "Hide the answer")
                : L(lang, "उत्तर देखें", "Show the answer")}
              <ChevronDown className={`h-3 w-3 transition ${show ? "rotate-180" : ""}`} />
            </button>
          )}
        </>
      )}
    </li>
  );
}
