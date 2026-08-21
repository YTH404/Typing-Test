type LiveMetricsProps = {
    timeLabel: string;
    liveWpm: number;
    accuracy: number;
};

export function LiveMetrics({
    timeLabel,
    liveWpm,
    accuracy,
}: LiveMetricsProps) {
    return (
        <dl className="live-metrics" aria-label="Current test metrics">
            <div className="metric metric--time">
                <dt>Seconds</dt>
                <dd>{timeLabel}</dd>
            </div>
            <div className="metric">
                <dt>Live WPM</dt>
                <dd>{liveWpm}</dd>
            </div>
            <div className="metric">
                <dt>Accuracy</dt>
                <dd>{accuracy.toFixed(0)}%</dd>
            </div>
        </dl>
    );
}
