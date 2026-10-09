import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import { store, type StorePoint } from "./lib/data.ts";
import { LightField } from "./lib/lightField.ts";
import { setSoundEnabled, isSoundOn, pulse } from "./lib/sound.ts";
import { bearingDeg } from "./lib/geo.ts";
import { colorHex, notation, type FlashColor, type Light } from "./iala.ts";
import { WebHaptics } from "web-haptics";
import LightCard from "./components/LightCard.tsx";
import Hud from "./components/Hud.tsx";
import Guide from "./components/Guide.tsx";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const KEEP: Record<string, string> = {
  background: "#04070c",
  water: "#04070c",
  water_shadow: "#050b14",
  landcover: "#0a1420",
  landuse: "#0a1420",
  landuse_residential: "#0a1420",
  park_national_park: "#0a1420",
  park_nature_reserve: "#0a1420",
  waterway: "#0d1a28",
};
const LABEL_KEEP = new Set(["watername_ocean", "watername_sea"]);

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
      /* layer variant without the property */
    }
  }
}

function hashToView(): { center: [number, number]; zoom: number } | null {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]!), lon = parseFloat(m[2]!), zoom = parseFloat(m[3]!);
  // a shared link must never crash the map — reject impossible views
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lon) > 360 || zoom < 0 || zoom > 22) return null;
  return { center: [lon, lat], zoom };
}

export default function App() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const fieldRef = useRef<LightField | null>(null);
  const hapticsRef = useRef(new WebHaptics());
  const vesselRef = useRef<{ el: HTMLDivElement; lat: number; lon: number } | null>(null);
  const vesselDrag = useRef(false);

  const [ready, setReady] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [selected, setSelected] = useState<StorePoint | null>(null);
  const [inView, setInView] = useState(0);
  const [total, setTotal] = useState(0);
  const [sound, setSound] = useState(false);
  const [about, setAbout] = useState(false);
  const [guideOn, setGuideOn] = useState(() => !localStorage.getItem("cadencia-guide-done"));
  const [vesselInfo, setVesselInfo] = useState<{ b: number; color: FlashColor | null; seen: Light | null } | null>(null);

  // ---------- map boot ----------
  let pumpCleanup: (() => void) | null = null;
  useEffect(() => {
    const fromHash = hashToView();
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
      renderWorldCopies: false, // one dark sea — lights exist at canonical mercator only
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    const field = new LightField(store);
    fieldRef.current = field;

    // only fatal while booting — a stray tile error mid-session is not the sea going silent
    map.on("error", () => { if (!map.loaded()) setDataError(true); });
    const bootWatchdog = setTimeout(() => { if (!map.loaded()) setDataError(true); }, 20000);

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
      // opening reveal: settle from the dark sea onto the busiest light field
      if (!fromHash && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        map.easeTo({ center: [0.4, 50.2], zoom: 5.3, duration: 3400, easing: (t) => 1 - Math.pow(1 - t, 4) });
      }
      map.on("idle", () => updateInView(map, setInView));
      // the sea never holds still: continuous repaint drives the flash clock
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
        history.replaceState(null, "", `#${c.lat.toFixed(3)},${c.lng.toFixed(3)},${z.toFixed(1)}`);
      });
      map.on("click", (e) => {
        const p = pick(map, e.point.x, e.point.y);
        if (p) select(map, p, e.point.x, e.point.y);
        else deselect();
      });
      map.on("mousemove", (e) => {
        const p = pick(map, e.point.x, e.point.y, 16);
        map.getCanvas().style.cursor = p ? "pointer" : "";
      });
    });

    store.init().then((ix) => setTotal(ix.lights)).catch(() => setDataError(true));
    // debug hook for verification scripts
    (window as unknown as Record<string, unknown>).__cadencia = store;
    (window as unknown as Record<string, unknown>).__map = map;
    return () => {
      pumpCleanup?.();
      clearTimeout(bootWatchdog);
      hapticsRef.current.destroy();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- selection ----------
  const deselect = useCallback(() => {
    setSelected(null);
    setVesselInfo(null);
    fieldRef.current?.setSelected(null);
    fieldRef.current?.setSelectedColor(null);
    removeVessel();
    updateOverlay();
  }, []);

  const select = useCallback((map: MLMap, p: StorePoint, _x: number, _y: number) => {
    setSelected(p);
    setVesselInfo(null);
    fieldRef.current?.setSelected(p.id);
    fieldRef.current?.setSelectedColor(null);
    const hasSectors = p.lights.some((l) => l.sectors.length);
    const cam = { center: [p.lon, p.lat] as [number, number], zoom: Math.max(map.getZoom(), hasSectors ? 9.5 : 7.5) };
    const moving = map.getZoom() !== cam.zoom || Math.abs(map.getCenter().lng - p.lon) > 0.001 || Math.abs(map.getCenter().lat - p.lat) > 0.001;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) map.jumpTo(cam);
    else map.easeTo({ ...cam, duration: 900, easing: (t) => 1 - Math.pow(1 - t, 3) });
    if (isSoundOn()) pulse(0, Math.min(0.8, p.light.period * 0.2));
    if (hasSectors) {
      // spawn only after the camera settles — unprojecting mid-flight strands it off-screen
      if (moving) map.once("moveend", () => { if (selectedRef.current === p) spawnVessel(map, p); });
      else spawnVessel(map, p);
    } else removeVessel();
    setTimeout(updateOverlay, 950);
  }, []);

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
    map.getCanvasContainer().appendChild(el);
    // spawn a fixed screen distance away so the vessel is always reachable
    const c = map.project([p.lon, p.lat]);
    const a = (140 * Math.PI) / 180;
    const ll = map.unproject([c.x + Math.sin(a) * 130, c.y - Math.cos(a) * 130]);
    vesselRef.current = { el, lat: ll.lat, lon: ll.lng };
    positionVessel(map);
    applyVesselBearing(p, ll.lat, ll.lng);

    let pid = -1;
    el.addEventListener("pointerdown", (e) => {
      pid = e.pointerId;
      el.setPointerCapture(pid);
      vesselDrag.current = true;
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("touchstart", (e) => e.stopPropagation());
    // pointer capture routes the release click back to the vessel — don't let it deselect
    el.addEventListener("click", (e) => e.stopPropagation());
    // keyboard: arrows walk the vessel around the light on a fixed screen circle
    el.addEventListener("keydown", (e) => {
      if (!vesselRef.current) return;
      const step = e.shiftKey ? 10 : 2;
      let d = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") d = step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -step;
      else return;
      e.preventDefault();
      const c = map.project([p.lon, p.lat]);
      const v = map.project([vesselRef.current.lon, vesselRef.current.lat]);
      const ang = Math.atan2(v.y - c.y, v.x - c.x) + (d * Math.PI) / 180;
      const r = Math.hypot(v.x - c.x, v.y - c.y) || 130;
      const ll = map.unproject([c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r]);
      vesselRef.current.lat = ll.lat;
      vesselRef.current.lon = ll.lng;
      positionVessel(map);
      applyVesselBearing(p, ll.lat, ll.lng);
    });
    el.addEventListener("pointermove", (e) => {
      if (!vesselDrag.current || !vesselRef.current) return;
      e.stopPropagation();
      const ll = map.unproject([e.clientX, e.clientY]);
      vesselRef.current.lat = ll.lat;
      vesselRef.current.lon = ll.lng;
      positionVessel(map);
      applyVesselBearing(p, ll.lat, ll.lng);
    });
    const up = () => { vesselDrag.current = false; pid = -1; };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, []);

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
      // crossing a sector boundary is a tactile event
      if (prev && prev.color !== color) hapticsRef.current.trigger("nudge");
      return { b, color, seen };
    });
    // outside the charted sectors the light is dark — dim it, don't lie
    fieldRef.current?.setSelectedColor(color ? hexToRgb(colorHex(color)) : [0.02, 0.03, 0.05]);
    vesselRef.current?.el.setAttribute("aria-valuenow", String(Math.round(b)));
    vesselRef.current?.el.setAttribute("aria-valuetext", `bearing ${Math.round(b)} degrees${color ? `, light shows ${color}` : ", outside charted sectors"}`);
    updateOverlay();
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
    const w = map.getCanvasContainer().clientWidth, h = map.getCanvasContainer().clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = selectedRef.current;
    if (!p) { positionVessel(map); return; }
    const c = map.project([p.lon, p.lat]);
    const zoom = map.getZoom();
    const metersPerPx = (156543.03392 * Math.cos((p.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const pxPerNm = 1852 / metersPerPx;
    for (const l of p.lights) {
      if (!l.sectors.length) continue;
      const rNm = l.rangeNm ?? 8;
      const rPx = Math.min(Math.max(rNm * pxPerNm, 30), Math.max(w, h) * 0.45);
      for (const s of l.sectors) {
        const col = colorHex(l.colors[s.color] ?? l.colors[0] ?? "W");
        // canvas angles: 0=east cw; bearing 0=north cw → a = (bearing - 90) * rad
        const a0 = ((s.start - 90) * Math.PI) / 180;
        const a1 = ((s.end - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.arc(c.x, c.y, rPx, a0, a1);
        ctx.closePath();
        ctx.fillStyle = col + "14";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c.x, c.y, rPx, a0, a1);
        ctx.strokeStyle = col + "66";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    positionVessel(map);
  }, []);

  const selectedRef = useRef<StorePoint | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => updateOverlay();
    map.on("move", onMove);
    map.on("render", onMove);
    return () => { map.off("move", onMove); map.off("render", onMove); };
  }, [updateOverlay, ready]);

  useEffect(() => { updateOverlay(); }, [selected, updateOverlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (about) setAbout(false);
      else if (selected) deselect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about, selected, deselect]);

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

  const shareSelected = useCallback(() => {
    if (!selected) return;
    import("./lib/share.ts").then((m) => m.shareCard(selected));
  }, [selected]);

  const vesselNote = useMemo(() => {
    if (!vesselInfo || !selected) return null;
    const { b, color, seen } = vesselInfo;
    if (!color || !seen) return `bearing ${Math.round(b)}° — outside the charted sectors, this light would not help you`;
    const word = color === "W" ? "white" : color === "R" ? "red" : color === "G" ? "green" : color === "Y" ? "yellow" : color === "Bu" ? "blue" : "violet";
    const which = seen !== selected.light ? ` (${notation(seen)})` : "";
    return `bearing ${Math.round(b)}° — from here the light shows ${word}${which}`;
  }, [vesselInfo, selected]);

  return (
    <>
      <div ref={wrapRef} className="map-wrap" />
      <canvas ref={overlayRef} className="map-wrap" style={{ pointerEvents: "none", zIndex: 8 }} />
      {!ready && (
        <div className="loading" role="status">
          {dataError ? (
            <>
              <div className="word">THE SEA DIDN'T ANSWER</div>
              <button className="act" onClick={() => location.reload()}>try again</button>
            </>
          ) : (
            <>
              <div className="pulse" />
              <div className="word">LISTENING TO THE SEA</div>
            </>
          )}
        </div>
      )}
      <Hud
        inView={inView}
        total={total}
        sound={sound}
        onSound={toggleSound}
        onAbout={() => setAbout(true)}
        onGuide={() => { localStorage.removeItem("cadencia-guide-done"); setGuideOn(true); }}
      />
      {selected && (
        <LightCard
          point={selected}
          vesselNote={vesselNote}
          onClose={deselect}
          onShare={shareSelected}
        />
      )}
      {guideOn && ready && (
        <Guide
          selected={selected}
          onDone={() => { localStorage.setItem("cadencia-guide-done", "1"); setGuideOn(false); }}
        />
      )}
      {about && <About onClose={() => setAbout(false)} />}
      {dataError && (
        <div className="err-tray" role="alert">
          <span>the light list failed to arrive — the sea is still here, but it can't speak</span>
          <button onClick={() => { setDataError(false); store.init().then((ix) => setTotal(ix.lights)).catch(() => setDataError(true)); }}>retry</button>
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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="tray" role="dialog" aria-label="about cadencia">
      <button className="x" onClick={onClose} aria-label="close">✕</button>
      <div className="cols">
        <div>
          <h3>cadencia</h3>
          <p>
            Every point of light on this chart is a real navigational light, blinking the
            exact signal mariners read at night. <b>Fl(3) 15s</b> means three flashes every
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
          <h3>&nbsp;</h3>
          <p>
            White, red, and green sectors are real: drag the vessel around a sectored light
            and watch it change color — that's how sailors know they're off the safe channel.
            The dimmer daylight dots are honest too: a light competes with the sun.
          </p>
          <p>
            Data © OpenStreetMap contributors (ODbL). Basemap © CARTO, OSM.
            Built by <a href="https://github.com/miguelgarglez" style={{ color: "inherit" }}>@miguelgarglez</a> — <a href="https://github.com/miguelgarglez/cadencia" style={{ color: "inherit" }}>source on GitHub</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
