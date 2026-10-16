/* Optional browser acceptance: compile with pnpm test and provide Playwright plus a running app. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { fixture, navigate, saved, layout } = require("./verifyMapUi.cjs");
const { normalizeGame } = require("../.test-build/src/store/gameStore");
const { createCompactSaveState, restoreGameStateFromCloudSave } = require("../.test-build/src/lib/cloudSave");
const { createFlightItem } = require("../.test-build/src/lib/recurringFlights");
const { aircraftById } = require("../.test-build/src/data/aircraft");
const hour = 3600000;

function maintenanceFixture() {
  const game = normalizeGame(restoreGameStateFromCloudSave(fixture()));
  const model = aircraftById["a220-300"];
  const now = game.currentGameTimeMs;
  const route = require("../.test-build/src/lib/routeScheduling").createRouteOpeningPreview("lhr", "cdg").route;
  game.routes = [{ ...route, isOpen: true }];
  game.baseAirports = ["lhr", "cdg"];
  game.timeMultiplier = 100;
  game.fleet = Array.from({ length: 4 }, (_, index) => ({ ...game.fleet[0], id: `maint-${index}`, modelId: model.id,
    registration: `G-SVC${index + 1}`, homeBaseAirportId: index === 3 ? "cdg" : "lhr",
    currentAirportId: index >= 2 ? "cdg" : "lhr", status: index === 1 ? "in-flight" : "idle",
    cabinLayout: model.suggestedLayout, cabinConfiguration: undefined, schedule: [], weeklySchedules: [],
    lifecycle: { ...game.fleet[0].lifecycle, condition: index === 0 || index === 2 ? 20 : 90 } }));
  const flight = (aircraft, id, departure) => ({ ...createFlightItem({ aircraft, model, route,
    originAirportId: "lhr", destinationAirportId: "cdg", departureGameTime: departure, fixedId: id, flightNumber: id }),
  technicalChecked: true, technicalDelayMinutes: 0, baseDelayMinutes: 0 });
  game.fleet[0].schedule = [flight(game.fleet[0], "MA100", now + hour), flight(game.fleet[0], "MA102", now + 12 * hour)];
  game.fleet[1].schedule = [{ ...flight(game.fleet[1], "CURRENT", now - hour / 4), status: "in-flight" }];
  return createCompactSaveState(game);
}

async function openAircraft(page, registration) {
  const group = page.getByRole("button", { name: /A220-300 x 4/ });
  if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
  await page.getByRole("button", { name: new RegExp(registration) }).click();
  return page.getByRole("dialog").last();
}

async function jump(page, hours, language = "en") {
  await page.getByRole("button", { name: language === "en" ? "Resume simulation" : "继续模拟", exact: true }).click();
  await page.clock.fastForward(hours * hour / 100);
  await page.getByRole("button", { name: language === "en" ? "Pause simulation" : "暂停模拟", exact: true }).click();
}

async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const errors = [];
  try {
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      await context.addInitScript((game) => {
        delete Navigator.prototype.serviceWorker;
        Object.defineProperty(navigator, "onLine", { get: () => false });
        Object.defineProperty(window, "indexedDB", { value: undefined });
        if (!localStorage.getItem("airline-tycoon-language")) localStorage.setItem("airline-tycoon-language", "en");
        if (!localStorage.getItem("airline-tycoon-v1")) localStorage.setItem("airline-tycoon-v1", JSON.stringify({ state: { game, notice: null }, version: 4 }));
      }, maintenanceFixture());
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text()); });
      await page.clock.install();
      await page.goto(process.env.UI_CHECK_URL || "http://localhost:3015", { waitUntil: "networkidle", timeout: 90000 });
      await page.getByRole("button", { name: "Continue Offline", exact: true }).click();
      await navigate(page, "fleet");
      for (let index = 0; index < 3; index++) {
        const dialog = await openAircraft(page, `G-SVC${index + 1}`);
        await dialog.getByRole("button", { name: "Full maintenance", exact: true }).click();
        await dialog.getByTestId(`maintenance-progress-maint-${index}`).waitFor();
        assert.equal(await dialog.getByRole("progressbar").getAttribute("value"), "0");
        await layout(page, width);
        assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
        await dialog.getByRole("button", { name: "Close", exact: true }).click();
      }
      await page.getByRole("button", { name: "Batch maintenance", exact: true }).click();
      const planner = page.getByRole("dialog").last();
      await planner.getByRole("checkbox", { name: "Select eligible aircraft", exact: true }).check();
      await planner.getByRole("button", { name: "Full maintenance for selected aircraft", exact: true }).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("airline-tycoon-v1")).state.game.fleet.every((aircraft) =>
        aircraft.lifecycle.maintenance || aircraft.lifecycle.reservation?.mode === "home"));
      const queued = await saved(page);
      assert.equal(queued.fleet.filter((aircraft) => aircraft.lifecycle.maintenance).length, 2, JSON.stringify(queued.fleet.map((aircraft) =>
        ({ id: aircraft.id, base: aircraft.homeBaseAirportId, airport: aircraft.currentAirportId, plan: aircraft.lifecycle.reservation, task: aircraft.lifecycle.maintenance }))));
      assert.equal(queued.fleet.filter((aircraft) => aircraft.lifecycle.reservation?.mode === "home").length, 2);
      assert.equal(queued.fleet[3].currentAirportId, "cdg");
      assert.equal(queued.fleet[0].schedule.find((flight) => flight.id === "MA100").status, "cancelled");
      await jump(page, 4);
      const middle = await saved(page);
      assert.ok(middle.fleet.every((aircraft) => aircraft.lifecycle.maintenance));
      let dialog = await openAircraft(page, "G-SVC1");
      const progress = dialog.getByRole("progressbar");
      const percent = Number(await progress.getAttribute("value"));
      assert.ok(percent >= 49 && percent <= 51);
      await dialog.getByTestId("maintenance-progress-maint-0").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(__dirname, `../.test-build/maintenance-home-${width}-en.png`) });
      await page.clock.fastForward(60000);
      assert.equal(Number(await progress.getAttribute("value")), percent, "Paused simulation must freeze maintenance progress");
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Continue Offline", exact: true }).click();
      await navigate(page, "fleet");
      dialog = await openAircraft(page, "G-SVC1");
      assert.equal(Number(await dialog.getByRole("progressbar").getAttribute("value")), percent);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await navigate(page, "settings");
      await page.getByLabel("Language", { exact: true }).selectOption("zh");
      await navigate(page, "fleet");
      dialog = await openAircraft(page, "G-SVC1");
      await dialog.getByTestId("maintenance-progress-maint-0").scrollIntoViewIfNeeded();
      assert.ok((await dialog.innerText()).includes("剩余游戏时间"));
      await layout(page, width);
      await page.screenshot({ path: path.join(__dirname, `../.test-build/maintenance-home-${width}-zh.png`) });
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await page.getByRole("checkbox").first().check();
      await page.getByRole("button", { name: "继续模拟", exact: true }).click();
      dialog = await openAircraft(page, "G-SVC1");
      await page.clock.fastForward(6 * hour / 100);
      await dialog.getByRole("progressbar").waitFor();
      assert.equal(await dialog.getByRole("progressbar").getAttribute("value"), "100", "Completion must not close a filtered aircraft detail");
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await page.getByRole("button", { name: "暂停模拟", exact: true }).click();
      const completed = await saved(page);
      assert.ok(completed.fleet.every((aircraft) => !aircraft.lifecycle.maintenance && aircraft.lifecycle.lastMaintenance));
      assert.equal(completed.money, middle.money, "Maintenance completion must not charge a second time");
      await page.getByRole("checkbox").first().uncheck();
      dialog = await openAircraft(page, "G-SVC1");
      assert.equal(await dialog.getByRole("progressbar").getAttribute("value"), "100");
      assert.ok((await dialog.innerText()).includes("MA102"));
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await jump(page, 3, "zh");
      assert.ok((await saved(page)).flightLogSummary.some((flight) => flight.id === "MA102"));
      await context.close();
      console.log(`PASS ${width}x${height}: one-click/batch, empty ferry, independent progress, pause/reload, EN/ZH, completion and original flight recovery.`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
