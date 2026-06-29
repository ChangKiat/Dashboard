import { useMemo } from 'react';

import { buildIncomeCategoryOptions } from '../utils/incomeCategories';

interface Props {
    id: string;
    value: string;
    usedCategories?: string[];
    onChange: (value: string) => void;
}

export default function IncomeCategorySelect({ id, value, usedCategories = [], onChange }: Props) {
    const options = useMemo(
        () => buildIncomeCategoryOptions(usedCategories),
        [usedCategories]
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
