// A topic already in the app, brought into the studio: its final master
// sheet and the chunks downloaded from the app's admin panel, matched card
// by card (the app's version kept where they differ), then added as a topic
// numbered into its chunks, with the app's ids, its cards verified.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, X } from "lucide-react";
import { createFlashTopic, deleteFlashTopic, importFlashSheet } from "@/lib/flash-studio.functions";
import { parseSheet, type FlashTemplate, type ParsedSheet } from "@/lib/flash-studio";
import { planAppImport } from "@/lib/flash-app-import";
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
                          <Badge tone="good">from the app file</Badge>
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
