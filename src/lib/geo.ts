// Mercator math (maplibre custom-layer space), shard cells, and the sun.

export const CELL_LAT = 5;
export const CELL_LON = 10;

export function mercator(lon: number, lat: number): [number, number] {
  const x = (lon + 180) / 360;
  const φ = (lat * Math.PI) / 180;
  const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + φ / 2))) / 360;
  return [x, y];
}

export function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL_LAT)}_${Math.floor(lon / CELL_LON)}`;
}

export function cellsForBounds(w: number, s: number, e: number, n: number): string[] {
  if (e < w) e += 360; // antimeridian
  const keys: string[] = [];
  const w0 = Math.floor(w / CELL_LON), e0 = Math.floor(e / CELL_LON);
  const s0 = Math.max(-18, Math.floor(s / CELL_LAT));
  const n0 = Math.min(16, Math.floor(n / CELL_LAT));
  for (let i = s0; i <= n0; i++) {
    for (let j = w0; j <= e0; j++) {
      const jj = ((j + 18) % 36 + 36) % 36 - 18; // wrap lon cell into -18..17
      keys.push(`${i}_${jj}`);
    }
  }
  return keys;
}

// Subsolar point: enough precision to dim daylight, not to navigate.
export function subSolar(date = new Date()): { lat: number; lon: number } {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const lon = 180 - utcH * 15; // solar noon lon ≈ 0 at 12:00 UTC
  return { lat: decl, lon: ((lon + 540) % 360) - 180 };
}

// Solar elevation at a point — drives how strongly a light reads.
export function solarElevation(lat: number, lon: number, sub = subSolar()): number {
  const φ = (lat * Math.PI) / 180;
  const δ = (sub.lat * Math.PI) / 180;
  const h = ((lon - sub.lon) * Math.PI) / 180;
  return Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(h));
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const λ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(λ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function destPoint(lat: number, lon: number, bearingDeg: number, distKm: number): [number, number] {
  const R = 6371, d = distKm / R, θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180, λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [(φ2 * 180) / Math.PI, ((λ2 * 180) / Math.PI + 540) % 360 - 180];
}

// Seconds since UTC midnight — the shared clock every viewer's sea keeps.
export function todSeconds(): number {
  return (Date.now() / 1000) % 86400;
}
