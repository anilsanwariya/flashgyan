// History lines (server): made when a report's or an appointment's story is
// written, from its facts and the magazine's earlier stories on the same
// report or post; edited or cleared by the editor.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  HISTORY_CANDIDATES,
  HISTORY_CLOSE,
  HISTORY_YEARS,
  historyKind,
  historyMessages,
  parseHistory,
  type HistoryKind,
  type StoryHistory,
} from "@/lib/ca-history";
import type { CaContent, CaFact } from "@/lib/current-affairs";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const missing = (e: { message: string } | null) => !!e && /history|schema cache/i.test(e.message);
export const HISTORY_NOT_READY =
  "History lines need a database update: run the latest migration (ca_story_history) in Lovable or the SQL editor.";

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

type Row = {
  id: string;
  issue_date: string;
  headline: string;
  facts: CaFact[];
  content: CaContent | null;
  story_type: string | null;
  embedding?: unknown;
  status?: string;
};
const headlineOf = (r: Row) => r.content?.headline.en || r.headline;
const shiftYears = (date: string, years: number) =>
  `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);

// Makes a story's history line (reports and appointments only). Returns it,
// or null when the story isn't one of those.
export async function makeHistory(itemId: string): Promise<StoryHistory | null> {
  const { data, error } = await from("ca_items")
    .select("id,issue_date,headline,facts,content,story_type,embedding")
    .eq("id", itemId)
    .single();
  if (error) {
    if (/story_type/.test(error.message)) return null;
    fail(error);
  }
  const row = data as unknown as Row;
  const kind = historyKind(row.story_type);
  if (!kind || !row.issue_date) return null;
  // Earlier stories of the same type, close in meaning.
  let earlier: Row[] = [];
  if (row.embedding) {
    const { data: near, error: nErr } = await supabaseAdmin.rpc(
      "ca_similar_items" as never,
      {
        p_embedding: row.embedding,
        p_from: shiftYears(row.issue_date, -HISTORY_YEARS),
        p_to: dayBefore(row.issue_date),
        p_exclude: row.id,
        p_count: 10,
      } as never,
    );
    fail(nErr);
    const close = ((near ?? []) as unknown as { id: string; similarity: number }[]).filter(
      (n) => n.similarity >= HISTORY_CLOSE,
    );
    if (close.length) {
      const { data: rows, error: rErr } = await from("ca_items")
        .select("id,issue_date,headline,facts,content,story_type")
        .in(
          "id",
          close.map((c) => c.id),
        );
      fail(rErr);
      earlier = ((rows ?? []) as unknown as Row[])
        .filter((r) => r.story_type === row.story_type)
        .sort((a, b) => a.issue_date.localeCompare(b.issue_date))
        .slice(-HISTORY_CANDIDATES);
    }
  }
  const made = parseHistory(
    await saathiComplete(
      apiKey(),
      historyMessages(
        kind,
        { date: row.issue_date, headline: headlineOf(row), facts: row.facts.map((f) => f.text) },
        earlier.map((e) => ({
          date: e.issue_date,
          headline: headlineOf(e),
          facts: e.facts.map((f) => f.text),
        })),
      ),
    ),
    kind,
    earlier.map((e) => e.id),
  );
  // Nothing earlier to say: kept as made, so it isn't asked again.
  const history: StoryHistory = made ?? { kind, en: "", hi: "", from: [] };
  const { error: uErr } = await from("ca_items")
    .update({ history } as never)
    .eq("id", itemId);
  if (missing(uErr)) return null;
  fail(uErr);
  return history;
}

// After a story is written (a failure never blocks it).
export async function makeHistorySafe(itemId: string): Promise<void> {
  try {
    await makeHistory(itemId);
  } catch (e) {
    console.error("history line:", e);
  }
}

export async function historyOf(itemId: string): Promise<StoryHistory | null> {
  const { data, error } = await from("ca_items").select("history").eq("id", itemId).single();
  if (missing(error)) return null;
  fail(error);
  return ((data as { history?: StoryHistory | null } | null)?.history ?? null) || null;
}

// For the editor: whether the story has a history line at all (reports and
// appointments), and the line.
export async function historyForEditor(
  itemId: string,
): Promise<{ kind: HistoryKind | null; history: StoryHistory | null }> {
  const { data, error } = await from("ca_items")
    .select("story_type,history")
    .eq("id", itemId)
    .single();
  if (error) return { kind: null, history: null };
  const row = data as unknown as { story_type?: string | null; history?: StoryHistory | null };
  return { kind: historyKind(row.story_type), history: row.history ?? null };
}

// The editor's own line (or none).
export async function setHistory(
  itemId: string,
  line: { en: string; hi: string } | null,
): Promise<StoryHistory | null> {
  const had = await historyOf(itemId);
  const { data } = await from("ca_items").select("story_type").eq("id", itemId).single();
  const kind =
    had?.kind ?? historyKind((data as { story_type?: string | null } | null)?.story_type);
  if (!kind) throw new Error("Only reports and appointments have a history line.");
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 400);
  const history: StoryHistory = line
    ? { kind, en: clean(line.en), hi: clean(line.hi), from: had?.from ?? [] }
    : { kind, en: "", hi: "", from: [] };
  const { error } = await from("ca_items")
    .update({ history } as never)
    .eq("id", itemId);
  if (missing(error)) throw new Error(HISTORY_NOT_READY);
  fail(error);
  return history;
}

// Stories' history lines for print (a custom magazine's copy uses its daily
// story's).
export async function historyForItems(
  items: { id: string; origin_id?: string | null }[],
): Promise<Map<string, StoryHistory>> {
  const out = new Map<string, StoryHistory>();
  const ids = [...new Set(items.flatMap((i) => [i.id, i.origin_id].filter(Boolean) as string[]))];
  const found = new Map<string, StoryHistory>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await from("ca_items")
      .select("id,history")
      .in("id", ids.slice(i, i + 150));
    if (error) return out;
    for (const r of (data ?? []) as { id: string; history?: StoryHistory | null }[])
      if (r.history && (r.history.en || r.history.hi)) found.set(r.id, r.history);
  }
  for (const i of items) {
    const got = found.get(i.id) ?? (i.origin_id ? found.get(i.origin_id) : undefined);
    if (got) out.set(i.id, got);
  }
  return out;
}
