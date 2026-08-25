import type { PaymentAccountType } from '../api';
import { resolveAccountIcon } from '../utils/accountIcons';

interface Props {
    name: string;
    accountType?: PaymentAccountType;
    size?: 'sm' | 'md';
    className?: string;
}

export default function AccountIcon({
    name,
    accountType,
    size = 'md',
    className = '',
}: Props) {
    const def = resolveAccountIcon(name, accountType);
    return (
        <span
            className={`account-icon account-icon-${size}${className ? ` ${className}` : ''}`}
            style={{ background: def.bg, color: def.fg }}
            title={def.label}
            aria-hidden
        >
            {def.short}
        </span>
    );
}
