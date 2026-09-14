import test from "node:test";
import assert from "node:assert/strict";
import { captureVkLaunch } from "./vkLaunchEntry.js";
test("launch is captured verbatim, URL stripped immediately and consumed once", () => {
  const calls = [];
  const take = captureVkLaunch({
    location: {
      search: "?vk_user_id=synthetic&sign=opaque%2Bvalue",
      pathname: "/index.html",
      hash: "#private",
    },
    history: { replaceState: (...args) => calls.push(args) },
  });
  assert.deepEqual(calls, [[null, "", "/index.html"]]);
  assert.deepEqual(take(), {
    launch: "vk_user_id=synthetic&sign=opaque%2Bvalue",
    launchError: null,
  });
  assert.deepEqual(take(), { launch: "", launchError: null });
});
test("failed URL redaction discards launch and fails closed rather than restoring another session", () => {
  const take = captureVkLaunch({
    location: { search: "?sign=synthetic", pathname: "/" },
    history: {
      replaceState() {
        throw new Error("synthetic");
      },
    },
  });
  assert.deepEqual(take(), {
    launch: "",
    launchError: "vk_launch_redaction_failed",
  });
});
