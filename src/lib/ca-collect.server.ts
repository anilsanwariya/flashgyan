// Server-only automatic news collection. Work happens in short ticks (from a
// once-a-minute schedule or the admin page): each tick claims the running
// collection and does as many small steps as fit in about 20 seconds:
// read a site, pick headlines, fetch articles, then read and write them up
// with the usual magazine pipeline.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  collectionDue,
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
  last_method: string | null;
  last_found: number | null;
  last_error: string | null;
  last_run_at: string | null;
};

export type CaRun = {
  id: string;
  issue_date: string;
  status: "running" | "done" | "failed";
  started_by: string;
  discovered: string[];
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

export async function startRun(issueDate: string, by: string): Promise<CaRun> {
  const { data, error } = await from("ca_runs")
    .upsert(
      {
        issue_date: issueDate,
        status: "running",
        started_by: by,
        discovered: [],
        locked_until: null,
        notified: false,
        error: null,
        started_at: now(),
        finished_at: null,
        updated_at: now(),
      } as never,
      { onConflict: "issue_date" },
    )
    .select("*")
    .single();
  fail(error);
  return data as unknown as CaRun;
}

export type TickResult = { run: string | null; steps: string[]; error?: string };

export async function tick(origin?: string): Promise<TickResult> {
  const settings = await CA.getMagazineSettings();
  if (settings.auto_collect && collectionDue(settings.collect_time)) {
    const today = istDate();
    const { data: existing } = await from("ca_runs")
      .select("id")
      .eq("issue_date", today)
      .maybeSingle();
    if (!existing && (await getSites()).some((s) => s.enabled)) await startRun(today, "schedule");
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
    failure = e instanceof Error ? e.message : String(e);
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
  // 1) Read the next site.
  const sites = (await getSites()).filter((s) => s.enabled);
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

  if ((parsing ?? []).length) return "wait";
  return null;
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
  if (run.notified || !settings.notify_when_ready || !settings.test_chat_id) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const [{ count: stories }, { count: articles }] = await Promise.all([
    from("ca_items")
      .select("id", { count: "exact", head: true })
      .eq("issue_date", run.issue_date)
      .eq("status", "included"),
    from("ca_articles")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("status", "fetched"),
  ]);
  const link = origin ? `\n\nReview: ${origin}/admin?section=ca.daily` : "";
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: settings.test_chat_id,
      text: `📰 Current affairs draft for ${formatDate(run.issue_date, "en")} is ready: ${stories ?? 0} stories from ${articles ?? 0} articles. Review and approve it before ${settings.post_time} tomorrow.${link}`,
    }),
  }).catch(() => undefined);
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

async function tavilySearchSite(site: WatchSite): Promise<FoundLink[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const host = new URL(site.url).hostname.replace(/^www\./, "");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query: `${site.name} latest news Rajasthan India government`,
      include_domains: [host],
      topic: "news",
      time_range: "day",
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

// Finds the site's latest article links: its RSS feed, the links on its
// page, or (when the site can't be read) Tavily's news search for the site.
export async function readSite(
  site: Pick<WatchSite, "url" | "name">,
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
      const found = await tavilySearchSite(site as WatchSite);
      if (found.length) {
        links = found;
        method = "search";
      }
    } catch (e) {
      error = error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  return { links: links.filter((l) => isRecent(l)).slice(0, 120), method, error };
}

async function discoverSite(site: WatchSite, run: CaRun): Promise<number> {
  const { links, method, error } = await readSite(site);
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
  const { count: already } = await from("ca_articles")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("status", ["selected", "parsing", "fetched"]);
  const room = Math.max(0, MAX_PER_RUN - (already ?? 0));
  const byId = new Map(sites.map((s) => [s.id, s]));
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const picked = room
    ? parseTriage(
        await saathiComplete(
          key,
          triageMessages(
            batch.map((a) => ({ title: a.title, site: byId.get(a.site_id ?? "")?.name ?? "" })),
            Math.min(room, 25),
          ),
        ),
        batch.length,
        room,
      )
    : [];
  // Respect each site's limit for this run.
  const { data: taken } = await from("ca_articles")
    .select("site_id")
    .eq("run_id", run.id)
    .in("status", ["selected", "parsing", "fetched"]);
  const perSite = new Map<string, number>();
  for (const t of (taken ?? []) as { site_id: string | null }[]) {
    if (t.site_id) perSite.set(t.site_id, (perSite.get(t.site_id) ?? 0) + 1);
  }
  const chosen = new Set<string>();
  for (const i of picked) {
    const a = batch[i];
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
  };
  const q = site.id
    ? from("ca_watch_sites")
        .update(row as never)
        .eq("id", site.id)
    : from("ca_watch_sites").insert(row as never);
  fail((await q).error);
}

export async function deleteSite(id: string) {
  fail((await from("ca_watch_sites").delete().eq("id", id)).error);
}
