// The current affairs web reader's shared parts: the page frame, the
// language and reading-size choices (kept per student), and a day's stories
// shown inside a shadow root (the magazine's own styles kept apart from the
// site's).
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Moon, Sun, Type } from "lucide-react";
import finalLogo from "@/assets/final-logo.png";
import { factParts } from "@/lib/ca-reader";

export type ReaderLang = "en" | "hi";

const PREFS_KEY = "ca_reader_prefs";
type Prefs = { lang: ReaderLang; size: number; dark: boolean };
const DEFAULT_PREFS: Prefs = { lang: "hi", size: 17, dark: false };
export const READER_SIZES = [15, 17, 19, 21];

function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return {
      lang: v.lang === "en" ? "en" : "hi",
      size: READER_SIZES.includes(Number(v.size)) ? Number(v.size) : DEFAULT_PREFS.size,
      dark: !!v.dark,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// The student's choices, remembered on this device (Hindi by default).
export function useReaderPrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => setPrefs(readPrefs()), []);
  const update = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Kept for this visit only.
      }
      return next;
    });
  return [prefs, update];
}

export const READER_FONTS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap";

export function ReaderHeader({
  back,
  backLabel,
  prefs,
  setPrefs,
  showSize = false,
}: {
  back: string;
  backLabel: string;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  showSize?: boolean;
}) {
  const nextSize = () => {
    const i = READER_SIZES.indexOf(prefs.size);
    setPrefs({ size: READER_SIZES[(i + 1) % READER_SIZES.length] });
  };
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center gap-2">
        <Link
          to={back}
          className="inline-flex h-10 items-center gap-1 rounded-full px-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <img src={finalLogo} alt="Flashgyan" className="mx-auto h-8 w-auto object-contain" />
        <div
          role="group"
          aria-label="Language"
          className="flex overflow-hidden rounded-full border border-border text-sm"
        >
          {(["hi", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={prefs.lang === l}
              onClick={() => setPrefs({ lang: l })}
              className={`h-9 px-3 font-semibold ${prefs.lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {l === "hi" ? "हिंदी" : "EN"}
            </button>
          ))}
        </div>
        {showSize && (
          <>
            <button
              type="button"
              aria-label="Text size"
              title="Text size"
              onClick={nextSize}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground"
            >
              <Type className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={prefs.dark ? "Light pages" : "Dark pages"}
              title={prefs.dark ? "Light pages" : "Dark pages"}
              onClick={() => setPrefs({ dark: !prefs.dark })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground"
            >
              {prefs.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export type ReaderSectionRef = { cat: string; label: string; el: HTMLElement };

// Marks amounts, numbers with their units and dates bold.
function boldFacts(root: ParentNode) {
  root.querySelectorAll(".summary, .points, .context .bi").forEach((el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walk.nextNode()) nodes.push(walk.currentNode as Text);
    for (const t of nodes) {
      const parts = factParts(t.nodeValue ?? "");
      if (!parts.some((p) => p.fact)) continue;
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (!p.fact) frag.append(p.text);
        else {
          const b = document.createElement("b");
          b.className = "fact";
          b.textContent = p.text;
          frag.append(b);
        }
      }
      t.replaceWith(frag);
    }
  });
}

// A day's stories (the magazine's web edition) in a shadow root. Reports
// its sections once shown, and opens on story `story` when asked.
export function DayStories({
  html,
  lang,
  size,
  dark,
  story,
  onSections,
}: {
  html: string;
  lang: ReaderLang;
  size: number;
  dark: boolean;
  story: number | null;
  onSections: (s: ReaderSectionRef[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = html;
    boldFacts(root);
    root.querySelectorAll<HTMLElement>(".item").forEach((el, i) => (el.id = `story-${i + 1}`));
    onSections(
      [...root.querySelectorAll<HTMLElement>(".section[data-cat]")].map((el) => ({
        cat: el.dataset.cat ?? "",
        label: el.querySelector(".section-title h2")?.textContent?.trim() ?? "",
        el,
      })),
    );
    if (story) root.getElementById(`story-${story}`)?.scrollIntoView({ block: "start" });
    // The page is built once per day and language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  return (
    <div
      ref={ref}
      lang={lang}
      data-dark={dark ? "" : undefined}
      style={{ ["--reader-size" as string]: `${size}px` }}
    />
  );
}
