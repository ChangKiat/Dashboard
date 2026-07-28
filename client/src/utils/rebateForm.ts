import type {
    DescriptionMappingRule,
    RebateConfig,
    SimpleRebateCategory,
    SimpleRebateConfig,
    TieredRebateConfig,
} from '../api';
import { REBATE_CATEGORIES } from '../api';

export type MappingRow = { id: string; expenseCategory: string; rebateCategory: string };

export type DescriptionRuleRow = {
    id: string;
    keywords: string;
    expenseCategory: string;
    rebateCategory: string;
};

export type TierFormRow = { id: string; minTotalSpend: string; rates: Record<string, string> };

export type CategoryDefFormRow = {
    id: string;
    name: string;
    cap: string;
    fixedRatePercent: string;
    isDefault: boolean;
    minSpendPerMapping: string;
    minTotalSpend: string;
};

export type RebateFormState = {
    enabled: boolean;
    ruleType: 'simple' | 'tiered';
    minSpendThreshold: string;
    highRatePercent: string;
    lowRatePercent: string;
    categoryCap: string;
    mappings: MappingRow[];
    descriptionRules: DescriptionRuleRow[];
    tiers: TierFormRow[];
    categoryDefs: CategoryDefFormRow[];
};

function defaultCategoryDefs(): CategoryDefFormRow[] {
    return REBATE_CATEGORIES.map((name) => ({
        id: name,
        name,
        cap: '15',
        fixedRatePercent: '',
        isDefault: false,
        minSpendPerMapping: '',
        minTotalSpend: '',
    }));
}

function categoryDefToFormRow(c: {
    name: string;
    cap: number | null;
    isDefault?: boolean;
    fixedRate?: number;
    minSpendPerMapping?: number;
    minTotalSpend?: number;
}): CategoryDefFormRow {
    return {
        id: c.name,
        name: c.name,
        cap: c.cap == null ? '' : String(c.cap),
        fixedRatePercent: c.fixedRate != null ? String(c.fixedRate * 100) : '',
        isDefault: c.isDefault === true,
        minSpendPerMapping: c.minSpendPerMapping != null ? String(c.minSpendPerMapping) : '',
        minTotalSpend: c.minTotalSpend != null ? String(c.minTotalSpend) : '',
    };
}

function parseCategoryFromForm(
    c: CategoryDefFormRow,
    includeTierMins: boolean
): (SimpleRebateCategory & {
    minSpendPerMapping?: number;
    minTotalSpend?: number;
}) | null {
    if (!c.name.trim()) return null;
    const capRaw = c.cap.trim();
    let cap: number | null;
    if (capRaw === '') {
        cap = null;
    } else {
        const parsed = parseFloat(capRaw);
        if (!Number.isFinite(parsed) || parsed < 0) return null;
        cap = parsed;
    }
    const def: SimpleRebateCategory & {
        minSpendPerMapping?: number;
        minTotalSpend?: number;
    } = {
        name: c.name.trim(),
        cap,
    };
    if (c.isDefault) def.isDefault = true;
    const fixedPct = parseFloat(c.fixedRatePercent);
    if (Number.isFinite(fixedPct) && fixedPct >= 0 && c.fixedRatePercent.trim() !== '') {
        def.fixedRate = fixedPct / 100;
    }
    if (includeTierMins) {
        const minPer = parseFloat(c.minSpendPerMapping);
        if (Number.isFinite(minPer) && minPer > 0) def.minSpendPerMapping = minPer;
        const minTotal = parseFloat(c.minTotalSpend);
        if (Number.isFinite(minTotal) && minTotal > 0) def.minTotalSpend = minTotal;
    }
    return def;
}

function descriptionRulesFromConfig(
    rules: DescriptionMappingRule[] | undefined
): DescriptionRuleRow[] {
    if (!rules?.length) return [];
    return rules.map((rule, i) => ({
        id: `desc-${i}-${rule.rebateCategory}`,
        keywords: rule.keywords.join(', '),
        expenseCategory: rule.expenseCategory ?? '',
        rebateCategory: rule.rebateCategory,
    }));
}

function buildDescriptionRules(form: RebateFormState): DescriptionMappingRule[] {
    const rules: DescriptionMappingRule[] = [];
    for (const row of form.descriptionRules) {
        const keywords = row.keywords
            .split(',')
            .map((kw) => kw.trim())
            .filter(Boolean);
        if (keywords.length === 0 || !row.rebateCategory) continue;
        const rule: DescriptionMappingRule = {
            keywords,
            rebateCategory: row.rebateCategory,
        };
        if (row.expenseCategory.trim()) {
            rule.expenseCategory = row.expenseCategory.trim();
        }
        rules.push(rule);
    }
    return rules;
}

export function emptyRebateForm(): RebateFormState {
    return {
        enabled: false,
        ruleType: 'simple',
        minSpendThreshold: '1500',
        highRatePercent: '10',
        lowRatePercent: '0.2',
        categoryCap: '15',
        mappings: [],
        descriptionRules: [],
        tiers: [],
        categoryDefs: defaultCategoryDefs(),
    };
}

export function rebateFormFromConfig(config: RebateConfig | null | undefined): RebateFormState {
    if (!config?.enabled) return emptyRebateForm();

    const mappings = Object.entries(config.categoryMappings).map(([expenseCategory, rebateCategory]) => ({
        id: `${expenseCategory}-${rebateCategory}`,
        expenseCategory,
        rebateCategory,
    }));
    const descriptionRules = descriptionRulesFromConfig(config.descriptionRules);

    if (config.ruleType === 'tiered') {
        return {
            enabled: true,
            ruleType: 'tiered',
            minSpendThreshold: '1500',
            highRatePercent: '10',
            lowRatePercent: '0.2',
            categoryCap: '15',
            mappings,
            descriptionRules,
            categoryDefs: config.categories.map(categoryDefToFormRow),
            tiers: config.tiers.map((t) => ({
                id: `tier-${t.minTotalSpend}`,
                minTotalSpend: String(t.minTotalSpend),
                rates: Object.fromEntries(
                    Object.entries(t.rates).map(([k, v]) => [k, String(v * 100)])
                ),
            })),
        };
    }

    const simpleCategories =
        config.categories && config.categories.length > 0
            ? config.categories
            : config.rebateCategories.map((name) => ({ name, cap: config.categoryCap as number | null }));

    return {
        enabled: true,
        ruleType: 'simple',
        minSpendThreshold: String(config.minSpendThreshold),
        highRatePercent: String(config.highRate * 100),
        lowRatePercent: String(config.lowRate * 100),
        categoryCap: String(config.categoryCap),
        mappings,
        descriptionRules,
        tiers: [],
        categoryDefs: simpleCategories.map(categoryDefToFormRow),
    };
}

export function getRebateCategoryOptions(form: RebateFormState): string[] {
    return form.categoryDefs.map((c) => c.name).filter(Boolean);
}

export function buildRebateConfig(form: RebateFormState): RebateConfig | null {
    if (!form.enabled) return null;

    const categoryMappings: Record<string, string> = {};
    for (const row of form.mappings) {
        if (row.expenseCategory && row.rebateCategory) {
            categoryMappings[row.expenseCategory] = row.rebateCategory;
        }
    }
    const descriptionRules = buildDescriptionRules(form);

    if (form.ruleType === 'tiered') {
        const categories = form.categoryDefs
            .map((c) => parseCategoryFromForm(c, true))
            .filter((c): c is NonNullable<typeof c> => c != null) as TieredRebateConfig['categories'];

        if (categories.length === 0) return null;

        const categoryNames = categories.map((c) => c.name);
        const tiers = form.tiers
            .map((t) => {
                const minTotalSpend = parseFloat(t.minTotalSpend);
                if (!Number.isFinite(minTotalSpend) || minTotalSpend < 0) return null;
                const rates: Record<string, number> = {};
                for (const name of categoryNames) {
                    const pct = parseFloat(t.rates[name] ?? '0');
                    rates[name] = Number.isFinite(pct) ? pct / 100 : 0;
                }
                return { minTotalSpend, rates };
            })
            .filter((t): t is NonNullable<typeof t> => t != null);

        if (tiers.length === 0) return null;

        const config: TieredRebateConfig = {
            enabled: true,
            ruleType: 'tiered',
            tiers,
            categories,
            categoryMappings,
            ...(descriptionRules.length > 0 ? { descriptionRules } : {}),
        };
        return config;
    }

    const minSpendThreshold = parseFloat(form.minSpendThreshold);
    const highRate = parseFloat(form.highRatePercent) / 100;
    const lowRate = parseFloat(form.lowRatePercent) / 100;
    if (
        !Number.isFinite(minSpendThreshold) ||
        !Number.isFinite(highRate) ||
        !Number.isFinite(lowRate)
    ) {
        return null;
    }

    const categories = form.categoryDefs
        .map((c) => parseCategoryFromForm(c, false))
        .filter((c): c is NonNullable<typeof c> => c != null);

    if (categories.length === 0) return null;

    const firstFiniteCap = categories.find((c) => c.cap != null)?.cap;
    const categoryCap = firstFiniteCap ?? 15;

    const config: SimpleRebateConfig = {
        enabled: true,
        ruleType: 'simple',
        minSpendThreshold,
        highRate,
        lowRate,
        categoryCap,
        rebateCategories: categories.map((c) => c.name),
        categories,
        categoryMappings,
        ...(descriptionRules.length > 0 ? { descriptionRules } : {}),
    };
    return config;
}

export function newTierRow(categoryNames: string[]): TierFormRow {
    const rates: Record<string, string> = {};
    for (const name of categoryNames) rates[name] = '0';
    return { id: `tier-${Date.now()}`, minTotalSpend: '1000', rates };
}
