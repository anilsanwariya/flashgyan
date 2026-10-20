// Admin: a story's earlier versions. Each time a story is written again, the
// old text is kept (the last few), so a rewrite that came out worse can be
// compared with what was there before and undone.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import {
  listCaVersions,
  restoreCaVersion,
  type CaItem,
  type CaVersion,
} from "@/lib/current-affairs.functions";
import { normalizeForMatch, type Bi, type CaContent } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Lang } from "@/components/ca-story-review";

const REASONS: Record<CaVersion["reason"], string> = {
  write: "Before writing again",
  rewrite: "Before rewrite from highlights",
  restore: "Before a restore",
  edit: "Before your edits",
  correction: "Before a correction",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const pointKey = (p: Bi) => normalizeForMatch(p.en || p.hi);

export function StoryHistory({
  item,
  lang,
  open,
  onOpenChange,
  onChanged,
}: {
  item: CaItem;
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const listFn = useServerFn(listCaVersions);
  const restoreFn = useServerFn(restoreCaVersion);
  const q = useQuery({
    queryKey: ["caVersions", item.id],
    queryFn: () => listFn({ data: { id: item.id } }),
    enabled: open,
  });
  const [pick, setPick] = useState<string | null>(null);
  // Phones show one side at a time.
  const [side, setSide] = useState<"then" | "now">("then");
  const [busy, setBusy] = useState(false);
  const versions = q.data ?? [];
  const version = versions.find((v) => v.id === pick) ?? versions[0];

  async function restore(v: CaVersion) {
    if (
      !confirm(
        "Put this version back? The story as it is now is kept in history, so you can switch back.",
      )
    )
      return;
    setBusy(true);
    try {
      await restoreFn({ data: { id: item.id, version_id: v.id } });
      toast.success("Earlier version restored");
      setPick(null);
      onChanged();
      void q.refetch();
    } catch (e) {
      toast.error(errorText(e, "Couldn't restore the version"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-3 p-3 sm:p-5">
        <div className="pr-8">
          <DialogTitle className="text-base">Story history</DialogTitle>
          <DialogDescription className="text-xs">
            The last 10 versions: before each rewrite, your edits and approved corrections. Compare,
            then restore one if the old text was better.
          </DialogDescription>
        </div>

        {q.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !version ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No earlier versions yet. Each time this story is written again or edited, the old text
            is kept here so you can compare and undo.
          </p>
        ) : (
          <>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={v.id === version.id}
                  onClick={() => setPick(v.id)}
                  className={`shrink-0 rounded-xl border px-3 py-1.5 text-left text-xs ${v.id === version.id ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <div className="font-medium">{REASONS[v.reason] ?? "Earlier"}</div>
                  <div className="text-muted-foreground">{when(v.created_at)}</div>
                </button>
              ))}
            </div>

            <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium md:hidden">
              {(["then", "now"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                  className={`flex-1 rounded-md py-1.5 ${side === s ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  {s === "then" ? "Then" : "Now"}
                </button>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-2">
              <div className={side === "then" ? "" : "hidden md:block"} data-side="then">
                <Version
                  title={`Then · ${when(version.created_at)}`}
                  content={version.snapshot.content}
                  facts={version.snapshot.facts.length}
                  other={item.content}
                  mark="gone"
                  lang={lang}
                />
              </div>
              <div className={side === "now" ? "" : "hidden md:block"} data-side="now">
                <Version
                  title="Now"
                  content={item.content}
                  facts={item.facts.length}
                  other={version.snapshot.content}
                  mark="new"
                  lang={lang}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                Restoring brings back its text, key points, MCQ, Mains question, visual and Static
                Connect.
              </span>
              <Button size="sm" disabled={busy} onClick={() => void restore(version)}>
                <RotateCcw className="mr-1 h-4 w-4" /> Restore this version
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// One side of the comparison. Key points the other side doesn't have are
// marked: "gone" on the old side, "new" on the current one.
function Version({
  title,
  content,
  facts,
  other,
  mark,
  lang,
}: {
  title: string;
  content: CaContent | null;
  facts: number;
  other: CaContent | null;
  mark: "gone" | "new";
  lang: Lang;
}) {
  if (!content) {
    return (
      <section className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide">{title}</h3>
        Not written.
      </section>
    );
  }
  const otherKeys = new Set((other?.points ?? []).map(pointKey));
  const changed = (a: Bi | null | undefined, b: Bi | null | undefined) =>
    !!other && normalizeForMatch(a?.en || a?.hi || "") !== normalizeForMatch(b?.en || b?.hi || "");
  return (
    <section className="space-y-2.5 rounded-xl border border-border p-3 text-sm leading-relaxed">
      <h3 className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <Badge>
          {facts} fact{facts === 1 ? "" : "s"}
        </Badge>
      </h3>
      <Text value={content.headline} lang={lang} strong />
      <Field label="Summary" changed={changed(content.summary, other?.summary)}>
        <Text value={content.summary} lang={lang} />
      </Field>
      <Field label="Key points">
        <ol className="space-y-1.5">
          {content.points.map((p, i) => {
            const differs = !!other && !otherKeys.has(pointKey(p));
            return (
              <li
                key={i}
                data-diff={differs ? mark : undefined}
                className={`flex gap-2 rounded-lg ${differs ? (mark === "new" ? "bg-emerald-500/10 p-1.5" : "bg-destructive/10 p-1.5") : ""}`}
              >
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <Text value={p} lang={lang} />
                  {differs && (
                    <span
                      className={`text-[11px] font-medium ${mark === "new" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                    >
                      {mark === "new" ? "New" : "Not in the current version"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Field>
      <Field label="Why it matters" changed={changed(content.why, other?.why)}>
        <Text value={content.why} lang={lang} />
      </Field>
      {content.statics?.length ? (
        <Field label="Static Connect">
          <div className="flex flex-wrap gap-1">
            {content.statics.map((s, i) => (
              <Badge key={i}>
                {lang === "hi" ? s.keyword.hi || s.keyword.en : s.keyword.en || s.keyword.hi}
              </Badge>
            ))}
          </div>
        </Field>
      ) : null}
    </section>
  );
}

function Field({
  label,
  changed,
  children,
}: {
  label: string;
  changed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {label}
        {changed && <Badge tone="primary">changed</Badge>}
      </div>
      {children}
    </div>
  );
}

function Text({ value, lang, strong }: { value: Bi; lang: Lang; strong?: boolean }) {
  const cls = strong ? "font-semibold leading-snug" : "";
  if (lang === "en") return <div className={cls}>{value.en || value.hi}</div>;
  if (lang === "hi")
    return (
      <div lang="hi" className={cls}>
        {value.hi || value.en}
      </div>
    );
  return (
    <div className={cls}>
      {value.hi && <div lang="hi">{value.hi}</div>}
      {value.en && <div className="text-muted-foreground">{value.en}</div>}
    </div>
  );
}
