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
    getWordPool,
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

const modeCases: readonly (readonly [string, TestSettings])[] = [
    ['timed', DEFAULT_SETTINGS],
    ['timeless', timelessSettings()],
];

describe('typing reducer', () => {
    it('uses the agreed English Easy QWERTY 60-second defaults', () => {
        expect(DEFAULT_SETTINGS).toEqual({
            layout: 'qwerty',
            language: 'english',
            difficulty: 'easy',
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

    it.each(modeCases)(
        'ignores empty Space spam before start and after one commit in %s mode',
        (_label, settings) => {
            let state = createInitialState(settings, 31);

            for (let press = 0; press < 5; press += 1) {
                state = key(state, KEYBOARD_TOKENS.space, press);
            }

            expect(state.phase).toBe('ready');
            expect(state.activeWordIndex).toBe(0);
            expect(state.history).toEqual([]);

            state = key(state, character('a'), 10);
            state = key(state, KEYBOARD_TOKENS.space, 20);
            const committedAttempt = state.attempts[0];
            const committedHistory = state.history;

            for (let press = 0; press < 5; press += 1) {
                state = key(state, KEYBOARD_TOKENS.space, 21 + press);
            }

            expect(state.phase).toBe('running');
            expect(state.activeWordIndex).toBe(1);
            expect(getActiveAttempt(state)!.typed).toBe('');
            expect(state.attempts[0]).toBe(committedAttempt);
            expect(state.history).toBe(committedHistory);
            expect(
                state.history.filter((entry) => entry.actual === ' '),
            ).toHaveLength(1);
        },
    );

    it.each(modeCases)(
        'commits three non-empty attempts and leaves the fourth word active in %s mode',
        (_label, settings) => {
            let state = createInitialState(settings, 32);

            for (let word = 0; word < 3; word += 1) {
                state = key(state, character('a'), word * 10);
                state = key(state, KEYBOARD_TOKENS.space, word * 10 + 1);
            }

            expect(state.phase).toBe('running');
            expect(state.activeWordIndex).toBe(3);
            expect(getActiveAttempt(state)!.typed).toBe('');
            expect(
                state.attempts
                    .slice(0, 3)
                    .map(({ committed, typed }) => ({ committed, typed })),
            ).toEqual([
                { committed: true, typed: 'a' },
                { committed: true, typed: 'a' },
                { committed: true, typed: 'a' },
            ]);
            expect(
                state.history.filter((entry) => entry.actual === ' '),
            ).toHaveLength(3);
        },
    );

    it.each(modeCases)(
        'does not commit after the current character is erased in %s mode',
        (_label, settings) => {
            let state = createInitialState(settings, 33);

            state = key(state, character('a'), 10);
            state = key(state, KEYBOARD_TOKENS.backspace, 20);

            for (let press = 0; press < 5; press += 1) {
                state = key(state, KEYBOARD_TOKENS.space, 30 + press);
            }

            expect(state.phase).toBe('running');
            expect(state.activeWordIndex).toBe(0);
            expect(getActiveAttempt(state)).toMatchObject({
                committed: false,
                typed: '',
            });
            expect(
                state.history.filter((entry) => entry.actual === ' '),
            ).toHaveLength(0);
        },
    );

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

    it('irreversibly commits a mistaken partial word on Space', () => {
        let state = createInitialState(timelessSettings(), 34);
        const target = getActiveAttempt(state)!.target;
        const wrong = target[0] === 'x' ? 'y' : 'x';

        state = key(state, character(wrong), 0);
        state = key(state, KEYBOARD_TOKENS.space, 100);
        const committedAttempt = state.attempts[0];
        state = key(state, KEYBOARD_TOKENS.backspace, 200);

        expect(state.activeWordIndex).toBe(1);
        expect(state.attempts[0]).toBe(committedAttempt);
        expect(state.attempts[0]).toMatchObject({
            committed: true,
            typed: wrong,
        });
        expect(
            state.history.filter((entry) => entry.outcome === 'incorrect'),
        ).toHaveLength(1);
        expect(
            state.history.filter((entry) => entry.outcome === 'missed'),
        ).toHaveLength(target.length - 1);
    });

    it('accepts repeated discrete printable keys but ignores Space spam at the resulting boundary', () => {
        let state = createInitialState(timelessSettings(), 35);

        state = typeText(state, 'aaa', 0);
        state = key(state, KEYBOARD_TOKENS.space, 10);

        for (let press = 0; press < 5; press += 1) {
            state = key(state, KEYBOARD_TOKENS.space, 20 + press);
        }

        expect(state.activeWordIndex).toBe(1);
        expect(state.attempts[0]).toMatchObject({
            committed: true,
            typed: 'aaa',
        });
        expect(
            state.history.filter((entry) => entry.actual === 'a'),
        ).toHaveLength(3);
        expect(
            state.history.filter((entry) => entry.actual === ' '),
        ).toHaveLength(1);
    });

    it('uses the same immutable Space boundary for capitalized and punctuated targets', () => {
        let state = createInitialState(
            timelessSettings({ punctuation: true, capitals: true }),
            36,
        );
        const committedTargets: string[] = [];

        expect(getActiveAttempt(state)!.target).toMatch(/^[A-Z]/);

        while (
            committedTargets.length < 12 &&
            !committedTargets.some((target) => /[.!?]$/.test(target))
        ) {
            const target = getActiveAttempt(state)!.target;
            state = typeText(state, target, committedTargets.length * 10);
            state = key(
                state,
                KEYBOARD_TOKENS.space,
                committedTargets.length * 10 + 1,
            );
            committedTargets.push(target);
        }

        expect(committedTargets.some((target) => /[.!?]$/.test(target))).toBe(
            true,
        );
        const lastCommittedIndex = state.activeWordIndex - 1;
        const lastCommitted = state.attempts[lastCommittedIndex];

        state = key(state, KEYBOARD_TOKENS.backspace, 500);

        expect(state.activeWordIndex).toBe(committedTargets.length);
        expect(state.attempts[lastCommittedIndex]).toBe(lastCommitted);
        expect(lastCommitted).toMatchObject({ committed: true });
    });

    it('keeps a committed word immutable when Backspace is pressed at the next boundary', () => {
        let state = createInitialState(timelessSettings(), 4);
        const target = getActiveAttempt(state)!.target;

        state = typeText(state, target, 0);
        state = key(state, KEYBOARD_TOKENS.space, 100);
        const committedAttempt = state.attempts[0];
        const history = state.history;

        for (let press = 0; press < 12; press += 1) {
            state = key(state, KEYBOARD_TOKENS.backspace, 200 + press);
        }

        expect(state.activeWordIndex).toBe(1);
        expect(getActiveAttempt(state)!.typed).toBe('');
        expect(state.history).toBe(history);
        expect(state.attempts[0]).toBe(committedAttempt);
        expect(state.attempts[0]).toMatchObject({
            committed: true,
            typed: target,
        });
    });

    it('deletes the current word to empty and stops before the committed word', () => {
        let state = createInitialState(timelessSettings(), 40);
        const firstTarget = getActiveAttempt(state)!.target;

        state = typeText(state, firstTarget, 0);
        state = key(state, KEYBOARD_TOKENS.space, 100);
        const committedAttempt = state.attempts[0];
        state = typeText(state, 'xyz', 200);

        state = key(state, KEYBOARD_TOKENS.backspace, 300);
        state = key(state, KEYBOARD_TOKENS.backspace, 301);
        state = key(state, KEYBOARD_TOKENS.backspace, 302);

        expect(state.activeWordIndex).toBe(1);
        expect(getActiveAttempt(state)!.typed).toBe('');

        const emptyBoundary = state;
        state = key(state, KEYBOARD_TOKENS.backspace, 303);

        expect(state).toBe(emptyBoundary);
        expect(state.attempts[0]).toBe(committedAttempt);
        expect(state.attempts[0]).toMatchObject({
            committed: true,
            typed: firstTarget,
        });
    });

    it('never erases historical incorrect or commit-time missed penalties', () => {
        let state = createInitialState(timelessSettings(), 5);
        const target = getActiveAttempt(state)!.target;
        const expected = target[0]!;
        const wrong = expected === 'x' ? 'y' : 'x';

        state = key(state, character(wrong), 0);
        state = key(state, KEYBOARD_TOKENS.backspace, 10);
        state = key(state, character(expected), 20);

        expect(getMetrics(state, 1_000).incorrect).toBe(1);

        state = key(state, KEYBOARD_TOKENS.space, 30);
        const committedAttempt = state.attempts[0];
        const originallyMissed = getMetrics(state, 30).missed;

        for (let press = 0; press < 4; press += 1) {
            state = key(state, KEYBOARD_TOKENS.backspace, 40 + press);
        }

        const result = getMetrics(state, 1_000);
        expect(originallyMissed).toBe(target.length - 1);
        expect(result.incorrect).toBe(1);
        expect(result.missed).toBe(originallyMissed);
        expect(result.completedWords).toBe(1);
        expect(state.activeWordIndex).toBe(1);
        expect(state.attempts[0]).toBe(committedAttempt);
    });

    it('locks settings while running and applies them in ready or finished phases', () => {
        const changed: TestSettings = {
            layout: 'colemak',
            language: 'indonesian',
            difficulty: 'hard',
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
        expect(
            state.attempts.every((attempt) =>
                getWordPool('indonesian', 'colemak', 'hard').includes(
                    attempt.target.replace(/[,:;.!?]$/, '').toLowerCase(),
                ),
            ),
        ).toBe(true);

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

        const currentWordOffset = state.wordOffset;
        const localActiveIndex = state.activeWordIndex - state.wordOffset;
        const mostRecentCommitted = state.attempts[localActiveIndex - 1];

        for (let press = 0; press < 5; press += 1) {
            state = key(state, KEYBOARD_TOKENS.space, 650 + press);
        }

        expect(state.activeWordIndex).toBe(320);
        expect(state.wordOffset).toBe(currentWordOffset);

        for (let press = 0; press < 12; press += 1) {
            state = key(state, KEYBOARD_TOKENS.backspace, 700 + press);
        }

        expect(state.activeWordIndex).toBe(320);
        expect(state.wordOffset).toBe(currentWordOffset);
        expect(getActiveAttempt(state)!.typed).toBe('');
        expect(state.attempts[localActiveIndex - 1]).toBe(mostRecentCommitted);
        expect(mostRecentCommitted).toMatchObject({ committed: true });
    });
});
