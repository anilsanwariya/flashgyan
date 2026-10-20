// The day's checklist before the issue is scheduled: what is still left to
// read, write, review or check, each with where to go to do it. Pure: it
// counts what the daily screen (or the "draft ready" message) already has.
import { CATEGORIES } from "@/lib/current-affairs";
import { rajasthanBalance } from "@/lib/ca-report";
import type { StyleStatus } from "@/lib/ca-style";
import type { LangStatus } from "@/lib/ca-bilingual";
import { TRIAGE } from "../../supabase/functions/_shared/ca-triage.ts";
import { STYLE_TG } from "../../supabase/functions/_shared/ca-style-check.ts";

export type CheckAction =
  | { kind: "story"; id: string }
  | { kind: "write" }
  | { kind: "skipped" }
  | { kind: "corrections" }
  | { kind: "facts" }
  | { kind: "style" }
  | { kind: "lang" };

// "todo": should be done before scheduling; "note": worth a look; "done".
export type Check = {
  key: string;
  state: "done" | "todo" | "note";
  text: string;
  action?: CheckAction & { label: string };
};

type DayItem = {
  id: string;
  status: string;
  category: string;
  rajasthan: boolean;
  needs_enrich: boolean;
  enrich_error: string | null;
  position: number;
  facts: { verified: boolean }[];
  content: { statics?: unknown[]; background?: unknown } | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function dayChecklist(o: {
  items: DayItem[];
  // Stories opened in the review list (null: not known, e.g. on Telegram).
  reviewed: Set<string> | null;
  unfinishedSources: number;
  // Pending corrections to this day's stories.
  corrections: number;
  // From the skipped news list once loaded (or its last saved counts):
  // articles worth a story (not marked "not needed") and not ranked yet.
  skipped: { worth: number; unranked: number } | null;
  minRajasthan: number;
  target: number;
  // The house style check (null: no rules, or not known).
  style?: StyleStatus | null;
  // Hindi and English saying the same (null: nothing written, or not known).
  lang?: LangStatus | null;
}): Check[] {
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  // In the order the review list shows them.
  const included = o.items
    .filter((i) => i.status === "included")
    .sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.position - b.position,
    );
  const out: Check[] = [];

  if (o.unfinishedSources) {
    out.push({
      key: "sources",
      state: "todo",
      text: `${plural(o.unfinishedSources, "source")} not fully read`,
      action: { kind: "write", label: "Finish" },
    });
  }
  const unwritten = included.filter((i) => i.needs_enrich || !i.content || i.enrich_error);
  out.push(
    unwritten.length
      ? {
          key: "written",
          state: "todo",
          text: `${plural(unwritten.length, "story", "stories")} not written yet`,
          action: { kind: "write", label: "Write" },
        }
      : { key: "written", state: "done", text: "Every story is written" },
  );

  const reviewed = o.reviewed;
  const unread = reviewed ? included.filter((i) => !reviewed.has(i.id)) : [];
  if (reviewed) {
    out.push(
      unread.length
        ? {
            key: "reviewed",
            state: "todo",
            text: `${unread.length} of ${plural(included.length, "story", "stories")} not opened yet`,
            action: { kind: "story", id: unread[0].id, label: "Next" },
          }
        : {
            key: "reviewed",
            state: "done",
            text: `All ${plural(included.length, "story", "stories")} reviewed`,
          },
    );
  }

  const toCheck = included.filter((i) => i.facts.some((f) => !f.verified));
  const facts = toCheck.reduce((n, i) => n + i.facts.filter((f) => !f.verified).length, 0);
  out.push(
    toCheck.length
      ? {
          key: "facts",
          state: "todo",
          text: `${plural(facts, "fact")} to check in ${plural(toCheck.length, "story", "stories")}`,
          action: { kind: "facts", label: "Check" },
        }
      : { key: "facts", state: "done", text: "No facts left to check" },
  );

  const style = o.style;
  if (style) {
    const stories = new Set(style.open.map((b) => b.item_id)).size;
    out.push(
      !style.checked
        ? {
            key: "style",
            state: "note",
            text: "Stories not checked against your house style",
            action: { kind: "style", label: "Check" },
          }
        : style.open.length
          ? {
              key: "style",
              state: "todo",
              text: `${plural(style.open.length, "house style break")} in ${plural(stories, "story", "stories")}`,
              action: { kind: "style", label: "Show" },
            }
          : style.unchecked.length
            ? {
                key: "style",
                state: "note",
                text: `${plural(style.unchecked.length, "story", "stories")} changed or new since the house style check`,
                action: { kind: "style", label: "Check" },
              }
            : { key: "style", state: "done", text: "Stories follow your house style" },
    );
  }

  const lang = o.lang;
  if (lang) {
    const stories = new Set(lang.open.map((n) => n.item_id)).size;
    out.push(
      lang.open.length
        ? {
            key: "lang",
            state: "todo",
            text: `${plural(lang.open.length, "Hindi–English mismatch", "Hindi–English mismatches")} in ${plural(stories, "story", "stories")}`,
            action: { kind: "lang", label: "Show" },
          }
        : !lang.checked
          ? {
              key: "lang",
              state: "note",
              text: "Names not compared in Hindi and English yet",
              action: { kind: "lang", label: "Check" },
            }
          : lang.unchecked.length
            ? {
                key: "lang",
                state: "note",
                text: `${plural(lang.unchecked.length, "story", "stories")} changed since names were compared`,
                action: { kind: "lang", label: "Check" },
              }
            : { key: "lang", state: "done", text: "Hindi and English match" },
    );
  }

  if (o.corrections) {
    out.push({
      key: "corrections",
      state: "todo",
      text: `${plural(o.corrections, "correction")} waiting for a decision`,
      action: { kind: "corrections", label: "Show" },
    });
  }

  const balance = rajasthanBalance(o.items, o.minRajasthan);
  if (balance.included) {
    out.push(
      balance.short
        ? {
            key: "rajasthan",
            state: "todo",
            text: `Only ${plural(balance.rajasthan, "Rajasthan story", "Rajasthan stories")} (aim for ${balance.min})`,
            action: { kind: "skipped", label: "Find more" },
          }
        : {
            key: "rajasthan",
            state: "done",
            text: `${plural(balance.rajasthan, "Rajasthan story", "Rajasthan stories")}`,
          },
    );
  }

  const news = included.filter((i) => i.category !== "editorial").length;
  if (o.target > 0 && news < o.target) {
    out.push({
      key: "count",
      state: "note",
      text: `${news} of ${o.target} stories a day`,
      action: { kind: "skipped", label: "Find more" },
    });
  }

  if (!o.skipped) {
    out.push({
      key: "skipped",
      state: "note",
      text: "See what news the AI skipped",
      action: { kind: "skipped", label: "Open" },
    });
  } else if (o.skipped.worth) {
    out.push({
      key: "skipped",
      state: "todo",
      text: `${plural(o.skipped.worth, "skipped article")} worth a story`,
      action: { kind: "skipped", label: "Show" },
    });
  } else if (o.skipped.unranked) {
    out.push({
      key: "skipped",
      state: "note",
      text: `${plural(o.skipped.unranked, "skipped article")} not ranked yet`,
      action: { kind: "skipped", label: "Rank" },
    });
  } else {
    out.push({ key: "skipped", state: "done", text: "No skipped news worth a story" });
  }

  const bare = included.filter(
    (i) =>
      i.content &&
      i.category !== "editorial" &&
      !i.content.statics?.length &&
      !i.content.background,
  );
  if (bare.length) {
    out.push({
      key: "static",
      state: "note",
      text: `${plural(bare.length, "story", "stories")} without Static Connect`,
      action: { kind: "story", id: bare[0].id, label: "Show" },
    });
  }
  return out;
}

// The checklist in a plain-text message (the "draft ready" message on
// Telegram): what is still to do, leaving out the rows named in `skip`.
export function checklistText(checks: Check[], skip: string[] = []): string {
  const todo = checks.filter((c) => c.state === "todo" && !skip.includes(c.key));
  return todo.length
    ? `\n\nStill to do:\n${todo.map((c) => `• ${c.text}`).join("\n")}`
    : "\n\n✅ Nothing left to check.";
}

// Buttons under the "draft ready" message: links to what is left, or, when
// nothing is, approving the issue from Telegram.
export const APPROVE_DATA = "ca_ok:";
export type TgButton = { text: string; url?: string; callback_data?: string };

export function draftButtons(checks: Check[], date: string, origin?: string): TgButton[][] {
  const todo = checks.filter((c) => c.state === "todo");
  const rows: TgButton[][] = [];
  if (!todo.length)
    rows.push([{ text: "✅ Approve & schedule", callback_data: `${APPROVE_DATA}${date}` }]);
  if (origin && todo.some((c) => c.key === "lang")) {
    rows.push([
      {
        text: "🔤 Hindi–English",
        url: `${origin}/admin?section=ca.daily&date=${date}&open=lang`,
      },
    ]);
  }
  // House style notes in the bot, one at a time: apply the fix or keep it.
  if (todo.some((c) => c.key === "style")) {
    rows.push([{ text: "✍️ Fix house style", callback_data: `${STYLE_TG}s:${date}` }]);
  }
  // Story by story in the bot: keep or drop.
  rows.push([{ text: "📋 Keep or drop stories", callback_data: `${TRIAGE}s:${date}` }]);
  if (origin) {
    const page = `${origin}/admin?section=ca.daily&date=${date}`;
    if (todo.some((c) => c.key === "facts")) {
      rows.push([{ text: "🔍 Check facts", url: `${page}&open=facts` }]);
    }
    rows.push([{ text: "📝 Open review", url: page }]);
  }
  return rows;
}
