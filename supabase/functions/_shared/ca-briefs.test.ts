import { briefIncluded, parseBrief, startsBrief } from "../../../src/lib/ca-briefs.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("routine news types start as briefs", () => {
  equal(startsBrief("appointment", 2, false), true);
  equal(startsBrief("agreement", 2, false), true);
  equal(startsBrief("scheme", 2, false), false);
});

Deno.test("Rajasthan news and must-know news stay full stories", () => {
  equal(startsBrief("appointment", 2, true), false);
  equal(startsBrief("appointment", 3, false), false);
  equal(startsBrief("scheme", 2, true, true), false);
});

Deno.test("the AI's own view wins over the type", () => {
  equal(startsBrief("scheme", 2, false, true), true);
  equal(startsBrief("appointment", 2, false, false), false);
});

Deno.test("briefs go in while there is room, and only likely ones", () => {
  equal(briefIncluded(2, 9, 10), true);
  equal(briefIncluded(2, 10, 10), false);
  equal(briefIncluded(1, 0, 10), false);
});

Deno.test("a brief reply is read, its MCQ kept only when complete", () => {
  const ok = parseBrief(
    '{"headline":{"en":"New CJI","hi":"नए CJI"},"line":{"en":"Surya Kant became CJI.","hi":"सूर्यकांत CJI बने।"},"mcq":{"question":{"en":"Who?","hi":"कौन?"},"options":[{"en":"A","hi":"A"},{"en":"B","hi":"B"},{"en":"C","hi":"C"},{"en":"D","hi":"D"}],"answer":1,"explanation":{"en":"B","hi":"B"}}}',
  );
  equal(ok?.line.hi, "सूर्यकांत CJI बने।");
  equal(ok?.mcq?.answer, 1);
  const noMcq = parseBrief(
    '{"headline":{"en":"x","hi":"x"},"line":{"en":"y","hi":"y"},"mcq":{"question":{"en":"Q","hi":"Q"},"options":[{"en":"A","hi":"A"}],"answer":0}}',
  );
  equal(noMcq?.mcq, null);
  equal(parseBrief("no json"), null);
});
