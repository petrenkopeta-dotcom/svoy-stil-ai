/** Capture during bootstrap, before UI mounting. A one-shot module closure retains
 * launch bytes; identity is not parsed or trusted here. Legacy entry is untouched.
 */
export function captureVkLaunch({ location, history }) {
  let launch = location.search.slice(1),
    error = null;
  try {
    history.replaceState(null, "", location.pathname);
  } catch {
    launch = "";
    error = "vk_launch_redaction_failed";
  }
  return () => {
    const result = { launch, launchError: error };
    launch = "";
    error = null;
    return result;
  };
}
const take =
  typeof window !== "undefined" && import.meta.env?.VITE_VK_STAGING === "true"
    ? captureVkLaunch(window)
    : () => ({ launch: "", launchError: null });
export const takeVkLaunch = () => take();
