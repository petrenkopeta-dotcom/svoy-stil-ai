import { placeText } from "./vkStagingCity.js";

/** Injected Bridge only. No SDK/global lookup, credentials, persistence or retry. */
export async function requestVkProfileCity({
  bridge,
  signal,
  timeoutMs = 5000,
} = {}) {
  const fail = (code) => Object.assign(new Error(code), { code });
  if (signal?.aborted) throw fail("city_cancelled");
  if (
    typeof bridge?.supportsAsync !== "function" ||
    typeof bridge?.send !== "function"
  )
    throw fail("city_unsupported");
  let timer,
    abort,
    inactive = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(fail("city_timeout")),
      Math.min(Math.max(timeoutMs, 1), 5000),
    );
    abort = () => reject(fail("city_cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        if ((await bridge.supportsAsync("VKWebAppGetUserInfo")) !== true)
          throw fail("city_unsupported");
        if (inactive || signal?.aborted) throw fail("city_cancelled");
        const result = await bridge.send("VKWebAppGetUserInfo");
        const title = placeText(result?.city?.title);
        if (!title) throw fail("city_absent");
        return { city: { title } };
      })(),
    ]);
  } catch (error) {
    const code = [
      "city_cancelled",
      "city_timeout",
      "city_unsupported",
      "city_absent",
    ].includes(error?.code)
      ? error.code
      : "city_unavailable";
    throw fail(code); // Never expose raw UserInfo/Bridge diagnostics.
  } finally {
    inactive = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
