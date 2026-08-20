import { RotateCcw } from 'lucide-react';

import type {
    KeyboardLayout,
    TestMode,
    TestPhase,
    TestSettings,
    TimedDuration,
} from '../core/types';

type SettingsRailProps = {
    settings: TestSettings;
    phase: TestPhase;
    onChange: (settings: TestSettings) => void;
    onRestart: () => void;
};

const durations: readonly TimedDuration[] = [15, 30, 60, 120];

export function SettingsRail({
    settings,
    phase,
    onChange,
    onRestart,
}: SettingsRailProps) {
    const locked = phase === 'running';

    const updateLayout = (layout: KeyboardLayout) => {
        if (!locked) {
            onChange({ ...settings, layout });
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

    return (
        <aside className="settings-rail" aria-labelledby="settings-heading">
            <h2 id="settings-heading" className="screen-reader-only">
                Test settings
            </h2>
            {locked && <span className="screen-reader-only">Locked</span>}

            <div className="settings-form">
                <fieldset className="settings-group" disabled={locked}>
                    <legend>Keyboard layout</legend>
                    <div className="settings-options">
                        {(['qwerty', 'colemak'] as const).map((layout) => (
                            <label
                                className="settings-radio-label"
                                key={layout}
                            >
                                <input
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

                <fieldset className="settings-group" disabled={locked}>
                    <legend>Test mode</legend>
                    <div className="settings-options">
                        <label className="settings-radio-label">
                            <input
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
                        <label className="settings-radio-label">
                            <input
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
                    className="settings-group"
                    disabled={locked || settings.mode.kind === 'timeless'}
                >
                    <legend>Duration</legend>
                    <div className="settings-options settings-options--four">
                        {durations.map((duration) => (
                            <label
                                className="settings-radio-label"
                                key={duration}
                            >
                                <input
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

                <div className="settings-group">
                    <span className="screen-reader-only">Content options</span>
                    <div className="settings-options settings-options--stacked">
                        <button
                            className="settings-toggle"
                            type="button"
                            aria-pressed={settings.punctuation}
                            aria-disabled={locked}
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
                            aria-disabled={locked}
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
