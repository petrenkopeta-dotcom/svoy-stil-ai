// Amounts are integer kopecks. This ledger never calls a provider or sends mail.
// A provider controller must independently enforce the persisted block.
export const MONTHLY_CEILING = 500_000;
export function assessBudget(state, sample, now = Date.now()) {
  const names = ["spent", "mandatoryReserve", "diskReserve", "accrualReserve", "nextOperation"];
  const valid = sample && names.every((key) => Number.isSafeInteger(sample[key]) && sample[key] >= 0)
    && Number.isSafeInteger(sample.observedAt) && sample.observedAt <= now
    && now - sample.observedAt <= 60_000 && /^\d{4}-\d{2}$/.test(sample.month)
    && sample.month === new Date(now).toISOString().slice(0, 7);
  const projected = valid ? names.reduce((sum, key) => sum + sample[key], 0) : Infinity;
  const blocked = state?.blocked !== false || !valid || projected >= MONTHLY_CEILING;
  return {
    blocked, ceiling: MONTHLY_CEILING,
    reason: state?.blocked !== false ? "explicit_resume_required" : !valid ? "billing_unavailable" : blocked ? "reserved_ceiling" : "within_budget",
    projected: Number.isSafeInteger(projected) ? projected : null,
    warnings: valid ? [350_000, 400_000].filter((threshold) => sample.spent >= threshold).flatMap((threshold) => ["telegram", "email"].map((channel) => ({ id: `${sample.month}:${threshold}:${channel}`, channel, threshold }))) : [],
  };
}

/** Transactional latch + outbox, survives restart/month change. No auto resume. */
export function recordBudgetDecision(db, sample, now = Date.now()) {
  db.exec("CREATE TABLE IF NOT EXISTS budget_latch (id INTEGER PRIMARY KEY CHECK(id=1), blocked INTEGER NOT NULL); INSERT OR IGNORE INTO budget_latch VALUES(1,1); CREATE TABLE IF NOT EXISTS budget_outbox (id TEXT PRIMARY KEY, channel TEXT NOT NULL, threshold INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)");
  db.exec("BEGIN IMMEDIATE");
  try {
    const state = db.prepare("SELECT blocked FROM budget_latch WHERE id=1").get();
    const decision = assessBudget({ blocked: Boolean(state.blocked) }, sample, now);
    db.prepare("UPDATE budget_latch SET blocked=? WHERE id=1").run(Number(decision.blocked));
    for (const warning of decision.warnings) db.prepare("INSERT OR IGNORE INTO budget_outbox(id,channel,threshold) VALUES(?,?,?)").run(warning.id, warning.channel, warning.threshold);
    db.exec("COMMIT");
    return decision;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export async function deliverBudgetOutbox(db, transports) {
  const rows = db.prepare("SELECT * FROM budget_outbox WHERE delivered=0 ORDER BY id").all();
  const results = [];
  for (const row of rows) {
    try {
      if (typeof transports?.[row.channel] !== "function") throw new Error("channel_unconfigured");
      // Receiver must deduplicate id: crash after sending may retry delivery.
      if (await transports[row.channel]({ id: row.id, threshold: row.threshold }) !== true) throw new Error("delivery_unconfirmed");
      db.prepare("UPDATE budget_outbox SET delivered=1 WHERE id=?").run(row.id);
      results.push({ id: row.id, delivered: true });
    } catch { results.push({ id: row.id, delivered: false }); }
  }
  return results;
}
