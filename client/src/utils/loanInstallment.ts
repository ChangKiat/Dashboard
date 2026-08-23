export type LoanMethod = 'reducing' | 'flat' | 'included';

export interface LoanTerms {
    method: LoanMethod;
    installment: number;
    remaining: number;
    originalPrincipal: number;
    annualRatePct: number;
    tenureMonths: number;
}

export interface InstallmentSplit {
    interest: number;
    principal: number;
    installment: number;
    remainingAfter: number;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

export function parseLoanMethod(value: string | null | undefined): LoanMethod | null {
    if (value === 'reducing' || value === 'flat' || value === 'included') return value;
    return null;
}

export function computeInstallmentSplit(terms: LoanTerms): InstallmentSplit | null {
    const remaining = roundMoney(terms.remaining);
    if (!(remaining > 0) || !(terms.installment > 0)) {
        return null;
    }

    if (terms.method === 'included') {
        const principal = roundMoney(Math.min(remaining, terms.installment));
        if (principal <= 0) return null;
        return {
            interest: 0,
            principal,
            installment: principal,
            remainingAfter: roundMoney(remaining - principal),
        };
    }

    if (terms.tenureMonths < 1) return null;

    const rate = Math.max(0, terms.annualRatePct);
    let interest: number;

    if (terms.method === 'flat') {
        const years = terms.tenureMonths / 12;
        const totalInterest = terms.originalPrincipal * (rate / 100) * years;
        interest = roundMoney(totalInterest / terms.tenureMonths);
    } else {
        const monthlyRate = rate / 12 / 100;
        interest = roundMoney(remaining * monthlyRate);
    }

    if (interest > terms.installment) {
        interest = roundMoney(terms.installment);
    }

    const principal = roundMoney(Math.min(remaining, Math.max(0, terms.installment - interest)));
    const installment = roundMoney(interest + principal);
    if (installment <= 0) return null;

    return {
        interest,
        principal,
        installment,
        remainingAfter: roundMoney(remaining - principal),
    };
}

export function suggestedInstallmentAmount(input: {
    method: LoanMethod;
    originalPrincipal: number;
    annualRatePct: number;
    tenureMonths: number;
}): number | null {
    const principal = input.originalPrincipal;
    const n = input.tenureMonths;
    if (!(principal > 0) || n < 1) return null;

    if (input.method === 'included') {
        return roundMoney(principal / n);
    }

    const rate = Math.max(0, input.annualRatePct);
    if (input.method === 'flat') {
        const totalInterest = principal * (rate / 100) * (n / 12);
        return roundMoney((principal + totalInterest) / n);
    }

    const monthlyRate = rate / 12 / 100;
    if (monthlyRate === 0) return roundMoney(principal / n);

    const factor = (1 + monthlyRate) ** n;
    return roundMoney((principal * monthlyRate * factor) / (factor - 1));
}
