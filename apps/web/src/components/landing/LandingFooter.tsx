import { Link } from 'react-router-dom';
import { MarbeeLogo } from '@/components/ui';
import { useLandingTheme } from './LandingThemeContext';

export function LandingFooter() {
  const { styles } = useLandingTheme();

  return (
    <footer className={`border-t ${styles.footer}`}>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <MarbeeLogo size="sm" textClassName={styles.footerBrand} />
            <p className={`mt-3 max-w-xs text-sm ${styles.footerText}`}>
              Customer engagement and marketing automation for modern teams.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${styles.footerHeading}`}>Product</p>
              <ul className={`mt-3 space-y-2 text-sm ${styles.footerText}`}>
                <li><a href="#features" className={styles.footerLink}>Features</a></li>
                <li><a href="#pricing" className={styles.footerLink}>Pricing</a></li>
                <li><Link to="/login?signup=1" className={styles.footerLink}>Sign up</Link></li>
              </ul>
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${styles.footerHeading}`}>Platform</p>
              <ul className={`mt-3 space-y-2 text-sm ${styles.footerText}`}>
                <li>Journeys</li>
                <li>Customer 360</li>
                <li>Data schemas</li>
              </ul>
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${styles.footerHeading}`}>Account</p>
              <ul className={`mt-3 space-y-2 text-sm ${styles.footerText}`}>
                <li><Link to="/login" className={styles.footerLink}>Sign in</Link></li>
                <li><Link to="/dashboard" className={styles.footerLink}>Dashboard</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className={`mt-10 border-t pt-6 text-center text-xs ${styles.footerBorder} ${styles.footerHeading}`}>
          © {new Date().getFullYear()} Marbee. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
