import { useMemo } from 'react';

import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { buildPaymentMethodOptions } from '../utils/paymentMethods';

interface Props {
    id: string;
    value: string;
    onChange: (value: string) => void;
}

export default function PaymentMethodSelect({ id, value, onChange }: Props) {
    const { accounts } = usePaymentAccounts();
    const options = useMemo(() => buildPaymentMethodOptions(accounts, value), [accounts, value]);

    return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {options.map((method) => (
                <option key={method} value={method}>
                    {method}
                </option>
            ))}
        </select>
    );
}
