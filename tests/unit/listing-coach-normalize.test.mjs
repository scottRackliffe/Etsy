import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanJsonResponse,
  normalizeTags,
  normalizePrice,
  normalizePhotoReview,
  normalizeConditionCode,
  normalizeConfirmCards,
} from "../../src/lib/listing-coach-normalize.mjs";

test("cleanJsonResponse strips fenced JSON", () => {
  assert.equal(
    cleanJsonResponse('```json\n{"ok":true}\n```'),
    '{"ok":true}'
  );
});

test("normalizeTags dedupes, trims, and caps at 13", () => {
  const tags = normalizeTags([
    " Vintage ",
    "vintage",
    "Antique",
    "Glass",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
  ]);
  assert.equal(tags.split(", ").length, 13);
  assert.match(tags, /Vintage/);
  assert.doesNotMatch(tags, /,\s*vintage/i);
});

test("normalizeTags accepts comma-separated string", () => {
  assert.equal(normalizeTags("foo, bar , baz"), "foo, bar, baz");
});

test("normalizeTags throws on empty result", () => {
  assert.throws(() => normalizeTags([]), /empty listing tags/);
});

test("normalizePrice maps confidence enum", () => {
  assert.deepEqual(normalizePrice({ confidence: "HIGH", suggested_list_price: 45 }).confidence, "high");
  assert.deepEqual(normalizePrice({ confidence: "medium" }).confidence, "medium");
  assert.deepEqual(normalizePrice({ confidence: "unknown" }).confidence, "low");
  assert.deepEqual(normalizePrice({ confidence: "bogus" }).confidence, "low");
});

test("normalizePrice ignores non-positive numbers", () => {
  const price = normalizePrice({
    suggested_list_price: 0,
    suggested_price_low: -5,
    suggested_price_high: "nope",
  });
  assert.equal(price.suggested_list_price, null);
  assert.equal(price.suggested_price_low, null);
  assert.equal(price.suggested_price_high, null);
});

test("normalizePhotoReview filters shot types", () => {
  const review = normalizePhotoReview({
    present_shots: ["hero", "invalid"],
    missing_shots: ["detail", "not-a-shot"],
    advisories: ["Busy background"],
  });
  assert.deepEqual(review.present_shots, ["hero"]);
  assert.deepEqual(review.missing_shots, ["detail"]);
  assert.deepEqual(review.advisories, ["Busy background"]);
});

test("normalizeConditionCode falls back to Good", () => {
  assert.equal(normalizeConditionCode("Excellent"), "Excellent");
  assert.equal(normalizeConditionCode("Made up"), "Good");
  assert.equal(normalizeConditionCode(null), "Good");
});

test("normalizeConfirmCards caps at five valid cards", () => {
  const cards = normalizeConfirmCards([
    { id: "a", question: "Q1?", suggested_answer: "A1" },
    { id: "b", question: "Q2?", suggested_answer: "A2", optional: true },
    { id: "", question: "skip", suggested_answer: "x" },
    { id: "c", question: "", suggested_answer: "x" },
    { id: "d", question: "Q4?", suggested_answer: "A4" },
    { id: "e", question: "Q5?", suggested_answer: "A5" },
    { id: "f", question: "Q6?", suggested_answer: "A6" },
  ]);
  assert.equal(cards.length, 5);
  assert.equal(cards[1].optional, true);
});
