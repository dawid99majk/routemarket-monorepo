import { useEffect, useState } from 'react';
import { parametryWejscia } from '@/lib/zdarzenia';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID = 'G-HSM8K88KY0';

/**
 * Sends a GA4 page_view event on every route change (SPA-aware).
 * Mount once near the top of the React tree (inside <BrowserRouter>).
 */
export function useGaPageview() {
  const location = useLocation();
  // gtag powstaje dopiero po zgodzie, a hook odpala się przy pierwszym renderze —
  // wcześniej. Pierwsza strona wizyty (ta z linku z posta) nie miała odsłony,
  // więc GA4 nie widziało źródła kampanii. Zgoda wysyła „rm:pomiar” i wtedy liczymy.
  const [pomiar, setPomiar] = useState(() => typeof window !== 'undefined' && typeof window.gtag === 'function');

  useEffect(() => {
    const wlacz = () => setPomiar(true);
    window.addEventListener('rm:pomiar', wlacz);
    return () => window.removeEventListener('rm:pomiar', wlacz);
  }, []);

  useEffect(() => {
    if (!pomiar || typeof window.gtag !== 'function') return;
    const path = location.pathname + location.search;
    // Parametry kampanii z adresu wejścia dokładamy do pierwszej odsłony po zgodzie,
    // jeśli użytkownik zdążył przejść na stronę bez nich.
    const kampania = parametryWejscia();
    const adres = new URL(window.location.href);
    if (kampania && !/[?&](utm_|gclid|fbclid)/.test(adres.search)) {
      new URLSearchParams(kampania).forEach((v, k) => adres.searchParams.set(k, v));
    }
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: adres.href,
      page_title: document.title,
      send_to: GA_ID,
    });
  }, [location.pathname, location.search, pomiar]);
}
