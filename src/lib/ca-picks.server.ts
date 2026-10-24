// Learning from the editor's picks (server): the last weeks' stories whose
// AI decision the editor changed, picking rules suggested from them (one AI
// call, on request or with the Sunday report), and the rules the editor
// keeps, which go into how stories are picked.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  PICK_MIN_CHANGES,
  cleanPickRules,
  parsePickRules,
  pickChanges,
  pickMessages,
  type PickChange,
  type PickCounts,
} from "@/lib/ca-picks";
import type { StyleSuggestion } from "@/lib/ca-style";
import { istDate } from "@/lib/current-affairs";
import { getMagazineSettings, saveMagazineSettings } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

export const PICKS_NOT_READY =
  "Learning from your picks needs a database update: run the latest migration (ca_ai_pick) in Lovable or the SQL editor.";
const SUGGEST_KEY = "ca_pick_suggestions";
export const PICK_DAYS = 30;

export type PickSuggestions = {
  at: string;
  changes: number;
  rules: StyleSuggestion[];
};

// The stories of the last days (before today, whose picks are settled) with
// the AI's first decision. ready: false before the migration.
export async function recentChanges(
  days = PICK_DAYS,
): Promise<{ ready: boolean; changes: PickChange[]; counts: PickCounts }> {
  const today = istDate();
  const since = istDate(new Date(Date.now() - days * 86_400_000));
  const rows = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("ca_items")
      .select("issue_date,headline,story_type,category,importance,status,rajasthan,facts,ai_pick")
      .gte("issue_date", since)
      .lt("issue_date", today)
      .not("ai_pick", "is", null)
      .order("issue_date")
      .order("id")
      .range(at, at + 999);
    if (error && /ai_pick|story_type/.test(error.message)) {
      return {
        ready: false,
        changes: [],
        counts: { stories: 0, dropped: 0, kept: 0, importance: 0, section: 0 },
      };
    }
    fail(error);
    rows.push(...((data ?? []) as unknown as Parameters<typeof pickChanges>[0]));
    if ((data ?? []).length < 1000) break;
  }
  return { ready: true, ...pickChanges(rows) };
}

export async function pickSuggestions(): Promise<PickSuggestions | null> {
  const { data } = await from("bot_settings").select("value").eq("key", SUGGEST_KEY).maybeSingle();
  return (data as { value: PickSuggestions } | null)?.value ?? null;
}

// Rules suggested from the changes; they wait for the editor.
export async function suggestPickRules(): Promise<PickSuggestions> {
  const { ready, changes } = await recentChanges();
  if (!ready) throw new Error(PICKS_NOT_READY);
  if (changes.length < PICK_MIN_CHANGES) {
    throw new Error(
      `Not enough changed picks in the last ${PICK_DAYS} days to see a pattern yet (${changes.length}; at least ${PICK_MIN_CHANGES} needed).`,
    );
  }
  const rules = (await getMagazineSettings()).pick_rules ?? [];
  const suggested = parsePickRules(
    await saathiComplete(apiKey(), pickMessages(changes, rules)),
    rules,
  );
  if (!suggested) throw new Error("The AI's reply could not be read. Try again.");
  const value: PickSuggestions = {
    at: new Date().toISOString(),
    changes: changes.length,
    rules: suggested,
  };
  fail(
    (
      await from("bot_settings").upsert({
        key: SUGGEST_KEY,
        value,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
  return value;
}

export async function savePickRules(rules: string[]): Promise<string[]> {
  return (await saveMagazineSettings({ pick_rules: cleanPickRules(rules) })).pick_rules ?? [];
}

// Everything the settings card shows.
export async function picksOverview() {
  const [settings, suggestions, recent] = await Promise.all([
    getMagazineSettings(),
    pickSuggestions(),
    recentChanges(),
  ]);
  return {
    ready: recent.ready,
    rules: settings.pick_rules ?? [],
    suggestions,
    counts: recent.counts,
    // The latest few, to show what the suggestions learn from.
    latest: recent.changes.slice(-6).reverse(),
  };
}
