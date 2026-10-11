import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  LANDING_STYLES,
  loadLandingTheme,
  saveLandingTheme,
  type LandingStyles,
  type LandingTheme,
} from './landing-theme';

type LandingThemeContextValue = {
  theme: LandingTheme;
  styles: LandingStyles;
  toggleTheme: () => void;
  setTheme: (theme: LandingTheme) => void;
};

const LandingThemeContext = createContext<LandingThemeContextValue | null>(null);

export function LandingThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<LandingTheme>(() => loadLandingTheme());

  useEffect(() => {
    saveLandingTheme(theme);
  }, [theme]);

  const setTheme = (next: LandingTheme) => setThemeState(next);
  const toggleTheme = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <LandingThemeContext.Provider
      value={{ theme, styles: LANDING_STYLES[theme], toggleTheme, setTheme }}
    >
      {children}
    </LandingThemeContext.Provider>
  );
}

export function useLandingTheme() {
  const ctx = useContext(LandingThemeContext);
  if (!ctx) throw new Error('useLandingTheme must be used within LandingThemeProvider');
  return ctx;
}
