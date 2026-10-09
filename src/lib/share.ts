// Canvas share card for a light: notation + coordinates + one frame of its pattern.
import type { StorePoint } from "./data.ts";
import { colorHex, notation } from "../iala.ts";

export function shareCard(p: StorePoint) {
  const l = p.light;
  const W = 1200, H = 630;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;

  c.fillStyle = "#04070c";
  c.fillRect(0, 0, W, H);

  // faint chart grid
  c.strokeStyle = "rgba(30,52,72,0.5)";
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 75) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 75) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

  // the light's flash pattern as a glowing row of pulses
  const cy = 380;
  const pattern = l.segs;
  const total = pattern.reduce((a, s) => a + s.dur, 0);
  const pxPerSec = (W - 280) / total;
  let x = 140;
  for (const s of pattern) {
    const w = Math.max(s.dur * pxPerSec, 4);
    if (s.level > 0) {
      const col = colorHex(l.colors[s.color] ?? "W");
      const g = c.createRadialGradient(x + w / 2, cy, 0, x + w / 2, cy, w * 0.7 + 26);
      g.addColorStop(0, col);
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x + w / 2, cy, w * 0.7 + 26, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.arc(x + w / 2, cy, 6, 0, Math.PI * 2);
      c.fill();
    }
    x += w;
  }
  // baseline
  c.strokeStyle = "#1e3448";
  c.beginPath(); c.moveTo(140, cy); c.lineTo(W - 140, cy); c.stroke();
  c.fillStyle = "#fff3cf";

  // wordmark
  c.fillStyle = "#e8ecf2";
  c.font = "italic 84px 'Instrument Serif', Georgia, serif";
  c.fillText("cadencia", 80, 140);

  // light name + notation
  const name = p.name ?? p.ref ?? "an unnamed light";
  c.font = "italic 44px 'Instrument Serif', Georgia, serif";
  c.fillStyle = "#cfd8e3";
  c.fillText(name, 80, 240);
  c.font = "500 30px 'IBM Plex Mono', monospace";
  c.fillStyle = "#e0598a";
  c.fillText(notation(l), 80, 300);
  c.font = "300 22px 'IBM Plex Mono', monospace";
  c.fillStyle = "#5b6b7d";
  c.fillText(`${Math.abs(p.lat).toFixed(3)}° ${p.lat >= 0 ? "N" : "S"}  ·  ${Math.abs(p.lon).toFixed(3)}° ${p.lon >= 0 ? "E" : "W"}`, 80, 345);

  c.font = "300 22px 'IBM Plex Mono', monospace";
  c.fillStyle = "#2e4a66";
  c.fillText("cadencia.vercel.app", 80, H - 60);

  cv.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cadencia-${(p.name ?? "light").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}
