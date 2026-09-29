/**
 * Zdarzenia GA4 dla tego, co produkt robi dziś: tablice, miejsca, plany, GPX.
 *
 * Stary `lib/analytics.ts` mierzył marketplace (checkout, publikacja trasy)
 * i pisał do własnej tabeli. Po zmianie modelu nie było żadnego zdarzenia, które
 * mówiłoby, czy post w mediach przyniósł rejestrację albo tablicę — tylko wejście.
 *
 * Wszystko idzie przez `window.gtag`, które istnieje dopiero po zgodzie na
 * cookies (ZgodaCookies). Bez zgody `zdarzenie()` nic nie robi: nie kolejkuje,
 * nie zapamiętuje, nie wysyła później.
 *
 * Parametry nie niosą danych osobowych: bez adresów e-mail, nazw tablic i
 * identyfikatorów użytkownika. Miasto i liczby tak.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Parametry = Record<string, string | number | boolean | null | undefined>;

export function zdarzenie(nazwa: string, parametry: Parametry = {}): void {
  const gtag = (window as any).gtag;
  if (typeof gtag !== 'function') return;
  try {
    gtag('event', nazwa, parametry);
  } catch {
    /* pomiar nigdy nie może przerwać akcji użytkownika */
  }
}

const ile = (w: unknown) => (Array.isArray(w) ? w.length : 1);
const pierwszy = (w: unknown): Record<string, any> => (Array.isArray(w) ? w[0] ?? {} : (w as any) ?? {});

/**
 * Które zapisy w bazie są zdarzeniem. Reguła dostaje metodę, wartości i wynik;
 * zwraca [nazwa, parametry] albo null, gdy zapis nie jest wart zdarzenia
 * (np. przesunięcie karty na tablicy to też update trip_project_places).
 */
type Regula = (metoda: string, wartosci: unknown) => [string, Parametry] | null;

const REGULY: Record<string, Regula> = {
  trip_projects: (metoda, w) => {
    const p = pierwszy(w);
    if (metoda === 'insert') {
      // Kopia publicznej tablicy to osobny sukces: ktoś uznał cudzy plan za swój.
      return p.copied_from
        ? ['tablica_skopiowana', { miasto: p.destination ?? null }]
        : ['tablica_utworzona', { miasto: p.destination ?? null, klimat: p.trip_type ?? null }];
    }
    if (metoda === 'update' && p.is_public === true) return ['tablica_opublikowana', {}];
    return null;
  },
  trip_project_places: (metoda, w) => {
    if (metoda !== 'insert') return null;
    const p = pierwszy(w);
    return ['miejsce_zapisane', { ile: ile(w), kubelek: p.priority ?? null }];
  },
  trip_plans: (metoda, w) => {
    if (metoda !== 'insert') return null;
    const dni = pierwszy(w)?.plan?.days;
    return ['plan_ulozony', { dni: Array.isArray(dni) ? dni.length : null }];
  },
};

/**
 * Zapisy tablic, miejsc i planów są rozsiane po ~20 miejscach w kodzie
 * (Odkrywaj, tablica, strona miejsca, Start, Zapisane, kopiowanie…). Zamiast
 * dopisywać zdarzenie w każdym i pamiętać o nim w każdym nowym, zdarzenie
 * wychodzi z jednego miejsca: po udanym zapisie w kliencie Supabase.
 *
 * Działa, bo w postgrest-js `.insert()` zwraca budowniczego, a `.select()`,
 * `.single()` i reszta łańcucha zwracają `this` — podmienione `then` tego
 * obiektu jest tym, które wywoła `await`. Sprawdzone na 2.106.1; przy
 * aktualizacji biblioteki warto zajrzeć, czy łańcuch nadal zwraca `this`.
 * Zapis z błędem nie wysyła niczego.
 */
export function sledzZapisy(klient: SupabaseClient): void {
  const oryginalneFrom = klient.from.bind(klient);
  (klient as any).from = (tabela: string) => {
    const budowniczy: any = oryginalneFrom(tabela);
    const regula = REGULY[tabela];
    if (!regula) return budowniczy;
    for (const metoda of ['insert', 'update', 'upsert']) {
      const oryginal = budowniczy[metoda];
      if (typeof oryginal !== 'function') continue;
      budowniczy[metoda] = (wartosci: unknown, ...reszta: unknown[]) => {
        const zapytanie = oryginal.call(budowniczy, wartosci, ...reszta);
        const then = zapytanie.then.bind(zapytanie);
        zapytanie.then = (ok?: (r: any) => any, blad?: (e: any) => any) =>
          then((wynik: any) => {
            if (!wynik?.error) {
              try {
                const z = regula(metoda, wartosci);
                if (z) zdarzenie(z[0], z[1]);
              } catch { /* pomiar nie przerywa zapisu */ }
            }
            return ok ? ok(wynik) : wynik;
          }, blad);
        return zapytanie;
      };
    }
    return budowniczy;
  };
}

const KLUCZ_REJESTRACJI = 'rm_ga_rejestracja';

/**
 * Rejestracja = pierwsze zalogowanie konta założonego w ciągu ostatniej doby.
 * Nie da się tego złapać w jednym miejscu formularza: Google wraca przez
 * AuthCallback, a e-mail przez link z wiadomości, czasem godziny później.
 * Flaga w localStorage pilnuje, żeby jedno konto dało jedno sign_up.
 */
export function sledzRejestracje(klient: SupabaseClient): void {
  klient.auth.onAuthStateChange((zdarzenieAuth, sesja) => {
    if (zdarzenieAuth !== 'SIGNED_IN' || !sesja?.user) return;
    const u = sesja.user;
    const wiek = Date.now() - new Date(u.created_at).getTime();
    if (wiek > 24 * 3600_000) return;
    try {
      const zgloszone = JSON.parse(localStorage.getItem(KLUCZ_REJESTRACJI) ?? '[]') as string[];
      if (zgloszone.includes(u.id)) return;
      // Bez zgody gtag nie istnieje — wtedy nie odhaczamy, żeby rejestracja
      // mogła jeszcze trafić do pomiaru, jeśli zgoda przyjdzie w tej sesji.
      if (typeof (window as any).gtag !== 'function') return;
      zdarzenie('sign_up', { method: u.app_metadata?.provider ?? 'email' });
      localStorage.setItem(KLUCZ_REJESTRACJI, JSON.stringify([...zgloszone, u.id].slice(-20)));
    } catch { /* tryb prywatny */ }
  });
}

const KLUCZ_WEJSCIA = 'rm_wejscie';

/**
 * Adres wejścia z parametrami kampanii (utm_*, gclid, fbclid). GA4 rozpoznaje
 * źródło po adresie pierwszej odsłony — a pomiar włącza się dopiero po zgodzie,
 * często po przejściu na inną stronę, gdy parametrów w adresie już nie ma.
 * Zapisujemy je przy starcie aplikacji i dokładamy do pierwszej odsłony.
 */
export function zapamietajWejscie(): void {
  try {
    if (sessionStorage.getItem(KLUCZ_WEJSCIA)) return;
    const u = new URL(window.location.href);
    const kampania = [...u.searchParams.keys()].some((k) => /^(utm_|gclid$|fbclid$)/.test(k));
    sessionStorage.setItem(KLUCZ_WEJSCIA, kampania ? u.search : '-');
  } catch { /* tryb prywatny */ }
}

/** Parametry kampanii z wejścia — raz na sesję, potem pusty napis. */
export function parametryWejscia(): string {
  try {
    const q = sessionStorage.getItem(KLUCZ_WEJSCIA);
    if (!q || q === '-') return '';
    sessionStorage.setItem(KLUCZ_WEJSCIA, '-');
    const wejscie = new URLSearchParams(q);
    const kampania = new URLSearchParams();
    wejscie.forEach((v, k) => { if (/^(utm_|gclid$|fbclid$)/.test(k)) kampania.set(k, v); });
    return kampania.toString();
  } catch {
    return '';
  }
}
