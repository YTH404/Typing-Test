import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SETTINGS,
    KEYBOARD_TOKENS,
    createInitialState,
    getActiveAttempt,
    getMetrics,
    typingReducer,
} from '@/features/typing-test/core';
import type {
    KeyboardInput,
    TypingTestState,
} from '@/features/typing-test/core';

const timeless = {
    ...DEFAULT_SETTINGS,
    mode: { kind: 'timeless' as const },
};

const character = (value: string): KeyboardInput => ({
    kind: 'character',
    value,
});

const key = (
    state: TypingTestState,
    input: KeyboardInput,
    now = 0,
): TypingTestState => typingReducer(state, { type: 'key', input, now });

const typeText = (
    state: TypingTestState,
    text: string,
    now = 0,
): TypingTestState =>
    [...text].reduce(
        (current, value) => key(current, character(value), now),
        state,
    );

const stop = (state: TypingTestState, now: number): TypingTestState =>
    typingReducer(state, { type: 'stop', now });

const roundedAccuracy = (correct: number, errors: number): number =>
    Math.round((correct / (correct + errors)) * 1_000) / 10;

describe('typing metrics', () => {
    it('scores final aligned characters and committed spaces for WPM', () => {
        let state = createInitialState(timeless, 101);
        const target = getActiveAttempt(state)!.target;

        state = typeText(state, target);
        state = key(state, KEYBOARD_TOKENS.space);
        state = stop(state, 60_000);

        const result = getMetrics(state);
        const correct = target.length + 1;

        expect(result).toMatchObject({
            elapsedMs: 60_000,
            correct,
            incorrect: 0,
            extra: 0,
            missed: 0,
            completedWords: 1,
            wpm: Math.round(correct / 5),
            rawWpm: Math.round(correct / 5),
            accuracy: 100,
            reason: 'manual',
        });
    });

    it('keeps a corrected substitution in historical accuracy and raw WPM', () => {
        let state = createInitialState(timeless, 102);
        const target = getActiveAttempt(state)!.target;
        const expected = target[0]!;
        const wrong = expected === 'x' ? 'y' : 'x';

        state = key(state, character(wrong));
        state = key(state, KEYBOARD_TOKENS.backspace);
        state = typeText(state, target);
        state = key(state, KEYBOARD_TOKENS.space);
        state = stop(state, 60_000);

        const result = getMetrics(state);
        const correct = target.length + 1;

        expect(result.correct).toBe(correct);
        expect(result.incorrect).toBe(1);
        expect(result.rawWpm).toBe(Math.round((target.length + 2) / 5));
        expect(result.accuracy).toBe(roundedAccuracy(correct, 1));
    });

    it('counts extra inserts historically without changing final aligned WPM', () => {
        let state = createInitialState(timeless, 103);
        const target = getActiveAttempt(state)!.target;

        state = typeText(state, `${target}x`);
        state = key(state, KEYBOARD_TOKENS.space);
        state = stop(state, 60_000);

        const result = getMetrics(state);
        const correct = target.length + 1;

        expect(result.correct).toBe(correct);
        expect(result.extra).toBe(1);
        expect(result.wpm).toBe(Math.round(correct / 5));
        expect(result.rawWpm).toBe(Math.round((correct + 1) / 5));
        expect(result.accuracy).toBe(roundedAccuracy(correct, 1));
    });

    it('penalizes only suffix characters explicitly missed by committing early', () => {
        let state = createInitialState(timeless, 104);
        const target = getActiveAttempt(state)!.target;

        state = key(state, character(target[0]!));
        state = key(state, KEYBOARD_TOKENS.space);
        state = stop(state, 60_000);

        const result = getMetrics(state);
        const missed = target.length - 1;

        expect(result.correct).toBe(2);
        expect(result.missed).toBe(missed);
        expect(result.completedWords).toBe(1);
        expect(result.accuracy).toBe(roundedAccuracy(2, missed));
    });

    it('does not count the unfinished active suffix as missed at Stop', () => {
        let state = createInitialState(timeless, 105);
        const target = getActiveAttempt(state)!.target;

        state = key(state, character(target[0]!));
        state = stop(state, 5_000);

        expect(getMetrics(state)).toMatchObject({
            correct: 1,
            missed: 0,
            completedWords: 0,
        });
    });

    it('removes a reopened word separator from final WPM but not raw history', () => {
        let state = createInitialState(timeless, 106);
        const target = getActiveAttempt(state)!.target;

        state = typeText(state, target);
        state = key(state, KEYBOARD_TOKENS.space);
        state = key(state, KEYBOARD_TOKENS.backspace);
        state = stop(state, 60_000);

        const result = getMetrics(state);

        expect(result.correct).toBe(target.length - 1);
        expect(result.completedWords).toBe(0);
        expect(result.rawWpm).toBe(Math.round((target.length + 1) / 5));
    });

    it('uses every historical printable insert for raw speed, including corrected input', () => {
        let state = createInitialState(timeless, 107);
        const expected = getActiveAttempt(state)!.target[0]!;

        state = key(state, character(expected));
        state = key(state, KEYBOARD_TOKENS.backspace);
        state = key(state, character(expected));
        state = stop(state, 12_000);

        expect(getMetrics(state)).toMatchObject({
            correct: 1,
            wpm: 1,
            rawWpm: 2,
            accuracy: 100,
        });
    });

    it('guards zero elapsed time without NaN or Infinity', () => {
        let state = createInitialState(timeless, 108);
        state = key(state, character(getActiveAttempt(state)!.target[0]!), 500);
        state = stop(state, 500);

        expect(getMetrics(state)).toMatchObject({
            elapsedMs: 0,
            wpm: 0,
            rawWpm: 0,
            accuracy: 100,
        });
    });

    it('preserves final scoring after completed targets are archived', () => {
        let state = createInitialState(timeless, 109);

        for (let word = 0; word < 100; word += 1) {
            state = key(
                state,
                character(getActiveAttempt(state)!.target[0]!),
                word,
            );
            state = key(state, KEYBOARD_TOKENS.space, word);
        }

        expect(state.wordOffset).toBeGreaterThan(0);

        state = stop(state, 60_000);
        const result = getMetrics(state);

        expect(result.correct).toBe(200);
        expect(result.completedWords).toBe(100);
        expect(result.wpm).toBe(40);
        expect(result.rawWpm).toBe(40);
    });
});
