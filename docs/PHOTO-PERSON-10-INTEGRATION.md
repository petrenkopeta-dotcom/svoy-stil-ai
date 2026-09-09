# PHOTO-PERSON-10B — final integration reconciliation

**Overall decision: HOLD for a real-person prototype, pilot, release and production.**  
**Narrow decision: PASS only for an isolated developer prototype using synthetic/no-person fixtures and injected coarse presence signals.**  
**Scope:** documentation reconciliation only. No runtime, auth, cloud, commerce or existing evidence file was changed. The dirty tree was preserved.

## Executive finding

PHOTO-PERSON-01–09 now exist and consistently preserve the default invariant: the current intake accepts at most one separate garment without a person; a person, possible person, multiple garments or ambiguity fails closed. Manual declaration gives at most `save_and_review`, never automatic `accept`, and the current production-recognition seam remains untrusted.

The artifacts do **not** collectively evidence a shippable person-photo capability. `src/personPresenceGate.js` is a pure validator of already-produced coarse signals, not a detector. `src/GarmentOutlineSelector.jsx` and `src/garmentSelection.js` provide a useful local manual outline, but the current object and interaction model do not satisfy PHOTO-PERSON-04/08, and an outline cannot prove that a person has been removed. There is no local crop implementation followed by a fresh presence/scene/quality gate, no person-photo-specific ephemeral lifecycle, and no frozen mobile/accessibility/privacy evidence.

Therefore the safe integration is a **recovery pipeline that produces a new person-free crop and re-enters the unchanged garment-only gate**, not a pipeline that analyzes a person or admits a person photo. Until the missing producer and evidence are supplied, only synthetic developer fixtures may exercise the architecture.

## Actual artifact reconciliation

| Task | Actual output | Contract result | Integration consequence |
|---|---|---|---|
| PHOTO-PERSON-01 | `docs/PHOTO-PERSON-01-PRIVACY.md` | Document/design PASS; closed local prototype and production HOLD pending consent, legal/privacy sign-off, local dependency and evidence | Separate opt-in, 18+ policy, session-only default, no third-party photo, no persistence/export/learning |
| PHOTO-PERSON-02 | `docs/PHOTO-PERSON-02-THREAT.md` | HOLD until security criteria and independent evidence pass | Isolated controller/store, zero egress/log/cache leakage, owner/session separation, kill switch and verified purge |
| PHOTO-PERSON-03 | `src/personPresenceGate.js`, `src/personPresenceGate.test.js` | Pure fail-closed gate implemented and unit-tested | Consumes only coarse `person`/`face` presence signals; it accepts no image and supplies no detector |
| PHOTO-PERSON-04 | `docs/PHOTO-PERSON-04-SELECTION.md`; current `src/GarmentOutlineSelector.jsx`, `src/garmentSelection.js` are the baseline seam | Geometry/UX specification PASS; automatic or production admission HOLD | Outline is `guidance_only`; it cannot change `accept`, `upload_allowed`, recognition or background-removal decisions |
| PHOTO-PERSON-05 | `docs/PHOTO-PERSON-05-UX.md` | Recovery UX contract PASS; user release HOLD | Person/unknown/multiple scenes remain blocked; crop/outline must be followed by an entirely new scene check |
| PHOTO-PERSON-06 | `docs/qa/PHOTO-PERSON-06-low-quality-calibration.md`, `qa/photo-person-06/` | Synthetic corpus PASS for isolated QA; production calibration HOLD | Eight deterministic SVG fixtures test quality planning only; they do not validate a person detector |
| PHOTO-PERSON-07 | `docs/PHOTO-PERSON-07-MOBILE.md` | HOLD | Camera/gallery, orientation, HEIC fallback, resource limits and real-device matrix are contracts, not implemented evidence |
| PHOTO-PERSON-08 | `docs/PHOTO-PERSON-08-A11Y.md` | Design-level partial PASS; accessibility release HOLD | Coordinate entry is not a non-visual equivalent; focus, structured point editing, 400% reflow and SR evidence are missing |
| PHOTO-PERSON-09 | `docs/PHOTO-PERSON-09-EVALS.md` | Event/eval contract PASS; collector, goldens, automatic accept and production KPI HOLD | Any future metrics are local, separately consented and strictly allowlisted; existing telemetry is not evidence of this schema |

Local verification on the reconciled dirty tree: `npm test -- --test-name-pattern="person presence|quality gate|garment selection"` completed with **366/366 tests passing**. This is supporting unit evidence only; it is not the frozen PHOTO-PERSON browser, mobile, accessibility or deletion bundle required by 01/02/04/05/07/08/09.

## Authoritative dependency graph

```text
01 privacy/product/consent --------+
02 threat model -------------------+----> isolated lifecycle + kill switch
                                    |
03 coarse presence gate <--- approved local signal producer (MISSING)
           |                        |
           +---- present/unknown --> privacy stop / retake / delete
           |
           +---- safely absent ----+
                                    v
04 manual outline --> local crop derivative (MISSING) --> fresh 03 gate
                                    |                         |
                                    +-- present/unknown ------+--> stop
                                    |
                                    +-- safely absent ------------+
                                                                    v
                         existing scene declaration + photoQuality gate
                                                                    |
                                               only save_and_review/manual flow

05 recovery UX + 07 mobile + 08 accessibility constrain every UI transition
06 synthetic quality fixtures feed QA only, never the presence producer
09 local consented metrics observes terminal enums only
all evidence ----------------------------------------------------> 10B release gate
```

Policy authority remains the existing `photoIntake`/`photoQuality`/`photoGate` chain. PHOTO-PERSON components may make a result more restrictive but never more permissive.

## Can the current presence gate and outline support a narrow prototype?

### Safe now

They can support a **developer-only synthetic prototype** if all of these are true:

- no real person photo is used; fixtures are synthetic/no-person and remain outside personal/demo storage;
- presence signals are injected deterministic fixture values, not produced by face/body/identity or remote logic;
- `evaluatePersonPresenceGate()` is exercised only as a fail-closed policy seam;
- the existing outline is shown only as `guidance_only`; confirming it does not crop, persist, accept, upload or create a wardrobe item;
- feature registration is isolated and default-off; removal leaves the current garment flow byte/behavior equivalent;
- every exit disposes the local blob/object URL and the prototype creates no storage, metrics or network calls.

This is useful for state-machine and contract integration, but it is not evidence of person-photo value or detector quality.

### Not safe now

The two components cannot yet support a prototype using real person photos. The presence gate has no approved local producer, while a positive/unknown result must stop. The outline does not remove pixels, does not prove absence of a person, and its confirmation cannot be treated as a detector signal. Reusing `declareGarmentOnly(true)` after outlining would be a prohibited gate bypass.

### Narrow future prototype that could be safe

The only currently supportable product shape is **local recovery to a person-free garment crop**:

1. Separate, explicit personal-mode entry and pre-picker notice; never automatic fallback from garment intake.
2. Purpose-specific consent before any person-presence processing.
3. Local sanitize into memory; no filename/EXIF/log/metric/storage.
4. Approved local producer emits only the exact coarse input accepted by PHOTO-PERSON-03. Present/unknown stops.
5. User outlines one visible garment for guidance; a non-generative crop copies only existing pixels.
6. The crop receives a new opaque revision and is independently re-run through PHOTO-PERSON-03.
7. Only a high-confidence safely-absent crop may enter the unchanged scene declaration and quality pipeline; user declaration still yields at most `save_and_review`.
8. Original person photo and all derivatives are purged on completion/exit; only a separately consented garment-only crop could use the existing garment storage contract.

This flow analyzes no identity, body or sensitive trait and performs no inpainting. It still remains HOLD until the missing implementation and evidence gates below pass.

## Trust boundaries and ownership

| Boundary | Allowed crossing | Forbidden crossing | Owner |
|---|---|---|---|
| User → separate picker | explicit action after purpose/18+/own-photo notice | automatic fallback, third-party photo, demo asset in personal flow | Product + Privacy owner (01/05) |
| Picker → ephemeral sanitizer | bytes in memory with byte/pixel/type limits | filename/path/EXIF, durable state, logs/metrics | Photo platform owner (02/07) |
| Sanitized pixels → signal producer | local ephemeral bitmap after consent | network, telemetry, descriptors, embeddings/templates, identity/sensitive fields | Detector + Security owner (03) |
| Signal producer → presence gate | exact `{present:boolean, confidence:"high"}` for `person` and `face` | pixels, scores, landmarks, boxes, arbitrary fields | Detector owner; gate owned by photo domain (03) |
| Presence gate → orchestrator | frozen `{presence, reason_code}` | claim about identity, age, body or ownership | Photo domain owner (03/10B) |
| Bitmap → outline editor | oriented local revision | detector claims, inferred category/body data | Selection/UI owner (04) |
| Outline → cropper | validated `guidance_only` geometry bound to current revision | acceptance, upload permission, hidden-boundary completion | Selection + Photo platform owner (04/05) |
| Crop → existing intake | newly sanitized crop only after fresh safe presence result | original person image, inherited declaration or stale selection | Integration owner (10B) |
| Ephemeral memory → storage | nothing by default | person original, presence state, consent receipt, outline/crop without new approved contract | Privacy/storage owner (01/02) |
| Any PHOTO-PERSON code → network/export/telemetry | no image/derived data; metrics only after separate consent and strict 09 schema | bytes, URLs, names, hashes, coordinates, states before consent, free text | Security + Metrics owner (02/09) |
| Personal ↔ demo/other owner | no transfer | assets, outlines, attempt refs or results crossing namespaces | Integration owner (01/02/05) |

`face` in the PHOTO-PERSON-03 interface is a **coarse safety-presence signal only**. It must not expose identity, landmarks, boxes, embeddings, templates or persistent features. If the approved producer cannot prove that boundary, remove the producer and keep the capability disabled; do not broaden the gate schema.

## Interfaces to implement

```js
PersonPhotoSession.start({ mode: "personal", consent, ownerScope, operationId })
PersonPhotoSession.select(file) -> { revision, sanitizedBlob }

LocalPresenceProducer.inspect({ sanitizedBlob, abortSignal }) -> {
  person: { present: boolean, confidence: "high" },
  face: { present: boolean, confidence: "high" }
}

evaluatePersonPresenceGate({
  consentGranted: true,
  processingLocation: "local",
  mode: "personal",
  person,
  face
}) -> { presence: true | false | "unknown", reason_code }

GuidanceSelection.confirm({
  version: "manual-outline-v1",
  purpose: "guidance_only",
  source: "user_confirmed",
  image_revision,
  oriented_width,
  oriented_height,
  garment_count: 1,
  points
}) -> validated selection

LocalExistingPixelCrop.create({ sanitizedBlob, selection, abortSignal }) -> {
  revision: newOpaqueRevision,
  blob,
  source: "local_manual_outline_crop",
  network_allowed: false
}

PersonPhotoSession.dispose({ reason }) -> {
  completed,
  verifiedScopes,
  failures
}
```

Rules: one active operation; monotonic revision; `AbortSignal` at every async stage; unknown keys fail closed; stale owner/consent/revision never commits; crop uses existing pixels only; person original is never passed to wardrobe storage; no interface accepts arbitrary metadata.

## Fixable mismatches and owners

| ID | Mismatch in current outputs | Required fix | File/task owner |
|---|---|---|---|
| M1 | PHOTO-PERSON-03 validates signals but no local producer exists; tests inject them | Provide pinned, licensed, no-network/no-telemetry/no-descriptor local producer and adversarial contract tests, or keep real-photo flow disabled | PHOTO-PERSON-03 detector owner + Security owner; new isolated module/tests |
| M2 | 01 data-flow prose places presence gate before “explicit consent”, while `personPresenceGate` requires consent first | Split pre-picker notice from versioned processing consent and make processing consent precede producer/gate invocation everywhere | PHOTO-PERSON-01 Privacy/Product owner; PHOTO-PERSON-05 UX owner |
| M3 | Gate accepts `mode=demo`, while 01 permits user-selected person files only in personal mode | Integration wrapper must reject real-file sessions unless `mode=personal`; demo may use approved synthetic assets only | PHOTO-PERSON-10 integration owner; tests around `src/personPresenceGate.js` caller |
| M4 | Current `createGarmentSelection` returns only version/points/bounds/source; 04 requires purpose, revision, oriented dimensions, count, robust touching/overlap checks, epsilon and vertex cap | Add a separate PHOTO-PERSON selection validator/adapter; do not mutate current garment gate semantics | PHOTO-PERSON-04 selection/domain owner; future isolated module/tests |
| M5 | Current outline confirms immediately after geometry; 04 requires “Это та вещь?”, delete-selection, revision invalidation and full derivative purge | Add explicit review/delete state bound to revision and disposal receipt | PHOTO-PERSON-04 UI owner + PHOTO-PERSON-02 storage/privacy owner |
| M6 | Current `PhotoIntake` shows outline before scene declaration and exposes two overlapping declaration paths | Build one isolated staged PHOTO-PERSON controller/UI; do not branch or loosen current `PhotoIntake` | PHOTO-PERSON-05 Photo UI owner; PHOTO-PERSON-08 accessibility owner |
| M7 | 05 requires local crop and fresh re-check; no cropper/re-gate implementation exists | Implement existing-pixel crop in memory, new revision, fresh presence + scene + quality gates; prohibit inpainting/background removal | PHOTO-PERSON-05 photo platform owner + PHOTO-PERSON-10 integration owner |
| M8 | Existing `photoStorage` has garment consent and 30-day TTL, incompatible with 01/02 session-only person default | Create no durable person store for prototype; inventory and purge memory/object URLs on exit/pagehide/revoke | PHOTO-PERSON-01/02 privacy-storage owner |
| M9 | PHOTO-PERSON-06 fixtures are SVG, while current intake rejects SVG and they do not represent people/camera JPEG | Rasterize only inside an isolated QA harness or feed deterministic metrics; never widen production MIME allowlist; document coverage limits | PHOTO-PERSON-06 QA owner |
| M10 | 07 camera/gallery split, orientation/mirroring evidence, HEIC fallback and resource budgets are not implemented | Implement only after core privacy flow; keep HEIC fail-closed; run required real-device matrix | PHOTO-PERSON-07 mobile owner |
| M11 | Current outline lacks structured point editing, true non-visual equivalent, deterministic focus and 400% evidence | Implement region/text alternative or explicitly keep non-visual completion unsupported; run NVDA+Edge and second pairing | PHOTO-PERSON-08 accessibility/UI owner |
| M12 | PHOTO-PERSON-09 event schema/collector/goldens are specified but absent; existing telemetry dictionary is a different contract | Implement isolated consent-no-op collector only if pilot measurement is approved; it must not be prerequisite for prototype function | PHOTO-PERSON-09 metrics owner + Privacy owner |
| M13 | No frozen candidate binds 01–09 evidence to one build/dirty allowlist | Produce manifest with hashes, commands, flag state, dependency versions and all browser/device/SR/deletion outputs | QA + Release owner |

## Staged rollout

| Stage | Permitted audience/data | Required entry | Exit gate |
|---|---|---|---|
| S0 contract reconciliation | documentation only | 01–09 complete | this 10B decision recorded |
| S1 synthetic developer prototype | developers; 06 synthetic/no-person fixtures; injected signals; memory only | isolated default-off registration; no runtime route for users | state/gate/dispose tests, zero network/storage, default invariant regression |
| S2 implementation harness | developers; approved synthetic/licensed local fixtures only | M1–M9 fixed; pinned local producer; existing-pixel crop/re-gate | privacy/security code review, zero FAR on must-reject synthetic cases, verified deletion |
| S3 closed local real-person test | consenting 18+ owner of photo; no persistence/metrics by default | written 01 legal/privacy/product/security sign-off; M1–M13 closed | frozen browser/mobile/a11y evidence, zero egress/leak, deletion 100% |
| S4 small local pilot | explicit allowlist and kill switch; still default-off | independent release owner PASS; separate metrics consent if used | thresholds in 09, incident review, no open P0/P1 |
| S5 release candidate | packaged disabled by default | explicit go/no-go record | not approved by this document; production remains HOLD |

No stage may make PHOTO-PERSON the default. Failure always returns to retake/manual garment details or the unchanged one-garment/no-person flow; it never auto-switches to demo.

## Rollback

Rollback trigger: any network request, log/cache/export leak, forbidden field or inference, incomplete deletion, owner/demo mixing, stale result, person/multiple/unknown ready state, accessibility bypass, dependency drift or regression of the existing gate.

1. Disable only the PHOTO-PERSON capability registration/flag; do not change the garment-local-pilot flag or thresholds.
2. Abort producers, crop jobs and UI operations; increment generation so late results cannot commit.
3. Purge original, sanitized blob, crop, outline, preview and object URLs; verify every owned scope and report partial failure honestly.
4. Clear PHOTO-PERSON-only metrics if present. Do not delete ordinary personal wardrobe data or demo assets.
5. Reload and prove no PHOTO-PERSON UI/state/storage remains.
6. Re-run presence negative tests, current photo gate/quality/intake tests, demo/personal separation and zero-egress trace.
7. Keep the capability disabled until the owner of the triggering mismatch attaches a new frozen evidence bundle and Release/Security re-approve it.

## Release gates

### PASS for S1 synthetic developer prototype

- [x] Pure PHOTO-PERSON-03 gate is fail-closed and rejects extra identity/biometric fields.
- [x] Current outline has bounded finite normalized geometry and no network behavior.
- [x] Current unit suite passes on the inspected dirty tree (366/366).
- [ ] Isolated prototype route/module is default-off and uses no real-person fixture.
- [ ] Disposal, zero-storage, zero-egress and unchanged-default integration tests are attached.

The first three foundations are present; the final two must be completed by the integrator before even S1 is demonstrated.

### PASS for any real-person local prototype

All are mandatory:

- [ ] M1–M13 are closed or explicitly removed from scope without weakening an invariant.
- [ ] Product/Privacy/Security/counsel approve purpose, exact copy, 18+ own-photo policy, session lifecycle, third-party stop conditions and residual risk.
- [ ] Approved producer is pinned and proves local-only coarse output with no descriptors, identity/sensitive inference, network or telemetry.
- [ ] Person/face present, uncertain, missing, malformed and dependency-unavailable cases always stop; must-reject FAR is `0/N` including `save_and_review`.
- [ ] Outline remains guidance-only; existing-pixel crop gets a new revision and passes fresh presence, scene and quality gates.
- [ ] No person original enters garment storage. Default is memory-only; exit/revoke/pagehide/reload/delete/rollback verify zero owned bytes and object URLs.
- [ ] Demo/personal/owner isolation and export/log/cache/telemetry forbidden-field negatives pass.
- [ ] Network spy covers fetch, XHR, beacon, WebSocket and resource loaders and records zero PHOTO-PERSON egress.
- [ ] 320/360/390/412/430 plus supported real devices, camera/gallery/orientation/offline/resource cases pass.
- [ ] Keyboard, touch, 200%/400%, NVDA+Edge and a second supported SR/browser pairing pass without bypass.
- [ ] Frozen evidence manifest identifies build/dirty allowlist, flag state, dependency hashes/licenses, commands, fixture provenance and results.
- [ ] Rollback drill restores only the unchanged manual/single-garment paths and leaves unrelated data intact.

### Automatic accept / production

**HOLD / NO-GO in this wave.** Neither presence absence nor a manual outline is trusted garment recognition. `accepted_local`, upload, remote inference, persistence of person photos, identity/biometrics/body inference, generative editing, Auth/Supabase/VK ID, payments and retail are not approved.

## Exact safe integrator brief

1. Do not edit `photoGate`, weaken `photoQuality`, change `declareGarmentOnly`, wire `getUploadPayload`, or reuse the existing 30-day garment storage for a person original.
2. Start with S1 only: a new isolated default-off controller and view using PHOTO-PERSON-06 synthetic/no-person fixtures and injected PHOTO-PERSON-03 signals. No real photos, persistence, analytics or network.
3. Treat `evaluatePersonPresenceGate` as a policy validator, not a detector. Do not infer a signal from the outline or user confirmation.
4. Adapt the outline into a separate strict PHOTO-PERSON `guidance_only` DTO bound to image revision; confirmation must not alter gate state.
5. If proceeding beyond S1, obtain M1 owner approval first. Implement a local existing-pixel crop, assign a new revision, and run the crop through a fresh approved presence gate before the unchanged scene/quality path.
6. Dispose every original/derivative/object URL on cancel, exit, revoke, pagehide, owner change and failure. Verify, do not merely claim, zero stores and zero egress.
7. Keep personal file input physically separate from demo; demo may use only approved synthetic assets. Reject missing/unknown owner or mode.
8. Close M2–M13 with the named owners, then create one frozen evidence manifest and run all release gates above.
9. Stop and retain HOLD on any missing producer proof, P0/P1, accessibility bypass, partial delete, must-reject ready result, dependency drift or network/log/cache leak.
10. Return to PHOTO-PERSON-10 for a new reconciliation; no automatic promotion follows from unit tests or document PASS statuses.

## Final decision

**HOLD.** PHOTO-PERSON-01–09 are complete as artifacts, but several deliberately conclude HOLD and the actual implementation contains only two safe foundations: a pure coarse-signal policy gate and a guidance-only outline baseline. They can support a synthetic developer prototype after isolated wiring and disposal/egress tests. They cannot safely support a real-person prototype until the approved local signal producer, crop/re-gate lifecycle, strict selection adapter, consent/delete ownership, accessibility/mobile work and frozen evidence are complete. The default single-garment/no-person gate remains unchanged and authoritative.
