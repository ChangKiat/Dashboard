import { useCallback, useEffect, useState } from 'react';

export type Theme = 'warm' | 'dark';

// index.html reads the same key before first paint.
const STORAGE_KEY = 'dashboard-theme';

function readStoredTheme(): Theme {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'warm';
    } catch {
        return 'warm';
    }
}

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(readStoredTheme);

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.dataset.theme = 'dark';
        } else {
            delete root.dataset.theme;
        }
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // localStorage unavailable
        }
    }, [theme]);

    const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'warm' : 'dark')), []);

    return { theme, toggleTheme };
}
