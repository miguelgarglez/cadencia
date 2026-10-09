// The light field: every charted light on Earth as an instanced WebGL quad,
// flashing its real IALA sequence off one shared clock. A MapLibre custom layer.

import type { CustomLayerInterface, Map as MLMap } from "maplibre-gl";
import type { StorePoint } from "./data.ts";
import type { Light } from "../iala.ts";
import { subSolar } from "./geo.ts";

const MAX_SEGMENTS = 1024 * 512; // texture rows capacity (RGBA32F texels)
const TEX_W = 512;
// row 0 of the seq texture is reserved for the selected light's active
// sub-light timeline — real point timelines start at texel TEX_W.
const OVERRIDE_TEXELS = TEX_W;

const COLOR_IDS: Record<string, number> = { W: 0, R: 1, G: 2, Y: 3, Bu: 4, Vi: 5 };

const VS = `#version 300 es
precision highp float;

layout(location=0) in vec2 a_merc;      // 0..1 mercator
layout(location=1) in vec3 a_timing;    // period, seqStart, seqLen
layout(location=2) in float a_meta;     // packed colors + flags
layout(location=3) in float a_idx;      // point index
layout(location=4) in vec2 a_corner;

uniform mat4 u_matrix;
uniform float u_time;
uniform vec2 u_viewport;   // px
uniform float u_px;
uniform float u_zoom;
uniform vec3 u_sun;        // subsolar direction unit vector
uniform float u_selected;  // point index or -1
uniform vec3 u_selColor;   // dim color for a selected light outside its sectors, or vec3(-1)
uniform vec2 u_selSeq;     // selected override: seqLen, period — row 0 of u_seq (0 = off)
uniform vec2 u_selCols;    // selected override palette: packed colors, count
uniform float u_calm;      // reduced motion: ember only, no flashing
uniform highp sampler2D u_seq;

out vec2 v_uv;
out vec3 v_color;
out float v_level;
out float v_kind; // 0 normal, 1 uncharted (static dot)
out float v_damp; // zoom density damping for halos

void main() {
  float meta = a_meta;
  float kind = mod(floor(meta / 16384.0), 4.0);
  int nCols = int(mod(floor(meta / 4096.0), 4.0));
  float colorsPacked = mod(meta, 4096.0);
  v_kind = kind;

  float sel = abs(a_idx - u_selected) < 0.5 ? 1.0 : 0.0;
  float level = 1.0;
  int colIdx = 0;
  if (kind == 1.0) {
    level = 0.35;
  } else if (a_timing.x <= 0.001 && u_selSeq.y <= 0.001) {
    level = 1.0;
  } else {
    float period = a_timing.x;
    float start = a_timing.y;
    float len = a_timing.z;
    bool overridden = sel > 0.5 && u_selSeq.x > 0.5;
    if (overridden) {
      start = 0.0; len = u_selSeq.x; period = u_selSeq.y;
      // the active sub-light carries its own palette
      colorsPacked = u_selCols.x;
      nCols = int(u_selCols.y);
    }
    float t = mod(u_time, period);
    level = 0.0;
    for (float i = 0.0; i < ${TEX_W}.0; i++) {
      if (i >= len) break;
      vec4 seg = texelFetch(u_seq, ivec2(int(mod(start + i, ${TEX_W}.0)), int((start + i) / ${TEX_W}.0)), 0);
      if (t >= seg.x && t < seg.y) {
        level = seg.z;
        colIdx = int(seg.w);
        break;
      }
    }
  }

  int c = int(mod(colorsPacked / pow(8.0, float(colIdx)), 8.0));
  vec3 col = c == 1 ? vec3(1.0,0.36,0.33)
           : c == 2 ? vec3(0.34,0.92,0.56)
           : c == 3 ? vec3(1.0,0.8,0.42)
           : c == 4 ? vec3(0.5,0.62,1.0)
           : c == 5 ? vec3(0.78,0.62,1.0)
           : vec3(1.0,0.93,0.78);

  // outside every sector the light shows nothing — dim to a cold ember.
  // (an overridden timeline keeps its own per-segment colors instead)
  if (sel > 0.5 && u_selColor.x >= 0.0 && u_selSeq.x <= 0.5) col = u_selColor;

  // solar dimming: lights read strongly in darkness, faint in daylight
  float lat = atan(sinh(3.14159265 * (1.0 - 2.0 * a_merc.y)));
  float lon = (a_merc.x * 360.0 - 180.0) * 3.14159265 / 180.0;
  vec3 dir = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  float sunEl = dot(dir, u_sun);
  float night = 1.0 - smoothstep(-0.25, 0.15, sunEl); // 1 at night, 0 in day
  float dayFactor = mix(0.22, 1.0, night);
  if (u_calm > 0.5 && kind == 0.0) level = 0.0; // calm sea: embers only

  v_level = level * dayFactor;
  v_color = col;
  // dense coasts would otherwise merge into white threads — at the wide
  // opening zooms the field must stay additive but restrained; full
  // intensity only arrives once individual lights are separable
  v_damp = smoothstep(3.5, 10.0, u_zoom);

  vec4 clip = u_matrix * vec4(a_merc, 0.0, 1.0);
  float major = mod(floor(meta / 65536.0), 2.0);
  float base = kind == 1.0 ? 2.0 : (2.6 + major * 1.2) * (0.55 + u_zoom * 0.10);
  if (sel > 0.5) base *= 1.6;
  vec2 px = a_corner * base * u_px;
  clip.xy += px / u_viewport * 2.0 * clip.w;
  gl_Position = clip;
  v_uv = a_corner;
}
`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec3 v_color;
in float v_level;
in float v_kind;
in float v_damp;
out vec4 outColor;
void main() {
  float r = length(v_uv);
  if (r > 1.0) discard;
  float core = pow(max(0.0, 1.0 - r), 4.0) * 1.15;
  float halo = pow(max(0.0, 1.0 - r), 1.6) * 0.38 * mix(0.25, 1.0, v_damp);
  float a = (core + halo) * v_level * mix(0.62, 1.0, v_damp);
  if (v_kind == 1.0) a = pow(max(0.0, 1.0 - r), 2.0) * 0.30;
  else a = max(a, pow(max(0.0, 1.0 - r), 3.0) * 0.075); // charted symbol ember
  outColor = vec4(v_color * a, a);
}
`;

export class LightField implements CustomLayerInterface {
  id = "light-field";
  type = "custom" as const;
  renderingMode = "2d" as const;

  private gl: WebGL2RenderingContext | null = null;
  private map: MLMap | null = null;
  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private seqTex: WebGLTexture | null = null;
  private seqData = new Float32Array(MAX_SEGMENTS * 4);
  private instCount = 0;
  private store: { points: Map<string, StorePoint>; onChange: (() => void) | null };
  private dirty = true;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private pointIndex = new Map<string, number>();
  private selectedIdx = -1;
  private selColor: [number, number, number] = [-1, -1, -1];
  private selSeqLen = 0;
  private selSeqPeriod = 0;
  private selCols: [number, number] = [0, 0]; // packed palette, count
  private activeLight: Light | null = null;
  private calm = false;
  private startWall = Date.now() / 1000;
  private startPerf = performance.now() / 1000;
  private canvas: HTMLCanvasElement | null = null;

  constructor(store: { points: Map<string, StorePoint>; onChange: (() => void) | null }) {
    this.store = store;
    this.store.onChange = () => this.scheduleRebuild();
  }

  onAdd(map: MLMap, glArg: WebGL2RenderingContext | WebGLRenderingContext) {
    const gl = glArg as WebGL2RenderingContext;
    this.map = map;
    this.gl = gl;
    const canvas = map.getCanvas();
    this.canvas = canvas;
    canvas.addEventListener("webglcontextlost", this.onCtxLost);
    canvas.addEventListener("webglcontextrestored", this.onCtxRestored);
    this.initGL(gl);
  }

  // preventDefault is required for the contextrestored event to fire at all
  private onCtxLost = (e: Event) => e.preventDefault();

  private onCtxRestored = () => {
    // the old GPU objects died with the context — drop the handles and rebuild
    this.prog = null;
    this.vao = null;
    this.seqTex = null;
    this.instBufs = [];
    if (this.gl) this.initGL(this.gl);
    this.map?.triggerRepaint();
  };

  private initGL(gl: WebGL2RenderingContext) {
    const vs = this.shader(gl.VERTEX_SHADER, VS);
    const fs = this.shader(gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs!);
    gl.attachShader(prog, fs!);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("light-field link:", gl.getProgramInfoLog(prog));
      return;
    }
    this.prog = prog;
    for (const name of ["u_matrix", "u_time", "u_viewport", "u_px", "u_zoom", "u_sun", "u_selected", "u_selColor", "u_selSeq", "u_selCols", "u_calm", "u_seq"])
      this.u[name] = gl.getUniformLocation(prog, name);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    // quad corners
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);
    // instanced buffers are (re)created in rebuild()
    this.seqTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.seqTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX_W, MAX_SEGMENTS / TEX_W, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindVertexArray(null);
    this.rebuild();
    if (this.activeLight) this.uploadActive(this.activeLight);
  }

  private shader(type: number, src: string) {
    const gl = this.gl!;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader:", gl.getShaderInfoLog(s));
    return s;
  }

  private scheduleRebuild() {
    if (this.rebuildTimer) return;
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuild();
      this.map?.triggerRepaint();
    }, 120);
  }

  private instBufs: WebGLBuffer[] = [];

  rebuild() {
    const gl = this.gl;
    if (!gl || !this.vao) return;
    const pts = [...this.store.points.values()];
    const n = pts.length;
    const merc = new Float32Array(n * 2);
    const timing = new Float32Array(n * 3);
    const meta = new Float32Array(n);
    const idx = new Float32Array(n);
    this.pointIndex.clear();
    let segCursor = OVERRIDE_TEXELS;
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      this.pointIndex.set(p.id, i);
      merc[i * 2] = p.mx; merc[i * 2 + 1] = p.my;
      idx[i] = i;
      if (p.uncharted) {
        timing[i * 3] = 0; timing[i * 3 + 1] = 0; timing[i * 3 + 2] = 0;
        meta[i] = 16384; // kind=1
        continue;
      }
      const l = p.light;
      const cols = l.colors.length ? l.colors : ["W"];
      let packedCols = 0;
      for (let c = 0; c < Math.min(4, cols.length); c++) packedCols |= COLOR_IDS[cols[c]!]! << (3 * c);
      packedCols |= Math.min(4, cols.length) << 12;
      const flags = (p.major ? 1 : 0) * 65536;
      meta[i] = packedCols | flags;

      if (l.unparsed && !l.segs.length) {
        timing[i * 3] = 0; timing[i * 3 + 1] = 0; timing[i * 3 + 2] = 0;
        continue;
      }
      const seqStart = segCursor;
      let cum = 0;
      for (const s of l.segs) {
        if (segCursor >= MAX_SEGMENTS) break;
        const j = segCursor * 4;
        this.seqData[j] = cum;
        cum += s.dur;
        this.seqData[j + 1] = cum;
        this.seqData[j + 2] = s.level === 2 ? 1.4 : s.level;
        this.seqData[j + 3] = Math.min(3, s.color);
        segCursor++;
      }
      timing[i * 3] = l.period;
      timing[i * 3 + 1] = seqStart;
      timing[i * 3 + 2] = Math.min(l.segs.length, TEX_W);
    }
    this.instCount = n;

    gl.bindVertexArray(this.vao);
    for (const b of this.instBufs) gl.deleteBuffer(b);
    this.instBufs = [];
    const mk = (data: Float32Array, loc: number, size: number) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
      this.instBufs.push(b);
    };
    mk(merc, 0, 2);
    mk(timing, 1, 3);
    mk(meta, 2, 1);
    mk(idx, 3, 1);
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, this.seqTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, Math.ceil(segCursor / TEX_W), gl.RGBA, gl.FLOAT, this.seqData.subarray(0, Math.ceil(segCursor / TEX_W) * TEX_W * 4));
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.dirty = false;
  }

  // Switch the selected point's rendered rhythm to the sub-light the vessel
  // actually sees from its bearing (or null → back to the primary light).
  setActiveLight(l: Light | null) {
    this.activeLight = l;
    if (l) this.uploadActive(l);
    else { this.selSeqLen = 0; this.selSeqPeriod = 0; }
    this.map?.triggerRepaint();
  }

  private uploadActive(l: Light) {
    const gl = this.gl;
    if (!gl || !this.seqTex) return;
    let cum = 0;
    const n = Math.min(l.segs.length, OVERRIDE_TEXELS);
    for (let i = 0; i < n; i++) {
      const s = l.segs[i]!;
      const j = i * 4;
      this.seqData[j] = cum;
      cum += s.dur;
      this.seqData[j + 1] = cum;
      this.seqData[j + 2] = s.level === 2 ? 1.4 : s.level;
      this.seqData[j + 3] = Math.min(3, s.color);
    }
    this.selSeqLen = n;
    this.selSeqPeriod = l.period;
    const cols = l.colors.length ? l.colors : ["W" as const];
    let packed = 0;
    for (let c = 0; c < Math.min(4, cols.length); c++) packed |= COLOR_IDS[cols[c]!]! << (3 * c);
    this.selCols = [packed, Math.min(4, cols.length)];
    gl.bindTexture(gl.TEXTURE_2D, this.seqTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, 1, gl.RGBA, gl.FLOAT, this.seqData.subarray(0, TEX_W * 4));
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  setSelected(id: string | null) {
    this.selectedIdx = id != null ? (this.pointIndex.get(id) ?? -1) : -1;
    this.map?.triggerRepaint();
  }

  setSelectedColor(rgb: [number, number, number] | null) {
    this.selColor = rgb ?? [-1, -1, -1];
    this.map?.triggerRepaint();
  }

  setCalm(on: boolean) {
    this.calm = on;
    this.map?.triggerRepaint();
  }

  prerender() {}
  onRemove() {
    if (this.rebuildTimer) { clearTimeout(this.rebuildTimer); this.rebuildTimer = null; }
    this.store.onChange = null;
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onCtxLost);
      this.canvas.removeEventListener("webglcontextrestored", this.onCtxRestored);
      this.canvas = null;
    }
    const gl = this.gl;
    if (gl) {
      for (const b of this.instBufs) gl.deleteBuffer(b);
      this.instBufs = [];
      if (this.seqTex) gl.deleteTexture(this.seqTex);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.prog) gl.deleteProgram(this.prog);
    }
    this.instCount = 0;
    this.gl = null;
    this.map = null;
  }

  render(_gl: WebGL2RenderingContext | WebGLRenderingContext, arg: unknown) {
    const gl = this.gl;
    const map = this.map;
    if (!gl || !map || !this.prog || !this.vao || !this.instCount) return;
    if (this.dirty) this.rebuild();

    const a = arg as Record<string, unknown>;
    const matrix = (a.defaultProjectionData as { mainMatrix?: Float32Array } | undefined)?.mainMatrix
      ?? (a.matrix as Float32Array | undefined)
      ?? (Array.isArray(arg) || arg instanceof Float32Array || arg instanceof Float64Array ? (arg as Float32Array) : null);
    if (!matrix) return;

    const canvas = map.getCanvas();
    const w = canvas.width, h = canvas.height;

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.uniformMatrix4fv(this.u.u_matrix!, false, matrix as Float32Array);
    // wall-clock sync: all viewers see the same sea
    const now = this.startWall + (performance.now() / 1000 - this.startPerf);
    // float32 dies at wall-clock magnitude (1.7e9) — use time-of-day so mod() stays precise.
    // phase is still identical for every viewer (same UTC second-of-day).
    gl.uniform1f(this.u.u_time!, now % 86400);
    gl.uniform2f(this.u.u_viewport!, w, h);
    gl.uniform1f(this.u.u_px!, map.getPixelRatio());
    gl.uniform1f(this.u.u_zoom!, map.getZoom());
    const sub = subSolar();
    const latR = (sub.lat * Math.PI) / 180, lonR = (sub.lon * Math.PI) / 180;
    gl.uniform3f(this.u.u_sun!, Math.cos(latR) * Math.cos(lonR), Math.cos(latR) * Math.sin(lonR), Math.sin(latR));
    gl.uniform1f(this.u.u_selected!, this.selectedIdx);
    gl.uniform3fv(this.u.u_selColor!, this.selColor);
    gl.uniform2f(this.u.u_selSeq!, this.selSeqLen, this.selSeqPeriod);
    gl.uniform2f(this.u.u_selCols!, this.selCols[0], this.selCols[1]);
    gl.uniform1f(this.u.u_calm!, this.calm ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.seqTex);
    gl.uniform1i(this.u.u_seq!, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // FS outputs premultiplied col*a — pure additive
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instCount);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }
}
