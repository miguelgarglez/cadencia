import { useCallback, useEffect, useRef, useState } from "react";
import type { StorePoint } from "../lib/data.ts";
import { colorHex, notation, type Light } from "../iala.ts";
import { todSeconds } from "../lib/geo.ts";

// The decode sheet: a light-list entry — name, notation, live timing strip,
// bearing rose for sectored lights, share actions.
export default function LightCard({
  point,
  vesselNote,
  vesselBearing,
  activeLight,
  leaving,
  onSteer,
  onClose,
  onCopyLink,
  onSaveCard,
  onHeightChange,
  onSettle,
  onHaptic,
  reduced,
}: {
  point: StorePoint;
  vesselNote: string | null;
  vesselBearing: number | null;
  activeLight: Light;
  leaving: boolean;
  onSteer: (bearingDeg: number) => void;
  onClose: () => void;
  onCopyLink: () => Promise<boolean>;
  onSaveCard: () => Promise<{ ok: boolean; url?: string; filename?: string }>;
  onHeightChange?: (h: number) => void;
  onSettle?: () => void;
  onHaptic?: (kind: "nudge" | "success" | "buzz") => void;
  reduced?: boolean;
}) {
  const l = activeLight;
  const stripRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(400);
  const [peek, setPeek] = useState(() => window.innerWidth <= 640);
  const [linkState, setLinkState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const [cardState, setCardState] = useState<"idle" | "busy" | "done" | "fail">("idle");

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // playhead sweeps live — same time-of-day clock the sea uses
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduced || l.period <= 0) { setT(0); return; }
    let raf = 0;
    const loop = () => {
      setT(todSeconds() % l.period);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [l, reduced]);

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cardRef.current?.focus(); }, [point.id]);

  // tell the map when our real height changes so the camera re-pads itself
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !onHeightChange) return;
    const ro = new ResizeObserver(() => onHeightChange(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  // the grip is the sheet's handle: the sheet tracks the finger continuously,
  // then settles to the nearest detent on distance AND release velocity —
  // the tail of the gesture animates, it doesn't snap
  const gripDrag = useRef<{ pid: number; y0: number; moved: boolean; overDetent: boolean; trail: { y: number; t: number }[] } | null>(null);
  const settle = useCallback((el: HTMLElement, travel: number, v: number, nextPeek: boolean) => {
    el.classList.remove("dragging");
    el.classList.add("settling");
    // carry the release speed into the settle: faster flicks land sooner
    const dur = Math.min(300, Math.max(130, Math.abs(travel) / Math.max(Math.abs(v), 0.6)));
    el.style.transitionDuration = `${dur}ms`;
    setPeek(nextPeek);
    requestAnimationFrame(() => { el.style.transform = "translateY(0px)"; });
    const done = () => {
      el.classList.remove("settling");
      el.style.transitionDuration = "";
      el.style.transform = "";
      el.removeEventListener("transitionend", done);
      onSettle?.();
    };
    el.addEventListener("transitionend", done);
    setTimeout(done, dur + 60); // transitionend can be lost under pointer capture
  }, [onSettle]);
  const endGrip = useCallback((e: React.PointerEvent<HTMLElement> | PointerEvent) => {
    const g = gripDrag.current;
    if (!g || e.pointerId !== g.pid) return;
    gripDrag.current = null;
    const el = cardRef.current;
    if (!el) return;
    if (!g.moved) {
      el.classList.remove("dragging");
      setPeek((p) => !p);
      onHaptic?.("nudge");
      onSettle?.();
      return;
    }
    // release velocity from the last ~120ms of the gesture, not the final tick
    const trail = g.trail;
    const last = trail[trail.length - 1]!;
    const ref = trail.find((s) => last.t - s.t < 120) ?? trail[0]!;
    const v = (last.y - ref.y) / Math.max(last.t - ref.t, 1); // px/ms
    const travel = last.y - g.y0;
    const flick = Math.abs(v) > 0.35;
    const next = peek ? !(travel < -60 || (flick && v < 0)) : travel > 60 || (flick && v > 0);
    if (next !== peek) onHaptic?.("nudge");
    settle(el, travel, v, next);
  }, [peek, settle, onHaptic, onSettle]);
  const onGripDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (gripDrag.current) return; // one pointer owns the sheet
    gripDrag.current = { pid: e.pointerId, y0: e.clientY, moved: false, overDetent: false, trail: [{ y: e.clientY, t: e.timeStamp }] };
    e.currentTarget.setPointerCapture(e.pointerId);
    cardRef.current?.classList.add("dragging"); // follow the finger, no easing
  }, []);
  const onGripMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gripDrag.current;
    if (!g || e.pointerId !== g.pid) return;
    const el = cardRef.current;
    if (!el) return;
    const dy = e.clientY - g.y0;
    if (Math.abs(dy) > 4) g.moved = true;
    if (!g.moved) return;
    // follow the finger: peek can only stretch up, expanded only down
    const travel = peek ? Math.min(dy, 0) : Math.max(dy, 0);
    el.style.transform = `translateY(${travel}px)`;
    // a nudge the moment the drag crosses the settle threshold — the detent
    // is felt mid-gesture, not discovered on release
    const over = Math.abs(travel) > 60;
    if (over !== g.overDetent) { g.overDetent = over; onHaptic?.("nudge"); }
    g.trail.push({ y: e.clientY, t: e.timeStamp });
    if (g.trail.length > 8) g.trail.shift();
  }, [peek, onHaptic]);

  const flash = (set: typeof setLinkState) => (ok: Promise<boolean>) => {
    set("busy");
    ok.then((good) => {
      set(good ? "done" : "fail");
      setTimeout(() => set("idle"), 2400);
    });
  };

  const name = point.name ?? point.ref ?? "unnamed light";
  const sectored = point.lights.some((x) => x.sectors.length > 0);
  const tp = l.period > 0 && !reduced ? t / l.period : -1;
  const W = w - 4, H = 38, y = 16;
  let acc = 0;
  const segs = l.segs.map((s) => {
    const x0 = (acc / l.period) * W;
    acc += s.dur;
    const x1 = (acc / l.period) * W;
    return { x0, x1, s };
  });
  const fixed = l.segs.length > 0 && l.segs.every((s) => s.level > 0);

  return (
    <div
      className={`sheet${leaving ? " exit" : ""}${peek ? " peek" : ""}`}
      role="dialog"
      aria-label={`light ${name}`}
      ref={cardRef}
      tabIndex={-1}
    >
      <div className="body">
        <button className="x" onClick={onClose} aria-label="close">✕</button>
        <div
          className="gripzone"
          role="button"
          tabIndex={0}
          aria-label={peek ? "expand the light list entry" : "collapse it"}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={endGrip}
          onPointerCancel={endGrip}
          onLostPointerCapture={endGrip}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPeek((p) => !p); onSettle?.(); } }}
        >
          <span className="grip" aria-hidden />
        </div>
        <div className="head">
          <div className="lead">
            <h2>{name}</h2>
            {point.ref && <span className="ref">{point.ref}</span>}
          </div>
          <div className="sub peekable">
            {`${point.lat.toFixed(3)}° ${point.lat >= 0 ? "N" : "S"}, ${Math.abs(point.lon).toFixed(3)}° ${point.lon >= 0 ? "E" : "W"}`}
          </div>
          <div className="notation"><span key={notation(l)} className="val">{notation(l)}</span>{sectored ? <span className="chip">sectored</span> : null}</div>
        </div>
        <div className="strip" ref={stripRef}>
          <div className="verdict"><span key={describe(l)} className="val">{describe(l)}</span></div>
          <svg viewBox={`0 0 ${w} ${H}`} aria-hidden>
            <line x1={0} x2={W} y1={y} y2={y} stroke="#16283a" strokeWidth={1} />
            {l.period > 0 && [...Array(Math.floor(l.period)).keys()].map((s) => (
              <line key={s} className="tick" x1={(s / l.period) * W} x2={(s / l.period) * W} y1={y + 6} y2={y + 10} />
            ))}
            {l.period <= 0 && (
              <line x1={2} x2={W - 2} y1={y} y2={y} stroke={colorHex(l.colors[0] ?? "W")} strokeWidth={7} strokeLinecap="round" className="seg-lit" />
            )}
            {l.period > 0 && segs.map(({ x0, x1, s }, i) =>
              s.level > 0 ? (
                <line
                  key={i}
                  x1={x0 + 2}
                  x2={Math.max(x0 + 2, x1 - 2)}
                  y1={y}
                  y2={y}
                  stroke={colorHex(l.colors[s.color] ?? "W")}
                  strokeWidth={s.level === 2 ? 11 : 7}
                  strokeLinecap="round"
                  className="seg-lit"
                />
              ) : null,
            )}
            {tp >= 0 && (
              <>
                <line className="playhead-glow" x1={tp * W} x2={tp * W} y1={3} y2={H - 3} />
                <line className="playhead" x1={tp * W} x2={tp * W} y1={5} y2={H - 5} />
              </>
            )}
            {l.period > 0 && (
              <>
                <text x={0} y={H - 2} fontSize={10} fill="#7f90a2" fontFamily="IBM Plex Mono, monospace">0s</text>
                <text x={W} y={H - 2} fontSize={10} fill="#7f90a2" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
                  {l.period}s
                </text>
              </>
            )}
          </svg>
        </div>
        <div className="rest">
          <div className="meta peekable">
            {l.rangeNm != null && <span>range <b>{l.rangeNm} nmi</b></span>}
            {l.heightM != null && <span>height <b>{l.heightM} m</b></span>}
            {l.group.length > 1 && <span>group <b>{l.group.join("+")}</b></span>}
          </div>
          {vesselNote && <div className="note peekable"><span key={vesselNote} className="val">{vesselNote}.</span></div>}
          {fixed && <div className="note peekable">a fixed light — it never blinks, it simply burns.</div>}
          <div className="actions peekable">
            <button
              className={`act ${linkState}`}
              onClick={() => flash(setLinkState)(onCopyLink())}
            >
              {linkState === "done" ? "link copied" : linkState === "fail" ? "couldn't copy" : linkState === "busy" ? "copying…" : "copy link"}
            </button>
            <button
              className={`act ${cardState}`}
              onClick={() => {
                setCardState("busy");
                onSaveCard().then(({ ok, url, filename }) => {
                  if (ok && url && filename) {
                    // the card the button names is the card that downloads —
                    // one tap, no staging step
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    a.click();
                    setCardState("done");
                  } else setCardState("fail");
                  setTimeout(() => setCardState("idle"), 2400);
                });
              }}
            >
              {cardState === "done" ? "saved ✓" : cardState === "fail" ? "card failed" : cardState === "busy" ? "drawing…" : "record this bearing"}
            </button>
          </div>
        </div>
      </div>
      {sectored && <Rose point={point} bearing={vesselBearing} onSteer={onSteer} />}
    </div>
  );
}

// A one-line plain reading of the signal — the notation stays, this is what
// it means. Inference stays honest: approx signals say so first.
function describe(l: Light): string {
  const colName = (c: string) => ({ W: "white", R: "red", G: "green", Y: "amber", Bu: "blue" })[c] ?? "white";
  const cyc = `full cycle ${Math.round(l.period * 10) / 10}s`;
  if (l.unparsed) return "unusual signal — shown as a single flash";
  const char = l.char.toUpperCase().replace(/[()]/g, "");
  let base: string;
  if (char.startsWith("AL")) base = `alternates ${l.colors.map(colName).join(" and ")}`;
  else if (char.startsWith("ISO")) base = "equal light and dark";
  else if (char.startsWith("LFL")) base = "one long flash";
  else if (/^I?U?VQ/.test(char)) base = "very quick flashes";
  else if (/^I?U?Q/.test(char)) base = "uninterrupted quick flashes";
  else if (char.startsWith("MO")) base = `morse ${char.match(/MO([A-Z])/)?.[1] ?? "code"}`;
  else if (char.startsWith("FFL")) base = "steady with a flash";
  else if (char.startsWith("OC")) base = `eclipses${l.group.reduce((a, b) => a + b, 0) > 1 ? ` in groups of ${l.group.join("+")}` : ""}`;
  else if (char.startsWith("FL")) base = l.group.reduce((a, b) => a + b, 0) > 1 ? `flashes in groups of ${l.group.join("+")}` : "a single flash";
  else if (char.startsWith("F")) base = "burns steady";
  else base = notation(l);
  return `${l.inferred ? "approx — " : ""}${base}; ${cyc}`;
}

// The bearing rose: sector arcs at their true bearings, a needle for the
// vessel. Dragging the rose steers the vessel around the light.
function Rose({
  point,
  bearing,
  onSteer,
}: {
  point: StorePoint;
  bearing: number | null;
  onSteer: (deg: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pid: number; off: number } | null>(null);
  const [grabbed, setGrabbed] = useState(false);
  const R = 38, C = 50;

  const angleOf = useCallback((e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  }, []);

  const arcs: { d: string; col: string }[] = [];
  for (const l of point.lights) {
    for (const s of l.sectors) {
      const col = colorHex(l.colors[s.color] ?? l.colors[0] ?? "W");
      const a0 = ((s.start - 90) * Math.PI) / 180;
      let span = s.end - s.start;
      if (span <= 0) span += 360;
      const a1 = ((s.start + span - 90) * Math.PI) / 180;
      const x0 = C + Math.cos(a0) * R, y0 = C + Math.sin(a0) * R;
      const x1 = C + Math.cos(a1) * R, y1 = C + Math.sin(a1) * R;
      arcs.push({ d: `M ${x0} ${y0} A ${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}`, col });
    }
  }
  const needle = bearing == null ? null : ((bearing - 90) * Math.PI) / 180;

  return (
    <div className={`rose${grabbed ? " grabbed" : ""}`}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        width="88"
        height="88"
        role="slider"
        tabIndex={0}
        aria-label="vessel bearing"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={bearing == null ? undefined : Math.round(bearing)}
        aria-valuetext={bearing == null ? "no vessel" : `${Math.round(bearing)} degrees true`}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          let d = 0;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") d = step;
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -step;
          else return;
          e.preventDefault();
          onSteer(((bearing ?? 0) + d + 360) % 360);
        }}
        onPointerDown={(e) => {
          if (drag.current) return; // one pointer steers
          e.currentTarget.setPointerCapture(e.pointerId);
          // grab offset: the needle keeps its angle under the finger
          const off = bearing == null ? 0 : angleOf(e) - bearing;
          drag.current = { pid: e.pointerId, off };
          setGrabbed(true); // touch gets a visible acknowledgement, not just a cursor
          if (bearing == null) onSteer(angleOf(e));
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || e.pointerId !== d.pid) return;
          onSteer(((angleOf(e) - d.off) % 360 + 360) % 360);
        }}
        onPointerUp={(e) => { if (drag.current?.pid === e.pointerId) { drag.current = null; setGrabbed(false); } }}
        onPointerCancel={(e) => { if (drag.current?.pid === e.pointerId) { drag.current = null; setGrabbed(false); } }}
        onLostPointerCapture={(e) => { if (drag.current?.pid === e.pointerId) { drag.current = null; setGrabbed(false); } }}
      >
        <circle cx={C} cy={C} r={R + 6} fill="none" stroke="#16283a" strokeWidth={1} />
        {[0, 90, 180, 270].map((d) => {
          const a = ((d - 90) * Math.PI) / 180;
          return (
            <line
              key={d}
              x1={C + Math.cos(a) * (R + 4)}
              y1={C + Math.sin(a) * (R + 4)}
              x2={C + Math.cos(a) * (R + 8)}
              y2={C + Math.sin(a) * (R + 8)}
              stroke="#46586b"
              strokeWidth={1}
            />
          );
        })}
        <text x={C} y={C - R - 10} fontSize={9.5} fill="#7f90a2" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">N</text>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill="none" stroke={a.col} strokeWidth={4.5} strokeLinecap="round" opacity={0.85} />
        ))}
        {needle != null && (
          <>
            <line
              x1={C} y1={C}
              x2={C + Math.cos(needle) * (R - 4)}
              y2={C + Math.sin(needle) * (R - 4)}
              stroke="#e9edf3" strokeWidth={1.4}
            />
            <circle cx={C + Math.cos(needle) * (R - 4)} cy={C + Math.sin(needle) * (R - 4)} r={2.6} fill="#e9edf3" />
          </>
        )}
        <circle cx={C} cy={C} r={3} fill="#e0598a" />
      </svg>
      <div className="cap">{bearing == null ? "drag to steer" : <><b>{Math.round(bearing)}°</b> true<i className="cue">drag to steer</i></>}</div>
    </div>
  );
}
