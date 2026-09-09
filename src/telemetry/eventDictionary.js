export const TELEMETRY_SCHEMA_VERSION = "1.0.0";

const product = (properties = {}) => ({ category: "product", properties });
const technical = (properties = {}) => ({ category: "technical", properties });
const enumOf = (...values) => ({ type: "enum", values });

export const TELEMETRY_EVENTS = Object.freeze({
  app_started: product({ entry: enumOf("landing", "returning") }),
  onboarding_started: product(),
  onboarding_step_completed: product({ step: { type: "integer", min: 1, max: 3 } }),
  onboarding_completed: product(),
  first_result_requested: product(),
  first_result_shown: product({ result_kind: enumOf("demo", "personal") }),
  first_result_action: product({ action: enumOf("add_first_item", "open_demo_wardrobe", "photo_in_store") }),
  auth_gate_shown: product({ action: enumOf("wardrobe", "history", "learning", "save_outfit", "shopping") }),
  auth_code_requested: product(),
  auth_succeeded: product(),
  auth_failed: product({ reason: enumOf("provider_unavailable", "invalid_code", "expired", "offline", "unknown") }),
  first_item_started: product({ source: enumOf("upload", "camera", "manual") }),
  first_item_completed: product({ has_local_photo: { type: "boolean" } }),
  first_item_failed: product({ reason: enumOf("validation", "storage", "quota", "unknown") }),
  look_generated: product({ confidence_bucket: enumOf("low", "medium", "high", "unknown") }),
  would_wear_recorded: product({ sequence: { type: "integer", min: 1, max: 1000 } }),
  look_rejected: product({ reason_code: enumOf("color", "style", "fit", "occasion", "other", "unknown") }),
  explanation_rated: product({ useful: { type: "boolean" } }),
  second_item_intent: product({ action: enumOf("add", "shop", "later") }),
  session_returned: product({ day_bucket: enumOf("d1", "d7", "other") }),
  export_requested: product({ format: enumOf("json") }),
  local_data_deleted: product({ scope: enumOf("telemetry", "all_local") }),
  reference_flow: product({ stage: enumOf("imported", "review", "save"), method: enumOf("gallery", "file", "camera", "drag", "paste", "unknown"), count: { type: "integer", min: 0, max: 50 }, outcome: enumOf("shown", "completed", "confirm", "correct", "reject", "failed") }),

  stage_completed: technical({ stage: enumOf("auth_restore", "onboarding", "first_result", "photo_store", "stylist"), latency_bucket: enumOf("lt_100ms", "100_499ms", "500_1999ms", "2_9s", "gte_10s") }),
  stage_error: technical({ stage: enumOf("auth_restore", "onboarding", "first_result", "photo_store", "stylist", "db", "storage"), error_code: enumOf("validation", "unavailable", "quota", "corrupt", "unknown") }),
  stage_timeout: technical({ stage: enumOf("auth_restore", "first_result", "photo_store", "stylist") }),
  stage_retry: technical({ stage: enumOf("auth_restore", "photo_store", "stylist"), attempt_bucket: enumOf("1", "2", "3_plus") }),
  recommendation_scored: technical({ confidence_bucket: enumOf("low", "medium", "high", "unknown"), cost_bucket: enumOf("local_zero", "low", "medium", "high", "unknown") }),
  storage_failure: technical({ operation: enumOf("read", "write", "delete", "purge"), error_code: enumOf("quota", "unavailable", "corrupt", "unknown") }),
  persistence_outcome: technical({ domain: enumOf("preferences"), outcome: enumOf("saved_local", "retryable_error", "failed"), error_code: enumOf("none", "quota", "unavailable", "unknown") }),
  db_failure: technical({ operation: enumOf("read", "write", "delete"), error_code: enumOf("unavailable", "constraint", "unknown") }),
  session_restored: technical(),
  session_revoked: technical({ reason: enumOf("logout", "expired", "deleted", "unknown") }),
  deletion_completed: technical({ sla_bucket: enumOf("lt_1s", "1_5s", "gt_5s") }),
});

export const PRODUCT_FUNNEL_EVENT_COUNT = Object.values(TELEMETRY_EVENTS).filter((event) => event.category === "product").length;
