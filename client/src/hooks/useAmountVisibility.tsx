import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { formatMYR, HIDDEN_AMOUNT } from '../utils/money';

const STORAGE_KEY = 'dashboard-hide-amounts';

interface AmountVisibilityContextValue {
    hidden: boolean;
    toggleHidden: () => void;
}

const AmountVisibilityContext = createContext<AmountVisibilityContextValue>({
    hidden: false,
    toggleHidden: () => {},
});

function readStoredHidden(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function AmountVisibilityProvider({ children }: { children: ReactNode }) {
    const [hidden, setHidden] = useState(readStoredHidden);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
        } catch {
            // localStorage unavailable
        }
    }, [hidden]);

    const toggleHidden = useCallback(() => setHidden((h) => !h), []);

    const value = useMemo(() => ({ hidden, toggleHidden }), [hidden, toggleHidden]);

    return (
        <AmountVisibilityContext.Provider value={value}>{children}</AmountVisibilityContext.Provider>
    );
}

export function useAmountVisibility() {
    return useContext(AmountVisibilityContext);
}

/** RM formatter that masks every amount while "Hide amounts" is on. */
export function useFormatMYR() {
    const { hidden } = useAmountVisibility();
    return useCallback((amount: number) => (hidden ? HIDDEN_AMOUNT : formatMYR(amount)), [hidden]);
}
