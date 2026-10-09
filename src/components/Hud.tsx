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
  const [prefsOpen, setPrefsOpen] = useState(false);
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

  // the signals popover closes on outside press; Escape consumes the topmost
  // layer only (stopPropagation keeps it from also deselecting a light)
  useEffect(() => {
    if (!prefsOpen) return;
    const pop = document.querySelector(".prefs-pop");
    pop?.querySelector<HTMLElement>("button")?.focus();
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".prefs-wrap")) setPrefsOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setPrefsOpen(false); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(pop?.querySelectorAll<HTMLElement>("button") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
        next?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [prefsOpen]);

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
        <span className="prefs-wrap">
          <button
            className={`cell ${sound || haptics ? "on" : ""}`}
            onClick={() => setPrefsOpen((v) => !v)}
            aria-expanded={prefsOpen}
            aria-haspopup="menu"
            title="sound and haptic signals"
          >
            signals
          </button>
          {prefsOpen && (
            <span className="prefs-pop" role="menu" aria-label="signals">
              <button role="menuitemcheckbox" aria-checked={sound} onClick={onSound}>
                <i className={`sw ${sound ? "on" : ""}`} aria-hidden />
                sound <b>{sound ? "on" : "off"}</b>
              </button>
              <button role="menuitemcheckbox" aria-checked={haptics} onClick={onHaptics}>
                <i className={`sw ${haptics ? "on" : ""}`} aria-hidden />
                haptics <b>{haptics ? "on" : "off"}</b>
              </button>
            </span>
          )}
        </span>
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
