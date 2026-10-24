// Medal tally of a sports event (server): made from the event's stories,
// kept per event, edited by the editor, printed under the event in the
// monthly.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import { medalsMessages, normalizeMedals, parseMedals, type MedalTally } from "@/lib/ca-medals";
import type { CaContent, CaFact } from "@/lib/current-affairs";
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

const medalsKey = (eventId: string) => `ca_medals:${eventId}`;

export async function getMedals(eventId: string): Promise<MedalTally | null> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", medalsKey(eventId))
    .maybeSingle();
  return normalizeMedals((data as { value: unknown } | null)?.value ?? null);
}

// Several events' tallies at once (for printing).
export async function medalsFor(eventIds: string[]): Promise<Record<string, MedalTally>> {
  if (!eventIds.length) return {};
  const { data, error } = await from("bot_settings")
    .select("key,value")
    .in("key", eventIds.map(medalsKey));
  if (error) return {};
  const out: Record<string, MedalTally> = {};
  for (const r of (data ?? []) as { key: string; value: unknown }[]) {
    const t = normalizeMedals(r.value);
    if (t) out[r.key.slice("ca_medals:".length)] = t;
  }
  return out;
}

export async function saveMedals(eventId: string, tally: unknown | null) {
  if (tally === null) {
    fail((await from("bot_settings").delete().eq("key", medalsKey(eventId))).error);
    return null;
  }
  const clean = normalizeMedals(tally);
  if (!clean) throw new Error("That tally couldn't be read.");
  fail(
    (
      await from("bot_settings").upsert({
        key: medalsKey(eventId),
        value: clean,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
  return clean;
}

// Made (again) from the event's stories: the included ones, or all when
// none is.
export async function makeMedals(eventId: string): Promise<MedalTally> {
  const { data: ev, error } = await from("ca_events")
    .select("id,name,kind,place")
    .eq("id", eventId)
    .single();
  fail(error);
  const e = ev as unknown as { id: string; name: string; kind: string; place: string };
  if (e.kind !== "sports") throw new Error("A medal tally is only for a sports event.");
  const { data } = await from("ca_items")
    .select("issue_date,headline,facts,status,content")
    .eq("event_id", eventId)
    .order("issue_date");
  const all = (data ?? []) as {
    issue_date: string;
    headline: string;
    facts: CaFact[];
    status: string;
    content: CaContent | null;
  }[];
  const used = all.some((s) => s.status === "included")
    ? all.filter((s) => s.status === "included")
    : all;
  if (!used.length) throw new Error("This event has no stories yet.");
  const { glossary } = await getMagazineSettings();
  const tally = parseMedals(
    await saathiComplete(
      apiKey(),
      medalsMessages({
        event: e,
        stories: used.slice(-40).map((s) => ({
          date: s.issue_date,
          headline: s.content?.headline.en || s.headline,
          // The written points (as printed), then the facts.
          facts: [
            ...(s.content?.points ?? []).map((p) => p.en).filter(Boolean),
            ...s.facts.map((f) => f.text),
          ],
        })),
        glossary,
      }),
    ),
    new Date().toISOString(),
  );
  if (!tally) throw new Error("The AI's tally couldn't be read: try again.");
  return (await saveMedals(eventId, tally))!;
}

// With the event's summary (and never in its way).
export async function makeMedalsSafe(eventId: string) {
  try {
    await makeMedals(eventId);
  } catch (e) {
    console.error("medal tally:", e);
  }
}
