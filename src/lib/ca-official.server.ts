// Official source check (server): a story's checkable facts compared with
// SAATHI's knowledge base (the Economic Review and other government books)
// and government websites (PIB, DIPR…) found through web search; each
// fact's result is kept on the fact.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiSearchQuery,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import {
  OFFICIAL_DOMAINS,
  factsToCheck,
  officialMessages,
  parseOfficial,
  type OfficialSource,
} from "@/lib/ca-official";
import type { CaContent, CaFact } from "@/lib/current-affairs";
import { CA_SUBJECT } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

type Row = { id: string; headline: string; facts: CaFact[]; content: CaContent | null };

async function loadFacts(itemId: string): Promise<Row> {
  const { data, error } = await from("ca_items")
    .select("id,headline,facts,content")
    .eq("id", itemId)
    .single();
  fail(error);
  return data as unknown as Row;
}

// Passages from SAATHI's books (not its current affairs notes).
async function bookSources(headline: string, facts: string[]): Promise<OfficialSource[]> {
  const { data } = await supabaseAdmin
    .from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  const subjects = [
    ...new Set(((data ?? []) as { subject: string }[]).map((r) => r.subject)),
  ].filter((s) => s && s !== CA_SUBJECT);
  if (!subjects.length) return [];
  const matches = await saathiSearchQuery(
    apiKey(),
    rpc,
    {
      standalone: `${headline}\n${facts.join(" ")}`.slice(0, 1000),
      english: headline.slice(0, 300),
    },
    subjects,
  );
  return relevantMatches(matches)
    .slice(0, 4)
    .map((m) => ({ title: matchLabel(m), content: m.content.slice(0, 4000) }));
}

// Government web pages on the story, when web search is set up.
async function webSources(headline: string): Promise<OfficialSource[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: headline.slice(0, 380),
        search_depth: "basic",
        max_results: 4,
        include_domains: OFFICIAL_DOMAINS,
        include_raw_content: true,
      }),
    });
    if (!res.ok) {
      console.error("official check search:", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const json = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string; raw_content?: string | null }[];
    };
    return (json.results ?? [])
      .filter((r) => r.url && (r.raw_content || r.content))
      .map((r) => ({
        title: r.title || new URL(r.url!).hostname,
        url: r.url!,
        content: (r.raw_content || r.content || "").slice(0, 6000),
      }));
  } catch (e) {
    console.error("official check search:", e);
    return [];
  }
}

// Checks a story's facts and keeps each result on its fact. Returns the facts.
export async function checkOfficial(itemId: string): Promise<CaFact[]> {
  const row = await loadFacts(itemId);
  const picked = factsToCheck(row.facts).map((index) => ({
    index,
    text: row.facts[index].text,
  }));
  if (!picked.length) return row.facts;
  const headline = row.content?.headline.en || row.headline;
  const texts = picked.map((f) => f.text);
  const [books, web] = await Promise.all([
    bookSources(headline, texts).catch((e) => {
      console.error("official check books:", e);
      return [] as OfficialSource[];
    }),
    webSources(headline),
  ]);
  const sources = [...books, ...web];
  const at = new Date().toISOString();
  const checks = sources.length
    ? parseOfficial(
        await saathiComplete(apiKey(), officialMessages({ headline, facts: texts, sources })),
        picked,
        sources,
        at,
      )
    : new Map(picked.map((f) => [f.index, { status: "not_found" as const, text: f.text, at }]));
  if (!checks.size) throw new Error("The AI's check couldn't be read: try again.");
  // The facts as they are now: a fact edited meanwhile keeps no result.
  const now = await loadFacts(itemId);
  const facts = now.facts.map((f, i) => {
    const c = checks.get(i);
    return c && c.text === f.text ? { ...f, official: c } : f;
  });
  fail(
    (
      await from("ca_items")
        .update({ facts } as never)
        .eq("id", itemId)
    ).error,
  );
  return facts;
}

// The editor keeps the story's own value after a difference (or takes that
// back).
export async function keepOfficial(itemId: string, index: number, kept: boolean) {
  const row = await loadFacts(itemId);
  const f = row.facts[index];
  if (!f?.official || f.official.text !== f.text) throw new Error("That fact isn't checked.");
  const facts = row.facts.map((x, i) =>
    i === index ? { ...x, official: { ...f.official!, kept } } : x,
  );
  fail(
    (
      await from("ca_items")
        .update({ facts } as never)
        .eq("id", itemId)
    ).error,
  );
  return facts;
}
