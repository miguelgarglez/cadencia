import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";

// "cadencia" in morse, as printed under the wordmark — decorative, always dim
const CADENCIA_MORSE = "-.-. .- -.. . -. -.-. .. .-";

export default function Hud({
  inView,
  total,
  sound,
  haptics,
  onSound,
  onHaptics,
  onAbout,
  onGuide,
  onLight,
}: {
  inView: number;
  total: number;
  sound: boolean;
  haptics: boolean;
  onSound: () => void;
  onHaptics: () => void;
  onAbout: () => void;
  onGuide: () => void;
  onLight: () => void;
}) {
  const [utc, setUtc] = useState("");
  useEffect(() => {
    const f = () => {
      const d = new Date();
      setUtc(
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")} utc`,
      );
    };
    f();
    const t = setInterval(f, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="brand">
        <span className="pip" aria-hidden />
        <h1>cadencia</h1>
        <span className="morse" aria-hidden>{CADENCIA_MORSE}</span>
        <span className="tag">real navigational lights, replaying their charted rhythms</span>
      </div>
      <div className="dock">
        <span className="cell">
          <span className="live-dot" aria-hidden />
          <span className="num"><NumberFlow value={inView} format={{ useGrouping: true }} /></span>
          <span>in view</span>
        </span>
        <span className="cell utc">
          {total > 0 && (
            <>
              <span className="num"><NumberFlow value={total} format={{ useGrouping: true }} /></span>
              <span>charted</span>
            </>
          )}
        </span>
        <span className="sp" />
        <span className="cell utc" aria-hidden>{utc}</span>
        <button
          className={`cell ${haptics ? "on" : ""}`}
          onClick={onHaptics}
          aria-pressed={haptics}
          title="haptic feedback on sector crossings"
        >
          haptics
        </button>
        <button
          className={`cell ${sound ? "on" : ""}`}
          onClick={onSound}
          aria-pressed={sound}
          title={sound ? "mute the sea" : "hear the sea"}
        >
          <span className="dot" aria-hidden />
          sound
        </button>
        <button
          className="cell"
          data-act="light"
          onClick={onLight}
          title="select the nearest light (press L to cycle)"
        >
          a light
        </button>
        <button className="cell" onClick={onGuide} title="replay the first-run guide">guide</button>
        <button className="cell" onClick={onAbout} title="about this chart">about</button>
      </div>
    </>
  );
}
