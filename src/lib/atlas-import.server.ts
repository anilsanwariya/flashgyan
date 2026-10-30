// Server-only: the editor's master map (the HTML atlas they build from their
// notes) read into the atlas's rows. The map keeps its data as two
// JavaScript objects, D (places, layers, districts) and INFO (the notes'
// facts and what each is about); both are read as JSON.
import { createHash } from "node:crypto";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import {
  AGRO_ZONES,
  ATLAS_CAT_KEYS,
  districtName,
  inRings,
  type AtlasFeature,
  type AtlasLayer,
  type DistrictMeta,
  type LonLat,
} from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";

type Obj = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const ll = (v: unknown): LonLat | null => {
  const a = arr(v);
  const lon = Number(a[0]);
  const lat = Number(a[1]);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
};
const line = (v: unknown): LonLat[] =>
  arr(v)
    .map(ll)
    .filter((p): p is LonLat => !!p);
const en = (t: string): Bi => ({ en: t, hi: "" });

// The object assigned to `const NAME =` in the page's scripts.
function readObject(html: string, name: string): Obj | null {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*\\{`).exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  // Its end: the brace that closes it (strings skipped).
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1)) as Obj;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);

// The district a point is in (the map's real outlines).
export function districtAt(lon: number, lat: number): string {
  return RAJ_DISTRICTS.find((d) => inRings(d.rings, lon, lat))?.en ?? "";
}

export type ImportPlace = {
  key: string;
  name_en: string;
  label_en: string;
  cat: string;
  lat: number;
  lon: number;
  district: string;
  tehsil: string;
  refs: [string, string][];
};
export type ImportFact = {
  key: string;
  subject: string;
  chapter_key: string;
  chapter: string;
  heading: string;
  text_en: string;
  table_head: string;
  flags: number;
  entities: string[];
  position: number;
  status: "verified" | "to_check";
};
export type ImportLayer = Omit<AtlasLayer, "status"> & { name_hi: string };
export type ImportDistrict = { district: string; meta: DistrictMeta };
export type MasterMap = {
  places: ImportPlace[];
  facts: ImportFact[];
  layers: ImportLayer[];
  districts: ImportDistrict[];
  chapters: { key: string; subject: string; title: string; facts: number }[];
};

const LAYER_HI: Record<string, string> = {
  divisions: "संभाग",
  agro: "कृषि जलवायु क्षेत्र",
  physio: "भौतिक उप-प्रदेश (21)",
  physio4: "भौतिक प्रदेश (4)",
  "physio-map": "भौतिक विभाग (नोट्स मानचित्र 3.1)",
  koppen: "कोपेन जलवायु प्रदेश",
  thorn: "थॉर्नथ्वेट जलवायु प्रदेश",
  soil: "मृदा — राज्य वर्गीकरण",
  usda: "मृदा — USDA वर्गीकरण",
  forest: "वनों के प्रकार",
  basins: "पेट्रोलियम बेसिन",
  rain: "समवर्षा रेखाएँ",
  aravalli: "अरावली पर्वतमाला व महान सीमा भ्रंश",
  winds: "मानसूनी पवनें",
  ercp: "PKC-ERCP नदी जोड़ परियोजना",
  "tehsil-hq": "तहसील मुख्यालय",
};
const DIVISION_COLORS = [
  "#e9c46a",
  "#a3c4f3",
  "#f4a3a8",
  "#b5e48c",
  "#cdb4db",
  "#ffd6a5",
  "#9bf6ff",
];

export function parseMasterMap(html: string): MasterMap {
  const D = readObject(html, "D");
  const INFO = readObject(html, "INFO");
  if (!D || !INFO)
    throw new Error("This doesn't look like the master map: its data (D and INFO) wasn't found.");

  // ---- Tehsils (the notes' schematic outlines) ----
  type Teh = { n: string; d: string; v: string; s: string; rings: LonLat[][]; c: LonLat | null };
  const tehsils: Teh[] = arr(D.tehsils).map((t) => {
    const o = t as Obj;
    return {
      n: str(o.n),
      d: districtName(str(o.d)),
      v: str(o.v),
      s: str(o.s),
      rings: arr(o.p)
        .map(line)
        .filter((r) => r.length > 2),
      c: ll(o.c),
    };
  });
  const tehsilAt = (lon: number, lat: number) =>
    tehsils.find((t) => inRings(t.rings, lon, lat))?.n ?? "";

  // ---- Places ----
  const usedKeys = new Map<string, number>();
  const rawPlaces = arr(D.places);
  const placeKeys: string[] = [];
  const places: ImportPlace[] = [];
  for (const p of rawPlaces) {
    const o = p as Obj;
    const at = ll(o.ll);
    const name = str(o.n);
    const label = str(o.f) || name;
    let cat = str(o.c);
    if (!ATLAS_CAT_KEYS.includes(cat)) cat = "town";
    let key = `${cat}:${slug(label)}`;
    const n = usedKeys.get(key) ?? 0;
    usedKeys.set(key, n + 1);
    if (n) key += `-${n + 1}`;
    placeKeys.push(key);
    if (!at || !name) continue;
    places.push({
      key,
      name_en: name.replace(/\s+\d{3,4}$/, ""),
      label_en: label,
      cat,
      lon: at[0],
      lat: at[1],
      district: districtAt(at[0], at[1]),
      tehsil: tehsilAt(at[0], at[1]),
      refs: arr(o.s)
        .map((r) => arr(r).map(str) as [string, string])
        .filter((r) => r[0])
        .slice(0, 10),
    });
  }

  // ---- Facts ----
  const chs = arr(INFO.chs).map((c) => arr(c).map(str));
  const heads = arr(INFO.heads).map(str);
  const units = arr(INFO.u);
  const entityOf = (k: string): string | null => {
    const [t, rest] = [k.slice(0, 1), k.slice(2)];
    if (t === "D") return `D:${districtName(rest)}`;
    if (t === "T" || t === "U") {
      const [d, x] = rest.split("|");
      return `${t}:${districtName(d)}|${x}`;
    }
    if (t === "P") {
      const i = Number(rest);
      return placeKeys[i] ? `P:${placeKeys[i]}` : null;
    }
    if (t === "S" || t === "V") return k;
    return null;
  };
  const entities = new Map<number, Set<string>>();
  for (const [k, ids] of Object.entries((INFO.e ?? {}) as Record<string, unknown>)) {
    const e = entityOf(k);
    if (!e) continue;
    for (const i of arr(ids)) {
      const n = Number(i);
      if (!entities.has(n)) entities.set(n, new Set());
      entities.get(n)!.add(e);
    }
  }
  const factKeys = new Map<string, number>();
  const facts: ImportFact[] = [];
  units.forEach((u, i) => {
    const a = arr(u);
    const ch = chs[Number(a[0])] ?? ["geo", "", ""];
    const heading = heads[Number(a[1])] ?? "";
    const text = str(a[3]);
    if (!text) return;
    // Chapter numbers restart in each subject (geography ch1, polity ch1).
    const chapterKey = `${ch[0] || "geo"}-${ch[1]}`;
    let key = hash(`${chapterKey}|${heading}|${text}`);
    const n = factKeys.get(key) ?? 0;
    factKeys.set(key, n + 1);
    if (n) key = hash(`${key}|${n}`);
    facts.push({
      key,
      subject: ch[0] || "geo",
      chapter_key: chapterKey,
      chapter: ch[2],
      heading,
      text_en: text,
      table_head: str(a[4]),
      flags: Number(a[2]) || 0,
      entities: [...(entities.get(i) ?? [])].sort(),
      position: i,
      status: /\[verify/i.test(text) ? "to_check" : "verified",
    });
  });
  const chapters = chs.map(([subject, key, title]) => ({
    key: `${subject || "geo"}-${key}`,
    subject,
    title,
    facts: facts.filter((f) => f.chapter_key === `${subject || "geo"}-${key}`).length,
  }));

  // ---- Districts ----
  const divisionOf = new Map<string, string>();
  for (const t of tehsils) if (t.d && t.v && !divisionOf.has(t.d)) divisionOf.set(t.d, t.v);
  const districts: ImportDistrict[] = arr(D.districts).map((x) => {
    const o = x as Obj;
    const name = districtName(str(o.n));
    return {
      district: name,
      meta: {
        division: divisionOf.get(name) || str(o.v) || undefined,
        zone: str(o.az) || undefined,
        neighbours: arr(o.nb).map((n) => districtName(str(n))),
        hq: ll(o.hq) ?? undefined,
        tehsils: Number(o.nt) || undefined,
      },
    };
  });

  // ---- Layers ----
  const layers: ImportLayer[] = [];
  const layer = (
    key: string,
    name: string,
    grp: string,
    items: AtlasFeature[],
    note = "",
    approx = true,
  ) => {
    if (items.length)
      layers.push({
        key,
        name_en: name,
        name_hi: LAYER_HI[key] ?? "",
        grp,
        note,
        approx,
        items,
        position: layers.length,
      });
  };
  const divisions = [...new Set(districts.map((d) => d.meta.division).filter(Boolean))] as string[];
  layer(
    "divisions",
    "Divisions",
    "admin",
    districts
      .filter((d) => d.meta.division)
      .map((d) => ({
        kind: "district" as const,
        district: d.district,
        name: en(`${d.meta.division} division`),
        color: DIVISION_COLORS[divisions.indexOf(d.meta.division!) % DIVISION_COLORS.length],
      })),
    "District outlines from the State Remote Sensing Application Centre",
    false,
  );
  layer(
    "agro",
    "Agro-climatic zones",
    "economy",
    districts
      .filter((d) => d.meta.zone)
      .map((d) => {
        const z = AGRO_ZONES.find((x) => x.key === d.meta.zone);
        return {
          kind: "district" as const,
          district: d.district,
          name: z?.name ?? en(d.meta.zone!),
          color: z?.color ?? "#94a3b8",
        };
      }),
    "By district (the zones follow district lines)",
    false,
  );
  // Physiographic sub-divisions: the notes' tehsils grouped.
  const phys = (D.physio ?? {}) as Obj;
  const subs = arr(phys.subs).map((x) => x as Obj);
  const divs = arr(phys.divs).map((x) => x as Obj);
  layer(
    "physio",
    "Physiographic sub-divisions (21)",
    "physical",
    subs
      .map((sb) => ({
        kind: "area" as const,
        name: en(str(sb.n)),
        color: str(sb.col) || "#ccc",
        rings: tehsils.filter((t) => t.s === str(sb.id)).flatMap((t) => t.rings),
        at: ll(sb.c) ?? undefined,
      }))
      .filter((f) => f.rings.length),
    "Schematic, from the notes (tehsil-level)",
  );
  layer(
    "physio4",
    "Physiographic divisions (4)",
    "physical",
    divs
      .map((dv) => {
        const ids = subs.filter((sb) => str(sb.dv) === str(dv.id)).map((sb) => str(sb.id));
        return {
          kind: "area" as const,
          name: en(str(dv.n)),
          color: str(dv.col) || "#ccc",
          rings: tehsils.filter((t) => ids.includes(t.s)).flatMap((t) => t.rings),
          at: ll(dv.c) ?? undefined,
        };
      })
      .filter((f) => f.rings.length),
    "Schematic, from the notes (tehsil-level)",
  );
  const AREA_GROUP: Record<string, string> = {
    physio: "physical",
    koppen: "climate",
    thorn: "climate",
    soil: "soil",
    usda: "soil",
    forest: "soil",
    basins: "economy",
  };
  for (const [k, v] of Object.entries((D.areas ?? {}) as Record<string, Obj>)) {
    const items = arr(v.polys).map((x) => {
      const o = x as Obj;
      const ring = line(o.p);
      const at: LonLat | undefined = ring.length
        ? [
            ring.reduce((a, p) => a + p[0], 0) / ring.length,
            ring.reduce((a, p) => a + p[1], 0) / ring.length,
          ]
        : undefined;
      return {
        kind: "area" as const,
        name: en(str(o.l)),
        color: str(o.f) || "#ccc",
        rings: [ring],
        at,
      };
    });
    const key = k === "physio" ? "physio-map" : k;
    layer(
      key,
      str(v.name) || k,
      AREA_GROUP[k] ?? "physical",
      items.filter((f) => f.rings[0].length > 2),
      "Schematic, from the notes",
    );
  }
  layer(
    "rain",
    "Isohyets (annual rainfall)",
    "climate",
    arr(D.iso).map((x) => {
      const o = x as Obj;
      return {
        kind: "line" as const,
        name: en(str(o.v)),
        color: "#1d6fb8",
        line: line(o.pts),
        at: ll(o.lp) ?? undefined,
        dash: "4 3",
        width: 1.4,
      };
    }),
    "Schematic, from the notes",
  );
  layer(
    "aravalli",
    "Aravalli range & Great Boundary Fault",
    "physical",
    [
      ...arr(D.aravalli).map((x) => ({
        kind: "line" as const,
        name: { en: "Aravalli range", hi: "अरावली पर्वतमाला" },
        color: "#8a5a2b",
        line: line((x as Obj).p),
        width: 5,
      })),
      ...(arr(D.gbf).length
        ? [
            {
              kind: "line" as const,
              name: { en: "Great Boundary Fault", hi: "महान सीमा भ्रंश" },
              color: "#c0392b",
              line: line(D.gbf),
              dash: "7 4",
              width: 2,
            },
          ]
        : []),
    ],
    "Schematic, from the notes",
  );
  layer(
    "winds",
    "Monsoon winds",
    "climate",
    arr(D.winds).map((x) => {
      const o = x as Obj;
      const p = line(o.p);
      return {
        kind: "line" as const,
        name: en(str(o.l)),
        color: str(o.col) || "#2f7fbf",
        line: p,
        dash: str(o.dash) || undefined,
        width: 2,
        arrow: true,
        at: p[Math.floor(p.length / 2)],
      };
    }),
    "Schematic, from the notes",
  );
  layer(
    "ercp",
    "PKC-ERCP river link",
    "water",
    arr(D.ercp).map((x) => ({
      kind: "line" as const,
      name: { en: "PKC-ERCP link", hi: "PKC-ERCP लिंक" },
      color: "#0e7490",
      line: line((x as Obj).p),
      width: 2.2,
    })),
    "Schematic, from the notes",
  );
  layer(
    "tehsil-hq",
    "Tehsil headquarters",
    "admin",
    arr(D.hq)
      .map((x) => {
        const o = x as Obj;
        return {
          kind: "label" as const,
          name: en(str(o.n)),
          color: str(o.t) === "u" ? "#64748b" : "#1f2430",
          at: ll(o.ll) ?? undefined,
          district: districtName(str(o.d)),
        };
      })
      .filter((f) => f.at),
    "Tehsil and sub-tehsil headquarters",
    false,
  );

  return { places, facts, layers, districts, chapters };
}
