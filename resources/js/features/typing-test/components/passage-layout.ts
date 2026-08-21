export type PassageRow = {
    id: number;
    wordIndices: readonly number[];
};

export type WordMeasurement = {
    index: number;
    top: number;
};

const SAME_ROW_TOLERANCE_PX = 1;

export function groupWordMeasurements(
    measurements: readonly WordMeasurement[],
): readonly PassageRow[] {
    const rows: PassageRow[] = [];
    let rowTop: number | null = null;

    measurements.forEach((measurement) => {
        const startsNewRow =
            rowTop === null ||
            Math.abs(measurement.top - rowTop) > SAME_ROW_TOLERANCE_PX;

        if (startsNewRow) {
            rows.push({
                id: measurement.index,
                wordIndices: [measurement.index],
            });
            rowTop = measurement.top;

            return;
        }

        const current = rows.at(-1);

        if (current !== undefined) {
            rows[rows.length - 1] = {
                ...current,
                wordIndices: [...current.wordIndices, measurement.index],
            };
        }
    });

    return rows;
}

export function findWordRow(
    rows: readonly PassageRow[],
    wordIndex: number,
): number {
    return rows.findIndex((row) => row.wordIndices.includes(wordIndex));
}

export function getTargetFirstRow(activeRow: number): number {
    return Math.max(0, activeRow - 1);
}

export function getRetirableRowCount(
    rows: readonly PassageRow[],
    firstVisibleRow: number,
    wordOffset: number,
): number {
    let count = 0;

    while (count < firstVisibleRow) {
        const row = rows[count];

        if (
            row === undefined ||
            row.wordIndices.some((index) => index >= wordOffset)
        ) {
            break;
        }

        count += 1;
    }

    return count;
}
