import { dayDesigns, dayDesignValue, designFor } from "../../../src/lib/ig-cards.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("a day made before keeps its one design for both languages", () => {
  equal(dayDesigns("paper"), { en: "paper", hi: "paper" });
  equal(dayDesigns(null), { en: "paper", hi: "paper" });
});

Deno.test("English|Hindi gives each language its own design", () => {
  equal(dayDesigns("paper|akhbar"), { en: "paper", hi: "akhbar" });
  equal(designFor("paper|akhbar", "hi"), "akhbar");
  equal(designFor("paper|akhbar", "en"), "paper");
});

Deno.test("an unknown design falls back, Hindi to the English one", () => {
  equal(dayDesigns("paper|nonsense"), { en: "paper", hi: "paper" });
  equal(dayDesigns("nonsense|akhbar"), { en: "paper", hi: "akhbar" });
});

Deno.test("the same design is stored as one, different ones as English|Hindi", () => {
  equal(dayDesignValue({ en: "akhbar", hi: "akhbar" }), "akhbar");
  equal(dayDesignValue({ en: "paper", hi: "akhbar" }), "paper|akhbar");
  equal(dayDesigns(dayDesignValue({ en: "paper", hi: "akhbar" })), { en: "paper", hi: "akhbar" });
});
