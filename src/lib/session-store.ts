export type Rating = "hard" | "medium" | "easy";

export type McqCardData = {
  options: [string, string, string, string];
  answerIndex: 1 | 2 | 3 | 4;
  pickedIndex: 1 | 2 | 3 | 4;
  explanationSections: Array<{ title: string; body: string }>;
  imageUrl?: string | null;
  question_ext?: string | null;
};

export type SessionCardResult = {
  id: string;
  subject: string;
  topic: string;
  prompt: string;
  question: string;
  answer: string;
  rating: Rating;
  mcq?: McqCardData;
};

export type SessionDetail = {
  deckId: string;
  subject: string;
  topic: string;
  startedAt: number;
  endedAt: number;
  results: SessionCardResult[];
};

const KEY_PREFIX = "flashly:session:";

export function saveSession(id: string, detail: SessionDetail) {
  try {
    sessionStorage.setItem(KEY_PREFIX + id, JSON.stringify(detail));
  } catch {
    // ignore
  }
}

export function loadSession(id: string): SessionDetail | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + id);
    return raw ? (JSON.parse(raw) as SessionDetail) : null;
  } catch {
    return null;
  }
}

export function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- Spaced-repetition review queue ----------
// Per-deck map of cardId -> last rating. Cards marked "easy" graduate
// out of the review queue. Hard cards surface before medium on the
// next "Practice again".

const REVIEW_PREFIX = "flashly:review:";

export type ReviewState = Record<string, Rating>;

export function loadReview(deckId: string): ReviewState {
  try {
    const raw = sessionStorage.getItem(REVIEW_PREFIX + deckId);
    return raw ? (JSON.parse(raw) as ReviewState) : {};
  } catch {
    return {};
  }
}

export function saveReview(deckId: string, state: ReviewState) {
  try {
    sessionStorage.setItem(REVIEW_PREFIX + deckId, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearReview(deckId: string) {
  try {
    sessionStorage.removeItem(REVIEW_PREFIX + deckId);
  } catch {
    // ignore
  }
}

const RATING_PRIORITY: Record<Rating, number> = { hard: 0, medium: 1, easy: 2 };

/** Order cards hard → medium → (unrated) and drop easy cards. */
export function applyReviewOrder<T extends { id: string }>(
  cards: T[],
  state: ReviewState,
): T[] {
  const filtered = cards.filter((c) => state[c.id] !== "easy");
  return filtered.sort((a, b) => {
    const ra = state[a.id];
    const rb = state[b.id];
    const pa = ra ? RATING_PRIORITY[ra] : 1.5; // unrated between medium and easy
    const pb = rb ? RATING_PRIORITY[rb] : 1.5;
    return pa - pb;
  });
}
