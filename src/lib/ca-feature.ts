// The monthly issue's background article: a short bilingual explainer on a
// static topic behind several of the month's stories (a state commission, a
// defence technology…), written only from SAATHI's knowledge base. Pure
// helpers: prompts, parsing and checks; no network here.
import type { Bi } from "@/lib/current-affairs";

export type FeatureSection = { heading: Bi; body: Bi };

export type CaFeature = {
  topic: Bi;
  title: Bi;
  intro: Bi;
  sections: FeatureSection[];
  // Knowledge-base titles the article was written from.
  sources: string[];
  // Printed in the monthly issue.
  included: boolean;
  created_at: string;
};

export type FeatureTopic = {
  topic: Bi;
  // English search text for the knowledge base.
  query: string;
  // Headlines of this month's stories it explains.
  stories: string[];
  // Matching passages in the knowledge base (filled in by the server).
  passages?: number;
};

type ChatMessage = { role: "system" | "user"; content: string };
type Passage = { title: string; content: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const bi = (v: unknown, max: number): Bi | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return en && hi ? { en, hi } : null;
};

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    return null;
  }
}

export function featureTopicMessages(
  stories: { headline: string; category: string }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan the background article of a monthly current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). From the month's numbered headlines, suggest 5 static topics that explain the background of several stories at once and are themselves asked in RPSC exams: an institution or commission (its constitution, powers, members), a constitutional or legal provision, a scheme's history and design, a technology (drones, satellites), a geographical feature or region, or a Rajasthan topic (state commissions, policies, culture). Prefer topics behind 2 or more stories and topics about Rajasthan. Not a news summary: the article explains the lasting concept.
Reply with JSON only: [{"topic": {"en": "...", "hi": "..."}, "query": "English search words for the topic, 3-10 words", "stories": [headline numbers it explains]}].`,
    },
    {
      role: "user",
      content: stories.map((s, i) => `${i + 1}. ${s.headline} (${s.category})`).join("\n"),
    },
  ];
}

export function parseFeatureTopics(raw: string, stories: { headline: string }[]): FeatureTopic[] {
  const list = parseJson<unknown[]>(raw);
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: FeatureTopic[] = [];
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const topic = bi(o.topic, 160);
    const query = str(o.query, 200) || topic?.en || "";
    if (!topic || !query || seen.has(topic.en.toLowerCase())) continue;
    seen.add(topic.en.toLowerCase());
    const nums = Array.isArray(o.stories) ? o.stories : [];
    const headlines = nums
      .map((n) => stories[Number(n) - 1]?.headline)
      .filter((h): h is string => Boolean(h));
    out.push({ topic, query, stories: [...new Set(headlines)].slice(0, 6) });
  }
  return out.slice(0, 5);
}

export function featureMessages(opts: {
  topic: Bi;
  stories: string[];
  passages: Passage[];
  problem?: string;
}): ChatMessage[] {
  const passages = opts.passages
    .map((p, i) => `[K${i + 1}] ${p.title}\n${p.content.slice(0, 2500)}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content: `You write the background article of a bilingual (Hindi and English) monthly current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains), on the topic given. Base it on the knowledge-base passages [K…] (the students' books) and list the ones you used in "from"; add well-established facts from your own knowledge to make it complete, but only facts you are sure of (no doubtful figures or dates). Reply {"error": "not covered"} only if you cannot write a reliable article on the topic.
Write for revision, not prose: an intro of 1-2 sentences linking the topic to this month's news, then 3-5 sections with short headings; each section body is 2-5 short lines (separated by line breaks, not numbered), each line one exam fact (articles, years, members, powers, places, figures). Hindi must be natural standard Hindi as used in RPSC exams (मानक हिंदी), with the same numbers and official names.
Reply with JSON only: {"title": {"en": "...", "hi": "..."}, "intro": {"en": "...", "hi": "..."}, "sections": [{"heading": {"en": "...", "hi": "..."}, "body": {"en": "...", "hi": "..."}}], "from": ["K1", ...]}`,
    },
    {
      role: "user",
      content: `Topic: ${opts.topic.en} / ${opts.topic.hi}\n${
        opts.stories.length
          ? `This month's related stories:\n${opts.stories.map((s) => `- ${s}`).join("\n")}\n`
          : ""
      }\nKnowledge-base passages:\n${passages}${
        opts.problem ? `\n\nYour previous article was rejected: ${opts.problem} Fix it.` : ""
      }`,
    },
  ];
}

export type ParsedFeature =
  | { ok: true; title: Bi; intro: Bi; sections: FeatureSection[]; from: number[] }
  | { ok: false; reason: string };

export function parseFeature(raw: string, passages: Passage[]): ParsedFeature {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o))
    return { ok: false, reason: "The AI's reply could not be read." };
  if (o.error) return { ok: false, reason: "not covered" };
  const title = bi(o.title, 200);
  const intro = bi(o.intro, 800);
  const sections = (Array.isArray(o.sections) ? o.sections : [])
    .map((x) => {
      const s = (x ?? {}) as Record<string, unknown>;
      const heading = bi(s.heading, 160);
      const body = bi(s.body, 2000);
      return heading && body ? { heading, body } : null;
    })
    .filter((s): s is FeatureSection => s !== null)
    .slice(0, 6);
  if (!title || !intro || sections.length < 2)
    return { ok: false, reason: "The article came back incomplete." };
  const from = (Array.isArray(o.from) ? o.from : [])
    .map((k) => Number(String(k).replace(/\D/g, "")) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < passages.length);
  return { ok: true, title, intro, sections, from: [...new Set(from)] };
}
