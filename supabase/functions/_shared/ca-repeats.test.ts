import { findRepeats } from "../../../src/lib/ca-repeats.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const b = (en: string, hi: string) => ({ en, hi });

Deno.test("a figure in the summary and a point is a repeat", () => {
  const r = findRepeats(
    {
      summary: b(
        "Work in 4,500 villages at ₹2,500 crore.",
        "4,500 गाँवों में ₹2,500 करोड़ की लागत से काम।",
      ),
      points: [
        b("Villages: 4,500", "गाँव: 4,500"),
        b("Outlay: ₹2,500 crore", "व्यय: ₹2,500 करोड़"),
      ],
    },
    "hi",
  );
  equal(
    r.map((x) => [x.value, x.parts.map((p) => p.kind)]),
    [
      ["4,500", ["summary", "point"]],
      ["₹2,500 करोड़", ["summary", "point"]],
    ],
  );
});

Deno.test("figures are matched however they're written", () => {
  const r = findRepeats(
    { summary: b("It grew 7.0 per cent.", ""), points: [b("Growth: 7.0%", "")] },
    "en",
  );
  equal(r.length, 1);
});

Deno.test("small counts and bare years don't count", () => {
  const r = findRepeats(
    {
      summary: b("Three phases since 2016; 3 stages.", ""),
      points: [b("Phase 3 in 2016", ""), b("3 stages", "")],
    },
    "en",
  );
  equal(r, []);
});

Deno.test("a point the visual shows isn't printed, so it isn't a repeat", () => {
  const r = findRepeats(
    {
      summary: b("", ""),
      points: [b("Outlay: ₹2,500 crore", "")],
      visual: {
        type: "glance",
        title: b("", ""),
        rows: [{ label: b("Outlay", ""), value: b("₹2,500 crore", "") }],
      },
      visual_covers: [0],
    },
    "en",
  );
  equal(r, []);
});

Deno.test("the summary's sentence said again in Static Context", () => {
  const r = findRepeats(
    {
      summary: b(
        "The Monetary Policy Committee fixes the repo rate to keep inflation near four per cent.",
        "",
      ),
      statics: [
        {
          text: b(
            "The Monetary Policy Committee fixes the repo rate to keep inflation near four per cent target.",
            "",
          ),
        },
      ],
    },
    "en",
  );
  equal(
    r.map((x) => x.what),
    ["sentence"],
  );
});

Deno.test("a hidden summary isn't looked at", () => {
  const r = findRepeats(
    {
      summary: b("Outlay ₹2,500 crore.", ""),
      hide_summary: true,
      points: [b("Outlay: ₹2,500 crore", "")],
    },
    "en",
  );
  equal(r, []);
});
