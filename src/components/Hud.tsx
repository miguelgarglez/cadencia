import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";

export default function Hud({
  inView,
  total,
  sound,
  onSound,
  onAbout,
  onGuide,
}: {
  inView: number;
  total: number;
  sound: boolean;
  onSound: () => void;
  onAbout: () => void;
  onGuide: () => void;
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
    <div className="hud">
      <div className="brand">
        <h1>cadencia</h1>
        <span className="tag">EVERY LIGHT, KEEPING TIME</span>
      </div>
      <div className="tools">
        <button className={`tool ${sound ? "on" : ""}`} onClick={onSound} aria-label={sound ? "mute" : "unmute"} aria-pressed={sound} title={sound ? "mute" : "unmute"}>
          {sound ? "◉" : "◌"}
        </button>
        <button className="tool" onClick={onGuide} aria-label="replay the guide" title="replay the guide">?</button>
        <button className="tool" onClick={onAbout} aria-label="about" title="about">i</button>
      </div>
      <div className="corner bl">
        <span className="num"><NumberFlow value={inView} format={{ useGrouping: true }} /></span>
        <span>lights in view</span>
      </div>
      <div className="corner br">
        {total > 0 && (
          <>
            <span className="num"><NumberFlow value={total} format={{ useGrouping: true }} /></span>
            <span> charted · {utc}</span>
          </>
        )}
      </div>
    </div>
  );
}
