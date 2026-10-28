// The Dictionary tab's English part: Open English WordNet (the download's
// zip, read here and saved in batches) and the British spelling list
// (SCOWL's en_GB Hunspell dictionary, fetched or its two files picked,
// every form of every word worked out here and saved).
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  clearFlashEnglish,
  flashEnglishStatus,
  loadFlashEnSpellings,
  loadFlashEnWordnet,
} from "@/lib/flash-studio.functions";
import { enWordRows, expandHunspell, parseEnIndex, parseEnWordnet } from "@/lib/flash-english";
import { unzipFile } from "@/lib/zip";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Where the British list is fetched from (SCOWL en_GB, -ise spelling).
const GB = "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en-GB/index";
const POS = ["noun", "verb", "adj", "adv"];

type Progress = { what: string; done: number; total: number };

export function EnglishSettings() {
  const statusFn = useServerFn(flashEnglishStatus);
  const wnFn = useServerFn(loadFlashEnWordnet);
  const spellFn = useServerFn(loadFlashEnSpellings);
  const clearFn = useServerFn(clearFlashEnglish);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["flashEnglish"], queryFn: () => statusFn() });
  const [progress, setProgress] = useState<Progress | null>(null);
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["flashEnglish"] });
    await qc.invalidateQueries({ queryKey: ["flashTopicWords"] });
  };
  const loadWordnet = async (file: File) => {
    try {
      const zip = new Uint8Array(await file.arrayBuffer());
      const read = async (name: string) => {
        const b = await unzipFile(zip, name);
        return b ? new TextDecoder().decode(b) : null;
      };
      const data = await Promise.all(POS.map((p) => read(`data.${p}`)));
      if (data.some((d) => d === null))
        throw new Error(
          "No data.noun / data.verb / data.adj / data.adv in this zip: is it the WordNet download (WNDB)?",
        );
      const index = parseEnIndex(
        (await Promise.all(POS.map((p) => read(`index.${p}`)))).filter((x): x is string => !!x),
      );
      const { synsets } = parseEnWordnet(data as string[]);
      if (synsets.length < 1000) throw new Error("This doesn't look like English WordNet.");
      const rows = enWordRows(synsets, index);
      const bySynset = new Map<string, typeof rows>();
      for (const r of rows) bySynset.set(r.synset_id, [...(bySynset.get(r.synset_id) ?? []), r]);
      setProgress({ what: "English WordNet", done: 0, total: synsets.length });
      for (let i = 0; i < synsets.length; i += 1000) {
        const part = synsets.slice(i, i + 1000);
        await wnFn({
          data: {
            first: i === 0,
            synsets: part,
            words: part.flatMap((s) => bySynset.get(s.id) ?? []),
          },
        });
        setProgress({
          what: "English WordNet",
          done: Math.min(synsets.length, i + 1000),
          total: synsets.length,
        });
      }
      toast.success(`English WordNet loaded: ${synsets.length.toLocaleString()} meanings`);
      await done();
    } catch (e) {
      toast.error(errorText(e, "Couldn't load it"));
    } finally {
      setProgress(null);
    }
  };
  const loadSpellings = async (files?: FileList | null) => {
    try {
      let aff = "";
      let dic = "";
      if (files?.length) {
        for (const f of [...files]) {
          if (/\.aff$/i.test(f.name)) aff = await f.text();
          if (/\.dic$/i.test(f.name)) dic = await f.text();
        }
        if (!aff || !dic) throw new Error("Pick both files: the .aff and the .dic");
      } else {
        const [a, d] = await Promise.all([fetch(`${GB}.aff`), fetch(`${GB}.dic`)]);
        if (!a.ok || !d.ok) throw new Error("Couldn't fetch the list: pick its two files instead");
        [aff, dic] = await Promise.all([a.text(), d.text()]);
      }
      const words = expandHunspell(aff, dic);
      if (words.length < 10000) throw new Error("This doesn't look like an English word list.");
      setProgress({ what: "British spelling list", done: 0, total: words.length });
      for (let i = 0; i < words.length; i += 10000) {
        await spellFn({ data: { first: i === 0, words: words.slice(i, i + 10000) } });
        setProgress({
          what: "British spelling list",
          done: Math.min(words.length, i + 10000),
          total: words.length,
        });
      }
      toast.success(`British spelling list loaded: ${words.length.toLocaleString()} words`);
      await done();
    } catch (e) {
      toast.error(errorText(e, "Couldn't load it"));
    } finally {
      setProgress(null);
    }
  };
  const remove = async (which: "wordnet" | "spellings", name: string) => {
    if (!confirm(`Remove ${name} from the database?`)) return;
    try {
      await clearFn({ data: { which } });
      await done();
      toast.success("Removed");
    } catch (e) {
      toast.error(errorText(e, "Couldn't remove it"));
    }
  };
  const s = q.data;
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-label="English">
      <h2 className="font-semibold">English</h2>
      <p className="text-muted-foreground">
        For English decks (and English words in any deck): the British spelling list says whether a
        word is spelt right, with every form of every word (colour, colours, organised, children);
        English WordNet gives its meanings, synonyms and antonyms. American spellings show as not
        known, with the British one offered (color → colour).
      </p>
      {q.isLoading ? (
        <p className="text-muted-foreground">Checking…</p>
      ) : s === null ? (
        <p className="text-destructive">
          The database needs the English tables first: run the latest migration (flash_english) in
          Lovable or the SQL editor.
        </p>
      ) : progress ? (
        <div className="space-y-1" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.what}: saving {progress.done.toLocaleString()} of{" "}
            {progress.total.toLocaleString()}…
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">British spelling list</h3>
            <p data-en-status="spellings" className="text-sm">
              {s?.spellings ? `Loaded: ${s.spellings.toLocaleString()} words.` : "Not loaded yet."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void loadSpellings()}>
                {s?.spellings ? "Load it again" : "Load the British spelling list"}
              </Button>
              <label className="text-xs text-muted-foreground">
                or pick its two files (en_GB .aff and .dic):{" "}
                <Input
                  type="file"
                  multiple
                  accept=".aff,.dic"
                  aria-label="British spelling list files"
                  className="mt-1 max-w-xs"
                  onChange={(e) => {
                    const f = e.target.files;
                    void loadSpellings(f).finally(() => (e.target.value = ""));
                  }}
                />
              </label>
              {!!s?.spellings && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void remove("spellings", "the British spelling list")}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">English WordNet</h3>
            <p data-en-status="wordnet" className="text-sm">
              {s?.synsets
                ? `Loaded: ${s.synsets.toLocaleString()} meanings, ${s.words.toLocaleString()} words.`
                : "Not loaded yet."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  The Open English WordNet download in WNDB form (english-wordnet-2025.zip from
                  en-word.net) as it is
                </span>
                <Input
                  type="file"
                  accept=".zip"
                  aria-label="English WordNet file"
                  className="max-w-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void loadWordnet(f);
                  }}
                />
              </label>
              {!!s?.synsets && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void remove("wordnet", "English WordNet")}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Open English WordNet (CC BY 4.0), from Princeton WordNet © Princeton University. The British
        spelling list is SCOWL&apos;s en_GB Hunspell dictionary, © 2000–2018 Kevin Atkinson and
        others.
      </p>
    </section>
  );
}
