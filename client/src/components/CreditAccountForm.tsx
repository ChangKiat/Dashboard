import { type Dispatch, type SetStateAction } from 'react';
import type { PaymentAccountType } from '../api';
import {
    getRebateCategoryOptions,
    newTierRow,
    type RebateFormState,
} from '../utils/rebateForm';

export type CreditSettingsTab = 'account' | 'categories' | 'rates' | 'mapping';

interface FormState {
    name: string;
    accountType: PaymentAccountType;
    initialBalance: string;
    creditLimit: string;
    statementDay: string;
}

interface Props {
    form: FormState;
    setForm: Dispatch<SetStateAction<FormState>>;
    rebateForm: RebateFormState;
    setRebateForm: Dispatch<SetStateAction<RebateFormState>>;
    creditTab: CreditSettingsTab;
    setCreditTab: (tab: CreditSettingsTab) => void;
    expenseCategories: string[];
    modalMode: 'create' | 'edit';
}

const TABS: { id: CreditSettingsTab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'categories', label: 'Categories' },
    { id: 'rates', label: 'Rates' },
    { id: 'mapping', label: 'Mapping' },
];

export default function CreditAccountForm({
    form,
    setForm,
    rebateForm,
    setRebateForm,
    creditTab,
    setCreditTab,
    expenseCategories,
    modalMode,
}: Props) {
    const rebateCategoryOptions = getRebateCategoryOptions(rebateForm);
    const activeTab = rebateForm.enabled ? creditTab : 'account';

    return (
        <div className="credit-account-form">
            {rebateForm.enabled && (
                <div className="pa-settings-tabs" role="tablist">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            className={`section-tab${activeTab === tab.id ? ' active' : ''}`}
                            onClick={() => setCreditTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {activeTab === 'account' && (
                <div className="pa-settings-panel">
                    <div className="pa-settings-grid">
                        <div className="form-field">
                            <label htmlFor="pa-name">Name</label>
                            <input
                                id="pa-name"
                                type="text"
                                placeholder="e.g. Shell Visa"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pa-limit">Credit limit (RM)</label>
                            <input
                                id="pa-limit"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="e.g. 5000"
                                value={form.creditLimit}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, creditLimit: e.target.value }))
                                }
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pa-statement-day">Statement day</label>
                            <input
                                id="pa-statement-day"
                                type="number"
                                min="1"
                                max="31"
                                step="1"
                                placeholder="e.g. 23"
                                value={form.statementDay}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, statementDay: e.target.value }))
                                }
                            />
                            <span className="muted form-hint">
                                Day 23 → Jun 23–Jul 22 counts as July.
                            </span>
                        </div>
                        {modalMode === 'edit' && (
                            <div className="form-field">
                                <label htmlFor="pa-type">Type</label>
                                <select
                                    id="pa-type"
                                    value={form.accountType}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            accountType: e.target.value as PaymentAccountType,
                                        }))
                                    }
                                >
                                    <option value="account">Account</option>
                                    <option value="credit">Credit</option>
                                    <option value="investment">Investment</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <label className="rebate-enable-label pa-cashback-toggle">
                        <input
                            type="checkbox"
                            checked={rebateForm.enabled}
                            onChange={(e) => {
                                const enabled = e.target.checked;
                                setRebateForm((f) => ({ ...f, enabled }));
                                if (enabled) setCreditTab('categories');
                            }}
                        />
                        Enable cashback tracking
                    </label>
                </div>
            )}

            {rebateForm.enabled && activeTab === 'categories' && (
                <div className="pa-settings-panel">
                    <div className="rebate-mappings-header">
                        <div>
                            <span className="pa-section-title">Cashback categories</span>
                            <p className="muted form-hint">
                                Blank cap = Unlimited. Check Default for unmapped spend.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn-add"
                            onClick={() =>
                                setRebateForm((f) => {
                                    const name = `Category ${f.categoryDefs.length + 1}`;
                                    return {
                                        ...f,
                                        categoryDefs: [
                                            ...f.categoryDefs,
                                            {
                                                id: `cat-${Date.now()}`,
                                                name,
                                                cap: '15',
                                                fixedRatePercent: '',
                                                isDefault: false,
                                                minSpendPerMapping: '',
                                                minTotalSpend: '',
                                            },
                                        ],
                                        tiers: f.tiers.map((t) => ({
                                            ...t,
                                            rates: { ...t.rates, [name]: '0' },
                                        })),
                                    };
                                })
                            }
                        >
                            + Add
                        </button>
                    </div>
                    {rebateForm.categoryDefs.length > 0 && (
                        <div
                            className={`rebate-category-def-header${
                                rebateForm.ruleType === 'simple' ? ' simple' : ''
                            }`}
                        >
                            <span>Name</span>
                            <span>Cap</span>
                            <span>Fixed %</span>
                            <span>Default</span>
                            {rebateForm.ruleType === 'tiered' && (
                                <>
                                    <span>Min / map</span>
                                    <span>Min total</span>
                                </>
                            )}
                            <span />
                        </div>
                    )}
                    {rebateForm.categoryDefs.map((cat) => (
                        <div
                            key={cat.id}
                            className={`rebate-category-def-row${
                                rebateForm.ruleType === 'simple' ? ' simple' : ''
                            }`}
                        >
                            <input
                                type="text"
                                placeholder="Name"
                                value={cat.name}
                                onChange={(e) => {
                                    const nextName = e.target.value;
                                    setRebateForm((f) => ({
                                        ...f,
                                        categoryDefs: f.categoryDefs.map((c) =>
                                            c.id === cat.id ? { ...c, name: nextName } : c
                                        ),
                                        tiers: f.tiers.map((t) => {
                                            const rates = { ...t.rates };
                                            if (cat.name && rates[cat.name] != null) {
                                                rates[nextName] = rates[cat.name];
                                                if (nextName !== cat.name) delete rates[cat.name];
                                            } else if (nextName) {
                                                rates[nextName] = rates[nextName] ?? '0';
                                            }
                                            return { ...t, rates };
                                        }),
                                    }));
                                }}
                            />
                            <input
                                type="number"
                                min="0"
                                placeholder="∞"
                                value={cat.cap}
                                onChange={(e) =>
                                    setRebateForm((f) => ({
                                        ...f,
                                        categoryDefs: f.categoryDefs.map((c) =>
                                            c.id === cat.id ? { ...c, cap: e.target.value } : c
                                        ),
                                    }))
                                }
                            />
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="—"
                                title="Fixed rate % (overrides tier/simple rate)"
                                value={cat.fixedRatePercent}
                                onChange={(e) =>
                                    setRebateForm((f) => ({
                                        ...f,
                                        categoryDefs: f.categoryDefs.map((c) =>
                                            c.id === cat.id
                                                ? { ...c, fixedRatePercent: e.target.value }
                                                : c
                                        ),
                                    }))
                                }
                            />
                            <label className="rebate-default-check">
                                <input
                                    type="checkbox"
                                    checked={cat.isDefault}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setRebateForm((f) => ({
                                            ...f,
                                            categoryDefs: f.categoryDefs.map((c) => ({
                                                ...c,
                                                isDefault:
                                                    c.id === cat.id
                                                        ? checked
                                                        : checked
                                                          ? false
                                                          : c.isDefault,
                                            })),
                                        }));
                                    }}
                                />
                            </label>
                            {rebateForm.ruleType === 'tiered' && (
                                <>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="—"
                                        value={cat.minSpendPerMapping}
                                        onChange={(e) =>
                                            setRebateForm((f) => ({
                                                ...f,
                                                categoryDefs: f.categoryDefs.map((c) =>
                                                    c.id === cat.id
                                                        ? {
                                                              ...c,
                                                              minSpendPerMapping: e.target.value,
                                                          }
                                                        : c
                                                ),
                                            }))
                                        }
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="—"
                                        value={cat.minTotalSpend}
                                        onChange={(e) =>
                                            setRebateForm((f) => ({
                                                ...f,
                                                categoryDefs: f.categoryDefs.map((c) =>
                                                    c.id === cat.id
                                                        ? { ...c, minTotalSpend: e.target.value }
                                                        : c
                                                ),
                                            }))
                                        }
                                    />
                                </>
                            )}
                            <button
                                type="button"
                                className="btn-secondary rebate-mapping-remove"
                                onClick={() =>
                                    setRebateForm((f) => ({
                                        ...f,
                                        categoryDefs: f.categoryDefs.filter((c) => c.id !== cat.id),
                                        tiers: f.tiers.map((t) => {
                                            const rates = { ...t.rates };
                                            if (cat.name) delete rates[cat.name];
                                            return { ...t, rates };
                                        }),
                                    }))
                                }
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {rebateForm.enabled && activeTab === 'rates' && (
                <div className="pa-settings-panel">
                    <div className="form-field">
                        <label htmlFor="pa-rebate-rule-type">Rule type</label>
                        <select
                            id="pa-rebate-rule-type"
                            value={rebateForm.ruleType}
                            onChange={(e) =>
                                setRebateForm((f) => ({
                                    ...f,
                                    ruleType: e.target.value as 'simple' | 'tiered',
                                }))
                            }
                        >
                            <option value="simple">Simple (high / low rate)</option>
                            <option value="tiered">Tiered (spend thresholds)</option>
                        </select>
                    </div>
                    {rebateForm.ruleType === 'simple' ? (
                        <div className="rebate-settings-row">
                            <div className="form-field">
                                <label htmlFor="pa-rebate-min">Min spend (RM)</label>
                                <input
                                    id="pa-rebate-min"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={rebateForm.minSpendThreshold}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            minSpendThreshold: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="pa-rebate-high">High rate (%)</label>
                                <input
                                    id="pa-rebate-high"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={rebateForm.highRatePercent}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            highRatePercent: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="pa-rebate-low">Low rate (%)</label>
                                <input
                                    id="pa-rebate-low"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={rebateForm.lowRatePercent}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            lowRatePercent: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="rebate-tier-editor">
                            <div className="rebate-mappings-header">
                                <span className="pa-section-title">Spend tiers</span>
                                <button
                                    type="button"
                                    className="btn-add"
                                    onClick={() =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            tiers: [
                                                ...f.tiers,
                                                newTierRow(f.categoryDefs.map((c) => c.name)),
                                            ],
                                        }))
                                    }
                                >
                                    + Add tier
                                </button>
                            </div>
                            {rebateCategoryOptions.length > 0 && rebateForm.tiers.length > 0 && (
                                <div className="rebate-tier-header">
                                    <span>Min spend</span>
                                    {rebateCategoryOptions.map((cat) => (
                                        <span key={cat}>{cat} %</span>
                                    ))}
                                    <span />
                                </div>
                            )}
                            {rebateForm.tiers.length === 0 && (
                                <p className="muted form-hint">Add a tier to set rates by spend level.</p>
                            )}
                            {rebateForm.tiers.map((tier) => (
                                <div key={tier.id} className="rebate-tier-row">
                                    <label>
                                        Min spend
                                        <input
                                            type="number"
                                            min="0"
                                            value={tier.minTotalSpend}
                                            onChange={(e) =>
                                                setRebateForm((f) => ({
                                                    ...f,
                                                    tiers: f.tiers.map((t) =>
                                                        t.id === tier.id
                                                            ? {
                                                                  ...t,
                                                                  minTotalSpend: e.target.value,
                                                              }
                                                            : t
                                                    ),
                                                }))
                                            }
                                        />
                                    </label>
                                    {rebateCategoryOptions.map((cat) => (
                                        <label key={cat}>
                                            {cat}
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={tier.rates[cat] ?? '0'}
                                                onChange={(e) =>
                                                    setRebateForm((f) => ({
                                                        ...f,
                                                        tiers: f.tiers.map((t) =>
                                                            t.id === tier.id
                                                                ? {
                                                                      ...t,
                                                                      rates: {
                                                                          ...t.rates,
                                                                          [cat]: e.target.value,
                                                                      },
                                                                  }
                                                                : t
                                                        ),
                                                    }))
                                                }
                                            />
                                        </label>
                                    ))}
                                    <button
                                        type="button"
                                        className="btn-secondary rebate-mapping-remove"
                                        onClick={() =>
                                            setRebateForm((f) => ({
                                                ...f,
                                                tiers: f.tiers.filter((t) => t.id !== tier.id),
                                            }))
                                        }
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {rebateForm.enabled && activeTab === 'mapping' && (
                <div className="pa-settings-panel">
                    <div className="rebate-mappings">
                        <div className="rebate-mappings-header">
                            <div>
                                <span className="pa-section-title">Category mappings</span>
                                <p className="muted form-hint">Expense category → cashback category</p>
                            </div>
                            <button
                                type="button"
                                className="btn-add"
                                onClick={() =>
                                    setRebateForm((f) => ({
                                        ...f,
                                        mappings: [
                                            ...f.mappings,
                                            {
                                                id: `new-${Date.now()}`,
                                                expenseCategory: expenseCategories[0] ?? '',
                                                rebateCategory: rebateCategoryOptions[0] ?? '',
                                            },
                                        ],
                                    }))
                                }
                            >
                                + Add
                            </button>
                        </div>
                        {rebateForm.mappings.map((row) => (
                            <div key={row.id} className="rebate-mapping-row">
                                <select
                                    value={row.expenseCategory}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            mappings: f.mappings.map((m) =>
                                                m.id === row.id
                                                    ? { ...m, expenseCategory: e.target.value }
                                                    : m
                                            ),
                                        }))
                                    }
                                >
                                    {expenseCategories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                                <span className="rebate-mapping-arrow">→</span>
                                <select
                                    value={row.rebateCategory}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            mappings: f.mappings.map((m) =>
                                                m.id === row.id
                                                    ? { ...m, rebateCategory: e.target.value }
                                                    : m
                                            ),
                                        }))
                                    }
                                >
                                    {rebateCategoryOptions.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="btn-secondary rebate-mapping-remove"
                                    onClick={() =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            mappings: f.mappings.filter((m) => m.id !== row.id),
                                        }))
                                    }
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="rebate-description-rules">
                        <div className="rebate-mappings-header">
                            <div>
                                <span className="pa-section-title">Description rules</span>
                                <p className="muted form-hint">
                                    Checked first. First keyword match wins.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="btn-add"
                                onClick={() =>
                                    setRebateForm((f) => ({
                                        ...f,
                                        descriptionRules: [
                                            ...f.descriptionRules,
                                            {
                                                id: `desc-${Date.now()}`,
                                                keywords: '',
                                                expenseCategory: '',
                                                rebateCategory: rebateCategoryOptions[0] ?? '',
                                            },
                                        ],
                                    }))
                                }
                            >
                                + Add
                            </button>
                        </div>
                        {rebateForm.descriptionRules.map((row) => (
                            <div key={row.id} className="rebate-description-rule-row">
                                <input
                                    type="text"
                                    className="rebate-description-keywords"
                                    placeholder="Keywords (comma-separated)"
                                    value={row.keywords}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            descriptionRules: f.descriptionRules.map((r) =>
                                                r.id === row.id
                                                    ? { ...r, keywords: e.target.value }
                                                    : r
                                            ),
                                        }))
                                    }
                                />
                                <select
                                    value={row.expenseCategory}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            descriptionRules: f.descriptionRules.map((r) =>
                                                r.id === row.id
                                                    ? { ...r, expenseCategory: e.target.value }
                                                    : r
                                            ),
                                        }))
                                    }
                                    aria-label="When category is"
                                >
                                    <option value="">Any</option>
                                    {expenseCategories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                                <span className="rebate-mapping-arrow">→</span>
                                <select
                                    value={row.rebateCategory}
                                    onChange={(e) =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            descriptionRules: f.descriptionRules.map((r) =>
                                                r.id === row.id
                                                    ? { ...r, rebateCategory: e.target.value }
                                                    : r
                                            ),
                                        }))
                                    }
                                >
                                    {rebateCategoryOptions.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="btn-secondary rebate-mapping-remove"
                                    onClick={() =>
                                        setRebateForm((f) => ({
                                            ...f,
                                            descriptionRules: f.descriptionRules.filter(
                                                (r) => r.id !== row.id
                                            ),
                                        }))
                                    }
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
