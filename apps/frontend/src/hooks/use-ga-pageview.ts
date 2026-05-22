import { useEffect } from 'react';
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    const path = location.pathname + location.search;
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: GA_ID,
    });
  }, [location.pathname, location.search]);
}
