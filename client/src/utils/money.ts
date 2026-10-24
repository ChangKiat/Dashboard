export const HIDDEN_AMOUNT = 'RM ••••••';

export function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short label for chart axes: 12500 → "RM 12.5k", -800 → "RM -800". */
export function formatCompactMYR(amount: number) {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000) {
        return `RM ${sign}${(abs / 1000).toLocaleString('en-MY', { maximumFractionDigits: 1 })}k`;
    }
    return `RM ${sign}${Math.round(abs)}`;
}
