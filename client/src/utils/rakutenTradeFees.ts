export type RakutenSecurityType = 'ordinary' | 'reit_warrant' | 'etf';
export type RakutenTradeSide = 'buy' | 'sell';

export interface RakutenFeeBreakdown {
    brokerage: number;
    clearing: number;
    stamp: number;
    levy: number;
    sst: number;
    total: number;
}

const FREE_BUY_MONTH = 1000;
const BROKERAGE_RATE = 0.001;
const BROKERAGE_MIN = 8;
const CLEARING_RATE = 0.0003;
const CLEARING_CAP = 1000;
const STAMP_UNIT = 1000;
const STAMP_CAP_ORDINARY = 1000;
const STAMP_CAP_REIT = 200;
const LEVY_THRESHOLD = 1_000_000;
const LEVY_RATE = 0.0001;
const SST_RATE = 0.08;
const ETF_STAMP_EXEMPT_UNTIL = '2028-12-31';

export function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

export function formatFeeAmount(n: number): string {
    return n.toFixed(2);
}

export function isRakutenSecurityType(value: string): value is RakutenSecurityType {
    return value === 'ordinary' || value === 'reit_warrant' || value === 'etf';
}

export function monthToDateBuyGross(
    events: Array<{
        eventType: string;
        date: string;
        quantity: number | null;
        unitPrice: number | null;
    }>,
    tradeDate: string
): number {
    const month = tradeDate.slice(0, 7);
    if (month.length < 7) return 0;
    let total = 0;
    for (const event of events) {
        if (event.eventType !== 'buy' || !event.date.startsWith(month)) continue;
        if (event.quantity == null || event.unitPrice == null) continue;
        total += event.quantity * event.unitPrice;
    }
    return roundMoney(total);
}

function brokerageBuy(gross: number, monthToDateBuys: number): number {
    const remainingFree = Math.max(0, FREE_BUY_MONTH - monthToDateBuys);
    const excess = Math.max(0, gross - remainingFree);
    if (excess <= 0) return 0;
    return roundMoney(Math.max(BROKERAGE_MIN, excess * BROKERAGE_RATE));
}

function brokerageSell(gross: number): number {
    if (gross <= 0) return 0;
    return roundMoney(Math.max(BROKERAGE_MIN, gross * BROKERAGE_RATE));
}

function clearingFee(gross: number): number {
    if (gross <= 0) return 0;
    return roundMoney(Math.min(CLEARING_CAP, gross * CLEARING_RATE));
}

function stampDuty(gross: number, type: RakutenSecurityType, tradeDate: string): number {
    if (gross <= 0) return 0;
    if (type === 'etf' && tradeDate <= ETF_STAMP_EXEMPT_UNTIL) return 0;
    const cap = type === 'ordinary' ? STAMP_CAP_ORDINARY : STAMP_CAP_REIT;
    return Math.min(cap, Math.ceil(gross / STAMP_UNIT));
}

function levyFee(gross: number): number {
    if (gross <= LEVY_THRESHOLD) return 0;
    return roundMoney(gross * LEVY_RATE);
}

export function estimateRakutenTradeFee(input: {
    side: RakutenTradeSide;
    gross: number;
    monthToDateBuyGross: number;
    securityType: RakutenSecurityType;
    tradeDate: string;
}): RakutenFeeBreakdown {
    const gross = roundMoney(Math.max(0, input.gross));
    const brokerage =
        input.side === 'buy'
            ? brokerageBuy(gross, input.monthToDateBuyGross)
            : brokerageSell(gross);
    const clearing = clearingFee(gross);
    const stamp = stampDuty(gross, input.securityType, input.tradeDate);
    const levy = levyFee(gross);
    const sstBase = input.securityType === 'ordinary' ? 0 : brokerage + clearing;
    const sst = roundMoney(sstBase * SST_RATE);
    return {
        brokerage,
        clearing,
        stamp,
        levy,
        sst,
        total: roundMoney(brokerage + clearing + stamp + levy + sst),
    };
}

export function tradeFeeFromEvent(event: {
    eventType: string;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
}): number | null {
    if (event.eventType !== 'buy' && event.eventType !== 'sell') return null;
    if (event.quantity == null || event.unitPrice == null || event.amount == null) return null;
    const gross = roundMoney(event.quantity * event.unitPrice);
    const fee =
        event.eventType === 'buy'
            ? roundMoney(event.amount - gross)
            : roundMoney(gross - event.amount);
    return fee > 0.004 ? fee : null;
}
