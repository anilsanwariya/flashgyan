// The students' atlas on their own device: places and districts saved to
// revise later (in the browser's storage), and the atlas kept for offline
// use (in its database). Both are only this device's: nothing is sent
// anywhere, and the atlas works the same when storage is blocked.
import { useCallback, useEffect, useState } from "react";
import type { Schedule } from "@/lib/atlas-cards";

// ---------- Saved to revise later ----------

export type SavedPlace = {
  key: string;
  name: string;
  name_hi: string;
  cat: string;
  district: string;
};
export type Saved = { places: SavedPlace[]; districts: string[] };
const SAVED_KEY = "atlas-saved";
const EMPTY: Saved = { places: [], districts: [] };

function readSaved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as Saved | null;
    return v && Array.isArray(v.places) && Array.isArray(v.districts) ? v : EMPTY;
  } catch {
    return EMPTY;
  }
}
const CHANGED = "atlas-saved-changed";

export function useAtlasSaved() {
  const [saved, setSaved] = useState<Saved>(EMPTY);
  useEffect(() => {
    const load = () => setSaved(readSaved());
    load();
    // Other tabs, and other parts of this page.
    window.addEventListener("storage", load);
    window.addEventListener(CHANGED, load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener(CHANGED, load);
    };
  }, []);
  const write = useCallback((next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGED));
    } catch {
      // Storage blocked: kept for this visit only.
    }
  }, []);
  const s = saved;
  return {
    saved: s,
    hasPlace: (key: string) => s.places.some((p) => p.key === key),
    hasDistrict: (d: string) => s.districts.includes(d),
    togglePlace: (p: SavedPlace) =>
      write({
        ...s,
        places: s.places.some((x) => x.key === p.key)
          ? s.places.filter((x) => x.key !== p.key)
          : [p, ...s.places],
      }),
    toggleDistrict: (d: string) =>
      write({
        ...s,
        districts: s.districts.includes(d)
          ? s.districts.filter((x) => x !== d)
          : [d, ...s.districts],
      }),
    clear: () => write(EMPTY),
  };
}

// ---------- Quiz results by district ----------

// Each district's last answers in the map quiz ("1" right, "0" wrong,
// newest last), for the student's weak districts.
const STATS_KEY = "atlas-district-stats";
const STATS_CHANGED = "atlas-stats-changed";
export const STATS_KEEP = 10;
export type DistrictStats = Record<string, string>;

function readStats(): DistrictStats {
  try {
    const v = JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}") as DistrictStats;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function recordQuizAnswers(list: { district: string; right: boolean }[]) {
  const s = readStats();
  for (const a of list)
    s[a.district] = ((s[a.district] ?? "") + (a.right ? "1" : "0")).slice(-STATS_KEEP);
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(STATS_CHANGED));
  } catch {
    // Storage blocked: not kept.
  }
}

// A district's share of right answers (of its last ones).
export const districtScore = (s: string) => ({
  tries: s.length,
  pct: s.length ? Math.round(((s.match(/1/g) ?? []).length / s.length) * 100) : 0,
});
export const WEAK_PCT = 70;

// The student's results, and their weak districts (tried twice or more,
// under 70% right), weakest first.
export function useDistrictStats() {
  const [stats, setStats] = useState<DistrictStats>({});
  useEffect(() => {
    const load = () => setStats(readStats());
    load();
    window.addEventListener("storage", load);
    window.addEventListener(STATS_CHANGED, load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener(STATS_CHANGED, load);
    };
  }, []);
  const weak = Object.entries(stats)
    .map(([d, s]) => ({ district: d, ...districtScore(s) }))
    .filter((x) => x.tries >= 2 && x.pct < WEAK_PCT)
    .sort((a, b) => a.pct - b.pct || b.tries - a.tries)
    .map((x) => x.district);
  return {
    stats,
    weak,
    clear: () => {
      try {
        localStorage.removeItem(STATS_KEY);
        window.dispatchEvent(new Event(STATS_CHANGED));
      } catch {
        // nothing kept
      }
    },
  };
}

// ---------- Flashcard schedule ----------

const CARDS_KEY = "atlas-cards";
const EMPTY_SCHEDULE: Schedule = { cards: {}, day: "", fresh: 0 };
export function readSchedule(): Schedule {
  try {
    const v = JSON.parse(localStorage.getItem(CARDS_KEY) ?? "null") as Schedule | null;
    return v && typeof v.cards === "object" ? v : EMPTY_SCHEDULE;
  } catch {
    return EMPTY_SCHEDULE;
  }
}
export function writeSchedule(s: Schedule) {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: kept for this visit only.
  }
}

// ---------- Offline ----------

const DB = "fg-atlas";
const STORE = "kv";
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise((ok, no) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => ok(r.result as T | undefined);
      r.onerror = () => no(r.error);
    });
  } catch {
    return undefined;
  }
}
export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((ok, no) => {
      const t = d.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(value, key);
      t.oncomplete = () => ok();
      t.onerror = () => no(t.error);
    });
  } catch {
    // Not kept: the atlas still works online.
  }
}

// A read that keeps its answer on the device and gives the kept answer when
// the network is gone. `fallback`: another way to answer offline.
export async function withOffline<T>(
  key: string,
  fetcher: () => Promise<T>,
  fallback?: () => Promise<T | undefined>,
): Promise<T> {
  try {
    const v = await fetcher();
    void idbSet(key, v);
    return v;
  } catch (e) {
    const kept = (await idbGet<T>(key)) ?? (fallback ? await fallback() : undefined);
    if (kept !== undefined) return kept;
    throw e;
  }
}

export const OFFLINE_PACK = "pack";
export type OfflineInfo = { at: string; facts: number; districts: number } | null;
export const offlineInfo = async (): Promise<OfflineInfo> =>
  (await idbGet<OfflineInfo>("pack-info")) ?? null;
