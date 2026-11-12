import { BY_MOMENTUM, PROBED, busyFrom, isFullTick, nextBusy } from "../../../src/lib/tick-gate.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const at = (min: number, sec = 0) => new Date(Date.UTC(2026, 10, 12, 14, min, sec));
const none = PROBED.map(() => false);

Deno.test("every fifth minute is a full tick, the minutes between are quick", () => {
  equal([0, 1, 4, 5, 9, 10, 55, 59].map((m) => isFullTick(at(m))), [true, false, false, true, false, true, true, false]);
  equal(isFullTick(at(5, 40)), true);
});

Deno.test("an idle quick tick runs nothing", () => {
  equal([...busyFrom(none, [])], []);
});

Deno.test("a question that found work runs its part", () => {
  const found = PROBED.map((p) => p === "collection" || p === "studio");
  equal([...busyFrom(found, [])].sort(), ["collection", "studio"]);
});

Deno.test("parts busy on the last tick run again; unknown names are ignored", () => {
  equal([...busyFrom(none, ["mags", "atlas", "nonsense"])].sort(), ["atlas", "mags"]);
});

Deno.test("when the last tick's list can't be read, every momentum part runs", () => {
  equal([...busyFrom(none, null)].sort(), [...BY_MOMENTUM].sort());
});

Deno.test("the list is written only when it changes", () => {
  equal(nextBusy(["mags"], new Set(["mags", "collection"])), null);
  equal(nextBusy(["mags"], new Set()), []);
  equal(nextBusy([], new Set(["atlas", "studio"])), ["atlas"]);
  equal(nextBusy(null, new Set()), []);
});
