// Reviewing the day's magazine stories from Telegram, in the admin's chat:
// one story card at a time with Keep / Drop, moving through the day in the
// order of the issue's sections. Pure text and buttons, shared by the bot and
// tests.

type Bi = { en: string; hi: string };

export type TriageStory = {
  id: string;
  headline: string;
  category: string;
  importance: number;
  status: string;
  position: number;
  needs_enrich: boolean;
  content: { headline?: Bi; points?: Bi[] } | null;
};

// The issue's sections, in order (as in the magazine).
const SECTIONS: [string, string][] = [
  ["rajasthan", "Rajasthan"],
  ["national", "National"],
  ["international", "International"],
  ["science", "Science & Technology"],
  ["economy", "Economics"],
  ["sports", "Sports"],
  ["misc", "Miscellaneous"],
  ["editorial", "Editorials"],
];
const ORDER = new Map(SECTIONS.map(([id], i) => [id, i]));
const LABEL = new Map(SECTIONS);

export function triageOrder(rows: TriageStory[]): TriageStory[] {
  return [...rows].sort(
    (a, b) =>
      (ORDER.get(a.category) ?? 99) - (ORDER.get(b.category) ?? 99) || a.position - b.position,
  );
}

// Button data: "cas:<what>:<story id or date>". d drop and go on, i put back,
// k keep and go on, n next, p previous, s start (a new message), r start
// again, l the last story, h edit the headline, x nothing (the "3/18" label).
export const TRIAGE = "cas:";
type Button = { text: string; callback_data: string };
type Card = { text: string; reply_markup: { inline_keyboard: Button[][] } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function storyCard(rows: TriageStory[], i: number): Card {
  const s = rows[i];
  const c = s.content;
  const inIssue = s.status === "included";
  const points = (c?.points ?? []).map((p) => p.en || p.hi).filter(Boolean);
  const lines = [
    `📰 <b>Story ${i + 1} of ${rows.length}</b> · ${esc(LABEL.get(s.category) ?? s.category)} · ${"★".repeat(s.importance)}${"☆".repeat(Math.max(0, 3 - s.importance))}`,
    inIssue ? "✅ In the issue" : "❌ Dropped",
    "",
    `<b>${esc(c?.headline?.hi || c?.headline?.en || s.headline)}</b>`,
    ...(c?.headline?.hi && c.headline.en ? [esc(c.headline.en)] : []),
    ...points.slice(0, 4).map((p) => `• ${esc(cut(p, 160))}`),
    ...(points.length > 4 ? [`+${points.length - 4} more`] : []),
    ...(s.needs_enrich || !c ? ["", "⚠️ Not written yet: write it in the admin panel."] : []),
  ];
  const act: Button[] = inIssue
    ? [
        { text: "❌ Drop · next", callback_data: `${TRIAGE}d:${s.id}` },
        { text: "✅ Keep · next", callback_data: `${TRIAGE}k:${s.id}` },
      ]
    : [
        { text: "↩️ Put back in", callback_data: `${TRIAGE}i:${s.id}` },
        { text: "Next ➡️", callback_data: `${TRIAGE}n:${s.id}` },
      ];
  return {
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [
        act,
        [
          { text: "⬅️", callback_data: `${TRIAGE}p:${s.id}` },
          { text: `${i + 1}/${rows.length}`, callback_data: `${TRIAGE}x:` },
          { text: "➡️", callback_data: `${TRIAGE}n:${s.id}` },
        ],
        ...(c ? [[{ text: "✏️ Edit headline", callback_data: `${TRIAGE}h:${s.id}` }]] : []),
      ],
    },
  };
}

// After the last story: how the day stands.
export function summaryCard(rows: TriageStory[], date: string): Card {
  const kept = rows.filter((r) => r.status === "included").length;
  return {
    text: `✅ <b>All ${rows.length} stories seen</b>: ${kept} in the issue, ${rows.length - kept} dropped.`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⬅️ Back", callback_data: `${TRIAGE}l:${date}` },
          { text: "🔁 From the start", callback_data: `${TRIAGE}r:${date}` },
        ],
      ],
    },
  };
}

// Which story a tap shows next: its index in the day's list, or the list's
// length for the summary.
export function nextIndex(what: string, at: number, count: number): number {
  if (what === "s" || what === "r") return 0;
  if (what === "l") return Math.max(0, count - 1);
  if (what === "p") return Math.max(0, at - 1);
  if (what === "i") return Math.max(0, at);
  return at < 0 ? 0 : Math.min(count, at + 1);
}

// A new headline sent as a reply: a line in Devanagari is the Hindi one, any
// other line the English one; a language left out stays as it is. Null when
// there is nothing usable.
export function parseHeadline(text: string): Partial<Bi> | null {
  const out: Partial<Bi> = {};
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    if (line.length < 3 || line.startsWith("/")) continue;
    const lang = /[\u0900-\u097F]/.test(line) ? "hi" : "en";
    if (!out[lang]) out[lang] = line;
  }
  return out.en || out.hi ? out : null;
}
