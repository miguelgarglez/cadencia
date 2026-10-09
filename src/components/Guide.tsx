import { useEffect, useState } from "react";
import type { StorePoint } from "../lib/data.ts";

// Learn-by-doing first run: three short steps on the real UI.
export default function Guide({ selected, onDone }: { selected: StorePoint | null; onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(() => setStep(1), 4200);
      return () => clearTimeout(t);
    }
  }, [step]);

  useEffect(() => {
    if (step === 1 && selected) setStep(2);
    else if (step === 2 && selected && !selected.lights.some((l) => l.sectors.length)) {
      const t = setTimeout(onDone, 2600);
      return () => clearTimeout(t);
    }
  }, [step, selected, onDone]);

  const tips = [
    {
      k: "01 · LISTEN",
      body: "Every point of light is a real signal, keeping its own time right now — flashes, eclipses, even Morse code.",
      style: { left: "50%", top: "34%", transform: "translateX(-50%)" } as const,
    },
    {
      k: "02 · READ",
      body: "Click any light to decode its signal.",
      style: { left: "50%", bottom: "30%", transform: "translateX(-50%)" } as const,
    },
    {
      k: "03 · STEER",
      body: "Some lights show a different color to every bearing. If a vessel appears, drag it around the light.",
      style: { left: "50%", bottom: "34%", transform: "translateX(-50%)" } as const,
    },
  ];

  const tip = tips[step];
  if (!tip) return null;
  return (
    <div className="guide-tip" style={tip.style} role="status">
      <span className="k">{tip.k}</span>
      {tip.body}
      <button className="dismiss" onClick={onDone}>skip the guide</button>
    </div>
  );
}
