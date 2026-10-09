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
}: {
  point: StorePoint;
  vesselNote: string | null;
  vesselBearing: number | null;
  activeLight: Light;
  leaving: boolean;
  onSteer: (bearingDeg: number) => void;
  onClose: () => void;
  onCopyLink: () => Promise<boolean>;
  onSaveCard: () => Promise<boolean>;
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

  const flash = (set: typeof setLinkState) => (ok: Promise<boolean>) => {
    set("busy");
    ok.then((good) => {
      set(good ? "done" : "fail");
      setTimeout(() => set("idle"), 2400);
    });
  };

  const name = point.name ?? point.ref ?? "unnamed light";
  const sectored = point.lights.some((x) => x.sectors.length > 0);
  const sectorMatch = l !== point.light;
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
        <button
          className="grip"
          aria-label={peek ? "expand the light list entry" : "collapse it"}
          onClick={() => setPeek((p) => !p)}
        />
        <div className="lead">
          <h2>{name}</h2>
          {point.ref && <span className="ref">{point.ref}</span>}
        </div>
        <div className="sub">
          {`${point.lat.toFixed(3)}° ${point.lat >= 0 ? "N" : "S"}, ${Math.abs(point.lon).toFixed(3)}° ${point.lon >= 0 ? "E" : "W"}`}
          {sectored ? " · sectored" : ""}
        </div>
        <div className="from-bearing" aria-live="polite">
          {sectorMatch && vesselBearing != null ? (
            <>from your bearing <b>{Math.round(vesselBearing)}°</b> this light reads</>
          ) : null}
        </div>
        <div className="notation">{notation(l)}</div>
        <div className="strip peekable" ref={stripRef}>
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
                <text x={0} y={H - 2} fontSize={8.5} fill="#7f90a2" fontFamily="IBM Plex Mono, monospace">0s</text>
                <text x={W} y={H - 2} fontSize={8.5} fill="#7f90a2" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
                  {l.period}s
                </text>
              </>
            )}
          </svg>
        </div>
        <div className="meta peekable">
          {l.rangeNm != null && <span>range <b>{l.rangeNm} nmi</b></span>}
          {l.heightM != null && <span>height <b>{l.heightM} m</b></span>}
          {l.group.length > 1 && <span>group <b>{l.group.join("+")}</b></span>}
          {l.unparsed && <span>unusual signal — shown as a single flash</span>}
          {l.tagPeriod != null && <span>alternates over <b>{l.period}s</b></span>}
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
            onClick={() => flash(setCardState)(onSaveCard())}
          >
            {cardState === "done" ? "card saved" : cardState === "fail" ? "card failed" : cardState === "busy" ? "drawing…" : "save card"}
          </button>
        </div>
      </div>
      {sectored && <Rose point={point} bearing={vesselBearing} onSteer={onSteer} peek={peek} />}
    </div>
  );
}

// The bearing rose: sector arcs at their true bearings, a needle for the
// vessel. Dragging the rose steers the vessel around the light.
function Rose({
  point,
  bearing,
  onSteer,
  peek,
}: {
  point: StorePoint;
  bearing: number | null;
  onSteer: (deg: number) => void;
  peek: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const R = 38, C = 50;

  const steerFromEvent = useCallback((e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    onSteer(deg);
  }, [onSteer]);

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
    <div className={`rose${peek ? " peekable" : ""}`}>
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
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); steerFromEvent(e); }}
        onPointerMove={(e) => { if (e.buttons & 1) steerFromEvent(e); }}
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
        <text x={C} y={C - R - 10} fontSize={8} fill="#7f90a2" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">N</text>
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
      <div className="cap">{bearing == null ? "bearing" : <><b>{Math.round(bearing)}°</b> true</>}</div>
    </div>
  );
}
