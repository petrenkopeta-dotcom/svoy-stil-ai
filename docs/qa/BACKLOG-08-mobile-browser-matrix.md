# BACKLOG-08 P1 — Mobile/browser regression matrix

Status: **HOLD** (2026-08-16).

## Scope and evidence

Independent Microsoft Edge browser run of the current active copy at requested widths 320/360/390/412/430. The run uses a fresh, touch-enabled browser context per width, a local-only seeded personal garment, real keyboard input, DOM geometry, request/console/page-error listeners and full-page PNGs. It does not use the CSS contract tests as evidence and does not change `src/main.jsx` or product UI.

- Machine-readable evidence: `qa-evidence/backlog-08-mobile-matrix/matrix.json`
- Screenshots: `qa-evidence/backlog-08-mobile-matrix/{320,360,390,412,430}x844-wardrobe.png`
- Reproduction harness: `scripts/mobile-browser-matrix.mjs`
- Requirements: [Реестр функций и A/B-визуалы · 16.08.2026](https://app.notion.com/p/3be4f57a001481a8841aef426bb3b1d9?pvs=204), [Полный аудит · 14.08.2026](https://app.notion.com/p/3bc4f57a001481b2b8bef9f83910c71f?pvs=204)

## Matrix

| Requested viewport | Effective layout viewport | Overflow/mobile contract | Touch ≥44 | Keyboard traversal | Tabs | Dialogs | Console/page errors | External network before consent |
|---:|---:|---|---|---|---|---|---|---|
| 320 | 980 | FAIL | FAIL (12) | PASS | PASS | FAIL | FAIL (1 console 404) | PASS (0) |
| 360 | 980 | FAIL | FAIL (12) | PASS | PASS | FAIL | PASS | PASS (0) |
| 390 | 980 | FAIL | FAIL (12) | PASS | PASS | FAIL | PASS | PASS (0) |
| 412 | 981 | FAIL | FAIL (12) | PASS | PASS | FAIL | PASS | PASS (0) |
| 430 | 980 | FAIL | FAIL (12) | PASS | PASS | FAIL | PASS | PASS (0) |

## Reproducible defects

### B08-01 · P1 · Mobile viewport is not activated

At all five requested widths Edge reports a 980/981 CSS-pixel layout viewport and renders the desktop header/layout scaled down. `index.html` has no mobile viewport declaration. The PNGs visually confirm the desktop canvas at every requested device width. Therefore the 320–430 mobile gate is not satisfied even though isolated CSS contract tests exist.

Reproduce: run the harness, then inspect `matrix[*].geometry.viewport.width`, `documentWidth`, and the corresponding PNG.

### B08-02 · P1 · Twelve visible interactive targets are below 44 CSS px

Every matrix entry reports 12 undersized controls. The repeated set includes the 30 px logo button, 36 px desktop navigation buttons, 22 px weather button, six 30 px garment-hint selects, and the 30 px “Сохранить подсказки” button. The missing effective mobile viewport contributes to the desktop controls remaining active, but the browser measurement itself is the acceptance evidence.

Reproduce: inspect `matrix[*].geometry.undersized`; every entry contains measured width/height and label.

### B08-03 · P1 · Local-profile dialog does not lock background scrolling

All three dialog contours have a dialog role, trap focus, close on Escape and return focus to the opener. Add-item and delete-garment set `body.style.overflow = "hidden"`; local-profile leaves it empty at all five widths. This makes dialog behaviour inconsistent and permits background scrolling while the profile dialog is open.

Reproduce: inspect `matrix[*].dialogs`. The `local-profile.opened.bodyOverflow` value is empty; the other two are `hidden`.

### B08-04 · P2 · Intermittent console 404 on the first clean context

The 320 run recorded `Failed to load resource: the server responded with a status of 404 (Not Found)`. There was no `pageerror`, and later widths were clean. The emitted console event does not identify a URL, so this is kept as an intermittent, unresolved defect rather than attributed to a product resource without proof.

Reproduce: inspect `matrix[0].consoleMessages`. Rerun to determine whether the first-context error is stable in the integrator environment.

## Passing evidence

- Keyboard traversal completed a visible focus cycle at all widths; no invisible focused elements were observed.
- Wardrobe tabs expose exactly one selected/tabbable tab; ArrowRight moves focus and selection to the controlled visible tabpanel at all widths.
- Add-item and delete-garment dialogs pass role, focus trap, Escape close, scroll lock and focus restoration.
- Profile dialog passes role, focus trap, Escape close and focus restoration; only scroll lock fails.
- No external request was observed before consent at any width. Requests were same-origin local Vite/module/assets only.
- No page exception was observed.

## Run locally

1. Build: `npm run build`.
2. Run: `node scripts/mobile-browser-matrix.mjs`.
3. Exit code `0` means all matrix gates pass; exit code `2` means evidence was written but one or more gates are on HOLD.

The harness uses installed `playwright` when available and otherwise the bundled Codex workspace runtime. Override `EDGE_PATH` or `QA_PORT` if needed.

## Integrator note

Keep the release on **HOLD**. Integrate only this harness/report/evidence set. Do not treat the existing CSS tests as closure. After product owners separately fix B08-01 through B08-03, rerun the same harness and require five passing widths, zero console/page errors, and zero external pre-consent requests. B08-04 should be rerun and attributed by URL before closure. No production AI, QR, auth, A/B visual, or avatar claim is established by this work.
