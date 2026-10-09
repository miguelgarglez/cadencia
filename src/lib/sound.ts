// Web Audio: a dark sea bed + a synthesized cadence pulse per light. Muted by default.

let ctx: AudioContext | null = null;
let seaGain: GainNode | null = null;
let enabled = false;

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    // sea bed: looping filtered noise, very low
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 320; lp.Q.value = 0.4;
    const swell = ctx.createBiquadFilter();
    swell.type = "bandpass"; swell.frequency.value = 90; swell.Q.value = 2;
    seaGain = ctx.createGain();
    seaGain.gain.value = 0;
    src.connect(lp).connect(seaGain);
    src.connect(swell).connect(seaGain);
    seaGain.connect(ctx.destination);
    // slow swell LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(seaGain.gain);
    lfo.start();
    src.start();
  }
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  const c = ensure();
  seaGain?.gain.setTargetAtTime(on ? 0.05 : 0, c.currentTime, 0.6);
  // suspend the whole graph when off — the swell LFO and any in-flight pulses
  // must not leak sound behind the mute switch
  if (on) void c.resume();
  else setTimeout(() => { if (!enabled) void c.suspend(); }, 700);
}

export function isSoundOn() {
  return enabled;
}

// a soft foghorn-ish pulse: two detuned low sines + noise breath
export function pulse(colorIdx = 0, dur = 0.5) {
  if (!enabled || !ctx) return;
  const c = ctx;
  const t0 = c.currentTime;
  const base = colorIdx === 1 ? 72 : colorIdx === 2 ? 66 : 60; // red higher, green mid, white deep
  for (const det of [0, 0.7]) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = base + det;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + Math.min(0.08, dur * 0.3));
    g.gain.setTargetAtTime(0, t0 + Math.min(0.09, dur * 0.35), dur * 0.35);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 1.2);
  }
}

// soft tick for counters/UI
export function tick() {
  if (!enabled || !ctx) return;
  const c = ctx, t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.value = 620;
  const g = c.createGain();
  g.gain.setValueAtTime(0.02, t0);
  g.gain.setTargetAtTime(0, t0 + 0.02, 0.05);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + 0.2);
}
