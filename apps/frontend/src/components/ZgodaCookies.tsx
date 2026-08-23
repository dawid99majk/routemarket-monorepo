import { useEffect, useState } from 'react';

const KLUCZ = 'rm_zgoda_cookies';
const POMIAR = 'G-HSM8K88KY0';

type Wybor = 'przyjete' | 'odrzucone';

/** Odczyt bez wybuchu w trybie prywatnym, gdzie storage bywa zablokowany. */
function zapamietany(): Wybor | null {
  try { return localStorage.getItem(KLUCZ) as Wybor | null; } catch { return null; }
}

/**
 * Wstawia Google Analytics dopiero po zgodzie. Wcześniej skrypt siedział wprost
 * w index.html i wykonywał się przy każdym wejściu, zanim ktokolwiek o cokolwiek
 * zapytał — a polityka cookies opisywała mechanizm zgody, którego nie było.
 * Skrypt niewczytany to nie to samo co wczytany i wyłączony: przy odmowie do
 * Google nie idzie żadne żądanie.
 */
function wlaczPomiar() {
  if (document.getElementById('ga-script')) return;
  const s = document.createElement('script');
  s.id = 'ga-script';
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${POMIAR}`;
  document.head.appendChild(s);

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', POMIAR, { send_page_view: false, anonymize_ip: true });
}

export default function ZgodaCookies() {
  const [widoczny, setWidoczny] = useState(false);

  useEffect(() => {
    const wybor = zapamietany();
    if (wybor === 'przyjete') { wlaczPomiar(); return; }
    if (wybor === 'odrzucone') return;
    setWidoczny(true);
  }, []);

  const zdecyduj = (wybor: Wybor) => {
    try { localStorage.setItem(KLUCZ, wybor); } catch { /* tryb prywatny */ }
    if (wybor === 'przyjete') wlaczPomiar();
    setWidoczny(false);
  };

  if (!widoczny) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Zgoda na statystyki"
      className="fixed inset-x-0 bottom-0 z-[1600] border-t border-border bg-card shadow-token-lg
                 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground flex-1 min-w-[260px] text-pretty">
          RouteMarket stores only what it needs to keep you signed in and remember your
          settings. With your agreement we would also measure how the site is used, so we can
          see where people get stuck. Details in the{' '}
          <a href="/legal/cookies" className="underline decoration-dotted underline-offset-2
                                              hover:text-foreground transition-colors">
            Cookie Policy
          </a>.
        </p>
        {/* Odmowa nie może być trudniejsza od zgody — dwa przyciski tej samej wagi,
            bez przygaszania tego niewygodnego. */}
        <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
          <button
            onClick={() => zdecyduj('odrzucone')}
            className="flex-1 sm:flex-none h-10 rounded-full border border-border bg-background px-4 text-sm
                       hover:bg-muted transition-colors"
          >
            Only what is necessary
          </button>
          <button
            onClick={() => zdecyduj('przyjete')}
            className="flex-1 sm:flex-none h-10 rounded-full bg-primary text-primary-foreground px-4 text-sm
                       hover:bg-primary/90 transition-colors"
          >
            Allow statistics
          </button>
        </div>
      </div>
    </div>
  );
}
