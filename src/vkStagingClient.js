/** Same-origin VK client. Credentials and image bytes stay in memory. */
import { validateVkWardrobe } from "./vkWardrobeMetadataContract.js";
export function createVkStagingClient({
  fetchImpl = globalThis.fetch,
  launch = "",
  launchError = null,
  timeoutMs = 20_000,
} = {}) {
  const pending = new Set();
  let closed = false,
    launchEpoch = 0,
    reopenRequired = launchError,
    loginPending = null;
  const fail = (code, status) =>
    Object.assign(new Error(code), { code, status });
  const request = async (route, method = "GET", body, binary = false) => {
    if (closed) throw fail("client_closed");
    const controller = new AbortController();
    pending.add(controller);
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.min(timeoutMs, 20_000),
    );
    try {
      const response = await fetchImpl(`/api/staging/${route}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "X-CSRF-Intent": "ai-stylist",
          "Content-Type": "text/plain",
        },
        body,
      });
      if (!response.ok) {
        const value = await response.json().catch(() => ({}));
        throw fail(value.code || "staging_request_failed", response.status);
      }
      const value = binary
        ? await response.arrayBuffer()
        : await response.json();
      if (controller.signal.aborted || closed) throw fail("request_cancelled");
      return value;
    } catch (error) {
      if (timedOut) throw fail("request_timeout", 408);
      throw error;
    } finally {
      clearTimeout(timer);
      pending.delete(controller);
    }
  };
  const readPhoto = async ({ id, sha256 }) => {
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256))
      throw fail("photo_contract_invalid");
    const bytes = await request(`photos/${id}`, "GET", undefined, true);
    const digest = [
      ...new Uint8Array(
        await globalThis.crypto.subtle.digest("SHA-256", bytes),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    if (digest !== sha256) throw fail("photo_readback_mismatch");
    return { id, sha256, blob: new Blob([bytes], { type: "image/png" }) };
  };
  const readWardrobe = async () => {
    const value = await request("wardrobe");
    if (!validateVkWardrobe(value?.items))
      throw fail("staging_wardrobe_invalid");
    return value;
  };
  return Object.freeze({
    login() {
      if (closed) return Promise.reject(fail("client_closed"));
      if (loginPending) return loginPending;
      const login = async () => {
        if (reopenRequired) throw fail(reopenRequired);
        if (!launch) {
          try {
            const session = await request("session");
            if (
              session?.authenticated !== true ||
              typeof session.userId !== "string" ||
              !/^vk:[1-9]\d*:[1-9]\d*$/.test(session.userId)
            )
              throw fail("vk_session_missing", 401);
            return session;
          } catch (error) {
            if (error.status === 401) throw fail("vk_session_missing", 401);
            throw error;
          }
        }
        const credentials = launch;
        const currentEpoch = launchEpoch;
        launch = "";
        reopenRequired = "vk_launch_reopen_required";
        if (new TextEncoder().encode(credentials).length > 8192)
          throw fail("vk_launch_rejected", 400);
        let exchanged = false;
        try {
          const result = await request("vk-session", "POST", credentials);
          exchanged = true;
          if (currentEpoch !== launchEpoch) throw fail("request_cancelled");
          if (
            typeof result?.userId !== "string" ||
            !/^vk:[1-9]\d*:[1-9]\d*$/.test(result.userId)
          )
            throw fail("vk_launch_reopen_required");
          const session = await request("session");
          if (currentEpoch !== launchEpoch) throw fail("request_cancelled");
          if (
            session?.authenticated !== true ||
            session.userId !== result.userId
          )
            throw fail("vk_launch_reopen_required");
          reopenRequired = null;
          return result;
        } catch (error) {
          // Only a definite pre-login budget denial permits retrying this launch.
          // Its original timestamp is untouched; the server still enforces freshness.
          if (
            !closed &&
            !exchanged &&
            currentEpoch === launchEpoch &&
            error.status === 503 &&
            error.code === "staging_budget_blocked"
          ) {
            launch = credentials;
            reopenRequired = null;
          }
          if (error.status === 400) throw fail("vk_launch_rejected", 400);
          if (reopenRequired && currentEpoch === launchEpoch)
            throw fail("vk_launch_reopen_required");
          throw error;
        }
      };
      const promise = login().finally(() => {
        if (loginPending === promise) loginPending = null;
      });
      loginPending = promise;
      return promise;
    },
    wardrobe: readWardrobe,
    capabilities: () => request("capabilities"),
    photos: () => request("photos"),
    async analyze(file) {
      // Recheck server admission before reading or transmitting any input bytes.
      if ((await request("capabilities")).photos !== true)
        throw fail("photo_release_unapproved", 503);
      if (
        !(file instanceof Blob) ||
        !file.size ||
        file.size > 10 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw fail("image_bytes_limit", 413);
      return request("photos/analyze", "POST", file);
    },
    async confirm(id) {
      const saved = await request(
        "photos/confirm",
        "POST",
        JSON.stringify({ id }),
      );
      return readPhoto(saved);
    },
    readPhoto,
    cancel() {
      for (const controller of pending) controller.abort();
    },
    async save(items) {
      if (!validateVkWardrobe(items)) throw fail("invalid_wardrobe", 422);
      await request("wardrobe", "PUT", JSON.stringify(items));
      const readBack = await readWardrobe();
      if (JSON.stringify(readBack.items) !== JSON.stringify(items))
        throw fail("staging_readback_mismatch");
      return readBack;
    },
    async logout() {
      launchEpoch++;
      launch = "";
      reopenRequired = "vk_launch_reopen_required";
      for (const controller of pending) controller.abort();
      return request("logout", "POST", "");
    },
    close() {
      launchEpoch++;
      closed = true;
      for (const controller of pending) controller.abort();
      launch = "";
    },
  });
}

export function vkJourneyError(error) {
  if (
    ["vk_launch_reopen_required", "vk_launch_redaction_failed"].includes(
      error.code,
    )
  )
    return {
      state: "error",
      message:
        "Вход не подтверждён. Закройте приложение и откройте его заново из VK. Данные другой сессии не загружаются.",
    };
  if (error.code === "vk_session_missing")
    return {
      state: "error",
      message:
        "Откройте приложение из VK. По прямой ссылке без действующей сессии личный гардероб недоступен.",
    };
  if (error.code === "storage_unavailable")
    return {
      state: "unavailable",
      message:
        "Хранилище гардероба временно недоступно. Результат не подтверждён; обновите гардероб перед повтором.",
    };
  if (error.status === 401 || error.code === "vk_launch_rejected")
    return {
      state: "error",
      message: "Сессия завершена. Откройте приложение заново из VK.",
    };
  if ([408, 504].includes(error.status))
    return {
      state: "timeout",
      message:
        "Время ожидания истекло. Результат не подтверждён; обновите гардероб перед повтором.",
    };
  if (error.status === 503)
    return {
      state: "unavailable",
      message:
        "Обработка фото пока недоступна. Проверки безопасности или бюджета не завершены.",
    };
  if ([404, 410].includes(error.status))
    return {
      state: "error",
      message:
        "Кандидат или вещь недоступны. Обновите гардероб или выполните анализ заново.",
    };
  return {
    state: "error",
    message:
      "Операция не подтверждена. Проверьте связь и обновите гардероб перед повтором.",
  };
}
