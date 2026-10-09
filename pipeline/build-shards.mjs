// cadencia data pipeline — step 2: parse seamark tags, shard lights into public/lights/.
// Usage: node pipeline/build-shards.mjs
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLights } from "../src/iala.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "pipeline", "raw-lights.json");
const OUTDIR = join(ROOT, "public", "lights");
const CELL_LAT = 5, CELL_LON = 10; // shard cell size in degrees

let raw;
if (existsSync(RAW)) {
  raw = JSON.parse(readFileSync(RAW, "utf8"));
} else {
  // merge whatever tiles are in cache (fetch may still be running)
  const elements = [];
  const seen = new Set();
  const cacheDir = join(ROOT, "pipeline", "cache");
  for (const f of readdirSync(cacheDir).filter((f) => f.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(cacheDir, f), "utf8"));
    for (const el of d.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      const id = `${el.type}/${el.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      elements.push({ id, type: el.type, lat, lon, tags: el.tags ?? {} });
    }
  }
  raw = { fetchedAt: new Date().toISOString(), count: elements.length, elements };
}
const cells = new Map(); // key -> { points: [], names: string[] }
const stats = { elements: raw.count, points: 0, lights: 0, uncharted: 0, unparsed: 0, chars: new Map(), shards: 0 };

const cellKey = (lat, lon) => `${Math.floor(lat / CELL_LAT)}_${Math.floor(lon / CELL_LON)}`;

for (const el of raw.elements) {
  const tags = el.tags ?? {};
  const lights = parseLights(tags);
  const isTower = tags["man_made"] === "lighthouse";
  if (!lights.length && !isTower) continue;
  const point = {
    id: `${el.type[0]}${el.id}`,
    lat: +el.lat.toFixed(6),
    lon: +el.lon.toFixed(6),
    lights,
    name: tags["seamark:name"] ?? tags.name,
    ref: tags["seamark:light:reference"] ?? tags["seamark:light:1:reference"],
    major: /light_major|light_vessel/.test(tags["seamark:type"] ?? ""),
    wikidata: tags.wikidata,
    uncharted: !lights.length,
  };
  if (!lights.length) stats.uncharted++;
  const key = cellKey(point.lat, point.lon);
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(point);
  stats.points++;
  for (const l of lights) {
    stats.lights++;
    if (l.unparsed) stats.unparsed++;
    const base = (l.char.match(/^[A-Za-z]+/)?.[0] ?? "?").toUpperCase();
    stats.chars.set(base, (stats.chars.get(base) ?? 0) + 1);
  }
}

rmSync(OUTDIR, { recursive: true, force: true });
mkdirSync(OUTDIR, { recursive: true });
const manifest = { generatedAt: raw.fetchedAt, cellLat: CELL_LAT, cellLon: CELL_LON, points: stats.points, lights: stats.lights, cells: {} };

for (const [key, points] of cells) {
  const names = [];
  const compact = points.map((p) => {
    const rec = [p.id, p.lat, p.lon, p.lights, p.major ? 1 : 0, p.uncharted ? 1 : 0];
    if (p.name || p.ref) {
      rec.push(names.push(p.name ?? "") - 1, names.push(p.ref ?? "") - 1);
    }
    return rec;
  });
  writeFileSync(join(OUTDIR, `${key}.json`), JSON.stringify({ n: names, p: compact }));
  manifest.cells[key] = points.length;
  stats.shards++;
}
writeFileSync(join(OUTDIR, "index.json"), JSON.stringify(manifest));

console.log("=== cadencia pipeline stats ===");
console.log(`elements read:  ${stats.elements}`);
console.log(`points (nodes): ${stats.points}`);
console.log(`lights parsed:  ${stats.lights} (${stats.unparsed} fallback)`);
console.log(`uncharted towers: ${stats.uncharted}`);
console.log(`shards: ${stats.shards} cells -> ${OUTDIR}`);
console.log("character histogram:", Object.fromEntries([...stats.chars.entries()].sort((a, b) => b[1] - a[1])));
