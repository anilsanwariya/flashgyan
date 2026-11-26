import { lessonsMessage, parseLessons } from "../../../src/lib/ca-team.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("an empty notebook adds no message to the prompt", () => {
  equal(lessonsMessage([]), []);
  equal(lessonsMessage(["  "]), []);
});

Deno.test("lessons go in one system message after the fixed instructions", () => {
  const m = lessonsMessage(["Don't flag accepted spellings"]);
  equal(m.length, 1);
  equal(m[0].role, "system");
  equal(m[0].content.endsWith("- Don't flag accepted spellings"), true);
});

Deno.test("suggested lessons: new, cleaned and at most five", () => {
  const raw =
    '```json\n{"lessons": ["Don\'t flag accepted spellings", "  New   lesson about names  ", "x", 3, "a", "b6 long enough", "c7 long enough", "d8 long enough", "e9 long enough"]}\n```';
  equal(parseLessons(raw, ["don't flag accepted spellings"]), [
    "New lesson about names",
    "b6 long enough",
    "c7 long enough",
    "d8 long enough",
    "e9 long enough",
  ]);
  equal(parseLessons("not json", []), []);
});
