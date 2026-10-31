// Server-only: keeping the atlas right. The notes' source codes named by the
// editor (shown under every fact), students' "Report a mistake" (rate
// limited, for the editor to fix or dismiss), and atlas places whose
// position disagrees with the surveyed place list or their district.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { matchPlace, placeKey } from "@/lib/geo-places";
import {
  SOURCE_CODES,
  mentionKey,
  splitSources,
  headingSources,
  type SourceNames,
} from "@/lib/atlas";
import { districtAt } from "@/lib/atlas-import.server";
import {
  SOURCES_KEY,
  invalidateAtlas,
  resetSourceCodes,
  savePlace,
  sourceCodes,
} from "@/lib/atlas.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const missing = (e: { message: string } | null) =>
  !!e && /atlas_reports|schema cache|does not exist/i.test(e.message);
export const REPORTS_NOT_READY = "Reports need the migration 20261217090000_atlas_reports.sql.";

async function setting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as Row | null)?.value as T) ?? dflt;
}
async function saveSetting(key: string, value: unknown) {
  fail((await from("bot_settings").upsert({ key, value, updated_at: now() } as never)).error);
}

// ---------- Sources ----------

// Every code the notes use (and the editor's), how many facts cite it, and
// its name.
export async function sourcesOverview() {
  const { list, names } = await sourceCodes();
  const all: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("atlas_facts")
      .select("heading,text_en")
      .neq("status", "hidden")
      .range(at, at + 999);
    fail(error);
    all.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  const count = new Map<string, number>();
  for (const f of all) {
    const s = new Set([
      ...splitSources(String(f.text_en), list).sources,
      ...headingSources(String(f.heading), list).sources,
    ]);
    for (const c of s) count.set(c, (count.get(c) ?? 0) + 1);
  }
  return {
    sources: list.map((code) => ({
      code,
      facts: count.get(code) ?? 0,
      name: names[code]?.name ?? { en: "", hi: "" },
      url: names[code]?.url ?? "",
      builtIn: SOURCE_CODES.includes(code),
    })),
    unsourced:
      all.length -
      [...all].filter(
        (f) =>
          splitSources(String(f.text_en), list).sources.length ||
          headingSources(String(f.heading), list).sources.length,
      ).length,
    facts: all.length,
  };
}

export async function saveSourceNames(names: SourceNames) {
  const clean: SourceNames = {};
  for (const [code, v] of Object.entries(names)) {
    const c = code.trim();
    if (!/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(c)) continue;
    clean[c] = {
      name: { en: v.name.en.trim().slice(0, 120), hi: v.name.hi.trim().slice(0, 120) },
      ...(v.url?.trim() ? { url: v.url.trim().slice(0, 300) } : {}),
    };
  }
  await saveSetting(SOURCES_KEY, clean);
  resetSourceCodes();
  invalidateAtlas();
}

// ---------- Report a mistake ----------

export type ReportInput = {
  kind: "fact" | "place" | "district";
  ref: string;
  label: string;
  message: string;
  correction: string;
  page: string;
};

// A student's report (signed-in or not), after the rate limits.
export async function reportMistake(
  r: ReportInput,
  who: { ip: string | null; userId: string | null },
): Promise<{ ok: true } | { ok: false; reason: "limit" | "not-ready" }> {
  for (const [key, win, max] of [
    who.ip ? [`atlas-report:ip:${who.ip}:h`, 3600, 8] : null,
    ["atlas-report:global:d", 86400, 800],
  ].filter(Boolean) as [string, number, number][]) {
    const { data, error } = await supabaseAdmin.rpc(
      "saathi_consume_rate_limit" as never,
      { rl_key: key, window_seconds: win, max_hits: max } as never,
    );
    if (!error && data === false) return { ok: false, reason: "limit" };
  }
  // The same report again is one report.
  const { data: same, error: e1 } = await from("atlas_reports")
    .select("id")
    .eq("ref", r.ref)
    .eq("message", r.message)
    .eq("status", "open")
    .limit(1);
  if (missing(e1)) return { ok: false, reason: "not-ready" };
  fail(e1);
  if ((same ?? []).length) return { ok: true };
  fail(
    (
      await from("atlas_reports").insert({
        ...r,
        user_id: who.userId,
      } as never)
    ).error,
  );
  return { ok: true };
}

export type AtlasReport = ReportInput & {
  id: string;
  status: "open" | "fixed" | "dismissed";
  note: string;
  created_at: string;
  // The fact or place as it is now (to fix it here).
  now?: {
    text_en?: string;
    text_hi?: string;
    chapter_key?: string;
    name?: string;
    status?: string;
  };
};

export async function listReports(status: AtlasReport["status"]) {
  const { data, error } = await from("atlas_reports")
    .select("id,kind,ref,label,message,correction,page,status,note,created_at")
    .eq("status", status)
    .order("created_at", { ascending: status === "open" })
    .limit(200);
  if (missing(error)) return { ready: false, reports: [] as AtlasReport[] } as const;
  fail(error);
  const rows = (data ?? []) as unknown as AtlasReport[];
  const factIds = rows.filter((r) => r.kind === "fact").map((r) => r.ref);
  const placeKeys = rows.filter((r) => r.kind === "place").map((r) => r.ref);
  const facts = new Map<string, Row>();
  if (factIds.length) {
    const { data: fs } = await from("atlas_facts")
      .select("id,text_en,text_hi,status,chapter_key")
      .in(
        "id",
        factIds.filter((x) => /^[0-9a-f-]{36}$/.test(x)),
      );
    for (const f of (fs ?? []) as Row[]) facts.set(String(f.id), f);
  }
  const places = new Map<string, Row>();
  if (placeKeys.length) {
    const { data: ps } = await from("atlas_places")
      .select("key,label_en,name_en,status")
      .in("key", placeKeys);
    for (const p of (ps ?? []) as Row[]) places.set(String(p.key), p);
  }
  const { count } = await from("atlas_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  return {
    ready: true,
    open: count ?? 0,
    reports: rows.map((r) => {
      const f = facts.get(r.ref);
      const p = places.get(r.ref);
      return {
        ...r,
        ...(f
          ? {
              now: {
                text_en: String(f.text_en),
                text_hi: String(f.text_hi),
                chapter_key: String(f.chapter_key),
                status: String(f.status),
              },
            }
          : p
            ? { now: { name: String(p.label_en || p.name_en), status: String(p.status) } }
            : {}),
      };
    }),
  } as const;
}

export async function setReportStatus(ids: string[], status: AtlasReport["status"], note = "") {
  fail(
    (
      await from("atlas_reports")
        .update({ status, ...(note ? { note } : {}), updated_at: now() } as never)
        .in("id", ids)
    ).error,
  );
}

// ---------- Positions ----------

const FAR_KM = 5;
const NEAR_KM = 60;
const POS_KEY = "atlas_positions_ok";
type Kept = Record<string, string>;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));
const at = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

export type PositionCheck = {
  key: string;
  name: string;
  cat: string;
  district: string;
  lat: number;
  lon: number;
  problems: ("far" | "district" | "outside")[];
  // The surveyed place list's place of that name, and how far it is.
  list?: { name: string; lat: number; lon: number; km: number; district: string };
  // The district its position is in.
  inDistrict: string;
};

// Places whose position disagrees: the place list has a place of exactly
// the same name 5–60 km away, the position is in another district than the
// one given, or outside Rajasthan. Places the editor kept (at the same
// position) are left out.
export async function positionChecks(): Promise<{
  checks: PositionCheck[];
  checked: number;
  kept: number;
}> {
  const kept = await setting<Kept>(POS_KEY, {});
  const rows: Row[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await from("atlas_places")
      .select("key,name_en,label_en,cat,district,lat,lon")
      .neq("status", "hidden")
      .order("key")
      .range(a, a + 999);
    fail(error);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  const out: PositionCheck[] = [];
  for (const r of rows) {
    const p = { lat: Number(r.lat), lon: Number(r.lon) };
    const key = String(r.key);
    if (kept[key] === at(p.lat, p.lon)) continue;
    const problems: PositionCheck["problems"] = [];
    const inDistrict = districtAt(p.lon, p.lat);
    if (!inDistrict) problems.push("outside");
    else if (r.district && r.district !== inDistrict) problems.push("district");
    // The plain name ("Kumbhalgarh fort (UNESCO)" → "Kumbhalgarh fort").
    const name = String(r.name_en || r.label_en)
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let list: PositionCheck["list"];
    if (mentionKey(name).length >= 4) {
      // The same name exactly (not a look-alike), near enough to be the
      // same place: farther off, a village of that name is another place.
      const m = await matchPlace({ en: name }, p, NEAR_KM).catch(() => null);
      if (m && placeKey(m.place.en) === placeKey(name)) {
        const d = km(p, m.place);
        if (d > FAR_KM) {
          problems.push("far");
          list = {
            name: m.place.en,
            lat: m.place.lat,
            lon: m.place.lon,
            km: Math.round(d),
            district: districtAt(m.place.lon, m.place.lat),
          };
        }
      }
    }
    if (problems.length)
      out.push({
        key,
        name: String(r.label_en || r.name_en),
        cat: String(r.cat),
        district: String(r.district),
        lat: p.lat,
        lon: p.lon,
        problems,
        ...(list ? { list } : {}),
        inDistrict,
      });
  }
  out.sort((a, b) => (b.list?.km ?? 0) - (a.list?.km ?? 0));
  return { checks: out, checked: rows.length, kept: Object.keys(kept).length };
}

// The editor's decision: the list's position (the district follows), the
// district its position is in, or the place kept as it is.
export async function decidePosition(
  key: string,
  d: { use: "list"; lat: number; lon: number } | { use: "district" } | { use: "keep" },
) {
  const { data, error } = await from("atlas_places").select("id,lat,lon").eq("key", key).single();
  fail(error);
  const p = data as unknown as { id: string; lat: number; lon: number };
  if (d.use === "list") await savePlace({ id: p.id, lat: d.lat, lon: d.lon, district: "" });
  else if (d.use === "district") await savePlace({ id: p.id, district: districtAt(p.lon, p.lat) });
  else {
    const kept = await setting<Kept>(POS_KEY, {});
    kept[key] = at(p.lat, p.lon);
    await saveSetting(POS_KEY, kept);
  }
}
