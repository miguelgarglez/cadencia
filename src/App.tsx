import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import { store, type StorePoint } from "./lib/data.ts";
import { LightField } from "./lib/lightField.ts";
import { setSoundEnabled, isSoundOn, pulse, tick } from "./lib/sound.ts";
import { bearingDeg } from "./lib/geo.ts";
import { colorHex, notation, type FlashColor, type Light } from "./iala.ts";
import { WebHaptics } from "web-haptics";
import LightCard from "./components/LightCard.tsx";
import Hud from "./components/Hud.tsx";
import Guide, { type GuideAnchor } from "./components/Guide.tsx";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const DOCK_H = 40;
// layers whose land texture is welcome — everything else goes dark or away
const KEEP: Record<string, string> = {
  background: "#04070c",
  water: "#04070c",
  water_shadow: "#050b14",
  landcover: "#0c1724",
  landuse: "#0c1724",
  landuse_residential: "#0c1724",
  park_national_park: "#0c1724",
  park_nature_reserve: "#0c1724",
  waterway: "#0d1a28",
};
const LABEL_KEEP = new Set(["watername_ocean", "watername_sea"]);

// verified named lights with real white/red/green sectors — the guide's
// "obvious first target" and the direct entrance to the signature interaction
const SECTOR_SPOTS: { name: string; lat: number; lon: number }[] = [
  { name: "Castle Pile", lat: 50.7777, lon: -1.0942 },
  { name: "Charles Fort", lat: 51.6957, lon: -8.4996 },
  { name: "Ballinacourty Point", lat: 52.0781, lon: -7.553 },
  { name: "Großer Leuchtturm Borkum", lat: 53.5888, lon: 6.6621 },
  { name: "Holnis", lat: 54.8618, lon: 9.5735 },
  { name: "Antsirana", lat: -12.2676, lon: 49.2888 },
  { name: "Shark Island", lat: -26.6355, lon: 15.1526 },
  { name: "Queenscliff", lat: -38.2716, lon: 144.6619 },
  { name: "Archer Point", lat: -15.5937, lon: 145.3286 },
  { name: "Minni Minni", lat: -7.3267, lon: 72.4745 },
];

function restyle(map: MLMap) {
  const style = map.getStyle();
  for (const layer of style.layers) {
    const id = layer.id;
    try {
      if (KEEP[id] != null) {
        const type = layer.type;
        if (type === "background") map.setPaintProperty(id, "background-color", KEEP[id]!);
        else if (type === "fill") map.setPaintProperty(id, "fill-color", KEEP[id]!);
        else if (type === "line") map.setPaintProperty(id, "line-color", KEEP[id]!);
        else map.setLayoutProperty(id, "visibility", "none");
      } else if (LABEL_KEEP.has(id)) {
        map.setPaintProperty(id, "text-color", "#2e4a66");
        map.setPaintProperty(id, "text-opacity", 0.8);
        map.setLayoutProperty(id, "text-size", 11);
      } else if (id.startsWith("boundary_country")) {
        map.setPaintProperty(id, "line-color", "#16232f");
        map.setPaintProperty(id, "line-opacity", 0.4);
      } else {
        map.setLayoutProperty(id, "visibility", "none");
      }
    } catch {
      // a layer that refuses the color (pattern fills, rasters) must not stay
      // visible as mottled noise — it goes dark
      try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* gone */ }
    }
  }
}

// storage can be disabled entirely (private modes, locked-down browsers) —
// preferences then live in memory and nothing crashes
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* in-memory only */ } };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch { /* in-memory only */ } };

interface HashView { center: [number, number]; zoom: number; id?: string }

function hashToView(): HashView | null {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:\/([nwr]\d+))?/);
  if (!m) return null;
  const lat = parseFloat(m[1]!), lon = parseFloat(m[2]!), zoom = parseFloat(m[3]!);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lon) > 360 || zoom < 0 || zoom > 22) return null;
  return { center: [lon, lat], zoom, id: m[4] };
}

export default function App() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const fieldRef = useRef<LightField | null>(null);
  const hapticsRef = useRef(new WebHaptics());
  const vesselRef = useRef<{ el: HTMLDivElement; lat: number; lon: number } | null>(null);
  const vesselDrag = useRef(false);
  const sheetRef = useRef(240); // measured height, for camera padding + spawn bounds
  const pendingIdRef = useRef<string | null>(null);
  const lastActiveRef = useRef(Date.now());
  const guideTargetRef = useRef<StorePoint | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticsOn = useRef(true);
  const activeSeenRef = useRef<Light | null>(null);

  const [ready, setReady] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [linkMiss, setLinkMiss] = useState(false);
  const [selected, setSelected] = useState<StorePoint | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inView, setInView] = useState(0);
  const [total, setTotal] = useState(0);
  const [sound, setSound] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [about, setAbout] = useState(false);
  const [aboutLeaving, setAboutLeaving] = useState(false);
  const [guideOn, setGuideOn] = useState(() => !lsGet("cadencia-guide-done"));
  const [vesselInfo, setVesselInfo] = useState<{ b: number; color: FlashColor | null; seen: Light | null } | null>(null);
  const [crossed, setCrossed] = useState(false);
  const [guideAnchor, setGuideAnchor] = useState<GuideAnchor | null>(null);
  const [guideTargetName, setGuideTargetName] = useState<string | null>(null);

  hapticsOn.current = haptics;
  // stable identity: map/vessel listeners are bound once at mount and must
  // read the *current* preference, not the mount-time closure
  const haptic = useCallback((kind: "nudge" | "success" | "buzz") => {
    if (hapticsOn.current) hapticsRef.current.trigger(kind);
  }, []);

  // ---------- map boot ----------
  useEffect(() => {
    let pumpCleanup: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollStop: ReturnType<typeof setTimeout> | null = null;
    const fromHash = hashToView();
    pendingIdRef.current = fromHash?.id ?? null;
    const start = fromHash ?? { center: [0.8, 47.5] as [number, number], zoom: 3.1 };
    const map = new maplibregl.Map({
      container: wrapRef.current!,
      style: STYLE_URL,
      center: start.center,
      zoom: start.zoom,
      minZoom: 1.6,
      maxZoom: 16,
      attributionControl: { compact: true },
      fadeDuration: 0,
      renderWorldCopies: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    const field = new LightField(store);
    fieldRef.current = field;

    map.on("error", () => { if (!map.loaded()) setDataError(true); });
    const bootWatchdog = setTimeout(() => { if (!map.loaded()) setDataError(true); }, 20000);

    const markActive = () => { lastActiveRef.current = Date.now(); };
    map.on("mousedown", markActive);
    map.on("touchstart", markActive);
    map.on("wheel", markActive);
    map.on("dragstart", markActive);
    map.on("zoomstart", markActive);

    map.on("load", () => {
      clearTimeout(bootWatchdog);
      restyle(map);
      map.addLayer(field);
      field.setCalm(matchMedia("(prefers-reduced-motion: reduce)").matches);
      setReady(true);
      const sync = () => {
        const b = map.getBounds();
        store.needBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
      };
      sync();
      updateInView(map, setInView);
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!fromHash && !reduceMotion) {
        map.easeTo({ center: [-0.55, 50.6], zoom: 6.4, duration: 3400, easing: (t) => 1 - Math.pow(1 - t, 4) });
      }
      map.on("idle", () => updateInView(map, setInView));
      let raf = 0, slow: ReturnType<typeof setInterval> | null = null;
      const pump = () => { map.triggerRepaint(); raf = requestAnimationFrame(pump); };
      if (reduceMotion) slow = setInterval(() => map.triggerRepaint(), 1000);
      else raf = requestAnimationFrame(pump);
      pumpCleanup = () => { cancelAnimationFrame(raf); if (slow) clearInterval(slow); };
      map.on("moveend", sync);
      map.on("move", () => {
        updateOverlay();
        updateInView(map, setInView);
        const c = map.getCenter();
        const z = map.getZoom();
        const sel = selectedRef.current;
        history.replaceState(null, "", `#${c.lat.toFixed(3)},${c.lng.toFixed(3)},${z.toFixed(1)}${sel ? `/${sel.id}` : ""}`);
      });
      map.on("click", (e) => {
        const p = pick(map, e.point.x, e.point.y);
        if (p) select(map, p);
        else deselect();
      });
      map.on("mousemove", (e) => {
        const p = pick(map, e.point.x, e.point.y, 16);
        map.getCanvas().style.cursor = p ? "pointer" : "";
      });

      // resolve a shared link's light once its shard has arrived
      pollTimer = setInterval(() => {
        const want = pendingIdRef.current;
        if (!want) { clearInterval(pollTimer!); return; }
        const p = store.points.get(want);
        if (p) {
          pendingIdRef.current = null;
          clearInterval(pollTimer!);
          select(map, p);
        }
      }, 400);
      pollStop = setTimeout(() => {
        if (pollTimer) clearInterval(pollTimer);
        // the linked light never arrived — say so instead of hanging silent
        if (pendingIdRef.current) { pendingIdRef.current = null; setLinkMiss(true); }
      }, 15000);
    });

    // idle drift: an untouched sea slowly settles on the nearest light worth
    // watching — deniable, interruptible, never under reduced motion
    const idleTimer = setInterval(() => {
      if (!map.loaded()) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (selectedRef.current) return;
      if (Date.now() - lastActiveRef.current < 26000) return;
      lastActiveRef.current = Date.now();
      const c = map.getCenter();
      const b = map.getBounds();
      let best: StorePoint | null = null, bestD = Infinity;
      for (const p of store.points.values()) {
        if (p.uncharted || p.lat < b.getSouth() || p.lat > b.getNorth() || p.lon < b.getWest() || p.lon > b.getEast()) continue;
        const interesting = p.lights.some((l) => l.sectors.length || l.char.startsWith("Mo")) || p.name;
        if (!interesting) continue;
        const d = Math.hypot(p.lat - c.lat, p.lon - c.lng);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD < 8) {
        map.easeTo({ center: [best.lon, best.lat], zoom: Math.min(map.getZoom() + 1.2, 8), duration: 6000, easing: (t) => 1 - Math.pow(1 - t, 3) });
      }
    }, 5000);

    // in-view counts points, so the dock total does too — same units
    store.init().then((ix) => setTotal(ix.points)).catch(() => setDataError(true));
    store.onFail = () => setDataError(true);
    (window as unknown as Record<string, unknown>).__cadencia = store;
    (window as unknown as Record<string, unknown>).__map = map;
    return () => {
      pumpCleanup?.();
      if (pollTimer) clearInterval(pollTimer);
      if (pollStop) clearTimeout(pollStop);
      clearTimeout(bootWatchdog);
      clearInterval(idleTimer);
      store.onFail = null;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      hapticsRef.current.destroy();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- selection ----------
  const selectedRef = useRef<StorePoint | null>(null);
  selectedRef.current = selected;
  const vesselInfoRef = useRef<{ b: number; color: FlashColor | null; seen: Light | null } | null>(null);
  vesselInfoRef.current = vesselInfo;

  const freeRect = useCallback(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return { x0: 24, y0: 84, x1: vw - 24, y1: vh - sheetRef.current - DOCK_H - 20 };
  }, []);

  // overlay elements the vessel must not spawn under — measured live
  const blockedRects = useCallback((): DOMRect[] => {
    const out: DOMRect[] = [];
    for (const sel of [".guide-tip", ".sheet", ".err-tray"]) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (r && r.width) out.push(r);
    }
    return out;
  }, []);

  const removeVessel = useCallback(() => {
    vesselRef.current?.el.remove();
    vesselRef.current = null;
  }, []);

  const positionVessel = useCallback((map: MLMap) => {
    const v = vesselRef.current;
    if (!v) return;
    const pt = map.project([v.lon, v.lat]);
    v.el.style.left = `${pt.x}px`;
    v.el.style.top = `${pt.y}px`;
  }, []);

  // ---------- sector overlay canvas ----------
  const updateOverlay = useCallback(() => {
    const cv = overlayRef.current;
    const map = mapRef.current;
    if (!cv || !map) return;
    const dpr = devicePixelRatio || 1;
    const w = cv.clientWidth || map.getContainer().clientWidth;
    const h = cv.clientHeight || map.getContainer().clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = selectedRef.current;
    if (!p) { positionVessel(map); return; }
    const c = map.project([p.lon, p.lat]);
    const zoom = map.getZoom();
    const metersPerPx = (156543.03392 * Math.cos((p.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const pxPerNm = 1852 / metersPerPx;
    const v = vesselRef.current;

    // magenta chart star at the selected light — the symbol real charts print
    ctx.save();
    ctx.strokeStyle = "rgba(224,89,138,0.95)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r1 = 8, r2 = i % 2 === 0 ? 21 : 14;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
      ctx.lineTo(c.x + Math.cos(a) * r2, c.y + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.restore();

    for (const l of p.lights) {
      if (!l.sectors.length) continue;
      const rNm = l.rangeNm ?? 8;
      const rPx = Math.min(Math.max(rNm * pxPerNm, 34), Math.max(w, h) * 0.45);
      for (const s of l.sectors) {
        const col = colorHex(l.colors[s.color] ?? l.colors[0] ?? "W");
        const a0 = ((s.start - 90) * Math.PI) / 180;
        const a1 = ((s.end - 90) * Math.PI) / 180;
        const vi = vesselInfoRef.current;
        const isActive = !!(v && vi && vi.seen === l &&
          (s.start <= s.end
            ? vi.b >= s.start && vi.b <= s.end
            : vi.b >= s.start || vi.b <= s.end));
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.arc(c.x, c.y, rPx, a0, a1);
        ctx.closePath();
        ctx.fillStyle = col + (isActive ? "2e" : "13");
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c.x, c.y, rPx, a0, a1);
        ctx.strokeStyle = col + (isActive ? "dd" : "77");
        ctx.lineWidth = isActive ? 2 : 1.3;
        ctx.setLineDash(isActive ? [] : [3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // bearing leader: vessel to light
    if (v) {
      const s = map.project([v.lon, v.lat]);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = "rgba(224,89,138,0.6)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    positionVessel(map);
  }, [positionVessel]);

  const applyVesselBearing = useCallback((p: StorePoint, lat: number, lon: number) => {
    const b = bearingDeg(p.lat, p.lon, lat, lon);
    let color: FlashColor | null = null;
    let seen: Light | null = null;
    for (const l of p.lights) {
      for (const s of l.sectors) {
        const inArc = s.start <= s.end ? b >= s.start && b <= s.end : b >= s.start || b <= s.end;
        if (inArc) { color = l.colors[s.color] ?? l.colors[0] ?? "W"; seen = l; }
      }
    }
    setVesselInfo((prev) => {
      if (prev && prev.color !== color && color != null) {
        haptic("success");
        setCrossed(true);
        if (isSoundOn()) tick();
      } else if (prev && prev.color !== color) {
        haptic("nudge");
      }
      return { b, color, seen };
    });
    // the map dot replays the sub-light the vessel actually sees — a red 4s
    // sector flashes red at 4s on the chart, not the primary's white 10s
    if (seen !== activeSeenRef.current) {
      activeSeenRef.current = seen;
      fieldRef.current?.setActiveLight(seen);
    }
    fieldRef.current?.setSelectedColor(
      color ? hexToRgb(colorHex(color)) : [0.16, 0.2, 0.27], // outside sectors: a cold ember
    );
    const v = vesselRef.current;
    if (v) {
      v.el.setAttribute("aria-valuenow", String(Math.round(b)));
      v.el.setAttribute("aria-valuetext", `bearing ${Math.round(b)} degrees${color ? `, light shows ${color}` : ", outside charted sectors"}`);
      const ship = v.el.querySelector(".ship") as HTMLElement | null;
      if (ship) ship.style.setProperty("--rot", `${(b + 180) % 360}deg`);
    }
    updateOverlay();
  }, [haptic, updateOverlay]);

  const deselect = useCallback(() => {
    const map = mapRef.current;
    setLeaving(true);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => { leaveTimer.current = null; setSelected(null); setLeaving(false); }, 300);
    setVesselInfo(null);
    setCrossed(false);
    activeSeenRef.current = null;
    fieldRef.current?.setSelected(null);
    fieldRef.current?.setSelectedColor(null);
    fieldRef.current?.setActiveLight(null);
    removeVessel();
    updateOverlay();
    // focus was on the sheet — hand it back to the light picker
    if (document.querySelector(".sheet")?.contains(document.activeElement)) {
      setTimeout(() => document.querySelector<HTMLElement>('[data-act="light"]')?.focus(), 320);
    }
    if (map) {
      const c = map.getCenter(), z = map.getZoom();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) map.setPadding({ top: 0, left: 0, right: 0, bottom: 0 });
      else map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 400 });
      history.replaceState(null, "", `#${c.lat.toFixed(3)},${c.lng.toFixed(3)},${z.toFixed(1)}`);
    }
  }, [removeVessel, updateOverlay]);

  const select = useCallback((map: MLMap, p: StorePoint) => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setSelected(p);
    setLeaving(false);
    setVesselInfo(null);
    setCrossed(false);
    activeSeenRef.current = null;
    fieldRef.current?.setSelected(p.id);
    fieldRef.current?.setSelectedColor(null);
    fieldRef.current?.setActiveLight(null);
    const hasSectors = p.lights.some((l) => l.sectors.length);
    const pad = { top: 0, left: 0, right: 0, bottom: sheetRef.current + DOCK_H + 16 };
    const cam = { center: [p.lon, p.lat] as [number, number], zoom: Math.max(map.getZoom(), hasSectors ? 9.5 : 7.5) };
    const moving = map.getZoom() !== cam.zoom || Math.abs(map.getCenter().lng - p.lon) > 0.001 || Math.abs(map.getCenter().lat - p.lat) > 0.001;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      map.jumpTo({ ...cam, padding: pad });
    } else {
      map.easeTo({ ...cam, padding: pad, duration: 900, easing: (t) => 1 - Math.pow(1 - t, 3) });
    }
    history.replaceState(null, "", `#${p.lat.toFixed(3)},${p.lon.toFixed(3)},${Math.max(map.getZoom(), cam.zoom).toFixed(1)}/${p.id}`);
    if (isSoundOn()) pulse(0, Math.min(0.8, p.light.period * 0.2));
    if (hasSectors) {
      // spawn only after the camera settles — unprojecting mid-flight strands
      // it off-screen. jumpTo has already landed, so don't wait for moveend.
      if (moving && !reduceMotion) map.once("moveend", () => { if (selectedRef.current === p) spawnVessel(map, p); });
      else spawnVessel(map, p);
    } else removeVessel();
    setTimeout(updateOverlay, 950);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeVessel, updateOverlay]);

  // bearing light → vessel, measured in screen space so rose dragging agrees
  const currentScreenBearing = useCallback((map: MLMap, p: StorePoint): number => {
    const v = vesselRef.current;
    if (!v) return 0;
    const c = map.project([p.lon, p.lat]);
    const s = map.project([v.lon, v.lat]);
    return ((Math.atan2(s.x - c.x, c.y - s.y) * 180) / Math.PI + 360) % 360;
  }, []);

  const steerVesselTo = useCallback((map: MLMap, p: StorePoint, deg: number) => {
    const v = vesselRef.current;
    if (!v) return;
    const c = map.project([p.lon, p.lat]);
    const s = map.project([v.lon, v.lat]);
    const r = Math.hypot(s.x - c.x, s.y - c.y) || 130;
    const a = (deg * Math.PI) / 180;
    const ll = map.unproject([c.x + Math.sin(a) * r, c.y - Math.cos(a) * r]);
    v.lat = ll.lat; v.lon = ll.lng;
    positionVessel(map);
    applyVesselBearing(p, ll.lat, ll.lng);
  }, [applyVesselBearing, positionVessel]);

  const onSteer = useCallback((deg: number) => {
    const map = mapRef.current, p = selectedRef.current;
    if (map && p) steerVesselTo(map, p, deg);
  }, [steerVesselTo]);

  // ---------- vessel (sector bearing) ----------
  const spawnVessel = useCallback((map: MLMap, p: StorePoint) => {
    removeVessel();
    const el = document.createElement("div");
    el.className = "vessel";
    el.setAttribute("role", "slider");
    el.setAttribute("aria-label", "vessel — drag or use arrow keys to change bearing");
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "360");
    el.tabIndex = 0;
    // a directional silhouette that points back at its light
    el.innerHTML = `<span class="halo"></span><svg class="ship" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 L18 19 L12 15.5 L6 19 Z" fill="#f3ead6" stroke="#0a1420" stroke-width="0.8"/>
    </svg>`;
    map.getCanvasContainer().appendChild(el);

    // spawn on open screen — walk candidate bearings until the projected spot
    // clears the sheet, the dock, and the wordmark zone
    const c = map.project([p.lon, p.lat]);
    const fr = freeRect();
    const blocks = blockedRects();
    const clear = (x: number, y: number) =>
      x > fr.x0 && x < fr.x1 && y > fr.y0 && y < fr.y1 &&
      !blocks.some((r) => x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24);
    const R = window.innerWidth <= 640 ? 105 : 135;
    const widest = widestSectorMid(p);
    const candidates = [widest, ...[0, 30, 60, 300, 330, 90, 270, 45, 315, 150, 210].map((a) => (widest + a) % 360)];
    let pos: { x: number; y: number } | null = null;
    for (const deg of candidates) {
      const a = (deg * Math.PI) / 180;
      const x = c.x + Math.sin(a) * R, y = c.y - Math.cos(a) * R;
      if (clear(x, y)) { pos = { x, y }; break; }
    }
    // no bearing clears the overlays — widen the ring once, then clamp
    if (!pos) for (const RR of [R * 1.5, R * 2.2]) {
      for (const deg of candidates) {
        const a = (deg * Math.PI) / 180;
        const x = c.x + Math.sin(a) * RR, y = c.y - Math.cos(a) * RR;
        if (clear(x, y)) { pos = { x, y }; break; }
      }
      if (pos) break;
    }
    if (!pos) {
      const a = (widest * Math.PI) / 180;
      pos = {
        x: Math.min(Math.max(c.x + Math.sin(a) * R, fr.x0), fr.x1),
        y: Math.min(Math.max(c.y - Math.cos(a) * R, fr.y0), fr.y1),
      };
    }
    const ll = map.unproject([pos.x, pos.y]);
    vesselRef.current = { el, lat: ll.lat, lon: ll.lng };
    positionVessel(map);
    applyVesselBearing(p, ll.lat, ll.lng);

    let pid = -1;
    // grab offset: the vessel keeps its position relative to the finger —
    // no jump-to-center on pickup, secondary pointers are ignored
    let grabDX = 0, grabDY = 0;
    el.addEventListener("pointerdown", (e) => {
      if (pid !== -1) return;
      pid = e.pointerId;
      el.setPointerCapture(pid);
      vesselDrag.current = true;
      const vp = el.getBoundingClientRect();
      grabDX = e.clientX - (vp.left + vp.width / 2);
      grabDY = e.clientY - (vp.top + vp.height / 2);
      el.classList.add("grabbed");
      haptic("nudge");
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("touchstart", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (!vesselRef.current) return;
      const step = e.shiftKey ? 10 : 2;
      let d = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") d = step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -step;
      else return;
      e.preventDefault();
      steerVesselTo(map, p, currentScreenBearing(map, p) + d);
    });
    el.addEventListener("pointermove", (e) => {
      if (!vesselDrag.current || e.pointerId !== pid || !vesselRef.current) return;
      e.stopPropagation();
      const ll = map.unproject([e.clientX - grabDX, e.clientY - grabDY]);
      vesselRef.current.lat = ll.lat;
      vesselRef.current.lon = ll.lng;
      positionVessel(map);
      applyVesselBearing(p, ll.lat, ll.lng);
    });
    const up = () => { vesselDrag.current = false; pid = -1; el.classList.remove("grabbed"); };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, [applyVesselBearing, blockedRects, freeRect, haptic, positionVessel, removeVessel, steerVesselTo, currentScreenBearing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => updateOverlay();
    map.on("move", onMove);
    map.on("render", onMove);
    return () => { map.off("move", onMove); map.off("render", onMove); };
  }, [updateOverlay, ready]);

  useEffect(() => { updateOverlay(); }, [selected, updateOverlay]);

  // ---------- measure the sheet so the camera and vessel stay clear of it ----------
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(".sheet");
      if (el) sheetRef.current = el.getBoundingClientRect().height;
    };
    measure();
    const t = setInterval(measure, 800);
    return () => clearInterval(t);
  }, [selected]);

  // ---------- guide anchor: project the target light (or the vessel) ----------
  useEffect(() => {
    if (!guideOn) { setGuideAnchor(null); return; }
    const map = mapRef.current;
    if (!map || !ready) return;

    const tick = () => {
      // (re)resolve the curated target — its shard may arrive late
      if (!guideTargetRef.current) {
        const c = map.getCenter();
        let spot = SECTOR_SPOTS[0]!, spotD = Infinity;
        for (const s of SECTOR_SPOTS) {
          const d = Math.hypot(s.lat - c.lat, s.lon - c.lng);
          if (d < spotD) { spotD = d; spot = s; }
        }
        let target: StorePoint | null = null;
        let bestD = 0.02;
        for (const p of store.points.values()) {
          const d = Math.hypot(p.lat - spot.lat, p.lon - spot.lon);
          if (d < bestD) { bestD = d; target = p; }
        }
        if (target) {
          guideTargetRef.current = target;
          setGuideTargetName(target.name ?? spot.name);
        }
      }
      const v = vesselRef.current;
      const t = guideTargetRef.current;
      let pt: { x: number; y: number } | null = null;
      if (v) pt = map.project([v.lon, v.lat]);
      else if (t) pt = map.project([t.lon, t.lat]);
      if (!pt) { setGuideAnchor(null); return; }
      const vw = window.innerWidth, vh = window.innerHeight;
      const next = {
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        offscreen: pt.x < -40 || pt.x > vw + 40 || pt.y < -40 || pt.y > vh - DOCK_H + 20,
      };
      setGuideAnchor((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.offscreen === next.offscreen ? prev : next
      );
    };
    tick();
    const t = setInterval(tick, 350);
    // anchors track the camera live — no easing lag during pans
    map.on("move", tick);
    return () => { clearInterval(t); map.off("move", tick); };
  }, [guideOn, ready]);

  const flyToGuideTarget = useCallback(() => {
    const map = mapRef.current;
    const t = guideTargetRef.current;
    if (!map || !t) return;
    const b = map.getBounds();
    store.needBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
    store.needBounds(t.lon - 1, t.lat - 1, t.lon + 1, t.lat + 1);
    map.easeTo({ center: [t.lon, t.lat], zoom: Math.max(map.getZoom(), 8.5), duration: 2400, easing: (x) => 1 - Math.pow(1 - x, 3) });
  }, []);

  const closeAbout = useCallback(() => {
    setAboutLeaving(true);
    setTimeout(() => { setAbout(false); setAboutLeaving(false); }, 320);
  }, []);

  // keyboard entry into selection: cycles through the lights nearest to the
  // view center — the pointer's click is the primary path, this is its peer
  const cycleLight = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const c = map.getCenter();
    const b = map.getBounds();
    const pts = [...store.points.values()]
      .filter((p) => !p.uncharted && p.lat >= b.getSouth() && p.lat <= b.getNorth() && p.lon >= b.getWest() && p.lon <= b.getEast())
      .sort((a, z) => Math.hypot(a.lat - c.lat, a.lon - c.lng) - Math.hypot(z.lat - c.lat, z.lon - c.lng));
    if (!pts.length) return;
    const cur = selectedRef.current;
    const at = cur ? pts.findIndex((p) => p.id === cur.id) : -1;
    const next = pts[(at + 1) % Math.min(pts.length, 40)]!;
    select(map, next);
    setTimeout(() => document.querySelector<HTMLElement>(".sheet .x")?.focus(), 950);
  }, [ready, select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (about) closeAbout();
        else if (selected) deselect();
      } else if ((e.key === "l" || e.key === "L") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        cycleLight();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about, selected, deselect, closeAbout, cycleLight]);

  // ---------- misc ----------
  const pick = useCallback((map: MLMap, x: number, y: number, radius = 20): StorePoint | null => {
    const b = map.getBounds();
    let best: StorePoint | null = null;
    let bestD = radius;
    for (const p of store.points.values()) {
      if (p.uncharted) continue;
      if (p.lat < b.getSouth() || p.lat > b.getNorth() || p.lon < b.getWest() || p.lon > b.getEast()) continue;
      const pt = map.project([p.lon, p.lat]);
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }, []);

  const toggleSound = useCallback(() => {
    setSound((s) => { setSoundEnabled(!s); return !s; });
  }, []);

  const toggleHaptics = useCallback(() => {
    setHaptics((h) => !h);
  }, []);

  const copyLink = useCallback(async (): Promise<boolean> => {
    const p = selectedRef.current;
    const map = mapRef.current;
    if (!p || !map) return false;
    const z = map.getZoom();
    const url = `${location.origin}/#${p.lat.toFixed(3)},${p.lon.toFixed(3)},${z.toFixed(1)}/${p.id}`;
    try {
      await navigator.clipboard.writeText(url);
      haptic("success");
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (ok) haptic("success");
        return ok;
      } catch {
        return false;
      }
    }
  }, [haptic]);

  const saveCard = useCallback(async (): Promise<boolean> => {
    const p = selectedRef.current;
    if (!p) return false;
    try {
      const m = await import("./lib/share.ts");
      const ok = await m.shareCard(p, vesselInfoRef.current?.seen ?? p.light, vesselInfoRef.current?.b ?? null);
      if (ok) haptic("success");
      return ok;
    } catch {
      return false;
    }
  }, [haptic]);

  const vesselNote = useMemo(() => {
    if (!vesselInfo || !selected) return null;
    const { b, color, seen } = vesselInfo;
    if (!color || !seen) return `bearing ${Math.round(b)}° — outside the charted sectors, this light would not help you`;
    const word = color === "W" ? "white" : color === "R" ? "red" : color === "G" ? "green" : color === "Y" ? "yellow" : color === "Bu" ? "blue" : "violet";
    const which = seen !== selected.light ? ` (${notation(seen)})` : "";
    return `bearing ${Math.round(b)}° — from here the light shows ${word}${which}`;
  }, [vesselInfo, selected]);

  const activeLight = vesselInfo?.seen ?? selected?.light;

  return (
    <>
      <div ref={wrapRef} className="map-wrap" />
      <canvas ref={overlayRef} className="map-wrap" style={{ pointerEvents: "none", zIndex: 8 }} />
      <div className={`loading${ready ? " gone" : ""}`} role="status" aria-hidden={ready}>
        {dataError && !ready ? (
          <div className="inner">
            <div className="word">THE SEA DIDN'T ANSWER</div>
            <div className="sub">the chart failed to load</div>
            <button className="act" onClick={() => location.reload()}>try again</button>
          </div>
        ) : (
          <div className="inner">
            <div className="pulse" />
            <div className="word">LISTENING TO THE SEA</div>
            <div className="sub">real navigational lights, replaying their charted rhythms</div>
          </div>
        )}
      </div>
      {ready && (
        <Hud
          inView={inView}
          total={total}
          sound={sound}
          haptics={haptics}
          onSound={toggleSound}
          onHaptics={toggleHaptics}
          onAbout={() => setAbout(true)}
          onGuide={() => { lsDel("cadencia-guide-done"); setGuideOn(true); }}
          onLight={cycleLight}
        />
      )}
      {selected && (
        <LightCard
          point={selected}
          vesselNote={vesselNote}
          vesselBearing={vesselInfo?.b ?? null}
          activeLight={activeLight!}
          leaving={leaving}
          onSteer={onSteer}
          onClose={deselect}
          onCopyLink={copyLink}
          onSaveCard={saveCard}
          onHeightChange={(h) => {
            sheetRef.current = h;
            mapRef.current?.setPadding({ top: 0, left: 0, right: 0, bottom: h + DOCK_H + 16 });
          }}
        />
      )}
      {guideOn && ready && inView > 0 && (
        <Guide
          anchor={guideAnchor}
          selected={selected}
          vesselActive={!!vesselRef.current}
          crossed={crossed}
          targetName={guideTargetName}
          onFlyToTarget={flyToGuideTarget}
          onTargetClick={() => {
            const map = mapRef.current, t = guideTargetRef.current;
            if (map && t) select(map, t);
          }}
          onDone={() => { lsSet("cadencia-guide-done", "1"); setGuideOn(false); }}
        />
      )}
      {about && <About onClose={closeAbout} leaving={aboutLeaving} />}
      {dataError && ready && (
        <div className="err-tray" role="alert">
          <span>the light list failed to arrive — the sea is still here, but it can't speak</span>
          <button onClick={() => { setDataError(false); store.retry(); store.init().then((ix) => setTotal(ix.points)).catch(() => setDataError(true)); }}>retry</button>
        </div>
      )}
      {linkMiss && (
        <div className="err-tray" role="alert">
          <span>that light isn't on this chart — it may have been renamed or dropped at sea</span>
          <button onClick={() => setLinkMiss(false)}>dismiss</button>
        </div>
      )}
    </>
  );
}

function updateInView(map: MLMap, set: (n: number) => void) {
  const b = map.getBounds();
  let n = 0;
  for (const p of store.points.values()) {
    if (p.lon >= b.getWest() && p.lon <= b.getEast() && p.lat >= b.getSouth() && p.lat <= b.getNorth() && !p.uncharted) n++;
  }
  set(n);
}

function widestSectorMid(p: StorePoint): number {
  let best = 140, span = -1;
  for (const l of p.lights) {
    for (const s of l.sectors) {
      let w = s.end - s.start;
      if (w <= 0) w += 360;
      if (w > span) { span = w; best = (s.start + w / 2) % 360; }
    }
  }
  return best;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function About({ onClose, leaving }: { onClose: () => void; leaving: boolean }) {
  return (
    <div className={`tray${leaving ? " exit" : ""}`} role="dialog" aria-label="about cadencia">
      <button className="x" onClick={onClose} aria-label="close">✕</button>
      <div className="cols">
        <div>
          <h3>The list</h3>
          <p>
            Every point of light on this chart is a real navigational light, blinking the
            signal mariners read at night. <b>Fl(3) 15s</b> means three flashes every
            fifteen seconds. <b>Oc(2)WRG</b> means two eclipses, and its color changes with
            the direction you look at it from — a language older than radio, still running.
          </p>
          <p>
            Nothing here is animated by hand. The codes come from OpenStreetMap's seamark
            tags — <code>seamark:light:character</code>, <code>period</code>, <code>sequence</code> —
            parsed into timelines and replayed against one shared clock. Two people looking
            at the same second see the same sea.
          </p>
        </div>
        <div>
          <h3>Sectors</h3>
          <p>
            White, red, and green sectors are real: drag the vessel around a sectored light
            and watch it change color — that's how sailors know they've left the safe channel.
            The rose on the sheet is the same instrument: drag its needle, or steer the
            vessel with arrow keys.
          </p>
          <h3>The clock</h3>
          <p>
            Where OpenStreetMap carries an explicit <code>sequence</code>, cadencia replays
            it exactly. Where it carries only a character like <b>Fl(3)</b>, the rhythm is
            reconstructed to that code's rules — a few lights mark themselves as inferred.
            Phases share the same UTC second, so the sea you see is the sea anyone sees.
          </p>
          <p>
            Data © OpenStreetMap contributors (ODbL). Chart © CARTO, OSM.
          </p>
        </div>
      </div>
    </div>
  );
}
