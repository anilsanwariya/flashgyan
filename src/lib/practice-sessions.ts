// The north-star number: practice sessions finished each day. Shared by the
// student pages (which report a finished session) and the admin page.
import { trackEvent } from "@/lib/analytics";

export const SESSION_KINDS = ["flashcards", "mcq_practice", "mcq_test"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
export type SessionDay = { day: string } & Record<SessionKind, number>;

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  flashcards: "Flashcards",
  mcq_practice: "MCQ practice",
  mcq_test: "MCQ tests",
};

// Reports a finished session once per browser tab, so reloading the summary
// or result page doesn't count it again. Never fails the student's page.
export function countSessionOnce(kind: SessionKind, sessionKey: string) {
  if (typeof window === "undefined" || !sessionKey) return;
  const key = `fg-session-counted:${sessionKey}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without storage, count anyway: a reload may count twice.
  }
  trackEvent("practice_session_complete", { kind });
  void import("@/lib/practice-sessions.functions")
    .then(({ recordPracticeSession }) => recordPracticeSession({ data: { kind } }))
    .catch(() => {
      // Not counted.
    });
}
