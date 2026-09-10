import { createHash, randomUUID } from "node:crypto";

/** Server-owned candidates; browser cannot submit arbitrary cutout bytes to save. */
export function createGarmentPhotoFlow({ worker, db, releaseApproved = () => false, now = Date.now, ttlMs = 60_000, maxBytes = 30 * 1024 * 1024 } = {}) {
  const candidates = new Map();
  let active = false;
  let closed = false, generation = 0, activeOwner;
  const purge = () => { for (const [id, item] of candidates) if (item.expires <= now()) { item.bytes.fill(0); candidates.delete(id); } };
  const permitted = () => { if (closed || releaseApproved() !== true) throw new Error("photo_release_unapproved"); };
  const sweep = setInterval(purge, Math.min(ttlMs, 1000)); sweep.unref();
  db.exec("CREATE TABLE IF NOT EXISTS garment_photos (id TEXT PRIMARY KEY, owner TEXT NOT NULL, png BLOB NOT NULL, sha256 TEXT NOT NULL)");
  const verifyBytes = (candidate) => {
    const bytes = Buffer.from(candidate.png, "base64");
    if (bytes.length > 10 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("cutout_format");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (candidate.safety?.sha256 !== digest || candidate.safety?.garmentOnly !== true || candidate.safety?.personPresent !== false || candidate.safety?.facePresent !== false || candidate.safety?.checked !== true) throw new Error("cutout_unverified");
    return { bytes, digest };
  };
  return Object.freeze({
    enabled: () => !closed && releaseApproved() === true,
    async analyze(owner, bytes, { signal } = {}) {
      permitted(); purge();
      if (active) throw new Error("photo_busy");
      if (!owner || signal?.aborted) throw new Error("photo_cancelled");
      active = true;
      activeOwner = owner; const current = generation;
      try {
        const result = await worker.analyze(bytes, { signal });
        permitted();
        if (signal?.aborted || current !== generation) throw new Error("photo_cancelled");
        const prepared = result.candidates.map((candidate) => ({ ...verifyBytes(candidate), label: candidate.label }));
        const used = [...candidates.values()].reduce((n, item) => n + item.bytes.length, 0);
        if (prepared.reduce((n, item) => n + item.bytes.length, used) > maxBytes) throw new Error("candidate_memory_limit");
        return prepared.map((candidate) => {
          const id = randomUUID();
          const expires = now() + ttlMs;
          candidates.set(id, { ...candidate, owner, expires });
          return { id, label: candidate.label, expires, preview: `data:image/png;base64,${candidate.bytes.toString("base64")}` };
        });
      } finally { active = false; activeOwner = undefined; }
    },
    async confirm(owner, id, { signal } = {}) {
      permitted(); purge();
      const candidate = candidates.get(id);
      if (!candidate || candidate.owner !== owner) throw new Error("candidate_not_found");
      if (active) throw new Error("photo_busy");
      active = true;
      activeOwner = owner; const current = generation;
      // Consume once before awaiting. Concurrent confirmation cannot replay it.
      candidates.delete(id);
      try {
        const result = await worker.analyze(candidate.bytes, { signal, operation: "verify" });
        permitted();
        if (signal?.aborted || candidate.expires <= now() || current !== generation) throw new Error("candidate_expired");
        if (result.candidates.length !== 1 || verifyBytes(result.candidates[0]).digest !== candidate.digest) throw new Error("confirmation_bytes_changed");
        const savedId = randomUUID();
        db.prepare("INSERT INTO garment_photos VALUES(?,?,?,?)").run(savedId, owner, candidate.bytes, candidate.digest);
        return { id: savedId, sha256: candidate.digest };
      } finally { candidate.bytes.fill(0); active = false; activeOwner = undefined; }
    },
    read(owner, id) {
      permitted();
      const row = db.prepare("SELECT png,sha256 FROM garment_photos WHERE id=? AND owner=?").get(id, owner);
      if (!row) throw new Error("photo_not_found");
      return { bytes: Buffer.from(row.png), sha256: row.sha256 };
    },
    cancel(owner) { if (activeOwner === owner) generation++; for (const [id, item] of candidates) if (item.owner === owner) { item.bytes.fill(0); candidates.delete(id); } },
    close() { closed = true; generation++; clearInterval(sweep); for (const item of candidates.values()) item.bytes.fill(0); candidates.clear(); worker.close(); },
  });
}
