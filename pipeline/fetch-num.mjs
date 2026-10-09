// cadencia data pipeline — supplementary crawl: lights tagged ONLY with numbered
// keys (seamark:light:N:character) that the original bare-key crawl missed.
// Separate cache dir (pipeline/cache-num) so partial progress can never poison
// the main tile cache; build-shards.mjs merges both dirs.
// Usage: node pipeline/fetch-num.mjs [--force]
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "pipeline", "cache-num");
const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const TILE = 20;
const LAT_MIN = -78, LAT_MAX = 84;
const FORCE = process.argv.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(CACHE, { recursive: true });

const tiles = [];
for (let s = LAT_MIN; s < LAT_MAX; s += TILE)
  for (let w = -180; w < 180; w += TILE)
    tiles.push([s, w, Math.min(s + TILE, LAT_MAX), w + TILE]);

async function fetchTile([s, w, n, e], attempt = 0) {
  const bbox = `${s},${w},${n},${e}`;
  const key = join(CACHE, `${s}_${w}.json`);
  if (!FORCE && existsSync(key)) return;
  const q = `[out:json][timeout:120];(nwr[~"^seamark:light:[0-9]+:character$"~"."](${bbox});wr["man_made"="lighthouse"](${bbox}););out center tags;`;
  const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": "cadencia-build (github.com/miguelgarglez/cadencia)" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    if (attempt < 5 && (res.status === 429 || res.status >= 500 || res.status === 504)) {
      await sleep(10000 * (attempt + 1));
      return fetchTile([s, w, n, e], attempt + 1);
    }
    const body = await res.text().catch(() => "");
    throw new Error(`overpass ${res.status} on ${bbox}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  if (text.includes("Dispatcher_Client") || text.includes("runtime error")) {
    if (attempt < 5) {
      await sleep(12000 * (attempt + 1));
      return fetchTile([s, w, n, e], attempt + 1);
    }
    throw new Error(`overpass runtime error on ${bbox}`);
  }
  writeFileSync(key, text);
}

let done = 0, failed = 0;
for (const tile of tiles) {
  try {
    await fetchTile(tile);
    done++;
    if (done % 10 === 0) console.log(`[${done}/${tiles.length}] ${tile[0]},${tile[1]}`);
  } catch (err) {
    failed++;
    console.error(`TILE FAILED ${tile[0]},${tile[1]}: ${err.message}`);
  }
  await sleep(1500);
}
console.log(`DONE: ${done} tiles ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
