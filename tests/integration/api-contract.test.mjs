import test from "node:test";
import assert from "node:assert/strict";

test("standard error payload shape example", () => {
  const errorPayload = {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      user_message: "Please correct the highlighted fields.",
      actions: ["Review required fields and try again."],
      can_retry: true,
    },
    fields: {
      item_number: ["Required"],
    },
  };

  assert.equal(errorPayload.ok, false);
  assert.equal(typeof errorPayload.error.code, "string");
  assert.equal(Array.isArray(errorPayload.error.actions), true);
});
