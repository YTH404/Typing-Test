import {
    Fragment,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
} from 'react';
import type {
    ClipboardEvent,
    KeyboardEvent,
    MouseEvent,
    RefObject,
} from 'react';

import type { TestPhase, WordAttempt } from '../core/types';

type TypingPassageProps = {
    attempts: readonly WordAttempt[];
    activeWordIndex: number;
    wordOffset: number;
    phase: TestPhase;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
};

type WordTokenProps = {
    attempt: WordAttempt;
    absoluteIndex: number;
    active: boolean;
};

const SCROLL_DURATION_MS = 180;

const renderCharacter = (
    attempt: WordAttempt,
    index: number,
    active: boolean,
) => {
    const target = attempt.target[index];
    const actual = attempt.typed[index];
    const hasTypedCharacter = actual !== undefined;
    const isExtra = target === undefined;
    const isCorrect = hasTypedCharacter && actual === target;
    const isIncorrect = hasTypedCharacter && !isCorrect && !isExtra;
    const isMissed =
        attempt.committed && !hasTypedCharacter && target !== undefined;
    const isCaret = active && index === attempt.typed.length;
    const character = hasTypedCharacter ? actual : (target ?? '');
    const classNames = ['typing-char'];

    if (isCorrect) {
        classNames.push('typing-char--correct');
    }

    if (isIncorrect) {
        classNames.push('typing-char--incorrect');
    }

    if (isExtra) {
        classNames.push('typing-char--extra');
    }

    if (isMissed) {
        classNames.push('typing-char--missed');
    }

    if (isCaret) {
        classNames.push('typing-char--caret');
    }

    return (
        <span className={classNames.join(' ')} key={index}>
            {character}
        </span>
    );
};

const WordToken = memo(function WordToken({
    attempt,
    absoluteIndex,
    active,
}: WordTokenProps) {
    const characterCount = Math.max(
        attempt.target.length,
        attempt.typed.length,
    );
    const characters = Array.from({ length: characterCount }, (_, index) =>
        renderCharacter(attempt, index, active),
    );

    if (active && attempt.typed.length === characterCount) {
        characters.push(
            <span className="typing-char typing-char--caret" key="caret">
                {'\u200b'}
            </span>,
        );
    }

    return (
        <Fragment>
            <span
                className={
                    active ? 'typing-word typing-word--active' : 'typing-word'
                }
                data-active={active || undefined}
                data-word-index={absoluteIndex}
            >
                {characters}
            </span>
            <span
                className={
                    active ? 'typing-gap typing-gap--active' : 'typing-gap'
                }
                data-after-word-index={absoluteIndex}
                aria-hidden="true"
            >
                {'\u00a0'}
            </span>
            <wbr />
        </Fragment>
    );
});

const getLineHeight = (track: HTMLElement, activeWord: HTMLElement): number => {
    const styles = window.getComputedStyle(track);
    const parsedLineHeight = Number.parseFloat(styles.lineHeight);
    const parsedFontSize = Number.parseFloat(styles.fontSize);

    if (Number.isFinite(parsedLineHeight)) {
        if (styles.lineHeight.endsWith('px') || parsedLineHeight >= 4) {
            return parsedLineHeight;
        }

        if (Number.isFinite(parsedFontSize)) {
            return parsedLineHeight * parsedFontSize;
        }
    }

    if (Number.isFinite(parsedFontSize)) {
        return parsedFontSize * 1.7;
    }

    return activeWord.getBoundingClientRect().height || 32;
};

const captureWordPositions = (track: HTMLElement): Map<number, number> => {
    const positions = new Map<number, number>();

    track.querySelectorAll<HTMLElement>('[data-word-index]').forEach((word) => {
        const index = Number(word.dataset.wordIndex);

        if (Number.isInteger(index)) {
            positions.set(index, word.offsetTop);
        }
    });

    return positions;
};

const prefersReducedMotion = (): boolean =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TypingPassage({
    attempts,
    activeWordIndex,
    wordOffset,
    phase,
    inputRef,
    onKeyDown,
    onPaste,
}: TypingPassageProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const resizeFrameRef = useRef<number | null>(null);
    const positionsRef = useRef<Map<number, number>>(new Map());
    const previousActiveIndexRef = useRef(activeWordIndex);
    const previousWordOffsetRef = useRef(wordOffset);
    const synchronizeViewportRef = useRef<
        (reason: 'progress' | 'resize') => void
    >(() => undefined);

    const cancelScrollAnimation = useCallback(() => {
        if (scrollFrameRef.current !== null) {
            window.cancelAnimationFrame(scrollFrameRef.current);
            scrollFrameRef.current = null;
        }
    }, []);

    const scrollTo = useCallback(
        (viewport: HTMLElement, requestedTarget: number, instant: boolean) => {
            cancelScrollAnimation();

            const maximumScroll = Math.max(
                0,
                viewport.scrollHeight - viewport.clientHeight,
            );
            const target = Math.max(
                0,
                maximumScroll > 0
                    ? Math.min(requestedTarget, maximumScroll)
                    : requestedTarget,
            );
            const start = viewport.scrollTop;
            const distance = target - start;

            if (instant || Math.abs(distance) < 0.5) {
                viewport.scrollTop = target;

                return;
            }

            const startedAt = performance.now();

            const advance = (now: number) => {
                const progress = Math.min(
                    1,
                    Math.max(0, (now - startedAt) / SCROLL_DURATION_MS),
                );
                const eased = 1 - Math.pow(1 - progress, 3);

                viewport.scrollTop = start + distance * eased;

                if (progress < 1) {
                    scrollFrameRef.current =
                        window.requestAnimationFrame(advance);
                } else {
                    scrollFrameRef.current = null;
                }
            };

            scrollFrameRef.current = window.requestAnimationFrame(advance);
        },
        [cancelScrollAnimation],
    );

    const synchronizeViewport = useCallback(
        (reason: 'progress' | 'resize') => {
            const viewport = viewportRef.current;
            const track = trackRef.current;

            if (viewport === null || track === null) {
                return;
            }

            const activeWord = track.querySelector<HTMLElement>(
                `[data-word-index="${activeWordIndex}"]`,
            );

            if (activeWord === null) {
                positionsRef.current = captureWordPositions(track);

                return;
            }

            const previousActiveIndex = previousActiveIndexRef.current;
            const offsetChanged = previousWordOffsetRef.current !== wordOffset;
            const restarted = activeWordIndex < previousActiveIndex;

            if (restarted) {
                scrollTo(viewport, 0, true);
            } else if (offsetChanged) {
                const previousTop = positionsRef.current.get(activeWordIndex);

                if (previousTop !== undefined) {
                    cancelScrollAnimation();
                    viewport.scrollTop = Math.max(
                        0,
                        viewport.scrollTop + activeWord.offsetTop - previousTop,
                    );
                }
            }

            const lineHeight = getLineHeight(track, activeWord);

            if (reason === 'resize') {
                scrollTo(
                    viewport,
                    Math.max(0, activeWord.offsetTop - lineHeight),
                    true,
                );
            } else if (
                activeWordIndex !== previousActiveIndex ||
                offsetChanged
            ) {
                const visibleTop = activeWord.offsetTop - viewport.scrollTop;

                if (visibleTop >= lineHeight * 2 - 1) {
                    scrollTo(
                        viewport,
                        Math.max(0, activeWord.offsetTop - lineHeight),
                        prefersReducedMotion(),
                    );
                }
            }

            positionsRef.current = captureWordPositions(track);
            previousActiveIndexRef.current = activeWordIndex;
            previousWordOffsetRef.current = wordOffset;
        },
        [activeWordIndex, cancelScrollAnimation, scrollTo, wordOffset],
    );

    useLayoutEffect(() => {
        synchronizeViewportRef.current = synchronizeViewport;
        synchronizeViewport('progress');
    }, [synchronizeViewport]);

    useEffect(() => {
        const viewport = viewportRef.current;

        if (viewport === null) {
            return;
        }

        const handleResize = () => {
            if (resizeFrameRef.current !== null) {
                window.cancelAnimationFrame(resizeFrameRef.current);
            }

            resizeFrameRef.current = window.requestAnimationFrame(() => {
                resizeFrameRef.current = null;
                synchronizeViewportRef.current('resize');
            });
        };
        const observer =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(handleResize);

        observer?.observe(viewport);
        window.addEventListener('resize', handleResize);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', handleResize);

            if (resizeFrameRef.current !== null) {
                window.cancelAnimationFrame(resizeFrameRef.current);
                resizeFrameRef.current = null;
            }
        };
    }, []);

    useEffect(
        () => () => {
            cancelScrollAnimation();
        },
        [cancelScrollAnimation],
    );

    const focusInput = (event: MouseEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;

        if (!target.closest('button, input, select, a')) {
            inputRef.current?.focus();
        }
    };

    return (
        <section
            className="typing-surface"
            aria-labelledby="typing-passage-heading"
            onMouseDown={focusInput}
        >
            <h3 id="typing-passage-heading" className="screen-reader-only">
                Typing passage
            </h3>
            <label htmlFor="typing-capture" className="screen-reader-only">
                Typing input
            </label>
            <p id="typing-instructions" className="screen-reader-only">
                Type the highlighted passage. After typing at least one
                character, Space permanently locks the current word and advances
                to the next word. Backspace edits only the current, unlocked
                word. Escape restarts the test.
            </p>
            <textarea
                ref={inputRef}
                id="typing-capture"
                className="typing-input"
                aria-describedby="typing-instructions"
                aria-label="Typing input"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value=""
                onChange={() => undefined}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
            />
            <div ref={viewportRef} className="typing-viewport">
                <div
                    ref={trackRef}
                    className="typing-words"
                    aria-hidden="true"
                    data-testid="typing-passage"
                >
                    {attempts.map((attempt, localIndex) => {
                        const absoluteIndex = wordOffset + localIndex;

                        return (
                            <WordToken
                                attempt={attempt}
                                absoluteIndex={absoluteIndex}
                                active={absoluteIndex === activeWordIndex}
                                key={absoluteIndex}
                            />
                        );
                    })}
                </div>
            </div>
            <p className="screen-reader-only" aria-live="off">
                {phase === 'ready'
                    ? 'Ready to type.'
                    : phase === 'running'
                      ? 'Test running.'
                      : 'Test finished.'}
            </p>
        </section>
    );
}
