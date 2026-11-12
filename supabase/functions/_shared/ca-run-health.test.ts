import { nextRunHealth, runHealthState } from "../../../src/lib/ca-run-health.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const t = (min: number) => new Date(Date.UTC(2026, 10, 12, 14, 0) + min * 60_000);

// Ticks every 5 minutes with the same fingerprint, starting at minute 0.
function ticks(n: number, sig = "same") {
  let h = nextRunHealth(null, sig, t(0));
  for (let i = 1; i <= n; i++) h = nextRunHealth(h, sig, t(i * 5));
  return h;
}

Deno.test("six 5-minute ticks with no progress (30 minutes) flag the collection as stuck", () => {
  equal(runHealthState(ticks(6), t(30).toISOString(), t(30)), { state: "stalled", minutes: 30, ticks: 6 });
});

Deno.test("five ticks with no progress (25 minutes, e.g. a PDF still parsing) are not yet stuck", () => {
  equal(runHealthState(ticks(5), t(25).toISOString(), t(25)), { state: "ok" });
});

Deno.test("six fast ticks from the admin page inside 30 minutes are not stuck", () => {
  let h = nextRunHealth(null, "same", t(0));
  for (let i = 1; i <= 6; i++) h = nextRunHealth(h, "same", t(i));
  equal(runHealthState(h, t(6).toISOString(), t(6)), { state: "ok" });
});

Deno.test("any progress resets the count", () => {
  const h = nextRunHealth(ticks(6), "moved", t(35));
  equal([h.ticks, h.alerted], [0, false]);
  equal(runHealthState(h, t(35).toISOString(), t(35)), { state: "ok" });
});

Deno.test("no tick taking the collection for 30 minutes is flagged", () => {
  equal(runHealthState(null, t(0).toISOString(), t(30)), { state: "no_ticks", minutes: 30 });
  equal(runHealthState(nextRunHealth(null, "x", t(0)), t(0).toISOString(), t(29)), { state: "ok" });
});
