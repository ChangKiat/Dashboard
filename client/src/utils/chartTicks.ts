/** Round tick values (steps of 1, 2, 2.5 or 5 × 10ⁿ) covering zero and every value. */
export function niceTicks(values: number[], targetCount = 5): number[] {
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    if (min === max) return [0];
    const rough = (max - min) / (targetCount - 1);
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
    const first = Math.floor(min / step);
    const last = Math.ceil(max / step);
    const ticks: number[] = [];
    for (let i = first; i <= last; i += 1) {
        ticks.push(Math.round(i * step * 100) / 100);
    }
    return ticks;
}
