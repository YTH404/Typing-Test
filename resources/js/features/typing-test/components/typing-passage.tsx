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
    phase: TestPhase;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
};

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

export function TypingPassage({
    attempts,
    activeWordIndex,
    phase,
    inputRef,
    onKeyDown,
    onPaste,
}: TypingPassageProps) {
    const start = Math.max(0, activeWordIndex - 3);
    const end = Math.min(attempts.length, activeWordIndex + 20);
    const visibleAttempts = attempts.slice(start, end);

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
                Type the highlighted passage. Space commits a word. Backspace
                corrects the current word or reopens the previous word. Escape
                restarts the test.
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
            <div
                className="typing-words"
                aria-hidden="true"
                data-testid="typing-passage"
            >
                {visibleAttempts.map((attempt, visibleIndex) => {
                    const index = start + visibleIndex;
                    const active = index === activeWordIndex;
                    const characterCount = Math.max(
                        attempt.target.length,
                        attempt.typed.length,
                    );
                    const characters = Array.from(
                        { length: characterCount },
                        (_, characterIndex) =>
                            renderCharacter(attempt, characterIndex, active),
                    );

                    if (active && attempt.typed.length === characterCount) {
                        characters.push(
                            <span
                                className="typing-char typing-char--caret"
                                key="caret"
                            >
                                {'\u200b'}
                            </span>,
                        );
                    }

                    return (
                        <span
                            className={`typing-word${active ? 'typing-word--active' : ''}`}
                            data-active={active || undefined}
                            key={`${index}-${attempt.target}`}
                        >
                            {characters}
                        </span>
                    );
                })}
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
