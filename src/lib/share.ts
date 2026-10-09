// Canvas share card for a light: notation + coordinates + one frame of its pattern.
import type { StorePoint } from "./data.ts";
import type { Light } from "../iala.ts";
import { colorHex, notation } from "../iala.ts";

// `active` is the sub-light the vessel actually sees — the card records the
// signal from that bearing, not just the primary light. Returns the blob URL
// so the caller can preview the exact card that was exported.
export function shareCard(p: StorePoint, active?: Light | null, bearing?: number | null): Promise<{ ok: boolean; url?: string }> {
  const l = active ?? p.light;
  const W = 1200, H = 630;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;

  c.fillStyle = "#04070c";
  c.fillRect(0, 0, W, H);

  // faint chart grid + graticule ticks
  c.strokeStyle = "rgba(30,52,72,0.4)";
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 75) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 75) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = "rgba(34,64,90,0.9)";
  c.strokeRect(24.5, 24.5, W - 49, H - 49);

  // sector rose at right, if the light wears sectors
  const sectored = l.sectors.length > 0;
  const rcx = W - 240, rcy = 300, rr = 130;
  if (sectored) {
    c.save();
    c.translate(rcx, rcy);
    c.strokeStyle = "rgba(34,64,90,0.9)";
    c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, rr + 18, 0, Math.PI * 2); c.stroke();
    for (let d = 0; d < 360; d += 30) {
      const a = ((d - 90) * Math.PI) / 180;
      const long = d % 90 === 0;
      c.beginPath();
      c.moveTo(Math.cos(a) * (rr + 12), Math.sin(a) * (rr + 12));
      c.lineTo(Math.cos(a) * (rr + (long ? 26 : 18)), Math.sin(a) * (rr + (long ? 26 : 18)));
      c.stroke();
    }
    for (const s of l.sectors) {
      const col = colorHex(l.colors[s.color] ?? l.colors[0] ?? "W");
      const a0 = ((s.start - 90) * Math.PI) / 180;
      const a1 = ((s.end - 90) * Math.PI) / 180;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, rr, a0, a1);
      c.closePath();
      c.fillStyle = col + "14";
      c.fill();
      c.beginPath();
      c.arc(0, 0, rr, a0, a1);
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.stroke();
    }
    // the magenta star real charts print on a light
    c.strokeStyle = "rgba(224,89,138,0.95)";
    c.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r1 = 8, r2 = i % 2 === 0 ? 20 : 13;
      c.beginPath();
      c.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      c.stroke();
    }
    // the observer's bearing: a vessel tick out on the rose rim
    if (bearing != null) {
      const a = ((bearing - 90) * Math.PI) / 180;
      c.beginPath();
      c.moveTo(Math.cos(a) * (rr + 12), Math.sin(a) * (rr + 12));
      c.lineTo(Math.cos(a) * (rr + 34), Math.sin(a) * (rr + 34));
      c.strokeStyle = "rgba(224,89,138,0.95)";
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = "#e0598a";
      c.font = "500 17px 'IBM Plex Mono', monospace";
      c.textAlign = "center";
      c.fillText(`${Math.round(bearing)}°`, Math.cos(a) * (rr + 52), Math.sin(a) * (rr + 52) + 6);
    }
    c.fillStyle = "#fff3cf";
    c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#5b6b7d";
    c.font = "400 16px 'IBM Plex Mono', monospace";
    c.textAlign = "center";
    c.fillText("N", 0, -rr - 34);
    c.restore();
  }

  // the light's flash pattern as a glowing row of pulses
  const cy = 470;
  const stripW = sectored ? W - 620 : W - 280;
  const pattern = l.segs.length ? l.segs : [{ level: 1 as const, dur: 1, color: 0 }];
  const total = pattern.reduce((a, s) => a + s.dur, 0) || 1;
  const pxPerSec = stripW / total;
  let x = 80;
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
  c.strokeStyle = "#1e3448";
  c.beginPath(); c.moveTo(80, cy); c.lineTo(80 + stripW, cy); c.stroke();
  c.fillStyle = "#46586b";
  c.font = "400 15px 'IBM Plex Mono', monospace";
  c.textAlign = "left";
  if (l.period > 0) {
    c.fillText("0s", 80, cy + 26);
    c.textAlign = "right";
    c.fillText(`${l.period}s`, 80 + stripW, cy + 26);
    c.textAlign = "left";
  }

  // wordmark — the chart-room lockup, not the serif
  c.fillStyle = "#fff3cf";
  c.beginPath(); c.arc(66, 106, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#e8ecf2";
  c.font = "500 54px 'Space Grotesk', system-ui, sans-serif";
  c.fillText("cadencia", 90, 124);
  c.font = "400 15px 'IBM Plex Mono', monospace";
  c.fillStyle = "#46586b";
  c.fillText("-.-. .- -.. . -. -.-. .. .-", 92, 152);

  // light name + notation
  const name = p.name ?? p.ref ?? "an unnamed light";
  c.font = "400 56px 'Instrument Serif', Georgia, serif";
  c.fillStyle = "#cfd8e3";
  c.fillText(name.length > 34 ? name.slice(0, 33) + "…" : name, 78, 250);
  c.font = "500 32px 'IBM Plex Mono', monospace";
  c.fillStyle = "#e0598a";
  c.fillText(notation(l), 80, 310);
  c.font = "300 21px 'IBM Plex Mono', monospace";
  c.fillStyle = "#5b6b7d";
  c.fillText(
    `${Math.abs(p.lat).toFixed(3)}° ${p.lat >= 0 ? "N" : "S"}  ·  ${Math.abs(p.lon).toFixed(3)}° ${p.lon >= 0 ? "E" : "W"}` +
    (p.ref ? `   ${p.ref}` : "") +
    (bearing != null ? `   ·   seen from ${Math.round(bearing)}°` : "") +
    (l.inferred ? "   ·   approx" : ""),
    80, 350,
  );

  c.font = "300 20px 'IBM Plex Mono', monospace";
  c.fillStyle = "#2e4a66";
  c.fillText(location.host, 80, H - 52);

  return new Promise((resolve) => {
    cv.toBlob((blob) => {
      if (!blob) { resolve({ ok: false }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cadencia-${(p.name ?? "light").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
      // the preview keeps this URL alive for a few seconds; revoke late
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      resolve({ ok: true, url });
    }, "image/png");
  });
}
