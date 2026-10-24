// Exam Radar (server): the editor's choices per month (pinned, hidden, page
// off), the list as the monthly would print it, for the Monthly page.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeRadar, pickRadar, type RadarSettings } from "@/lib/ca-radar";
import { monthRange } from "@/lib/current-affairs";
import { magazineItems } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const radarKey = (month: string) => `ca_radar:${month.slice(0, 7)}`;

export async function getRadarSettings(month: string): Promise<RadarSettings> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", radarKey(month))
    .maybeSingle();
  return normalizeRadar((data as { value: unknown } | null)?.value ?? null);
}

export async function saveRadarSettings(month: string, settings: unknown) {
  const clean = normalizeRadar(settings);
  fail(
    (
      await from("bot_settings").upsert({
        key: radarKey(month),
        value: clean,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
  return clean;
}

// The exams' section shares, once the editor has weighed the exams.
export async function examShares(): Promise<Record<string, number>> {
  const W = await import("@/lib/ca-exam-weights.server");
  const p = await W.savedProfile().catch(() => null);
  return p?.set ? p.shares : {};
}

// What the page would print, with the stories the editor hid.
export async function radarPreview(month: string) {
  const range = monthRange(month);
  const [items, settings, shares] = await Promise.all([
    magazineItems(range.from, range.to),
    getRadarSettings(month),
    examShares(),
  ]);
  const brief = (i: (typeof items)[number]) => ({
    id: i.id,
    date: i.issue_date,
    category: i.category,
    headline: i.content.headline.en || i.content.headline.hi,
  });
  const picked = pickRadar(items, settings, shares).map((r) => ({
    ...brief(r.story),
    score: Math.round(r.score),
    reasons: r.reasons,
    pinned: settings.pinned.includes(r.story.id),
  }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const hidden = settings.hidden
    .map((id) => byId.get(id))
    .filter((i): i is (typeof items)[number] => !!i)
    .map(brief);
  // Others to pin, best first.
  const shown = new Set(picked.map((p) => p.id));
  const others = pickRadar(
    items.filter((i) => !shown.has(i.id) && !settings.hidden.includes(i.id)),
    { pinned: [], hidden: [] },
    shares,
    40,
  ).map((r) => brief(r.story));
  return { settings, picked, hidden, others, stories: items.length };
}
