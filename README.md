# cadencia

**Every charted lighthouse on Earth, blinking its real coded rhythm, on one dark sea.**

cadencia is a live nautical chart of the ~62,000 navigational lights recorded in
OpenStreetMap. Every dot is a real seamark — a lighthouse, a buoy, a leading
light — and it blinks the exact pattern a mariner would see: `Fl(3) 15s` flashes
three times every fifteen seconds, `Oc(2)WRG` eclipses twice and changes color
with your bearing, `Mo(A)` taps out morse alpha. Nothing is animated by hand;
the data carries its own timeline, and every viewer sees the same sea at the
same second.

## how it works

- **Data** — `pipeline/fetch.mjs` walks the planet in 20° tiles against the
  Overpass API, collecting every object tagged `seamark:light:character` plus
  uncharted `man_made=lighthouse` towers, then `pipeline/build-shards.mjs`
  deduplicates them and packs the result into static 5°×10° JSON shards under
  `public/lights/`. The browser loads only the shards under the viewport.
- **The language of lights** — `src/iala.ts` is a small IALA light-characteristic
  parser: character (`Fl`, `Oc`, `Iso`, `LFl`, `Q`, `VQ`, `UQ`, `Mo`, `Al`, `FFl`),
  groupings, colors, periods, explicit `sequences` like `0.5+(4.5)`, and
  directional `sectors`. Each light becomes a timeline of lit/unlit segments.
  Signals that can't be decoded honestly are flagged rather than faked.
- **The field** — `src/lib/lightField.ts` is a MapLibre custom layer that draws
  every light as an instanced WebGL quad. Segment timelines live in a float
  texture the vertex shader reads, so tens of thousands of independent flash
  clocks tick off one shared UTC beat. Daylight genuinely dims the field — the
  shader checks the subsolar point, because a light competes with the sun.
- **The vessel** — sectored lights (the famous WRG leading lights) show
  different colors to different bearings. Click one and a small vessel appears;
  drag it around the light and the color, the sector arcs, and the card all
  answer like a real approach.

## run it

```bash
npm install
npm run dev      # serve the app + prebuilt shards
```

To rebuild the data from scratch (takes a while, it's the whole planet):

```bash
node pipeline/fetch.mjs          # tiled Overpass crawl -> pipeline/cache/
node pipeline/build-shards.mjs   # -> public/lights/*.json + index.json
node test/iala.test.mjs          # parser tests
```

## stack

React 19 · Vite · TypeScript · MapLibre GL · WebGL2 instancing ·
OpenStreetMap seamark tags (ODbL) · CARTO dark basemap.

## data & honesty

- Lights come from `seamark:light:*` tags volunteered by OSM's nautical
  community — Admiralty list numbers (`ref`), heights, ranges, and all.
- Coverage follows the map: superb in northern Europe and Chile, patchy where
  nobody has charted the coast yet. Uncharted towers show as faint grey dots.
- The flash clock is shared UTC, so two people watching the same second see the
  same sea — but cadencia is an instrument for wonder, not navigation.
  Keep your chart plotter handy anyway.

MIT.
