import { expect, test } from "@playwright/test";
import { DECK_ID, TEST_ID, continuePastDownloadPopup, rateAllCards } from "./helpers";

test("a flashcard session ends on its summary", async ({ page }) => {
  await page.goto("/flashcards");
  await page.getByRole("link", { name: /Rajasthan Forts/ }).click();
  await expect(page).toHaveURL(new RegExp(`/practice/${DECK_ID}`));

  await rateAllCards(page, 5);
  await continuePastDownloadPopup(page, "Skip to Summary");

  await expect(page).toHaveURL(/\/summary/);
  await expect(page.getByRole("button", { name: "Share my progress" })).toBeVisible();
});

test("a timed MCQ test is scored with negative marking", async ({ page }) => {
  await page.goto("/mcq-tests");
  await page.getByRole("link", { name: /Polity Test 1/ }).click();
  await expect(page).toHaveURL(new RegExp(`/mcq/${TEST_ID}`));

  // Option B is correct for questions 1 and 2; question 3 gets a wrong answer.
  for (const [n, option] of [
    [1, "B"],
    [2, "B"],
    [3, "D"],
  ] as const) {
    await expect(page.getByText(`Polity question ${n}`)).toBeVisible();
    await page.getByRole("button", { name: `${option} Option ${option}${n}`, exact: true }).click();
  }

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm Submission" }).click();
  await continuePastDownloadPopup(page, "Skip to Summary");

  await expect(page).toHaveURL(new RegExp(`/mcq-result/${TEST_ID}`));
  // 2 right (+2), 1 wrong (−1/3) = 1.67 out of 3.
  await expect(page.getByText("1.67")).toBeVisible();
  await expect(page.getByText("out of 3 points")).toBeVisible();
});
