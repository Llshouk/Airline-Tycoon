/* Optional browser acceptance: run pnpm test first and supply a running app plus Playwright. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { fixture, navigate, saved, layout } = require("./verifyMapUi.cjs");
const { CABIN_ARTWORK } = require("../.test-build/src/config/cabinArtwork");

const baseUrl = process.env.UI_CHECK_URL || "http://localhost:3015";
const cabins = { first: "First Class", business: "Business", premiumEconomy: "Premium Economy", economy: "Economy" };
const grades = ["basic", "premium", "luxury"];
const output = path.join(__dirname, "../.test-build");

async function images(page, cabin) {
  await page.locator(".cabin-product-preview").scrollIntoViewIfNeeded();
  await page.waitForFunction(({ cabin, src }) => {
    const frames = [...document.querySelectorAll(`[data-cabin-artwork="${cabin}"]`)];
    return frames.length === 4 && frames.every((frame) => {
      const image = frame.querySelector("img");
      return image?.complete && image.naturalWidth > 0 && new URL(image.src).pathname === src;
    });
  }, { cabin, src: CABIN_ARTWORK[cabin].src });
  const frames = await page.locator(`[data-cabin-artwork="${cabin}"]`).evaluateAll((elements) => elements.map((element) => {
    const image = element.querySelector("img");
    const rect = element.getBoundingClientRect();
    return { grade: element.dataset.seatGrade, ratio: rect.width / rect.height, top: image.style.top,
      width: image.naturalWidth, height: image.naturalHeight };
  }));
  for (const frame of frames) {
    assert.ok(Math.abs(frame.ratio - 16 / 9) < 0.02, "Image frames must keep their aspect ratio");
    const art = CABIN_ARTWORK[cabin];
    const index = grades.indexOf(frame.grade);
    const [top, bottom] = art.frames?.[index] ?? [index * art.height / 3, (index + 1) * art.height / 3];
    assert.ok(Math.abs(parseFloat(frame.top) - -top / (bottom - top) * 100) < 0.001);
    assert.equal(frame.width, CABIN_ARTWORK[cabin].width);
    assert.equal(frame.height, CABIN_ARTWORK[cabin].height);
  }
}

async function noConflicts(page, dialog, width) {
  await layout(page, width);
  const result = await dialog.evaluate((element) => {
    const footer = element.querySelector("footer");
    const button = footer.querySelector("button");
    const rect = button.getBoundingClientRect();
    const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { overflow: element.scrollWidth > element.clientWidth + 1,
      footerOverflow: footer.scrollWidth > footer.clientWidth + 1, clickable: button.contains(center),
      clipped: [...footer.querySelectorAll("p")].some((p) => p.scrollWidth > p.clientWidth + 1),
      checks: [...element.querySelectorAll(".cabin-product svg")].map((icon) => icon.getBoundingClientRect().width) };
  });
  assert.deepEqual(result, { overflow: false, footerOverflow: false, clickable: true, clipped: false, checks: [12, 12, 12] });
}

async function separateDividers(dialog) {
  await dialog.locator(".cabin-stage").scrollIntoViewIfNeeded();
  await dialog.page().waitForTimeout(220);
  const result = await dialog.locator(".cabin-stage").evaluate((stage) => {
    const bounds = stage.getBoundingClientRect();
    const boxes = [...stage.querySelectorAll(".cabin-divider")].map((handle) => handle.getBoundingClientRect());
    return { overlaps: boxes.some((a, i) => boxes.slice(i + 1).some((b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)),
    outside: boxes.some((box) => box.bottom > bounds.bottom + 1) };
  });
  assert.deepEqual(result, { overlaps: false, outside: false });
}

async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const errors = [];
  try {
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      await context.addInitScript((state) => {
        delete Navigator.prototype.serviceWorker;
        Object.defineProperty(navigator, "onLine", { get: () => false });
        Object.defineProperty(window, "indexedDB", { value: undefined });
        if (!localStorage.getItem("airline-tycoon-language")) localStorage.setItem("airline-tycoon-language", "en");
        if (!localStorage.getItem("airline-tycoon-v1")) localStorage.setItem("airline-tycoon-v1", JSON.stringify({ state: { game: state, notice: null }, version: 4 }));
      }, fixture());
      const page = await context.newPage();
      let failingImage = "";
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        const url = message.location().url;
        if (message.type() === "error" && !url.endsWith("/favicon.ico") && !(failingImage && url.endsWith(failingImage))) errors.push(message.text());
      });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 90000 });
      await page.getByRole("button", { name: "Continue Offline", exact: true }).click();
      await navigate(page, "market");
      await page.getByRole("button", { name: /A350-900 Airbus/ }).click();
      const before = await saved(page);
      await page.getByRole("button", { name: "Seat Configuration", exact: true }).click();
      const dialog = page.getByRole("dialog");
      for (const [cabin, label] of Object.entries(cabins)) {
        await dialog.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
        for (const grade of grades) {
          await dialog.getByRole("radio", { name: `${label} ${grade}`, exact: true }).click();
          await images(page, cabin);
          assert.equal(await dialog.locator(".cabin-product-preview [data-seat-grade]").getAttribute("data-seat-grade"), grade);
          await noConflicts(page, dialog, width);
        }
        await dialog.locator(".cabin-product-preview").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `cabin-v173-${width}-${cabin}.png`) });
      }
      await dialog.getByRole("slider", { name: "Economy Cabin space", exact: true }).press("End");
      await separateDividers(dialog);
      await page.screenshot({ path: path.join(output, `cabin-v173-${width}-collapsed.png`) });
      const handle = dialog.locator(".cabin-divider").nth(2);
      await handle.press("ArrowRight");
      assert.equal(await handle.getAttribute("aria-valuenow"), "1");
      await separateDividers(dialog);
      const box = await handle.boundingBox();
      const stage = await dialog.locator(".cabin-stage").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + stage.width * 0.05, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.ok(Number(await handle.getAttribute("aria-valuenow")) > 1, "Collapsed handles must support pointer drag");
      await separateDividers(dialog);
      if (width === 390) {
        const box = await handle.boundingBox();
        const beforeTouch = Number(await handle.getAttribute("aria-valuenow"));
        const cdp = await context.newCDPSession(page);
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + stage.width * 0.05 * step / 6, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        assert.ok(Number(await handle.getAttribute("aria-valuenow")) > beforeTouch);
        await separateDividers(dialog);
      }
      await page.keyboard.press("Escape");
      assert.equal((await saved(page)).money, before.money);
      assert.deepEqual((await saved(page)).fleet, before.fleet);
      await page.getByRole("button", { name: "Seat Configuration", exact: true }).click();
      await dialog.getByRole("tab", { name: /^Premium Economy/ }).click();
      await dialog.getByRole("radio", { name: "Premium Economy luxury", exact: true }).click();
      await dialog.getByRole("spinbutton", { name: "Premium Economy Seat pitch", exact: true }).fill("999");
      await dialog.getByRole("spinbutton", { name: "Premium Economy Seat pitch", exact: true }).blur();
      assert.equal(await dialog.getByRole("spinbutton", { name: "Premium Economy Seat pitch", exact: true }).inputValue(), "44");
      await dialog.getByRole("button", { name: "Apply configuration", exact: true }).click();
      const registration = `G-ART${width}`;
      await page.getByLabel("Aircraft registration", { exact: true }).fill(registration);
      await page.getByRole("button", { name: /Buy aircraft/ }).click();
      await page.waitForFunction((reg) => JSON.parse(localStorage.getItem("airline-tycoon-v1")).state.game.fleet.some((aircraft) => aircraft.registration === reg), registration);
      const purchasedSave = await saved(page);
      const purchased = purchasedSave.fleet.find((aircraft) => aircraft.registration === registration);
      assert.equal(purchasedSave.money, before.money - purchased.purchasePriceGBP);
      assert.deepEqual(purchasedSave.fleet.find((aircraft) => aircraft.id === "legacy"), before.fleet[0]);
      assert.equal(purchased.cabinConfiguration.sections.premiumEconomy.grade, "luxury");

      if (width === 390) {
        for (const cabin of ["business", "premiumEconomy", "economy"]) {
          failingImage = CABIN_ARTWORK[cabin].src;
          await context.route(`**${failingImage}`, (route) => route.fulfill({ status: 404, body: "" }));
          await page.getByRole("button", { name: "Seat Configuration", exact: true }).click();
          await dialog.getByRole("tab", { name: new RegExp(`^${cabins[cabin]}`) }).click();
          await page.waitForFunction((cabin) => document.querySelectorAll(`[data-cabin-artwork="${cabin}"] [role=img]`).length === 4, cabin);
          await dialog.getByRole("tab", { name: /^First Class/ }).click();
          await images(page, "first");
          await page.keyboard.press("Escape");
          await context.unroute(`**${failingImage}`);
          failingImage = "";
        }
      }
      await navigate(page, "settings");
      await page.getByLabel("Language", { exact: true }).selectOption("zh");
      await navigate(page, "market");
      await page.getByRole("button", { name: /A350-900/ }).click();
      await page.getByRole("button", { name: "座椅配置", exact: true }).click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const name of ["头等舱", "商务舱", "高端经济舱", "经济舱"]) {
        await dialog.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
        await noConflicts(page, dialog, width);
      }
      assert.equal(await dialog.evaluate((element) => getComputedStyle(element).animationName), "none");
      await dialog.locator(".cabin-product-preview").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `cabin-v173-${width}-zh.png`) });
      await page.keyboard.press("Escape");
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "离线继续", exact: true }).click();
      assert.equal((await saved(page)).money, purchasedSave.money);
      assert.deepEqual((await saved(page)).fleet, purchasedSave.fleet);
      await context.close();
      console.log(`PASS ${width}x${height}: 12 concepts, EN/ZH layout, collapsed dividers, draft/purchase/legacy/reload${width === 390 ? ", touch and three missing-image fallbacks" : ""}.`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
