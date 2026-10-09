import { useEffect, useMemo, useState } from "react";
import type { StorePoint } from "../lib/data.ts";

export interface GuideAnchor {
  x: number; // screen px of the thing this step is about (light or vessel)
  y: number;
  offscreen: boolean;
}

// Learn-by-doing first run. Three steps, each waits for the action it teaches.
// The tip anchors beside its target; a magenta ring marks the target light.
export default function Guide({
  anchor,
  selected,
  vesselActive,
  crossed,
  targetName,
  onFlyToTarget,
  onTargetClick,
  onDone,
}: {
  anchor: GuideAnchor | null;
  selected: StorePoint | null;
  vesselActive: boolean;
  crossed: boolean;
  targetName: string | null;
  onFlyToTarget: () => void;
  onTargetClick: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);

  // step 0 hands off only on a deliberate press — a passing scroll shouldn't
  // skip the lesson. A still reader gets a longer fallback timer.
  useEffect(() => {
    if (step !== 0) return;
    const advance = () => setStep(1);
    window.addEventListener("pointerdown", advance);
    const t = setTimeout(advance, 12000);
    return () => {
      window.removeEventListener("pointerdown", advance);
      clearTimeout(t);
    };
  }, [step]);

  // advance on the action each step teaches
  useEffect(() => {
    if (step === 1 && selected) setStep(2);
  }, [step, selected]);

  useEffect(() => {
    if (step !== 2) return;
    if (crossed) {
      const t = setTimeout(onDone, 4200);
      return () => clearTimeout(t);
    }
    if (!vesselActive) {
      // picked a light with no sectors — that's a fine ending too
      const t = setTimeout(onDone, 3800);
      return () => clearTimeout(t);
    }
  }, [step, crossed, vesselActive, onDone]);

  const steps = [
    {
      k: "the field",
      body: "Every point of light on this sea is a real navigational light, replaying its own coded rhythm — the same second you are seeing.",
    },
    {
      k: "read a light",
      body: targetName
        ? `Click a light to decode its signal. The ring marks ${targetName} — it changes color with your bearing.`
        : "Click a light to decode its signal.",
      goto: !selected,
    },
    crossed
      ? {
          k: "crossed",
          body: "The color changed — you sailed across a sector boundary. That is how a light tells a ship it has left the safe water.",
        }
      : vesselActive
        ? {
            k: "steer",
            body: "Drag the vessel — the color changes at each sector arc.",
          }
        : {
            k: "read",
            body: "The strip plays the light's true rhythm in sync with the sea. Click open water to keep exploring.",
          },
  ];
  const tip = steps[Math.min(step, steps.length - 1)]!;

  // anchor placement: beside the target, never under the sheet — on narrow
  // screens the tip stacks above/below instead of covering what it points at
  const pos = useMemo(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sheetTop = vh - (vw <= 640 ? 120 : 260); // keep clear of the sheet zone
    // narrow screens: the tip pins under the wordmark — never over the
    // light→vessel path it describes, never under the sheet
    if (vw <= 640) {
      return { left: "50%", top: 64, transform: "translateX(-50%)" } as const;
    }
    if (!anchor || anchor.offscreen) {
      return { left: "50%", top: Math.min(vh * 0.28, sheetTop - 140), transform: "translateX(-50%)" } as const;
    }
    const W = Math.min(264, vw - 24), Hh = 130;
    if (anchor.x + 34 + W > vw - 12 && anchor.x - W - 34 < 12) {
      const top = anchor.y - Hh - 34 >= 66 ? anchor.y - Hh - 34 : anchor.y + 34;
      const left = Math.min(Math.max(anchor.x - W / 2, 12), vw - W - 12);
      return { left, top: Math.min(top, sheetTop - Hh) } as const;
    }
    let left = anchor.x + 34;
    let top = anchor.y - Hh / 2;
    if (left + W > vw - 12) left = anchor.x - W - 34;
    top = Math.max(70, Math.min(top, sheetTop - Hh));
    return { left, top } as const;
  }, [anchor]);

  return (
    <>
      {anchor && !anchor.offscreen && step === 1 && (
        <button
          className="guide-ring"
          style={{ left: anchor.x, top: anchor.y }}
          onClick={onTargetClick}
          aria-label={targetName ? `select ${targetName}` : "select the marked light"}
        />
      )}
      <div className="guide-tip" style={pos} role="status">
        <span className="k">{tip.k}</span>
        {tip.body}
        <div className="row">
          {"goto" in tip && tip.goto && anchor?.offscreen ? (
            <button className="goto" onClick={onFlyToTarget}>
              bring it into view
            </button>
          ) : null}
          <button className="dismiss" onClick={onDone}>skip the guide</button>
        </div>
      </div>
    </>
  );
}
