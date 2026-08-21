import {
    DEFAULT_SEED,
    createWordGeneratorState,
    generateWords,
} from './generator';
import { getElapsedMs, getMetrics } from './metrics';
import { KEYBOARD_TOKENS } from './types';
import type {
    FinishReason,
    MetricSample,
    SessionAttempt,
    TestSettings,
    TypingAction,
    TypingTestState,
    WordAttempt,
} from './types';

export const DEFAULT_SETTINGS: TestSettings = {
    layout: 'qwerty',
    language: 'english',
    difficulty: 'easy',
    punctuation: false,
    capitals: false,
    mode: { kind: 'timed', durationSeconds: 60 },
};

export const INITIAL_TARGET_WORDS = 120;
export const TARGET_EXTENSION_WORDS = 80;
export const TARGET_EXTENSION_THRESHOLD = 40;
export const RETAIN_COMPLETED_WORDS = 24;

const cloneSettings = (settings: TestSettings): TestSettings => ({
    ...settings,
    mode: { ...settings.mode },
});

const toAttempt = (target: string): WordAttempt => ({
    target,
    typed: '',
    committed: false,
});

const nextSessionSeed = (seed: number): number => (seed + 0x9e3779b9) >>> 0;

export function createInitialState(
    settings: TestSettings = DEFAULT_SETTINGS,
    seed = DEFAULT_SEED,
): TypingTestState {
    const safeSeed = Number.isFinite(seed)
        ? Math.trunc(seed) >>> 0
        : DEFAULT_SEED;
    const generator = createWordGeneratorState(safeSeed);
    const generated = generateWords(settings, INITIAL_TARGET_WORDS, generator);

    return {
        phase: 'ready',
        settings: cloneSettings(settings),
        attempts: generated.words.map(toAttempt),
        activeWordIndex: 0,
        wordOffset: 0,
        history: [],
        startedAt: null,
        finishedAt: null,
        finishReason: null,
        samples: [],
        archivedCorrect: 0,
        archivedCompletedWords: 0,
        seed: safeSeed,
        generator: generated.state,
    };
}

const safeNow = (now: number, fallback = 0): number =>
    Number.isFinite(now) ? now : fallback;

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

const replaceAttempt = (
    attempts: readonly WordAttempt[],
    localIndex: number,
    replacement: WordAttempt,
): readonly WordAttempt[] => {
    const next = [...attempts];
    next[localIndex] = replacement;

    return next;
};

const getLocalActiveIndex = (state: TypingTestState): number =>
    state.activeWordIndex - state.wordOffset;

const getActiveAttempt = (state: TypingTestState): WordAttempt | null =>
    state.attempts[getLocalActiveIndex(state)] ?? null;

const appendHistory = (
    state: TypingTestState,
    entries: readonly Omit<SessionAttempt, 'sequence'>[],
): readonly SessionAttempt[] => {
    const sequenceStart = state.history.length;

    return [
        ...state.history,
        ...entries.map((entry, index) => ({
            ...entry,
            sequence: sequenceStart + index,
        })),
    ];
};

const appendGeneratedWords = (state: TypingTestState): TypingTestState => {
    const generated = generateWords(
        state.settings,
        TARGET_EXTENSION_WORDS,
        state.generator,
    );

    return {
        ...state,
        attempts: [...state.attempts, ...generated.words.map(toAttempt)],
        generator: generated.state,
    };
};

const pruneCompletedWords = (state: TypingTestState): TypingTestState => {
    const localActiveIndex = getLocalActiveIndex(state);
    const pruneCount = Math.max(0, localActiveIndex - RETAIN_COMPLETED_WORDS);

    if (pruneCount === 0) {
        return state;
    }

    const pruned = state.attempts.slice(0, pruneCount);
    let archivedCorrect = state.archivedCorrect;
    let archivedCompletedWords = state.archivedCompletedWords;

    pruned.forEach((attempt) => {
        archivedCorrect += countAlignedCorrect(attempt);

        if (attempt.committed) {
            archivedCorrect += 1;
            archivedCompletedWords += 1;
        }
    });

    return {
        ...state,
        attempts: state.attempts.slice(pruneCount),
        wordOffset: state.wordOffset + pruneCount,
        archivedCorrect,
        archivedCompletedWords,
    };
};

const maintainTargetWindow = (state: TypingTestState): TypingTestState => {
    let next = pruneCompletedWords(state);
    const localActiveIndex = getLocalActiveIndex(next);
    const remaining = next.attempts.length - localActiveIndex;

    if (remaining <= TARGET_EXTENSION_THRESHOLD) {
        next = appendGeneratedWords(next);
    }

    return next;
};

const timedDeadline = (state: TypingTestState): number | null => {
    if (state.startedAt === null || state.settings.mode.kind !== 'timed') {
        return null;
    }

    return state.startedAt + state.settings.mode.durationSeconds * 1_000;
};

const collectDueSamples = (
    state: TypingTestState,
    now: number,
): TypingTestState => {
    if (state.phase !== 'running' || state.startedAt === null) {
        return state;
    }

    const elapsedMs = getElapsedMs(state, now);
    const lastSecond =
        state.samples.length === 0
            ? 0
            : Math.floor(
                  state.samples[state.samples.length - 1]!.elapsedMs / 1_000,
              );
    const dueSecond = Math.floor(elapsedMs / 1_000);

    if (dueSecond <= lastSecond) {
        return state;
    }

    const samples: MetricSample[] = [...state.samples];

    for (let second = lastSecond + 1; second <= dueSecond; second += 1) {
        const sampleTime = state.startedAt + second * 1_000;
        const result = getMetrics(state, sampleTime);
        samples.push({
            elapsedMs: second * 1_000,
            wpm: result.wpm,
            rawWpm: result.rawWpm,
            accuracy: result.accuracy,
        });
    }

    return { ...state, samples };
};

const finish = (
    state: TypingTestState,
    reason: FinishReason,
    finishedAt: number,
): TypingTestState => ({
    ...state,
    phase: 'finished',
    finishedAt,
    finishReason: reason,
});

const advanceClock = (
    state: TypingTestState,
    requestedNow: number,
): TypingTestState => {
    if (state.phase !== 'running' || state.startedAt === null) {
        return state;
    }

    const now = safeNow(requestedNow, state.startedAt);
    const deadline = timedDeadline(state);
    const sampled = collectDueSamples(state, now);

    if (deadline !== null && now >= deadline) {
        return finish(sampled, 'timer', deadline);
    }

    return sampled;
};

const isPrintableCharacter = (value: string): boolean =>
    value.length === 1 && /^[!-~]$/.test(value);

const insertCharacter = (
    state: TypingTestState,
    value: string,
    now: number,
): TypingTestState => {
    const active = getActiveAttempt(state);

    if (active === null) {
        return state;
    }

    const localActiveIndex = getLocalActiveIndex(state);
    const characterIndex = active.typed.length;
    const expected = active.target[characterIndex] ?? null;
    const outcome =
        expected === null
            ? 'extra'
            : expected === value
              ? 'correct'
              : 'incorrect';
    const elapsedMs = getElapsedMs(state, now);
    const history = appendHistory(state, [
        {
            wordIndex: state.activeWordIndex,
            characterIndex,
            actual: value,
            expected,
            outcome,
            elapsedMs,
        },
    ]);

    return {
        ...state,
        attempts: replaceAttempt(state.attempts, localActiveIndex, {
            ...active,
            typed: active.typed + value,
        }),
        history,
    };
};

const commitWord = (state: TypingTestState, now: number): TypingTestState => {
    const active = getActiveAttempt(state);

    if (active === null || active.typed.length === 0) {
        return state;
    }

    const elapsedMs = getElapsedMs(state, now);
    const entries: Omit<SessionAttempt, 'sequence'>[] = [];

    for (
        let index = active.typed.length;
        index < active.target.length;
        index += 1
    ) {
        entries.push({
            wordIndex: state.activeWordIndex,
            characterIndex: index,
            actual: null,
            expected: active.target[index] ?? null,
            outcome: 'missed',
            elapsedMs,
        });
    }

    entries.push({
        wordIndex: state.activeWordIndex,
        characterIndex: active.target.length,
        actual: ' ',
        expected: ' ',
        outcome: 'correct',
        elapsedMs,
    });

    const committed: TypingTestState = {
        ...state,
        attempts: replaceAttempt(state.attempts, getLocalActiveIndex(state), {
            ...active,
            committed: true,
        }),
        activeWordIndex: state.activeWordIndex + 1,
        history: appendHistory(state, entries),
    };

    return maintainTargetWindow(committed);
};

const eraseCharacter = (state: TypingTestState): TypingTestState => {
    const active = getActiveAttempt(state);

    if (active === null || active.typed.length === 0) {
        return state;
    }

    const localActiveIndex = getLocalActiveIndex(state);

    return {
        ...state,
        attempts: replaceAttempt(state.attempts, localActiveIndex, {
            ...active,
            typed: active.typed.slice(0, -1),
        }),
    };
};

const handleKey = (
    state: TypingTestState,
    action: Extract<TypingAction, { type: 'key' }>,
): TypingTestState => {
    if (state.phase === 'finished') {
        return state;
    }

    if (action.input === KEYBOARD_TOKENS.escape) {
        return advanceClock(state, action.now);
    }

    if (action.input === KEYBOARD_TOKENS.space) {
        if (state.phase === 'ready') {
            return state;
        }

        const current = advanceClock(state, action.now);

        return current.phase === 'running'
            ? commitWord(current, action.now)
            : current;
    }

    if (action.input === KEYBOARD_TOKENS.backspace) {
        if (state.phase === 'ready') {
            return state;
        }

        const current = advanceClock(state, action.now);

        return current.phase === 'running' ? eraseCharacter(current) : current;
    }

    if (!isPrintableCharacter(action.input.value)) {
        return state;
    }

    const now = safeNow(action.now, state.startedAt ?? 0);
    const running =
        state.phase === 'ready'
            ? {
                  ...state,
                  phase: 'running' as const,
                  startedAt: now,
              }
            : state;
    const current = advanceClock(running, now);

    return current.phase === 'running'
        ? insertCharacter(current, action.input.value, now)
        : current;
};

export function typingReducer(
    state: TypingTestState,
    action: TypingAction,
): TypingTestState {
    if (action.type === 'restart') {
        return createInitialState(
            state.settings,
            action.seed ?? nextSessionSeed(state.seed),
        );
    }

    if (action.type === 'settings') {
        if (state.phase === 'running') {
            return state;
        }

        return createInitialState(
            action.settings,
            action.seed ?? nextSessionSeed(state.seed),
        );
    }

    if (action.type === 'tick') {
        return advanceClock(state, action.now);
    }

    if (action.type === 'stop') {
        if (
            state.phase !== 'running' ||
            state.startedAt === null ||
            state.settings.mode.kind !== 'timeless'
        ) {
            return state;
        }

        const now = Math.max(
            state.startedAt,
            safeNow(action.now, state.startedAt),
        );
        const sampled = collectDueSamples(state, now);

        return finish(sampled, 'manual', now);
    }

    return handleKey(state, action);
}

export const isSettingsLocked = (state: TypingTestState): boolean =>
    state.phase === 'running';
