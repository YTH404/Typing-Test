import { PHYSICAL_KEY_ERGONOMICS, PHYSICAL_LAYOUTS } from './keyboard';
import type { PhysicalKeyErgonomics } from './keyboard';
import type { KeyboardLayout, TypingDifficulty, TypingLanguage } from './types';
import { ENGLISH_WORDS } from './words';
import { INDONESIAN_WORDS } from './words-id';

const ROW_EFFORT = {
    home: 0,
    top: 0.45,
    bottom: 0.55,
} as const;

const FINGER_EFFORT = {
    index: 0,
    middle: 0.08,
    ring: 0.18,
    pinky: 0.35,
} as const;

const INNER_INDEX_COLUMN_EFFORT = 0.15;
const SAME_FINGER_EFFORT = 1.2;
const SAME_HAND_EFFORT = 0.2;
const ROW_DISTANCE_EFFORT = 0.2;
const TWO_ROW_JUMP_EFFORT = 0.25;
const LENGTH_EFFORT = 0.12;
const SAME_HAND_RUN_EFFORT = 0.12;
const POOL_RATIO = 0.45;

export const WORD_BANKS: Readonly<Record<TypingLanguage, readonly string[]>> =
    Object.freeze({
        english: ENGLISH_WORDS,
        indonesian: INDONESIAN_WORDS,
    });

const asciiCompare = (left: string, right: string): number => {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
};

const buildCharacterPositions = (
    layout: KeyboardLayout,
): Readonly<Record<string, PhysicalKeyErgonomics>> => {
    const positions: Record<string, PhysicalKeyErgonomics> = {};

    Object.entries(PHYSICAL_LAYOUTS[layout]).forEach(([code, value]) => {
        if (!/^[a-z]$/.test(value)) {
            return;
        }

        const ergonomics = PHYSICAL_KEY_ERGONOMICS[code];

        if (ergonomics === undefined) {
            throw new Error(`Missing ergonomic metadata for ${code}.`);
        }

        positions[value] = ergonomics;
    });

    return Object.freeze(positions);
};

const CHARACTER_POSITIONS: Readonly<
    Record<KeyboardLayout, Readonly<Record<string, PhysicalKeyErgonomics>>>
> = Object.freeze({
    qwerty: buildCharacterPositions('qwerty'),
    colemak: buildCharacterPositions('colemak'),
});

const keyEffort = (position: PhysicalKeyErgonomics): number =>
    ROW_EFFORT[position.row] +
    FINGER_EFFORT[position.finger] +
    (position.innerIndexColumn ? INNER_INDEX_COLUMN_EFFORT : 0);

const adjacentPairEffort = (
    first: PhysicalKeyErgonomics,
    second: PhysicalKeyErgonomics,
): number => {
    const sameHand = first.hand === second.hand;
    const sameFinger = sameHand && first.finger === second.finger;
    const rowDistance = Math.abs(first.rowIndex - second.rowIndex);

    return (
        (sameFinger ? SAME_FINGER_EFFORT : 0) +
        (sameHand ? SAME_HAND_EFFORT : 0) +
        ROW_DISTANCE_EFFORT * rowDistance +
        (rowDistance === 2 ? TWO_ROW_JUMP_EFFORT : 0)
    );
};

const getSameHandRunExcess = (
    positions: readonly PhysicalKeyErgonomics[],
): number => {
    if (positions.length === 0) {
        return 0;
    }

    let excess = 0;
    let runLength = 1;

    for (let index = 1; index < positions.length; index += 1) {
        if (positions[index]!.hand === positions[index - 1]!.hand) {
            runLength += 1;
        } else {
            excess += Math.max(0, runLength - 2);
            runLength = 1;
        }
    }

    return excess + Math.max(0, runLength - 2);
};

export function getTypingDifficultyScore(
    word: string,
    layout: KeyboardLayout,
): number {
    if (!/^[a-z]+$/.test(word)) {
        throw new Error(
            `Typing difficulty requires a lowercase ASCII word: ${word}`,
        );
    }

    const characterPositions = CHARACTER_POSITIONS[layout];
    const positions = [...word].map((character) => {
        const position = characterPositions[character];

        if (position === undefined) {
            throw new Error(
                `No ${layout} physical-key position exists for ${character}.`,
            );
        }

        return position;
    });
    const averageKeyEffort =
        positions.reduce((total, position) => total + keyEffort(position), 0) /
        positions.length;
    let averagePairEffort = 0;

    if (positions.length > 1) {
        let pairEffort = 0;

        for (let index = 1; index < positions.length; index += 1) {
            pairEffort += adjacentPairEffort(
                positions[index - 1]!,
                positions[index]!,
            );
        }

        averagePairEffort = pairEffort / (positions.length - 1);
    }

    const lengthPenalty = LENGTH_EFFORT * Math.max(0, word.length - 5);
    const sameHandRunPenalty =
        (SAME_HAND_RUN_EFFORT * getSameHandRunExcess(positions)) /
        positions.length;

    return (
        averageKeyEffort +
        averagePairEffort +
        lengthPenalty +
        sameHandRunPenalty
    );
}

const poolCache = new Map<string, readonly string[]>();

export function getWordPool(
    language: TypingLanguage,
    layout: KeyboardLayout,
    difficulty: TypingDifficulty,
): readonly string[] {
    const cacheKey = `${language}:${layout}:${difficulty}`;
    const cached = poolCache.get(cacheKey);

    if (cached !== undefined) {
        return cached;
    }

    const bank = WORD_BANKS[language];
    const ranked = [...bank].sort((left, right) => {
        const scoreDifference =
            getTypingDifficultyScore(left, layout) -
            getTypingDifficultyScore(right, layout);

        return scoreDifference === 0
            ? asciiCompare(left, right)
            : scoreDifference;
    });
    const poolSize = Math.floor(bank.length * POOL_RATIO);
    const pool = Object.freeze(
        difficulty === 'easy'
            ? ranked.slice(0, poolSize)
            : ranked.slice(ranked.length - poolSize),
    );

    poolCache.set(cacheKey, pool);

    return pool;
}
