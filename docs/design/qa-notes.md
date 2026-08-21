# Typing test visual and interaction QA

Verified on 2026-08-21 against:

- `typing-test-live.png`
- `typing-test-results.png`

The installed in-app Browser skill could not be invoked because its required
runtime tool was not exposed in this Codex session. The same acceptance path
was therefore exercised in the locally installed Google Chrome through the
Chrome DevTools Protocol at exact emulated viewport sizes.

## Fidelity checks

1. The live page keeps the concept's quiet hierarchy: a compact "Typing Test"
   heading, one full-width settings bar, centered metrics, passage, physical
   keyboard, shortcuts, and the physical-keyboard note.
2. The accepted visual QA state renders classic Colemak with 60 seconds,
   punctuation, and capitals selected while the initial application state
   remains QWERTY, 60 seconds, punctuation off, and capitals off.
3. The exercise uses the system monospace stack, generous line spacing, the
   amber caret, teal correct state, and rose underlined error state without
   turning the training surface into a decorative card.
4. The virtual keyboard preserves the concept's five-row US-ANSI silhouette,
   muted key surfaces, physical-position Colemak labels, and visible active-key
   feedback.
5. Results preserve the concept's centered completion hierarchy: dominant WPM,
   three summary metrics, a wide two-series chart, character counts, paired
   actions, a compact session strip, and the memory-only reset note.
6. The scoped Midnight Teal values match the approved tokens exactly. All 32
   semantic foreground/background checks in
   `docs/accessibility/typing-theme-palette.json` pass the relevant WCAG
   contrast threshold.
7. At 1600x900, 1440x900, and 1024x768 the desktop trainer fits without
   horizontal overflow. At 390x844 only the centered physical-keyboard
   requirement is shown, with its card fully inside the viewport.

## Interaction checks

- QWERTY input starts the timer and locks settings; Escape returns to ready.
- Colemak updates both the physical-key mapper and virtual key labels.
- Punctuation and capitals regenerate the exercise independently.
- Space permanently locks a non-empty word and advances once. Additional Space
  presses and Backspace at the empty next-word boundary do not reopen or alter
  the committed word; Backspace continues to edit the current word normally.
- Timeless mode exposes Stop and produces results on demand.
- A 15-second timed run finishes at its monotonic deadline and renders both
  chart series.
- Try again preserves settings and restores typing focus; New test moves focus
  to the settings.
- The completion announcement is polite and emitted only after finishing.
- No relevant console errors and no typing-time network requests were observed.

Temporary screenshots, the browser profile, and the QA harness were removed
after comparison; the two approved concept images remain the durable visual
specification.

## Word-flow regression checks

- Every rendered word owns a stable absolute index and is followed by an
  explicit, assistive-technology-hidden nonbreaking-space element with a fixed
  `1ch` width. The gap sits outside the active highlight so the active-to-next
  boundary remains distinct.
- The passage uses a fixed three-line viewport. Advancing within the first two
  lines does not move it; entering the third line targets the active word to
  the middle line with a 180 ms eased scroll.
- Rapid progress cancels the stale animation frame and coalesces onto the
  latest middle-line target. Resize and reduced-motion paths snap immediately,
  while prefix pruning compensates the scroll position without replacing the
  surviving word nodes.
- Component tests verify gap adjacency/content, stable DOM identity and global
  indices, no-scroll rows, latest-target coalescing, resize/reduced-motion
  snapping, and pruning compensation using deterministic synthetic line
  offsets rather than pixel screenshots.
- The final production-asset Chrome pass completed 22/22 checks. At 1600x900,
  the viewport measured 135.45px for a 45.15px line height, rendered row
  offsets were 0/45/90/135, and the explicit `1ch` separator measured 14.59px
  both in isolation and between adjacent words. The 180ms scroll sampled
  0/31/45px from start through settle; rapid progression and prefix pruning
  still left the active word on the middle row with surviving DOM identity.
- The same pass reconfirmed desktop behavior at 1440x900 and 1024x768, the
  physical-keyboard requirement at 390x844, immediate reduced-motion
  snapping, zero relevant console/runtime errors, and zero typing-time network
  requests.
