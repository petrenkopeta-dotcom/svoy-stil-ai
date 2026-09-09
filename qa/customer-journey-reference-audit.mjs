import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(
  ROOT,
  "qa-evidence",
  "customer-journey-reference-audit-2026-09-05",
);
const PORT = 43931;
const BASE = `http://127.0.0.1:${PORT}`;
const EDGE =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const pw = [
  path.join(ROOT, "node_modules", "playwright", "index.mjs"),
  "C:\\Users\\petre\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright\\index.mjs",
].find(existsSync);
if (!pw) throw Error("Playwright missing");
const { chromium } = await import(pathToFileURL(pw).href);
await mkdir(OUT, { recursive: true });
const server = spawn(
  process.execPath,
  [
    path.join(ROOT, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
  ],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_LOCAL_PILOT_PHOTO: "true" },
    stdio: "ignore",
    windowsHide: true,
  },
);
const fixture = path.join(ROOT, "public", "assets", "avatars-01-09.png");

async function transfer(page, kind, mime = "image/png") {
  await page.evaluate(
    async ({ kind, mime }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#93384c";
      ctx.fillRect(0, 0, 24, 24);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime));
      const file = new File([blob], `clipboard.${mime.split("/")[1]}`, {
        type: mime,
      });
      const zone = document.querySelector('[aria-label="Вставить фото"]');
      const event = new Event(kind, { bubbles: true, cancelable: true });
      Object.defineProperty(
        event,
        kind === "paste" ? "clipboardData" : "dataTransfer",
        {
          value:
            kind === "paste"
              ? { items: [{ kind: "file", type: mime, getAsFile: () => file }] }
              : { files: [file] },
        },
      );
      zone.dispatchEvent(event);
    },
    { kind, mime },
  );
}

async function boot(context) {
  await context.addInitScript(() => {
    sessionStorage.setItem(
      "ai-stylist:returning-user-session:v2",
      JSON.stringify({
        schemaVersion: 2,
        completed: true,
        progress: { started: true, screen: "wardrobe" },
        preferences: { goal: "Работа" },
      }),
    );
    localStorage.setItem("ai-stylist:product-tour:v1", "done");
  });
  const page = await context.newPage();
  const external = [],
    pageErrors = [],
    consoleErrors = [],
    failed = [];
  page.on("request", (r) => {
    if (![BASE, "data:", "blob:"].some((prefix) => r.url().startsWith(prefix)))
      external.push(r.url());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("requestfailed", (r) =>
    failed.push(
      `${r.method()} ${r.url()} ${r.failure()?.errorText || "failed"}`,
    ),
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  return { page, external, pageErrors, consoleErrors, failed };
}

let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const report = {
    id: "CUSTOMER-JOURNEY-REFERENCE-QA",
    widths: [],
    functional: {},
    findings: [],
    limitations: [
      "Camera validated through capture input contract/file injection; no physical camera.",
      "iOS clipboard fallback validated in Chromium; no physical iOS Safari/WebKit run.",
    ],
  };

  for (const width of [320, 360, 390, 412, 430, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      locale: "ru-RU",
      serviceWorkers: "block",
    });
    const run = await boot(context);
    const { page } = run;
    await page.locator("button.reference-entry").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    if ([390, 1280].includes(width))
      await page.screenshot({
        path: path.join(OUT, `upload-idle-${width}.png`),
        fullPage: true,
      });
    const labels = await dialog.locator("label").allTextContents();
    const uploadInputs = dialog.locator('input[type="file"]');
    const cameraCapture = await uploadInputs.nth(1).getAttribute("capture");
    const overflowIdle = await dialog.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    await uploadInputs.first().setInputFiles(fixture);
    await dialog.getByText(/Вещи ещё не выделены/).waitFor();
    await dialog.getByRole("button", { name: "Выделить вещь вручную" }).click();
    const canvas = dialog.locator(".garment-outline-canvas");
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.25);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.7);
    const circlesBefore = await dialog
      .locator(".garment-outline-frame circle")
      .evaluateAll((els) =>
        els.map((el) => [
          Number(el.getAttribute("cx")),
          Number(el.getAttribute("cy")),
        ]),
      );
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35, {
      steps: 4,
    });
    await page.mouse.up();
    const circlesAfter = await dialog
      .locator(".garment-outline-frame circle")
      .evaluateAll((els) =>
        els.map((el) => [
          Number(el.getAttribute("cx")),
          Number(el.getAttribute("cy")),
        ]),
      );
    const pointPlacement =
      Math.abs(circlesBefore[0][0] - 25) < 2 &&
      Math.abs(circlesBefore[0][1] - 25) < 2;
    const pointMoved =
      circlesAfter[0][0] > circlesBefore[0][0] + 5 &&
      circlesAfter[0][1] > circlesBefore[0][1] + 5;
    await dialog.getByRole("button", { name: /Назад к фото/ }).click();
    const backPreserves =
      (await dialog.getByText(/Вещи ещё не выделены/).isVisible()) &&
      (await dialog.locator('img[alt="Загруженный референс"]').isVisible());
    if (width === 390)
      await page.screenshot({
        path: path.join(OUT, "back-preserves-photo-390.png"),
        fullPage: true,
      });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    report.widths.push({
      width,
      labels,
      cameraCapture,
      pointPlacement,
      pointMoved,
      backPreserves,
      overflow: overflow || overflowIdle,
      ...run,
    });
    delete report.widths.at(-1).page;
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
    serviceWorkers: "block",
  });
  const run = await boot(context);
  const { page } = run;
  async function reopen() {
    await page.locator("button.reference-entry").click();
    return page.getByRole("dialog");
  }
  let dialog = await reopen();
  await transfer(page, "paste");
  await dialog.getByText(/Вещи ещё не выделены/).waitFor();
  const paste = true;
  await page.keyboard.press("Escape");
  dialog = await reopen();
  await transfer(page, "drop", "image/webp");
  await dialog.getByText(/Вещи ещё не выделены/).waitFor();
  const dragDrop = true;
  await page.keyboard.press("Escape");
  dialog = await reopen();
  await dialog.locator('input[type="file"]').nth(1).setInputFiles(fixture);
  await dialog.getByText(/Вещи ещё не выделены/).waitFor();
  const camera = true;
  await dialog.getByRole("button", { name: "Выделить вещь вручную" }).click();
  const canvas = dialog.locator(".garment-outline-canvas"),
    box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  for (const [x, y] of [
    [0.7, 0.2],
    [0.75, 0.65],
    [0.25, 0.7],
    [0.2, 0.2],
  ])
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, {
      steps: 8,
    });
  await page.mouse.up();
  const freehandPoints = await dialog
    .locator(".garment-outline-frame circle")
    .count();
  await page.screenshot({
    path: path.join(OUT, "outline-freehand-1280.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Подтвердить контур" }).click();
  await dialog.getByLabel("Категория").selectOption("top");
  await dialog.getByLabel("Цвет").fill("бордовый");
  await dialog.getByLabel("Силуэт / посадка").selectOption("straight");
  await dialog.getByRole("button", { name: "Это моя вещь" }).click();
  const reviewCorrect =
    (await dialog.locator("article.reference-card").count()) === 1;
  await page.screenshot({
    path: path.join(OUT, "review-confirmed-1280.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Сохранить подтверждённые" })
    .click();
  await page.waitForTimeout(300);
  const savedMessage = await dialog.getByText("Сохранено: 1").isVisible();
  const postSaveButtons = await dialog.getByRole("button").allTextContents();
  await page.screenshot({
    path: path.join(OUT, "post-save-dead-end-1280.png"),
    fullPage: true,
  });
  report.functional = {
    gallery: true,
    camera,
    paste,
    dragDrop,
    freehandPoints,
    reviewCorrect,
    savedMessage,
    postSaveButtons,
    explicitPostSaveActions: postSaveButtons.some((x) =>
      /Открыть гардероб|Собрать образ с этой вещью|Добавить ещё фото/.test(x),
    ),
  };
  report.desktopNetwork = {
    external: run.external,
    pageErrors: run.pageErrors,
    consoleErrors: run.consoleErrors,
    failed: run.failed,
  };
  await context.close();

  report.findings.push({
    severity: "P1",
    id: "REF-UX-POSTSAVE-001",
    status: report.functional.explicitPostSaveActions ? "closed" : "open",
    title: "После сохранения нет явного следующего шага",
    acceptance: [
      "Показать «Открыть гардероб»",
      "Показать «Собрать образ с этой вещью»",
      "Показать «Добавить ещё фото»",
      "Сохранить загруженное фото и подтверждённые позиции при переходе",
      "Не допускать повторного сохранения дубля",
    ],
  });
  report.findings.push({
    severity: "P1",
    id: "REF-UX-VISUAL-002",
    status: "open",
    title:
      "Upload-блок не принят владельцем и визуально выглядит как набор нативных controls",
    evidence: [
      "Две конкурирующие file-кнопки в одной строке",
      "Отдельная кнопка вставки дублирует инструкцию",
      "Нет единой визуальной иерархии primary/secondary/fallback",
    ],
  });
  report.findings.push({
    severity: "P2",
    id: "REF-QA-IOS-003",
    status: "open",
    title:
      "Нет фактического iOS Safari/device evidence для paste/camera fallback",
  });
  report.pass =
    report.widths.every(
      (x) =>
        x.pointPlacement &&
        x.pointMoved &&
        x.backPreserves &&
        !x.overflow &&
        !x.external.length &&
        !x.pageErrors.length &&
        !x.consoleErrors.length &&
        !x.failed.length,
    ) &&
    report.functional.gallery &&
    report.functional.camera &&
    report.functional.paste &&
    report.functional.dragDrop &&
    report.functional.reviewCorrect &&
    report.functional.savedMessage;
  report.releaseDecision =
    report.pass &&
    !report.findings.some(
      (x) => x.status === "open" && ["P0", "P1"].includes(x.severity),
    )
      ? "PASS"
      : "HOLD";
  await writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        functionalPass: report.pass,
        releaseDecision: report.releaseDecision,
        widths: report.widths.map((x) => [
          x.width,
          !x.overflow && x.pointPlacement && x.pointMoved && x.backPreserves,
        ]),
        findings: report.findings.map((x) => [x.severity, x.id, x.status]),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
