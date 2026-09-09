import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_ERROR_CODES, AUTH_STATES, AuthPortError, unavailableAuthPort } from "./AuthPort.js";
import { createAuthRepository } from "./AuthRepository.js";

const port = (overrides = {}) => ({ sendCode: async () => {}, verifyCode: async ({ email }) => ({ userId: "u1", email }), getSession: async () => null, logout: async () => {}, ...overrides });

test("email OTP state machine authenticates without storing code", async () => {
  let time = 1000; const seen = [];
  const repository = createAuthRepository({ port: port({ verifyCode: async (command) => { seen.push(command); return { userId: "u1", email: command.email }; } }), now: () => time });
  assert.equal((await repository.sendCode(" USER@Example.com ")).status, AUTH_STATES.CODE_SENT);
  assert.equal(repository.getState().email, "user@example.com");
  assert.equal((await repository.verifyCode("123456")).status, AUTH_STATES.AUTHENTICATED);
  assert.equal("code" in repository.getState(), false);
  assert.equal(seen[0].code, "123456");
});

test("parallel send and verify clicks share one provider call", async () => {
  let sends = 0; let verifies = 0;
  const repository = createAuthRepository({ port: port({ sendCode: async () => { sends += 1; }, verifyCode: async ({ email }) => { verifies += 1; return { userId: "u1", email }; } }), resendMs: 0 });
  await Promise.all([repository.sendCode("a@b.co"), repository.sendCode("a@b.co")]);
  await Promise.all([repository.verifyCode("123456"), repository.verifyCode("123456")]);
  assert.equal(sends, 1); assert.equal(verifies, 1);
});

test("expiry, resend timer, rate limit, offline and unavailable fail closed", async () => {
  let time = 100; const repository = createAuthRepository({ port: port(), now: () => time, codeTtlMs: 10, resendMs: 20 });
  await repository.sendCode("a@b.co");
  assert.equal((await repository.sendCode("a@b.co")).status, AUTH_STATES.RATE_LIMITED);
  time = 111; assert.equal((await repository.verifyCode("123456")).status, AUTH_STATES.EXPIRED);
  const offline = createAuthRepository({ port: port({ sendCode: async () => { throw new AuthPortError(AUTH_ERROR_CODES.OFFLINE); } }) });
  assert.equal((await offline.sendCode("a@b.co")).status, AUTH_STATES.OFFLINE);
  const unavailable = createAuthRepository({ port: unavailableAuthPort() });
  assert.equal((await unavailable.sendCode("a@b.co")).error, AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE);
});

test("restore and logout expose only provider session", async () => {
  let loggedOut = 0;
  const repository = createAuthRepository({ port: port({ getSession: async () => ({ userId: "u2", email: "a@b.co" }), logout: async () => { loggedOut += 1; } }) });
  assert.equal((await repository.restore()).status, AUTH_STATES.AUTHENTICATED);
  assert.equal((await repository.logout()).status, AUTH_STATES.SIGNED_OUT);
  assert.equal(loggedOut, 1);
});
