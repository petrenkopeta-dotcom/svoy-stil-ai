import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { assessBudget, recordBudgetDecision, deliverBudgetOutbox } from "./budgetGuard.mjs";
const now = Date.UTC(2026, 8, 10);
const sample = { month: "2026-09", observedAt: now, spent: 350000, mandatoryReserve: 10000, diskReserve: 30000, accrualReserve: 10000, nextOperation: 1000 };
test("reserves block before the 5000 ruble ceiling, missing/stale billing fails closed", () => {
  assert.equal(assessBudget({ blocked: false }, sample, now).blocked, false);
  for (const value of [undefined, { ...sample, spent: 460000 }, { ...sample, spent: NaN }, { ...sample, observedAt: now - 60001 }]) assert.equal(assessBudget({ blocked: false }, value, now).blocked, true);
  assert.equal(assessBudget(undefined, sample, now).blocked, true);
  assert.equal(assessBudget({ blocked: true }, { ...sample, month: "2026-10", observedAt: Date.UTC(2026, 9, 1), spent: 0 }, Date.UTC(2026, 9, 1)).blocked, true);
});
test("latched default and independent retryable alerts in both channels without real delivery", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.equal(recordBudgetDecision(db, { ...sample, spent: 400000 }, now).blocked, true);
    recordBudgetDecision(db, { ...sample, spent: 400000 }, now);
    assert.equal(db.prepare("SELECT count(*) AS n FROM budget_outbox").get().n, 4);
    const calls = [];
    let rows = await deliverBudgetOutbox(db, { telegram: async () => { throw new Error("offline"); }, email: async (message) => { calls.push(message); return true; } });
    assert.equal(rows.filter((x) => x.delivered).length, 2);
    rows = await deliverBudgetOutbox(db, { telegram: async (message) => { calls.push(message); return true; } });
    assert.equal(rows.length, 2);
    assert.equal(calls.length, 4);
    assert.equal(db.prepare("SELECT blocked FROM budget_latch").get().blocked, 1);
  } finally { db.close(); }
});
