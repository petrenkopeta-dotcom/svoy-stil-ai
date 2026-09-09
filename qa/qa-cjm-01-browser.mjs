import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "qa-evidence", "qa-cjm-01");
const port = 43941;
const base = `http://127.0.0.1:${port}`;
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const runtime = [
  path.join(root, "node_modules", "playwright", "index.mjs"),
  "C:\\Users\\petre\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright\\index.mjs",
].find(existsSync);
if (!runtime || !existsSync(edge))
  throw new Error("Local browser runtime unavailable");
const { chromium } = await import(pathToFileURL(runtime).href);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: root, stdio: "ignore", windowsHide: true },
);
let browser;
try {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const report = {
    id: "QA-CJM-01",
    evidenceType: "local-vite-runtime",
    matrix: [],
    mandatoryOnboardingSkip: "not-applicable-approved-flow",
  };
  for (const width of [320, 360, 390, 412, 430, 1280]) {
    const height = width === 1280 ? 800 : 844;
    const page = await browser.newPage({
      viewport: { width, height },
      locale: "ru-RU",
      reducedMotion: "reduce",
    });
    const errors = [],
      failed = [],
      external = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()}`));
    page.on("request", (r) => {
      if (
        !r.url().startsWith(base) &&
        !r.url().startsWith("data:") &&
        !r.url().startsWith("blob:")
      )
        external.push(r.url());
    });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "networkidle" });
    const landing = {
      heading: await page
        .getByRole("heading", { name: /Образ на день/ })
        .isVisible(),
      demoAlt: await page
        .getByAltText("Пример образа из демо-гардероба")
        .isVisible(),
      promise: await page.locator(".landing").innerText(),
    };
    await page.getByRole("button", { name: /Начать подбор/ }).click();
    await page.getByRole("radio", { name: /Встреча \/ выходной/ }).check();
    await page.getByRole("button", { name: /Дальше/ }).click();
    await page.getByRole("radio", { name: /По фигуре, но не тесно/ }).check();
    await page.getByRole("button", { name: /Дальше/ }).click();
    await page.getByRole("radio", { name: "Чёрный + белый" }).check();
    await page.getByRole("button", { name: /Продолжить/ }).click();
    await page.locator(".first-result").waitFor();
    const tourVisible = await page
      .locator(".product-tour")
      .isVisible()
      .catch(() => false);
    const skipVisible =
      tourVisible &&
      (await page
        .getByRole("button", { name: "Пропустить знакомство", exact: true })
        .isVisible());
    if (skipVisible)
      await page
        .getByRole("button", { name: "Пропустить знакомство", exact: true })
        .click();
    const resultVisibleAfterSkip = await page
      .locator(".first-result")
      .isVisible();
    const tourCompleted = await page.evaluate(
      () => localStorage.getItem("ai-stylist:product-tour:v1") === "done",
    );
    const resultText = await page.locator(".first-result").innerText();
    const geometry = await page.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      cards: [...document.querySelectorAll(".first-result__piece")].map(
        (el) => {
          const r = el.getBoundingClientRect();
          const art = getComputedStyle(
            el.querySelector(".first-result__piece-art"),
          );
          return {
            width: r.width,
            height: r.height,
            image: art.backgroundImage,
            position: art.backgroundPosition,
          };
        },
      ),
      undersizedActions: [
        ...document.querySelectorAll(".first-result__actions button"),
      ]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        })
        .map((el) => el.textContent.trim()),
    }));
    const actions = await page
      .locator(".first-result__actions button")
      .allTextContents();
    const screenshot = `${width}x${height}-first-demo-look.png`;
    await page.screenshot({ path: path.join(out, screenshot), fullPage: true });
    await page.getByRole("button", { name: "Открыть демо-гардероб" }).click();
    await page.locator(".page.wardrobe").waitFor();
    const wardrobeText = await page.locator(".page.wardrobe").innerText();
    const nextActionVisible = await page
      .getByRole("button", { name: /Подобрать образ/ })
      .isVisible();
    report.matrix.push({
      width,
      height,
      landing: {
        heading: landing.heading,
        demoAlt: landing.demoAlt,
        honestDemoLabel: /демо-гардероба/i.test(landing.promise),
      },
      tourVisible,
      productTourSkip: { skipVisible, resultVisibleAfterSkip, tourCompleted },
      result: {
        summaryPreserved:
          /Встреча/.test(resultText) &&
          /Сбалансированная/.test(resultText) &&
          /Чёрный \+ белый/.test(resultText),
        paletteExplained:
          /Чёрный \+ белый/.test(resultText) && /цвет/.test(resultText),
        explicitDemo:
          /демо-образ/i.test(resultText) &&
          /не твой гардероб/i.test(resultText) &&
          /не сохраняется/i.test(resultText),
        actionCount: actions.length,
        actions,
        visualCards: geometry.cards.length,
        cardsHaveImage: geometry.cards.every((x) => x.image !== "none"),
        cardPositions: geometry.cards.map((x) => x.position),
        overflow: geometry.overflow,
        undersizedActions: geometry.undersizedActions,
      },
      wardrobe: { explicitDemo: /демо/i.test(wardrobeText), nextActionVisible },
      errors,
      failed,
      external,
      screenshot,
    });
    await page.close();
  }
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "ru-RU",
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Начать подбор/ }).click();
  await page.close();
  report.pass = report.matrix.every(
    (x) =>
      x.landing.heading &&
      x.productTourSkip.skipVisible &&
      x.productTourSkip.resultVisibleAfterSkip &&
      x.productTourSkip.tourCompleted &&
      x.result.summaryPreserved &&
      x.result.paletteExplained &&
      x.result.explicitDemo &&
      x.result.actionCount === 3 &&
      x.result.visualCards >= 3 &&
      x.result.cardsHaveImage &&
      x.result.overflow === 0 &&
      x.result.undersizedActions.length === 0 &&
      x.wardrobe.explicitDemo &&
      x.errors.length === 0 &&
      x.failed.length === 0 &&
      x.external.length === 0,
  );
  await writeFile(
    path.join(out, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 2;
} finally {
  if (browser) await browser.close();
  server.kill();
}
