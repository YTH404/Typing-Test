import type { MetricSample, TestResult, TestSettings } from '../core/types';

export type SessionRecord = {
    id: number;
    result: TestResult;
    settings: TestSettings;
};

type ResultsViewProps = {
    result: TestResult;
    samples: readonly MetricSample[];
    settings: TestSettings;
    sessions: readonly SessionRecord[];
    onTryAgain: () => void;
    onNewTest: () => void;
};

const formatDuration = (elapsedMs: number) => {
    const totalSeconds = Math.max(0, Math.round(elapsedMs / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return minutes > 0
        ? `${minutes}:${seconds.toString().padStart(2, '0')}`
        : `${seconds}s`;
};

const formatSettings = (settings: TestSettings): string =>
    [
        settings.language === 'english' ? 'English' : 'Indonesia',
        settings.difficulty === 'easy' ? 'Easy' : 'Hard',
        settings.layout === 'qwerty' ? 'QWERTY' : 'Colemak',
        settings.mode.kind === 'timed'
            ? `${settings.mode.durationSeconds}s`
            : 'Timeless',
        settings.punctuation ? 'Punctuation' : 'No punctuation',
        settings.capitals ? 'Capitals' : 'Lowercase',
    ].join(' · ');

const getChartSamples = (
    samples: readonly MetricSample[],
    result: TestResult,
): readonly MetricSample[] =>
    samples.length > 0
        ? samples
        : [
              {
                  elapsedMs: result.elapsedMs,
                  wpm: result.wpm,
                  rawWpm: result.rawWpm,
                  accuracy: result.accuracy,
              },
          ];

const pathFor = (
    points: readonly MetricSample[],
    value: (sample: MetricSample) => number,
    maxValue: number,
) => {
    const left = 38;
    const right = 750;
    const top = 8;
    const bottom = 164;
    const safePoints =
        points.length > 1
            ? points
            : [
                  {
                      elapsedMs: 0,
                      wpm: 0,
                      rawWpm: 0,
                      accuracy: 100,
                  },
                  points[0] ?? {
                      elapsedMs: 1,
                      wpm: 0,
                      rawWpm: 0,
                      accuracy: 100,
                  },
              ];
    const lastIndex = Math.max(1, safePoints.length - 1);

    return safePoints
        .map((point, index) => {
            const x = left + (index / lastIndex) * (right - left);
            const y =
                bottom -
                (Math.max(0, value(point)) / maxValue) * (bottom - top);

            return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
};

function ResultChart({
    samples,
    result,
}: Pick<ResultsViewProps, 'samples' | 'result'>) {
    const chartSamples = getChartSamples(samples, result);
    const maxValue = Math.max(
        20,
        ...chartSamples.flatMap((sample) => [sample.wpm, sample.rawWpm]),
    );
    const roundedMax = Math.ceil(maxValue / 20) * 20;
    const elapsedSeconds = Math.max(1, Math.round(result.elapsedMs / 1_000));

    return (
        <figure className="result-chart">
            <div className="chart-heading">
                <figcaption>WPM over time</figcaption>
                <div className="chart-legend" aria-hidden="true">
                    <span>
                        <i /> WPM
                    </span>
                    <span>
                        <i /> Raw WPM
                    </span>
                </div>
            </div>
            <div className="chart-frame">
                <svg viewBox="0 0 760 190" aria-hidden="true">
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = 164 - ratio * 156;

                        return (
                            <g key={ratio}>
                                <line
                                    className="chart-grid-line"
                                    x1="38"
                                    x2="750"
                                    y1={y}
                                    y2={y}
                                />
                                <text
                                    className="chart-axis-label"
                                    x="2"
                                    y={y + 3}
                                >
                                    {Math.round(roundedMax * ratio)}
                                </text>
                            </g>
                        );
                    })}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                        <text
                            className="chart-axis-label"
                            x={38 + ratio * 712}
                            y="184"
                            textAnchor={
                                ratio === 0
                                    ? 'start'
                                    : ratio === 1
                                      ? 'end'
                                      : 'middle'
                            }
                            key={ratio}
                        >
                            {Math.round(elapsedSeconds * ratio)}s
                        </text>
                    ))}
                    <path
                        className="chart-raw-line"
                        d={pathFor(
                            chartSamples,
                            (sample) => sample.rawWpm,
                            roundedMax,
                        )}
                    />
                    <path
                        className="chart-wpm-line"
                        d={pathFor(
                            chartSamples,
                            (sample) => sample.wpm,
                            roundedMax,
                        )}
                    />
                </svg>
            </div>
            <p className="screen-reader-only">
                Speed finished at {result.wpm} words per minute and{' '}
                {result.rawWpm} raw words per minute after{' '}
                {formatDuration(result.elapsedMs)}. The WPM series ends at{' '}
                {result.wpm}; the raw WPM series ends at {result.rawWpm}.
            </p>
        </figure>
    );
}

export function ResultsView({
    result,
    samples,
    settings,
    sessions,
    onTryAgain,
    onNewTest,
}: ResultsViewProps) {
    return (
        <section className="results-view" aria-labelledby="results-heading">
            <div className="results-title">
                <h2 id="results-heading">Test complete</h2>
                <p>{formatSettings(settings)}</p>
            </div>

            <div className="score-hero">
                <strong className="score-number">{result.wpm}</strong>
                <span>WPM</span>
            </div>

            <dl className="results-summary" aria-label="Primary results">
                <div className="result-summary-stat">
                    <dd>{result.rawWpm}</dd>
                    <dt>Raw</dt>
                </div>
                <div className="result-summary-stat">
                    <dd>{result.accuracy.toFixed(0)}%</dd>
                    <dt>Accuracy</dt>
                </div>
                <div className="result-summary-stat">
                    <dd>{Math.round(result.elapsedMs / 1_000)}</dd>
                    <dt>Seconds</dt>
                </div>
            </dl>

            <ResultChart samples={samples} result={result} />

            <dl className="character-summary" aria-label="Character results">
                <div>
                    <dt>Correct</dt>
                    <dd>{result.correct}</dd>
                </div>
                <div>
                    <dt>Incorrect / extra</dt>
                    <dd>
                        {result.incorrect} / {result.extra}
                    </dd>
                </div>
                <div>
                    <dt>Missed</dt>
                    <dd>{result.missed}</dd>
                </div>
            </dl>

            <div className="results-actions">
                <button
                    className="test-action test-action--primary"
                    type="button"
                    onClick={onTryAgain}
                >
                    Try again
                </button>
                <button
                    className="test-action"
                    type="button"
                    onClick={onNewTest}
                >
                    New test
                </button>
            </div>

            {sessions.length > 0 && (
                <section
                    className="session-history"
                    aria-labelledby="session-history-heading"
                >
                    <h3 id="session-history-heading">This session</h3>
                    <ol className="session-list">
                        {sessions.slice(-3).map((session) => (
                            <li key={session.id}>
                                <strong>{session.result.wpm}</strong> WPM ·{' '}
                                {session.result.accuracy.toFixed(0)}% ·{' '}
                                {Math.round(session.result.elapsedMs / 1_000)}s
                                {' — '}
                                {formatSettings(session.settings)}
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <p className="results-reset-note">
                Results reset when this page closes.
            </p>
        </section>
    );
}
