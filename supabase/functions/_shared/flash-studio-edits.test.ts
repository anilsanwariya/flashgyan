import { diffWords, fixFits, mergeFilled } from "../../../src/lib/flash-studio.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const card = { front: "अग्नि", back: "आग", ex: { c1: "", c2: "तत्सम" } };

Deno.test("an AI fix applies only while its field reads as the AI saw it", () => {
  equal(fixFits(card, { field: "back", from: "आग" }), true);
  equal(fixFits(card, { field: "back", from: " आग " }), true);
  equal(fixFits({ ...card, back: "अनल" }, { field: "back", from: "आग" }), false);
  equal(fixFits(card, { field: "ex:c2", from: "तत्सम" }), true);
  equal(fixFits(card, { field: "ex:c1", from: "" }), true);
});

Deno.test("the AI's filled columns go onto the card as it is now", () => {
  const was = { ex: { a: "", b: "", c: "x" }, own: [] as string[] };
  const filled = { ex: { a: "AI a", b: "AI b", c: "x" }, own: ["b"] };
  // Meanwhile the editor wrote column b and changed column c.
  const now = { ex: { a: "", b: "editor b", c: "y" }, own: ["z"] };
  equal(mergeFilled(was, filled, now), { ex: { a: "AI a", b: "editor b", c: "y" }, own: ["z"] });
});

Deno.test("nothing new to write gives null", () => {
  const was = { ex: { a: "" }, own: [] as string[] };
  equal(mergeFilled(was, { ex: { a: "AI" }, own: [] }, { ex: { a: "editor" }, own: [] }), null);
  equal(mergeFilled(was, { ex: { a: "" }, own: [] }, was), null);
});

Deno.test("a column filled from the AI's own knowledge is marked so", () => {
  const was = { ex: { a: "" }, own: [] as string[] };
  equal(mergeFilled(was, { ex: { a: "AI" }, own: ["a"] }, was), { ex: { a: "AI" }, own: ["a"] });
});

Deno.test("an AI fix marks only the words it changes", () => {
  const d = diffWords("शशि, इंदु, सुधांसु, सोम", "शशि, इंदु, सुधांशु, सोम");
  equal(
    d.from.filter((p) => p.changed).map((p) => p.text),
    ["सुधांसु"],
  );
  equal(
    d.to.filter((p) => p.changed).map((p) => p.text),
    ["सुधांशु"],
  );
  equal(d.to.map((p) => p.text).join(""), "शशि, इंदु, सुधांशु, सोम");
});

Deno.test("words added or taken out are marked on their side only", () => {
  const d = diffWords("रिपु, अरि, बैरी, विपक्षी", "रिपु, अरि, बैरी");
  equal(
    d.to.some((p) => p.changed),
    false,
  );
  equal(
    d.from
      .filter((p) => p.changed)
      .map((p) => p.text.trim())
      .join(""),
    ", विपक्षी",
  );
  equal(diffWords("", "नया").to, [{ text: "नया", changed: true }]);
});
