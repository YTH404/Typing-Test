export type KeyboardLayout = 'qwerty' | 'colemak';

export type TypingLanguage = 'english' | 'indonesian';

export type TypingDifficulty = 'easy' | 'hard';

export type TestPhase = 'ready' | 'running' | 'finished';

export type TimedDuration = 15 | 30 | 60 | 120;

export type TestMode =
    { kind: 'timed'; durationSeconds: TimedDuration } | { kind: 'timeless' };

export type TestSettings = {
    layout: KeyboardLayout;
    language: TypingLanguage;
    difficulty: TypingDifficulty;
    punctuation: boolean;
    capitals: boolean;
    mode: TestMode;
};

export type WordAttempt = {
    target: string;
    typed: string;
    committed: boolean;
};

export type SessionAttemptOutcome =
    'correct' | 'incorrect' | 'extra' | 'missed';

/**
 * An append-only record of a printable input or a character skipped by an
 * early word commit. Backspace deliberately never removes these entries.
 */
export type SessionAttempt = {
    sequence: number;
    wordIndex: number;
    characterIndex: number;
    actual: string | null;
    expected: string | null;
    outcome: SessionAttemptOutcome;
    elapsedMs: number;
};

export type FinishReason = 'timer' | 'manual';

export type TestResult = {
    elapsedMs: number;
    wpm: number;
    rawWpm: number;
    accuracy: number;
    correct: number;
    incorrect: number;
    extra: number;
    missed: number;
    completedWords: number;
    reason: FinishReason | null;
};

export type MetricSample = Pick<
    TestResult,
    'elapsedMs' | 'wpm' | 'rawWpm' | 'accuracy'
>;

export type CharacterInput = {
    kind: 'character';
    value: string;
};

export const KEYBOARD_TOKENS = {
    backspace: 'backspace',
    escape: 'escape',
    space: 'space',
} as const;

export type KeyboardToken =
    (typeof KEYBOARD_TOKENS)[keyof typeof KEYBOARD_TOKENS];

export type KeyboardInput = CharacterInput | KeyboardToken;

export type KeyboardEventLike = {
    code: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    repeat?: boolean;
    isComposing?: boolean;
    getModifierState?: (key: string) => boolean;
};

export type WordGeneratorState = {
    profileKey: string | null;
    randomState: number;
    bag: readonly string[];
    bagIndex: number;
    previousWord: string | null;
    sentenceLength: number;
    sentencePosition: number;
    internalPunctuationIndex: number | null;
    internalPunctuationMark: ',' | ';' | ':' | null;
};

export type TypingTestState = {
    phase: TestPhase;
    settings: TestSettings;
    attempts: readonly WordAttempt[];
    activeWordIndex: number;
    wordOffset: number;
    history: readonly SessionAttempt[];
    startedAt: number | null;
    finishedAt: number | null;
    finishReason: FinishReason | null;
    samples: readonly MetricSample[];
    archivedCorrect: number;
    archivedCompletedWords: number;
    seed: number;
    generator: WordGeneratorState;
};

export type TypingAction =
    | { type: 'key'; input: KeyboardInput; now: number }
    | { type: 'tick'; now: number }
    | { type: 'stop'; now: number }
    | { type: 'restart'; seed?: number }
    | { type: 'settings'; settings: TestSettings; seed?: number };
