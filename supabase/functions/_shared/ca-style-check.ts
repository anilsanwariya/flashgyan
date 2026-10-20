// The house style check's shared parts, used by the website and the bot: a
// story's parts, whether a story or the rules changed since the check, the
// notes still open, what a fix or "It's fine" does to the saved check (and
// to each rule's tally for the weekly report), and the note's Telegram card.

type Bi = { en: string; hi: string };
// The written story, as far as the check reads it.
export type StyleContent = { headline: Bi; summary: Bi; points: Bi[]; why: Bi | null };

// One part of a story in one language: "headline", "summary", "point 2" or
// "why", as the editor sees it.
export type StylePart = { part: string; lang: "en" | "hi"; text: string };

// Where the AI saw a rule broken, and the text it suggests instead. `text` is
// the part as it was checked; once the story changes there, the note is gone.
export type StyleBreak = StylePart & { id: string; item_id: string; rule: string; fix: string };

// Per rule: notes found, fixed with SAATHI's text, and kept ("It's fine").
export type StyleTally = Record<string, { found: number; fixed: number; kept: number }>;

export type StyleCheck = {
  at: string;
  // The rules checked against, and each story's text when it was checked.
  rules: string;
  stories: Record<string, string>;
  breaks: StyleBreak[];
  // Notes the editor waved through ("It's fine").
  dismissed: string[];
  // Missing on checks saved before the weekly scorecard.
  tally?: StyleTally;
};

export function storyParts(c: StyleContent): StylePart[] {
  const out: StylePart[] = [];
  const add = (part: string, b: Bi | null | undefined) => {
    for (const lang of ["en", "hi"] as const) {
      const text = b?.[lang]?.trim() ?? "";
      if (text) out.push({ part, lang, text });
    }
  };
  add("headline", c.headline);
  add("summary", c.summary);
  (c.points ?? []).forEach((p, i) => add(`point ${i + 1}`, p));
  add("why", c.why);
  return out;
}

const pointNo = (part: string) => Number(/^point (\d+)$/.exec(part)?.[1] ?? 0);

export function partText(c: StyleContent | null, part: string, lang: "en" | "hi"): string {
  if (!c) return "";
  const n = pointNo(part);
  const b =
    part === "headline"
      ? c.headline
      : part === "summary"
        ? c.summary
        : part === "why"
          ? c.why
          : n
            ? c.points?.[n - 1]
            : null;
  return b?.[lang]?.trim() ?? "";
}

export function withPart<C extends StyleContent>(
  c: C,
  part: string,
  lang: "en" | "hi",
  text: string,
): C {
  const set = (b: Bi | null | undefined): Bi => ({ en: "", hi: "", ...b, [lang]: text });
  const n = pointNo(part);
  if (n) return { ...c, points: c.points.map((x, j) => (j === n - 1 ? set(x) : x)) };
  if (part === "headline" || part === "summary" || part === "why") {
    return { ...c, [part]: set(c[part]) };
  }
  return c;
}

// The editor's names for the parts, and short codes for Telegram buttons.
export function partName(part: string): string {
  const n = pointNo(part);
  return n ? `Point ${n}` : part === "why" ? "Exam Angle" : part[0].toUpperCase() + part.slice(1);
}
export const partCode = (part: string) =>
  pointNo(part) ? `p${pointNo(part)}` : ({ headline: "h", summary: "s", why: "w" }[part] ?? "h");
export function partFromCode(code: string | undefined): string | null {
  if (!code || code === "h") return "headline";
  if (code === "s") return "summary";
  if (code === "w") return "why";
  const n = /^p(\d{1,2})$/.exec(code)?.[1];
  return n && Number(n) > 0 ? `point ${Number(n)}` : null;
}
// The order parts are read in: headline, summary, points, why; English first.
const partRank = (b: StylePart) =>
  (b.part === "headline"
    ? 0
    : b.part === "summary"
      ? 1
      : b.part === "why"
        ? 99
        : 1 + pointNo(b.part)) *
    2 +
  (b.lang === "en" ? 0 : 1);

// A short hash (FNV-1a), the same everywhere: whether a story's text or the
// rules changed since the check.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
// Rules compared without case or punctuation.
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
export const ruleKey = norm;
export const storyFingerprint = (c: StyleContent) => hash(JSON.stringify(storyParts(c)));
export const rulesFingerprint = (rules: string[]) => hash(JSON.stringify(rules.map(norm)));
export const breakId = (item_id: string, p: StylePart, rule: string) =>
  hash(JSON.stringify([item_id, p.part, p.lang, p.text, rule]));

// How the day stands: whether it was checked against these rules, the notes
// still in the text (not waved through), and the written stories not checked
// as they are now. Null when there are no rules or nothing written to check.
export type StyleStatus = { checked: boolean; open: StyleBreak[]; unchecked: string[] };

export function styleStatus(
  check: StyleCheck | null,
  items: { id: string; status: string; content: StyleContent | null }[],
  rules: string[],
): StyleStatus | null {
  const written = items.filter((i) => i.status === "included" && i.content);
  if (!rules.length || !written.length) return null;
  if (!check || check.rules !== rulesFingerprint(rules)) {
    return { checked: false, open: [], unchecked: written.map((i) => i.id) };
  }
  const byId = new Map(written.map((i) => [i.id, i.content]));
  const dismissed = new Set(check.dismissed);
  return {
    checked: true,
    open: check.breaks.filter(
      (b) =>
        !dismissed.has(b.id) &&
        byId.has(b.item_id) &&
        partText(byId.get(b.item_id)!, b.part, b.lang) === b.text,
    ),
    unchecked: written
      .filter((i) => check.stories[i.id] !== storyFingerprint(i.content!))
      .map((i) => i.id),
  };
}

// Notes in the order the stories are reviewed (`order`: story ids), then by
// part.
export function orderBreaks(breaks: StyleBreak[], order: string[]): StyleBreak[] {
  const at = new Map(order.map((id, i) => [id, i]));
  return [...breaks].sort(
    (a, b) => (at.get(a.item_id) ?? 1e6) - (at.get(b.item_id) ?? 1e6) || partRank(a) - partRank(b),
  );
}

const bump = (
  tally: StyleTally | undefined,
  rule: string,
  k: "found" | "fixed" | "kept",
  n = 1,
) => {
  const t = { ...(tally ?? {}) };
  const r = t[rule] ?? { found: 0, fixed: 0, kept: 0 };
  t[rule] = { ...r, [k]: r[k] + n };
  return t;
};

// A check's notes counted per rule: only notes not found before (a story
// checked again finds its old notes again).
export function tallyFound(saved: StyleCheck | null, found: StyleBreak[]): StyleTally {
  const known = new Set([...(saved?.breaks ?? []).map((b) => b.id), ...(saved?.dismissed ?? [])]);
  let tally = { ...(saved?.tally ?? {}) };
  for (const b of found) if (!known.has(b.id)) tally = bump(tally, b.rule, "found");
  return tally;
}

// The saved check after SAATHI's fix went in: the note (and any other note
// on the same text) goes. The story stays checked, since only the fix changed
// it, unless another open note was on that text: the new text needs a look.
export function afterFix(
  check: StyleCheck,
  b: StyleBreak,
  before: StyleContent,
  after: StyleContent,
): StyleCheck {
  const dismissed = new Set(check.dismissed);
  const sameText = check.breaks.filter(
    (x) => x.item_id === b.item_id && x.part === b.part && x.lang === b.lang,
  );
  const stories = { ...check.stories };
  if (check.stories[b.item_id] === storyFingerprint(before)) {
    if (sameText.some((x) => x.id !== b.id && !dismissed.has(x.id))) delete stories[b.item_id];
    else stories[b.item_id] = storyFingerprint(after);
  }
  return {
    ...check,
    stories,
    breaks: check.breaks.filter((x) => !sameText.includes(x)),
    tally: bump(check.tally, b.rule, "fixed"),
  };
}

// "It's fine": the note stays out of the list, and out of later checks that
// find the same thing in the same text.
export function afterKeep(check: StyleCheck, b: StyleBreak): StyleCheck {
  if (check.dismissed.includes(b.id)) return check;
  return {
    ...check,
    dismissed: [...check.dismissed, b.id].slice(-200),
    tally: bump(check.tally, b.rule, "kept"),
  };
}

// ---------- On Telegram: one note at a time ----------

// Button data: "cst:<what>:<date>:<note id>". s start (a new message), a apply
// the fix, k keep the text, n next, p previous, x nothing (the "2/5" label).
export const STYLE_TG = "cst:";
type Button = { text: string; callback_data: string };
type Card = { text: string; reply_markup: { inline_keyboard: Button[][] } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function styleCard(
  open: StyleBreak[],
  i: number,
  date: string,
  headlines: Map<string, string>,
): Card {
  const b = open[i];
  const at = `${date}:${b.id}`;
  return {
    text: [
      `✍️ <b>House style · ${i + 1} of ${open.length}</b> · ${date}`,
      `<b>${esc(headlines.get(b.item_id) ?? "")}</b>`,
      `${partName(b.part)} · ${b.lang === "en" ? "English" : "Hindi"}`,
      `📏 ${esc(b.rule)}`,
      "",
      `<s>${esc(b.text)}</s>`,
      `➜ <b>${esc(b.fix)}</b>`,
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Apply fix", callback_data: `${STYLE_TG}a:${at}` },
          { text: "👍 It's fine", callback_data: `${STYLE_TG}k:${at}` },
        ],
        // The editor's own wording instead (the story edit in the bot).
        [{ text: "✏️ Write my own", callback_data: `cas:h:${b.item_id}:${partCode(b.part)}` }],
        [
          { text: "⬅️", callback_data: `${STYLE_TG}p:${at}` },
          { text: `${i + 1}/${open.length}`, callback_data: `${STYLE_TG}x:` },
          { text: "➡️", callback_data: `${STYLE_TG}n:${at}` },
        ],
      ],
    },
  };
}

// Nothing open: approving is the next step (the website checks the rest).
export function styleDoneCard(date: string, handled: boolean): Card {
  return {
    text: handled
      ? `✅ <b>No house style notes left</b> for ${date}.`
      : `✅ No open house style notes for ${date}.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Approve & schedule", callback_data: `ca_ok:${date}` }],
        [{ text: "📋 Keep or drop stories", callback_data: `cas:s:${date}` }],
      ],
    },
  };
}
