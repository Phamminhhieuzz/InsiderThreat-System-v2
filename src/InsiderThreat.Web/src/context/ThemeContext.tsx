import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    liquidGlass: boolean;
    toggleLiquidGlass: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme');
        return (saved as Theme) || 'dark';
    });

    const [liquidGlass, setLiquidGlass] = useState<boolean>(() => {
        const saved = localStorage.getItem('liquidGlass');
        return saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('liquidGlass', String(liquidGlass));
        if (liquidGlass) {
            document.documentElement.classList.add('liquid-glass-enabled');
        } else {
            document.documentElement.classList.remove('liquid-glass-enabled');
        }
    }, [liquidGlass]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const toggleLiquidGlass = () => {
        setLiquidGlass(prev => !prev);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, liquidGlass, toggleLiquidGlass }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};
