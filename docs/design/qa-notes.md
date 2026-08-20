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
