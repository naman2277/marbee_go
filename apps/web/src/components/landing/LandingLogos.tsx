import { useLandingTheme } from './LandingThemeContext';

const CUSTOMERS = [
  { name: 'Acme Retail', mark: 'AR', accent: 'from-orange-500 to-red-500' },
  { name: 'Nova Bank', mark: 'NB', accent: 'from-blue-500 to-indigo-600' },
  { name: 'Pulse Health', mark: 'PH', accent: 'from-emerald-500 to-teal-600' },
  { name: 'Orbit SaaS', mark: 'OS', accent: 'from-violet-500 to-purple-600' },
  { name: 'Zen Commerce', mark: 'ZC', accent: 'from-pink-500 to-rose-500' },
  { name: 'Atlas Media', mark: 'AM', accent: 'from-amber-500 to-orange-500' },
];

export function LandingLogos() {
  const { styles } = useLandingTheme();

  return (
    <section className={`py-14 ${styles.logosSection}`}>
      <div className="mx-auto max-w-6xl px-6">
        <p className={`text-center text-sm font-medium uppercase tracking-wider ${styles.logosLabel}`}>
          Trusted by growth teams worldwide
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CUSTOMERS.map((customer) => (
            <div
              key={customer.name}
              className={`flex flex-col items-center gap-3 rounded-xl border px-4 py-5 transition hover:scale-[1.02] ${styles.logoTile}`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${customer.accent} text-xs font-bold text-white shadow-md`}
              >
                {customer.mark}
              </div>
              <span className="text-center text-sm font-semibold">{customer.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
