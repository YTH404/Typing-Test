import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SETTINGS,
    KEYBOARD_TOKENS,
    createInitialState,
    getActiveAttempt,
    typingReducer,
} from '@/features/typing-test/core';
import type {
    SessionAttempt,
    TypingTestState,
} from '@/features/typing-test/core';
import {
    LIVE_WPM_WINDOW_MS,
    getLiveWpm,
} from '@/features/typing-test/core/live-wpm';

const historyEntry = (
    sequence: number,
    elapsedMs: number,
    outcome: SessionAttempt['outcome'] = 'correct',
    actual: string | null = 'a',
): SessionAttempt => ({
    sequence,
    wordIndex: 0,
    characterIndex: sequence,
    actual,
    expected: 'a',
    outcome,
    elapsedMs,
});

const runningState = (history: readonly SessionAttempt[]): TypingTestState => ({
    ...createInitialState(DEFAULT_SETTINGS, 99),
    phase: 'running',
    startedAt: 0,
    history,
});

describe('live WPM', () => {
    it('uses a five-second trailing window', () => {
        expect(LIVE_WPM_WINDOW_MS).toBe(5_000);

        const state = runningState([
            historyEntry(0, 999),
            historyEntry(1, 1_000),
            historyEntry(2, 5_999),
            historyEntry(3, 6_000),
        ]);

        expect(getLiveWpm(state, 6_000)).toBe(5);
        expect(getLiveWpm(state, 7_000)).toBe(5);
    });

    it('uses elapsed time while the initial window warms up', () => {
        const state = runningState([historyEntry(0, 0)]);

        expect(getLiveWpm(state, 1_000)).toBe(12);
        expect(getLiveWpm(state, 2_000)).toBe(6);
    });

    it('includes a boundary event in its second and drops it at five seconds old', () => {
        const state = runningState([historyEntry(0, 1_000)]);

        expect(getLiveWpm(state, 999)).toBe(0);
        expect(getLiveWpm(state, 1_000)).toBe(12);
        expect(getLiveWpm(state, 1_999)).toBe(12);
        expect(getLiveWpm(state, 5_999)).toBe(2);
        expect(getLiveWpm(state, 6_000)).toBe(0);
    });

    it('counts only correct printable history, including committed spaces', () => {
        const state = runningState([
            historyEntry(0, 1, 'correct', 'a'),
            historyEntry(1, 100, 'correct', ' '),
            historyEntry(2, 200, 'incorrect', 'x'),
            historyEntry(3, 300, 'extra', 'z'),
            historyEntry(4, 400, 'missed', null),
        ]);

        expect(getLiveWpm(state, 5_000)).toBe(5);
    });

    it('returns zero before the test starts and during the first partial second', () => {
        const ready = createInitialState(DEFAULT_SETTINGS, 100);
        const running = runningState([historyEntry(0, 0)]);

        expect(getLiveWpm(ready, 10_000)).toBe(0);
        expect(getLiveWpm(running, 999)).toBe(0);
    });

    it('retains rolling credit when correct input is later Backspaced', () => {
        let state = createInitialState(DEFAULT_SETTINGS, 101);
        const expected = getActiveAttempt(state)!.target[0]!;

        state = typingReducer(state, {
            type: 'key',
            input: { kind: 'character', value: expected },
            now: 0,
        });
        state = typingReducer(state, {
            type: 'key',
            input: KEYBOARD_TOKENS.backspace,
            now: 100,
        });

        expect(getActiveAttempt(state)!.typed).toBe('');
        expect(getLiveWpm(state, 1_000)).toBe(12);
    });

    it('decays to zero after five seconds without correct input', () => {
        const state = runningState([historyEntry(0, 0)]);

        expect(getLiveWpm(state, 4_999)).toBe(3);
        expect(getLiveWpm(state, 5_000)).toBe(0);
        expect(getLiveWpm(state, 6_000)).toBe(0);
    });
});
