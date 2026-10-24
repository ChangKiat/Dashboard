import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

interface RefreshContextValue {
    token: number;
    refreshing: boolean;
    requestRefresh: () => void;
    track: (work: Promise<unknown>) => void;
}

const RefreshContext = createContext<RefreshContextValue>({
    token: 0,
    refreshing: false,
    requestRefresh: () => {},
    track: () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState(0);
    const [pending, setPending] = useState(0);

    const requestRefresh = useCallback(() => setToken((t) => t + 1), []);

    const track = useCallback((work: Promise<unknown>) => {
        setPending((n) => n + 1);
        work.catch(() => {}).finally(() => setPending((n) => n - 1));
    }, []);

    const value = useMemo(
        () => ({ token, refreshing: pending > 0, requestRefresh, track }),
        [token, pending, requestRefresh, track]
    );

    return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefreshControl() {
    const { refreshing, requestRefresh } = useContext(RefreshContext);
    return { refreshing, requestRefresh };
}

/** Runs `onRefresh` each time the header's Refresh button is pressed. */
export function useRefreshSignal(onRefresh: () => Promise<unknown>) {
    const { token, track } = useContext(RefreshContext);
    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;
    const handledTokenRef = useRef(token);

    useEffect(() => {
        if (token === handledTokenRef.current) return;
        handledTokenRef.current = token;
        track(onRefreshRef.current());
    }, [token, track]);
}
