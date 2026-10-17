import { checkQuestionInput, pickCheckPhoto, validCheckAnswer } from "./telegram-check-input.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("Mains question accepts marks and Hindi text", () => {
  equal(checkQuestionInput("10 राजस्थान में जल संरक्षण की विधियाँ बताइए।"), {
    marks: 10, question: "राजस्थान में जल संरक्षण की विधियाँ बताइए।",
  });
  equal(checkQuestionInput("Explain rainwater harvesting."), { marks: null, question: "Explain rainwater harvesting." });
  equal(checkQuestionInput("ok"), null);
  equal(checkQuestionInput("0 Explain rainwater harvesting."), null);
});

Deno.test("students can submit a text answer or photos", () => {
  equal(validCheckAnswer("Rainwater harvesting collects rainfall from rooftops and stores it for drinking irrigation and groundwater recharge.", 0), true);
  equal(validCheckAnswer("ok", 0), false);
  equal(validCheckAnswer("", 1), true);
  equal(validCheckAnswer("", 4), false);
});

Deno.test("photos accept Telegram photos and image documents, not unrelated files", () => {
  equal(pickCheckPhoto({ photo: [{ file_id: "small", file_size: 100 }, { file_id: "large", file_size: 4000 }] }), { file_id: "large", mime: "image/jpeg" });
  equal(pickCheckPhoto({ document: { file_id: "page", mime_type: "image/png", file_size: 500 } }), { file_id: "page", mime: "image/png" });
  equal(pickCheckPhoto({ document: { file_id: "pdf", mime_type: "application/pdf" } }), null);
  equal(pickCheckPhoto({ photo: [{ file_id: "oversized", file_size: 5_000_000 }] }), null);
});