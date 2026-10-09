import { useEffect, useRef, useState } from "react";
import type { StorePoint } from "../lib/data.ts";
import { colorHex, notation } from "../iala.ts";

// The decode card: name, light-list notation, and a live timing strip whose
// playhead sweeps in sync with the light on the chart.
export default function LightCard({
  point,
  vesselNote,
  onClose,
  onShare,
}: {
  point: StorePoint;
  vesselNote: string | null;
  onClose: () => void;
  onShare: () => void;
}) {
  const l = point.light;
  const stripRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // playhead sweeps live
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT(l.period > 0 ? (Date.now() / 1000) % l.period : 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [l]);

  const name = point.name ?? point.ref ?? "unnamed light";
  const sectored = l.sectors.length > 0;
  const tp = l.period > 0 ? t / l.period : 0;
  const W = w - 4, H = 30, y = 14;
  let acc = 0;
  const segs = l.segs.map((s) => {
    const x0 = (acc / l.period) * W;
    acc += s.dur;
    const x1 = (acc / l.period) * W;
    return { x0, x1, s };
  });

  return (
    <div className="card" role="dialog" aria-label={`light ${name}`}>
      <button className="x" onClick={onClose} aria-label="close">✕</button>
      <h2>{name}</h2>
      <div className="sub">
        {[point.ref && `ref ${point.ref}`, `${point.lat.toFixed(3)}° ${point.lat >= 0 ? "N" : "S"}, ${Math.abs(point.lon).toFixed(3)}° ${point.lon >= 0 ? "E" : "W"}`]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div className="notation">{notation(l)}</div>
      <div className="strip" ref={stripRef}>
        <svg viewBox={`0 0 ${w} ${H}`} aria-hidden>
          <line x1={0} x2={W} y1={y} y2={y} stroke="#1e3448" strokeWidth={1} />
          {l.period <= 0 && (
            <line x1={2} x2={W - 2} y1={y} y2={y} stroke={colorHex(l.colors[0] ?? "W")} strokeWidth={6} strokeLinecap="round" className="seg-lit" />
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
                strokeWidth={s.level === 2 ? 10 : 6}
                strokeLinecap="round"
                className="seg-lit"
              />
            ) : null,
          )}
          {l.period > 0 && (
            <>
              <line className="playhead-glow" x1={tp * W} x2={tp * W} y1={4} y2={H - 4} />
              <line className="playhead" x1={tp * W} x2={tp * W} y1={6} y2={H - 6} />
            </>
          )}
          {l.period > 0 && (
            <>
              <text x={0} y={H - 2} fontSize={8} fill="#5b6b7d" fontFamily="IBM Plex Mono, monospace">0s</text>
              <text x={W} y={H - 2} fontSize={8} fill="#5b6b7d" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
                {l.period}s
              </text>
            </>
          )}
        </svg>
      </div>
      <div className="meta">
        {l.rangeNm != null && <span>range <b>{l.rangeNm} nmi</b></span>}
        {l.heightM != null && <span>height <b>{l.heightM} m</b></span>}
        {l.group.length > 1 && <span>group <b>{l.group.join("+")}</b></span>}
        {l.unparsed && <span>unusual signal — shown as a single flash</span>}
        {sectored && <span>sectored — drag the vessel</span>}
      </div>
      {vesselNote && <div className="note">{vesselNote}.</div>}
      {l.segs.some((s) => s.level > 0) && l.segs.every((s) => s.level > 0) && (
        <div className="note">a fixed light — it never blinks, it simply burns.</div>
      )}
      <div className="actions">
        <button className="act" onClick={onShare}>share this light</button>
      </div>
    </div>
  );
}
