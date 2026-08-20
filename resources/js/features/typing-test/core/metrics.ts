import type { TestResult, TypingTestState, WordAttempt } from './types';

const countAlignedCorrect = (attempt: WordAttempt): number => {
    const comparableLength = Math.min(
        attempt.target.length,
        attempt.typed.length,
    );
    let correct = 0;

    for (let index = 0; index < comparableLength; index += 1) {
        if (attempt.target[index] === attempt.typed[index]) {
            correct += 1;
        }
    }

    return correct;
};

const getDeadline = (state: TypingTestState): number | null => {
    if (state.startedAt === null || state.settings.mode.kind !== 'timed') {
        return null;
    }

    return state.startedAt + state.settings.mode.durationSeconds * 1_000;
};

export function getElapsedMs(
    state: TypingTestState,
    now: number = state.finishedAt ?? state.startedAt ?? 0,
): number {
    if (state.startedAt === null) {
        return 0;
    }

    const endpoint = state.finishedAt ?? Math.max(now, state.startedAt);
    const deadline = getDeadline(state);
    const boundedEndpoint =
        deadline === null ? endpoint : Math.min(endpoint, deadline);

    return Math.max(0, boundedEndpoint - state.startedAt);
}

export function getRemainingMs(
    state: TypingTestState,
    now: number = state.finishedAt ?? state.startedAt ?? 0,
): number | null {
    if (state.settings.mode.kind === 'timeless') {
        return null;
    }

    const durationMs = state.settings.mode.durationSeconds * 1_000;

    if (state.startedAt === null) {
        return durationMs;
    }

    return Math.max(0, durationMs - getElapsedMs(state, now));
}

const getFinalCorrect = (state: TypingTestState): number => {
    let correct = state.archivedCorrect;

    state.attempts.forEach((attempt, localIndex) => {
        const absoluteIndex = state.wordOffset + localIndex;

        if (!attempt.committed && absoluteIndex !== state.activeWordIndex) {
            return;
        }

        correct += countAlignedCorrect(attempt);

        if (attempt.committed) {
            correct += 1;
        }
    });

    return correct;
};

export function getMetrics(
    state: TypingTestState,
    now: number = state.finishedAt ?? state.startedAt ?? 0,
): TestResult {
    const elapsedMs = getElapsedMs(state, now);
    const correct = getFinalCorrect(state);
    let incorrect = 0;
    let extra = 0;
    let missed = 0;
    let printableInserts = 0;

    state.history.forEach((attempt) => {
        if (attempt.actual !== null) {
            printableInserts += 1;
        }

        if (attempt.outcome === 'incorrect') {
            incorrect += 1;
        } else if (attempt.outcome === 'extra') {
            extra += 1;
        } else if (attempt.outcome === 'missed') {
            missed += 1;
        }
    });

    const elapsedMinutes = elapsedMs / 60_000;
    const wpm =
        elapsedMinutes === 0 ? 0 : Math.round(correct / 5 / elapsedMinutes);
    const rawWpm =
        elapsedMinutes === 0
            ? 0
            : Math.round(printableInserts / 5 / elapsedMinutes);
    const evaluated = correct + incorrect + extra + missed;
    const accuracy =
        evaluated === 0 ? 100 : Math.round((correct / evaluated) * 1_000) / 10;
    const completedWords =
        state.archivedCompletedWords +
        state.attempts.filter((attempt) => attempt.committed).length;

    return {
        elapsedMs,
        wpm,
        rawWpm,
        accuracy,
        correct,
        incorrect,
        extra,
        missed,
        completedWords,
        reason: state.finishReason,
    };
}

export function getActiveAttempt(state: TypingTestState): WordAttempt | null {
    return state.attempts[state.activeWordIndex - state.wordOffset] ?? null;
}

export type IndexedWordAttempt = {
    index: number;
    attempt: WordAttempt;
};

export function getAttemptWindow(
    state: TypingTestState,
    before = 8,
    after = 48,
): readonly IndexedWordAttempt[] {
    const localActiveIndex = state.activeWordIndex - state.wordOffset;
    const start = Math.max(0, localActiveIndex - Math.max(0, before));
    const end = Math.min(
        state.attempts.length,
        localActiveIndex + Math.max(0, after) + 1,
    );

    return state.attempts.slice(start, end).map((attempt, offset) => ({
        index: state.wordOffset + start + offset,
        attempt,
    }));
}
