// Exam Radar: the monthly's page of the stories most likely to be asked,
// in the order to revise them, each with why (its importance, a past paper
// that asked its topic, Rajasthan, how much the magazine's exams ask its
// section). Scored from what the stories already carry, with no AI call;
// the editor can pin, hide or turn the page off. Shared by the server, the
// admin page and the renderer.
import { examLabel, type AskedQ } from "@/lib/ca-asked";

export type RadarSettings = { off?: boolean; pinned: string[]; hidden: string[] };
export const RADAR_SIZE = 12;

export type RadarStory = {
  id: string;
  category: string;
  importance: number;
  rajasthan: boolean;
  story_type?: string | null;
  asked?: AskedQ[];
  history?: { en: string } | null;
  earlier?: unknown[];
};

export type RadarReason =
  | { kind: "asked"; exam: string }
  | { kind: "rajasthan" }
  | { kind: "importance" }
  | { kind: "section"; share: number }
  | { kind: "type"; type: string }
  | { kind: "pinned" };

// Story types exams ask the most from.
const ASKED_TYPES = new Set([
  "scheme",
  "index",
  "reports",
  "appointment",
  "award",
  "policy",
  "law",
]);

export function radarScore(s: RadarStory, shares: Record<string, number> = {}): number {
  const share = shares[s.category] ?? 0;
  return (
    s.importance * 10 +
    (s.asked?.length ? 8 + Math.min(3, s.asked.length) : 0) +
    (s.rajasthan || s.category === "rajasthan" ? 5 : 0) +
    Math.min(8, share / 4) +
    (s.story_type && ASKED_TYPES.has(s.story_type) ? 3 : 0) +
    (s.history?.en || s.earlier?.length ? 2 : 0)
  );
}

export function radarReasons(
  s: RadarStory,
  shares: Record<string, number> = {},
  pinned = false,
): RadarReason[] {
  const out: RadarReason[] = [];
  if (pinned) out.push({ kind: "pinned" });
  const a = s.asked?.[0];
  if (a) out.push({ kind: "asked", exam: examLabel(a) });
  if (s.importance >= 3) out.push({ kind: "importance" });
  if (s.rajasthan || s.category === "rajasthan") out.push({ kind: "rajasthan" });
  const share = shares[s.category] ?? 0;
  if (share >= 15) out.push({ kind: "section", share: Math.round(share) });
  if (s.story_type && ASKED_TYPES.has(s.story_type)) out.push({ kind: "type", type: s.story_type });
  return out;
}

// The stories for the page: pinned first (in pin order), then the best
// scored; hidden ones never. A tie keeps the stories' own order.
export function pickRadar<T extends RadarStory>(
  stories: T[],
  settings: RadarSettings | null | undefined,
  shares: Record<string, number> = {},
  size = RADAR_SIZE,
): { story: T; score: number; reasons: RadarReason[] }[] {
  const hidden = new Set(settings?.hidden ?? []);
  const pins = (settings?.pinned ?? []).filter((id) => !hidden.has(id));
  const byId = new Map(stories.map((s) => [s.id, s]));
  const pinned = pins.map((id) => byId.get(id)).filter((s): s is T => !!s);
  const rest = stories
    .filter((s) => !hidden.has(s.id) && !pins.includes(s.id))
    .map((s, i) => ({ s, i, score: radarScore(s, shares) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return [
    ...pinned.map((s) => ({
      story: s,
      score: radarScore(s, shares),
      reasons: radarReasons(s, shares, true),
    })),
    ...rest.map(({ s, score }) => ({ story: s, score, reasons: radarReasons(s, shares) })),
  ].slice(0, Math.max(size, pinned.length));
}

export function normalizeRadar(v: unknown): RadarSettings {
  const o = (v ?? {}) as Record<string, unknown>;
  const ids = (x: unknown) =>
    [
      ...new Set((Array.isArray(x) ? x : []).filter((i): i is string => typeof i === "string")),
    ].slice(0, 200);
  return { off: o.off === true, pinned: ids(o.pinned), hidden: ids(o.hidden) };
}

const TYPE_LABEL: Record<string, { en: string; hi: string }> = {
  scheme: { en: "Scheme", hi: "योजना" },
  index: { en: "Report / index", hi: "रिपोर्ट / सूचकांक" },
  reports: { en: "Report", hi: "रिपोर्ट" },
  appointment: { en: "Appointment", hi: "नियुक्ति" },
  award: { en: "Award", hi: "पुरस्कार" },
  policy: { en: "Policy", hi: "नीति" },
  law: { en: "Law", hi: "कानून" },
};

// A reason as printed.
export function reasonText(r: RadarReason, lang: "en" | "hi"): string {
  const hi = lang === "hi";
  switch (r.kind) {
    case "asked":
      return `${hi ? "पहले पूछा गया" : "Asked before"}: ${r.exam}`;
    case "rajasthan":
      return hi ? "राजस्थान" : "Rajasthan";
    case "importance":
      return hi ? "अत्यधिक महत्वपूर्ण" : "Very important";
    case "section":
      return hi
        ? `परीक्षाओं में इस खंड से ${r.share}% प्रश्न`
        : `${r.share}% of exam questions from this section`;
    case "type":
      return TYPE_LABEL[r.type]?.[lang] ?? r.type;
    case "pinned":
      return hi ? "संपादक की पसंद" : "Editor's pick";
  }
}
