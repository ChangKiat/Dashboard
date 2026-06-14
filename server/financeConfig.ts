import { readFileSync } from 'fs';
import { join } from 'path';

export interface VariableCategoryBudget {
    category: string;
    monthlyBudget: number;
}

export interface FinanceConfig {
    salaryAfterTax: number;
    variableCategories: VariableCategoryBudget[];
}

let cached: FinanceConfig | null = null;

function validateConfig(raw: unknown): FinanceConfig {
    if (!raw || typeof raw !== 'object') {
        throw new Error('finance.config.json must be a JSON object');
    }

    const obj = raw as Record<string, unknown>;

    if (typeof obj.salaryAfterTax !== 'number' || obj.salaryAfterTax < 0) {
        throw new Error('finance.config.json: salaryAfterTax must be a non-negative number');
    }

    if (!Array.isArray(obj.variableCategories) || obj.variableCategories.length === 0) {
        throw new Error('finance.config.json: variableCategories must be a non-empty array');
    }

    const variableCategories: VariableCategoryBudget[] = obj.variableCategories.map((item, i) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`finance.config.json: variableCategories[${i}] must be an object`);
        }
        const entry = item as Record<string, unknown>;
        if (typeof entry.category !== 'string' || !entry.category.trim()) {
            throw new Error(`finance.config.json: variableCategories[${i}].category must be a non-empty string`);
        }
        if (typeof entry.monthlyBudget !== 'number' || entry.monthlyBudget < 0) {
            throw new Error(`finance.config.json: variableCategories[${i}].monthlyBudget must be a non-negative number`);
        }
        return {
            category: entry.category.trim(),
            monthlyBudget: entry.monthlyBudget,
        };
    });

    return {
        salaryAfterTax: obj.salaryAfterTax,
        variableCategories,
    };
}

export function loadFinanceConfig(): FinanceConfig {
    if (cached) return cached;

    const configPath = join(process.cwd(), 'finance.config.json');
    let raw: string;
    try {
        raw = readFileSync(configPath, 'utf-8');
    } catch {
        throw new Error(
            'finance.config.json not found. Copy finance.config.example.json to finance.config.json and fill in your values.'
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('finance.config.json contains invalid JSON');
    }

    cached = validateConfig(parsed);
    return cached;
}
