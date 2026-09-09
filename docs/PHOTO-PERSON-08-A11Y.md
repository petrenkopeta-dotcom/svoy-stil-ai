# PHOTO-PERSON-08 — accessibility audit and interaction contract

Date: 2026-08-21  
Scope: local photo selection, manual garment outline, scene declaration, quality/retake feedback.  
Candidate: shared dirty worktree, inspected in place. No runtime, test, auth, cloud, commerce or existing evidence file was changed.

## Decision

**HOLD for an accessibility release claim.**

The current flow has useful foundations: native file input, labelled form controls, a keyboard point-entry path, status/alert regions, visible 44 px controls in the outline helper, bounded outline geometry, local-only processing and a fail-closed single-garment/no-person declaration. Those foundations are a **design-level PASS** for preserving the safety gate and for offering more than pointer-only input.

The end-to-end experience is not yet independently proven at keyboard, screen-reader, 200% and 400% zoom. More importantly, the keyboard coordinate editor is not a genuinely non-visual garment-selection alternative: a user who cannot inspect the photo still has to know visual X/Y coordinates and receives only a point count, not a meaningful description of the selected region. There is also no accessible point list/edit model, no focus-management contract after asynchronous selection/confirmation/retake, and no demonstrated 400% reflow. These are release blockers, not reasons to weaken or bypass the current gate.

## Non-negotiable product and safety boundary

- The default remains exactly one separate garment, no person, hands or other objects. Unknown, multiple items, person present, unsupported subject or unavailable critical quality analysis must fail closed to retake/review.
- Accessibility must never add an “accept anyway”, auto-confirm, hidden default, timeout, voice guess or keyboard shortcut that bypasses outline confirmation, explicit scene declaration or quality checks.
- A non-visual alternative may change **how the user supplies equivalent evidence**, but it must require the same explicit one-garment/no-person confirmation and produce no stronger claim than the visual outline.
- Manual selection remains user guidance only: not recognition, segmentation truth, identity, body/health/demographic inference or a fit guarantee.
- All photo bytes, outline data and accessibility descriptions remain local-first. No network upload is permitted by this scope. Consent, delete and expiry controls must be explicit; demo data must never enter personal wardrobe/history/learning and personal photos must never seed demo.
- No biometrics, face identity, embeddings/templates, generative inpainting, Auth/Supabase/VK ID, payments or retail dependency may be introduced.

## Evidence inspected

| Area | Evidence | Finding |
|---|---|---|
| Capture and declarations | `src/PhotoIntake.jsx` | Native file input and labelled selects are keyboard/screen-reader compatible in principle. Two parallel declaration paths increase cognitive load. No busy announcement or focus transfer is implemented. |
| Outline pointer/keyboard UI | `src/GarmentOutlineSelector.jsx`, `src/GarmentOutlineSelector.css`, outline rules in `src/styles.css` | Pointer adds points only inside the rendered image. Keyboard users can enter X/Y and add a point. Buttons and number inputs have 44 px minimum height. The image is exposed only as “Фото для ручного выделения вещи”; point positions/shape are not exposed. |
| Geometry and gate | `src/garmentSelection.js`, `src/photoIntake.js`, `src/photoQuality.test.js`, `src/photoIntake.test.js`, `src/GarmentOutlineSelector.test.js` | Invalid geometry fails closed; manual declaration does not enable upload; person/unknown/multiple items fail closed. These tests protect the safety invariant but do not prove assistive-technology usability. |
| Existing browser evidence | `docs/qa/OUTFIT-REGRESSION-17.md`, `qa-evidence/outfit-regression-17/` | Generic keyboard, targets and explicit 200% checks were reported PASS for the larger candidate. The report does not establish a complete PHOTO-PERSON outline journey with a screen reader or 400% zoom. It is supporting evidence only. |
| Privacy contract | `docs/photo-intake-contract.md`, controller payloads | Local preparation and review are explicit; upload remains blocked. The present UI does not expose an in-flow delete/clear action for the selected source photo when the user abandons the step. |

No new browser, screen-reader or device capture was produced in this docs-only task. Static inspection cannot be promoted to production accessibility evidence.

## Audit by interaction mode

### Keyboard

Current status: **partial PASS / release HOLD**.

- Native file selection, selects, buttons and number inputs are reachable without a pointer.
- Coordinate entry can construct a valid outline, and undo/reset/confirm are native buttons.
- Missing: a documented logical tab order for the whole flow; focus placement after file analysis, outline confirmation, validation error, retake and re-selection; a way to review, select, edit or remove a specific point; keyboard instructions that do not assume pointer knowledge; and end-to-end evidence using only Tab, Shift+Tab, arrows, typing, Space and Enter.
- Number inputs clamp an empty/invalid edit through `Number(...)`, which can unexpectedly become `0`; the interaction needs error-preserving validation rather than silently relocating a point.

Required design: after a file is ready, focus the outline heading (or announce it without stealing focus when inappropriate); after confirm, focus the next declaration legend; on invalid geometry, focus/associate the error with the outline editor; on retake, focus the alert heading and leave “Choose another photo” next in order. Never trap focus inside the image frame.

### Screen reader

Current status: **HOLD**.

- Section headings, legends, labels, native controls and the final `status`/`alert` provide a usable semantic base.
- The outline frame uses `role="img"`, while its bitmap has empty alt. This avoids duplicate image announcements, but the single label does not communicate instructions, selection state, point coordinates, bounding region, geometry errors or confirmation state.
- The point count changes in a polite status region, but users cannot query a structured list of points or understand the resulting polygon non-visually.
- The generic error and success text share one `role="status"`; blocking outline errors need an associated error message (`aria-describedby`/`aria-errormessage`) and an intentional announcement strategy. Repeated keystrokes must not flood announcements.
- Busy phases (`validating`, `analyzing_quality`) and enabled/disabled transitions are not announced. File name/type and privacy state are not summarized after selection.

Required semantic model: one named “garment selection” group; concise instructions; a live but non-chatty summary; an ordered point list with “Point N, X …, Y …” and Edit/Delete controls; programmatic invalid state; explicit “selection confirmed” state; and stable headings/landmarks. Test with at least NVDA + Edge and one additional screen-reader/browser combination chosen by the owner.

### Zoom and reflow at 200% / 400%

Current status: **200% supporting evidence only; 400% HOLD**.

- The outline layout wraps and changes action buttons to a grid on narrow screens, which is promising.
- The frame uses viewport-relative fixed height (`48–52vh`), and the broader outline rules do not prove that instructions, image, coordinate controls, errors and actions remain available without two-dimensional scrolling at 400%.
- The 88 px coordinate fields and dense side-by-side controls may become difficult to understand even when they technically wrap.

Acceptance must be tested as reflow, not browser/device emulation alone: at 1280 CSS px use 200% and 400% browser zoom (equivalent 640 and 320 CSS px viewport where supported), plus 320 CSS px width at default zoom. No page-level horizontal scroll, overlap, clipping, lost focus indicator or obscured status/action is allowed. Content requiring two-dimensional inspection may remain inside the photo/selection viewport, but all controls and text must reflow outside it; zooming the image must not be the only way to complete the flow.

### Non-visual garment-selection alternative

Current status: **HOLD — coordinate entry is not sufficient**.

Provide an equivalent path named, for example, “Describe the garment area instead”. Minimum safe contract:

1. User selects one of a small set of spatial regions: whole image, centre, upper/lower/left/right half, or a 3×3 grid cell/range. Every option is text-labelled and has an optional tactile/keyboard-friendly grid representation.
2. User declares whether the garment is fully inside that region and whether anything else/person/hands is present. “No” or “not sure” leads to retake guidance.
3. The system creates a coarse local guidance region, visibly and semantically marked as user-described and untrusted. It must not infer the garment boundary or silently upgrade confidence.
4. A review summary reads back region, inclusion answer, one-garment answer and no-person answer before confirmation.
5. If the user cannot provide equivalent evidence, offer “Save photo locally as draft and finish later” or “Use garment details without a photo”, where product policy permits. Neither path may mark a photo as accepted or weaken the gate.

An assisted-human description is out of scope unless a later privacy review defines explicit consent, transmission, retention and deletion; it is not a dependency for this local-first wave.

### Motor and touch

Current status: **partial PASS / HOLD**.

- Outline buttons/inputs meet a 44 px minimum-height baseline; pointer placement is bounded to the visible image.
- The canvas uses `touch-action:none`, so it can suppress page panning whenever a gesture starts in a large portion of the screen. Single-point `pointerdown` gives no drag correction, snapping, magnifier, enlarged handle or point-specific removal. The drawn point radius is visually small and is not itself an interactive target.
- Accidental taps can create many points; only last-point undo is available. Confirming a complex outline can therefore demand high precision and repeated correction.

Required interaction: keep page scrolling available outside a clearly entered edit mode; provide explicit “Add point” mode and exit, large draggable handles with at least 44×44 CSS px hit regions, keyboard/numeric editing, delete-any-point, undo/redo, and no time limit or gesture-only action. Test touch, mouse, trackpad, switch-style sequential navigation and one coarse-pointer device. Pointer capture must be released on cancel/unmount.

### Cognitive load and error recovery

Current status: **HOLD**.

- The screen asks for an outline, then offers both a yes/no shortcut and a five-field “quick check”. The two paths overlap and make it unclear which is required or authoritative.
- Coordinate percentages and geometry terminology (“контур пересекает сам себя”) are implementation-shaped. They do not explain how to recover in small, concrete steps.
- Disabled fieldsets/buttons hide prerequisites through state rather than explaining them at the point of action.

Required flow: one linear sequence — Choose photo → Choose selection method → Confirm one garment/no person → Check frame quality → Review local-only summary → Save locally or retake. Show one primary action per step, preserve entered answers on recoverable errors, add a visible “Back”, and use concrete guidance such as “Remove the last crossing point” or “Choose ‘Start again’”. A short persistent privacy note should say what stays local, what will be saved, and how to delete it.

## Risks and required mitigations

| ID | Severity | Risk | Mitigation / release evidence |
|---|---:|---|---|
| A11Y-01 | P0 | Accessibility alternative bypasses the single-garment/no-person gate | Contract and tests assert identical declaration/quality prerequisites and fail-closed unknowns for every input method; no “accept anyway”. |
| A11Y-02 | P1 | Blind user cannot form or verify a visual polygon | Ship the coarse text/grid alternative and structured read-back, or keep the feature HOLD for non-visual completion. |
| A11Y-03 | P1 | Focus is lost across async analysis, confirmation or retake | Define/test focus destinations and announcements for every state transition, including replacement photo and error recovery. |
| A11Y-04 | P1 | 400% zoom clips controls/status or causes two-axis page scrolling | Frozen-candidate browser evidence at 200% and 400%, screenshots plus DOM overflow/focus assertions. |
| A11Y-05 | P1 | Large `touch-action:none` region blocks scrolling; small points require precision | Explicit edit mode, pan-safe layout, large handles, point edit/delete and coarse-pointer testing. |
| A11Y-06 | P1 | Duplicate declaration paths cause contradictory answers or accidental decisions | Replace with one staged declaration path and one authoritative state model. |
| A11Y-07 | P1 | Selected local photo cannot be explicitly cleared from this step | Add visible “Remove selected photo” that revokes the object URL, clears controller/temporary/draft state and announces completion; verify deletion receipt where persistence exists. |
| A11Y-08 | P2 | Live region becomes silent or overly verbose | Announce phase and material state changes once; keep point-by-point chatter opt-in/queryable; test actual AT output. |
| A11Y-09 | P2 | Invalid numeric input silently clamps to a misleading coordinate | Preserve raw input, show range error, associate it with the field, and block Add until valid. |
| A11Y-10 | P2 | Privacy/demo boundary is invisible to assistive technology | Include text, not color/icon alone: “Personal photo, stored only on this device”; never expose demo actions as personal save. |

## Acceptance criteria

All criteria are mandatory for PHOTO-PERSON-08 accessibility PASS:

1. **Gate parity:** pointer, keyboard-coordinate and non-visual-region paths all require a valid selection, explicit exactly-one-garment/no-person answers and the unchanged critical quality gate. Unknown fails closed. Automated tests prove no bypass.
2. **Keyboard completion:** a user completes select → selection → declaration → review/retake → local save/delete using keyboard only, with logical order, visible focus and no trap. Every point can be reviewed, edited and deleted without pointer input.
3. **Screen-reader completion:** names, roles, states, instructions, point/region summary, busy phases, errors, confirmation and local/privacy status are announced accurately. Blocking errors are programmatically associated. NVDA + Edge and one additional supported pairing pass scripted transcripts.
4. **True non-visual alternative:** text/grid region selection and read-back can complete the same local review contract without inspecting pixels or entering guessed coordinates. It makes no inferred garment claim and offers safe draft/no-photo exits when evidence is insufficient.
5. **Zoom/reflow:** 200% and 400% browser zoom plus 320 CSS px pass without page-level horizontal scrolling, clipped/overlapping controls, obscured status, loss of content or focus. Text spacing overrides do not break the flow.
6. **Touch/motor:** all actionable targets are at least 44×44 CSS px or have equivalent spacing; no precision-only or gesture-only step; page scroll remains possible; add/edit/delete/undo are available; accidental touches are recoverable.
7. **Cognitive clarity:** one linear declaration route, plain-language recovery, visible prerequisite explanations, Back/Retake/Remove actions, preserved recoverable input and no time limits.
8. **Status and focus:** deterministic focus/announcement behavior exists for select start, analysis complete/fail, invalid outline, confirmation, retake, replacement and deletion. Async changes do not unexpectedly move focus while the user is typing.
9. **Local privacy/delete:** zero external photo/outline/description requests; selected and persisted photo data can be explicitly removed; object URLs and temporary state are cleared; deletion is announced. Demo and personal stores remain separated.
10. **Regression evidence:** run on a frozen candidate with exact commit/dirty allowlist fingerprint. Attach keyboard transcript, screen-reader transcript, 200/400 screenshots, overflow/focus/target assertions, touch/coarse-pointer results, zero-egress log and gate-parity test output. Static source inspection alone is insufficient.

## Dependencies and ownership

| Dependency | Owner | Exit evidence |
|---|---|---|
| Unified staged capture/outline state model and focus contract | Photo UI owner | Component/integration tests for every transition and error destination |
| Accessible point editor and coarse non-visual region selector | Design system + Photo UI | Keyboard and AT component tests; usability sign-off with non-visual workflow |
| Single-garment gate parity | Photo controller/domain owner | Table-driven tests across all selection methods; mutation/bypass negative tests |
| Local delete, temporary cleanup and privacy copy | Privacy/storage owner | Browser storage diff, object-URL cleanup assertion, explicit delete receipt/announcement |
| 200%/400% reflow and touch matrix | Independent QA | Frozen-candidate artifacts at required widths/zoom and real/coarse pointer coverage |
| Screen-reader validation | Accessibility QA | NVDA + Edge transcript and second supported pairing; issue log closed or accepted with owner/date |
| Demo/personal separation | Integration owner | Provenance/store assertions and no cross-mode persistence |

## Release gate

Current result: **HOLD**.

Move to **PASS** only when all ten acceptance criteria have fresh frozen-candidate evidence and no open P0/P1. Existing generic responsive/accessibility evidence may be reused only when its candidate fingerprint and exact PHOTO-PERSON journey match; otherwise rerun it. If the non-visual alternative is deferred, the product must describe the limitation honestly and must not claim the photo-outline journey accessible to screen-reader users.
