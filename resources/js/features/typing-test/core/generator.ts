import { getWordPool } from './difficulty';
import type { TestSettings, WordGeneratorState } from './types';

const DEFAULT_SEED = 0x6d2b79f5;

type RandomResult = {
    value: number;
    state: number;
};

type GeneratedWords = {
    words: readonly string[];
    state: WordGeneratorState;
};

const normalizeSeed = (seed: number): number => {
    if (!Number.isFinite(seed)) {
        return DEFAULT_SEED;
    }

    return Math.trunc(seed) >>> 0;
};

const nextRandom = (randomState: number): RandomResult => {
    const state = (randomState + 0x6d2b79f5) >>> 0;
    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return {
        value: ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296,
        state,
    };
};

const randomInteger = (
    state: number,
    minimum: number,
    maximum: number,
): { value: number; state: number } => {
    const random = nextRandom(state);

    return {
        value: minimum + Math.floor(random.value * (maximum - minimum + 1)),
        state: random.state,
    };
};

const shuffleWords = (
    randomState: number,
    previousWord: string | null,
    words: readonly string[],
): { bag: readonly string[]; randomState: number } => {
    const bag = [...words];
    let state = randomState;

    for (let index = bag.length - 1; index > 0; index -= 1) {
        const choice = randomInteger(state, 0, index);
        state = choice.state;
        [bag[index], bag[choice.value]] = [bag[choice.value], bag[index]];
    }

    if (bag[0] === previousWord && bag.length > 1) {
        [bag[0], bag[1]] = [bag[1], bag[0]];
    }

    return { bag, randomState: state };
};

const capitalize = (word: string): string =>
    `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

const chooseInternalMark = (
    randomState: number,
): { mark: ',' | ';' | ':'; randomState: number } => {
    const random = nextRandom(randomState);

    if (random.value < 0.7) {
        return { mark: ',', randomState: random.state };
    }

    if (random.value < 0.9) {
        return { mark: ';', randomState: random.state };
    }

    return { mark: ':', randomState: random.state };
};

const chooseTerminalMark = (
    randomState: number,
): { mark: '.' | '?' | '!'; randomState: number } => {
    const random = nextRandom(randomState);

    if (random.value < 0.7) {
        return { mark: '.', randomState: random.state };
    }

    if (random.value < 0.9) {
        return { mark: '?', randomState: random.state };
    }

    return { mark: '!', randomState: random.state };
};

export function createWordGeneratorState(seed: number): WordGeneratorState {
    return {
        profileKey: null,
        randomState: normalizeSeed(seed),
        bag: [],
        bagIndex: 0,
        previousWord: null,
        sentenceLength: 0,
        sentencePosition: 0,
        internalPunctuationIndex: null,
        internalPunctuationMark: null,
    };
}

const prepareSentence = (generator: WordGeneratorState): WordGeneratorState => {
    const length = randomInteger(generator.randomState, 8, 12);
    const internalPunctuationChoice = nextRandom(length.state);

    if (internalPunctuationChoice.value >= 0.65) {
        return {
            ...generator,
            randomState: internalPunctuationChoice.state,
            sentenceLength: length.value,
            sentencePosition: 0,
            internalPunctuationIndex: null,
            internalPunctuationMark: null,
        };
    }

    const punctuationIndex = randomInteger(
        internalPunctuationChoice.state,
        2,
        length.value - 3,
    );
    const punctuationMark = chooseInternalMark(punctuationIndex.state);

    return {
        ...generator,
        randomState: punctuationMark.randomState,
        sentenceLength: length.value,
        sentencePosition: 0,
        internalPunctuationIndex: punctuationIndex.value,
        internalPunctuationMark: punctuationMark.mark,
    };
};

const getProfileKey = (settings: TestSettings): string =>
    [
        settings.language,
        settings.difficulty,
        settings.layout,
        settings.punctuation ? 'punctuation' : 'plain',
        settings.capitals ? 'capitals' : 'lowercase',
    ].join(':');

const bindProfile = (
    generator: WordGeneratorState,
    settings: TestSettings,
): WordGeneratorState => {
    const profileKey = getProfileKey(settings);

    if (generator.profileKey === profileKey) {
        return generator;
    }

    return {
        ...generator,
        profileKey,
        bag: [],
        bagIndex: 0,
        previousWord: null,
        sentenceLength: 0,
        sentencePosition: 0,
        internalPunctuationIndex: null,
        internalPunctuationMark: null,
    };
};

const takeWord = (
    generator: WordGeneratorState,
    words: readonly string[],
): { word: string; generator: WordGeneratorState } => {
    let bag = generator.bag;
    let bagIndex = generator.bagIndex;
    let randomState = generator.randomState;

    if (bagIndex >= bag.length) {
        const shuffled = shuffleWords(
            randomState,
            generator.previousWord,
            words,
        );
        bag = shuffled.bag;
        bagIndex = 0;
        randomState = shuffled.randomState;
    }

    const word = bag[bagIndex];

    if (word === undefined) {
        throw new Error('The common-word bag cannot be empty.');
    }

    return {
        word,
        generator: {
            ...generator,
            randomState,
            bag,
            bagIndex: bagIndex + 1,
            previousWord: word,
        },
    };
};

export function generateWords(
    settings: TestSettings,
    count: number,
    initialState: WordGeneratorState,
): GeneratedWords {
    const words: string[] = [];
    let generator = bindProfile(initialState, settings);
    const pool = getWordPool(
        settings.language,
        settings.layout,
        settings.difficulty,
    );

    for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) {
        if (settings.punctuation && generator.sentenceLength === 0) {
            generator = prepareSentence(generator);
        }

        const selected = takeWord(generator, pool);
        let word = selected.word;
        generator = selected.generator;

        if (settings.capitals) {
            if (settings.punctuation && generator.sentencePosition === 0) {
                word = capitalize(word);
            } else if (!settings.punctuation) {
                const capitalChoice = nextRandom(generator.randomState);
                generator = {
                    ...generator,
                    randomState: capitalChoice.state,
                };

                if (capitalChoice.value < 0.1) {
                    word = capitalize(word);
                }
            }
        }

        if (settings.punctuation) {
            const isSentenceEnd =
                generator.sentencePosition === generator.sentenceLength - 1;

            if (isSentenceEnd) {
                const terminal = chooseTerminalMark(generator.randomState);
                word += terminal.mark;
                generator = {
                    ...generator,
                    randomState: terminal.randomState,
                    sentenceLength: 0,
                    sentencePosition: 0,
                    internalPunctuationIndex: null,
                    internalPunctuationMark: null,
                };
            } else {
                if (
                    generator.sentencePosition ===
                        generator.internalPunctuationIndex &&
                    generator.internalPunctuationMark !== null
                ) {
                    word += generator.internalPunctuationMark;
                }

                generator = {
                    ...generator,
                    sentencePosition: generator.sentencePosition + 1,
                };
            }
        }

        words.push(word);
    }

    return { words, state: generator };
}

export function generateWordBatch(
    settings: TestSettings,
    count: number,
    seed = DEFAULT_SEED,
): readonly string[] {
    return generateWords(settings, count, createWordGeneratorState(seed)).words;
}

export { DEFAULT_SEED };
