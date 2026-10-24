// The monthly's topic index (server): made from the month's stories a batch
// at a time, kept per month, edited by the editor, printed at the back of
// the monthly issue.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  INDEX_BATCH,
  indexMessages,
  mergeIndex,
  normalizeIndex,
  parseIndex,
  type TopicIndex,
} from "@/lib/ca-index";
import { monthStories } from "@/lib/ca-practice.server";
import { getMagazineSettings } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

const indexKey = (month: string) => `ca_index:${month.slice(0, 7)}`;

export async function getIndex(month: string): Promise<TopicIndex | null> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", indexKey(month))
    .maybeSingle();
  return normalizeIndex((data as { value: unknown } | null)?.value ?? null);
}

export async function saveIndex(month: string, index: unknown | null) {
  if (index === null) {
    fail((await from("bot_settings").delete().eq("key", indexKey(month))).error);
    return null;
  }
  const clean = normalizeIndex(index);
  if (!clean) throw new Error("That index couldn't be read.");
  fail(
    (
      await from("bot_settings").upsert({
        key: indexKey(month),
        value: clean,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
  return clean;
}

// The next batch of the month's stories read for index terms; from 0 starts
// the index again (terms of stories read earlier in this run are kept).
export async function indexStep(
  month: string,
  offset: number,
): Promise<{ index: TopicIndex; next: number | null; total: number }> {
  const all = (await monthStories(month)).sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  if (!all.length) throw new Error("There are no stories this month yet.");
  const batch = all.slice(offset, offset + INDEX_BATCH);
  const { glossary } = await getMagazineSettings();
  const found = batch.length
    ? parseIndex(await saathiComplete(apiKey(), indexMessages(batch, glossary)), batch)
    : [];
  const had = offset === 0 ? [] : ((await getIndex(month))?.entries ?? []);
  // A story read again takes its new terms only.
  const again = new Set(batch.map((s) => s.id));
  const kept = had
    .map((e) => ({ ...e, items: e.items.filter((i) => !again.has(i)) }))
    .filter((e) => e.items.length);
  const index = (await saveIndex(month, {
    made_at: new Date().toISOString(),
    entries: mergeIndex([...kept, ...found]),
  }))!;
  const next = offset + INDEX_BATCH;
  return { index, next: next < all.length ? next : null, total: all.length };
}
