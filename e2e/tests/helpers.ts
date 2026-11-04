import { expect, type Page } from "@playwright/test";

// Sample data ids from mock-supabase.mjs.
export const DECK_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_ID = "33333333-3333-4333-8333-333333333333";

// The app download popup appears at most once a day; close it if it is showing.
export async function continuePastDownloadPopup(page: Page, continueLabel: string | RegExp) {
  const dialog = page.getByRole("alertdialog");
  if (await dialog.isVisible().catch(() => false)) {
    await expect(dialog.getByRole("button", { name: "Download Official App" })).toBeVisible();
    await dialog.getByRole("button", { name: continueLabel }).click();
  }
}

// Reveal and rate every card in a flashcard session (or the homepage demo).
export async function rateAllCards(page: Page, count: number, rating = "Easy") {
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name: "Reveal Answer" }).click();
    await page.getByRole("button", { name: rating, exact: true }).click();
    // Each rating animates to the next card.
    await page.waitForTimeout(600);
  }
}

// How many finished sessions of this kind the site has recorded in the mock database.
export async function sessionsCounted(kind: "flashcards" | "mcq_practice" | "mcq_test") {
  const res = await fetch("http://127.0.0.1:54321/__rpc");
  const calls = (await res.json()) as { name: string; args: { p_kind?: string } }[];
  return calls.filter((c) => c.name === "practice_session_count" && c.args.p_kind === kind).length;
}

// Checks a page counted one finished session, and that reloading it doesn't count again.
export async function expectCountedOnce(
  page: Page,
  kind: "flashcards" | "mcq_practice" | "mcq_test",
  before: number,
) {
  await expect.poll(() => sessionsCounted(kind)).toBe(before + 1);
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await sessionsCounted(kind)).toBe(before + 1);
}
