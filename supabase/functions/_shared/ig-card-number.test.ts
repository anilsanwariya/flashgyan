import { IG_SAMPLES, igCardHtml, langNumber } from "../../../src/lib/ig-cards.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function has(text: string, part: string) {
  if (!text.includes(part)) throw new Error(`Expected to find ${JSON.stringify(part)}`);
}
function hasNot(text: string, part: string) {
  if (text.includes(part)) throw new Error(`Expected not to find ${JSON.stringify(part)}`);
}

// A day of 3 English and 2 Hindi cards, in album order.
const day = [
  { id: "a", lang: "en" as const },
  { id: "b", lang: "en" as const },
  { id: "c", lang: "en" as const },
  { id: "d", lang: "hi" as const },
  { id: "e", lang: "hi" as const },
];

Deno.test("each language counts its own cards", () => {
  equal(day.map((c) => langNumber(day, c)), [
    { n: 1, total: 3 },
    { n: 2, total: 3 },
    { n: 3, total: 3 },
    { n: 1, total: 2 },
    { n: 2, total: 2 },
  ]);
});

Deno.test("a day of one language counts as before", () => {
  const hi = day.filter((c) => c.lang === "hi");
  equal(hi.map((c) => langNumber(hi, c)), [{ n: 1, total: 2 }, { n: 2, total: 2 }]);
});

Deno.test("the Hindi card shows शब्द 1 / 2 on the newspaper design", () => {
  const html = igCardHtml(IG_SAMPLES.hi, {
    design: "akhbar",
    ...langNumber(day, day[3]),
    date: "2026-11-13",
    channel: "",
    assetBase: "",
    watermark: 0,
  });
  has(html, "शब्द 1 / 2");
  hasNot(html, "शब्द 4 / 5");
});

Deno.test("the English card shows Word 3 of 3, and other designs the short count", () => {
  const opts = { date: "2026-11-13", channel: "", assetBase: "", watermark: 0, ...langNumber(day, day[2]) };
  has(igCardHtml(IG_SAMPLES.en, { ...opts, design: "akhbar" }), "Word 3 of 3");
  has(igCardHtml(IG_SAMPLES.en, { ...opts, design: "paper" }), "3/3");
});
