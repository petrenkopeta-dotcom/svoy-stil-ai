import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(
  ROOT,
  "qa-evidence",
  "reference-variant02-regate-2026-09-05",
);
const PORT = 43933,
  BASE = `http://127.0.0.1:${PORT}`;
const EDGE =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const fixture = path.join(ROOT, "public", "assets", "avatars-01-09.png");
const pw = [
  path.join(ROOT, "node_modules", "playwright", "index.mjs"),
  "C:\\Users\\petre\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright\\index.mjs",
].find(existsSync);
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

async function setup(context) {
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
  const page = await context.newPage(),
    errors = [],
    external = [],
    failed = [];
  page.on("pageerror", (e) => errors.push(`page:${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console:${m.text()}`);
  });
  page.on("request", (r) => {
    if (![BASE, "blob:", "data:"].some((p) => r.url().startsWith(p)))
      external.push(r.url());
  });
  page.on("requestfailed", (r) =>
    failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`),
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  return { page, errors, external, failed };
}
async function open(page) {
  await page.locator("button.reference-entry").click();
  return page.getByRole("dialog");
}
async function saveOne(page) {
  const d = await open(page);
  await d.locator('input[type="file"]').first().setInputFiles(fixture);
  await d.getByText("Вещи ещё не выделены").waitFor();
  await d.getByRole("button", { name: "Выделить вещь вручную" }).click();
  const x = d.getByLabel("X, %"),
    y = d.getByLabel("Y, %");
  for (const [px, py] of [
    [15, 15],
    [70, 15],
    [70, 70],
    [15, 70],
  ]) {
    await x.fill(String(px));
    await y.fill(String(py));
    await d.getByRole("button", { name: "Добавить точку" }).click();
  }
  await d.getByRole("button", { name: "Подтвердить контур" }).click();
  await d.getByLabel("Категория").selectOption("top");
  await d.getByLabel("Цвет").fill("бордовый");
  await d.getByRole("button", { name: "Это моя вещь" }).click();
  await d.getByRole("button", { name: "Сохранить подтверждённые" }).click();
  await d.getByText("Вещь сохранена").waitFor();
  return d;
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
    id: "REFERENCE-VARIANT02-REGATE",
    matrix: [],
    routes: {},
    limitations: [
      "Real iOS Safari/device camera and clipboard not executed; Chromium contract/fallback only.",
    ],
  };
  for (const width of [320, 360, 390, 412, 430, 1280]) {
    const c = await browser.newContext({
        viewport: { width, height: 844 },
        locale: "ru-RU",
        serviceWorkers: "block",
      }),
      run = await setup(c),
      d = await open(run.page);
    await d.waitFor();
    await run.page.screenshot({
      path: path.join(OUT, `variant02-upload-${width}.png`),
      fullPage: true,
    });
    const cards = await d.locator(".reference-import-card").count(),
      nativeVisible = await d.locator('input[type="file"]').evaluateAll((es) =>
        es.some((e) => {
          const s = getComputedStyle(e),
            r = e.getBoundingClientRect();
          return s.opacity !== "0" && r.width > 2 && r.height > 2;
        }),
      );
    const drop = await d
      .getByRole("region", { name: "Зона перетаскивания и вставки фото" })
      .isVisible();
    const overflow =
      (await run.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )) || (await d.evaluate((e) => e.scrollWidth > e.clientWidth));
    const targets = await d
      .locator("button,.reference-import-card")
      .evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            text: (e.innerText || e.textContent || "").trim(),
            w: r.width,
            h: r.height,
          };
        }),
      );
    const touch44 = targets.every((x) => x.w >= 44 && x.h >= 44),
      firstFocus = await run.page.evaluate(
        () =>
          document.activeElement?.className ||
          document.activeElement?.getAttribute("aria-label"),
      );
    await run.page.keyboard.press("Tab");
    const tabFocusVisible = await run.page.evaluate(
      () => document.activeElement !== document.body,
    );
    report.matrix.push({
      width,
      cards,
      drop,
      nativeVisible,
      overflow,
      touch44,
      undersized: targets.filter((x) => x.w < 44 || x.h < 44),
      firstFocus,
      tabFocusVisible,
      errors: run.errors,
      external: run.external,
      failed: run.failed,
      pass:
        cards === 3 &&
        drop &&
        !nativeVisible &&
        !overflow &&
        touch44 &&
        tabFocusVisible &&
        !run.errors.length &&
        !run.external.length &&
        !run.failed.length,
    });
    await c.close();
  }
  for (const [key, label] of [
    ["build", "Собрать образ с этой вещью"],
    ["wardrobe", "Открыть мой гардероб"],
    ["another", "Добавить ещё фото"],
  ]) {
    const c = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "ru-RU",
        serviceWorkers: "block",
      }),
      run = await setup(c),
      d = await saveOne(run.page);
    await run.page.screenshot({
      path: path.join(OUT, `saved-before-${key}.png`),
      fullPage: true,
    });
    await d.getByRole("button", { name: label }).click();
    await run.page.waitForTimeout(150);
    const dialogVisible = await run.page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false),
      wardrobeCount = await run.page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "ai-stylist:v1:local-warm-mvp-user:wardrobe",
            ) || "{}",
          ).data?.length || 0,
      );
    let destination = false;
    if (key === "build")
      destination = await run.page
        .getByText("Что оставим")
        .isVisible()
        .catch(() => false);
    if (key === "wardrobe")
      destination =
        !dialogVisible &&
        (await run.page
          .getByRole("tab", { name: /Мой гардероб/ })
          .isVisible()
          .catch(() => false));
    if (key === "another")
      destination =
        dialogVisible &&
        (await run.page
          .getByText("Как добавить фото?")
          .isVisible()
          .catch(() => false));
    await run.page.screenshot({
      path: path.join(OUT, `route-after-${key}.png`),
      fullPage: true,
    });
    report.routes[key] = {
      label,
      destination,
      dialogVisible,
      wardrobeCount,
      statePreserved: wardrobeCount === 1,
      errors: run.errors,
      external: run.external,
      failed: run.failed,
      pass:
        destination &&
        wardrobeCount === 1 &&
        !run.errors.length &&
        !run.external.length &&
        !run.failed.length,
    };
    await c.close();
  }
  report.pass =
    report.matrix.every((x) => x.pass) &&
    Object.values(report.routes).every((x) => x.pass);
  report.releaseDecision = report.pass ? "PASS" : "HOLD";
  await writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        decision: report.releaseDecision,
        matrix: report.matrix.map((x) => [
          x.width,
          x.pass,
          x.overflow,
          x.touch44,
        ]),
        routes: Object.fromEntries(
          Object.entries(report.routes).map(([k, v]) => [k, v.pass]),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
