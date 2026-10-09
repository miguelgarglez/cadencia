# cadencia design review

Reviewed HEAD: `b31e71ad152bc86678f1a9a63e8a2207e2ac4bbd`  
Verified with `git -C /Users/miguelgarglez/Developer/cadencia rev-parse HEAD`.  
Review date: 2026-10-09. Verdict: **65/100. Not ready for a flagship portfolio slot.**

The underlying interaction deserves further work. The current presentation still fails to make its most distinctive behavior clear, and several claimed fixes are incomplete. Keep the chart-room identity. Fix the camera, sheet geometry, and interaction continuity before adding visual decoration.

## Context

cadencia is an exploratory nautical-light instrument for curious visitors. The intended experience is quiet discovery, followed by understanding how a light changes with a viewer's bearing. A first-time visitor should not need nautical notation to discover that relationship.

I inspected all four current screenshots, all four previous-product heroes, and extracted chronological frames at one-second intervals from the supplied recording. The file named `first10.webm` actually lasts 16.64 seconds at 1440 × 900 and 25 fps. The first ten seconds show loading, the initial geographic approach, and the field guide; later samples show the next guide step. They do not demonstrate steering, sheet dragging, sharing, or a boundary crossing. Frame sampling establishes staging, not perceived frame-rate smoothness.

Code inspection covered `src/App.tsx`, all three files in `src/components/`, `src/index.css`, `src/lib/lightField.ts`, and `src/lib/share.ts`. I also checked the installed MapLibre camera implementation for the padding behavior. No servers were started or dependencies installed, and I made no application-code changes. During final verification, an external uncommitted edit appeared in src/App.tsx that changes selection timing and guards padding during camera movement. I checked the cited camera behavior again with git show at the full reviewed SHA. That later working-tree edit is excluded from this review and its scores. Behavioral conclusions below distinguish code evidence from captured results.

The brief calls the opening a world view, but the supplied hero is already a regional view of northwestern Europe. The dock shows 80,685 charted points. I do not treat the approximate 100,000-light description as a visual defect; points and individual light definitions can have different totals.

## First impressions

The sea has an identifiable atmosphere. Its nearly black water, sparse colored lights, and restrained wordmark make the map feel like the product rather than a background illustration. The bright inland and coastal chains nevertheless merge into white strokes, while the intended first target has little visual priority. The selected desktop view is less convincing than the opening: Castle Pile remains in a broad regional scene, the sector boundaries are not legible at presentation scale, and a bright blue focus outline gives the sheet more visual weight than the phenomenon it explains. On mobile the rose finally sits beside the light information, but the strip is clipped. The purported expanded screenshot does not show an expanded state.

## Visual design

**The timing strip has no room for its explanation.** In `selected.png`, the strip's zero label collides with the range metadata. Both mobile captures cut off the strip's lower ticks and endpoints. In `src/index.css:193`, `.strip` remains 34px high; its SVG consumes 100% of that height, while the verdict is an additional child above it. Give the explanation intrinsic height and the SVG its own 34px row. This is a layout defect, not a request for more padding everywhere.

**The selection hierarchy is inverted.** The screenshots give the sheet a conspicuous browser-blue perimeter, while the meaningful sector arcs are difficult to see. `LightCard.tsx:65` focuses the dialog on selection, and the sheet has no dedicated focus styling. Keep accessible focus, but give keyboard focus a deliberate chart-compatible treatment and avoid a large pointer-triggered outline. Make the active boundary and selected signal the next strongest marks after the light name.

**Dense lights still lose their identities.** The Netherlands and German waterways read as luminous threads in the hero. The halo damping exists, but it reaches full strength at zoom 6.5, close to the default settled zoom of 6.4. Additive blending also accumulates cores, which halo attenuation alone cannot solve. Tune overlapping-core brightness at the actual opening scale, and retain distinct color and flash changes in those clusters.

**The typography has roles, but the small text is doing too much work.** Space Grotesk for the brand, Instrument Serif for the light name, and IBM Plex Mono for instruments form a coherent hierarchy. The issue is scale and content allocation: the mobile coordinate line competes for width with the rose, the explanatory verdict is tracked 11px mono, and the dock drops to 10.2px below 480px. Keep the complete live strip readable, shorten the primary explanation, and move coordinates into expanded detail when necessary.

**The guide's primary action wraps awkwardly.** In the desktop hero, both "read Castle Pile" and "skip the guide" wrap across lines. This weakens the otherwise useful explicit entry action. Give the primary action one clear line and demote skip visually without reducing its hit area.

The color semantics mostly hold: magenta marks selection and interaction, while red, green, and white belong to the lights. Hairline chart rules and the serif light title are appropriate. There is no reason to replace them with a new visual identity.

## Interface design

We are missing an opportunity to make the signature interaction spatially obvious. The selected screenshots show the vessel and its leader, but not an easily understood band to cross. The rose contains three tiny neighboring colored arcs near north. A novice receives the instruction to cross a sector without a clear visible destination. Fit the light, vessel, and a useful sector boundary together before revealing the steering instruction.

There is a concrete camera conflict. Selection requests zoom 9.5 through `easeTo` in `App.tsx:511`. The sheet's ResizeObserver then invokes `setPadding` through `App.tsx:891`. In the installed MapLibre implementation, `setPadding` calls `jumpTo`, and `jumpTo` calls `stop()` in `node_modules/maplibre-gl/src/ui/camera.ts:526` and `:843`. That path can stop the selection flight before it reaches its target. The new settled-camera polling does not restore the intended destination. This is a code-supported explanation consistent with the broad selected desktop capture, not a runtime trace of that capture.

We are missing an opportunity to preserve the first-run invitation. The explicit CTA is present, but any window pointerdown advances step zero, as does a 12-second timeout. A user opening signals or touching the map can lose the named CTA without performing its intended action. The ring appears only in step one, so the first instruction and its geographic target are not simultaneously emphasized.

We are missing an opportunity to explain the signal in ordinary language. The honest approximation verdict is welcome. It needs to sit beside an intact strip and a concise reading such as "alternates red and white; full cycle 12 seconds." Keep the tagged notation available. The rose's "drag to steer" cue is conditional on a null bearing, so it disappears once the vessel actually exists.

We are missing an opportunity to make sharing a considered result. The code downloads immediately, then reveals a thumbnail for five seconds. That is post-download feedback, not preview before download. On mobile, the thumbnail is positioned above a sheet with `overflow-y: auto`, creating an additional clipping risk. Render a preview outside the scroll container, then provide an explicit download action.

## Consistency and conventions

The map stays visible behind sheets and trays, and actions are mostly small lowercase text links. This supports the instrument metaphor. The exact banned row of outlined uppercase monospace rectangular buttons is **absent**. The footer has rectangular divided cells, but they are lowercase dock controls, not the banned standalone button row.

| Before | After | Why |
| --- | --- | --- |
| Grip movement translates the whole sheet, then hiding/showing content changes its intrinsic height immediately. | Drive a measured sheet height or offset between two detents; retain the current position and release velocity through settling. | Finger tracking alone does not make the final transition continuous. |
| Grip and rose cancellation clear drag state without checking the pointer ID. | Verify the owning pointer on cancel and handle lost capture explicitly. | A secondary pointer must not cancel the active manipulation. |
| The sheet creates its own WebHaptics instance and triggers it directly. | Route sheet detents through the existing preference-aware haptic callback. | "Haptics off" must apply to every control. |
| Signals closes on Escape but does not restore focus to its trigger. | Return focus to signals after keyboard dismissal. | Topmost-layer dismissal needs a predictable keyboard destination. |
| Bearing values, notation, share labels, and guide text are replaced directly. | Preserve stable text and transition only changed values; provide an immediate reduced-motion alternative. | The changing signal is the main learning event and should remain easy to follow. |

The vessel itself has useful foundations: a 44px hit area, pointer capture, grab offsets, and keyboard steering. Its up/cancel handlers verify the owning pointer. The sheet and rose do not have the same cancellation discipline.

The rose also reports geographic bearing but sends an angle into a screen-space orbit calculation in `App.tsx:546`. The improved spawn validates geographic bearing, but steering still mixes those coordinate systems. At close zoom the difference may be small; use one bearing convention through input, vessel placement, rose, and sector lookup.

## User context

A curious visitor has little investment in learning abbreviations before something rewarding happens. The opening field earns attention, but the product then asks that visitor to interpret a narrow rose, locate a small vessel, and understand an approximation warning in separate places.

Uncommon care here means showing one readable change at the point of steering, then explaining it in the sheet. Preserve the current UTC phase when the active signal changes. Do not add easing to the actual scientific flash timing; animate the surrounding explanation instead.

Copy must also remain consistent about inference. The sheet says "approx," while another guide path says "the light's true rhythm." The crossing message declares that the ship has left safe water after any color change, although the guide does not evaluate a safe-water state. Describe the charted sector change itself. This is a critique of what the application knows and claims, not an assessment of navigation suitability.

## Scores and the three changes required for each score below 8

Scores assess the supplied result. Code earns credit for implemented mechanics, but does not substitute for demonstrated gesture quality.

| Axis | Score | Reason | Three concrete changes to reach 8 |
| --- | ---: | --- | --- |
| First impression | 7 | Distinct sea and restrained branding; the first target and action are weaker than the bright density clusters. | 1. Mark Castle Pile while the initial CTA is visible. 2. Keep the named CTA on one line with a clearly secondary skip action. 3. Reduce merged white cores at the settled opening zoom. |
| Signature moment | 7 | Bearing-dependent rhythm and color are a strong idea, but the selected captures do not explain the boundary spatially. | 1. Complete the selection flight without resize padding cancelling it. 2. Frame a legible boundary with the vessel already beside it. 3. Link crossing feedback across boundary, map signal, and a plain-language signal readout. |
| Feel of direct manipulation | 6 | Vessel offsets and capture are sound; the sheet only tracks translation, and the geographic angle convention is inconsistent across controls. | 1. Make detent geometry and release velocity continuous. 2. Apply pointer ownership to grip/rose cancellation and lost capture. 3. Make rose steering place the vessel at the requested geographic bearing. |
| Spectacle | 7 | Thousands of independently changing lights create scale; dense white chains and the weak selected composition limit it. | 1. Preserve separate cores in dense waterways. 2. Make a selected sector fan readable against the field. 3. Stage the initial overview-to-local transition around one visible rhythm without changing its UTC phase. |
| Motion quality | 6 | The sampled opening has deliberate staging, but sheet height swaps and vessel refits have discontinuous code paths. | 1. Give one camera operation ownership of selection and measured padding. 2. Settle sheet detents with an interruptible, velocity-aware transition. 3. Animate necessary vessel refits and changing explanatory text, with reduced-motion alternatives. |
| Micro-interactions | 6 | Press states and Escape handling improve; preview order, focus return, and haptic preferences remain incomplete. | 1. Preview before downloading, outside the mobile scroll container. 2. Honor haptics-off for grip detents. 3. Restore popover trigger focus and use intentional sheet focus styling. |
| First-run guidance | 7 | A real named CTA and better mobile docking are meaningful improvements; unrelated input still advances the lesson. | 1. Keep step zero until its own action or deliberate dismissal. 2. Show a usable sector boundary and a persistent rose steering cue before asking for a crossing. 3. Make completion copy describe the observed change and retain approximation honesty. |
| Typography and layout | 6 | The three typefaces have distinct jobs; strip collisions, clipped labels, and tiny dock type are unresolved. | 1. Separate the verdict and fixed-height SVG into independent layout rows. 2. Restore the 10.5px dock minimum at every breakpoint and simplify mobile labels where needed. 3. Reduce compact-state coordinate weight and give the primary signal description normal reading spacing. |
| Originality versus stock | 7 | A 9-point underlying concept with two concrete previous-product matches, detailed below. | 1. Differentiate the Nullius-like chart-plus-callout composition through an integrated live light-list instrument. 2. Make the shared-clock presentation visibly unlike Antipoda's dark geographic instrument, using nautical sequence and bearing behavior rather than another glowing dial as the main reward. 3. Carry the observed sector crossing into the exported artifact, so its distinctive mechanism survives outside the map. |
| Mobile | 6 | The compact grid improves usable map space, but the strip clips and the supplied expanded capture proves no expansion. | 1. Keep the entire strip and both endpoints inside peek at 375px. 2. Produce a real expanded detent with metadata, vessel note, and actions visible or clearly scrollable. 3. Make sheet, guide, vessel refit, and preview respond as one measured layout with continuous gesture settling. |

**Total: 65/100.** The prior review is described as 65/100, but its ten supplied axis scores add to 63. Relative to those individual scores, first-run guidance rises from 6 to 7 and mobile from 5 to 6. The other axes stay unchanged. I have not added points merely because a fix was described as shipped.

## Verification of every claimed fix

"Landed" below means the implementation is present; it does not imply live interaction testing.

| Claimed fix | Finding at this HEAD |
| --- | --- |
| Compact mobile grid with text left, rose right, full-width strip, secondary detail below | **Landed structurally and visible.** CSS grid areas and `display: contents` place the rose beside the head. **Result incomplete:** strip endpoints are clipped. The expanded image has the same visible sheet extent and does not show metadata, note, or actions. |
| Grip follows the finger with capture and a drag threshold | **Landed in code.** Capture, 4px movement threshold, and direct translateY updates exist. No gesture recording demonstrates the feel. Translating the whole compact sheet does not reveal expanded content during the pull. |
| Directional detents and haptic settle | **Partial.** 60px distance and 0.35px/ms velocity conditions exist. Height changes by content visibility, not an animated detent. Velocity uses the last pointermove-to-pointerup delta, which can be zero even after a fast movement. Detent haptics bypass the global preference. |
| Up/leave/cancel all verify pointer ID | **Not true across controls.** Grip up checks ID; grip cancel does not. Rose up checks ID; rose cancel does not. Neither has a leave handler. Pointer capture can make leave handling unnecessary, but it is not the claimed implementation. Vessel up/cancel both check ID. |
| Spawn prefers real geographic bearings in charted sectors | **Landed.** `App.tsx:294` unprojects each candidate and tests `bearingDeg` before selecting it. It deliberately falls back to out-of-sector candidates if no clear in-sector spot exists. |
| Spawn waits for actual camera settle | **Partial.** Polling uses `isMoving()` and a 950ms floor, or 60ms with reduced motion. After 2200ms it spawns regardless. More importantly, padding can stop the flight early; stopped is not the same as arrived. |
| 200px mobile top padding while guide is up | **Landed.** Present in selection, height measurement, and settle callbacks. The mobile vessel and selected point are clear of the docked tip in the supplied captures. |
| Sheet settle re-fits vessel | **Landed in code.** A 340ms callback calls `refitVessel`. It changes geographic position immediately when obstructed; no captured sequence verifies continuity or preservation of the user's bearing. |
| Step-zero "read Castle Pile" action selects target | **Landed.** Visible in the hero and wired to select the resolved target. Global pointerdown and the timeout still advance away from it independently. |
| Mobile guide docks above selected sheet; otherwise top-center | **Landed.** The selected mobile capture shows the bottom-left placement. Code uses measured sheet clearance and top-center before selection. |
| Guide positional easing removed | **Landed.** The tip only transitions opacity; position follows its anchor directly. |
| Alternating-signal vessel note | **Landed and visible.** Desktop copy says red/white, alternating and includes the active notation. |
| Approximation verdict explains full cycle beside strip | **Landed in copy, failed in layout.** The 12-second explanation is visible, but its height is not included in strip geometry. |
| Card preview thumbnail before download | **Not landed as described.** `share.ts:170` clicks the download link before resolving the URL. `LightCard.tsx:243` then sets the thumbnail. This is an after-download receipt. Mobile overflow can clip the above-sheet preview. |
| Escape respects topmost signals layer | **Landed for signals versus underlying selection/about.** The document listener stops propagation before the window handler. Trigger focus restoration remains absent. A complete ordering of every possible overlay combination is not demonstrated. |
| Preferences pressed states | **Landed in code.** `.prefs-pop button:active` adds background and scale feedback; checked semantics and switch visuals exist. |
| Single error surface for link misses | **Landed.** The data-error/link-miss ternary renders one error tray, with data failure taking priority. |
| Dock floor raised to 10.5px | **Partial.** The 640px breakpoint sets 10.5px; the later 480px rule overrides it to 10.2px. |
| "Drag to steer" cue added to rose | **Partial and ineffective in the captured selected state.** The cue appears only when bearing is null. Once the vessel spawns, it is replaced by the bearing, as both selected screenshots show. |
| Zoom-damped halo with smoothstep 2.5 to 6.5 | **Landed.** Both shader stages carry `v_damp`. The captured dense clusters still merge; the default 6.4 zoom is almost at full halo intensity and additive cores remain. |

## Taste rule violations

These are findings against the seven numbered product rules in `taste.md`. Rule 3 is not broken by the supplied primary flows. The others have concrete remaining violations.

| Rule | Place and evidence | Fix |
| --- | --- | --- |
| 1. One thing at a time | Selected mobile screen gives persistent prominence to coordinates, encoded notation, an approximation paragraph, the rose, and a separate steering lesson, while the actual timing endpoint is clipped. | Make the compact task "steer and read this signal." Keep the complete strip, a concise current-signal reading, and the rose. Reveal coordinates and detailed inference explanation in expanded detail. |
| 2. Nothing teleports | `LightCard.tsx` replaces notation, bearing text, and action labels directly. `Guide.tsx` swaps step content. Peek hides content with display:none; `refitVessel` moves geographic position directly. | Keep stable text and animate changed tokens; measure and animate detent geometry; preserve or visibly transition the vessel during layout-driven refits. Do not interpolate the real signal's on/off events. |
| 4. Spend delight on the curve | The rare sharing event downloads before showing its thumbnail. The crossing completion primarily swaps explanatory text, while the meaningful boundary is weak in the selected captures. | Make sharing a persistent preview with an explicit save action. Give the first successful crossing a brief, spatially connected acknowledgment at the crossed boundary and its explanation. |
| 5. Touch has feedback | The new grip creates WebHaptics directly in `LightCard.tsx:79–111`, outside App's haptics-on guard. Disabling haptics therefore does not disable this snap feedback. | Inject the existing preference-aware callback and use it for every detent. Existing visual press states deserve credit; the defect is inconsistent user control over touch feedback. |
| 6. Same polish everywhere | The selected view has strip/metadata collisions and a browser-blue sheet perimeter; mobile clips the signal scale. Preview has a clipping risk. Settings lacks keyboard focus return. | Apply the same measured layout and intentional focus treatments to sheet, preview, and settings. Verify each secondary state at the target width, including actual expanded content. |
| 7. Small, sharp parts with correct reduced motion | `flyToGuideTarget` in `App.tsx:727` always requests a 2400ms camera ease, unlike other reduced-motion-aware camera paths. Grip/rose cancellation and shared preferences differ between components. | Make this guide flight respect reduced motion, and use consistent pointer ownership and haptic routing across the small interactive controls. |

Rule 3, "Context survives," passes in the observed main flows: sheets, settings, and about content overlay the chart. The missing continuity belongs under rule 2 rather than being counted twice.

Additional guidance in the taste file also favors spring-based drag settling and trigger-related popover motion. The sheet's current intrinsic-height swap and instantly unmounted settings popover fall short of that guidance. Neither a new animation dependency nor a specific library is required to repair them. The use of a real dataset, changing output, and restrained chart materials satisfies the file's broader concept filter.

## Originality comparison

Underlying concept: **9/10** before similarity deductions. The combination of real light definitions, a shared replay phase, and a vessel changing the active signal by bearing has depth beyond a themed generator.

I count two identifiable cross-product matches. Each costs exactly one point. Related details within the same visual construction are grouped once rather than penalized repeatedly.

| Previous hero | Matching construction in cadencia | Deduction |
| --- | --- | ---: |
| Nullius | A full-bleed nautical chart acts as the main interface; a small upper-left identity and thin-bordered floating text annotation sit directly over geographic content. Cadencia's darker palette and real signals distinguish it, but the chart-plus-callout composition is a clear family resemblance. | -1 |
| Antipoda | A nearly black geographic instrument uses glowing real-world phenomena, dim monospace measurements, hairline scales, and sparse peripheral controls. Cadencia's timing strip and bearing instrument repeat that instrument-first visual grammar, despite a different map and signal system. | -1 |

**Originality score: 9 - 2 = 7/10.**

Nightcap also has a dark background, fine rules, small mono annotations, and an upper-left identity. Those generic traits alone do not establish an additional recognizable borrowed construction: its dominant rounded daily timeline, stacked drink cards, ghost, and lunar controls are absent here. No extra match is counted.

Laureate's centered ceremonial composition, parchment, medal, wax seal, and press are absent. Its ordinary underlined secondary actions do not make cadencia's action links a copied product element. No match is counted.

The banned outlined uppercase monospace rectangular button row is absent in both screenshots and the relevant CSS. Cadencia's own magenta selection star, chart-room colors, type roles, and previous internal iterations are not separate originality penalties. Do not redesign the established identity to chase novelty; differentiate how the nautical behavior is presented.

## Top opportunities

1. Resolve the camera-padding conflict so selection reliably arrives at a useful sector view before the steering lesson begins.
2. Repair the strip's intrinsic layout, then capture genuinely distinct 375px peek and expanded states with complete timing and accessible actions.
3. Make sheet settling continuous and unify pointer ownership, bearing conventions, and haptic preferences across the vessel, grip, and rose.
4. Preserve the named first-run action until the user takes it, and teach the first boundary crossing through a visible boundary and plain-language signal change.
5. Put the share preview before download and keep it outside mobile overflow, with focus and feedback matching the main interface.
