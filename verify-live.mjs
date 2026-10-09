// cadencia live verification: console errors, layout, guide, selection, vessel, rose
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/cad-shots";
mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5231/", { waitUntil: "domcontentloaded" });
// wait for map + shards
await page.waitForFunction(() => window.__map && window.__map.loaded(), { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/01-load.png` });

// wait for intro zoom to settle + guide to show
await page.waitForTimeout(4200);
await page.screenshot({ path: `${OUT}/02-intro.png` });

// what did the guide anchor to?
const state = await page.evaluate(() => {
  const store = window.__cadencia;
  const tip = document.querySelector(".guide-tip");
  return {
    points: store.points.size,
    guideTip: tip ? tip.textContent.slice(0, 120) : null,
    tipRect: tip ? tip.getBoundingClientRect().toJSON() : null,
  };
});
console.log("store:", state.points, "points | guide:", state.guideTip, "| tip at", JSON.stringify(state.tipRect));

// click the guide target (ring) if visible, else center-ish
const ring = await page.$(".guide-ring");
let clicked = false;
if (ring) {
  const box = await ring.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    clicked = true;
  }
}
console.log("clicked ring:", clicked);
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/03-selected.png` });

const sel = await page.evaluate(() => {
  const sheet = document.querySelector(".sheet");
  const vessel = document.querySelector(".vessel");
  return {
    sheet: sheet ? sheet.getBoundingClientRect().toJSON() : null,
    sheetText: sheet ? sheet.textContent.slice(0, 200) : null,
    vessel: vessel ? vessel.getBoundingClientRect().toJSON() : null,
  };
});
console.log("sheet:", JSON.stringify(sel.sheet), "\ntext:", sel.sheetText, "\nvessel:", JSON.stringify(sel.vessel));

// steer via rose if present, else drag vessel
const rose = await page.$(".rose svg");
if (rose) {
  const b = await rose.boundingBox();
  if (b) {
    // drag the rose needle across sectors: several angles
    for (const ang of [200, 300, 40]) {
      const a = (ang * Math.PI) / 180;
      await page.mouse.click(b.x + b.width / 2 + Math.sin(a) * 30, b.y + b.height / 2 - Math.cos(a) * 30);
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: `${OUT}/04-steered.png` });
  }
}

// mobile check
const mp = await browser.newPage({ viewport: { width: 375, height: 700 } });
mp.on("console", (m) => { if (m.type() === "error") errors.push("mobile: " + m.text()); });
mp.on("pageerror", (e) => errors.push("mobile: " + String(e)));
await mp.goto("http://localhost:5231/#50.777,-1.094,10", { waitUntil: "domcontentloaded" });
await mp.waitForFunction(() => window.__map && window.__map.loaded(), { timeout: 30000 });
await mp.waitForTimeout(3000);
await mp.screenshot({ path: `${OUT}/05-mobile.png` });
// click near center (Castle Pile should be near center)
await mp.mouse.click(187, 350);
await mp.waitForTimeout(1600);
await mp.screenshot({ path: `${OUT}/06-mobile-sheet.png` });
const mState = await mp.evaluate(() => {
  const sheet = document.querySelector(".sheet");
  const vessel = document.querySelector(".vessel");
  const dock = document.querySelector(".dock");
  return {
    sheet: sheet ? sheet.getBoundingClientRect().toJSON() : null,
    vessel: vessel ? vessel.getBoundingClientRect().toJSON() : null,
    dockH: dock ? dock.getBoundingClientRect().height : null,
    vw: window.innerWidth,
  };
});
console.log("mobile:", JSON.stringify(mState));

console.log("\nCONSOLE ERRORS:", errors.length ? errors : "none");
await browser.close();
