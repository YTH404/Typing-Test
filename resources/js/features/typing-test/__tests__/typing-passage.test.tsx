import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    findWordRow,
    getRetirableRowCount,
    getTargetFirstRow,
    groupWordMeasurements,
} from '@/features/typing-test/components/passage-layout';
import { TypingPassage } from '@/features/typing-test/components/typing-passage';
import type { TestPhase, WordAttempt } from '@/features/typing-test/core';

const TARGETS = [
    'quiet',
    'hands',
    'find',
    'rhythm',
    'soft',
    'pace',
    'clear',
    'calm',
    'focus',
    'again',
] as const;
const ATTEMPTS: readonly WordAttempt[] = TARGETS.map((target) => ({
    target,
    typed: '',
    committed: false,
}));
const BASE_INDEX = 40;
const INITIAL_ROW_PLAN = new Map([
    [40, 0],
    [41, 0],
    [42, 0],
    [43, 1],
    [44, 1],
    [45, 2],
    [46, 2],
    [47, 3],
    [48, 3],
    [49, 4],
]);

const passageElement = (
    attempts: readonly WordAttempt[] = ATTEMPTS,
    activeWordIndex = BASE_INDEX,
    wordOffset = BASE_INDEX,
    phase: TestPhase = 'running',
) => (
    <TypingPassage
        attempts={attempts}
        activeWordIndex={activeWordIndex}
        wordOffset={wordOffset}
        phase={phase}
        inputRef={createRef<HTMLTextAreaElement>()}
        onKeyDown={vi.fn()}
        onPaste={vi.fn()}
    />
);

const renderPassage = (
    attempts: readonly WordAttempt[] = ATTEMPTS,
    activeWordIndex = BASE_INDEX,
    wordOffset = BASE_INDEX,
    phase: TestPhase = 'running',
) => render(passageElement(attempts, activeWordIndex, wordOffset, phase));

const getTrack = (container: HTMLElement): HTMLElement => {
    const track = container.querySelector<HTMLElement>('.typing-words');

    expect(track).not.toBeNull();

    return track!;
};

const getWord = (container: HTMLElement, index: number): HTMLElement => {
    const word = container.querySelector<HTMLElement>(
        `.typing-word[data-word-index="${index}"]`,
    );

    expect(word).not.toBeNull();

    return word!;
};

const getRowStarts = (container: HTMLElement): string[] =>
    Array.from(
        container.querySelectorAll<HTMLElement>('[data-row-start-index]'),
    ).map((row) => row.dataset.rowStartIndex ?? '');

const originalOffsetTop = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetTop',
);
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
let reduceMotion = false;
let nextFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();
let rowPlan = new Map(INITIAL_ROW_PLAN);
let measurementReads = 0;

const runNextFrame = (timestamp: number) => {
    const entry = animationFrames.entries().next().value as
        [number, FrameRequestCallback] | undefined;

    expect(entry).toBeDefined();

    if (entry === undefined) {
        return;
    }

    const [frameId, callback] = entry;
    animationFrames.delete(frameId);
    act(() => callback(timestamp));
};

beforeEach(() => {
    reduceMotion = false;
    nextFrameId = 0;
    animationFrames = new Map();
    rowPlan = new Map(INITIAL_ROW_PLAN);
    measurementReads = 0;

    vi.stubGlobal(
        'matchMedia',
        vi.fn(
            (query: string) =>
                ({
                    matches:
                        query === '(prefers-reduced-motion: reduce)' &&
                        reduceMotion,
                    media: query,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    dispatchEvent: vi.fn(() => true),
                }) as MediaQueryList,
        ),
    );
    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((callback: FrameRequestCallback) => {
            nextFrameId += 1;
            animationFrames.set(nextFrameId, callback);

            return nextFrameId;
        }),
    );
    vi.stubGlobal(
        'cancelAnimationFrame',
        vi.fn((id: number) => animationFrames.delete(id)),
    );
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
        (element, pseudoElement) => {
            const computedStyle = nativeGetComputedStyle(
                element,
                pseudoElement,
            );

            return new Proxy(computedStyle, {
                get(target, property) {
                    if (property === 'fontSize') {
                        return '20px';
                    }

                    if (property === 'lineHeight') {
                        return '32px';
                    }

                    const value = Reflect.get(
                        target,
                        property,
                        target,
                    ) as unknown;

                    return typeof value === 'function'
                        ? value.bind(target)
                        : value;
                },
            });
        },
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
        configurable: true,
        get() {
            const element = this as HTMLElement;
            const index = Number(element.dataset.measureIndex);

            measurementReads += 1;

            return Number.isInteger(index) ? (rowPlan.get(index) ?? 0) * 32 : 0;
        },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();

    if (originalOffsetTop === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, 'offsetTop');
    } else {
        Object.defineProperty(
            HTMLElement.prototype,
            'offsetTop',
            originalOffsetTop,
        );
    }
});

describe('passage row layout', () => {
    it('groups measured words, targets the middle row, and retires only complete rows', () => {
        const rows = groupWordMeasurements([
            { index: 40, top: 0 },
            { index: 41, top: 0.4 },
            { index: 42, top: 32 },
            { index: 43, top: 32.3 },
            { index: 44, top: 64 },
        ]);

        expect(rows.map((row) => row.wordIndices)).toEqual([
            [40, 41],
            [42, 43],
            [44],
        ]);
        expect(findWordRow(rows, 44)).toBe(2);
        expect(getTargetFirstRow(2)).toBe(1);
        expect(getRetirableRowCount(rows, 2, 42)).toBe(1);
        expect(getRetirableRowCount(rows, 2, 41)).toBe(0);
    });
});

describe('TypingPassage', () => {
    it('renders frozen measured rows and a one-character gap after every word', () => {
        const { container } = renderPassage();
        const words = Array.from(
            container.querySelectorAll<HTMLElement>('.typing-word'),
        );

        expect(getRowStarts(container)).toEqual(['40', '43', '45', '47', '49']);

        words.forEach((word) => {
            const gap = word.nextElementSibling;

            expect(gap).toHaveClass('typing-gap');
            expect(gap).toHaveAttribute('aria-hidden', 'true');
            expect(gap?.textContent).toBe('\u00a0');
        });

        expect(getWord(container, 40)).toHaveAttribute('data-active', 'true');
        expect(getWord(container, 40).nextElementSibling).toHaveClass(
            'typing-gap--active',
        );
    });

    it('does not move while the active word remains within the first two rows', () => {
        const { container, rerender } = renderPassage();
        const track = getTrack(container);

        rerender(passageElement(ATTEMPTS, 43));

        expect(track).toHaveStyle('transform: translate3d(0, 0px, 0)');
        expect(track).toHaveAttribute('data-first-visible-row', '0');
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('coalesces forward progress onto the latest logical row target', () => {
        const { container, rerender } = renderPassage();
        const track = getTrack(container);

        rerender(passageElement(ATTEMPTS, 45));
        expect(animationFrames.size).toBe(1);

        rerender(passageElement(ATTEMPTS, 47));

        expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
        expect(animationFrames.size).toBe(1);

        runNextFrame(180);

        expect(track).toHaveStyle('transform: translate3d(0, -64px, 0)');
        expect(track).toHaveAttribute('data-first-visible-row', '2');
        expect(track).toHaveAttribute('data-target-first-row', '2');
        expect(animationFrames.size).toBe(0);
    });

    it('snaps logical row progress when reduced motion is requested', () => {
        reduceMotion = true;
        const { container, rerender } = renderPassage();
        const track = getTrack(container);

        rerender(passageElement(ATTEMPTS, 45));

        expect(track).toHaveStyle('transform: translate3d(0, -32px, 0)');
        expect(track).toHaveAttribute('data-first-visible-row', '1');
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('keeps partial pruned rows intact and retires only a complete offscreen row', () => {
        reduceMotion = true;
        const { container, rerender } = renderPassage(ATTEMPTS, 47);
        const track = getTrack(container);
        const retainedWord = getWord(container, 43);
        const retainedRow = retainedWord.parentElement;

        expect(track).toHaveStyle('transform: translate3d(0, -64px, 0)');

        rerender(passageElement(ATTEMPTS.slice(1), 47, 41));

        expect(getRowStarts(container)[0]).toBe('40');
        expect(getWord(container, 43)).toBe(retainedWord);
        expect(getWord(container, 43).parentElement).toBe(retainedRow);
        expect(track).toHaveStyle('transform: translate3d(0, -64px, 0)');

        rerender(passageElement(ATTEMPTS.slice(3), 47, 43));

        expect(getRowStarts(container)).toEqual(['43', '45', '47', '49']);
        expect(container.querySelector('[data-word-index="40"]')).toBeNull();
        expect(getWord(container, 43)).toBe(retainedWord);
        expect(getWord(container, 43).parentElement).toBe(retainedRow);
        expect(track).toHaveStyle('transform: translate3d(0, -32px, 0)');
        expect(track).toHaveAttribute('data-first-visible-row', '2');
        expect(animationFrames.size).toBe(0);
    });

    it('keeps row membership frozen when the active word gains extra characters', () => {
        const { container, rerender } = renderPassage(ATTEMPTS, 45);
        const originalRows = getRowStarts(container);
        const activeWord = getWord(container, 45);
        const activeRow = activeWord.parentElement;
        const measurementsBeforeTyping = measurementReads;
        const expandedAttempts = ATTEMPTS.map((attempt, localIndex) =>
            localIndex === 5
                ? {
                      ...attempt,
                      typed: `${attempt.target}xxxxxxxx`,
                  }
                : attempt,
        );

        animationFrames.clear();
        rerender(passageElement(expandedAttempts, 45));

        expect(getRowStarts(container)).toEqual(originalRows);
        expect(getWord(container, 45)).toBe(activeWord);
        expect(getWord(container, 45).parentElement).toBe(activeRow);
        expect(getWord(container, 45)).toHaveTextContent('pacexxxxxxxx');
        expect(measurementReads).toBe(measurementsBeforeTyping);
        expect(animationFrames.size).toBe(0);
    });

    it('re-packs only on resize and snaps the active word to the middle row', () => {
        const { container } = renderPassage(ATTEMPTS, 45);
        const track = getTrack(container);

        animationFrames.clear();
        rowPlan = new Map([
            [40, 0],
            [41, 0],
            [42, 1],
            [43, 1],
            [44, 2],
            [45, 2],
            [46, 3],
            [47, 3],
            [48, 4],
            [49, 4],
        ]);

        act(() => window.dispatchEvent(new Event('resize')));
        expect(animationFrames.size).toBe(1);
        runNextFrame(0);

        expect(getRowStarts(container)).toEqual(['40', '42', '44', '46', '48']);
        expect(track).toHaveStyle('transform: translate3d(0, -32px, 0)');
        expect(track).toHaveAttribute('data-first-visible-row', '1');
        expect(animationFrames.size).toBe(0);
    });

    it('uses pointer-first focus recovery without changing interactive targets', () => {
        const { container, getByRole } = renderPassage();
        const input = getByRole('textbox', { name: 'Typing input' });
        const track = getTrack(container);

        input.blur();
        const passageWasNotCancelled = fireEvent.pointerDown(track, {
            button: 0,
            isPrimary: true,
        });

        expect(passageWasNotCancelled).toBe(false);
        expect(input).toHaveFocus();

        input.blur();
        const inputWasNotCancelled = fireEvent.pointerDown(input, {
            button: 0,
            isPrimary: true,
        });

        expect(inputWasNotCancelled).toBe(true);

        input.blur();
        const secondaryWasNotCancelled = fireEvent.pointerDown(track, {
            button: 2,
            isPrimary: true,
        });

        expect(secondaryWasNotCancelled).toBe(true);
        expect(input).not.toHaveFocus();

        const nonPrimaryWasNotCancelled = fireEvent.pointerDown(track, {
            button: 0,
            isPrimary: false,
        });

        expect(nonPrimaryWasNotCancelled).toBe(true);
        expect(input).not.toHaveFocus();
    });

    it('describes Space as a lock and limits Backspace to the current word', () => {
        const { getByText } = renderPassage();

        expect(
            getByText(
                /After typing at least one character, Space permanently locks the current word and advances to the next word\./i,
            ),
        ).toBeInTheDocument();
        expect(
            getByText(/Backspace edits only the current, unlocked word\./i),
        ).toBeInTheDocument();
    });
});
