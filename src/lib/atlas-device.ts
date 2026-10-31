// The students' atlas on their own device: places and districts saved to
// revise later (in the browser's storage), and the atlas kept for offline
// use (in its database). Both are only this device's: nothing is sent
// anywhere, and the atlas works the same when storage is blocked.
import { useCallback, useEffect, useState } from "react";

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
