/* Optional browser acceptance: compile tests first, then provide Playwright and a running app. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
require("../tests/registerTestAliases.cjs");
const { aircraftById } = require("../.test-build/src/data/aircraft");
const { defaultCabinConfiguration, configuredCabinLayout } = require("../.test-build/src/lib/cabinConfiguration");
const { createCompactSaveState, restoreGameStateFromCloudSave } = require("../.test-build/src/lib/cloudSave");
const { normalizeGame } = require("../.test-build/src/store/gameStore");

const baseUrl = process.env.UI_CHECK_URL || "http://localhost:3015";
const output = path.join(__dirname, "../.test-build");

function fixture(baseAirportId = "lhr") {
  const model = aircraftById["737-max-8"];
  const configuration = defaultCabinConfiguration(model);
  configuration.version = 1;
  const now = Date.UTC(2026, 0, 1, 12);
  return createCompactSaveState(normalizeGame(restoreGameStateFromCloudSave({
    saveFormatVersion: 2, airlineName: "Meridian Airways", difficulty: "easy", baseAirportId,
    money: 1e9, currentGameTimeMs: now, baseGameTimeMs: now, isPaused: true, routes: [],
    fleet: [{ id: "legacy", modelId: model.id, registration: "G-OLD", homeBaseAirportId: baseAirportId, currentAirportId: baseAirportId,
      cabinConfiguration: configuration, cabinLayout: configuredCabinLayout(model, configuration), weeklySchedules: [], schedule: [] }]
  })));
}

async function navigate(page, id) {
  const visible = page.locator(`.game-dock button[data-screen="${id}"]:visible`);
  if (!(await visible.count())) await page.locator(".dock-more > button").click();
  await page.locator(`.game-dock button[data-screen="${id}"]:visible`).click();
}

async function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("airline-tycoon-v1")).state.game);
}

async function layout(page, width) {
  const sizes = await page.evaluate(() => {
    const panel = document.querySelector(".workspace-scroll");
    const shell = document.querySelector(".simulation-shell");
    return { document: document.documentElement.scrollWidth, panel: panel?.scrollWidth, client: panel?.clientWidth,
      height: shell.getBoundingClientRect().height, viewport: window.innerHeight };
  });
  assert.ok(sizes.document <= width + 1, `Document overflow: ${JSON.stringify(sizes)}`);
  if (sizes.panel) assert.ok(sizes.panel <= sizes.client + 1, `Workspace overflow: ${JSON.stringify(sizes)}`);
  assert.ok(Math.abs(sizes.height - sizes.viewport) <= 1);
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const errors = [];
  try {
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]].filter(([width]) => !process.env.UI_CHECK_WIDTH || width === Number(process.env.UI_CHECK_WIDTH))) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      await context.addInitScript((state) => {
        delete Navigator.prototype.serviceWorker;
        Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
        Object.defineProperty(window, "indexedDB", { value: undefined });
        localStorage.setItem("airline-tycoon-language", "en");
        localStorage.setItem("airline-tycoon-map-engine", "2d");
        if (!localStorage.getItem("airline-tycoon-v1")) localStorage.setItem("airline-tycoon-v1", JSON.stringify({ state: { game: state, notice: null }, version: 4 }));
      }, fixture());
      const page = await context.newPage();
      let expectedImageFailure = false;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (expectedImageFailure && message.location().url.endsWith("/cabin/first-class-products-v172.png")) return;
        if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
      });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 90000 });
      await page.getByRole("button", { name: "Continue Offline", exact: true }).click();
      await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true }); window.dispatchEvent(new Event("online")); });
      await page.locator('canvas[data-openfreemap-ready="true"]').first().waitFor({ timeout: 60000 });
      await page.locator(".leaflet-control-zoom-in").click();
      await page.waitForTimeout(350);
      const before = await saved(page);
      const camera = await page.evaluate(() => { window.originalMapNode = document.querySelector(".leaflet-container"); return document.querySelector(".leaflet-map-pane").style.transform; });
      await layout(page, width);
      await page.screenshot({ path: path.join(output, `ui-v172-${width}-map.png`) });

      for (const id of ["dashboard", "fleet", "market", "routes", "schedule", "finance", "growth", "leaderboard", "settings"]) {
        await navigate(page, id);
        await page.locator("#workspace-title").waitFor();
        assert.ok(await page.locator("#workspace-title").evaluate((element) => element === document.activeElement));
        try { await layout(page, width); } catch (error) {
          await page.screenshot({ path: path.join(output, `ui-v172-${width}-${id}-overflow.png`) });
          error.message = `${id}: ${error.message}`;
          throw error;
        }
        await page.getByRole("button", { name: "Back to map", exact: true }).click();
        assert.ok(await page.evaluate(() => document.querySelector(".leaflet-container") === window.originalMapNode));
        assert.equal(await page.locator(".leaflet-map-pane").evaluate((element) => element.style.transform), camera);
      }
      assert.equal((await saved(page)).money, before.money);
      assert.deepEqual((await saved(page)).fleet, before.fleet);
      await page.getByRole("button", { name: "Base Airport Board", exact: true }).click();
      await page.locator("#base-airport-board").waitFor();
      await layout(page, width);
      await page.locator("#base-airport-board").getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Map layers", exact: true }).click();
      await page.getByRole("button", { name: "Network", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Network", exact: true }).getAttribute("aria-pressed"), "true");
      await page.getByRole("button", { name: "Show all", exact: true }).click();
      await page.locator("#map-layer-controls").getByRole("button", { name: "Close", exact: true }).click();
      const markerIndex = await page.locator(".airport-marker").evaluateAll((markers) => markers.findIndex((marker) => {
        const rect = marker.getBoundingClientRect();
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        return x > 0 && x < innerWidth && y > 0 && y < innerHeight && marker.contains(document.elementFromPoint(x, y));
      }));
      assert.ok(markerIndex >= 0, "A visible airport marker must be clickable");
      await page.locator(".airport-marker").nth(markerIndex).click();
      await page.getByRole("dialog").waitFor();
      assert.ok(!(await page.getByRole("dialog").innerText()).includes("Estimated Revenue"));
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

      await navigate(page, "market");
      await page.getByRole("button", { name: /A350-900 Airbus/ }).click();
      await page.getByRole("button", { name: "Seat Configuration", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: /First Class/ }).click();
      await dialog.getByRole("radio", { name: "First Class luxury", exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('.cabin-product img')].every((image) => image.complete && image.naturalWidth > 0));
      assert.ok((await dialog.locator(".cabin-product img").first().getAttribute("src")).includes("first-class-products-v172.png"));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(output, `ui-v172-${width}-first-class.png`) });
      await dialog.getByRole("button", { name: "Apply configuration", exact: true }).click();
      const registration = `G-UI${width}`;
      await page.getByLabel("Aircraft registration", { exact: true }).fill(registration);
      const cash = (await saved(page)).money;
      await page.getByRole("button", { name: /Buy aircraft/ }).click();
      await page.waitForFunction((registration) => JSON.parse(localStorage.getItem("airline-tycoon-v1")).state.game.fleet.some((aircraft) => aircraft.registration === registration), registration);
      const after = await saved(page);
      const purchased = after.fleet.find((aircraft) => aircraft.registration === registration);
      assert.equal(after.money, cash - purchased.purchasePriceGBP);
      assert.deepEqual(after.fleet.find((aircraft) => aircraft.id === "legacy"), before.fleet[0]);
      if (width === 390) {
        expectedImageFailure = true;
        await context.route("**/cabin/first-class-products-v172.png", (route) => route.abort());
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.getByRole("button", { name: "Seat Configuration", exact: true }).click();
        await page.getByRole("dialog").getByRole("tab", { name: /First Class/ }).click();
        await page.waitForFunction(() => document.querySelectorAll(".cabin-product img").length === 0);
        assert.equal(await page.getByRole("dialog").locator(".cabin-product [role=img]").count(), 3);
        assert.equal(await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).animationName), "none");
        await page.keyboard.press("Escape");
        await context.unroute("**/cabin/first-class-products-v172.png");
        expectedImageFailure = false;
      }
      await navigate(page, "fleet");
      await page.getByRole("button", { name: /A350-900 x 1/ }).click();
      await page.getByRole("button", { name: new RegExp(registration) }).click();
      await page.getByText("Aircraft Details", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await navigate(page, "settings");
      await page.getByLabel("Language", { exact: true }).selectOption("zh");
      await page.getByRole("button", { name: "返回地图", exact: true }).click();
      await layout(page, width);
      await page.screenshot({ path: path.join(output, `ui-v172-${width}-zh.png`) });
      await navigate(page, "settings");
      await page.getByLabel("语言", { exact: true }).selectOption("en");
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Continue Offline", exact: true }).click();
      assert.deepEqual((await saved(page)).fleet, after.fleet);
      assert.equal((await saved(page)).money, after.money);
      await context.close();
      console.log(`PASS ${width}x${height}: navigation, camera identity, layers/board, route dialog, purchase/modal stacking, legacy save, EN/ZH and layout.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

module.exports = { fixture, navigate, saved, layout };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
