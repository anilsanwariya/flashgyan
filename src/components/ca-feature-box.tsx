// Admin: the monthly issue's background article. SAATHI suggests topics behind
// the month's stories that the knowledge base covers, writes the article from
// those notes only, and the admin edits it or leaves it out of the issue.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Loader2, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  getCaFeature,
  saveCaFeature,
  suggestCaFeatureTopics,
  writeCaFeature,
} from "@/lib/current-affairs.functions";
import type { CaFeature, FeatureTopic } from "@/lib/ca-feature";
import { BiLine, type Lang } from "@/components/ca-story-review";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FeatureBox({ month }: { month: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaFeature);
  const saveFn = useServerFn(saveCaFeature);
  const suggestFn = useServerFn(suggestCaFeatureTopics);
  const writeFn = useServerFn(writeCaFeature);
  const key = ["caFeature", month];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { month } }) });
  const [topics, setTopics] = useState<FeatureTopic[] | null>(null);
  const [custom, setCustom] = useState("");
  const [work, setWork] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [lang, setLang] = useState<Lang>("both");
  const feature = q.data ?? null;

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  async function run(label: string, fn: () => Promise<unknown>, ok?: string) {
    setWork(label);
    try {
      await fn();
      if (ok) toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setWork(null);
    }
  }
  const save = (next: CaFeature | null) => saveFn({ data: { month, feature: next } });
  const write = (t: { topic: { en: string; hi: string }; query: string; stories: string[] }) =>
    run(
      "Writing the article from your notes… (about a minute)",
      async () => {
        await writeFn({ data: { month, ...t } });
        setTopics(null);
        setCustom("");
      },
      "Article written",
    );

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Background article</h3>
        {feature && (
          <Badge tone={feature.included ? "good" : "muted"}>
            {feature.included ? "In the issue" : "Left out"}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        A short bilingual explainer on a static topic behind this month&apos;s news (a state
        commission, a technology, a provision), written only from SAATHI&apos;s knowledge base. It
        prints before the revision page; approving the issue remakes the PDF with it.
      </p>

      {work && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" /> {work}
        </p>
      )}

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : feature ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((e) => !e)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> {editing ? "Done editing" : "Edit"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!work}
              onClick={() =>
                run(
                  "Saving…",
                  () => save({ ...feature, included: !feature.included }),
                  feature.included ? "Left out of the issue" : "Back in the issue",
                )
              }
            >
              {feature.included ? "Leave out of the issue" : "Put back in the issue"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!work}
              onClick={() => write({ topic: feature.topic, query: feature.topic.en, stories: [] })}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Write again
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={!!work}
              onClick={() => {
                if (confirm("Delete this month's background article?"))
                  void run("Deleting…", () => save(null), "Article deleted");
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
            <div className="ml-auto inline-flex rounded-lg border border-border p-0.5 text-xs">
              {(["both", "hi", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`rounded-md px-2.5 py-1 ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {l === "both" ? "Both" : l === "hi" ? "हिंदी" : "English"}
                </button>
              ))}
            </div>
          </div>

          <article className={`space-y-3 ${feature.included ? "" : "opacity-60"}`}>
            <BiLine
              value={feature.title}
              lang={lang}
              editing={editing}
              strong
              onSave={(v) => save({ ...feature, title: v }).then(refresh)}
            />
            <div className="text-sm italic">
              <BiLine
                value={feature.intro}
                lang={lang}
                editing={editing}
                onSave={(v) => save({ ...feature, intro: v }).then(refresh)}
              />
            </div>
            {feature.sections.map((s, i) => {
              const setSection = (patch: Partial<typeof s>) =>
                save({
                  ...feature,
                  sections: feature.sections.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                }).then(refresh);
              return (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="text-sm text-primary">
                    <BiLine
                      value={s.heading}
                      lang={lang}
                      editing={editing}
                      strong
                      onSave={(v) => setSection({ heading: v })}
                      onDelete={
                        feature.sections.length > 1
                          ? () =>
                              run(
                                "Saving…",
                                () =>
                                  save({
                                    ...feature,
                                    sections: feature.sections.filter((_, j) => j !== i),
                                  }),
                                "Section removed",
                              )
                          : undefined
                      }
                    />
                  </div>
                  <div className="mt-1 text-sm">
                    <BiLine
                      value={s.body}
                      lang={lang}
                      editing={editing}
                      preLine
                      onSave={(v) => setSection({ body: v })}
                    />
                  </div>
                </div>
              );
            })}
            {feature.sources.length > 0 && (
              <p className="text-xs text-muted-foreground">
                From your notes: {feature.sources.join(", ")}
              </p>
            )}
          </article>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            size="sm"
            disabled={!!work}
            onClick={() =>
              run("Finding topics behind this month's stories…", async () => {
                const list = await suggestFn({ data: { month } });
                setTopics(list);
                if (!list.length)
                  toast.info(
                    "Your notes don't cover the topics behind this month's stories yet. Type a topic below instead.",
                  );
              })
            }
          >
            <Sparkles className="mr-1 h-4 w-4" /> Suggest topics
          </Button>

          {topics && topics.length > 0 && (
            <ul className="grid gap-2 md:grid-cols-3">
              {topics.map((t) => (
                <li key={t.topic.en} className="flex flex-col rounded-xl border border-border p-3">
                  <p className="font-medium" lang="hi">
                    {t.topic.hi}
                  </p>
                  <p className="text-sm text-muted-foreground">{t.topic.en}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Explains {t.stories.length} of this month&apos;s{" "}
                    {t.stories.length === 1 ? "story" : "stories"} · {t.passages} passages in your
                    notes
                  </p>
                  {t.stories.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                      {t.stories.slice(0, 3).map((s) => (
                        <li key={s} className="line-clamp-1">
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    size="sm"
                    className="mt-3 self-start"
                    disabled={!!work}
                    onClick={() => write(t)}
                  >
                    Write this article
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or type a topic, e.g. Rajasthan State Human Rights Commission"
              className="max-w-md"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!!work || custom.trim().length < 3}
              onClick={() =>
                write({
                  topic: { en: custom.trim(), hi: custom.trim() },
                  query: custom.trim(),
                  stories: [],
                })
              }
            >
              Write
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
