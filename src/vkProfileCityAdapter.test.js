import test from "node:test";
import assert from "node:assert/strict";
import { requestVkProfileCity } from "./vkProfileCityAdapter.js";

test("city adapter returns only city title, with no scopes or identity parameters", async () => {
  const calls = [];
  const bridge = {
    supportsAsync: async (...args) => {
      calls.push(args);
      return true;
    },
    send: async (...args) => {
      calls.push(args);
      return {
        id: 456,
        first_name: "Synthetic",
        city: { id: 1, title: "Москва" },
      };
    },
  };
  assert.deepEqual(await requestVkProfileCity({ bridge }), {
    city: { title: "Москва" },
  });
  assert.deepEqual(calls, [["VKWebAppGetUserInfo"], ["VKWebAppGetUserInfo"]]);
});

test("city unsupported/absent/rejected results expose only fixed codes and never retry", async () => {
  await assert.rejects(requestVkProfileCity(), { code: "city_unsupported" });
  let sends = 0;
  await assert.rejects(
    requestVkProfileCity({
      bridge: {
        supportsAsync: async () => false,
        send() {
          sends++;
        },
      },
    }),
    { code: "city_unsupported" },
  );
  assert.equal(sends, 0);
  for (const result of [
    {},
    { city: { title: "https://evil.test" } },
    { city: { title: "x".repeat(101) } },
  ])
    await assert.rejects(
      requestVkProfileCity({
        bridge: { supportsAsync: async () => true, send: async () => result },
      }),
      { code: "city_absent" },
    );
  await assert.rejects(
    requestVkProfileCity({
      bridge: {
        supportsAsync: async () => true,
        send() {
          sends++;
          throw new Error("private-diagnostic");
        },
      },
    }),
    { message: "city_unavailable" },
  );
  assert.equal(sends, 1);
});

test("deadline covers supports: a late support response cannot trigger user-info collection", async () => {
  let finish,
    sends = 0;
  const request = requestVkProfileCity({
    timeoutMs: 5,
    bridge: {
      supportsAsync: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      send() {
        sends++;
      },
    },
  });
  await assert.rejects(request, { code: "city_timeout" });
  finish(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sends, 0);
});

test("cancel stops waiting without retry or late collection", async () => {
  let finish,
    sends = 0;
  const abort = new AbortController();
  const request = requestVkProfileCity({
    signal: abort.signal,
    bridge: {
      supportsAsync: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      send() {
        sends++;
      },
    },
  });
  abort.abort();
  await assert.rejects(request, { code: "city_cancelled" });
  finish(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sends, 0);
});
