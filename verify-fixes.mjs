import { chromium } from "playwright";

const BASE = "http://localhost:5231";
const errors = [];
const browser = await chromium.launch();

const findSectored = async (page) => page.evaluate(() => {
  const store = window.__cadencia;
  let t = null, d = 1e9;
  for (const p of store.points.values()) {
    if (p.uncharted || !p.lights.some((l) => l.sectors.length)) continue;
    const dd = Math.hypot(p.lat - 50.7777, p.lon + 1.0942);
    if (dd < d) { d = dd; t = p; }
  }
  return t ? { lat: t.lat, lon: t.lon, id: t.id } : null;
});

const clickAt = async (page, lon, lat) => page.evaluate(([lon, lat]) => {
  const pt = window.__map.project([lon, lat]);
  window.__map.getCanvas().dispatchEvent(new MouseEvent("click", { clientX: pt.x, clientY: pt.y, bubbles: true }));
}, [lon, lat]);

// ---- 1. reduced motion: vessel must still spawn (P1-1) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("rm: " + e.message));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__cadencia?.points.size > 100, null, { timeout: 40000 });
  const t = await findSectored(page);
  await page.evaluate(([lon, lat]) => window.__map.jumpTo({ center: [lon, lat], zoom: 10 }), [t.lon, t.lat]);
  await page.waitForTimeout(400);
  await clickAt(page, t.lon, t.lat);
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    vessel: !!document.querySelector(".vessel"),
    name: document.querySelector(".sheet .name, .sheet h2")?.textContent ?? null,
    note: document.querySelector(".sheet .note")?.textContent?.slice(0, 70) ?? null,
  }));
  console.log("reduced-motion:", JSON.stringify(r));
  await ctx.close();
}

// ---- 2. rapid A→B selection (P1-2) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("ab: " + e.message));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__cadencia?.points.size > 100, null, { timeout: 40000 });
  const t = await findSectored(page);
  await page.evaluate(([lon, lat]) => window.__map.jumpTo({ center: [lon, lat], zoom: 10 }), [t.lon, t.lat]);
  await page.waitForTimeout(600);
  // pick two on-screen lights ≥80px apart
  const pair = await page.evaluate(() => {
    const map = window.__map, store = window.__cadencia, b = map.getBounds();
    const vis = [...store.points.values()].filter((p) => !p.uncharted &&
      p.lat > b.getSouth() && p.lat < b.getNorth() && p.lon > b.getWest() && p.lon < b.getEast());
    for (const a of vis) for (const c of vis) {
      if (a === c) continue;
      const pa = map.project([a.lon, a.lat]), pc = map.project([c.lon, c.lat]);
      if (Math.hypot(pa.x - pc.x, pa.y - pc.y) > 80) return [{ lon: a.lon, lat: a.lat }, { lon: c.lon, lat: c.lat }];
    }
    return null;
  });
  await clickAt(page, pair[0].lon, pair[0].lat);
  await page.waitForTimeout(80);
  await page.evaluate(() => document.querySelector(".sheet .x")?.click());
  await page.waitForTimeout(80); // inside the 300ms leave window
  await clickAt(page, pair[1].lon, pair[1].lat);
  await page.waitForTimeout(800);
  const alive = await page.evaluate(() => !!document.querySelector(".sheet"));
  console.log(`A→B race: sheet alive = ${alive}`);
  await ctx.close();
}

// ---- 3. sector override: dot follows the bearing's sub-light (P1-3) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("sec: " + e.message));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__cadencia?.points.size > 100, null, { timeout: 40000 });
  const t = await findSectored(page);
  await page.evaluate(([lon, lat]) => window.__map.jumpTo({ center: [lon, lat], zoom: 10.5 }), [t.lon, t.lat]);
  await page.waitForTimeout(500);
  await clickAt(page, t.lon, t.lat);
  await page.waitForTimeout(1600); // camera settle + vessel spawn
  const s1 = await page.evaluate(() => ({
    vessel: !!document.querySelector(".vessel"),
    notation: document.querySelector(".sheet .notation")?.textContent ?? null,
    note: document.querySelector(".sheet .note")?.textContent?.slice(0, 80) ?? null,
  }));
  console.log("sectored select:", JSON.stringify(s1));
  if (s1.vessel) {
    // steer vessel 180° — should cross into a different sector or out of all
    const rose = page.locator(".rose [role='slider'], .rose svg").first();
    const before = await page.evaluate(() => document.querySelector(".sheet .notation")?.textContent);
    await page.evaluate(() => {
      const v = document.querySelector(".vessel");
      v?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    for (let i = 0; i < 90; i++) {
      await page.evaluate(() => document.querySelector(".vessel")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    }
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      notation: document.querySelector(".sheet .notation")?.textContent,
      note: document.querySelector(".sheet .note")?.textContent?.slice(0, 80) ?? null,
    }));
    console.log(`after steering 180°: "${before}" → "${after.notation}" | ${after.note}`);
  }
  await ctx.close();
}

console.log("errors:", errors.length ? errors : "none");
await browser.close();
