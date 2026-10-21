// Admin: Hindi and English saying the same thing. Parts printed in one
// language only, or whose two languages give different numbers or dates
// (found as the editor works) or different names (SAATHI compares them: one
// AI request, also after the evening collection). Each note shows both lines;
// the editor puts in SAATHI's fix or translation, corrects them by hand (kept
// in the story's History), or keeps them.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, Languages, Pencil, RefreshCw } from "lucide-react";
import {
  dismissCaLangNote,
  runCaLangCheck,
  translateCaPart,
  updateCaItem,
} from "@/lib/current-affairs.functions";
import { CATEGORIES, type CaContent } from "@/lib/current-affairs";
import {
  bilingualParts,
  langPartLabel,
  langText,
  withLangPart,
  type LangNote,
  type LangStatus,
} from "@/lib/ca-bilingual";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type DayStory = {
  id: string;
  headline: string;
  category: string;
  position: number;
  content: CaContent | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const KIND = {
  missing: "One language only",
  numbers: "Numbers and dates",
  names: "Names",
  hindi: "Hindi style",
};
const KIND_ORDER = { missing: 0, numbers: 1, names: 2, hindi: 3 };

export function LangCheckDialog({
  date,
  open,
  onOpenChange,
  status,
  checkedAt,
  items,
  onChanged,
  onOpenStory,
}: {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: LangStatus | null;
  checkedAt: string | null;
  items: DayStory[];
  onChanged: () => void;
  onOpenStory: (id: string) => void;
}) {
  const runFn = useServerFn(runCaLangCheck);
  const dismissFn = useServerFn(dismissCaLangNote);
  const saveFn = useServerFn(updateCaItem);
  const translateFn = useServerFn(translateCaPart);
  const [busy, setBusy] = useState<string | null>(null);
  // The note being corrected by hand, with its two lines.
  const [edit, setEdit] = useState<{ id: string; en: string; hi: string } | null>(null);
  // Notes handled while the dialog is open go at once, before the refresh.
  const [handled, setHandled] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setHandled(new Set());
    setEdit(null);
  }, [open]);

  // Grouped by story, in the review list's order.
  const groups = useMemo(() => {
    const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
    const stories = [...items].sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.position - b.position,
    );
    const notes = (status?.open ?? []).filter((n) => !handled.has(n.id));
    return stories
      .map((s) => {
        // In the order of the page, then missing, numbers, names.
        const at = new Map((s.content ? bilingualParts(s.content) : []).map((p, i) => [p.part, i]));
        return {
          story: s,
          notes: notes
            .filter((n) => n.item_id === s.id)
            .sort(
              (a, b) =>
                (at.get(a.part) ?? 999) - (at.get(b.part) ?? 999) ||
                KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
            ),
        };
      })
      .filter((g) => g.notes.length);
  }, [items, status, handled]);
  const count = groups.reduce((n, g) => n + g.notes.length, 0);
  const unchecked = status?.unchecked.length ?? 0;

  async function run() {
    setBusy("run");
    try {
      const r = await runFn({ data: { date } });
      toast.success(
        `Compared names in ${r.checked} ${r.checked === 1 ? "story" : "stories"}: ${r.found ? `${r.found} ${r.found === 1 ? "difference" : "differences"} found` : "no differences found"}${r.left ? `. ${r.left} more to compare: press the button again.` : ""}`,
      );
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't compare the stories"));
    } finally {
      setBusy(null);
    }
  }

  // Saves the part's new lines (SAATHI's fix, or the editor's own).
  async function save(n: LangNote, lines: { en: string; hi: string }, done: string) {
    const story = items.find((s) => s.id === n.item_id);
    if (!story?.content) return;
    let content = story.content;
    for (const lang of ["en", "hi"] as const) {
      const t = lines[lang].replace(/\s+/g, " ").trim();
      if (t && t !== langText(content, n.part, lang)) {
        content = withLangPart(content, n.part, lang, t);
      }
    }
    if (content === story.content) {
      setEdit(null);
      return;
    }
    setBusy(n.id);
    try {
      await saveFn({ data: { id: n.item_id, content, sync: false } });
      // The part's text changed, so every note on it goes.
      setHandled((cur) => {
        const next = new Set(cur);
        for (const x of status?.open ?? []) {
          if (x.item_id === n.item_id && x.part === n.part) next.add(x.id);
        }
        return next;
      });
      setEdit(null);
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(null);
    }
  }

  // SAATHI writes the missing language; the editor checks it, then saves.
  async function translate(n: LangNote) {
    if (!n.wrong) return;
    setBusy(n.id);
    try {
      const text = await translateFn({ data: { id: n.item_id, part: n.part, to: n.wrong } });
      setEdit({ id: n.id, en: n.en, hi: n.hi, [n.wrong]: text });
    } catch (e) {
      toast.error(errorText(e, "Couldn't translate"));
    } finally {
      setBusy(null);
    }
  }

  async function keep(n: LangNote) {
    setBusy(n.id);
    try {
      await dismissFn({ data: { date, id: n.id } });
      setHandled((cur) => new Set(cur).add(n.id));
      toast.success("Kept as it is");
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(null);
    }
  }

  const line = (n: LangNote, lang: "en" | "hi") => (
    <div
      className={`rounded-lg px-2.5 py-1.5 text-sm ${n.wrong === lang ? "bg-amber-500/15 ring-1 ring-amber-500/40" : "bg-muted/40"}`}
    >
      <span className="mr-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
        {lang === "hi" ? "Hindi" : "English"}
        {n.wrong === lang ? " · check this" : ""}
      </span>
      {n[lang] ? (
        <span lang={lang}>{n[lang]}</span>
      ) : (
        <span className="italic text-muted-foreground">(none)</span>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-5">
        <div className="pr-8">
          <DialogTitle className="text-base">Hindi–English check</DialogTitle>
          <DialogDescription className="text-xs">
            Parts in one language only, or whose Hindi and English differ. Missing parts, numbers
            and dates show as you work; SAATHI compares names.
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <span className="min-w-[10rem] flex-1 text-muted-foreground">
            {!status?.checked
              ? "Names not compared yet (one AI request; the evening collection does it too)."
              : `Names compared ${checkedAt ? when(checkedAt) : ""}.${unchecked ? ` ${unchecked} ${unchecked === 1 ? "story" : "stories"} changed since.` : ""}`}
          </span>
          {(!status?.checked || unchecked > 0) && (
            <Button size="sm" disabled={!!busy} onClick={() => void run()}>
              {busy === "run" ? (
                <>
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Comparing…
                </>
              ) : !status?.checked ? (
                "Compare names"
              ) : (
                `Compare ${unchecked === 1 ? "it" : `these ${unchecked}`}`
              )}
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {!count && (
            <p className="py-6 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Hindi and English match{status?.checked ? "" : " in numbers and dates"}.
            </p>
          )}
          {groups.map(({ story, notes }) => (
            <section key={story.id} data-lang-story={story.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <h4 className="min-w-0 flex-1 text-sm font-semibold">
                  {story.content?.headline.en || story.content?.headline.hi || story.headline}
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  disabled={!!busy}
                  onClick={() => {
                    onOpenChange(false);
                    onOpenStory(story.id);
                  }}
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open story
                </Button>
              </div>
              {notes.map((n) => (
                <div
                  key={n.id}
                  data-lang-note={n.id}
                  className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {langPartLabel(n)} · {KIND[n.kind]}
                  </div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {n.issue}
                  </p>
                  {edit?.id === n.id ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        lang="hi"
                        aria-label="Hindi"
                        placeholder="Hindi"
                        value={edit.hi}
                        onChange={(e) => setEdit({ ...edit, hi: e.target.value })}
                      />
                      <Textarea
                        rows={2}
                        aria-label="English"
                        placeholder="English"
                        value={edit.en}
                        onChange={(e) => setEdit({ ...edit, en: e.target.value })}
                      />
                    </div>
                  ) : (
                    <>
                      {line(n, "hi")}
                      {line(n, "en")}
                    </>
                  )}
                  {n.source && (
                    <p className="text-xs text-muted-foreground">Source: “{n.source}”</p>
                  )}
                  {n.fix && n.wrong && edit?.id !== n.id && (
                    <p className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        SAATHI's {n.wrong === "hi" ? "Hindi" : "English"}:{" "}
                      </span>
                      <b lang={n.wrong}>{n.fix}</b>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {edit?.id === n.id ? (
                      <>
                        <Button
                          size="sm"
                          disabled={!!busy}
                          onClick={() => void save(n, edit, "Saved")}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          {busy === n.id ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!!busy}
                          onClick={() => setEdit(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {n.kind === "missing" && (
                          <Button size="sm" disabled={!!busy} onClick={() => void translate(n)}>
                            <Languages className="mr-1 h-4 w-4" />
                            {busy === n.id ? "Translating…" : "Translate"}
                          </Button>
                        )}
                        {n.fix && n.wrong && (
                          <Button
                            size="sm"
                            disabled={!!busy}
                            onClick={() =>
                              void save(n, { en: n.en, hi: n.hi, [n.wrong!]: n.fix! }, "Fixed")
                            }
                          >
                            <Check className="mr-1 h-4 w-4" />
                            {busy === n.id ? "Saving…" : "Use fix"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() =>
                            setEdit({
                              id: n.id,
                              en: n.wrong === "en" && n.fix ? n.fix : n.en,
                              hi: n.wrong === "hi" && n.fix ? n.fix : n.hi,
                            })
                          }
                        >
                          <Pencil className="mr-1 h-4 w-4" /> Correct
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => void keep(n)}
                        >
                          It's fine
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
