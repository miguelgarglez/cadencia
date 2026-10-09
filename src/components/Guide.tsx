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
  clearanceBottom = 0,
  onFlyToTarget,
  onTargetClick,
  onDone,
}: {
  anchor: GuideAnchor | null;
  selected: StorePoint | null;
  vesselActive: boolean;
  crossed: boolean;
  targetName: string | null;
  clearanceBottom?: number;
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

  // advance on the action each step teaches — a selection from step 0 or 1
  // (including the "read the target" CTA) lands on the read/steer step
  useEffect(() => {
    if (step <= 1 && selected) setStep(2);
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
      body: "Every light on this sea is real — each replays its charted rhythm off one shared clock.",
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
    // narrow screens: when the sheet is up, the tip docks just above it —
    // sector bands and the vessel keep the top of the sea. Otherwise it
    // pins under the wordmark.
    if (vw <= 640) {
      if (selected && clearanceBottom > 60) {
        return { left: 12, bottom: clearanceBottom } as const;
      }
      return { left: "50%", top: 60, transform: "translateX(-50%)" } as const;
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
  }, [anchor, selected, clearanceBottom]);

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
          {step === 0 && (
            <button className="goto" onClick={onTargetClick}>
              {targetName ? `read ${targetName}` : "read a light"} →
            </button>
          )}
          {step === 1 && "goto" in tip && tip.goto && anchor?.offscreen ? (
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
