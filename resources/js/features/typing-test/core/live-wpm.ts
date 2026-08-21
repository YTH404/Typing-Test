import { getElapsedMs } from './metrics';
import type { TypingTestState } from './types';

export const LIVE_WPM_WINDOW_MS = 5_000;

/**
 * Reports correct historical input throughput over the latest five-second
 * window. The end of the window advances only on whole seconds so the live
 * display remains readable instead of flickering on every clock tick.
 */
export function getLiveWpm(
    state: TypingTestState,
    now: number = state.finishedAt ?? state.startedAt ?? 0,
): number {
    if (state.startedAt === null) {
        return 0;
    }

    const elapsedMs = getElapsedMs(state, now);
    const sampleEndMs = Math.floor(elapsedMs / 1_000) * 1_000;

    if (sampleEndMs === 0) {
        return 0;
    }

    const windowDurationMs = Math.min(LIVE_WPM_WINDOW_MS, sampleEndMs);
    const windowStartMs = sampleEndMs - windowDurationMs;
    const correctCharacters = state.history.filter(
        (attempt) =>
            attempt.actual !== null &&
            attempt.outcome === 'correct' &&
            attempt.elapsedMs <= sampleEndMs &&
            (sampleEndMs < LIVE_WPM_WINDOW_MS
                ? attempt.elapsedMs >= windowStartMs
                : attempt.elapsedMs > windowStartMs),
    ).length;
    const windowMinutes = windowDurationMs / 60_000;

    return Math.round(correctCharacters / 5 / windowMinutes);
}
