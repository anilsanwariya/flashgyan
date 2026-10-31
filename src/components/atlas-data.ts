// The students' atlas data, read through the device's offline copy: each
// read is kept when it succeeds and given back when the network is gone,
// and "Save for offline" keeps everything at once (every verified fact and
// every published district page), so place cards and district pages open
// offline too.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  atlasBaseFn,
  atlasCardsFn,
  atlasDistrictFn,
  atlasEntityFactsFn,
  atlasOfflinePackFn,
  atlasPlaceFn,
  atlasPlacesFn,
  type PublicPlace,
} from "@/lib/atlas.functions";
import { idbGet, idbSet, OFFLINE_PACK, withOffline } from "@/lib/atlas-device";
import { ATLAS_THEMES } from "@/lib/atlas";

type Pack = Awaited<ReturnType<typeof atlasOfflinePackFn>>;
const pack = () => idbGet<Pack>(OFFLINE_PACK);

export function useAtlasBase() {
  const fn = useServerFn(atlasBaseFn);
  return useQuery({
    queryKey: ["atlasBase"],
    queryFn: () => withOffline("base", () => fn()),
    staleTime: Infinity,
  });
}

// The atlas's revision cards (their schedule is on the device).
export function useAtlasCards() {
  const fn = useServerFn(atlasCardsFn);
  return useQuery({
    queryKey: ["atlasCards"],
    queryFn: () => withOffline("cards", () => fn()),
    staleTime: 10 * 60_000,
  });
}

export function useAtlasPlaces() {
  const fn = useServerFn(atlasPlacesFn);
  return useQuery({
    queryKey: ["atlasPlaces"],
    queryFn: () => withOffline("places", () => fn()),
    staleTime: Infinity,
  });
}

type PlaceCard = Awaited<ReturnType<typeof atlasPlaceFn>>;
// A place's card offline: its facts from the saved pack.
async function placeFromPack(key: string): Promise<PlaceCard | undefined> {
  const [p, places] = await Promise.all([pack(), idbGet<PublicPlace[]>("places")]);
  const row = places?.find((x) => x[0] === key);
  if (!p || !row) return undefined;
  return {
    place: {
      key,
      name: { en: row[1], hi: row[2] },
      cat: row[3],
      lat: row[4],
      lon: row[5],
      district: row[6],
      tehsil: "",
      note: { en: "", hi: "" },
      chapters: [],
      era_from: row[8] ?? null,
      era_to: row[9] ?? null,
      months: row[10] ?? [],
    },
    facts: p.facts.filter((f) => f.entities.includes(`P:${key}`)),
    mentions: [],
    news: [],
  };
}

export function useAtlasPlace(key: string | null, enabled = true) {
  const fn = useServerFn(atlasPlaceFn);
  return useQuery({
    queryKey: ["atlasPlace", key],
    queryFn: () =>
      withOffline(
        `place:${key}`,
        () => fn({ data: { key: key! } }),
        () => placeFromPack(key!),
      ),
    enabled: !!key && enabled,
  });
}

export function useAtlasEntityFacts(entity: string | null) {
  const fn = useServerFn(atlasEntityFactsFn);
  return useQuery({
    queryKey: ["atlasEntity", entity],
    queryFn: () =>
      withOffline(
        `entity:${entity}`,
        () => fn({ data: { entity: entity! } }),
        async () => (await pack())?.facts.filter((f) => f.entities.includes(entity!)),
      ),
    enabled: !!entity,
  });
}

export function useAtlasDistrict(district: string) {
  const fn = useServerFn(atlasDistrictFn);
  return useQuery({
    queryKey: ["atlasDistrict", district],
    queryFn: () =>
      withOffline(
        `district:${district}`,
        () => fn({ data: { district } }),
        async () => (await pack())?.districts.find((d) => d.district === district),
      ),
  });
}

// Keeps the whole atlas on this device.
export function useSaveOffline() {
  const baseFn = useServerFn(atlasBaseFn);
  const placesFn = useServerFn(atlasPlacesFn);
  const packFn = useServerFn(atlasOfflinePackFn);
  return async () => {
    const [base, places, p] = await Promise.all([baseFn(), placesFn(), packFn()]);
    await idbSet("base", base);
    await idbSet("places", places);
    await idbSet(OFFLINE_PACK, p);
    for (const d of p.districts) await idbSet(`district:${d.district}`, d);
    const info = { at: p.at, facts: p.facts.length, districts: p.districts.length };
    await idbSet("pack-info", info);
    // The pages themselves, for the service worker to keep.
    if ("caches" in window)
      await Promise.all(
        [
          "/atlas",
          "/atlas/quiz",
          "/atlas/cards",
          "/atlas/drills",
          "/atlas/then-now",
          "/atlas/saved",
          "/atlas/compare",
          ...p.districts.map((d) => `/atlas/${encodeURIComponent(d.district)}`),
          ...ATLAS_THEMES.map((t) => `/atlas/theme/${t.key}`),
        ].map((u) => fetch(u, { credentials: "same-origin" }).catch(() => null)),
      );
    return info;
  };
}
