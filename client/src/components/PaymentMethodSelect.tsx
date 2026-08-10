import { useMemo } from 'react';

import type { PaymentAccountType } from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { buildPaymentMethodOptions } from '../utils/paymentMethods';

interface Props {
    id: string;
    value: string;
    onChange: (value: string) => void;
    excludeTypes?: PaymentAccountType[];
    emptyLabel?: string;
}

export default function PaymentMethodSelect({
    id,
    value,
    onChange,
    excludeTypes,
    emptyLabel = '—',
}: Props) {
    const { accounts } = usePaymentAccounts();
    const options = useMemo(
        () => buildPaymentMethodOptions(accounts, value, { excludeTypes }),
        [accounts, value, excludeTypes]
    );

    return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{emptyLabel}</option>
            {options.map((method) => (
                <option key={method} value={method}>
                    {method}
                </option>
            ))}
        </select>
    );
}
