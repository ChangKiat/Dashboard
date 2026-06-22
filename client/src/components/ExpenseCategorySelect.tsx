import { useMemo } from 'react';

import { buildExpenseCategoryOptions } from '../utils/expenseCategories';

interface Props {
    id: string;
    value: string;
    variableCategories: string[];
    usedCategories?: string[];
    onChange: (value: string) => void;
}

export default function ExpenseCategorySelect({
    id,
    value,
    variableCategories,
    usedCategories = [],
    onChange,
}: Props) {
    const options = useMemo(
        () => buildExpenseCategoryOptions(variableCategories, usedCategories),
        [variableCategories, usedCategories]
    );

    const displayOptions = useMemo(() => {
        if (value && !options.includes(value)) return [value, ...options];
        return options;
    }, [options, value]);

    return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
            {displayOptions.map((category) => (
                <option key={category} value={category}>
                    {category}
                </option>
            ))}
        </select>
    );
}
