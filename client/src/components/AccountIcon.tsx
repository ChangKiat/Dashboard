import { useState } from 'react';
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
    const [logoFailed, setLogoFailed] = useState(false);
    const showLogo = !!def.domain && !logoFailed;

    return (
        <span
            className={`account-icon account-icon-${size}${className ? ` ${className}` : ''}`}
            style={showLogo ? undefined : { background: def.bg, color: def.fg }}
            title={def.label}
            aria-hidden
        >
            {showLogo ? (
                <img
                    src={`https://www.google.com/s2/favicons?sz=64&domain=${def.domain}`}
                    alt=""
                    className="account-icon-logo"
                    onError={() => setLogoFailed(true)}
                />
            ) : (
                def.short
            )}
        </span>
    );
}
