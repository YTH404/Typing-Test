import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SETTINGS,
    INITIAL_TARGET_WORDS,
    KEYBOARD_TOKENS,
    RETAIN_COMPLETED_WORDS,
    TARGET_EXTENSION_WORDS,
    createInitialState,
    getActiveAttempt,
    getAttemptWindow,
    getMetrics,
    getRemainingMs,
    isSettingsLocked,
    typingReducer,
} from '@/features/typing-test/core';
import type {
    KeyboardInput,
    TestSettings,
    TypingTestState,
} from '@/features/typing-test/core';

const character = (value: string): KeyboardInput => ({
    kind: 'character',
    value,
});

const key = (
    state: TypingTestState,
    input: KeyboardInput,
    now: number,
): TypingTestState => typingReducer(state, { type: 'key', input, now });

const typeText = (
    state: TypingTestState,
    text: string,
    now: number,
): TypingTestState =>
    [...text].reduce(
        (current, value) => key(current, character(value), now),
        state,
    );

const timelessSettings = (
    overrides: Partial<TestSettings> = {},
): TestSettings => ({
    ...DEFAULT_SETTINGS,
    ...overrides,
    mode: { kind: 'timeless' },
});

describe('typing reducer', () => {
    it('uses the agreed QWERTY 60-second defaults', () => {
        expect(DEFAULT_SETTINGS).toEqual({
            layout: 'qwerty',
            punctuation: false,
            capitals: false,
            mode: { kind: 'timed', durationSeconds: 60 },
        });

        const state = createInitialState();

        expect(state.phase).toBe('ready');
        expect(state.attempts).toHaveLength(INITIAL_TARGET_WORDS);
        expect(state.activeWordIndex).toBe(0);
        expect(state.wordOffset).toBe(0);
        expect(state.history).toEqual([]);
        expect(getRemainingMs(state)).toBe(60_000);
    });

    it('starts only on the first valid printable character', () => {
        let state = createInitialState(DEFAULT_SETTINGS, 1);

        state = key(state, KEYBOARD_TOKENS.space, 10);
        state = key(state, KEYBOARD_TOKENS.backspace, 20);
        state = key(state, KEYBOARD_TOKENS.escape, 30);
        state = key(state, { kind: 'character', value: 'ab' }, 40);

        expect(state.phase).toBe('ready');
        expect(state.startedAt).toBeNull();

        const original = state;
        const expected = getActiveAttempt(state)!.target[0]!;
        state = key(state, character(expected), 1_234.5);

        expect(state.phase).toBe('running');
        expect(state.startedAt).toBe(1_234.5);
        expect(getActiveAttempt(state)!.typed).toBe(expected);
        expect(getActiveAttempt(original)!.typed).toBe('');
        expect(state.history[0]).toMatchObject({
            actual: expected,
            expected,
            outcome: 'correct',
            elapsedMs: 0,
        });
    });

    it('tracks substitutions and extra characters in append-only history', () => {
        let state = createInitialState(timelessSettings(), 2);
        const target = getActiveAttempt(state)!.target;
        const wrong = target[0] === 'x' ? 'y' : 'x';

        state = key(state, character(wrong), 0);
        state = typeText(state, target.slice(1), 10);
        state = key(state, character('z'), 20);

        expect(getActiveAttempt(state)!.typed).toBe(
            `${wrong}${target.slice(1)}z`,
        );
        expect(state.history[0]!.outcome).toBe('incorrect');
        expect(state.history.at(-1)!.outcome).toBe('extra');
    });

    it('commits a non-empty word, records omitted suffix characters, and ignores empty spaces', () => {
        let state = createInitialState(timelessSettings(), 3);
        const first = getActiveAttempt(state)!.target[0]!;
        const targetLength = getActiveAttempt(state)!.target.length;

        state = key(state, character(first), 0);
        state = key(state, KEYBOARD_TOKENS.space, 100);

        expect(state.activeWordIndex).toBe(1);
        expect(state.attempts[0]!.committed).toBe(true);
        expect(
            state.history.filter((attempt) => attempt.outcome === 'missed'),
        ).toHaveLength(targetLength - 1);
        expect(state.history.at(-1)).toMatchObject({
            actual: ' ',
            expected: ' ',
            outcome: 'correct',
        });

        const committed = state;
        state = key(state, KEYBOARD_TOKENS.space, 100);

        expect(state).toBe(committed);
    });

    it('reopens the prior word and deletes its final character with cross-word Backspace', () => {
        let state = createInitialState(timelessSettings(), 4);
        const target = getActiveAttempt(state)!.target;

        state = typeText(state, target, 0);
        state = key(state, KEYBOARD_TOKENS.space, 100);
        const immutableCommittedState = state;
        const history = state.history;

        state = key(state, KEYBOARD_TOKENS.backspace, 200);

        expect(state.activeWordIndex).toBe(0);
        expect(getActiveAttempt(state)).toMatchObject({
            committed: false,
            typed: target.slice(0, -1),
        });
        expect(state.history).toBe(history);
        expect(immutableCommittedState.attempts[0]).toMatchObject({
            committed: true,
            typed: target,
        });

        state = key(state, character(target.at(-1)!), 300);
        state = key(state, KEYBOARD_TOKENS.space, 400);

        expect(state.activeWordIndex).toBe(1);
        expect(
            state.history.filter((entry) => entry.actual === ' '),
        ).toHaveLength(2);
    });

    it('never erases historical incorrect or missed penalties after correction', () => {
        let state = createInitialState(timelessSettings(), 5);
        const target = getActiveAttempt(state)!.target;
        const expected = target[0]!;
        const wrong = expected === 'x' ? 'y' : 'x';

        state = key(state, character(wrong), 0);
        state = key(state, KEYBOARD_TOKENS.backspace, 10);
        state = key(state, character(expected), 20);

        expect(getMetrics(state, 1_000).incorrect).toBe(1);

        state = key(state, KEYBOARD_TOKENS.space, 30);
        const originallyMissed = getMetrics(state, 30).missed;
        state = key(state, KEYBOARD_TOKENS.backspace, 40);
        state = typeText(state, target, 50);
        state = key(state, KEYBOARD_TOKENS.space, 60);

        const result = getMetrics(state, 1_000);
        expect(originallyMissed).toBe(target.length - 1);
        expect(result.incorrect).toBe(1);
        expect(result.missed).toBe(originallyMissed);
    });

    it('locks settings while running and applies them in ready or finished phases', () => {
        const changed: TestSettings = {
            layout: 'colemak',
            punctuation: true,
            capitals: true,
            mode: { kind: 'timeless' },
        };
        let state = createInitialState(DEFAULT_SETTINGS, 6);

        state = typingReducer(state, {
            type: 'settings',
            settings: changed,
            seed: 7,
        });
        expect(state.settings).toEqual(changed);
        expect(state.seed).toBe(7);

        state = key(state, character(getActiveAttempt(state)!.target[0]!), 0);
        expect(isSettingsLocked(state)).toBe(true);

        const running = state;
        state = typingReducer(state, {
            type: 'settings',
            settings: DEFAULT_SETTINGS,
        });
        expect(state).toBe(running);

        state = typingReducer(state, { type: 'stop', now: 2_000 });
        state = typingReducer(state, {
            type: 'settings',
            settings: DEFAULT_SETTINGS,
            seed: 8,
        });
        expect(state.phase).toBe('ready');
        expect(state.settings).toEqual(DEFAULT_SETTINGS);
        expect(state.seed).toBe(8);
        expect(state.history).toEqual([]);
    });

    it('restarts with preserved settings and a fresh or explicit seed', () => {
        const configured = timelessSettings({
            layout: 'colemak',
            capitals: true,
        });
        let state = createInitialState(configured, 20);
        state = key(state, character(getActiveAttempt(state)!.target[0]!), 0);

        const restarted = typingReducer(state, { type: 'restart' });
        expect(restarted.phase).toBe('ready');
        expect(restarted.settings).toEqual(configured);
        expect(restarted.seed).not.toBe(20);
        expect(restarted.history).toEqual([]);

        const explicit = typingReducer(restarted, {
            type: 'restart',
            seed: 20,
        });
        expect(explicit).toEqual(createInitialState(configured, 20));
    });

    it('stops timeless sessions manually but ignores manual stop in timed mode', () => {
        let timeless = createInitialState(timelessSettings(), 9);
        timeless = key(
            timeless,
            character(getActiveAttempt(timeless)!.target[0]!),
            500,
        );
        timeless = typingReducer(timeless, { type: 'stop', now: 3_000 });

        expect(timeless).toMatchObject({
            phase: 'finished',
            startedAt: 500,
            finishedAt: 3_000,
            finishReason: 'manual',
        });
        expect(getMetrics(timeless).elapsedMs).toBe(2_500);

        let timed = createInitialState(DEFAULT_SETTINGS, 10);
        timed = key(timed, character(getActiveAttempt(timed)!.target[0]!), 0);
        const running = timed;
        timed = typingReducer(timed, { type: 'stop', now: 2_000 });
        expect(timed).toBe(running);
    });

    it('finishes at the exact timed deadline and rejects deadline input', () => {
        let state = createInitialState(DEFAULT_SETTINGS, 11);
        const first = getActiveAttempt(state)!.target[0]!;
        state = key(state, character(first), 1_000);
        const historyLength = state.history.length;

        state = key(state, character('x'), 61_000);

        expect(state).toMatchObject({
            phase: 'finished',
            finishedAt: 61_000,
            finishReason: 'timer',
        });
        expect(state.history).toHaveLength(historyLength);
        expect(getRemainingMs(state, 90_000)).toBe(0);
        expect(getMetrics(state, 90_000).elapsedMs).toBe(60_000);

        const finished = state;
        state = key(state, character('z'), 70_000);
        expect(state).toBe(finished);
    });

    it('uses the deadline rather than a delayed timer callback time', () => {
        let state = createInitialState(
            {
                ...DEFAULT_SETTINGS,
                mode: { kind: 'timed', durationSeconds: 15 },
            },
            12,
        );
        state = key(state, character(getActiveAttempt(state)!.target[0]!), 250);
        state = typingReducer(state, { type: 'tick', now: 30_000 });

        expect(state.finishedAt).toBe(15_250);
        expect(getMetrics(state).elapsedMs).toBe(15_000);
    });

    it('records one chart sample for every whole elapsed second without duplicates', () => {
        let state = createInitialState(timelessSettings(), 13);
        state = key(state, character(getActiveAttempt(state)!.target[0]!), 0);
        state = typingReducer(state, { type: 'tick', now: 3_500 });

        expect(state.samples.map((sample) => sample.elapsedMs)).toEqual([
            1_000, 2_000, 3_000,
        ]);
        expect(state.samples.map((sample) => sample.rawWpm)).toEqual([
            12, 6, 4,
        ]);

        const sampled = state;
        state = typingReducer(state, { type: 'tick', now: 3_999 });
        expect(state).toBe(sampled);

        state = typingReducer(state, { type: 'tick', now: 4_000 });
        expect(state.samples).toHaveLength(4);
        expect(state.samples.at(-1)!.elapsedMs).toBe(4_000);
    });

    it('keeps the target/attempt buffer bounded through a long timeless run', () => {
        let state = createInitialState(timelessSettings(), 14);

        for (let word = 0; word < 320; word += 1) {
            state = key(
                state,
                character(getActiveAttempt(state)!.target[0]!),
                word * 2,
            );
            state = key(state, KEYBOARD_TOKENS.space, word * 2 + 1);
        }

        expect(state.activeWordIndex).toBe(320);
        expect(state.wordOffset).toBeGreaterThan(0);
        expect(state.activeWordIndex - state.wordOffset).toBeLessThanOrEqual(
            RETAIN_COMPLETED_WORDS,
        );
        expect(state.attempts.length).toBeLessThanOrEqual(
            RETAIN_COMPLETED_WORDS + TARGET_EXTENSION_WORDS + 40,
        );
        expect(getActiveAttempt(state)).not.toBeNull();

        const window = getAttemptWindow(state, 5, 10);
        expect(window.length).toBeLessThanOrEqual(16);
        expect(
            window.some((entry) => entry.index === state.activeWordIndex),
        ).toBe(true);
    });
});
