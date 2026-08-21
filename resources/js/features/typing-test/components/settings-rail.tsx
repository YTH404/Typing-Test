import { RotateCcw } from 'lucide-react';
import type { PointerEvent } from 'react';

import type {
    KeyboardLayout,
    TestMode,
    TestPhase,
    TestSettings,
    TimedDuration,
    TypingDifficulty,
    TypingLanguage,
} from '../core/types';

type SettingsRailProps = {
    settings: TestSettings;
    phase: TestPhase;
    onChange: (settings: TestSettings) => void;
    onRestart: () => void;
    onRequestTypingFocus: () => void;
};

const durations: readonly TimedDuration[] = [15, 30, 60, 120];

export function SettingsRail({
    settings,
    phase,
    onChange,
    onRestart,
    onRequestTypingFocus,
}: SettingsRailProps) {
    const locked = phase === 'running';

    const updateLayout = (layout: KeyboardLayout) => {
        if (!locked) {
            onChange({ ...settings, layout });
        }
    };

    const updateLanguage = (language: TypingLanguage) => {
        if (!locked) {
            onChange({ ...settings, language });
        }
    };

    const updateDifficulty = (difficulty: TypingDifficulty) => {
        if (!locked) {
            onChange({ ...settings, difficulty });
        }
    };

    const updateMode = (mode: TestMode) => {
        if (!locked) {
            onChange({ ...settings, mode });
        }
    };

    const toggleSetting = (key: 'punctuation' | 'capitals') => {
        if (!locked) {
            onChange({ ...settings, [key]: !settings[key] });
        }
    };

    const returnPointerFocusToTyping = (
        event: PointerEvent<HTMLDivElement>,
    ) => {
        if (locked || !event.isPrimary || event.button !== 0) {
            return;
        }

        const target = event.target as HTMLElement;
        const action = target.closest<HTMLElement>('button, input, label');
        const control = action?.matches('label')
            ? action.querySelector<HTMLInputElement>('input')
            : action;

        if (
            control === null ||
            control === undefined ||
            control.matches(':disabled, [aria-disabled="true"]')
        ) {
            return;
        }

        onRequestTypingFocus();
    };

    return (
        <aside className="settings-rail" aria-labelledby="settings-heading">
            <h2 id="settings-heading" className="screen-reader-only">
                Test settings
            </h2>
            {locked && <span className="screen-reader-only">Locked</span>}

            <div
                className="settings-form"
                onPointerUp={returnPointerFocusToTyping}
            >
                <fieldset
                    className="settings-group settings-group--language"
                    disabled={locked}
                >
                    <legend>Language</legend>
                    <div className="settings-options">
                        {(['english', 'indonesian'] as const).map(
                            (language) => (
                                <label
                                    className="settings-radio-label"
                                    htmlFor={`typing-language-${language}`}
                                    key={language}
                                >
                                    <input
                                        id={`typing-language-${language}`}
                                        type="radio"
                                        name="typing-language"
                                        value={language}
                                        checked={settings.language === language}
                                        onChange={() =>
                                            updateLanguage(language)
                                        }
                                    />
                                    {language === 'english'
                                        ? 'English'
                                        : 'Indonesia'}
                                </label>
                            ),
                        )}
                    </div>
                </fieldset>

                <fieldset
                    className="settings-group settings-group--difficulty"
                    disabled={locked}
                >
                    <legend>Difficulty</legend>
                    <div className="settings-options">
                        {(['easy', 'hard'] as const).map((difficulty) => (
                            <label
                                className="settings-radio-label"
                                htmlFor={`typing-difficulty-${difficulty}`}
                                key={difficulty}
                            >
                                <input
                                    id={`typing-difficulty-${difficulty}`}
                                    type="radio"
                                    name="typing-difficulty"
                                    value={difficulty}
                                    checked={settings.difficulty === difficulty}
                                    onChange={() =>
                                        updateDifficulty(difficulty)
                                    }
                                />
                                {difficulty === 'easy' ? 'Easy' : 'Hard'}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <fieldset
                    className="settings-group settings-group--layout"
                    disabled={locked}
                >
                    <legend>Keyboard layout</legend>
                    <div className="settings-options">
                        {(['qwerty', 'colemak'] as const).map((layout) => (
                            <label
                                className="settings-radio-label"
                                htmlFor={`keyboard-layout-${layout}`}
                                key={layout}
                            >
                                <input
                                    id={`keyboard-layout-${layout}`}
                                    type="radio"
                                    name="keyboard-layout"
                                    value={layout}
                                    checked={settings.layout === layout}
                                    onChange={() => updateLayout(layout)}
                                />
                                {layout === 'qwerty' ? 'QWERTY' : 'Colemak'}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <fieldset
                    className="settings-group settings-group--mode"
                    disabled={locked}
                >
                    <legend>Test mode</legend>
                    <div className="settings-options">
                        <label
                            className="settings-radio-label"
                            htmlFor="test-mode-timed"
                        >
                            <input
                                id="test-mode-timed"
                                type="radio"
                                name="test-mode"
                                value="timed"
                                checked={settings.mode.kind === 'timed'}
                                onChange={() =>
                                    updateMode({
                                        kind: 'timed',
                                        durationSeconds:
                                            settings.mode.kind === 'timed'
                                                ? settings.mode.durationSeconds
                                                : 60,
                                    })
                                }
                            />
                            Timed
                        </label>
                        <label
                            className="settings-radio-label"
                            htmlFor="test-mode-timeless"
                        >
                            <input
                                id="test-mode-timeless"
                                type="radio"
                                name="test-mode"
                                value="timeless"
                                checked={settings.mode.kind === 'timeless'}
                                onChange={() =>
                                    updateMode({ kind: 'timeless' })
                                }
                            />
                            Timeless
                        </label>
                    </div>
                </fieldset>

                <fieldset
                    className="settings-group settings-group--duration"
                    disabled={locked || settings.mode.kind === 'timeless'}
                >
                    <legend>Duration</legend>
                    <div className="settings-options settings-options--four">
                        {durations.map((duration) => (
                            <label
                                className="settings-radio-label"
                                htmlFor={`test-duration-${duration}`}
                                key={duration}
                            >
                                <input
                                    id={`test-duration-${duration}`}
                                    type="radio"
                                    name="test-duration"
                                    value={duration}
                                    checked={
                                        settings.mode.kind === 'timed' &&
                                        settings.mode.durationSeconds ===
                                            duration
                                    }
                                    onChange={() =>
                                        updateMode({
                                            kind: 'timed',
                                            durationSeconds: duration,
                                        })
                                    }
                                />
                                {duration}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div
                    className="settings-group settings-group--content"
                    role="group"
                    aria-labelledby="content-options-label"
                >
                    <span
                        className="settings-group-label"
                        id="content-options-label"
                    >
                        Content options
                    </span>
                    <div className="settings-options settings-options--stacked">
                        <button
                            className="settings-toggle"
                            type="button"
                            aria-pressed={settings.punctuation}
                            disabled={locked}
                            onClick={() => toggleSetting('punctuation')}
                        >
                            Punctuation
                            <span
                                className="toggle-indicator"
                                aria-hidden="true"
                            />
                        </button>
                        <button
                            className="settings-toggle"
                            type="button"
                            aria-pressed={settings.capitals}
                            disabled={locked}
                            onClick={() => toggleSetting('capitals')}
                        >
                            Capitals
                            <span
                                className="toggle-indicator"
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                </div>

                <button
                    className="settings-restart"
                    type="button"
                    aria-label="Restart test"
                    title="Restart test"
                    onClick={onRestart}
                >
                    <RotateCcw aria-hidden="true" size={18} />
                </button>
            </div>
        </aside>
    );
}
