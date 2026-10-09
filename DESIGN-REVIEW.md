# Cadencia design review

Reviewed HEAD: `7c24be1959823804939be2da70b2b962fd575b57`.

**65/100. Improved from 61, but not ready for a flagship portfolio.** The field has the strongest visual presence. The signature interaction still loses its subject on mobile, and several motion fixes add event handling without resolving the visible behavior.

## Context

Cadencia is an exploratory nautical instrument for curious visitors, with enough technical detail for people who know light notation. Its primary task is to turn a field of lights into an understandable relationship between rhythm, bearing, and color. The emotional context is patient discovery, but a first-time visitor still needs a clear invitation to act.

Evidence: all four supplied current screenshots, all four previous-product heroes, and locally extracted frames from `first10.webm`, sampled at one-second intervals across its 13.8 seconds and at five frames per second for its first four seconds. The recording is 1440 × 900 at 25 fps. Frame inspection establishes sequence and composition, not frame-perfect smoothness. It contains no demonstrated vessel drag, sector crossing, or sheet gesture. Those findings below are code-based, not claims of hands-on testing. No server was started, no dependencies were installed, and no application source was changed. The inspected source matches the reviewed HEAD.

I read the supplied taste rules and Interface Craft critique method, then inspected `src/App.tsx`, all three components, `src/index.css`, `src/lib/lightField.ts`, `src/lib/share.ts`, and relevant clock and notation code. References below are repository-relative.

## First impressions

The luminous European coast is compelling, especially the dense continental waterways against the nearly black sea. The restrained wordmark leaves the map in charge. But the supplied hero is a regional view, not a world overview, and its brightest region competes with the guide near the Solent. The first-run card offers only "skip the guide" as an immediate action. Through the first ten seconds, the recording remains on "the field" after the camera settles. I understand that the lights represent something real before I understand what I should do with them. This is an attractive instrument with an under-directed entrance.

## Visual design

- The map's brightest areas overwhelm individual signals. In `hero.png` and `selected.png`, continental waterways merge into nearly white threads. The additive blend in `lightField.ts` explains the accumulation. Reduce halo contribution with density or zoom so the geography remains luminous without erasing the individual rhythms.
- The mobile rose is vertically expensive. At the supplied 375 × 700 CSS-pixel viewport, the peek sheet occupies approximately 309 px above the 40 px dock. Its rose gets a separate full-width row of about 125 px. Put the compact rose beside the name and notation; preserve the timing strip across the width.
- Mobile selection has lost its focal point. In `mobile-375.png`, the vessel sits immediately above the guide, and the selected light is not clearly exposed. In `mobile-expanded.png`, the vessel is clipped at the top edge. The guide occupies roughly y=64–190 while the expanded sheet begins near y=226. A map visible behind overlays is not enough if the thing being manipulated is outside usable space.
- The type roles are coherent. Space Grotesk handles instructions, Instrument Serif names the light, and IBM Plex Mono carries measurements. The larger metadata is a real improvement. However, `index.css:147` reduces the smallest dock to 9.8 px, the rose caption remains faint with 0.14em tracking, and the strip endpoints remain 10 px. Reduce tracking and prioritize readable operational labels over decorative spacing.
- The desktop sheet's pale title, magenta notation, fine separators, and underlined actions form a clear hierarchy. Keep that language. Its rose still looks more like an output gauge than a control because nothing visible says it can be dragged.
- Stroke and icon use are mostly disciplined. The magenta selection star, dashed bearing leader, and sector arcs have distinct jobs. The ship silhouette is too small relative to the surrounding guide card to lead the interaction, despite its larger invisible hit area.

## Interface design

We are missing an opportunity to demonstrate the product in the opening ten seconds. Step zero waits for any pointer press or twelve seconds. Replace that ambiguous progression with an explicit "Read Castle Pile" action while keeping the field explorable.

We are missing an opportunity to teach cause and effect in one place. The user must connect a tiny moving vessel, a distant light, a small rose, a magenta notation, and a timing strip. Put a concise active-sector label beside the vessel or selected light, and visually acknowledge the exact boundary that changed it.

We are missing an opportunity to preserve uncertainty honestly. Both selected screenshots show `Al RW 6s` with a 12-second strip; the expanded metadata explains the longer alternating cycle, but peek hides that explanation. The vessel note says "shows red" even though the active rhythm alternates red and white. `App.tsx:781–787` uses a sector's static color for this prose. Say "red/white alternating sector" and explain the complete cycle beside the strip, including "approx" when appropriate.

We are missing an opportunity to make sharing a designed moment. The export now records the active light and bearing, but the visible interaction still ends with a swapped button label. Offer a small preview of the actual chart card and a precise completion state. `share.ts:163–170` confirms that a download was initiated, not that a file was saved to disk.

## Consistency and conventions

The sheet grip is a directional toggle implemented with pointer events, not a sheet that follows the hand. `LightCard.tsx:75–91` stores displacement and applies the state on release; `.peekable` then changes to `display:none`. There is no dragged translation, velocity settling, or detent haptic. That gap matters more than the nominal 38 px hit zone.

The vessel itself now retains the grab offset and captures the pointer. The rose still steers immediately to the pressed angle and accepts pointer moves based on `e.buttons`, without an active pointer identifier. The grip also lacks pointer identity protection. These two controls do not yet have the same gesture quality as the vessel.

The signals popover closes on outside press and Escape, but its menu semantics are incomplete. `Hud.tsx` does not move focus into the menu, implement menu arrow navigation, or return focus deliberately. Escape also reaches the app's global handler and can deselect a light while closing preferences. Make Escape dismiss only the topmost open layer.

The banned row of outlined uppercase monospace rectangular buttons is absent. Sheet actions and loading retry use a bottom underline; guide actions are underlined; settings are stacked lowercase rows. The persistent dock still has rectangular cells and separator rules, but it is not the banned component. Uppercase About headings and loading text are not buttons. No penalty for this rule.

## User context

A casually curious visitor should feel that the sea is understandable after one small experiment. Desktop gets close. Mobile currently asks the visitor to infer the location of the subject through a guide and a large sheet. Uncommon care here means keeping the light, ship, and one traversable sector boundary visible together, even when the sheet changes height. It also means explaining reconstructed rhythms without forcing a visit to About.

The UTC claim needs precise wording. `lightField.ts` derives time from the local device clock plus elapsed monotonic time; the strip reads `Date.now()`. This gives a common UTC phase convention, not verified synchronization between devices or synchronization with physical lights. Keep the shared-sea idea, but avoid implying measured live lighthouse phase.

## Scores and three changes for every axis below eight

Scores are integer judgments of the submitted result, not feature-completion percentages. The prior score column comes from the supplied review.

| Axis | Prior | Now | Reason |
| --- | ---: | ---: | --- |
| first impression | 7 | 7 | Strong field, weak invitation to begin. |
| signature moment | 7 | 7 | Real bearing-dependent signal; the presentation still separates cause and effect. |
| feel of direct manipulation | 6 | 6 | Better vessel pickup, but the sheet and rose lag behind that standard. |
| spectacle | 8 | 8 | Real geography made visible through rhythmic light is worth watching. |
| motion quality | 5 | 6 | Better entry and camera tracking; discontinuous sheet changes remain. |
| micro-interactions | 6 | 7 | Active-sector export and missing-link feedback improve completeness. |
| first-run guidance | 6 | 6 | Exact target button helps; the first lesson still waits and mobile obstructs the task. |
| typography and layout | 6 | 7 | Better metadata sizes and actions; mobile hierarchy still consumes too much map. |
| originality versus stock | 6 | 6 | Concept baseline nine minus three specific cross-product matches below. |
| mobile | 4 | 5 | Essential readouts are restored, but expanded framing still clips the vessel. |

First impression, 7:

1. Give step zero a visible "Read Castle Pile" action that leads directly to the named target.
2. Settle the opening camera with the target in a clearly usable area, and visually distinguish it from the much brighter continental clusters.
3. Replace the long first card with one sentence explaining reconstructed chart rhythms and one sentence inviting the experiment.

Signature moment, 7:

1. Frame the light, vessel, and a meaningful sector boundary together before asking the user to steer.
2. Briefly emphasize the crossed boundary and show the new sector name at the point of manipulation; leave the physical flash timing unchanged.
3. Make notation, map dot, timing strip, and observer prose describe the same active signal, including alternating colors and the full cycle.

Feel of direct manipulation, 6:

1. Make the sheet track vertical finger displacement and settle to peek or expanded using distance and velocity, with a detent haptic.
2. Give rose dragging a retained angular grab offset and a single active pointer; protect the sheet gesture from secondary pointers too.
3. Keep the whole working vessel orbit inside the unobscured map after a sheet resize, rather than checking only the initial spawn point.

Motion quality, 6:

1. Remove positional easing from camera-following guide anchors. Follow projected coordinates directly; animate only deliberate step changes.
2. Coordinate sheet height, camera framing, and vessel visibility in one interruptible transition instead of switching `display` and immediately setting padding.
3. Finish reduced-motion handling for preferences, vessel transforms, and exit translations, and respond when the OS preference changes during a session.

Micro-interactions, 7:

1. Keep share-action widths stable, morph their status text, and show an actual export preview; call the download state "download started" unless completion is known.
2. Give settings presses immediate visual feedback and make focus and Escape obey the topmost-layer rule.
3. Route failed-link and failed-data messages through one error surface with a useful retry or recovery action, so simultaneous errors cannot overlap in the same position.

First-run guidance, 6:

1. Replace the global pointerdown/timer progression with a deliberate primary action, while allowing the matching real map action to advance the guide.
2. On mobile, shrink "steer" into a short instruction in reserved space and fit the target and vessel into the remaining map area.
3. Keep the crossed-sector confirmation anchored to the boundary and explain the observed change without claiming every color change means leaving safe water.

Typography and layout, 7:

1. Hold mobile operational labels at a readable size instead of dropping dock text to 9.8 px; shorten or disclose secondary navigation as needed.
2. Put the compact rose beside the mobile title and notation, with a visible "drag to steer" cue, instead of allocating an entire row.
3. Keep "approx" and the full alternating-cycle duration visible next to the strip; reduce repeated notation and decorative tracking in metadata.

Originality versus stock, 6:

1. Evolve the Nullius-like chart-plus-callout composition into an observer-centered chart annotation with a bearing leader and information placed around the selected light.
2. Give the rhythm display a light-specific visual grammar, such as explicitly joined red/white cycle segments and eclipses, instead of relying mainly on a familiar instrument ruler.
3. Replace the repeated save-card/copy-link action pair with one chart-specific "Record this bearing" entry that reveals the export preview and sharing choices.

Mobile, 5:

1. Reduce peek height by placing the rose alongside primary text, while keeping the strip and uncertainty cue visible.
2. Fit both light and vessel against measured sheet, wordmark, and guide bounds on every relevant layout change; the ship must remain fully on screen when expanded.
3. Implement a continuously draggable sheet with velocity-based settling, single-pointer ownership, detent feedback, and bottom safe-area accommodation.

## Verification of the requested fixes

"Landed in code" means the path exists at this HEAD. It does not certify a gesture or export that was not captured.

| Requested fix | Result | Evidence and remaining limit |
| --- | --- | --- |
| Timing strip visible in mobile peek | Landed, visible | `mobile-375.png`; strip is outside `.peekable`. |
| Compact rose visible in peek | Landed, visible | It is visible, but still occupies a separate tall row. No special inline peek layout exists. |
| 38 px grip zone | Landed in code | `index.css:270–273`. |
| Down collapses, up expands, tap toggles | Landed as release-time behavior | `LightCard.tsx:75–91`; no continuous movement or physical detent. |
| Enter and Space toggle grip | Landed in code | Grip key handler prevents default and toggles peek. |
| Mobile guide pinned under wordmark | Landed, visible | `Guide.tsx` fixes top at 64 px. The claimed avoidance of the vessel path is not achieved in the screenshots. |
| Sound and haptics merged into signals | Landed | `Hud.tsx:78–99`, four action cells remain in dock. |
| Vertical-only mobile sheet entry | Landed in code | `sheet-in-y` and mobile exit transform in `index.css:257–260`. |
| Guide tracks camera move events | Landed, incomplete result | `App.tsx:665–668` binds move and retains 350 ms polling. `.guide-tip` still eases left/top over 300 ms, introducing visual lag. Vessel-only motion still relies on polling for guide position. |
| Reduced motion disables sheet/tray keyframes | Landed, narrowly | `index.css:402–406`. Preferences still run `prefs-in`; exits retain positional transforms over 80 ms. |
| ResizeObserver reports real sheet height | Landed, incomplete result | `LightCard.tsx:65–72`, `App.tsx:837–840`. Padding changes immediately, without fitting the light/vessel pair. The expanded capture clips the ship. |
| Selected dot uses active sub-light palette | Landed in shader | `u_selCols`, `uploadActive`, and per-segment color decoding in `lightField.ts`; forced color is bypassed when the active sequence exists. Alternating playback was not demonstrated in the supplied recording. |
| Vessel retains grab offset | Landed in code | `App.tsx:559–589` retains the pointer's offset and moves only on pointermove. |
| Grabbed vessel scales and glows | Landed in code | `.vessel.grabbed .ship` scales to 1.28 and adds a magenta shadow. |
| Secondary pointers ignored | Mostly landed for vessel | Vessel guards pointerdown and pointermove by ID. Its up/cancel handlers do not check ID. Rose and grip still lack equivalent ownership. |
| Larger text and reduced tracking | Landed in stated selectors | Sub/meta 12 px, actions/note 12.5 px, rose/guide labels 10.5 px. Dock still drops to 9.8 px; captions retain wide tracking. |
| Guide waits for point data | Landed as a gate | `guideOn && ready && inView > 0`. The recording still briefly shows the guide before the luminous field is clearly established; the gate is not a visual-ready guarantee. |
| Ring is a button selecting exact target | Landed in code | `Guide.tsx` calls `onTargetClick`; App selects `guideTargetRef.current`. Target resolution itself is proximity-based, rather than an immutable OSM ID lookup. |
| Wheel no longer skips step zero; 12 s timer | Landed in code | `Guide.tsx:29–40`; any pointerdown still advances, regardless of intent. |
| Shorter steer copy | Landed, visible | "Drag the vessel — the color changes at each sector arc." |
| Spawn avoids guide, sheet, error rectangles | Partial | `blockedRects` and candidate checks exist in `App.tsx:518–543`. Final clamp fallback does not recheck blocked rectangles; subsequent camera/layout changes do not maintain clearance. |
| PNG records active sector and bearing | Landed in code | `App.tsx:773` passes active light and bearing; `share.ts:70–82` draws bearing tick. No exported PNG was supplied for visual verification. Outside all sectors, the call falls back to the primary light. |
| Missing deep link shows dismissible note at 15 s | Landed after map load | Timer and `linkMiss` alert exist. It is fifteen seconds after map load, not necessarily after navigation. No failure-state capture supplied. |
| Underlined sheet actions; no banned buttons anywhere | Pass for inspected app UI | All authored button sites and CSS checked, including loading, guide, error, About, settings, and dock. No outlined uppercase monospace button row remains. |

## Taste-rule violations

These are the seven numbered product rules in the supplied `taste.md`. A rule can be partly satisfied and still have a specific violation. The requested libraries and methodologies are means, not reasons to add dependencies to an otherwise working design.

| Rule | Place and violation | Fix |
| --- | --- | --- |
| 1. One thing at a time | Mobile selection stacks guide, sheet, separate rose row, and dock while the selected subject becomes hard to see. | Give steering one usable workspace; keep secondary metadata collapsed and place compact instruments beside the primary readout. |
| 2. Nothing teleports | `.peekable` switches display; notation, bearing captions, guide copy, and share statuses replace text directly. NumberFlow only covers dock counts. | Make sheet transitions continuous; morph changing status text and preserve unchanged notation. Do not delay or soften the real signal's flashes. |
| 3. Context survives | Expanded mobile clips the vessel despite retaining the map behind the sheet. | Fit the selected light and observer inside measured unobstructed bounds after every sheet/guide change. |
| 4. Spend delight on the curve | First run spends its opening interval on explanatory text; sharing ends in a plain label swap. | Let the first action demonstrate a sector crossing; reveal a small bearing-specific export preview at sharing time. |
| 5. Touch has feedback | Sheet snap has no haptic callback; preference buttons have hover styling but no explicit pressed state while the pointer is held. | Trigger a restrained haptic at the detent and add immediate pressed feedback to settings rows. Preserve muted-by-default sound and the existing haptic preference. |
| 6. Same polish everywhere | Both error trays use the same fixed bottom placement and can coexist; settings lack the sheet's interaction care. | Use one prioritized, dismissible error surface and complete settings focus/keyboard behavior. No separate 404 artifact was supplied, so no invented 404 failure is charged. |
| 7. Small, sharp parts | Reduced-motion handling omits preferences and retains some translated exits. Motion preferences are read once in the field/card. | Apply a shared reactive preference to every animated surface and preserve a calm, legible rhythm explanation. No dependency-bloat violation established. |

Additional craft prescriptions from the same file are also only partly met: preferences enter with a vertical keyframe rather than a trigger-origin expansion; sheet entry uses a 380 ms keyframe while its resize behavior is discontinuous; the dragged sheet has no spring settling. These support rules 2, 3, and 7 above rather than creating extra numbered rules.

| Before | After | Why |
| --- | --- | --- |
| Guide receives fresh coordinates but eases left/top for 300 ms | Direct camera tracking; animate step transitions separately | Prevent the annotation from trailing its target. |
| Grip records movement, sheet changes after release | Finger-following transform and interruptible settling | Make the visible response match the drag affordance. |
| ResizeObserver immediately sets bottom padding | Coordinated layout transition with light/vessel fitting | Keep the subject visible as available map space changes. |
| Preferences keyframe runs under reduced motion | Static or opacity-only entry respecting the current preference | Extend the motion contract to settings. |

## Originality comparison

Baseline for the underlying concept is **9/10**. Real tagged signals, a UTC phase convention, and observer-bearing changes form a substantial system with repeat value. Applying the requested one-point-per-match rule produces **9 − 3 = 6/10**. Each row below is one distinct compositional/component match, counted once even when it contains several related details.

| Previous hero | Concrete match in cadencia | Cost |
| --- | --- | ---: |
| Nullius | Full-viewport nautical geography, a small upper-left identity, and a fine-ruled floating explanatory annotation over the chart. Compare Nullius's "entered in the chart" card with cadencia's guide card. The palette and actual map content are different. | −1 |
| Antipoda | A thin horizontal instrument ruler with ticks and a bright narrow cursor below a changing technical readout. Compare its radio band with cadencia's timing strip. Their meanings differ, but the component silhouette is familiar within this portfolio. | −1 |
| Laureate | The compact post-result export/copy cluster beneath a serif-named artifact. Cadencia's "copy link / save card" repeats the action pairing visible beneath Laureate's diploma, now with text-link treatment. No medal, paper, or ceremonial styling is repeated. | −1 |

Nightcap has no distinct copied composition or component at this threshold. Its dark palette, mixed type roles, and dashed relationships are broad techniques, not evidence that cadencia repeats its shelf, day grid, ghost, or drag tokens. Likewise, shared darkness with Antipoda, serif usage with Laureate, and chart conventions with Nullius do not each incur additional points. Counting every generic color, line, or font category would charge the same visual language repeatedly.

Cadencia's abyss palette, magenta chart star, bearing rose, rhythmic light field, and existing wordmark are retained as its own identity. No deduction for resembling earlier cadencia work. The banned button row is absent and costs zero points.

## Top opportunities

1. Keep the light, vessel, and sector boundary visible together in both mobile sheet states; the supplied expanded screenshot fails this core condition.
2. Make the sheet follow the hand and settle with feedback, then coordinate its motion with camera framing.
3. Turn the opening guide into one explicit action that reaches Castle Pile within the first ten seconds.
4. Unify active-sector notation, alternating-color prose, timing, and uncertainty so the instrument teaches one consistent signal.
5. Finish the small surfaces: settings focus, reduced motion, error coexistence, and share confirmation.

The score rises because several concrete regressions were addressed. A flagship recommendation still depends on the signature interaction remaining legible and controllable on the smallest supplied viewport, demonstrated through an actual crossing and sheet gesture rather than inferred from code.
