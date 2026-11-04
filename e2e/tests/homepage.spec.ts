import { expect, test } from "@playwright/test";
import { rateAllCards } from "./helpers";

test("homepage shows the pitch and a tagged Play Store link", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/FlashGyan/i);
  await expect(page.locator("h1")).toBeVisible();

  const play = page.getByRole("link", { name: "Get it on Google Play" });
  await expect(play).toHaveAttribute("href", /id=com\.flashgyan/);
  await expect(play).toHaveAttribute("href", /utm_medium%3Dhome_badge/);
});

test("homepage shows the right install prompt for the device", async ({ page }, testInfo) => {
  await page.goto("/");
  const installBar = page.getByRole("region", { name: "Get the FlashGyan app" });
  const qr = page.getByAltText("QR code for FlashGyan on Google Play");
  if (testInfo.project.name === "android-phone") {
    await expect(installBar).toBeVisible();
    await expect(qr).toHaveCount(0);
  } else {
    await expect(qr).toBeVisible();
    await expect(installBar).toHaveCount(0);
  }
});

test("5-card demo can be finished and offers the app once", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reveal Answer" }).scrollIntoViewIfNeeded();
  await rateAllCards(page, 5);

  const popup = page.getByRole("alertdialog");
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("button", { name: "Download Official App" })).toBeVisible();
  await popup.getByRole("button", { name: "Study 5 More Cards" }).click();
  await expect(popup).toBeHidden();

  // A second round the same day finishes without the popup.
  await rateAllCards(page, 5);
  await expect(page.getByText("Demo complete")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toBeHidden();
});
