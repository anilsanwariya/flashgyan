// Server-only: a subject's notes (docs/atlas-extraction-project.md: two
// markdown files, English and Hindi, the same lines in the same order, "#
// <Subject>" first) read into the atlas. Each chapter's points, tables and
// revision questions become facts with both languages, and each
// "#### Place: name | district | kind" block a place on the map. The notes
// give no positions: a place is pinned at its village or town from the
// surveyed place list (marked approximate, listed in the position checks),
// or, when the list doesn't have it, at its district's headquarters and kept
// "to check" (not shown to students) until placed. Points the notes flag
// "[verify: …]" / "[सत्यापन: …]" come in "to check" with the flag as the
// note. Importing a subject again replaces only that subject's facts.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import {
  APPROX_NOTE,
  DISTRICT_ALIASES,
  atlasCat,
  type AtlasFact,
  type AtlasPlace,
  type AtlasStatus,
} from "@/lib/atlas";
import { slug, districtAt } from "@/lib/atlas-import.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);
type Row = Record<string, unknown>;

// Facts and places from a subject's notes: source "notes-<subject>".
export const NOTES_SOURCE = "notes-";
const sourceOf = (subject: string) => `${NOTES_SOURCE}${subject}`;

// "# Rajasthan Art & Culture" → the atlas's subject.
export function subjectOf(title: string): string {
  const t = title.toLowerCase();
  if (/\bart\b|culture/.test(t)) return "art";
  if (/histor/.test(t)) return "his";
  if (/geograph/.test(t)) return "geo";
  if (/polity|administration/.test(t)) return "pol";
  if (/econom/.test(t)) return "eco";
  return "";
}
const TABLE_FLAG = 256;
const MNEMONIC_FLAG = 4;
const REVISION_FLAG = 128;

// The notes' place kinds (the extraction project's list) → the atlas's
// categories.
const CATS: Record<string, string> = {
  fort: "fort",
  palace: "fort",
  haveli: "heritage",
  temple: "temple",
  mosque: "temple",
  dargah: "temple",
  church: "temple",
  gurudwara: "temple",
  stepwell: "harvest",
  lake: "lake",
  wetland: "lake",
  river: "rsrc",
  dam: "dam",
  canal: "canal",
  sanctuary: "sanct",
  "national park": "tiger",
  "conservation reserve": "cr",
  hill: "peak",
  peak: "peak",
  pass: "pass",
  mine: "metal",
  fair: "fair",
  festival: "fair",
  museum: "heritage",
  institute: "heritage",
  memorial: "heritage",
  city: "town",
  village: "town",
  battlefield: "battle",
  "archaeological site": "archaeo",
  other: "town",
};

export type NotesFact = {
  key: string;
  subject: string;
  chapter_key: string;
  chapter: string;
  heading: string;
  text_en: string;
  text_hi: string;
  table_head: string;
  flags: number;
  entities: string[];
  position: number;
  status: "verified" | "to_check";
  note: string;
};
export type NotesPlace = {
  key: string;
  name_en: string;
  name_hi: string;
  district: string;
  type: string;
  cat: string;
  aliases: string[];
  where: string;
};
export type SubjectNotes = {
  subject: string;
  title: string;
  // Each heading, label and table header in English → its Hindi (from the
  // Hindi file, line for line), for showing the facts' headings in Hindi.
  headingsHi: Record<string, string>;
  chapters: { key: string; title: string; title_hi: string; facts: number }[];
  facts: NotesFact[];
  places: NotesPlace[];
};

const DISTRICTS = RAJ_DISTRICTS.map((d) => d.en);
const districtOf = (s: string): string => {
  const t = s.trim();
  const d = DISTRICTS.find((x) => x.toLowerCase() === t.toLowerCase());
  if (d) return d;
  const a = Object.entries(DISTRICT_ALIASES).find(([k]) => k.toLowerCase() === t.toLowerCase());
  return a ? a[1] : "";
};
// The doubt the notes flag, without its brackets.
const VERIFY = /\[(?:verify|सत्यापन)\s*:?\s*([^\]]*)\]/gi;
const flagged = (t: string) => [...t.matchAll(VERIFY)].map((m) => m[1].trim()).filter(Boolean);
const placeKey = (name: string, district: string) =>
  `notes:${slug(name)}${district ? `|${slug(district)}` : ""}`;
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
// Line shapes the two files must share: heading level, indent, table width.
const shape = (l: string) => {
  if (!l.trim()) return "";
  if (l.startsWith("|")) return `|${l.split("|").length}`;
  const m = /^(\s*)(#+ |- )?/.exec(l)!;
  return `${m[1]}${m[2] ?? "p"}`;
};

// The two files read together, line by line.
export function parseSubjectNotes(en: string, hi: string): SubjectNotes {
  const E = en.replace(/\r/g, "").split("\n");
  const H = hi.replace(/\r/g, "").split("\n");
  if (E.length !== H.length)
    throw new Error(
      `The English and Hindi files don't match: ${E.length} lines and ${H.length} lines.`,
    );
  for (let i = 0; i < E.length; i++)
    if (shape(E[i]) !== shape(H[i]))
      throw new Error(
        `The English and Hindi files differ at line ${i + 1}: "${E[i].slice(0, 60)}" / "${H[i].slice(0, 60)}".`,
      );

  const facts: NotesFact[] = [];
  const chapters: SubjectNotes["chapters"] = [];
  const places = new Map<string, NotesPlace>();
  const keys = new Map<string, number>();
  let chapter: SubjectNotes["chapters"][number] | null = null;
  // Headings below the chapter (### and down), and the open place block.
  const heads: string[] = [];
  let place: NotesPlace | null = null;
  let label = ""; // a "- About:" style label the next indented points sit under
  let table: { head: string; headHi: string } | null = null;
  let revision = false;
  const headingsHi: Record<string, string> = {};
  const pair = (en: string, hi: string) => {
    const e = en.trim();
    const h = hi.trim();
    if (e && h && h !== e && !headingsHi[e]) headingsHi[e] = h;
  };
  const title = (E.find((l) => /^#\s/.test(l)) ?? "").replace(/^#\s+/, "").trim();
  const subject = subjectOf(title);
  if (!subject)
    throw new Error(
      `The file's first line should name the subject ("# Rajasthan History", "# Rajasthan Art & Culture", …); it says "${title.slice(0, 60)}".`,
    );

  const add = (textEn: string, textHi: string, i: number, extra: Partial<NotesFact> = {}) => {
    if (!chapter) return;
    const en = textEn.trim();
    if (!en) return;
    const heading = [...heads, ...(label ? [label] : [])].join(" › ");
    let key = hash(`${sourceOf(subject)}|${chapter.key}|${heading}|${en}`);
    const n = keys.get(key) ?? 0;
    keys.set(key, n + 1);
    if (n) key = hash(`${key}|${n}`);
    const doubts = [...flagged(en), ...flagged(textHi)];
    const entities = new Set<string>();
    if (place) {
      entities.add(`P:${place.key}`);
      if (place.district) entities.add(`D:${place.district}`);
    }
    // "Dadrewa (Churu)": a district named in brackets.
    for (const m of en.matchAll(/\(([^()]{3,40})\)/g))
      for (const part of m[1].split(/[,/;]| and /)) {
        const d = districtOf(part);
        if (d) entities.add(`D:${d}`);
      }
    let flags = extra.flags ?? 0;
    if (/^Trick\s*:/i.test(en)) flags |= MNEMONIC_FLAG;
    if (revision) flags |= REVISION_FLAG;
    facts.push({
      key,
      subject,
      chapter_key: chapter.key,
      chapter: chapter.title,
      heading,
      text_en: en,
      text_hi: textHi.trim(),
      table_head: "",
      entities: [...entities].sort(),
      position: i,
      status: doubts.length ? "to_check" : "verified",
      note: doubts.length ? `From the notes: ${doubts.join(" · ")}` : "",
      ...extra,
      flags,
    });
    chapter.facts++;
  };

  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    const h = H[i];
    if (!e.startsWith("|")) table = null;
    const hm = /^(#+)\s+(.*)$/.exec(e);
    if (hm) {
      const level = hm[1].length;
      const textHi = h.replace(/^#+\s+/, "");
      label = "";
      if (level === 1) continue;
      if (level === 2) {
        const cm = /^Chapter\s+(\d+)\s*:\s*(.*)$/i.exec(hm[2]);
        if (!cm) {
          // "Places index" and anything after the chapters: not facts.
          chapter = null;
          continue;
        }
        chapter = {
          key: `${subject}-n${cm[1].padStart(2, "0")}`,
          title: cm[2].trim(),
          title_hi: textHi.replace(/^[^:]*:\s*/, "").trim(),
          facts: 0,
        };
        chapters.push(chapter);
        pair(chapter.title, chapter.title_hi);
        heads.length = 0;
        place = null;
        revision = false;
        continue;
      }
      // ### is heads[0], #### heads[1], ##### heads[2].
      heads.length = Math.max(0, level - 3);
      place = null;
      const pm = /^Place:\s*(.*)$/i.exec(hm[2]);
      if (pm && chapter) {
        const [name = "", district = "", type = ""] = pm[1].split("|").map((s) => s.trim());
        const nameHi = (/^Place:\s*(.*)$/i.exec(textHi)?.[1] ?? "").split("|")[0].trim();
        const d = districtOf(district);
        const key = placeKey(name, d);
        const t = type.toLowerCase();
        place = places.get(key) ?? {
          key,
          name_en: name,
          name_hi: nameHi,
          district: d,
          type: t,
          cat: CATS[t] ?? "town",
          aliases: [],
          where: "",
        };
        places.set(key, place);
        pair(name, nameHi);
        heads.push(name);
        continue;
      }
      heads.push(hm[2].trim());
      pair(hm[2], textHi);
      revision = level === 3 && /^Revision questions$/i.test(hm[2].trim());
      continue;
    }
    if (!chapter) continue;
    // Tables: the header row, the rule, then a fact per row.
    if (e.startsWith("|")) {
      if (/^\|[\s:|-]+\|?$/.test(e.trim())) continue;
      if (!table) {
        table = { head: cells(e).join(" · "), headHi: cells(h).join(" · ") };
        cells(e).forEach((c, k) => pair(c, cells(h)[k] ?? ""));
        continue;
      }
      add(cells(e).join(" · "), cells(h).join(" · "), i, {
        table_head: table.head,
        flags: TABLE_FLAG,
      });
      continue;
    }
    const bm = /^(\s*)- (.*)$/.exec(e);
    if (!bm) continue; // a chapter's opening paragraph
    const indent = bm[1].length;
    const textEn = bm[2];
    const textHi = h.replace(/^\s*- /, "");
    if (indent === 0) label = "";
    // "- About:" alone: the indented points under it carry it as heading.
    const lm = /^([^:]{2,40}):\s*$/.exec(textEn);
    if (lm && indent === 0) {
      label = lm[1].trim();
      pair(label, textHi.replace(/:\s*$/, ""));
      continue;
    }
    if (place && indent === 0) {
      const alias = /^Also called\s*:\s*(.*)$/i.exec(textEn);
      if (alias)
        place.aliases.push(
          ...alias[1]
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      const where = /^Where\s*:\s*(.*)$/i.exec(textEn);
      if (where && !place.where) place.where = where[1].trim();
    }
    add(textEn, textHi, i);
  }
  return { subject, title, headingsHi, chapters, facts, places: [...places.values()] };
}

// ---------- Import ----------

export type NotesImportResult = {
  subject: string;
  chapters: number;
  facts: { added: number; updated: number; kept: number; gone: number; toCheck: number };
  places: {
    added: number;
    linked: number;
    approximate: number;
    atHeadquarters: number;
    notPlaced: string[];
  };
};

type Rangeable = {
  range: (
    a: number,
    b: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};
async function all<T>(q: () => Rangeable): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q().range(a, a + 999);
    fail(error);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

// For matching names: "Kumbhalgarh fort (UNESCO)" and "Kumbhalgarh" alike.
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(fort|temple|lake)\s*$/u, "")
    .trim();

export async function importSubjectNotes(en: string, hi: string): Promise<NotesImportResult> {
  const notes = parseSubjectNotes(en, hi);
  const source = sourceOf(notes.subject);
  if (!notes.chapters.length) throw new Error('No chapters found ("## Chapter 01: …").');
  const { matchPlace, placeKey: geoKey } = await import("@/lib/geo-places");

  // ---- Places ----
  const oldPlaces = await all<AtlasPlace>(() =>
    from("atlas_places").select(
      "id,key,name_en,label_en,cat,district,source,edited,status,note_en",
    ),
  );
  const byKey = new Map(oldPlaces.map((p) => [p.key, p]));
  // An atlas place of the same name in the same district (from the master
  // map): the notes' points join it rather than a second pin.
  const sameName = new Map<string, AtlasPlace>();
  // Only places of a like kind: "Kota fort" isn't the Kota dairy. Places
  // other subjects' notes added are joined the same way.
  const kindOf = (cat: string) => {
    if (cat === "town") return "town";
    const g = atlasCat(cat).group;
    return ["culture", "history", "arts"].includes(g) ? "culture" : g;
  };
  for (const p of oldPlaces)
    if (p.source !== source)
      for (const n of [p.name_en, p.label_en])
        if (n) sameName.set(`${norm(n)}|${p.district}|${kindOf(p.cat)}`, p);
  const { data: dRows, error: dErr } = await from("atlas_districts").select("district,meta");
  fail(dErr);
  const hq = new Map(
    ((dRows ?? []) as Row[]).map((r) => [
      String(r.district),
      (r.meta as { hq?: [number, number] } | null)?.hq ?? null,
    ]),
  );
  const pr: NotesImportResult["places"] = {
    added: 0,
    linked: 0,
    approximate: 0,
    atHeadquarters: 0,
    notPlaced: [],
  };
  const rename = new Map<string, string>(); // notes' key → existing atlas key
  // Places the editor merged, links they removed.
  const { linkFixes, fixEntities } = await import("@/lib/atlas-cleanup.server");
  const fx = await linkFixes();
  const placeRows: Row[] = [];
  for (const p of notes.places) {
    // Merged into another place by the editor: its points go there.
    if (fx.merged[p.key]) {
      rename.set(p.key, fx.merged[p.key]);
      pr.linked++;
      continue;
    }
    const kind = kindOf(p.cat);
    const same = p.district
      ? (sameName.get(`${norm(p.name_en)}|${p.district}|${kind}`) ??
        p.aliases.map((a) => sameName.get(`${norm(a)}|${p.district}|${kind}`)).find(Boolean))
      : undefined;
    if (same) {
      rename.set(p.key, same.key);
      pr.linked++;
      continue;
    }
    const old = byKey.get(p.key);
    if (old?.edited) {
      placeRows.push({ key: p.key, in_file: true, updated_at: now() });
      continue;
    }
    // Where to pin it: the place itself, else the village or town in
    // "Where:", from the surveyed list, near the district's headquarters.
    const centre = p.district ? hq.get(p.district) : null;
    const near = centre ? { lon: centre[0], lat: centre[1] } : null;
    let pin: { lat: number; lon: number; at: string } | null = null;
    const plain = p.name_en.replace(/\([^)]*\)/g, " ");
    const tries = [
      plain,
      // "Kumbhalgarh fort" → "Kumbhalgarh"; "Vishnu temple, Zawar" → "Zawar".
      plain.replace(
        /\b(fort|temple|palace|mahal|haveli|chhatris?|baori|stepwell|dargah|mosque)\b.*$/i,
        "",
      ),
      ...plain.split(",").slice(1),
      ...p.where.split(/[,;]| near | at | in | of /i),
      plain.split(/\s+/)[0],
    ]
      .map((s) =>
        s
          .replace(/\b(village|town|city|tehsil|district)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((s, i, a) => s.length >= 4 && a.indexOf(s) === i);
    // A place in the list of that name, in the notes' district: the exact
    // name anywhere in the state, else the nearest look-alike.
    for (const t of tries) {
      const found = [
        await matchPlace({ en: t }).catch(() => null),
        near ? await matchPlace({ en: t }, near, 150).catch(() => null) : null,
      ].filter((m): m is NonNullable<typeof m> => !!m);
      const ok = found
        .filter((m) => !p.district || districtAt(m.place.lon, m.place.lat) === p.district)
        .sort(
          (a, b) =>
            Number(geoKey(b.place.en) === geoKey(t)) - Number(geoKey(a.place.en) === geoKey(t)),
        )[0];
      if (ok) {
        pin = { lat: ok.place.lat, lon: ok.place.lon, at: ok.place.en };
        break;
      }
    }
    let status: AtlasStatus = "verified";
    let note: string;
    if (pin) {
      pr.approximate++;
      note = `${APPROX_NOTE} at ${pin.at}, from the notes ("${p.where || p.name_en}").`;
    } else if (near) {
      pin = { ...near, at: `${p.district} (headquarters)` };
      pr.atHeadquarters++;
      status = "to_check";
      note = `${APPROX_NOTE} not found in the place list; pinned at ${p.district}'s headquarters. Set its position.`;
    } else {
      pr.notPlaced.push(`${p.name_en}${p.district ? ` (${p.district})` : ""}`);
      continue;
    }
    if (!old) pr.added++;
    placeRows.push({
      key: p.key,
      name_en: p.name_en,
      name_hi: p.name_hi,
      label_en: p.name_en,
      label_hi: p.name_hi,
      cat: p.cat,
      lat: pin.lat,
      lon: pin.lon,
      district: p.district || districtAt(pin.lon, pin.lat),
      tehsil: "",
      refs: [],
      note_en: note,
      note_hi: "",
      // Hidden by the editor stays hidden.
      status: old?.status === "hidden" ? "hidden" : status,
      source,
      in_file: true,
      updated_at: now(),
    });
  }
  // Edited places only get in_file; the rest in full.
  const full = placeRows.filter((r) => "name_en" in r);
  for (let i = 0; i < full.length; i += 500)
    fail(
      (await from("atlas_places").upsert(full.slice(i, i + 500) as never, { onConflict: "key" }))
        .error,
    );
  for (const r of placeRows.filter((r) => !("name_en" in r)))
    fail(
      (
        await from("atlas_places")
          .update({ in_file: true } as never)
          .eq("key", String(r.key))
      ).error,
    );
  // Places aren't marked gone: other subjects' facts may still be on them.
  const placed = new Set([...placeRows.map((r) => String(r.key)), ...rename.values()]);

  // ---- Facts ----
  const oldFacts = await all<AtlasFact>(() =>
    from("atlas_facts").select("id,key,status,note,edited,text_hi,source").eq("source", source),
  );
  const factByKey = new Map(oldFacts.map((f) => [f.key, f]));
  const fr = { added: 0, updated: 0, kept: 0, gone: 0, toCheck: 0 };
  const rows: Row[] = [];
  for (const f of notes.facts) {
    const entities = fixEntities(
      f.key,
      f.entities
        .map((e) => (e.startsWith("P:") ? `P:${rename.get(e.slice(2)) ?? e.slice(2)}` : e))
        // A place that couldn't be pinned isn't linked.
        .filter((e) => !e.startsWith("P:") || placed.has(e.slice(2))),
      fx,
    );
    const old = factByKey.get(f.key);
    if (old?.edited) {
      fr.kept++;
      rows.push({ key: f.key, entities, position: f.position, in_file: true, edited: true });
      continue;
    }
    // A point the editor already checked stays checked; hidden stays hidden.
    const status = old && old.status !== "to_check" ? old.status : f.status;
    if (status === "to_check") fr.toCheck++;
    rows.push({
      ...f,
      entities,
      status,
      note: old?.note && old.status !== "to_check" ? old.note : f.note,
      hi_ai: false,
      source,
      edited: false,
      in_file: true,
      updated_at: now(),
    });
    if (old) fr.updated++;
    else fr.added++;
  }
  const fullFacts = rows.filter((r) => !r.edited);
  for (let i = 0; i < fullFacts.length; i += 500)
    fail(
      (
        await from("atlas_facts").upsert(fullFacts.slice(i, i + 500) as never, {
          onConflict: "key",
        })
      ).error,
    );
  for (const r of rows.filter((r) => r.edited))
    fail(
      (
        await from("atlas_facts")
          .update({ entities: r.entities, position: r.position, in_file: true } as never)
          .eq("key", String(r.key))
      ).error,
    );
  const factKeys = new Set(notes.facts.map((f) => f.key));
  const goneFacts = oldFacts.filter((f) => !factKeys.has(f.key));
  for (let i = 0; i < goneFacts.length; i += 200)
    fail(
      (
        await from("atlas_facts")
          .update({ in_file: false } as never)
          .in(
            "id",
            goneFacts.slice(i, i + 200).map((f) => f.id),
          )
      ).error,
    );
  fr.gone = goneFacts.length;

  // The headings' Hindi, kept with the others (the master map's come from
  // the background translation).
  const { queueKb, invalidateAtlas, saveHeadingsHi } = await import("@/lib/atlas.server");
  await saveHeadingsHi(notes.headingsHi);
  await queueKb(notes.chapters.map((c) => c.key));
  invalidateAtlas();
  return { subject: notes.subject, chapters: notes.chapters.length, facts: fr, places: pr };
}
