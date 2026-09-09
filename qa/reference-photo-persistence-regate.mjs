import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(import.meta.dirname, ".."),
  OUT = path.join(
    ROOT,
    "qa-evidence",
    "reference-photo-persistence-regate-2026-09-05",
  ),
  PORT = 43941,
  BASE = `http://127.0.0.1:${PORT}`,
  EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  pw = [
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
async function setup(c) {
  await c.addInitScript(() => {
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
    window.__urlQa = { create: 0, revoke: 0 };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (b) => {
      window.__urlQa.create++;
      return create(b);
    };
    URL.revokeObjectURL = (u) => {
      window.__urlQa.revoke++;
      return revoke(u);
    };
  });
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
  return { p, errors, external, failed };
}
async function importSynthetic(p) {
  await p.locator("button.reference-entry").click();
  const d = p.getByRole("dialog");
  await d
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.join(OUT, "fixture-red-blue.png"));
  await d.getByText("Вещи ещё не выделены").waitFor();
  return d;
}
async function outlineSave(p, d) {
  await d.getByRole("button", { name: "Выделить вещь вручную" }).click();
  const x = d.getByLabel("X, %"),
    y = d.getByLabel("Y, %");
  for (const [a, b] of [
    [5, 10],
    [45, 10],
    [45, 90],
    [5, 90],
  ]) {
    await x.fill(String(a));
    await y.fill(String(b));
    await d.getByRole("button", { name: "Добавить точку" }).click();
  }
  await d.getByRole("button", { name: "Подтвердить контур" }).click();
  await d.getByLabel("Категория").selectOption("top");
  await d.getByLabel("Цвет").fill("красный");
  await d.getByRole("button", { name: "Это моя вещь" }).click();
  await d.getByRole("button", { name: "Сохранить подтверждённые" }).click();
  await d.getByText("Вещь сохранена").waitFor();
}
async function imageEvidence(p) {
  const img = p.locator(".item-art.user-photo img").first();
  await img.waitFor();
  await p.waitForFunction(() => {
    const i = document.querySelector(".item-art.user-photo img");
    return i?.complete && i.naturalWidth > 0 && i.naturalHeight > 0;
  });
  return img.evaluate((i) => {
    const c = document.createElement("canvas");
    c.width = i.naturalWidth;
    c.height = i.naturalHeight;
    c.getContext("2d").drawImage(i, 0, 0);
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let k = 0; k < data.length; k += 4) {
      r += data[k];
      g += data[k + 1];
      b += data[k + 2];
      n++;
    }
    return {
      src: i.src,
      naturalWidth: i.naturalWidth,
      naturalHeight: i.naturalHeight,
      avg: { r: r / n, g: g / n, b: b / n },
      notBlank: data.some((v, k) => k % 4 !== 3 && v > 10),
    };
  });
}
async function idbCount(p) {
  return p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const q = indexedDB.open("ai-stylist-photos", 1);
        q.onerror = () => reject(q.error);
        q.onsuccess = () => {
          const db = q.result,
            tx = db.transaction("photos", "readonly"),
            r = tx.objectStore("photos").getAll();
          r.onsuccess = () => resolve(r.result.length);
          r.onerror = () => reject(r.error);
        };
      }),
  );
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
  {
    const fixtureContext = await browser.newContext({
      viewport: { width: 200, height: 100 },
      deviceScaleFactor: 1,
    });
    const fixturePage = await fixtureContext.newPage();
    await fixturePage.setContent(
      "<style>*{margin:0}body{width:200px;height:100px;background:linear-gradient(90deg,#ef2020 0 48%,#fff 48% 52%,#2048ef 52% 100%)}</style>",
    );
    await fixturePage.screenshot({
      path: path.join(OUT, "fixture-red-blue.png"),
    });
    await fixtureContext.close();
  }
  const report = {
    id: "REFERENCE-PHOTO-PERSISTENCE-REGATE",
    matrix: [],
    anchor: {},
    rollback: {},
    limitations: [],
  };
  for (const width of [320, 390, 1280]) {
    const c = await browser.newContext({
        viewport: { width, height: 844 },
        locale: "ru-RU",
        serviceWorkers: "block",
      }),
      run = await setup(c),
      d = await importSynthetic(run.p);
    await outlineSave(run.p, d);
    await d.getByRole("button", { name: "Открыть мой гардероб" }).click();
    const before = await imageEvidence(run.p),
      storedBefore = await run.p.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "ai-stylist:v1:local-warm-mvp-user:wardrobe",
            ) || "{}",
          ).data || [],
      ),
      urlStats = await run.p.evaluate(() => window.__urlQa);
    await run.p.screenshot({
      path: path.join(OUT, `wardrobe-crop-before-reload-${width}.png`),
      fullPage: true,
    });
    await run.p.reload({ waitUntil: "networkidle" });
    await run.p.getByRole("tab", { name: /Мой гардероб/ }).click();
    const after = await imageEvidence(run.p),
      storedAfter = await run.p.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "ai-stylist:v1:local-warm-mvp-user:wardrobe",
            ) || "{}",
          ).data || [],
      );
    await run.p.screenshot({
      path: path.join(OUT, `wardrobe-crop-after-reload-${width}.png`),
      fullPage: true,
    });
    const overflow = await run.p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      cropCorrect =
        before.naturalWidth >= 70 &&
        before.naturalWidth <= 90 &&
        before.naturalHeight >= 70 &&
        before.naturalHeight <= 90 &&
        before.avg.r > before.avg.b * 2 &&
        before.avg.r > 150;
    report.matrix.push({
      width,
      before,
      after,
      photoId: storedBefore[0]?.photoId,
      samePhotoId: storedBefore[0]?.photoId === storedAfter[0]?.photoId,
      idbCount: await idbCount(run.p),
      cropCorrect,
      urlStats,
      overflow,
      errors: run.errors,
      external: run.external,
      failed: run.failed,
      pass:
        before.notBlank &&
        after.notBlank &&
        cropCorrect &&
        storedBefore[0]?.photoId &&
        storedBefore[0]?.photoId === storedAfter[0]?.photoId &&
        (await idbCount(run.p)) === 1 &&
        urlStats.create >= 2 &&
        urlStats.revoke >= 1 &&
        !overflow &&
        !run.errors.length &&
        !run.external.length &&
        !run.failed.length,
    });
    await c.close();
  }
  {
    const c = await browser.newContext({
        viewport: { width: 1280, height: 844 },
        locale: "ru-RU",
        serviceWorkers: "block",
      }),
      run = await setup(c),
      d = await importSynthetic(run.p);
    await outlineSave(run.p, d);
    await d.getByRole("button", { name: "Собрать образ с этой вещью" }).click();
    const missing = await run.p
        .getByText("ДЛЯ ЯКОРЯ НЕТ ПОЛНОГО ОБРАЗА")
        .isVisible(),
      anchor = await run.p.getByText(/Оставляем «top»/).isVisible(),
      demo = await run.p
        .getByText(/пример из демонстрационного гардероба/i)
        .count();
    await run.p.getByRole("button", { name: "Вернуться в гардероб" }).click();
    const returnedImage = await imageEvidence(run.p);
    await run.p.screenshot({
      path: path.join(OUT, "anchor-returned-image-1280.png"),
      fullPage: true,
    });
    report.anchor = {
      missing,
      anchor,
      demo,
      returnedImage,
      pass: missing && anchor && demo === 0 && returnedImage.notBlank,
    };
    await c.close();
  }
  {
    const c = await browser.newContext({
        viewport: { width: 1280, height: 844 },
        locale: "ru-RU",
        serviceWorkers: "block",
      }),
      run = await setup(c),
      d = await importSynthetic(run.p);
    await d.getByRole("button", { name: "Выделить вещь вручную" }).click();
    const x = d.getByLabel("X, %"),
      y = d.getByLabel("Y, %");
    for (const [a, b] of [
      [5, 10],
      [45, 10],
      [45, 90],
      [5, 90],
    ]) {
      await x.fill(String(a));
      await y.fill(String(b));
      await d.getByRole("button", { name: "Добавить точку" }).click();
    }
    await d.getByRole("button", { name: "Подтвердить контур" }).click();
    await d.getByLabel("Категория").selectOption("top");
    await d.getByRole("button", { name: "Это моя вещь" }).click();
    await run.p.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes(":wardrobe"))
          throw new DOMException("quota", "QuotaExceededError");
        return original.call(this, k, v);
      };
    });
    await d.getByRole("button", { name: "Сохранить подтверждённые" }).click();
    await d
      .getByText("Не удалось сохранить весь набор. Гардероб не изменён.")
      .waitFor();
    await run.p.waitForTimeout(200);
    const wardrobe = await run.p.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "ai-stylist:v1:local-warm-mvp-user:wardrobe",
            ) || "{}",
          ).data || [],
      ),
      photos = await idbCount(run.p),
      urls = await run.p.evaluate(() => window.__urlQa);
    report.rollback = {
      wardrobeCount: wardrobe.length,
      photoCount: photos,
      urls,
      pass: wardrobe.length === 0 && photos === 0 && urls.revoke >= 1,
    };
    await c.close();
  }
  report.pass =
    report.matrix.every((x) => x.pass) &&
    report.anchor.pass &&
    report.rollback.pass;
  report.decision = report.pass ? "PASS" : "HOLD";
  await writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        decision: report.decision,
        matrix: report.matrix.map((x) => [
          x.width,
          x.pass,
          x.before.naturalWidth,
          x.before.naturalHeight,
          Math.round(x.before.avg.r),
          Math.round(x.before.avg.b),
        ]),
        anchor: report.anchor.pass,
        rollback: report.rollback,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
