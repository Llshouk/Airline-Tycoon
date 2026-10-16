/* Optional production PWA acceptance, separate from image-failure tests. */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { CABIN_ARTWORK } = require("../.test-build/src/config/cabinArtwork");
const { version } = require("../package.json");

async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const context = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    await page.goto(`${process.env.UI_CHECK_URL || "http://localhost:3016"}/offline.html`);
    const key = `airline-tycoon-v${version}`;
    const assets = Object.values(CABIN_ARTWORK);
    await page.evaluate(async () => {
      await caches.open("airline-tycoon-old-gallery-test");
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(async ({ key, assets }) => {
      const cache = await caches.open(key);
      return navigator.serviceWorker.controller && (await Promise.all(assets.map((art) => cache.match(art.src)))).every(Boolean);
    }, { key, assets });
    assert.ok(!(await page.evaluate(() => caches.keys())).includes("airline-tycoon-old-gallery-test"));
    await context.setOffline(true);
    for (const art of assets) {
      const result = await page.evaluate(async (art) => {
        const response = await fetch(art.src);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const result = { status: response.status, size: blob.size, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
      }, art);
      assert.equal(result.status, 200);
      assert.ok(result.size > 100000);
      assert.equal(result.width, art.width);
      assert.equal(result.height, art.height);
      console.log(`PASS production V${version} offline precache/decode: ${art.src} (${result.size} bytes).`);
    }
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
