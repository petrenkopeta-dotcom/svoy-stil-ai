import {
  canonicalProfile,
  emptyProfileDraft,
  profileContent,
  profileEtag,
  validProfileDraft,
  validStoredProfile,
} from "./vkProfileContract.js";

/** Unmounted profile controller. The future session owner must call resetIdentity
 * on logout/identity change; it never reads browser storage or changes wardrobe.
 */
export function createVkProfileController({
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  newMutationId = () => globalThis.crypto.randomUUID(),
} = {}) {
  let epoch = 0,
    operation = null,
    closed = false,
    confirmed = null;
  let draft = emptyProfileDraft(),
    state = "idle",
    needsReadback = false,
    lastError = null;
  const copy = (value) => structuredClone(value);
  const fail = (code, status) =>
    Object.assign(new Error(code), { code, status });
  const resetIdentity = () => {
    epoch++;
    operation?.controller.abort();
    operation = null;
    confirmed = null;
    draft = emptyProfileDraft();
    needsReadback = false;
    lastError = null;
    state = closed ? "closed" : "idle";
  };
  const run = (kind, action) => {
    if (closed) return Promise.reject(fail("profile_controller_closed"));
    if (operation)
      return operation.kind === kind
        ? operation.promise
        : Promise.reject(fail("profile_busy"));
    const current = epoch,
      controller = new AbortController();
    const op = { controller, promise: null, kind };
    operation = op;
    state = kind === "save" ? "saving" : "loading";
    lastError = null;
    const check = () => {
      if (current !== epoch || controller.signal.aborted || closed)
        throw fail("profile_cancelled");
    };
    const request = async (method = "GET", body, etag) => {
      check();
      const response = await fetchImpl("/api/staging/profile", {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "X-CSRF-Intent": "ai-stylist",
          "Content-Type": "text/plain",
          ...(etag ? { "If-Match": etag } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      check();
      if (!response.ok) {
        // Server codes are not displayed directly; do not retain diagnostic bodies.
        throw fail("profile_request_failed", response.status);
      }
      const value = await response.json();
      check();
      if (
        !value ||
        Object.keys(value).length !== 1 ||
        !Object.hasOwn(value, "profile") ||
        (value.profile !== null && !validStoredProfile(value.profile))
      )
        throw fail("profile_readback_invalid");
      const expected = profileEtag(value.profile?.revision || 0);
      if (response.headers.get("etag") !== expected)
        throw fail("profile_readback_invalid");
      return { profile: value.profile, etag: expected };
    };
    let timer, abort;
    const deadline = new Promise((_, reject) => {
      abort = () => reject(fail("profile_cancelled"));
      controller.signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () => {
          reject(fail("profile_timeout", 408));
          controller.abort();
        },
        Number.isFinite(timeoutMs)
          ? Math.max(1, Math.min(timeoutMs, 20000))
          : 20000,
      );
    });
    op.promise = Promise.race([
      deadline,
      Promise.resolve().then(() => action(request, check)),
    ])
      .catch((error) => {
        if (current === epoch) {
          if (error.status === 401) {
            resetIdentity();
            state = "unauthenticated";
          } else {
            state =
              kind === "save"
                ? [409, 412].includes(error.status)
                  ? "conflict"
                  : "unknown"
                : "error";
            if (kind === "save") needsReadback = true;
          }
          lastError = error.code || "profile_request_failed";
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", abort);
        if (operation === op) operation = null;
      });
    return op.promise;
  };
  return Object.freeze({
    snapshot: () =>
      copy({
        state,
        confirmed: confirmed?.profile ?? null,
        etag: confirmed?.etag ?? null,
        draft,
        needsReadback,
        lastError,
      }),
    load: () =>
      run("load", async (request, check) => {
        const result = await request();
        check();
        confirmed = result;
        draft = result.profile
          ? copy(profileContent(result.profile))
          : emptyProfileDraft();
        needsReadback = false;
        state = "ready";
        return copy(result.profile);
      }),
    edit(value) {
      if (closed || operation || !confirmed || needsReadback)
        throw fail("profile_edit_unavailable");
      if (!validProfileDraft(value)) throw fail("invalid_profile", 422);
      draft = copy(value);
      state = "draft";
    },
    cancelDraft() {
      if (closed || operation || !confirmed || needsReadback)
        throw fail("profile_edit_unavailable");
      draft = confirmed.profile
        ? copy(profileContent(confirmed.profile))
        : emptyProfileDraft();
      state = "ready";
    },
    save() {
      if (operation)
        return operation.kind === "save"
          ? operation.promise
          : Promise.reject(fail("profile_busy"));
      if (closed || !confirmed || needsReadback)
        return Promise.reject(fail("profile_readback_required"));
      const wanted = copy(draft),
        base = confirmed.etag,
        mutationId = newMutationId();
      return run("save", async (request, check) => {
        const fresh = await request();
        if (fresh.etag !== base) throw fail("profile_stale", 412);
        const expectedRevision = (fresh.profile?.revision || 0) + 1;
        const saved = await request("PUT", { ...wanted, mutationId }, base);
        const readback = await request();
        check();
        if (
          !saved.profile ||
          !readback.profile ||
          saved.profile.revision !== expectedRevision ||
          readback.profile.revision !== expectedRevision ||
          readback.etag !== saved.etag ||
          saved.profile.lastMutationId !== mutationId ||
          readback.profile.lastMutationId !== mutationId ||
          canonicalProfile(saved.profile) !== canonicalProfile(wanted) ||
          canonicalProfile(readback.profile) !== canonicalProfile(wanted)
        )
          throw fail("profile_readback_mismatch");
        confirmed = readback;
        draft = copy(profileContent(readback.profile));
        needsReadback = false;
        state = "ready";
        return copy(readback.profile);
      });
    },
    resetIdentity,
    close() {
      closed = true;
      resetIdentity();
    },
  });
}
