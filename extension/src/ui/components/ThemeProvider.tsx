import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
    theme: Theme;
    setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'dark',
    setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark');
    const [isLoaded, setIsLoaded] = useState(false);

    // Load theme from chrome storage on mount - synchronously if possible
    useEffect(() => {
        chrome.storage.local.get(['theme'], (result) => {
            const stored = result.theme as Theme | undefined;
            const initialTheme = stored || 'dark';
            setThemeState(initialTheme);
            
            // Apply immediately
            const root = document.documentElement;
            root.classList.remove('dark', 'light');
            root.classList.add(initialTheme);
            
            setIsLoaded(true);
        });
    }, []);

    // Apply theme class whenever it changes
    useEffect(() => {
        if (!isLoaded) return;
        
        const root = document.documentElement;
        root.classList.remove('dark', 'light');
        root.classList.add(theme);
    }, [theme, isLoaded]);

    const setTheme = (t: Theme) => {
        setThemeState(t);
        chrome.storage.local.set({ theme: t });
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
