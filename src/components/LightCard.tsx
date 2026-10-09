import { useCallback, useEffect, useRef, useState } from "react";
import type { StorePoint } from "../lib/data.ts";
import { colorHex, notation, type Light } from "../iala.ts";
import { todSeconds } from "../lib/geo.ts";
import { WebHaptics } from "web-haptics";

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
}: {
  point: StorePoint;
  vesselNote: string | null;
  vesselBearing: number | null;
  activeLight: Light;
  leaving: boolean;
  onSteer: (bearingDeg: number) => void;
  onClose: () => void;
  onCopyLink: () => Promise<boolean>;
  onSaveCard: () => Promise<{ ok: boolean; url?: string }>;
  onHeightChange?: (h: number) => void;
  onSettle?: () => void;
}) {
  const l = activeLight;
  const stripRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(400);
  const [peek, setPeek] = useState(() => window.innerWidth <= 640);
  const [linkState, setLinkState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const [cardState, setCardState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const [cardPeek, setCardPeek] = useState<string | null>(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // playhead sweeps live — same time-of-day clock the sea uses
  const [t, setT] = useState(0);
  const reduced = useRef(matchMedia("(prefers-reduced-motion: reduce)").matches).current;
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
  // then settles to the nearest detent on distance AND velocity
  const gripDrag = useRef<{ pid: number; y0: number; t0: number; lastY: number; lastT: number; moved: boolean } | null>(null);
  const hapticsRef = useRef<WebHaptics | null>(null);
  const onGripDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (gripDrag.current) return; // one pointer owns the sheet
    gripDrag.current = { pid: e.pointerId, y0: e.clientY, t0: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, moved: false };
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
    g.lastY = e.clientY;
    g.lastT = e.timeStamp;
  }, [peek]);
  const onGripUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gripDrag.current;
    if (!g || e.pointerId !== g.pid) return;
    gripDrag.current = null;
    const el = cardRef.current;
    if (el) { el.style.transform = ""; el.classList.remove("dragging"); }
    if (!g.moved) { setPeek((p) => !p); hapticsRef.current ??= new WebHaptics(); hapticsRef.current.trigger("nudge"); onSettle?.(); return; }
    const dy = e.clientY - g.y0;
    const v = (e.clientY - g.lastY) / Math.max(e.timeStamp - g.lastT, 1); // px/ms
    const flick = Math.abs(v) > 0.35;
    const next = peek ? !(dy < -60 || (flick && v < 0)) : dy > 60 || (flick && v > 0);
    if (next !== peek) { setPeek(next); hapticsRef.current ??= new WebHaptics(); hapticsRef.current.trigger("nudge"); }
    onSettle?.();
  }, [peek, onSettle]);

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
  const W = w - 4, H = 34, y = 15;
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
          onPointerUp={onGripUp}
          onPointerCancel={() => {
            gripDrag.current = null;
            const el = cardRef.current;
            if (el) { el.style.transform = ""; el.classList.remove("dragging"); }
          }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPeek((p) => !p); onSettle?.(); } }}
        >
          <span className="grip" aria-hidden />
        </div>
        <div className="head">
          <div className="lead">
            <h2>{name}</h2>
            {point.ref && <span className="ref">{point.ref}</span>}
          </div>
          <div className="sub">
            {`${point.lat.toFixed(3)}° ${point.lat >= 0 ? "N" : "S"}, ${Math.abs(point.lon).toFixed(3)}° ${point.lon >= 0 ? "E" : "W"}`}
            {sectored ? " · sectored" : ""}
          </div>
          <div className="notation">{notation(l)}</div>
        </div>
        <div className="strip" ref={stripRef}>
          {(l.unparsed || l.inferred || (l.tagPeriod != null && l.segs.length > 0)) && (
            <div className="verdict">
              {l.unparsed
                ? "unusual signal — shown as a single flash"
                : l.inferred
                  ? `approx — the chart tags don't fully decode${l.tagPeriod != null ? `; the full cycle runs ${l.period}s` : ""}`
                  : `the full cycle repeats every ${l.period}s`}
            </div>
          )}
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
          {vesselNote && <div className="note peekable">{vesselNote}.</div>}
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
                onSaveCard().then(({ ok, url }) => {
                  setCardState(ok ? "done" : "fail");
                  if (ok && url) {
                    setCardPeek(url);
                    setTimeout(() => setCardPeek(null), 5000);
                  }
                  setTimeout(() => setCardState("idle"), 2400);
                });
              }}
            >
              {cardState === "done" ? "card saved" : cardState === "fail" ? "card failed" : cardState === "busy" ? "drawing…" : "record this bearing"}
            </button>
          </div>
        </div>
      </div>
      {sectored && <Rose point={point} bearing={vesselBearing} onSteer={onSteer} />}
      {cardPeek && (
        <div className="cardpeek" role="status">
          <img src={cardPeek} alt="the exported chart card" />
          <span>card downloaded — check your downloads folder</span>
        </div>
      )}
    </div>
  );
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
    <div className="rose">
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
          if (bearing == null) onSteer(angleOf(e));
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || e.pointerId !== d.pid) return;
          onSteer(((angleOf(e) - d.off) % 360 + 360) % 360);
        }}
        onPointerUp={(e) => { if (drag.current?.pid === e.pointerId) drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
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
      <div className="cap">{bearing == null ? "drag to steer" : <><b>{Math.round(bearing)}°</b> true</>}</div>
    </div>
  );
}
