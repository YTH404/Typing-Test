import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypingPassage } from '@/features/typing-test/components/typing-passage';
import type { TestPhase, WordAttempt } from '@/features/typing-test/core';

const ATTEMPTS: readonly WordAttempt[] = [
    { target: 'quiet', typed: 'quiet', committed: true },
    { target: 'hands', typed: '', committed: false },
    { target: 'find', typed: '', committed: false },
    { target: 'rhythm', typed: '', committed: false },
];

const renderPassage = (
    attempts: readonly WordAttempt[] = ATTEMPTS,
    activeWordIndex = 41,
    wordOffset = 40,
    phase: TestPhase = 'running',
) =>
    render(
        <TypingPassage
            attempts={attempts}
            activeWordIndex={activeWordIndex}
            wordOffset={wordOffset}
            phase={phase}
            inputRef={createRef<HTMLTextAreaElement>()}
            onKeyDown={vi.fn()}
            onPaste={vi.fn()}
        />,
    );

const getWords = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>('.typing-word'));

const originalOffsetTop = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetTop',
);
let reduceMotion = false;
let nextFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
    reduceMotion = false;
    nextFrameId = 0;
    animationFrames = new Map();

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
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        fontSize: '20px',
        lineHeight: '32px',
    } as CSSStyleDeclaration);
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
        configurable: true,
        get() {
            const word = this as HTMLElement;
            const siblings = Array.from(
                word.parentElement?.querySelectorAll<HTMLElement>(
                    '[data-word-index]',
                ) ?? [],
            );

            return Math.max(0, siblings.indexOf(word)) * 32;
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

describe('TypingPassage', () => {
    it('renders an explicit one-character gap after every globally indexed word', () => {
        const { container } = renderPassage();
        const words = getWords(container);
        const gaps = Array.from(
            container.querySelectorAll<HTMLElement>('.typing-gap'),
        );

        expect(words.map((word) => word.dataset.wordIndex)).toEqual([
            '40',
            '41',
            '42',
            '43',
        ]);
        expect(gaps).toHaveLength(words.length);

        words.forEach((word, index) => {
            const gap = word.nextElementSibling;

            expect(gap).toBe(gaps[index]);
            expect(gap).toHaveClass('typing-gap');
            expect(gap).toHaveAttribute('aria-hidden', 'true');
            expect(gap?.textContent).toBe('\u00a0');
        });

        expect(words[1]).toHaveAttribute('data-active', 'true');
        expect(gaps[1]).toHaveClass('typing-gap--active');
    });

    it('preserves word node identity and absolute indices across progress and pruning', () => {
        const { container, rerender } = renderPassage();
        const originalWords = new Map(
            getWords(container).map((word) => [word.dataset.wordIndex, word]),
        );

        rerender(
            <TypingPassage
                attempts={ATTEMPTS.slice(1)}
                activeWordIndex={42}
                wordOffset={41}
                phase="running"
                inputRef={createRef<HTMLTextAreaElement>()}
                onKeyDown={vi.fn()}
                onPaste={vi.fn()}
            />,
        );

        const remainingWords = getWords(container);

        expect(remainingWords.map((word) => word.dataset.wordIndex)).toEqual([
            '41',
            '42',
            '43',
        ]);
        remainingWords.forEach((word) => {
            expect(word).toBe(originalWords.get(word.dataset.wordIndex));
        });
        expect(originalWords.get('42')).toHaveAttribute('data-active', 'true');
    });

    it('does not scroll while progress remains within the first two lines', () => {
        const { container, rerender } = renderPassage(ATTEMPTS, 40, 40);
        const viewport =
            container.querySelector<HTMLElement>('.typing-viewport');

        rerender(
            <TypingPassage
                attempts={ATTEMPTS}
                activeWordIndex={41}
                wordOffset={40}
                phase="running"
                inputRef={createRef<HTMLTextAreaElement>()}
                onKeyDown={vi.fn()}
                onPaste={vi.fn()}
            />,
        );

        expect(viewport).not.toBeNull();
        expect(viewport!.scrollTop).toBe(0);
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('coalesces rapid third-line progress into one smooth line scroll', () => {
        const { container, rerender } = renderPassage();
        const viewport =
            container.querySelector<HTMLElement>('.typing-viewport');

        expect(viewport).not.toBeNull();
        expect(animationFrames.size).toBe(0);

        rerender(
            <TypingPassage
                attempts={ATTEMPTS}
                activeWordIndex={42}
                wordOffset={40}
                phase="running"
                inputRef={createRef<HTMLTextAreaElement>()}
                onKeyDown={vi.fn()}
                onPaste={vi.fn()}
            />,
        );
        rerender(
            <TypingPassage
                attempts={ATTEMPTS}
                activeWordIndex={43}
                wordOffset={40}
                phase="running"
                inputRef={createRef<HTMLTextAreaElement>()}
                onKeyDown={vi.fn()}
                onPaste={vi.fn()}
            />,
        );

        expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
        expect(animationFrames.size).toBe(1);

        const [frameId, pendingFrame] = animationFrames.entries().next().value!;

        expect(pendingFrame).toBeDefined();
        animationFrames.delete(frameId);
        act(() => pendingFrame!(180));

        expect(viewport!.scrollTop).toBe(64);
        expect(animationFrames.size).toBe(0);
    });

    it('snaps third-line progress without scheduling motion when reduced motion is requested', () => {
        reduceMotion = true;
        const { container, rerender } = renderPassage();
        const viewport =
            container.querySelector<HTMLElement>('.typing-viewport');

        rerender(
            <TypingPassage
                attempts={ATTEMPTS}
                activeWordIndex={42}
                wordOffset={40}
                phase="running"
                inputRef={createRef<HTMLTextAreaElement>()}
                onKeyDown={vi.fn()}
                onPaste={vi.fn()}
            />,
        );

        expect(viewport).not.toBeNull();
        expect(viewport!.scrollTop).toBe(32);
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('snaps to the middle line after resize and compensates a pruned prefix', () => {
        const { container, rerender } = renderPassage(ATTEMPTS, 42, 40);
        const viewport =
            container.querySelector<HTMLElement>('.typing-viewport');

        expect(viewport).not.toBeNull();

        act(() => window.dispatchEvent(new Event('resize')));
        expect(animationFrames.size).toBe(1);

        const [resizeFrameId, resizeFrame] = animationFrames
            .entries()
            .next().value!;
        animationFrames.delete(resizeFrameId);
        act(() => resizeFrame(0));

        expect(viewport!.scrollTop).toBe(32);
        expect(animationFrames.size).toBe(0);

        rerender(
            <TypingPassage
                attempts={ATTEMPTS.slice(1)}
                activeWordIndex={42}
                wordOffset={41}
                phase="running"
                inputRef={createRef<HTMLTextAreaElement>()}
                onKeyDown={vi.fn()}
                onPaste={vi.fn()}
            />,
        );

        expect(viewport!.scrollTop).toBe(0);
        expect(animationFrames.size).toBe(0);
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
