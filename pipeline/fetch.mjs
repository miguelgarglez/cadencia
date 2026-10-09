// cadencia data pipeline — step 1: fetch every seamark light from OSM via Overpass.
// Tiled 20x20 degree queries (global queries time out), cached per-tile so re-runs are cheap.
// Usage: node pipeline/fetch.mjs [--force]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "pipeline", "cache");
const OUT = join(ROOT, "pipeline", "raw-lights.json");
const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const TILE = 20; // degrees
const LAT_MIN = -78, LAT_MAX = 84; // OSM practical range
const FORCE = process.argv.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(CACHE, { recursive: true });

const tiles = [];
for (let s = LAT_MIN; s < LAT_MAX; s += TILE)
  for (let w = -180; w < 180; w += TILE)
    tiles.push([s, w, Math.min(s + TILE, LAT_MAX), w + TILE]);
const rowsArg = process.argv.find((a) => a.startsWith("--rows="));
if (rowsArg) {
  const keep = new Set(rowsArg.slice(7).split(",").map(Number));
  for (let i = tiles.length - 1; i >= 0; i--) if (!keep.has(tiles[i][0])) tiles.splice(i, 1);
}
if (process.argv.includes("--rev")) tiles.reverse();
if (process.argv.includes("--revlon")) {
  // same rows, but walk longitudes east→west so two workers don't collide
  const rows = new Map();
  for (const t of tiles) { const k = t[0]; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(t); }
  tiles.length = 0;
  for (const [, r] of rows) tiles.push(...r.slice().reverse());
}

async function fetchTile([s, w, n, e], attempt = 0) {
  const bbox = `${s},${w},${n},${e}`;
  const key = join(CACHE, `${s}_${w}.json`);
  if (!FORCE && existsSync(key)) return JSON.parse(readFileSync(key, "utf8"));
  const q = `[out:json][timeout:120];(nwr["seamark:light:character"](${bbox});node["man_made"="lighthouse"](${bbox}););out center tags;`;
  const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": "cadencia-build (github.com/miguelgarglez/cadencia)" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    if (attempt < 4 && (res.status === 429 || res.status >= 500 || res.status === 504)) {
      await sleep(8000 * (attempt + 1));
      return fetchTile([s, w, n, e], attempt + 1);
    }
    const body = await res.text().catch(() => "");
    throw new Error(`overpass ${res.status} on ${bbox}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  if (text.includes("Dispatcher_Client") || text.includes("runtime error")) {
    if (attempt < 4) {
      await sleep(10000 * (attempt + 1));
      return fetchTile([s, w, n, e], attempt + 1);
    }
    throw new Error(`overpass runtime error on ${bbox}`);
  }
  const json = JSON.parse(text);
  writeFileSync(key, JSON.stringify(json));
  return json;
}

const seen = new Map();
let done = 0;
for (const tile of tiles) {
  const [s, w] = tile;
  try {
    const data = await fetchTile(tile);
    for (const el of data.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      const id = `${el.type}/${el.id}`;
      if (!seen.has(id)) seen.set(id, { id, type: el.type, lat, lon, tags: el.tags ?? {} });
    }
    done++;
    if (done % 10 === 0 || (data.elements?.length ?? 0) > 400)
      console.log(`[${done}/${tiles.length}] ${s},${w}: ${data.elements?.length ?? 0} els, total ${seen.size}`);
  } catch (err) {
    console.error(`TILE FAILED ${s},${w}: ${err.message}`);
  }
  await sleep(1200); // polite pacing
}

const elements = [...seen.values()];
writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), count: elements.length, elements }));
console.log(`DONE: ${elements.length} light elements -> ${OUT}`);
