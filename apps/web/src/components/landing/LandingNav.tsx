import { Link } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, MarbeeLogo } from '@/components/ui';
import { useLandingTheme } from './LandingThemeContext';

export function LandingNav() {
  const { session } = useAuth();
  const { theme, styles, toggleTheme } = useLandingTheme();

  return (
    <header className={`sticky top-0 z-50 border-b backdrop-blur-xl ${styles.nav}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/">
          <MarbeeLogo size="sm" textClassName={styles.navBrand} />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className={`text-sm font-medium transition ${styles.navLink} ${styles.navLinkHover}`}>
            Features
          </a>
          <a href="#platform" className={`text-sm font-medium transition ${styles.navLink} ${styles.navLinkHover}`}>
            Platform
          </a>
          <a href="#pricing" className={`text-sm font-medium transition ${styles.navLink} ${styles.navLinkHover}`}>
            Pricing
          </a>
          <a href="#cta" className={`text-sm font-medium transition ${styles.navLink} ${styles.navLinkHover}`}>
            Get started
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`rounded-lg p-2 transition ${styles.navLink} ${styles.navLinkHover}`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {session ? (
            <Link to="/dashboard">
              <Button size="sm">Open dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className={styles.ghostBtn}>
                  Sign in
                </Button>
              </Link>
              <Link to="/login?signup=1">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
