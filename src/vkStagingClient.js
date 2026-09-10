/** Same-origin VK metadata client. Launch credentials stay in memory. */
export function createVkStagingClient({ fetchImpl = globalThis.fetch, launch = "" } = {}) {
  let pending = new Set();
  const request = async (route, method = "GET", body) => {
    const controller = new AbortController();
    pending.add(controller);
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchImpl(`/api/staging/${route}`, {
        method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "X-CSRF-Intent": "ai-stylist", "Content-Type": "text/plain" }, body,
      });
      if (!response.ok) throw Object.assign(new Error("staging_request_failed"), { status: response.status });
      return await response.json();
    } finally { clearTimeout(timer); pending.delete(controller); }
  };
  return Object.freeze({
    async login() {
      // Session restoration works after the launch query has been removed.
      if (!launch) return request("session");
      const result = await request("vk-session", "POST", launch);
      launch = "";
      return result;
    },
    wardrobe: () => request("wardrobe"),
    async save(items) {
      await request("wardrobe", "PUT", JSON.stringify(items));
      const readBack = await request("wardrobe");
      if (JSON.stringify(readBack.items) !== JSON.stringify(items)) throw new Error("staging_readback_mismatch");
      return readBack;
    },
    logout: () => request("logout", "POST", ""),
    close() { for (const controller of pending) controller.abort(); pending = new Set(); launch = ""; },
  });
}
