// A card's words in the dictionaries, in the card window: Hindi WordNet's
// meanings (when loaded, each with its synonyms and opposites) and
// Wiktionary's (Hindi and English), their words ticked when the card's back
// has them, else added with a tap; and the Dictionary tab loading WordNet.
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import {
  clearFlashWordnet,
  flashWordnetStatus,
  loadFlashWordnet,
  lookupFlashDictionary,
} from "@/lib/flash-studio.functions";
import { parseWordnet } from "@/lib/flash-wordnet";
import { unzipFile } from "@/lib/zip";
import { Input } from "@/components/ui/input";
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
        <span className="text-xs text-muted-foreground">
          Hindi WordNet (when loaded) and Wiktionary · not complete
        </span>
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
  // Wiktionary's own words (those WordNet's meanings don't already show).
  const inWn = new Set((e.wn ?? []).flatMap((s) => [...s.synonyms, ...s.antonyms]));
  const wikiSyn = e.synonyms.filter((w) => !inWn.has(w));
  const wikiAnt = e.antonyms.filter((w) => !inWn.has(w));
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
        <p className="text-xs text-muted-foreground">Not in the dictionaries.</p>
      ) : (
        <>
          {!!e.wn?.length && (
            <div className="space-y-1.5 rounded-md bg-background/70 p-2" aria-label="Hindi WordNet">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                हिन्दी वर्डनेट · IIT Bombay
              </div>
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
                {e.wn.slice(0, 6).map((s, i) => (
                  <li key={i} data-wn-sense={i}>
                    {s.pos && <span className="text-xs text-muted-foreground">{s.pos} · </span>}
                    {s.gloss}
                    {s.example && (
                      <span className="block text-xs italic text-muted-foreground">
                        {s.example}
                      </span>
                    )}
                    {s.synonyms.length > 0 && chips(s.synonyms.slice(0, 16), "पर्याय")}
                    {s.antonyms.length > 0 && chips(s.antonyms, "विलोम")}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {(e.hi.length > 0 || e.en.length > 0) && (
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Wiktionary
            </div>
          )}
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
          {wikiSyn.length > 0 && chips(wikiSyn, "Synonyms")}
          {wikiAnt.length > 0 && chips(wikiAnt, "Antonyms")}
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

// The studio's Dictionary tab: Hindi WordNet loaded from its download
// (the zip as it comes, or its database/data_txt file), read in the
// browser and saved in batches; or removed.
export function WordnetSettings() {
  const statusFn = useServerFn(flashWordnetStatus);
  const loadFn = useServerFn(loadFlashWordnet);
  const clearFn = useServerFn(clearFlashWordnet);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["flashWordnet"], queryFn: () => statusFn() });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const load = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const data = /\.zip$/i.test(file.name) ? await unzipFile(bytes, "data_txt") : bytes;
      if (!data)
        throw new Error("No database/data_txt in this zip: is it the Hindi WordNet download?");
      const { synsets } = parseWordnet(new TextDecoder().decode(data));
      if (synsets.length < 100) throw new Error("This doesn't look like Hindi WordNet's data_txt.");
      setProgress({ done: 0, total: synsets.length });
      for (let i = 0; i < synsets.length; i += 1000) {
        await loadFn({ data: { first: i === 0, synsets: synsets.slice(i, i + 1000) } });
        setProgress({ done: Math.min(synsets.length, i + 1000), total: synsets.length });
      }
      toast.success(`Hindi WordNet loaded: ${synsets.length.toLocaleString()} meanings`);
      await qc.invalidateQueries({ queryKey: ["flashWordnet"] });
      await qc.invalidateQueries({ queryKey: ["flashDict"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't load it"));
    } finally {
      setProgress(null);
    }
  };
  const s = q.data;
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <section className="space-y-2 rounded-xl border border-border p-4" aria-label="Hindi WordNet">
        <h2 className="font-semibold">Hindi WordNet</h2>
        <p className="text-muted-foreground">
          IIT Bombay&apos;s Hindi WordNet (CFILT): about 40,000 meanings with their synonyms
          (पर्याय), opposites (विलोम), a gloss and an example. Once loaded, the card window&apos;s
          Dictionary shows it first and the AI check is told what it says. It stays in your
          database, used only here in the studio.
        </p>
        {q.isLoading ? (
          <p className="text-muted-foreground">Checking…</p>
        ) : s === null ? (
          <p className="text-destructive">
            The database needs the Hindi WordNet tables first: run the latest migration
            (flash_wordnet) in Lovable or the SQL editor.
          </p>
        ) : s && s.synsets > 0 ? (
          <p data-wn-status="loaded">
            <b>Loaded:</b> {s.synsets.toLocaleString()} meanings, {s.words.toLocaleString()} words
            {s.loadedAt ? ` (${new Date(s.loadedAt).toLocaleDateString()})` : ""}.
          </p>
        ) : (
          <p data-wn-status="empty" className="text-muted-foreground">
            Not loaded yet.
          </p>
        )}
        {progress ? (
          <div className="space-y-1" role="status">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Saving {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">
                The download as it is (HindiWN_1_5.zip), or its database/data_txt file
              </span>
              <Input
                type="file"
                aria-label="Hindi WordNet file"
                className="max-w-xs"
                disabled={s === null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void load(f);
                }}
              />
            </label>
            {!!s?.synsets && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={async () => {
                  if (!confirm("Remove Hindi WordNet from the database?")) return;
                  try {
                    await clearFn();
                    await qc.invalidateQueries({ queryKey: ["flashWordnet"] });
                    toast.success("Removed");
                  } catch (e) {
                    toast.error(errorText(e, "Couldn't remove it"));
                  }
                }}
              >
                Remove
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Hindi WordNet 1.5, © IIT Bombay (Center for Indian Language Technology).
        </p>
      </section>
    </div>
  );
}
