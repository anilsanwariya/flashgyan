export type Rating = "hard" | "medium" | "easy";

export type SessionCardResult = {
  id: string;
  subject: string;
  topic: string;
  front_question: string;
  back_answer: string;
  rating: Rating;
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
