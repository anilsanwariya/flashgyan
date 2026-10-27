// The app and the studio side by side: a topic already in the app brought
// into the studio, and a topic's chunks compared with the app's.
//
// A topic already in the app, brought into the studio: its final master
// sheet and the chunks downloaded from the app's admin panel, matched card
// by card (the app's version kept where they differ), then added as a topic
// numbered into its chunks, with the app's ids, its cards verified.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, X } from "lucide-react";
import {
  createFlashTopic,
  deleteFlashTopic,
  importFlashSheet,
  markFlashDownloaded,
  takeFlashAppText,
} from "@/lib/flash-studio.functions";
import {
  chunkChanges,
  parseSheet,
  type FlashCard,
  type FlashTemplate,
  type FlashTopic,
  type ParsedSheet,
} from "@/lib/flash-studio";
import { compareWithApp, planAppImport } from "@/lib/flash-app-import";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

async function readSheet(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return parseSheet(
    XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }),
  );
}

// The topic's name from the master's file name ("पर्यायवाची Master.xlsx").
const baseName = (f: string) => {
  const plain = f.replace(/\.[^.]+$/, "").trim();
  return plain.replace(/[\s_-]*master$/i, "").trim() || plain;
};

export function AppImportDialog({
  types,
  onDone,
  onClose,
}: {
  types: FlashTemplate[];
  onDone: (topicId: string) => void;
  onClose: () => void;
}) {
  const createFn = useServerFn(createFlashTopic);
  const deleteFn = useServerFn(deleteFlashTopic);
  const importFn = useServerFn(importFlashSheet);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [master, setMaster] = useState<{ file: string; sheet: ParsedSheet } | null>(null);
  const [apps, setApps] = useState<{ file: string; sheet: ParsedSheet }[]>([]);
  const [allInApp, setAllInApp] = useState(true);
  const [verified, setVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(
    () =>
      master || apps.length
        ? planAppImport(
            master?.sheet ?? null,
            apps.map((a) => a.sheet),
            apps.map((a) => a.file),
          )
        : null,
    [master, apps],
  );
  const read = async (files: FileList | null, isMaster: boolean) => {
    if (!files?.length) return;
    try {
      const got = await Promise.all(
        [...files].map(async (f) => ({ file: f.name, sheet: await readSheet(f) })),
      );
      if (isMaster) {
        setMaster(got[0]);
        if (!name) setName(baseName(got[0].file));
      } else
        setApps((list) => [...list.filter((a) => !got.some((g) => g.file === a.file)), ...got]);
    } catch (e) {
      toast.error(errorText(e, "Couldn't read the file"));
    }
  };
  const blocked =
    !plan ||
    !plan.cards.length ||
    (!!master && !master.sheet.numbered) ||
    plan.cards.some((c) => c.sheet === null || c.order === null);
  const run = async () => {
    if (!plan || blocked || !name.trim()) return;
    setBusy(true);
    let topicId: string | null = null;
    try {
      const t = await createFn({ data: { name: name.trim(), template_id: type || null } });
      topicId = t.id;
      await importFn({
        data: {
          topic_id: t.id,
          cards: plan.cards,
          columns: plan.columns,
          prompt: plan.prompt,
          book: "",
          name: master?.file ?? "From the app",
          keep_numbers: true,
          from_app: {
            verified,
            downloaded: plan.chunks.filter((c) => allInApp || c.fromApp).map((c) => c.n),
            names: Object.fromEntries(
              plan.chunks.filter((c) => c.file).map((c) => [String(c.n), c.file!]),
            ),
          },
        },
      });
      toast.success(`${plan.cards.length} cards brought in from the app`);
      onDone(t.id);
    } catch (e) {
      // Nothing half-made left behind.
      if (topicId) await deleteFn({ data: { id: topicId } }).catch(() => {});
      toast.error(errorText(e, "Couldn't bring the topic in"));
    } finally {
      setBusy(false);
    }
  };
  const withIds = plan?.cards.filter((c) => c.app_id).length ?? 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-3xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1 border-b border-border px-5 pb-3 pr-12 pt-4 text-left">
          <DialogTitle className="text-base">Bring in a topic already in the app</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Its final master sheet (with sheet and order) and the chunks downloaded from the
            app&apos;s admin panel. Cards are matched by their number; where they differ, the
            app&apos;s version is kept.
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-medium">Master sheet</span>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                aria-label="Master sheet"
                onChange={(e) => void read(e.target.files, true)}
              />
              {master && (
                <span className="block text-xs text-muted-foreground">
                  {master.file}: {master.sheet.cards.length} cards
                  {!master.sheet.numbered && (
                    <span className="text-destructive"> · no sheet / order numbers</span>
                  )}
                </span>
              )}
            </label>
            <label className="space-y-1">
              <span className="font-medium">Chunks from the app</span>
              <Input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                aria-label="Chunks from the app"
                onChange={(e) => {
                  void read(e.target.files, false);
                  e.target.value = "";
                }}
              />
              <span className="block text-xs text-muted-foreground">
                One file per chunk; add as many as you have.
              </span>
            </label>
          </div>
          {apps.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="App files">
              {apps.map((a) => (
                <li
                  key={a.file}
                  className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs"
                >
                  <Download className="h-3 w-3" /> {a.file} · {a.sheet.cards.length}
                  <button
                    type="button"
                    aria-label={`Remove ${a.file}`}
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => setApps(apps.filter((x) => x !== a))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-medium">Topic name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Topic name"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Deck type</span>
              <select
                aria-label="Deck type for the import"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">None (columns from the sheets)</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {plan && (
            <section className="space-y-3" aria-label="What will come in">
              <p className="font-medium">
                {plan.cards.length} cards in {plan.chunks.length} chunk
                {plan.chunks.length === 1 ? "" : "s"}, {withIds} with app ids
              </p>
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Chunk</th>
                    <th className="font-medium">Numbers</th>
                    <th className="font-medium">Cards</th>
                    <th className="font-medium">App ids</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.chunks.map((c) => (
                    <tr key={c.n} data-chunk={c.n} className="border-t border-border">
                      <td className="py-1">{c.n}</td>
                      <td>
                        {c.from}–{c.to}
                      </td>
                      <td>{c.cards}</td>
                      <td>
                        {c.fromApp ? (
                          <Badge tone="good" title={c.file ? `Named “${c.file}”` : undefined}>
                            from {c.file ? `“${c.file}”` : "the app file"}
                          </Badge>
                        ) : (
                          <Badge>no app file: add the ids later</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.problems.map((p) => (
                <p key={p} className="text-destructive">
                  {p}
                </p>
              ))}
              {plan.differ.length > 0 && (
                <details open={plan.differ.length <= 10}>
                  <summary className="cursor-pointer font-medium">
                    {plan.differ.length} difference{plan.differ.length === 1 ? "" : "s"} between the
                    master and the app (the app&apos;s kept)
                  </summary>
                  <ul className="mt-1 space-y-1.5" lang="hi">
                    {plan.differ.map((d, i) => (
                      <li
                        key={i}
                        data-differ={d.order}
                        className="rounded-lg border border-border p-2 text-xs"
                      >
                        <span className="font-medium">
                          #{d.order} {d.field}
                        </span>
                        <div className="mt-0.5 grid gap-1 sm:grid-cols-2">
                          <span className="whitespace-pre-wrap text-muted-foreground line-through">
                            {d.master || "(empty)"}
                          </span>
                          <span className="whitespace-pre-wrap">{d.app || "(empty)"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.mismatched.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400" lang="hi">
                  <b>{plan.mismatched.length} numbers have a different word in the app</b> (the
                  app&apos;s card kept, without its book):{" "}
                  {plan.mismatched
                    .slice(0, 8)
                    .map((m) => `#${m.order} ${m.master} → ${m.app}`)
                    .join(" · ")}
                  {plan.mismatched.length > 8 ? " …" : ""}
                </div>
              )}
              {plan.appOnly.length > 0 && (
                <div className="text-xs" lang="hi">
                  <b>{plan.appOnly.length} only in the app</b> (added):{" "}
                  {plan.appOnly
                    .slice(0, 8)
                    .map((m) => `#${m.order} ${m.front}`)
                    .join(" · ")}
                </div>
              )}
              {plan.notInApp.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400" lang="hi">
                  <b>{plan.notInApp.length} in the master but not in the app&apos;s chunk</b> (left
                  out):{" "}
                  {plan.notInApp
                    .slice(0, 8)
                    .map((m) => `#${m.order} ${m.front}`)
                    .join(" · ")}
                </div>
              )}
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                <span>
                  Mark the cards verified (they are live already). The AI can still check them:
                  Tools → AI check, verified cards too.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={allInApp}
                  onChange={(e) => setAllInApp(e.target.checked)}
                />
                <span>
                  Every chunk is in the app as it is (so only cards changed from now on show as
                  changed since download)
                </span>
              </label>
            </section>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="ml-auto"
            disabled={busy || blocked || !name.trim()}
            onClick={() => void run()}
          >
            {busy ? "Bringing it in…" : `Bring in ${plan?.cards.length ?? 0} cards`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// The topic's chunks against the app's exports of them: every card that
// differs (field by field), to keep the studio's text (uploaded next time)
// or take the app's (edited in the app).
export function CompareWithApp({
  topic,
  cards,
  onChanged,
  onClose,
}: {
  topic: FlashTopic;
  cards: FlashCard[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const takeFn = useServerFn(takeFlashAppText);
  const markFn = useServerFn(markFlashDownloaded);
  const [apps, setApps] = useState<{ file: string; sheet: ParsedSheet }[]>([]);
  const [take, setTake] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const cmp = useMemo(
    () =>
      apps.length
        ? compareWithApp(
            topic,
            cards,
            apps.map((a) => a.sheet),
          )
        : null,
    [topic, cards, apps],
  );
  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const got = await Promise.all(
        [...files].map(async (f) => ({ file: f.name, sheet: await readSheet(f) })),
      );
      setApps((list) => [...list.filter((a) => !got.some((g) => g.file === a.file)), ...got]);
      setTake(new Set());
    } catch (e) {
      toast.error(errorText(e, "Couldn't read the file"));
    }
  };
  // Chunks the same as the app's file in every card, though changed here
  // since their download (changed, then changed back or taken from the app).
  const chunkOf = (order: number | null) =>
    order === null ? null : (topic.chunks.find((c) => order >= c.from && order <= c.to)?.n ?? null);
  const changes = chunkChanges(topic, cards);
  const matching = (cmp?.chunks ?? []).filter((n) => {
    const x = changes.get(n);
    if (!x || x.never || !(x.changed.length + x.removed.length)) return false;
    return (
      !cmp!.differ.some((d) => d.chunk === n) &&
      !cmp!.studioOnly.some((d) => chunkOf(d.order) === n) &&
      !cmp!.appOnly.some((d) => chunkOf(d.order) === n) &&
      !cmp!.removedHere.some((d) => chunkOf(d.order) === n)
    );
  });
  const label = (f: string) => f.replace(/^explanation_/, "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-4xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1 border-b border-border px-5 pb-3 pr-12 pt-4 text-left">
          <DialogTitle className="text-base">Compare with the app</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Add chunks exported from the app&apos;s admin panel. Cards are matched by their app id
            (else their number). Keep the studio&apos;s text to upload it next time, or tick a card
            to take the app&apos;s (edited in the app).
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">Chunks from the app</span>
            <Input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              aria-label="Chunks from the app to compare"
              onChange={(e) => {
                void read(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {apps.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {apps.map((a) => (
                <li
                  key={a.file}
                  className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs"
                >
                  {a.file} · {a.sheet.cards.length}
                  <button
                    type="button"
                    aria-label={`Remove ${a.file}`}
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => setApps(apps.filter((x) => x !== a))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cmp && (
            <>
              <p className="font-medium" aria-label="Comparison">
                Chunk{cmp.chunks.length === 1 ? "" : "s"} {cmp.chunks.join(", ") || "—"}: {cmp.same}{" "}
                the same, {cmp.differ.length} differ
                {cmp.appOnly.length ? `, ${cmp.appOnly.length} only in the app` : ""}
                {cmp.studioOnly.length ? `, ${cmp.studioOnly.length} only here` : ""}
                {cmp.removedHere.length ? `, ${cmp.removedHere.length} removed here` : ""}
              </p>
              {!cmp.differ.length && !cmp.appOnly.length && !cmp.studioOnly.length && (
                <p className="text-emerald-700 dark:text-emerald-400">
                  The app has exactly what the studio has.
                </p>
              )}
              {matching.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 p-2 text-xs">
                  <span>
                    Chunk{matching.length === 1 ? "" : "s"} {matching.join(", ")} show
                    {matching.length === 1 ? "s" : ""} as changed since download, but match the app.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    onClick={async () => {
                      try {
                        await markFn({ data: { topic_id: topic.id, chunks: matching } });
                        onChanged();
                        toast.success("Marked as in the app");
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't mark them"));
                      }
                    }}
                  >
                    Mark as in the app
                  </Button>
                </div>
              )}
              {cmp.differ.length > 0 && (
                <ul className="space-y-2" lang="hi">
                  {cmp.differ.map((d) => (
                    <li
                      key={d.id}
                      data-compare={d.order}
                      className="rounded-lg border border-border p-2"
                    >
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          aria-label={`Take the app's #${d.order}`}
                          checked={take.has(d.id)}
                          onChange={(e) => {
                            const next = new Set(take);
                            if (e.target.checked) next.add(d.id);
                            else next.delete(d.id);
                            setTake(next);
                          }}
                        />
                        <span className="font-medium">
                          #{d.order} {d.front}
                        </span>
                        <span className="text-muted-foreground">
                          {take.has(d.id) ? "the app's will be taken" : "the studio's kept"}
                        </span>
                      </label>
                      {d.fields.map((f) => (
                        <div
                          key={f.field}
                          className="mt-1 grid gap-1 text-xs sm:grid-cols-[7rem_1fr_1fr]"
                        >
                          <span className="text-muted-foreground">{label(f.field)}</span>
                          <span className="whitespace-pre-wrap rounded bg-muted/40 p-1">
                            <span className="block text-[10px] uppercase text-muted-foreground">
                              Studio
                            </span>
                            {f.studio || "(empty)"}
                          </span>
                          <span className="whitespace-pre-wrap rounded bg-amber-50 p-1 dark:bg-amber-950/20">
                            <span className="block text-[10px] uppercase text-muted-foreground">
                              App
                            </span>
                            {f.app || "(empty)"}
                          </span>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              {[
                ["Only in the app (not cards here)", cmp.appOnly],
                ["Only here (not in the app's file)", cmp.studioOnly],
                ["Removed here, still in the app", cmp.removedHere],
              ].map(([title, list]) =>
                (list as { order: number | null; front: string }[]).length ? (
                  <div key={title as string} className="text-xs" lang="hi">
                    <b>{title as string}:</b>{" "}
                    {(list as { order: number | null; front: string }[])
                      .slice(0, 12)
                      .map((x) => `#${x.order ?? "?"} ${x.front}`)
                      .join(" · ")}
                    {(list as unknown[]).length > 12 ? " …" : ""}
                  </div>
                ) : null,
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {cmp && cmp.differ.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setTake(
                  take.size === cmp.differ.length
                    ? new Set()
                    : new Set(cmp.differ.map((d) => d.id)),
                )
              }
            >
              {take.size === cmp.differ.length ? "Untick all" : "Tick all"}
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={busy || !take.size || !cmp}
            onClick={async () => {
              if (!cmp) return;
              setBusy(true);
              try {
                const r = await takeFn({
                  data: {
                    topic_id: topic.id,
                    items: cmp.differ
                      .filter((d) => take.has(d.id))
                      .map((d) => ({ id: d.id, ...d.app })),
                  },
                });
                setTake(new Set());
                onChanged();
                toast.success(
                  `The app's text taken on ${r.changed} card${r.changed === 1 ? "" : "s"} (the old text is in their history)`,
                );
              } catch (e) {
                toast.error(errorText(e, "Couldn't take the app's text"));
              } finally {
                setBusy(false);
              }
            }}
          >
            Take the app&apos;s for {take.size} ticked
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
