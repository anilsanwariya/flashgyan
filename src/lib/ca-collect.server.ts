// Server-only automatic news collection. Work happens in short ticks (from a
// once-a-minute schedule or the admin page): each tick claims the running
// collection and does as many small steps as fit in about 20 seconds:
// read a site, pick headlines, fetch articles, then read and write them up
// with the usual magazine pipeline.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiErrorDetail } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  collectionDue,
  decodeEntities,
  editorialLinks,
  editorialTriageMessages,
  extractLinks,
  feedLink,
  isRecent,
  looksLikeFeed,
  parseFeed,
  parseTriage,
  readableText,
  triageMessages,
  usableText,
  type FoundLink,
} from "@/lib/ca-collect";
import { formatDate, istDate, type UploadSection } from "@/lib/current-affairs";
import {
  MAX_BACKFILL_DAYS,
  addDays,
  datesBetween,
  inSection,
  parseSitemap,
  searchHitOn,
  sitemapLinks,
  sitemapsFor,
} from "@/lib/ca-backfill";
import { rajasthanBalance, rajasthanWarningLine } from "@/lib/ca-report";
import { checklistText, draftButtons, type TgButton } from "@/lib/ca-checklist";
import * as CA from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

// New steps start only within this time; one step can take another 30-40 s.
const TICK_BUDGET_MS = 15_000;
const FETCH_TIMEOUT_MS = 15_000;
// Most articles fetched in one run, across all sites.
const MAX_PER_RUN = 40;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const LLAMA_BASE = "https://api.cloud.llamaindex.ai/api/parsing";

export type WatchSite = {
  id: string;
  url: string;
  name: string;
  section: UploadSection;
  language: "Hindi" | "English" | "Bilingual";
  max_articles: number;
  enabled: boolean;
  // A government website: its stories' source prints as official.
  official?: boolean;
  last_method: string | null;
  last_found: number | null;
  last_error: string | null;
  last_run_at: string | null;
};

export type CaRun = {
  id: string;
  issue_date: string;
  status: "running" | "done" | "failed";
  // The evening's collection, or one day of a past-date collection (missing
  // before that migration: the evening's).
  mode?: "daily" | "past";
  backfill_id?: string | null;
  started_by: string;
  discovered: string[];
  // The websites this collection reads (null: every website switched on).
  sites: string[] | null;
  notified: boolean;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type CaArticle = {
  id: string;
  run_id: string | null;
  site_id: string | null;
  issue_date: string;
  url: string;
  title: string;
  published_at: string | null;
  status: "found" | "selected" | "skipped" | "parsing" | "fetched" | "failed";
  reason: string | null;
  parse_job: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

const now = () => new Date().toISOString();

async function getSites(): Promise<WatchSite[]> {
  const { data, error } = await from("ca_watch_sites").select("*").order("created_at");
  fail(error);
  return (data ?? []) as unknown as WatchSite[];
}

// ---------- Runs ----------

// `siteIds`: the websites the admin picked for this collection; without
// them, the websites switched on in Settings.
export async function startRun(
  issueDate: string,
  by: string,
  siteIds?: string[],
  past?: { backfillId: string },
): Promise<CaRun> {
  const all = await getSites();
  const sites = siteIds
    ? all.filter((s) => siteIds.includes(s.id)).map((s) => s.id)
    : all.filter((s) => s.enabled).map((s) => s.id);
  if (siteIds && !sites.length) throw new Error("Pick at least one website.");
  const row = {
    issue_date: issueDate,
    status: "running",
    started_by: by,
    discovered: [],
    sites,
    locked_until: null,
    notified: false,
    error: null,
    started_at: now(),
    finished_at: null,
    updated_at: now(),
    ...(past ? { mode: "past", backfill_id: past.backfillId } : {}),
  };
  const upsert = (r: Record<string, unknown>) =>
    from("ca_runs")
      .upsert(r as never, { onConflict: "issue_date" })
      .select("*")
      .single();
  let { data, error } = await upsert(row);
  // A database without the runs' websites column (its migration not run
  // yet): the run reads every website switched on in Settings.
  if (error && /'sites' column/.test(error.message) && !past) {
    console.error(
      "ca_runs.sites is missing: run migration 20261021090000_ca_run_sites.sql. Collecting from every website switched on.",
    );
    const { sites: _sites, ...rest } = row;
    ({ data, error } = await upsert(rest));
  }
  fail(error);
  // A day collected again (or a past date) gets its whole-day duplicate
  // check again.
  await from("bot_settings").delete().eq("key", `ca_dupcheck:${issueDate}`);
  return data as unknown as CaRun;
}

export type TickResult = { run: string | null; steps: string[]; error?: string };

export async function tick(origin?: string): Promise<TickResult> {
  const settings = await CA.getMagazineSettings();
  try {
    await processApprovals();
  } catch (e) {
    console.error("telegram approvals:", e);
  }
  // Sunday's weekly report rides on the same once-a-minute schedule.
  try {
    await (await import("@/lib/ca-report.server")).maybeSendWeeklyReport(origin);
  } catch (e) {
    console.error("weekly report:", e);
  }
  if (settings.auto_collect && collectionDue(settings.collect_time)) {
    const today = istDate();
    const { data: existing } = await from("ca_runs")
      .select("id")
      .eq("issue_date", today)
      .maybeSingle();
    if (!existing && (await getSites()).some((s) => s.enabled)) await startRun(today, "schedule");
  }

  try {
    await advanceBackfill();
  } catch (e) {
    console.error("past-date collection:", e);
  }
  // Custom magazines take their next batch of stories.
  try {
    await (await import("@/lib/ca-mags.server")).magStep();
  } catch (e) {
    console.error("custom magazines:", e);
  }
  // The monthly magazine's official documents, one part at a time.
  try {
    await (await import("@/lib/ca-docs.server")).docStep();
  } catch (e) {
    console.error("official documents:", e);
  }
  // The scheme register links the next scheme stories.
  try {
    await (await import("@/lib/ca-schemes.server")).schemeStep();
  } catch (e) {
    console.error("scheme register:", e);
  }
  // The card studio's AI jobs left to run on the server (the check, the
  // fill), a few batches at a time.
  try {
    const flash = await import("@/lib/flash-studio.server");
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000 && (await flash.jobStep())) {
      // the next batches, within the tick's time
    }
  } catch (e) {
    console.error("card studio jobs:", e);
  }
  // Clipped newspapers finish in the background after "Done".
  try {
    const clips = await import("@/lib/ca-clips.server");
    const t0 = Date.now();
    while (Date.now() - t0 < 40_000 && (await clips.clipStep())) {
      // one step at a time, within the tick's time
    }
  } catch (e) {
    console.error("newspaper clipping:", e);
  }
  // Words in the News: suggestions after the evening collection, cards
  // written and proofread, images made, the album posted when due.
  try {
    await (await import("@/lib/ig.server")).igStep(origin);
  } catch (e) {
    console.error("infographics:", e);
  }

  const { data: claimed, error } = await supabaseAdmin.rpc(
    "ca_claim_run" as never,
    { p_seconds: 120 } as never,
  );
  fail(error);
  const run = ((claimed ?? []) as unknown as CaRun[])[0];
  if (!run) return { run: null, steps: [] };

  const started = Date.now();
  const steps: string[] = [];
  let failure: string | undefined;
  try {
    while (Date.now() - started < TICK_BUDGET_MS) {
      const step = await nextStep(run);
      if (step === "wait") {
        steps.push("waiting for PDF parsing");
        break;
      }
      if (!step) {
        await finishRun(run, origin, settings);
        steps.push("finished");
        break;
      }
      steps.push(step);
    }
  } catch (e) {
    failure = saathiErrorDetail(e);
    console.error("ca collect:", e);
    await from("ca_runs")
      .update({ error: failure, updated_at: now() } as never)
      .eq("id", run.id);
  } finally {
    await from("ca_runs")
      .update({ locked_until: null } as never)
      .eq("id", run.id);
  }
  return { run: run.issue_date, steps, error: failure };
}

// Does one unit of work. Returns what it did, "wait" when only PDF parsing is
// left, or null when the run is complete.
async function nextStep(run: CaRun): Promise<string | "wait" | null> {
  // 1) Read the next site: those picked for this collection (older runs:
  // every website switched on).
  const all = await getSites();
  const sites = run.sites
    ? all.filter((s) => run.sites!.includes(s.id))
    : all.filter((s) => s.enabled);
  const site = sites.find((s) => !run.discovered.includes(s.id));
  if (site) {
    const n = await discoverSite(site, run);
    run.discovered = [...run.discovered, site.id];
    fail(
      (
        await from("ca_runs")
          .update({ discovered: run.discovered, updated_at: now() } as never)
          .eq("id", run.id)
      ).error,
    );
    return `read ${site.name}: ${n} new links`;
  }

  // 2) Pick the exam-relevant headlines.
  const { count: found } = await from("ca_articles")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("status", "found");
  if (found) return `picked ${await triage(run, sites)} headlines`;

  // 3) Check PDFs being parsed.
  const { data: parsing } = await from("ca_articles")
    .select("*")
    .eq("run_id", run.id)
    .eq("status", "parsing")
    .limit(5);
  const parsed = await pollParsing((parsing ?? []) as unknown as CaArticle[], sites);

  // 4) Fetch selected articles.
  const { data: selected } = await from("ca_articles")
    .select("*")
    .eq("issue_date", run.issue_date)
    .eq("status", "selected")
    .limit(5);
  const toFetch = (selected ?? []) as unknown as CaArticle[];
  if (toFetch.length) return `fetched ${await fetchArticles(toFetch, sites)} articles`;
  if (parsed) return `parsed ${parsed} PDFs`;

  // 5) Read the collected sources into news items.
  const { data: srcs } = await from("ca_sources")
    .select("id,title,chunks,chunks_done,status")
    .eq("issue_date", run.issue_date)
    .not("url", "is", null)
    .in("status", ["new", "extracting"])
    .order("created_at")
    .limit(1);
  const src = (
    (srcs ?? []) as { id: string; title: string; chunks: number; chunks_done: number }[]
  )[0];
  if (src && src.chunks_done < src.chunks) {
    // A failure marks the source as errored, so the run moves on.
    const ok = await CA.extractSourceChunk(src.id, src.chunks_done).then(
      () => true,
      () => false,
    );
    return `${ok ? "read" : "couldn't read"} “${src.title.slice(0, 60)}”`;
  }

  // 5b) Once every source is read: the whole day's duplicate check, before
  // any story is written (merged stories are written once).
  if (!(parsing ?? []).length) {
    const key = `ca_dupcheck:${run.issue_date}`;
    const { data: last } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
    if ((last as { value?: { run?: string } } | null)?.value?.run !== run.id) {
      const r = await CA.mergeDayDuplicates(run.issue_date).catch((e: unknown) => {
        console.error("duplicate check:", e);
        return null;
      });
      await from("bot_settings").upsert({
        key,
        value: { run: run.id, at: now() },
        updated_at: now(),
      } as never);
      if (r)
        return r.removed || r.suggestions
          ? `merged ${r.removed} duplicate stories${r.suggestions ? `; ${r.suggestions} to check` : ""}`
          : "no duplicate stories";
    }
  }

  // 6) Write the magazine text.
  const { data: items } = await from("ca_items")
    .select("id,headline")
    .eq("issue_date", run.issue_date)
    .eq("status", "included")
    .eq("needs_enrich", true)
    .is("enrich_error", null)
    .limit(1);
  const item = ((items ?? []) as { id: string; headline: string }[])[0];
  if (item) {
    await CA.enrichItem(item.id).catch(() => undefined);
    return `wrote “${item.headline.slice(0, 60)}”`;
  }

  // 7) A concluded event without its complete summary: write it (each
  // event tried once per run).
  if (!(parsing ?? []).length) {
    const key = `ca_eventsum:${run.id}`;
    const { data: last } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
    const tried = ((last as { value?: { tried?: string[] } } | null)?.value?.tried ?? []).filter(
      (x) => typeof x === "string",
    );
    const id = await CA.eventNeedingSummary(tried).catch(() => null);
    if (id) {
      await from("bot_settings").upsert({
        key,
        value: { tried: [...tried, id] },
        updated_at: now(),
      } as never);
      const e = await CA.writeEventSummary(id).catch((err: unknown) => {
        console.error("event summary:", err);
        return null;
      });
      return e
        ? `wrote the summary of “${e.name.slice(0, 60)}”`
        : "couldn't write an event summary";
    }
  }

  if ((parsing ?? []).length) return "wait";
  return null;
}

async function sendTelegram(chatId: string | number, text: string, buttons: TgButton[][] = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  }).catch(() => undefined);
}

// "Approve & schedule" tapped under the "draft ready" message: the bot keeps
// the request (after checking it came from the magazine's admin chat), and
// the next tick makes the PDF and schedules the issue if nothing is left to
// do, answering on Telegram either way.
export const APPROVE_KEY = "ca_approve:";

async function processApprovals() {
  const { data, error } = await from("bot_settings")
    .select("key,value")
    .like("key", `${APPROVE_KEY}%`)
    .limit(5);
  if (error) return;
  for (const row of (data ?? []) as { key: string; value: { chat_id: string | number } }[]) {
    // Taken by deleting it, so two ticks never approve the same day twice.
    const { data: taken } = await from("bot_settings").delete().eq("key", row.key).select("key");
    if (!(taken ?? []).length) continue;
    const date = row.key.slice(APPROVE_KEY.length);
    const day = formatDate(date, "en");
    const reply = (text: string) => sendTelegram(row.value.chat_id, text);
    try {
      const left = (await CA.dayChecks(date)).filter((c) => c.state === "todo");
      if (left.length) {
        await reply(
          `Not approved: the issue for ${day} still has things to do:\n${left.map((c) => `• ${c.text}`).join("\n")}`,
        );
        continue;
      }
      const issue = await CA.buildIssue("daily", date, { schedule: true });
      const at = issue.scheduled_for
        ? new Date(issue.scheduled_for).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })
        : "the set time";
      await reply(`✅ Approved. The issue for ${day} posts on ${at} (IST).`);
    } catch (e) {
      await reply(`❌ Couldn't approve the issue for ${day}: ${saathiErrorDetail(e)}`);
    }
  }
}

async function finishRun(
  run: CaRun,
  origin: string | undefined,
  settings: Awaited<ReturnType<typeof CA.getMagazineSettings>>,
) {
  fail(
    (
      await from("ca_runs")
        .update({ status: "done", finished_at: now(), error: null, updated_at: now() } as never)
        .eq("id", run.id)
    ).error,
  );
  // A past date: its new stories are marked as collected later; the day's
  // review checks and the Telegram message are for the evening's collection.
  if (run.mode === "past") {
    await from("ca_items")
      .update({ collected_later: true } as never)
      .eq("issue_date", run.issue_date)
      .gte("created_at", run.started_at);
    return;
  }
  // The news the AI left out, ranked by exam value (one AI call), so the
  // review starts with the skipped articles worth a story.
  try {
    await CA.rankSkipped(run.issue_date);
  } catch (e) {
    console.error("rank skipped news:", saathiErrorDetail(e));
  }
  // The stories against the editor's house style rules (one AI call), so the
  // checklist lists what breaks them.
  if (settings.style_rules.length) {
    try {
      await CA.checkStyle(run.issue_date);
    } catch (e) {
      console.error("house style check:", saathiErrorDetail(e));
    }
  }
  // Names compared in Hindi and English (one AI call); numbers and dates
  // need none.
  try {
    await CA.checkLanguages(run.issue_date);
  } catch (e) {
    console.error("Hindi-English check:", saathiErrorDetail(e));
  }
  if (run.notified || !settings.notify_when_ready || !settings.test_chat_id) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const [{ count: stories }, { count: articles }, { data: dayItems }] = await Promise.all([
    from("ca_items")
      .select("id", { count: "exact", head: true })
      .eq("issue_date", run.issue_date)
      .eq("status", "included"),
    from("ca_articles")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("status", "fetched"),
    from("ca_items").select("category,rajasthan,status").eq("issue_date", run.issue_date),
  ]);
  const rajasthan = rajasthanWarningLine(
    rajasthanBalance(
      (dayItems ?? []) as { category: string; rajasthan: boolean; status: string }[],
      settings.min_rajasthan,
    ),
  );
  // What is still to do before scheduling (the Rajasthan share is the line
  // above; what was opened is only known in the browser), with buttons to
  // it, or to approve the issue when nothing is left.
  const checks = await CA.dayChecks(run.issue_date).catch(() => null);
  const left = checks ? checklistText(checks, ["rajasthan"]) : "";
  const buttons = checks ? draftButtons(checks, run.issue_date, origin) : [];
  const link = origin ? `\n\nReview: ${origin}/admin?section=ca.daily` : "";
  await sendTelegram(
    settings.test_chat_id,
    `📰 Current affairs draft for ${formatDate(run.issue_date, "en")} is ready: ${stories ?? 0} stories from ${articles ?? 0} articles. Review and approve it before ${settings.post_time} tomorrow.${rajasthan}${left}${link}`,
    buttons,
  );
  await from("ca_runs")
    .update({ notified: true } as never)
    .eq("id", run.id);
}

// ---------- 1) Reading a site ----------

async function get(
  url: string,
): Promise<{ ok: boolean; status: number; type: string; body: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = (await res.text()).slice(0, 3_000_000);
  return { ok: res.ok, status: res.status, type: res.headers.get("content-type") ?? "", body };
}

// The site's news from the last day, or from one past day.
async function tavilySearchSite(site: SiteRef, date?: string): Promise<FoundLink[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const host = new URL(site.url).hostname.replace(/^www\./, "");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query:
        site.section === "editorial"
          ? `${site.name} editorial opinion`
          : `${site.name} latest news Rajasthan India government`,
      include_domains: [host],
      ...(date
        ? { topic: "general", start_date: date, end_date: addDays(date, 1) }
        : { topic: "news", time_range: "day" }),
      max_results: 20,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const json = (await res.json()) as {
    results?: { title?: string; url?: string; published_date?: string }[];
  };
  return (json.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => ({
      url: r.url!,
      title: r.title!,
      published_at: r.published_date ? new Date(r.published_date).toISOString() : null,
    }));
}

type SiteRef = Pick<WatchSite, "url" | "name"> & { section?: WatchSite["section"] };

// Finds the site's latest article links: its RSS feed, the links on its
// page, or (when the site can't be read) Tavily's news search for the site.
export async function readSite(
  site: SiteRef,
): Promise<{ links: FoundLink[]; method: string; error: string | null }> {
  let links: FoundLink[] = [];
  let method = "page";
  let error: string | null = null;
  try {
    const page = await get(site.url);
    if (!page.ok) throw new Error(`The site answered ${page.status}`);
    if (looksLikeFeed(page.body, page.type)) {
      links = parseFeed(page.body, site.url);
      method = "rss";
    } else {
      const feed = feedLink(page.body, site.url);
      if (feed) {
        try {
          const f = await get(feed);
          const items = f.ok ? parseFeed(f.body, feed) : [];
          if (items.length >= 3) {
            links = items;
            method = "rss";
          }
        } catch {
          // fall back to the page's links
        }
      }
      if (!links.length) links = extractLinks(page.body, site.url);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (links.length < 3) {
    try {
      const found = await tavilySearchSite(site);
      if (found.length) {
        links = found;
        method = "search";
      }
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  // A feed is the editorial page's own; a page or search also links to news.
  if (site.section === "editorial" && method !== "rss") links = editorialLinks(links);
  return { links: links.filter((l) => isRecent(l)).slice(0, 120), method, error };
}

// What a site published on a past day: its site maps (news maps carry the
// date; others the date in the address or the last change), then a search
// of the site limited to that day when the maps give too little.
export async function readSiteForDate(
  site: SiteRef,
  date: string,
): Promise<{ links: FoundLink[]; method: string; error: string | null }> {
  let links: FoundLink[] = [];
  let method = "sitemap";
  let error: string | null = null;
  try {
    const origin = new URL(site.url).origin;
    const roots = new Set<string>();
    try {
      const robots = await get(`${origin}/robots.txt`);
      if (robots.ok)
        for (const m of robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) roots.add(m[1].trim());
    } catch {
      // no robots.txt
    }
    if (!roots.size) for (const p of ["/sitemap.xml", "/sitemap_index.xml"]) roots.add(origin + p);
    const seen = new Set<string>();
    const open = async (url: string, depth: number) => {
      if (seen.has(url) || seen.size >= 12 || links.length >= 300) return;
      seen.add(url);
      let page;
      try {
        page = await get(url);
      } catch {
        return;
      }
      if (!page.ok) return;
      const map = parseSitemap(page.body);
      links.push(...sitemapLinks(map.urls, date));
      if (depth < 2)
        for (const child of sitemapsFor(map.sitemaps, date)) await open(child, depth + 1);
    };
    for (const root of [...roots].slice(0, 4)) await open(root, 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  links = inSection(links, site.url);
  if (links.length < 3) {
    try {
      const found = (await tavilySearchSite(site, date)).filter((l) => searchHitOn(l, date));
      if (found.length) {
        links = found;
        method = "search";
      }
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  if (site.section === "editorial") links = editorialLinks(links);
  const unique = [...new Map(links.map((l) => [l.url, l])).values()];
  return {
    links: unique.slice(0, 150),
    method,
    error: unique.length ? null : (error ?? "Nothing found for this date"),
  };
}

async function discoverSite(site: WatchSite, run: CaRun): Promise<number> {
  const past = run.mode === "past";
  const { links, method, error } = past
    ? await readSiteForDate(site, run.issue_date)
    : await readSite(site);
  let added = 0;
  if (links.length) {
    const { data, error: iErr } = await from("ca_articles")
      .upsert(
        links.map((l) => ({
          run_id: run.id,
          site_id: site.id,
          issue_date: run.issue_date,
          url: l.url,
          title: l.title,
          published_at: l.published_at,
        })) as never,
        { onConflict: "url", ignoreDuplicates: true },
      )
      .select("id");
    fail(iErr);
    added = (data ?? []).length;
  }
  // The website's status in Settings describes the evening's collection.
  if (past) return added;
  await from("ca_watch_sites")
    .update({
      last_method: links.length ? method : null,
      last_found: links.length,
      last_error: links.length ? null : (error ?? "No article links found"),
      last_run_at: now(),
    } as never)
    .eq("id", site.id);
  return added;
}

// ---------- 2) Picking headlines ----------

async function triage(run: CaRun, sites: WatchSite[]): Promise<number> {
  const { data } = await from("ca_articles")
    .select("id,title,site_id")
    .eq("run_id", run.id)
    .eq("status", "found")
    .order("created_at")
    .limit(60);
  const batch = (data ?? []) as { id: string; title: string; site_id: string | null }[];
  if (!batch.length) return 0;
  const byId = new Map(sites.map((s) => [s.id, s]));
  const isEditorial = (siteId: string | null) => byId.get(siteId ?? "")?.section === "editorial";
  const { data: taken } = await from("ca_articles")
    .select("site_id")
    .eq("run_id", run.id)
    .in("status", ["selected", "parsing", "fetched"]);
  const takenList = (taken ?? []) as { site_id: string | null }[];
  const perSite = new Map<string, number>();
  for (const t of takenList) {
    if (t.site_id) perSite.set(t.site_id, (perSite.get(t.site_id) ?? 0) + 1);
  }
  const editorialsTaken = takenList.filter((t) => isEditorial(t.site_id)).length;
  const newsRoom = Math.max(0, MAX_PER_RUN - (takenList.length - editorialsTaken));
  const { daily_editorials } = await CA.getMagazineSettings();
  const editorialRoom = Math.max(0, daily_editorials - editorialsTaken);
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  // News and editorials are picked separately: news by the exam blueprint,
  // editorials by Mains issues, up to the day's editorial limit.
  type Found = (typeof batch)[number];
  const pick = async (
    list: Found[],
    room: number,
    messages: (
      l: { title: string; site: string }[],
      max: number,
    ) => Parameters<typeof saathiComplete>[1],
  ): Promise<Found[]> => {
    if (!room || !list.length) return [];
    const max = Math.min(room, 25);
    const raw = await saathiComplete(
      key,
      messages(
        list.map((a) => ({ title: a.title, site: byId.get(a.site_id ?? "")?.name ?? "" })),
        max,
      ),
    );
    return parseTriage(raw, list.length, max).map((i) => list[i]);
  };
  const picked = [
    ...(await pick(
      batch.filter((a) => !isEditorial(a.site_id)),
      newsRoom,
      triageMessages,
    )),
    ...(await pick(
      batch.filter((a) => isEditorial(a.site_id)),
      editorialRoom,
      editorialTriageMessages,
    )),
  ];
  // Respect each site's limit for this run.
  const chosen = new Set<string>();
  for (const a of picked) {
    const site = byId.get(a.site_id ?? "");
    const used = perSite.get(a.site_id ?? "") ?? 0;
    if (site && used >= site.max_articles) continue;
    perSite.set(a.site_id ?? "", used + 1);
    chosen.add(a.id);
  }
  const selectedIds = batch.filter((a) => chosen.has(a.id)).map((a) => a.id);
  const skippedIds = batch.filter((a) => !chosen.has(a.id)).map((a) => a.id);
  if (selectedIds.length) {
    fail(
      (
        await from("ca_articles")
          .update({
            status: "selected",
            reason: "Picked as exam-relevant",
            updated_at: now(),
          } as never)
          .in("id", selectedIds)
      ).error,
    );
  }
  if (skippedIds.length) {
    fail(
      (
        await from("ca_articles")
          .update({
            status: "skipped",
            reason: "Not picked as exam-relevant",
            updated_at: now(),
          } as never)
          .in("id", skippedIds)
      ).error,
    );
  }
  return selectedIds.length;
}

// ---------- 3) Fetching articles ----------

// One page's text, for material the editor adds to a story: a PDF is parsed,
// a web page read (Tavily first, then the page itself). Null when nothing
// readable came back.
export async function readPage(url: string): Promise<{ title: string; text: string } | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The page answered ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const name = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() ?? "");
  if (/application\/pdf/i.test(type) || /\.pdf$/i.test(name)) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { parsePdfBytes } = await import("@/lib/saathi-pdf.server");
    const { markdown } = await parsePdfBytes(bytes, {
      filename: name || "material.pdf",
      medium: "Bilingual",
    });
    return markdown.trim() ? { title: name.replace(/\.pdf$/i, "") || "PDF", text: markdown } : null;
  }
  const html = (await res.text()).slice(0, 3_000_000);
  const title =
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300) || new URL(url).hostname;
  let text = "";
  try {
    text = (await tavilyExtract([url])).get(url) ?? "";
  } catch (e) {
    console.error("tavily extract:", e);
  }
  if (!usableText(text)) text = readableText(html);
  return text.trim().length >= 200 ? { title, text } : null;
}

async function tavilyExtract(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const key = process.env.TAVILY_API_KEY;
  if (!key || !urls.length) return out;
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ urls, extract_depth: "basic", format: "markdown" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Tavily extract failed (${res.status})`);
  const json = (await res.json()) as { results?: { url?: string; raw_content?: string }[] };
  for (const r of json.results ?? []) {
    if (r.url && r.raw_content) out.set(r.url, r.raw_content);
  }
  return out;
}

async function saveArticle(article: CaArticle, site: WatchSite | undefined, text: string) {
  const content = `# ${article.title}\n\n${text.trim().slice(0, 60_000)}\n\nSource: ${article.url}`;
  const source = await CA.addSource({
    issue_date: article.issue_date,
    section: site?.section ?? "news",
    source_name: site?.name ?? new URL(article.url).hostname,
    title: article.title.slice(0, 300),
    content,
    url: article.url,
    ...(site?.official ? { official: true } : {}),
  });
  fail(
    (
      await from("ca_articles")
        .update({
          status: "fetched",
          source_id: source.id,
          reason: null,
          updated_at: now(),
        } as never)
        .eq("id", article.id)
    ).error,
  );
}

async function markFailed(id: string, reason: string) {
  await from("ca_articles")
    .update({ status: "failed", reason: reason.slice(0, 300), updated_at: now() } as never)
    .eq("id", id);
}

async function fetchArticles(articles: CaArticle[], sites: WatchSite[]): Promise<number> {
  const byId = new Map(sites.map((s) => [s.id, s]));
  let extracted = new Map<string, string>();
  try {
    extracted = await tavilyExtract(articles.map((a) => a.url));
  } catch (e) {
    console.error("tavily extract:", e);
  }
  let saved = 0;
  for (const a of articles) {
    const site = byId.get(a.site_id ?? "");
    try {
      let text = extracted.get(a.url) ?? "";
      const pdf = /\.pdf(\?|$)/i.test(a.url);
      if (!usableText(text) && !pdf) {
        const page = await get(a.url);
        if (page.ok) text = readableText(page.body);
      }
      if (usableText(text)) {
        await saveArticle(a, site, text);
        saved++;
      } else if (pdf) {
        await startPdfParse(a, site);
      } else {
        await markFailed(a.id, "Couldn't read the article text (blocked, paywalled or too short)");
      }
    } catch (e) {
      await markFailed(a.id, e instanceof Error ? e.message : String(e));
    }
  }
  return saved;
}

// PDF press notes are parsed by LlamaParse in the background: started here,
// checked on later ticks.
async function startPdfParse(article: CaArticle, site: WatchSite | undefined) {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) return markFailed(article.id, "PDF parsing is not configured (LLAMA_CLOUD_API_KEY)");
  const res = await fetch(article.url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return markFailed(article.id, `The PDF couldn't be downloaded (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) return markFailed(article.id, "The PDF is over 20 MB");
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    "notice.pdf",
  );
  form.append("language", site?.language === "English" ? "en" : "hi");
  form.append("result_type", "markdown");
  form.append("skip_diagonal_text", "true");
  const up = await fetch(`${LLAMA_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const job = ((await up.json().catch(() => ({}))) as { id?: string }).id;
  if (!up.ok || !job) return markFailed(article.id, `LlamaParse upload failed (${up.status})`);
  await from("ca_articles")
    .update({ status: "parsing", parse_job: job, updated_at: now() } as never)
    .eq("id", article.id);
}

async function pollParsing(articles: CaArticle[], sites: WatchSite[]): Promise<number> {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key || !articles.length) return 0;
  const byId = new Map(sites.map((s) => [s.id, s]));
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  let done = 0;
  for (const a of articles) {
    try {
      const st = await fetch(`${LLAMA_BASE}/job/${a.parse_job}`, { headers });
      const status = (
        ((await st.json().catch(() => ({}))) as { status?: string }).status ?? ""
      ).toUpperCase();
      if (status === "SUCCESS") {
        const md = await fetch(`${LLAMA_BASE}/job/${a.parse_job}/result/markdown`, { headers });
        const text = (
          ((await md.json().catch(() => ({}))) as { markdown?: string }).markdown ?? ""
        ).trim();
        if (text.length >= 200) {
          await saveArticle(a, byId.get(a.site_id ?? ""), text);
          done++;
        } else await markFailed(a.id, "The PDF had no readable text");
      } else if (["ERROR", "FAILED", "CANCELED"].includes(status)) {
        await markFailed(a.id, `PDF parsing ${status.toLowerCase()}`);
      } else if (Date.now() - Date.parse(a.updated_at) > 20 * 60_000) {
        await markFailed(a.id, "PDF parsing took too long");
      }
    } catch (e) {
      console.error("pdf poll:", e);
    }
  }
  return done;
}

// ---------- Admin ----------

export async function getCollection(issueDate: string) {
  const [run, articles, sites] = await Promise.all([
    from("ca_runs").select("*").eq("issue_date", issueDate).maybeSingle(),
    from("ca_articles").select("*").eq("issue_date", issueDate).order("created_at").limit(500),
    getSites(),
  ]);
  fail(articles.error);
  return {
    run: (run.data as unknown as CaRun | null) ?? null,
    articles: (articles.data ?? []) as unknown as CaArticle[],
    sites,
  };
}

export async function setArticleStatus(id: string, status: "selected" | "skipped") {
  const { error } = await from("ca_articles")
    .update({
      status,
      reason: status === "selected" ? "Picked by admin" : "Removed by admin",
      updated_at: now(),
    } as never)
    .eq("id", id)
    .in("status", ["found", "selected", "skipped", "failed"]);
  fail(error);
  // A pick after the run finished reopens it so the next tick fetches it.
  if (status === "selected") {
    const { data } = await from("ca_articles").select("issue_date").eq("id", id).maybeSingle();
    const date = (data as unknown as { issue_date: string } | null)?.issue_date;
    if (!date) return;
    await from("ca_runs")
      .update({ status: "running", updated_at: now() } as never)
      .eq("issue_date", date)
      .eq("status", "done");
  }
}

export { getSites };

export async function saveSite(site: Partial<WatchSite> & { url: string; name: string }) {
  const row = {
    url: site.url,
    name: site.name,
    section: site.section ?? "news",
    language: site.language ?? "Hindi",
    max_articles: site.max_articles ?? 10,
    enabled: site.enabled ?? true,
    ...(site.official !== undefined ? { official: site.official } : {}),
  };
  const save = (r: Record<string, unknown>) =>
    site.id
      ? from("ca_watch_sites")
          .update(r as never)
          .eq("id", site.id)
      : from("ca_watch_sites").insert(r as never);
  let { error } = await save(row);
  // Before the documents migration there is no official column.
  if (error && /official/.test(error.message) && !site.official) {
    const { official: _o, ...rest } = row as typeof row & { official?: boolean };
    ({ error } = await save(rest));
  }
  fail(error);
}

export async function deleteSite(id: string) {
  fail((await from("ca_watch_sites").delete().eq("id", id)).error);
}

// ---------- Past-date collections ----------

export type CaBackfill = {
  id: string;
  date_from: string;
  date_to: string;
  sites: string[];
  status: "running" | "paused" | "done" | "cancelled";
  next_date: string;
  started_by: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

// A database without the past-date tables (migration not run yet).
const missingBackfill = (e: { message: string } | null) =>
  !!e && /ca_backfills|backfill_id|'mode'|collected_later/.test(e.message);
const NOT_READY =
  "Past-date collection needs a database update: run the latest migration (ca_past_collection) in Lovable or the SQL editor.";

// Starts collecting a range of past dates from the websites picked (the
// ones switched on in Settings by default). One at a time.
export async function startBackfill(
  dateFrom: string,
  dateTo: string,
  siteIds: string[] | undefined,
  by: string,
): Promise<CaBackfill> {
  const today = istDate();
  if (dateFrom > dateTo) throw new Error("The start date is after the end date.");
  if (dateTo >= today)
    throw new Error("Pick dates up to yesterday; today is collected every evening.");
  if (datesBetween(dateFrom, dateTo).length > MAX_BACKFILL_DAYS)
    throw new Error(`Pick at most ${MAX_BACKFILL_DAYS} days at a time.`);
  const all = await getSites();
  const sites = siteIds
    ? all.filter((s) => siteIds.includes(s.id)).map((s) => s.id)
    : all.filter((s) => s.enabled).map((s) => s.id);
  if (!sites.length) throw new Error("Pick at least one website.");
  const { data: active, error: aErr } = await from("ca_backfills")
    .select("id")
    .in("status", ["running", "paused"])
    .limit(1);
  if (missingBackfill(aErr)) throw new Error(NOT_READY);
  fail(aErr);
  if ((active ?? []).length)
    throw new Error("A past-date collection is already going: finish or stop it first.");
  const { data, error } = await from("ca_backfills")
    .insert({
      date_from: dateFrom,
      date_to: dateTo,
      sites,
      status: "running",
      next_date: dateFrom,
      started_by: by,
    } as never)
    .select("*")
    .single();
  fail(error);
  return data as unknown as CaBackfill;
}

// Starts the next date when the previous one is finished (called on every
// tick). A date whose evening collection is still going waits for it.
export async function advanceBackfill(): Promise<string | null> {
  const { data, error } = await from("ca_backfills")
    .select("*")
    .eq("status", "running")
    .order("created_at")
    .limit(1);
  if (missingBackfill(error)) return null;
  fail(error);
  const bf = ((data ?? []) as unknown as CaBackfill[])[0];
  if (!bf) return null;
  const { data: going } = await from("ca_runs")
    .select("id,issue_date")
    .eq("backfill_id", bf.id)
    .eq("status", "running")
    .limit(1);
  if ((going ?? []).length) return null;
  if (bf.next_date > bf.date_to) {
    await from("ca_backfills")
      .update({ status: "done", finished_at: now(), updated_at: now() } as never)
      .eq("id", bf.id)
      .eq("status", "running");
    return "finished";
  }
  const date = bf.next_date;
  const { data: dayRun } = await from("ca_runs")
    .select("status,mode")
    .eq("issue_date", date)
    .maybeSingle();
  if ((dayRun as { status?: string } | null)?.status === "running") return null;
  // Taken by moving the date on, so two ticks never start the same day.
  const { data: taken } = await from("ca_backfills")
    .update({ next_date: addDays(date, 1), updated_at: now() } as never)
    .eq("id", bf.id)
    .eq("next_date", date)
    .select("id");
  if (!(taken ?? []).length) return null;
  await startRun(date, "past", bf.sites, { backfillId: bf.id });
  return date;
}

export type BackfillDay = {
  date: string;
  state: "waiting" | "collecting" | "done" | "stopped";
  found: number;
  picked: number;
  fetched: number;
  stories: number;
};

// The past-date collection being worked on (or the last one), day by day.
export async function getBackfill(): Promise<{
  ready: boolean;
  backfill: CaBackfill | null;
  days: BackfillDay[];
  sites: WatchSite[];
}> {
  const sites = await getSites();
  const { data, error } = await from("ca_backfills")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (missingBackfill(error)) return { ready: false, backfill: null, days: [], sites };
  fail(error);
  const bf = ((data ?? []) as unknown as CaBackfill[])[0] ?? null;
  if (!bf) return { ready: true, backfill: null, days: [], sites };
  const [runs, articles, items] = await Promise.all([
    from("ca_runs").select("issue_date,status,error").eq("backfill_id", bf.id),
    from("ca_articles")
      .select("issue_date,status,site_id")
      .gte("issue_date", bf.date_from)
      .lte("issue_date", bf.date_to)
      .in("site_id", bf.sites)
      .limit(20000),
    from("ca_items")
      .select("issue_date")
      .gte("issue_date", bf.date_from)
      .lte("issue_date", bf.date_to)
      .eq("collected_later", true)
      .eq("status", "included")
      .limit(20000),
  ]);
  const runOf = new Map(
    ((runs.data ?? []) as { issue_date: string; status: string; error: string | null }[]).map(
      (r) => [r.issue_date, r],
    ),
  );
  const count = new Map<string, { found: number; picked: number; fetched: number }>();
  for (const a of (articles.data ?? []) as { issue_date: string; status: string }[]) {
    const c = count.get(a.issue_date) ?? { found: 0, picked: 0, fetched: 0 };
    c.found++;
    if (a.status !== "found" && a.status !== "skipped") c.picked++;
    if (a.status === "fetched") c.fetched++;
    count.set(a.issue_date, c);
  }
  const stories = new Map<string, number>();
  for (const i of (items.data ?? []) as { issue_date: string }[])
    stories.set(i.issue_date, (stories.get(i.issue_date) ?? 0) + 1);
  const days = datesBetween(bf.date_from, bf.date_to).map((date): BackfillDay => {
    const run = runOf.get(date);
    const c = count.get(date) ?? { found: 0, picked: 0, fetched: 0 };
    return {
      date,
      state: run
        ? run.status === "running"
          ? "collecting"
          : run.error === "Stopped"
            ? "stopped"
            : "done"
        : bf.status === "cancelled"
          ? "stopped"
          : "waiting",
      ...c,
      stories: stories.get(date) ?? 0,
    };
  });
  return { ready: true, backfill: bf, days, sites };
}

// Pause (the day being collected finishes; no new day starts), go on, or
// stop (the day being collected stops too).
export async function setBackfillStatus(id: string, action: "pause" | "resume" | "stop") {
  const status = action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled";
  const { error } = await from("ca_backfills")
    .update({
      status,
      updated_at: now(),
      ...(action === "stop" ? { finished_at: now() } : {}),
    } as never)
    .eq("id", id)
    .in("status", action === "resume" ? ["paused"] : ["running", "paused"]);
  fail(error);
  if (action === "stop")
    await from("ca_runs")
      .update({ status: "done", error: "Stopped", finished_at: now(), updated_at: now() } as never)
      .eq("backfill_id", id)
      .eq("status", "running");
}
