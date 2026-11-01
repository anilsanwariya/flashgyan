// Export sets on the exam papers page: each set (a saved question bank
// filter) downloads as a Hindi and an English sheet in the app's layout, takes
// the app's ids back, says when to upload it again, and lists the app ids to
// remove.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, PackageCheck, Trash2, Upload } from "lucide-react";
import {
  clearExportRemoved,
  createExportSet,
  deleteExportSet,
  downloadExportSet,
  importExportIds,
  listExportSets,
  updateExportSet,
} from "@/lib/exam-papers.functions";
import {
  EXPORT_LANGS,
  LANG_NAME,
  needsUpload,
  readUploaded,
  type ExportLang,
  type SetStatus,
} from "@/lib/exam-export";
import { DIMENSIONS, type BankFilter } from "@/lib/exam-bank";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { useBank } from "@/components/exam-bank";
import { Input } from "@/components/ui/input";

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

type SetView = Awaited<ReturnType<typeof listExportSets>>["sets"][number];

function useSets() {
  const fn = useServerFn(listExportSets);
  return useQuery({ queryKey: ["examExportSets"], queryFn: () => fn(), refetchOnMount: true });
}

// In the question bank: the filter saved as a set.
export function SaveAsSet({
  filter,
  label,
  onSaved,
}: {
  filter: BankFilter;
  label: (d: (typeof DIMENSIONS)[number]["key"], v: string) => string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createExportSet);
  const [busy, setBusy] = useState(false);
  const any = DIMENSIONS.some((d) => filter[d.key]) || !!filter.search;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy || !any}
      title={any ? undefined : "Filter first (an exam, subject, topic…)"}
      onClick={async () => {
        const suggested = DIMENSIONS.filter((d) => filter[d.key])
          .map((d) => label(d.key, filter[d.key]!))
          .join(" · ");
        const name = window.prompt("Name of the export set", suggested || "Questions");
        if (!name) return;
        setBusy(true);
        try {
          await fn({ data: { name, filter } });
          await qc.invalidateQueries({ queryKey: ["examExportSets"] });
          toast.success("Export set saved");
          onSaved();
        } catch (e) {
          toast.error(errorText(e, "Couldn't save it"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <PackageCheck className="mr-1 h-4 w-4" /> Save as export set
    </Button>
  );
}

export function ExportSets() {
  const q = useSets();
  // Papers and sections by name (the set keeps their ids and keys).
  const bank = useBank().data;
  const names = (key: string, value: string) =>
    key === "paper"
      ? (bank?.papers.find((p) => p.id === value)?.exam ?? value)
      : key === "section"
        ? (bank?.sectionNames[value] ?? value)
        : value;
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (!q.data?.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        Export sets need a database update: run the latest migration (exam_export_sets) in Lovable
        or the SQL editor.
      </p>
    );
  const sets = q.data.sets;
  return (
    <div className="space-y-4" data-export-sets>
      <p className="text-sm text-muted-foreground">
        A set is a question bank filter (an exam, subject, topic…) saved for the app: its finished
        questions, one sheet per language. Upload a sheet to the app, then upload the app's sheet
        back here so its ids are kept. The set then says when to upload again (new or changed
        questions; new ones come at the end with an empty id) and which app ids to remove.
      </p>
      {!sets.length && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No sets yet: filter the question bank, then “Save as export set”.
        </p>
      )}
      {sets.map((s) => (
        <SetCard key={s.id} s={s} names={names} />
      ))}
    </div>
  );
}

function SetCard({ s, names }: { s: SetView; names: (key: string, value: string) => string }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateExportSet);
  const deleteFn = useServerFn(deleteExportSet);
  const [titles, setTitles] = useState(s.titles);
  const refresh = () => qc.invalidateQueries({ queryKey: ["examExportSets"] });
  const changedTitles = titles.hi !== s.titles.hi || titles.en !== s.titles.en;
  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      data-export-set={s.name}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{s.name}</h3>
        {DIMENSIONS.filter((d) => s.filter[d.key]).map((d) => (
          <Badge key={d.key} tone="muted">
            {d.label}: {names(d.key, s.filter[d.key]!)}
          </Badge>
        ))}
        {s.filter.search && <Badge tone="muted">“{s.filter.search}”</Badge>}
        <span className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const name = window.prompt("Rename the set", s.name);
              if (!name) return;
              await updateFn({ data: { id: s.id, name } })
                .then(refresh)
                .catch((e) => toast.error(errorText(e, "Couldn't rename it")));
            }}
          >
            Rename
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Delete set ${s.name}`}
            onClick={async () => {
              if (!confirm(`Delete the set “${s.name}”? Its app ids are forgotten.`)) return;
              await deleteFn({ data: { id: s.id } })
                .then(refresh)
                .catch((e) => toast.error(errorText(e, "Couldn't delete it")));
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Explanation column titles:</span>
        {EXPORT_LANGS.map((l) => (
          <label key={l} className="flex items-center gap-1">
            {LANG_NAME[l]} explanation_
            <Input
              aria-label={`${LANG_NAME[l]} explanation title`}
              value={titles[l]}
              lang={l}
              onChange={(e) => setTitles({ ...titles, [l]: e.target.value })}
              className="h-7 w-32 text-xs"
            />
          </label>
        ))}
        {changedTitles && (
          <Button
            size="sm"
            className="h-7"
            onClick={() =>
              void updateFn({ data: { id: s.id, titles } })
                .then(async () => {
                  toast.success("Titles saved");
                  await refresh();
                })
                .catch((e) => toast.error(errorText(e, "Couldn't save")))
            }
          >
            Save titles
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {EXPORT_LANGS.map((l) => (
          <LangBox key={l} s={s} lang={l} st={s.status[l]} onChanged={refresh} />
        ))}
      </div>
    </section>
  );
}

function LangBox({
  s,
  lang,
  st,
  onChanged,
}: {
  s: SetView;
  lang: ExportLang;
  st: SetStatus;
  onChanged: () => Promise<unknown>;
}) {
  const downloadFn = useServerFn(downloadExportSet);
  const importFn = useServerFn(importExportIds);
  const clearFn = useServerFn(clearExportRemoved);
  const [busy, setBusy] = useState(false);
  const remove = s.remove[lang];
  const up = needsUpload(st);
  async function download() {
    setBusy(true);
    try {
      const r = await downloadFn({ data: { id: s.id, lang } });
      const { saveWorkbook } = await import("@/lib/exam-pdf");
      await saveWorkbook(r.fileName, [{ name: "questions", rows: r.rows }]);
      toast.success(
        `${r.rows.length} questions downloaded${r.fresh ? ` (${r.fresh} new, empty id)` : ""}${r.noExplanation ? ` · ${r.noExplanation} without an explanation` : ""}`,
      );
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't download it"));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const { workbookSheets } = await import("@/lib/exam-pdf");
      const sheets = await workbookSheets(file);
      const rows = readUploaded(sheets[0]?.rows ?? []);
      const r = await importFn({ data: { id: s.id, lang, rows } });
      toast[r.unmatched ? "warning" : "success"](
        `${r.matched} app ids saved${r.unmatched ? ` · ${r.unmatched} rows not matched (changed text?)` : ""}${r.without ? ` · ${r.without} questions still without an id` : ""}`,
      );
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't read the sheet"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm" data-lang-box={lang}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{LANG_NAME[lang]}</span>
        <span className="text-xs text-muted-foreground">
          {st.questions} question{st.questions === 1 ? "" : "s"}
        </span>
        {!st.downloaded ? (
          <Badge tone="warn">Not downloaded yet</Badge>
        ) : up ? (
          <Badge tone="warn">
            Upload again:{" "}
            {[st.fresh && `${st.fresh} new`, st.changed && `${st.changed} changed`]
              .filter(Boolean)
              .join(", ")}
          </Badge>
        ) : (
          <Badge tone="good">Up to date</Badge>
        )}
        {st.noIds > 0 && <Badge tone="muted">{st.noIds} without an app id</Badge>}
        {st.noExplanation > 0 && (
          <Badge tone="muted">{st.noExplanation} without an explanation</Badge>
        )}
      </div>
      {st.downloaded && (
        <p className="text-xs text-muted-foreground">Last downloaded {formatWhen(st.downloaded)}</p>
      )}
      {st.skipped > 0 && (
        <p className="text-xs text-muted-foreground">
          {st.skipped} finished question{st.skipped === 1 ? " isn't" : "s aren't"} in{" "}
          {LANG_NAME[lang]} (a language question of the other language, or no {LANG_NAME[lang]}{" "}
          text).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !st.questions} onClick={() => void download()}>
          <Download className="mr-1 h-4 w-4" /> Download {LANG_NAME[lang]}
        </Button>
        <label
          className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-input px-3 text-sm ${busy || !st.downloaded ? "pointer-events-none opacity-50" : ""}`}
        >
          <Upload className="mr-1 h-4 w-4" /> Upload the app's sheet
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label={`Upload the app's ${LANG_NAME[lang]} sheet`}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
      </div>
      {remove.length > 0 && (
        <div
          className="space-y-1 rounded-lg border border-red-400/50 bg-red-500/5 p-2"
          data-remove-list
        >
          <p className="text-xs font-medium text-red-800 dark:text-red-300">
            Remove from the app ({remove.length}): these left the set (topic changed, or deleted)
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">
            {remove.map((r) => (
              <li key={r.app_id} className="flex gap-2">
                <code className="shrink-0 font-mono">{r.app_id}</code>
                <span className="truncate text-muted-foreground">{r.label}</span>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={async () => {
              if (!confirm(`Removed these ${remove.length} from the app?`)) return;
              await clearFn({ data: { id: s.id, lang } })
                .then(onChanged)
                .catch((e) => toast.error(errorText(e, "Couldn't save")));
            }}
          >
            Removed from the app
          </Button>
        </div>
      )}
    </div>
  );
}
