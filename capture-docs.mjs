// Capture cadencia doc assets + review footage: hero shots and a 10s opening clip.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.URL ?? "http://localhost:5231/";
const OUT = process.env.OUT ?? "docs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  recordVideo: { dir: "/tmp/cad-video", size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__map && window.__map.loaded(), { timeout: 40000 });
await page.waitForTimeout(11500); // the first ten seconds, recorded
await ctx.close(); // flush video

const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p2.goto(URL, { waitUntil: "domcontentloaded" });
await p2.waitForFunction(() => window.__map && window.__map.loaded(), { timeout: 40000 });
await p2.waitForTimeout(6000);
await p2.screenshot({ path: `${OUT}/hero.png` });

// selected state: click the guide target
await p2.waitForTimeout(3000);
const ring = await p2.$(".guide-ring");
if (ring) {
  const b = await ring.boundingBox();
  if (b) await p2.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await p2.waitForTimeout(2200);
}
await p2.screenshot({ path: `${OUT}/selected.png` });

// mobile
const mp = await browser.newPage({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2 });
await mp.goto(URL + "#50.777,-1.094,10", { waitUntil: "domcontentloaded" });
await mp.waitForFunction(() => window.__map && window.__map.loaded(), { timeout: 40000 });
await mp.waitForTimeout(3000);
await mp.mouse.click(187, 350);
await mp.waitForTimeout(1800);
await mp.screenshot({ path: `${OUT}/mobile-375.png` });
await browser.close();
console.log("captured:", OUT);
