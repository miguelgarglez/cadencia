// IALA light-signature parser — the heart of cadencia.
// Turns OSM seamark tags into a normalized flash timeline. When an explicit
// `sequence` tag exists it wins; otherwise we synthesize from character+group+period.

export type FlashColor = "W" | "R" | "G" | "Y" | "Bu" | "Vi";

// level: 0 eclipse, 1 lit, 2 bright (fixed-and-flashing emphasis)
export interface Seg {
  level: 0 | 1 | 2;
  dur: number;
  color: number; // index into colors[]
}

export interface Light {
  char: string; // raw character tag, verbatim
  group: number[]; // [3] or [2,1]
  period: number; // seconds
  segs: Seg[]; // one full period, sums to `period`
  colors: FlashColor[];
  sectors: { start: number; end: number; color: number }[]; // degrees true
  rangeNm?: number;
  heightM?: number;
  unparsed?: boolean; // fell back to a single flash
}

export interface LightPoint {
  id: string; // "n123" | "w456"
  lat: number;
  lon: number;
  lights: Light[]; // one tower may carry several (sectors/elevations)
  name?: string;
  ref?: string; // Admiralty/NGA ref, e.g. "D 1692"
  major: boolean; // light_major/light_vessel vs light_minor etc.
  wikidata?: string;
  uncharted?: boolean; // lighthouse tower with no characteristic tag
}

const COLOR_MAP: Record<string, FlashColor> = {
  white: "W",
  red: "R",
  green: "G",
  yellow: "Y",
  amber: "Y",
  orange: "Y",
  blue: "Bu",
  violet: "Vi",
  purple: "Vi",
};

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------- explicit sequence: "0.3+(5.7),0.3+(2.7)" means 0.3 lit, 5.7 eclipse
function parseSequence(seq: string, period: number): Seg[] | null {
  const parts = seq.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const segs: Seg[] = [];
  for (const part of parts) {
    const m = part.match(/^(\d+(?:\.\d+)?)\s*\+\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?$/) ?? part.match(/^(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lit = parseFloat(m[1]!);
    const dark = m[2] != null && m.length > 2 ? parseFloat(m[2]) : null;
    segs.push({ level: 1, dur: lit, color: 0 });
    if (dark != null && dark > 0) segs.push({ level: 0, dur: dark, color: 0 });
  }
  if (!segs.length) return null;
  const total = segs.reduce((a, s) => a + s.dur, 0);
  if (period > 0 && Math.abs(total - period) > 0.01) {
    const k = period / total;
    for (const s of segs) s.dur *= k;
  }
  return segs;
}

function flashes(group: number[], period: number, flashDur: number, withinGap: number): Seg[] {
  const segs: Seg[] = [];
  let used = 0;
  const betweenGap = Math.max(withinGap * 2, 1.2);
  group.forEach((n, gi) => {
    for (let i = 0; i < n; i++) {
      segs.push({ level: 1, dur: flashDur, color: 0 });
      used += flashDur;
      const last = gi === group.length - 1 && i === n - 1;
      if (!last) {
        const g = i < n - 1 ? withinGap : betweenGap;
        segs.push({ level: 0, dur: g, color: 0 });
        used += g;
      }
    }
  });
  const rest = period - used;
  if (rest > 0) segs.push({ level: 0, dur: rest, color: 0 });
  else if (rest < 0) for (const s of segs) s.dur *= period / used;
  return segs;
}

function occulting(group: number[], period: number): Seg[] {
  // occulting = lit more than dark: brief eclipses, then lit for the remainder
  const segs: Seg[] = [];
  const eclipse = clamp(period * 0.08, 0.4, 1.5);
  const litGap = clamp(period * 0.12, 0.8, 3);
  segs.push({ level: 1, dur: litGap * 2, color: 0 });
  let used = litGap * 2;
  for (const n of group)
    for (let i = 0; i < n; i++) {
      segs.push({ level: 0, dur: eclipse, color: 0 });
      segs.push({ level: 1, dur: litGap, color: 0 });
      used += eclipse + litGap;
    }
  const rest = period - used;
  if (rest > 0) segs.push({ level: 1, dur: rest, color: 0 });
  else if (rest < 0) for (const s of segs) s.dur *= period / used;
  return segs;
}

function quick(group: number[], period: number, rate: number, interrupted: boolean): Seg[] {
  const segs: Seg[] = [];
  const on = rate / 2, off = rate / 2;
  const total = group.length ? group.reduce((a, b) => a + b, 0) : Math.floor(period / rate);
  let used = 0;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      if (used + on + off > period) return;
      segs.push({ level: 1, dur: on, color: 0 });
      segs.push({ level: 0, dur: off, color: 0 });
      used += on + off;
    }
  };
  if (group.length) {
    group.forEach((n, gi) => {
      run(n);
      if (gi < group.length - 1 || interrupted || used < period) {
        const g = gi === group.length - 1 ? period - used : Math.max(rate * 2, 1);
        if (g > 0) { segs.push({ level: 0, dur: g, color: 0 }); used += g; }
      }
    });
  } else {
    run(Math.floor(total));
    if (interrupted && used < period) { segs.push({ level: 0, dur: period - used, color: 0 }); }
  }
  const sum = segs.reduce((a, s) => a + s.dur, 0);
  if (Math.abs(sum - period) > 0.01) for (const s of segs) s.dur *= period / sum;
  return segs;
}

function morse(letters: string, period: number): Seg[] {
  const code = letters.toUpperCase().split("").map((c) => MORSE[c] ?? "").filter(Boolean).join(" ");
  if (!code) return [];
  let units = 0;
  for (const ch of code) units += ch === "." ? 2 : ch === "-" ? 4 : 3;
  const u = period / (units + 4); // trailing eclipse of ~4 units
  const segs: Seg[] = [];
  for (const ch of code) {
    if (ch === ".") { segs.push({ level: 1, dur: u, color: 0 }); }
    else if (ch === "-") { segs.push({ level: 1, dur: 3 * u, color: 0 }); }
    else { segs.push({ level: 0, dur: 3 * u, color: 0 }); continue; }
    segs.push({ level: 0, dur: u, color: 0 });
  }
  const used = segs.reduce((a, s) => a + s.dur, 0);
  if (period - used > 0) segs.push({ level: 0, dur: period - used, color: 0 });
  return segs;
}

// character string -> canonical parts
interface CharParts { base: string; group: number[]; colors: FlashColor[]; moLetters: string; composite?: string }

export function parseCharacter(raw: string): CharParts | null {
  let s = raw.trim().replace(/[\s.]+$/, "").replace(/[–—]/g, "-");
  if (!s) return null;
  // strip embedded period like ".15s" or "15s" at end
  s = s.replace(/\.?\d+(?:\.\d+)?\s*s\.?$/i, "");
  const mo = s.match(/Mo\s*\(([A-Za-z.()\s]+)\)/i) ?? s.match(/Mo\s*\.?\s*\(?([A-Za-z]+)\)?/i);
  const grp = s.match(/\(([\d+\s,]+)\)/);
  // color zone = the character string minus keywords, groups, morse letters
  let zone = s.replace(/Mo\s*\([^)]*\)/i, "");
  zone = zone.replace(/\([^)]*\)/g, "");
  zone = zone.replace(/FFl|LFl|Fl|Oc|Iso|IUQ|IVQ|IQ|UQ|VQ|Q|Al|F\b/gi, "");
  zone = zone.replace(/[^A-Za-z]/g, "");
  const colors: FlashColor[] = [];
  for (let i = 0; i < zone.length; i++) {
    const two = zone.slice(i, i + 2);
    if (two === "Bu") { colors.push("Bu"); i++; continue; }
    if (two === "Vi") { colors.push("Vi"); i++; continue; }
    const ch = zone[i]!;
    if ("WRGY".includes(ch)) colors.push(ch as FlashColor);
  }
  let base = "";
  if (/^FFl/i.test(s)) base = "FFl";
  else if (/^LFl/i.test(s)) base = "LFl";
  else if (/^Fl/i.test(s)) base = "Fl";
  else if (/^Oc/i.test(s)) base = "Oc";
  else if (/^Iso/i.test(s)) base = "Iso";
  else if (/^IUQ/i.test(s)) base = "IUQ";
  else if (/^IVQ/i.test(s)) base = "IVQ";
  else if (/^IQ/i.test(s)) base = "IQ";
  else if (/^UQ/i.test(s)) base = "UQ";
  else if (/^VQ/i.test(s)) base = "VQ";
  else if (/^Q/i.test(s)) base = "Q";
  else if (/^Mo/i.test(s)) base = "Mo";
  else if (/^F[\s.]/i.test(s) || /^F$/.test(s)) base = "F";
  else if (/^Al/i.test(s)) base = "Al";
  else return null;
  // composite forms like "Q(6)+LFl" — capture the secondary
  const comp = s.match(/\+\s*(L?Fl|Mo)/i);
  return {
    base: s.startsWith("Al") && base === "Al" ? "Al" : base,
    group: grp ? grp[1]!.split(/[+,\s]+/).filter(Boolean).map(Number) : (mo ? [] : []),
    colors,
    moLetters: mo ? mo[1]!.replace(/[^A-Za-z]/g, "") : "",
    composite: comp?.[1],
  };
}

export function synthesize(parts: CharParts, period: number): Seg[] {
  const P = period > 0 ? period : 6;
  switch (parts.base) {
    case "F":
      return [{ level: 1, dur: P, color: 0 }];
    case "Iso":
      return [
        { level: 1, dur: P / 2, color: 0 },
        { level: 0, dur: P / 2, color: 0 },
      ];
    case "Oc":
      return occulting(parts.group.length ? parts.group : [1], P);
    case "LFl":
      return flashes(parts.group.length ? parts.group : [1], P, clamp(P * 0.15, 1.2, 3), clamp(P * 0.1, 0.8, 2));
    case "FFl": {
      const fd = clamp(P * 0.1, 0.5, 2);
      return [
        { level: 2, dur: fd, color: 0 },
        { level: 1, dur: P - fd, color: 0 },
      ];
    }
    case "Q":
    case "VQ":
    case "UQ":
    case "IQ":
    case "IVQ":
    case "IUQ": {
      const rate = parts.base[0] === "U" ? 0.3 : parts.base[0] === "V" ? 0.6 : 1.0;
      const segs = quick(parts.group, P, rate, parts.base.startsWith("I"));
      if (parts.composite === "LFl") {
        // "Q(6)+LFl": append one long flash if room
        const fd = clamp(P * 0.15, 1.2, 3);
        const used = segs.reduce((a, s) => a + s.dur, 0);
        if (used + fd <= P) segs.push({ level: 1, dur: fd, color: 0 });
      }
      return segs;
    }
    case "Mo": {
      const segs = morse(parts.moLetters || "A", P);
      return segs.length ? segs : [{ level: 1, dur: P / 2, color: 0 }, { level: 0, dur: P / 2, color: 0 }];
    }
    case "Al":
    case "Fl":
    default: {
      return flashes(parts.group.length ? parts.group : [1], P, clamp(P * 0.04, 0.25, 0.8), clamp(P * 0.08, 0.5, 1.6));
    }
  }
}

// Parse all seamark light tags on one OSM element into Light[].
export function parseLights(tags: Record<string, string>): Light[] {
  // collect sub-light indices: bare seamark:light:* -> index "", numbered :N: -> N
  const idxs = new Set<string>();
  for (const k of Object.keys(tags)) {
    const m = k.match(/^seamark:light:(\d+:)?character$/);
    if (m) idxs.add(m[1] ?? "");
  }
  if (!idxs.size) return [];
  const out: Light[] = [];
  for (const idx of [...idxs].sort()) {
    const p = (k: string) => tags[`seamark:light:${idx}${k}`];
    const rawChar = p("character") ?? "";
    const period = parseFloat(p("period") ?? "") || guessPeriod(rawChar) || 6;
    const groupTag = parseGroup(p("group") ?? "", rawChar);
    const group = groupTag.length ? groupTag : [1];
    const colors = parseColors(p("colour") ?? "", rawChar);
    const seqTag = p("sequence");
    let segs: Seg[] | null = seqTag ? parseSequence(seqTag, period) : null;
    const parts = parseCharacter(rawChar);
    if (parts) {
      if (!parts.colors.length && colors.length) parts.colors = colors;
      if (!parts.group.length && groupTag.length) parts.group = groupTag;
    }
    if (!segs) segs = parts ? synthesize(parts, period) : null;
    let unparsed = false;
    if (!segs) {
      unparsed = true;
      segs = [
        { level: 1, dur: 0.5, color: 0 },
        { level: 0, dur: period - 0.5, color: 0 },
      ];
    }
    // normalize: drop zero durs, merge adjacent same-level/color
    const norm: Seg[] = [];
    for (const s of segs) {
      if (s.dur <= 0.001) continue;
      const last = norm[norm.length - 1];
      if (last && last.level === s.level && last.color === s.color) last.dur += s.dur;
      else norm.push({ ...s });
    }
    const secs: Light["sectors"] = [];
    const ss = parseFloat(p("sector_start") ?? "");
    const se = parseFloat(p("sector_end") ?? "");
    if (Number.isFinite(ss) && Number.isFinite(se)) secs.push({ start: ss, end: se, color: 0 });
    out.push({
      char: rawChar,
      group,
      period,
      segs: norm,
      colors: colors.length ? colors : parts?.colors.length ? parts.colors : ["W"],
      sectors: secs,
      rangeNm: parseFloat(p("range") ?? "") || undefined,
      heightM: parseFloat(p("height") ?? "") || undefined,
      unparsed,
    });
  }
  return out;
}

function parseGroup(tag: string, char: string): number[] {
  const t = tag.match(/[\d+]+/)?.[0];
  if (t) return t.split("+").map(Number).filter((n) => n > 0);
  const m = char.match(/\(([\d+]+)\)/);
  if (m) return m[1]!.split("+").map(Number).filter((n) => n > 0);
  return [];
}

function parseColors(tag: string, char: string): FlashColor[] {
  const src = tag || char;
  const out: FlashColor[] = [];
  for (const piece of src.split(/[;,\s]+/)) {
    const w = piece.toLowerCase().replace(/[^a-z]/g, "");
    if (COLOR_MAP[w]) { out.push(COLOR_MAP[w]!); continue; }
    // letter-packed forms like "WRG" or "W.R.G"
    const letters = piece.replace(/[^A-Za-z]/g, "");
    if (letters.length > 1 && letters.length <= 4 && /^[WRGYBuVi]+$/i.test(letters) === false) { /* fallthrough */ }
    if (/^[WRGY]+$/.test(letters) && letters.length >= 2) {
      for (const ch of letters) out.push(ch as FlashColor);
    } else if (letters === "Bu") out.push("Bu");
    else if (letters === "Vi") out.push("Vi");
  }
  return dedupe(out);
}

function dedupe<T>(a: T[]): T[] {
  return a.filter((v, i) => a.indexOf(v) === i);
}

function guessPeriod(char: string): number | null {
  const m = char.match(/(\d+(?:\.\d+)?)\s*s/i);
  return m ? parseFloat(m[1]!) : null;
}

// ---------- display ----------

export function colorHex(c: FlashColor): string {
  switch (c) {
    case "W": return "#fff3cf";
    case "R": return "#ff5f56";
    case "G": return "#57e88c";
    case "Y": return "#ffd166";
    case "Bu": return "#7d9bff";
    case "Vi": return "#c49bff";
  }
}

// "Fl(3) WRG 15s 108m 22M" — light-list notation
export function notation(l: Light): string {
  const parts: string[] = [];
  let c = l.char.trim();
  if (!c) c = "Fl";
  // keep the authentic short form: ensure group is shown
  if (l.group.length && !/\(\d/.test(c) && l.group[0]! > 1) c += `(${l.group.join("+")})`;
  parts.push(c);
  if (l.colors.length && !/[WRGY]/i.test(c)) parts.push(l.colors.join(""));
  if (l.period) parts.push(`${trimNum(l.period)}s`);
  if (l.heightM) parts.push(`${trimNum(l.heightM)}m`);
  if (l.rangeNm) parts.push(`${trimNum(l.rangeNm)}M`);
  return parts.join(" ");
}

const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
