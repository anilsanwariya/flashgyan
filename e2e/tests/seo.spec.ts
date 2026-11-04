import { expect, test } from "@playwright/test";
import { DECK_ID } from "./helpers";

test("deck pages are rendered on the server for search engines", async ({ page, request }) => {
  // The raw HTML, before any JavaScript runs, already contains every question.
  const html = await (await request.get(`/decks/${DECK_ID}`)).text();
  for (let n = 1; n <= 5; n++) expect(html).toContain(`Fort question ${n}`);
  expect(html).toContain(`<link rel="canonical" href="https://www.flashgyan.com/decks/${DECK_ID}"`);

  await page.goto(`/decks/${DECK_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Rajasthan Forts" })).toBeVisible();
  await expect(page).toHaveTitle(/Rajasthan Forts/);

  // Answers stay hidden until tapped, for active recall.
  const answer = page.getByText("Fort answer 1");
  await expect(answer).toBeHidden();
  await page.getByText("Fort question 1").click();
  await expect(answer).toBeVisible();

  await page.getByRole("link", { name: "Practise this deck" }).click();
  await expect(page).toHaveURL(new RegExp(`/practice/${DECK_ID}`));
});

test("sitemap lists the main pages and every deck", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  expect(xml).toContain("<loc>https://www.flashgyan.com/</loc>");
  expect(xml).toContain("<loc>https://www.flashgyan.com/flashcards</loc>");
  expect(xml).toContain(`<loc>https://www.flashgyan.com/decks/${DECK_ID}</loc>`);
});
