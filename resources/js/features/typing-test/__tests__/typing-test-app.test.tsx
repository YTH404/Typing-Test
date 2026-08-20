import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypingTestApp } from '@/features/typing-test/typing-test-app';

let currentNow = 1_000;
let desktopMatches = true;
let animationFrames: FrameRequestCallback[] = [];

const flushAnimationFrames = () => {
    const queuedFrames = animationFrames;
    animationFrames = [];
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
    animationFrames = [];
    vi.useFakeTimers();

    vi.stubGlobal(
        'matchMedia',
        vi.fn(
            (query: string) =>
                ({
                    matches:
                        query === '(min-width: 900px)' ? desktopMatches : false,
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
            animationFrames.push(callback);

            return animationFrames.length;
        }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
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
        expect(getTypingInput()).toHaveFocus();
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
        expect(screen.getByRole('radio', { name: 'Colemak' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: 'Timeless' })).toBeDisabled();
        expect(punctuation).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(punctuation);

        expect(punctuation).toHaveAttribute('aria-pressed', 'true');
    });

    it('returns focus to the typing input when the passage is clicked', () => {
        renderApp();
        const punctuation = screen.getByRole('button', {
            name: 'Punctuation',
        });
        const input = getTypingInput();

        punctuation.focus();
        expect(punctuation).toHaveFocus();

        fireEvent.mouseDown(screen.getByTestId('typing-passage'));

        expect(input).toHaveFocus();
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
        expect(screen.getByRole('radio', { name: 'QWERTY' })).toHaveFocus();
        expect(screen.getByRole('radio', { name: 'Timeless' })).toBeChecked();
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
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
