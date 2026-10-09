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
  failed = new Set<string>();
  index: Index | null = null;
  onChange: (() => void) | null = null;

  async init(): Promise<Index> {
    if (this.index) return this.index;
    const res = await fetch("/lights/index.json");
    if (!res.ok) throw new Error(`index ${res.status}`);
    this.index = (await res.json()) as Index;
    return this.index;
  }

  needBounds(w: number, s: number, e: number, n: number) {
    const keys = cellsForBounds(w, s, e, n).filter((k) => !this.loaded.has(k) && !this.pending.has(k) && !this.failed.has(k));
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
      this.failed.add(key);
    }
  }

  get failedCells(): number {
    return this.failed.size;
  }
}

export const store = new LightStore();
