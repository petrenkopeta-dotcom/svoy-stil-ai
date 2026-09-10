# Closed staging readiness — 2026-09-10

Decision: **NO-GO for user-photo staging**. No hosting was purchased or deployed,
no user photo was transmitted, no real Telegram/email message was sent.

## Repository and local boundary

Baseline after fetch: `aaa9be3`. Local onboarding commit `b7803bf` was inspected
and preserved as `87baece` in the isolated worktree. Original source files were
read only; Git worktree operations updated shared Git metadata only.

The local inventory at `qa-evidence/staging-file-inventory.md` enumerates 389
tracked files and 1028 individual ignored local entries; 5719 ignored files total
including dependency/build/cache contents. It is deliberately excluded from Git.
The five CV source/manifest files were inspected with a secret-pattern scan;
no match was found, which is not a proof that every local file is secret-free.
None was copied or published.

| File or group | Role | Action |
|---|---|---|
| `server/cvAutoLocal.mjs` | Old disk-based CV entry | Disable processing before any file creation; detach research worker |
| Local `prototypes/cv_auto_01/worker_service.py` | Research worker, imports run_spike, writes overlays | Keep local; never deploy |
| Local `run_spike.py`, `metrics.py` | Research/measurement helpers | Keep local; do not import from server |
| Local model inventory/requirements | Historical model pins | Retain locally; not a verified Linux lock |
| `runtime/cv/worker_service.py` | Safe bootstrap | Explicit missing-capability failure; no model or image loading |
| `src/localCvAuto.js` | Client CV transport | Reject missing safety, pre-cancelled calls; 20s deadline; distinct timeout |
| `src/photoStorage.js` | Local persistence | Reject unvalidated images, including legacy migration |
| `src/main.jsx` | Reference saving | Remove original rectangular crop fallback |
| `server/authBff.mjs` | Legacy external provider BFF | Require exact-byte validator; wire durable SQLite and portable CLI entry |
| `server/vkAuth.mjs`, `stagingApi.mjs` | New server contract | Signed VK identity and owner-keyed metadata; photos denied |
| `server/budgetGuard.mjs` | Budget policy, latch and outbox | Default blocked; no real billing/controller transport configured |
| `deploy/` | Linux security templates | Reviewable templates, not deployed or accepted |
| `.env.local`, QA/eval/datasets/photos | Private local material | Do not modify, copy to GitHub, or delete |

## Acceptance matrix

| Priority | Problem / correction | Evidence and remaining acceptance |
|---|---|---|
| P0 | Original written to temp disk → processing disabled | Negative test proves old worker not called. Actual safe inference still required |
| P0 | Missing detector accepted → safety and storage fail closed | Missing/incomplete/error/cancel/timeout tests; actual pixel detector still missing |
| P0 | BFF could forward arbitrary crop → server validator required | Test accepted fixture separately; default validator absent, upload blocked |
| P0 | Russian hosting / independent operation absent | Requires selected Russian account, TLS, private tester access, approved spend and phone test with laptop off |
| P0 | Budget could overrun → reserve policy + durable default block | Unit tests of reserves/stale data/calendar latch/two channels. Provider ingestion/shutdown and top-up resume not implemented |
| P1 | VK and durable owner separation absent → isolated API contract | HMAC tamper/app/expiry tests, two-user SQL isolation, restart/expiry sessions. Frontend/VK installation and real launch still required |
| P1 | Windows-only BFF entry/session wiring → file URL + SQLite | Local tests; Linux CI must pass on exact PR head |
| P1 | Formatting failure | All 14 baseline LF files pass Prettier directly from Git. CRLF worktree caused failure; `.gitattributes` pins LF |
| P1 | 10s goal / 20s maximum unmeasured | Deadline is enforced for browser transport; no cold/warm or load evidence for real inference |
| P1 | Legal readiness unknown | Separate qualified review of operator, consent, notices, retention and data-processing chain required |

## Linux reproduction and acceptance boundary

From a fresh Git clone on Linux with Node 22 (latest patched 22.x) or Node 24:

```sh
npm ci --ignore-scripts
npm run verify
npx playwright install --with-deps chromium
CI=true npm run test:browser
```

SQLite is included in Node; no database service or model download is needed for
these synthetic tests. CI uses Ubuntu and Node 22. `.cv-auto-runtime`, model
weights and Python ML packages must not be restored automatically on the laptop.

`server/stagingServer.mjs` requires `STAGING_DATA_DIR`, `STAGING_ORIGIN` (HTTPS),
`VK_APP_ID` and `VK_APP_SECRET` via a private environment file. Start with
`node server/stagingServer.mjs`. Its expected current behavior is HTTP 503 for
every request. It is a closed deployment gate, not a functioning staging app.
`deploy/staging.service` prohibits restart and core dumps; swap prohibition must
also be verified on the host. Do not enable at boot after a budget block. Review
the Nginx fragment inside a real private TLS vhost; disable access/query logs
for the entire Mini App because launch URLs contain credentials.

Before enabling photos: install pinned models separately on approved Russian
infrastructure, verify cryptographic model hashes, port decoding/segmentation to
memory streams, implement person/face AND residual-background checks on exact
cutout bytes, bound decoder pixels/concurrency/queues, abort and kill work by 20s,
and prove no input in swap, tempfiles, proxy spooling, crash dumps or backups.
Measure cold and warm p50/p95/p99 and overload behavior on synthetic/approved
local fixtures. No such performance result currently exists. A paid benchmark
requires approval of its exact maximum cost before provisioning.

## Tariff snapshot and provisional envelope

Official sources checked 2026-09-10:

- [Timeweb Cloud cloud servers](https://timeweb.cloud/services/cloud-servers):
  Moscow MSK 80, 4 CPU/8 GB/80 GB, displayed 1800 RUB/month with the 12-month
  10% discount selected. Dividing by 0.9 gives a provisional 2000 RUB/month
  undiscounted inference; this is NOT a checkout quote. Do not prepay a year.
- [Selectel cloud server pricing](https://selectel.ru/services/cloud/servers/)
  and [billing model](https://docs.selectel.ru/cloud-servers/about/payment/):
  component/pay-as-you-go pricing requires a selected pool/configuration quote;
  stopping compute is not evidence that every resource stopped accruing costs.
- [Yandex Cloud budgets](https://yandex.cloud/en/docs/billing/concepts/budget)
  provide spend monitoring and threshold actions. Treat notifications as input to
  an independently verified controller, not a hard spending ceiling.

Provisional allocation, NOT an offer or approved spend: 2000 RUB compute,
500 RUB IP/traffic/backups, 500 RUB operational/notification reserve, 1000 RUB
mandatory/storage/late-billing reserve, 1000 RUB unused headroom = 5000 total.
Every reserve needs a real provider quote and a bounded retention horizon.
An indefinitely retained billed disk cannot fit under a finite lifetime reserve;
agree an explicit post-block retention/payment policy without automatic deletion.
No CPU configuration is claimed to meet inference latency. GPU feasibility under
this envelope is unproven; do not provision or raise the ceiling automatically.

## Remaining work before any go decision

Implement and independently validate the memory-only image pipeline; integrate
the frontend with the Russian VK backend and photo storage; connect and test the
provider budget controller, both notification destinations and explicit funded
resume; verify private Linux deployment, real VK launch and laptop-off phone
journey. These are missing implementation/infrastructure steps, not waived tests.
