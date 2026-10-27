// A card's words in Wiktionary, in the card window: meanings (Hindi and
// English Wiktionary), synonyms and antonyms (ticked when the card's back
// has them, else added with a tap) and other spellings.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import { lookupFlashDictionary } from "@/lib/flash-studio.functions";
import { backItems, lookupWords, wiktionaryUrl, type DictEntry } from "@/lib/flash-dict";
import { looseWord } from "@/lib/flash-spell";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

export function DictionaryPanel({
  front,
  back,
  onAdd,
  onClose,
}: {
  front: string;
  back: string;
  // A word added to the end of the card's back.
  onAdd: (word: string) => void;
  onClose: () => void;
}) {
  const lookupFn = useServerFn(lookupFlashDictionary);
  const words = lookupWords(front);
  const q = useQuery({
    queryKey: ["flashDict", words.join("|")],
    queryFn: () => lookupFn({ data: { words } }),
    enabled: words.length > 0,
    staleTime: 30 * 60_000,
    retry: false,
  });
  // The back's items, matched loosely (nukta, ँ / ं aside).
  const have = new Set(backItems(back).map(looseWord));
  return (
    <section
      aria-label="Dictionary"
      className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/10"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">Dictionary</span>
        <span className="text-xs text-muted-foreground">Wiktionary · often incomplete</span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-7 w-7"
          aria-label="Close the dictionary"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {!words.length && (
        <p className="text-xs text-muted-foreground">No Hindi word on the front.</p>
      )}
      {q.isLoading && (
        <p className="text-xs text-muted-foreground">Looking up {words.join(", ")}…</p>
      )}
      {q.error && (
        <p className="text-xs text-destructive">{errorText(q.error, "Couldn't look it up")}</p>
      )}
      {q.data?.failed.length ? (
        <p className="text-xs text-destructive">
          Couldn&apos;t reach Wiktionary for {q.data.failed.join(", ")}; try again later.
        </p>
      ) : null}
      {q.data?.entries.map((e) => (
        <Entry key={e.word} e={e} have={have} onAdd={onAdd} />
      ))}
    </section>
  );
}

function Entry({
  e,
  have,
  onAdd,
}: {
  e: DictEntry;
  have: Set<string>;
  onAdd: (word: string) => void;
}) {
  const chips = (list: string[], kind: string) => (
    <div className="flex flex-wrap items-center gap-1" aria-label={kind}>
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{kind}</span>
      {list.map((w) =>
        have.has(looseWord(w)) ? (
          <span
            key={w}
            data-dict-word={w}
            title="The card's back has it"
            className="flex items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs dark:bg-emerald-950/30"
          >
            <Check className="h-3 w-3 text-emerald-600" /> {w}
          </span>
        ) : (
          <button
            key={w}
            type="button"
            data-dict-word={w}
            title="Add to the back"
            onClick={() => onAdd(w)}
            className="flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> {w}
          </button>
        ),
      )}
    </div>
  );
  return (
    <div
      className="space-y-1.5 border-t border-sky-200/60 pt-2 first-of-type:border-0 first-of-type:pt-0 dark:border-sky-900/60"
      data-entry={e.word}
      lang="hi"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{e.word}</span>
        <a
          href={wiktionaryUrl(e.word, "hi")}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-0.5 text-xs text-primary hover:underline"
        >
          हिन्दी विक्षनरी <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href={wiktionaryUrl(e.word, "en")}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-0.5 text-xs text-primary hover:underline"
        >
          English Wiktionary <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {!e.found ? (
        <p className="text-xs text-muted-foreground">Not in Wiktionary.</p>
      ) : (
        <>
          {e.hi.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
              {e.hi.slice(0, 6).map((s, i) => (
                <li key={i}>
                  {s.pos && <span className="text-xs text-muted-foreground">{s.pos} · </span>}
                  {s.text}
                  {s.examples[0] && (
                    <span className="block text-xs italic text-muted-foreground">
                      {s.examples[0]}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {e.en.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-5 text-[13px]" lang="en">
              {e.en.slice(0, 6).map((s, i) => (
                <li key={i}>
                  {s.pos && <span className="text-xs text-muted-foreground">{s.pos} · </span>}
                  {s.text}
                </li>
              ))}
            </ol>
          )}
          {e.synonyms.length > 0 && chips(e.synonyms, "Synonyms")}
          {e.antonyms.length > 0 && chips(e.antonyms, "Antonyms")}
          {e.forms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">Other spellings</span>
              {e.forms.join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
