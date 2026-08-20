import { describe, expect, it } from 'vitest';

import {
    COMMON_WORDS,
    createWordGeneratorState,
    generateWordBatch,
    generateWords,
} from '@/features/typing-test/core';
import type { TestSettings } from '@/features/typing-test/core';

const settings = (overrides: Partial<TestSettings> = {}): TestSettings => ({
    layout: 'qwerty',
    punctuation: false,
    capitals: false,
    mode: { kind: 'timed', durationSeconds: 60 },
    ...overrides,
});

const stripDecoration = (word: string): string =>
    word.replace(/[,:;.!?]$/, '').toLowerCase();

describe('common-word generator', () => {
    it('ships roughly 500 unique, lowercase, ASCII project words', () => {
        expect(COMMON_WORDS.length).toBeGreaterThanOrEqual(500);
        expect(COMMON_WORDS.length).toBeLessThanOrEqual(550);
        expect(new Set(COMMON_WORDS).size).toBe(COMMON_WORDS.length);

        COMMON_WORDS.forEach((word) => {
            expect(word).toMatch(/^[a-z]+$/);
        });
    });

    it('is deterministic for a seed and differs for another seed', () => {
        const first = generateWordBatch(settings(), 60, 12345);
        const repeated = generateWordBatch(settings(), 60, 12345);
        const different = generateWordBatch(settings(), 60, 54321);

        expect(repeated).toEqual(first);
        expect(different).not.toEqual(first);
    });

    it('continues stateful batches exactly like one long generation', () => {
        const initial = createWordGeneratorState(99);
        const first = generateWords(settings(), 73, initial);
        const second = generateWords(settings(), 91, first.state);
        const combined = generateWords(settings(), 164, initial);

        expect([...first.words, ...second.words]).toEqual(combined.words);
        expect(second.state).toEqual(combined.state);
    });

    it('never emits immediate duplicate base words across bag boundaries', () => {
        const words = generateWordBatch(
            settings(),
            COMMON_WORDS.length * 2 + 25,
            2026,
        );

        for (let index = 1; index < words.length; index += 1) {
            expect(stripDecoration(words[index]!)).not.toBe(
                stripDecoration(words[index - 1]!),
            );
        }
    });

    it('keeps plain mode lowercase and punctuation-free', () => {
        const words = generateWordBatch(settings(), 250, 7);

        words.forEach((word) => {
            expect(word).toMatch(/^[a-z]+$/);
        });
    });

    it('adds capitals independently at approximately ten percent', () => {
        const words = generateWordBatch(settings({ capitals: true }), 500, 777);
        const capitalized = words.filter((word) => /^[A-Z]/.test(word));

        expect(capitalized.length).toBeGreaterThanOrEqual(30);
        expect(capitalized.length).toBeLessThanOrEqual(70);
        words.forEach((word) => expect(word).toMatch(/^[A-Za-z]+$/));
    });

    it('forms lowercase punctuated sentence groups of 8-12 words', () => {
        const words = generateWordBatch(
            settings({ punctuation: true }),
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
    });

    it('capitalizes every sentence start when both toggles are enabled', () => {
        const words = generateWordBatch(
            settings({ punctuation: true, capitals: true }),
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
    });

    it('supports every punctuation/capital combination deterministically', () => {
        const combinations = [
            settings(),
            settings({ capitals: true }),
            settings({ punctuation: true }),
            settings({ punctuation: true, capitals: true }),
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
    });

    it('returns an empty batch for zero or negative counts', () => {
        expect(generateWordBatch(settings(), 0, 1)).toEqual([]);
        expect(generateWordBatch(settings(), -20, 1)).toEqual([]);
    });
});
