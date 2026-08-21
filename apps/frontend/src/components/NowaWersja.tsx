import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Wykrywa, że na serwerze stoi już nowsze wydanie niż to, które trzyma ta karta.
 *
 * Aplikacja jednostronicowa pobiera index.html raz, przy pierwszym wejściu. Potem
 * nawigacja idzie przez router i nic nowego z serwera nie schodzi — karta otwarta
 * przed wdrożeniem pokazuje stary interfejs dowolnie długo, choć nginx od dawna
 * oddaje nowe pliki. Z zewnątrz wygląda to jak nieudane wdrożenie i tak było
 * zgłaszane: „wdrożone, a zmian nie widać".
 *
 * Rozpoznajemy wydanie po ETagu index.html, nie po numerze wersji wkompilowanym
 * w pakiet. Dzięki temu nie trzeba niczego wstrzykiwać na etapie budowania ani
 * pamiętać o podbijaniu licznika — każdy build zmienia zawartość index.html,
 * więc i jego ETag. Nagłówki tego pliku to `no-store`, więc odpowiedź zawsze
 * pochodzi z serwera, nie z pamięci przeglądarki.
 */
export default function NowaWersja() {
  const [jest, setJest] = useState(false);

  useEffect(() => {
    let znacznikStartowy: string | null = null;
    let zyje = true;

    const odczytaj = async (): Promise<string | null> => {
      try {
        const odp = await fetch('/', { method: 'HEAD', cache: 'no-store' });
        return odp.headers.get('etag') ?? odp.headers.get('last-modified');
      } catch {
        // Brak sieci to nie jest nowe wydanie — po prostu nic nie wiemy.
        return null;
      }
    };

    const sprawdz = async () => {
      const teraz = await odczytaj();
      if (!zyje || !teraz) return;
      if (znacznikStartowy === null) { znacznikStartowy = teraz; return; }
      if (teraz !== znacznikStartowy) setJest(true);
    };

    sprawdz();
    // Co dziesięć minut w tle i dodatkowo przy każdym powrocie do karty — wtedy
    // najczęściej okazuje się, że w międzyczasie coś wdrożono.
    const zegar = window.setInterval(sprawdz, 10 * 60 * 1000);
    const naPowrot = () => { if (document.visibilityState === 'visible') sprawdz(); };
    document.addEventListener('visibilitychange', naPowrot);

    return () => {
      zyje = false;
      window.clearInterval(zegar);
      document.removeEventListener('visibilitychange', naPowrot);
    };
  }, []);

  if (!jest) return null;

  return (
    // Lewy dolny róg celowo: prawy zajmują pomoc i przycisk nawigacji, a na
    // telefonie oba naraz.
    <div className="fixed bottom-5 left-5 z-[1500] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 h-10 rounded-full bg-foreground text-background
                   px-4 text-sm shadow-token-lg hover:opacity-90 transition-opacity"
      >
        <RefreshCw className="w-4 h-4" />
        Jest nowsza wersja — odśwież
      </button>
    </div>
  );
}
