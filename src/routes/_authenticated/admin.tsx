import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  bulkImportCards,
  checkIsAdmin,
  deleteDeck,
  listDecks,
} from "@/lib/flashcards.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { LogOut, Trash2, Upload, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Flashly" }] }),
  component: Admin,
});

const REQUIRED = ["subject", "topic", "order", "prompt", "back"] as const;

type Section = { title: string; body: string };
type ParsedRow = {
  subject: string;
  topic: string;
  order_index: number;
  prompt: string;
  back: string;
  sections: Section[];
};

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(s: string) {
  return s
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseWorkbook(file: ArrayBuffer): {
  rows: ParsedRow[];
  invalid: number;
  missingCols: string[];
} {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  if (json.length === 0) return { rows: [], invalid: 0, missingCols: [] };

  // Preserve original column order for explanation_* headers.
  const originalKeys = Object.keys(json[0]);
  const headerMap: Record<string, string> = {};
  for (const k of originalKeys) headerMap[normalizeKey(k)] = k;

  const missingCols = REQUIRED.filter((c) => !(c in headerMap));
  if (missingCols.length) return { rows: [], invalid: 0, missingCols };

  const explanationCols: { key: string; title: string }[] = [];
  for (const k of originalKeys) {
    const nk = normalizeKey(k);
    if (nk.startsWith("explanation_")) {
      const suffix = nk.slice("explanation_".length);
      if (suffix) explanationCols.push({ key: k, title: titleCase(suffix) });
    }
  }

  const pick = (row: Record<string, unknown>, name: string) => {
    const k = headerMap[name];
    return k ? String(row[k] ?? "").trim() : "";
  };

  const rows: ParsedRow[] = [];
  let invalid = 0;
  for (const row of json) {
    const subject = pick(row, "subject");
    const topic = pick(row, "topic");
    const orderRaw = pick(row, "order");
    const prompt = pick(row, "prompt");
    const back = pick(row, "back");
    const orderNum = Number(orderRaw);
    if (
      !subject ||
      !topic ||
      !prompt ||
      !back ||
      !orderRaw ||
      !Number.isFinite(orderNum) ||
      !Number.isInteger(orderNum)
    ) {
      invalid++;
      continue;
    }
    const sections: Section[] = [];
    for (const col of explanationCols) {
      const body = String(row[col.key] ?? "").trim();
      if (body) sections.push({ title: col.title, body });
    }
    rows.push({
      subject,
      topic,
      order_index: orderNum,
      prompt,
      back,
      sections,
    });
  }
  return { rows, invalid, missingCols: [] };
}


function Admin() {
  const router = useRouter();
  const qc = useQueryClient();
  const checkIsAdminFn = useServerFn(checkIsAdmin);
  const listDecksFn = useServerFn(listDecks);
  const bulkImportFn = useServerFn(bulkImportCards);
  const deleteDeckFn = useServerFn(deleteDeck);

  const adminQ = useQuery({
    queryKey: ["isAdmin"],
    queryFn: () => checkIsAdminFn(),
  });
  const decksQ = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecksFn(),
    enabled: !!adminQ.data?.isAdmin,
  });

  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [invalid, setInvalid] = useState(0);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [fileName, setFileName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const { rows, invalid, missingCols } = parseWorkbook(buf);
    if (missingCols.length) {
      toast.error("Missing required columns: " + missingCols.join(", "));
      setParsed(null);
      return;
    }
    if (rows.length === 0) {
      toast.error("No valid rows found.");
      setParsed(null);
      return;
    }
    setParsed(rows);
    setInvalid(invalid);
    toast.success(`Parsed ${rows.length} rows${invalid ? ` (${invalid} skipped)` : ""}`);
  }

  async function onImport() {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const res = await bulkImportFn({ data: { rows: parsed, mode } });
      toast.success(`Imported ${res.inserted} cards`);
      setParsed(null);
      setFileName("");
      qc.invalidateQueries({ queryKey: ["decks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteDeck(subject: string, topic: string) {
    if (!confirm(`Delete deck "${subject} · ${topic}"? This removes all its cards.`)) return;
    try {
      await deleteDeckFn({ data: { subject, topic } });
      toast.success("Deck deleted");
      qc.invalidateQueries({ queryKey: ["decks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (adminQ.isLoading) {
    return <div className="min-h-dvh grid place-items-center text-muted-foreground">Loading…</div>;
  }

  if (adminQ.data && !adminQ.data.isAdmin) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <Header onSignOut={onSignOut} />
        <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-10">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Not authorized</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account exists but isn't an admin yet. Ask your project owner to grant
              admin to user id:
            </p>
            <code className="mt-3 block break-all bg-muted rounded-lg p-3 text-xs">
              {adminQ.data.userId}
            </code>
            <p className="mt-3 text-xs text-muted-foreground">
              Run in the database:{" "}
              <code className="bg-muted rounded px-1.5 py-0.5">
                INSERT INTO public.user_roles (user_id, role) VALUES ('{adminQ.data.userId}', 'admin');
              </code>
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Header onSignOut={onSignOut} />
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-6 space-y-8 pb-24">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload Excel
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Columns: Subject, Topic, Card front - prompt, Card front - question, Card back -
            answer, Card back - explanation.
          </p>

          <label className="mt-4 flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-border cursor-pointer hover:bg-accent/40">
            <div className="text-center">
              <div className="text-sm font-medium">
                {fileName || "Tap to choose .xlsx file"}
              </div>
              {parsed && (
                <div className="text-xs text-muted-foreground mt-1">
                  {parsed.length} valid rows{invalid ? ` · ${invalid} skipped` : ""}
                </div>
              )}
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFile}
            />
          </label>

          {parsed && (
            <>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Import mode
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ModeButton active={mode === "append"} onClick={() => setMode("append")}>
                    Append
                  </ModeButton>
                  <ModeButton active={mode === "replace"} onClick={() => setMode("replace")}>
                    Replace all
                  </ModeButton>
                </div>
              </div>

              <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Subject</th>
                      <th className="text-left p-2">Topic</th>
                      <th className="text-left p-2">Order</th>
                      <th className="text-left p-2">Prompt</th>
                      <th className="text-left p-2">Sections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2">{r.subject}</td>
                        <td className="p-2">{r.topic}</td>
                        <td className="p-2 tabular-nums">{r.order_index}</td>
                        <td className="p-2 truncate max-w-[160px]">{r.prompt}</td>
                        <td className="p-2 tabular-nums">{r.sections.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button onClick={onImport} disabled={submitting} className="mt-4 w-full h-11">
                {submitting ? "Importing…" : `Import ${parsed.length} cards`}
              </Button>
            </>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-3">Existing decks</h2>
          {decksQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : decksQ.data && decksQ.data.length > 0 ? (
            <ul className="space-y-2">
              {decksQ.data.map((d) => (
                <li
                  key={`${d.subject}|${d.topic}`}
                  className="flex items-center gap-3 rounded-xl bg-card border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{d.subject}</div>
                    <div className="font-medium truncate">{d.topic}</div>
                    <div className="text-xs text-muted-foreground">{d.count} cards</div>
                  </div>
                  <button
                    onClick={() => onDeleteDeck(d.subject, d.topic)}
                    className="shrink-0 h-9 w-9 grid place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                    aria-label="Delete deck"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No decks yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="font-semibold text-sm">Admin</div>
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </header>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "h-10 rounded-lg border font-medium text-sm " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border")
      }
    >
      {children}
    </button>
  );
}
