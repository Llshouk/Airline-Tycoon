/* Optional actual-app acceptance; compile helpers with pnpm test before running. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { fixture, saved, layout } = require("./verifyMapUi.cjs");
const sharp = require("sharp");
const url = process.env.UI_CHECK_URL || "http://localhost:3015";
const output = path.join(__dirname, "../.test-build");

async function enter(browser, base, viewport, failVector = false, noWebgl = false) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.addInitScript(({ game, noWebgl }) => {
    delete Navigator.prototype.serviceWorker;
    Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    Object.defineProperty(window, "indexedDB", { value: undefined });
    localStorage.setItem("airline-tycoon-language", "en");
    localStorage.setItem("airline-tycoon-map-engine", "2d");
    localStorage.setItem("airline-tycoon-v1", JSON.stringify({ state: { game, notice: null }, version: 4 }));
    if (noWebgl) {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl2" ? null : original.call(this, type, ...args);
      };
    }
  }, { game: fixture(base), noWebgl });
  if (failVector) await context.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  const page = await context.newPage();
  const errors = [], imagery = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error" || message.location().url.endsWith("/favicon.ico")) return;
    if (failVector && (message.location().url.includes("openfreemap.org") || message.text().includes("AJAXError"))) return;
    errors.push(message.text());
  });
  page.on("request", (request) => { if (/gibs\.earthdata|api\.mapbox|arcgis\.com|maps\.google/.test(request.url())) imagery.push(request.url()); });
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: "Continue Offline", exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true }); window.dispatchEvent(new Event("online")); });
  return { page, context, errors, imagery };
}

async function pixelCheck(canvas) {
  const buffer = await canvas.screenshot();
  const stats = await sharp(buffer).stats();
  assert.ok(stats.channels.slice(0, 3).every((channel) => channel.stdev > 8), "Map canvas must contain real rendered detail");
  return buffer;
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const [base, width, height] of [["lhr", 1440, 1000], ["hkg", 390, 844], ["jfk", 320, 740], ["lax", 844, 390]]) {
      const { page, context, errors, imagery } = await enter(browser, base, { width, height });
      const canvas = page.locator('canvas[data-openfreemap-ready="true"]');
      await canvas.waitFor({ timeout: 60000 });
      const before = await saved(page);
      assert.equal(before.baseAirportId, base, "The test airport must be present in the game airport database");
      await page.getByRole("button", { name: "Focus Base", exact: true }).click();
      await page.waitForTimeout(1200);
      await canvas.waitFor({ timeout: 60000 });
      await pixelCheck(canvas);
      await layout(page, width);
      await page.screenshot({ path: path.join(output, `openfreemap-${base}-${width}.png`) });
      assert.ok((await page.locator(".leaflet-control-attribution").innerText()).includes("OpenFreeMap"));
      const camera = await page.locator(".leaflet-map-pane").getAttribute("style");
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.getByRole("button", { name: "3D Globe", exact: true }).click();
        await page.locator(".airline-maplibre-globe canvas").waitFor({ timeout: 60000 });
        await page.waitForTimeout(500);
        await pixelCheck(page.locator(".airline-maplibre-globe canvas"));
        if (!cycle) {
          await page.getByRole("button", { name: "Focus Base", exact: true }).click();
          await page.waitForTimeout(1600);
          await page.screenshot({ path: path.join(output, `openfreemap-${base}-${width}-globe.png`) });
        }
        await page.getByRole("button", { name: "2D Map", exact: true }).click();
        await canvas.waitFor({ timeout: 60000 });
        assert.equal(await page.locator(".leaflet-map-pane").getAttribute("style"), camera);
        assert.equal(await page.locator('.leaflet-container canvas[data-openfreemap-ready]').count(), 1);
      }
      assert.equal((await saved(page)).money, before.money);
      assert.deepEqual((await saved(page)).fleet, before.fleet);
      assert.deepEqual(errors, []);
      assert.deepEqual(imagery, []);
      await context.close();
      console.log(`PASS ${base} ${width}x${height}: airport detail, pixels, attribution, camera, engine cycles, unchanged save, no paid imagery.`);
    }
    for (const noWebgl of [false, true]) {
      const { page, context, errors, imagery } = await enter(browser, "lhr", { width: 390, height: 844 }, !noWebgl, noWebgl);
      await page.locator(".leaflet-tile-loaded").first().waitFor({ timeout: 60000 });
      await page.getByText("Airport detail map unavailable. Using the standard map.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Focus Base", exact: true }).click();
      await page.waitForTimeout(1500);
      assert.equal(await page.locator(".leaflet-container canvas").count(), 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(imagery, []);
      await context.close();
      console.log(`PASS raster fallback: ${noWebgl ? "WebGL unavailable" : "OpenFreeMap request failure"}.`);
    }
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
