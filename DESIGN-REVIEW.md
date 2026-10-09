# Cadencia confirmation review

Reviewed HEAD: `ed6c44727454c85230c44b04c039ce39292cfa28`.

**69/100. Improved from 65/100. Not confirmed for a flagship portfolio.** The sector interaction has a stronger visual explanation and materially better steering. The remaining weaknesses are in the delivered experience: mobile occlusion, discontinuous sheet changes, premature guide states, and an export flow with unresolved lifecycle and placement problems. The underlying system deserves the attention; the finish does not yet meet the requested bar.

This is a confirmation review, not another implementation round. No application code was changed, no dependencies were installed, and no servers were started.

## Context

Cadencia is an exploratory nautical instrument for curious visitors. Its central task is to connect a light's charted signal with the observer's bearing. The emotional context is quiet discovery, with enough technical explanation to make the discovery meaningful. It should reward a casual first visit without requiring knowledge of IALA notation.

Evidence reviewed: all four supplied review5 screenshots, the supplied recording, all four previous-product heroes, the critique method, taste.md, and the relevant source in App.tsx, components, index.css, geo.ts, lightField.ts, and share.ts. Recording inspection used extracted frames, including quarter-second samples around expansion, rather than live interaction. Haptics, physical touch latency, and browser download behavior were not exercised.

Two evidence qualifications matter:

- `first10.webm` is actually 19.16 seconds long, at 374 × 720 and 25 fps. Its first ten seconds show the opening flight and an invitation waiting for action. Selection and sheet expansion occur later. I inspected that later material too, but do not count it as first-ten-second spectacle.
- HEAD is the commit titled "Rose steer cue on its own line". Its one-line CSS addition makes `.rose .cap .cue` a block with normal font style. The supplied selected screenshots and recording still show the cue inline and italic. The repository HEAD is verified; visual confirmation of that final CSS change is not. I credit the source fix and do not treat the old cue collision as a proven remaining HEAD defect. Its effect on mobile sheet height and map clearance is unverified.

The previous numeric scores are supplied, but previous Cadencia captures are not part of this comparison. Claims of improvement below refer to confirmed implementation and the provided current material, not an invented visual before/after.

## First impressions

The opening reads as a real chart, with geographically meaningful light concentrations and a restrained wordmark. The named Castle Pile action gives the visitor a concrete place to begin. It remains too recessive for a flagship first impression: much of the frame is nearly black, the ring surrounds a cluster that is hard to identify individually, and the guide's secondary action visibly escapes its panel. The selected state is stronger. Its active red sector, vessel, and chart star establish a recognizable interaction. On mobile, the expanded explanation hides the very point that gives that interaction meaning.

## Visual design

| Before, as evidenced | After, required improvement | Why |
| --- | --- | --- |
| `hero.png`: "skip the guide" extends beyond the guide's right border. `.guide-tip .row` is a non-wrapping flex row with two nowrap actions. | Wrap or stack the secondary action within the measured panel width. | The invitation should look deliberate before the visitor trusts the instrument. |
| `mobile-expanded.png`: the guide covers the light's origin and the lower part of the sector fan. | Reserve space for the light, vessel, and connecting sector geometry together; collapse the tip once steering begins. | Keeping only the vessel visible does not preserve the explanation of bearing. |
| `selected.png`: the active red sector has solid rays; neighboring inactive sectors have faint fills and dashed outer arcs without their own solid rays. | Draw subdued solid rays at every sector boundary and strengthen the active pair. | A visitor needs to see the boundary they are about to cross. |
| `hero.png`: some dense coasts and waterways still form luminous threads, while isolated points are very faint. | Tune overlap handling separately from isolated-light visibility. | Global halo damping cannot simultaneously resolve stacked points and reveal sparse ones. |
| Selected desktop and mobile sheets repeat bearing and notation in the rose, main line, and descriptive note. | Keep the signal reading prominent; show secondary metadata and repeated notation only when needed. | The current hierarchy spends scarce space explaining the same state twice. |
| The guide dismissal, sector badge, and rose detail use very small, low-contrast text. | Increase contrast for actionable text and reserve the faintest treatment for nonessential chart decoration. | Secondary actions still need to be discoverable. |

Color has a purpose: magenta marks selection and instruments, red/green/white encode signals, and the dark blue base supports the chart. The three font families have distinct jobs. I would preserve them. Thin rules mostly organize the sheet well, and the timing scale no longer collides with metadata. The ship and chart star are more distinctive than another icon toolbar. The problem is the allocation of space and contrast, not a need for a new identity.

## Interface design

We are missing an opportunity to make selection read as one coherent event. The recording around 12–13 seconds shows the sheet first presenting Castle Pile's primary `Fl G 5s` signal and a "read" instruction, then changing to `Al RW 6s 17m 11M` and "steer" when the vessel arrives. The code explains the change: selection mounts the sheet before the vessel spawns, and the guide treats a temporarily absent vessel as a non-sector light. Prepare the observer state before showing the final reading, or explicitly represent the short preparation state.

We are missing an opportunity to preserve the lesson while the sheet expands. The later recording frames show the rising sheet behind the still-positioned guide before the guide redocks. The expanded still then conceals the light origin. A measured sheet height alone is insufficient: camera, guide, fan origin, and vessel need a common reserved area.

We are missing an opportunity to make sharing a dependable conclusion. Preview-first is present, but the preview is still a descendant of the sheet. Desktop `.sheet` has a transform; all sheets declare `will-change: transform`, and mobile sheets scroll. A fixed child is therefore not reliably a viewport-level overlay just because its CSS says `position: fixed`. Its `bottom` value is calculated in viewport coordinates. This is a source-established placement risk, not a visually tested export failure. In addition, share.ts revokes the blob URL after 60 seconds even while the save action remains available.

## Consistency and conventions

The banned row of outlined uppercase monospace rectangular buttons is **absent**. The footer is a continuous instrument dock with lowercase labels and separators. Sheet actions are lowercase text links with bottom rules. The outlined "sectored" label is a badge, not a button. Neither should be misclassified as the banned pattern.

The rose and vessel both accept arrow keys, and the rose preserves its grab offset. The signals menu now returns focus to its trigger on Escape and stops the dismissal from reaching the underlying selection. These are real improvements.

Sheet and text transitions are less consistent. Counts use NumberFlow, while bearing digits and action labels swap directly. Notation and prose use keyed whole-element fades. Re-keying the bearing sentence on every change can repeatedly restart its opacity animation during steering. This does not meet the taste requirement that stable text stay put while only changing content morphs.

## User context

The visitor can now understand what to try without deciphering a generic map. Castle Pile is named, clickable, and associated with a visible ring. That helps curiosity turn into action. But the expanded mobile view asks the visitor to infer an origin hidden behind instructional copy. The most useful care here would be to keep the light, vessel, and boundary visible at every detent, then shorten the explanation after the first successful crossing.

The product accurately labels inferred rhythm as "approx" in the sheet. That qualification deserves the same consistency outside charted sectors: the note says the light would not help, while `activeLight` and export fall back to the primary light. A recorded observer state should not quietly become a different signal when there is no active sector.

## Confirmation of the requested fixes

| Claim | Finding at reviewed HEAD | Evidence and limit |
| --- | --- | --- |
| Geographic steering end-to-end, including refits | **Partial.** Rose and arrow keys are geographic and preserve distance. Refits are not constant-distance orbits. | App.tsx `steerVesselTo`, line 569, uses haversineKm and destPoint. `refitVessel`, lines 659–688, chooses a projected screen candidate and linearly interpolates latitude and longitude. Direct vessel drag intentionally follows the pointer through unproject. The broad "end-to-end" claim overstates what landed. |
| Solid boundary rays at every sector edge | **Partial.** Both edges of the active sector are solid. Inactive sectors do not receive boundary rays. | App.tsx line 416 gates the rays on `isActive`; selected and mobile screenshots agree. This is a visible improvement over a fill alone, not completion of "each sector edge." |
| Spawn just inside the widest sector edge | **Landed as a preference, not a geographic invariant.** | App.tsx line 311 uses end minus min of 5 degrees and 22 percent of width, with fallback candidates. Candidate positions use screen-angle sin/cos, then test geographic sector membership. The screenshots show the vessel beside the active boundary at about 353 degrees. |
| Vessel refit glides for 380ms | **Landed in code, with limits.** | App.tsx lines 676–688 implement a cubic ease over lat/lon. Bearing, active signal, and palette are applied only at the end, so a refit crossing can temporarily show stale signal state. The recording does not isolate this glide sufficiently to certify its feel. |
| Finger-tracked grip, velocity-aware detents, haptic at each crossing, single pointer ownership | **Partial.** Continuous transform, release velocity, directional thresholds, capture, and pointer ID checks landed. | LightCard.tsx lines 79–141. Haptics occur on tap or release when the selected detent changes, not as each threshold is crossed during movement. Up, cancel, and lost capture end the gesture; leaving the hit area is handled through capture. `setPeek` instantly adds/removes rows before transform settle, so height continuity is not solved. The end callback also has both a transition listener and an uncancelled timeout. |
| Timing labels separated; verdict immediately below notation | **Landed, with responsive qualification.** | Separate verdict and SVG rows in LightCard.tsx; all selected stills show clear separation from metadata. Desktop puts the verdict directly below notation. Mobile puts it below the combined title/rose row, with substantial intervening height. |
| Preview before download, explicit save/dismiss, active sector and bearing on card | **Core flow landed in code; complete presentation not confirmed.** | share.ts returns URL/filename; LightCard.tsx downloads only from "save png". App passes the seen light and bearing; share.ts highlights the matching sector of that light. No supplied preview or exported card proves the rendering. The transformed ancestor and 60-second URL expiry remain. Outside-sector fallback also records the primary signal. |
| Guide waits for its own action; ring visible from step 0; honest crossing copy | **Mostly landed.** | Guide.tsx has no incidental global advance; the ring renders for step 0 and the primary action selects the target. It also advances when any light is selected, not exclusively its named action. Crossing text refers to color and boundary. Recording confirms it waits through the first ten seconds. Temporary "read" before "steer" remains. |
| Escape restores signals-trigger focus | **Landed in code.** | Hud.tsx focuses `.prefs-wrap > button` and stops propagation on Escape. No keyboard recording was supplied. |
| Stronger low-zoom halo damping | **Landed; visual outcome only partly resolved.** | lightField.ts uses smoothstep over zoom 3.5–10, a 0.25 halo floor, and 0.62 overall intensity floor. Individual cores survive in much of the hero, but bright merged threads remain in dense areas. |
| Final rose cue separation | **Landed in code; screenshot mismatch.** | HEAD adds `.rose .cap .cue` at index.css line 262. The provided pixels do not show it. Credit the implementation without inventing visual verification. |

## Scores and the changes needed to reach 8

Scores describe the delivered evidence, with source credit where appropriate. They are not a feature count or a promise about unobserved interaction quality. Each sub-8 axis has exactly three concrete changes below.

| Axis | Previous | Now | Judgment and three changes where required |
| --- | ---: | ---: | --- |
| First impression | 7 | **7** | A credible instrument with a weak opening hierarchy. 1. Keep both guide actions inside the panel at every width. 2. Add a small readable target label beside the Castle Pile ring so it resolves to one place within the cluster. 3. Make a few isolated light cores readable during the opening flight without raising the whole coastline's bloom. |
| Signature moment | 7 | **8** | Real bearing controls a charted signal, active fan, notation, and map palette. Solid active rays and near-edge spawn make the causal idea legible. This earns 8 for the demonstrated design and implementation, not a claim of physically tested haptics or perfect motion. |
| Feel of direct manipulation | 6 | **7** | The rose orbit and grab offsets are substantial improvements. 1. Preserve rendered sheet position when changing detents, including changing content height. 2. Make refits use the same geographic orbit and update the active signal throughout movement. 3. Cancel refits when rose or keyboard steering begins, so automatic movement cannot overwrite deliberate input. |
| Spectacle | 7 | **7** | The illuminated coastlines have scale; the active fan is still small and visually fragile. 1. Separate dense overlapping light cores instead of relying only on global dimming. 2. Draw all boundary rays with a clear active/inactive hierarchy. 3. Compose the selected camera around the complete light-to-vessel geometry so its most expressive element stays visible on mobile. |
| Motion quality | 6 | **7** | Opening camera movement and pointer tracking have intention; state handoffs remain discontinuous. 1. Remove the temporary primary-signal and "read" state before observer spawn. 2. Coordinate sheet, guide, and camera through a single interruptible expansion transition. 3. Keep stable text mounted and transition only changing notation, bearing, and action fragments. |
| Micro-interactions | 6 | **7** | Focus restoration, press styles, and explicit save are present. 1. Emit one haptic per actual detent threshold transition, with reversal handling. 2. Keep the share URL valid until replacement, dismissal, or unmount. 3. Give the share preview its own focus entry and Escape return path instead of allowing Escape to dismiss the underlying selection. |
| First-run guidance | 6 | **7** | A real named destination and action-gated opening are stronger. 1. Fit the action row within the guide. 2. Treat vessel preparation as a separate state rather than briefly claiming a non-sector reading. 3. Collapse or relocate the steering tip so it never hides the light origin or boundary being taught. |
| Typography and layout | 6 | **6** | The type roles are sound and the strip collision is fixed; guide overflow, low-contrast small text, and redundant readings still reduce clarity. The final cue CSS earns code credit but has no matching capture. 1. Make the mobile title/rose grid compact after the cue wraps, keeping the verdict close to notation. 2. Increase actionable secondary-text contrast and provide room for wrapping. 3. Remove repeated notation from the bearing prose and tuck range/height behind expansion. |
| Originality versus stock | 7 | **7** | Concept baseline 9 minus two concrete previous-product matches, detailed below. 1. Make the observer crossing the dominant composition rather than a small overlay on the familiar map hero. 2. Give the timing strip a visibly nautical signal-reading treatment distinct from Antipoda's horizontal tuning instrument. 3. Make the exported result an observer's bearing record with the actual sector context, rather than principally a name-and-notation card. |
| Mobile | 5 | **6** | Peek and expanded states exist and retain the vessel, but expanded guidance hides the light and the transition briefly overlaps the sheet. 1. Solve the entire light/vessel/guide/sheet layout at both detents and through the transition. 2. Shorten the peek header and metadata so the rhythm stays close to the name while preserving touch targets. 3. Put export preview in a viewport-level layer, constrain it to the remaining space, and verify save/dismiss with the sheet expanded. |

Total: **69/100**, an increase of **4 points**. No rounding or weighting is applied.

## Taste.md rule audit

These are the evidenced breaks, with location and fix. Repeated symptoms are grouped rather than counted as separate rules.

| Rule | Place and break | Fix |
| --- | --- | --- |
| 1. One thing at a time | Expanded mobile shows the guide, two steering interfaces, notation, verdict, coordinates, timing, range, height, repeated bearing prose, and sharing. The guide remains visually dominant over the active lesson. | During the lesson, prioritize the visible crossing and a short reading. Collapse instructional copy after engagement; defer secondary facts. |
| 2. Nothing teleports | LightCard changes row display immediately at detent release. Guide copy changes from read to steer after vessel creation. Keyed `.val` fades replace complete text; action labels and bearing values swap. | Preserve geometry across sheet state changes and coordinate the guide's movement. Morph only changed text fragments. Settle selection on its intended observer state before revealing the final reading. |
| 3. Context survives | The expanded mobile guide hides the selected light origin. The share preview is nested beneath a transformed sheet despite viewport-based positioning. | Reserve the whole interaction geometry, not just the vessel's hit box. Portal the preview into a viewport-level layer that retains the selected chart context. |
| 5. Touch has feedback | Grip movement has no detent-crossing feedback; LightCard only nudges after release or tap. Rose press only changes cursor, which does not provide a touch-visible acknowledgement. | Track detent crossings during movement with one nudge per change. Give rose pickup an immediate visible needle/rim response without adding latency to the bearing. |
| 6. Same polish everywhere | The recording's loading subtitle extends beyond the narrow viewport. The guide action row overflows. Export has no supplied visual verification and its source has an expiring live save URL and ancestor-positioning problem. | Constrain loading copy with responsive padding and wrapping; contain guide actions; give export the same layout and lifecycle care as the chart. |
| 7. Small, sharp parts, including correct reduced motion | Field calm mode and the strip's reduced-motion flag are sampled at initialization. They do not subscribe to preference changes while the page stays open, while CSS does respond. This produces inconsistent reduced-motion behavior across the same interface. | Use a shared live media-query subscription for the field, strip, and camera behavior. Keep the existing restrained reduced-motion rendering. No additional animation library is required. |

Rule 4, "Spend delight on the curve," is not a confirmed violation. The geographic first-run reveal, crossing pulse, optional sound, and share record allocate special treatment to meaningful events. Their execution has shortcomings covered above; lack of confetti is not a defect. Sound is off by default and haptics can be disabled. Dependencies are few and relevant; their mere presence is not a rule-7 violation.

The related "text morphs too" instruction is broken in the changing labels described under rule 2. The drag-spring preference is not met by the duration-based sheet settle, and the popover enters by translation rather than growing from its trigger. These are craft gaps, not reasons to delay true signal changes or soften the factual flashing rhythm.

## Originality comparison

The underlying idea starts at **9/10**: real tagged nautical rhythms on a common clock, with an observer changing the visible signal, is a substantive interactive system. The following two distinct compositional matches cost one point each. Related parts of the same match are not charged repeatedly.

| Previous hero | Concrete resemblance | Deduction |
| --- | --- | ---: |
| Nullius | An edge-to-edge nautical map is the main composition, with a compact upper-left identity, small floating chart annotations, hairline panel boundaries, and peripheral instrument information. Cadencia's real lights and dark palette differ, but the map-plus-floating-chart-entry arrangement recurs. | -1 |
| Antipoda | A geographic phenomenon is presented as a dark precision instrument, paired with fine tick marks and a horizontal moving indicator. Cadencia's timing strip and technical readouts reuse that instrument arrangement at a smaller scale. The rhythm and bearing interaction remain its own. | -1 |

**Originality score: 9 - 2 = 7.**

Nightcap has no additional distinctive match: its rounded indigo drink cards, ghost, vertical daily schedule, and whimsical display wordmark are absent. A dark background and small monospace readouts alone do not constitute another composition. Laureate has no additional distinctive match: its paper diploma, medal, wax seal, centered serif title, and ceremonial material treatment are absent. Saving a card is a common capability, not a copied hero element.

Across the four references, serif text, monospace numbers, thin rules, and restrained backgrounds recur at the level of general visual vocabulary. Those are not separately penalized. Cadencia retains its own established magenta selection, Morse lockup, chart star, signal colors, and chart-room font roles. The originality deduction is for the two compositional matches above, never for resembling earlier Cadencia.

## Top opportunities

1. Make mobile expansion preserve the visible light-to-vessel relationship through the entire gesture.
2. Finish the geographic steering claim by unifying refit geometry, cancellation, and live signal updates.
3. Make initial selection a single understandable handoff instead of briefly showing a different signal and instruction.
4. Finish sharing as a viewport-level, focus-aware preview whose save action remains valid.
5. Contain the guide actions and obtain captures that actually show the final rose-cue CSS.

The confirmed gains are specific: geographic rose/key steering, near-boundary spawn, active rays, separated timing rows, preview-first sharing, and signals-menu focus restoration. They lift this to 69. The unresolved interaction continuity and mobile composition prevent flagship confirmation.
