# cadencia engineering review

Reviewed the current working-tree versions of `src/App.tsx`, all components and libraries, `src/iala.ts`, the supporting styles, and README. No generated `public/lights/*.json` or `pipeline/cache*` contents were reviewed. Browser checks intercepted the basemap and light requests with synthetic fixtures. Findings about parser inputs do not establish their frequency in production data.

No P0 findings. P1 findings block release; P2 findings are narrower defects.

1. **P1: Reduced motion prevents the vessel from spawning.** `src/App.tsx:407`, `src/App.tsx:417`. `jumpTo()` finishes and emits `moveend` before the one-shot listener is registered. When `moving` is true, selecting a sectored light leaves the rose without a vessel until another map movement occurs. Reproduced in Chromium: the same selection produced zero vessels with reduced motion and one without it.
   Fix: Spawn immediately after `jumpTo()`; for animated movement, register a cancellable completion listener before starting the camera transition.

2. **P1: Closing one light can erase the next selection.** `src/App.tsx:382`, `src/App.tsx:398`. The unconditional 300 ms close timeout survives a new selection. Closing A and immediately selecting B clears B's React state while the field selection and camera still refer to B. Reproduced in Chromium: the new sheet disappeared after the timeout.
   Fix: Keep the close timer in a ref, cancel it on selection and unmount, and only clear the selection that initiated the close.

3. **P1: The selected light's field rhythm does not follow its active sector.** `src/App.tsx:355`, `src/App.tsx:368`, `src/App.tsx:694`, `src/lib/lightField.ts:227`, `src/lib/lightField.ts:76`. The card switches to the matching sub-light, but the GPU always uses `p.light` and overrides only its color. With a white 10-second sub-light and a red 4-second sub-light, the red bearing displays a 4-second card alongside a 10-second map signal. Outside every sector, clearing the override restores the primary signal instead of suppressing it. This contradicts the coordinated sector behavior promised at `README.md:30`.
   Fix: Pass the active sub-light and an explicit outside-sector state to the renderer, updating both its timing and visibility.

4. **P1: WebGL context restoration leaves the entire light field broken.** `src/lib/lightField.ts:148`, `src/lib/lightField.ts:312`. GPU objects are created only in `onAdd`; there is no context-restoration handler. MapLibre restores its own painter without recreating this custom layer's resources. Reproduced using `WEBGL_lose_context`: after restoration, `isContextLost()` was false but `isProgram(field.prog)` was false, and rendering still used that invalid program.
   Fix: Handle context loss/restoration by recreating the program, buffers, VAO and texture, restoring selections, and unregistering those handlers on removal.

5. **P1: Keyboard and screen-reader users cannot select a light.** `src/App.tsx:184`, `src/App.tsx:624`, `src/App.tsx:698`. Light selection exists only as pointer hit-testing on the WebGL map. There are no focusable light entries, accessible search results, or keyboard selection action. The accessible vessel sliders and card become available only after this inaccessible first step.
   Fix: Provide a keyboard-accessible list or search of visible lights that invokes the same selection action and restores focus when its card closes.

6. **P2: The haptics switch does not disable vessel feedback.** `src/App.tsx:113`, `src/App.tsx:184`, `src/App.tsx:422`, `src/App.tsx:498`. The boot-time map click handler retains the initial `select`, which also retains the initial `spawnVessel` and its `haptics=true` closure. Toggling the switch does not update those DOM listeners. Reproduced by disabling haptics before selecting a light: vessel pointer-down still called `navigator.vibrate`.
   Fix: Read the current haptics preference through a ref or an effect event used by all persistent map and vessel handlers.

7. **P2: Failed shard requests disappear silently and the retry button cannot recover them.** `src/lib/data.ts:83`, `src/App.tsx:175`, `src/App.tsx:755`. A failed shard only updates `failedAt`; the UI never observes `failedCells`. The cooldown merely permits a later `needBounds` call, so a stationary view remains incomplete indefinitely. The visible retry button retries only the index, which returns immediately if already cached.
   Fix: Publish shard failure state and make retry re-request the current bounds with the failed-cell cooldown reset.

8. **P2: Explicit sequences without a period are rewritten to an invented six-second cycle.** `src/iala.ts:78`, `src/iala.ts:306`, `src/iala.ts:311`. `parseLights({character: 'Fl', sequence: '0.5+(9.5)'})`, using the seamark key prefixes, produces `period=6` and durations `0.3, 5.7`. The supplied ten-second sequence already contains the timing needed to determine its period. This violates the exact-rhythm claim at `README.md:7` and the explicit-sequence claim at `src/App.tsx:818`.
   Fix: Derive the period from a valid explicit sequence when no period is supplied, and report conflicting supplied periods rather than silently rescaling.

9. **P2: Invalid or inferred rhythms are presented as decoded signals.** `src/iala.ts:311`, `src/iala.ts:323`, `src/iala.ts:330`, `README.md:24`. An invalid sequence such as `bad` with `character=Fl` silently becomes a synthesized flash with `unparsed=false`. Missing periods also default to six seconds without an inference marker. Unknown characters do get flagged, but still receive an invented flash, contrary to “flagged rather than faked.” Only `unparsed` is exposed by the card at `src/components/LightCard.tsx:156`.
   Fix: Track explicit, inferred and undecodable timing separately, expose that status in the card, and align README claims with the fallback behavior.

10. **P2: Zero-length explicit sequences generate non-finite durations.** `src/iala.ts:77`, `src/iala.ts:80`, `src/iala.ts:341`. With a ten-second period and `sequence=0+(0)`, the scale factor is infinite and both durations become `NaN`; normalization retains them and `unparsed` remains false. Reproduced directly through `parseLights`; these values cannot form a valid GPU timeline and serialize as null.
    Fix: Reject sequences whose total duration is non-positive or non-finite before scaling, and validate normalized durations and period at the parser boundary.

11. **P2: Interrupted quick variants lose their distinguishing cadence.** `src/iala.ts:149`, `src/iala.ts:253`. Rate selection checks the first character, so `IVQ` and `IUQ` both use the ordinary Q rate. For ungrouped `IQ` with a six-second period, the quick run fills all six seconds and leaves no interruption. Direct probes showed identical six-flash timelines for `IQ` and `IVQ`.
    Fix: Separate the interruption prefix from the quick-rate class and reserve an interruption interval; flag timing as inferred when the tags do not specify it.

12. **P2: The shader silently drops valid timeline segments after segment 96.** `src/lib/lightField.ts:56`, `src/lib/lightField.ts:241`. The parser and texture upload accept longer sequences, but the vertex shader never visits their tails. A direct parser probe of `UQ` with period 60 yields 320 segments; the shader covers only the first 18 seconds and leaves the light at ember level for the remaining 42 seconds.
    Fix: Support every uploaded segment through a bounded lookup strategy, or normalize/reject oversized timelines explicitly before upload.

13. **P2: Disabled browser storage can prevent the application from rendering.** `src/App.tsx:107`, `src/App.tsx:724`, `src/App.tsx:748`. The state initializer reads `localStorage` without a guard. If storage access throws, the first render fails before the map boots; blocked writes also prevent the guide dismissal from completing.
    Fix: Wrap optional preference storage in a guarded helper with an in-memory fallback, and always update the guide's React state even if persistence fails.

14. **P2: Clipboard fallback can report success without copying anything.** `src/App.tsx:662`. `document.execCommand('copy')` can return false without throwing, but the handler ignores its return value and shows “link copied.”
    Fix: Return the command's boolean result and emit success feedback only when copying succeeds.

Validation: `npm run build` passed with Vite's bundle-size warning; `npm run lint` passed; all 17 existing parser tests passed. The browser reproductions above used the installed Playwright/Chromium and synthetic data, without installing dependencies. Other findings follow from the cited control flow and direct parser probes. Generated-data coverage, the README's approximate light count, and its geographic coverage claims remain unverified by design. No application fixes were made. A concurrent modification to `src/index.css` was observed during the review and left untouched.

VERDICT: FIX
