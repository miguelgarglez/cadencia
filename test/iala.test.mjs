import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLights, parseCharacter, notation } from "../src/iala.ts";

const sum = (segs) => segs.reduce((a, s) => a + s.dur, 0);
const litAt = (l, t) => {
  let acc = 0;
  for (const s of l.segs) {
    acc += s.dur;
    if (t % l.period < acc) return s.level;
  }
  return 0;
};

test("explicit sequence wins and is scaled to period", () => {
  const [l] = parseLights({
    "seamark:light:character": "Fl",
    "seamark:light:period": "15",
    "seamark:light:sequence": "0.3+(5.7),0.3+(2.7),0.3+(5.7)",
    "seamark:light:colour": "white",
  });
  assert.equal(l.period, 15);
  assert.ok(Math.abs(sum(l.segs) - 15) < 0.01);
  assert.equal(l.segs.filter((s) => s.level === 1).length, 3);
  assert.equal(litAt(l, 0.1), 1);
  assert.equal(litAt(l, 3), 0);
  assert.equal(litAt(l, 6.1), 1); // second flash
});

test("Fl(3) produces three flashes then a long eclipse", () => {
  const [l] = parseLights({ "seamark:light:character": "Fl(3)", "seamark:light:period": "15", "seamark:light:colour": "white" });
  assert.equal(l.segs.filter((s) => s.level === 1).length, 3);
  const last = l.segs.at(-1);
  assert.equal(last.level, 0);
  assert.ok(last.dur > 8);
});

test("composite group 2+1 keeps both groups", () => {
  const [l] = parseLights({ "seamark:light:character": "Fl", "seamark:light:group": "2+1", "seamark:light:period": "21" });
  assert.equal(l.segs.filter((s) => s.level === 1).length, 3);
  assert.ok(Math.abs(sum(l.segs) - 21) < 0.01);
});

test("occulting is mostly lit", () => {
  const [l] = parseLights({ "seamark:light:character": "Oc(2)", "seamark:light:period": "10" });
  const lit = l.segs.filter((s) => s.level === 1).reduce((a, s) => a + s.dur, 0);
  assert.ok(lit > 5, `lit ${lit} should exceed half the period`);
});

test("isophase splits the period in half", () => {
  const [l] = parseLights({ "seamark:light:character": "Iso", "seamark:light:period": "8" });
  assert.equal(l.segs.length, 2);
  assert.ok(Math.abs(l.segs[0].dur - 4) < 0.01);
});

test("morse letter A is dot-dash", () => {
  const [l] = parseLights({ "seamark:light:character": "Mo(A)", "seamark:light:period": "10" });
  const ons = l.segs.filter((s) => s.level === 1);
  assert.equal(ons.length, 2);
  assert.ok(ons[1].dur > ons[0].dur * 2);
});

test("quick flash without group repeats to fill the period", () => {
  const [l] = parseLights({ "seamark:light:character": "Q", "seamark:light:period": "6" });
  assert.ok(l.segs.filter((s) => s.level === 1).length >= 4);
});

test("numbered sub-lights are parsed separately", () => {
  const lights = parseLights({
    "seamark:light:1:character": "Fl", "seamark:light:1:period": "10", "seamark:light:1:colour": "white",
    "seamark:light:1:sector_start": "0", "seamark:light:1:sector_end": "90",
    "seamark:light:2:character": "Fl", "seamark:light:2:period": "10", "seamark:light:2:colour": "red",
    "seamark:light:2:sector_start": "90", "seamark:light:2:sector_end": "180",
  });
  assert.equal(lights.length, 2);
  assert.equal(lights[0].colors[0], "W");
  assert.equal(lights[1].colors[0], "R");
  assert.equal(lights[0].sectors[0].end, 90);
});

test("unknown character degrades honestly", () => {
  const [l] = parseLights({ "seamark:light:character": "Wobble", "seamark:light:period": "4" });
  assert.ok(l.unparsed);
  assert.ok(Math.abs(sum(l.segs) - 4) < 0.01);
});

test("colour letters packed in the character are read", () => {
  const p = parseCharacter("Fl(2)WRG.10s");
  assert.deepEqual(p.colors, ["W", "R", "G"]);
  assert.equal(p.base, "Fl");
});

test("sector tags parse", () => {
  const [l] = parseLights({
    "seamark:light:character": "Oc", "seamark:light:period": "10",
    "seamark:light:sector_start": "42.5", "seamark:light:sector_end": "180",
  });
  assert.equal(l.sectors.length, 1);
  assert.equal(l.sectors[0].start, 42.5);
});

test("notation builds a light-list line", () => {
  const [l] = parseLights({
    "seamark:light:character": "Fl(3)", "seamark:light:period": "15",
    "seamark:light:colour": "white", "seamark:light:height": "107", "seamark:light:range": "22",
  });
  assert.equal(notation(l), "Fl(3) W 15s 107m 22M");
});
