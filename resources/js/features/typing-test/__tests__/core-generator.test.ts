import { describe, expect, it } from 'vitest';

import {
    COMMON_WORDS,
    ENGLISH_WORDS,
    INDONESIAN_WORDS,
    WORD_BANKS,
    createWordGeneratorState,
    generateWordBatch,
    generateWords,
    getTypingDifficultyScore,
    getWordPool,
} from '@/features/typing-test/core';
import type {
    KeyboardLayout,
    TestSettings,
    TypingDifficulty,
    TypingLanguage,
} from '@/features/typing-test/core';

const languages: readonly TypingLanguage[] = ['english', 'indonesian'];
const layouts: readonly KeyboardLayout[] = ['qwerty', 'colemak'];
const difficulties: readonly TypingDifficulty[] = ['easy', 'hard'];
const BLOCKED_TOKENS = new Set([
    'asshole',
    'bastard',
    'bitch',
    'fuck',
    'shit',
    'bangsat',
    'jancok',
    'kontol',
    'memek',
    'ngentot',
]);

const profileCases = languages.flatMap((language) =>
    layouts.flatMap((layout) =>
        difficulties.map((difficulty) => ({
            label: `${language} ${layout} ${difficulty}`,
            language,
            layout,
            difficulty,
        })),
    ),
);

const settings = (overrides: Partial<TestSettings> = {}): TestSettings => ({
    layout: 'qwerty',
    language: 'english',
    difficulty: 'easy',
    punctuation: false,
    capitals: false,
    mode: { kind: 'timed', durationSeconds: 60 },
    ...overrides,
});

const stripDecoration = (word: string): string =>
    word.replace(/[,:;.!?]$/, '').toLowerCase();

const meanScore = (words: readonly string[], layout: KeyboardLayout): number =>
    words.reduce(
        (total, word) => total + getTypingDifficultyScore(word, layout),
        0,
    ) / words.length;

describe('layout-aware bilingual word generator', () => {
    it('ships exactly 520 unique lowercase ASCII words per language', () => {
        expect(COMMON_WORDS).toBe(ENGLISH_WORDS);
        expect(ENGLISH_WORDS).toHaveLength(520);
        expect(INDONESIAN_WORDS).toHaveLength(520);

        languages.forEach((language) => {
            const bank = WORD_BANKS[language];

            expect(new Set(bank).size).toBe(520);
            bank.forEach((word) => expect(word).toMatch(/^[a-z]+$/));
            expect(bank.filter((word) => BLOCKED_TOKENS.has(word))).toEqual([]);
        });

        expect(ENGLISH_WORDS).toContain('about');
        expect(INDONESIAN_WORDS).toContain('bahasa');
    });

    it('implements the locked physical-key effort formula', () => {
        expect(getTypingDifficultyScore('f', 'qwerty')).toBe(0);
        expect(getTypingDifficultyScore('t', 'colemak')).toBe(0);
        expect(getTypingDifficultyScore('qz', 'qwerty')).toBeCloseTo(2.9, 10);
        expect(getTypingDifficultyScore('qaq', 'qwerty')).toBeCloseTo(2.29, 10);
        expect(() => getTypingDifficultyScore('Word', 'qwerty')).toThrow(
            /lowercase ASCII/,
        );
    });

    it.each(profileCases)(
        'builds the exact non-overlapping 45% pool for $label',
        ({ language, layout, difficulty }) => {
            const pool = getWordPool(language, layout, difficulty);
            const opposite = getWordPool(
                language,
                layout,
                difficulty === 'easy' ? 'hard' : 'easy',
            );

            expect(pool).toHaveLength(234);
            expect(new Set(pool).size).toBe(234);
            expect(
                pool.every((word) => WORD_BANKS[language].includes(word)),
            ).toBe(true);
            expect(pool.some((word) => opposite.includes(word))).toBe(false);
            expect(getWordPool(language, layout, difficulty)).toBe(pool);
        },
    );

    it.each(
        languages.flatMap((language) =>
            layouts.map((layout) => ({ language, layout })),
        ),
    )(
        'separates $language easy and hard mean effort on $layout',
        ({ language, layout }) => {
            const easy = getWordPool(language, layout, 'easy');
            const hard = getWordPool(language, layout, 'hard');

            expect(meanScore(hard, layout)).toBeGreaterThan(
                meanScore(easy, layout),
            );
        },
    );

    it.each(
        languages.flatMap((language) =>
            difficulties.map((difficulty) => ({ language, difficulty })),
        ),
    )(
        'selects a different $language $difficulty pool for QWERTY and Colemak',
        ({ language, difficulty }) => {
            expect(getWordPool(language, 'qwerty', difficulty)).not.toEqual(
                getWordPool(language, 'colemak', difficulty),
            );
        },
    );

    it.each(profileCases)(
        'is deterministic and chunk-stable for $label',
        ({ language, layout, difficulty }) => {
            const profile = settings({ language, layout, difficulty });
            const first = generateWordBatch(profile, 164, 12345);
            const repeated = generateWordBatch(profile, 164, 12345);
            const different = generateWordBatch(profile, 164, 54321);
            const initial = createWordGeneratorState(12345);
            const firstChunk = generateWords(profile, 73, initial);
            const secondChunk = generateWords(profile, 91, firstChunk.state);

            expect(repeated).toEqual(first);
            expect(different).not.toEqual(first);
            expect([...firstChunk.words, ...secondChunk.words]).toEqual(first);
            expect(
                first.every((word) =>
                    getWordPool(language, layout, difficulty).includes(
                        stripDecoration(word),
                    ),
                ),
            ).toBe(true);
        },
    );

    it.each(profileCases)(
        'avoids immediate duplicates across $label bag boundaries',
        ({ language, layout, difficulty }) => {
            const profile = settings({ language, layout, difficulty });
            const poolLength = getWordPool(language, layout, difficulty).length;
            const words = generateWordBatch(profile, poolLength * 2 + 25, 2026);

            for (let index = 1; index < words.length; index += 1) {
                expect(stripDecoration(words[index]!)).not.toBe(
                    stripDecoration(words[index - 1]!),
                );
            }
        },
    );

    it.each([
        {
            dimension: 'language',
            next: settings({
                language: 'indonesian',
                punctuation: true,
                capitals: true,
            }),
            profileKey: 'indonesian:easy:qwerty:punctuation:capitals',
        },
        {
            dimension: 'difficulty',
            next: settings({
                difficulty: 'hard',
                punctuation: true,
                capitals: true,
            }),
            profileKey: 'english:hard:qwerty:punctuation:capitals',
        },
        {
            dimension: 'layout',
            next: settings({
                layout: 'colemak',
                punctuation: true,
                capitals: true,
            }),
            profileKey: 'english:easy:colemak:punctuation:capitals',
        },
        {
            dimension: 'punctuation',
            next: settings({ capitals: true }),
            profileKey: 'english:easy:qwerty:plain:capitals',
        },
        {
            dimension: 'capitals',
            next: settings({ punctuation: true }),
            profileKey: 'english:easy:qwerty:punctuation:lowercase',
        },
    ])(
        'clears stale bag and sentence state when only $dimension changes',
        ({ next, profileKey }) => {
            const baseline = settings({ punctuation: true, capitals: true });
            const stale = generateWords(
                baseline,
                3,
                createWordGeneratorState(99),
            ).state;
            const reused = generateWords(next, 40, stale);
            const clean = generateWords(
                next,
                40,
                createWordGeneratorState(stale.randomState),
            );
            const expectedPool = getWordPool(
                next.language,
                next.layout,
                next.difficulty,
            );

            expect(stale.bagIndex).toBe(3);
            expect(stale.sentencePosition).toBe(3);
            expect(reused).toEqual(clean);
            expect(reused.state.profileKey).toBe(profileKey);
            expect(
                reused.words.every((word) =>
                    expectedPool.includes(stripDecoration(word)),
                ),
            ).toBe(true);
        },
    );

    it.each(languages)(
        'keeps %s plain mode lowercase and punctuation-free',
        (language) => {
            const words = generateWordBatch(settings({ language }), 250, 7);

            words.forEach((word) => expect(word).toMatch(/^[a-z]+$/));
        },
    );

    it.each(languages)(
        'adds %s capitals independently at approximately ten percent',
        (language) => {
            const words = generateWordBatch(
                settings({ language, capitals: true }),
                500,
                777,
            );
            const capitalized = words.filter((word) => /^[A-Z]/.test(word));

            expect(capitalized.length).toBeGreaterThanOrEqual(30);
            expect(capitalized.length).toBeLessThanOrEqual(70);
            words.forEach((word) => expect(word).toMatch(/^[A-Za-z]+$/));
        },
    );

    it.each(languages)(
        'forms %s punctuated sentence groups of 8-12 words',
        (language) => {
            const words = generateWordBatch(
                settings({ language, punctuation: true }),
                240,
                42,
            );
            let sentenceStart = 0;
            let completedSentences = 0;
            let sentencesWithInternalPunctuation = 0;
            let sentencesWithoutInternalPunctuation = 0;

            words.forEach((word, index) => {
                expect(stripDecoration(word)).toBe(
                    stripDecoration(word).toLowerCase(),
                );

                if (/[.!?]$/.test(word)) {
                    const sentenceLength = index - sentenceStart + 1;
                    const sentence = words.slice(sentenceStart, index + 1);
                    const internalMarks = sentence.filter((entry) =>
                        /[,;:]$/.test(entry),
                    );

                    expect(sentenceLength).toBeGreaterThanOrEqual(8);
                    expect(sentenceLength).toBeLessThanOrEqual(12);
                    expect(internalMarks.length).toBeLessThanOrEqual(1);

                    if (internalMarks.length === 1) {
                        sentencesWithInternalPunctuation += 1;
                    } else {
                        sentencesWithoutInternalPunctuation += 1;
                    }

                    sentenceStart = index + 1;
                    completedSentences += 1;
                }
            });

            expect(completedSentences).toBeGreaterThan(15);
            expect(sentencesWithInternalPunctuation).toBeGreaterThan(0);
            expect(sentencesWithoutInternalPunctuation).toBeGreaterThan(0);
        },
    );

    it.each(languages)(
        'capitalizes every %s sentence start when both toggles are enabled',
        (language) => {
            const words = generateWordBatch(
                settings({ language, punctuation: true, capitals: true }),
                180,
                3,
            );
            let expectSentenceStart = true;

            words.forEach((word) => {
                if (expectSentenceStart) {
                    expect(word).toMatch(/^[A-Z]/);
                }

                expectSentenceStart = /[.!?]$/.test(word);
            });
        },
    );

    it.each(languages)(
        'supports every %s punctuation/capital combination deterministically',
        (language) => {
            const combinations = [
                settings({ language }),
                settings({ language, capitals: true }),
                settings({ language, punctuation: true }),
                settings({ language, punctuation: true, capitals: true }),
            ];

            combinations.forEach((combination) => {
                expect(generateWordBatch(combination, 100, 88)).toEqual(
                    generateWordBatch(combination, 100, 88),
                );
            });

            expect(generateWordBatch(combinations[0]!, 100, 88)).not.toEqual(
                generateWordBatch(combinations[1]!, 100, 88),
            );
            expect(generateWordBatch(combinations[0]!, 100, 88)).not.toEqual(
                generateWordBatch(combinations[2]!, 100, 88),
            );
        },
    );

    it('returns an empty batch for zero or negative counts', () => {
        expect(generateWordBatch(settings(), 0, 1)).toEqual([]);
        expect(generateWordBatch(settings(), -20, 1)).toEqual([]);
    });
});
