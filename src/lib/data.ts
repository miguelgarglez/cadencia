// Light shard store: fetches cells under the viewport, keeps every light
// in one flat structure for the GL layer and the picker.

import type { Light, LightPoint } from "../iala.ts";
import { cellsForBounds, mercator } from "./geo.ts";

export type { Light, LightPoint };

interface RawPoint {
  // [id, lat, lon, lights, major, uncharted, nameIdx?, refIdx?]
  0: string; 1: number; 2: number; 3: Light[]; 4: number; 5: number; 6?: number; 7?: number;
}
interface Shard { n: string[]; p: RawPoint[] }

export interface Index { generatedAt: string; points: number; lights: number; cells: Record<string, number> }

export interface StorePoint extends LightPoint {
  mx: number; my: number; // mercator 0..1
  light: Light; // primary light for the field render
}

export class LightStore {
  points = new Map<string, StorePoint>();
  loaded = new Set<string>();
  pending = new Map<string, Promise<void>>();
  failedAt = new Map<string, number>();
  index: Index | null = null;
  onChange: (() => void) | null = null;
  onFail: (() => void) | null = null;
  private lastNeed: [number, number, number, number] | null = null;

  async init(): Promise<Index> {
    if (this.index) return this.index;
    const res = await fetch("/lights/index.json");
    if (!res.ok) throw new Error(`index ${res.status}`);
    this.index = (await res.json()) as Index;
    return this.index;
  }

  needBounds(w: number, s: number, e: number, n: number) {
    const now = Date.now();
    this.lastNeed = [w, s, e, n];
    const keys = cellsForBounds(w, s, e, n).filter((k) => {
      if (this.loaded.has(k) || this.pending.has(k)) return false;
      // a failed cell earns a retry after a cooldown — transient 404s/5xx happen
      const f = this.failedAt.get(k);
      if (f != null && now - f < 45_000) return false;
      if (f != null) this.failedAt.delete(k);
      // the index knows which cells exist — never 404-hunt empty ocean
      if (this.index && !(k in this.index.cells)) { this.loaded.add(k); return false; }
      return true;
    });
    for (const k of keys) {
      this.pending.set(k, this.fetchCell(k));
    }
  }

  private async fetchCell(key: string): Promise<void> {
    try {
      const res = await fetch(`/lights/${key}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const shard = (await res.json()) as Shard;
      for (const r of shard.p) {
        const id = r[0];
        if (this.points.has(id)) continue;
        const [mx, my] = mercator(r[2], r[1]);
        const lights = (r[3] as Light[]).map((l) => ({ ...l }));
        const point: StorePoint = {
          id,
          lat: r[1],
          lon: r[2],
          lights,
          light: lights[0]!,
          name: r[6] != null ? shard.n[r[6]] : undefined,
          ref: r[7] != null ? shard.n[r[7]] : undefined,
          major: r[4] === 1,
          uncharted: r[5] === 1,
          mx,
          my,
        };
        this.points.set(id, point);
      }
      this.loaded.add(key);
      this.pending.delete(key);
      this.onChange?.();
    } catch {
      this.pending.delete(key);
      this.failedAt.set(key, Date.now());
      this.onFail?.();
    }
  }

  // wipe the failure cooldowns and re-request the last seen viewport —
  // this is what the error tray's retry button calls
  retry() {
    this.failedAt.clear();
    if (this.lastNeed) this.needBounds(...this.lastNeed);
  }

  get failedCells(): number {
    return this.failedAt.size;
  }
}

export const store = new LightStore();
