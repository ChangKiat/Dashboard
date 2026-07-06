import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

import type { PaymentAccount } from '../api';
import { fetchPaymentAccounts } from '../api';

interface PaymentAccountsContextValue {
    accounts: PaymentAccount[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const PaymentAccountsContext = createContext<PaymentAccountsContextValue | null>(null);

export function PaymentAccountsProvider({ children }: { children: ReactNode }) {
    const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetchPaymentAccounts();
            setAccounts(res.entries);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load payment accounts');
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        refresh()
            .catch(() => {
                // error state set in refresh
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [refresh]);

    const value = useMemo(
        () => ({ accounts, loading, error, refresh }),
        [accounts, loading, error, refresh]
    );

    return (
        <PaymentAccountsContext.Provider value={value}>{children}</PaymentAccountsContext.Provider>
    );
}

export function usePaymentAccounts() {
    const ctx = useContext(PaymentAccountsContext);
    if (!ctx) {
        throw new Error('usePaymentAccounts must be used within PaymentAccountsProvider');
    }
    return ctx;
}
