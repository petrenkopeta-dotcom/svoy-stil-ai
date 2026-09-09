import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSON_PRESENCE,
  PERSON_PRESENCE_REASON,
  evaluatePersonPresenceGate,
} from "./personPresenceGate.js";

const safelyAbsent = {
  consentGranted: true,
  processingLocation: "local",
  mode: "personal",
  person: { present: false, confidence: "high" },
  face: { present: false, confidence: "high" },
};

test("allows only high-confidence absence from both detectors", () => {
  assert.deepEqual(evaluatePersonPresenceGate(safelyAbsent), {
    presence: PERSON_PRESENCE.ABSENT,
    reason_code: PERSON_PRESENCE_REASON.SAFELY_ABSENT,
  });
});

test("reports high-confidence person or face presence", () => {
  assert.deepEqual(
    evaluatePersonPresenceGate({
      ...safelyAbsent,
      person: { present: true, confidence: "high" },
    }),
    {
      presence: PERSON_PRESENCE.PRESENT,
      reason_code: PERSON_PRESENCE_REASON.PERSON_PRESENT,
    },
  );

  assert.deepEqual(
    evaluatePersonPresenceGate({
      ...safelyAbsent,
      face: { present: true, confidence: "high" },
    }),
    {
      presence: PERSON_PRESENCE.PRESENT,
      reason_code: PERSON_PRESENCE_REASON.FACE_PRESENT,
    },
  );
});

test("low, medium, numeric and missing confidence fail closed", () => {
  for (const confidence of ["low", "medium", 0.99, undefined]) {
    const decision = evaluatePersonPresenceGate({
      ...safelyAbsent,
      person: { present: false, confidence },
    });
    assert.deepEqual(decision, {
      presence: PERSON_PRESENCE.UNKNOWN,
      reason_code: PERSON_PRESENCE_REASON.CONFIDENCE_INSUFFICIENT,
    });
  }
});

test("missing or malformed detector signals fail closed", () => {
  assert.deepEqual(
    evaluatePersonPresenceGate({ ...safelyAbsent, face: undefined }),
    {
      presence: PERSON_PRESENCE.UNKNOWN,
      reason_code: PERSON_PRESENCE_REASON.SIGNAL_MISSING,
    },
  );

  assert.deepEqual(
    evaluatePersonPresenceGate({
      ...safelyAbsent,
      face: { present: "false", confidence: "high" },
    }),
    {
      presence: PERSON_PRESENCE.UNKNOWN,
      reason_code: PERSON_PRESENCE_REASON.SIGNAL_INVALID,
    },
  );
});

test("explicit consent and local processing are mandatory", () => {
  for (const consentGranted of [false, undefined, "yes"]) {
    const decision = evaluatePersonPresenceGate({
      ...safelyAbsent,
      consentGranted,
    });
    assert.equal(decision.presence, PERSON_PRESENCE.UNKNOWN);
    assert.equal(
      decision.reason_code,
      PERSON_PRESENCE_REASON.CONSENT_REQUIRED,
    );
  }

  for (const processingLocation of ["cloud", undefined, true]) {
    const decision = evaluatePersonPresenceGate({
      ...safelyAbsent,
      processingLocation,
    });
    assert.equal(decision.presence, PERSON_PRESENCE.UNKNOWN);
    assert.equal(
      decision.reason_code,
      PERSON_PRESENCE_REASON.LOCAL_PROCESSING_REQUIRED,
    );
  }
});

test("demo and personal modes are explicit and behaviorally separated", () => {
  assert.equal(
    evaluatePersonPresenceGate({ ...safelyAbsent, mode: "demo" }).presence,
    PERSON_PRESENCE.ABSENT,
  );

  for (const mode of [undefined, "shared", "production"]) {
    assert.deepEqual(evaluatePersonPresenceGate({ ...safelyAbsent, mode }), {
      presence: PERSON_PRESENCE.UNKNOWN,
      reason_code: PERSON_PRESENCE_REASON.MODE_REQUIRED,
    });
  }
});

test("public output is frozen and contains no identity or biometric fields", () => {
  const decision = evaluatePersonPresenceGate(safelyAbsent);
  assert.deepEqual(Object.keys(decision).sort(), ["presence", "reason_code"]);
  assert.equal(Object.isFrozen(decision), true);
  for (const forbidden of [
    "identity",
    "embedding",
    "template",
    "age",
    "gender",
    "ethnicity",
  ]) {
    assert.equal(Object.hasOwn(decision, forbidden), false);
  }
});

test("rejects image, identity and biometric payload fields", () => {
  for (const forbidden of ["image", "identity", "embedding", "template"]) {
    assert.deepEqual(
      evaluatePersonPresenceGate({ ...safelyAbsent, [forbidden]: "payload" }),
      {
        presence: PERSON_PRESENCE.UNKNOWN,
        reason_code: PERSON_PRESENCE_REASON.SIGNAL_INVALID,
      },
    );

    assert.deepEqual(
      evaluatePersonPresenceGate({
        ...safelyAbsent,
        person: { ...safelyAbsent.person, [forbidden]: "payload" },
      }),
      {
        presence: PERSON_PRESENCE.UNKNOWN,
        reason_code: PERSON_PRESENCE_REASON.SIGNAL_INVALID,
      },
    );
  }
});
