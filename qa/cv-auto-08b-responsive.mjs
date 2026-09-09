import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, ".."),
  OUT = path.join(ROOT, "qa-evidence", "cv-auto-regression-08b"),
  PORT = 43959,
  BASE = `http://127.0.0.1:${PORT}`;
const runtime = [
  path.join(ROOT, "node_modules", "playwright", "index.mjs"),
  "C:\\Users\\petre\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright\\index.mjs",
].find(existsSync);
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!runtime) throw Error("playwright missing");
const { chromium } = await import(pathToFileURL(runtime).href);
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
    windowsHide: true,
    stdio: "ignore",
  },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const rows = [];
  for (const width of [320, 360, 390, 412, 430, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
    });
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
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator("button.reference-entry").focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: [
        ...document.querySelectorAll(
          '[role="dialog"] button,[role="dialog"] label.reference-import-card,[role="dialog"] [tabindex="0"]',
        ),
      ]
        .filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width && r.height;
        })
        .map((x) => {
          const r = x.getBoundingClientRect();
          return {
            name:
              x.getAttribute("aria-label") || x.textContent.trim().slice(0, 60),
            w: Math.round(r.width),
            h: Math.round(r.height),
            left: Math.round(r.left),
            right: Math.round(r.right),
          };
        }),
    }));
    const tooSmall = metrics.controls.filter((x) => x.w < 44 || x.h < 44),
      outOfBounds = metrics.controls.filter(
        (x) => x.left < 0 || x.right > width,
      );
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() =>
      Boolean(document.activeElement?.matches(":focus-visible")),
    );
    rows.push({
      width,
      overflow: metrics.scrollWidth > metrics.clientWidth,
      tooSmall,
      outOfBounds,
      focusVisible,
      pageErrors: errors,
    });
    await context.close();
  }
  const report = {
    id: "CV-AUTO-REGRESSION-08B-RESPONSIVE",
    rows,
    pass: rows.every(
      (x) =>
        !x.overflow &&
        !x.tooSmall.length &&
        !x.outOfBounds.length &&
        x.focusVisible &&
        !x.pageErrors.length,
    ),
  };
  await writeFile(
    path.join(OUT, "responsive.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (!report.pass) process.exitCode = 2;
} finally {
  await browser?.close();
  server.kill();
}
