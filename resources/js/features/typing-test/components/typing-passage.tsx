import {
    Fragment,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {
    ClipboardEvent,
    KeyboardEvent,
    PointerEvent,
    RefObject,
} from 'react';

import type { TestPhase, WordAttempt } from '../core/types';
import {
    findWordRow,
    getRetirableRowCount,
    getTargetFirstRow,
    groupWordMeasurements,
} from './passage-layout';
import type { PassageRow } from './passage-layout';

type TypingPassageProps = {
    attempts: readonly WordAttempt[];
    activeWordIndex: number;
    wordOffset: number;
    phase: TestPhase;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
};

type IndexedAttempt = {
    index: number;
    attempt: WordAttempt;
};

type WordTokenProps = IndexedAttempt & {
    active: boolean;
};

type MeasurementTokenProps = {
    index: number;
    target: string;
};

type SequenceSnapshot = {
    activeWordIndex: number;
    firstAttempt: WordAttempt | undefined;
    phase: TestPhase;
    wordOffset: number;
};

const TRANSITION_DURATION_MS = 180;

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
    index,
    active,
}: WordTokenProps) {
    const characterCount = Math.max(
        attempt.target.length,
        attempt.typed.length,
    );
    const characters = Array.from({ length: characterCount }, (_, position) =>
        renderCharacter(attempt, position, active),
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
                data-word-index={index}
            >
                {characters}
            </span>
            <span
                className={
                    active ? 'typing-gap typing-gap--active' : 'typing-gap'
                }
                data-after-word-index={index}
                aria-hidden="true"
            >
                {'\u00a0'}
            </span>
        </Fragment>
    );
});

const MeasurementToken = memo(function MeasurementToken({
    index,
    target,
}: MeasurementTokenProps) {
    return (
        <Fragment>
            <span className="typing-measure-word" data-measure-index={index}>
                {target}
            </span>
            <span className="typing-gap" aria-hidden="true">
                {'\u00a0'}
            </span>
            <wbr />
        </Fragment>
    );
});

const indexAttempts = (
    attempts: readonly WordAttempt[],
    wordOffset: number,
): readonly IndexedAttempt[] =>
    attempts.map((attempt, localIndex) => ({
        attempt,
        index: wordOffset + localIndex,
    }));

const getLineHeight = (track: HTMLElement): number => {
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

    return Number.isFinite(parsedFontSize) ? parsedFontSize * 1.7 : 32;
};

const readMeasuredRows = (
    flow: HTMLElement,
    includedIndices?: ReadonlySet<number>,
): readonly PassageRow[] =>
    groupWordMeasurements(
        Array.from(flow.querySelectorAll<HTMLElement>('[data-measure-index]'))
            .map((word) => ({
                index: Number(word.dataset.measureIndex),
                top: word.offsetTop,
            }))
            .filter(
                ({ index }) =>
                    includedIndices === undefined || includedIndices.has(index),
            ),
    );

const rowsHaveSameWords = (
    left: readonly PassageRow[],
    right: readonly PassageRow[],
): boolean =>
    left.length === right.length &&
    left.every(
        (row, rowIndex) =>
            row.wordIndices.length === right[rowIndex]?.wordIndices.length &&
            row.wordIndices.every(
                (wordIndex, wordPosition) =>
                    wordIndex === right[rowIndex]?.wordIndices[wordPosition],
            ),
    );

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
    const currentAttempts = useMemo(
        () => indexAttempts(attempts, wordOffset),
        [attempts, wordOffset],
    );
    const [cachedAttempts, setCachedAttempts] = useState(
        () =>
            new Map(
                currentAttempts.map(({ index, attempt }) => [index, attempt]),
            ),
    );
    const renderAttempts = new Map<number, WordAttempt>(cachedAttempts);

    currentAttempts.forEach(({ index, attempt }) => {
        renderAttempts.set(index, attempt);
    });

    const displayedAttempts = Array.from(
        renderAttempts,
        ([index, attempt]) => ({
            attempt,
            index,
        }),
    ).sort((left, right) => left.index - right.index);
    const lastDisplayedWordIndex = displayedAttempts.at(-1)?.index ?? -1;
    const previousSequenceRef = useRef<SequenceSnapshot>({
        activeWordIndex,
        firstAttempt: attempts[0],
        phase,
        wordOffset,
    });
    const [rows, setRows] = useState<readonly PassageRow[]>([]);
    const [layoutRevision, setLayoutRevision] = useState(0);
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const measurementRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const resizeFrameRef = useRef<number | null>(null);
    const currentOffsetRef = useRef(0);
    const settledFirstRowRef = useRef(0);
    const targetFirstRowRef = useRef(0);
    const baseRowRef = useRef(0);
    const pendingRetiredRowsRef = useRef(0);
    const resizeRequestedRef = useRef(false);
    const processedLayoutRevisionRef = useRef(0);
    const rowsNeedPositionRef = useRef(false);

    const applyTrackPosition = useCallback(
        (relativeFirstRow: number, offset: number) => {
            const track = trackRef.current;

            if (track === null) {
                return;
            }

            track.style.transform = `translate3d(0, ${offset}px, 0)`;
            track.dataset.firstVisibleRow = String(
                baseRowRef.current + relativeFirstRow,
            );
            track.dataset.targetFirstRow = String(
                baseRowRef.current + targetFirstRowRef.current,
            );
        },
        [],
    );

    const cancelTransition = useCallback(() => {
        if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    const transitionToRow = useCallback(
        (targetFirstRow: number, lineHeight: number): boolean => {
            const targetOffset = -targetFirstRow * lineHeight;

            targetFirstRowRef.current = targetFirstRow;
            cancelTransition();

            if (
                prefersReducedMotion() ||
                Math.abs(targetOffset - currentOffsetRef.current) < 0.5
            ) {
                currentOffsetRef.current = targetOffset;
                settledFirstRowRef.current = targetFirstRow;
                applyTrackPosition(targetFirstRow, targetOffset);

                return false;
            }

            const startOffset = currentOffsetRef.current;
            const distance = targetOffset - startOffset;
            const startedAt = performance.now();

            const advance = (now: number) => {
                const progress = Math.min(
                    1,
                    Math.max(0, (now - startedAt) / TRANSITION_DURATION_MS),
                );
                const eased = 1 - Math.pow(1 - progress, 3);
                const offset = startOffset + distance * eased;

                currentOffsetRef.current = offset;
                applyTrackPosition(settledFirstRowRef.current, offset);

                if (progress < 1) {
                    animationFrameRef.current =
                        window.requestAnimationFrame(advance);
                } else {
                    animationFrameRef.current = null;
                    settledFirstRowRef.current = targetFirstRow;
                    currentOffsetRef.current = targetOffset;
                    applyTrackPosition(targetFirstRow, targetOffset);
                    setLayoutRevision((revision) => revision + 1);
                }
            };

            animationFrameRef.current = window.requestAnimationFrame(advance);

            return true;
        },
        [applyTrackPosition, cancelTransition],
    );

    useLayoutEffect(() => {
        const track = trackRef.current;
        const measurementFlow = measurementRef.current;
        const previousSequence = previousSequenceRef.current;
        const activeWordChanged =
            activeWordIndex !== previousSequence.activeWordIndex;
        const wordOffsetChanged = wordOffset !== previousSequence.wordOffset;
        const resetsSequence =
            activeWordIndex < previousSequence.activeWordIndex ||
            wordOffset < previousSequence.wordOffset ||
            (phase === 'ready' && previousSequence.phase !== 'ready') ||
            (phase === 'ready' &&
                wordOffset === 0 &&
                attempts[0] !== previousSequence.firstAttempt);

        previousSequenceRef.current = {
            activeWordIndex,
            firstAttempt: attempts[0],
            phase,
            wordOffset,
        };

        if (track === null || measurementFlow === null) {
            return;
        }

        if (resetsSequence) {
            cancelTransition();
            const resetAttempts = new Map(
                currentAttempts.map(({ index, attempt }) => [index, attempt]),
            );

            setCachedAttempts(resetAttempts);
            baseRowRef.current = 0;
            settledFirstRowRef.current = 0;
            targetFirstRowRef.current = 0;
            currentOffsetRef.current = 0;
            pendingRetiredRowsRef.current = 0;
            resizeRequestedRef.current = false;
            processedLayoutRevisionRef.current = layoutRevision;
            rowsNeedPositionRef.current = false;
            applyTrackPosition(0, 0);

            const resetRows = readMeasuredRows(
                measurementFlow,
                new Set(resetAttempts.keys()),
            );

            if (!rowsHaveSameWords(rows, resetRows)) {
                setRows(resetRows);
            }

            return;
        }

        const committedAttempts = currentAttempts.filter(
            ({ attempt }) => attempt.committed,
        );

        if (
            committedAttempts.some(
                ({ index, attempt }) => cachedAttempts.get(index) !== attempt,
            )
        ) {
            setCachedAttempts((previousAttempts) => {
                const nextAttempts = new Map(previousAttempts);

                committedAttempts.forEach(({ index, attempt }) => {
                    nextAttempts.set(index, attempt);
                });

                return nextAttempts;
            });
        }

        const lastRenderedWord = rows.at(-1)?.wordIndices.at(-1) ?? -1;
        const lastDisplayedWord =
            lastDisplayedWordIndex < 0
                ? lastRenderedWord
                : lastDisplayedWordIndex;
        const needsLayout =
            rows.length === 0 ||
            activeWordChanged ||
            wordOffsetChanged ||
            resizeRequestedRef.current ||
            pendingRetiredRowsRef.current > 0 ||
            rowsNeedPositionRef.current ||
            layoutRevision !== processedLayoutRevisionRef.current ||
            lastDisplayedWord > lastRenderedWord ||
            findWordRow(rows, activeWordIndex) < 0;

        if (!needsLayout) {
            return;
        }

        processedLayoutRevisionRef.current = layoutRevision;
        rowsNeedPositionRef.current = false;
        const lineHeight = getLineHeight(track);

        if (pendingRetiredRowsRef.current > 0) {
            currentOffsetRef.current +=
                pendingRetiredRowsRef.current * lineHeight;
            pendingRetiredRowsRef.current = 0;
            applyTrackPosition(
                settledFirstRowRef.current,
                currentOffsetRef.current,
            );
        }

        const measuredRows = readMeasuredRows(measurementFlow);
        const lastMeasuredWord = measuredRows.at(-1)?.wordIndices.at(-1) ?? -1;

        if (resizeRequestedRef.current) {
            resizeRequestedRef.current = false;
            cancelTransition();
            baseRowRef.current = 0;

            const activeRow = findWordRow(measuredRows, activeWordIndex);
            const firstRow = activeRow < 0 ? 0 : getTargetFirstRow(activeRow);

            settledFirstRowRef.current = firstRow;
            targetFirstRowRef.current = firstRow;
            currentOffsetRef.current = -firstRow * lineHeight;
            applyTrackPosition(firstRow, currentOffsetRef.current);

            if (!rowsHaveSameWords(rows, measuredRows)) {
                setRows(measuredRows);
            }

            return;
        }

        if (
            rows.length === 0 ||
            lastMeasuredWord > lastRenderedWord ||
            findWordRow(rows, activeWordIndex) < 0
        ) {
            if (rows.length === 0) {
                applyTrackPosition(0, 0);
            }

            if (!rowsHaveSameWords(rows, measuredRows)) {
                rowsNeedPositionRef.current = true;
                setRows(measuredRows);
            }

            return;
        }

        const activeRow = findWordRow(rows, activeWordIndex);
        const desiredFirstRow = getTargetFirstRow(activeRow);
        let transitionStarted = false;

        if (desiredFirstRow > targetFirstRowRef.current) {
            transitionStarted = transitionToRow(desiredFirstRow, lineHeight);
        }

        if (!transitionStarted && animationFrameRef.current === null) {
            const retireCount = getRetirableRowCount(
                rows,
                settledFirstRowRef.current,
                wordOffset,
            );

            if (retireCount > 0) {
                const retiredIndices = rows
                    .slice(0, retireCount)
                    .flatMap((row) => row.wordIndices);

                setCachedAttempts((previousAttempts) => {
                    const nextAttempts = new Map(previousAttempts);

                    retiredIndices.forEach((index) => {
                        nextAttempts.delete(index);
                    });

                    return nextAttempts;
                });

                pendingRetiredRowsRef.current = retireCount;
                baseRowRef.current += retireCount;
                settledFirstRowRef.current -= retireCount;
                targetFirstRowRef.current -= retireCount;
                setRows(rows.slice(retireCount));
            }
        }
    }, [
        activeWordIndex,
        applyTrackPosition,
        attempts,
        cachedAttempts,
        cancelTransition,
        currentAttempts,
        layoutRevision,
        lastDisplayedWordIndex,
        phase,
        rows,
        transitionToRow,
        wordOffset,
    ]);

    useEffect(() => {
        const viewport = viewportRef.current;

        if (viewport === null) {
            return;
        }

        const requestResize = () => {
            if (resizeFrameRef.current !== null) {
                window.cancelAnimationFrame(resizeFrameRef.current);
            }

            resizeFrameRef.current = window.requestAnimationFrame(() => {
                resizeFrameRef.current = null;
                cancelTransition();
                resizeRequestedRef.current = true;
                setLayoutRevision((revision) => revision + 1);
            });
        };
        const observer =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(requestResize);

        observer?.observe(viewport);
        window.addEventListener('resize', requestResize);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', requestResize);

            if (resizeFrameRef.current !== null) {
                window.cancelAnimationFrame(resizeFrameRef.current);
                resizeFrameRef.current = null;
            }
        };
    }, [cancelTransition]);

    useEffect(
        () => () => {
            cancelTransition();
        },
        [cancelTransition],
    );

    const focusInput = (event: PointerEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;

        if (!event.isPrimary || event.button !== 0) {
            return;
        }

        if (
            !target.closest(
                'a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"])',
            )
        ) {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
        }
    };

    return (
        <section
            className="typing-surface"
            aria-labelledby="typing-passage-heading"
            onPointerDown={focusInput}
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
                    {rows.map((row) => (
                        <div
                            className="typing-row"
                            data-row-start-index={row.id}
                            key={row.id}
                        >
                            {row.wordIndices.map((index) => {
                                const attempt = renderAttempts.get(index);

                                return attempt === undefined ? null : (
                                    <WordToken
                                        attempt={attempt}
                                        index={index}
                                        active={index === activeWordIndex}
                                        key={index}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
                <div
                    ref={measurementRef}
                    className="typing-measure-flow"
                    aria-hidden="true"
                >
                    {displayedAttempts.map(({ index, attempt }) => (
                        <MeasurementToken
                            index={index}
                            target={attempt.target}
                            key={index}
                        />
                    ))}
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
