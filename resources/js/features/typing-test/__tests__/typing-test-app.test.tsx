import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypingTestApp } from '@/features/typing-test/typing-test-app';

let currentNow = 1_000;
let desktopMatches = true;
let desktopMediaChangeListeners = new Set<
    (event: MediaQueryListEvent) => void
>();
let nextAnimationFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();

const dispatchDesktopMediaChange = (matches: boolean) => {
    desktopMatches = matches;
    const event = {
        matches,
        media: '(min-width: 900px)',
    } as MediaQueryListEvent;

    desktopMediaChangeListeners.forEach((listener) => listener(event));
};

const flushAnimationFrames = () => {
    const queuedFrames = [...animationFrames.values()];
    animationFrames.clear();
    queuedFrames.forEach((callback) => callback(currentNow));
};

const renderApp = (): RenderResult => {
    const result = render(<TypingTestApp />);

    act(flushAnimationFrames);

    return result;
};

const getApp = (container: HTMLElement): HTMLElement => {
    const app = container.querySelector<HTMLElement>('.typing-app');

    expect(app).not.toBeNull();

    return app!;
};

const getTypingInput = () =>
    screen.getByRole('textbox', { name: 'Typing input' });

const getMetricValue = (name: string): HTMLElement => {
    const label = screen.getByText(name, { selector: '.metric dt' });
    const value = label.closest('.metric')?.querySelector<HTMLElement>('dd');

    expect(value).not.toBeNull();

    return value!;
};

const getPassageWord = (index: number): HTMLElement => {
    const word = screen
        .getByTestId('typing-passage')
        .querySelector<HTMLElement>(`.typing-word[data-word-index="${index}"]`);

    expect(word).not.toBeNull();

    return word!;
};

const typeQwertyText = (text: string) => {
    const input = getTypingInput();

    for (const value of text) {
        fireEvent.keyDown(input, {
            code: `Key${value.toUpperCase()}`,
            key: value,
        });
    }
};

const getLetterRowLabels = (): string[] => {
    const keyboard = screen.getByTestId('virtual-keyboard');
    const letterRow = keyboard.querySelectorAll('.keyboard-row')[1];

    expect(letterRow).toBeDefined();

    return Array.from(letterRow!.querySelectorAll('.keyboard-key')).map(
        (key) => key.textContent ?? '',
    );
};

const startTimelessTest = () => {
    fireEvent.click(screen.getByRole('radio', { name: 'Timeless' }));
    currentNow = 1_000;
    fireEvent.keyDown(getTypingInput(), { code: 'KeyA', key: 'a' });

    expect(
        screen.getByRole('button', { name: 'Stop test' }),
    ).toBeInTheDocument();
};

const finishTimelessTest = () => {
    startTimelessTest();
    currentNow = 6_000;
    fireEvent.click(screen.getByRole('button', { name: 'Stop test' }));
};

beforeEach(() => {
    currentNow = 1_000;
    desktopMatches = true;
    desktopMediaChangeListeners = new Set();
    nextAnimationFrameId = 0;
    animationFrames = new Map();
    vi.useFakeTimers();

    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => {
            const isDesktopQuery = query === '(min-width: 900px)';

            return {
                get matches() {
                    return isDesktopQuery ? desktopMatches : false;
                },
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(
                    (
                        type: string,
                        listener: EventListenerOrEventListenerObject,
                    ) => {
                        if (isDesktopQuery && type === 'change') {
                            desktopMediaChangeListeners.add(
                                listener as unknown as (
                                    event: MediaQueryListEvent,
                                ) => void,
                            );
                        }
                    },
                ),
                removeEventListener: vi.fn(
                    (
                        type: string,
                        listener: EventListenerOrEventListenerObject,
                    ) => {
                        if (isDesktopQuery && type === 'change') {
                            desktopMediaChangeListeners.delete(
                                listener as unknown as (
                                    event: MediaQueryListEvent,
                                ) => void,
                            );
                        }
                    },
                ),
                dispatchEvent: vi.fn(() => true),
            } as MediaQueryList;
        }),
    );
    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((callback: FrameRequestCallback) => {
            nextAnimationFrameId += 1;
            animationFrames.set(nextAnimationFrameId, callback);

            return nextAnimationFrameId;
        }),
    );
    vi.stubGlobal(
        'cancelAnimationFrame',
        vi.fn((frameId: number) => animationFrames.delete(frameId)),
    );
    vi.spyOn(performance, 'now').mockImplementation(() => currentNow);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('TypingTestApp', () => {
    it('renders accessible default settings and focuses the typing input', () => {
        const { container } = renderApp();

        expect(getApp(container)).toHaveAttribute('data-phase', 'ready');
        expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
        expect(
            screen.getByRole('radio', { name: 'Indonesia' }),
        ).not.toBeChecked();
        expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Hard' })).not.toBeChecked();
        expect(screen.getByRole('radio', { name: 'QWERTY' })).toBeChecked();
        expect(
            screen.getByRole('radio', { name: 'Colemak' }),
        ).not.toBeChecked();
        expect(screen.getByRole('radio', { name: 'Timed' })).toBeChecked();
        expect(
            screen.getByRole('radio', { name: 'Timeless' }),
        ).not.toBeChecked();
        expect(screen.getByRole('radio', { name: '60' })).toBeChecked();
        expect(
            screen.getByRole('button', { name: 'Punctuation' }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(
            screen.getByRole('button', { name: 'Capitals' }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(
            screen.getByText('60', { selector: '.metric dd' }),
        ).toBeInTheDocument();
        expect(getMetricValue('Live WPM')).toHaveTextContent('0');
        expect(screen.getByRole('group', { name: 'Language' })).toBeVisible();
        expect(screen.getByRole('group', { name: 'Difficulty' })).toBeVisible();
        expect(
            screen.getByRole('group', { name: 'Keyboard layout' }),
        ).toBeVisible();
        expect(screen.getByRole('group', { name: 'Test mode' })).toBeVisible();
        expect(screen.getByRole('group', { name: 'Duration' })).toBeVisible();
        expect(
            screen.getByRole('group', { name: 'Content options' }),
        ).toBeVisible();
        expect(getTypingInput()).toHaveFocus();
    });

    it('switches language and difficulty independently', () => {
        renderApp();
        const initialTarget = getPassageWord(0).textContent;

        fireEvent.click(screen.getByRole('radio', { name: 'Indonesia' }));

        expect(screen.getByRole('radio', { name: 'Indonesia' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();
        expect(getPassageWord(0).textContent).not.toBe(initialTarget);

        fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));

        expect(screen.getByRole('radio', { name: 'Indonesia' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Hard' })).toBeChecked();
    });

    it('switches layouts and updates labels at the same physical key positions', () => {
        renderApp();

        expect(getLetterRowLabels().slice(1, 5)).toEqual(['q', 'w', 'e', 'r']);

        fireEvent.click(screen.getByRole('radio', { name: 'Colemak' }));

        expect(screen.getByRole('radio', { name: 'Colemak' })).toBeChecked();
        expect(getLetterRowLabels().slice(1, 5)).toEqual(['q', 'w', 'f', 'p']);

        fireEvent.click(screen.getByRole('radio', { name: 'QWERTY' }));

        expect(getLetterRowLabels().slice(1, 5)).toEqual(['q', 'w', 'e', 'r']);
    });

    it('toggles punctuation and capitals independently', () => {
        renderApp();
        const punctuation = screen.getByRole('button', {
            name: 'Punctuation',
        });
        const capitals = screen.getByRole('button', { name: 'Capitals' });

        fireEvent.click(punctuation);

        expect(punctuation).toHaveAttribute('aria-pressed', 'true');
        expect(capitals).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(capitals);

        expect(punctuation).toHaveAttribute('aria-pressed', 'true');
        expect(capitals).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(punctuation);

        expect(punctuation).toHaveAttribute('aria-pressed', 'false');
        expect(capitals).toHaveAttribute('aria-pressed', 'true');
    });

    it('starts on the first accepted key and locks every setting', () => {
        const { container } = renderApp();
        const punctuation = screen.getByRole('button', {
            name: 'Punctuation',
        });

        fireEvent.click(punctuation);
        fireEvent.keyDown(getTypingInput(), { code: 'KeyA', key: 'a' });

        expect(getApp(container)).toHaveAttribute('data-phase', 'running');
        expect(screen.getByText('Locked')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Indonesia' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: 'Hard' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: 'Colemak' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: 'Timeless' })).toBeDisabled();
        expect(punctuation).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Restart test' }),
        ).toBeEnabled();

        fireEvent.click(punctuation);

        expect(punctuation).toHaveAttribute('aria-pressed', 'true');
    });

    it('returns pointer-operated settings to typing focus after one coalesced frame', () => {
        renderApp();
        const input = getTypingInput();
        const indonesia = screen.getByRole('radio', { name: 'Indonesia' });
        const focusSpy = vi.spyOn(input, 'focus');

        indonesia.focus();
        fireEvent.pointerUp(indonesia, {
            button: 0,
            isPrimary: true,
            pointerId: 1,
        });
        fireEvent.click(indonesia);
        fireEvent.pointerUp(indonesia, {
            button: 0,
            isPrimary: true,
            pointerId: 1,
        });

        expect(indonesia).toHaveFocus();
        expect(animationFrames.size).toBe(1);
        expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);

        act(flushAnimationFrames);

        expect(input).toHaveFocus();
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
        expect(indonesia).toBeChecked();
    });

    it('retains keyboard focus on settings controls', () => {
        renderApp();
        const hard = screen.getByRole('radio', { name: 'Hard' });

        hard.focus();
        fireEvent.click(hard, { detail: 0 });
        act(flushAnimationFrames);

        expect(hard).toBeChecked();
        expect(hard).toHaveFocus();
    });

    it('ignores blank rail padding and controls disabled by their fieldset', () => {
        const { container } = renderApp();
        const timeless = screen.getByRole('radio', { name: 'Timeless' });

        timeless.focus();
        fireEvent.click(timeless, { detail: 0 });

        const duration = screen.getByRole('radio', { name: '15' });
        const settingsForm =
            container.querySelector<HTMLElement>('.settings-form');

        expect(duration).toBeDisabled();
        expect(settingsForm).not.toBeNull();

        fireEvent.pointerUp(settingsForm!, {
            button: 0,
            isPrimary: true,
            pointerId: 4,
        });
        fireEvent.pointerUp(duration, {
            button: 0,
            isPrimary: true,
            pointerId: 5,
        });

        expect(animationFrames.size).toBe(0);
        expect(timeless).toHaveFocus();
    });

    it('does not return focus from locked settings while typing', () => {
        const { container } = renderApp();
        const input = getTypingInput();

        fireEvent.keyDown(input, { code: 'KeyA', key: 'a' });
        expect(getApp(container)).toHaveAttribute('data-phase', 'running');

        const punctuation = screen.getByRole('button', {
            name: 'Punctuation',
        });
        expect(punctuation).toBeDisabled();
        expect(input).toHaveFocus();
        const frameCount = animationFrames.size;
        fireEvent.pointerUp(punctuation, {
            button: 0,
            isPrimary: true,
            pointerId: 2,
        });
        fireEvent.click(punctuation);

        expect(animationFrames.size).toBe(frameCount);
        expect(input).toHaveFocus();
    });

    it('returns focus to the typing input when the passage is clicked', () => {
        renderApp();
        const punctuation = screen.getByRole('button', {
            name: 'Punctuation',
        });
        const input = getTypingInput();

        punctuation.focus();
        expect(punctuation).toHaveFocus();

        fireEvent.pointerDown(screen.getByTestId('typing-passage'), {
            button: 0,
            isPrimary: true,
            pointerId: 3,
        });

        expect(input).toHaveFocus();
    });

    it('blurs and cancels pending typing focus when desktop support is lost', () => {
        const { unmount } = renderApp();
        const input = getTypingInput();
        const english = screen.getByRole('radio', { name: 'English' });

        expect(input).toHaveFocus();
        expect(desktopMediaChangeListeners.size).toBe(1);

        fireEvent.pointerUp(english, {
            button: 0,
            isPrimary: true,
            pointerId: 6,
        });
        expect(animationFrames.size).toBe(1);

        act(() => dispatchDesktopMediaChange(false));

        expect(animationFrames.size).toBe(0);
        expect(input).not.toHaveFocus();

        act(() => dispatchDesktopMediaChange(true));
        act(flushAnimationFrames);

        expect(input).not.toHaveFocus();

        unmount();
        expect(desktopMediaChangeListeners.size).toBe(0);
    });

    it('keeps a Space-committed word locked through empty spaces and Backspace', () => {
        renderApp();
        const input = getTypingInput();
        const firstWord = getPassageWord(0);
        const secondWord = getPassageWord(1);
        const firstTarget = firstWord.textContent ?? '';
        const secondTarget = secondWord.textContent ?? '';

        typeQwertyText(firstTarget);
        fireEvent.keyDown(input, { code: 'Space', key: ' ' });

        expect(getPassageWord(0)).toBe(firstWord);
        expect(getPassageWord(0)).not.toHaveAttribute('data-active');
        expect(getPassageWord(1)).toBe(secondWord);
        expect(getPassageWord(1)).toHaveAttribute('data-active', 'true');

        for (let press = 0; press < 3; press += 1) {
            fireEvent.keyDown(input, { code: 'Space', key: ' ' });
            fireEvent.keyDown(input, {
                code: 'Backspace',
                key: 'Backspace',
                repeat: press > 0,
            });
        }

        expect(getPassageWord(0)).toBe(firstWord);
        expect(getPassageWord(0)).toHaveTextContent(firstTarget);
        expect(getPassageWord(1)).toBe(secondWord);
        expect(getPassageWord(1)).toHaveTextContent(secondTarget);
        expect(getPassageWord(1)).toHaveAttribute('data-active', 'true');

        typeQwertyText(secondTarget[0]!);
        fireEvent.keyDown(input, { code: 'Backspace', key: 'Backspace' });
        fireEvent.keyDown(input, {
            code: 'Backspace',
            key: 'Backspace',
            repeat: true,
        });

        expect(getPassageWord(0)).toBe(firstWord);
        expect(getPassageWord(0)).toHaveTextContent(firstTarget);
        expect(getPassageWord(1)).toBe(secondWord);
        expect(getPassageWord(1)).toHaveAttribute('data-active', 'true');
    });

    it('updates live WPM from the latest completed whole-second window', () => {
        renderApp();
        const firstCharacter = getPassageWord(0).textContent?.[0];

        expect(firstCharacter).toBeDefined();
        typeQwertyText(firstCharacter!);
        expect(getMetricValue('Live WPM')).toHaveTextContent('0');

        act(() => {
            currentNow = 2_000;
            vi.advanceTimersByTime(100);
        });

        expect(getMetricValue('Live WPM')).toHaveTextContent('12');

        act(() => {
            currentNow = 2_999;
            vi.advanceTimersByTime(100);
        });

        expect(getMetricValue('Live WPM')).toHaveTextContent('12');
    });

    it('ignores shortcuts, composition, repeats, and paste while ready', () => {
        const { container } = renderApp();
        const input = getTypingInput();

        fireEvent.keyDown(input, {
            code: 'KeyA',
            key: 'a',
            ctrlKey: true,
        });
        fireEvent.keyDown(input, {
            code: 'KeyA',
            key: 'a',
            metaKey: true,
        });
        fireEvent.keyDown(input, {
            altKey: true,
            code: 'KeyA',
            key: 'a',
        });
        fireEvent.keyDown(input, {
            code: 'KeyA',
            isComposing: true,
            key: 'a',
        });
        fireEvent.keyDown(input, {
            code: 'KeyA',
            key: 'a',
            repeat: true,
        });
        const pasteWasNotCancelled = fireEvent.paste(input, {
            clipboardData: { getData: () => 'pasted text' },
        });

        expect(pasteWasNotCancelled).toBe(false);
        expect(getApp(container)).toHaveAttribute('data-phase', 'ready');
        expect(screen.queryByText('Locked')).not.toBeInTheDocument();
        expect(input).toHaveValue('');
    });

    it('restarts with preserved settings when Escape is pressed', () => {
        const { container } = renderApp();
        const capitals = screen.getByRole('button', { name: 'Capitals' });

        fireEvent.click(screen.getByRole('radio', { name: 'Colemak' }));
        fireEvent.click(capitals);
        fireEvent.keyDown(getTypingInput(), { code: 'KeyE', key: 'e' });
        expect(getApp(container)).toHaveAttribute('data-phase', 'running');

        fireEvent.keyDown(getTypingInput(), {
            code: 'Escape',
            key: 'Escape',
        });
        act(flushAnimationFrames);

        expect(getApp(container)).toHaveAttribute('data-phase', 'ready');
        expect(screen.queryByText('Locked')).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Colemak' })).toBeChecked();
        expect(capitals).toHaveAttribute('aria-pressed', 'true');
        expect(getTypingInput()).toHaveFocus();
    });

    it('stops a timeless test, renders results, and announces completion', () => {
        const { container } = renderApp();

        fireEvent.click(screen.getByRole('radio', { name: 'Indonesia' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));

        finishTimelessTest();

        expect(getApp(container)).toHaveAttribute('data-phase', 'finished');
        expect(
            screen.getByRole('heading', { name: 'Test complete' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Stop test' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            /^Test complete\. \d+ words per minute with \d+\.\d percent accuracy\.$/,
        );
        expect(
            screen.getByRole('button', { name: 'Try again' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'New test' }),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText(
                /Indonesia · Hard · QWERTY · Timeless · No punctuation · Lowercase/,
            ),
        ).toHaveLength(2);
    });

    it('preserves each completed session settings snapshot', () => {
        const { container } = renderApp();

        fireEvent.click(screen.getByRole('radio', { name: 'Indonesia' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Colemak' }));
        finishTimelessTest();

        fireEvent.click(screen.getByRole('button', { name: 'New test' }));
        act(flushAnimationFrames);
        fireEvent.click(screen.getByRole('radio', { name: 'English' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Easy' }));
        fireEvent.click(screen.getByRole('radio', { name: 'QWERTY' }));
        finishTimelessTest();

        const sessionItems = container.querySelectorAll('.session-list li');

        expect(sessionItems).toHaveLength(2);
        expect(sessionItems[0]).toHaveTextContent(
            'Indonesia · Hard · Colemak · Timeless · No punctuation · Lowercase',
        );
        expect(sessionItems[1]).toHaveTextContent(
            'English · Easy · QWERTY · Timeless · No punctuation · Lowercase',
        );
    });

    it('tries the same settings again and restores typing focus', () => {
        const { container } = renderApp();

        finishTimelessTest();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        act(flushAnimationFrames);

        expect(getApp(container)).toHaveAttribute('data-phase', 'ready');
        expect(screen.getByRole('radio', { name: 'Timeless' })).toBeChecked();
        expect(getTypingInput()).toHaveFocus();
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('starts a new configurable test and focuses the first setting', () => {
        const { container } = renderApp();

        finishTimelessTest();
        fireEvent.click(screen.getByRole('button', { name: 'New test' }));
        act(flushAnimationFrames);

        expect(getApp(container)).toHaveAttribute('data-phase', 'ready');
        expect(screen.getByRole('radio', { name: 'English' })).toHaveFocus();
        expect(screen.getByRole('radio', { name: 'Timeless' })).toBeChecked();
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('cancels New test settings focus when desktop support is lost', () => {
        renderApp();

        finishTimelessTest();
        fireEvent.click(screen.getByRole('button', { name: 'New test' }));

        expect(animationFrames.size).toBe(1);

        act(() => dispatchDesktopMediaChange(false));
        act(flushAnimationFrames);

        expect(animationFrames.size).toBe(0);
        expect(
            screen.getByRole('radio', { name: 'English' }),
        ).not.toHaveFocus();
    });

    it('keeps the physical-keyboard desktop requirement in the document', () => {
        desktopMatches = false;
        renderApp();

        expect(
            screen.getByRole('heading', {
                name: 'Physical keyboard required',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/screen at least 900 pixels wide/i),
        ).toBeInTheDocument();
        expect(getTypingInput()).not.toHaveFocus();
    });
});
