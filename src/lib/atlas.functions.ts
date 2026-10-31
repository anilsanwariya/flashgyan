// Server functions for the Rajasthan atlas: the admin's (import, edit,
// verify, district overviews) and the students' (public, read-only:
// verified places and facts, published overviews).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ATLAS_CAT_KEYS, normalizeOverview } from "@/lib/atlas";
import type {
  AtlasBase,
  DistrictListRow,
  ImportResult,
  OverviewCheck,
  PublicFact,
  PublicPlace,
} from "@/lib/atlas.server";

import type { AtlasMcqRow } from "@/lib/atlas-practice.server";
import type { GapReport, HindiItem, NotesMatch } from "@/lib/atlas-review.server";
import type { Suggestion } from "@/lib/atlas-themes.server";
import type { NewsItem } from "@/lib/atlas-news.server";
import type { AtlasReport, PositionCheck } from "@/lib/atlas-quality.server";
import type { RecheckFact } from "@/lib/atlas-recheck.server";
import type { AskedQ } from "@/lib/atlas-exams.server";

export type {
  AtlasBase,
  AtlasMcqRow,
  GapReport,
  HindiItem,
  NotesMatch,
  Suggestion,
  NewsItem,
  AtlasReport,
  PositionCheck,
  RecheckFact,
  AskedQ,
  DistrictListRow,
  ImportResult,
  OverviewCheck,
  PublicFact,
  PublicPlace,
};

async function server() {
  return import("@/lib/atlas.server");
}
async function practice() {
  return import("@/lib/atlas-practice.server");
}
async function themes() {
  return import("@/lib/atlas-themes.server");
}
async function news() {
  return import("@/lib/atlas-news.server");
}
async function quality() {
  return import("@/lib/atlas-quality.server");
}
async function recheck() {
  return import("@/lib/atlas-recheck.server");
}
async function review() {
  return import("@/lib/atlas-review.server");
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

const status = z.enum(["verified", "to_check", "hidden"]);
const lang = z.enum(["en", "hi"]);
const district = z.string().trim().min(2).max(60);
const year = z.number().int().min(-5000).max(2200);
const months = z.array(z.number().int().min(1).max(12)).max(12);

// ---------- Admin ----------

export const atlasStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).atlasStatus();
  });

export const importMasterMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ html: z.string().min(1000).max(30_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).importMasterMap(data.html);
  });

export const runAtlasStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).atlasStep();
  });

export const resumeAtlasJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ translate: z.boolean().optional(), kb: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).resumeAtlasJobs(data);
  });

export const listAtlasPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        district: z.string().max(60).optional(),
        cat: z.string().max(30).optional(),
        status: z.union([status, z.literal("all")]).optional(),
        q: z.string().max(100).optional(),
        page: z.number().int().min(0).max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).listPlaces(data);
  });

export const saveAtlasPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name_en: z.string().trim().max(120).optional(),
        name_hi: z.string().trim().max(120).optional(),
        label_en: z.string().trim().max(200).optional(),
        label_hi: z.string().trim().max(200).optional(),
        cat: z.enum(ATLAS_CAT_KEYS as [string, ...string[]]).optional(),
        lat: z.number().min(20).max(33).optional(),
        lon: z.number().min(66).max(80).optional(),
        district: z.string().max(60).optional(),
        tehsil: z.string().max(60).optional(),
        note_en: z.string().max(2000).optional(),
        note_hi: z.string().max(2000).optional(),
        status: status.optional(),
        era_from: year.nullable().optional(),
        era_to: year.nullable().optional(),
        months: months.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).savePlace(data);
  });

export const listAtlasFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        chapter: z.string().max(40).optional(),
        entity: z.string().max(200).optional(),
        status: z.union([status, z.literal("all")]).optional(),
        q: z.string().max(100).optional(),
        kind: z.number().int().min(0).max(1024).optional(),
        aiHindi: z.boolean().optional(),
        page: z.number().int().min(0).max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).listFacts(data);
  });

export const saveAtlasFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        text_en: z.string().max(4000).optional(),
        text_hi: z.string().max(4000).optional(),
        heading: z.string().max(300).optional(),
        chapter_key: z.string().max(40).optional(),
        chapter: z.string().max(300).optional(),
        subject: z.string().max(10).optional(),
        entities: z.array(z.string().max(200)).max(60).optional(),
        flags: z.number().int().min(0).max(2047).optional(),
        status: status.optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).saveFact(data);
  });

export const atlasChapters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).chapters();
  });

export const listAtlasLayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listLayers();
  });

export const saveAtlasLayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().max(40),
        name_en: z.string().max(120).optional(),
        name_hi: z.string().max(120).optional(),
        status: status.optional(),
        approx: z.boolean().optional(),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { key, ...patch } = data;
    await (await server()).saveLayer(key, patch);
  });

export const listAtlasDistricts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listDistricts();
  });

export const getAtlasDistrict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ district }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getDistrict(data.district);
  });

export const saveAtlasOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        district,
        overview: z.record(z.string(), z.unknown()),
        label: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (
      await server()
    ).saveOverview(data.district, normalizeOverview(data.overview), data.label);
  });

export const atlasOverviewJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .discriminatedUnion("kind", [
        z.object({
          kind: z.literal("import"),
          district,
          text: z.string().min(100).max(2_000_000),
          lang,
        }),
        z.object({ kind: z.literal("translate"), district, lang }),
        z.object({ kind: z.literal("draft"), district, lang }),
        z.object({ kind: z.literal("check"), district }),
        z.object({ kind: z.literal("cancel"), district }),
      ])
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    if (data.kind === "import") await s.importOverview(data.district, data.text, data.lang);
    else if (data.kind === "translate") await s.translateOverview(data.district, data.lang);
    else if (data.kind === "draft") await s.draftOverview(data.district, data.lang);
    else if (data.kind === "check") await s.checkOverview(data.district);
    else await s.cancelOverviewJob(data.district);
  });

export const restoreAtlasOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ district, at: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).restoreOverview(data.district, data.at);
  });

export const setAtlasCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ district, id: z.string().max(80), state: z.enum(["open", "fixed", "kept"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setCheck(data.district, data.id, data.state);
  });

export const publishAtlasDistrict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ district, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).publishDistrict(data.district, data.on);
  });

// ---------- Students (public, read-only) ----------

export const atlasBaseFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).atlasBase(),
);

export const atlasPlacesFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).atlasPublicPlaces(),
);

export const atlasPlaceFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().min(2).max(200) }).parse(d))
  .handler(async ({ data }) => (await server()).atlasPlace(data.key));

export const atlasEntityFactsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ entity: z.string().regex(/^[DSVTU]:[\p{L}\p{N} .|()'-]{1,120}$/u) }).parse(d),
  )
  .handler(async ({ data }) => (await server()).atlasEntityFacts(data.entity));

export const atlasDistrictFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ district }).parse(d))
  .handler(async ({ data }) => (await server()).atlasDistrictPage(data.district));

// The atlas places and districts a SAATHI answer names.
export const atlasMentionsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().max(20_000) }).parse(d))
  .handler(async ({ data }) => (await news()).atlasMentions(data.text));

export const atlasInNewsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await news()).atlasInNews(),
);

// A student's "Report a mistake" (no sign-in needed; rate limited).
export const reportAtlasMistake = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["fact", "place", "district"]),
        ref: z.string().trim().min(1).max(200),
        label: z.string().max(600),
        message: z.string().trim().min(8).max(1500),
        correction: z.string().trim().max(1500),
        page: z.string().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp } = await import("@/lib/saathi-ask.server");
    return (await quality()).reportMistake(data, { ip: clientIp(getRequest()), userId: null });
  });

export const atlasOfflinePackFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).atlasOfflinePack(),
);

// ---------- The map editor (admin) ----------

export const atlasMapChoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).atlasLayerChoices();
  });

export const atlasPlacesOfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cat: z.string().max(30), district: z.string().max(60).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await (await server()).atlasPlacesOf(data.cat, data.district)).map((p) => ({
      name: { en: p.name_en, hi: p.name_hi },
      lat: p.lat,
      lon: p.lon,
      district: p.district,
    }));
  });

// ---------- Practice: MCQs and flashcards (admin) ----------

const bi = z.object({ en: z.string().max(600), hi: z.string().max(600) });

export const atlasPracticeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await practice()).practiceStatus();
  });

export const generateAtlasMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await practice()).generateMcqs();
  });

export const resumeAtlasMcqOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    await (await practice()).resumeDistractors();
    return { ok: true };
  });

export const listAtlasMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["draft", "approved", "rejected", "waiting"]).optional(),
        kind: z.enum(["place-district", "district-division", "district-zone", "notes"]).optional(),
        set: z.string().max(300).optional(),
        q: z.string().max(100).optional(),
        page: z.number().int().min(0).max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await practice()).listMcqs(data);
  });

export const saveAtlasMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        question: bi,
        options: z.array(bi).length(4),
        answer: z.number().int().min(1).max(4),
        explanation: bi,
        set_name: z.string().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...p } = data;
    return (await practice()).saveMcq(id, p);
  });

export const setAtlasMcqStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(2000),
        status: z.enum(["draft", "approved", "rejected"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await practice()).setMcqStatus(data.ids, data.status);
    return { ok: true };
  });

export const publishAtlasMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await practice()).publishMcqs();
  });

export const sendAtlasCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await practice()).sendCardsToStudio();
  });

// ---------- Keeping the atlas complete (admin) ----------

export const atlasChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await review()).districtChecklist();
  });

export const matchAtlasNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().max(300), text: z.string().min(1).max(2_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await review()).matchNotes(data.name, data.text);
  });

export const atlasHindiCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await review()).hindiCounts();
  });

export const atlasHindiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["fact", "place"]),
        skip: z.array(z.string().uuid()).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await review()).hindiQueue(data.kind, data.skip ?? []);
  });

export const acceptAtlasHindi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              kind: z.enum(["fact", "place"]),
              id: z.string().uuid(),
              hi: z.string().max(4000).optional(),
              label_hi: z.string().max(300).optional(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await review()).acceptHindi(data.items);
    return { ok: true };
  });

export const atlasGapReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await review()).gapReport();
  });

// ---------- Themes: places suggested from the notes (admin) ----------

export const atlasSuggestionsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await themes()).suggestionsStatus();
  });

export const startAtlasSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ stop: z.boolean().optional(), chapter: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const t = await themes();
    if (data.stop) {
      await t.stopSuggestions();
      return { chapters: 0 };
    }
    return t.startSuggestions(data.chapter);
  });

export const listAtlasSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["open", "accepted", "rejected"]).optional(),
        cat: z.string().max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await themes()).listSuggestions(data);
  });

export const decideAtlasSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .discriminatedUnion("decision", [
        z.object({
          decision: z.literal("reject"),
          ids: z.array(z.string().uuid()).min(1).max(200),
        }),
        z.object({
          decision: z.literal("accept"),
          id: z.string().uuid(),
          edit: z
            .object({
              cat: z.enum(ATLAS_CAT_KEYS as [string, ...string[]]).optional(),
              name: z
                .object({ en: z.string().trim().min(1).max(160), hi: z.string().max(160) })
                .optional(),
              district: z.string().max(60).optional(),
              lat: z.number().min(20).max(33).optional(),
              lon: z.number().min(66).max(80).optional(),
              era_from: year.nullable().optional(),
              era_to: year.nullable().optional(),
              months: months.optional(),
            })
            .default({}),
        }),
      ])
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const t = await themes();
    if (data.decision === "reject") {
      await t.rejectSuggestions(data.ids);
      return { key: null };
    }
    return t.acceptSuggestion(data.id, data.edit);
  });

// ---------- The atlas across the site (admin) ----------

export const atlasNewsLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await news()).newsLinks();
  });

export const editAtlasNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .discriminatedUnion("op", [
        z.object({ op: z.literal("hide"), id: z.string().uuid(), hidden: z.boolean() }),
        z.object({ op: z.literal("rescan"), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      ])
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const n = await news();
    if (data.op === "hide") await n.hideNewsLink(data.id, data.hidden);
    else await n.rescanNews(data.from);
    return { ok: true };
  });

export const atlasDistrictSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await news()).districtSeries();
  });

export const setUpAtlasDistrictSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await news()).setUpDistrictSeries();
  });

// ---------- Quality: sources, reports, positions (admin) ----------

export const atlasSourcesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await quality()).sourcesOverview();
  });

export const saveAtlasSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .record(
        z.string().max(10),
        z.object({
          name: z.object({ en: z.string().max(120), hi: z.string().max(120) }),
          url: z.string().max(300).optional(),
        }),
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await quality()).saveSourceNames(data);
    return { ok: true };
  });

export const atlasReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["open", "fixed", "dismissed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await quality()).listReports(data.status);
  });

export const setAtlasReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        status: z.enum(["open", "fixed", "dismissed"]),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await quality()).setReportStatus(data.ids, data.status, data.note);
    return { ok: true };
  });

export const atlasPositionChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await quality()).positionChecks();
  });

export const decideAtlasPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().min(2).max(200),
        decision: z.discriminatedUnion("use", [
          z.object({
            use: z.literal("list"),
            lat: z.number().min(20).max(33),
            lon: z.number().min(66).max(80),
          }),
          z.object({ use: z.literal("district") }),
          z.object({ use: z.literal("keep") }),
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await quality()).decidePosition(data.key, data.decision);
    return { ok: true };
  });

// ---------- Rechecking dated facts (admin) ----------

const every = z.union([z.literal(3), z.literal(6), z.literal(12)]);

export const atlasRecheckList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await recheck()).recheckList();
  });

export const confirmAtlasRecheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), bump: z.boolean(), every: every.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await recheck()).confirmRecheck(data.id, data);
  });

export const editAtlasRecheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        text_en: z.string().min(1).max(4000),
        text_hi: z.string().max(4000),
        chapter_key: z.string().max(40).optional(),
        every: every.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await recheck()).editRecheck(data.id, data);
    return { ok: true };
  });

export const setAtlasRecheckMonths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ months: every }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await recheck()).setRecheckMonths(data.months);
    return { ok: true };
  });

// ---------- The atlas on the syllabus (admin) ----------

async function syllabus() {
  return import("@/lib/atlas-syllabus.server");
}

export const atlasSyllabusCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await syllabus()).syllabusCoverage();
  });

export const startAtlasSyllabusLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ again: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await syllabus()).startSyllabusLinks(data.again);
  });

export const setAtlasGroupTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ key: z.string().min(1).max(400), topics: z.array(z.string().uuid()).max(10) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await syllabus()).setGroupTopics(data.key, data.topics);
    return { ok: true };
  });

// ---------- Asked in exams (public: published papers only) ----------

async function exams() {
  return import("@/lib/atlas-exams.server");
}

export const atlasAskedCountsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await exams()).askedCounts(),
);

export const atlasAskedFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ place: z.string().max(200).optional(), district: z.string().max(60).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => (await exams()).askedAbout(data));

// The atlas's flashcards, for students to revise (their schedule stays on
// their device).
export const atlasCardsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await import("@/lib/atlas-practice.server")).publicAtlasCards(),
);
