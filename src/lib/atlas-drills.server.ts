// Server-only: the map drills' data (rivers' districts checked by the
// editor, the border lists), districts then and now (the editor's tehsil
// table, which SAATHI can read from pasted text), and the daily challenge's
// question posted to the Telegram channel as a quiz poll. Kept in
// bot_settings ("atlas_drills").
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import { RAJ_RIVERS } from "@/lib/geo-data";
import {
  DEFAULT_BORDERS,
  dailyRound,
  indiaDay,
  parseTehsils,
  riverDraft,
  type Borders,
  type RiverPath,
  type TehsilRow,
} from "@/lib/atlas-drills";
import { atlasBase, atlasPublicPlaces } from "@/lib/atlas.server";
import { NO_DISTRICT_QUESTION } from "@/lib/atlas-practice";
import { getMagazineSettings } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
type Row = Record<string, unknown>;
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const KEY = "atlas_drills";
export type Poll = { on: boolean; hour: number; lastDay: string; error: string | null };
type State = { rivers: RiverPath[]; borders: Borders; tehsils: TehsilRow[]; poll: Poll };

async function state(): Promise<State> {
  const { data } = await from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  const v = ((data as Row | null)?.value ?? {}) as Partial<State>;
  return {
    rivers: v.rivers ?? [],
    borders: { ...DEFAULT_BORDERS, ...(v.borders ?? {}) },
    tehsils: v.tehsils ?? [],
    poll: { on: false, hour: 8, lastDay: "", error: null, ...(v.poll ?? {}) },
  };
}
async function save(s: State) {
  fail(
    (
      await from("bot_settings").upsert({
        key: KEY,
        value: s,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}

function inRing(r: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const districtAt = (x: number, y: number) =>
  RAJ_DISTRICTS.find((d) => d.rings.some((r) => inRing(r as [number, number][], x, y)))?.en ?? null;
const riverKey = (en: string) => en.toLowerCase().replace(/[^a-z]+/g, "-");
const D41 = () => RAJ_DISTRICTS.map((d) => d.en);

// ---------- Admin ----------

// The drills' data for the editor: every main river and tributary with its
// saved districts, or a draft from the river map.
export async function drillsAdmin() {
  const s = await state();
  const saved = new Map(s.rivers.map((r) => [r.key, r]));
  const rivers = RAJ_RIVERS.filter((r) => (r.tier ?? 3) <= 2)
    .map((r) => {
      const key = riverKey(r.en);
      return (
        saved.get(key) ?? {
          key,
          name: { en: r.en, hi: r.hi },
          districts: riverDraft(r.lines as [number, number][][], districtAt),
          checked: false,
        }
      );
    })
    .filter((r) => r.districts.length >= 2 || saved.has(r.key));
  return { rivers, borders: s.borders, tehsils: s.tehsils, poll: s.poll, districts: D41() };
}

export async function saveRiver(r: RiverPath) {
  const s = await state();
  const known = new Set(D41());
  r = { ...r, districts: r.districts.filter((d) => known.has(d)) };
  s.rivers = [...s.rivers.filter((x) => x.key !== r.key), r];
  await save(s);
}

export async function saveBorders(b: Borders) {
  const s = await state();
  const known = new Set(D41());
  s.borders = Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, [...new Set(v)].filter((d) => known.has(d))]),
  );
  await save(s);
}

// Tehsil rows from a pasted table, added to (or replacing) the table.
export async function saveTehsils(text: string, replace: boolean) {
  const { rows, problems } = parseTehsils(text, D41());
  if (!rows.length) return { saved: 0, problems };
  const s = await state();
  const name = (r: TehsilRow) => r.tehsil.en.toLowerCase();
  const fresh = new Set(rows.map(name));
  s.tehsils = [...(replace ? [] : s.tehsils.filter((r) => !fresh.has(name(r)))), ...rows].sort(
    (a, b) => a.tehsil.en.localeCompare(b.tehsil.en),
  );
  await save(s);
  return { saved: rows.length, problems };
}

export async function deleteTehsil(en: string) {
  const s = await state();
  s.tehsils = s.tehsils.filter((r) => r.tehsil.en !== en);
  await save(s);
}

// Kept the same on every call (the text goes in the user message).
const READ_SYSTEM = `You read text about Rajasthan's districts (a gazette notification, a news report or study notes) and list each tehsil it names with its district in three maps: the 33-district map (2008 to Aug 2023), the 50-district map (7 Aug 2023 to Dec 2024) and today's 41-district map. Use only what the text says or what follows from it plainly (a tehsil of a district that was not split stayed in that district); leave a tehsil out if its district in any map is not clear from the text.
Reply with one line per tehsil, nothing else: Tehsil name / हिंदी नाम | 33-map district | 50-map district | today's district`;

// SAATHI's reading of pasted text, for the editor to check before saving.
export async function readTehsils(text: string) {
  const raw = await saathiComplete(apiKey(), [
    { role: "system", content: READ_SYSTEM },
    { role: "user", content: text.slice(0, 30_000) },
  ]);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.split("|").length >= 4);
  const { rows, problems } = parseTehsils(lines.join("\n"), D41());
  return { text: lines.join("\n"), rows: rows.length, problems };
}

export async function savePoll(p: { on: boolean; hour: number }) {
  const s = await state();
  s.poll = { ...s.poll, ...p };
  await save(s);
}

// ---------- Public ----------

export async function publicDrills() {
  const s = await state();
  return {
    rivers: s.rivers.filter((r) => r.checked && r.districts.length >= 3),
    borders: s.borders,
  };
}
export async function publicTehsils(): Promise<TehsilRow[]> {
  return (await state()).tehsils;
}

// ---------- The daily question on Telegram ----------

// Once a day after the set hour (India time): the day's first "which
// district?" question of the daily challenge, as a quiz poll on the
// channel, with a link to the rest.
export async function dailyPollStep(
  origin?: string,
  now = new Date(),
): Promise<{ did: string | null }> {
  const s = await state();
  const day = indiaDay(now);
  const hour = new Date(now.getTime() + 5.5 * 3600_000).getUTCHours();
  if (!s.poll.on || s.poll.lastDay === day || hour < s.poll.hour) return { did: null };
  // Marked first, so overlapping ticks never post twice.
  await save({ ...s, poll: { ...s.poll, lastDay: day, error: null } });
  try {
    const [base, places, settings] = await Promise.all([
      atlasBase(),
      atlasPublicPlaces(),
      getMagazineSettings(),
    ]);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !settings.channel) throw new Error("No Telegram channel in Magazine settings.");
    const qs = dailyRound(
      day,
      base.districts,
      places
        .filter((p) => !NO_DISTRICT_QUESTION.has(p[3]) && p[6])
        .map((p) => ({
          key: p[0],
          en: p[1],
          hi: p[2],
          cat: p[3],
          lat: p[4],
          lon: p[5],
          district: p[6],
        })),
    );
    const q = qs.find((x) => x.mode === "where") ?? qs.find((x) => x.mode === "name");
    if (!q) throw new Error("No question today.");
    const hi = (en: string) => base.districts.find((d) => d.en === en)?.hi || en;
    const right = q.district;
    const meta = base.districts.find((d) => d.en === right)?.meta;
    const near = (meta?.neighbours ?? []).filter((d) => d !== right).slice(0, 3);
    const options = [right, ...near].sort((a, b) => a.localeCompare(b));
    const question =
      q.mode === "where"
        ? `🗺️ ${q.place.hi || q.place.en} (${q.place.en}) किस जिले में है? / Which district is it in?`
        : `🗺️ राजस्थान का कौन-सा जिला? / Which district? (${hi(right)})`;
    const site = (origin || "https://www.flashgyan.com").replace(/\/$/, "");
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPoll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.channel,
        question: question.slice(0, 300),
        options: options.map((o) => ({ text: `${hi(o)} / ${o}`.slice(0, 100) })),
        type: "quiz",
        correct_option_id: options.indexOf(right),
        is_anonymous: true,
        explanation:
          `आज की 5 प्रश्नों की चुनौती / Today's 5-question challenge: ${site}/atlas/daily`.slice(
            0,
            200,
          ),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!json.ok) throw new Error(json.description ?? `Telegram error ${res.status}`);
    return { did: "daily-poll" };
  } catch (e) {
    const t = await state();
    await save({ ...t, poll: { ...t.poll, error: e instanceof Error ? e.message : String(e) } });
    return { did: null };
  }
}
