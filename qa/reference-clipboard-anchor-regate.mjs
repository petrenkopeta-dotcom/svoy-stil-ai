import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(import.meta.dirname, ".."),
  OUT = path.join(
    ROOT,
    "qa-evidence",
    "reference-clipboard-anchor-regate-2026-09-05",
  ),
  PORT = 43937,
  BASE = `http://127.0.0.1:${PORT}`,
  EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  fixture = path.join(ROOT, "public", "assets", "avatars-01-09.png");
const pw = [
    path.join(ROOT, "node_modules", "playwright", "index.mjs"),
    "C:\\Users\\petre\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright\\index.mjs",
  ].find(existsSync),
  { chromium } = await import(pathToFileURL(pw).href);
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
async function context(browser, width = 1280, clip = "success") {
  const c = await browser.newContext({
    viewport: { width, height: 844 },
    locale: "ru-RU",
    serviceWorkers: "block",
  });
  await c.addInitScript((clip) => {
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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: async () => {
          if (clip === "denied")
            throw new DOMException("denied", "NotAllowedError");
          const b = new Blob(
            [
              new Uint8Array([
                137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0,
                0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
              ]),
            ],
            { type: "image/png" },
          );
          return [{ types: ["image/png"], getType: async () => b }];
        },
      },
    });
  }, clip);
  return c;
}
async function pageFor(c) {
  const p = await c.newPage(),
    errors = [],
    external = [],
    failed = [];
  p.on("pageerror", (e) => errors.push(`page:${e}`));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(`console:${m.text()}`);
  });
  p.on("request", (r) => {
    if (![BASE, "blob:", "data:"].some((x) => r.url().startsWith(x)))
      external.push(r.url());
  });
  p.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()}`));
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.locator("button.reference-entry").click();
  return { p, d: p.getByRole("dialog"), errors, external, failed };
}
async function eventPaste(p, target, mode) {
  return p.evaluate(
    async ({ target, mode }) => {
      const c = document.createElement("canvas");
      c.width = c.height = 4;
      const b = await new Promise((r) => c.toBlob(r, "image/png")),
        f = new File([b], "p.png", { type: "image/png" }),
        root = document.querySelector(target);
      root.focus();
      const e = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(e, "clipboardData", {
        value:
          mode === "files"
            ? { items: [], files: [f] }
            : {
                items: [
                  { kind: "file", type: "image/png", getAsFile: () => f },
                ],
                files: [],
              },
      });
      root.dispatchEvent(e);
      return document.activeElement === root;
    },
    { target, mode },
  );
}
async function saveOne(p, d) {
  await d.locator('input[type="file"]').first().setInputFiles(fixture);
  await d.getByText("Вещи ещё не выделены").waitFor();
  await d.getByRole("button", { name: "Выделить вещь вручную" }).click();
  const x = d.getByLabel("X, %"),
    y = d.getByLabel("Y, %");
  for (const [a, b] of [
    [15, 15],
    [70, 15],
    [70, 70],
    [15, 70],
  ]) {
    await x.fill(String(a));
    await y.fill(String(b));
    await d.getByRole("button", { name: "Добавить точку" }).click();
  }
  await d.getByRole("button", { name: "Подтвердить контур" }).click();
  await d.getByLabel("Категория").selectOption("top");
  await d.getByLabel("Цвет").fill("бордовый");
  await d.getByRole("button", { name: "Это моя вещь" }).click();
  await d.getByRole("button", { name: "Сохранить подтверждённые" }).click();
  await d.getByText("Вещь сохранена").waitFor();
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
    id: "REFERENCE-CLIPBOARD-ANCHOR-REGATE",
    clipboard: {},
    matrix: [],
    anchor: {},
    limitations: ["No physical iOS Safari/device run."],
  };
  for (const width of [320, 390, 1280]) {
    const c = await context(browser, width),
      r = await pageFor(c);
    await r.p.screenshot({
      path: path.join(OUT, `clipboard-entry-${width}.png`),
      fullPage: true,
    });
    const overflow =
      (await r.p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )) || (await r.d.evaluate((e) => e.scrollWidth > e.clientWidth));
    report.matrix.push({
      width,
      overflow,
      errors: r.errors,
      external: r.external,
      failed: r.failed,
      pass:
        !overflow && !r.errors.length && !r.external.length && !r.failed.length,
    });
    await c.close();
  }
  for (const [name, target, mode] of [
    ["items_card", "button.reference-import-card", "items"],
    ["files_zone", ".reference-import-drop", "files"],
  ]) {
    const c = await context(browser),
      r = await pageFor(c),
      focused = await eventPaste(r.p, target, mode);
    await r.d.getByText("Вещи ещё не выделены").waitFor();
    const previews = await r.d
        .locator('img[alt="Загруженный референс"]')
        .count(),
      headings = await r.d.getByText(/Мы нашли образ/).count();
    report.clipboard[name] = {
      focused,
      previews,
      headings,
      noDoubleImport: previews === 1 && headings === 1,
      errors: r.errors,
      external: r.external,
      pass:
        focused &&
        previews === 1 &&
        headings === 1 &&
        !r.errors.length &&
        !r.external.length,
    };
    await c.close();
  }
  {
    const c = await context(browser, 1280, "success"),
      r = await pageFor(c);
    await r.p.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          read: async () => {
            const c = document.createElement("canvas");
            c.width = c.height = 4;
            const b = await new Promise((resolve) =>
              c.toBlob(resolve, "image/png"),
            );
            return [{ types: ["image/png"], getType: async () => b }];
          },
        },
      }),
    );
    await r.d.getByRole("button", { name: "Вставить фото" }).click();
    await r.d.getByText("Вещи ещё не выделены").waitFor();
    report.clipboard.apiSuccess = {
      pass: true,
      errors: r.errors,
      external: r.external,
    };
    await c.close();
  }
  {
    const c = await context(browser, 1280, "denied"),
      r = await pageFor(c);
    await r.d.getByRole("button", { name: "Вставить фото" }).click();
    await r.d.getByRole("alert").waitFor();
    const text = await r.d.getByRole("alert").innerText();
    report.clipboard.apiDenied = {
      text,
      pass: /permission|denied|разреш|image_import_permission_denied/i.test(
        text,
      ),
      errors: r.errors,
      external: r.external,
    };
    await c.close();
  }
  {
    const c = await context(browser),
      r = await pageFor(c);
    await saveOne(r.p, r.d);
    const stored = await r.p.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "ai-stylist:v1:local-warm-mvp-user:wardrobe",
            ) || "{}",
          ).data || [],
      ),
      savedId = stored[0]?.id;
    await r.d
      .getByRole("button", { name: "Собрать образ с этой вещью" })
      .click();
    await r.p.waitForTimeout(200);
    const missing = await r.p
        .getByText("ДЛЯ ЯКОРЯ НЕТ ПОЛНОГО ОБРАЗА")
        .isVisible()
        .catch(() => false),
      anchorCopy = await r.p
        .getByText(/Оставляем «top»/)
        .isVisible()
        .catch(() => false),
      demoCopy = await r.p
        .getByText(/пример из демонстрационного гардероба/i)
        .count(),
      visibleDemo = await r.p.locator('[data-mode="demo"],.demo-badge').count();
    await r.p.screenshot({
      path: path.join(OUT, "personal-anchor-missing-state-1280.png"),
      fullPage: true,
    });
    report.anchor = {
      savedId,
      storedCount: stored.length,
      sourceMode: stored[0]?.source_mode,
      missing,
      anchorCopy,
      demoCopy,
      visibleDemo,
      errors: r.errors,
      external: r.external,
      failed: r.failed,
      pass:
        Boolean(savedId) &&
        stored.length === 1 &&
        stored[0]?.source_mode === "reference" &&
        missing &&
        anchorCopy &&
        demoCopy === 0 &&
        visibleDemo === 0 &&
        !r.errors.length &&
        !r.external.length &&
        !r.failed.length,
    };
    await c.close();
  }
  report.pass =
    report.matrix.every((x) => x.pass) &&
    Object.values(report.clipboard).every((x) => x.pass) &&
    report.anchor.pass;
  report.decision = report.pass ? "PASS" : "HOLD";
  await writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        decision: report.decision,
        matrix: report.matrix.map((x) => [x.width, x.pass]),
        clipboard: Object.fromEntries(
          Object.entries(report.clipboard).map(([k, v]) => [k, v.pass]),
        ),
        anchor: report.anchor.pass,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
