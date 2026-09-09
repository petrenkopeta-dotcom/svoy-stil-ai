import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_INTAKE_COPY } from "./photoIntakeCopy.js";

test("save_and_review copy describes the real local-only flow", () => {
  const copy = `${PHOTO_INTAKE_COPY.save_and_review.title} ${PHOTO_INTAKE_COPY.save_and_review.body}`;
  assert.match(copy, /на этом устройстве/i);
  assert.match(copy, /никуда не отправлено/i);
  assert.match(copy, /фон не удаляется/i);
  assert.match(copy, /проверьте характеристики/i);
  assert.doesNotMatch(copy, /ручн|оператор|очеред/i);
});
