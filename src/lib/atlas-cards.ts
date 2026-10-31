// Revising the atlas's flashcards on a schedule (boxes: a card known well
// moves up a box and comes back later; one forgotten starts again). The
// schedule is kept on the student's device. Pure.

// Days until a card in each box comes back.
export const BOX_DAYS = [0, 1, 3, 7, 16, 35] as const;
export const NEW_PER_DAY = 20;
export type Rating = "again" | "hard" | "good" | "easy";
export type CardState = { box: number; due: string }; // due: "YYYY-MM-DD"
export type Schedule = {
  cards: Record<string, CardState>;
  // New cards started today (at most NEW_PER_DAY a day).
  day: string;
  fresh: number;
};

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) =>
  dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

// The card's next box and day after the student's rating.
export function rateCard(s: CardState | undefined, r: Rating, today: string): CardState {
  const box = s?.box ?? 0;
  if (r === "again") return { box: 1, due: today };
  const next =
    r === "hard" ? Math.max(1, box) : r === "good" ? Math.min(5, box + 1) : Math.min(5, box + 2);
  const days = r === "hard" ? Math.max(1, Math.ceil(BOX_DAYS[next] / 2)) : BOX_DAYS[next];
  return { box: next, due: addDays(today, days) };
}

// When the card would come back for each rating (for the buttons).
export const ratingDays = (s: CardState | undefined, today: string) =>
  Object.fromEntries(
    (["again", "hard", "good", "easy"] as const).map((r) => {
      const n = rateCard(s, r, today);
      return [r, Math.round((Date.parse(n.due) - Date.parse(today)) / 86_400_000)];
    }),
  ) as Record<Rating, number>;

// Today's cards: those due (oldest first), then new ones up to the day's
// limit, in the notes' order.
export function todaysCards<T extends { key: string }>(
  all: T[],
  sch: Schedule,
  today: string,
): { due: T[]; fresh: T[] } {
  const due = all
    .filter((c) => sch.cards[c.key] && sch.cards[c.key].due <= today)
    .sort((a, b) => sch.cards[a.key].due.localeCompare(sch.cards[b.key].due));
  const left = Math.max(0, NEW_PER_DAY - (sch.day === today ? sch.fresh : 0));
  const fresh = all.filter((c) => !sch.cards[c.key]).slice(0, left);
  return { due, fresh };
}

// The schedule after a rating (a new card counts toward today's limit).
export function afterRating(sch: Schedule, key: string, r: Rating, today: string): Schedule {
  const isNew = !sch.cards[key];
  const fresh = (sch.day === today ? sch.fresh : 0) + (isNew ? 1 : 0);
  return {
    cards: { ...sch.cards, [key]: rateCard(sch.cards[key], r, today) },
    day: today,
    fresh,
  };
}
