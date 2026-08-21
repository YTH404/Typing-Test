import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

import { DesktopRequirement } from './components/desktop-requirement';
import { LiveMetrics } from './components/live-metrics';
import { ResultsView } from './components/results-view';
import type { SessionRecord } from './components/results-view';
import { SettingsRail } from './components/settings-rail';
import { TypingPassage } from './components/typing-passage';
import { VirtualKeyboard } from './components/virtual-keyboard';
import {
    KEYBOARD_TOKENS,
    createInitialState,
    getElapsedMs,
    getLiveWpm,
    getMetrics,
    getRemainingMs,
    mapPhysicalKeyboardEvent,
    typingReducer,
} from './core';
import type { TestSettings } from './core';
import './typing-test.css';

const INITIAL_SEED = 0x7a51f00d;

const canUseDesktopTrainer = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 900px)').matches;

export function TypingTestApp() {
    const [state, dispatch] = useReducer(typingReducer, undefined, () =>
        createInitialState(undefined, INITIAL_SEED),
    );
    const [clockNow, setClockNow] = useState(0);
    const [activeCode, setActiveCode] = useState<string | null>(null);
    const [sessions, setSessions] = useState<readonly SessionRecord[]>([]);
    const [completionAnnouncement, setCompletionAnnouncement] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const activeKeyTimerRef = useRef<number | null>(null);
    const focusFrameRef = useRef<number | null>(null);
    const recordedFinishRef = useRef<number | null>(null);
    const sessionIdRef = useRef(0);

    const effectiveNow = state.finishedAt ?? clockNow;
    const metrics = useMemo(
        () => getMetrics(state, effectiveNow),
        [effectiveNow, state],
    );
    const liveWpm = useMemo(
        () => getLiveWpm(state, effectiveNow),
        [effectiveNow, state],
    );
    const remainingMs = getRemainingMs(state, effectiveNow);
    const elapsedMs = getElapsedMs(state, effectiveNow);
    const timeLabel = String(
        Math.max(0, Math.ceil((remainingMs ?? elapsedMs) / 1_000)),
    );

    const focusTypingInput = useCallback(() => {
        if (!canUseDesktopTrainer()) {
            return;
        }

        if (focusFrameRef.current !== null) {
            window.cancelAnimationFrame(focusFrameRef.current);
        }

        focusFrameRef.current = window.requestAnimationFrame(() => {
            focusFrameRef.current = null;

            if (canUseDesktopTrainer()) {
                inputRef.current?.focus({ preventScroll: true });
            }
        });
    }, []);

    useEffect(() => {
        focusTypingInput();
    }, [focusTypingInput]);

    useEffect(() => {
        const desktopQuery = window.matchMedia('(min-width: 900px)');
        const handleDesktopChange = (event: MediaQueryListEvent) => {
            if (event.matches) {
                return;
            }

            if (focusFrameRef.current !== null) {
                window.cancelAnimationFrame(focusFrameRef.current);
                focusFrameRef.current = null;
            }

            inputRef.current?.blur();
        };

        desktopQuery.addEventListener('change', handleDesktopChange);

        return () =>
            desktopQuery.removeEventListener('change', handleDesktopChange);
    }, []);

    useEffect(() => {
        if (state.phase !== 'running') {
            return;
        }

        const updateClock = () => {
            const now = performance.now();
            setClockNow(now);
            dispatch({ type: 'tick', now });
        };

        updateClock();
        const timer = window.setInterval(updateClock, 100);

        return () => window.clearInterval(timer);
    }, [state.phase]);

    useEffect(() => {
        if (
            state.phase !== 'finished' ||
            state.finishedAt === null ||
            recordedFinishRef.current === state.finishedAt
        ) {
            return;
        }

        recordedFinishRef.current = state.finishedAt;
        sessionIdRef.current += 1;
        const result = getMetrics(state, state.finishedAt);
        const record: SessionRecord = {
            id: sessionIdRef.current,
            result,
            settings: state.settings,
        };

        setSessions((current) => [...current.slice(-3), record]);
        setCompletionAnnouncement(
            `Test complete. ${result.wpm} words per minute with ${result.accuracy.toFixed(1)} percent accuracy.`,
        );
    }, [state]);

    useEffect(
        () => () => {
            if (activeKeyTimerRef.current !== null) {
                window.clearTimeout(activeKeyTimerRef.current);
            }

            if (focusFrameRef.current !== null) {
                window.cancelAnimationFrame(focusFrameRef.current);
            }
        },
        [],
    );

    const showPressedKey = (code: string) => {
        setActiveCode(code);

        if (activeKeyTimerRef.current !== null) {
            window.clearTimeout(activeKeyTimerRef.current);
        }

        activeKeyTimerRef.current = window.setTimeout(
            () => setActiveCode(null),
            115,
        );
    };

    const restart = useCallback(() => {
        recordedFinishRef.current = null;
        setCompletionAnnouncement('');
        setClockNow(0);
        dispatch({ type: 'restart' });
        focusTypingInput();
    }, [focusTypingInput]);

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        showPressedKey(event.code);
        const input = mapPhysicalKeyboardEvent(
            {
                code: event.code,
                altKey: event.altKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey,
                repeat: event.repeat,
                isComposing: event.nativeEvent.isComposing,
                getModifierState: (key) =>
                    key === 'CapsLock' && event.getModifierState('CapsLock'),
            },
            state.settings.layout,
        );

        if (input === null) {
            return;
        }

        event.preventDefault();

        if (input === KEYBOARD_TOKENS.escape) {
            restart();

            return;
        }

        const now = performance.now();
        setClockNow(now);
        dispatch({ type: 'key', input, now });
    };

    const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        event.preventDefault();
    };

    const handleSettingsChange = (settings: TestSettings) => {
        recordedFinishRef.current = null;
        setCompletionAnnouncement('');
        setClockNow(0);
        dispatch({ type: 'settings', settings });
    };

    const handleStop = () => {
        const now = performance.now();
        setClockNow(now);
        dispatch({ type: 'stop', now });
    };

    const handleNewTest = () => {
        recordedFinishRef.current = null;
        setCompletionAnnouncement('');
        setClockNow(0);
        dispatch({ type: 'restart' });

        if (focusFrameRef.current !== null) {
            window.cancelAnimationFrame(focusFrameRef.current);
        }

        focusFrameRef.current = window.requestAnimationFrame(() => {
            focusFrameRef.current = null;

            if (!canUseDesktopTrainer()) {
                return;
            }

            document
                .querySelector<HTMLInputElement>(
                    'input[name="typing-language"]',
                )
                ?.focus();
        });
    };

    return (
        <div className="typing-app" data-phase={state.phase}>
            <a className="typing-skip-link" href="#typing-main">
                Skip to typing test
            </a>
            <div className="typing-shell">
                <header className="typing-header">
                    <h1>Typing Test</h1>
                </header>

                <main id="typing-main" tabIndex={-1}>
                    <DesktopRequirement />

                    <div className="typing-desktop">
                        <SettingsRail
                            settings={state.settings}
                            phase={state.phase}
                            onChange={handleSettingsChange}
                            onRestart={restart}
                            onRequestTypingFocus={focusTypingInput}
                        />

                        <div className="test-region">
                            {state.phase === 'finished' ? (
                                <ResultsView
                                    result={metrics}
                                    samples={state.samples}
                                    settings={state.settings}
                                    sessions={sessions}
                                    onTryAgain={restart}
                                    onNewTest={handleNewTest}
                                />
                            ) : (
                                <section aria-labelledby="live-test-heading">
                                    <h2
                                        id="live-test-heading"
                                        className="screen-reader-only"
                                    >
                                        Typing exercise
                                    </h2>
                                    <div className="live-test-header">
                                        <LiveMetrics
                                            timeLabel={timeLabel}
                                            liveWpm={liveWpm}
                                            accuracy={metrics.accuracy}
                                        />
                                    </div>

                                    <TypingPassage
                                        attempts={state.attempts}
                                        activeWordIndex={state.activeWordIndex}
                                        wordOffset={state.wordOffset}
                                        phase={state.phase}
                                        inputRef={inputRef}
                                        onKeyDown={handleKeyDown}
                                        onPaste={handlePaste}
                                    />

                                    <VirtualKeyboard
                                        layout={state.settings.layout}
                                        activeCode={activeCode}
                                    />

                                    <div className="typing-hint-row">
                                        <p className="typing-shortcuts">
                                            <span>
                                                <kbd>space</kbd> locks typed
                                                word
                                            </span>
                                            <i aria-hidden="true">•</i>
                                            <span>
                                                <kbd>tab</kbd> to navigate
                                            </span>
                                            <i aria-hidden="true">•</i>
                                            <span>
                                                <kbd>esc</kbd> to restart
                                            </span>
                                            <i aria-hidden="true">•</i>
                                            <span>
                                                <kbd>backspace</kbd> edits
                                                current word only
                                            </span>
                                        </p>
                                        {state.phase === 'running' &&
                                            state.settings.mode.kind ===
                                                'timeless' && (
                                                <button
                                                    className="test-action test-action--danger"
                                                    type="button"
                                                    onClick={handleStop}
                                                >
                                                    Stop test
                                                </button>
                                            )}
                                    </div>
                                    <p className="physical-keyboard-note">
                                        physical keyboard required
                                    </p>
                                </section>
                            )}
                        </div>
                    </div>
                </main>

                <div
                    className="screen-reader-only"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {completionAnnouncement}
                </div>
            </div>
        </div>
    );
}
