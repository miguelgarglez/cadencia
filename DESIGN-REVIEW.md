# cadencia design review

Reviewed commit: `0d3607cbaa1a7bd48dd0f4f2a32ceca116f32b0f`.

Decision: not ready for a flagship portfolio. The real signal system earns attention; the interface still loses the teaching moment on mobile and has several visible state-continuity failures. This is a meaningful improvement over the previous review, not a finished craft pass.

## Context

cadencia is an exploratory nautical-light instrument for curious visitors. The intended mood is patient discovery, with enough explanation for someone who cannot read a light characteristic. Precision matters because the interface presents itself as an instrument.

Evidence: all seven supplied PNGs; sequential frames extracted from the supplied recording at one-second intervals, with a four-frames-per-second inspection of its early reveal; source at the requested commit, including App, all three components, CSS, the light renderer, data store, clock, sound, share export, and routing. The recording is actually 14.36 seconds at 25 fps, despite its filename. It covers loading, the camera approach, the light field, and the guide's timed change. It does not demonstrate dragging, crossing, sharing, or closing. Motion and manipulation scores therefore combine recorded opening behavior with code inspection; they are not claims of hands-on device testing. No server was started, and nothing was installed.

The checkout is `bc05483123a194675f4bf34795ba772f1aebb520`. Its source difference from the requested commit is tighter mobile dock CSS. That later change receives no credit here. Source references below refer to the reviewed commit. The installed MapLibre camera implementation was also checked to avoid misclassifying its built-in reduced-motion behavior.

The data index distinguishes 80,685 points from 100,136 light records. The screenshot's "100,136 charted" is therefore not evidence of fabricated data, but the dock compares points in view with total light records without explaining the different units.

## First impressions

The coast illuminated by independent signals is the strongest image. It has a reason to exist and does not need a larger headline or a marketing panel. The ring now provides an entry point, but it encloses a dense cluster at this zoom, and the guide remains the main explanation of what to do. The selected desktop state is more distinctive: a chart star, narrow sector fan, vessel, and a restrained light-list entry. On mobile that composition fails. The large steer tip covers the central light/leader region, while the sheet hides the timing strip and the rose it tells you to use. The experience promises discovery but puts its clearest explanation behind an almost untappable control.

## Visual design

**The meaningful colors work.** Cream, red, and green carry the signal data; magenta marks selection and editorial emphasis. Keep that separation. The abyss palette and chart rules are established cadencia identity, not reasons to redesign the brand.

**The type-size repair is incomplete.** `index.css:149–159` still uses 11px coordinates and 10px bearing text. Actions are 11px; guide labels and dismissal are 9.5px; the rose caption is 9px. The timing strip uses 8.5px SVG labels in `LightCard.tsx`. The 12–14px claim applies to some copy, not the working interface. Move essential labels and actions to at least 12–14 CSS pixels, reduce tracking, and give explanatory prose the UI font. The large supplied raster must not be mistaken for large CSS type.

**Desktop hierarchy repeats information.** The selected sheet states bearing above the notation, below the metadata, and under the rose. Range and height appear in both notation and metadata. The notation itself is useful; the repeated sentence below it consumes the space that could explain the alternating signal. Keep one bearing readout beside the control and one plain-language decode beside the notation.

**The chart loses its focal point on mobile.** In `mobile-375.png`, the vessel is visible above the tip, but the light and the intervening relationship are obscured. The tip takes roughly 120 CSS pixels of height. Replace that paragraph during steering with a short instruction attached outside the entire light-to-vessel path, not merely outside the vessel's hit box.

**Dense ports become white strokes.** In the hero and recording, the eastern concentrations merge into bright lines, while the demonstrated light stays small. This preserves geographic density but weakens the distinction between independent flashes. Reduce additive saturation in dense areas and bring the selected signal forward locally, without globally enlarging every dot.

**Icons lack a single construction.** The hand-drawn SVG vessel and canvas star sit beside a font-glyph close mark and text arrows. This is minor, but visible at instrument scale. Use consistent stroke weight and optical sizing for interactive icons; keep nautical symbols distinct where their meaning requires it.

## Interface design

We are missing an opportunity to teach the signature interaction while all its parts are visible. The mobile sheet initializes in peek mode and hides `.peekable`, including the strip, metadata, share actions, and rose. The guide still says "drag the rose on the sheet." Its expand button is the 44×4px grip itself, with no larger wrapper or swipe implementation. Show a compact timing strip and bearing control in the first sectored-light state, and give expansion a real 44px-high target.

We are missing an opportunity to make selection unambiguous. The guide ring has `pointer-events: none`; selection is the normal nearest-point picker within 20px. Clicking somewhere inside the enlarged ring does not explicitly select Castle Pile. Add an accessible named target that resolves that exact light, with the same behavior for touch and keyboard.

We are missing an opportunity to show a trustworthy change of signal. `App.tsx:363–400` switches the active light and selected color, and the renderer uploads the active sequence. That is substantive work. However, the shader then overrides every segment's color with `u_selColor`. Castle Pile's displayed alternating red/white sequence can therefore retain one forced map-dot color across both segments. The strip shows red and cream while the map override is constant. Evaluate the active light's segment color at the shared time and use that result everywhere. This is a code finding, not a crossing observed in the recording.

We are missing an opportunity to preserve the discovery when sharing. `saveCard` passes only the point; `share.ts` immediately chooses `p.light`. A visitor reading another sector exports the primary signal, and the image omits the current bearing and reconstruction qualifier. Pass the active light and bearing into the export and preview the exact artifact. The URL does deep-link to the light, but does not preserve the observer's bearing, so it cannot reproduce the sector demonstration.

We are missing an opportunity to distinguish "still loading" from "nothing here." The loading cover follows map readiness, while light shards load separately. The extracted opening frames show the guide over a nearly empty chart before the field arrives. Keep the chart interactive, but give light-data loading its own quiet status and reveal the target only once it can be selected.

## Consistency and conventions

The bottom sheet preserves the geographic context on desktop. The grip, however, promises a draggable sheet while implementing only a tiny click target. Close and expand should follow the same touch conventions as the vessel.

The L shortcut, dock picker, vessel arrows, rose slider semantics, and Escape handling are implemented. They deserve credit. The visible label "a light" does not explain cycling, and the shortcut is hidden in a title attribute. Show a brief shortcut hint when the picker gains keyboard focus.

The dock still consists of monospace rectangular compartments. The exact banned combination of outlined, uppercase, monospace rectangular buttons is absent: the labels are lowercase, and the sheet actions are underlined. The redesign nevertheless retains much of that row's visual geometry through the dock's top rule and per-cell borders. Treat this as a partial visual cleanup, not as either a full ban violation or a complete removal. Put secondary preferences behind one control and leave the primary chart action unboxed.

UI state transitions are inconsistent. Counts use NumberFlow; the clock, bearing, notation, guide text, and action statuses replace text directly. Signal changes must remain exact in time, but the explanatory labels can retain their common characters and reserve their width.

## User context

A first-time visitor is likely browsing, not studying a navigation manual. "Al RW 6s 17m 11M" has visual authority without immediate meaning. The sheet should let a visitor connect a visible flash with one sentence before asking them to interpret abbreviations.

The product also needs to express the limits of its own data consistently. The selected sheet admits a reconstructed period; the guide calls the strip the light's "true rhythm." Use "tagged rhythm" or "reconstructed rhythm" according to the record. Explain that a sector boundary changes the observed signal rather than implying that every crossing necessarily means leaving safe water. This is a copy-consistency finding based on the product's own inferred-data state, not an external navigation assessment.

Reduced-motion visitors should receive the same understandable experiment. Calm mode deliberately removes flashing, but currently provides no visible explanation of why the sea and strip are still. Offer a static sequence with an explicit calm label and preserve bearing-driven changes without camera travel.

## Scores and the changes needed to reach 8

Scores measure the presented experience, not the number of features implemented. The requested originality formula is applied separately below.

| Axis | Previous | Now | Reason |
| --- | ---: | ---: | --- |
| first impression | 7 | 7 | Strong field; opening explanation and loading are still detached from the first useful action. |
| signature moment | 6 | 7 | Vessel, sectors, star, and notation form a specific interaction; signal consistency and mobile presentation limit it. |
| feel of direct manipulation | 5 | 6 | Real pointer capture and keyboard steering; grip, drag offsets, and control feedback remain unfinished. |
| spectacle | 7 | 8 | A geographically meaningful field of independently timed lights earns the scale. The captured coast has visual force. |
| motion quality | 5 | 5 | Camera easing and exits exist, but mobile entry transforms, text swaps, anchor lag, and reduced-motion gaps persist. |
| micro-interactions | 4 | 6 | Haptics, press styles, focus, and share statuses exist; feedback is uneven and export does not preserve the viewed state. |
| first-run guidance | 4 | 6 | Named target and action-based progression are a real improvement; hidden controls and target ambiguity remain. |
| typography and layout | 5 | 6 | Good division of serif names, UI prose, and instruments; essential type remains small and mobile layout clips controls. |
| originality versus stock | 2 | 6 | Underlying concept 9, minus three identifiable cross-product presentation matches. |
| mobile | 3 | 4 | Vessel target improved; hidden teaching tools, a 4px grip, covered light, and overflowing dock still block the flow. |

Exactly three concrete changes for every score below 8:

| Axis | Change 1 | Change 2 | Change 3 |
| --- | --- | --- | --- |
| first impression | Tie the guide reveal to target-data readiness so it never describes an absent light. | Make the first visible instruction a short invitation to select Castle Pile, with an exact selectable target. | Name the shared-UTC premise in readable opening copy beside the live signal, replacing the long generic introduction. |
| signature moment | Use one active-segment evaluator for map color, timing strip, and notation, including alternating colors. | Frame the light, both adjacent sector boundaries, and vessel together in the unobstructed chart region. | On the first crossing, briefly emphasize the boundary and changed signal with a concise red-to-white or white-to-green explanation. |
| feel of direct manipulation | Preserve the grab offset and reject secondary pointers so a 44px vessel hit target does not jump to the finger center. | Put rotation and grabbed scale on separate nested elements so the inline rotation cannot override the pressed scale. | Implement a real sheet drag with stable detents and a 44px-high expand control, keeping the chart clear as its height changes. |
| motion quality | Give mobile its own sheet entry transform; remove the desktop `translateX(-50%)` from mobile keyframes. | Coordinate marker, vessel, sheet, and guide through interruptible transitions; update anchors during camera movement rather than polling every 350ms and easing behind it. | Complete reduced-motion handling for sheet/tray keyframes and vessel rotation, while morphing only changed explanatory text in normal mode. |
| micro-interactions | Add immediate visible pressed feedback to the grip and rose, and retain the vessel's intended grabbed treatment. | Reserve space and morph shared text in copy/save feedback and bearing readouts; keep signal transitions temporally exact. | Preview and export the active sector with bearing and inference status, then confirm that export with one restrained haptic and clear result text. |
| first-run guidance | Make the named guide target clickable and keyboard-selectable by ID rather than relying on proximity picking. | Reveal the strip and rose before referring to them, and place the tip using measured collision bounds for the light, leader, vessel, and sheet. | Advance the teaching steps on the named actions, shorten steering copy to one instruction, and keep the crossing explanation visible long enough to read without being chased by the moving anchor. |
| typography and layout | Raise essential action, coordinate, bearing, and guide labels to 12–14 CSS pixels and reduce excessive tracking. | Consolidate the three bearing statements into one readout and add a short decode of the signal. | Make the dock responsive by collapsing secondary preferences, preserving readable text and all actions at 375px. |
| originality versus stock | Replace the generic floating chart annotation with an on-chart sector lesson whose geometry communicates the task. | Develop the rhythm instrument around grouped flashes and eclipses, with the active pulse visibly tied to the chart, rather than the familiar horizontal tuner treatment. | Give sharing a chart-specific bearing/signal stamp preview instead of another adjacent save/copy text-action pair. |
| mobile | Keep the strip and a compact rose in the initial selected state, with a large expansion target for metadata. | Fit all persistent controls within 375px and account for safe-area insets; move sound and haptics into secondary settings. | Measure the free chart area after every sheet-size change and keep the light-to-vessel experiment clear of the guide and sheet. |

## Verification of the proposed fixes

| Claimed fix | Finding at the reviewed commit |
| --- | --- |
| Named, anchored, action-based guide | Partly verified. Castle Pile is named and ringed in the capture. Selection and crossing advance steps. The first step still advances after seven seconds or any global pointer/wheel action. Anchors update every 350ms; placement uses hard-coded sheet and tip sizes. |
| Bottom sheet and padding-aware camera | Present, incomplete. Selection uses a stored sheet height. Height is polled every 800ms, but measurement alone does not reapply camera padding when the sheet expands. |
| Unobstructed 44px vessel, drag, rose, arrows | Present in code and visible on desktop. Mobile vessel is visible, but the guide obscures the experiment. Pointer capture exists; grab-offset preservation and active-pointer filtering do not. |
| Chart star, sector arcs, leader | Verified visually in selected.png and in canvas drawing code. These are the strongest presentation improvements. |
| Map dot follows active rhythm and color | Active sequence upload and color override exist. Alternating segment colors are flattened by the unconditional selected-color override. Not fully fixed. |
| Entrance and exit transitions | Present for sheet and About. Vessel insertion/removal is immediate. Mobile inherits a desktop horizontal entry transform. Text and peek content swap. |
| L key and dock selection | Implemented, including focus handling and arrow-key bearing changes. Not exercised in the supplied recording. |
| Haptics and sound toggles | Implemented. Sound starts off; selection/crossing/share paths include feedback. No physical haptic or audio quality claim can be made from the supplied evidence. |
| Deep links | Parser, camera hash updates, and delayed ID resolution are present. A 15-second polling stop has no visible unresolved-link state. Current bearing is not encoded. |
| PNG share cards | Export implementation exists with a chart-styled composition. It exports the primary light, not necessarily the active sector. No exported PNG was supplied for visual verification. |
| Reduced-motion calm mode | Field calm mode and stopped strip playhead exist. Sheet/tray positional keyframes are not disabled by the media rule. MapLibre itself suppresses nonessential camera easing under reduced motion, including the guide fly-to; that path is not a failure. |
| SPA rewrite and branded 404 | Both files exist. The unconditional rewrite sends unmatched routes to the app; there is no pathname-based not-found state in App. File existence alone does not prove the branded 404 is reachable for an unknown route. Deployment behavior remains untested. |
| Type raised to 12–14px | Partly false. Important labels and actions remain at 9–11px; see visual audit. |
| Underlined text actions replacing outlined buttons | Verified for copy/save and guide dismissal. The dock retains bordered monospace compartments with lowercase labels. |

## Taste-rule violations

All seven numbered rules were checked. Rules 1, 2, 4, 5, 6, and 7 have concrete failures. Rule 3 mostly passes: the chart stays present beneath sheets and trays. Its preference for origin-linked layers is not fully realized, but a bottom sheet is itself an allowed contextual layer, so that is not counted as a separate violation.

| Rule | Place and observed or source-supported break | Fix |
| --- | --- | --- |
| 1. One thing at a time | Desktop selected state exposes repeated bearing explanations, metadata, share actions, rose, and guide together. Mobile hides the required instruments while still exposing five persistent utility actions. | Keep signal and steering in the first layer; disclose metadata, sharing, and settings when needed. |
| 2. Nothing teleports | `Guide.tsx` replaces step text; `LightCard.tsx` replaces notation and action labels and toggles `display:none`; `Hud.tsx` replaces UTC text. Vessel creation/removal is immediate. Mobile sheet keyframes jump from the desktop horizontal offset. | Preserve common text, animate sheet expansion and vessel handoff, and use breakpoint-correct transforms. Counts already use NumberFlow; keep that credit. |
| 4. Spend delight on the curve | First crossing changes guide copy and fires feedback but gives no durable visual explanation of the crossed boundary. Save gives a text confirmation and download, with no preview of the discovery being saved. | Spend the larger visual response on the first crossing and a bearing-specific export preview. Keep routine steering direct. |
| 5. Touch has feedback | The grip has no pressed treatment or haptic detent, and its 4px height frustrates touch. The rose changes cursor rather than showing a touch pressed state. Vessel inline `transform:rotate(...)` overrides the CSS grabbed scale. | Add visible touch states within 100ms, a real expand target and detent feedback, and separate rotation from scale. Existing crossing/share haptics and muted-by-default sound satisfy the other parts of this rule. |
| 6. Same polish everywhere | Share export discards active context; unresolved shared IDs fail silently after polling ends; the standalone 404 uses generic system mono and is not demonstrably routed; the data error tray replaces explanatory precision with a long metaphor. | Preserve active export state, show an actionable missing-light result, connect the branded not-found state to routing, and identify exactly which data failed with a retry action. |
| 7. Small, sharp parts | Reduced-motion correctness fails across sheet/tray positional keyframes and the vessel rotation transition. Layout ownership is split between 800ms sheet polling, 350ms guide polling, and guessed dimensions. | Use one measured layout contract for chart bounds and guide placement, and apply reduced-motion behavior consistently to each animated component. No dependency-bloat penalty is warranted by the inspected package list. |

The additional craft guidance in taste.md reinforces the same findings. Dragging lacks the complete pressed/release treatment; contextual elements use disconnected timers instead of a coordinated sequence; changing labels only partly receive the requested morph treatment. These are not extra numbered rules or duplicate deductions.

Concrete motion corrections, following the Emil review format:

| Before | After | Why |
| --- | --- | --- |
| Desktop `sheet-in` keyframe inherited on mobile | Separate mobile transform, with interruption-safe entry and exit | The sheet must enter from its actual resting position. |
| Inline vessel rotation overrides `.grabbed .ship` scale | Outer rotation, inner scale | Steering direction and touch feedback need independent transforms. |
| Reduced-motion rule changes only transition duration for sheet/tray | Disable their positional keyframes; retain MapLibre's reduced-motion camera handling and use brief opacity feedback | A preference must govern the custom components as well as the map. |
| Guide polls at 350ms and transitions position over 300ms | Anchor positioning follows the current projection; animate only intentional step changes | Instruction should remain attached to its target during movement. |

## Originality comparison

Underlying concept: **9/10**. Real seamark rhythms, time-derived phase, and a bearing-controlled sector experiment have enough substance for repeat visits. The shared-clock implementation derives time from each device clock; it is not evidence of server-synchronized devices or live observations of physical lamps. That precision of wording matters, but does not erase the idea.

Three distinct presentation matches cost one point each. Matches are grouped by the actual repeated design decision, not multiplied for every shared pixel or font property.

| Match | Previous hero | cadencia location | Deduction |
| --- | --- | --- | ---: |
| Edge-to-edge nautical chart with corner identity and a bordered floating annotation containing a named place and small instrument text | `prev-nullius.png` | Hero with named guide target and floating tip | −1 |
| Fine horizontal calibrated instrument with a bright vertical marker, mono readouts, and dim technical labels | `prev-antipoda.png` radio tuner | Selected light's timing strip and its surrounding readouts | −1 |
| Adjacent underlined save/copy text actions underneath the main artifact | `prev-laureate.png` | Selected sheet's "copy link" / "save card" pair | −1 |

**Originality score: 9 − 3 = 6/10.** These are visible resemblances, not claims that code or assets were copied. The nullius deduction concerns the chart-plus-annotation composition, not the existence of a nautical map. The antipoda deduction concerns the instrument arrangement, not darkness or monospace by themselves.

Other visible commonalities were checked and are not independent deductions: nightcap also has a top-left name/tagline, mono secondary labels, a dark canvas, and luminous dots; antipoda shares a dark geographic subject and restrained technical styling; nullius shares map symbols, chart rules, and named locations; laureate and nightcap use expressive serif type. Those broad ingredients either belong to cadencia's established chart-room identity or are ordinary functional conventions. Charging each again would punish cadencia for resembling itself and double-count the matches above. There is no nightcap ghost, laureate medal/material treatment, nullius parchment texture, or antipoda globe/cutaway in cadencia.

The exact banned uppercase outlined rectangular button row is not present. The surviving lowercase segmented dock is still a visual cleanup item, but receives no fabricated originality deduction against a prior hero that does not show the same row.

## Top opportunities

1. Make the 375px sector experiment complete in its first visible state, with the light, vessel, strip, and bearing control all usable.
2. Make the active segment authoritative across the map, sheet, and export, including alternating colors and inferred-data labels.
3. Replace guessed overlay dimensions and timer-driven positioning with measured bounds and coordinated, interruptible motion.
4. Complete the typography and dock pass without changing the established chart-room identity.
5. Make the first named-light selection and first boundary crossing unmistakable, with a short explanation attached to the actual geometry.
